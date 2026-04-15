<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from 'axios';

// =============================================
// Router & Route
// =============================================
const router = useRouter();
const route  = useRoute();

const {
  positionOptions,
  typeOptions,
  wagesData,
  fetchPositionOptions,
  fetchTypeOptions,
  fetchWageCode
} = useApi();

// =============================================
// UI 상태
// =============================================
const activeTab     = ref(route.query.tab || 'info');
const isEditing     = ref(false);
const isStaffLoaded = ref(false);

const tabs = [
  { id: 'info',      name: '기본정보',    icon: 'mdi-information-outline' },
  { id: 'contract',  name: '계약정보',    icon: 'mdi-file-document-outline' },
  { id: 'settlement',name: '정산설정',   icon: 'mdi-calculator-variant' },
  { id: 'staff',     name: '배치인원',    icon: 'mdi-account-group-outline' },
  { id: 'equipment', name: '장비현황',    icon: 'mdi-wrench-outline' },
  { id: 'memo',      name: '특이사항',    icon: 'mdi-note-text-outline' },
];

const changeTab = async (tabId) => {
  activeTab.value = tabId;
  await router.replace({ query: { ...route.query, tab: tabId } });
};

// =============================================
// 현장 기본 정보
// =============================================
const site = ref({
  siteName: '',
  siteId: '',
  siteType: '',
  businessNumber: '',
  representative: '',
  businessType: '',
  businessItem: '',
  email: '',
  zipcode: '',
  address: '',
  addressDetail: '',
  latitude: '',
  longitude: '',
  // 면적 필드 세분화 (등록 페이지와 동일하게)
  areaGross: '', // 연면적
  areaUnder: '', // 135㎡ 이하
  areaOver: '',  // 135㎡ 초과
  is_vat: false,  // 기존 과세 여부
  building_su: '',
  unit_su: '',
  managerName: '',
  managerContact: '',
  director: '',
  directorContact: '',
  memo: '',
  status: '준비 중',
  payment_day: '',
  bigo: '',
});

