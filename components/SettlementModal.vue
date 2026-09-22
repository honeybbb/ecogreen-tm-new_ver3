<script setup>
import { ref, watch, onMounted, computed, reactive, nextTick } from 'vue';
import axios from 'axios';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useAuthStore } from '~/stores/auth.js';
import RichTextEditor from '@/components/RichTextEditor.vue';
import SunTextEditor from '@/components/SunEditor.vue';

const { siteOptions, typeOptions, fetchSiteOptions, fetchTypeOptions } = useApi();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const props = defineProps({
  isOpen: Boolean,
  settlementId: Number,
  initialData: Object,
});

const emit = defineEmits(['close', 'save']);

// ──────────────────────────────────────────────
// 1. 기본 상태 및 표시 설정
// ──────────────────────────────────────────────
const activeTab = ref('statement'); // 'statement' | 'details' | 'payroll'

const currentConfig = reactive({
  showGrossPay: true,
  activePayLabels: [],       // 지급항목 배열
  activeDeductionLabels: [], // 공제항목 배열
  activeDeductionCodes: [],
  hiddenSummaryKeys: [],
  summarySigns: {
    severance: -1,
    annualLeave: -1,
    estimatedIns: -1,
    actualIns: -1,
    insuranceDiff: -1
  },
  exportConfig: {
    includeStatement: true,
    includeDetails: true,
    includePayroll: true
  }
});

const meltOptions = reactive({
  annualLeave: false,
  severance: false,
  workersDay: false,
});

// ──────────────────────────────────────────────
// 초기화 가드
// initForm()이 formData를 세팅하는 동안 watch들이 곧바로 반응하면,
// DB에서 불러온 원본값을 계산 로직이 즉시 덮어써버리는 문제가 생깁니다.
// 초기화가 끝나기 전까지는 runIfReady()로 감싼 콜백이 실행되지 않도록 막습니다.
// ──────────────────────────────────────────────
const isInitializing = ref(false);
const runIfReady = (fn) => { if (!isInitializing.value) fn(); };

const dragIndex = ref(null);
const draggableRowIdx = ref(null); // 마우스를 누른 특정 행만 드래그 활성화
const lastBigoAlertSIdx = ref(null);
const siteBigoList = ref([]);

// ──────────────────────────────────────────────
// 2. 폼 데이터 상태
// ──────────────────────────────────────────────
// const defaultBankInfo = '기업은행 301-051564-01-017 (예금주: 에코그린티엠)';
const defaultBankInfo = '국민은행 : 879601-01-250607  (주)이지종합관리)';
const defaultHeaderMessage = '1. 귀 소의 무궁한 발전을 기원합니다.\n2. 당월 용역비를 아래와 같이 청구하오니 검토하시여 결재를 부탁드립니다.\n\n- 아 래 -';

const createEmptyFormData = (overrides = {}) => ({
  sIdx: '',
  siteName: '',
  is_vat: 'N',
  type: '',
  target_month: '',
  docNo: '',
  billingDt: '',
  subTotal: 0,
  vatAmount: 0,
  grandTotal: 0,
  billingData: {
    summary: '',
    workerCount: 0,
    bankInfo: defaultBankInfo,
    items: [{ period: '', category: '', detail: '', amount: 0, note: '' }],
    customSummaryItems: [],
    vatBreakdown: {
      under135: { label: '135㎡ 이하 (면세)', area: '', unitPrice: '', supply: 0 },
      over135: { label: '135㎡ 초과 (과세)', area: '', unitPrice: '', supply: 0, vat: 0 }
    },
    insuranceDiff: 0,
    memo: '',
    headerMessage: defaultHeaderMessage,
    footerMessage: ''
  },
  payrollData: [],
  ...overrides,
});

const formData = ref(createEmptyFormData());

// ──────────────────────────────────────────────
// 커스텀 정산 항목 컨트롤
// ──────────────────────────────────────────────
const addCustomSummaryItem = () => {
  if (!formData.value.billingData.customSummaryItems) {
    formData.value.billingData.customSummaryItems = [];
  }
  formData.value.billingData.customSummaryItems.push({ label: '', amount: 0, sign: 1 });
};

const removeCustomSummaryItem = (index) => {
  formData.value.billingData.customSummaryItems.splice(index, 1);
};

const toggleCustomSign = (index) => {
  const item = formData.value.billingData.customSummaryItems[index];
  item.sign = item.sign === 1 ? -1 : 1;
};

const hasInvalidChars = (str) => {
  if (!str) return false;
  // 한글과 공백을 제외한 문자(영문, 숫자, 특수문자 등)가 하나라도 있는지 검사
  return /[^가-힣ㄱ-ㅎㅏ-ㅣ\s]/.test(str);
};

// 시행일자 선택 시 구분값 선택 여부 체크
const handleDateClick = async (e) => {
  if (!formData.value.type) {
    e.preventDefault();
    await window.customAlert('구분값을 먼저 선택해주세요.', 'error');
    e.target.blur();
  }
};

// ──────────────────────────────────────────────
// 3. 임금 코드 / 계약 데이터 / 적용 요율
// ──────────────────────────────────────────────
const items = ref([]);         // 최하위 leaf 노드
const allWageCodes = ref([]);  // DB 전체 코드 원본 (이름 찾기 폴백용)

const contractIndirectLabor = ref([]);
const contractIndirectLabels = ref([]);
const contractDirectLabor = ref([]);
const contractStaffList = ref([]);
const contractTotalCost = ref(0);

const insuranceRates = ref({
  nationalPension: 0,
  healthInsurance: 0,
  longTermCare: 0,
  employmentInsurance: 0,
  industrialAccident: 0
});

// 구버전 2계층 데이터 호환용 하드코딩 매핑 (DB 이관 이슈 방어)
const WAGE_LEGACY_NAME_MAP = {
  '04001003': '연차적립금',
  '04001004': '퇴직적립금',
  '04002001008': '산재보험',
  '04001002007': '근로자의날수당'
};

// 코드 → 한글 이름. items(leaf) → allWageCodes(전체) 순으로 폴백.
// 이 컴포넌트 안에서 코드 이름을 찾을 때는 항상 이 함수 하나만 사용합니다.
const getCodeName = (code) => {
  if (WAGE_LEGACY_NAME_MAP[code]) return WAGE_LEGACY_NAME_MAP[code];
  const foundInLeaves = items.value.find(i => i.itemCd === code);
  if (foundInLeaves) return foundInLeaves.itemNm;
  const foundInAll = allWageCodes.value.find(i => i.itemCd === code);
  if (foundInAll) return foundInAll.itemNm;
  return code;
};

const fetchTaxRates = async () => {
  const targetDate = formData.value.target_month || formData.value.billingDt;
  const year = targetDate ? targetDate.substring(0, 4) : new Date().getFullYear();

  try {
    const res = await axios.get(`/api/v1/config/tax/rate/${year}`);
    const result = res.data.data[0];
    if (result) {
      insuranceRates.value.nationalPension = result.pension_rate;
      insuranceRates.value.healthInsurance = result.health_rate;
      insuranceRates.value.longTermCare = result.long_term_care_rate;
      insuranceRates.value.employmentInsurance = result.employment_rate;
      insuranceRates.value.industrialAccident = result.industrial_rate;
    }
  } catch (err) {
    console.error('적용요율 로드 실패:', err);
  }
};

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    const all = (res.data.data || []).filter(c => c.itemCd.startsWith('04'));
    allWageCodes.value = all;

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

    const GROUP_NM = { '04001': '지급항목', '04002': '공제항목', '04003': '정산항목' };

    items.value = leaves.map(leaf => ({
      ...leaf,
      tax_free: Number(leaf.tax_free) || 0,
      groupNm: GROUP_NM[getTopAncestor(leaf.itemCd)] ?? '기타',
    }));
  } catch (e) {
    console.error('임금코드 로드 실패:', e);
    items.value = [];
  }
};

const fetchContractData = async () => {
  const sIdx = formData.value.sIdx;
  const type = formData.value.type;

  if (!sIdx || !type) {
    contractIndirectLabor.value = [];
    contractIndirectLabels.value = [];
    contractDirectLabor.value = [];
    contractStaffList.value = [];
    contractTotalCost.value = 0;
    return;
  }

  try {
    const res = await axios.get(`/api/v2/site/data/${sIdx}`);
    const siteData = res.data.data?.[0];
    if (!siteData) return;

    // ── 현장 특이사항(정산용, type=2) 파싱 & 알림 ──
    if (siteData.bigoList) {
      try {
        const bigoArr = typeof siteData.bigoList === 'string' ? JSON.parse(siteData.bigoList) : siteData.bigoList;
        siteBigoList.value = Array.isArray(bigoArr) ? bigoArr.filter(b => b.type == 2) : [];

        if (siteBigoList.value.length > 0 && sIdx !== lastBigoAlertSIdx.value) {
          const msg = siteBigoList.value.map(b => `${b.bigo || ''}`).join('\n\n');
          window.customAlert(`${msg}`, 'special');
        }
      } catch (e) {
        console.error('bigoList 파싱 에러:', e);
        siteBigoList.value = [];
      }
      lastBigoAlertSIdx.value = sIdx;
    } else {
      siteBigoList.value = [];
    }

    // 현장 전역 viewConfig — 새로 작성 중이거나 로딩이 끝난 뒤에만 반영
    if ((!props.settlementId || !isInitializing.value) && siteData.viewConfig) {
      try {
        const parsedConfig = typeof siteData.viewConfig === 'string' ? JSON.parse(siteData.viewConfig) : siteData.viewConfig;
        currentConfig.showGrossPay = parsedConfig.showGrossPay ?? true;
        currentConfig.showAnnualLeave = parsedConfig.showAnnualLeave ?? true;
        currentConfig.showSeverance = parsedConfig.showSeverance ?? true;
        currentConfig.showWorkersDay = parsedConfig.showWorkersDay ?? true;
        currentConfig.showSanjae = parsedConfig.showSanjae ?? true;
      } catch (e) {
        console.error('현장 viewConfig 파싱 에러:', e);
      }
    }

    if (!siteData.contractList) return;

    const parsedContractList = typeof siteData.contractList === 'string' ? JSON.parse(siteData.contractList) : siteData.contractList;

    // ── 정산 대상 연월 기준으로 유효 계약 찾기 ──
    const targetDateStr = formData.value.target_month || formData.value.billingDt;
    let targetContract = null;

    if (targetDateStr) {
      const [yStr, mStr] = targetDateStr.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);

      const monthStartStr = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const monthEndStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const getSafeDate = (d) => d ? String(d).substring(0, 10) : null;

      const candidates = parsedContractList.filter(c => {
        if (c.type !== type) return false;
        const cStart = getSafeDate(c.startDt);
        const cEnd = getSafeDate(c.endDt);
        if (cStart && cStart > monthEndStr) return false;
        if (cEnd && cEnd < monthStartStr) return false;
        return true;
      });

      // 여러 개 겹치면 startDt가 가장 늦은(=최신) 계약 우선
      targetContract = candidates.sort((a, b) => {
        const aStart = getSafeDate(a.startDt) || '';
        const bStart = getSafeDate(b.startDt) || '';
        return bStart.localeCompare(aStart);
      })[0] || null;
    }

    // 날짜 정보가 없을 때(초기 상태) 폴백: type만으로 매칭
    if (!targetContract) {
      targetContract = parsedContractList.find(c => c.type === type) || null;
    }

    if (!targetContract) {
      contractIndirectLabor.value = [];
      contractIndirectLabels.value = [];
      contractDirectLabor.value = [];
      contractStaffList.value = [];
      contractTotalCost.value = 0;
      return;
    }

    const iLabor = (targetContract.budget && Array.isArray(targetContract.budget.indirectLabor)) ? targetContract.budget.indirectLabor : [];
    contractIndirectLabor.value = iLabor;
    contractIndirectLabels.value = iLabor.map(item => item.label);
    contractDirectLabor.value = (targetContract.budget && Array.isArray(targetContract.budget.directLabor)) ? targetContract.budget.directLabor : [];
    contractStaffList.value = Array.isArray(targetContract.staffList) ? targetContract.staffList : [];
    contractTotalCost.value = Number(targetContract.totalCost) || 0;

    if (targetContract.viewConfig) {
      try {
        const contractConfig = typeof targetContract.viewConfig === 'string' ? JSON.parse(targetContract.viewConfig) : targetContract.viewConfig;
        if (Array.isArray(contractConfig.activePayLabels)) {
          currentConfig.activePayLabels = contractConfig.activePayLabels;
        }
        if (Array.isArray(contractConfig.activeDeductionLabels)) {
          currentConfig.activeDeductionLabels = contractConfig.activeDeductionLabels;
          currentConfig.activeDeductionCodes = contractConfig.activeDeductionLabels;
        }
      } catch (e) {
        console.error('계약 viewConfig 파싱 에러:', e);
      }
    }

    if (targetContract.exportConfig) {
      try {
        const parsedExportConfig = typeof targetContract.exportConfig === 'string' ? JSON.parse(targetContract.exportConfig) : targetContract.exportConfig;
        Object.assign(currentConfig.exportConfig, parsedExportConfig);
      } catch (e) {
        console.error('계약 exportConfig 파싱 에러:', e);
      }
    }

    // 현재 탭이 숨겨진 탭이면 노출된 탭으로 이동
    if (activeTab.value === 'statement' && !currentConfig.exportConfig.includeStatement) {
      activeTab.value = currentConfig.exportConfig.includeDetails ? 'details' : (currentConfig.exportConfig.includePayroll ? 'payroll' : 'statement');
    } else if (activeTab.value === 'details' && !currentConfig.exportConfig.includeDetails) {
      activeTab.value = currentConfig.exportConfig.includeStatement ? 'statement' : (currentConfig.exportConfig.includePayroll ? 'payroll' : 'details');
    } else if (activeTab.value === 'payroll' && !currentConfig.exportConfig.includePayroll) {
      activeTab.value = currentConfig.exportConfig.includeStatement ? 'statement' : (currentConfig.exportConfig.includeDetails ? 'details' : 'payroll');
    }

    // 계약별 melt 옵션 — 새로 작성 중이거나 로딩이 끝난 뒤에만 반영
    if (!props.settlementId || !isInitializing.value) {
      let contractMeltOptions = { annualLeave: false, severance: false, workersDay: false };
      if (targetContract.meltOptions) {
        try {
          contractMeltOptions = typeof targetContract.meltOptions === 'string' ? JSON.parse(targetContract.meltOptions) : targetContract.meltOptions;
        } catch (e) {
          console.error('계약 meltOptions 파싱 에러:', e);
        }
      }
      Object.assign(meltOptions, {
        annualLeave: contractMeltOptions.annualLeave ?? false,
        severance: contractMeltOptions.severance ?? false,
        workersDay: contractMeltOptions.workersDay ?? false,
      });
    }
  } catch (error) {
    console.error('계약 정보를 불러오는 중 오류 발생:', error);
  }
};

const deductionItems = computed(() => {
  if (!Array.isArray(items.value)) return [];
  let result = items.value.filter(item => item.groupNm === '공제항목' || item.groupCd === '04002');

  if (contractIndirectLabels.value.length > 0) {
    result = result.filter(item => contractIndirectLabels.value.some(label => item.itemCd === label || item.itemNm.includes(label)));
  } else {
    const defaultKeywords = ['건강보험', '장기요양', '국민연금', '고용보험'];
    result = result.filter(item => defaultKeywords.some(kw => item.itemNm.includes(kw)));
  }
  return [...new Map(result.map(item => [item.itemCd, item])).values()];
});

watch(deductionItems, (newItems) => {
  if (newItems.length === 0) return;
  if (currentConfig.activeDeductionCodes.length === 0) {
    currentConfig.activeDeductionCodes = newItems.map(i => i.itemCd);
  }
}, { immediate: true });

const visibleDeductionItems = computed(() =>
    deductionItems.value.filter(item => currentConfig.activeDeductionCodes.includes(item.itemCd))
);

// ──────────────────────────────────────────────
// 3-1. 동적 컬럼 매핑 (지급/급여/공제 순서로 구성)
// ──────────────────────────────────────────────
const RESERVE_KEYWORDS = ['연차', '퇴직', '근로자의날']; // meltOptions 토글용 별도 컬럼

const dynamicColumns = computed(() => {
  const cols = [];
  const payLabels = currentConfig.activePayLabels || [];
  const dedLabels = currentConfig.activeDeductionLabels || currentConfig.activeDeductionCodes || [];

  // 1) 적립금 항목(연차/퇴직/근로자의날)은 별도 컬럼
  const reservePayLabels = payLabels.filter(code => RESERVE_KEYWORDS.some(kw => getCodeName(code).includes(kw)));
  reservePayLabels.forEach(code => cols.push({ type: 'pay', code, name: getCodeName(code) }));

  // 2) 일반 지급항목(기본급, 직책수당 등) — 선택된 게 있을 때만 "급여" 컬럼 노출
  const generalPayLabels = payLabels.filter(code => !RESERVE_KEYWORDS.some(kw => getCodeName(code).includes(kw)));
  if (generalPayLabels.length > 0) {
    cols.push({ type: 'gross', code: 'grossPay', name: '급여' });
  }

  // 3) 공제 항목
  dedLabels.forEach(code => {
    const itemName = getCodeName(code);
    cols.push({
      type: 'deduct',
      code,
      name: itemName,
      isEmployment: itemName.includes('고용보험'), // 고용보험은 칸 2개 차지
    });
  });

  return cols;
});

