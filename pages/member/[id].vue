<script setup>
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

const isEditing = ref(false);
const activeTab = ref(route.query.tab || 'info');
const isLoading = ref(false);

const showRRN = ref(false);
const revealedRRN = ref('');
const rrnLoading = ref(false);

// 직원 정보
const employee = ref({
  id: '',
  name: '',
  type: '',
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
  accountNumber: '',
  four_ins: '',
  retire_pension: '',
  bigo: '',
  photo: null
});

// 근로계약서 모달 상태 추가
const isContractModalOpen = ref(false);
const items = ref([]);

const wageInputs = ref({});
const contractDataTemp = ref(null);

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

// ── 주민번호 토글 함수 ──────────────────────────────
const toggleRRN = async () => {
  if (showRRN.value) {
    showRRN.value = false;
    revealedRRN.value = '';
    return;
  }
  if (!confirm('주민번호 전체를 표시합니다. 계속하시겠습니까?')) return;
  const success = await fetchRRNData();
  if (success) showRRN.value = true;
};

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
      if (!isEditing.value) return;
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

// ── 화면 출력용 Computed (깔끔하게 포맷팅 적용) ───
const displayRRN = computed(() => {
  // 1. 복호화 상태 (주민번호 보기 버튼을 눌렀을 때)
  if (showRRN.value && revealedRRN.value) {
    const clean = revealedRRN.value.replace(/[^0-9]/g, '');
    return clean.length === 13
        ? `${clean.substring(0, 6)}-${clean.substring(6)}`
        : revealedRRN.value;
  }

  // 2. 기본(숨김) 상태: 암호화된 해시값이 있으므로, 기존 데이터를 조합해 마스킹 문자열 생성
  if (employee.value.birthDt && employee.value.gender) {
    const parts = employee.value.birthDt.split('-'); // ex) "1951-01-21"

    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const yy = parts[0].substring(2, 4); // 연도 뒤 2자리 (51)
      const mm = parts[1]; // 월 (01)
      const dd = parts[2]; // 일 (21)

      let genderDigit = '*';
      const isForeigner = employee.value.foreigner === 'Y';
      const isMale = employee.value.gender === 'M';

      // 2000년 이전 출생자 (1, 2 / 외국인 5, 6)
      if (year < 2000) {
        genderDigit = isForeigner ? (isMale ? '5' : '6') : (isMale ? '1' : '2');
      }
      // 2000년 이후 출생자 (3, 4 / 외국인 7, 8)
      else {
        genderDigit = isForeigner ? (isMale ? '7' : '8') : (isMale ? '3' : '4');
      }

      // 조립된 마스킹 문자열 반환 (ex: 510121-1******)
      return `${yy}${mm}${dd}-${genderDigit}******`;
    }
  }

  // 생년월일이나 성별 데이터가 부족한 경우 기본 별표 처리
  return '******-*******';
});

// 데이터 로드
const loadEmployeeData = async () => {
  isLoading.value = true;
  try {
    const memberId = route.params.id;
    const response = await axios.get(`/api/v1/member/data/${memberId}`);
    const rawData = response.data.data[0];
    const contract = rawData.contract ? JSON.parse(rawData.contract)[0] : { contractData: {} };
    // console.log(contract);
    // workSchedule 파싱: contract 안에 저장된 JSON 문자열이면 파싱, 아니면 그대로 사용
    let workSchedule = null;
    if (contract?.workSchedule) {
      workSchedule = typeof contract.workSchedule === 'string'
          ? JSON.parse(contract.workSchedule)
          : contract.workSchedule;
    }

    employee.value = {
      ...rawData,
      siteName: rawData.sites ? JSON.parse(rawData.sites)[0]?.name : '',
      contract,
      workSchedule,
    };
    await loadSalaryHistory();
  } catch (error) {
    console.error('직원 정보 로드 실패:', error);
    alert('직원 정보를 불러오는데 실패했습니다.');
  } finally {
    isLoading.value = false;
  }
};

//지급항목
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

