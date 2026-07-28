<script setup>
definePageMeta({ layout: "empty" });
import {ref, computed, onMounted, watch} from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from 'axios';
import ContractModal from '@/components/contractModal.vue';
import {useAuthStore} from "~/stores/auth.js";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const {
  companyData,
  siteOptions,
  positionOptions,
  typeOptions,
  disabledOptions,
  bankOptions,
  getCompanyData,
  fetchSiteOptions,
  fetchPositionOptions,
  fetchTypeOptions,
  fetchBankOption,
  fetchDisabledOptions
} = useApi();

const activeTab = ref(route.query.tab || 'info');
const isLoading = ref(false);

// 직원 정보
const employee = ref({
  id: '',
  name: '',
  billingName: '',//정산서용이름
  type: '',
  typeCd: '',
  site: '',
  siteName: '',
  positionCd: '',
  positionName: '',
  phone: '',
  email: '',
  birthDate: '',
  firstNumber: '',
  lastNumber: '',
  gender: '',
  address: '',
  inDate: '',
  outDate: '',
  outReason: '',
  transferDate: '', //고용승계일
  status: '',
  disability: '',
  disability_grade: '',
  disability_date: '',
  foreigner: '',
  nationality: '',
  visa_code: '',
  visa_date: '',
  defector: '',
  patriot: '',
  intern: '',
  beneficiary: '',
  bank: '',
  accountNm: '',
  accountNumber: '',
  four_ins: 'Y',
  retire_pension: 'N',
  bigo: '',
  payrollBigo: '', // 급여 관련 특이사항 추가
  photo: null
});

// 비고(특이사항) 히스토리 변수
const basicBigoHistory = ref([]);
const payrollBigoHistory = ref([]);

// 근로계약서 모달 상태 추가
const isContractModalOpen = ref(false);
const items = ref([]);

const wageInputs = ref({});
const contractDataTemp = ref(null);

const periodsData = ref([]);
const addPeriod = () => {
  periodsData.value.push({ startDate: '', endDate: '', outReason: '' });
};

const removePeriod = (index) => {
  periodsData.value.splice(index, 1);
};

// 재직상태 변경 시 UI 대응
watch(() => employee.value.status, (newStatus) => {
  if (newStatus === '2' || newStatus === '3') {
    if(periodsData.value.length === 0) addPeriod();
  }
});

// 근무 이력
const workHistory = ref([
  { period: '2023.01 ~ 2024.12', site: 'LH 위례 6단지', position: '경비원', status: '재직' },
  { period: '2021.03 ~ 2022.12', site: '강서 대명 강동', position: '주임', status: '퇴사' }
]);

// 급여 이력
const salaryHistory = ref([
    /*
  { payMonth: '2024.11', basic: 2100000, allowance: 300000, total: 2400000 },
  { payMonth: '2024.10', basic: 2100000, allowance: 300000, total: 2400000 },
  { payMonth: '2024.09', basic: 2100000, allowance: 300000, total: 2400000 }

     */
]);

// 교육 이력
const educationHistory = ref([
  { date: '2024.10.15', title: '직장 내 괴롭힘 예방 교육', duration: '2시간', status: '수료' },
  { date: '2024.09.20', title: '산업안전보건교육', duration: '4시간', status: '수료' }
]);

// 탭 목록
const tabs = [
  { id: 'info', name: '기본정보', icon: 'mdi-account-outline' },
  { id: 'salary', name: '급여이력', icon: 'mdi-cash-multiple' },
];

const changeTab = async (tabId) => {
  activeTab.value = tabId;
  await router.replace({ query: { ...route.query, tab: tabId } });
};


// 나이 계산
const age = computed(() => {
  const a = calculateAge(employee.value.birthDt);
  return a !== '' ? a : '-';
});

// 재직 기간 계산
const workPeriod = computed(() => {
  if (!employee.value.inDate) return '-';
  const start = new Date(employee.value.inDate);
  const end = (employee.value.outDate && employee.value.outDate !== '0000-00-00') ? new Date(employee.value.outDate) : new Date();

  const months = (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
  const years = Math.floor(months / 12);
  const remainMonths = months % 12;

  if (years > 0) {
    return remainMonths > 0 ? `${years}년 ${remainMonths}개월` : `${years}년`;
  }
  return `${months}개월`;
});

// 1. 날짜 유효성 검사 헬퍼 함수 추가
const isValidDate = (dateString) => {
  const regEx = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateString.match(regEx)) return false;
  const d = new Date(dateString);
  const dNum = d.getTime();
  if (!dNum && dNum !== 0) return false;
  return d.toISOString().slice(0, 10) === dateString;
};

// 2. 주민번호 입력 감지 및 생년월일 자동 계산 Watch 추가
watch(
    () => [employee.value.firstNumber, employee.value.lastNumber],
    ([front, back]) => {
      // 수정 모드일 때만 자동 계산 작동
      // if (!isEditing.value) return;
      if (!front || front.length !== 6) return;

      let yearPrefix = '';
      const yearPart = front.substring(0, 2);
      const monthPart = front.substring(2, 4);
      const dayPart = front.substring(4, 6);

      // 뒷자리 첫 숫자가 있을 경우 (성별/세대 구분)
      if (back && back.length >= 1) {
        const genderCode = back.substring(0, 1);

        // 1, 2, 5, 6번은 1900년대생
        if (['1', '2', '5', '6'].includes(genderCode)) {
          yearPrefix = '19';
        }
        // 3, 4, 7, 8번은 2000년대생
        else if (['3', '4', '7', '8'].includes(genderCode)) {
          yearPrefix = '20';
        }
        else {
          yearPrefix = '19';
        }
      }
      // 뒷자리 입력 전일 경우 현재 연도 기준으로 추측
      else {
        const currentYearShort = new Date().getFullYear() % 100;
        yearPrefix = parseInt(yearPart) > currentYearShort ? '19' : '20';
      }

      const fullDate = `${yearPrefix}${yearPart}-${monthPart}-${dayPart}`;

      // 유효한 날짜일 경우에만 모델 업데이트
      if (isValidDate(fullDate)) {
        employee.value.birthDt = fullDate; // 상세페이지는 birthDt 필드 사용
      }
    }
);

// [추가] 현재 펼쳐진 부모 메뉴의 코드를 저장할 상태 변수
const expandedNodeCd = ref(null);

// [추가] 화살표 클릭 시 하위 메뉴를 열고 닫는 함수
const toggleNode = (itemCd) => {
  if (expandedNodeCd.value === itemCd) {
    expandedNodeCd.value = null; // 이미 열려있으면 닫기
  } else {
    expandedNodeCd.value = itemCd; // 클릭한 메뉴 열기
  }
};

// ==========================================
// [추가] 커스텀 트리 드롭다운 로직 (직위)
// ==========================================
const isPositionMenuOpen = ref(false);