// ──────────────────────────────────────────────
// 4. 숫자 콤마 / 수식 입력 핸들러
// ──────────────────────────────────────────────
// '=' 로 시작하는 입력을 안전하게 계산 (숫자, + - * / ( ) . 공백만 허용)
const evaluateFormula = (str) => {
  const expr = str.slice(1).replace(/,/g, '').trim();
  if (!expr || !/^[0-9+\-*/(). ]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    if (typeof result === 'number' && isFinite(result)) return Math.round(result);
  } catch (e) { /* 잘못된 수식은 무시 */ }
  return null;
};

const runCalcType = (calcType, row) => {
  if (calcType === 'salary') onSalaryInput(row);
  else if (calcType === 'row') calculateRow(row);
  else if (calcType === 'billing') calculateBillingTotal();
  else if (calcType === 'area') calculateAreaSupply();
  else if (calcType === 'manual') handleManualBreakdownUpdate();
};

const handleCurrencyInput = async (e, obj, key, row, calcType) => {
  const input = e.target;

  // '=' 로 시작하면 수식 입력 모드 — blur에서 처리
  if (input.value.trim().startsWith('=')) return;

  const cursorPosition = input.selectionStart;
  const oldLength = input.value.length;

  const rawValue = input.value.replace(/,/g, '').replace(/[^0-9\.\-]/g, '');
  const numValue = rawValue === '' || rawValue === '-' ? 0 : Number(rawValue);
  obj[key] = numValue;

  runCalcType(calcType, row);

  await nextTick();
  const diff = input.value.length - oldLength;
  const newCursorPos = Math.max(0, cursorPosition + diff);
  input.setSelectionRange(newCursorPos, newCursorPos);
};

const handleFormulaBlur = (e, obj, key, row, calcType) => {
  const raw = e.target.value.trim();
  if (!raw.startsWith('=')) return;

  const result = evaluateFormula(raw);
  if (result !== null) obj[key] = result;
  else alert('수식을 계산할 수 없습니다. 예: =100000+50000*2');

  runCalcType(calcType, row);
};

// ──────────────────────────────────────────────
// 5. 급여 계산 핵심 로직
// ──────────────────────────────────────────────
const applyContractReserves = (row) => {
  const findContractValue = (keyword, cd, staffCode) => {
    const allLabor = [...contractDirectLabor.value, ...contractIndirectLabor.value];
    const target = allLabor.find(d => {
      const label = String(d.label ?? '');
      return label === cd || label === keyword || label.includes(keyword);
    });

    if (!target?.values) return 0;
    if (staffCode != null && target.values[staffCode] != null) return Number(target.values[staffCode]) || 0;

    for (const staff of contractStaffList.value) {
      const val = Number(target.values[staff.code]);
      if (val > 0) return val;
    }
    return Number(Object.values(target.values)[0]) || 0;
  };

  let staffCode = null;
  if (row.position && contractStaffList.value.length) {
    const staffObj = contractStaffList.value.find(s => s.name.trim() === row.position.trim());
    if (staffObj) staffCode = staffObj.code;
  }
  if (!staffCode && contractStaffList.value.length === 1) {
    staffCode = contractStaffList.value[0].code;
  }

  row.reserves.annualLeave = findContractValue('연차', '04003001', staffCode);
  row.reserves.severance = findContractValue('퇴직', '04003003', staffCode);
  row.reserves.workersDay = findContractValue('근로자', '04001002007', staffCode);

  const sanjaeAmt = findContractValue('산재', '04002001008', staffCode);
  // 당월 중간 입사자는 산재보험도 0원으로 고정
  if (row.isMidMonthJoiner) {
    row.reserves.sanjae = 0;
    row.originalSanjae = 0;
  } else {
    row.reserves.sanjae = sanjaeAmt;
    row.originalSanjae = sanjaeAmt;
  }

  calculateRow(row);
};

const calculateRow = (row) => {
  let totalDeduct = 0;
  visibleDeductionItems.value.forEach(item => {
    totalDeduct += Number(row.deductionItems?.[item.itemCd]) || 0;
  });
  row.totalDeduct = totalDeduct;
  row.netPay = (Number(row.grossPay) || 0) - totalDeduct;

  if (!row.isCustomEmp) {
    if (row.isMidMonthJoiner) {
      row.reserves.empInsEmployer = 0;
    } else {
      let totalGross = Number(row.grossPay) || 0;
      if (meltOptions.annualLeave) totalGross += Number(row.reserves?.annualLeave) || 0;
      if (meltOptions.severance) totalGross += Number(row.reserves?.severance) || 0;
      if (meltOptions.workersDay) totalGross += Number(row.reserves?.workersDay) || 0;
      row.reserves.empInsEmployer = totalGross > 0 ? Math.floor((totalGross * 0.0045) / 10) * 10 : 0;
    }
  }
};

const recalculateInsurances = (row) => {
  if (row.isMidMonthJoiner) return; // 당월 중간 입사자는 4대보험 0 유지

  let calcBase = Number(row.grossPay) || 0;
  if (meltOptions.annualLeave) calcBase += Number(row.reserves.annualLeave) || 0;
  if (meltOptions.severance) calcBase += Number(row.reserves.severance) || 0;
  if (meltOptions.workersDay) calcBase += Number(row.reserves.workersDay) || 0;

  const rates = insuranceRates.value;

  deductionItems.value.forEach(item => {
    const code = item.itemCd;
    const name = item.itemNm;
    const originalAmt = Number(row.originalDeductions?.[code] ?? row.deductionItems?.[code] ?? 0);

    if (originalAmt === 0) {
      row.deductionItems[code] = 0;
      return;
    }

    let amt = originalAmt;
    if (name.includes('국민연금')) {
      amt = Math.floor((calcBase * (rates.nationalPension / 100)) / 10) * 10;
    } else if (name.includes('장기요양')) {
      const health = Math.floor((calcBase * (rates.healthInsurance / 100)) / 10) * 10;
      amt = Math.floor((health * (rates.longTermCare / 100)) / 10) * 10;
    } else if (name.includes('건강보험')) {
      amt = Math.floor((calcBase * (rates.healthInsurance / 100)) / 10) * 10;
    } else if (name.includes('고용보험')) {
      amt = Math.floor((calcBase * (rates.employmentInsurance / 100)) / 10) * 10;
    }
    row.deductionItems[code] = amt;
  });

  // originalSanjae는 표시값이자 "산재보험 적용 대상 여부" 판단 플래그입니다.
  // 0보다 클 때만 요율 기준으로 재계산하고, 그렇지 않으면 저장된 값을 건드리지 않습니다.
  if ((Number(row.originalSanjae) || 0) > 0) {
    row.reserves.sanjae = Math.floor((calcBase * (rates.industrialAccident / 100)) / 10) * 10;
  }
};

const getInsuranceTotal = (row) => {
  let total = 0;
  dynamicColumns.value.forEach(col => {
    if (col.type !== 'deduct') return;
    if (col.isEmployment) {
      total += (Number(row.deductionItems?.[col.code]) || 0) + (Number(row.reserves?.empInsEmployer) || 0);
    } else if (col.name.includes('산재')) {
      total += Number(row.reserves?.sanjae) || 0;
    } else {
      total += Number(row.deductionItems?.[col.code]) || 0;
    }
  });
  return total;
};

const onSalaryInput = (row) => {
  if (meltOptions.annualLeave || meltOptions.severance || meltOptions.workersDay) recalculateInsurances(row);
  calculateRow(row);
};

watch(meltOptions, () => {
  runIfReady(() => {
    formData.value.payrollData.forEach(row => {
      recalculateInsurances(row);
      calculateRow(row);
    });
  });
}, { deep: true });

watch(() => currentConfig.activeDeductionCodes, () => {
  formData.value.payrollData.forEach(row => calculateRow(row));
}, { deep: true });

// ──────────────────────────────────────────────
// 6. 총계 & 부가세 계산
// ──────────────────────────────────────────────
const payrollTotals = computed(() => {
  const totals = {
    grossPay: 0, totalDeduct: 0, netPay: 0, empInsEmployer: 0, sanjae: 0,
    insuranceTotal: 0, annualLeave: 0, severance: 0, deductionItems: {}
  };

  formData.value.payrollData.forEach(row => {
    totals.grossPay += Number(row.grossPay) || 0;
    totals.totalDeduct += Number(row.totalDeduct) || 0;
    totals.netPay += Number(row.netPay) || 0;
    totals.annualLeave += Number(row.reserves?.annualLeave) || 0;
    totals.severance += Number(row.reserves?.severance) || 0;

    let rowInsTotal = 0;
    dynamicColumns.value.forEach(col => {
      if (col.type !== 'deduct') return;
      if (col.isEmployment) {
        const empDeduct = Number(row.deductionItems?.[col.code]) || 0;
        const empReserve = Number(row.reserves?.empInsEmployer) || 0;
        totals.deductionItems[col.code] = (totals.deductionItems[col.code] || 0) + empDeduct;
        totals.empInsEmployer += empReserve;
        rowInsTotal += empDeduct + empReserve;
      } else if (col.name.includes('산재')) {
        const sanjaeAmt = Number(row.reserves?.sanjae) || 0;
        totals.sanjae += sanjaeAmt;
        rowInsTotal += sanjaeAmt;
      } else {
        const dAmount = Number(row.deductionItems?.[col.code]) || 0;
        totals.deductionItems[col.code] = (totals.deductionItems[col.code] || 0) + dAmount;
        rowInsTotal += dAmount;
      }
    });
    totals.insuranceTotal += rowInsTotal;
  });
  return totals;
});

const daysInTargetMonth = computed(() => {
  const dateStr = formData.value.target_month || formData.value.billingDt;
  if (!dateStr) return 30;
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
});

const vacancyDeduction = computed(() => {
  let totalAmount = 0, totalDays = 0;
  formData.value.payrollData.forEach(row => {
    const gapDays = Number(row.gapDays) || 0;
    if (gapDays > 0) {
      const dailyRate = (Number(row.grossPay) || 0) / daysInTargetMonth.value;
      totalAmount += Math.floor((dailyRate * gapDays) / 10) * 10;
      totalDays += gapDays;
    }
  });
  return { totalAmount, totalDays };
});

watch(vacancyDeduction, (val) => {
  runIfReady(() => {
    const summaryItems = formData.value.billingData.customSummaryItems;
    const idx = summaryItems.findIndex(i => i._auto === 'vacancy');

    if (val.totalDays > 0) {
      const label = `공백(${val.totalDays}일)공제`;
      if (idx > -1) {
        summaryItems[idx].label = label;
        summaryItems[idx].amount = val.totalAmount;
        summaryItems[idx].sign = -1;
      } else {
        summaryItems.push({ label, amount: val.totalAmount, sign: -1, _auto: 'vacancy' });
      }
    } else if (idx > -1) {
      summaryItems.splice(idx, 1);
    }
  });
}, { deep: true, immediate: true });

const sumByKeyword = (source, keyword) => {
  const target = source.find(d => String(d.label).includes(keyword));
  if (!target || !target.values) return 0;
  return contractStaffList.value.reduce((sum, staff) =>
      sum + (Number(target.values[staff.code]) || 0) * (Number(staff.count) || 1), 0);
};

const contractAnnualLeaveTotal = computed(() => {
  const fromDirect = sumByKeyword(contractDirectLabor.value, '연차');
  if (fromDirect) return fromDirect;
  return sumByKeyword(contractIndirectLabor.value || [], '연차');
});

const contractSeveranceTotal = computed(() => {
  const fromDirect = sumByKeyword(contractDirectLabor.value, '퇴직');
  if (fromDirect) return fromDirect;
  return sumByKeyword(contractIndirectLabor.value || [], '퇴직');
});

const estimatedInsuranceTotal = computed(() => {
  let total = 0;
  contractIndirectLabor.value.forEach(item => {
    const isVisible = dynamicColumns.value.some(col =>
        col.type === 'deduct' && (col.code === item.label || col.name === item.label || item.label.includes(col.name))
    );
    if (isVisible && item.values) {
      Object.entries(item.values).forEach(([staffCode, val]) => {
        const staffObj = contractStaffList.value.find(s => s.code === staffCode);
        const headcount = staffObj?.count ? Number(staffObj.count) : 1;
        total += (Number(val) || 0) * headcount;
      });
    }
  });
  return total;
});

const actualInsuranceTotal = computed(() => {
  let total = 0;
  dynamicColumns.value.forEach(col => {
    if (col.type !== 'deduct') return;
    if (['국민', '건강', '장기', '고용'].some(kw => col.name.includes(kw))) {
      total += Number(payrollTotals.value.deductionItems[col.code]) || 0;
      if (col.isEmployment) total += Number(payrollTotals.value.empInsEmployer) || 0;
    } else if (col.name.includes('산재')) {
      total += Number(payrollTotals.value.sanjae) || 0;
    }
  });
  return total;
});

watch([estimatedInsuranceTotal, actualInsuranceTotal], ([est, act]) => {
  runIfReady(() => {
    // 수동으로 수정된 이력이 없거나, 새 문서일 때만 자동 계산 (DB 값 덮어쓰기 방지)
    if (!formData.value.billingData.isManualInsuranceDiff) {
      formData.value.billingData.insuranceDiff = est - act;
    }
  });
});

const toggleSummarySign = (key) => {
  if (currentConfig.summarySigns[key] !== undefined) {
    currentConfig.summarySigns[key] *= -1;
  }
};

const removeSummaryItem = (key) => {
  if (!currentConfig.hiddenSummaryKeys) currentConfig.hiddenSummaryKeys = [];
  if (!currentConfig.hiddenSummaryKeys.includes(key)) currentConfig.hiddenSummaryKeys.push(key);
  // 청구공문(billingData.items)에 이미 동기화된 항목도 같이 제거
  formData.value.billingData.items = formData.value.billingData.items.filter(i => i._syncKey !== key);
  calculateBillingTotal();
};

const totalSummary = computed(() => {
  const monthlyFee = contractTotalCost.value || 0;
  const severance = contractSeveranceTotal.value || 0;
  const annualLeave = contractAnnualLeaveTotal.value || 0;
  const estIns = estimatedInsuranceTotal.value || 0;
  const actIns = actualInsuranceTotal.value || 0;
  const insDiff = Number(formData.value.billingData.insuranceDiff) || 0;
  const signs = currentConfig.summarySigns;
  const hidden = currentConfig.hiddenSummaryKeys || [];

  let customTotal = 0;
  const customItems = (formData.value.billingData.customSummaryItems || []).map((item, idx) => {
    const val = Number(item.amount) || 0;
    const itemSign = item.sign || 1;
    customTotal += val * itemSign;
    return {
      isCustom: true, index: idx, key: 'custom_' + idx, label: item.label,
      value: val, sign: itemSign, toggleable: true, hiddenInBilling: false
    };
  });

  let grandTotal = monthlyFee
      + (hidden.includes('severance') ? 0 : severance * signs.severance)
      + (hidden.includes('annualLeave') ? 0 : annualLeave * signs.annualLeave)
      + (insDiff * signs.insuranceDiff)
      + customTotal;
  grandTotal = Math.floor(grandTotal / 10) * 10;

  const result = [
    { key: 'monthlyFee', label: '월간용역비', value: monthlyFee, sign: 1, toggleable: false, hiddenInBilling: false },
    { key: 'estimatedIns', label: '4대보험료 (견적서)', value: estIns, sign: 1, toggleable: false, hiddenInBilling: true },
    { key: 'actualIns', label: '4대보험료 (실비정산)', value: actIns, sign: 1, toggleable: false, hiddenInBilling: true },
    { key: 'insuranceDiff', label: '4대보험차액', value: insDiff, sign: signs.insuranceDiff, toggleable: true, hiddenInBilling: false },
    ...customItems,
    { key: 'grandTotal', label: '당월 청구금액 \n(원 단위 절사)', value: grandTotal, sign: 1, toggleable: false, hiddenInBilling: true }
  ];

  if (!hidden.includes('severance')) {
    result.splice(1, 0, { key: 'severance', label: '퇴직적립금', value: severance, sign: signs.severance, toggleable: true, hiddenInBilling: false, deletable: true });
  }
  if (!hidden.includes('annualLeave')) {
    result.splice(hidden.includes('severance') ? 1 : 2, 0, { key: 'annualLeave', label: '연차적립금', value: annualLeave, sign: signs.annualLeave, toggleable: true, hiddenInBilling: false, deletable: true });
  }

  return result;
});