// 1. 예산 데이터 가져오기 함수 추가
const getBudgetData = async function () {
  // 상세페이지 필드명: sIdx, typeCd, positionCd
  const { sIdx, typeCd, positionCd } = employee.value;
  if (!sIdx || !typeCd || !positionCd) return;

  try {
    const res = await axios.get(`/api/v1/site/contract/budget`, {
      params: { sIdx: sIdx, type: typeCd }
    });

    const budgetData = res.data.data[0];
    if (!budgetData) return;

    const newWageInputs = {};

    // 1) 지급(directLabor) 및 공제(indirectLabor) 항목 통합 매핑
    const laborKeys = ['directLabor', 'indirectLabor'];

    laborKeys.forEach(key => {
      if (budgetData.jsonData?.[key]) {
        budgetData.jsonData[key].forEach(item => {
          // 근로자의 날 수당(04001008) 제외 및 해당 직책(positionCd)의 값이 존재하는지 확인
          if (item.label !== '04001008' && item.values && item.values[positionCd] !== undefined) {
            newWageInputs[item.label] = item.values[positionCd];
          }
        });
      }
    });

    // 2) 스케줄 추출
    let selectedSchedule = null;
    if (budgetData.staffDetail) {
      const targetStaff = budgetData.staffDetail.find(s => s.code === positionCd);
      if (targetStaff) {
        selectedSchedule = targetStaff.schedule;
      }
    }

    // 부모 상태 반영 (입력값 동기화)
    wageInputs.value = newWageInputs;

    // contractDataTemp를 갱신하여 모달(근로계약서)에 즉시 반영
    // (기존에 이미 로드된 날짜 정보 등이 있다면 유지하기 위해 전개 연산자 사용)
    contractDataTemp.value = {
      ...contractDataTemp.value,
      wageInputs: newWageInputs,
      workSchedule: selectedSchedule
    };

    console.log('산출내역(지급/공제) 및 스케줄 자동 매핑 완료');
  } catch (err) {
    console.error('예산 데이터 로드 실패:', err);
  }
};

// 2. 수정 모드일 때만 작동하는 Watch 추가
watch(
    () => [employee.value.sIdx, employee.value.typeCd, employee.value.positionCd],
    ([newSite, newType, newPos]) => {
      // ★ 중요: 수정 모드(isEditing)가 활성화된 상태에서만 자동으로 불러와야 함
      // 그렇지 않으면 상세 페이지 진입 시 기존 저장된 데이터가 덮어씌워질 수 있음
      if (isEditing.value && newSite && newType && newPos) {
        getBudgetData();
      }
    }
);

const loadSalaryHistory = async () => {
  // 이미 로드된 데이터가 있다면 다시 호출하지 않음 (선택 사항)
  if (salaryHistory.value.length > 0 && !isEditing.value) return;

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

// ── 주민번호 복호화 공통 로직 ──────────────────────
const fetchRRNData = async () => {
  if (revealedRRN.value) return true; // 이미 있으면 통과

  rrnLoading.value = true;
  try {
    const res = await axios.post('/api/v1/member/rrn/batch', { mIdxList: [employee.value.idx] });
    if (res.data.result && res.data.data[employee.value.idx]) {
      revealedRRN.value = res.data.data[employee.value.idx];
      return true;
    } else {
      alert('주민번호 조회 권한이 없거나 데이터를 불러올 수 없습니다.');
      return false;
    }
  } catch (e) {
    console.error(e);
    alert('주민번호 복호화 중 오류가 발생했습니다.');
    return false;
  } finally {
    rrnLoading.value = false;
  }
};

// 편집 모드 토글
const toggleEdit = async () => {
  if (!isEditing.value) {
    // 수정 모드 진입 시 주민번호 복호화 시도
    const success = await fetchRRNData();
    if (!success) return; // 권한 없으면 수정 모드 진입 막기

    // 복호화된 번호 분리 (숫자만 추출)
    const clean = revealedRRN.value.replace(/[^0-9]/g, '');
    if (clean.length === 13) {
      employee.value.firstNumber = clean.substring(0, 6);
      employee.value.lastNumber = clean.substring(6);
    }
    isEditing.value = true;
  } else {
    isEditing.value = false;
  }
};

const handleContractSave = (savedData) => {
  // 모달에서 넘어온 데이터 중 wageInputs를 부모의 wageInputs에 저장
  wageInputs.value = savedData.wageInputs;
  contractDataTemp.value = savedData;

  alert('근로계약서 내용이 임시 저장되었습니다.');
};

// 저장
const saveEmployee = async () => {
  if (employee.value.status == '1' && !employee.value.outDate) {
    alert('퇴사 처리를 위해 퇴사일을 입력해주세요.');
    return;
  }

  if (!confirm('수정된 정보를 저장하시겠습니까?')) return;

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
      endDate: employee.value.outDate,
      endReason: employee.value.outReason,

      sIdx: employee.value.sIdx,
      dayWorkTime: contractDataTemp.value?.dayWorkTime || employee.value.dayWorkTime,
      monthWorkTime: contractDataTemp.value?.monthWorkTime || employee.value.monthWorkTime,

      // 임금 항목 (수정 안했을 경우를 대비해 기존 값과 병합)
      /*
      wageInputs: Object.keys(wageInputs.value).length > 0
          ? wageInputs.value
          : JSON.parse(employee.value.contract?.jsonData || '{}'),

       */
      contractData: contractDataTemp.value || {
        wageInputs: employee.value.contract?.contractData || {},
        workSchedule: employee.value.workSchedule || {}
      },

      // 보정된 계약 날짜 전송
      contractStartDt: finalStartDt,
      contractEndDt: finalEndDt
    };

    await axios.put(`/api/v1/member/data/${memberIdx}`, payload);

    alert('저장되었습니다.');
    isEditing.value = false;
    contractDataTemp.value = null; // 저장 후 임시 데이터 초기화
    await loadEmployeeData();
  } catch (error) {
    console.error('저장 실패:', error);
    alert('저장에 실패했습니다.');
  }
};