const positionTree = computed(() => {
  if (!positionOptions.value || positionOptions.value.length === 0) return [];

  // 1. '01002'(5자리 직책 루트)가 배열에 섞여 있을 경우를 대비해 순수 하위 항목(8자리 이상)만 필터링
  const validItems = positionOptions.value.filter(p => p.itemCd.length > 5);
  if (validItems.length === 0) return [];

  // 2. 가장 짧은 길이(보통 8자리, 예: 01002001 미화원)를 부모 메뉴로 설정
  const minLength = Math.min(...validItems.map(p => p.itemCd.length));
  const parents = validItems.filter(p => p.itemCd.length === minLength);

  return parents.map(parent => {
    // 3. 부모 코드로 시작하면서 길이가 더 긴 것들(보통 11자리, 예: 01002001001 미화원1)을 자식으로 매핑
    const children = validItems.filter(
        p => p.itemCd.startsWith(parent.itemCd) && p.itemCd.length > parent.itemCd.length
    );
    return { ...parent, children };
  });
});

const selectedPositionName = computed(() => {
  if (!employee.value.positionCd) return '직위 선택';
  const found = positionOptions.value.find(p => p.itemCd === employee.value.positionCd);
  return found ? found.itemNm : '선택됨';
});

const selectPosition = (pos) => {
  employee.value.positionCd = pos.itemCd;
  isPositionMenuOpen.value = false;
};

// 데이터 로드
const loadEmployeeData = async () => {
  isLoading.value = true;
  try {
    const memberId = route.params.id;
    const response = await axios.get(`/api/v1/member/data/${memberId}`);
    const rawData = response.data.data[0];

    // 1. 계약 정보 파싱
    const contract = rawData.contract ? JSON.parse(rawData.contract)[0] : { contractData: {} };
    let workSchedule = null;
    if (contract?.workSchedule) {
      workSchedule = typeof contract.workSchedule === 'string'
          ? JSON.parse(contract.workSchedule)
          : contract.workSchedule;
    }

    // 2. 비고 히스토리 데이터 파싱 및 분리
    let parsedBigoHistory = [];
    try {
      if (rawData.bigoList) {
        parsedBigoHistory = JSON.parse(rawData.bigoList).filter(Boolean); // null 방지
      }
    } catch (e) {
      console.error('비고 히스토리 파싱 에러:', e);
    }

    // 최신순 정렬 (regDt 기준 내림차순)
    parsedBigoHistory.sort((a, b) => new Date(b.regDt) - new Date(a.regDt));

    // 타입에 맞게 데이터 분배 (1: 기본, 2: 급여관련)
    basicBigoHistory.value = parsedBigoHistory.filter(log => String(log.type) === '1');
    payrollBigoHistory.value = parsedBigoHistory.filter(log => String(log.type) === '2');

    let parsedHistory = [];
    try {
      if (rawData.historyList) {
        parsedHistory = JSON.parse(rawData.historyList).filter(Boolean); // null 방지
        parsedHistory.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)); // 과거순 정렬
      }
    } catch (e) {
      console.error('이력 파싱 에러:', e);
    }

    //퇴사(1)인 경우, historyList에서 퇴사일과 사유 가져오기
    if (rawData.status == '1') {
      const outHistory = parsedHistory.filter(h => h.status == '1').pop(); // 최신 퇴사 이력 가져오기
      if (outHistory) {
        rawData.outDate = outHistory.endDate;
        rawData.outReason = outHistory.outReason;
      }
    }

    // 일용직(2) 또는 대근(3) 데이터는 배열로 따로 분리
    periodsData.value = parsedHistory
        .filter(h => rawData.status == '2' || rawData.status == '3')
        .map(h => ({
          startDate: h.startDate,
          endDate: h.endDate,
          outReason: h.outReason
        }));

    // 휴직(4)인 경우, 가장 최근의 휴직 기록 1건을 가져와서 폼에 바인딩
    if (rawData.status == '4') {
      const leaveHistory = parsedHistory.filter(h => String(h.status) === '4').pop(); // 배열의 맨 마지막(최신)
      if (leaveHistory) {
        rawData.startDate = leaveHistory.startDate;
        rawData.endDate = leaveHistory.endDate;
        rawData.outReason = leaveHistory.outReason;
      }
    }

    // 3. 직원 정보 세팅
    employee.value = {
      ...rawData,
      siteName: rawData.sites ? JSON.parse(rawData.sites)[0]?.name : '',
      contract,
      workSchedule,
      bigo: '',          // 입력 폼 초기화
      payrollBigo: ''    // 입력 폼 초기화
    };

    await loadSalaryHistory();
  } catch (error) {
    console.error('직원 정보 로드 실패:', error);
    window.customAlert('직원 정보를 불러오는데 실패했습니다.','error');
  } finally {
    isLoading.value = false;
  }
};

// 메모 수정
const editMemo = async (item) => {
  const newText = await window.customPrompt('특이사항 내용을 수정하세요:', item.bigo);

  // 사용자가 취소를 누르거나, 내용이 비어있거나, 기존과 내용이 똑같으면 종료
  if (newText === null || newText.trim() === '' || newText.trim() === item.bigo) return;

  try {
    const adminId = useAuthStore().user?.managerId || 'admin';

    const payload = {
      bigo: newText.trim(),
      adminId: adminId
    };

    await axios.put(`/api/v1/member/bigo/update/${item.bgIdx}`, payload);

    item.bigo = newText.trim();

  } catch (error) {
    console.error('특이사항 수정 실패:', error);
    // alert('수정에 실패했습니다.');
    window.customAlert('수정에 실패했습니다.', 'error');
  }
};

// 메모 삭제
const deleteMemo = async (list, index, item) => {
  if (!(await window.customConfirm('이 특이사항을 삭제하시겠습니까?'))) return;

  try {
    // 백엔드 API 호출 (삭제) - 라우터 주소 확인 필요
    await axios.delete(`/api/v1/member/bigo/${item.bgIdx}`);

    // DB 삭제 성공 시 로컬 배열에서 제거 (화면 리렌더링)
    list.splice(index, 1);

  } catch (error) {
    console.error('특이사항 삭제 실패:', error);
    window.customAlert('삭제에 실패했습니다.', 'error');
    // alert('삭제에 실패했습니다.');
  }
};

//지급항목
/*
const getWageCode = async function () {
  const cIdx = authStore.user?.cIdx;
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    const rawData = res.data.data || [];
    const includeCodes = ['04001001', '04001002','04001003','04001004','04001005','04001006']; // 표시할 코드만 명시
    items.value = rawData.filter(item => includeCodes.includes(item.itemCd));
  } catch (err) {
    console.error("항목 로드 실패", err);
  }
}

 */
const getWageCode = async () => {
  const cIdx = authStore.user?.cIdx;
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    items.value = res.data.data.filter(c => c.itemCd.startsWith('04')) || [];
  } catch (err) {
    console.error('항목 로드 실패', err);
  }
};

const getPositionCode = async () => {
  const cIdx = authStore.user?.cIdx;
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    positionOptions.value = res.data.data.filter(c => c.itemCd.startsWith('01002')) || [];
  } catch (err) {
    console.error('항목 로드 실패', err);
  }
};