const syncBillingItems = () => {
  const targetDateStr = formData.value.target_month || formData.value.billingDt;
  let periodStr = '';
  let monthNum = '';

  if (targetDateStr) {
    const parts = targetDateStr.split('-');
    if (parts.length >= 2) {
      const yyyy = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10);
      monthNum = String(mm);
      const lastDay = new Date(yyyy, mm, 0).getDate();
      periodStr = `${String(yyyy).slice(2)}.${String(mm).padStart(2, '0')}.01~${String(mm).padStart(2, '0')}.${lastDay}`;
    }
  }

  let categoryStr = '';
  if (formData.value.type && typeOptions.value) {
    const matched = typeOptions.value.find(t => t.itemCd === formData.value.type);
    if (matched) categoryStr = matched.itemNm;
  }

  let currentItems = [...formData.value.billingData.items];
  if (currentItems.length === 1 && !currentItems[0].detail && currentItems[0].amount === 0) {
    currentItems = [];
  }

  const findExistIdx = (summaryObj) => {
    if (summaryObj.key === 'monthlyFee') return currentItems.findIndex(i => i._syncKey === 'monthlyFee' || i.detail.includes('용역비') || i.detail.includes('도급비'));
    if (summaryObj.key === 'severance') return currentItems.findIndex(i => i._syncKey === 'severance' || i.detail.includes('퇴직'));
    if (summaryObj.key === 'annualLeave') return currentItems.findIndex(i => i._syncKey === 'annualLeave' || i.detail.includes('연차'));
    if (summaryObj.key === 'insuranceDiff') return currentItems.findIndex(i => i._syncKey === 'insuranceDiff' || (i.detail.includes('보험') && i.detail.includes('차액')));
    if (summaryObj.isCustom) return currentItems.findIndex(i => i._syncKey === summaryObj.key);
    return -1;
  };

  let newItems = [];
  totalSummary.value.forEach(summaryObj => {
    if (summaryObj.hiddenInBilling) return;
    const signedAmount = summaryObj.value * summaryObj.sign;
    if (summaryObj.key !== 'monthlyFee' && signedAmount === 0) return;

    const existIdx = findExistIdx(summaryObj);
    const defaultDetail = summaryObj.key === 'monthlyFee'
        ? `${monthNum ? monthNum + '월 ' : ''}${categoryStr}용역비`
        : (summaryObj.label || '추가 항목');

    if (existIdx > -1) {
      const existing = currentItems.splice(existIdx, 1)[0];
      existing.period = periodStr || existing.period;
      existing.category = categoryStr || existing.category;
      existing.amount = signedAmount;
      if (summaryObj.isCustom) existing.detail = summaryObj.label;
      existing._syncKey = summaryObj.key;
      newItems.push(existing);
    } else {
      newItems.push({
        _syncKey: summaryObj.key, period: periodStr, category: categoryStr,
        detail: defaultDetail, amount: signedAmount, note: ''
      });
    }
  });

  formData.value.billingData.items = newItems.concat(currentItems);
  calculateBillingTotal();
};

watch([
  totalSummary,
  () => formData.value.type,
  () => formData.value.billingDt,
  () => formData.value.target_month
], () => {
  runIfReady(() => {
    if (formData.value.sIdx) syncBillingItems();
    // 값이 실제로 다를 때만 대입합니다. 매번 재대입하면 급여 표의 아무 값이나
    // 입력할 때마다(→ totalSummary 재계산 → 이 watcher 발동) target_month/billingDt
    // watcher가 불필요하게 다시 깨어나, 이미 입력한 직원 데이터가 계약서 기준값으로
    // 재계산되어 덮어써지는 연쇄 버그로 이어집니다.
    if (formData.value.target_month !== formData.value.billingDt) {
      formData.value.target_month = formData.value.billingDt;
    }
  });
}, { deep: true });

const getDynamicTotal = (col) => {
  if (col.type === 'gross') return payrollTotals.value.grossPay;

  let sum = 0;
  formData.value.payrollData.forEach(row => {
    if (col.name.includes('연차')) sum += Number(row.reserves?.annualLeave) || 0;
    else if (col.name.includes('퇴직')) sum += Number(row.reserves?.severance) || 0;
    else if (col.name.includes('근로자의날')) sum += Number(row.reserves?.workersDay) || 0;
    else if (col.name.includes('산재')) sum += Number(row.reserves?.sanjae) || 0;
    else if (col.type === 'pay') sum += Number(row.payments?.[col.code]) || 0;
    else if (col.type === 'deduct') sum += Number(row.deductionItems?.[col.code]) || 0;
  });
  return sum;
};

const groupedPayrollData = computed(() => {
  const groupMap = new Map();
  formData.value.payrollData.forEach(row => {
    const gno = row.groupNo ?? 0;
    if (!groupMap.has(gno)) groupMap.set(gno, []);
    groupMap.get(gno).push(row);
  });
  return Array.from(groupMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([groupNo, rows]) => ({ groupNo, rows }));
});

const getRowFlatIndex = (row) => formData.value.payrollData.indexOf(row);

// ──────────────────────────────────────────────
// 급여대장 전용 컬럼/계산 로직
// ──────────────────────────────────────────────
const LEDGER_EXCLUDE_PAY = ['04001003', '04001004', '04001002007']; // 연차/퇴직/근로자의날 제외
const LEDGER_DEDUCT_KEYWORDS = ['국민연금', '건강보험', '장기요양', '고용보험', '소득세', '지방소득세', '기타공제'];
const LEDGER_DEDUCT_EXCLUDE_KEYWORDS = ['고용안정', '실업급여'];

const payrollLedgerColumns = computed(() => {
  const payCodeSet = new Set();
  formData.value.payrollData.forEach(row => {
    Object.keys(row.payItems || {}).forEach(cd => {
      if (!LEDGER_EXCLUDE_PAY.includes(cd)) payCodeSet.add(cd);
    });
  });

  const deductCodeSet = new Set();
  formData.value.payrollData.forEach(row => {
    Object.keys(row.deductionItems || {}).forEach(cd => {
      const name = getCodeName(cd);
      const include = LEDGER_DEDUCT_KEYWORDS.some(kw => name.includes(kw));
      const exclude = LEDGER_DEDUCT_EXCLUDE_KEYWORDS.some(ex => name.includes(ex));
      if (include && !exclude) deductCodeSet.add(cd);
    });
  });

  const sortedDeductCols = Array.from(deductCodeSet)
      .map(cd => ({ code: cd, name: getCodeName(cd) }))
      .sort((a, b) => {
        const aIdx = LEDGER_DEDUCT_KEYWORDS.findIndex(kw => a.name.includes(kw));
        const bIdx = LEDGER_DEDUCT_KEYWORDS.findIndex(kw => b.name.includes(kw));
        return aIdx - bIdx;
      });

  return {
    payCols: Array.from(payCodeSet).map(cd => ({ code: cd, name: getCodeName(cd) })),
    deductCols: sortedDeductCols,
  };
});

const getLedgerGrossPay = (row) =>
    Object.entries(row.payItems || {}).reduce((sum, [cd, amt]) =>
        LEDGER_EXCLUDE_PAY.includes(cd) ? sum : sum + (Number(amt) || 0), 0);

const getLedgerTotalDeduct = (row) =>
    Object.entries(row.deductionItems || {}).reduce((sum, [cd, amt]) => {
      const name = getCodeName(cd);
      const include = LEDGER_DEDUCT_KEYWORDS.some(kw => name.includes(kw));
      const exclude = LEDGER_DEDUCT_EXCLUDE_KEYWORDS.some(ex => name.includes(ex));
      return (include && !exclude) ? sum + (Number(amt) || 0) : sum;
    }, 0);

const getLedgerNetPay = (row) => getLedgerGrossPay(row) - getLedgerTotalDeduct(row);

const payrollLedgerTotals = computed(() => {
  const payTotals = {};
  const deductTotals = {};
  let grossTotal = 0, deductTotal = 0, netTotal = 0;

  formData.value.payrollData.forEach(row => {
    const gross = getLedgerGrossPay(row);
    const deduct = getLedgerTotalDeduct(row);
    grossTotal += gross;
    deductTotal += deduct;
    netTotal += gross - deduct;

    Object.entries(row.payItems || {}).forEach(([cd, amt]) => {
      if (!LEDGER_EXCLUDE_PAY.includes(cd)) payTotals[cd] = (payTotals[cd] || 0) + (Number(amt) || 0);
    });
    Object.entries(row.deductionItems || {}).forEach(([cd, amt]) => {
      deductTotals[cd] = (deductTotals[cd] || 0) + (Number(amt) || 0);
    });
  });

  return { payTotals, deductTotals, grossTotal, deductTotal, netTotal };
});

// ──────────────────────────────────────────────
// VAT / 청구 총액 계산
// ──────────────────────────────────────────────
const calculateAreaSupply = () => {
  const vb = formData.value.billingData.vatBreakdown;
  if (vb.isManual) return;

  const totalArea = (Number(vb.under135.area) || 0) + (Number(vb.over135.area) || 0);
  let topSum = formData.value.billingData.items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  topSum = Math.floor(topSum / 10) * 10;

  if (totalArea > 0 && topSum > 0) {
    const unitPrice = topSum / totalArea;
    vb.under135.unitPrice = unitPrice.toFixed(2);
    vb.over135.unitPrice = unitPrice.toFixed(2);
    const underSupply = Math.round(unitPrice * (Number(vb.under135.area) || 0)) - 1;
    vb.under135.supply = underSupply;
    const overSupply = topSum - underSupply;
    vb.over135.supply = overSupply;
    vb.over135.vat = Math.floor(overSupply * 0.1);
    formData.value.subTotal = underSupply + overSupply;
    formData.value.vatAmount = vb.over135.vat;
    formData.value.grandTotal = formData.value.subTotal + vb.over135.vat;
  }
};

const calculateBillingTotal = () => {
  let topSum = formData.value.billingData.items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  topSum = Math.floor(topSum / 10) * 10;

  if (formData.value.is_vat === 'Y') {
    calculateAreaSupply();
  } else {
    formData.value.subTotal = topSum;
    formData.value.vatAmount = 0;
    formData.value.grandTotal = topSum;
  }
};

const handleManualBreakdownUpdate = () => {
  formData.value.billingData.vatBreakdown.isManual = true; // 자동 계산 덮어쓰기 방지

  const underSupply = Number(formData.value.billingData.vatBreakdown.under135.supply) || 0;
  const overSupply = Number(formData.value.billingData.vatBreakdown.over135.supply) || 0;
  const overVat = Number(formData.value.billingData.vatBreakdown.over135.vat) || 0;

  formData.value.subTotal = underSupply + overSupply;
  formData.value.vatAmount = overVat;
  formData.value.grandTotal = formData.value.subTotal + overVat;
};

// ──────────────────────────────────────────────
// 7. 폼 세팅 (수정 진입 / 신규 작성)
// ──────────────────────────────────────────────
const normalizePayrollRow = (row, idx) => {
  if (!row.deductionItems) row.deductionItems = {};
  row.totalDeduct = row.totalDeduct || 0;
  if (!row.reserves) row.reserves = { annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0 };
  row.reserves.annualLeave = row.reserves.annualLeave || 0;
  row.reserves.severance = row.reserves.severance || 0;
  row.reserves.empInsEmployer = row.reserves.empInsEmployer || 0;

  let savedSanjae = Number(row.reserves.sanjae) || 0;
  if (savedSanjae === 0) {
    if (Number(row.originalSanjae) > 0) savedSanjae = Number(row.originalSanjae);
    else if (row.deductionItems && Number(row.deductionItems['04002001008']) > 0) savedSanjae = Number(row.deductionItems['04002001008']);
    else if (row.originalDeductions && Number(row.originalDeductions['04002001008']) > 0) savedSanjae = Number(row.originalDeductions['04002001008']);
  }
  row.reserves.sanjae = savedSanjae;

  // originalSanjae는 표시값이자 "산재보험 적용 대상 여부" 판단 플래그입니다.
  // DB에 저장된 원본값이 이미 있으면 그대로 유지하고, 없을 때만 채워 넣습니다.
  // (여기서 매번 덮어쓰면 저장된 값이 재요율 계산으로 조용히 바뀌는 버그가 생깁니다.)
  if (row.originalSanjae === undefined || row.originalSanjae === null) {
    row.originalSanjae = savedSanjae;
  }

  // 공제항목에서는 산재보험을 확실하게 제거 (실수령액 차감 오류 방지)
  if (row.deductionItems) row.deductionItems['04002001008'] = 0;

  if (!row.originalDeductions || Object.keys(row.originalDeductions).length === 0) {
    row.originalDeductions = JSON.parse(JSON.stringify(row.deductionItems));
  }

  if (row.groupNo === undefined) row.groupNo = idx + 1;
  if (row.isMidMonthJoiner === undefined) row.isMidMonthJoiner = false;
};

const applyExportConfig = (savedConfig) => {
  if (savedConfig.exportConfig) {
    Object.assign(currentConfig.exportConfig, savedConfig.exportConfig);
  } else {
    Object.assign(currentConfig.exportConfig, { includeStatement: true, includeDetails: true, includePayroll: true });
  }
};

const applyViewConfig = (data) => {
  if (!data.viewConfig) {
    currentConfig.summarySigns = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
    currentConfig.hiddenSummaryKeys = [];
    meltOptions.annualLeave = false;
    meltOptions.severance = false;
    meltOptions.workersDay = false;
    Object.assign(currentConfig.exportConfig, { includeStatement: true, includeDetails: true, includePayroll: true });
    return;
  }

  try {
    const parsedConfig = typeof data.viewConfig === 'string' ? JSON.parse(data.viewConfig) : data.viewConfig;
    const savedConfig = parsedConfig.site || parsedConfig;

    if (savedConfig.activePayLabels) currentConfig.activePayLabels = savedConfig.activePayLabels;
    if (savedConfig.activeDeductionLabels) currentConfig.activeDeductionLabels = savedConfig.activeDeductionLabels;
    if (savedConfig.activeDeductionCodes) currentConfig.activeDeductionCodes = savedConfig.activeDeductionCodes;
    if (savedConfig.showGrossPay !== undefined) currentConfig.showGrossPay = savedConfig.showGrossPay;
    if (savedConfig.meltOptions) Object.assign(meltOptions, savedConfig.meltOptions);

    applyExportConfig(savedConfig);

    if (currentConfig.showSanjae === undefined) currentConfig.showSanjae = true;

    // ✅ 수정 완료: DB에 저장된 +/- 부호 상태 복원
    if (savedConfig.summarySigns) {
      currentConfig.summarySigns = savedConfig.summarySigns;
    } else if (!currentConfig.summarySigns) {
      currentConfig.summarySigns = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
    }

    // ✅ 수정 완료: DB에 저장된 삭제(숨김) 항목 복원
    if (savedConfig.hiddenSummaryKeys) {
      currentConfig.hiddenSummaryKeys = savedConfig.hiddenSummaryKeys;
    } else if (!currentConfig.hiddenSummaryKeys) {
      currentConfig.hiddenSummaryKeys = [];
    }
  } catch (e) {
    console.error('viewConfig 파싱 에러:', e);
  }
};

const moveActiveTabToVisible = () => {
  if (activeTab.value === 'statement' && !currentConfig.exportConfig.includeStatement) {
    activeTab.value = currentConfig.exportConfig.includeDetails ? 'details' : (currentConfig.exportConfig.includePayroll ? 'payroll' : 'statement');
  } else if (activeTab.value === 'details' && !currentConfig.exportConfig.includeDetails) {
    activeTab.value = currentConfig.exportConfig.includeStatement ? 'statement' : (currentConfig.exportConfig.includePayroll ? 'payroll' : 'details');
  } else if (activeTab.value === 'payroll' && !currentConfig.exportConfig.includePayroll) {
    activeTab.value = currentConfig.exportConfig.includeStatement ? 'statement' : (currentConfig.exportConfig.includeDetails ? 'details' : 'payroll');
  }
};

const initForm = async () => {
  if (!props.initialData || Object.keys(props.initialData).length === 0) {
    formData.value = createEmptyFormData();
    currentConfig.summarySigns = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
    meltOptions.annualLeave = false;
    meltOptions.severance = false;
    meltOptions.workersDay = false;
    Object.assign(currentConfig.exportConfig, { includeStatement: true, includeDetails: true, includePayroll: true });
    return;
  }

  isInitializing.value = true;
  await fetchTaxRates(); // 보험 요율부터 최우선으로 로드

  const data = JSON.parse(JSON.stringify(props.initialData));
  if (!data.payrollData) data.payrollData = [];
  if (!data.billingData) {
    data.billingData = { items: [], bankInfo: defaultBankInfo, insuranceDiff: 0, customSummaryItems: [], memo: '' };
  }
  if (!data.billingData.items) data.billingData.items = [];
  if (!data.billingData.customSummaryItems) data.billingData.customSummaryItems = [];
  if (!data.billingData.memo) data.billingData.memo = '';
  if (data.billingData.footerMessage === undefined) data.billingData.footerMessage = '';
  if (data.billingData.headerMessage === undefined) data.billingData.headerMessage = defaultHeaderMessage;

  if (!data.billingData.vatBreakdown) {
    data.billingData.vatBreakdown = {
      under135: { label: '135㎡ 이하 (면세)', area: '', unitPrice: '', supply: 0 },
      over135: { label: '135㎡ 초과 (과세)', area: '', unitPrice: '', supply: 0, vat: 0 }
    };
  }
  if (data.billingData.vatBreakdown.under135 && !data.billingData.vatBreakdown.under135.label) {
    data.billingData.vatBreakdown.under135.label = '135㎡ 이하 (면세)';
  }
  if (data.billingData.vatBreakdown.over135 && !data.billingData.vatBreakdown.over135.label) {
    data.billingData.vatBreakdown.over135.label = '135㎡ 초과 (과세)';
  }

  // 값이 0일 때도 정상적으로 유지되도록 || 대신 !== undefined 사용
  data.billingData.insuranceDiff = data.billingData.insuranceDiff !== undefined ? data.billingData.insuranceDiff : 0;
  // DB에서 불러온 값은 수동 입력된 확정값으로 간주하여 자동 덮어쓰기 방지
  data.billingData.isManualInsuranceDiff = true;

  data.payrollData.forEach(normalizePayrollRow);

  const selectedSite = siteOptions.value.find(s => s.idx === data.sIdx);
  data.is_vat = selectedSite ? selectedSite.is_vat : (data.vatAmount > 0 ? 'Y' : 'N');

  applyViewConfig(data);
  delete data.viewConfig;
  delete data.exportConfig;

  if (data.defaultTab) activeTab.value = data.defaultTab;
  moveActiveTabToVisible();

  formData.value = data;

  if (formData.value.sIdx && formData.value.type) {
    await fetchContractData();
  }

  nextTick(() => { isInitializing.value = false; });
};