const siteTypeOptions  = ref(['아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const statusOptions    = ref(['준비 중', '운영 중', '계약 종료']);

// =============================================
// 계약 그룹
// =============================================
const contractGroups = ref([]);

const getItemName = (code) => {
  if (!code) return '-';
  const found = wagesData.value.find(w => w.itemCd === code);
  return found ? found.itemNm : code;
};

// =============================================
// 배치 인원
// =============================================
const assignedStaff = ref([]);

const totalAssignedStaff = computed(() => assignedStaff.value.length);

const getAssignedByGroup = (contractType) =>
    assignedStaff.value.filter(s => s.type == contractType);

// =============================================
// 장비 관리
// =============================================
const equipmentList    = ref([]);
const isEquipLoaded    = ref(false);
const isEquipModalOpen = ref(false);
const editingEquip     = ref(null);

const EQUIP_CATEGORIES = ['청소기계 (탑승/보행)', '일반 청소용구', '경비/통신장비', '안전/제설장비', '기타'];
const EQUIP_STATUS_OPTIONS = [
  { value: 'normal',   label: '정상',   color: 'success' },
  { value: 'check',    label: '수리/점검중', color: 'warning' },
  { value: 'fault',    label: '고장/폐기대기', color: 'danger'  },
];

const equipStatusMap = Object.fromEntries(EQUIP_STATUS_OPTIONS.map(o => [o.value, o]));

const getEquipIcon = (category) => {
  const icons = {
    '청소기계 (탑승/보행)': 'mdi-car-wash',
    '일반 청소용구': 'mdi-vacuum',
    '경비/통신장비': 'mdi-radio-handheld',
    '안전/제설장비': 'mdi-hard-hat',
    '기타': 'mdi-toolbox-outline'
  };
  return icons[category] || 'mdi-cog-outline';
};

const defaultEquipForm = () => ({
  name: '', category: '', quantity: 1,
  location: '', purchaseDate: '', nextCheckDate: '',
  status: 'normal', note: '',
});

const equipForm = ref(defaultEquipForm());

const equipStats = computed(() => {
  const total  = equipmentList.value.length;
  const totalQuantity = equipmentList.value.reduce((acc, cur) => acc + (Number(cur.quantity) || 0), 0);
  const normal = equipmentList.value.filter(e => e.status === 'normal').length;
  const check  = equipmentList.value.filter(e => e.status === 'check').length;
  const fault  = equipmentList.value.filter(e => e.status === 'fault').length;
  return { total, totalQuantity, normal, check, fault };
});

const equipByCategory = computed(() => {
  const map = {};
  for (const cat of EQUIP_CATEGORIES) {
    const items = equipmentList.value.filter(e => e.category === cat);
    if (items.length) map[cat] = items;
  }
  return map;
});

const openEquipModal = (equip = null) => {
  editingEquip.value = equip;
  equipForm.value = equip ? { ...equip } : defaultEquipForm();
  isEquipModalOpen.value = true;
};

const closeEquipModal = () => { isEquipModalOpen.value = false; };

const saveEquip = async () => {
  if (!equipForm.value.name || !equipForm.value.category) {
    alert('장비명과 분류를 입력해주세요.');
    return;
  }
  const sIdx = route.params.id || route.query.idx;
  try {
    if (editingEquip.value) {
      const res = await axios.put(`/api/v1/site/equipment/${editingEquip.value.idx}`, equipForm.value);
      if (res.data.result) {
        const i = equipmentList.value.findIndex(e => e.idx === editingEquip.value.idx);
        if (i !== -1) equipmentList.value[i] = { ...editingEquip.value, ...equipForm.value };
      }
    } else {
      const res = await axios.post(`/api/v1/site/equipment/${sIdx}`, equipForm.value);
      if (res.data.result) equipmentList.value.push({ idx: res.data.idx, ...equipForm.value });
    }
    closeEquipModal();
  } catch {
    if (editingEquip.value) {
      const i = equipmentList.value.findIndex(e => e.idx === editingEquip.value.idx);
      if (i !== -1) equipmentList.value[i] = { ...editingEquip.value, ...equipForm.value };
    } else {
      equipmentList.value.push({ idx: Date.now(), ...equipForm.value });
    }
    closeEquipModal();
  }
};

const deleteEquip = async (equip) => {
  if (!confirm(`'${equip.name}' 장비를 삭제하시겠습니까?`)) return;
  try {
    await axios.delete(`/api/v1/site/equipment/${equip.idx}`);
  } catch { /* 목업 모드 */ }
  equipmentList.value = equipmentList.value.filter(e => e.idx !== equip.idx);
};

const fetchEquipmentList = async () => {
  const sIdx = route.params.id || route.query.idx;
  if (!sIdx) return;
  try {
    const res = await axios.get(`/api/v1/site/equipment/${sIdx}`);
    equipmentList.value = res.data.data || [];
  } catch {
    equipmentList.value = [
      { idx: 1, name: '탑승식 습식 바닥세정기', category: '청소기계 (탑승/보행)', quantity: 1, location: '지하 1층 미화창고', purchaseDate: '2023-05-10', nextCheckDate: '2024-11-10', status: 'normal', note: '배터리 상태 양호' },
      { idx: 2, name: '건습식 진공청소기 (대형)', category: '일반 청소용구', quantity: 3, location: '각 동 미화휴게실', purchaseDate: '2024-01-15', nextCheckDate: '2024-12-15', status: 'check', note: '1동 청소기 흡입력 저하로 본사 A/S 입고' },
      { idx: 3, name: '업무용 무전기 (디지털)', category: '경비/통신장비', quantity: 6, location: '방재실 / 초소', purchaseDate: '2022-11-01', nextCheckDate: '2024-05-01', status: 'fault', note: '2대 배터리 수명 다함 (신규 기안 필요)' },
      { idx: 4, name: '엔진형 제설기', category: '안전/제설장비', quantity: 2, location: '정문 초소 옆 창고', purchaseDate: '2021-10-20', nextCheckDate: '2024-10-01', status: 'normal', note: '동절기 전 엔진오일 교체 요망' },
    ];
  }
  isEquipLoaded.value = true;
};

// =============================================
// 특이사항
// =============================================
const bigoHistory = ref([]);

// =============================================
// 직원 검색 모달 (배치인원 탭)
// =============================================
const isStaffSearchModalOpen = ref(false);
const staffSearchKeyword     = ref('');
const staffSearchResults     = ref([]);
const isSearching            = ref(false);

const newAssignment = ref({
  mIdx: null, name: '', phone: '',
  position: '', positionName: '',
  assignDate: new Date().toISOString().substring(0, 10),
});

const openStaffSearchModal = () => {
  staffSearchKeyword.value  = '';
  staffSearchResults.value  = [];
  newAssignment.value = {
    mIdx: null, name: '', phone: '',
    position: '', positionName: '',
    assignDate: new Date().toISOString().substring(0, 10),
  };
  isStaffSearchModalOpen.value = true;
};

const searchStaff = async () => {
  const sIdx = route.params.id || route.query.idx;
  if (!staffSearchKeyword.value.trim()) return;
  isSearching.value = true;
  try {
    const res = await axios.get(`/api/v1/member/staffing/${sIdx}`);
    staffSearchResults.value = res.data.data.filter(s =>
        s.name.includes(staffSearchKeyword.value) ||
        s.phone.includes(staffSearchKeyword.value)
    );
  } finally {
    isSearching.value = false;
  }
};

const selectStaffFromSearch = (staff) => {
  newAssignment.value.mIdx         = staff.idx;
  newAssignment.value.name         = staff.name;
  newAssignment.value.phone        = staff.phone;
  newAssignment.value.position     = staff.position;
  newAssignment.value.positionName = staff.role;
};

const confirmAssign = async () => {
  if (!newAssignment.value.mIdx) { alert('직원을 선택해주세요.'); return; }
  if (assignedStaff.value.find(s => s.mIdx === newAssignment.value.mIdx)) {
    alert('이미 배치된 직원입니다.'); return;
  }
  try {
    const sIdx = route.params.id || route.query.idx;
    await axios.post(`/api/v1/member/staffing/${newAssignment.value.mIdx}`, {
      sIdx,
      assignDate: newAssignment.value.assignDate,
    });
    isStaffSearchModalOpen.value = false;
    await fetchAssignedStaff();
  } catch {
    alert('배치 저장에 실패했습니다.');
  }
};

const removeAssignedStaff = async (assignIdx) => {
  if (!confirm('배치를 해제하시겠습니까?')) return;
  try {
    const res = await axios.put(`/api/v1/member/staffing/${assignIdx}`);
    if (res.data.result) {
      const idx = assignedStaff.value.findIndex(s => s.assignIdx === assignIdx);
      if (idx !== -1) assignedStaff.value.splice(idx, 1);
    }
  } catch {
    alert('배치 해제에 실패했습니다.');
  }
};

// =============================================
// 산출내역서 헬퍼
// =============================================
const makeValuesObj = (staffList, defaultVal = 0) => {
  const obj = {};
  staffList?.forEach(s => { obj[s.code] = defaultVal; });
  return obj;
};

// [추가] 산출내역서 전용 금액 입력 핸들러
const onInputCost = (item, code, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  // 1. 숫자 이외의 문자(콤마 등) 제거
  const rawValue = el.value.replace(/[^\d]/g, '');
  const numValue = Number(rawValue) || 0;

  // 2. 데이터 업데이트 (숫자형으로 유지)
  item.values[code] = numValue;

  // 3. 화면 포맷팅 (콤마 추가)
  const formatted = formatCurrency(numValue);
  el.value = formatted;

  // 4. 커서 위치 보정 (중간 수정 시 커서가 뒤로 안 튕기게 함)
  const newLength = formatted.length;
  const nextPos = selectionStart + (newLength - oldLength);
  el.setSelectionRange(nextPos, nextPos);
};

// [추가] 일반관리비, 이윤 등 단일 객체 입력 핸들러
const onInputSingleCost = (obj, code, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  const rawValue = el.value.replace(/[^\d]/g, '');
  const numValue = Number(rawValue) || 0;

  obj[code] = numValue;

  const formatted = formatCurrency(numValue);
  el.value = formatted;

  const newLength = formatted.length;
  const nextPos = selectionStart + (newLength - oldLength);
  el.setSelectionRange(nextPos, nextPos);
};

const onInputMonthlyTotal = (group, event) => {
  const el = event.target;
  const numValue = Number(el.value.replace(/[^\d]/g, '')) || 0;

  // 자동 합계 대신 이 값을 우선해서 쓰도록 필드에 저장
  group.manualMonthlyTotal = numValue;

  el.value = formatCurrency(numValue);
};

// 수동 입력값이 있으면 그것을 쓰고, 없으면 자동 계산 합계를 반환하는 computed용 함수 수정
const getDisplayMonthlyTotal = (g) => {
  if (g.manualMonthlyTotal !== undefined && g.manualMonthlyTotal !== null) {
    return g.manualMonthlyTotal;
  }
  return getTotalMonthlyFee(g); // 기존 자동 계산 함수
};

const createDefaultCostBreakdown = (staffList = []) => ({
  directLabor: [
    { label: '기본급',         values: makeValuesObj(staffList) },
    { label: '야간근로수당',    values: makeValuesObj(staffList) },
    { label: '직책수당',        values: makeValuesObj(staffList) },
    { label: '근로자의날 수당', values: makeValuesObj(staffList) },
    { label: '연차적립금',      values: makeValuesObj(staffList) },
    { label: '퇴직적립금',      values: makeValuesObj(staffList) },
  ],
  indirectLabor: [
    { label: '건강보험',     values: makeValuesObj(staffList) },
    { label: '장기요양보험', values: makeValuesObj(staffList) },
    { label: '국민연금',     values: makeValuesObj(staffList) },
    { label: '고용보험',     values: makeValuesObj(staffList) },
    { label: '산재보험',     values: makeValuesObj(staffList) },
  ],
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
  if (!group.costBreakdown) {
    group.costBreakdown = createDefaultCostBreakdown(group.staffList);
    return;
  }
  const sections     = ['directLabor', 'indirectLabor', 'expenses'];
  const currentCodes = group.staffList.map(s => s.code);
  sections.forEach(section => {
    group.costBreakdown[section].forEach(item => {
      currentCodes.forEach(code => { if (!(code in item.values)) item.values[code] = 0; });
      Object.keys(item.values).forEach(code => { if (!currentCodes.includes(code)) delete item.values[code]; });
    });
  });

  ['managementFee', 'profit'].forEach(key => {
    if (!group.costBreakdown[key]) group.costBreakdown[key] = {};
    currentCodes.forEach(code => {
      if (!(code in group.costBreakdown[key])) group.costBreakdown[key][code] = 0;
    });
    Object.keys(group.costBreakdown[key]).forEach(code => {
      if (!currentCodes.includes(code)) delete group.costBreakdown[key][code];
    });
  });
};

const getColTotal = (items, code) =>
    (items ?? []).reduce((s, item) => s + (Number(item?.values?.[code]) || 0), 0);

// ── 행 합계: 각 직책별 값의 합산 ──
const getRowTotal = (item, staffList) =>
    (staffList ?? []).reduce((s, st) => s + (Number(item.values[st.code]) || 0) * (Number(st.count) || 0), 0);

const getDirectLaborColTotal   = (g, code) => getColTotal(g.costBreakdown.directLabor,   code);
const getIndirectLaborColTotal = (g, code) => getColTotal(g.costBreakdown.indirectLabor, code);
const getExpensesColTotal      = (g, code) => getColTotal(g.costBreakdown.expenses,       code);
const getLaborColTotal         = (g, code) => getDirectLaborColTotal(g, code) + getIndirectLaborColTotal(g, code) + getExpensesColTotal(g, code);
// 일반관리비(E): 요율 계산 대신 입력된 값을 가져옴
const getManagementFeeCol = (g, code) => {
  return Number(g.costBreakdown.managementFee?.[code]) || 0;
};

// 기업이윤(F): 요율 계산 대신 입력된 값을 가져옴
const getProfitCol = (g, code) => {
  return Number(g.costBreakdown.profit?.[code]) || 0;
};
const getMonthlyTotalCol = (g, code) => getLaborColTotal(g, code) + getManagementFeeCol(g, code) + getProfitCol(g, code);
const getMonthlyFeeByStaff     = (g, s)    => getMonthlyTotalCol(g, s.code) * s.count;
const getTotalMonthlyFee       = (g)       => g.staffList.reduce((s, st) => s + getMonthlyFeeByStaff(g, st), 0);
const getSectionGrandTotal     = (g, sec)  => g.costBreakdown[sec].reduce((s, item) => s + getRowTotal(item), 0);
const getLaborGrandTotal       = (g)       => getSectionGrandTotal(g, 'directLabor') + getSectionGrandTotal(g, 'indirectLabor') + getSectionGrandTotal(g, 'expenses');
const getGroupStaffTotal       = (group)   => (group.staffList ?? []).reduce((s, i) => s + (Number(i.count) || 0), 0);

// ── 소계 행의 행합계 (전 직책 소계 합산) ──
const getSubtotalRowTotal = (g, sectionFn) =>
    g.staffList.reduce((s, st) => s + sectionFn(g, st.code) * (Number(st.count) || 0), 0);

const getContractDuration = (group) => {
  if (!group.contractStart || !group.contractEnd) return '';
  const diff   = Math.ceil(Math.abs(new Date(group.contractEnd) - new Date(group.contractStart)) / 86400000);
  const months = Math.floor(diff / 30);
  const years  = Math.floor(months / 12);
  if (years > 0) { const rem = months % 12; return rem > 0 ? `${years}년 ${rem}개월` : `${years}년`; }
  return `${months}개월`;
};

const addStaffToGroup = (groupIndex) => {
  const group = contractGroups.value[groupIndex];
  if (!group.tempJobCode) { alert('직책을 선택해주세요.'); return; }
  if (group.tempCount < 1) { alert('1명 이상 입력해주세요.'); return; }
  const jobInfo  = positionOptions.value.find(p => p.itemCd === group.tempJobCode);
  const existing = group.staffList.find(s => s.code === jobInfo.itemCd);

  if (existing) {
    existing.count += Number(group.tempCount);
  } else {
    group.staffList.push({
      code: jobInfo.itemCd,
      name: jobInfo.itemNm,
      count: Number(group.tempCount),
      schedule: createDefaultSchedule(), // 스케줄 추가
      showSchedule: true                 // 추가 시 펼치기
    });
  }
  syncCostBreakdownToStaff(group);
  group.tempJobCode = '';
  group.tempCount   = 1;
};

const removeStaffFromGroup = (groupIndex, staffIndex) => {
  contractGroups.value[groupIndex].staffList.splice(staffIndex, 1);
  syncCostBreakdownToStaff(contractGroups.value[groupIndex]);
};

const addItem    = (g, sec)      => g.costBreakdown[sec].push({ label: '', values: makeValuesObj(g.staffList) });
const removeItem = (g, sec, idx) => g.costBreakdown[sec].splice(idx, 1);

const addContractGroup = (category) => {
  contractGroups.value.push({
    category: category.itemNm, type: category.itemCd,
    contractStart: '', contractEnd: '',
    totalCost: 0, workDays: '', workSchedule: '', breakTime: '',
    staffList: [],
    costBreakdown: createDefaultCostBreakdown([]),
    showCostBreakdown: false,
  });
};

const removeContractGroup = (index) => {
  if (confirm('해당 계약 정보를 삭제하시겠습니까?')) contractGroups.value.splice(index, 1);
};

// =============================================
// 정산 설정 (Melt Options & Display Settings) 👈 [신규 추가]
// =============================================
const settlementConfig = ref({
  showGrossPay: true,
  showAnnualLeave: true,
  showSeverance: true,
  showSanjae: true,
  activeDeductionCodes: [],
  meltOptions: {
    annualLeave: false,
    severance: false
  }
});

// 공제 항목(4대보험 등) 리스트 추출 (wagesData 활용)
const deductionItems = computed(() => {
  if (!wagesData.value || !Array.isArray(wagesData.value)) return [];
  // groupCd가 '04002'인 공제 항목 필터링 (없을 경우 이름으로 폴백)
  let result = wagesData.value.filter(item => item.groupCd === '04002');
  if(result.length === 0) {
    const defaultKeywords = ['국민연금', '건강보험', '장기요양', '고용보험'];
    result = wagesData.value.filter(item => defaultKeywords.some(kw => item.itemNm.includes(kw)));
  }
  return result;
});

// 공제 항목이 로드되면 기본적으로 모두 체크되도록 초기화
watch(deductionItems, (newItems) => {
  if (newItems.length > 0 && settlementConfig.value.activeDeductionCodes.length === 0) {
    settlementConfig.value.activeDeductionCodes = newItems.map(i => i.itemCd);
  }
}, { immediate: true });

// =============================================
// 데이터 로드 / 저장 / 삭제
// =============================================
let originalData = {};

const fetchAssignedStaff = async () => {
  const sIdx = route.params.id || route.query.idx;
  if (!sIdx) return;
  try {
    const res = await axios.get(`/api/v1/site/staff/${sIdx}`);
    assignedStaff.value = res.data.data || [];
    isStaffLoaded.value = true;
    originalData.assignedStaff = JSON.parse(JSON.stringify(assignedStaff.value));
  } catch {
    console.error('배치인원 로드 실패');
  }
};

const totalArea = computed(() => {
  const under = Number(site.value.areaUnder) || 0;
  const over = Number(site.value.areaOver) || 0;
  return Math.round((under + over) * 100) / 100;
});

const isVatSite = computed(() => Number(site.value.areaOver) > 0);

// =============================================
// 직책별 스케줄(근무시간) 관리 함수 추가
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

const normalizeSchedule = (dbSchedule) => {
  const defaultSch = createDefaultSchedule();

  // 1. 아예 없거나 빈 객체 {} 인 경우 완전한 기본값 반환
  if (!dbSchedule || typeof dbSchedule !== 'object' || Object.keys(dbSchedule).length === 0) {
    return defaultSch;
  }

  // 2. 데이터가 있더라도 특정 요일이 누락되었을 수 있으므로 병합(Merge)
  const merged = {};
  for (let i = 0; i <= 6; i++) {
    // DB 데이터에 해당 요일이 있으면 쓰고, 없으면 기본값 사용
    merged[i] = dbSchedule[i] || defaultSch[i];
  }

  return merged;
};

const applyToWeekdays = (schedule) => {
  const mon = schedule[1];
  [2, 3, 4, 5].forEach(day => {
    schedule[day].isActive = mon.isActive;
    schedule[day].startTime = mon.startTime;
    schedule[day].endTime = mon.endTime;
    schedule[day].breakTime = mon.breakTime;
    schedule[day].isBiweekly = mon.isBiweekly;
  });
  alert('월요일의 일정이 화~금요일에 일괄 적용되었습니다.');
};

const getSiteData = async () => {
  const sIdx = route.params.id || route.query.idx;
  if (!sIdx) return;
  try {
    const res    = await axios.get(`/api/v1/site/data/${sIdx}`);
    const result = res.data.data[0];
    if (!result) return;

    site.value = {
      ...site.value,
      siteName:       result.name,
      siteId:         result.site_id,
      siteType:       result.sType,
      businessNumber: result.businessNumber || '',
      representative: result.representative || '',
      businessType:   result.businessType || '',
      businessItem:   result.businessItem || '',
      email:          result.email || '',
      status:         result.status === 'Y' ? '운영 중' : '계약 종료',
      areaGross:      result.area,
      areaOver:       result.areaOver,
      areaUnder:      result.areaUnder,
      is_vat:         result.is_vat === 'Y',
      address:        result.address,
      building_su:    result.building_su,
      unit_su:        result.unit_su,
      managerName:    result.manager,
      managerContact: result.phone,
      director:       result.director,
      directorContact:result.director_phone,
      payment_day:    result.payment_day,
      zipcode:        result.zipcode || '',
    };

    if (result.viewConfig) {
      try {
        const parsed =
            typeof result.viewConfig === 'string' ?
            JSON.parse(result.viewConfig) : result.viewConfig;

        // 데이터 병합
        settlementConfig.value = {
          showGrossPay: parsed.showGrossPay ?? true,
          showAnnualLeave: parsed.showAnnualLeave ?? true,
          showSeverance: parsed.showSeverance ?? true,
          showSanjae: parsed.showSanjae ?? true,
          activeDeductionCodes: parsed.activeDeductionCodes || settlementConfig.value.activeDeductionCodes,
          meltOptions: {
            annualLeave: parsed.meltOptions?.annualLeave ?? false,
            severance: parsed.meltOptions?.severance ?? false
          }
        };
      } catch(e) { console.error('viewConfig 파싱 에러:', e); }
    }

    if (result.contractList) {
      contractGroups.value = JSON.parse(result.contractList).map(item => {
        //staffList 안전 파싱 (문자열일 경우 대비)
        let rawStaff = item.staffList || [];
        if (typeof rawStaff === 'string') {
          try { rawStaff = JSON.parse(rawStaff); } catch (e) { rawStaff = []; }
        }

        // 정규화 함수(normalizeSchedule) 적용
        const staffList = rawStaff.map(staff => ({
          ...staff,
          // DB 스케줄이 불완전해도 여기서 완벽한 0~6 요일 객체로 조립됨
          schedule: normalizeSchedule(staff.schedule),
          showSchedule: false
        }));

        return {
          category:          item.category,
          type:              item.type,
          contractStart:     item.contractStart || item.startDt || '',
          contractEnd:       item.contractEnd || item.endDt || '',
          totalCost:         item.totalCost || item.total_cost || 0,
          manualMonthlyTotal: item.totalCost || item.total_cost || null,
          workDays:          item.workDays,
          workSchedule:      item.workSchedule,
          breakTime:         item.breaktime,
          staffList:         staffList, // 맵핑된 리스트 대입
          costBreakdown:     item.costBreakdown || item.budget || createDefaultCostBreakdown(staffList),
          showCostBreakdown: false,
        };
      });
    }

    if (result.bigoList) {
      try {
        bigoHistory.value = JSON.parse(result.bigoList);
        bigoHistory.value.sort((a, b) => new Date(b.regDt) - new Date(a.regDt));
      } catch { bigoHistory.value = []; }
    }

    originalData = JSON.parse(JSON.stringify({
      site: site.value,
      contractGroups: contractGroups.value,
      assignedStaff: assignedStaff.value,
      settlementConfig: settlementConfig.value,
    }));

    await fetchAssignedStaff();
  } catch {
    console.error('현장 데이터 로드 실패');
  }
};

const toggleEdit = () => {
  if (isEditing.value) {
    if (confirm('수정을 취소하시겠습니까?')) {
      site.value           = JSON.parse(JSON.stringify(originalData.site));
      contractGroups.value = JSON.parse(JSON.stringify(originalData.contractGroups));
      assignedStaff.value  = JSON.parse(JSON.stringify(originalData.assignedStaff));
      settlementConfig.value = JSON.parse(JSON.stringify(originalData.settlementConfig)); // 👈 [추가] 롤백
      isEditing.value = false;
    }
  } else {
    isEditing.value = true;
  }
};

const saveSiteData = async () => {
  if (!confirm('수정된 정보를 저장하시겠습니까?')) return;

  contractGroups.value.forEach(group => {
    const finalFee = getDisplayMonthlyTotal(group);
    group.totalCost = finalFee;
  });

  try {
    const params = {
      cIdx:             useAuthStore().user?.cIdx,
      sIdx:             route.params.id || route.query.idx,
      sType:            site.value.siteType,
      name:             site.value.siteName,
      site_id:          site.value.siteId,
      status:           site.value.status,
      businessNumber:   site.value.businessNumber,
      representative:   site.value.representative,
      businessType:     site.value.businessType,
      businessItem:     site.value.businessItem,
      email:            site.value.email,
      area:             site.value.areaGross, // 연면적
      areaOver:         site.value.areaOver,  // 과세 면적 (정산서 VAT 계산 근거)
      areaUnder:        site.value.areaUnder, // 면세 면적
      areaTotal:        totalArea.value,      // 전체 합계 면적
      is_vat:           isVatSite.value ? 'Y' : 'N',
      building_su:      site.value.building_su,
      unit_su:          site.value.unit_su,
      address:          site.value.address,
      addressDetail:    site.value.addressDetail,
      payment_day:      site.value.payment_day,
      manager:          site.value.managerName,
      phone:            site.value.managerContact,
      director:         site.value.director,
      directorContact:  site.value.directorContact,
      bigo:             site.value.bigo,
      contract_details: JSON.stringify(contractGroups.value),
      viewConfig:       JSON.stringify(settlementConfig.value),
    };
    if (isStaffLoaded.value) params.assigned_staff = JSON.stringify(assignedStaff.value);

    await axios.post('/api/v1/site/register', params);
    alert('저장되었습니다.');
    isEditing.value = false;
    originalData = JSON.parse(JSON.stringify({
      site: site.value,
      contractGroups: contractGroups.value,
      assignedStaff: assignedStaff.value,
      settlementConfig: settlementConfig.value
    }));
  } catch {
    alert('저장에 실패했습니다.');
  }
};

const deleteSite = async () => {
  if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  try {
    await axios.delete(`/api/v1/site/${route.params.id || route.query.idx}`);
    alert('삭제되었습니다.');
    router.push('/site/list');
  } catch {
    alert('삭제에 실패했습니다.');
  }
};

const goBack = () => router.push('/site/list');

// =============================================
// 주소 검색 (카카오 우편번호)
// =============================================
const detailInput = ref(null);

const loadDaumPostcodeScript = () => new Promise((resolve) => {
  if (window.kakao?.Postcode) { resolve(); return; }
  const script  = document.createElement('script');
  script.src    = '//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
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
      site.value.zipcode       = data.zonecode;
      site.value.address       = addr;
      site.value.addressDetail = '';
      detailInput.value?.focus();
    },
  }).open();
};

// =============================================
// Watchers & Lifecycle
// =============================================
watch(activeTab, async (newTab) => {
  if (newTab === 'staff'     && !isStaffLoaded.value) await fetchAssignedStaff();
  if (newTab === 'equipment' && !isEquipLoaded.value) await fetchEquipmentList();
});

onMounted(async () => {
  await Promise.all([fetchPositionOptions(), fetchTypeOptions(), fetchWageCode()]);
  await getSiteData();
  if (activeTab.value === 'equipment') await fetchEquipmentList();
});
</script>

<template>
  <div class="site-detail-page">

    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <button @click="goBack" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title"><i class="mdi mdi-office-building-outline"></i> 현장 상세정보</h1>
          <p class="page-subtitle">현장의 상세 정보를 확인하고 관리합니다</p>
        </div>
      </div>
      <div class="header-actions">
        <template v-if="!isEditing">
          <button @click="toggleEdit"  class="btn-edit">  <i class="mdi mdi-pencil-outline"></i><span>수정</span></button>
          <button @click="deleteSite"  class="btn-delete"><i class="mdi mdi-trash-can-outline"></i><span>삭제</span></button>
        </template>
        <template v-else>
          <button @click="toggleEdit"  class="btn-cancel"><i class="mdi mdi-close"></i><span>취소</span></button>
          <button @click="saveSiteData" class="btn-save"> <i class="mdi mdi-check"></i><span>저장</span></button>
        </template>
      </div>
    </div>

    <!-- 프로필 카드 -->
    <div class="profile-card">
      <div class="profile-banner"></div>
      <div class="profile-content">
        <div class="profile-icon-section">
          <div class="profile-icon"><i class="mdi mdi-domain"></i></div>
        </div>
        <div class="profile-info">
          <div class="profile-main">
            <h2 class="profile-name">{{ site.siteName || '현장명 없음' }}</h2>
            <span :class="['status-badge', site.status === '운영 중' ? 'status-active' : site.status === '준비 중' ? 'status-pending' : 'status-inactive']">
              <i :class="['mdi', site.status === '운영 중' ? 'mdi-check-circle-outline' : site.status === '준비 중' ? 'mdi-clock-outline' : 'mdi-close-circle-outline']"></i>
              {{ site.status }}
            </span>
          </div>
          <div class="profile-details">
            <div class="detail-item"><i class="mdi mdi-barcode"></i><span>{{ site.siteId || '코드 없음' }}</span></div>
            <div class="detail-item"><i class="mdi mdi-tag-outline"></i><span>{{ site.siteType || '-' }}</span></div>
            <div class="detail-item"><i class="mdi mdi-map-marker-outline"></i><span>{{ site.address || '-' }}</span></div>
          </div>
        </div>
        <div class="profile-stats">
          <div class="stat-item">
            <div class="stat-icon stat-blue"><i class="mdi mdi-ruler-square"></i></div>
            <div class="stat-content"><span class="stat-label">관리면적</span><span class="stat-value">{{ site.area || '0' }}㎡</span></div>
          </div>
          <div class="stat-item">
            <div class="stat-icon stat-green"><i class="mdi mdi-office-building-outline"></i></div>
            <div class="stat-content"><span class="stat-label">건물/세대</span><span class="stat-value">{{ site.building_su || '0' }}/{{ site.unit_su || '0' }}</span></div>
          </div>
          <div class="stat-item">
            <div class="stat-icon stat-orange"><i class="mdi mdi-account-group-outline"></i></div>
            <div class="stat-content"><span class="stat-label">배치인원</span><span class="stat-value">{{ totalAssignedStaff }}명</span></div>
          </div>
          <div class="stat-item">
            <div class="stat-icon stat-purple"><i class="mdi mdi-wrench-outline"></i></div>
            <div class="stat-content"><span class="stat-label">등록장비</span><span class="stat-value">{{ equipmentList.length }}종</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 탭 네비게이션 -->
    <div class="integrated-tabs">
      <button v-for="tab in tabs" :key="tab.id"
              :class="['tab-button', { active: activeTab === tab.id }]"
              @click="changeTab(tab.id)">
        <i :class="['mdi', tab.icon]"></i><span>{{ tab.name }}</span>
        <span v-if="tab.id === 'equipment' && equipStats.fault > 0" class="tab-alert-badge">
          {{ equipStats.fault }}
        </span>
      </button>
    </div>

    <!-- 탭 콘텐츠 -->
    <div class="integrated-content">

      <!-- ── 기본정보 탭 ── -->
      <div v-show="activeTab === 'info'" class="tab-panel">
        <div class="info-sections">

          <div class="info-section">
            <div class="section-header"><i class="mdi mdi-domain"></i><h3>현장 정보</h3></div>
            <div class="info-grid">
              <div class="info-item">
                <label>현장명</label>
                <input v-if="isEditing" type="text" v-model="site.siteName" class="info-input" />
                <span v-else class="info-value">{{ site.siteName }}</span>
              </div>
              <div class="info-item">
                <label>현장 코드</label>
                <input v-if="isEditing" type="text" v-model="site.siteId" class="info-input" />
                <span v-else class="info-value">{{ site.siteId || '-' }}</span>
              </div>
              <div class="info-item">
                <label>현장 형태</label>
                <select v-if="isEditing" v-model="site.siteType" class="info-select">
                  <option v-for="type in siteTypeOptions" :key="type" :value="type">{{ type }}</option>
                </select>
                <span v-else class="info-value">{{ site.siteType }}</span>
              </div>
              <div class="info-item">
                <label>현장 상태</label>
                <select v-if="isEditing" v-model="site.status" class="info-select">
                  <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>
                </select>
                <span v-else :class="['info-value', site.status === '운영 중' ? 'text-green' : site.status === '준비 중' ? 'text-orange' : 'text-gray']">{{ site.status }}</span>
              </div>
              <!--div class="info-item">
                <label>관리면적</label>
                <div v-if="isEditing" class="area-input">
                  <input type="text" v-model="site.area" class="info-input" />
                  <label class="checkbox-inline-small"><input type="checkbox" v-model="site.is_vat" /><span>135㎡ 초과</span></label>
                </div>
                <span v-else class="info-value">{{ site.area }}㎡ <span v-if="site.is_vat" class="badge badge-red">VAT 과세</span></span>
              </div-->
              <div class="info-item">
                <label>건물 수</label>
                <input v-if="isEditing" type="number" v-model="site.building_su" class="info-input" />
                <span v-else class="info-value">{{ site.building_su }}동</span>
              </div>
              <div class="info-item">
                <label>세대 수</label>
                <input v-if="isEditing" type="number" v-model="site.unit_su" class="info-input" />
                <span v-else class="info-value">{{ site.unit_su }}세대</span>
              </div>
              <div class="info-item">
                <label>급여지급일</label>
                <select v-if="isEditing" v-model="site.payment_day" class="info-select">
                  <option v-for="day in 31" :key="day" :value="day">{{ day }}일</option>
                </select>
                <span v-else class="info-value">매월 {{ site.payment_day }}일</span>
              </div>
            </div>
          </div>

          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-calculator-variant"></i>
              <h3>면적 및 과세 설정 (정산 근거)</h3>
            </div>
            <div class="info-grid">

              <div class="info-item">
                <label>연면적</label>
                <div v-if="isEditing" class="input-with-unit">
                  <input type="number" v-model="site.areaGross" class="info-input text-right" placeholder="0" />
                  <span class="unit">㎡</span>
                </div>
                <span v-else class="info-value">{{ site.areaGross || 0 }} ㎡</span>
              </div>

              <div class="info-item">
                <label>135㎡ 이하 (면세)</label>
                <div v-if="isEditing" class="input-with-unit">
                  <input type="number" v-model="site.areaUnder" class="info-input text-right" placeholder="0" />
                  <span class="unit">㎡</span>
                </div>
                <span v-else class="info-value">{{ site.areaUnder || 0 }} ㎡</span>
              </div>

              <div class="info-item">
                <label>135㎡ 초과 (과세)</label>
                <div v-if="isEditing" class="input-with-unit">
                  <input type="number" v-model="site.areaOver" class="info-input text-right" placeholder="0" />
                  <span class="unit">㎡</span>
                </div>
                <span v-else class="info-value">{{ site.areaOver || 0 }} ㎡</span>
              </div>

              <div class="info-item full-width">
                <label>총 관리면적 및 과세여부</label>

                <div class="calculated-area-box">
                  <span class="total-number">{{ totalArea || site.area || 0 }} <small>㎡</small></span>

                  <span :class="['vat-badge', isVatSite ? 'vat-red' : 'vat-green']">
          <i :class="['mdi', isVatSite ? 'mdi-check-circle' : 'mdi-minus-circle']"></i>
          {{ isVatSite ? '과세 대상 (VAT Y)' : '면세 대상 (VAT N)' }}
        </span>
                </div>

                <p v-if="isEditing" class="info-helper-text">
                  * 135㎡ 초과(과세) 면적을 입력하면 <strong>과세 대상</strong>으로 자동 전환되며, 정산 시 VAT가 생성됩니다.
                </p>
              </div>

            </div>
          </div>

          <div class="info-section">
            <div class="section-header"><i class="mdi mdi-map-marker-outline"></i><h3>주소 정보</h3></div>
            <div class="info-grid">
              <div class="info-item full-width">
                <label>우편번호</label>
                <div v-if="isEditing" class="address-search-group">
                  <input type="text" v-model="site.zipcode" class="info-input postal-input" readonly />
                  <button type="button" @click="searchAddress" class="btn-search-small"><i class="mdi mdi-magnify"></i> 주소 검색</button>
                </div>
                <span v-else class="info-value">{{ site.zipcode || '-' }}</span>
              </div>
              <div class="info-item full-width">
                <label>현장 주소</label>
                <input v-if="isEditing" type="text" v-model="site.address" class="info-input" readonly />
                <span v-else class="info-value">{{ site.address }}</span>
              </div>
            </div>
          </div>

          <div class="info-section">
            <div class="section-header"><i class="mdi mdi-account-tie-outline"></i><h3>담당자 정보</h3></div>
            <div class="info-grid">
              <div class="info-item">
                <label>본사 담당자</label>
                <input v-if="isEditing" type="text" v-model="site.managerName" class="info-input" />
                <span v-else class="info-value">{{ site.managerName || '-' }}</span>
              </div>
              <div class="info-item">
                <label>본사 담당자 연락처</label>
                <input v-if="isEditing" type="tel" v-model="site.managerContact" class="info-input" />
                <span v-else class="info-value">{{ site.managerContact || '-' }}</span>
              </div>
              <div class="info-item">
                <label>관리 소장</label>
                <input v-if="isEditing" type="text" v-model="site.director" class="info-input" />
                <span v-else class="info-value">{{ site.director }}</span>
              </div>
              <div class="info-item">
                <label>관리 소장 연락처</label>
                <input v-if="isEditing" type="tel" v-model="site.directorContact" class="info-input" />
                <span v-else class="info-value">{{ site.directorContact }}</span>
              </div>
            </div>
          </div>

          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-card-account-details-outline"></i>
              <h3>사업자 정보</h3>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <label>사업자등록번호</label>
                <input v-if="isEditing" type="text" v-model="site.businessNumber" class="info-input" placeholder="예: 123-45-67890" />
                <span v-else class="info-value">{{ site.businessNumber || '-' }}</span>
              </div>
              <div class="info-item">
                <label>대표자명</label>
                <input v-if="isEditing" type="text" v-model="site.representative" class="info-input" />
                <span v-else class="info-value">{{ site.representative || '-' }}</span>
              </div>
              <div class="info-item">
                <label>업태</label>
                <input v-if="isEditing" type="text" v-model="site.businessType" class="info-input" />
                <span v-else class="info-value">{{ site.businessType || '-' }}</span>
              </div>
              <div class="info-item">
                <label>종목</label>
                <input v-if="isEditing" type="text" v-model="site.businessItem" class="info-input" />
                <span v-else class="info-value">{{ site.businessItem || '-' }}</span>
              </div>
              <div class="info-item">
                <label>이메일 (세금계산서/공문 수신용)</label>
                <input v-if="isEditing" type="email" v-model="site.email" class="info-input" />
                <span v-else class="info-value">{{ site.email || '-' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 계약정보 탭 ── -->
      <div v-show="activeTab === 'contract'" class="tab-panel">
        <div v-if="isEditing" class="contract-actions-top">
          <button v-for="cat in typeOptions" :key="cat.itemCd" type="button"
                  @click="addContractGroup(cat)" class="btn-add-contract-small">
            <i class="mdi mdi-plus"></i>{{ cat.itemNm }} 추가
          </button>
        </div>

        <div v-if="contractGroups.length === 0" class="empty-state">
          <i class="mdi mdi-file-document-outline"></i><p>등록된 계약이 없습니다</p>
        </div>

        <div class="contract-list">
          <div v-for="(group, idx) in contractGroups" :key="idx" class="contract-card-detail">
            <div class="contract-card-header">
              <div class="contract-title-row">
                <span :class="['contract-badge', `badge-${group.category}`]">
                  <i class="mdi mdi-briefcase-outline"></i>{{ group.category }}
                </span>
                <span v-if="getContractDuration(group)" class="contract-duration">
                  <i class="mdi mdi-calendar-range"></i>{{ getContractDuration(group) }}
                </span>
                <span class="assigned-count-chip">
                  <i class="mdi mdi-account-check-outline"></i>
                  배치 {{ getAssignedByGroup(group.type).length }}명
                </span>
              </div>
              <button v-if="isEditing" type="button" @click="removeContractGroup(idx)" class="btn-remove-small">
                <i class="mdi mdi-trash-can-outline"></i>
              </button>
            </div>

            <div class="contract-card-body">
              <div class="contract-info-grid">
                <div class="contract-info-item">
                  <label>계약 시작일</label>
                  <input v-if="isEditing" type="date" v-model="group.contractStart" class="info-input" />
                  <span v-else class="info-value">{{ group.contractStart }}</span>
                </div>
                <div class="contract-info-item">
                  <label>계약 종료일</label>
                  <input v-if="isEditing" type="date" v-model="group.contractEnd" class="info-input" />
                  <span v-else class="info-value">{{ group.contractEnd }}</span>
                </div>
                <div class="contract-info-item full-width">
                  <label>근무 시간 및 형태</label>
                  <textarea v-if="isEditing" v-model="group.workSchedule" class="info-textarea" rows="2"></textarea>
                  <span v-else class="info-value">{{ group.workSchedule || '-' }}</span>
                </div>
                <div class="contract-info-item full-width">
                  <label>휴게 시간</label>
                  <input v-if="isEditing" type="text" v-model="group.breakTime" class="info-input" />
                  <span v-else class="info-value">{{ group.breakTime || '-' }}</span>
                </div>
              </div>

              <!-- 인원 구성 -->
              <div class="staff-info-grid">
                <label class="section-label"><i class="mdi mdi-account-group-outline"></i>인원 구성 및 스케줄</label>

                <div v-if="isEditing" class="staff-input-group">
                  <select v-model="group.tempJobCode" class="info-select staff-position-select">
                    <option value="">직책 선택</option>
                    <option v-for="opt in positionOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
                  </select>
                  <input type="number" v-model="group.tempCount" min="1" class="info-input staff-count-input text-right" placeholder="인원 수" />
                  <button type="button" @click="addStaffToGroup(idx)" class="btn-add-staff-small">
                    <i class="mdi mdi-plus"></i> 추가
                  </button>
                </div>

                <div v-if="group.staffList?.length > 0" class="staff-list-vertical">
                  <div v-for="(staff, sIdx) in group.staffList" :key="sIdx" class="staff-item-wrapper">

                    <div class="staff-member-card">
                      <div class="staff-member-info">
                        <i class="mdi mdi-account-outline"></i>
                        <div class="staff-member-details">
                          <span class="staff-position">{{ staff.name }}</span>
                          <span class="staff-count">{{ staff.count }}명</span>
                        </div>
                      </div>
                      <div class="staff-actions">
                        <button type="button" @click="staff.showSchedule = !staff.showSchedule" class="btn-toggle-schedule" :class="{ 'active': staff.showSchedule }">
                          <i class="mdi" :class="staff.showSchedule ? 'mdi-calendar-collapse-horizontal' : 'mdi-calendar-expand-horizontal'"></i>
                          근무 설정
                        </button>
                        <button v-if="isEditing" type="button" @click="removeStaffFromGroup(idx, sIdx)" class="btn-remove-staff-small">
                          <i class="mdi mdi-close"></i>
                        </button>
                      </div>
                    </div>

                    <div v-show="staff.showSchedule" class="schedule-panel">
                      <div class="schedule-header">
                        <span><i class="mdi mdi-clock-outline"></i> 요일별 근무시간</span>
                        <button v-if="isEditing" type="button" @click="applyToWeekdays(staff.schedule)" class="btn-batch-apply">
                          <i class="mdi mdi-layers-outline"></i> 평일 일괄 적용
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
                          <tr v-for="day in weekDays" :key="day.val" :class="{'inactive-row': !staff.schedule[day.val].isActive}">
                            <td>
                              <label class="day-checkbox" :class="{'disabled': !isEditing}">
                                <input type="checkbox" v-model="staff.schedule[day.val].isActive" :disabled="!isEditing" />
                                <span :class="{'text-red': day.val === 0, 'text-blue': day.val === 6}">{{ day.label }}</span>
                              </label>
                            </td>
                            <td>
                              <div class="time-inputs" v-if="staff.schedule[day.val].isActive">
                                <input type="time" v-model="staff.schedule[day.val].startTime" :disabled="!isEditing" class="info-input time-input" />
                                <span>~</span>
                                <input type="time" v-model="staff.schedule[day.val].endTime" :disabled="!isEditing" class="info-input time-input" />
                              </div>
                              <span v-else class="text-muted" style="font-size:12px;">휴무</span>
                            </td>
                            <td>
                              <input v-if="staff.schedule[day.val].isActive" type="number" v-model="staff.schedule[day.val].breakTime" :disabled="!isEditing" class="info-input break-input" min="0" placeholder="0" />
                              <span v-else class="text-muted">-</span>
                            </td>
                            <td>
                              <label class="biweekly-checkbox" v-if="staff.schedule[day.val].isActive" :class="{'disabled': !isEditing}">
                                <input type="checkbox" v-model="staff.schedule[day.val].isBiweekly" :disabled="!isEditing" />
                                <span>격주</span>
                              </label>
                              <span v-else class="text-muted">-</span>
                            </td>
                          </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                </div>

                <div v-else class="empty-staff-text"><p>수정 모드에서 직책을 추가해주세요.</p></div>

                <div v-if="group.staffList?.length > 0" class="staff-total-bar" style="margin-top: 12px;">
                  <i class="mdi mdi-sigma"></i>
                  <span>필요 인원 합계: <strong>{{ getGroupStaffTotal(group) }}명</strong></span>
                </div>
              </div>

              <!-- 산출내역서 -->
              <div class="cost-breakdown-wrapper">
                <button type="button" class="btn-toggle-cost" @click="group.showCostBreakdown = !group.showCostBreakdown">
                  <i :class="group.showCostBreakdown ? 'mdi mdi-chevron-up' : 'mdi mdi-chevron-down'"></i>
                  <span>{{ group.showCostBreakdown ? '산출내역서 접기' : '산출내역서 펼치기' }}</span>

                  <span v-if="getDisplayMonthlyTotal(group) > 0" class="cost-preview-badge">
                    월 {{ formatCurrency(getDisplayMonthlyTotal(group)) }}원
                  </span>
                </button>

                <div v-show="group.showCostBreakdown" class="cost-breakdown-section">
                  <div v-if="!group.staffList?.length" class="cost-no-staff">
                    <i class="mdi mdi-table-plus"></i>
                    <p>직책별 인원 구성을 먼저 설정해주세요.</p>
                  </div>
                  <template v-else>
                    <div class="cost-scroll-area">

                      <!-- ══ 직접노무비 ══ -->
                      <div class="cost-section-title">
                        <span class="cost-block-label label-direct">A</span>직접노무비 <em>(지급내역)</em>
                        <button v-if="isEditing" type="button" @click="addItem(group, 'directLabor')" class="btn-add-cost-item"><i class="mdi mdi-plus"></i>항목 추가</button>
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
                          <th class="col-bigo">산출내역</th>
                          <th v-if="isEditing" class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, iIdx) in group.costBreakdown.directLabor" :key="'dl-'+iIdx">
                          <td>
                            <span v-if="!isEditing">{{ getItemName(item.label) }}</span>
                            <CodeSelect v-else v-model="item.label" :allow-empty="false"/>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <span v-if="!isEditing">{{ formatCurrency(item.values[staff.code]) }}</span>
                            <input
                                v-else
                                type="text"
                                :value="formatCurrency(item.values[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputCost(item, staff.code, $event)"
                                class="tbl-value-input"
                            />
                          </td>
                          <!-- 행합계 -->
                          <td class="col-rowtotal-cell">
                            {{ formatCurrency(getRowTotal(item, group.staffList)) }}
                          </td>
                          <td><span v-if="!isEditing">{{ item.bigo }}</span><input v-else type="text" class="tbl-value-input" v-model="item.bigo" /></td>
                          <td v-if="isEditing"><button type="button" @click="removeItem(group, 'directLabor', iIdx)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button></td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (A)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">{{ formatCurrency(getDirectLaborColTotal(group, staff.code)) }}</td>
                          <!-- 소계 행합계 -->
                          <td class="col-rowtotal-cell subtotal-rowtotal">
                            {{ formatCurrency(getSubtotalRowTotal(group, getDirectLaborColTotal)) }}
                          </td>
                          <td><input v-if="isEditing" type="text" class="tbl-value-input"><span v-else></span></td>
                          <td v-if="isEditing"></td>
                        </tr>
                        </tfoot>
                      </table>

                      <!-- ══ 간접노무비 ══ -->
                      <div class="cost-section-title">
                        <span class="cost-block-label label-indirect">B</span>간접노무비 <em>(공제내역)</em>
                        <button v-if="isEditing" type="button" @click="addItem(group, 'indirectLabor')" class="btn-add-cost-item"><i class="mdi mdi-plus"></i>항목 추가</button>
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
                          <th class="col-bigo">산출내역</th>
                          <th v-if="isEditing" class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, iIdx) in group.costBreakdown.indirectLabor" :key="'il-'+iIdx">
                          <td>
                            <span v-if="!isEditing">{{ getItemName(item.label) }}</span>
                            <CodeSelect v-else v-model="item.label" />
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <span v-if="!isEditing">{{ formatCurrency(item.values[staff.code]) }}</span>
                            <input
                                v-else
                                type="text"
                                :value="formatCurrency(item.values[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputCost(item, staff.code, $event)"
                                class="tbl-value-input"
                            />
                          </td>
                          <td class="col-rowtotal-cell">
                            {{ formatCurrency(getRowTotal(item, group.staffList)) }}
                          </td>
                          <td><span v-if="!isEditing">{{ item.bigo }}</span><input v-else type="text" class="tbl-value-input" v-model="item.bigo" /></td>
                          <td v-if="isEditing"><button type="button" @click="removeItem(group, 'indirectLabor', iIdx)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button></td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (B)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">{{ formatCurrency(getIndirectLaborColTotal(group, staff.code)) }}</td>
                          <td class="col-rowtotal-cell subtotal-rowtotal">
                            {{ formatCurrency(getSubtotalRowTotal(group, getIndirectLaborColTotal)) }}
                          </td>
                          <td><input v-if="isEditing" type="text" class="tbl-value-input"><span v-else></span></td>
                          <td v-if="isEditing"></td>
                        </tr>
                        </tfoot>
                      </table>

                      <!-- ══ 제경비 ══ -->
                      <div class="cost-section-title">
                        <span class="cost-block-label label-expense">C</span>제경비
                        <button v-if="isEditing" type="button" @click="addItem(group, 'expenses')" class="btn-add-cost-item"><i class="mdi mdi-plus"></i>항목 추가</button>
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
                          <th class="col-bigo">산출내역</th>
                          <th v-if="isEditing" class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, eIdx) in group.costBreakdown.expenses" :key="'exp-'+eIdx">
                          <td>
                            <span v-if="!isEditing">{{ getItemName(item.label) }}</span>
                            <CodeSelect v-else v-model="item.label" />
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <span v-if="!isEditing">{{ formatCurrency(item.values[staff.code]) }}</span>
                            <input
                                v-else
                                type="text"
                                :value="formatCurrency(item.values[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputCost(item, staff.code, $event)"
                                class="tbl-value-input"
                            />
                          </td>
                          <td class="col-rowtotal-cell">
                            {{ formatCurrency(getRowTotal(item, group.staffList)) }}
                          </td>
                          <td>
                            <span v-if="!isEditing">{{ item.bigo }}</span>
                            <input
                                v-else type="text"
                                class="tbl-value-input"
                                v-model="item.bigo"
                            />
                          </td>
                          <td v-if="isEditing"><button type="button" @click="removeItem(group, 'expenses', eIdx)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button></td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (C)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">{{ formatCurrency(getExpensesColTotal(group, staff.code)) }}</td>
                          <td class="col-rowtotal-cell subtotal-rowtotal">
                            {{ formatCurrency(getSubtotalRowTotal(group, getExpensesColTotal)) }}
                          </td>
                          <td><input v-if="isEditing" type="text" class="tbl-value-input"><span v-else></span></td>
                          <td v-if="isEditing"></td>
                        </tr>
                        </tfoot>
                      </table>

                      <!-- ══ 합계 ══ -->
                      <div class="cost-section-title">
                        <span class="cost-block-label label-total">합계</span>노무비 합계 및 용역비 산출
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
                          <th class="col-bigo">산출 내역</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr class="summary-row row-d">
                          <td><span class="summary-label"><span class="cost-block-label label-total">D</span>노무비 합계 (A+B+C)</span></td>
                          <td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val">{{ formatCurrency(getLaborColTotal(group, staff.code)) }}</span></td>
                          <td class="col-rowtotal-cell">
                            <span class="summary-val">{{ formatCurrency(getSubtotalRowTotal(group, getLaborColTotal)) }}</span>
                          </td>
                          <td><input v-if="isEditing" type="text" class="tbl-value-input"><span v-else></span></td>
                        </tr>
                        <tr class="summary-row row-e">
                          <td>
                            <div class="summary-label-rate">
                                <span class="summary-label">
                                  <span class="cost-block-label label-mgmt">E</span>일반관리비
                                </span>
                            </div>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <span v-if="!isEditing" class="summary-val">{{ formatCurrency(getManagementFeeCol(group, staff.code)) }}</span>
                            <input
                                v-else
                                type="text"
                                :value="formatCurrency(group.costBreakdown.managementFee[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputSingleCost(group.costBreakdown.managementFee, staff.code, $event)"
                                class="tbl-value-input text-right"
                            />
                          </td>
                          <td class="col-rowtotal-cell">
                            <span class="summary-val">{{ formatCurrency(getSubtotalRowTotal(group, getManagementFeeCol)) }}</span>
                          </td>
                          <td><input v-if="isEditing" type="text" class="tbl-value-input"><span v-else></span></td>
                        </tr>

                        <tr class="summary-row row-f">
                          <td>
                            <div class="summary-label-rate">
                                <span class="summary-label">
                                  <span class="cost-block-label label-profit">F</span>기업이윤
                                </span>
                            </div>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <span v-if="!isEditing" class="summary-val">{{ formatCurrency(getProfitCol(group, staff.code)) }}</span>
                            <input
                                v-else
                                type="text"
                                :value="formatCurrency(group.costBreakdown.profit[staff.code])"
                                @focus="$event.target.select()"
                                @input="onInputSingleCost(group.costBreakdown.profit, staff.code, $event)"
                                class="tbl-value-input text-right"
                            />
                          </td>
                          <td class="col-rowtotal-cell">
                            <span class="summary-val">{{ formatCurrency(getSubtotalRowTotal(group, getProfitCol)) }}</span>
                          </td>
                          <td><input v-if="isEditing" type="text" class="tbl-value-input"><span v-else></span></td>
                        </tr>
                        <tr class="summary-row row-monthly">
                          <td><span class="summary-label"><span class="cost-block-label label-monthly">월</span>1인당 월 용역비 (D+E+F)</span></td>
                          <td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val highlight">{{ formatCurrency(getMonthlyTotalCol(group, staff.code)) }}</span></td>
                          <td class="col-rowtotal-cell">
                            <span class="summary-val highlight">{{ formatCurrency(getSubtotalRowTotal(group, getMonthlyTotalCol)) }}</span>
                          </td>
                          <td><input v-if="isEditing" type="text" class="tbl-value-input"><span v-else></span></td>
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
                                v-if="isEditing"
                                type="text"
                                :value="formatCurrency(getDisplayMonthlyTotal(group))"
                                @focus="$event.target.select()"
                                @input="onInputMonthlyTotal(group, $event)"
                                class="tbl-value-input grand-total-input"
                                />
                            <span v-else class="summary-val grand-total">
                              {{ formatCurrency(getDisplayMonthlyTotal(group)) }}
                            </span>
                          </td>

                          <td class="col-rowtotal-cell">
                            <span class="summary-val grand-total">
                            {{ formatCurrency(getDisplayMonthlyTotal(group)) }}
                          </span>
                          </td>
                          <td><input v-if="isEditing" type="text" class="tbl-value-input"><span v-else></span></td>
                        </tr>
                        <!--tr>
                          <td><span class="summary-label"><span class="cost-block-label label-total-fee">합</span>입찰 금액 (계약기간 총 용역비)</span></td>
                          <td :colspan="group.staffList.length">
                            <input v-if="isEditing" type="text" class="tbl-value-input">
                            <span v-else></span>
                          </td>
                          <td></td>
                          <td class="col-rowtotal-cell"></td>
                        </tr-->
                        </tbody>
                      </table>

                    </div><!-- /cost-scroll-area -->
                    <div class="cost-special-note">
                      <label class="form-label"><i class="mdi mdi-text-box-edit-outline"></i>특이사항</label>
                      <textarea :disabled="!isEditing" v-model="group.costBreakdown.specialNote" class="form-textarea" rows="3" placeholder="예: 최저임금 기준 적용, 5대보험 전원 가입 조건 등"></textarea>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 정산정보 탭 -->
      <div v-show="activeTab === 'settlement'" class="tab-panel">
        <div class="info-sections">

          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-calculator-variant"></i>
              <h3>공제 계산 시 포함 (Melt Options)</h3>
            </div>
            <p class="info-helper-text" style="margin-bottom:20px;">
              * 4대보험 등 공제액 계산 시 기본급 외에 연차수당, 퇴직충당금을 베이스 금액에 포함할지 기본값을 설정합니다.<br>
              * 정산서 모달을 열 때마다 여기서 설정한 값이 기본으로 적용됩니다.
            </p>

            <div class="config-toggle-wrapper">
              <label class="config-toggle-item" :class="{'disabled': !isEditing}">
                <span class="font-bold text-red">연차수당 포함</span>
                <div class="switch">
                  <input type="checkbox" v-model="settlementConfig.meltOptions.annualLeave" :disabled="!isEditing" />
                  <span class="slider round"></span>
                </div>
              </label>

              <label class="config-toggle-item" :class="{'disabled': !isEditing}">
                <span class="font-bold text-red">퇴직충당금 포함</span>
                <div class="switch">
                  <input type="checkbox" v-model="settlementConfig.meltOptions.severance" :disabled="!isEditing" />
                  <span class="slider round"></span>
                </div>
              </label>
            </div>
          </div>

          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-filter-variant"></i>
              <h3>정산 세부내역서 표시 항목 설정</h3>
            </div>
            <p class="info-helper-text" style="margin-bottom:20px;">
              * 정산 세부내역서 엑셀 테이블에서 기본적으로 노출/숨김 처리할 항목을 선택합니다.
            </p>

            <div class="deduction-toggles-grid">
              <div class="grid-group-label">기본 급여/수당 영역</div>
              <div class="config-checkbox-group">
                <label class="config-checkbox" :class="{'disabled': !isEditing}">
                  <input type="checkbox" v-model="settlementConfig.showGrossPay" :disabled="!isEditing" />
                  <span class="font-bold text-blue">급여(지급총액)</span>
                </label>
                <label class="config-checkbox" :class="{'disabled': !isEditing}">
                  <input type="checkbox" v-model="settlementConfig.showAnnualLeave" :disabled="!isEditing" />
                  <span class="font-bold text-orange">연차수당</span>
                </label>
                <label class="config-checkbox" :class="{'disabled': !isEditing}">
                  <input type="checkbox" v-model="settlementConfig.showSeverance" :disabled="!isEditing" />
                  <span class="font-bold text-orange">퇴직충당금</span>
                </label>
              </div>

              <div class="grid-divider"></div>

              <div class="grid-group-label">보험/공제 영역</div>
              <div class="config-checkbox-group">
                <label class="config-checkbox" :class="{'disabled': !isEditing}">
                  <input type="checkbox" v-model="settlementConfig.showSanjae" :disabled="!isEditing" />
                  <span class="font-bold text-orange">산재보험</span>
                </label>

                <label v-for="item in deductionItems" :key="item.itemCd" class="config-checkbox" :class="{'disabled': !isEditing}">
                  <input type="checkbox" :value="item.itemCd" v-model="settlementConfig.activeDeductionCodes" :disabled="!isEditing" />
                  <span>{{ item.itemNm }}</span>
                </label>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ── 배치인원 탭 ── -->
      <div v-show="activeTab === 'staff'" class="tab-panel">
        <div class="staff-overview">
          <div class="overview-card">
            <div class="overview-icon-wrap oc-blue"><i class="mdi mdi-account-group-outline"></i></div>
            <div class="overview-content">
              <span class="overview-label">총 배치인원</span>
              <span class="overview-value">{{ totalAssignedStaff }}명</span>
            </div>
          </div>
          <div v-for="group in contractGroups" :key="group.type" class="overview-card">
            <div :class="['overview-icon-wrap', `oc-badge-${group.category}`]"><i class="mdi mdi-briefcase-outline"></i></div>
            <div class="overview-content">
              <span class="overview-label">{{ group.category }}</span>
              <span class="overview-value">{{ getAssignedByGroup(group.type).length }}명</span>
            </div>
          </div>
        </div>

        <div class="staff-tab-actions">
          <button type="button" class="btn-assign-staff" @click="openStaffSearchModal">
            <i class="mdi mdi-account-plus-outline"></i> 직원 배치
          </button>
        </div>

        <div v-if="assignedStaff.length === 0" class="empty-state">
          <i class="mdi mdi-account-off-outline"></i>
          <p>배치된 직원이 없습니다</p>
          <span>직원 배치 버튼을 눌러 직원을 추가해주세요</span>
        </div>

        <div v-else class="assigned-staff-sections">
          <template v-for="group in contractGroups" :key="group.type">
            <div v-if="getAssignedByGroup(group.type).length > 0" class="assigned-group-section">
              <div class="assigned-group-header">
                <span :class="['contract-badge', `badge-${group.category}`]"><i class="mdi mdi-briefcase-outline"></i>{{ group.category }}</span>
                <span class="staff-count-badge">{{ getAssignedByGroup(group.type).length }}명</span>
                <span class="contract-period">{{ group.contractStart }} ~ {{ group.contractEnd }}</span>
              </div>
              <div class="assigned-staff-grid">
                <div v-for="staff in getAssignedByGroup(group.type)" :key="staff.mIdx" class="assigned-staff-card">
                  <div class="staff-card-header">
                    <div class="staff-avatar"><i class="mdi mdi-account"></i></div>
                    <div class="staff-card-info">
                      <span class="staff-card-name">{{ staff.name }}</span>
                      <span class="staff-card-position">{{ staff.positionName }}</span>
                    </div>
                    <button type="button" class="btn-remove-assigned" @click="removeAssignedStaff(staff.assignIdx)">
                      <i class="mdi mdi-close"></i>
                    </button>
                  </div>
                  <div class="staff-card-details">
                    <div class="staff-card-detail-item"><i class="mdi mdi-phone-outline"></i><span>{{ staff.phone }}</span></div>
                    <div class="staff-card-detail-item"><i class="mdi mdi-calendar-check-outline"></i><span>{{ staff.assignDate }} 배치</span></div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- ── 장비현황 탭 ── -->
      <div v-show="activeTab === 'equipment'" class="tab-panel">
        <div class="equip-stats-row">
          <div class="equip-stat-card">
            <div class="equip-stat-icon esi-blue"><i class="mdi mdi-toolbox-outline"></i></div>
            <div class="equip-stat-body">
              <span class="equip-stat-label">총 보유 장비</span>
              <span class="equip-stat-value">{{ equipStats.total }}종 <small>({{ equipStats.totalQuantity }}대)</small></span>
            </div>
          </div>
          <div class="equip-stat-card">
            <div class="equip-stat-icon esi-green"><i class="mdi mdi-check-circle-outline"></i></div>
            <div class="equip-stat-body">
              <span class="equip-stat-label">운영 정상</span>
              <span class="equip-stat-value text-green">{{ equipStats.normal }}건</span>
            </div>
          </div>
          <div class="equip-stat-card">
            <div class="equip-stat-icon esi-orange"><i class="mdi mdi-progress-wrench"></i></div>
            <div class="equip-stat-body">
              <span class="equip-stat-label">수리/점검중</span>
              <span class="equip-stat-value text-orange">{{ equipStats.check }}건</span>
            </div>
          </div>
          <div class="equip-stat-card" :class="{ 'card-alert': equipStats.fault > 0 }">
            <div class="equip-stat-icon esi-red"><i class="mdi mdi-alert-circle-outline"></i></div>
            <div class="equip-stat-body">
              <span class="equip-stat-label">고장/폐기대기</span>
              <span class="equip-stat-value text-red">{{ equipStats.fault }}건</span>
            </div>
          </div>
        </div>

        <div v-if="equipmentList.length === 0" class="empty-state">
          <i class="mdi mdi-car-wash"></i>
          <p>등록된 미화/경비 장비가 없습니다</p>
          <span>장비 등록 버튼을 눌러 관리할 실물 장비를 추가해주세요</span>
        </div>

        <div v-else class="equip-sections">
          <template v-for="(items, cat) in equipByCategory" :key="cat">
            <div class="equip-group">
              <div class="equip-group-header">
                <i :class="['mdi', getEquipIcon(cat)]"></i>
                <span class="equip-group-name">{{ cat }}</span>
                <span class="equip-group-count">{{ items.length }}종</span>
              </div>
              <div class="equip-table-wrap">
                <table class="equip-table">
                  <thead>
                  <tr>
                    <th>장비명 (모델명)</th>
                    <th class="tc">보유 수량</th>
                    <th>보관/지급 위치</th>
                    <th class="tc">상태</th>
                    <th>도입(구매)일</th>
                    <th>다음 점검일</th>
                    <th>특이사항</th>
                    <th class="tc">관리</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr v-for="equip in items" :key="equip.idx"
                      :class="{ 'row-fault': equip.status === 'fault', 'row-check': equip.status === 'check' }">
                    <td class="equip-name-cell">{{ equip.name }}</td>
                    <td class="tc fw-bold text-primary">{{ equip.quantity }}대</td>
                    <td>{{ equip.location || '-' }}</td>
                    <td class="tc">
                      <span :class="['equip-status-badge', `esb-${equipStatusMap[equip.status]?.color || 'gray'}`]">
                        {{ equipStatusMap[equip.status]?.label || equip.status }}
                      </span>
                    </td>
                    <td class="text-muted">{{ equip.purchaseDate || '-' }}</td>
                    <td :class="isCheckOverdue(equip.nextCheckDate) ? 'text-red fw-bold' : 'text-muted'">
                      {{ equip.nextCheckDate || '-' }}
                      <span v-if="isCheckOverdue(equip.nextCheckDate)" class="overdue-chip">기한초과</span>
                    </td>
                    <td class="text-muted small-text">{{ equip.note || '-' }}</td>
                    <td class="tc">
                      <div class="equip-action-btns">
                        <button type="button" class="btn-equip-edit" @click="openEquipModal(equip)"><i class="mdi mdi-pencil-outline"></i></button>
                        <button type="button" class="btn-equip-del"  @click="deleteEquip(equip)"> <i class="mdi mdi-trash-can-outline"></i></button>
                      </div>
                    </td>
                  </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- ── 특이사항 탭 ── -->
      <div v-show="activeTab === 'memo'" class="tab-panel">
        <div v-if="bigoHistory.length > 0" class="memo-timeline">
          <div v-for="(item, idx) in bigoHistory" :key="idx" class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <i class="mdi mdi-calendar-outline"></i>
                <span class="timeline-date">{{ item.regDt ? item.regDt.substring(0, 10) : '-' }}</span>
              </div>
              <p class="timeline-text">{{ item.bigo }}</p>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <i class="mdi mdi-note-text-outline"></i><p>등록된 특이사항이 없습니다</p>
        </div>
        <div v-if="isEditing" class="memo-add-section">
          <label class="section-label"><i class="mdi mdi-pencil-outline"></i>새로운 메모 추가</label>
          <textarea v-model="site.bigo" class="info-textarea" rows="4" placeholder="특이사항을 입력하세요 (저장 시 히스토리에 추가됩니다)"></textarea>
        </div>
      </div>

    </div><!-- /integrated-content -->

    <!-- ── 배치 직원 검색 모달 ── -->
    <div v-if="isStaffSearchModalOpen" class="modal-overlay" @click.self="isStaffSearchModalOpen = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3><i class="mdi mdi-account-search-outline"></i> 직원 배치</h3>
          <button class="modal-close" @click="isStaffSearchModalOpen = false"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="modal-section">
            <label class="modal-section-label">1. 직원 검색</label>
            <div class="search-input-row">
              <input type="text" v-model="staffSearchKeyword" class="info-input" placeholder="이름 또는 연락처로 검색" @keyup.enter="searchStaff" />
              <button type="button" class="btn-search-small" @click="searchStaff"><i class="mdi mdi-magnify"></i> 검색</button>
            </div>
            <div v-if="isSearching" class="search-loading"><i class="mdi mdi-loading mdi-spin"></i> 검색 중...</div>
            <div v-else-if="staffSearchResults.length > 0" class="search-results">
              <div v-for="result in staffSearchResults" :key="result.mIdx"
                   :class="['search-result-item', { selected: newAssignment.mIdx === result.idx }]"
                   @click="selectStaffFromSearch(result)">
                <div class="result-avatar"><i class="mdi mdi-account"></i></div>
                <div class="result-info">
                  <span class="result-name">{{ result.name }}</span>
                  <span class="result-sub">{{ result.positionName }} · {{ result.phone }}</span>
                </div>
                <i v-if="newAssignment.mIdx === result.mIdx" class="mdi mdi-check-circle result-check"></i>
              </div>
            </div>
            <div v-else-if="staffSearchKeyword && !isSearching" class="search-empty">
              <i class="mdi mdi-account-off-outline"></i> 검색 결과가 없습니다
            </div>
          </div>
          <div v-if="newAssignment.mIdx" class="modal-section">
            <label class="modal-section-label">2. 배치 정보 설정</label>
            <div class="selected-staff-preview">
              <div class="staff-avatar"><i class="mdi mdi-account-check"></i></div>
              <div>
                <span class="staff-card-name">{{ newAssignment.name }}</span>
                <span class="staff-card-position">{{ newAssignment.positionName }}</span>
              </div>
            </div>
            <div class="modal-form-grid">
              <div class="modal-form-item">
                <label>배치일</label>
                <input type="date" v-model="newAssignment.assignDate" class="info-input" />
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-cancel" @click="isStaffSearchModalOpen = false"><i class="mdi mdi-close"></i> 취소</button>
          <button type="button" class="btn-save" :disabled="!newAssignment.mIdx" @click="confirmAssign"><i class="mdi mdi-account-plus-outline"></i> 배치 확정</button>
        </div>
      </div>
    </div>

    <!-- ── 장비 등록/수정 모달 ── -->
    <div v-if="isEquipModalOpen" class="modal-overlay" @click.self="closeEquipModal">
      <div class="modal-box modal-box-wide">
        <div class="modal-header">
          <h3><i class="mdi mdi-toolbox-outline"></i> {{ editingEquip ? '장비 수정' : '장비 등록' }}</h3>
          <button class="modal-close" @click="closeEquipModal"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="equip-form-grid">
            <div class="equip-form-item required">
              <label>장비명 (모델명) <span class="req-mark">*</span></label>
              <input type="text" v-model="equipForm.name" class="info-input" placeholder="예: 보행식 바닥세정기 (모델명)" />
            </div>
            <div class="equip-form-item required">
              <label>분류 <span class="req-mark">*</span></label>
              <select v-model="equipForm.category" class="info-select">
                <option value="">선택하세요</option>
                <option v-for="cat in EQUIP_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>
            <div class="equip-form-item">
              <label>보유 수량</label>
              <input type="number" v-model.number="equipForm.quantity" min="1" class="info-input" />
            </div>
            <div class="equip-form-item">
              <label>보관/지급 위치</label>
              <input type="text" v-model="equipForm.location" class="info-input" placeholder="예: 지하 1층 미화창고, 방재실" />
            </div>
            <div class="equip-form-item">
              <label>도입(구매)일</label>
              <input type="date" v-model="equipForm.purchaseDate" class="info-input" />
            </div>
            <div class="equip-form-item">
              <label>다음 점검 예정일</label>
              <input type="date" v-model="equipForm.nextCheckDate" class="info-input" />
            </div>
            <div class="equip-form-item">
              <label>현재 상태</label>
              <div class="equip-status-radio-group">
                <label v-for="opt in EQUIP_STATUS_OPTIONS" :key="opt.value"
                       :class="['equip-status-radio', `esr-${opt.color}`, { active: equipForm.status === opt.value }]">
                  <input type="radio" :value="opt.value" v-model="equipForm.status" />
                  {{ opt.label }}
                </label>
              </div>
            </div>
            <div class="equip-form-item full-width">
              <label>특이사항 (수리 이력 등)</label>
              <textarea v-model="equipForm.note" class="info-textarea" rows="2" placeholder="주요 부품 교체 이력, 수리 업체 연락처, 고장 증상 등을 입력하세요"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-cancel" @click="closeEquipModal"><i class="mdi mdi-close"></i> 취소</button>
          <button type="button" class="btn-save" @click="saveEquip"><i class="mdi mdi-check"></i> 저장</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