// 1. 예산 데이터 가져오기 함수 추가
/*
const getBudgetData = async () => {
  const { sIdx, typeCd, positionCd } = employee.value;
  if (!sIdx || !typeCd || !positionCd) return;

  try {
    const res = await axios.get(`/api/v1/site/contract/budget`, {
      params: { sIdx, type: typeCd }
    });

    const budgetData = res.data.data[0];
    if (!budgetData) return;

    const newWageInputs = {};

    ['directLabor', 'indirectLabor'].forEach(key => {
      (budgetData.jsonData?.[key] || []).forEach(item => {
        if (item.code && item.values?.[positionCd] !== undefined) {
          newWageInputs[item.code] = item.values[positionCd];
        }
      });
    });

    // items 배열에서 직접 find로 매핑
    items.value = Object.entries(newWageInputs)
        .map(([code, amount]) => {
          const found = items.value.find(w => w.itemCd === code);
          if (!found) return null;
          return { ...found, amount: Number(amount) || 0 };
        })
        .filter(Boolean); // null 제거

    const targetStaff = budgetData.staffDetail?.find(s => s.code === positionCd);

    wageInputs.value = newWageInputs;
    contractDataTemp.value = {
      ...contractDataTemp.value,
      wageInputs: newWageInputs,
      workSchedule: targetStaff?.schedule || null
    };

  } catch (err) {
    console.error('예산 데이터 로드 실패:', err);
  }
};

 */
// 1. 예산 데이터 가져오기 함수 (계약 직책 자동 추론 로직 적용)
const getBudgetData = async () => {
  const { sIdx, typeCd, positionCd } = employee.value;
  if (!sIdx || !typeCd || !positionCd) return;

  // 코드가 8자리(예: 01002001)를 넘어가면 뒤에 붙은 꼬리를 자르고 부모 코드(8자리)만 추출해서 임금 계약의 기준으로 삼음
  const contractPosCd = positionCd.length > 8 ? positionCd.substring(0, 8) : positionCd;

  try {
    const res = await axios.get(`/api/v1/site/contract/budget`, {
      params: { sIdx, type: typeCd }
    });

    const budgetData = res.data.data[0];
    if (!budgetData) return;

    const newWageInputs = {};

    ['directLabor', 'indirectLabor'].forEach(key => {
      (budgetData.jsonData?.[key] || []).forEach(item => {
        // ★ 잘라낸 부모 코드(contractPosCd)로 산출내역서의 임금을 찾음!
        if (item.code && item.values?.[contractPosCd] !== undefined) {
          newWageInputs[item.code] = item.values[contractPosCd];
        }
      });
    });

    items.value = Object.entries(newWageInputs)
        .map(([code, amount]) => {
          const found = items.value.find(w => w.itemCd === code);
          if (!found) return null;
          return { ...found, amount: Number(amount) || 0 };
        })
        .filter(Boolean);

    // 스케줄 정보도 부모 코드(contractPosCd) 기준으로 가져옴
    const targetStaff = budgetData.staffDetail?.find(s => s.code === contractPosCd);

    wageInputs.value = newWageInputs;
    contractDataTemp.value = {
      ...contractDataTemp.value,
      wageInputs: newWageInputs,
      workSchedule: targetStaff?.schedule || null
    };

  } catch (err) {
    console.error('예산 데이터 로드 실패:', err);
  }
};

// 2. 수정 모드일 때만 작동하는 Watch 추가
watch(
    () => [employee.value.sIdx, employee.value.typeCd, employee.value.positionCd],
    ([newSite, newType, newPos]) => {
      // 수정 모드(isEditing)가 활성화된 상태에서만 자동으로 불러와야 함
      // 그렇지 않으면 상세 페이지 진입 시 기존 저장된 데이터가 덮어씌워질 수 있음
      if (newSite && newType && newPos) {
        getBudgetData();
      }
    }
);

const loadSalaryHistory = async () => {
  // 이미 로드된 데이터가 있다면 다시 호출하지 않음 (선택 사항)
  if (salaryHistory.value.length > 0) return;

  try {
    const mIdx = employee.value.idx; // loadEmployeeData에서 받아온 실제 DB PK
    if (!mIdx) return;

    const res = await axios.get(`/api/v1/member/payroll/history/${mIdx}`);
    if (res.data.result) {
      salaryHistory.value = res.data.data;
    }
  } catch (e) {
    console.error('급여 이력 로드 실패:', e);
  }
};

const handleContractSave = (savedData) => {
  // 모달에서 넘어온 데이터 중 wageInputs를 부모의 wageInputs에 저장
  wageInputs.value = savedData.wageInputs;
  contractDataTemp.value = savedData;

  window.alert('근로계약서 내용이 임시 저장되었습니다.');
};

// 저장
const saveEmployee = async () => {
  if (employee.value.status == '1' && !employee.value.outDate) {
    window.customAlert('퇴사 처리를 위해 퇴사일을 입력해주세요.','error');
    return;
  }

  if (!await window.customConfirm('수정된 정보를 저장하시겠습니까?')) return;

  try {
    const memberIdx = employee.value.idx;

    // 날짜 보정 로직
    // 1. 모달(ContractModal)을 통해 임시 저장된 날짜가 있는지 확인
    // 2. 없다면 기존 employee.value.contract에 담겨있던 날짜 사용
    // 3. 그것도 없다면 입사/퇴사일 사용
    const finalStartDt = contractDataTemp.value?.contractStartDt
        || employee.value.contract?.contractStartDt
        || null;

    const finalEndDt = contractDataTemp.value?.contractEndDt
        || employee.value.contract?.contractEndDt
        || null;

    const fullRRN = `${employee.value.firstNumber}-${employee.value.lastNumber}`;

    const payload = {
      ...employee.value,
      rrn: fullRRN,
      type: employee.value.typeCd,
      position: employee.value.positionCd,
      disability_grade: employee.value.disabilityCd,
      bankName: employee.value.bank,
      address: employee.value.address,
      joinDate: employee.value.inDate,
      outDate: employee.value.outDate,
      outReason: employee.value.outReason,
      startDate: employee.value.startDate,
      endDate: employee.value.endDate,
      transferDate: employee.value.transferDate,

      sIdx: employee.value.sIdx,
      dayWorkTime: contractDataTemp.value?.dayWorkTime || employee.value.dayWorkTime,
      monthWorkTime: contractDataTemp.value?.monthWorkTime || employee.value.monthWorkTime,

      // 임금 항목 (수정 안했을 경우를 대비해 기존 값과 병합)
      /*
      wageInputs: Object.keys(wageInputs.value).length > 0
          ? wageInputs.value
          : JSON.parse(employee.value.contract?.jsonData || '{}'),

       */
      bigo: employee.value.bigo,
      payrollBigo: employee.value.payrollBigo,
      adminId: authStore.user?.managerId || employee.value.id, // 세션/스토어의 로그인 아이디
      periodsData: periodsData.value,

      contractData: contractDataTemp.value || {
        wageInputs: employee.value.contract?.contractData || {},
        workSchedule: employee.value.workSchedule || {}
      },

      // 보정된 계약 날짜 전송
      contractStartDt: finalStartDt,
      contractEndDt: finalEndDt
    };

    await axios.put(`/api/v1/member/data/${memberIdx}`, payload);

    window.alert('저장되었습니다.');
    // alert('저장되었습니다.');
    contractDataTemp.value = null; // 저장 후 임시 데이터 초기화
    employee.value.bigo = '';
    employee.value.payrollBigo = '';

    await loadEmployeeData();
  } catch (error) {
    console.error('저장 실패:', error);
    window.customAlert('저장에 실패했습니다.', 'error');
    // alert('저장에 실패했습니다.');
  }
};

