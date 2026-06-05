<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const {
  positionOptions,
  typeOptions,
  wagesData,
  bankOptions,
  fetchPositionOptions,
  fetchTypeOptions,
  fetchWageCode,
  fetchBankOption
} = useApi();

const DEFAULT_DIRECT_LABOR_COMMON = [
  { code: '04001001', label: '기본급' },
  { code: '04001002', label: '직책수당' },
  { code: '04003001', label: '연차적립금' },
  { code: '04003003', label: '퇴직적립금' },
];

const DEFAULT_DIRECT_LABOR_GUARD = [
  ...DEFAULT_DIRECT_LABOR_COMMON,
  { code: '04001003', label: '야간수당' },
];

const DEFAULT_INDIRECT_LABOR = [
  { code: '04002003', label: '국민연금' },
  { code: '04002001', label: '건강보험' },
  { code: '04002002', label: '요양보험' },
  { code: '04002004', label: '고용보험' },
  { code: '04003010', label: '산재보험' },
];

const site = ref({
  siteName: '',
  siteId: '',
  siteType: '',
  businessNumber: '',
  representative: '',
  businessType: '',
  businessItem: '',
  email: '',
  postalCode: '',
  addressMain: '',
  addressDetail: '',
  areaUnder: '',
  areaOver: '',
  areaGross: '',
  is_vat: false,
  building_su: '',
  unit_su: '',
  managerName: '',
  managerContact: '',
  director: '',
  directorContact: '',
  billingManager: '',
  payrollManager: '',
  memo: '',
  status: '운영 중',
  payment_day: '',
  bigo: '',
  bankName: '기업',
  accountNumber: ''
});