export default {
  methods: {
    isCheckOverdue(dateStr) {
      if (!dateStr) return false;
      return new Date(dateStr) < new Date();
    },
  },
};
</script>

<style scoped>
/* =============================================
   공통 레이아웃
============================================= */
.header-left { display: flex; align-items: flex-start; gap: 16px; }

.btn-back {
  width: 42px; height: 42px; border-radius: 10px;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  color: var(--text-sub); cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.btn-back:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-back i { font-size: 20px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.header-actions { display: flex; gap: 10px; }

.btn-edit, .btn-cancel, .btn-delete, .btn-save {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px; height: 42px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  box-shadow: var(--shadow-sm); white-space: nowrap; box-sizing: border-box;
}
.btn-edit   { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); }
.btn-edit:hover { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }
.btn-cancel { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-delete { background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.3); color: var(--danger); }
.btn-delete:hover { background: var(--danger); color: #fff; border-color: var(--danger); }
.btn-save   { background: var(--primary); border: 1px solid var(--primary); color: var(--text-inverse); }
.btn-save:hover { background: var(--primary-hover); transform: translateY(-1px); }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* =============================================
   프로필 카드
============================================= */
.profile-card { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); overflow: hidden; margin-bottom: 24px; }
.profile-banner { height: 100px; background-color: var(--primary); }
.profile-content { padding: 0 32px 24px; display: flex; gap: 24px; align-items: flex-start; }
.profile-icon-section { position: relative; margin-top: -40px; }
.profile-icon { width: 100px; height: 100px; border-radius: 16px; background: var(--primary-soft); border: 4px solid var(--bg-surface); box-shadow: 0 2px 8px rgba(0,0,0,.08); display: flex; align-items: center; justify-content: center; }
.profile-icon i { font-size: 50px; color: var(--primary); }
.profile-info { flex: 1; padding-top: 12px; }
.profile-main { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.profile-name { font-size: 24px; font-weight: 700; color: var(--text-main); margin: 0; }
.profile-details { display: flex; flex-wrap: wrap; gap: 16px; }
.detail-item { display: flex; align-items: center; gap: 6px; color: var(--text-sub); font-size: 13px; font-weight: 500; }
.profile-stats { display: flex; gap: 20px; padding-top: 12px; flex-wrap: wrap; }
.stat-item { display: flex; gap: 10px; align-items: center; }
.stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 22px; }
.stat-blue   { background: var(--primary-soft);           color: var(--primary);  }
.stat-green  { background: rgba(16,185,129,.1);            color: var(--success);  }
.stat-orange { background: rgba(245,158,11,.1);            color: var(--warning);  }
.stat-purple { background: rgba(139,92,246,.1);            color: #8b5cf6;         }
.stat-content { display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 12px; color: var(--text-sub); font-weight: 500; }
.stat-value { font-size: 14px; font-weight: 700; color: var(--text-main); }

.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-inverse); }
.status-active   { background: var(--success); }
.status-pending  { background: var(--warning); }
.status-inactive { background: var(--text-sub); }