watch(() => props.initialData, initForm, { immediate: true });

const resetAll = async () => {
  if (!await window.customConfirm('청구 공문과 급여 내역 전체를 초기화하시겠습니까?\n현장/구분/날짜 선택값은 유지됩니다.')) return;

  isInitializing.value = true;

  const { sIdx, type, target_month, billingDt } = formData.value;
  formData.value = createEmptyFormData({ sIdx, type, target_month, billingDt });

  // meltOptions.annualLeave = false;
  // meltOptions.severance = false;
  // meltOptions.workersDay = false;
  currentConfig.showGrossPay = true;
  currentConfig.showAnnualLeave = true;
  currentConfig.showSeverance = true;
  currentConfig.showWorkersDay = true;
  currentConfig.showSanjae = true;
  currentConfig.summarySigns = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
  currentConfig.hiddenSummaryKeys = [];
  Object.assign(currentConfig.exportConfig, { includeStatement: true, includeDetails: true, includePayroll: true });

  if (deductionItems.value.length > 0) {
    currentConfig.activeDeductionCodes = deductionItems.value.map(i => i.itemCd);
  }

  updateDocNo();
  if (sIdx) handleSiteChange();

  setTimeout(() => { isInitializing.value = false; }, 100);
};

const loadPayrollData = async () => {
  if (!formData.value.sIdx) { alert('현장을 먼저 선택해주세요.'); return; }
  if (formData.value.payrollData.length > 0
      && !await window.customConfirm('기존에 입력된 데이터가 모두 초기화됩니다. 정말 불러오시겠습니까?')) return;

  try {
    const targetDate = formData.value.target_month || formData.value.billingDt || '';
    const [yearStr, monthStr] = targetDate.split('-');
    const yearNum = parseInt(yearStr);
    const monthNum = parseInt(monthStr);
    const sIdx = formData.value.sIdx;

    await nextTick();

    const validItemCds = [
      ...contractDirectLabor.value.map(d => String(d.code)),
      ...contractIndirectLabor.value.map(i => String(i.code))
    ];

    const res = await axios.get('/api/v1/settle/payroll', { params: { year: yearNum, month: monthNum, sIdx } });
    const rawData = res.data?.data || [];

    const periodStart = new Date(yearNum, monthNum - 1, 1);
    const periodEnd = new Date(yearNum, monthNum, 0);

    const result = rawData.filter(item => {
      if (item.type != formData.value.type) return false;
      if (item.sIdx != formData.value.sIdx) return false;
      const inDate = item.inDate ? new Date(item.inDate) : null;
      const outDate = item.outDate ? new Date(item.outDate) : null;
      if (inDate && inDate > periodEnd) return false;
      if (outDate && outDate < periodStart) return false;
      return true;
    });

    const safeParse = (val) => {
      if (!val) return {};
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return {}; }
    };

    const reserveCodes = ['04001003', '04001004', '04001002007', '04002001008'];

    formData.value.payrollData = result.map(item => {
      const parsedPayItems = safeParse(item.payItems);
      const parsedDeductions = safeParse(item.deductionItems);

      const filteredPayItems = {};
      let recalculatedGrossPay = 0;
      Object.entries(parsedPayItems).forEach(([cd, amt]) => {
        if (reserveCodes.includes(cd)) return;
        if (validItemCds.includes(cd)) {
          filteredPayItems[cd] = Number(amt) || 0;
          recalculatedGrossPay += Number(amt) || 0;
        }
      });

      const inDateObj = item.inDate ? new Date(item.inDate) : null;
      const isMidMonthJoiner = !!(inDateObj &&
          inDateObj.getFullYear() === yearNum &&
          inDateObj.getMonth() + 1 === monthNum &&
          inDateObj.getDate() !== 1);

      const rowObj = {
        idx: item.idx,
        empName: item.billingName || '',
        position: item.role || '',
        itemCd: item.itemCd || '',
        sort: item.sort || null,
        personalNo: item.birthDt,
        inDate: item.inDate,
        outDate: item.outDate ?? '',
        transferDate: item.transferDate ?? '',
        grossPay: recalculatedGrossPay,
        payItems: filteredPayItems,
        deductionItems: parsedDeductions,
        originalDeductions: JSON.parse(JSON.stringify(parsedDeductions)),
        originalSanjae: 0,
        totalDeduct: 0,
        reserves: { annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0 },
        netPay: 0,
        isMidMonthJoiner,
        gapDays: Number(item.gapDays) || 0,
        groupNo: 0,
      };

      applyContractReserves(rowObj);
      recalculateInsurances(rowObj);

      if (isMidMonthJoiner) {
        deductionItems.value.forEach(dItem => {
          rowObj.deductionItems[dItem.itemCd] = 0;
          rowObj.originalDeductions[dItem.itemCd] = 0;
        });
        rowObj.reserves.empInsEmployer = 0;
        rowObj.reserves.sanjae = 0;
        rowObj.originalSanjae = 0;
      }

      calculateRow(rowObj);
      return rowObj;
    });

    // 정렬: 직책코드 → 중간입사여부 → 사번
    formData.value.payrollData.sort((a, b) => {
      const cdA = String(a.itemCd || '');
      const cdB = String(b.itemCd || '');
      if (cdA !== cdB) return cdA.localeCompare(cdB, 'ko', { numeric: true });
      if (a.isMidMonthJoiner !== b.isMidMonthJoiner) return a.isMidMonthJoiner ? 1 : -1;
      return Number(a.idx) - Number(b.idx);
    });

    // 정렬된 순서대로 그룹 번호 부여
    let groupCounter = 0;
    const posToGroup = new Map();

    formData.value.payrollData.forEach(row => {
      const pos = row.positionCd || row.position || '';
      const outDateObj = row.outDate ? new Date(row.outDate) : null;
      const isCurrentMonthLeaver = !!(outDateObj &&
          outDateObj.getFullYear() === yearNum &&
          outDateObj.getMonth() + 1 === monthNum);

      if (row.isMidMonthJoiner && posToGroup.has(pos)) {
        row.groupNo = posToGroup.get(pos);
        posToGroup.delete(pos);
      } else {
        groupCounter++;
        row.groupNo = groupCounter;
        if (isCurrentMonthLeaver) posToGroup.set(pos, groupCounter);
      }
    });

    if (formData.value.payrollData.length === 0) customAlert('조건에 맞는 직원 데이터가 없습니다.', 'error');
    else alert('직원 급여 데이터를 성공적으로 불러왔습니다.');
  } catch (error) {
    console.error('데이터 로드 에러:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  }
};

const updateDocNo = () => {
  if (isInitializing.value) return;

  const targetDate = formData.value.target_month || formData.value.billingDt;
  if (!targetDate) return;

  const [year, month] = targetDate.split('-');
  if (formData.value.sIdx) {
    formData.value.docNo = `에코그린 ${year}-${month.padStart(2, '0')}-${formData.value.sIdx}호`;
  }
  if (formData.value.type) {
    const typeName = typeOptions.value.find(t => t.itemCd === formData.value.type)?.itemNm || '';
    formData.value.billingData.summary = `${year}년 ${parseInt(month)}월 ${typeName}용역비 청구의 건`;
  }
};

const handleContractUpdate = () => {
  if (!formData.value.type || !formData.value.sIdx) return;
  // 계약 참조 데이터(요율 계산용 원본)만 새로고침합니다.
  // 이미 입력/저장된 직원 행(row)의 reserves·deductionItems는 여기서 건드리지 않습니다 —
  // 그렇게 하면 시행일자·구분을 바꾸거나 급여 표를 입력하는 것만으로도 이 함수가 재호출되어
  // 방금 입력한 값(산재보험, 국민연금 등)이 계약서 기준 재계산값으로 조용히 덮어써집니다.
  // 직책을 새로 입력할 때는 applyContractReserves가 개별적으로 호출되고,
  // 수당 포함 옵션(melt)을 켤 때는 별도 watcher가 개별적으로 재계산을 처리합니다.
  fetchContractData();
};

watch(() => formData.value.sIdx, updateDocNo);
watch([() => formData.value.target_month, () => formData.value.billingDt], () => {
  updateDocNo();
  runIfReady(handleContractUpdate);
});
watch(() => formData.value.type, (newType) => {
  runIfReady(() => { if (newType) handleContractUpdate(); });
});

const handleSiteChange = () => {
  const selectedSite = siteOptions.value.find(s => s.idx === formData.value.sIdx);

  if (!selectedSite) {
    formData.value.siteName = '';
    formData.value.is_vat = 'N';
    calculateBillingTotal();
    fetchContractData();
    return;
  }

  formData.value.siteName = selectedSite.name;
  formData.value.is_vat = selectedSite.is_vat || 'N';

  if (selectedSite.bankName || selectedSite.accountNumber) {
    const bank = selectedSite.bankName || '';
    const accNum = selectedSite.accountNumber || '';
    const accName = selectedSite.accountName || '';
    formData.value.billingData.bankInfo = `${bank} ${accNum} (예금주: ${accName})`.trim();
  } else {
    formData.value.billingData.bankInfo = defaultBankInfo;
  }

  const vb = formData.value.billingData.vatBreakdown;
  // Number()를 빼서 DB 원본 소수 문자열('32020.9600')을 그대로 유지
  const rawUnder = String(selectedSite.areaUnder || selectedSite.area_under || '0').replace(/,/g, '');
  const rawOver = String(selectedSite.areaOver || selectedSite.area_over || '0').replace(/,/g, '');
  const dbAreaTotal = (Number(rawUnder) + Number(rawOver)).toFixed(4); // 덧셈 오차 방지

  if (formData.value.is_vat === 'Y') {
    if (Number(rawUnder) > 0 || Number(rawOver) > 0) {
      vb.under135.area = rawUnder;
      vb.over135.area = rawOver;
    } else {
      vb.under135.area = '0';
      vb.over135.area = dbAreaTotal;
    }
  } else {
    vb.under135.area = Number(rawUnder) > 0 ? rawUnder : dbAreaTotal;
    vb.over135.area = '0';
  }

  calculateAreaSupply();
  calculateBillingTotal();
  fetchContractData();
};

// ──────────────────────────────────────────────
// 청구 내역 / 급여 행 CRUD
// ──────────────────────────────────────────────
const addBillingRow = () => formData.value.billingData.items.push({ period: '', category: '', detail: '', amount: 0, note: '' });
const removeBillingRow = (i) => { formData.value.billingData.items.splice(i, 1); calculateBillingTotal(); };

const addPayrollRow = () => {
  const maxGroupNo = formData.value.payrollData.reduce((max, r) => Math.max(max, r.groupNo || 0), 0);
  formData.value.payrollData.push({
    empName: '', position: '', personalNo: '', inDate: '', outDate: '',
    grossPay: 0, deductionItems: {}, originalDeductions: {}, originalSanjae: 0, totalDeduct: 0,
    reserves: { annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0 },
    netPay: 0, groupNo: maxGroupNo + 1, isMidMonthJoiner: false,
  });
};

const removePayrollRow = async (i) => {
  if (await window.customConfirm('삭제하시겠습니까?')) formData.value.payrollData.splice(i, 1);
};

// 그룹핑(합치기/분리) — 같은 세대/직책 등을 한 행 번호로 묶기 위한 기능
const mergeWithAbove = (row) => {
  const flatIdx = getRowFlatIndex(row);
  if (flatIdx === 0) return;
  row.groupNo = formData.value.payrollData[flatIdx - 1].groupNo;
  resequenceGroupNos();
};

const separateRow = (row) => {
  row.groupNo = Date.now(); // 임시 고유번호로 그룹 분리
  resequenceGroupNos();
};

const resequenceGroupNos = () => {
  const oldToNew = new Map();
  let counter = 0;
  formData.value.payrollData.forEach(row => {
    if (!oldToNew.has(row.groupNo)) oldToNew.set(row.groupNo, ++counter);
    row.groupNo = oldToNew.get(row.groupNo);
  });
};

const onDragStart = (index) => { dragIndex.value = index; };

const onDrop = (index) => {
  if (dragIndex.value === null || dragIndex.value === index) return;
  const list = formData.value.payrollData;
  const dragged = list.splice(dragIndex.value, 1)[0];
  list.splice(index, 0, dragged);
  resequenceGroupNos();
};

const onDragEnd = () => {
  dragIndex.value = null;
  draggableRowIdx.value = null;
};

const onDragOver = (e, index) => {
  e.preventDefault();
  if (dragIndex.value === null || dragIndex.value === index) return;
  const list = formData.value.payrollData;
  const dragged = list.splice(dragIndex.value, 1)[0];
  list.splice(index, 0, dragged);
  dragIndex.value = index;
};

// docType: 'SERVICE' = 정산서(청구공문+급여세부내역서), 'RETIRE_ANNUAL' = 연차퇴직정산서
const getSettleTemplate = async (docType = 'SERVICE') => {
  const res = await axios.get('/api/v1/settle/template/list', { params: { cIdx } });
  const list = res.data?.data || [];
  return list.find(t => t.docType === docType) || null;
};

// filePath가 상대경로("/uploads/xxx.xlsx")로 오므로, API 서버 origin을 붙여준다.
// axios.defaults.baseURL이 이미 API 서버로 설정돼 있다면 그걸 재사용하는 게 안전.
const resolveFileUrl = (filePath) => {
  if (!filePath) return '';
  if (/^https?:\/\//.test(filePath)) return filePath;
  return `/api${filePath}`; // /api + /uploads/xxx.xlsx
};

// ──────────────────────────────────────────────
// 8. 엑셀 저장 / 데이터 저장
// ──────────────────────────────────────────────
const isExportingPdf = ref(false);
/*
const exportToExcel = async () => {
  try {
    const template = await getSettleTemplate('SERVICE');
    if (!template || !template.filePath) {
      alert('등록된 정산서 양식이 없습니다. 관리자에게 문의해주세요.');
      return;
    }

    const fileRes = await fetch(resolveFileUrl(template.filePath)); // 상대경로 → 절대 URL 변환
    if (!fileRes.ok) throw new Error('양식 파일을 불러올 수 없습니다.');
    const arrayBuffer = await fileRes.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const sheet = workbook.worksheets[0];

    // ── 1. 기본 값 계산 ─────────────────────────────
    const targetDateStr = formData.value.target_month || formData.value.billingDt || '';
    const [yyyy, mmRaw] = targetDateStr.split('-');
    const mm = mmRaw ? String(Number(mmRaw)) : '';

    const findSummary = (key) => totalSummary.value.find(s => s.key === key);
    const signedVal = (key) => {
      const s = findSummary(key);
      return s ? s.value * s.sign : 0;
    };

    const customTotal = (formData.value.billingData.customSummaryItems || [])
        .reduce((sum, item) => sum + (Number(item.amount) || 0) * (item.sign || 1), 0);

    const vb = formData.value.billingData.vatBreakdown;

    // ── 2. 급여 반복행 데이터 (코드가 아니라 항목명으로 매칭 → 회사마다 코드 달라도 안전) ──
    const findDeductAmount = (row, keyword) => {
      const entry = deductionItems.value.find(i => i.itemNm.includes(keyword));
      return entry ? (Number(row.deductionItems?.[entry.itemCd]) || 0) : 0;
    };

    const payrollRows = formData.value.payrollData.map((row, idx) => ({
      no: idx + 1,
      empName: row.empName || '',
      position: row.position || '',
      personalNo: row.personalNo || '',
      inDate: row.inDate || '',
      outDate: row.outDate || '',
      nationalPension: findDeductAmount(row, '국민연금'),
      healthInsurance: findDeductAmount(row, '건강보험'),
      longTermCare: findDeductAmount(row, '장기요양'),
      unemployment: findDeductAmount(row, '고용보험'),
      empStability: Number(row.reserves?.empInsEmployer) || 0,
      sanjae: Number(row.reserves?.sanjae) || 0,
      total: Number(getInsuranceTotal(row)) || 0,
    }));

    const payrollTotal = payrollRows.reduce((acc, r) => {
      ['nationalPension','healthInsurance','longTermCare','unemployment','empStability','sanjae','total']
          .forEach(k => { acc[k] = (acc[k] || 0) + r[k]; });
      return acc;
    }, {});

    // ── 3. 단일 값 컨텍스트 ─────────────────────────
    const context = {
      yyyy, mm,
      siteName: formData.value.siteName || '',
      monthlyFee: contractTotalCost.value || 0,
      annualLeave: signedVal('annualLeave'),
      severance: signedVal('severance'),
      insuranceDiff: Number(formData.value.billingData.insuranceDiff) || 0,
      customTotal,
      grandTotal: findSummary('grandTotal')?.value || 0,
      under135Area: vb.under135.area || 0,
      unitPrice: vb.under135.unitPrice || vb.over135.unitPrice || 0,
      under135Supply: vb.under135.supply || 0,
      over135Area: vb.over135.area || 0,
      over135Supply: vb.over135.supply || 0,
      over135Vat: vb.over135.vat || 0,
      over135Total: (Number(vb.over135.supply) || 0) + (Number(vb.over135.vat) || 0),
      billingDt: formData.value.billingDt || '',
      bankInfo: formData.value.billingData.bankInfo || '',
      payrollTotal,
    };

    // ── 4. 급여 반복행 처리 ─────────────────────────
    let templateRowNum = null;
    const colKeyMap = {};

    outer:
        for (let r = 1; r <= sheet.rowCount; r++) {
          const row = sheet.getRow(r);
          for (let c = 1; c <= sheet.columnCount; c++) {
            const v = row.getCell(c).value;
            if (typeof v === 'string' && /^\{\{payroll\.\w+\}\}$/.test(v.trim())) {
              templateRowNum = r;
              row.eachCell({ includeEmpty: false }, (cell, colNum) => {
                const m = /^\{\{payroll\.(\w+)\}\}$/.exec(String(cell.value).trim());
                if (m) colKeyMap[colNum] = m[1];
              });
              break outer;
            }
          }
        }

    if (templateRowNum) {
      const checkCol = Math.min(...Object.keys(colKeyMap).map(Number));

      // 템플릿 행 아래로, 문자 라벨(=합계 행)이 나오기 전까지가 '빈 자리' 행
      let staticRows = 1;
      let r = templateRowNum + 1;
      while (r <= sheet.rowCount) {
        const v = sheet.getRow(r).getCell(checkCol).value;
        if (typeof v === 'string' && v.trim() !== '') break; // '계' 등 라벨 행
        staticRows++;
        r++;
      }

      // 직원이 빈 자리보다 많으면 합계 행 앞에 행을 추가로 복제
      const need = payrollRows.length - staticRows;
      if (need > 0) {
        sheet.duplicateRow(templateRowNum + staticRows - 1, need, true);
      }

      // 데이터 채우기
      payrollRows.forEach((p, i) => {
        const targetRow = sheet.getRow(templateRowNum + i);
        Object.entries(colKeyMap).forEach(([colNum, key]) => {
          targetRow.getCell(Number(colNum)).value = p[key] ?? '';
          targetRow.getCell(Number(colNum)).numFmt =
              typeof p[key] === 'number' ? '#,##0' : targetRow.getCell(Number(colNum)).numFmt;
        });
      });

      // 남는 빈 행은 비우기
      for (let i = payrollRows.length; i < staticRows; i++) {
        const targetRow = sheet.getRow(templateRowNum + i);
        Object.keys(colKeyMap).forEach(c => { targetRow.getCell(Number(c)).value = null; });
      }
    }

    // ── 5. 나머지 {{...}} 플레이스홀더 전체 치환 ─────
    const resolvePath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    const PLACEHOLDER_RE = /\{\{([\w.]+)\}\}/g;

    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value !== 'string' || !cell.value.includes('{{')) return;
        const raw = cell.value;
        const matches = [...raw.matchAll(PLACEHOLDER_RE)];
        if (matches.length === 0) return;

        // 셀 전체가 플레이스홀더 하나뿐이면 숫자 타입 그대로 대입(합계 서식 유지)
        if (matches.length === 1 && matches[0][0] === raw.trim()) {
          const key = matches[0][1];
          if (key.startsWith('payroll.')) return; // 이미 처리됨
          let v = resolvePath(context, key);
          if (v === undefined) v = 0;
          cell.value = v;
          if (typeof v === 'number' && !cell.numFmt) cell.numFmt = '#,##0';
          return;
        }

        // 텍스트 안에 여러 개 섞여 있으면 문자열 치환
        cell.value = raw.replace(PLACEHOLDER_RE, (_, key) => {
          const v = resolvePath(context, key);
          return v === undefined ? '' : String(v);
        });
      });
    });

    // ── 6. 저장 ─────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `정산서_${formData.value.siteName || '현장'}_${targetDateStr}.xlsx`;
    saveAs(new Blob([buffer]), fileName);
  } catch (error) {
    console.error('엑셀 저장 중 오류 발생:', error);
    alert('엑셀 파일을 생성하는 중 오류가 발생했습니다.');
  }
};

 */
const exportToExcel = async () => {
  try {
    const buffer = await buildSettleWorkbookBuffer();
    const targetDateStr = formData.value.target_month || formData.value.billingDt || '';
    const fileName = `정산서_${formData.value.siteName || '현장'}_${targetDateStr}.xlsx`;
    saveAs(new Blob([buffer]), fileName);
  } catch (error) {
    console.error('엑셀 저장 중 오류 발생:', error);
    alert(error.message || '엑셀 파일을 생성하는 중 오류가 발생했습니다.');
  }
};

const exportToPdf = async () => {
  isExportingPdf.value = true;
  try {
    const buffer = await buildSettleWorkbookBuffer();

    const form = new FormData();
    form.append('file', new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }), 'settle.xlsx');

    const res = await axios.post('/api/v1/excel-to-pdf', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
      timeout: 30000,
    });

    const targetDateStr = formData.value.target_month || formData.value.billingDt || '';
    const fileName = `정산서_${formData.value.siteName || '현장'}_${targetDateStr}.pdf`;
    saveAs(new Blob([res.data], { type: 'application/pdf' }), fileName);
  } catch (error) {
    console.error('PDF 저장 중 오류 발생:', error);
    alert(error.message || 'PDF 파일을 생성하는 중 오류가 발생했습니다.');
  } finally {
    isExportingPdf.value = false;
  }
};
// ── 병합을 보존하면서 행을 복제하는 안전한 헬퍼 ──
function duplicateRowPreservingMerges(sheet, sourceRowNum, count) {
  if (count <= 0) return;

  const parseCellRef = (ref) => {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    return { col: m[1], row: parseInt(m[2], 10) };
  };
  const parseRange = (rangeStr) => {
    const [s, e] = rangeStr.split(':');
    const start = parseCellRef(s);
    const end = parseCellRef(e);
    return { startCol: start.col, startRow: start.row, endCol: end.col, endRow: end.row };
  };

  // 1) 삽입 지점보다 아래 있는 병합의 값/서식을 미리 저장하고 해제
  const savedMerges = [];
  const allMerges = [...sheet.model.merges];
  for (const rangeStr of allMerges) {
    const { startRow, endRow, startCol, endCol } = parseRange(rangeStr);
    if (startRow > sourceRowNum) {
      const masterCell = sheet.getCell(`${startCol}${startRow}`);
      savedMerges.push({
        startCol, endCol, startRow, endRow,
        value: masterCell.value,
        style: JSON.parse(JSON.stringify(masterCell.style || {})),
      });
      sheet.unMergeCells(rangeStr);
    }
  }

  // 2) 행 복제 (병합이 없는 상태라 값 복제 부작용이 안 생김)
  sheet.duplicateRow(sourceRowNum, count, true);

  // 3) 저장해둔 병합을 count만큼 아래로 옮겨 재적용
  savedMerges
      .sort((a, b) => b.startRow - a.startRow)
      .forEach(({ startCol, endCol, startRow, endRow, value, style }) => {
        const newStartRow = startRow + count;
        const newEndRow = endRow + count;
        const colStart = sheet.getColumn(startCol).number;
        const colEnd = sheet.getColumn(endCol).number;

        for (let r = newStartRow; r <= newEndRow; r++) {
          for (let c = colStart; c <= colEnd; c++) {
            sheet.getRow(r).getCell(c).value = null;
          }
        }

        sheet.mergeCells(`${startCol}${newStartRow}:${endCol}${newEndRow}`);
        const masterCell = sheet.getCell(`${startCol}${newStartRow}`);
        masterCell.value = value;
        if (style) masterCell.style = style;
      });
}
// ──────────────────────────────────────────────
// 정산서 워크북 생성 (엑셀 저장 / PDF 저장 공통 사용)
// ──────────────────────────────────────────────
const buildSettleWorkbookBuffer = async () => {
  const template = await getSettleTemplate('SERVICE');
  if (!template || !template.filePath) {
    throw new Error('등록된 정산서 양식이 없습니다. 관리자에게 문의해주세요.');
  }
/*
  const fileRes = await fetch(resolveFileUrl(template.filePath));
  if (!fileRes.ok) throw new Error('양식 파일을 불러올 수 없습니다.');
  const arrayBuffer = await fileRes.arrayBuffer();

 */
  const fileRes = await axios.get(resolveFileUrl(template.filePath), {
    responseType: 'arraybuffer'
  });
  const arrayBuffer = fileRes.data;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];

  sheet.pageSetup = {
    ...sheet.pageSetup,
    horizontalCentered: true,
    verticalCentered: false,
  };

  // ── 1. 기본 값 계산 ─────────────────────────────
  const targetDateStr = formData.value.target_month || formData.value.billingDt || '';
  const [yyyy, mmRaw] = targetDateStr.split('-');
  const mm = mmRaw ? String(Number(mmRaw)) : '';

  const findSummary = (key) => totalSummary.value.find(s => s.key === key);
  const signedVal = (key) => {
    const s = findSummary(key);
    return s ? s.value * s.sign : 0;
  };

  const customTotal = (formData.value.billingData.customSummaryItems || [])
      .reduce((sum, item) => sum + (Number(item.amount) || 0) * (item.sign || 1), 0);

  const vb = formData.value.billingData.vatBreakdown;

  // ── 2-1. 청구내역(billingData.items) 항목별 비고 매핑 ──
  const findItemNote = (syncKey) => {
    const item = (formData.value.billingData.items || []).find(i => i._syncKey === syncKey);
    return item?.note || '';
  };

  // ── 2. 급여 반복행 데이터 (코드가 아니라 항목명으로 매칭 → 회사마다 코드 달라도 안전) ──
  const findDeductAmount = (row, keyword) => {
    const entry = deductionItems.value.find(i => i.itemNm.includes(keyword));
    return entry ? (Number(row.deductionItems?.[entry.itemCd]) || 0) : 0;
  };

  const payrollRows = formData.value.payrollData.map((row, idx) => ({
    no: idx + 1,
    empName: row.empName || '',
    position: row.position || '',
    personalNo: row.personalNo || '',
    inDate: row.inDate || '',
    outDate: row.outDate || '',
    nationalPension: findDeductAmount(row, '국민연금'),
    healthInsurance: findDeductAmount(row, '건강보험'),
    longTermCare: findDeductAmount(row, '장기요양'),
    unemployment: findDeductAmount(row, '고용보험'),
    empStability: Number(row.reserves?.empInsEmployer) || 0,
    sanjae: Number(row.reserves?.sanjae) || 0,
    total: Number(getInsuranceTotal(row)) || 0,
  }));

  const payrollTotal = payrollRows.reduce((acc, r) => {
    ['nationalPension','healthInsurance','longTermCare','unemployment','empStability','sanjae','total']
        .forEach(k => { acc[k] = (acc[k] || 0) + r[k]; });
    return acc;
  }, {});

  // ── 2-2. 계약서(산출내역서) 기준 견적 4대보험 (항목별) ──
  const estNationalPension = sumByKeyword(contractIndirectLabor.value, '국민연금');
  const estHealthInsurance = sumByKeyword(contractIndirectLabor.value, '건강보험');
  const estLongTermCare    = sumByKeyword(contractIndirectLabor.value, '장기요양');
  const estUnemployment    = sumByKeyword(contractIndirectLabor.value, '고용보험'); // 실업급여+고용안정 합산 1개 항목
  const estSanjae          = sumByKeyword(contractIndirectLabor.value, '산재');

  // ── 3. 단일 값 컨텍스트 ─────────────────────────
  const context = {
    yyyy, mm,
    siteName: formData.value.siteName || '',
    monthlyFee: contractTotalCost.value || 0,
    monthlyFeeNote: findItemNote('monthlyFee'),
    annualLeave: signedVal('annualLeave'),
    annualLeaveNote: findItemNote('annualLeave'),
    severance: signedVal('severance'),
    severanceNote: findItemNote('severance'),
    insuranceDiff: Number(formData.value.billingData.insuranceDiff) || 0,
    insuranceDiffNote: findItemNote('insuranceDiff'),
    customTotal,
    grandTotal: findSummary('grandTotal')?.value || 0,
    under135Area: vb.under135.area || 0,
    unitPrice: vb.under135.unitPrice || vb.over135.unitPrice || 0,
    under135Supply: vb.under135.supply || 0,
    over135Area: vb.over135.area || 0,
    over135Supply: vb.over135.supply || 0,
    over135Vat: vb.over135.vat || 0,
    over135Total: (Number(vb.over135.supply) || 0) + (Number(vb.over135.vat) || 0),
    billingDt: formData.value.billingDt || '',
    bankInfo: formData.value.billingData.bankInfo || '',
    payrollTotal,
    contract: {
      nationalPension: estNationalPension,
      healthInsurance: estHealthInsurance,
      longTermCare:    estLongTermCare,
      employment:      estUnemployment,   // 실업급여+고용안정 합산 1개 항목
      sanjae:          estSanjae,
      total:           estimatedInsuranceTotal.value || 0,
    },
    diff: {
      nationalPension: (payrollTotal.nationalPension || 0) - estNationalPension,
      healthInsurance: (payrollTotal.healthInsurance || 0) - estHealthInsurance,
      longTermCare:    (payrollTotal.longTermCare || 0) - estLongTermCare,
      employment:      ((payrollTotal.unemployment || 0) + (payrollTotal.empStability || 0)) - estUnemployment,
      sanjae:          (payrollTotal.sanjae || 0) - estSanjae,
      total:           (payrollTotal.total || 0) - (estimatedInsuranceTotal.value || 0),
    },
  };

  // ── 4. 급여 반복행 처리 ─────────────────────────
  let templateRowNum = null;
  const colKeyMap = {};

  outer:
      for (let r = 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        for (let c = 1; c <= sheet.columnCount; c++) {
          const v = row.getCell(c).value;
          if (typeof v === 'string' && /^\{\{payroll\.\w+\}\}$/.test(v.trim())) {
            templateRowNum = r;
            row.eachCell({ includeEmpty: false }, (cell, colNum) => {
              const m = /^\{\{payroll\.(\w+)\}\}$/.exec(String(cell.value).trim());
              if (m) colKeyMap[colNum] = m[1];
            });
            break outer;
          }
        }
      }

  if (templateRowNum) {
    const checkCol = Math.min(...Object.keys(colKeyMap).map(Number));

    // 템플릿 행 아래로, 문자 라벨(=합계 행)이 나오기 전까지가 '빈 자리' 행
    let staticRows = 1;
    let r = templateRowNum + 1;
    while (r <= sheet.rowCount) {
      const v = sheet.getRow(r).getCell(checkCol).value;
      if (typeof v === 'string' && v.trim() !== '') break; // '계' 등 라벨 행
      staticRows++;
      r++;
    }

    // 직원이 빈 자리보다 많으면 합계 행 앞에 행을 추가로 복제
    const need = payrollRows.length - staticRows;
    duplicateRowPreservingMerges(sheet, templateRowNum + staticRows - 1, need);

    // 데이터 채우기
    // 0일 때 "해당없음"으로 표시할 컬럼
    const NA_DISPLAY_KEYS = ['nationalPension', 'healthInsurance', 'longTermCare', 'unemployment'];

    // 데이터 채우기
    payrollRows.forEach((p, i) => {
      const targetRow = sheet.getRow(templateRowNum + i);
      Object.entries(colKeyMap).forEach(([colNum, key]) => {
        const cell = targetRow.getCell(Number(colNum));
        const rawVal = p[key];

        if (NA_DISPLAY_KEYS.includes(key) && (Number(rawVal) || 0) === 0) {
          cell.value = '해당없음';
          cell.numFmt = '@'; // 숫자 포맷 잔존 방지 (텍스트로 전환)
        } else {
          cell.value = rawVal ?? '';
          if (typeof rawVal === 'number') cell.numFmt = '#,##0';
        }
      });
    });

    // 남는 빈 행은 비우기
    for (let i = payrollRows.length; i < staticRows; i++) {
      const targetRow = sheet.getRow(templateRowNum + i);
      Object.keys(colKeyMap).forEach(c => { targetRow.getCell(Number(c)).value = null; });
    }
  }

  // ── 4-1. 면세 사업장이면 면적별 산출내역 표를 값/테두리만 제거해서 숨김 ──
  if (formData.value.is_vat === 'N') {
    let areaHeaderRow = null;
    for (let r = 1; r <= sheet.rowCount; r++) {
      const cellVal = sheet.getRow(r).getCell(2).value; // B열 기준
      if (typeof cellVal === 'string' && cellVal.includes('면적') && cellVal.includes('구분')) {
        areaHeaderRow = r;
        break;
      }
    }
    if (areaHeaderRow) {
      // 헤더 + 135㎡ 이하 + 135㎡ 초과 + 스페이서 행까지 총 4행
      const blockRows = 4;
      const noBorder = { top: null, left: null, bottom: null, right: null };

      for (let r = areaHeaderRow; r < areaHeaderRow + blockRows; r++) {
        const row = sheet.getRow(r);
        for (let c = 1; c <= sheet.columnCount; c++) {
          const cell = row.getCell(c);
          cell.value = null;
          cell.border = noBorder;
          cell.fill = { type: 'pattern', pattern: 'none' };
        }
      }
    }
  }

  // ── 5. 나머지 {{...}} 플레이스홀더 전체 치환 ─────
  const resolvePath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const PLACEHOLDER_RE = /\{\{([\w.]+)\}\}/g;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.isMerged && cell.master !== cell) return;
      if (typeof cell.value !== 'string' || !cell.value.includes('{{')) return;
      const raw = cell.value;
      const matches = [...raw.matchAll(PLACEHOLDER_RE)];
      if (matches.length === 0) return;

      // 셀 전체가 플레이스홀더 하나뿐이면 숫자 타입 그대로 대입(합계 서식 유지)
      if (matches.length === 1 && matches[0][0] === raw.trim()) {
        const key = matches[0][1];
        if (key.startsWith('payroll.')) return; // 이미 처리됨
        let v = resolvePath(context, key);
        if (v === undefined) v = 0;
        cell.value = v;
        // if (typeof v === 'number' && !cell.numFmt) cell.numFmt = '#,##0';
        return;
      }

      // 텍스트 안에 여러 개 섞여 있으면 문자열 치환
      cell.value = raw.replace(PLACEHOLDER_RE, (_, key) => {
        const v = resolvePath(context, key);
        return v === undefined ? '' : String(v);
      });
    });
  });