// 삭제
const deleteEmployee = async () => {
  if (!await window.customConfirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

  try {
    const memberId = route.params.id;
    await axios.put(`/api/v1/member/${memberId}`);
    window.alert('삭제되었습니다.');
    window.close()
    window.opener.location.reload()
    // await router.push('/member/list');
  } catch (error) {
    console.error('삭제 실패:', error);
    window.customAlert('삭제에 실패했습니다.','error');
  }
};

// 목록으로
const goBack = () => {
  // router.push('/member/list');
  if (window.opener) { window.close(); return; }
};

watch(activeTab, async (newTab) => {
  console.log(newTab);
  if (newTab === 'salary') {
    await loadSalaryHistory();
  }
});

onMounted(async () => {
  await Promise.all([
    getCompanyData(),
    fetchSiteOptions(),
    // fetchPositionOptions(),
    fetchTypeOptions(),
    fetchBankOption(),
    fetchDisabledOptions(),
    getWageCode(),
    getPositionCode()
  ]);
  await loadEmployeeData();
});
</script>

<template>
  <div class="member-detail-page">
    <div class="page-header">
      <div class="header-left">
        <button @click="goBack" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-account-details-outline"></i>
            직원 상세정보
          </h1>
          <p class="page-subtitle">직원의 상세 정보를 확인하고 관리합니다</p>
        </div>
      </div>
      <div class="header-actions">
        <button @click="deleteEmployee" class="btn-delete">
          <i class="mdi mdi-trash-can-outline"></i>
          <span>삭제</span>
        </button>
        <button @click="saveEmployee" class="btn-save">
          <i class="mdi mdi-check"></i>
          <span>저장</span>
        </button>
      </div>
    </div>

    <div class="integrated-paper">
      <div class="sticky-header">
      <div class="profile-section">
        <div class="profile-banner"></div>
        <div class="profile-content">
          <div class="profile-photo-wrapper">
            <div class="profile-photo">
              <img v-if="employee.photo" :src="employee.photo" alt="프로필 사진" />
              <i v-else class="mdi mdi-account"></i>
            </div>
            <!--button class="btn-change-photo">
              <i class="mdi mdi-camera-outline"></i>
            </button-->
          </div>

          <div class="profile-info">
            <div class="profile-main">
              <h2 class="profile-name">{{ employee.name }}</h2>
              <span :class="[
                  'status-badge',
                  employee.status == 0 ? 'status-active' :
                  employee.status == 1 ? 'status-inactive' :
                  'status-preparing']">
                <i :class="[
                    'mdi',
                    employee.status == '0' ? 'mdi-check-circle-outline' :
                    employee.status == 1 ? 'mdi-close-circle-outline' :
                    employee.status == 2 || employee.status == 3 ? 'mdi-calendar-check' :
                    'mdi-swap-horizontal']"></i>
                {{
                  employee.status == 0 ? '재직' :
                  employee.status == 1 ? '퇴사' :
                  employee.status == 2 ? '일용직' :
                  employee.status == 3 ? '대근' : '휴직'
                }}
              </span>
            </div>

            <div class="profile-details">
              <div class="detail-item"><i class="mdi mdi-card-account-details-outline"></i> {{ employee.id || '-' }}</div>
              <div class="detail-item"><i class="mdi mdi-office-building-outline"></i> {{ employee.siteName || '-' }}</div>
              <div class="detail-item"><i class="mdi mdi-account-tie-outline"></i> {{ employee.positionName || '-' }}</div>
            </div>
          </div>

          <div class="profile-stats">
            <div class="stat-item">
              <div class="stat-icon blue"><i class="mdi mdi-calendar-clock-outline"></i></div>
              <div class="stat-text">
                <span class="label">근속년수</span>
                <span class="value">{{ workPeriod }}</span>
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-icon green"><i class="mdi mdi-calendar-start-outline"></i></div>
              <div class="stat-text">
                <span class="label">입사일</span>
                <span class="value">{{ employee.inDate || '-' }}</span>
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-icon orange"><i class="mdi mdi-cake-variant-outline"></i></div>
              <div class="stat-text">
                <span class="label">나이</span>
                <span class="value">{{ age }}세</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="integrated-tabs">
        <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="['tab-button', { active: activeTab === tab.id }]"
            @click="changeTab(tab.id)"
        >
          <i :class="['mdi', tab.icon]"></i>
          <span>{{ tab.name }}</span>
        </button>
      </div>
      </div>

      <div class="integrated-content">

        <div v-show="activeTab === 'info'" class="tab-panel">
          <div class="info-sections">

            <div class="info-section">
              <div class="section-header">
                <i class="mdi mdi-account-outline"></i><h3>개인정보</h3>
              </div>
              <div class="info-grid">
                <div class="info-item">
                  <label>이름</label>
                  <input type="text" v-model="employee.name" class="info-input" />
                </div>
                <div class="info-item">
                  <label>정산서용 이름</label>
                  <input type="text" v-model="employee.billingName" class="info-input" />
                </div>
                <div class="info-item">
                  <label>성별</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="M" v-model="employee.gender" />
                      <span class="radio-text">남성</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="F" v-model="employee.gender" />
                      <span class="radio-text">여성</span>
                    </label>
                  </div>
                </div>
                <div class="info-item">
                  <label>주민번호</label>
                  <div class="ssn-group">
                    <input
                        type="text"
                        v-model="employee.firstNumber"
                        class="info-input ssn-input"
                        maxlength="6"
                        placeholder="000000"
                    />
                    <span class="ssn-separator">-</span>
                    <input
                        type="text"
                        v-model="employee.lastNumber"
                        class="info-input ssn-input"
                        maxlength="7"
                        placeholder="0000000"
                    />
                  </div>
                </div>
                <div class="info-item">
                  <label>생년월일</label>
                  <input type="date" v-model="employee.birthDt" class="info-input" max="9999-12-31"/>
                </div>
                <div class="info-item">
                  <label>나이</label>
                  <span class="info-value">{{ age }}세</span>
                </div>
                <div class="info-item full-width">
                  <label>연락처</label>
                  <input type="tel" v-model="employee.phone" class="info-input" />
                </div>
                <div class="info-item full-width">
                  <label>이메일</label>
                  <input type="email" v-model="employee.email" class="info-input" />
                </div>
                <div class="info-item full-width">
                  <label>주소</label>
                  <input type="text" v-model="employee.address" class="info-input" />
                </div>
              </div>
            </div>

            <div class="info-section">
              <div class="section-header">
                <i class="mdi mdi-briefcase-outline"></i><h3>근무정보</h3>
              </div>
              <div class="info-grid">
                <div class="info-item">
                  <label>사번</label>
                  <span class="info-value">{{ employee.id }}</span>
                </div>
                <div class="info-item">
                  <label>구분</label>
                  <select v-model="employee.typeCd" class="info-select">
                    <option v-for="type in typeOptions" :key="type.itemCd" :value="type.itemCd">{{ type.itemNm }}</option>
                  </select>
                </div>
                <div class="info-item">
                  <label>근무 현장</label>
                  <!--select v-if="isEditing" v-model="employee.sIdx" class="info-select">
                    <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
                  </select-->
                  <SiteSelect
                      v-model="employee.sIdx"
                      :allow-empty="false"
                      width="100%"
                      style="background: var(--bg-canvas) !important; border-radius: 8px !important;"
                  />
                </div>
                <!--div class="info-item">
                  <label>직위</label>
                  <select v-model="employee.positionCd" class="info-select">
                    <option v-for="pos in positionOptions" :key="pos.itemCd" :value="pos.itemCd">{{ pos.itemNm }}</option>
                  </select>
                </div-->
                <div class="info-item position-dropdown-container">
                  <label>직위</label>

                  <div class="custom-select-btn" @click="isPositionMenuOpen = !isPositionMenuOpen">
                    <span>{{ selectedPositionName }}</span>
                    <i class="mdi mdi-chevron-down"></i>
                  </div>

                  <div v-if="isPositionMenuOpen" class="dropdown-overlay" @click="isPositionMenuOpen = false"></div>

                  <ul v-if="isPositionMenuOpen" class="custom-dropdown-menu">
                    <li v-for="node in positionTree" :key="node.itemCd" class="menu-item">

                      <div class="menu-label">
                        <span class="menu-text" @click.stop="selectPosition(node)">
                          {{ node.itemNm }}
                        </span>

                        <div
                            v-if="node.children.length > 0"
                            class="toggle-icon-wrap"
                            @click.stop="toggleNode(node.itemCd)"
                        >
                          <i class="mdi" :class="expandedNodeCd === node.itemCd ? 'mdi-chevron-down' : 'mdi-chevron-right'"></i>
                        </div>
                      </div>

                      <ul v-show="expandedNodeCd === node.itemCd" class="custom-submenu">
                        <li
                            v-for="child in node.children"
                            :key="child.itemCd"
                            class="submenu-item"
                            @click.stop="selectPosition(child)"
                        >
                          {{ child.itemNm }}
                        </li>
                      </ul>

                    </li>
                  </ul>
                </div>
                <div class="info-item " style="word-break:keep-all;">
                  <label>재직 상태</label>
                  <div class="radio-group ">
                    <label class="radio-label">
                      <input type="radio" v-model="employee.status" value="0" />
                      <span>재직</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" v-model="employee.status" value="1" />
                      <span>퇴사</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" v-model="employee.status" value="2" />
                      <span>일용직</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" v-model="employee.status" value="3" />
                      <span>대근</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" v-model="employee.status" value="4" />
                      <span>휴직</span>
                    </label>
                  </div>
                </div>
                <div class="info-item">
                  <label>입사일</label>
                  <input type="date" v-model="employee.inDate" class="info-input" max="9999-12-31" />
                </div>
                <template v-if="employee.status == 1">
                  <div class="info-item">
                    <label class="text-red">퇴사일</label>
                    <input type="date" v-model="employee.outDate" class="info-input border-red" max="9999-12-31" />
                  </div>
                  <div class="info-item">
                    <label class="text-red">퇴사 사유</label>
                    <input type="text" v-model="employee.outReason" class="info-input border-red" placeholder="퇴사 사유를 입력하세요" />
                  </div>
                </template>
                <template v-if="employee.status == 2 || employee.status == 3">
                  <div class="info-item full-width">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <label class="text-primary">
                        <i class="mdi mdi-calendar-multiselect"></i> 근무 기간 설정
                      </label>
                      <button type="button" @click="addPeriod" class="btn-cancel" style="padding: 4px 10px;">
                        <i class="mdi mdi-plus"></i> 기간 추가
                      </button>
                    </div>

                    <div v-for="(period, index) in periodsData" :key="index" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                      <input type="date" v-model="period.startDate" class="info-input" required placeholder="시작일" max="9999-12-31" />
                      <span>~</span>
                      <input type="date" v-model="period.endDate" class="info-input" required placeholder="종료일" max="9999-12-31" />
                      <input type="text" v-model="period.outReason" class="info-input" placeholder="사유 (선택)" style="flex: 1;" />
                      <button type="button" @click="removePeriod(index)" v-if="periodsData.length > 1" class="btn-cancel" style="border: none; color: var(--danger); background: transparent; padding: 4px;">
                        <i class="mdi mdi-minus-circle-outline" style="font-size: 20px;"></i>
                      </button>
                    </div>
                  </div>
                </template>
                <template v-if="employee.status == 4">
                <div class="info-item">
                  <label class="text-red">휴직 시작일</label>
                  <input type="date" v-model="employee.startDate" class="info-input border-red" max="9999-12-31" />
                </div>

                <div class="info-item">
                  <label class="text-red">휴직 종료일</label>
                  <input type="date" v-model="employee.endDate" class="info-input border-red" max="9999-12-31" />
                </div>
                  <div class="info-item">
                    <label class="text-red">휴직 사유</label>
                    <textarea v-model="employee.outReason" class="info-input border-red" placeholder="사유를 입력하세요" />
                  </div>
                </template>

                <div class="info-item">
                  <label>고용승계일</label>
                  <input type="date" v-model="employee.transferDate" class="info-input" max="9999-12-31" />
                </div>
              </div>
            </div>

            <div class="info-section">
              <div class="section-header">
                <i class="mdi mdi-alert-circle-outline"></i><h3>특이사항</h3>
              </div>
              <div class="info-grid">
                <div class="info-item">
                  <label>장애 여부</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.disability" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.disability" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                </div>
                <template v-if="employee.disability === 'Y'">
                  <div class="info-item">
                    <label class="text-red">장애등록일</label>
                    <input
                        type="date"
                        v-model="employee.disability_date"
                        class="info-input border-red"
                        max="9999-12-31"
                    />
                  </div>
                  <div class="info-item">
                    <label class="text-red">장애등급</label>
                    <select v-model="employee.disabilityCd" class="info-select border-red">
                      <option value="">선택하세요</option>
                      <option v-for="item in disabledOptions" :key="item.itemCd" :value="item.itemCd">
                        {{ item.itemNm }}
                      </option>
                    </select>
                  </div>
                </template>
                <div class="info-item">
                  <label >외국인 여부</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.foreigner" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.foreigner" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                </div>

                <template v-if="employee.foreigner === 'Y'">
                  <div class="info-item">
                    <label class="text-red">국적</label>
                    <input
                        type="text"
                        v-model="employee.nationality"
                        class="info-input border-red"
                        placeholder="예: 베트남"
                    />
                  </div>
                  <div class="info-item">
                      <label class="text-red">비자 코드</label>
                      <input
                          type="text"
                          v-model="employee.visa_code"
                          class="info-input border-red"
                          placeholder="예: E-9"
                      />
                  </div>

                  <div class="info-item">
                    <label class="text-red">비자만료일</label>
                    <input
                        type="date"
                        v-model="employee.visa_date"
                        class="info-input border-red"
                        max="9999-12-31"
                    />
                  </div>
                </template>

                <div class="info-item">
                  <label>새터민 여부</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.defector" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.defector" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                </div>
                <div class="info-item">
                  <label>국가유공자 여부</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.patriot" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.patriot" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                </div>
                <div class="info-item">
                  <label>청년인턴 여부</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.intern" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.intern" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                </div>
                <div class="info-item">
                  <label>기초수급자 여부</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.beneficiary" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.beneficiary" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="info-section">
              <div class="section-header">
                <i class="mdi mdi-cash"></i><h3>급여정보</h3>
              </div>
              <div class="info-grid">
                <div class="info-item">
                  <label>은행</label>
                  <select v-model="employee.bank" class="info-select">
                    <option v-for="bank in bankOptions" :key="bank.itemNm" :value="bank.itemNm">{{ bank.itemNm }}</option>
                  </select>
                </div>
                <div class="info-item">
                  <label>계좌번호</label>
                  <input type="text" v-model="employee.accountNumber" class="info-input" />
                </div>
                <div class="info-item">
                  <label>예금주</label>
                  <input type="text" v-model="employee.accountNm" class="info-input" />
                </div>
                <div class="info-item">
                  <label>4대보험 가입</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.four_ins" required />
                      <span class="radio-text">가입</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.four_ins" required />
                      <span class="radio-text">미가입</span>
                    </label>
                  </div>
                </div>
                <div class="info-item">
                  <label>퇴직연금</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.retire_pension" required />
                      <span class="radio-text">가입</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.retire_pension" required />
                      <span class="radio-text">미가입</span>
                    </label>
                  </div>
                </div>
                <div class="info-item full-width" style="margin-top: 16px;">
                  <div class="memo-stacked-panel">

                    <div class="memo-section">
                      <div class="memo-section-header">
                        <div class="header-title-group">
                          <div class="section-icon-box bg-primary-soft">
                            <i class="mdi mdi-account-details-outline text-primary"></i>
                          </div>
                          <div class="section-title-texts">
                            <h3>직원 기본 특이사항</h3>
                            <p>직원 관리, 업무 및 근태 관련 이슈</p>
                          </div>
                        </div>
                        <div class="header-count-badge">총 {{ basicBigoHistory.length }}건</div>
                      </div>

                      <div class="clean-editor-card primary-focus">
      <textarea
          v-model="employee.bigo"
          class="clean-textarea"
          rows="2"
          placeholder="새로운 특이사항을 입력하고 저장하세요 (히스토리에 누적됩니다)"
      ></textarea>
                      </div>

                      <div class="clean-timeline-wrapper" v-if="basicBigoHistory.length > 0">
                        <div class="clean-timeline">
                          <div v-for="(item, idx) in basicBigoHistory" :key="'basic-'+idx" class="clean-timeline-item">
                            <div class="timeline-dot bg-primary"></div>
                            <div class="timeline-card">
                              <div class="card-meta" style="display: flex; align-items: center;">
                                <span class="meta-date">{{ item.regDt ? item.regDt.substring(0, 16) : '-' }}</span>
                                <span v-if="item.admin_id" class="meta-user" style="margin-left: 8px;">{{ item.admin_id }}</span>

                                <div style="margin-left: auto; display: flex; gap: 8px;">
                                  <button type="button" @click="editMemo(item)" style="border:none; background:none; cursor:pointer; color:var(--text-sub); font-size:12px;">수정</button>
                                  <button type="button" @click="deleteMemo(basicBigoHistory, idx, item)" style="border:none; background:none; cursor:pointer; color:var(--danger); font-size:12px;">삭제</button>
                                </div>
                              </div>
                              <div class="card-text">{{ item.bigo }}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="mt-4" style="margin-top: 32px;"></div>

                    <div class="memo-section">
                      <div class="memo-section-header">
                        <div class="header-title-group">
                          <div class="section-icon-box bg-warning-soft">
                            <i class="mdi mdi-calculator-variant-outline text-warning"></i>
                          </div>
                          <div class="section-title-texts">
                            <h3>급여 관련 특이사항</h3>
                            <p>수당 지급, 공제 예외 등 급여 처리 관련 이슈</p>
                          </div>
                        </div>
                        <div class="header-count-badge badge-warning">총 {{ payrollBigoHistory.length }}건</div>
                      </div>

                      <div class="clean-editor-card warning-focus">
      <textarea
          v-model="employee.payrollBigo"
          class="clean-textarea"
          rows="2"
          placeholder="새로운 급여 특이사항을 입력하고 저장하세요 (히스토리에 누적됩니다)"
      ></textarea>
                      </div>

                      <div class="clean-timeline-wrapper" v-if="payrollBigoHistory.length > 0">
                        <div class="clean-timeline">
                          <div v-for="(item, idx) in payrollBigoHistory" :key="'payroll-'+idx" class="clean-timeline-item">
                            <div class="timeline-dot bg-warning"></div>
                            <div class="timeline-card border-warning-subtle">
                              <div class="card-meta" style="display: flex; align-items: center;">
                                <span class="meta-date">{{ item.regDt ? item.regDt.substring(0, 16) : '-' }}</span>
                                <span v-if="item.admin_id" class="meta-user" style="margin-left: 8px;">{{ item.admin_id }}</span>

                                <div style="margin-left: auto; display: flex; gap: 8px;">
                                  <button type="button" @click="editMemo(item)" style="border:none; background:none; cursor:pointer; color:var(--text-sub); font-size:12px;">수정</button>
                                  <button type="button" @click="deleteMemo(payrollBigoHistory, idx, item)" style="border:none; background:none; cursor:pointer; color:var(--danger); font-size:12px;">삭제</button>
                                </div>
                              </div>
                              <div class="card-text">{{ item.bigo }}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>

            <div class="info-section">
              <div class="section-header">
                <i class="mdi mdi-file-document-edit-outline"></i><h3>근로 계약 관리</h3>
              </div>
              <div class="contract-box">
                <p>현재 등록된 근로계약서 정보를 확인하고 출력할 수 있습니다.</p>
                <button @click="isContractModalOpen = true" class="btn-contract-view">
                  <i class="mdi mdi-file-find-outline"></i> 근로계약서 상세보기
                </button>
              </div>
            </div>

          </div>
        </div>

        <div v-show="activeTab === 'salary'" class="tab-panel">
          <div v-if="salaryHistory.length === 0" class="empty-state">
            <i class="mdi mdi-cash-off"></i>
            <p>조회된 급여 이력이 없습니다.</p>
          </div>

          <div v-else class="table-scroll-container">
            <table class="data-table">
              <thead>
              <tr>
                <th>지급월</th>
                <th class="text-right">총 지급액</th>
                <th class="text-right">공제 합계</th>
                <th class="text-right">실지급액</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="(item, i) in salaryHistory" :key="i" class="data-row">
                <td class="fw-bold">{{ item.payMonth }}</td>
                <td class="text-right">{{ item.basic.toLocaleString() }}원</td>
                <td class="text-right text-red">
                  <span v-if="item.allowance > 0">-</span>{{ item.allowance.toLocaleString() }}원
                </td>
                <td class="text-right">
            <span class="badge badge-primary" style="font-size: 14px;">
              {{ item.total.toLocaleString() }}원
            </span>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>

    <ContractModal
        :is-open="isContractModalOpen"
        :employee-data="{
          ...employee,
          wageInputs: Object.keys(wageInputs).length > 0
              ? wageInputs
              : (employee.contract?.contractData || {}),
          workSchedule: contractDataTemp?.workSchedule || employee.workSchedule
        }"
        :employee-type="employee.typeCd"
        :site-options="siteOptions"
        :position-options="positionOptions"
        :wage-items="items"
        :company-data="companyData"
        @close="isContractModalOpen = false"
        @save="handleContractSave"
    />
  </div>