/* =============================================
   탭 네비게이션
============================================= */
.integrated-tabs { display: flex; padding: 0 32px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas); }
.tab-button { padding: 16px 24px; background: transparent; border: none; color: var(--text-sub); font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; position: relative; margin-bottom: -1px; }
.tab-button.active { color: var(--primary); background: var(--bg-surface); border: 1px solid var(--border-color); border-bottom-color: var(--bg-surface); border-radius: 8px 8px 0 0; }
.tab-button i { font-size: 16px; }
.tab-alert-badge { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; background: var(--danger); color: #fff; border-radius: 50%; font-size: 10px; font-weight: 700; margin-left: 2px; }

.integrated-content { padding: 32px; background: var(--bg-surface); }
.tab-panel { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; } }

/* =============================================
   공통 폼 스타일
============================================= */
.info-sections { display: flex; flex-direction: column; gap: 32px; }
.info-section:not(:last-child) { padding-bottom: 32px; border-bottom: 1px dashed var(--border-color); }
.section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.section-header i { font-size: 20px; color: var(--primary); }
.section-header h3 { font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0; }

.info-grid, .contract-info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
.info-item, .contract-info-item { display: flex; flex-direction: column; gap: 6px; }
.info-item.full-width, .contract-info-item.full-width { grid-column: 1 / -1; }
.info-item label, .contract-info-item label, .section-label { font-size: 12px; font-weight: 600; color: var(--text-sub); display: flex; align-items: center; gap: 4px; }
.section-label i { font-size: 15px; color: var(--primary); }
.info-value { font-size: 14px; color: var(--text-main); padding: 8px 0; font-weight: 500; }