// ── 5-1. 렌더링 엔진(LibreOffice)이 좁은 열에서 글자를 잘라먹는 문제 방지 ──
  // wrapText를 끄고 shrinkToFit을 켜서, 변환기가 열 너비를 어떻게 계산하든
  // 텍스트가 잘리는 대신 폰트 크기가 자동으로 줄어들며 한 줄에 표시되도록 강제합니다.
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.alignment = {
        ...cell.alignment,
        wrapText: false,
        shrinkToFit: true,
      };
    });
  });

  // 시트 확대/축소 배율도 100%로 고정 (뷰어별 확대 상태 차이로 인한 착시 방지)
  if (sheet.views && sheet.views.length > 0) {
    sheet.views[0].zoomScale = 100;
  } else {
    sheet.views = [{ zoomScale: 100 }];
  }

  // ── 6. buffer 반환 (다운로드는 호출부에서 처리) ──
  workbook.calcProperties.fullCalcOnLoad = true;
  return await workbook.xlsx.writeBuffer();
};

const handleSave = async () => {
  try {
    const sIdx = formData.value.sIdx;
    if (!sIdx) { alert('현장을 선택해주세요.'); return; }

    const [year, month] = (formData.value.target_month || formData.value.billingDt).split('-');
    if (!year || !month) { alert('날짜를 선택해주세요.'); return; }

    const payload = {
      idx: props.settlementId,
      year: parseInt(year) || 0,
      month: parseInt(month) || 0,
      type: formData.value.type,
      docNo: formData.value.docNo,
      billingDt: formData.value.billingDt,
      subTotal: formData.value.subTotal,
      vatAmount: formData.value.vatAmount,
      grandTotal: formData.value.grandTotal,
      billingData: formData.value.billingData,
      payrollData: formData.value.payrollData,
      viewConfig: JSON.parse(JSON.stringify({ ...currentConfig, meltOptions })),
      cIdx: authStore.user?.cIdx || 0,
    };

    const response = await axios.post(`/api/v1/settle/site/data/${sIdx}`, payload);
    if (response.data.result) {
      alert('성공적으로 저장되었습니다.');
      emit('save');
    } else {
      alert(`저장 실패: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('정산서 저장 중 오류 발생:', error);
    alert('서버 통신 중 오류가 발생했습니다.');
  }
};

const showSiteBigo = async () => {
  if (!formData.value.sIdx) {
    await window.customAlert('현장을 먼저 선택해주세요.', 'error');
    return;
  }
  if (siteBigoList.value.length === 0) {
    await window.customAlert('등록된 특이사항이 없습니다.', 'info');
    return;
  }
  const msg = siteBigoList.value.map(b => `${b.bigo || ''}`).join('\n\n');
  window.customAlert(`${msg}`, 'special');
};

const closeModal = () => emit('close');

onMounted(async () => {
  await Promise.all([fetchSiteOptions(), fetchTypeOptions()]);
  await getWageCode();
  await fetchTaxRates();
});
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @mousedown.self="closeModal">
    <div class="modal-container">

      <div class="modal-header">
        <div class="header-title">
          <h2>{{ settlementId ? '정산 내역 수정' : '새 정산서 작성' }}</h2>
          <span class="badge">{{ formData.siteName || '현장 미지정' }} ({{ formData.target_month || '연월 미지정' }})</span>
          <button class="btn-bigo" :class="{ 'has-bigo': siteBigoList.length > 0 }" @click="showSiteBigo">
            <i class="mdi mdi-alert-circle-outline"></i>
            <span class="btn-text">특이사항</span>
          </button>
        </div>
        <div class="header-actions">
          <button class="btn-refresh" @click="resetAll">
            <i class="mdi mdi-refresh"></i>
            <span class="btn-text">초기화</span>
          </button>
          <button class="btn-excel" @click="exportToExcel"><i class="mdi mdi-microsoft-excel"></i><span class="btn-text">엑셀 저장</span></button>
          <button class="btn-pdf" @click="exportToPdf" :disabled="isExportingPdf">
            <i class="mdi mdi-file-pdf-box"></i>
            <span class="btn-text">{{ isExportingPdf ? '변환 중...' : 'PDF 저장' }}</span>
          </button>
          <button class="btn-save" @click="handleSave"><i class="mdi mdi-content-save"></i><span class="btn-text">저장하기</span></button>
          <button class="btn-close" @click="closeModal"><i class="mdi mdi-close"></i></button>
        </div>
      </div>

      <div class="modal-tabs">
        <button v-if="currentConfig.exportConfig.includeStatement" :class="['tab-btn', { active: activeTab === 'statement' }]" @click="activeTab = 'statement'">
          <span class="tab-text">청구 공문</span>
        </button>

        <button v-if="currentConfig.exportConfig.includeDetails" :class="['tab-btn', { active: activeTab === 'details' }]" @click="activeTab = 'details'">
          <span class="tab-text">급여 세부 내역서</span>
        </button>

        <button v-if="currentConfig.exportConfig.includePayroll" :class="['tab-btn', { active: activeTab === 'payroll' }]" @click="activeTab = 'payroll'">
          <span class="tab-text">급여 대장</span>
        </button>
      </div>

      <div class="modal-body">

        <div v-show="activeTab === 'statement'" class="tab-content">
          <div class="document-paper">
            <div class="doc-header text-center"><h1>청 구 공 문</h1></div>

            <div class="form-grid">
              <div class="form-group">
                <label>현장 선택 <span class="text-red">*</span></label>
                <SiteSelect
                    v-model="formData.sIdx"
                    @update:modelValue="handleSiteChange"
                    :width="'100%'">
                </SiteSelect>
              </div>
              <div class="form-group">
                <label>구분 선택 <span class="text-red">*</span></label>
                <select v-model="formData.type" class="form-select">
                  <option value="" disabled>구분을 선택해주세요</option>
                  <option v-for="tp in typeOptions" :key="tp.itemCd" :value="tp.itemCd">{{ tp.itemNm }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>수신</label>
                <input
                    type="text"
                    :value="formData.siteName ? formData.siteName + ' 관리사무소' : ''"
                    readonly
                    class="bg-gray form-input"
                    placeholder="현장을 선택하면 자동 입력됩니다"
                />
              </div>
              <div class="form-group">
                <label>문서번호</label>
                <input
                    type="text"
                    v-model="formData.docNo"
                    class="form-input"
                    placeholder="예: 에코그린 2026-01-09호"
                />
              </div>
              <div class="form-group">
                <label>시행일자</label>
                <input
                    type="date"
                    v-model="formData.billingDt"
                    class="form-input"
                    @click="handleDateClick($event)"
                />
              </div>
              <div class="form-group">
                <label>제목</label>
                <input
                    type="text"
                    v-model="formData.billingData.summary"
                    placeholder="예: 2026년 1월 미화용역비 청구의 건"
                    class="form-input"
                />
              </div>
            </div>

            <div class="doc-message-wrap mt-4">
              <textarea
                  v-model="formData.billingData.headerMessage"
                  class="form-input text-center"
                  rows="4"
                  style="resize: vertical; line-height: 1.6; font-size: 15px; border: 1px dashed var(--border-focus); background: transparent; padding: 16px;"
              ></textarea>
            </div>

            <div class="table-actions mt-4">
              <h4>
                <i class="mdi mdi-format-list-checks"></i> 청구 내역
                <span v-if="formData.is_vat === 'N'" class="vat-badge vat-free">(면세 사업장)</span>
                <span v-else class="vat-badge vat-taxed">(과세 사업장)</span>
              </h4>
              <button class="btn-add-row" @click="addBillingRow"><i class="mdi mdi-plus-thick"></i><span class="btn-text">항목 추가</span></button>
            </div>

            <div class="table-scroll-wrapper">
              <table class="excel-table statement-table">
                <colgroup>
                  <col width="15%">
                  <col width="10%">
                  <col width="20%">
                  <col width="15%">
                  <col width="*%">
                  <col width="5%">
                </colgroup>
                <thead>
                <tr>
                  <th style="width:100px;">산정기간</th>
                  <th style="width:70px;">구분</th>
                  <th>내역</th>
                  <th style="width:90px;">산출금액</th>
                  <th style="width:90px;">비고</th>
                  <th style="width:34px;"></th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(item, index) in formData.billingData.items" :key="'bill-'+index">
                  <td><input type="text" v-model="item.period"   class="cell-input text-center" placeholder="26.01.01~01.31" /></td>
                  <td><input type="text" v-model="item.category" class="cell-input text-center" placeholder="미화, 경비" /></td>
                  <td><input type="text" v-model="item.detail"   class="cell-input" placeholder="1월 미화용역비" /></td>
                  <td>
                    <input type="text"
                           :value="formatCurrency(item.amount)"
                           @focus="$event.target.select()"
                           @input="handleCurrencyInput($event, item, 'amount', null, 'billing')"
                           class="cell-input text-right font-bold text-blue" />
                  </td>
                  <td><input type="text" v-model="item.note"     class="cell-input" placeholder="비고 입력" /></td>
                  <td class="text-center"><button class="btn-delete-row" @click="removeBillingRow(index)"><i class="mdi mdi-minus"></i></button></td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="bg-blue-light font-bold" style="font-size:15px;">
                  <td colspan="3" class="text-center">합계</td>
                  <td class="text-right text-blue">
                    <input type="text" class="cell-input font-bold text-right text-blue" :value="formatCurrency(formData.subTotal)" />
                  </td>
                  <td colspan="2">
                    <input type="text" class="cell-input" value="원 단위 절사" />
                  </td>
                </tr>
                </tfoot>
              </table>
            </div>

            <div v-if="formData.is_vat === 'Y'" class="vat-breakdown-wrapper mt-5">
              <h4><i class="mdi mdi-domain"></i> 과세/면세 관리면적별 산출내역</h4>
              <div class="table-scroll-wrapper">
                <table class="excel-table statement-table mt-2">
                  <thead>
                  <tr>
                    <th style="min-width:110px;">구분</th>
                    <th style="min-width:100px;">관리면적(㎡)</th>
                    <th style="min-width:90px;">단가(원)</th>
                    <th style="min-width:110px;">공급가액(원)</th>
                    <th style="min-width:100px;">부가세(원)</th>
                    <th style="min-width:110px;">합계금액(원)</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr>
                    <td class="text-center font-bold bg-gray-50">
                      <input type="text" class="cell-input text-center" v-model="formData.billingData.vatBreakdown.under135.label" placeholder="구분 입력">
                    </td>
                    <td>
                      <input
                          type="text"
                          :value="formatDecimal(formData.billingData.vatBreakdown.under135.area)"
                          @focus="$event.target.select()"
                          @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.under135, 'area', null, 'area')"
                          class="cell-input text-right"
                      />
                    </td>
                    <td>
                      <input
                          type="text"
                          :value="formatDecimal(formData.billingData.vatBreakdown.under135.unitPrice)"
                          @focus="$event.target.select()"
                          @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.under135, 'unitPrice', null, 'area')"
                          class="cell-input text-right"
                      />
                    </td>
                    <td>
                      <input
                          type="text"
                          :value="formatDecimal(formData.billingData.vatBreakdown.under135.supply)"
                          @focus="$event.target.select()"
                          @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.under135, 'supply', null, 'manual')"
                          class="cell-input text-right font-bold text-blue"
                      />
                    </td>
                    <td class="text-right bg-gray-50 text-gray-400">0</td>
                    <td class="text-right font-bold text-blue bg-blue-light">{{ formatDecimal(formData.billingData.vatBreakdown.under135.supply) }}</td>
                  </tr>
                  <tr>
                    <td class="text-center font-bold bg-gray-50">
                      <input type="text" class="cell-input text-center" v-model="formData.billingData.vatBreakdown.over135.label" placeholder="구분 입력">
                    </td>
                    <td><input type="text" :value="formatDecimal(formData.billingData.vatBreakdown.over135.area)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'area', null, 'area')" class="cell-input text-right" /></td>
                    <td><input type="text" :value="formatDecimal(formData.billingData.vatBreakdown.over135.unitPrice)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'unitPrice', null, 'area')" class="cell-input text-right" /></td>
                    <td>
                      <input
                          type="text"
                          :value="formatDecimal(formData.billingData.vatBreakdown.over135.supply)"
                          @focus="$event.target.select()"
                          @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'supply', null, 'manual')"
                          class="cell-input text-right font-bold text-blue"
                      />
                    </td>
                    <td>
                      <input
                          type="text"
                          :value="formatDecimal(formData.billingData.vatBreakdown.over135.vat)"
                          @focus="$event.target.select()"
                          @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'vat', null, 'manual')"
                          class="cell-input text-right font-bold text-red"
                      />
                    </td>
                    <td class="text-right font-bold text-blue bg-blue-light">{{ formatCurrency(Number(formData.billingData.vatBreakdown.over135.supply) + Number(formData.billingData.vatBreakdown.over135.vat)) }}</td>
                  </tr>
                  </tbody>
                  <tfoot>
                  <tr class="bg-gray-50 font-bold" style="font-size:14px;">
                    <td class="text-center">총 계</td>
                    <td class="text-right">
                      {{
                        formatDecimal(
                            (Number(formData.billingData.vatBreakdown.under135.area) +
                                Number(formData.billingData.vatBreakdown.over135.area)).toFixed(4)
                        )
                      }}
                    </td>
                    <td class="text-center">-</td>
                    <td class="text-right text-blue">{{ formatCurrency(formData.subTotal) }}</td>
                    <td class="text-right text-red">{{ formatCurrency(formData.vatAmount) }}</td>
                    <td class="text-right text-blue bg-blue-light">{{ formatCurrency(formData.grandTotal) }}</td>
                  </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div class="mt-5" style="display: flex; align-items: center; gap: 10px;">
              <label style="font-weight: 600; font-size: 15px; color: var(--text-main); white-space: nowrap;">3. 입금계좌 : </label>
              <input
                  type="text"
                  v-model="formData.billingData.bankInfo"
                  class="form-input"
                  style="border: 1px dashed var(--border-focus); background: transparent; padding: 12px 16px; font-size: 15px; font-weight: bold;"
              />
            </div>

            <div class="doc-message-wrap mt-4">
              <textarea
                  v-model="formData.billingData.footerMessage"
                  class="form-input"
                  rows="4"
                  style="resize: vertical; line-height: 1.6; font-size: 15px; border: 1px dashed var(--border-focus); background: transparent; padding: 16px;"
              ></textarea>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'details'" class="tab-content">
          <div class="table-actions">
            <h4><i class="mdi mdi-table-account"></i> 직원별 정산 내역</h4>

            <div class="action-btns" style="align-items: center;">
              <div class="melt-toggles-group">
                <span class="melt-title"><i class="mdi mdi-calculator-variant"></i> 공제 계산 시 포함:</span>
                <label class="melt-toggle">
                  <span class="melt-label">연차수당</span>
                  <div class="switch">
                    <input type="checkbox" v-model="meltOptions.annualLeave">
                    <span class="slider round"></span>
                  </div>
                </label>
                <label class="melt-toggle">
                  <span class="melt-label">퇴직충당금</span>
                  <div class="switch">
                    <input type="checkbox" v-model="meltOptions.severance">
                    <span class="slider round"></span>
                  </div>
                </label>
                <label class="melt-toggle">
                  <span class="melt-label">근로자의날 수당</span>
                  <div class="switch">
                    <input type="checkbox" v-model="meltOptions.workersDay">
                    <span class="slider round"></span>
                  </div>
                </label>
              </div>

              <button class="btn-load-data" @click="loadPayrollData">
                <i class="mdi mdi-download-box-outline"></i>
                <span class="btn-text">데이터 불러오기</span>
              </button>
              <button class="btn-add-row" @click="addPayrollRow"><i class="mdi mdi-plus-thick"></i> <span class="btn-text">직원 추가</span></button>
            </div>
          </div>

          <div class="excel-table-wrapper">
            <table class="excel-table">
              <thead>
              <tr>
                <th rowspan="2" style="width:40px; min-width:40px;">NO</th>
                <th rowspan="2" style="width:70px; min-width:70px;">이름</th>
                <th rowspan="2" style="width:70px; min-width:70px;">직책</th>
                <th rowspan="2" style="width:80px; min-width:80px;">생년월일</th>
                <th rowspan="2" style="width:80px; min-width:80px;">입사일</th>
                <th rowspan="2" style="width:80px; min-width:80px;">퇴사일</th>

                <template v-for="col in dynamicColumns" :key="'th1-'+col.code">
                  <th v-if="col.isEmployment" colspan="2" class="bg-red-light" style="min-width:200px;">
                    고용보험({{ insuranceRates.employmentInsurance }}%)
                  </th>
                  <th v-else rowspan="2" :class="col.type === 'pay' ? 'bg-yellow-light' : (col.type === 'gross' ? 'bg-blue-light' : 'bg-red-light')" style="min-width:100px;">
                    {{ col.name }}
                  </th>
                </template>

                <th rowspan="2" class="bg-red-light" style="min-width:120px;">총계</th>
                <th rowspan="2" style="width:50px;min-width:20px;">관리</th>
              </tr>

              <tr>
                <template v-for="col in dynamicColumns" :key="'th2-'+col.code">
                  <template v-if="col.isEmployment">
                    <th class="bg-red-light" style="min-width:100px; font-size:11px;">실업급여<br>{{ insuranceRates.employmentInsurance }}%</th>
                    <th class="bg-red-light" style="min-width:100px; font-size:11px;">고용안정 등<br>0.45%</th>
                  </template>
                </template>
              </tr>
              </thead>

              <tbody>
              <template v-for="group in groupedPayrollData" :key="'group-'+group.groupNo">
                <tr
                    v-for="(row, rowIndex) in group.rows"
                    :key="'pay-'+(row.idx || rowIndex)+'-'+rowIndex"
                    :draggable="draggableRowIdx === 'details-' + getRowFlatIndex(row)"
                    @dragstart="onDragStart(getRowFlatIndex(row))"
                    @dragover.prevent
                    @drop="onDrop(getRowFlatIndex(row))"
                    @dragend="onDragEnd"
                    :class="{
                      dragging: dragIndex === getRowFlatIndex(row),
                      'group-last-row': rowIndex === group.rows.length - 1,
                      'mid-month-joiner': row.isMidMonthJoiner
                    }"
                >
                  <td v-if="rowIndex === 0"
                      :rowspan="group.rows.length"
                      class="text-center drag-handle"
                      style="vertical-align: middle;"
                      @mousedown="draggableRowIdx = 'details-' + getRowFlatIndex(row)"
                      @mouseup="draggableRowIdx = null"
                      @mouseleave="draggableRowIdx = null"> <i class="mdi mdi-drag-vertical drag-icon"></i>
                    <span>{{ group.groupNo }}</span>
                  </td>

                  <td>
                    <input
                        type="text"
                        v-model="row.empName"
                        class="cell-input text-center"
                        :class="{ 'input-warning': hasInvalidChars(row.empName) }"
                        :title="hasInvalidChars(row.empName) ? '영문, 숫자, 특수문자가 포함되어 있습니다.' : ''"
                    />
                  </td>
                  <td>
                    <input
                        type="text"
                        v-model="row.position"
                        @input="applyContractReserves(row)"
                        class="cell-input text-center"
                    />
                  </td>
                  <td>
                    <input
                        type="text"
                        v-model="row.personalNo"
                        class="cell-input text-center"
                    />
                  </td>
                  <td class="text-center">
                    <template v-if="row.transferDate && row.transferDate !== row.inDate">
                      <span style="font-size: 11px; color: var(--text-muted);">{{ row.transferDate }}</span><br>
                    </template>
                    <input type="text" v-model="row.inDate" class="cell-input text-center" />
                  </td>
                  <td><input type="text" v-model="row.outDate" class="cell-input text-center" /></td>

                  <template v-for="col in dynamicColumns" :key="'td-'+col.code">
                    <td v-if="col.type === 'pay'">
                      <input v-if="col.name.includes('연차')" type="text" :value="formatCurrency(row.reserves.annualLeave)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.reserves, 'annualLeave', row, 'salary')" @blur="handleFormulaBlur($event, row.reserves, 'annualLeave', row, 'salary')" @keyup.enter="$event.target.blur()" class="cell-input text-right" />
                      <input v-else-if="col.name.includes('퇴직')" type="text" :value="formatCurrency(row.reserves.severance)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.reserves, 'severance', row, 'salary')" @blur="handleFormulaBlur($event, row.reserves, 'severance', row, 'salary')" @keyup.enter="$event.target.blur()" class="cell-input text-right" />
                      <input v-else-if="col.name.includes('근로자의날')" type="text" :value="formatCurrency(row.reserves.workersDay)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.reserves, 'workersDay', row, 'salary')" @blur="handleFormulaBlur($event, row.reserves, 'workersDay', row, 'salary')" @keyup.enter="$event.target.blur()" class="cell-input text-right" />
                      <input v-else type="text" :value="formatCurrency(row.payments?.[col.code])" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.payments, col.code, row, 'salary')" @blur="handleFormulaBlur($event, row.payments, col.code, row, 'salary')" @keyup.enter="$event.target.blur()" class="cell-input text-right" />
                    </td>

                    <td v-else-if="col.type === 'gross'">
                      <input type="text" :value="formatCurrency(row.grossPay)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row, 'grossPay', row, 'salary')" @blur="handleFormulaBlur($event, row, 'grossPay', row, 'salary')" @keyup.enter="$event.target.blur()" class="cell-input text-right font-bold text-blue" />
                    </td>

                    <template v-else-if="col.type === 'deduct'">
                      <template v-if="col.isEmployment">
                        <td><input type="text" :value="formatCurrency(row.deductionItems[col.code])" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.deductionItems, col.code, row, 'row')" @blur="handleFormulaBlur($event, row.deductionItems, col.code, row, 'row')" @keyup.enter="$event.target.blur()" class="cell-input text-right" /></td>
                        <td><input type="text" :value="formatCurrency(row.reserves.empInsEmployer)" @focus="$event.target.select()" @input="row.isCustomEmp = true; handleCurrencyInput($event, row.reserves, 'empInsEmployer', row, 'row')" @blur="handleFormulaBlur($event, row.reserves, 'empInsEmployer', row, 'row')" @keyup.enter="$event.target.blur()" class="cell-input text-right" /></td>
                      </template>
                      <td v-else-if="col.name.includes('산재')">
                        <input type="text" :value="formatCurrency(row.reserves.sanjae)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.reserves, 'sanjae', row, 'row')" @blur="handleFormulaBlur($event, row.reserves, 'sanjae', row, 'row')" @keyup.enter="$event.target.blur()" class="cell-input text-right" />
                      </td>
                      <td v-else>
                        <input type="text" :value="formatCurrency(row.deductionItems[col.code])" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.deductionItems, col.code, row, 'row')" @blur="handleFormulaBlur($event, row.deductionItems, col.code, row, 'row')" @keyup.enter="$event.target.blur()" class="cell-input text-right" />
                      </td>
                    </template>
                  </template>

                  <td class="text-right font-bold bg-gray-50">{{ formatCurrency(getInsuranceTotal(row)) }}</td>
                  <td class="text-center" style="white-space: nowrap;">
                    <button
                        v-if="rowIndex === 0 && getRowFlatIndex(row) > 0"
                        class="btn-merge"
                        @click="mergeWithAbove(row)"
                        title="바로 위 작업자와 묶기">
                      <i class="mdi mdi-link-variant"></i>
                    </button>

                    <button
                        v-else-if="rowIndex > 0"
                        class="btn-separate"
                        @click="separateRow(row)"
                        title="묶기 해제 (독립 번호 부여)">
                      <i class="mdi mdi-link-variant-off"></i>
                    </button>

                    <span v-else style="display:inline-block; width:28px;"></span>

                    <button class="btn-delete-row" @click="removePayrollRow(getRowFlatIndex(row))">
                      <i class="mdi mdi-trash-can-outline"></i>
                    </button>
                  </td>
                </tr>
              </template>

              <tr v-if="formData.payrollData.length === 0">
                <td :colspan="7 + dynamicColumns.length" class="empty-row">등록된 데이터가 없습니다.</td>
              </tr>
              </tbody>

              <tfoot v-if="formData.payrollData.length > 0">
              <tr class="bg-gray-50 font-bold" style="font-size:14px;">
                <td colspan="6" class="text-center">총 계</td>

                <template v-for="col in dynamicColumns" :key="'foot-'+col.code">
                  <template v-if="col.isEmployment">
                    <td class="text-right">{{ formatCurrency(getDynamicTotal(col)) }}</td>
                    <td class="text-right">{{ formatCurrency(payrollTotals.empInsEmployer) }}</td>
                  </template>
                  <td v-else
                      :class="['text-right', col.type === 'pay' ? 'bg-yellow-light text-yellow-700' : (col.type === 'gross' ? 'bg-blue-light text-blue' : '')]"
                      style="color: inherit;">
                    {{ formatCurrency(getDynamicTotal(col)) }}
                  </td>
                </template>

                <td class="text-right text-red bg-red-light">{{ formatCurrency(payrollTotals.insuranceTotal) }}</td>
                <td></td>
              </tr>
              </tfoot>
            </table>
          </div>
          <div v-if="formData.payrollData.length > 0" class="bottom-flex-layout">
            <div class="memo-area">
              <div class="memo-wrapper">
                <div class="memo-header">
                  <i class="mdi mdi-note-edit-outline"></i>
                  <span>정산 특이사항 및 메모</span>
                </div>
                <ClientOnly>
                  <SunTextEditor v-model="formData.billingData.memo" />
                </ClientOnly>
              </div>
            </div>

            <div class="summary-area">
              <table class="excel-table" style="background: var(--bg-surface)">
                <tbody>
                <template v-for="(summary, sIdx) in totalSummary" :key="'summary-'+summary.key">
                  <tr v-if="summary.key === 'grandTotal'">
                    <td colspan="2" class="text-right" style="border: none; background: transparent; padding: 6px 0;">
                      <button @click="addCustomSummaryItem" class="btn-add-row" style="font-size: 12px; padding: 4px 10px; display: inline-flex; float: right;">
                        <i class="mdi mdi-plus-thick"></i> 정산 항목 추가
                      </button>
                    </td>
                  </tr>

                  <tr>
                    <td class="text-center bg-gray-50 font-bold"
                        :class="{'summary-label-cell': summary.toggleable && !summary.isCustom}"
                        @click="summary.toggleable && !summary.isCustom && toggleSummarySign(summary.key)"
                        style="font-size: 13px;white-space: pre-line;"
                        :title="summary.toggleable && !summary.isCustom ? '클릭하여 양수/음수 전환' : ''">
                      <div style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%;">
                        <template v-if="summary.isCustom">
                          <button @click.stop="toggleCustomSign(summary.index)" class="sign-badge" :class="summary.sign < 0 ? 'bg-red-badge' : 'bg-blue-badge'" style="border: none; cursor: pointer; flex-shrink: 0;">
                            {{ summary.sign < 0 ? '-' : '+' }}
                          </button>
                          <input type="text" v-model="formData.billingData.customSummaryItems[summary.index].label" placeholder="항목명 입력" class="cell-input text-center font-bold" style="width: 100%; padding: 6px; box-sizing: border-box;" />
                        </template>
                        <template v-else>
                            <span v-if="summary.toggleable" class="sign-badge" :class="summary.sign < 0 ? 'bg-red-badge' : 'bg-blue-badge'">
                              {{ summary.sign < 0 ? '-' : '+' }}
                            </span>
                          {{ summary.label }}
                        </template>
                      </div>
                    </td>

                    <td class="text-right font-bold" :class="summary.key === 'grandTotal' ? 'text-blue bg-blue-light' : 'bg-white'" style="padding: 0; border: 1px solid var(--border-color); position: relative;">
                      <button v-if="summary.isCustom" @click="removeCustomSummaryItem(summary.index)" class="btn-delete-row" style="position: absolute; left: -26px; top: 50%; transform: translateY(-50%); z-index: 10;">
                        <i class="mdi mdi-minus"></i>
                      </button>
                      <button v-else-if="summary.deletable" @click="removeSummaryItem(summary.key)" class="btn-delete-row" style="position: absolute; left: -26px; top: 50%; transform: translateY(-50%); z-index: 10;">
                        <i class="mdi mdi-minus"></i>
                      </button>

                      <template v-if="summary.key === 'insuranceDiff'">
                        <div style="display: flex; align-items: center; padding-left: 8px;">
                          <span :class="summary.sign < 0 ? 'text-red' : 'text-blue'">{{ summary.sign < 0 ? '-' : '+' }}</span>
                          <input
                              type="text"
                              :value="formatCurrency(formData.billingData.insuranceDiff)"
                              @focus="$event.target.select()"
                              @input="formData.billingData.isManualInsuranceDiff = true; handleCurrencyInput($event, formData.billingData, 'insuranceDiff', null, 'none')"
                              @blur="formData.billingData.isManualInsuranceDiff = true; handleFormulaBlur($event, formData.billingData, 'insuranceDiff', null, 'none')"
                              @keyup.enter="$event.target.blur()"
                              class="cell-input text-right font-bold" :class="summary.sign < 0 ? 'text-red' : 'text-blue'"
                              style="width: 100%; height: 100%; padding: 6px; box-sizing: border-box; border-radius: 0;"
                          />
                        </div>
                      </template>
                      <template v-else-if="summary.isCustom">
                        <div style="display: flex; align-items: center; padding-left: 8px;">
                          <span :class="summary.sign < 0 ? 'text-red' : 'text-blue'">{{ summary.sign < 0 ? '-' : '+' }}</span>
                          <input
                              type="text"
                              :value="formatCurrency(formData.billingData.customSummaryItems[summary.index].amount)"
                              @focus="$event.target.select()"
                              @input="handleCurrencyInput($event, formData.billingData.customSummaryItems[summary.index], 'amount', null, 'none')"
                              @blur="handleFormulaBlur($event, formData.billingData.customSummaryItems[summary.index], 'amount', null, 'none')"
                              @keyup.enter="$event.target.blur()"
                              class="cell-input text-right font-bold"
                              :class="summary.sign < 0 ? 'text-red' : 'text-blue'" style="width: 100%; height: 100%; padding: 6px; box-sizing: border-box; border-radius: 0;"
                          />
                        </div>
                      </template>
                      <template v-else>
                        <div style="padding: 6px;" :class="summary.sign < 0 ? 'text-red' : (summary.toggleable ? 'text-blue' : '')">
                          <span v-if="summary.value !== 0">{{ summary.sign < 0 ? '- ' : (summary.toggleable ? '+ ' : '') }}</span>{{ formatCurrency(summary.value) }}
                        </div>
                      </template>
                    </td>
                  </tr>
                </template>
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <div v-show="activeTab === 'payroll'" class="tab-content">
          <div class="table-actions">
            <h4><i class="mdi mdi-table-account"></i> 급여 대장</h4>
            <div class="action-btns" style="align-items: center;">
              <div class="melt-toggles-group">
                <span class="melt-title"><i class="mdi mdi-calculator-variant"></i> 4대보험 계산 기준:</span>
                <label class="melt-toggle">
                  <span class="melt-label">연차수당 포함</span>
                  <div class="switch"><input type="checkbox" v-model="meltOptions.annualLeave"><span class="slider round"></span></div>
                </label>
                <label class="melt-toggle">
                  <span class="melt-label">퇴직충당금 포함</span>
                  <div class="switch"><input type="checkbox" v-model="meltOptions.severance"><span class="slider round"></span></div>
                </label>
                <label class="melt-toggle">
                  <span class="melt-label">근로자의날 포함</span>
                  <div class="switch"><input type="checkbox" v-model="meltOptions.workersDay"><span class="slider round"></span></div>
                </label>
              </div>
            </div>
          </div>

          <div v-if="formData.payrollData.length === 0" class="empty-row" style="text-align:center; padding: 40px;">
            데이터 불러오기를 먼저 실행해주세요.
          </div>

          <div v-else class="excel-table-wrapper">
            <table class="excel-table">
              <thead>
              <tr>
                <th rowspan="2" style="width:36px;">NO</th>
                <th rowspan="2" style="width:70px;">이름</th>
                <th rowspan="2" style="width:60px;">직책</th>
                <th rowspan="2" style="width:76px;">생년월일</th>
                <th rowspan="2" style="width:76px;">입사일</th>
                <th rowspan="2" style="width:76px;">퇴사일</th>
                <th rowspan="2" style="width:36px;">근무일수</th>

                <th v-for="col in payrollLedgerColumns.payCols" :key="'lph-'+col.code"
                    rowspan="2" class="bg-yellow-light" style="min-width:120px;">
                  {{ col.name }}
                </th>
                <th rowspan="2" class="bg-blue-light" style="min-width:120px;">지급합계</th>

                <th v-for="col in payrollLedgerColumns.deductCols" :key="'ldh-'+col.code"
                    rowspan="2" class="bg-red-light" style="min-width:120px;">
                  {{ col.name }}
                </th>
                <th rowspan="2" class="bg-red-light" style="min-width:120px;">공제합계</th>
                <th rowspan="2" style="min-width:120px; background: rgba(16,185,129,.1); color: #065f46;">실수령액</th>
              </tr>
              <tr></tr>
              </thead>

              <tbody>
              <tr
                  v-for="(row, index) in formData.payrollData" :key="'ledger-'+index"
                  :draggable="draggableRowIdx === 'payroll-' + index"
                  @dragstart="onDragStart(index)"
                  @dragover.prevent
                  @drop="onDrop(index)"
                  @dragend="onDragEnd"
                  :class="{
                    dragging: dragIndex === index,
                    'mid-month-joiner': row.isMidMonthJoiner
                  }"
              >
                <td class="text-center drag-handle"
                    style="cursor: grab;"
                    @mousedown="draggableRowIdx = 'payroll-' + index"
                    @mouseup="draggableRowIdx = null"
                    @mouseleave="draggableRowIdx = null">
                  {{ index + 1 }}
                </td>
                <td class="text-center">
                  <input
                      type="text"
                      v-model="row.empName"
                      class="cell-input text-center"
                      :class="{ 'input-warning': hasInvalidChars(row.empName) }"
                      :title="hasInvalidChars(row.empName) ? '영문, 숫자, 특수문자가 포함되어 있습니다.' : ''"
                  />
                </td>
                <td class="text-center">
                  <input
                      type="text"
                      v-model="row.position"
                      @input="applyContractReserves(row)"
                      class="cell-input text-center"
                  />
                </td>
                <td class="text-center">
                  <input
                      type="text"
                      v-model="row.personalNo"
                      class="cell-input text-center"
                  />
                </td>
                <td class="text-center">
                  <template v-if="row.transferDate && row.transferDate !== row.inDate">
                    <span style="font-size: 11px; color: var(--text-muted);">{{ row.transferDate }}</span><br>
                  </template>
                  <input type="text" v-model="row.inDate" class="cell-input text-center" />
                </td>
                <td class="text-center">
                  <input type="text" v-model="row.outDate" class="cell-input text-center" />
                </td>
                <td>
                  <input type="text" v-model="row.workersDay" class="cell-input text-center"/>
                </td>

                <td v-for="col in payrollLedgerColumns.payCols" :key="'lpd-'+col.code" class="text-right">
                  <input
                      type="text"
                      :value="formatCurrency(row.payItems?.[col.code] || 0)"
                      class="cell-input text-right"
                  />
                </td>
                <td class="text-right font-bold text-blue">
                  <input
                      type="text"
                      :value="formatCurrency(getLedgerGrossPay(row))"
                      class="cell-input text-right"
                  />
                </td>

                <td v-for="col in payrollLedgerColumns.deductCols" :key="'ldd-'+col.code" class="text-right">
                  <input
                      type="text"
                      :value="formatCurrency(row.deductionItems?.[col.code] || 0)"
                      class="cell-input text-right"
                  />
                </td>
                <td class="text-right font-bold text-red">
                  <input
                      type="text"
                      :value="formatCurrency(getLedgerTotalDeduct(row))"
                      class="cell-input text-right"
                  />
                </td>
                <td class="text-right font-bold" style="color: #065f46;">
                  {{ formatCurrency(getLedgerNetPay(row)) }}
                </td>
              </tr>
              </tbody>

              <tfoot>
              <tr class="bg-gray-50 font-bold" style="font-size: 13px;">
                <td colspan="7" class="text-center">합 계</td>

                <td v-for="col in payrollLedgerColumns.payCols" :key="'lpt-'+col.code" class="text-right bg-yellow-light">
                  {{ formatCurrency(payrollLedgerTotals.payTotals[col.code] || 0) }}
                </td>
                <td class="text-right text-blue bg-blue-light">
                  {{ formatCurrency(payrollLedgerTotals.grossTotal) }}
                </td>

                <td v-for="col in payrollLedgerColumns.deductCols" :key="'ldt-'+col.code" class="text-right bg-red-light">
                  {{ formatCurrency(payrollLedgerTotals.deductTotals[col.code] || 0) }}
                </td>
                <td class="text-right text-red bg-red-light">
                  {{ formatCurrency(payrollLedgerTotals.deductTotal) }}
                </td>
                <td class="text-right font-bold" style="color: #065f46;">
                  {{ formatCurrency(payrollLedgerTotals.netTotal) }}
                </td>
              </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; box-sizing: border-box; }
.modal-container { background: var(--bg-surface); width: 100%; max-width: 1580px; height: 100%; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,.1); overflow: hidden; border: 1px solid var(--border-color); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas); gap: 12px; flex-wrap: wrap; }
.header-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.header-title h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-main); white-space: nowrap; }
.badge { padding: 3px 8px; background: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.btn-pdf {
  height: 42px;
  background: rgba(220, 38, 38, .1);
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, .3);
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: .2s;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  white-space: nowrap;
}
.btn-pdf:hover:not(:disabled) {
  background: #dc2626;
  color: #fff;
}
.btn-pdf:disabled {
  opacity: .6;
  cursor: not-allowed;
}
.btn-save { background: var(--primary); color: var(--text-inverse); border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; font-size: 14px; white-space: nowrap; }
.btn-save:hover { background: var(--primary-hover); transform: translateY(-1px); }
.btn-close { background: none; border: none; font-size: 22px; color: var(--text-muted); cursor: pointer; transition: .2s; padding: 4px; line-height: 1; border-radius: 6px; }
.btn-close:hover { background: var(--bg-hover); color: var(--danger); }
.modal-tabs { display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); flex-shrink: 0; }
.tab-btn { padding: 14px 18px; background: none; border: none; border-bottom: 3px solid transparent; font-size: 14px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; margin-bottom: -1px; white-space: nowrap; }
.tab-btn:hover  { color: var(--text-main); }
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
.modal-body { flex: 1; overflow-y: auto; padding: 15px; background: var(--bg-canvas); -webkit-overflow-scrolling: touch; }
.modal-body::-webkit-scrollbar { width: 8px; }
.modal-body::-webkit-scrollbar-track { background: var(--bg-canvas); }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.document-paper { max-width: 860px; margin: 0 auto; background: var(--bg-surface); padding: 32px 28px; border-radius: 8px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); }
.doc-header h1 { font-size: 26px; letter-spacing: 8px; margin-bottom: 32px; border-bottom: 2px solid var(--text-main); padding-bottom: 18px; color: var(--text-main); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-sub); margin-bottom: 6px; }
.form-input, .form-select { width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 14px; color: var(--text-main); background: var(--bg-canvas); box-sizing: border-box; outline: none; transition: border-color .2s; }
.form-input:focus, .form-select:focus { border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary-soft); background: var(--bg-surface); }
.bg-gray { background-color: var(--bg-hover) !important; color: var(--text-muted); cursor: not-allowed; border-color: transparent; }
.doc-message { margin: 20px 0; line-height: 1.8; color: var(--text-main); font-size: 14px; }
.vat-badge { font-size: 12px; margin-left: 6px; font-weight: normal; }
.vat-free  { color: var(--danger); }
.vat-taxed { color: var(--primary); }
.deduction-toggles { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; padding: 12px 16px; background: var(--bg-surface); border-radius: 8px; border: 1px dashed var(--border-focus); flex-wrap: wrap; }
.toggle-label { font-size: 13px; font-weight: 600; color: var(--primary); display: flex; align-items: center; gap: 4px; }
.toggle-checkbox { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; color: var(--text-main); font-weight: 500; }
.toggle-checkbox input[type="checkbox"] { accent-color: var(--primary); width: 16px; height: 16px; cursor: pointer; }
.table-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.table-actions h4 { margin: 0; font-size: 15px; color: var(--text-main); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.table-actions h4 i { color: var(--primary); font-size: 18px; }
.action-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-add-row { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--success); color: var(--text-inverse); border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; white-space: nowrap; transition: .2s; }
.btn-add-row:hover { background: var(--success-hover); transform: translateY(-1px); }
.btn-load-data { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--bg-surface); color: var(--primary); border: 1px solid var(--primary); border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; transition: all .2s; white-space: nowrap; }
.btn-load-data:hover { background: var(--primary-soft); transform: translateY(-1px); }
.table-scroll-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 4px; }
.excel-table-wrapper {
  background: var(--bg-surface);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow-x: auto;
  box-shadow: var(--shadow-sm);
  -webkit-overflow-scrolling: touch;
}
.excel-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  table-layout: fixed;
}
.excel-table th, .excel-table td {
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  padding: 4px;
  vertical-align: middle;
  background-clip: padding-box;
}
.excel-table tr td:first-child,
.excel-table tr th:first-child {
  border-left: 1px solid var(--border-color);
}
.excel-table thead th {
  background: var(--bg-hover);
  font-weight: 600;
  text-align: center;
  color: var(--text-main);
  padding: 6px;
  white-space: nowrap;
  line-height: 1.3;
  position: sticky;
  top: 0;
  z-index: 10;
  border-top: 1px solid var(--border-color);
}
.statement-table tfoot td { padding: 10px; }
.bank-info { display: flex; align-items: center; gap: 10px; background: var(--bg-canvas); padding: 14px; border-radius: 8px; border: 1px solid var(--border-color); flex-wrap: wrap; }
.bank-info label { font-weight: 600; color: var(--text-main); white-space: nowrap; }
.bank-input { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid var(--border-focus); border-radius: 6px; font-size: 14px; font-weight: bold; color: var(--text-main); background: var(--bg-surface); outline: none; transition: .2s; }
.bank-input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
.bg-blue-light   { background-color: rgba(59, 130, 246, .1)  !important; color: #2563eb !important; }
.bg-red-light    { background-color: rgba(239, 68, 68, .1)   !important; color: #dc2626 !important; }
.bg-yellow-light { background-color: rgba(245, 158, 11, .1)  !important; color: #b45309 !important; }
.bg-gray-50      { background-color: var(--bg-canvas); }
.cell-input { width: 100%; border: 1px solid transparent; background: transparent; padding: 4px; outline: none; transition: .2s; border-radius: 4px; box-sizing: border-box; font-size: 13px; color: var(--text-main); }
.cell-input:focus, .cell-input:hover { border-color: var(--primary); background: var(--bg-surface); }
.drag-handle { cursor: grab; user-select: none; }
.drag-icon   { color: var(--text-muted); font-size: 16px; vertical-align: middle; margin-right: 2px; }
.dragging    { opacity: .4; background: var(--primary-soft) !important; }
.empty-row { text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 13px; }
.btn-delete-row { background: rgba(239, 68, 68, .1); color: var(--danger); border: none; padding: 4px; border-radius: 4px; cursor: pointer; transition: .2s; display: inline-flex; align-items: center; justify-content: center; }
.btn-delete-row:hover { background: var(--danger); color: var(--text-inverse); }
.text-gray-400{ color: var(--text-muted); }
.text-red { color: #dc2626; }
.text-blue { color: #2563eb; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mt-5 { margin-top: 30px; }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
@media (max-width: 1024px) { .modal-overlay { padding: 10px; } .modal-container { height: 95vh; } .document-paper { padding: 24px 20px; } }

@media (max-width: 768px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-container { height: 96vh; border-radius: 16px 16px 0 0; max-width: 100%; }
  .modal-header { padding: 12px 16px; }
  .header-title h2 { font-size: 15px; }
  .badge { display: none; }
  .modal-tabs { padding: 0 8px; }
  .tab-btn { padding: 12px 12px; font-size: 13px; }
  .tab-text { display: none; }
  .switcher-label { display: none; }
  .modal-body { padding: 12px; }
  .document-paper { padding: 16px 14px; }
  .doc-header h1 { font-size: 18px; letter-spacing: 4px; margin-bottom: 20px; }
  .form-grid { grid-template-columns: 1fr; gap: 12px; }
  .btn-text { display: none; }
  .action-btns { gap: 6px; }
  .btn-add-row, .btn-load-data { padding: 7px 10px; }
  .excel-table { font-size: 12px; }
  .excel-table thead th { padding: 6px; font-size: 11px; }
  .excel-table td { padding: 6px; }
  .cell-input { font-size: 12px; padding: 3px; }
  .deduction-toggles { gap: 8px; padding: 10px; }
}
@media (max-width: 480px) { .header-title h2 { font-size: 14px; } .modal-body { padding: 8px; } .document-paper { padding: 12px 10px; } .doc-header h1 { font-size: 16px; letter-spacing: 3px; } .tab-btn { padding: 10px 10px; } }

.melt-toggles-group {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(239, 68, 68, 0.05);
  border: 1px dashed rgba(239, 68, 68, 0.4);
  padding: 6px 14px;
  border-radius: 8px;
  margin-right: 10px;
}
.melt-title {
  font-size: 12px;
  font-weight: 700;
  color: #b91c1c;
  margin-right: 4px;
}
.melt-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.melt-label {
  font-size: 12px;
  font-weight: 600;
  color: #dc2626;
}
.switch { position: relative; display: inline-block; width: 32px; height: 18px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; }
.slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: white; transition: .3s; }
.slider.round { border-radius: 20px; }
.slider.round:before { border-radius: 50%; }
input:checked + .slider { background-color: #dc2626; }
input:checked + .slider:before { transform: translateX(14px); }

.summary-label-cell { cursor: pointer; transition: background-color 0.2s; user-select: none; }
.summary-label-cell:hover { background-color: #e2e8f0; }
.sign-badge { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 4px; font-size: 12px; font-weight: 900; color: white; }
.bg-red-badge { background-color: #ef4444; }
.bg-blue-badge { background-color: #3b82f6; }

.memo-container-cell {
  background: var(--bg-surface);
  padding: 16px 20px;
  vertical-align: top;
  border-bottom: none !important;
  border-left: none !important;
}
.memo-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 150px;
  gap: 10px;
  background: var(--bg-canvas);
  border: 1px solid var(--border-focus);
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s;
}
.memo-wrapper:focus-within {
  border-color: var(--primary);
  background: var(--bg-surface);
  box-shadow: inset 0 2px 4px rgba(37, 99, 235, 0.05), 0 0 0 3px var(--primary-soft);
}
.memo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}
.memo-header i {
  color: var(--primary);
  font-size: 18px;
  background: var(--primary-soft);
  padding: 4px;
  border-radius: 6px;
}
.memo-textarea {
  flex: 1;
  width: 100%;
  min-height: 120px;
  resize: none;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-main);
  outline: none;
}
.memo-textarea::placeholder {
  color: var(--text-muted);
  font-style: italic;
}
@media (max-width: 768px) {
  .memo-container-cell {
    padding: 12px;
  }
  .memo-wrapper {
    min-height: 160px;
    min-width: 300px;
  }
  .memo-textarea {
    font-size: 12px;
  }
}

.bottom-flex-layout {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  align-items: stretch;
}
.memo-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.summary-area {
  flex: 0 0 380px;
}
@media (max-width: 768px) {
  .bottom-flex-layout {
    flex-direction: column;
  }
  .summary-area {
    flex: auto;
    width: 100%;
  }
}

.btn-merge {
  background: rgba(59, 130, 246, .1);
  color: #2563eb;
  border: none;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: .2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 2px;
}
.btn-merge:hover { background: #2563eb; color: #fff; }
.btn-separate {
  background: rgba(245, 158, 11, .1);
  color: #d97706;
  border: none;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: .2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 2px;
}
.btn-separate:hover { background: #d97706; color: #fff; }

.input-warning {
  border: 1px solid #ef4444 !important;
  background-color: #fef2f2 !important;
  color: #b91c1c !important;
  font-weight: bold;
}
.input-warning:focus {
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important;
}

.btn-bigo {
  background: var(--bg-surface);
  color: var(--text-sub);
  border: 1px solid var(--border-color);
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: .2s;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  white-space: nowrap;
}
.btn-bigo:hover { background: var(--bg-hover); }
.btn-bigo.has-bigo {
  background: rgba(245, 158, 11, .1);
  color: #b45309;
  border-color: rgba(245, 158, 11, .4);
}
</style>
