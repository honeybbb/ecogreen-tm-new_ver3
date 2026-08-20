<script setup>
import { ref, computed, onMounted, watch, onActivated } from 'vue';
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

// 숫자 콤마 포맷용 헬퍼 함수
const formatCurrency = (val) => {
  if (!val || isNaN(val)) return '0';
  return Number(val).toLocaleString();
};

// =============================================
// [수정] 퀵 네비게이션(스크롤 이동) 로직 - content-area 기준
// =============================================
const activeSection = ref('sec-basic');
const navItems = [
  { id: 'sec-basic', title: '기본 정보', icon: 'mdi-office-building-outline' },
  { id: 'sec-biz', title: '주소 및 사업자', icon: 'mdi-card-account-details-outline' },
  { id: 'sec-contract', title: '계약 및 인원', icon: 'mdi-file-document-outline' },
  { id: 'sec-cleaning', title: '특수과업 (대청소)', icon: 'mdi-spray-bottle' },
  { id: 'sec-settle', title: '정산 및 출력', icon: 'mdi-calculator-variant' },
  { id: 'sec-manager', title: '담당자 정보', icon: 'mdi-account-tie-outline' },
  { id: 'sec-memo', title: '특이사항 및 메모', icon: 'mdi-text-box-edit-outline' },
];

const scrollToSection = (id) => {
  activeSection.value = id;
  const el = document.getElementById(id);
  const container = document.querySelector('.content-area'); // 전체 창이 아닌 콘텐츠 영역 지정

  if (el && container) {
    // 컨테이너 내부의 스크롤 위치 계산 (상단 여백 24px 보정)
    const topPos = el.offsetTop - 24;
    container.scrollTo({ top: topPos, behavior: 'smooth' });
  }
};
// =============================================

const DEFAULT_DIRECT_LABOR_COMMON = [
  { code: '04001001001', label: '기본급' },
  { code: '04001002001', label: '직책수당' },
  { code: '04001003', label: '연차적립금' },
  { code: '04001004', label: '퇴직적립금' },
];

const DEFAULT_DIRECT_LABOR_GUARD = [
  { code: '04001001001', label: '기본급' },
  { code: '04001002001', label: '직책수당' },
  { code: '04001002003', label: '야간수당' },
  { code: '04001003', label: '연차적립금' },
  { code: '04001004', label: '퇴직적립금' },
];

const DEFAULT_INDIRECT_LABOR = [
  { code: '04002001001', label: '건강보험' },
  { code: '04002001002', label: '장기요양보험' },
  { code: '04002001003', label: '국민연금' },
  { code: '04002001004', label: '고용보험' },
  { code: '04002001008', label: '산재보험' },
];

const getInitSiteData = () => ({
  siteName: '',
  siteId: '',
  siteType: '',
  businessNumber: '',
  businessName: '',
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
  billing_day: '31',
  bigo: '',
  settlementBigo: '',
  bankName: '',
  accountNumber: '',
  accountName: '',
});

const site = ref(getInitSiteData());