.info-input, .info-select, .info-textarea {
  padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px;
  font-size: 13px; color: var(--text-main); background: var(--bg-surface); transition: all 0.2s;
  box-sizing: border-box; width: 100%;
}
.info-input:focus, .info-select:focus, .info-textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.info-textarea { resize: vertical; }
.area-input { display: flex; gap: 12px; align-items: center; }
.checkbox-inline-small { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--danger); font-weight: 600; cursor: pointer; white-space: nowrap; }
.address-search-group { display: flex; gap: 10px; align-items: center; }
.postal-input { width: 140px; background: var(--bg-canvas); }
.btn-search-small { display: flex; align-items: center; gap: 6px; padding: 10px 14px; background: var(--primary); border: none; border-radius: 8px; color: var(--text-inverse); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
.btn-search-small:hover { background: var(--primary-hover); }

/* =============================================
   계약 정보
============================================= */
.contract-actions-top { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
.btn-add-contract-small { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--bg-surface); border: 1px dashed var(--text-muted); border-radius: 6px; color: var(--text-sub); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-add-contract-small:hover { border-color: var(--primary); color: var(--primary); }
.contract-list { display: flex; flex-direction: column; gap: 20px; }
.contract-card-detail { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
.contract-card-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); }
.contract-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.contract-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-inverse); }
.badge-경비 { background: #3b82f6; } .badge-미화 { background: #ec4899; } .badge-시설 { background: var(--success); }
.contract-duration { font-size: 12px; color: var(--text-sub); display: flex; align-items: center; gap: 4px; font-weight: 500; }
.assigned-count-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: rgba(99,102,241,.08); color: var(--primary); border: 1px solid var(--border-focus); }
.btn-remove-small { width: 28px; height: 28px; border-radius: 6px; background: rgba(239,68,68,.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.contract-card-body { padding: 20px; }

/* 인원 구성 */
.staff-info-grid { margin-top: 24px; padding: 20px; background: var(--bg-canvas); border-radius: 10px; border: 1px dashed var(--border-color); }
.staff-input-group { display: flex; gap: 10px; margin: 16px 0; align-items: center; }
.staff-position-select { flex: 1; } .staff-count-input { width: 90px; }
.btn-add-staff-small { display: flex; align-items: center; gap: 4px; padding: 10px 16px; background-color: var(--success); border: none; border-radius: 8px; color: var(--text-inverse); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.staff-members-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin: 12px 0; }
.staff-member-card { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; }
.staff-member-info { display: flex; align-items: center; gap: 10px; flex: 1; }
.staff-member-info i { font-size: 20px; color: var(--primary); }
.staff-member-details { display: flex; flex-direction: column; gap: 2px; }
.staff-position { font-size: 13px; font-weight: 600; color: var(--text-main); }
.staff-count { font-size: 11px; color: var(--text-sub); }
.btn-remove-staff-small { width: 24px; height: 24px; border-radius: 6px; background: rgba(239,68,68,.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.empty-staff-text { text-align: center; padding: 20px 0; color: var(--text-muted); font-size: 13px; }
.staff-total-bar { padding: 10px 14px; background-color: var(--primary-soft); border-radius: 8px; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--primary); font-weight: 600; }

/* =============================================
   산출내역 테이블 — 행합계 열
============================================= */
/* 헤더: 행합계 열 */
.col-rowtotal-head {
  width: 90px;
  min-width: 90px;
  text-align: right;
  background: rgba(99, 102, 241, 0.06) !important;
  color: var(--primary) !important;
  font-weight: 700 !important;
  border-right: 2px solid var(--border-focus) !important;
  white-space: nowrap;
}

/* 바디/푸터: 행합계 셀 */
.col-rowtotal-cell {
  text-align: right;
  font-size: 12px;
  font-weight: 700;
  color: var(--primary);
  background: rgba(99, 102, 241, 0.04);
  border-right: 2px solid var(--border-focus) !important;
  white-space: nowrap;
  padding: 8px 10px;
}

/* 소계 행의 행합계 — 조금 더 강조 */
.subtotal-rowtotal {
  background: rgba(99, 102, 241, 0.10) !important;
  font-size: 13px;
}

/* 산출내역 열 (기존 col-rowtotal → col-bigo 로 rename) */
.col-bigo {
  min-width: 100px;
  text-align: right;
  font-weight: 600;
  background: rgba(99, 102, 241, 0.04);
}

/* 산출내역 */
.cost-breakdown-wrapper { margin-top: 24px; }
.btn-toggle-cost { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 18px; background: var(--bg-canvas); border: 1px dashed var(--border-color); border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--text-main); cursor: pointer; transition: all 0.2s; text-align: left; }
.btn-toggle-cost:hover { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); border-style: solid; }
.btn-toggle-cost span:nth-child(2) { flex: 1; }
.cost-preview-badge { padding: 3px 10px; background: var(--primary); color: var(--text-inverse); border-radius: 20px; font-size: 12px; font-weight: 700; }
.cost-breakdown-section { margin-top: 8px; border: 1px solid var(--border-focus); border-radius: 10px; overflow: hidden; background: var(--bg-surface); }
.cost-no-staff { padding: 32px 20px; text-align: center; color: var(--text-sub); }
.cost-no-staff i { font-size: 36px; margin-bottom: 10px; opacity: .5; display: block; }
.cost-section-title { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-canvas); border-top: 1px solid var(--border-color); font-size: 13px; font-weight: 700; color: var(--text-main); }
.cost-section-title:first-child { border-top: none; }
.cost-section-title em { font-style: normal; font-weight: 400; font-size: 12px; color: var(--text-sub); }
.btn-add-cost-item { display: flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 11px; font-weight: 600; background: var(--bg-surface); border: 1px dashed var(--primary); border-radius: 6px; color: var(--primary); cursor: pointer; margin-left: auto; }
.cost-block-label { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 5px; font-size: 11px; font-weight: 800; color: var(--text-inverse); flex-shrink: 0; }
.label-direct { background: #3b82f6; } .label-indirect { background: #8b5cf6; } .label-expense { background: #f59e0b; } .label-total { background: #10b981; } .label-mgmt { background: #6b7280; } .label-profit { background: #ec4899; } .label-monthly { background: #0ea5e9; } .label-total-fee { background: #f97316; }
.cost-scroll-area {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch; /* iOS 부드러운 스크롤 */
  margin: 0 -20px; /* 모바일에서 좌우 여백 끝까지 활용 */
  padding: 0 20px;
}
.cost-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  color: var(--text-main);
  /* table-layout: fixed 제거 또는 auto로 변경하여 내용물에 맞게 조절 */
  table-layout: fixed;
  min-width: 600px; /* 테이블이 뭉개지지 않는 최소 너비 확보 */
}
.cost-table thead tr { background: var(--bg-canvas); }
.cost-table th, .cost-table td { padding: 8px 10px; border: 1px solid var(--border-color); vertical-align: middle; }
.cost-table th { font-size: 11px; font-weight: 700; color: var(--text-sub); text-align: center; white-space: nowrap; }
.col-label { min-width: 140px; width: 160px; }
.col-staff { min-width: 130px; text-align: center; }
.col-action { width: 36px; text-align: center; }
.staff-th-name { display: block; font-size: 12px; font-weight: 700; color: var(--text-main); }
.staff-th-count { display: block; font-size: 11px; color: var(--text-sub); font-weight: 400; }
.tbl-label-input, .tbl-value-input { width: 100%; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 5px; font-size: 12px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; }
.tbl-value-input { text-align: right; }
.btn-remove-cost { width: 24px; height: 24px; border-radius: 4px; background: rgba(239,68,68,.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.tfoot-subtotal td { background: var(--bg-canvas); font-size: 12px; font-weight: 700; color: var(--text-main); text-align: right; border-top: 2px solid var(--border-focus); }
.tfoot-subtotal td:nth-child(2) { text-align: left; }
.summary-table tbody tr td { background: var(--bg-surface); }
.summary-row td { padding: 10px; }
.summary-label { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; white-space: nowrap; }
.summary-val { display: block; text-align: right; font-size: 12px; font-weight: 600; color: var(--text-main); white-space: nowrap; }
.summary-val.highlight { color: var(--primary); font-weight: 700; }
.summary-val.grand-total { font-size: 15px; font-weight: 800; color: var(--primary); }
.row-d td { background: rgba(16,185,129,.04) !important; } .row-e td { background: rgba(107,114,128,.04) !important; } .row-f td { background: rgba(236,72,153,.04) !important; } .row-monthly td { background: rgba(14,165,233,.06) !important; } .row-total-fee td { background: var(--primary-soft) !important; }
.cost-special-note { padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border-color); }
.form-textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); resize: vertical; box-sizing: border-box; }
.form-textarea:disabled { background: var(--bg-canvas); color: var(--text-sub); }