</template>

<style scoped>
.member-detail-page {
  padding: 20px;
}
/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.btn-back {
  width: 42px; height: 42px;
  border-radius: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-sub);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.btn-back:hover {
  background: var(--bg-hover);
  border-color: var(--border-focus);
  color: var(--text-main);
}
.btn-back i { font-size: 20px; }

.btn-cancel {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-sub);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.btn-cancel:hover {
  background: var(--bg-hover);
  color: var(--text-main);
  border-color: var(--border-focus);
}
.btn-cancel i { font-size: 16px; }

.btn-edit {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px; height: 42px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-main);
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  box-shadow: var(--shadow-sm); white-space: nowrap;
  box-sizing: border-box;
}
.btn-edit:hover {
  background-color: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
}
.btn-edit i { font-size: 16px; }

/* 삭제 버튼 (기본 레드 아웃라인 -> 호버 시 솔리드 레드) */
.btn-delete {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px; height: 42px;
  background-color: var(--bg-surface);
  border: 1px solid var(--danger);
  border-radius: 8px;
  color: var(--danger);
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  box-shadow: var(--shadow-sm); white-space: nowrap;
  box-sizing: border-box;
}

.btn-delete:hover {
  background-color: var(--danger);
  color: var(--text-inverse);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2); /* 다크모드 대응을 위한 부드러운 그림자 */
}