const contractGroups = ref([]);
const selectedFiles = ref([]);
const siteTypeOptions = ref(['아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const statusOptions  = ref(['운영 중', '계약 종료']);
const bigoHistory    = ref([]);
const detailInput    = ref(null);

const searchAvailable = ref('');
const searchSelected  = ref('');
const selectedAvailItems = ref([]);
const selectedRightItems = ref([]);

const allAvailableItems = computed(() => {
  const map = new Map();

  // dynamicSettlementItems는 이제 '코드'를 가지고 있습니다.
  dynamicSettlementItems.value.payItems.forEach(code => {
    const found = wagesData.value.find(w => w.itemCd === code);
    if (found) map.set(found.itemCd, found.itemNm);
    else map.set(code, code); // fallback
  });
  dynamicSettlementItems.value.deductionItems.forEach(code => {
    const found = wagesData.value.find(w => w.itemCd === code);
    if (found) map.set(found.itemCd, found.itemNm);
    else map.set(code, code); // fallback
  });

  (wagesData.value || []).forEach(w => {
    map.set(w.itemCd, w.itemNm);
  });

  return Array.from(map.entries()).map(([cd, nm]) => ({ cd, nm }));
});

const unifiedSelectedCds = computed(() => [
  ...settlementConfig.value.activePayLabels,
  ...settlementConfig.value.activeDeductionLabels,
]);

const filteredAvailable = computed(() =>
    allAvailableItems.value
        .filter(item => !unifiedSelectedCds.value.includes(item.cd))
        .filter(item => item.nm.includes(searchAvailable.value))
);

const filteredSelected = computed(() => {
  const cdToNm = Object.fromEntries(
      allAvailableItems.value.map(i => [i.cd, i.nm])
  );
  return unifiedSelectedCds.value
      .filter(cd => (cdToNm[cd] || cd).includes(searchSelected.value))
      .map(cd => ({ cd, nm: cdToNm[cd] || cd }));
});

const toggleAvail = (item) => {
  const idx = selectedAvailItems.value.indexOf(item.cd);
  if (idx > -1) selectedAvailItems.value.splice(idx, 1);
  else selectedAvailItems.value.push(item.cd);
};

const toggleRight = (item) => {
  const idx = selectedRightItems.value.indexOf(item.cd);
  if (idx > -1) selectedRightItems.value.splice(idx, 1);
  else selectedRightItems.value.push(item.cd);
};

const isPayItem = (cd) => {
  // 배열에 코드가 들어있으므로, 파라미터로 넘어온 코드(cd)가 있는지 바로 확인
  if (dynamicSettlementItems.value.payItems.includes(cd)) return true;

  const found = wagesData.value.find(w => w.itemCd === cd);
  const nm = found ? found.itemNm : cd;
  return PAY_CONTROL_KEYWORDS.some(kw => nm.includes(kw));
};

const moveToRight = () => {
  selectedAvailItems.value.forEach(cd => {
    if (isPayItem(cd)) {
      if (!settlementConfig.value.activePayLabels.includes(cd))
        settlementConfig.value.activePayLabels.push(cd);
    } else {
      if (!settlementConfig.value.activeDeductionLabels.includes(cd))
        settlementConfig.value.activeDeductionLabels.push(cd);
    }
  });
  selectedAvailItems.value = [];
};

const moveToLeft = () => {
  selectedRightItems.value.forEach(cd => {
    const pIdx = settlementConfig.value.activePayLabels.indexOf(cd);
    if (pIdx > -1) settlementConfig.value.activePayLabels.splice(pIdx, 1);
    const dIdx = settlementConfig.value.activeDeductionLabels.indexOf(cd);
    if (dIdx > -1) settlementConfig.value.activeDeductionLabels.splice(dIdx, 1);
  });
  selectedRightItems.value = [];
};

const getItemName = (code) => {
  if (!code) return '-';
  const found = wagesData.value.find(w => w.itemCd === code);
  return found ? found.itemNm : code;
};

// =============================================
// ★ 정산 설정 — 산출내역서 기반 동적 항목
// =============================================

/**
 * 산출내역서의 실제 입력 항목들을 읽어서 정산 설정 체크박스로 구성합니다.
 *
 * - payItems      : 직접노무비 중 '연차적립금', '퇴직적립금', '근로자의날수당' 등 특수 지급항목
 * - deductionItems: 간접노무비 전체 항목 (건강보험, 국민연금 등 공제항목)
 *
 * 각 항목은 label(표시명)을 key로 사용합니다.
 */

// 직접노무비 중 정산 설정에서 개별 제어할 특수 지급항목 키워드
const PAY_CONTROL_KEYWORDS = ['연차', '퇴직', '근로자의날'];

// 산출내역서에서 동적으로 수집된 항목들
const dynamicSettlementItems = computed(() => {
  const paySet = new Map();
  const deductionSet = new Map();

  contractGroups.value.forEach(group => {
    if (!group.costBreakdown) return;

    (group.costBreakdown.directLabor || []).forEach(item => {
      if (!item.code) return;
      const isSpecial = PAY_CONTROL_KEYWORDS.some(kw => item.label?.includes(kw));
      if (isSpecial) paySet.set(item.code, true); // ← label → code
    });

    (group.costBreakdown.indirectLabor || []).forEach(item => {
      if (item.code) deductionSet.set(item.code, true); // ← label → code
    });
  });

  return {
    payItems:       Array.from(paySet.keys()),
    deductionItems: Array.from(deductionSet.keys()),
  };
});

const settlementConfig = ref({
  // 직접노무비 특수 지급항목 표시 여부 (label 배열)
  activePayLabels: [],
  // 간접노무비(공제항목) 표시 여부 (label 배열)
  activeDeductionLabels: [],
  isAutoCalcDefault: true,
  // Melt Options — 공제 계산 베이스에 포함 여부
  meltOptions: {
    annualLeave: false,
    severance: false,
    workersDay: false // 근로자의 날 수당 포함 옵션
  }
});

// 산출내역서 항목이 바뀌면 새로운 항목은 자동으로 체크 추가
// 산출내역서 항목이 바뀌면 새로운 항목(코드)은 자동으로 체크 추가
watch(dynamicSettlementItems, (newItems) => {
  // 지급항목: 새로 추가된 항목 자동 체크
  newItems.payItems.forEach(code => {
    if (!settlementConfig.value.activePayLabels.includes(code)) {
      settlementConfig.value.activePayLabels.push(code);
    }
  });
  settlementConfig.value.activePayLabels =
      settlementConfig.value.activePayLabels.filter(c => newItems.payItems.includes(c));

  // 공제항목
  newItems.deductionItems.forEach(code => {
    if (!settlementConfig.value.activeDeductionLabels.includes(code)) {
      settlementConfig.value.activeDeductionLabels.push(code);
    }
  });
  settlementConfig.value.activeDeductionLabels =
      settlementConfig.value.activeDeductionLabels.filter(c => newItems.deductionItems.includes(c));
}, { deep: true });

// =============================================
// costBreakdown 기본값 생성
// =============================================
const makeValuesObj = (staffList, defaultVal = '') => {
  const obj = {};
  staffList.forEach(s => { obj[s.code] = defaultVal; });
  return obj;
};

const createDefaultCostBreakdown = (staffList = []) => ({
  dailyWorkHours: makeValuesObj(staffList, ''),
  monthlyWorkHours: makeValuesObj(staffList, ''),
  directLabor: [],   // ← 빈 배열로 변경
  indirectLabor: [], // ← 빈 배열로 변경
  expenses: [
    { label: '피복비 및 장구비', values: makeValuesObj(staffList) },
    { label: '교육훈련비',       values: makeValuesObj(staffList) },
    { label: '소모품비',         values: makeValuesObj(staffList) },
    { label: '복리후생비',       values: makeValuesObj(staffList) },
  ],
  managementFee: makeValuesObj(staffList),
  profit: makeValuesObj(staffList),
  specialNote: '',
});

const syncCostBreakdownToStaff = (group) => {
  const sections = ['directLabor', 'indirectLabor', 'expenses'];
  const currentCodes = group.staffList.map(s => s.code);

  sections.forEach(section => {
    group.costBreakdown[section].forEach(item => {
      currentCodes.forEach(code => {
        if (!(code in item.values)) item.values[code] = '';
      });
      Object.keys(item.values).forEach(code => {
        if (!currentCodes.includes(code)) delete item.values[code];
      });
    });
  });

  const manualItems = ['managementFee', 'profit', 'dailyWorkHours', 'monthlyWorkHours'];
  manualItems.forEach(key => {
    if (!group.costBreakdown[key]) group.costBreakdown[key] = {};
    currentCodes.forEach(code => {
      if (!(code in group.costBreakdown[key])) group.costBreakdown[key][code] = '';
    });
    Object.keys(group.costBreakdown[key]).forEach(code => {
      if (!currentCodes.includes(code)) delete group.costBreakdown[key][code];
    });
  });
};

// 계약 시작일 입력 시, 최초 계약일이 비어있으면 자동 채움
const syncFirstContractDate = (group) => {
  if (!group.firstContractDt && group.contractStart) {
    group.firstContractDt = group.contractStart;
  }
};

const onInputCost = (item, code, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart; // 현재 커서 위치 저장
  const oldLength = el.value.length;

  // 숫자만 추출
  const rawValue = el.value.replace(/[^\d]/g, '');

  // 데이터 업데이트: 빈 문자열이면 데이터도 빈 값으로, 아니면 숫자로 저장
  const numValue = rawValue === '' ? '' : Number(rawValue);
  item.values[code] = numValue;

  // 화면 표시값 즉시 포맷팅
  const formatted = formatCurrency(numValue);
  el.value = formatted;

  // 커서 위치 보정: 콤마 추가로 인한 길이 변화 계산
  const newLength = formatted.length;
  const nextPos = selectionStart + (newLength - oldLength);
  el.setSelectionRange(nextPos, nextPos);
};

const onInputSingleCost = (obj, code, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  const rawValue = el.value.replace(/[^\d]/g, '');
  const numValue = rawValue === '' ? '' : Number(rawValue);

  obj[code] = numValue;

  const formatted = formatCurrency(numValue);
  el.value = formatted;

  const nextPos = selectionStart + (newLength - oldLength);
  el.setSelectionRange(nextPos, nextPos);
};

// 자동 계산된 총계와 수동 입력된 총계를 제어하는 함수
const getDisplayMonthlyTotal = (group) => {
  // 수동으로 입력한 값이 존재하면 그 값을 반환
  if (group.manualMonthlyTotal !== undefined && group.manualMonthlyTotal !== null && group.manualMonthlyTotal !== '') {
    return group.manualMonthlyTotal;
  }
  // 수동 입력값이 없으면 자동 계산된 값 반환
  return getTotalMonthlyFee(group);
};

// 월간 용역비 총계 입력 핸들러 (콤마 및 커서 유지)
const onInputMonthlyTotal = (group, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  // 숫자만 추출
  const rawValue = el.value.replace(/[^\d]/g, '');
  const numValue = rawValue === '' ? '' : Number(rawValue);

  // 수동 입력값 저장 (빈 값이면 다시 자동계산으로 돌아감)
  group.manualMonthlyTotal = numValue;

  // 화면 포맷팅
  const formatted = formatCurrency(numValue === '' ? getTotalMonthlyFee(group) : numValue);
  el.value = formatted;

  // 커서 위치 보정
  const nextPos = selectionStart + (formatted.length - oldLength);
  el.setSelectionRange(nextPos, nextPos);
};

// =============================================
// 계약 그룹 CRUD
// =============================================
const addContractGroup = (category) => {
  // 타입에 따라 직접노무비 항목 결정
  const isGuard = category.itemNm === '경비';   // 경비
  const isCleaning = category.itemNm === '미화'; // 미화

  const directLaborTemplate = isGuard
      ? DEFAULT_DIRECT_LABOR_GUARD
      : (isCleaning ? DEFAULT_DIRECT_LABOR_COMMON : []);

  const defaultBreakdown = createDefaultCostBreakdown([]);

  // 직접노무비 기본 항목 주입
  defaultBreakdown.directLabor = directLaborTemplate.map(item => ({
    code:   item.code,
    label:  item.label,
    values: {},
    bigo:   '',
  }));

  // 간접노무비 기본 항목 주입 (경비/미화 공통)
  if (isGuard || isCleaning) {
    defaultBreakdown.indirectLabor = DEFAULT_INDIRECT_LABOR.map(item => ({
      code:   item.code,
      label:  item.label,
      values: {},
      bigo:   '',
    }));
  }

  contractGroups.value.push({
    category: category.itemNm,
    type: category.itemCd,
    firstContractDt: '', // 최초 계약일
    contractStart: '', //계약 시작일
    contractEnd: '',  //계약 종료일
    totalCost: 0,
    workDays: '',
    workSchedule: '',
    breakTime: '',
    staffList: [],
    tempJobCode: '',
    tempCount: 1,
    isAutoCalc: settlementConfig.value.isAutoCalcDefault ? 'Y' : 'N',
    costBreakdown: defaultBreakdown,
    showCostBreakdown: false,
    salarySource: 'contract',
  });
};

const removeContractGroup = (index) => {
  if (confirm('해당 계약 정보를 삭제하시겠습니까?')) {
    contractGroups.value.splice(index, 1);
  }
};

// =============================================
// 스케줄(근무시간) 관리
// =============================================
const weekDays = [
  { val: 1, label: '월' }, { val: 2, label: '화' }, { val: 3, label: '수' },
  { val: 4, label: '목' }, { val: 5, label: '금' }, { val: 6, label: '토' }, { val: 0, label: '일' }
];

const createDefaultSchedule = () => {
  const schedule = {};
  for (let i = 0; i <= 6; i++) {
    schedule[i] = {
      isActive: i >= 1 && i <= 5,
      startTime: '09:00',
      endTime: '18:00',
      breakTime: 60,
      isBiweekly: false
    };
  }
  return schedule;
};

const applyToWeekdays = (schedule) => {
  const mon = schedule[1];
  [2, 3, 4, 5].forEach(day => {
    schedule[day].isActive = mon.isActive;
    schedule[day].startTime = mon.startTime;
    schedule[day].endTime = mon.endTime;
    schedule[day].breakTime = mon.breakTime;
  });
  alert('월요일의 일정이 화~금요일에 일괄 적용되었습니다.');
};

const addStaffToGroup = (groupIndex) => {
  const group = contractGroups.value[groupIndex];
  if (!group.tempJobCode) { alert('직책을 선택해주세요.'); return; }
  if (group.tempCount < 1) { alert('1명 이상 입력해주세요.'); return; }

  const jobInfo = positionOptions.value.find(p => p.itemCd === group.tempJobCode);
  const existing = group.staffList.find(s => s.code === jobInfo.itemCd);

  if (existing) {
    existing.count += Number(group.tempCount);
  } else {
    group.staffList.push({
      code: jobInfo.itemCd,
      name: jobInfo.itemNm,
      count: Number(group.tempCount),
      schedule: createDefaultSchedule(),
      showSchedule: true   // 추가 시 바로 펼침
    });
  }

  syncCostBreakdownToStaff(group);
  group.tempJobCode = '';
  group.tempCount = 1;
};

const removeStaffFromGroup = (groupIndex, staffIndex) => {
  contractGroups.value[groupIndex].staffList.splice(staffIndex, 1);
  syncCostBreakdownToStaff(contractGroups.value[groupIndex]);
};

const getGroupStaffTotal = (group) => group.staffList.reduce((s, i) => s + i.count, 0);

const getContractDuration = (group) => {
  if (!group.contractStart || !group.contractEnd) return '';
  const diffDays = Math.ceil(Math.abs(new Date(group.contractEnd) - new Date(group.contractStart)) / 86400000);
  const months = Math.floor(diffDays / 30);
  const years  = Math.floor(months / 12);
  if (years > 0) {
    const rem = months % 12;
    return rem > 0 ? `${years}년 ${rem}개월` : `${years}년`;
  }
  return `${months}개월`;
};

// =============================================
// 산출내역서 계산 함수
// =============================================
const getRowTotal = (item, staffList) => (staffList ?? []).reduce((s, st) => s + (Number(item.values[st.code]) || 0) * (Number(st.count) || 0), 0);
const getColTotal = (items, code) => items.reduce((s, item) => s + (Number(item.values[code]) || 0), 0);
const getSubtotalRowTotal = (group, sectionFn) => group.staffList.reduce((s, st) => s + sectionFn(group, st.code) * (Number(st.count) || 0), 0);

const getDirectLaborColTotal   = (group, code) => getColTotal(group.costBreakdown.directLabor, code);
const getIndirectLaborColTotal = (group, code) => getColTotal(group.costBreakdown.indirectLabor, code);
const getExpensesColTotal      = (group, code) => getColTotal(group.costBreakdown.expenses, code);

const getLaborColTotal = (group, code) => getDirectLaborColTotal(group, code) + getIndirectLaborColTotal(group, code) + getExpensesColTotal(group, code);
const getLaborGrandTotal = (group) => group.staffList.reduce((s, st) => s + getLaborColTotal(group, st.code) * st.count, 0);

const getManagementFeeCol = (group, code) => Number(group.costBreakdown.managementFee[code]) || 0;
const getManagementFeeGrandTotal = (group) => group.staffList.reduce((s, st) => s + getManagementFeeCol(group, st.code) * st.count, 0);

const getProfitCol = (group, code) => Number(group.costBreakdown.profit[code]) || 0;
const getProfitGrandTotal = (group) => group.staffList.reduce((s, st) => s + getProfitCol(group, st.code) * st.count, 0);

const getMonthlyTotalCol = (group, code) => getLaborColTotal(group, code) + getManagementFeeCol(group, code) + getProfitCol(group, code);
const getTotalMonthlyFee = (group) => group.staffList.reduce((s, st) => s + getMonthlyTotalCol(group, st.code) * st.count, 0);

const addItem = (group, section) => { group.costBreakdown[section].push({ label: '', values: makeValuesObj(group.staffList) }); };
const removeItem = (group, section, idx) => { group.costBreakdown[section].splice(idx, 1); };

// =============================================
// 폼 및 API 처리 로직
// =============================================
const handleFileChange = (event) => {
  const files = Array.from(event.target.files);

  // PDF 필터링
  const pdfFiles = files.filter(file => file.type === 'application/pdf');

  if (pdfFiles.length !== files.length) {
    alert('PDF 파일만 업로드 가능합니다.');
  }

  // 기존 목록에 추가 (중복 방지 로직을 넣고 싶다면 파일명 비교 추가 가능)
  selectedFiles.value = [...selectedFiles.value, ...pdfFiles];

  // 같은 파일을 다시 선택할 수 있도록 input 초기화
  event.target.value = '';
};

const removeFile = (index) => {
  selectedFiles.value.splice(index, 1);
};

const totalArea = computed(() => {
  const under = Number(site.value.areaUnder) || 0;
  const over = Number(site.value.areaOver) || 0;
  return Math.round((under + over) * 100) / 100;
});

const isVatSite = computed(() => Number(site.value.areaOver) > 0);

const handleSubmit = async () => {
  // 단계 구분이 없어졌으므로 return만 처리합니다.
  if (!site.value.siteName) { alert('현장명을 입력해주세요.'); return; }
  if (!site.value.siteType) { alert('현장 형태를 선택해주세요.'); return; }
  if (!site.value.postalCode) { alert('주소를 입력해주세요.'); return; }
  if (!site.value.building_su) { alert('건물 수를 입력해주세요.'); return; }
  if (!site.value.unit_su) { alert('세대 수를 입력해주세요.'); return; }
  if (!site.value.payment_day) { alert('급여지급일을 선택해주세요.'); return; }
  if (!site.value.director) { alert('관리 소장 이름을 입력해주세요.'); return; }
  if (!site.value.directorContact) { alert('관리 소장 연락처를 입력해주세요.'); return; }

  try {
    const finalContractGroups = contractGroups.value.map(group => {
      const calcFee = getTotalMonthlyFee(group);
      return {
        ...group,
        isAutoCalc: group.isAutoCalc === 'N' ? 'N' : 'Y',
        totalCost: Number(group.totalCost) > 0 ? Number(group.totalCost) : calcFee
      };
    });

    const contractsJson = JSON.stringify(finalContractGroups);
    const viewConfigJson = JSON.stringify({
      activePayLabels:       settlementConfig.value.activePayLabels,
      activeDeductionLabels: settlementConfig.value.activeDeductionLabels,
    });

    const params = {
      cIdx: authStore.user?.cIdx,
      sIdx: route.query.idx || '',
      sType: site.value.siteType,
      name: site.value.siteName,
      site_id: site.value.siteId,
      status: site.value.status,
      businessNumber: site.value.businessNumber,
      representative: site.value.representative,
      businessType: site.value.businessType,
      businessItem: site.value.businessItem,
      email: site.value.email,
      area: site.value.areaGross,
      areaOver: site.value.areaOver,
      areaUnder: site.value.areaUnder,
      is_vat: site.value.is_vat ? 'Y' : 'N',
      building_su: site.value.building_su,
      unit_su: site.value.unit_su,
      postalCode: site.value.postalCode,
      address: site.value.addressMain,
      addressDetail: site.value.addressDetail,
      payment_day: site.value.payment_day,
      manager: site.value.managerName,
      phone: site.value.managerContact,
      director: site.value.director,
      directorContact: site.value.directorContact,
      billingManager: site.value.billingManager,
      payrollManager: site.value.payrollManager,
      bigo: site.value.bigo,
      bankName: site.value.bankName,
      accountNumber: site.value.accountNumber,
      contract_details: contractsJson,
      viewConfig: viewConfigJson
    };

    const res = await axios.post(`/api/v1/site/register`, params);
    const savedSIdx = res.data.data || route.query.idx;
    if (!savedSIdx) throw new Error('sIdx를 찾을 수 없습니다.');

    if (selectedFiles.value.length > 0) {
      const formData = new FormData();
      // 루프를 돌며 동일한 'file' 키로 여러 개를 담거나, 백엔드 설정에 따라 'files[]' 사용
      selectedFiles.value.forEach(file => {
        formData.append('file', file);
      });

      await axios.post(`/api/v1/upload/file/${savedSIdx}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }

    alert(`${site.value.siteName} 현장 및 계약 정보가 등록되었습니다.`);
    router.push('/site/list');
  } catch (err) {
    console.error('등록 에러:', err);
    alert('저장 중 오류가 발생했습니다.');
  }
};

// 수정 모드일 때 기존 데이터 불러오기
const getSiteData = async () => {
  const sIdx = route.query.idx;
  if (!sIdx) return;

  axios.get(`/api/v1/site/data/${sIdx}`).then(res => {
    const result = res.data.data[0];
    if (!result) return;

    // 1. 현장 기본 정보 세팅
    site.value.siteName       = result.name;
    site.value.siteId         = result.site_id;
    site.value.siteType       = result.sType;
    site.value.status         = result.status === 'Y' ? '운영 중' : '계약 종료';
    site.value.areaGross      = result.area;
    site.value.areaOver       = result.areaOver;
    site.value.areaUnder      = result.areaUnder;
    site.value.is_vat         = result.is_vat;
    site.value.addressMain    = result.address;
    site.value.addressDetail  = result.address_detail;
    site.value.building_su    = result.building_su;
    site.value.unit_su        = result.unit_su;
    site.value.managerName    = result.manager;
    site.value.managerContact = result.phone;
    site.value.director       = result.director;
    site.value.directorContact= result.director_phone;
    site.value.payment_day    = result.payment_day;
    site.value.bankName       = result.bankName || '';
    site.value.accountNumber  = result.accountNumber || '';

    // 2. 계약 그룹 및 직책별 근로시간 세팅 (방어 코드 포함)
    if (result.contractList) {
      const contract = JSON.parse(result.contractList);
      contractGroups.value = contract.map(item => {
        // 직책 및 스케줄 먼저 빌드
        const staffListMapped = (item.staffList || []).map(staff => ({
          ...staff,
          schedule: staff.schedule || createDefaultSchedule(),
          showSchedule: false
        }));

        // 근로시간 데이터가 없는 구버전 마스터 대응용 방어 코드
        const costBreakdownData = item.costBreakdown || createDefaultCostBreakdown(staffListMapped);
        if (!costBreakdownData.dailyWorkHours) {
          costBreakdownData.dailyWorkHours = makeValuesObj(staffListMapped, '');
        }
        if (!costBreakdownData.monthlyWorkHours) {
          costBreakdownData.monthlyWorkHours = makeValuesObj(staffListMapped, '');
        }

        return {
          category: item.category,
          type: item.type,
          firstContractDt: item.firstContractDt || item.startDt,
          contractStart: item.startDt,
          contractEnd: item.endDt,
          totalCost: 0,
          workDays: item.workDays,
          workSchedule: item.workSchedule,
          breakTime: item.breaktime,
          staffList: staffListMapped,
          tempJobCode: '',
          tempCount: 1,
          costBreakdown: costBreakdownData, // 보완된 객체 주입
          showCostBreakdown: false,
        };
      });
    }

    // 3. 특이사항 히스토리 세팅
    if (result.bigoList) {
      try {
        bigoHistory.value = JSON.parse(result.bigoList);
        bigoHistory.value.sort((a, b) => new Date(b.regDt) - new Date(a.regDt));
      } catch { bigoHistory.value = []; }
    }

    // 4. 정산 세부 노출 설정 세팅
    // 4. 정산 세부 노출 설정 세팅
    if (result.viewConfig) {
      try {
        const parsed = typeof result.viewConfig === 'string'
            ? JSON.parse(result.viewConfig)
            : result.viewConfig;

        // 기존 한글 데이터(연차적립금 등)를 코드로 매핑해주는 방어 코드 추가
        const convertLabelToCode = (val) => {
          const found = wagesData.value.find(w => w.itemNm === val || w.itemCd === val);
          return found ? found.itemCd : val;
        };

        settlementConfig.value = {
          // 불러올 때 한글이면 코드로 변환하여 저장
          activePayLabels:       (parsed.activePayLabels ?? []).map(convertLabelToCode),
          activeDeductionLabels: (parsed.activeDeductionLabels ?? []).map(convertLabelToCode),
          meltOptions: {
            annualLeave: parsed.meltOptions?.annualLeave ?? false,
            severance:   parsed.meltOptions?.severance   ?? false,
            workersDay:  parsed.meltOptions?.workersDay  ?? false
          }
        };
      } catch(e) { console.error('viewConfig 파싱 에러:', e); }
    }

    site.value.bigo = '';
  });
};

const loadDaumPostcodeScript = () => new Promise((resolve) => {
  if (window.kakao && window.kakao.Postcode) { resolve(); return; }
  const script = document.createElement('script');
  script.src = '//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onload = resolve;
  document.head.appendChild(script);
});

const searchAddress = async () => {
  await loadDaumPostcodeScript();
  new window.kakao.Postcode({
    oncomplete: (data) => {
      let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
      if (data.userSelectedType === 'R') {
        let extra = '';
        if (data.bname && /[동|로|가]$/.test(data.bname)) extra += data.bname;
        if (data.buildingName && data.apartment === 'Y') extra += (extra ? ', ' : '') + data.buildingName;
        if (extra) addr += ` (${extra})`;
      }
      site.value.postalCode    = data.zonecode;
      site.value.addressMain   = addr;
      site.value.addressDetail = '';
      if (detailInput.value) detailInput.value.focus();
    }
  }).open();
};

const handleCancel = () => {
  if (confirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) router.push('/site/list');
};

onMounted(() => {
  fetchPositionOptions();
  fetchTypeOptions();
  fetchWageCode();
  fetchBankOption();
  getSiteData();
});
</script>

<template>
  <div class="site-register-page">

    <div class="page-header">
      <div class="header-left">
        <button @click="handleCancel" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title"><i class="mdi mdi-office-building-plus-outline"></i> 현장 등록</h1>
          <p class="page-subtitle">새로운 현장 정보를 등록합니다</p>
        </div>
      </div>
      <button @click="handleCancel" class="btn-cancel">
        <i class="mdi mdi-close"></i><span>취소</span>
      </button>
    </div>

    <form @submit.prevent="handleSubmit">
      <div class="form-container">

        <div class="form-section">
          <div class="section-main-header">
            <i class="mdi mdi-office-building-outline"></i>
            <h2>현장 기본 정보</h2>
          </div>

          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label required"><i class="mdi mdi-office-building-marker-outline"></i>현장명</label>
              <input type="text" v-model="site.siteName" required class="form-input" placeholder="예: LH 위례 6단지" />
            </div>
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-barcode"></i>현장 코드</label>
              <input type="text" v-model="site.siteId" class="form-input" placeholder="선택사항" />
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-tag-outline"></i>현장 형태</label>
              <select v-model="site.siteType" required class="form-select">
                <option value="">선택하세요</option>
                <option v-for="t in siteTypeOptions" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-flag-outline"></i>현장 상태</label>
              <div class="radio-group">
                <label v-for="s in statusOptions" :key="s" class="radio-label">
                  <input type="radio" v-model="site.status" :value="s" /><span>{{ s }}</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-domain"></i>연면적 (건축물 총면적)</label>
              <div style="position: relative;">
                <input type="number" v-model="site.areaGross" class="form-input text-right" placeholder="0" min="0" step="any" style="padding-right: 32px;" />
                <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-muted);">㎡</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-ruler-square"></i>135㎡ 이하 (면세 면적)</label>
              <div style="position: relative;">
                <input type="number" v-model="site.areaUnder" class="form-input text-right" placeholder="0" min="0" step="any" style="padding-right: 32px;" />
                <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-muted);">㎡</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-ruler-square"></i>135㎡ 초과 (과세 면적)</label>
              <div style="position: relative;">
                <input type="number" v-model="site.areaOver" class="form-input text-right" placeholder="0" min="0" step="any" style="padding-right: 32px;" />
                <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-muted);">㎡</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-calculator"></i>총 관리면적 (자동계산)</label>
              <div style="position: relative;">
                <input type="text" :value="totalArea" class="form-input text-right font-bold" readonly style="padding-right: 32px; background: var(--bg-hover); color: var(--primary); border-color: var(--primary);" />
                <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; font-weight: bold; color: var(--primary);">㎡</span>
              </div>
              <p style="margin: 6px 0 0; font-size: 11px; color: var(--text-muted); line-height: 1.4;">
                * 135㎡ 초과 면적 입력 시 <strong :style="{ color: isVatSite ? 'var(--primary)' : 'inherit' }">과세 사업장({{ isVatSite ? 'Y' : 'N' }})</strong>으로 자동 설정.
              </p>
            </div>

            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-domain"></i>건물 수</label>
              <input type="number" v-model="site.building_su" required class="form-input text-right" placeholder="0" />
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-home-group"></i>세대 수</label>
              <input type="number" v-model="site.unit_su" required class="form-input text-right" placeholder="0" />
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-calendar-clock-outline"></i>급여지급일</label>
              <select v-model="site.payment_day" required class="form-select">
                <option value="">선택</option>
                <option v-for="d in 31" :key="d" :value="d">{{ d }}일</option>
              </select>
            </div>
          </div>

          <div class="sub-header mt-4">
            <i class="mdi mdi-map-marker-outline"></i><h3>주소 정보</h3>
          </div>
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label required"><i class="mdi mdi-map-marker-radius-outline"></i>주소</label>
              <div class="address-search-group">
                <input type="text" v-model="site.postalCode" placeholder="우편번호" required class="form-input postal-input" readonly />
                <button type="button" @click="searchAddress" class="btn-search-address">
                  <i class="mdi mdi-magnify"></i>주소 검색
                </button>
              </div>
            </div>
            <div class="form-group full-width">
              <input type="text" v-model="site.addressMain" placeholder="기본 주소" required class="form-input" readonly />
            </div>
          </div>

          <div class="sub-header mt-4">
            <i class="mdi mdi-card-account-details-outline"></i><h3>사업자 정보</h3>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-identifier"></i>사업자등록번호</label>
              <input type="text" v-model="site.businessNumber" class="form-input" placeholder="예: 123-45-67890" />
            </div>
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-account-tie"></i>대표자명</label>
              <input type="text" v-model="site.representative" class="form-input" placeholder="대표자명 입력" />
            </div>
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-store-outline"></i>업태</label>
              <input type="text" v-model="site.businessType" class="form-input" placeholder="예: 서비스, 도매" />
            </div>
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-shape-outline"></i>종목</label>
              <input type="text" v-model="site.businessItem" class="form-input" placeholder="예: 건물(시설)관리, 경비" />
            </div>
            <div class="form-group full-width">
              <label class="form-label"><i class="mdi mdi-email-outline"></i>이메일(세금계산서/공문 수신용)</label>
              <input type="email" v-model="site.email" class="form-input" placeholder="예: example@email.com" />
            </div>
          </div>

          <div class="sub-header mt-4">
            <i class="mdi mdi-bank-outline"></i><h3>계좌 정보</h3>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-bank"></i>은행명
              </label>
              <select v-model="site.bankName" class="form-select">
                <option v-for="bank in bankOptions" :key="bank.itemNm" :value="bank.itemNm">
                  {{ bank.itemNm }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-numeric"></i>계좌번호
              </label>
              <input type="text" v-model="site.accountNumber" class="form-input" placeholder="예: 123-456-789012 (- 포함)" />
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="section-main-header">
            <i class="mdi mdi-file-document-outline"></i>
            <h2>계약 및 인원 정보</h2>
          </div>

          <div class="file-upload-section">
            <label class="section-label"><i class="mdi mdi-file-pdf-box"></i>계약서 원본 파일 업로드 (PDF)</label>

            <div class="file-upload-box">
              <input
                  type="file"
                  id="contract-file"
                  accept=".pdf"
                  multiple
                  @change="handleFileChange"
                  class="hidden-file-input"
              />
              <label for="contract-file" class="file-upload-label">
                <div class="upload-placeholder">
                  <i class="mdi mdi-cloud-upload-outline"></i>
                  <p>클릭하여 PDF 파일을 선택하거나 여기로 드래그하세요</p>
                  <span>(여러 개의 파일을 동시에 선택할 수 있습니다)</span>
                </div>
              </label>
            </div>

            <div v-if="selectedFiles.length > 0" class="file-list-container">
              <div v-for="(file, index) in selectedFiles" :key="index" class="file-item-card">
                <div class="file-info">
                  <i class="mdi mdi-file-pdf-box"></i>
                  <div class="file-name-group">
                    <span class="file-name">{{ file.name }}</span>
                    <span class="file-size">{{ (file.size / 1024).toFixed(1) }} KB</span>
                  </div>
                </div>
                <button type="button" @click="removeFile(index)" class="btn-remove-file">
                  <i class="mdi mdi-close"></i>
                </button>
              </div>
              <p class="file-success-msg">
                <i class="mdi mdi-check-circle"></i> 총 <strong>{{ selectedFiles.length }}개</strong>의 파일이 등록 대기 중입니다.
              </p>
            </div>
          </div>

          <div class="contract-header">
            <p class="contract-description">현장의 계약 정보를 추가합니다. 경비, 미화 등 구분별로 계약을 등록할 수 있습니다.</p>
            <div class="contract-actions">
              <button v-for="cat in typeOptions" :key="cat.itemCd" type="button"
                      @click="addContractGroup(cat)" class="btn-add-contract">
                <i class="mdi mdi-plus"></i>{{ cat.itemNm }} 추가
              </button>
            </div>
          </div>

          <div v-if="contractGroups.length === 0" class="empty-contracts">
            <i class="mdi mdi-file-document-multiple-outline"></i>
            <p>등록된 계약이 없습니다</p>
            <span>상단 버튼을 눌러 계약 정보를 추가해주세요</span>
          </div>

          <div v-for="(group, idx) in contractGroups" :key="idx" class="contract-card">
            <div class="contract-card-header">
              <div class="contract-title">
                <span :class="['contract-badge', `badge-${group.category}`]">
                  <i class="mdi mdi-briefcase-outline"></i>{{ group.category }}
                </span>
                <!--div class="contract-calc-switch-wrap">
                  <label class="switch-sm">
                    <input type="checkbox"
                           v-model="group.isAutoCalc"
                           true-value="Y"
                           false-value="N" />
                    <span class="slider-sm round"></span>
                  </label>
                  <span class="calc-label">{{ group.isAutoCalc ? '법정요율 자동계산' : '산출내역 금액고정' }}</span>
                </div-->

                <span v-if="getContractDuration(group)" class="contract-duration">
                  <i class="mdi mdi-calendar-range"></i>{{ getContractDuration(group) }}
                </span>
              </div>
              <button type="button" @click="removeContractGroup(idx)" class="btn-remove-contract">
                <i class="mdi mdi-trash-can-outline"></i>
              </button>
            </div>

            <div class="contract-card-body">
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label"><i class="mdi mdi-calendar-check-outline"></i>최초 계약일</label>
                  <input type="date" v-model="group.firstContractDt" class="form-input" max="9999-12-31" />
                </div>
                <div class="form-group">
                  <label class="form-label required"><i class="mdi mdi-calendar-start-outline"></i>계약 시작일</label>
                  <input type="date"
                         v-model="group.contractStart"
                         @change="syncFirstContractDate(group)"
                         required
                         class="form-input" max="9999-12-31" />
                </div>
                <div class="form-group">
                  <label class="form-label required"><i class="mdi mdi-calendar-end-outline"></i>계약 종료일</label>
                  <input type="date" v-model="group.contractEnd" required class="form-input" max="9999-12-31" />
                </div>
                <div class="form-group full-width">
                  <label class="form-label required"><i class="mdi mdi-clock-outline"></i>근무 시간 및 형태</label>
                  <textarea v-model="group.workSchedule" rows="2" class="form-textarea"
                            placeholder="예: 격일제 교대 근무 (09:00 ~ 익일 09:00)"></textarea>
                </div>
                <div class="form-group full-width">
                  <label class="form-label"><i class="mdi mdi-coffee-outline"></i>휴게 시간</label>
                  <input type="text" v-model="group.breakTime" class="form-input"
                         placeholder="예: 주간 2시간, 야간 4시간" />
                </div>
              </div>

              <div class="staff-section">
                <label class="section-label"><i class="mdi mdi-account-group-outline"></i>인원 구성</label>
                <div class="staff-input-group">
                  <select v-model="group.tempJobCode" class="form-select staff-position">
                    <option value="">직책 선택</option>
                    <option v-for="opt in positionOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
                  </select>
                  <input type="number" v-model="group.tempCount" min="1"
                         class="form-input staff-count text-right" placeholder="인원" />
                  <button type="button" @click="addStaffToGroup(idx)" class="btn-add-staff">
                    <i class="mdi mdi-plus"></i>추가
                  </button>
                </div>

                <div v-if="group.staffList && group.staffList.length > 0" class="staff-list">
                  <div v-for="(staff, sIdx) in group.staffList" :key="sIdx" class="staff-item-wrapper">

                    <div class="staff-item">
                      <div class="staff-info">
                        <i class="mdi mdi-account-outline"></i>
                        <span class="staff-position-name">{{ staff.name }}</span>
                        <span class="staff-count-badge">{{ staff.count }}명</span>
                      </div>
                      <div class="staff-actions">
                        <button type="button"
                                @click="staff.showSchedule = !staff.showSchedule"
                                class="btn-toggle-schedule"
                                :class="{ 'active': staff.showSchedule }">
                          <i class="mdi"
                             :class="staff.showSchedule
                               ? 'mdi-calendar-collapse-horizontal'
                               : 'mdi-calendar-expand-horizontal'"></i>
                          근무 설정
                        </button>
                        <button type="button" @click="removeStaffFromGroup(idx, sIdx)" class="btn-remove-staff">
                          <i class="mdi mdi-close"></i>
                        </button>
                      </div>
                    </div>

                    <div v-show="staff.showSchedule" class="schedule-panel">
                      <div class="schedule-header">
                        <span><i class="mdi mdi-clock-outline"></i> 요일별 근무시간 설정</span>
                        <button type="button" @click="applyToWeekdays(staff.schedule)" class="btn-batch-apply">
                          <i class="mdi mdi-layers-outline"></i> 평일(월~금) 일괄 적용
                        </button>
                      </div>
                      <div class="schedule-table-wrap">
                        <table class="schedule-table">
                          <thead>
                          <tr>
                            <th class="col-day">요일</th>
                            <th class="col-time">출근 ~ 퇴근</th>
                            <th class="col-break">휴게(분)</th>
                            <th class="col-opt">옵션</th>
                          </tr>
                          </thead>
                          <tbody>
                          <tr v-for="day in weekDays" :key="day.val"
                              :class="{'inactive-row': !staff.schedule[day.val].isActive}">
                            <td>
                              <label class="day-checkbox">
                                <input type="checkbox" v-model="staff.schedule[day.val].isActive" />
                                <span :class="{'text-red': day.val === 0, 'text-blue': day.val === 6}">{{ day.label }}</span>
                              </label>
                            </td>
                            <td>
                              <div v-if="staff.schedule[day.val].isActive" class="time-inputs">
                                <input type="time" v-model="staff.schedule[day.val].startTime"
                                       class="form-input time-input" />
                                <span>~</span>
                                <input type="time" v-model="staff.schedule[day.val].endTime"
                                       class="form-input time-input" />
                              </div>
                              <span v-else class="text-muted" style="font-size:12px;">휴무</span>
                            </td>
                            <td>
                              <input v-if="staff.schedule[day.val].isActive"
                                     type="number"
                                     step="any"
                                     v-model="staff.schedule[day.val].breakTime"
                                     class="form-input break-input"
                                     min="0" placeholder="0" />
                              <span v-else class="text-muted">-</span>
                            </td>
                            <td>
                              <label v-if="staff.schedule[day.val].isActive" class="biweekly-checkbox">
                                <input type="checkbox" v-model="staff.schedule[day.val].isBiweekly" />
                                <span>격주</span>
                              </label>
                              <span v-else class="text-muted">-</span>
                            </td>
                          </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div><div class="staff-total">
                  <i class="mdi mdi-sigma"></i>
                  <span>합계: <strong>{{ getGroupStaffTotal(group) }}명</strong></span>
                </div>
                </div>
              </div>

              <div class="cost-breakdown-wrapper">
                <button type="button" class="btn-toggle-cost"
                        @click="group.showCostBreakdown = !group.showCostBreakdown">
                  <i :class="group.showCostBreakdown ? 'mdi mdi-chevron-up' : 'mdi mdi-chevron-down'"></i>
                  <span>{{ group.showCostBreakdown ? '산출내역서 접기' : '산출내역서 펼치기' }}</span>
                  <span v-if="getTotalMonthlyFee(group) > 0" class="cost-preview-badge">
                    월 {{ formatCurrency(getTotalMonthlyFee(group)) }}원
                  </span>
                </button>

                <div v-show="group.showCostBreakdown" class="cost-breakdown-section">

                  <div v-if="group.staffList.length === 0" class="cost-no-staff">
                    <i class="mdi mdi-account-plus-outline"></i>
                    <p>먼저 인원 구성에서 직책을 추가하면<br>직책별 산출내역을 입력할 수 있습니다.</p>
                  </div>

                  <template v-else>
                    <div class="cost-scroll-area">
                      <div class="cost-section-title">
                        <span class="cost-block-label label-hours">
                          <i class="mdi mdi-clock-check"></i>
                          ️</span>근로시간 기준 <em>(인건비 산출 근거)</em>
                      </div>
                      <table class="cost-table hours-standalone-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal-head">행합계</th>
                          <th class="col-rowtotal">산출내역 / 근거</th>
                          <th class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr>
                          <td class="hours-label-cell">
                            <span class="summary-label">
                              <i class="mdi mdi-clock-outline text-primary"></i> 일 근로시간 (H)
                            </span>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                type="number"
                                step="any"
                                min="0"
                                v-model.number="group.costBreakdown.dailyWorkHours[staff.code]"
                                @focus="$event.target.select()"
                                class="tbl-value-input text-right hours-input"
                                placeholder="0"
                            />
                          </td>
                          <td class="col-rowtotal-cell hours-empty-cell">-</td>
                          <td>
                            <input
                                type="text"
                                class="tbl-value-input"
                                v-model="group.costBreakdown.dailyHoursBigo"
                                placeholder="예: 휴게 1시간 제외"
                            />
                          </td>
                          <td></td>
                        </tr>
                        <tr>
                          <td class="hours-label-cell">
                            <span class="summary-label">
                              <i class="mdi mdi-calendar-clock text-primary"></i> 월 근로시간 (H)
                            </span>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                type="number"
                                step="any"
                                min="0"
                                v-model.number="group.costBreakdown.monthlyWorkHours[staff.code]"
                                @focus="$event.target.select()"
                                class="tbl-value-input text-right hours-input"
                                placeholder="0"
                            />
                          </td>
                          <td class="col-rowtotal-cell hours-empty-cell">-</td>
                          <td><input type="text" class="tbl-value-input" v-model="group.costBreakdown.monthlyHoursBigo" placeholder="예: 주 40시간 + 주휴"></td>
                          <td></td>
                        </tr>
                        </tbody>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-direct">A</span>
                        직접노무비 <em>(지급내역)</em>
                        <button type="button" @click="addItem(group, 'directLabor')" class="btn-add-cost-item">
                          <i class="mdi mdi-plus"></i>항목 추가
                        </button>
                      </div>
                      <table class="cost-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal-head">행합계</th>
                          <th class="col-rowtotal">산출내역</th>
                          <th class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, iIdx) in group.costBreakdown.directLabor" :key="'dl-'+iIdx">
                          <td>
                            <CodeSelect
                                v-model="item.code"
                                @update:label="(val) => item.label = val"
                                :allow-empty="false"
                            />
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                type="text"
                                :value="formatCurrency(item.values[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputCost(item, staff.code, $event)"
                                class="tbl-value-input"
                            />
                          </td>
                          <td class="col-rowtotal-cell">{{ formatCurrency(getRowTotal(item, group.staffList)) }}</td>
                          <td><input type="text" class="tbl-value-input" v-model="item.bigo"></td>
                          <td class="col-action">
                            <button type="button" @click="removeItem(group, 'directLabor', iIdx)" class="btn-remove-cost">
                              <i class="mdi mdi-close"></i>
                            </button>
                          </td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (A)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            {{ formatCurrency(getDirectLaborColTotal(group, staff.code)) }}
                          </td>
                          <td class="col-rowtotal-cell subtotal-rowtotal">
                            {{ formatCurrency(getSubtotalRowTotal(group, getDirectLaborColTotal)) }}
                          </td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        </tfoot>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-indirect">B</span>
                        간접노무비 <em>(공제내역)</em>
                        <button type="button" @click="addItem(group, 'indirectLabor')" class="btn-add-cost-item">
                          <i class="mdi mdi-plus"></i>항목 추가
                        </button>
                      </div>
                      <table class="cost-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal-head">행합계</th>
                          <th class="col-rowtotal">산출내역</th>
                          <th class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, iIdx) in group.costBreakdown.indirectLabor" :key="'il-'+iIdx">
                          <td>
                            <CodeSelect
                                v-model="item.code"
                                @update:label="(val) => item.label = val"
                                :allow-empty="false"
                            />
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                type="text"
                                :value="formatCurrency(item.values[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputCost(item, staff.code, $event)"
                                class="tbl-value-input"
                            />
                          </td>
                          <td class="col-rowtotal-cell">{{ formatCurrency(getRowTotal(item, group.staffList)) }}</td>
                          <td><input type="text" class="tbl-value-input" v-model="item.bigo"></td>
                          <td class="col-action">
                            <button type="button" @click="removeItem(group, 'indirectLabor', iIdx)" class="btn-remove-cost">
                              <i class="mdi mdi-close"></i>
                            </button>
                          </td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (B)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            {{ formatCurrency(getIndirectLaborColTotal(group, staff.code)) }}
                          </td>
                          <td class="col-rowtotal-cell subtotal-rowtotal">
                            {{ formatCurrency(getSubtotalRowTotal(group, getIndirectLaborColTotal)) }}
                          </td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        </tfoot>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-expense">C</span>
                        제경비
                        <button type="button" @click="addItem(group, 'expenses')" class="btn-add-cost-item">
                          <i class="mdi mdi-plus"></i>항목 추가
                        </button>
                      </div>
                      <table class="cost-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal-head">행합계</th>
                          <th class="col-rowtotal">산출내역</th>
                          <th class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, eIdx) in group.costBreakdown.expenses" :key="'exp-'+eIdx">
                          <td>
                            <CodeSelect
                                v-model="item.code"
                                @update:label="(val) => item.label = val"
                                :allow-empty="false"
                            />
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                type="text"
                                :value="formatCurrency(item.values[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputCost(item, staff.code, $event)"
                                class="tbl-value-input"
                            />
                          </td>
                          <td class="col-rowtotal-cell">{{ formatCurrency(getRowTotal(item, group.staffList)) }}</td>
                          <td><input type="text" class="tbl-value-input" v-model="item.bigo"></td>
                          <td class="col-action">
                            <button type="button" @click="removeItem(group, 'expenses', eIdx)" class="btn-remove-cost">
                              <i class="mdi mdi-close"></i>
                            </button>
                          </td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (C)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            {{ formatCurrency(getExpensesColTotal(group, staff.code)) }}
                          </td>
                          <td class="col-rowtotal-cell subtotal-rowtotal">
                            {{ formatCurrency(getSubtotalRowTotal(group, getExpensesColTotal)) }}
                          </td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        </tfoot>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-total">합계</span>
                        노무비 합계 및 용역비 산출
                      </div>
                      <table class="cost-table summary-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal-head">행합계</th>
                          <th class="col-rowtotal">산출 내역</th>
                          <th class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr class="summary-row row-d">
                          <td><span class="summary-label"><span class="cost-block-label label-total">D</span>노무비 합계 (A+B+C)</span></td>
                          <td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val">{{ formatCurrency(getLaborColTotal(group, staff.code)) }}</span></td>
                          <td class="col-rowtotal-cell"><span class="summary-val bold">{{ formatCurrency(getLaborGrandTotal(group)) }}</span></td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        <tr class="summary-row row-e">
                          <td><div class="summary-label-rate"><span class="summary-label"><span class="cost-block-label label-mgmt">E</span>일반관리비</span></div></td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                type="text"
                                :value="formatCurrency(group.costBreakdown.managementFee[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputSingleCost(group.costBreakdown.managementFee, staff.code, $event)"
                                class="tbl-value-input"
                            />
                          </td>
                          <td class="col-rowtotal-cell"><span class="summary-val">{{ formatCurrency(getManagementFeeGrandTotal(group)) }}</span></td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        <tr class="summary-row row-f">
                          <td><div class="summary-label-rate"><span class="summary-label"><span class="cost-block-label label-profit">F</span>기업이윤</span></div></td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                type="text"
                                :value="formatCurrency(group.costBreakdown.managementFee[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputSingleCost(group.costBreakdown.managementFee, staff.code, $event)"
                                class="tbl-value-input"
                            />
                          </td>
                          <td class="col-rowtotal-cell"><span class="summary-val">{{ formatCurrency(getProfitGrandTotal(group)) }}</span></td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        <tr class="summary-row row-monthly">
                          <td><span class="summary-label"><span class="cost-block-label label-monthly">월</span>1인당 월 용역비 (D+E+F)</span></td>
                          <td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val highlight">{{ formatCurrency(getMonthlyTotalCol(group, staff.code)) }}</span></td>
                          <td class="col-rowtotal-cell">-</td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        <tr class="summary-row row-total-fee">
                          <td>
                            <span class="summary-label">
                              <span class="cost-block-label label-total-fee">합</span>
                              월간 용역비 총계
                            </span>
                          </td>
                          <td :colspan="group.staffList.length">
                            <input
                                type="text"
                                :value="formatCurrency(getDisplayMonthlyTotal(group))"
                                @focus="$event.target.select()"
                                @input="onInputMonthlyTotal(group, $event)"
                                class="tbl-value-input grand-total-input"
                                style="font-size: 15px; font-weight: 800; color: var(--primary);"
                            />
                          </td>

                          <td class="col-rowtotal-cell"></td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        <!--tr>
                          <td><span class="summary-label"><span class="cost-block-label label-total-fee">합</span>입찰 금액 <br>(계약기간 총 용역비)</span></td>
                          <td :colspan="group.staffList.length + 1">
                            <input v-model.number="group.totalCost" @focus="$event.target.select()"
                                   type="number" class="tbl-value-input" placeholder="0" min="0">
                          </td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr-->
                        </tbody>
                      </table>

                    </div><div class="cost-special-note">
                    <label class="form-label"><i class="mdi mdi-text-box-edit-outline"></i>특이사항</label>
                    <textarea v-model="group.costBreakdown.specialNote" class="form-textarea" rows="3"
                              placeholder="예: 최저임금 기준 적용, 5대보험 인원전원 가입 조건으로 산출 등"></textarea>
                  </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 정산 기본 설정 섹션 전체를 아래로 교체 -->
        <div class="form-section">
          <div class="section-main-header">
            <i class="mdi mdi-calculator-variant"></i>
            <h2>정산 기본 설정</h2>
          </div>

          <!-- ① 급여 데이터 기준 설정 -->
          <div class="settlement-sub-section">
            <div class="sub-header">
              <i class="mdi mdi-cash-sync"></i>
              <h3>급여 데이터 기준 설정</h3>
            </div>
            <p class="info-helper-text" style="margin-bottom: 20px;">
              * 각 계약 분류별로 정산서 데이터 불러오기 시 적용할 급여 정보의 출처를 선택해주세요.
            </p>

            <div v-if="contractGroups.length === 0"
                 class="settlement-empty-notice">
              <i class="mdi mdi-information-outline"></i>
              <span>등록된 계약 정보가 없습니다. [계약 및 인원 정보] 섹션에서 계약을 먼저 추가해주세요.</span>
            </div>

            <div v-else class="salary-source-list">
              <div v-for="(group, idx) in contractGroups"
                   :key="idx"
                   class="source-selection-row">
                <div class="source-group-title">
          <span :class="['contract-badge', `badge-${group.category}`]"
                style="padding: 6px 12px; font-size: 13px;">
            <i class="mdi mdi-briefcase-outline"></i>{{ group.category }}
          </span>
                </div>
                <div class="source-selection-options">
                  <label class="source-radio-label">
                    <input
                        type="radio"
                        v-model="group.salarySource"
                        value="employee"
                        :name="'salarySource_' + idx"
                    />
                    <strong>직원 급여 정보</strong>
                    <span class="text-hint">(저장된 기본 급여 기준)</span>
                  </label>
                  <label class="source-radio-label">
                    <input
                        type="radio"
                        v-model="group.salarySource"
                        value="contract"
                        :name="'salarySource_' + idx"
                    />
                    <strong>계약 산출 정보</strong>
                    <span class="text-hint">(계약 정보 산출 기준)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- 정산서 양식 관리 -->
          <div class="settlement-sub-section">
            <div class="sub-header">
              <i class="mdi mdi-table-arrow-down"></i>
              <h3>정산서 양식 관리</h3>
            </div>
            <p class="info-helper-text" style="margin-bottom: 20px;">
              * 정산 세부내역서 작성 시 포함할 항목을 직접 커스텀할 수 있습니다.<br>
              * <strong>[사용 가능 항목]</strong>에서 원하는 코드를 선택 후 <strong>[추가]</strong> 버튼을 눌러주세요.
            </p>

            <div class="excel-transfer-ui">
              <!-- 왼쪽: 사용 가능 항목 -->
              <div class="transfer-pane">
                <div class="pane-header">
                  <span>사용 가능 항목</span>
                  <span class="count">{{ filteredAvailable.length }}</span>
                </div>
                <div class="pane-search">
                  <i class="mdi mdi-magnify"></i>
                  <input
                      type="text"
                      v-model="searchAvailable"
                      placeholder="항목명 검색"
                      class="transfer-input"
                  />
                </div>
                <div class="pane-list">
                  <div
                      v-for="item in filteredAvailable"
                      :key="'avail-' + item.cd"
                      class="list-item"
                      :class="{ active: selectedAvailItems.includes(item.cd) }"
                      @click="toggleAvail(item)"
                  >
                    {{ item.nm }}
                  </div>
                  <div v-if="filteredAvailable.length === 0" class="empty-list">
                    항목이 없습니다
                  </div>
                </div>
              </div>

              <!-- 중앙: 이동 버튼 -->
              <div class="transfer-actions">
                <button
                    type="button"
                    class="btn-transfer"
                    @click="moveToRight"
                    :disabled="!selectedAvailItems.length"
                >
                  추가 <i class="mdi mdi-chevron-right"></i>
                </button>
                <button
                    type="button"
                    class="btn-transfer btn-transfer-remove"
                    @click="moveToLeft"
                    :disabled="!selectedRightItems.length"
                >
                  <i class="mdi mdi-chevron-left"></i> 제외
                </button>
              </div>

              <!-- 오른쪽: 정산서 표시 항목 -->
              <div class="transfer-pane">
                <div class="pane-header">
                  <span>정산서 표시 항목</span>
                  <span class="count">{{ filteredSelected.length }}</span>
                </div>
                <div class="pane-search">
                  <i class="mdi mdi-magnify"></i>
                  <input
                      type="text"
                      v-model="searchSelected"
                      placeholder="항목명 검색"
                      class="transfer-input"
                  />
                </div>
                <div class="pane-list">
                  <div
                      v-for="item in filteredSelected"
                      :key="'sel-' + item.cd"
                      class="list-item"
                      :class="{ active: selectedRightItems.includes(item.cd) }"
                      @click="toggleRight(item)"
                  >
            <span
                class="item-badge"
                :class="isPayItem(item.cd) ? 'badge-pay' : 'badge-ded'"
            >
              {{ isPayItem(item.cd) ? '지급' : '공제' }}
            </span>
                    {{ item.nm }}
                  </div>
                  <div v-if="filteredSelected.length === 0" class="empty-list">
                    선택된 항목이 없습니다
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="section-main-header">
            <i class="mdi mdi-account-tie-outline"></i>
            <h2>담당자 및 기타 정보</h2>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-account-outline"></i>본사 담당자 이름</label>
              <input type="text" v-model="site.managerName" class="form-input" placeholder="홍길동" />
            </div>
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-phone-outline"></i>본사 담당자 연락처</label>
              <input type="tel" v-model="site.managerContact" class="form-input" placeholder="010-0000-0000" />
            </div>
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-hard-hat-outline"></i>관리 소장 이름
              </label>
              <input type="text" v-model="site.director" required class="form-input" placeholder="김관리" />
            </div>
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-phone-outline"></i>관리 소장 연락처
              </label>
              <input type="text" v-model="site.directorContact" required class="form-input" placeholder="010-0000-0000" />
            </div>
            <div class="form-group" style="grid-column: 1;">
              <label class="form-label required">
                <i class="mdi mdi-account-cash"></i>청구 담당자
              </label>
              <input type="text" v-model="site.billingManager" required class="form-input" placeholder="김청구"/>
            </div>
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-cash"></i>급여 담당자
              </label>
              <input type="text" v-model="site.payrollManager" required class="form-input" placeholder="김급여"/>
            </div>
            <div class="form-group full-width">
              <label class="section-label"><i class="mdi mdi-note-text-outline"></i>특이사항 및 메모</label>
              <div v-if="bigoHistory.length > 0" class="memo-history">
                <div class="history-header"><i class="mdi mdi-history"></i><span>히스토리 ({{ bigoHistory.length }}건)</span></div>
                <div class="history-list">
                  <div v-for="(item, i) in bigoHistory" :key="i" class="history-item">
                    <span class="history-date">{{ item.regDt ? item.regDt.substring(0,10) : '-' }}</span>
                    <p class="history-content">{{ item.bigo }}</p>
                  </div>
                </div>
              </div>
              <textarea v-model="site.bigo" class="form-textarea" rows="4" placeholder="추가할 특이사항을 입력하세요"></textarea>
            </div>
          </div>

          <div class="form-actions final-actions">
            <button type="button" @click="handleCancel" class="btn-prev"><i class="mdi mdi-close"></i>취소</button>
            <button type="submit" class="btn-submit"><i class="mdi mdi-check"></i>등록 완료</button>
          </div>
        </div>

      </div>
    </form>
  </div>
</template>

<style scoped>
/* =========================================
   기본 레이아웃
========================================= */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.header-left { display: flex; align-items: flex-start; gap: 16px; }
.page-title { font-size: 22px; font-weight: 700; color: var(--text-main); margin: 0 0 4px 0; display: flex; align-items: center; gap: 8px; }
.page-subtitle { font-size: 13px; color: var(--text-sub); margin: 0; }

.btn-back { width: 42px; height: 42px; border-radius: 10px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; padding: 0; }
.btn-back:hover { background: var(--bg-hover); border-color: var(--border-focus); color: var(--text-main); }
.btn-back i { font-size: 20px; }
.btn-cancel { display: flex; align-items: center; gap: 6px; padding: 10px 18px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-sub); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); border-color: var(--border-focus); }

/* 폼 공통 */
.form-container { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); overflow: hidden; }

/* 통합 페이지 섹션 스타일 */
.form-section { padding: 32px; }
.section-main-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid var(--border-color); }
.section-main-header i { font-size: 24px; color: var(--primary); }
.section-main-header h2 { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0; }
.section-divider { border: none; border-top: 8px solid var(--bg-canvas); margin: 0; }
.sub-header { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; margin-bottom: 20px; border-bottom: 1px dashed var(--border-color); }
.sub-header i { font-size: 20px; color: var(--primary); }
.sub-header h3 { font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0; }
.mt-4 { margin-top: 32px; }

.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 32px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group.full-width { grid-column: 1 / -1; }
.form-label, .section-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.form-label i, .section-label i { font-size: 16px; color: var(--primary); }
.form-label.required::after { content: '*'; color: var(--danger); margin-left: 2px; }
.form-input, .form-select, .form-textarea { padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); transition: all 0.2s; background: var(--bg-surface); box-sizing: border-box; }
.form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.form-input::placeholder, .form-textarea::placeholder { color: var(--text-muted); }
.form-textarea { resize: vertical; min-height: 80px; }

.radio-group { display: flex; gap: 12px; flex-wrap: wrap; padding: 4px 0; }
.radio-label { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border-color); transition: all 0.2s; background: var(--bg-canvas); font-size: 13px; color: var(--text-sub); }
.radio-label:hover { border-color: var(--border-focus); color: var(--text-main); }
.radio-label input[type="radio"] { display: none; }
.radio-label:has(input:checked) { border-color: var(--primary); background-color: var(--primary-soft); color: var(--primary); font-weight: 600; }

.address-search-group { display: flex; gap: 10px; }
.postal-input { width: 140px; background-color: var(--bg-canvas); }
.btn-search-address { display: flex; align-items: center; gap: 6px; padding: 10px 16px; background-color: var(--primary); border: none; border-radius: 8px; color: var(--text-inverse); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
.btn-search-address:hover { background-color: var(--primary-hover); transform: translateY(-1px); }

/* 파일 업로드 */
.file-upload-section { margin-bottom: 32px; }
.hidden-file-input { display: none; }
.file-upload-box { border: 2px dashed var(--border-focus); border-radius: 12px; background-color: var(--bg-canvas); transition: all 0.2s ease; overflow: hidden; }
.file-upload-box:hover { border-color: var(--primary); background-color: var(--primary-soft); }
.file-upload-box.has-file { border-style: solid; border-color: var(--success); background-color: rgba(16,185,129,0.05); }
.file-upload-label { display: block; width: 100%; padding: 40px 20px; cursor: pointer; text-align: center; }
.upload-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.upload-placeholder i { font-size: 44px; color: var(--text-muted); margin-bottom: 4px; transition: color 0.2s; }
.file-upload-box:hover .upload-placeholder i { color: var(--primary); }
.upload-placeholder p { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-main); }
.upload-placeholder span { font-size: 13px; color: var(--text-sub); }
.upload-selected { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.selected-file-info { display: inline-flex; align-items: center; gap: 10px; background: var(--bg-surface); padding: 12px 20px; border-radius: 8px; box-shadow: var(--shadow-sm); border: 1px solid var(--success); }
.selected-file-info i { font-size: 24px; color: var(--danger); }
.file-name { font-size: 14px; font-weight: 600; color: var(--text-main); }
.file-change-text { font-size: 13px; color: var(--success); font-weight: 600; text-decoration: underline; }
.file-success-msg { margin: 12px 0 0 0; font-size: 13px; color: var(--success); font-weight: 600; display: flex; align-items: center; gap: 6px; }

/* 계약 */
.contract-header { margin-bottom: 20px; }
.contract-description { font-size: 13px; color: var(--text-sub); margin: 0 0 16px 0; }
.contract-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-add-contract { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--bg-surface); border: 1px dashed var(--border-focus); border-radius: 6px; color: var(--text-sub); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-add-contract:hover { background: var(--bg-hover); border-color: var(--primary); color: var(--primary); }
.empty-contracts { text-align: center; padding: 50px 20px; background: var(--bg-canvas); border-radius: 10px; border: 1px dashed var(--border-color); color: var(--text-sub); margin-bottom: 20px; }
.empty-contracts i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: var(--text-muted); }
.empty-contracts p { font-size: 15px; font-weight: 600; color: var(--text-main); margin: 0 0 6px 0; }

.contract-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
.contract-card-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: var(--bg-canvas); border-bottom: 1px solid var(--border-color); }
.contract-title { display: flex; align-items: center; gap: 12px; }
.contract-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-inverse); }
.badge-경비 { background-color: #3b82f6; }
.badge-미화 { background-color: #ec4899; }
.badge-시설 { background-color: #10b981; }
.contract-duration { font-size: 12px; color: var(--text-sub); display: flex; align-items: center; gap: 4px; font-weight: 500; }
.btn-remove-contract { width: 28px; height: 28px; border-radius: 6px; background: rgba(239,68,68,0.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
.btn-remove-contract:hover { background: rgba(239,68,68,0.2); }
.contract-card-body { padding: 24px; }

/* 인원 */
.staff-section { margin-top: 24px; padding: 20px; background: var(--bg-canvas); border-radius: 10px; border: 1px dashed var(--border-color); }
.staff-input-group { display: flex; gap: 10px; margin: 16px 0; align-items: center; }
.staff-position { flex: 1; }
.staff-count { width: 90px; }
.btn-add-staff { display: flex; align-items: center; gap: 6px; padding: 10px 16px; background-color: var(--success); border: none; border-radius: 8px; color: var(--text-inverse); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: 0.2s; }
.btn-add-staff:hover { background-color: var(--success-hover); }
.staff-list { display: flex; flex-direction: column; gap: 8px; }
.staff-total { margin-top: 12px; padding: 10px 14px; background-color: var(--primary-soft); border-radius: 8px; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--primary); font-weight: 600; }

/* =========================================
   ★ 직책별 스케줄 패널 (상세 페이지와 동일)
========================================= */
.staff-item-wrapper { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-surface); overflow: hidden; }
.staff-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; }
.staff-info { display: flex; align-items: center; gap: 10px; flex: 1; }
.staff-info i { font-size: 18px; color: var(--primary); }
.staff-position-name { font-size: 13px; color: var(--text-main); font-weight: 500; }
.staff-count-badge { padding: 3px 8px; background-color: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 600; }
.staff-actions { display: flex; align-items: center; gap: 8px; }
.btn-toggle-schedule { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--bg-canvas); border: 1px solid var(--border-focus); border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: 0.2s; }
.btn-toggle-schedule.active { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.btn-toggle-schedule:hover { background: var(--bg-hover); }
.btn-remove-staff { width: 24px; height: 24px; border-radius: 6px; background: rgba(239,68,68,0.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
.btn-remove-staff:hover { background: rgba(239,68,68,0.2); }

.schedule-panel { border-top: 1px solid var(--border-focus); background: var(--bg-canvas); }
.schedule-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-surface); border-bottom: 1px solid var(--border-focus); }
.schedule-header span { font-size: 13px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px; }
.btn-batch-apply { padding: 4px 10px; background: var(--primary); color: #fff; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.btn-batch-apply:hover { background: var(--primary-hover); }

.schedule-table-wrap { overflow-x: auto; }
.schedule-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: center; min-width: 400px; }
.schedule-table th { padding: 8px; background: var(--bg-hover); color: var(--text-sub); font-weight: 600; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.schedule-table td { padding: 8px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
.schedule-table tbody tr:last-child td { border-bottom: none; }
.inactive-row td { background-color: var(--bg-hover); opacity: 0.6; }

.col-day { width: 60px; }
.col-time { width: auto; }
.col-break { width: 80px; }
.col-opt { width: 70px; }

.day-checkbox { display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 700; cursor: pointer; }
.text-red { color: var(--danger); }
.text-blue { color: #3b82f6; }
.text-muted { color: var(--text-muted); }

.time-inputs { display: flex; align-items: center; justify-content: center; gap: 6px; }
.time-input { padding: 4px 6px; font-size: 12px; width: 120px; text-align: center; }
.break-input { padding: 4px; font-size: 12px; width: 60px; text-align: right; margin: 0 auto; }
.biweekly-checkbox { display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; font-size: 12px; }

/* =========================================
   산출내역서 토글
========================================= */
.cost-breakdown-wrapper { margin-top: 24px; }
.btn-toggle-cost { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 18px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--text-main); cursor: pointer; transition: all 0.2s; text-align: left; }
.btn-toggle-cost:hover { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.btn-toggle-cost span:nth-child(2) { flex: 1; }
.cost-preview-badge { padding: 3px 10px; background: var(--primary); color: var(--text-inverse); border-radius: 20px; font-size: 12px; font-weight: 700; }

/* 산출내역서 본체 */
.cost-breakdown-section { margin-top: 8px; border: 1px solid var(--border-focus); border-radius: 10px; overflow: hidden; }
.cost-no-staff { padding: 40px 20px; text-align: center; color: var(--text-sub); }
.cost-no-staff i { font-size: 40px; margin-bottom: 12px; opacity: 0.5; display: block; }
.cost-no-staff p { font-size: 13px; line-height: 1.7; margin: 0; }

.cost-section-title { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-canvas); border-top: 1px solid var(--border-color); font-size: 13px; font-weight: 700; color: var(--text-main); }
.cost-section-title:first-child { border-top: none; }
.cost-section-title em { font-style: normal; font-weight: 400; font-size: 12px; color: var(--text-sub); margin-left: 2px; }

.btn-add-cost-item { display: flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 11px; font-weight: 600; background: var(--bg-surface); border: 1px dashed var(--primary); border-radius: 6px; color: var(--primary); cursor: pointer; transition: 0.2s; margin-left: auto; white-space: nowrap; }
.btn-add-cost-item:hover { background: var(--primary-soft); }
.btn-add-cost-item i { font-size: 14px; }

.cost-block-label { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 5px; font-size: 11px; font-weight: 800; color: var(--text-inverse); flex-shrink: 0; }
.label-hours { background: #6b7280;}
.label-direct    { background-color: #3b82f6; }
.label-indirect  { background-color: #8b5cf6; }
.label-expense   { background-color: #f59e0b; }
.label-total     { background-color: #10b981; }
.label-mgmt      { background-color: #6b7280; }
.label-profit    { background-color: #ec4899; }
.label-monthly   { background-color: #0ea5e9; }
.label-total-fee { background-color: #f97316; }

.cost-scroll-area { overflow-x: auto; }
.cost-table { width: 100%; border-collapse: collapse; font-size: 12px; color: var(--text-main); table-layout: fixed; }
.cost-table thead tr { background: var(--bg-canvas); }
.cost-table th, .cost-table td { padding: 8px 10px; border: 1px solid var(--border-color); vertical-align: middle; }
.cost-table th { font-size: 11px; font-weight: 700; color: var(--text-sub); text-align: center; white-space: nowrap; }
.cost-table tbody tr:hover { background: var(--bg-hover); }
.col-label    { min-width: 140px; width: 160px; }
.col-staff    { min-width: 130px; text-align: center; }
.col-rowtotal-head { min-width: 120px; text-align: right; }
.col-rowtotal { min-width: 120px; text-align: right; font-weight: 600; background: rgba(99,102,241,0.04); }
.col-action   { width: 36px; text-align: center; }
.col-rowtotal-cell { text-align: right; font-weight: bold; background: rgba(99,102,241,0.04); }
.staff-th-name  { display: block; font-size: 12px; font-weight: 700; color: var(--text-main); }
.staff-th-count { display: block; font-size: 11px; color: var(--text-sub); font-weight: 400; }
.tbl-value-input { width: 100%; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 5px; font-size: 12px; color: var(--text-main); background: var(--bg-surface); text-align: right; box-sizing: border-box; }
.tbl-value-input:focus { outline: none; border-color: var(--primary); }
.btn-remove-cost { width: 24px; height: 24px; border-radius: 4px; background: rgba(239,68,68,0.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
.btn-remove-cost:hover { background: rgba(239,68,68,0.25); }
.btn-remove-cost i { font-size: 13px; }
.tfoot-subtotal td { background: var(--bg-canvas); font-size: 12px; font-weight: 700; color: var(--text-main); text-align: right; border-top: 2px solid var(--border-focus); }
.tfoot-subtotal td:first-child { text-align: left; }
.subtotal-rowtotal { background: rgba(99,102,241,0.10) !important; font-size: 13px; }

.summary-table tbody tr td { background: var(--bg-surface); }
.summary-row td { padding: 10px; }
.summary-label { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; white-space: nowrap; }
.summary-label-rate { display: flex; flex-direction: column; gap: 5px; }
.summary-val { display: block; text-align: right; font-size: 12px; font-weight: 600; color: var(--text-main); white-space: nowrap; }
.summary-val.bold { font-weight: 800; font-size: 13px; }
.summary-val.highlight { color: var(--primary); font-weight: 700; }
.summary-val.grand-total { font-size: 15px; font-weight: 800; color: var(--primary); text-align: right; }
.row-d td        { background: rgba(16,185,129,0.04) !important; }
.row-e td        { background: rgba(107,114,128,0.04) !important; }
.row-f td        { background: rgba(236,72,153,0.04) !important; }
.row-monthly td  { background: rgba(14,165,233,0.06) !important; }
.row-total-fee td{ background: var(--primary-soft) !important; }

.cost-special-note { padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border-color); }

/* 비고 히스토리 */
.memo-history { margin-bottom: 12px; background: var(--bg-canvas); border-radius: 8px; border: 1px solid var(--border-color); padding: 16px; }
.history-header { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-main); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed var(--border-focus); }
.history-list { display: flex; flex-direction: column; gap: 12px; max-height: 150px; overflow-y: auto; }
.history-item { display: flex; flex-direction: column; gap: 4px; }
.history-date { font-size: 11px; color: var(--text-sub); }
.history-content { font-size: 13px; color: var(--text-main); margin: 0; line-height: 1.5; background: var(--bg-surface); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); }

/* 폼 액션 */
.final-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 24px; border-top: 1px solid var(--border-color); margin-top: 32px; }
.btn-prev, .btn-submit { display: flex; align-items: center; gap: 6px; padding: 10px 20px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-prev { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-prev:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-submit { background-color: var(--success); color: var(--text-inverse); box-shadow: var(--shadow-sm); }
.btn-submit:hover { background-color: var(--success-hover); transform: translateY(-1px); }

/* =========================================
   정산 설정 전용 스타일
========================================= */
.info-helper-text { font-size: 12px; color: var(--text-sub); line-height: 1.5; }
.text-orange { color: #b45309; }
.text-blue   { color: #2563eb; }

.config-toggle-wrapper { display: flex; gap: 24px; flex-wrap: wrap; }
.config-toggle-item { display: flex; align-items: center; gap: 12px; padding: 14px 20px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 10px; cursor: pointer; transition: all 0.2s; }

.switch { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; }
.slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .3s; }
.slider.round { border-radius: 20px; }
.slider.round:before { border-radius: 50%; }
input:checked + .slider { background-color: #dc2626; }
input:checked + .slider:before { transform: translateX(18px); }

/* 항목 없을 때 안내 */
.settlement-empty-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 20px 24px;
  background: var(--bg-canvas);
  border: 1px dashed var(--border-focus);
  border-radius: 10px;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.6;
}
.settlement-empty-notice i { font-size: 20px; color: var(--primary); flex-shrink: 0; margin-top: 2px; }

.deduction-toggles-grid { display: flex; flex-direction: column; gap: 16px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 10px; padding: 20px; }
.grid-group-label { display: flex; align-items: center; font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 4px; }
.config-checkbox-group { display: flex; gap: 12px; flex-wrap: wrap; }
.config-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; color: var(--text-main); padding: 6px 12px; background: var(--bg-surface); border-radius: 6px; border: 1px solid var(--border-focus); transition: 0.2s; }
.config-checkbox:hover { border-color: var(--primary); background: var(--primary-soft); }
.config-checkbox input[type="checkbox"] { accent-color: var(--primary); width: 15px; height: 15px; cursor: pointer; margin: 0; }
.grid-divider { height: 1px; background: var(--border-color); margin: 4px 0; }

.contract-calc-switch-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid var(--border-color);
}

.calc-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub);
}

/* 작은 스위치 디자인 */
.switch-sm { position: relative; display: inline-block; width: 32px; height: 18px; }
.switch-sm input { opacity: 0; width: 0; height: 0; }
.slider-sm { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; border-radius: 20px; }
.slider-sm:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
input:checked + .slider-sm { background-color: var(--primary); }
input:checked + .slider-sm:before { transform: translateX(14px); }

/* =========================================
   반응형
========================================= */
@media (max-width: 1024px) { .steps-list { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) {
  .steps-list { grid-template-columns: 1fr; gap: 8px; }
  .form-section { padding: 16px; }
  .form-grid { grid-template-columns: 1fr; }
  .address-search-group { flex-direction: column; }
  .postal-input { width: 100%; }
  .btn-search-address { width: 100%; justify-content: center; }
  .contract-actions { flex-direction: column; }
  .btn-add-contract { width: 100%; justify-content: center; }
  .final-actions { flex-direction: column; }
  .btn-prev, .btn-submit { width: 100%; justify-content: center; }
  .config-toggle-wrapper { flex-direction: column; }
  .schedule-table-wrap { overflow-x: auto; }
}

/* =============================================
   정산 기본 설정 — 서브 섹션 구분
============================================= */
.settlement-sub-section {
  margin-bottom: 36px;
  padding-bottom: 36px;
  border-bottom: 1px dashed var(--border-color);
}
.settlement-sub-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

/* =============================================
   급여 데이터 기준 설정
============================================= */
.salary-source-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-selection-row {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  background: var(--bg-canvas);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  transition: all 0.2s;
}

.source-selection-row:hover {
  border-color: var(--border-focus);
  background: var(--bg-hover);
}

.source-group-title {
  width: 130px;
  flex-shrink: 0;
}

.source-selection-options {
  display: flex;
  align-items: center;
  gap: 32px;
  flex: 1;
}

.source-radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-sub);
  cursor: pointer;
}

.source-radio-label strong {
  font-weight: 700;
  color: var(--text-main);
  font-size: 14px;
}

.text-hint {
  color: var(--text-muted);
  font-size: 12px;
}

.source-radio-label input[type="radio"] {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-focus);
  border-radius: 50%;
  margin: 0;
  outline: none;
  cursor: pointer;
  position: relative;
  background-color: var(--bg-surface);
  transition: all 0.2s;
  flex-shrink: 0;
}

.source-radio-label input[type="radio"]:checked {
  border-color: var(--primary);
}

.source-radio-label input[type="radio"]:checked::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background-color: var(--primary);
}

/* =============================================
   정산서 양식 관리 — Dual Listbox
============================================= */
.excel-transfer-ui {
  display: flex;
  gap: 16px;
  align-items: center;
  background: var(--bg-canvas);
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  padding: 24px 20px;
}

.transfer-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-focus);
  border-radius: 8px;
  background: var(--bg-surface);
  height: 380px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.pane-header .count {
  background: var(--primary-soft);
  color: var(--primary);
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}

.pane-search {
  position: relative;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.pane-search i {
  position: absolute;
  left: 26px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 16px;
}

.transfer-input {
  width: 100%;
  padding: 10px 12px 10px 36px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
  outline: none;
  background: var(--bg-canvas);
  transition: all 0.2s;
}

.transfer-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
  background: var(--bg-surface);
}

.pane-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-main);
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
}

.list-item:hover { background: var(--bg-hover); }

.list-item.active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
}

.item-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 700;
  flex-shrink: 0;
}

.badge-pay { background: rgba(59,130,246,0.1); color: #3b82f6; }
.badge-ded { background: rgba(139,92,246,0.1); color: #8b5cf6; }

.empty-list {
  padding: 40px 10px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

.transfer-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.btn-transfer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 90px;
  padding: 12px 0;
  background: var(--primary);
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 10px rgba(99,102,241,0.2);
}

.btn-transfer:hover:not(:disabled) {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.btn-transfer-remove {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  box-shadow: var(--shadow-sm);
}

.btn-transfer-remove:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--danger);
  border-color: var(--border-focus);
}

.btn-transfer:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

/* 모바일 반응형 */
@media (max-width: 768px) {
  .excel-transfer-ui {
    flex-direction: column;
  }
  .transfer-pane {
    width: 100%;
    height: 280px;
  }
  .transfer-actions {
    flex-direction: row;
    width: 100%;
    justify-content: center;
  }
  .btn-transfer {
    width: 140px;
  }
  .source-selection-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  .source-selection-options {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }
  .text-hint { display: none; }
}
</style>