// 취소
const cancelEdit = () => {
  if (!confirm('수정을 취소하시겠습니까?')) return;
  //employee.value = JSON.parse(JSON.stringify(originalEmployee.value));
  isEditing.value = false;
};

// 삭제
const deleteEmployee = async () => {
  if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

  try {
    const memberId = route.params.id;
    await axios.delete(`/api/v1/member/${memberId}`);
    alert('삭제되었습니다.');
    await router.push('/member/list');
  } catch (error) {
    console.error('삭제 실패:', error);
    alert('삭제에 실패했습니다.');
  }
};

// 목록으로
const goBack = () => {
  router.push('/member/list');
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
    fetchPositionOptions(),
    fetchTypeOptions(),
    fetchBankOption(),
    fetchDisabledOptions(),
    getWageCode()
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
        <button @click="toggleRRN" :class="['btn-rrn-toggle', { active: showRRN }]" :disabled="rrnLoading || isEditing">
          <i class="mdi" :class="rrnLoading ? 'mdi-loading mdi-spin' : showRRN ? 'mdi-eye-off' : 'mdi-eye'"></i>
          <span>{{ showRRN ? '주민번호 숨기기' : '주민번호 보기' }}</span>
        </button>

        <template v-if="!isEditing">
          <button @click="toggleEdit" class="btn-edit">
            <i class="mdi mdi-pencil-outline"></i>
            <span>수정</span>
          </button>
          <button @click="deleteEmployee" class="btn-delete">
            <i class="mdi mdi-trash-can-outline"></i>
            <span>삭제</span>
          </button>
        </template>
        <template v-else>
          <button @click="cancelEdit" class="btn-cancel">
            <i class="mdi mdi-close"></i>
            <span>취소</span>
          </button>
          <button @click="saveEmployee" class="btn-save">
            <i class="mdi mdi-check"></i>
            <span>저장</span>
          </button>
        </template>
      </div>
    </div>

    <div class="integrated-paper">
      <div class="profile-section">
        <div class="profile-banner"></div>
        <div class="profile-content">
          <div class="profile-photo-wrapper">
            <div class="profile-photo">
              <img v-if="employee.photo" :src="employee.photo" alt="프로필 사진" />
              <i v-else class="mdi mdi-account"></i>
            </div>
            <button v-if="isEditing" class="btn-change-photo">
              <i class="mdi mdi-camera-outline"></i>
            </button>
          </div>

          <div class="profile-info">
            <div class="profile-main">
              <h2 class="profile-name">{{ employee.name }}</h2>
              <span :class="['status-badge', employee.status == 0 ? 'status-active' : 'status-inactive']">
                <i :class="['mdi', employee.status == '0' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline']"></i>
                {{ employee.status == 0 ? '재직' : '퇴사' }}
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
                  <input v-if="isEditing" type="text" v-model="employee.name" class="info-input" />
                  <span v-else class="info-value">{{ employee.name }}</span>
                </div>
                <div class="info-item">
                  <label>성별</label>
                  <div v-if="isEditing" class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="M" v-model="employee.gender" />
                      <span class="radio-text">남성</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="F" v-model="employee.gender" />
                      <span class="radio-text">여성</span>
                    </label>
                  </div>
                  <span v-else class="info-value">{{ employee.gender === 'M' ? '남성' : '여성' }}</span>
                </div>
                <div class="info-item">
                  <label>주민번호</label>
                  <div v-if="isEditing" class="ssn-group">
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
                  <span v-else class="info-value">{{ displayRRN }}</span>
                </div>
                <div class="info-item">
                  <label>생년월일</label>
                  <input v-if="isEditing" type="date" v-model="employee.birthDt" class="info-input" max="9999-12-31"/>
                  <span v-else class="info-value">{{ employee.birthDt || '-' }}</span>
                </div>
                <div class="info-item">
                  <label>나이</label>
                  <span class="info-value">{{ age }}세</span>
                </div>
                <div class="info-item full-width">
                  <label>연락처</label>
                  <input v-if="isEditing" type="tel" v-model="employee.phone" class="info-input" />
                  <span v-else class="info-value">{{ employee.phone || '-' }}</span>
                </div>
                <div class="info-item full-width">
                  <label>이메일</label>
                  <input v-if="isEditing" type="email" v-model="employee.email" class="info-input" />
                  <span v-else class="info-value">{{ employee.email || '-' }}</span>
                </div>
                <div class="info-item full-width">
                  <label>주소</label>
                  <input v-if="isEditing" type="text" v-model="employee.address" class="info-input" />
                  <span v-else class="info-value">{{ employee.address || '-' }}</span>
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
                  <select v-if="isEditing" v-model="employee.typeCd" class="info-select">
                    <option v-for="type in typeOptions" :key="type.itemCd" :value="type.itemCd">{{ type.itemNm }}</option>
                  </select>
                  <span v-else class="info-value">{{ employee.type || '-' }}</span>
                </div>
                <div class="info-item">
                  <label>근무 현장</label>
                  <!--select v-if="isEditing" v-model="employee.sIdx" class="info-select">
                    <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
                  </select-->
                  <SiteSelect
                      v-if="isEditing"
                      v-model="employee.sIdx"
                      :allow-empty="false"
                      width="100%"
                      style="background: var(--bg-canvas) !important; border-radius: 8px !important;"
                  />
                  <span v-else class="info-value">{{ employee.siteName }}</span>
                </div>
                <div class="info-item">
                  <label>직위</label>
                  <select v-if="isEditing" v-model="employee.positionCd" class="info-select">
                    <option v-for="pos in positionOptions" :key="pos.itemCd" :value="pos.itemCd">{{ pos.itemNm }}</option>
                  </select>
                  <span v-else class="info-value">{{ employee.positionName }}</span>
                </div>
                <div class="info-item " style="word-break:keep-all;">
                  <label>재직 상태</label>
                  <div v-if="isEditing" class="radio-group ">
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
                  </div>
                  <span v-else :class="[
                      'status-badge',
                      employee.status == 0 ? 'status-active' : employee.status == 1 ? 'status-inactive' : 'status-preparing']">
                    {{ employee.status == 0 ? '재직 중' : employee.status == 1 ? '퇴사' : employee.status == 2? '일용직':'대근' }}
                  </span>
                </div>
                <div class="info-item">
                  <label>입사일</label>
                  <input v-if="isEditing" type="date" v-model="employee.inDate" class="info-input" max="9999-12-31" />
                  <span v-else class="info-value">{{ employee.inDate }}</span>
                </div>
                <template v-if="employee.status == 1">
                  <div class="info-item">
                    <label class="text-red">퇴사일</label>
                    <input v-if="isEditing" type="date" v-model="employee.outDate" class="info-input border-red" max="9999-12-31" />
                    <span v-else class="info-value text-red">{{ employee.outDate || '미입력' }}</span>
                  </div>
                  <div class="info-item">
                    <label class="text-red">퇴사 사유</label>
                    <input v-if="isEditing" type="text" v-model="employee.outReason" class="info-input border-red" placeholder="퇴사 사유를 입력하세요" />
                    <span v-else class="info-value text-red">{{ employee.outReason || '미입력' }}</span>
                  </div>
                </template>
              </div>
            </div>

            <div class="info-section">
              <div class="section-header">
                <i class="mdi mdi-alert-circle-outline"></i><h3>특이사항</h3>
              </div>
              <div class="info-grid">
                <div class="info-item">
                  <label>장애 여부</label>
                  <div v-if="isEditing" class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.disability" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.disability" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                  <template v-else>
                    <span v-if="employee.disability === 'Y'" class="badge badge-primary">
                      <i class="mdi mdi-wheelchair-accessibility"></i> {{ employee.disability_grade || '장애' }}
                    </span>
                    <span v-else class="info-value text-gray">해당없음</span>
                  </template>
                </div>
                <template v-if="employee.disability === 'Y'">
                  <div class="info-item">
                    <label class="text-red">장애등록일</label>
                    <input
                        v-if="isEditing"
                        type="date"
                        v-model="employee.disability_date"
                        class="info-input border-red"
                        max="9999-12-31"
                    />
                    <span v-else class="info-value">{{ employee.disability_date }}</span>
                  </div>
                  <div class="info-item">
                    <label class="text-red">장애등급</label>
                    <select v-if="isEditing" v-model="employee.disabilityCd" class="info-select border-red">
                      <option value="">선택하세요</option>
                      <option v-for="item in disabledOptions" :key="item.itemCd" :value="item.itemCd">
                        {{ item.itemNm }}
                      </option>
                    </select>
                    <span v-else class="info-value">{{ employee.disability_grade }}</span>
                  </div>
                </template>
                <div class="info-item">
                  <label >외국인 여부</label>
                  <div v-if="isEditing" class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.foreigner" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.foreigner" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                  <template v-else>
                    <span v-if="employee.foreigner === 'Y'" class="badge badge-warning">
                      <i class="mdi mdi-earth"></i> {{ employee.nationality || '외국인' }}
                    </span>
                    <span v-else class="info-value text-gray">해당없음</span>
                  </template>
                </div>

                <template v-if="employee.foreigner === 'Y'">
                  <div class="info-item">
                    <label class="text-red">국적</label>
                    <input
                        v-if="isEditing"
                        type="text"
                        v-model="employee.nationality"
                        class="info-input border-red"
                        placeholder="예: 베트남"
                    />
                    <span v-else class="info-value">{{ employee.nationality }}</span>
                  </div>
                  <div class="info-item">
                      <label class="text-red">비자 코드</label>
                      <input
                          v-if="isEditing"
                          type="text"
                          v-model="employee.visa_code"
                          class="info-input border-red"
                          placeholder="예: E-9"
                      />
                    <span v-else class="info-value">{{ employee.visa_code }}</span>
                  </div>

                  <div class="info-item">
                    <label class="text-red">비자만료일</label>
                    <input
                        v-if="isEditing"
                        type="date"
                        v-model="employee.visa_date"
                        class="info-input border-red"
                        max="9999-12-31"
                    />
                    <span v-else class="info-value">{{ employee.visa_date }}</span>
                  </div>
                </template>

                <div class="info-item">
                  <label>새터민 여부</label>
                  <div v-if="isEditing" class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.defector" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.defector" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                  <template v-else>
                    <span v-if="employee.defector === 'Y'" class="badge badge-warning">
                      <i class="mdi mdi-earth"></i> {{ employee.defector || '새터민' }}
                    </span>
                    <span v-else class="info-value text-gray">해당없음</span>
                  </template>
                </div>
                <div class="info-item">
                  <label>국가유공자 여부</label>
                  <div v-if="isEditing" class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.patriot" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.patriot" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                  <template v-else>
                    <span v-if="employee.patriot === 'Y'" class="badge badge-info">
                      <i class="mdi mdi-medal-outline"></i> 유공자
                    </span>
                    <span v-else class="info-value text-gray">해당없음</span>
                  </template>
                </div>
                <div class="info-item">
                  <label>청년인턴 여부</label>
                  <div v-if="isEditing" class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.intern" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.intern" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                  <template v-else>
                    <span v-if="employee.intern === 'Y'" class="badge badge-info">
                      <i class="mdi mdi-medal-outline"></i> 청년인턴
                    </span>
                    <span v-else class="info-value text-gray">해당없음</span>
                  </template>
                </div>
                <div class="info-item">
                  <label>기초수급자 여부</label>
                  <div v-if="isEditing" class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="Y" v-model="employee.beneficiary" />
                      <span class="radio-text">예</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="N" v-model="employee.beneficiary" />
                      <span class="radio-text">아니오</span>
                    </label>
                  </div>
                  <template v-else>
                    <span v-if="employee.beneficiary === 'Y'" class="badge badge-success">
                      <i class="mdi mdi-hand-heart-outline"></i> 수급자
                    </span>
                    <span v-else class="info-value text-gray">해당없음</span>
                  </template>
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
                  <select v-if="isEditing" v-model="employee.bank" class="info-select">
                    <option v-for="bank in bankOptions" :key="bank.itemNm" :value="bank.itemNm">{{ bank.itemNm }}</option>
                  </select>
                  <span v-else class="info-value">{{ employee.bank || '-' }}</span>
                </div>
                <div class="info-item">
                  <label>계좌번호</label>
                  <input v-if="isEditing" type="text" v-model="employee.accountNumber" class="info-input" />
                  <span v-else class="info-value">{{ employee.accountNumber || '-' }}</span>
                </div>
                <div class="info-item">
                  <label>4대보험</label>
                  <template v-if="isEditing">
                    <select v-model="employee.four_ins" required class="info-select">
                      <option value="Y">가입</option>
                      <option value="N">미가입</option>
                    </select>
                  </template>
                  <template v-else>
                    <span :class="['badge', employee.four_ins === 'Y' ? 'badge-success' : 'badge-gray']">
                      <i :class="['mdi', employee.four_ins === 'Y' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline']"></i>
                      {{ employee.four_ins === 'Y' ? '가입' : '미가입' }}
                    </span>
                  </template>
                </div>
                <div class="info-item">
                  <label>퇴직연금</label>
                  <template v-if="isEditing">
                    <select v-model="employee.retire_pension" required class="info-select">
                      <option value="Y">가입</option>
                      <option value="N">미가입</option>
                    </select>
                  </template>
                  <template v-else>
                    <span :class="['badge', employee.retire_pension === 'Y' ? 'badge-success' : 'badge-gray']">
                      <i :class="['mdi', employee.retire_pension === 'Y' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline']"></i>
                      {{ employee.retire_pension === 'Y' ? '가입' : '미가입' }}
                    </span>
                  </template>
                </div>
                <div class="info-item full-width">
                  <label>비고</label>
                  <textarea v-if="isEditing" v-model="employee.bigo" class="info-textarea" rows="3"></textarea>
                  <span v-else class="info-value">{{ employee.bigo || '-' }}</span>
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
          // 1. 수정 중인 wageInputs가 있으면 쓰고, 없으면 DB에서 로드된 contractData 사용
          wageInputs: Object.keys(wageInputs).length > 0
              ? wageInputs
              : (employee.contract?.contractData || {}),
          // 2. 수정 중인 스케줄이 있으면 쓰고, 없으면 DB에서 로드된 workSchedule 사용
          workSchedule: contractDataTemp?.workSchedule || employee.workSchedule
        }"
        :employee-type="employee.type"
        :site-options="siteOptions"
        :position-options="positionOptions"
        :wage-items="items"
        :is-editing="isEditing"
        :company-data="companyData"
        @close="isContractModalOpen = false"
        @save="handleContractSave"
    />