.btn-delete i { font-size: 16px; }

/* 데이터 테이블 등 좁은 영역에 들어가는 작은 사이즈 변형 */
.btn-edit.small, .btn-delete.small {
  padding: 6px 12px; height: 32px;
  font-size: 12px;
}
.btn-edit.small i, .btn-delete.small i { font-size: 14px; }

.integrated-paper {
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  /*overflow: hidden;*/
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
}

/* === 상단 프로필 영역 === */
.profile-section {
  position: relative;
}
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--bg-surface);
  border-radius: 12px 12px 0 0;
  box-shadow: 0 4px 10px rgba(0,0,0,0.05); /* 스크롤 내릴 때 살짝 그림자 생김 */
}

.profile-banner {
  height: 100px;
  background-color: var(--primary);
  opacity: 0.9;
}

.profile-content {
  padding: 0 32px 24px;
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.profile-photo-wrapper {
  position: relative;
  margin-top: -40px;
  flex-shrink: 0;
}

.profile-photo {
  width: 110px; height: 110px;
  border-radius: 20px;
  background: var(--bg-surface);
  border: 4px solid var(--bg-surface);
  box-shadow: var(--shadow-md);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.profile-photo img { width: 100%; height: 100%; object-fit: cover; }
.profile-photo i { font-size: 60px; color: var(--text-muted); }

.btn-change-photo {
  position: absolute; bottom: -4px; right: -4px;
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--primary); border: 3px solid var(--bg-surface); color: var(--text-inverse);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.btn-change-photo:hover { background: var(--primary-hover); transform: scale(1.05); }

.profile-info {
  flex: 1;
  padding-top: 16px;
}

.profile-main {
  display: flex; align-items: center; gap: 16px; margin-bottom: 12px;
}

.profile-name { font-size: 26px; font-weight: 700; color: var(--text-main); margin: 0; }

.profile-details {
  display: flex; flex-wrap: wrap; gap: 20px;
}

.detail-item {
  display: flex; align-items: center; gap: 6px;
  color: var(--text-sub); font-size: 14px; font-weight: 500;
}
.detail-item i { font-size: 18px; color: var(--text-muted); }

.profile-stats {
  display: flex; gap: 24px; padding-top: 16px;
}

.stat-item { display: flex; gap: 12px; align-items: center; }

.stat-icon {
  width: 48px; height: 48px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px;
}
.stat-icon.blue { background: var(--primary-soft); color: var(--primary); }
.stat-icon.green { background: rgba(16, 185, 129, 0.1); color: var(--success); }
.stat-icon.orange { background: rgba(245, 158, 11, 0.1); color: var(--warning); }

.stat-text { display: flex; flex-direction: column; gap: 2px; }
.stat-text .label { font-size: 12px; color: var(--text-sub); font-weight: 500; }
.stat-text .value { font-size: 15px; font-weight: 700; color: var(--text-main); }

/* === 통합 탭 네비게이션 === */
.integrated-tabs {
  display: flex;
  padding: 0 32px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-canvas); /* 프로필과 내용 사이의 시각적 분리감 */
}

.tab-button {
  padding: 16px 24px; background: transparent; border: none;
  color: var(--text-sub); font-size: 14px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 8px; transition: all 0.2s;
  position: relative; margin-bottom: -1px;
}
.tab-button i { font-size: 18px; }
.tab-button:hover { color: var(--text-main); }
.tab-button.active { color: var(--primary); background: var(--bg-surface); border: 1px solid var(--border-color); border-bottom-color: var(--bg-surface); border-radius: 8px 8px 0 0;}

/* === 통합 컨텐츠 영역 === */
.integrated-content {
  padding: 32px;
  background-color: var(--bg-surface);
}

.tab-panel { animation: fadeIn 0.3s ease-out; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === 정보 섹션 (구분선으로 깔끔하게 분리) === */
.info-sections { display: flex; flex-direction: column; gap: 40px; }

.info-section {
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 20px;
  padding-bottom: 12px; border-bottom: 1px dashed var(--border-color);
}
.section-header i { font-size: 22px; color: var(--primary); }
.section-header h3 { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0; }

.info-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;
}

.info-item { display: flex; flex-direction: column; gap: 8px; }
.info-item.full-width { grid-column: 1 / -1; }

.info-item label { font-size: 13px; font-weight: 600; color: var(--text-sub); }
.info-value { font-size: 15px; color: var(--text-main); font-weight: 500; min-height: 24px; display: flex; align-items: center;}

.info-input, .info-select, .info-textarea {
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-main);
  /*background: var(--bg-canvas); */
  transition: all 0.2s;
}
.info-input:focus, .info-select:focus, .info-textarea:focus {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); background: var(--bg-surface);
}
.info-textarea { resize: vertical; min-height: 80px;}