/* =============================================
   배치 인원
============================================= */
.staff-overview { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; margin-bottom: 24px; }
.overview-card { display: flex; gap: 14px; align-items: center; padding: 16px 18px; background: var(--bg-canvas); border-radius: 12px; border: 1px solid var(--border-color); }
.overview-icon-wrap { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 20px; }
.oc-blue { background: var(--primary-soft); color: var(--primary); }
.oc-badge-경비 { background: rgba(59,130,246,.1); color: #3b82f6; } .oc-badge-미화 { background: rgba(236,72,153,.1); color: #ec4899; } .oc-badge-시설 { background: rgba(16,185,129,.1); color: var(--success); }
.overview-content { display: flex; flex-direction: column; gap: 2px; }
.overview-label { font-size: 12px; color: var(--text-sub); font-weight: 500; }
.overview-value { font-size: 18px; font-weight: 700; color: var(--text-main); }
.staff-tab-actions { display: flex; justify-content: flex-end; margin-bottom: 20px; }
.btn-assign-staff { display: flex; align-items: center; gap: 8px; padding: 10px 18px; background: var(--primary); border: none; border-radius: 8px; color: var(--text-inverse); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-assign-staff:hover { background: var(--primary-hover); transform: translateY(-1px); }
.assigned-staff-sections { display: flex; flex-direction: column; gap: 28px; }
.assigned-group-section { border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; background: var(--bg-canvas); }
.assigned-group-header { display: flex; align-items: center; gap: 10px; padding: 12px 18px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); }
.staff-count-badge { padding: 3px 10px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 20px; font-size: 12px; font-weight: 700; color: var(--text-sub); }
.contract-period { font-size: 12px; color: var(--text-muted); margin-left: auto; }
.assigned-staff-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; padding: 16px; }
.assigned-staff-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; transition: box-shadow 0.2s; }
.assigned-staff-card:hover { box-shadow: var(--shadow-sm); border-color: var(--border-focus); }
.staff-card-header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas); }
.staff-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--primary-soft); border: 2px solid var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.staff-avatar i { font-size: 18px; color: var(--primary); }
.staff-card-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.staff-card-name { font-size: 14px; font-weight: 700; color: var(--text-main); }
.staff-card-position { font-size: 11px; color: var(--text-sub); font-weight: 500; }
.btn-remove-assigned { width: 26px; height: 26px; border-radius: 6px; background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.2); color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-remove-assigned:hover { background: rgba(239,68,68,.2); }
.staff-card-details { padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
.staff-card-detail-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub); }