const accountList = ref([]);
const contractGroups = ref([]);
const siteTypeOptions = ref(['아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const statusOptions  = ref(['운영 중', '계약 종료']);
const bigoHistory    = ref([]);
const settlementHistory = ref([]);
const detailInput    = ref(null);

const searchAvailable = ref('');
const searchSelected  = ref('');
const selectedAvailItems = ref([]);
const selectedRightItems = ref([]);

const cleaningTaskOptions = ref([]);

const addCleaningTaskToGroup = (groupIndex) => {
  const group = contractGroups.value[groupIndex];
  if (!group.tempCleaningCode) { alert('항목을 선택해주세요.'); return; }
  if (group.tempCleaningCount < 1) { alert('1회 이상 입력해주세요.'); return; }

  const taskInfo = cleaningTaskOptions.value.find(p => p.itemCd === group.tempCleaningCode);
  const existing = group.cleaningTasks.find(t => t.code === taskInfo.itemCd);

  if (existing) {
    existing.count += Number(group.tempCleaningCount);
  } else {
    group.cleaningTasks.push({
      code: taskInfo.itemCd,
      name: taskInfo.itemNm,
      count: Number(group.tempCleaningCount)
    });
  }
  group.tempCleaningCode = '';
  group.tempCleaningCount = 1;
};

const removeCleaningTaskFromGroup = (groupIndex, taskIndex) => {
  contractGroups.value[groupIndex].cleaningTasks.splice(taskIndex, 1);
};

const updateCleaningCount = (task, delta) => {
  const newVal = (Number(task.count) || 0) + delta;
  if (newVal < 1) {
    alert('최소 1회 이상이어야 합니다.');
    return;
  }
  task.count = newVal;
};

const allAvailableItems = computed(() => {
  const map = new Map();

  dynamicSettlementItems.value.payItems.forEach(code => {
    const found = wagesData.value.find(w => w.itemCd === code);
    if (found) map.set(found.itemCd, found.itemNm);
    else map.set(code, code);
  });
  dynamicSettlementItems.value.deductionItems.forEach(code => {
    const found = wagesData.value.find(w => w.itemCd === code);
    if (found) map.set(found.itemCd, found.itemNm);
    else map.set(code, code);
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
  if (!cd) return false;
  const found = wagesData.value.find(w => w.itemCd === cd);
  if (found) return found.groupNm === '지급항목';
  return String(cd).startsWith('04001');
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

// =============================================
// 정산 설정 — 산출내역서 기반 동적 항목
// =============================================
const PAY_CONTROL_KEYWORDS = ['연차', '퇴직', '근로자의날'];

const dynamicSettlementItems = computed(() => {
  const paySet = new Map();
  const deductionSet = new Map();

  contractGroups.value.forEach(group => {
    if (!group.costBreakdown) return;

    (group.costBreakdown.directLabor || []).forEach(item => {
      if (!item.code) return;
      const isSpecial = PAY_CONTROL_KEYWORDS.some(kw => item.label?.includes(kw));
      if (isSpecial) paySet.set(item.code, true);
    });

    (group.costBreakdown.indirectLabor || []).forEach(item => {
      if (item.code) deductionSet.set(item.code, true);
    });
  });

  return {
    payItems:       Array.from(paySet.keys()),
    deductionItems: Array.from(deductionSet.keys()),
  };
});

const settlementConfig = ref({
  activePayLabels: [],
  activeDeductionLabels: [],
  isAutoCalcDefault: true,
  meltOptions: {
    annualLeave: false,
    severance: false,
    workersDay: false
  }
});

const exportConfig = ref({
  includeStatement: true,
  includeDetails: true,
  includePayroll: false
});

watch(dynamicSettlementItems, (newItems) => {
  newItems.payItems.forEach(code => {
    if (!settlementConfig.value.activePayLabels.includes(code)) {
      settlementConfig.value.activePayLabels.push(code);
    }
  });
  settlementConfig.value.activePayLabels =
      settlementConfig.value.activePayLabels.filter(c => newItems.payItems.includes(c));

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
  directLabor: [],
  indirectLabor: [],
  expenses: [],
  managementFee: makeValuesObj(staffList),
  profit: makeValuesObj(staffList),
  contractTotalFee:  '',
  contractTotalBigo: '',
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

const syncFirstContractDate = (group) => {
  if (!group.firstContractDt && group.contractStart) {
    group.firstContractDt = group.contractStart;
  }
};

const onInputCost = (item, code, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  const rawValue = el.value.replace(/[^\d]/g, '');
  const numValue = rawValue === '' ? '' : Number(rawValue);
  item.values[code] = numValue;

  const formatted = formatCurrency(numValue);
  el.value = formatted;

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

  const newLength = formatted.length;
  const nextPos = selectionStart + (newLength - oldLength);
  el.setSelectionRange(nextPos, nextPos);
};

const getDisplayMonthlyTotal = (group) => {
  if (group.manualMonthlyTotal !== undefined && group.manualMonthlyTotal !== null && group.manualMonthlyTotal !== '') {
    return group.manualMonthlyTotal;
  }
  return getTotalMonthlyFee(group);
};

const onInputMonthlyTotal = (group, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  const rawValue = el.value.replace(/[^\d]/g, '');
  const numValue = rawValue === '' ? '' : Number(rawValue);

  group.manualMonthlyTotal = numValue;

  const formatted = formatCurrency(numValue === '' ? getTotalMonthlyFee(group) : numValue);
  el.value = formatted;

  const nextPos = selectionStart + (formatted.length - oldLength);
  el.setSelectionRange(nextPos, nextPos);
};

const onInputSingleRaw = (obj, key, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  const rawValue = el.value.replace(/[^\d]/g, '');
  const numValue = rawValue === '' ? '' : Number(rawValue);

  obj[key] = numValue;

  const formatted = formatCurrency(numValue);
  el.value = formatted;

  const newLength = formatted.length;
  const nextPos = selectionStart + (newLength - oldLength);
  el.setSelectionRange(nextPos, nextPos);
};

// =============================================
// 계약 그룹 CRUD
// =============================================
const addContractGroup = (category) => {
  const isGuard = category.itemCd === '01001001';
  const isCleaning = category.itemCd === '01001002';

  const directLaborTemplate = isGuard
      ? DEFAULT_DIRECT_LABOR_GUARD
      : (isCleaning ? DEFAULT_DIRECT_LABOR_COMMON : []);

  const defaultBreakdown = createDefaultCostBreakdown([]);

  defaultBreakdown.directLabor = directLaborTemplate.map(item => ({
    code:   item.code,
    label:  item.label,
    values: {},
    bigo:   '',
  }));

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
    files: [],
    isDragging: false,
    firstContractDt: '',
    contractStart: '',
    contractEnd: '',
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
    meltOptions: {
      annualLeave: false,
      severance: false,
      workersDay: false
    },
    salarySource: 'contract',
    cleaningTasks: [],
    tempCleaningCode: '',
    tempCleaningCount: 1,
  });

  // 방금 추가된 섹션으로 스크롤 이동
  setTimeout(() => { scrollToSection('sec-contract'); }, 100);
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
      showSchedule: true
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

const updateStaffCount = (staff, delta) => {
  const newVal = (Number(staff.count) || 0) + delta;

  if (newVal < 1) {
    alert('인원은 최소 1명 이상이어야 합니다. 직책을 삭제하시려면 우측의 [X] 버튼을 이용해주세요.');
    return;
  }

  staff.count = newVal;
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

const onDragOverGroup = (group, event) => {
  event.preventDefault();
  group.isDragging = true;
};

const onDragLeaveGroup = (group) => {
  group.isDragging = false;
};

const onDropGroup = (group, event) => {
  event.preventDefault();
  group.isDragging = false;

  const files = Array.from(event.dataTransfer.files);
  const pdfFiles = files.filter(f => f.type === 'application/pdf');

  if (pdfFiles.length !== files.length) {
    alert('PDF 파일만 업로드 가능합니다.');
  }
  if (pdfFiles.length > 0) {
    if (!group.files) group.files = [];
    group.files = [...group.files, ...pdfFiles];
  }
};

const handleFileChangeGroup = (group, event) => {
  const files = Array.from(event.target.files);
  const pdfFiles = files.filter(file => file.type === 'application/pdf');

  if (pdfFiles.length !== files.length) {
    alert('PDF 파일만 업로드 가능합니다.');
  }

  if (!group.files) group.files = [];
  group.files = [...group.files, ...pdfFiles];

  event.target.value = '';
};

const removeFileGroup = (group, index) => {
  group.files.splice(index, 1);
};

const totalArea = computed(() => {
  const under = Number(site.value.areaUnder) || 0;
  const over = Number(site.value.areaOver) || 0;
  return Math.round((under + over) * 100) / 100;
});

const isVatSite = computed(() => Number(site.value.areaOver) > 0);

const handleSubmit = async () => {
  if (!site.value.siteName) { alert('현장명을 입력해주세요.'); scrollToSection('sec-basic'); return; }
  if (!site.value.siteType) { alert('현장 형태를 선택해주세요.'); scrollToSection('sec-basic'); return; }
  if (!site.value.postalCode) { alert('주소를 입력해주세요.'); scrollToSection('sec-biz'); return; }
  if (!site.value.building_su) { alert('건물 수를 입력해주세요.'); scrollToSection('sec-basic'); return; }
  if (!site.value.unit_su) { alert('세대 수를 입력해주세요.'); scrollToSection('sec-basic'); return; }
  if (!site.value.payment_day) { alert('급여지급일을 선택해주세요.'); scrollToSection('sec-basic'); return; }
  if (!site.value.billing_day) { alert('청구예정일을 선택해주세요.'); scrollToSection('sec-basic'); return; }
  if (!site.value.director) { alert('관리 소장 이름을 입력해주세요.'); scrollToSection('sec-manager'); return; }
  if (!site.value.directorContact) { alert('관리 소장 연락처를 입력해주세요.'); scrollToSection('sec-manager'); return; }

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
    const exportConfigJson = JSON.stringify(exportConfig.value);

    const params = {
      cIdx: authStore.user?.cIdx,
      sIdx: route.query.idx || '',
      sType: site.value.siteType,
      name: site.value.siteName,
      site_id: site.value.siteId,
      status: site.value.status,
      businessNumber: site.value.businessNumber,
      businessName: site.value.businessName,
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
      billing_day: site.value.billing_day,
      manager: site.value.managerName,
      phone: site.value.managerContact,
      director: site.value.director,
      directorContact: site.value.directorContact,
      billingManager: site.value.billingManager,
      payrollManager: site.value.payrollManager,
      bigo: site.value.bigo,
      settlementBigo: site.value.settlementBigo,
      bankName: site.value.bankName,
      accountNumber: site.value.accountNumber,
      accountName: site.value.accountName,
      contract_details: contractsJson,
      viewConfig: viewConfigJson,
      exportConfig: exportConfigJson
    };

    const res = await axios.post(`/api/v1/site/register`, params);
    const savedSIdx = res.data.data || route.query.idx;
    if (!savedSIdx) throw new Error('sIdx를 찾을 수 없습니다.');

    const hasFiles = contractGroups.value.some(g => g.files && g.files.length > 0);

    if (hasFiles) {
      const siteDataRes = await axios.get(`/api/v1/site/data/${savedSIdx}`);
      const siteData = siteDataRes.data.data[0];

      if (siteData && siteData.contractList) {
        const fetchedContracts = JSON.parse(siteData.contractList);
        const formData = new FormData();
        let uploadCount = 0;

        contractGroups.value.forEach((group, index) => {
          const dbContract = fetchedContracts[index];
          const targetScIdx = group.scIdx || (dbContract ? (dbContract.scIdx || dbContract.idx) : null);

          if (targetScIdx && group.files && group.files.length > 0) {
            group.files.forEach(file => {
              formData.append(`file_contract_${targetScIdx}`, file);
              uploadCount++;
            });
          }
        });

        if (uploadCount > 0) {
          await axios.post(`/api/v1/upload/file/${savedSIdx}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
      }
    }

    alert(`${site.value.siteName} 현장 및 계약 정보가 등록되었습니다.`);
    await router.push('/site/list');
  } catch (err) {
    console.error('등록 에러:', err);
    window.customAlert('저장 중 오류가 발생했습니다.', 'error');
  }
};

const getSiteData = async () => {
  const sIdx = route.query.idx;
  if (!sIdx) {
    site.value = getInitSiteData();
    contractGroups.value = [];
    bigoHistory.value = [];
    settlementConfig.value = {
      activePayLabels: [],
      activeDeductionLabels: [],
      isAutoCalcDefault: true,
      meltOptions: {
        annualLeave: false,
        severance: false,
        workersDay: false
      }
    };
    exportConfig.value = { includeStatement: true, includeDetails: true, includePayroll: false };

    searchAvailable.value = '';
    searchSelected.value = '';
    selectedAvailItems.value = [];
    selectedRightItems.value = [];
    return;
  }

  axios.get(`/api/v1/site/data/${sIdx}`).then(res => {
    const result = res.data.data[0];
    if (!result) return;

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
    site.value.billing_day    = result.billing_day;
    site.value.bankName       = result.bankName || '';
    site.value.accountNumber  = result.accountNumber || '';
    site.value.accountName    = result.accountName || '';

    if (result.contractList) {
      const contract = JSON.parse(result.contractList);
      contractGroups.value = contract.map(item => {
        const staffListMapped = (item.staffList || []).map(staff => ({
          ...staff,
          schedule: staff.schedule || createDefaultSchedule(),
          showSchedule: false
        }));

        const costBreakdownData = item.costBreakdown || createDefaultCostBreakdown(staffListMapped);
        if (!costBreakdownData.dailyWorkHours) {
          costBreakdownData.dailyWorkHours = makeValuesObj(staffListMapped, '');
        }
        if (!costBreakdownData.monthlyWorkHours) {
          costBreakdownData.monthlyWorkHours = makeValuesObj(staffListMapped, '');
        }

        return {
          scIdx: item.scIdx || item.idx,
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
          costBreakdown: costBreakdownData,
          showCostBreakdown: false,
          meltOptions: item.meltOptions || {
            annualLeave: false,
            severance: false,
            workersDay: false
          },
          salarySource: item.salarySource || 'contract',
          files: item.files || [],
          isDragging: false,
        };
      });
    }

    if (result.bigoList) {
      try {
        const allLog = JSON.parse(result.bigoList);
        bigoHistory.value = allLog
            .filter(item => String(item.type) === '1')
            .sort((a, b) => new Date(b.regDt) - new Date(a.regDt));

        settlementHistory.value = allLog
            .filter(item => String(item.type) === '2')
            .sort((a, b) => new Date(b.regDt) - new Date(a.regDt));
      } catch {
        bigoHistory.value = [];
        settlementHistory.value = [];
      }
    }

    if (result.viewConfig) {
      try {
        const parsed = typeof result.viewConfig === 'string'
            ? JSON.parse(result.viewConfig)
            : result.viewConfig;

        const convertLabelToCode = (val) => {
          const found = wagesData.value.find(w => w.itemNm === val || w.itemCd === val);
          return found ? found.itemCd : val;
        };

        settlementConfig.value = {
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

    if (result.exportConfig) {
      try {
        const parsedExport = typeof result.exportConfig === 'string'
            ? JSON.parse(result.exportConfig)
            : result.exportConfig;
        exportConfig.value = { ...exportConfig.value, ...parsedExport };
      } catch (e) {
        console.error('exportConfig 파싱 에러:', e);
      }
    }

    site.value.bigo = '';
    site.value.settlementBigo = '';
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

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${useAuthStore().user?.cIdx}`);
    const all = (res.data.data || []).filter(c => c.itemCd.startsWith('04'));

    const map = Object.fromEntries(all.map(c => [c.itemCd, c]));
    const parentCds = new Set(all.map(c => c.groupCd));
    const leaves = all.filter(c => !parentCds.has(c.itemCd));

    const getTopAncestor = (itemCd) => {
      let cur = map[itemCd];
      while (cur) {
        const parent = map[cur.groupCd];
        if (!parent || parent.itemCd === parent.groupCd) return cur.itemCd;
        cur = parent;
      }
      return null;
    };

    const GROUP_NM = {
      '04001': '지급항목',
      '04002': '공제항목',
      '04003': '정산항목',
    };

    wagesData.value = leaves.map(leaf => ({
      ...leaf,
      tax_free: Number(leaf.tax_free) || 0,
      groupNm:  GROUP_NM[getTopAncestor(leaf.itemCd)] ?? '기타',
    }));

    cleaningTaskOptions.value = leaves
        .filter(leaf => leaf.groupCd === '04003001')
        .map(leaf => ({ itemCd: leaf.itemCd, itemNm: leaf.itemNm }));

  } catch (e) {
    console.error('임금코드 로드 실패:', e);
    wagesData.value = [];
    cleaningTaskOptions.value = [];
  }
};

const fetchAccounts = async () => {
  try {
    const res = await axios.get(`/api/v1/config/company/account`);
    accountList.value = res.data.data || [];
  } catch (e) {
    console.error('계좌 목록 로드 실패:', e);
  }
};

const setCompanyAccount = () => {
  const selectedBank = accountList.value.find(b => b.bank === site.value.bankName);
  if (selectedBank) {
    site.value.accountNumber = selectedBank.accountNumber || '';
    site.value.accountName = selectedBank.accountName || '';
  }
};

watch(() => route.query.idx, () => {
  getSiteData();
});

onActivated(() => {
  getSiteData();
});

onMounted(() => {
  fetchPositionOptions();
  fetchTypeOptions();
  fetchBankOption();
  getSiteData();
  getWageCode();
  fetchAccounts();

  // ★ 스크롤 위치 감지 로직 - window 대신 content-area 내부 감지로 변경
  const container = document.querySelector('.content-area');
  if (container) {
    container.addEventListener('scroll', () => {
      const sections = navItems.map(item => document.getElementById(item.id));
      let current = 'sec-basic';
      sections.forEach(section => {
        if (section && container.scrollTop >= (section.offsetTop - 150)) {
          current = section.getAttribute('id');
        }
      });
      activeSection.value = current;
    });
  }
});
</script>

<template>
  <!-- 100vh 고정 스크롤 방지 래퍼 -->
  <div class="site-register-page">

    <!-- 상단 고정(Sticky) 헤더 -->
    <div class="page-header sticky-header">
      <div class="header-left">
        <button type="button" @click="handleCancel" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title"><i class="mdi mdi-office-building-plus-outline text-primary"></i> 현장 등록</h1>
          <p class="page-subtitle">새로운 현장 정보를 카테고리별로 입력합니다.</p>
        </div>
      </div>
      <div class="header-right">
        <button type="button" @click="handleCancel" class="btn-cancel">취소</button>
        <button type="button" @click="handleSubmit" class="btn-submit">
          <i class="mdi mdi-check"></i> 현장 등록 완료
        </button>
      </div>
    </div>

    <!-- 메인 레이아웃: 좌측 네비 + 우측 스크롤 폼 -->
    <div class="register-layout">

      <!-- 좌측 퀵 네비게이션 -->
      <aside class="quick-nav-sidebar">
        <div class="nav-wrapper">
          <h3 class="nav-title">입력 항목</h3>
          <ul class="nav-list">
            <li v-for="nav in navItems" :key="nav.id"
                :class="['nav-item', { active: activeSection === nav.id }]"
                @click="scrollToSection(nav.id)">
              <i :class="['mdi', nav.icon]"></i>
              <span>{{ nav.title }}</span>
            </li>
          </ul>
        </div>
      </aside>

      <!-- ★ 우측 메인 폼 영역 (이곳만 스크롤됨) ★ -->
      <main class="content-area">
        <form @submit.prevent="handleSubmit" id="registerForm">

          <!-- 카드 1: 기본 정보 -->
          <section id="sec-basic" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-office-building-outline text-primary"></i>
              <h2>기본 정보</h2>
            </div>
            <div class="card-body">
              <div class="form-grid">
                <div class="form-group full-width">
                  <label class="form-label required">현장명</label>
                  <input type="text" v-model="site.siteName" required class="form-input" placeholder="예: AAA 1단지" />
                </div>
                <div class="form-group">
                  <label class="form-label">현장 코드</label>
                  <input type="text" v-model="site.siteId" class="form-input" placeholder="선택사항" />
                </div>
                <div class="form-group">
                  <label class="form-label required">현장 형태</label>
                  <select v-model="site.siteType" required class="form-select">
                    <option value="">선택하세요</option>
                    <option v-for="t in siteTypeOptions" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">현장 상태</label>
                  <div class="radio-group">
                    <label v-for="s in statusOptions" :key="s" class="radio-label">
                      <input type="radio" v-model="site.status" :value="s" /><span>{{ s }}</span>
                    </label>
                  </div>
                </div>

                <div class="form-group-row">
                  <div class="form-group">
                    <label class="form-label">연면적 (총면적)</label>
                    <div class="input-with-unit">
                      <input type="number" v-model="site.areaGross" class="form-input text-right" placeholder="0" min="0" step="any" />
                      <span class="unit">㎡</span>
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">135㎡ 이하 (면세)</label>
                    <div class="input-with-unit">
                      <input type="number" v-model="site.areaUnder" class="form-input text-right" placeholder="0" min="0" step="any" />
                      <span class="unit">㎡</span>
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label required">135㎡ 초과 (과세)</label>
                    <div class="input-with-unit">
                      <input type="number" v-model="site.areaOver" class="form-input text-right" placeholder="0" min="0" step="any" />
                      <span class="unit">㎡</span>
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label"><i class="mdi mdi-calculator"></i>총 관리면적</label>
                    <div class="input-with-unit">
                      <input type="text" :value="totalArea" class="form-input text-right font-bold bg-highlight" readonly />
                      <span class="unit bold text-primary">㎡</span>
                    </div>
                    <p class="helper-text-sm">
                      * 과세 면적 입력 시 <strong :class="{'text-primary': isVatSite}">과세사업장({{ isVatSite ? 'Y' : 'N' }})</strong> 설정
                    </p>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label required">건물 수</label>
                  <input type="number" v-model="site.building_su" required class="form-input text-right" placeholder="0" />
                </div>
                <div class="form-group">
                  <label class="form-label required">세대 수</label>
                  <input type="number" v-model="site.unit_su" required class="form-input text-right" placeholder="0" />
                </div>
                <div class="form-group">
                  <label class="form-label required">급여지급일</label>
                  <select v-model="site.payment_day" required class="form-select">
                    <option value="">선택</option>
                    <option v-for="d in 31" :key="d" :value="d">{{ d }}일</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">청구예정일</label>
                  <select v-model="site.billing_day" required class="form-select">
                    <option value="">선택</option>
                    <option v-for="d in 31" :key="d" :value="d">{{ d }}일</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <!-- 카드 2: 주소 및 사업자 -->
          <section id="sec-biz" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-card-account-details-outline text-primary"></i>
              <h2>주소 및 사업자 정보</h2>
            </div>
            <div class="card-body">
              <div class="inner-section">
                <h4 class="inner-title">현장 주소</h4>
                <div class="form-grid">
                  <div class="form-group full-width">
                    <label class="form-label required">주소 검색</label>
                    <div class="address-search-group">
                      <input type="text" v-model="site.postalCode" placeholder="우편번호" required class="form-input postal-input" readonly />
                      <button type="button" @click="searchAddress" class="btn-search-address"><i class="mdi mdi-magnify"></i> 주소 검색</button>
                    </div>
                  </div>
                  <div class="form-group full-width">
                    <input type="text" v-model="site.addressMain" placeholder="기본 주소" required class="form-input" readonly />
                  </div>
                </div>
              </div>

              <div class="inner-section divider-top">
                <h4 class="inner-title">사업자 기본 정보</h4>
                <div class="form-grid">
                  <div class="form-group"><label class="form-label">사업자등록번호</label><input type="text" v-model="site.businessNumber" class="form-input" placeholder="예: 123-45-67890" /></div>
                  <div class="form-group"><label class="form-label">상호명</label><input type="text" v-model="site.businessName" class="form-input" placeholder="상호명 입력" /></div>
                  <div class="form-group"><label class="form-label">대표자명</label><input type="text" v-model="site.representative" class="form-input" placeholder="대표자명 입력" /></div>
                  <div class="form-group"><label class="form-label">업태</label><input type="text" v-model="site.businessType" class="form-input" placeholder="예: 서비스, 도매" /></div>
                  <div class="form-group"><label class="form-label">종목</label><input type="text" v-model="site.businessItem" class="form-input" placeholder="예: 건물관리, 경비" /></div>
                  <div class="form-group full-width"><label class="form-label">수신용 이메일 (세금계산서/공문)</label><input type="email" v-model="site.email" class="form-input" placeholder="예: example@email.com" /></div>
                </div>
              </div>

              <div class="inner-section divider-top">
                <h4 class="inner-title"><i class="mdi mdi-bank text-primary"></i> 정산 계좌 정보</h4>
                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label">은행명</label>
                    <select v-model="site.bankName" class="form-select" @change="setCompanyAccount">
                      <option value="">선택</option>
                      <option v-for="bank in accountList" :key="bank.bank" :value="bank.bank">{{ bank.bank }}</option>
                    </select>
                  </div>
                  <div class="form-group"><label class="form-label">계좌번호</label><input type="text" v-model="site.accountNumber" class="form-input" placeholder="- 포함 입력" /></div>
                  <div class="form-group"><label class="form-label">계좌예금주</label><input type="text" v-model="site.accountName" class="form-input" /></div>
                </div>
              </div>
            </div>
          </section>

          <!-- 카드 3: 계약 및 인원 -->
          <section id="sec-contract" class="category-card">
            <div class="card-header flex-between">
              <div class="title-group"><i class="mdi mdi-file-document-outline text-primary"></i><h2>계약 및 인원 구성</h2></div>
              <div class="contract-actions">
                <button v-for="cat in typeOptions" :key="cat.itemCd" type="button" @click="addContractGroup(cat)" class="btn-add">
                  <i class="mdi mdi-plus"></i>{{ cat.itemNm }} 계약 추가
                </button>
              </div>
            </div>

            <div class="card-body bg-body-canvas">
              <div v-if="contractGroups.length === 0" class="empty-contracts">
                <i class="mdi mdi-briefcase-plus-outline"></i>
                <p>현재 등록된 용역 계약이 없습니다.</p>
                <span>상단의 [계약 추가] 버튼을 눌러 경비/미화 등의 계약을 생성해주세요.</span>
              </div>

              <div v-for="(group, idx) in contractGroups" :key="idx" class="contract-card shadow-sm">
                <div class="contract-card-header">
                  <div class="contract-title">
                    <span :class="['contract-badge', `badge-${group.category}`]">{{ group.category }}</span>
                    <span v-if="getContractDuration(group)" class="contract-duration"><i class="mdi mdi-calendar-range"></i>{{ getContractDuration(group) }}</span>
                  </div>
                  <button type="button" @click="removeContractGroup(idx)" class="btn-remove-contract" title="계약 삭제"><i class="mdi mdi-trash-can-outline"></i></button>
                </div>

                <div class="contract-card-body">
                  <div class="file-upload-section">
                    <label class="section-label"><i class="mdi mdi-file-pdf-box text-danger"></i> 계약서 스캔본 첨부 (PDF)</label>
                    <div class="file-upload-box" :class="{ 'is-dragging': group.isDragging }" @dragover="onDragOverGroup(group, $event)" @dragleave="onDragLeaveGroup(group)" @drop="onDropGroup(group, $event)">
                      <input type="file" :id="'contract-file-' + idx" accept=".pdf" multiple @change="handleFileChangeGroup(group, $event)" class="hidden-file-input" />
                      <label :for="'contract-file-' + idx" class="file-upload-label">
                        <div class="upload-placeholder"><i :class="group.isDragging ? 'mdi mdi-tray-arrow-down' : 'mdi mdi-cloud-upload-outline'"></i><p>클릭하거나 PDF 파일을 이곳으로 드래그 하세요.</p></div>
                      </label>
                    </div>
                    <div v-if="group.files && group.files.length > 0" class="file-list-container">
                      <div v-for="(file, fIndex) in group.files" :key="fIndex" class="file-item-card">
                        <div class="file-info"><i class="mdi mdi-file-pdf-box text-danger"></i><div class="file-name-group"><span class="file-name">{{ file.name }}</span><span class="file-size">{{ (file.size / 1024).toFixed(1) }} KB</span></div></div>
                        <button type="button" @click="removeFileGroup(group, fIndex)" class="btn-remove-file"><i class="mdi mdi-close"></i></button>
                      </div>
                    </div>
                  </div>

                  <div class="form-grid mt-4">
                    <div class="form-group"><label class="form-label">최초 계약일</label><input type="date" v-model="group.firstContractDt" class="form-input" max="9999-12-31" /></div>
                    <div class="form-group"><label class="form-label required">계약 시작일</label><input type="date" v-model="group.contractStart" @change="syncFirstContractDate(group)" class="form-input" max="9999-12-31" /></div>
                    <div class="form-group"><label class="form-label required">계약 종료일</label><input type="date" v-model="group.contractEnd" class="form-input" max="9999-12-31" /></div>
                    <div class="form-group full-width"><label class="form-label">근무 형태 설명</label><input type="text" v-model="group.workSchedule" class="form-input" placeholder="예: 격일제 교대 근무 (09:00 ~ 익일 09:00)" /></div>
                    <div class="form-group full-width"><label class="form-label">휴게 시간 메모</label><input type="text" v-model="group.breakTime" class="form-input" placeholder="예: 주간 2시간, 야간 4시간" /></div>
                  </div>

                  <div class="staff-section mt-4">
                    <label class="section-label"><i class="mdi mdi-account-group-outline text-primary"></i> 투입 인원 설정</label>
                    <div class="staff-input-group">
                      <select v-model="group.tempJobCode" class="form-select staff-position"><option value="">추가할 직책 선택</option><option v-for="opt in positionOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option></select>
                      <input type="number" v-model="group.tempCount" min="1" class="form-input staff-count text-right" placeholder="인원수" />
                      <button type="button" @click="addStaffToGroup(idx)" class="btn-detail">추가</button>
                    </div>

                    <div v-if="group.staffList && group.staffList.length > 0" class="staff-list">
                      <div v-for="(staff, sIdx) in group.staffList" :key="sIdx" class="staff-item-wrapper">
                        <div class="staff-item">
                          <div class="staff-info">
                            <i class="mdi mdi-account-outline text-primary"></i><span class="staff-position-name">{{ staff.name }}</span>
                            <div class="staff-count-stepper ml-2"><button type="button" class="btn-stepper" @click.stop="updateStaffCount(staff, -1)"><i class="mdi mdi-minus"></i></button><input type="number" v-model.number="staff.count" class="input-stepper" min="1" /><span class="stepper-text">명</span><button type="button" class="btn-stepper" @click.stop="updateStaffCount(staff, 1)"><i class="mdi mdi-plus"></i></button></div>
                          </div>
                          <div class="staff-actions">
                            <button type="button" @click="staff.showSchedule = !staff.showSchedule" class="btn-toggle-schedule" :class="{ 'active': staff.showSchedule }"><i class="mdi" :class="staff.showSchedule ? 'mdi-calendar-collapse-horizontal' : 'mdi-calendar-expand-horizontal'"></i> 근무표</button>
                            <button type="button" @click="removeStaffFromGroup(idx, sIdx)" class="btn-remove-staff"><i class="mdi mdi-close"></i></button>
                          </div>
                        </div>
                        <div v-show="staff.showSchedule" class="schedule-panel">
                          <div class="schedule-header"><span>요일별 근무시간</span><button type="button" @click="applyToWeekdays(staff.schedule)" class="btn-batch-apply">평일 일괄 적용</button></div>
                          <div class="schedule-table-wrap">
                            <table class="schedule-table">
                              <thead><tr><th class="col-day">요일</th><th class="col-time">출근 ~ 퇴근</th><th class="col-break">휴게(분)</th><th class="col-opt">격주</th></tr></thead>
                              <tbody>
                              <tr v-for="day in weekDays" :key="day.val" :class="{'inactive-row': !staff.schedule[day.val].isActive}">
                                <td><label class="day-checkbox"><input type="checkbox" v-model="staff.schedule[day.val].isActive" /><span :class="{'text-danger': day.val === 0, 'text-primary': day.val === 6}">{{ day.label }}</span></label></td>
                                <td><div v-if="staff.schedule[day.val].isActive" class="time-inputs"><input type="time" v-model="staff.schedule[day.val].startTime" class="form-input time-input" /><span>~</span><input type="time" v-model="staff.schedule[day.val].endTime" class="form-input time-input" /></div><span v-else class="text-muted text-sm">휴무</span></td>
                                <td><input v-if="staff.schedule[day.val].isActive" type="number" step="any" v-model="staff.schedule[day.val].breakTime" class="form-input break-input" /><span v-else class="text-muted">-</span></td>
                                <td><input v-if="staff.schedule[day.val].isActive" type="checkbox" v-model="staff.schedule[day.val].isBiweekly" /><span v-else class="text-muted">-</span></td>
                              </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                      <div class="staff-total">총 인원: <strong>{{ getGroupStaffTotal(group) }}명</strong></div>
                    </div>
                  </div>

                  <!-- 산출내역서 토글 버튼 -->
                  <div class="cost-breakdown-wrapper mt-4">
                    <button type="button" class="btn-toggle-cost" @click="group.showCostBreakdown = !group.showCostBreakdown">
                      <div class="toggle-left"><i :class="group.showCostBreakdown ? 'mdi mdi-chevron-up' : 'mdi mdi-chevron-down'"></i><span>{{ group.showCostBreakdown ? '상세 산출내역 닫기' : '상세 산출내역 작성하기 (선택)' }}</span></div>
                      <span v-if="getTotalMonthlyFee(group) > 0" class="cost-preview-badge">월 {{ formatCurrency(getTotalMonthlyFee(group)) }}원</span>
                    </button>
                    <!-- 산출내역서 본문 -->
                    <div v-show="group.showCostBreakdown" class="cost-breakdown-section">
                      <div v-if="group.staffList.length === 0" class="cost-no-staff"><i class="mdi mdi-account-plus-outline"></i><p>투입 인원을 먼저 추가해주세요.</p></div>
                      <template v-else>
                        <div class="cost-scroll-area">
                          <!-- 근로시간 -->
                          <div class="cost-section-title"><span class="cost-block-label label-hours"><i class="mdi mdi-clock-check"></i></span>근로시간 기준</div>
                          <table class="cost-table">
                            <thead><tr><th class="col-label">항목</th><th v-for="staff in group.staffList" :key="staff.code" class="col-staff">{{ staff.name }} <span class="font-normal">({{ staff.count }}명)</span></th><th class="col-rowtotal">산출근거</th></tr></thead>
                            <tbody>
                            <tr><td class="font-bold">일 근로시간 (H)</td><td v-for="staff in group.staffList" :key="staff.code"><input type="number" step="any" min="0" v-model.number="group.costBreakdown.dailyWorkHours[staff.code]" class="tbl-value-input" /></td><td><input type="text" class="tbl-value-input" v-model="group.costBreakdown.dailyHoursBigo" /></td></tr>
                            <tr><td class="font-bold">월 근로시간 (H)</td><td v-for="staff in group.staffList" :key="staff.code"><input type="number" step="any" min="0" v-model.number="group.costBreakdown.monthlyWorkHours[staff.code]" class="tbl-value-input" /></td><td><input type="text" class="tbl-value-input" v-model="group.costBreakdown.monthlyHoursBigo" /></td></tr>
                            </tbody>
                          </table>
                          <!-- 직접노무비 -->
                          <div class="cost-section-title flex-between mt-4"><div><span class="cost-block-label label-direct">A</span>직접노무비</div><button type="button" @click="addItem(group, 'directLabor')" class="btn-add-cost-item">항목 추가</button></div>
                          <table class="cost-table">
                            <thead><tr><th class="col-label">항목</th><th v-for="staff in group.staffList" :key="staff.code" class="col-staff">{{ staff.name }}</th><th class="col-rowtotal-head">행합계</th><th class="col-rowtotal">산출내역</th><th class="col-action"></th></tr></thead>
                            <tbody>
                            <tr v-for="(item, iIdx) in group.costBreakdown.directLabor" :key="'dl-'+iIdx">
                              <td><CategorySelect v-model="item.label" v-model:code="item.code" topCode="04001"/></td>
                              <td v-for="staff in group.staffList" :key="staff.code"><input type="text" :value="formatCurrency(item.values[staff.code])" @focus="$event.target.select()" @input="onInputCost(item, staff.code, $event)" class="tbl-value-input" /></td>
                              <td class="col-rowtotal-cell">{{ formatCurrency(getRowTotal(item, group.staffList)) }}</td>
                              <td><input type="text" class="tbl-value-input" v-model="item.bigo" /></td>
                              <td class="col-action"><button type="button" @click="removeItem(group, 'directLabor', iIdx)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button></td>
                            </tr>
                            </tbody>
                            <tfoot><tr class="tfoot-subtotal"><td>소계 (A)</td><td v-for="staff in group.staffList" :key="staff.code">{{ formatCurrency(getDirectLaborColTotal(group, staff.code)) }}</td><td class="col-rowtotal-cell">{{ formatCurrency(getSubtotalRowTotal(group, getDirectLaborColTotal)) }}</td><td></td><td></td></tr></tfoot>
                          </table>
                          <!-- 간접노무비 -->
                          <div class="cost-section-title flex-between mt-4"><div><span class="cost-block-label label-indirect">B</span>간접노무비</div><button type="button" @click="addItem(group, 'indirectLabor')" class="btn-add-cost-item">항목 추가</button></div>
                          <table class="cost-table">
                            <thead><tr><th class="col-label">항목</th><th v-for="staff in group.staffList" :key="staff.code" class="col-staff">{{ staff.name }}</th><th class="col-rowtotal-head">행합계</th><th class="col-rowtotal">산출내역</th><th class="col-action"></th></tr></thead>
                            <tbody>
                            <tr v-for="(item, iIdx) in group.costBreakdown.indirectLabor" :key="'il-'+iIdx">
                              <td><CategorySelect v-model="item.label" v-model:code="item.code" topCode="04002"/></td>
                              <td v-for="staff in group.staffList" :key="staff.code"><input type="text" :value="formatCurrency(item.values[staff.code])" @focus="$event.target.select()" @input="onInputCost(item, staff.code, $event)" class="tbl-value-input" /></td>
                              <td class="col-rowtotal-cell">{{ formatCurrency(getRowTotal(item, group.staffList)) }}</td>
                              <td><input type="text" class="tbl-value-input" v-model="item.bigo" /></td>
                              <td class="col-action"><button type="button" @click="removeItem(group, 'indirectLabor', iIdx)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button></td>
                            </tr>
                            </tbody>
                            <tfoot><tr class="tfoot-subtotal"><td>소계 (B)</td><td v-for="staff in group.staffList" :key="staff.code">{{ formatCurrency(getIndirectLaborColTotal(group, staff.code)) }}</td><td class="col-rowtotal-cell">{{ formatCurrency(getSubtotalRowTotal(group, getIndirectLaborColTotal)) }}</td><td></td><td></td></tr></tfoot>
                          </table>
                          <!-- 제경비 -->
                          <div class="cost-section-title flex-between mt-4"><div><span class="cost-block-label label-expense">C</span>제경비</div><button type="button" @click="addItem(group, 'expenses')" class="btn-add-cost-item">항목 추가</button></div>
                          <table class="cost-table">
                            <thead><tr><th class="col-label">항목</th><th v-for="staff in group.staffList" :key="staff.code" class="col-staff">{{ staff.name }}</th><th class="col-rowtotal-head">행합계</th><th class="col-rowtotal">산출내역</th><th class="col-action"></th></tr></thead>
                            <tbody>
                            <tr v-for="(item, eIdx) in group.costBreakdown.expenses" :key="'exp-'+eIdx">
                              <td><CategorySelect v-model="item.label" v-model:code="item.code" topCode="04003"/></td>
                              <td v-for="staff in group.staffList" :key="staff.code"><input type="text" :value="formatCurrency(item.values[staff.code])" @focus="$event.target.select()" @input="onInputCost(item, staff.code, $event)" class="tbl-value-input" /></td>
                              <td class="col-rowtotal-cell">{{ formatCurrency(getRowTotal(item, group.staffList)) }}</td>
                              <td><input type="text" class="tbl-value-input" v-model="item.bigo" /></td>
                              <td class="col-action"><button type="button" @click="removeItem(group, 'expenses', eIdx)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button></td>
                            </tr>
                            </tbody>
                            <tfoot><tr class="tfoot-subtotal"><td>소계 (C)</td><td v-for="staff in group.staffList" :key="staff.code">{{ formatCurrency(getExpensesColTotal(group, staff.code)) }}</td><td class="col-rowtotal-cell">{{ formatCurrency(getSubtotalRowTotal(group, getExpensesColTotal)) }}</td><td></td><td></td></tr></tfoot>
                          </table>
                          <!-- 합계 -->
                          <div class="cost-section-title mt-4"><span class="cost-block-label label-total">합</span>노무비 합계 및 최종 용역비</div>
                          <table class="cost-table summary-table">
                            <tbody>
                            <tr class="summary-row row-d"><td><span class="summary-label font-bold text-primary">D. 노무비 (A+B+C)</span></td><td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val">{{ formatCurrency(getLaborColTotal(group, staff.code)) }}</span></td><td class="col-rowtotal-cell"><span class="summary-val font-bold">{{ formatCurrency(getLaborGrandTotal(group)) }}</span></td></tr>
                            <tr class="summary-row row-e"><td><span class="summary-label">E. 일반관리비</span></td><td v-for="staff in group.staffList" :key="staff.code"><input type="text" :value="formatCurrency(group.costBreakdown.managementFee[staff.code])" @focus="$event.target.select()" @input="onInputSingleCost(group.costBreakdown.managementFee, staff.code, $event)" class="tbl-value-input" /></td><td class="col-rowtotal-cell"><span class="summary-val">{{ formatCurrency(getManagementFeeGrandTotal(group)) }}</span></td></tr>
                            <tr class="summary-row row-f"><td><span class="summary-label">F. 기업이윤</span></td><td v-for="staff in group.staffList" :key="staff.code"><input type="text" :value="formatCurrency(group.costBreakdown.profit[staff.code])" @focus="$event.target.select()" @input="onInputSingleCost(group.costBreakdown.profit, staff.code, $event)" class="tbl-value-input" /></td><td class="col-rowtotal-cell"><span class="summary-val">{{ formatCurrency(getProfitGrandTotal(group)) }}</span></td></tr>
                            <tr class="summary-row row-monthly"><td><span class="summary-label font-bold text-main">1인당 월 용역비 (D+E+F)</span></td><td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val text-primary font-bold">{{ formatCurrency(getMonthlyTotalCol(group, staff.code)) }}</span></td><td class="col-rowtotal-cell">-</td></tr>
                            <tr class="summary-row row-total-fee"><td><span class="summary-label font-bold text-main">월간 용역비 총계</span></td><td :colspan="group.staffList.length"><input type="text" :value="formatCurrency(getDisplayMonthlyTotal(group))" @focus="$event.target.select()" @input="onInputMonthlyTotal(group, $event)" class="tbl-value-input grand-total-input" /></td><td class="col-rowtotal-cell"></td></tr>
                            <tr class="summary-row row-contract-total"><td><span class="summary-label">계약기간 총액</span></td><td :colspan="group.staffList.length"><input type="text" :value="formatCurrency(group.costBreakdown.contractTotalFee)" @focus="$event.target.select()" @input="onInputSingleRaw(group.costBreakdown, 'contractTotalFee', $event)" class="tbl-value-input text-main" placeholder="직접 입력" /></td><td><input type="text" class="tbl-value-input" v-model="group.costBreakdown.contractTotalBigo" placeholder="예: 24개월 × 월 용역비" /></td></tr>
                            </tbody>
                          </table>
                        </div>
                        <div class="cost-special-note">
                          <label class="form-label"><i class="mdi mdi-text-box-edit-outline"></i> 특이사항 기재란</label>
                          <textarea v-model="group.costBreakdown.specialNote" class="form-textarea" rows="2" placeholder="산출 시 참고할 특이사항 (최저임금 기준 등)"></textarea>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ★ 카드 4: 대청소 및 특수과업 (계약 카드 밖으로 완벽 분리!) ★ -->
          <section id="sec-cleaning" class="category-card mt-4">
            <div class="card-header">
              <i class="mdi mdi-spray-bottle text-primary"></i>
              <h2>대청소 및 특수과업</h2>
            </div>
            <div class="card-body bg-body-canvas">
              <div v-if="contractGroups.length === 0" class="empty-contracts">
                <i class="mdi mdi-information-outline"></i>
                <p>계약 정보가 없습니다.</p>
                <span>[계약 및 인원 구성] 탭에서 계약을 먼저 추가해주세요.</span>
              </div>
              <div v-else>
                <div v-for="(group, idx) in contractGroups" :key="'clean-'+idx" class="contract-card shadow-sm">
                  <div class="contract-card-header">
                    <div class="contract-title">
                      <span :class="['contract-badge', `badge-${group.category}`]">{{ group.category }}</span>
                      <span class="contract-duration">특수과업 설정</span>
                    </div>
                  </div>
                  <div class="contract-card-body">
                    <div class="staff-input-group">
                      <select v-model="group.tempCleaningCode" class="form-select staff-position">
                        <option value="">항목 선택</option>
                        <option v-for="opt in cleaningTaskOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
                      </select>
                      <input type="number" v-model="group.tempCleaningCount" min="1" class="form-input staff-count text-right" placeholder="연간 횟수" />
                      <button type="button" @click="addCleaningTaskToGroup(idx)" class="btn-detail">추가</button>
                    </div>

                    <div v-if="group.cleaningTasks?.length > 0" class="staff-list mt-3">
                      <div v-for="(task, tIdx) in group.cleaningTasks" :key="tIdx" class="staff-item-wrapper">
                        <div class="staff-item">
                          <div class="staff-info">
                            <i class="mdi mdi-broom text-success"></i>
                            <span class="staff-position-name">{{ task.name }}</span>
                            <div class="staff-count-stepper ml-2">
                              <button type="button" class="btn-stepper" @click.stop="updateCleaningCount(task, -1)"><i class="mdi mdi-minus"></i></button>
                              <span class="stepper-text">연</span>
                              <input type="number" v-model.number="task.count" class="input-stepper" min="1" />
                              <span class="stepper-text">회</span>
                              <button type="button" class="btn-stepper" @click.stop="updateCleaningCount(task, 1)"><i class="mdi mdi-plus"></i></button>
                            </div>
                          </div>
                          <button type="button" @click="removeCleaningTaskFromGroup(idx, tIdx)" class="btn-remove-staff"><i class="mdi mdi-close"></i></button>
                        </div>
                      </div>
                    </div>
                    <div v-else class="empty-state-sm mt-3">등록된 특수과업이 없습니다.</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 카드 5: 정산 및 출력 -->
          <section id="sec-settle" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-calculator-variant text-primary"></i>
              <h2>정산 설정 및 파일 출력 양식</h2>
            </div>
            <div class="card-body">
              <div class="inner-section">
                <h4 class="inner-title">급여 계산 기준</h4>
                <div v-if="contractGroups.length === 0" class="empty-state-sm">계약 정보가 없습니다.</div>
                <div v-else class="salary-source-list">
                  <div v-for="(group, idx) in contractGroups" :key="idx" class="source-selection-row">
                    <div class="source-group-title"><span class="contract-badge badge-gray">{{ group.category }}</span></div>
                    <div class="source-settings-content">
                      <div class="setting-block">
                        <span class="setting-label">기준 금액 출처</span>
                        <div class="source-selection-options">
                          <label class="radio-label"><input type="radio" v-model="group.salarySource" value="employee" :name="'src_'+idx"/> 직원 설정 급여</label>
                          <label class="radio-label"><input type="radio" v-model="group.salarySource" value="contract" :name="'src_'+idx"/> 산출내역서 기준</label>
                        </div>
                      </div>
                      <div class="setting-block">
                        <span class="setting-label">수당 자동 포함</span>
                        <div class="source-selection-options gap-4">
                          <label><input type="checkbox" v-model="group.meltOptions.annualLeave" /> 연차</label>
                          <label><input type="checkbox" v-model="group.meltOptions.severance" /> 퇴직</label>
                          <label><input type="checkbox" v-model="group.meltOptions.workersDay" /> 근로자의 날</label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="inner-section divider-top">
                <h4 class="inner-title">기본 파일 출력 시트</h4>
                <div class="export-simple-options">
                  <label><input type="checkbox" v-model="exportConfig.includeStatement" /> 청구 공문 (표지)</label>
                  <label><input type="checkbox" v-model="exportConfig.includeDetails" /> 급여 세부 내역서</label>
                  <label><input type="checkbox" v-model="exportConfig.includePayroll" /> 급여 대장</label>
                </div>
              </div>

              <div class="inner-section divider-top">
                <h4 class="inner-title">정산서 세부 표시 항목 커스텀</h4>
                <p class="helper-text-sm mb-2">* 우측 <strong>[정산서 표시 항목]</strong>에 있는 항목만 엑셀에 노출됩니다.</p>
                <div class="excel-transfer-ui">
                  <div class="transfer-pane">
                    <div class="pane-header">사용 가능 항목 <span class="badge">{{ filteredAvailable.length }}</span></div>
                    <div class="pane-search"><input type="text" v-model="searchAvailable" placeholder="검색..." class="form-input" /></div>
                    <div class="pane-list">
                      <div v-for="item in filteredAvailable" :key="'avail-' + item.cd" class="list-item" :class="{ active: selectedAvailItems.includes(item.cd) }" @click="toggleAvail(item)">
                        {{ item.nm }}
                      </div>
                    </div>
                  </div>
                  <div class="transfer-actions">
                    <button type="button" class="btn-transfer-add" @click="moveToRight" :disabled="!selectedAvailItems.length">추가 &rarr;</button>
                    <button type="button" class="btn-transfer-remove" @click="moveToLeft" :disabled="!selectedRightItems.length">&larr; 제외</button>
                  </div>
                  <div class="transfer-pane">
                    <div class="pane-header">정산서 표시 항목 <span class="badge badge-primary">{{ filteredSelected.length }}</span></div>
                    <div class="pane-search"><input type="text" v-model="searchSelected" placeholder="검색..." class="form-input" /></div>
                    <div class="pane-list">
                      <div v-for="item in filteredSelected" :key="'sel-' + item.cd" class="list-item" :class="{ active: selectedRightItems.includes(item.cd) }" @click="toggleRight(item)">
                        <span :class="['item-badge', isPayItem(item.cd) ? 'badge-pay' : 'badge-ded']">{{ isPayItem(item.cd) ? '지급' : '공제' }}</span>
                        {{ item.nm }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 카드 6: 담당자 정보 -->
          <section id="sec-manager" class="category-card">
            <div class="card-header"><i class="mdi mdi-account-tie-outline text-primary"></i><h2>담당자 정보</h2></div>
            <div class="card-body">
              <div class="form-grid">
                <div class="form-group"><label class="form-label">본사 담당자</label><input type="text" v-model="site.managerName" class="form-input" /></div>
                <div class="form-group"><label class="form-label">본사 연락처</label><input type="tel" v-model="site.managerContact" class="form-input" /></div>
                <div class="form-group"><label class="form-label required">현장 소장 이름</label><input type="text" v-model="site.director" class="form-input" /></div>
                <div class="form-group"><label class="form-label required">현장 소장 연락처</label><input type="text" v-model="site.directorContact" class="form-input" /></div>
                <div class="form-group"><label class="form-label">청구 담당자</label><input type="text" v-model="site.billingManager" class="form-input" /></div>
                <div class="form-group"><label class="form-label">급여 담당자</label><input type="text" v-model="site.payrollManager" class="form-input" /></div>
              </div>
            </div>
          </section>

          <!-- 카드 7: 특이사항 및 메모 -->
          <section id="sec-memo" class="category-card">
            <div class="card-header"><i class="mdi mdi-text-box-edit-outline text-primary"></i><h2>특이사항 및 메모</h2></div>
            <div class="card-body">
              <div class="memo-container">
                <div class="memo-box">
                  <div class="memo-title"><i class="mdi mdi-office-building-outline text-primary"></i> 현장 특이사항</div>
                  <textarea v-model="site.bigo" class="form-textarea" placeholder="일반적인 현장 이슈 및 메모를 남겨주세요"></textarea>
                  <div v-if="bigoHistory.length > 0" class="memo-history-list mt-2">
                    <div v-for="(h, i) in bigoHistory" :key="'bh'+i" class="history-item"><span class="date">{{ h.regDt ? h.regDt.substring(0, 16) : '-' }}</span><p>{{ h.bigo }}</p></div>
                  </div>
                </div>
                <div class="memo-box">
                  <div class="memo-title"><i class="mdi mdi-calculator-variant-outline text-warning"></i> 정산/청구 특이사항</div>
                  <textarea v-model="site.settlementBigo" class="form-textarea" placeholder="정산 시 유의할 점(수당 제외 등)을 남겨주세요"></textarea>
                  <div v-if="settlementHistory.length > 0" class="memo-history-list mt-2">
                    <div v-for="(h, i) in settlementHistory" :key="'sh'+i" class="history-item"><span class="date">{{ h.regDt ? h.regDt.substring(0, 16) : '-' }}</span><p>{{ h.bigo }}</p></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div style="height: 100px;"></div>
        </form>
      </main>

    </div>
  </div>
</template>

<style>
/* Vue/Nuxt 고질적인 Sticky 방해 요소 강제 해제 */
body, #__nuxt, #__layout, .v-application { overflow: visible !important; }
</style>

<style scoped>
/* =========================================
   공통 CSS 변수
========================================= */
:root {
  --primary: #3b82f6; --primary-hover: #2563eb; --primary-soft: #eff6ff;
  --success: #10b981; --danger: #ef4444; --warning: #f59e0b;
  --text-main: #1e293b; --text-sub: #475569; --text-muted: #94a3b8;
  --border-color: #e2e8f0; --border-focus: #cbd5e1;
  --bg-canvas: #f1f5f9; --bg-surface: #ffffff; --bg-hover: #f8fafc;
}

/* 1. 전체 화면 스크롤 제거 (100vh 고정) */
/* 1. 전체 화면 스크롤 제거 및 부모 여백 무시 */
.site-register-page {
  background-color: var(--bg-canvas, #f1f5f9);

  /* 부모(eg-main-content)의 padding 값만큼 마진을 마이너스로 주어 빈 공간을 없앱니다 */
  /* (만약 프로젝트의 기본 패딩이 20px라면 -20px로 수정해 주세요) */
  margin: -24px;

  /* ★ 마이너스 마진으로 인해 늘어난 높이 보정 (상단 탭 높이에 맞춰 60px~80px 조절 필요) */
  height: calc(100vh - 60px);

  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* 2. 헤더는 상단에 완전히 블록으로 고정 */
.sticky-header { flex-shrink: 0; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(8px); padding: 16px 32px; border-bottom: 1px solid var(--border-color, #e2e8f0); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); display: flex; justify-content: space-between; align-items: center; z-index: 50; margin: 0; }
.header-left { display: flex; align-items: center; gap: 16px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.page-title { font-size: 20px; font-weight: 800; color: var(--text-main, #1e293b); margin: 0; display:flex; align-items:center; gap:8px; }
.page-subtitle { font-size: 13px; color: var(--text-sub, #475569); margin: 4px 0 0 0; }
.btn-back { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: #fff; cursor: pointer; transition: 0.2s; display:flex; align-items:center; justify-content:center; }
.btn-back:hover { background: var(--bg-hover, #f8fafc); }
.btn-cancel { padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: #fff; font-weight: 600; cursor: pointer; color: var(--text-sub); }
.btn-submit { padding: 10px 20px; border-radius: 8px; border: none; background: var(--primary, #3b82f6); color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2); transition: 0.2s; display:flex; align-items:center; gap:6px; }
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(59, 130, 246, 0.3); }

/* 3. 하단 레이아웃: 헤더 밑의 남은 공간을 모두 차지함 */
.register-layout { display: flex; flex: 1; max-width: 1400px; width: 100%; margin: 0 auto; padding-top: 24px; overflow: hidden; }

/* 4. 사이드바: 좌측 고정 */
.quick-nav-sidebar { width: 220px; flex-shrink: 0; height: 100%; overflow-y: auto; padding: 0 16px; }
.nav-title { font-size: 12px; font-weight: 800; color: var(--text-muted, #94a3b8); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 12px; }
.nav-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--text-sub, #475569); cursor: pointer; transition: all 0.2s; background: transparent; }
.nav-item i { font-size: 18px; opacity: 0.6; }
.nav-item:hover { background: rgba(0,0,0,0.04); color: var(--text-main, #1e293b); }
.nav-item.active { background: #fff; color: var(--primary, #3b82f6); box-shadow: 0 2px 8px rgba(0,0,0,0.05); font-weight: 700; }
.nav-item.active i { opacity: 1; }

/* 5. ★ 대망의 폼 콘텐츠 영역: 오직 여기에서만 스크롤바가 생깁니다! ★ */
.content-area { flex: 1; height: 100%; overflow-y: auto; position: relative; padding: 0 24px 80px 24px; scroll-behavior: smooth;}

/* =========================================
   카드 UI 공통
========================================= */
.category-card { background: #ffffff; border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); overflow: hidden; margin-bottom: 24px;}
.card-header { padding: 20px 24px; border-bottom: 1px solid var(--border-color, #e2e8f0); background: #fff; display: flex; align-items: center; gap: 12px; }
.card-header i { font-size: 24px; }
.card-header h2 { font-size: 18px; font-weight: 800; color: var(--text-main, #1e293b); margin: 0; }
.card-body { padding: 24px; }
.flex-between { justify-content: space-between; }
.title-group { display: flex; align-items: center; gap: 12px; }
.inner-section { padding-bottom: 24px; margin-bottom: 24px; }
.inner-section:last-child { padding-bottom: 0; margin-bottom: 0; border-bottom: none !important; }
.divider-top { border-top: 1px dashed var(--border-color, #e2e8f0); padding-top: 24px; }
.bg-light-gray { background-color: var(--bg-hover, #f8fafc); margin: 0 -24px -24px -24px; padding: 24px; border-top: 1px solid var(--border-color, #e2e8f0); border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;}
.inner-title { font-size: 15px; font-weight: 700; color: var(--text-main, #1e293b); margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px; }

/* =========================================
   공통 폼 요소
========================================= */
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 20px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; background: var(--bg-hover, #f8fafc); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); grid-column: 1 / -1; }
.full-width { grid-column: 1 / -1; }
.form-label { font-size: 13px; font-weight: 600; color: var(--text-sub, #475569); }
.form-label.required::after { content: '*'; color: var(--danger, #ef4444); margin-left: 4px; }
.form-input, .form-select, .form-textarea { padding: 10px 12px; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 6px; font-size: 13px; background: #fff; width: 100%; box-sizing: border-box; transition: 0.2s; }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); outline: none; }
.input-with-unit { position: relative; }
.input-with-unit input { padding-right: 32px; }
.input-with-unit .unit { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-muted, #94a3b8); }
.bg-highlight { background-color: #f0fdf4 !important; border-color: #4ade80 !important; color: #166534; }
.radio-group { display: flex; gap: 8px; }
.radio-label { flex: 1; text-align: center; padding: 8px; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 6px; cursor: pointer; font-size: 13px; background: #fff; transition: 0.2s;}
.radio-label input { display: none; }
.radio-label:has(input:checked) { border-color: var(--primary, #3b82f6); background: var(--primary-soft, #eff6ff); color: var(--primary, #3b82f6); font-weight: 700; }
.address-search-group { display: flex; gap: 8px; }
.postal-input { width: 120px; background: #f1f5f9; }
.btn-search-address { padding: 0 16px; border: none; background: var(--text-sub, #475569); color: #fff; border-radius: 6px; font-size: 13px; font-weight:600; cursor: pointer; white-space: nowrap; transition: 0.2s;}
.btn-search-address:hover { background: var(--text-main, #1e293b); }
.text-primary { color: var(--primary, #3b82f6); } .text-danger { color: var(--danger, #ef4444); } .text-warning { color: var(--warning, #f59e0b); } .text-success { color: var(--success, #10b981); } .text-main { color: var(--text-main, #1e293b); } .text-sub { color: var(--text-sub, #475569); } .font-bold { font-weight: 700; } .font-normal { font-weight: 400; } .text-right { text-align: right; }
.helper-text-sm { font-size: 11px; color: var(--text-muted, #94a3b8); margin: 4px 0 0; } .mt-4 { margin-top: 24px; } .mb-2 { margin-bottom: 8px; } .ml-2 { margin-left: 8px; }

/* =========================================
   계약 카드 전용 스타일
========================================= */
.bg-body-canvas { background: var(--bg-hover, #f8fafc); }
.contract-actions { display: flex; gap: 8px; }
.btn-add-contract { padding: 8px 14px; border: 1px dashed var(--border-focus, #cbd5e1); background: #fff; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-main, #1e293b); transition: 0.2s;}
.btn-add-contract:hover { border-color: var(--primary, #3b82f6); color: var(--primary, #3b82f6); background: var(--primary-soft, #eff6ff); }
.empty-contracts { text-align: center; padding: 50px 20px; border: 1px dashed var(--border-focus, #cbd5e1); border-radius: 8px; background: #fff; }
.empty-contracts i { font-size: 40px; color: var(--border-focus, #cbd5e1); margin-bottom: 12px; display: block;}
.empty-contracts p { font-weight: 700; font-size: 15px; margin: 0 0 6px 0; color: var(--text-sub, #475569); }
.empty-contracts span { font-size: 13px; color: var(--text-muted, #94a3b8); }

.contract-card { background: #fff; border-radius: 8px; border: 1px solid var(--border-focus, #cbd5e1); margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);}
.contract-card-header { padding: 14px 20px; background: #f1f5f9; border-bottom: 1px solid var(--border-color, #e2e8f0); display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0; }
.contract-title { display: flex; align-items: center; gap: 12px; }
.contract-badge { padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 800; color: #fff; letter-spacing: 0.5px;}
.badge-경비 { background: #3b82f6; } .badge-미화 { background: #ec4899; } .badge-시설 { background: #10b981; } .badge-gray { background: #64748b; }
.contract-duration { font-size: 12px; font-weight: 600; color: var(--text-sub, #475569); display: flex; align-items: center; gap: 4px;}
.btn-remove-contract { width: 30px; height: 30px; border-radius: 6px; background: rgba(239,68,68,0.1); border: none; color: var(--danger, #ef4444); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;}
.btn-remove-contract:hover { background: rgba(239,68,68,0.2); }
.contract-card-body { padding: 24px; }

/* 파일업로드 */
.file-upload-section { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px dashed var(--border-color, #e2e8f0); }
.section-label { font-size: 13px; font-weight: 700; color: var(--text-main, #1e293b); display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.file-upload-box { border: 2px dashed var(--border-focus, #cbd5e1); background: var(--bg-hover, #f8fafc); border-radius: 8px; transition: all 0.2s ease; }
.file-upload-box:hover { border-color: var(--primary, #3b82f6); background: var(--primary-soft, #eff6ff); }
.file-upload-box.is-dragging { border-color: var(--primary, #3b82f6); background: var(--primary-soft, #eff6ff); transform: scale(1.01); }
.file-upload-label { display: block; width: 100%; padding: 32px 20px; cursor: pointer; text-align: center; }
.upload-placeholder i { font-size: 36px; color: var(--text-muted, #94a3b8); margin-bottom: 8px; transition: 0.2s;}
.file-upload-box:hover .upload-placeholder i { color: var(--primary, #3b82f6); }
.upload-placeholder p { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-main, #1e293b); }
.hidden-file-input { display: none; }
.file-list-container { margin-top: 12px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; background: #fff; overflow: hidden;}
.file-item-card { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border-color, #e2e8f0); background: #fff; }
.file-item-card:last-child { border-bottom: none; }
.file-info { display: flex; align-items: center; gap: 10px; }
.file-info i { font-size: 20px; }
.file-name { font-size: 13px; font-weight: 600; color: var(--text-main, #1e293b);}
.file-size { font-size: 11px; color: var(--text-muted, #94a3b8); margin-left: 8px; }
.btn-remove-file { width: 28px; height: 28px; border-radius: 6px; background: transparent; border: 1px solid var(--border-color, #e2e8f0); color: var(--text-sub, #475569); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;}
.btn-remove-file:hover { background: rgba(239,68,68,0.1); border-color: var(--danger, #ef4444); color: var(--danger, #ef4444); }

/* 인원 추가 & 스텝퍼 */
.staff-section { background: var(--bg-hover, #f8fafc); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); }
.staff-input-group { display: flex; gap: 10px; }
.staff-count { width: 90px; }
.btn-action-primary { padding: 0 20px; background: var(--primary, #3b82f6); color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s;}
.btn-action-primary:hover { background: var(--primary-hover, #2563eb); }
.staff-list { display: flex; flex-direction: column; gap: 8px; }
.staff-item-wrapper { border: 1px solid var(--border-focus, #cbd5e1); border-radius: 8px; background: #fff; overflow: hidden; }
.staff-item { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
.staff-info { display: flex; align-items: center; gap: 10px; }
.staff-position-name { font-size: 14px; font-weight: 700; color: var(--text-main, #1e293b); }
.staff-actions { display: flex; align-items: center; gap: 8px; }
.staff-count-stepper { display: inline-flex; align-items: center; background: var(--bg-canvas, #f1f5f9); border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px; padding: 2px; }
.btn-stepper { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border: none; background: transparent; cursor: pointer; border-radius: 4px; color: var(--text-sub, #475569); transition: 0.2s;}
.btn-stepper:hover { background: #e2e8f0; color: var(--text-main, #1e293b); }
.input-stepper { width: 36px; text-align: center; border: none; background: transparent; font-size: 14px; font-weight: 800; color: var(--primary, #3b82f6); padding: 0;}
.input-stepper:focus { outline: none; }
.input-stepper::-webkit-outer-spin-button, .input-stepper::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.stepper-text { font-size: 12px; font-weight: 600; color: var(--text-muted, #94a3b8); padding-right: 8px; }
.btn-toggle-schedule { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--bg-canvas, #f1f5f9); border: 1px solid var(--border-focus, #cbd5e1); border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-sub, #475569); cursor: pointer; transition: 0.2s; }
.btn-toggle-schedule.active { background: var(--primary-soft, #eff6ff); border-color: var(--primary, #3b82f6); color: var(--primary, #3b82f6); }
.btn-remove-staff { width: 28px; height: 28px; border-radius: 6px; background: rgba(239,68,68,0.1); border: none; color: var(--danger, #ef4444); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.staff-total { margin-top: 12px; padding: 10px 16px; background: var(--primary-soft, #eff6ff); border-radius: 6px; color: var(--primary, #3b82f6); font-size: 13px; }

/* 스케줄 패널 */
.schedule-panel { border-top: 1px solid var(--border-focus, #cbd5e1); background: var(--bg-hover, #f8fafc); padding: 16px; }
.schedule-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.schedule-header span { font-size: 13px; font-weight: 700; color: var(--text-main, #1e293b); }
.btn-batch-apply { padding: 6px 12px; background: var(--text-sub, #475569); color: #fff; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s;}
.btn-batch-apply:hover { background: var(--text-main, #1e293b); }
.schedule-table-wrap { overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); }
.schedule-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: center; background: #fff; min-width: 450px;}
.schedule-table th, .schedule-table td { border-bottom: 1px solid var(--border-color, #e2e8f0); padding: 10px; }
.schedule-table th { background: #f1f5f9; font-weight: 700; color: var(--text-sub, #475569); }
.schedule-table tbody tr:last-child td { border-bottom: none; }
.inactive-row td { background: var(--bg-hover, #f8fafc); opacity: 0.6; }
.time-inputs { display: flex; align-items: center; justify-content: center; gap: 8px; }
.time-input { padding: 4px 6px; font-size: 12px; width: 110px; text-align: center; }
.break-input { width: 60px; text-align: right; padding: 4px; }
.day-checkbox { display: flex; align-items: center; gap: 6px; font-weight: 700; cursor: pointer; justify-content: center;}

/* 산출내역서 전용 테이블 CSS */
.cost-breakdown-wrapper { margin-top: 24px; }
.btn-toggle-cost { width: 100%; padding: 16px; background: #f1f5f9; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 8px; font-weight: 700; font-size: 14px; color: var(--text-main, #1e293b); cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: 0.2s;}
.btn-toggle-cost:hover { background: var(--primary-soft, #eff6ff); border-color: var(--primary, #3b82f6); color: var(--primary, #3b82f6); }
.toggle-left { display: flex; align-items: center; gap: 8px; }
.cost-preview-badge { padding: 4px 12px; background: var(--primary, #3b82f6); color: #fff; border-radius: 20px; font-size: 13px; font-weight: 800; }
.cost-breakdown-section { margin-top: 12px; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 8px; overflow: hidden; background: #fff;}
.cost-no-staff { padding: 50px 20px; text-align: center; color: var(--text-sub, #475569); }
.cost-no-staff i { font-size: 48px; opacity: 0.3; display: block; margin-bottom: 12px;}
.cost-scroll-area { overflow-x: auto; padding: 20px; }
.cost-section-title { font-weight: 700; margin: 24px 0 12px 0; font-size: 14px; display: flex; align-items: center; color: var(--text-main, #1e293b);}
.cost-section-title:first-child { margin-top: 0; }
.cost-block-label { background: var(--text-main, #1e293b); color: #fff; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; margin-right: 8px; font-size: 12px; font-weight: 800;}
.label-hours { background: #64748b;} .label-direct { background: #3b82f6;} .label-indirect { background: #8b5cf6;} .label-expense { background: #f59e0b;} .label-total { background: #10b981; }
.btn-add-cost-item { padding: 6px 12px; background: #fff; border: 1px dashed var(--primary, #3b82f6); color: var(--primary, #3b82f6); border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.2s;}
.btn-add-cost-item:hover { background: var(--primary-soft, #eff6ff); }

/* 테이블 규격 디테일 복원 */
.cost-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; min-width: 800px;}
.cost-table th, .cost-table td { border: 1px solid var(--border-color, #e2e8f0); padding: 8px 10px; vertical-align: middle;}
.cost-table thead th { background: #f8fafc; font-weight: 700; color: var(--text-sub, #475569); text-align: center; white-space: nowrap;}
.col-label { width: 180px; }
.col-staff { min-width: 130px; text-align: center; }
.col-rowtotal-head { width: 130px; text-align: right; }
.col-rowtotal { width: 160px; text-align: left; }
.col-action { width: 44px; text-align: center; }
.tbl-value-input { width: 100%; border: 1px solid var(--border-focus, #cbd5e1); padding: 6px 8px; text-align: right; border-radius: 4px; font-size: 12px; color: var(--text-main, #1e293b); transition: 0.2s;}
.tbl-value-input:focus { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15); outline: none; }
.col-rowtotal-cell { text-align: right; font-weight: 700; background: rgba(99, 102, 241, 0.03); color: var(--text-main, #1e293b);}
.tfoot-subtotal td { background: #f1f5f9; font-size: 13px; font-weight: 800; color: var(--text-main, #1e293b); text-align: right; border-top: 2px solid var(--border-focus, #cbd5e1); }
.tfoot-subtotal td:first-child { text-align: left; }
.btn-remove-cost { width: 28px; height: 28px; border-radius: 4px; background: rgba(239,68,68,0.1); border: none; color: var(--danger, #ef4444); cursor: pointer; display: flex; align-items: center; justify-content: center; }

/* 합계 테이블 (Summary) 규격 복원 */
.summary-table { border-top: 2px solid var(--text-main, #1e293b); }
.summary-row td { padding: 12px 10px; background: #fff;}
.summary-label { font-size: 13px; }
.summary-val { display: block; text-align: right; font-size: 13px; font-weight: 600; color: var(--text-main, #1e293b); }
.row-d td { background: rgba(16,185,129,0.03) !important; }
.row-monthly td { background: rgba(59,130,246,0.04) !important; }
.row-total-fee td { background: var(--primary-soft, #eff6ff) !important; }
.grand-total-input { font-size: 16px; font-weight: 800; color: var(--primary, #3b82f6); border-color: var(--primary, #3b82f6); padding: 8px;}
.cost-special-note { padding: 20px; border-top: 1px solid var(--border-color, #e2e8f0); background: #f8fafc; }

/* 정산/엑셀 커스텀 UI */
.empty-state-sm { padding: 16px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center; color: var(--text-muted, #94a3b8); font-size: 13px; }
.source-selection-row { display: flex; flex-direction: column; gap: 16px; padding: 20px; background: #fff; border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; margin-bottom: 16px;}
.source-group-title .contract-badge { padding: 4px 12px; font-size: 13px; font-weight: 800; border-radius: 6px; color: #fff;}
.setting-block { display: flex; align-items: center; gap: 24px; }
.setting-label { width: 100px; font-size: 13px; font-weight: 700; color: var(--text-main, #1e293b); }
.source-selection-options { display: flex; gap: 24px; align-items: center;}
.export-simple-options { display: flex; gap: 24px; background: #fff; padding: 20px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); }
.export-simple-options label { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.export-simple-options input[type="checkbox"], .source-selection-options input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--primary, #3b82f6); cursor: pointer;}
.excel-transfer-ui { display: flex; gap: 20px; align-items: center; background: #fff; padding: 24px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); }
.transfer-pane { flex: 1; border: 1px solid var(--border-focus, #cbd5e1); background: #fff; border-radius: 8px; height: 320px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.02);}
.pane-header { padding: 12px 16px; background: #f8fafc; font-weight: 800; font-size: 13px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color, #e2e8f0); }
.pane-header .badge { background: #e2e8f0; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
.pane-header .badge-primary { background: var(--primary, #3b82f6); color: #fff; }
.pane-search { padding: 12px; border-bottom: 1px solid var(--border-color, #e2e8f0); }
.pane-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px;}
.list-item { padding: 10px 12px; font-size: 13px; font-weight: 500; cursor: pointer; border-radius: 6px; transition: 0.1s; display: flex; align-items: center; gap: 8px;}
.list-item:hover { background: #f1f5f9; }
.list-item.active { background: var(--primary-soft, #eff6ff); color: var(--primary, #3b82f6); font-weight: 700; }
.item-badge { font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 800; }
.badge-pay { background: rgba(59,130,246,0.1); color: #3b82f6; } .badge-ded { background: rgba(139,92,246,0.1); color: #8b5cf6; }
.transfer-actions { display: flex; flex-direction: column; gap: 12px; }
.btn-transfer-add, .btn-transfer-remove { padding: 12px 20px; border: none; border-radius: 6px; font-weight: 800; font-size: 13px; cursor: pointer; transition: 0.2s;}
.btn-transfer-add { background: var(--primary, #3b82f6); color: #fff; box-shadow: 0 4px 10px rgba(59,130,246,0.2);}
.btn-transfer-remove { background: #fff; border: 1px solid var(--border-focus, #cbd5e1); color: var(--text-main, #1e293b); box-shadow: 0 2px 6px rgba(0,0,0,0.05);}
.btn-transfer-add:hover:not(:disabled) { background: var(--primary-hover, #2563eb); transform: translateY(-1px);}
.btn-transfer-remove:hover:not(:disabled) { background: #f8fafc; border-color: var(--text-muted, #94a3b8);}
.btn-transfer-add:disabled, .btn-transfer-remove:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; transform: none;}

/* 메모 박스 */
.memo-container { display: flex; flex-direction: column; gap: 20px; }
.memo-box {
  background: var(--bg-hover, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
}
.memo-title { font-weight: 800; font-size: 15px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;}
.memo-title i { font-size: 20px; }
.history-item { font-size: 13px; background: #f8fafc; padding: 12px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px; margin-bottom: 8px; }
.history-item .date { color: var(--text-muted, #94a3b8); font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px; }
.history-item p { margin: 0; color: var(--text-main, #1e293b); line-height: 1.5; }

/* 모바일 반응형 */
@media (max-width: 1024px) {
  .register-layout { flex-direction: column; align-items: stretch; }
  .quick-nav-sidebar { width: 100%; position: static; margin-bottom: 8px; z-index: 40; background: transparent; padding-top: 10px; max-height: none; }
  .nav-list { flex-direction: row; overflow-x: auto; padding-bottom: 12px; gap: 8px;}
  .nav-item { white-space: nowrap; padding: 10px 16px; background: #fff; border: 1px solid var(--border-color, #e2e8f0);}
  .form-group-row { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 768px) {
  .sticky-header { margin: -16px -16px 16px -16px; padding: 12px 16px; }
  .page-title { font-size: 18px; }
  .page-subtitle { display: none; }
  .form-group-row { grid-template-columns: 1fr; }
  .excel-transfer-ui { flex-direction: column; }
  .transfer-pane { width: 100%; height: 280px; }
  .transfer-actions { flex-direction: row; width: 100%; justify-content: center; }
  .setting-block { flex-direction: column; align-items: flex-start; gap: 12px; }
  .source-selection-options { flex-direction: column; align-items: flex-start; gap: 12px;}
}
</style>