/* 라디오 그룹 */
.radio-group { display: flex; gap: 12px; padding: 4px 0; }
.radio-label {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
  padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border-color);
  transition: all 0.2s; background: var(--bg-canvas); font-size: 13px; color: var(--text-sub);
}
.radio-label:hover { border-color: var(--border-focus); color: var(--text-main); }

.radio-label input[type="radio"] { display: none; }
.radio-label:has(input:checked) {
  border-color: var(--primary); background-color: var(--primary-soft);
  color: var(--primary); font-weight: 600;
}

/* 배지 (테마 변수 활용) */
.badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
  border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; height: fit-content;
}
.badge-success { background: rgba(16, 185, 129, 0.1); color: var(--success); }
.badge-primary { background: var(--primary-soft); color: var(--primary); }
.badge-warning { background: rgba(245, 158, 11, 0.1); color: var(--warning); }
.badge-info { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.badge-gray { background: var(--bg-canvas); color: var(--text-sub); }

.status-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
  border-radius: 6px; font-size: 13px; font-weight: 600;
}
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-preparing { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.status-inactive {     background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }

/* 텍스트 유틸 */
.border-red { border-color: rgba(239, 68, 68, 0.3) !important; }
.border-red:focus { border-color: var(--danger) !important; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important; }

/* === 근로계약 버튼 박스 === */
.contract-box {
  padding: 24px; background: var(--bg-canvas); border-radius: 12px;
  text-align: center; border: 1px dashed var(--border-focus);
}
.contract-box p { font-size: 14px; color: var(--text-sub); margin: 0 0 16px 0; }
.btn-contract-view {
  display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px;
  background: var(--bg-surface); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 8px;
  font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm);
}
.btn-contract-view:hover { border-color: var(--primary); color: var(--primary); }
.btn-contract-view i { font-size: 18px; color: var(--primary); }