/* =============================================
   장비현황
============================================= */
.equip-stats-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; margin-bottom: 24px; }
.equip-stat-card { display: flex; gap: 14px; align-items: center; padding: 16px 18px; background: var(--bg-canvas); border-radius: 12px; border: 1px solid var(--border-color); transition: all 0.2s; }
.equip-stat-card.card-alert { border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.04); animation: pulse-border 2s infinite; }
@keyframes pulse-border { 0%, 100% { border-color: rgba(239,68,68,.4); } 50% { border-color: rgba(239,68,68,.8); } }
.equip-stat-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 20px; }
.esi-blue { background: var(--primary-soft); color: var(--primary); } .esi-green { background: rgba(16,185,129,.1); color: var(--success); } .esi-orange { background: rgba(245,158,11,.1); color: var(--warning); } .esi-red { background: rgba(239,68,68,.1); color: var(--danger); }
.equip-stat-body { display: flex; flex-direction: column; gap: 2px; }
.equip-stat-label { font-size: 12px; color: var(--text-sub); font-weight: 500; }
.equip-stat-value { font-size: 20px; font-weight: 700; color: var(--text-main); }
.equip-sections { display: flex; flex-direction: column; gap: 24px; }
.equip-group { border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; }
.equip-group-header { display: flex; align-items: center; gap: 8px; padding: 12px 18px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); font-size: 14px; font-weight: 700; color: var(--text-main); }
.equip-group-header i { font-size: 18px; color: var(--primary); }
.equip-group-name { flex: 1; }
.equip-group-count { padding: 2px 10px; background: var(--primary-soft); color: var(--primary); border-radius: 20px; font-size: 12px; font-weight: 700; }
.equip-table-wrap { overflow-x: auto; }
.equip-table { width: 100%; border-collapse: collapse; font-size: 13px; color: var(--text-main); }
.equip-table th { padding: 10px 14px; background: var(--bg-canvas); border-bottom: 1px solid var(--border-color); font-size: 12px; font-weight: 600; color: var(--text-sub); white-space: nowrap; text-align: left; }
.equip-table td { padding: 10px 14px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
.equip-table tbody tr:last-child td { border-bottom: none; }
.equip-table tbody tr:hover td { background: var(--bg-canvas); }
.equip-table .tc { text-align: center; }
.fw-bold { font-weight: 700; }
.equip-name-cell { font-weight: 600; }
.equip-status-badge { display: inline-flex; align-items: center; justify-content: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.esb-success { background: rgba(16,185,129,.1); color: var(--success); } .esb-warning { background: rgba(245,158,11,.1); color: var(--warning); } .esb-danger { background: rgba(239,68,68,.1); color: var(--danger); } .esb-gray { background: var(--bg-canvas); color: var(--text-sub); }
.row-fault td { background: rgba(239, 68, 68, 0.03) !important; } .row-check td { background: rgba(245,158,11, 0.03) !important; }
.text-muted { color: var(--text-muted); } .text-green { color: var(--success); } .text-orange { color: var(--warning); } .text-red { color: var(--danger); } .small-text { font-size: 12px; }
.overdue-chip { display: inline-flex; margin-left: 4px; padding: 1px 6px; background: rgba(239,68,68,.1); color: var(--danger); border-radius: 4px; font-size: 10px; font-weight: 700; }
.equip-action-btns { display: flex; gap: 6px; justify-content: center; }
.btn-equip-edit, .btn-equip-del { width: 28px; height: 28px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; font-size: 15px; }
.btn-equip-edit { background: var(--primary-soft); color: var(--primary); } .btn-equip-edit:hover { background: var(--primary); color: #fff; }
.btn-equip-del { background: rgba(239,68,68,.1); color: var(--danger); } .btn-equip-del:hover { background: var(--danger); color: #fff; }
.equip-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
.equip-form-item { display: flex; flex-direction: column; gap: 6px; }
.equip-form-item.full-width { grid-column: 1 / -1; }
.equip-form-item label { font-size: 12px; font-weight: 600; color: var(--text-sub); }
.req-mark { color: var(--danger); }
.equip-status-radio-group { display: flex; gap: 8px; }
.equip-status-radio { flex: 1; display: flex; align-items: center; justify-content: center; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; color: var(--text-sub); background: var(--bg-canvas); }
.equip-status-radio input { display: none; }
.equip-status-radio.esr-success.active { border-color: var(--success); background: rgba(16,185,129,.1); color: var(--success); }
.equip-status-radio.esr-warning.active { border-color: var(--warning); background: rgba(245,158,11,.1); color: var(--warning); }
.equip-status-radio.esr-danger.active  { border-color: var(--danger);  background: rgba(239,68,68,.1);  color: var(--danger);  }
.equip-status-radio:hover { border-color: var(--border-focus); }

/* =============================================
   메모 타임라인
============================================= */
.memo-timeline { display: flex; flex-direction: column; margin-bottom: 32px; position: relative; padding-left: 24px; }
.memo-timeline::before { content: ''; position: absolute; left: 7px; top: 8px; bottom: 8px; width: 2px; background: var(--border-focus); }
.timeline-item { position: relative; padding-bottom: 24px; }
.timeline-item:last-child { padding-bottom: 0; }
.timeline-marker { position: absolute; left: -21px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); border: 2px solid var(--bg-surface); box-shadow: 0 0 0 2px var(--primary); }
.timeline-content { background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; }
.timeline-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.timeline-date { font-size: 12px; font-weight: 600; color: var(--text-sub); }
.timeline-text { font-size: 13px; color: var(--text-main); line-height: 1.6; margin: 0; white-space: pre-line; }
.memo-add-section { display: flex; flex-direction: column; gap: 8px; padding-top: 24px; border-top: 1px dashed var(--border-color); }

/* 빈 상태 */
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-state i { font-size: 52px; margin-bottom: 14px; opacity: .4; display: block; }
.empty-state p { font-size: 15px; font-weight: 600; color: var(--text-sub); margin: 0 0 6px; }
.empty-state span { font-size: 13px; color: var(--text-muted); }

/* =============================================
   모달
============================================= */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-box { background: var(--bg-surface); border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.2); width: 100%; max-width: 520px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; }
.modal-box-wide { max-width: 700px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border-color); }
.modal-header h3 { font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 8px; }
.modal-header h3 i { font-size: 20px; color: var(--primary); }
.modal-close { width: 32px; height: 32px; border-radius: 8px; background: var(--bg-canvas); border: 1px solid var(--border-color); color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.modal-body { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 24px; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px; }
.modal-section { display: flex; flex-direction: column; gap: 12px; }
.modal-section-label { font-size: 13px; font-weight: 700; color: var(--text-main); padding-bottom: 8px; border-bottom: 1px dashed var(--border-color); }
.search-input-row { display: flex; gap: 10px; }
.search-input-row .info-input { flex: 1; }
.search-loading { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-sub); padding: 12px 0; }
.search-results { display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; }
.search-result-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s; background: var(--bg-canvas); }
.search-result-item:hover { border-color: var(--border-focus); background: var(--bg-hover); }
.search-result-item.selected { border-color: var(--primary); background: var(--primary-soft); }
.result-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.result-avatar i { font-size: 20px; color: var(--text-sub); }
.result-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.result-name { font-size: 13px; font-weight: 600; color: var(--text-main); }
.result-sub  { font-size: 11px; color: var(--text-sub); }
.result-check { font-size: 20px; color: var(--primary); }
.search-empty { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); padding: 16px 0; justify-content: center; }
.selected-staff-preview { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--primary-soft); border: 1px solid var(--border-focus); border-radius: 8px; }
.modal-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.modal-form-item { display: flex; flex-direction: column; gap: 6px; }
.modal-form-item label { font-size: 12px; font-weight: 600; color: var(--text-sub); }