<!--    @save="saveContract"-->
  </div>
</template>

<style scoped>
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
  overflow: hidden;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
}

/* === 상단 프로필 영역 === */
.profile-section {
  position: relative;
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
.status-inactive { background-color: var(--bg-hover); color: var(--text-sub); }

/* 텍스트 유틸 */
.text-red { color: var(--danger) !important; font-weight: 600; }
.border-red { border-color: rgba(239, 68, 68, 0.3) !important; }
.border-red:focus { border-color: var(--danger) !important; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important; }
.text-gray { color: var(--text-muted); }
.text-primary { color: var(--primary); }

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

.btn-rrn-toggle {
  display: flex; align-items: center; gap: 6px;
  padding: 0 16px; height: 42px; border-radius: 8px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--border-color); background: var(--bg-surface);
  color: var(--text-sub); cursor: pointer; transition: all 0.2s;
  box-shadow: var(--shadow-sm); box-sizing: border-box;
}
.btn-rrn-toggle:hover:not(:disabled) {
  border-color: var(--warning);
  color: var(--warning);
  transform: translateY(-1px);
}
.btn-rrn-toggle.active {
  background: rgba(245,158,11, 0.05);
  border-color: var(--warning);
  color: #b45309;
}
.btn-rrn-toggle:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--bg-canvas);
}

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
</style>