/* === 반응형 === */
@media (max-width: 1024px) {
  .profile-content { flex-direction: column; gap: 24px; }
  .profile-photo-wrapper { margin-top: -50px; }
  .profile-stats { flex-direction: column; width: 100%; gap: 16px; padding-top: 0; }
  .integrated-content { padding: 24px; }
}

@media (max-width: 768px) {
  .integrated-tabs { padding: 0 16px; overflow-x: auto; }
  .tab-button { padding: 12px 16px; white-space: nowrap; }

  .info-grid { grid-template-columns: 1fr; }
  .profile-details { flex-direction: column; gap: 12px; }
  .integrated-content { padding: 20px 16px; }
  .info-sections { gap: 32px; }
}

.ssn-input {
  flex: 1;
  text-align: center;
  letter-spacing: 2px;
  min-width: 0;
}

.ssn-group {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

/* =============================================
   특이사항 탭 (상세/수정 페이지 히스토리용)
============================================= */
.memo-stacked-panel {
  width: 100%;
  padding: 10px 0 20px;
}

.memo-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.memo-section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 12px;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.section-icon-box i { font-size: 22px; }

.bg-primary-soft { background: var(--primary-soft); }
.bg-warning-soft { background: rgba(245, 158, 11, 0.1); }
.text-primary { color: var(--primary); }
.text-warning { color: var(--warning); }

.section-title-texts {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.section-title-texts h3 {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}
.section-title-texts p {
  font-size: 12px;
  color: var(--text-sub);
  margin: 0;
}

.header-count-badge {
  padding: 4px 10px;
  background: var(--bg-canvas);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
}
.header-count-badge.badge-warning {
  border-color: rgba(245, 158, 11, 0.3);
  color: var(--warning);
}

/* 폼 디자인 (에디터 스타일) */
.clean-editor-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s;
  margin-bottom: 8px;
}
.clean-editor-card:focus-within.primary-focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.clean-editor-card:focus-within.warning-focus {
  border-color: var(--warning);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
}

.clean-textarea {
  width: 100%;
  padding: 16px 20px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.6;
  resize: vertical;
  box-sizing: border-box;
}
.clean-textarea:focus { outline: none; }

/* 타임라인 히스토리 UI */
.clean-timeline-wrapper {
  position: relative;
  margin-top: 4px;
}

.clean-timeline {
  position: relative;
  padding-left: 16px;
}
.clean-timeline::before {
  content: '';
  position: absolute;
  top: 10px;
  bottom: 0;
  left: 20px;
  width: 2px;
  background: var(--border-color);
}

.clean-timeline-item {
  position: relative;
  padding-left: 28px;
  margin-bottom: 16px;
}
.clean-timeline-item:last-child { margin-bottom: 0; }

.timeline-dot {
  position: absolute;
  top: 14px;
  left: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 4px var(--bg-surface);
  z-index: 1;
}
.bg-primary { background: var(--primary); }
.bg-warning { background: var(--warning); }

.timeline-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 16px;
}
.border-warning-subtle {
  border-left: 3px solid rgba(245, 158, 11, 0.4);
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.meta-date {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-sub);
}
.meta-user {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.card-text {
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.5;
  white-space: pre-line;
  margin: 0;
}

/* ==========================================
   커스텀 트리 드롭다운 메뉴 CSS (아코디언 방식)
========================================== */
.position-dropdown-container {
  position: relative;
}

.dropdown-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  z-index: 99; cursor: default;
}

.custom-select-btn {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-surface); font-size: 13px; color: var(--text-main);
  cursor: pointer; transition: all 0.2s; height: 42px; box-sizing: border-box;
}
.custom-select-btn:hover { border-color: var(--border-focus); }

/* 활성화 시 포커스 링 효과 */
.position-dropdown-container:focus-within .custom-select-btn {
  border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft);
}

.custom-dropdown-menu {
  position: absolute; top: calc(100% + 4px); left: 0;
  width: 100%; min-width: 180px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  padding: 6px 0; margin: 0; list-style: none;
  z-index: 100; max-height: 300px; overflow-y: auto; /* 세로 스크롤 유지 */
}

/* 상위 메뉴 아이템 */
.menu-label {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; font-size: 13px; color: var(--text-main);
  cursor: pointer; transition: background 0.15s;
}
.menu-label:hover {
  background: var(--bg-hover); color: var(--primary); font-weight: 600;
}


/* 수정한 부분: 아래로 펼쳐지는 서브메뉴 스타일 ★ */
.custom-submenu {
  position: static; /* 옆으로 띄우지 않고 아래로 흐르게 배치 */
  width: 100%;
  background: var(--bg-canvas); /* 부모보다 살짝 어두운 배경으로 구분감 줌 */
  padding: 4px 0; margin: 0; list-style: none;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}

/* 2. 새롭게 추가할 클래스 스타일 */
.menu-text {
  flex: 1; /* 텍스트 영역을 넓게 잡아 클릭하기 편하게 만듭니다 */
  display: flex;
  align-items: center;
}

.toggle-icon-wrap {
  padding: 4px 8px; /* 클릭 터치 영역 확보 */
  margin-right: -8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}

.toggle-icon-wrap:hover {
  background: var(--border-color);
}

/* 하위 메뉴 아이템 */
.submenu-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px 8px 36px; /* ★ 좌측 여백(36px)을 줘서 하위 메뉴 느낌을 확실히 줌 */
  font-size: 12px; color: var(--text-sub);
  cursor: pointer; transition: background 0.15s;
}
.submenu-item:hover {
  background: var(--primary-soft); color: var(--primary); font-weight: 700;
}
</style>