/* =============================================
   반응형
============================================= */
@media (max-width: 1024px) {
  .profile-content { flex-direction: column; }
  .profile-icon-section { margin-top: -50px; }
  .profile-stats { flex-wrap: wrap; }
}
@media (max-width: 768px) {
  .integrated-tabs { padding: 0 16px; overflow-x: auto; }
  .tab-button { padding: 12px 16px; white-space: nowrap; }
  .integrated-content { padding: 20px 16px; }
  .info-grid, .contract-info-grid { grid-template-columns: 1fr; }
  .address-search-group { flex-direction: column; }
  .modal-form-grid { grid-template-columns: 1fr; }
  .assigned-staff-grid { grid-template-columns: 1fr; }
  .staff-overview, .equip-stats-row { grid-template-columns: repeat(2, 1fr); }
  .equip-form-grid { grid-template-columns: 1fr; }

  /* 행합계 열도 중요하므로 너비 조절 */
  .col-rowtotal-head, .col-rowtotal-cell {
    min-width: 80px;
    font-size: 11px;
  }

  /* 입력 필드 크기 최적화 */
  .tbl-value-input {
    padding: 4px 6px;
    font-size: 11px;
    min-width: 60px;
  }

  /* 테이블 헤더 텍스트 작게 */
  .staff-th-name { font-size: 11px; }
  .staff-th-count { font-size: 10px; }
}

/* 입력창 단위(㎡) 스타일 */
.input-with-unit { position: relative; display: flex; align-items: center; }
.input-with-unit .unit { position: absolute; right: 12px; font-size: 13px; color: var(--text-muted); }
.text-right { text-align: right; }

/* 총 관리면적 및 과세여부 박스 */
.calculated-area-box {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background-color: var(--bg-hover);
  border: 1px dashed var(--primary);
  border-radius: 8px;
  margin-top: 4px;
}

.total-number {
  font-size: 18px;
  font-weight: 800;
  color: var(--primary);
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.total-number small {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sub);
}

/* 과세/면세 배지 */
.vat-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  transition: all 0.3s ease;
}
.vat-red { background-color: var(--danger); box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2); }
.vat-green { background-color: var(--success); box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2); }

/* 도움말 텍스트 */
.info-helper-text { font-size: 11px; color: var(--text-muted); margin-top: 8px; line-height: 1.4; }
.info-helper-text strong { color: var(--danger); }

/* =============================================
   직책별 스케줄 패널 (상세/수정 공통)
============================================= */
.staff-list-vertical { display: flex; flex-direction: column; gap: 12px; margin: 12px 0; }
.staff-item-wrapper { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-surface); padding: 8px; }
.staff-actions { display: flex; align-items: center; gap: 8px; }
.btn-toggle-schedule { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--bg-canvas); border: 1px solid var(--border-focus); border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: 0.2s; }
.btn-toggle-schedule.active { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.btn-toggle-schedule:hover { background: var(--bg-hover); }

.schedule-panel { border: 1px solid var(--border-focus); border-radius: 8px; overflow: hidden; background: var(--bg-canvas); margin-bottom: 4px; }
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
.day-checkbox.disabled { cursor: default; }
.text-red { color: var(--danger); }
.text-blue { color: #3b82f6; }

.time-inputs { display: flex; align-items: center; justify-content: center; gap: 6px; }
.time-input { padding: 4px 6px; font-size: 12px; width: 100px; text-align: center; }
.break-input { padding: 4px; font-size: 12px; width: 60px; text-align: right; margin: 0 auto;}

.biweekly-checkbox { display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; font-size: 12px; }
.biweekly-checkbox.disabled { cursor: default; }

/* Readonly Input Styling */
.info-input:disabled { background: var(--bg-canvas); color: var(--text-main); border-color: transparent; opacity: 1; cursor: default; }
input[type="checkbox"]:disabled { opacity: 0.7; }

/* =============================================
   정산 설정 탭 전용 스타일
============================================= */
.config-toggle-wrapper { display: flex; gap: 24px; flex-wrap: wrap; }
.config-toggle-item { display: flex; align-items: center; gap: 12px; padding: 14px 20px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 10px; cursor: pointer; transition: all 0.2s; }
.config-toggle-item.disabled { opacity: 0.6; cursor: not-allowed; background: var(--bg-hover); }
.config-toggle-item.disabled .switch { opacity: 0.8; }

/* Switch Style (Modal과 동일하게 구성) */
.switch { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; }
.slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .3s; }
.slider.round { border-radius: 20px; }
.slider.round:before { border-radius: 50%; }
input:checked + .slider { background-color: #dc2626; }
input:checked + .slider:before { transform: translateX(18px); }

/* Checkbox Grid Style */
.deduction-toggles-grid { display: flex; flex-direction: column; gap: 16px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 10px; padding: 20px; }
.grid-group-label { font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 4px; }
.config-checkbox-group { display: flex; gap: 16px; flex-wrap: wrap; }
.config-checkbox { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; color: var(--text-main); padding: 6px 12px; background: var(--bg-surface); border-radius: 6px; border: 1px solid var(--border-focus); transition: 0.2s; }
.config-checkbox:hover { border-color: var(--primary-soft); background: var(--bg-hover); }
.config-checkbox input[type="checkbox"] { accent-color: var(--primary); width: 16px; height: 16px; cursor: pointer; margin: 0; }
.config-checkbox.disabled { opacity: 0.6; cursor: not-allowed; }
.grid-divider { height: 1px; background: var(--border-color); margin: 4px 0; }

/* 공통 텍스트 유틸리티 */
.text-orange { color: #b45309; }
.text-blue { color: #2563eb; }
.text-red { color: #dc2626; }
</style>
