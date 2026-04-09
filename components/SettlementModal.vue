<script setup>
import { ref, watch, onMounted, computed, reactive, nextTick } from 'vue';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useAuthStore } from '~/stores/auth.js';

const { siteOptions, typeOptions, fetchSiteOptions, fetchTypeOptions } = useApi();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx || 1;

const props = defineProps({
  isOpen: Boolean,
  settlementId: Number,
  initialData: Object,
});

const emit = defineEmits(['close', 'save']);

// ──────────────────────────────────────────────
// 1. 기본 상태 및 표시 설정 (단일 뷰 통합)
// ──────────────────────────────────────────────
const activeTab = ref('statement'); // 'statement' | 'details'

const currentConfig = reactive({
  showGrossPay: true,
  showAnnualLeave: true,
  showSeverance: true,
  showSanjae: true,
  activeDeductionCodes: [],
  // ★ 하단 요약 항목들의 양수(+1) / 음수(-1) 토글 상태 저장
  summarySigns: {
    severance: -1,
    annualLeave: -1,
    estimatedIns: -1,
    actualIns: -1,
    insuranceDiff: -1
  }
});

const meltOptions = reactive({
  annualLeave: false,
  severance: false
});

const isInitializing = ref(false);

const dragIndex = ref(null);

// ──────────────────────────────────────────────
// 2. 폼 데이터 상태
// ──────────────────────────────────────────────
const formData = ref({
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
    bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)',
    items: [],
    vatBreakdown: {
      under135: { area: '', unitPrice: '', supply: 0 },
      over135: { area: '', unitPrice: '', supply: 0, vat: 0 }
    },
    insuranceDiff: 0
  },
  payrollData: [],
});

// ──────────────────────────────────────────────
// 3. 계약 데이터 및 적용 요율
// ──────────────────────────────────────────────
const items = ref([]);

const contractIndirectLabor = ref([]);
const contractIndirectLabels = ref([]);

const contractDirectLabor = ref([]);
const contractStaffList = ref([]);
const contractTotalCost = ref(0);

const insuranceRates = ref({
  nationalPension: 0, healthInsurance: 0, longTermCare: 0, employmentInsurance: 0, industrialAccident: 0
});

const fetchTaxRates = async () => {
  const targetDate = formData.value.target_month || formData.value.billingDt;
  const year = targetDate ? targetDate.substring(0, 4) : new Date().getFullYear();

  try {
    const res = await axios.get(`/api/v1/config/tax/rate/${year}`);
    let result = res.data.data[0];
    if (result) {
      insuranceRates.value.nationalPension = result.pension_rate;
      insuranceRates.value.healthInsurance = result.health_rate;
      insuranceRates.value.longTermCare = result.long_term_care_rate;
      insuranceRates.value.employmentInsurance = result.employment_rate;
      insuranceRates.value.industrialAccident = result.industrial_rate;
    }
  } catch (err) { console.error('적용요율 로드 실패:', err); }
};

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    items.value = res.data.data || [];
  } catch (err) { console.error('급여 항목 로드 실패', err); }
};

const fetchContractData = async () => {
  const sIdx = formData.value.sIdx;
  const type = formData.value.type;

  if (!sIdx || !type) {
    contractIndirectLabor.value = []; contractIndirectLabels.value = []; contractDirectLabor.value = []; contractStaffList.value = []; contractTotalCost.value = 0;
    return;
  }

  try {
    const res = await axios.get(`/api/v1/site/data/${sIdx}`);
    const siteData = res.data.data?.[0];

    if (!siteData || !siteData.contractList) return;

    const parsedContractList = typeof siteData.contractList === 'string' ? JSON.parse(siteData.contractList) : siteData.contractList;
    const targetContract = parsedContractList.find(c => c.type === type);

    if (targetContract) {
      const iLabor = (targetContract.budget && Array.isArray(targetContract.budget.indirectLabor)) ? targetContract.budget.indirectLabor : [];
      contractIndirectLabor.value = iLabor;
      contractIndirectLabels.value = iLabor.map(item => item.label);

      contractDirectLabor.value = (targetContract.budget && Array.isArray(targetContract.budget.directLabor)) ? targetContract.budget.directLabor : [];
      contractStaffList.value = Array.isArray(targetContract.staffList) ? targetContract.staffList : [];
      contractTotalCost.value = Number(targetContract.totalCost) || 0;
    }
  } catch (error) { console.error('계약 정보를 불러오는 중 오류 발생:', error); }
};

const deductionItems = computed(() => {
  if (!Array.isArray(items.value)) return [];
  let result = items.value.filter(item => item.groupCd === '04002');

  if (contractIndirectLabels.value.length > 0) {
    result = result.filter(item => contractIndirectLabels.value.some(label => item.itemCd === label || item.itemNm.includes(label)));
  } else {
    const defaultKeywords = ['국민연금', '건강보험', '장기요양', '고용보험'];
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
// 4. 숫자 콤마 전용 입력 핸들러 (커서 튐 방지)
// ──────────────────────────────────────────────
const handleCurrencyInput = async (e, obj, key, row, calcType) => {
  const input = e.target;
  const cursorPosition = input.selectionStart;
  const oldLength = input.value.length;

  let rawValue = input.value.replace(/,/g, '').replace(/[^0-9\.\-]/g, '');
  const numValue = rawValue === '' || rawValue === '-' ? 0 : Number(rawValue);

  obj[key] = numValue;

  if (calcType === 'salary') onSalaryInput(row);
  else if (calcType === 'row') calculateRow(row);
  else if (calcType === 'billing') calculateBillingTotal();
  else if (calcType === 'area') calculateAreaSupply();
  else if (calcType === 'manual') handleManualBreakdownUpdate();

  await nextTick();
  const newLength = input.value.length;
  const diff = newLength - oldLength;
  let newCursorPos = cursorPosition + diff;
  if (newCursorPos < 0) newCursorPos = 0;
  input.setSelectionRange(newCursorPos, newCursorPos);
};

const formatCurrency = (val) => {
  if (val === undefined || val === null || val === '') return '0';
  return Number(val).toLocaleString();
};

// ──────────────────────────────────────────────
// 5. 급여 계산 핵심 로직
// ──────────────────────────────────────────────
const applyContractReserves = (row) => {
  const finalize = () => { calculateRow(row); };
  if (!row.position || !contractStaffList.value.length) return finalize();

  const staffObj = contractStaffList.value.find(s => s.name === row.position.trim());
  if (!staffObj) return finalize();
  const staffCode = staffObj.code;

  const findContractValue = (keyword, cd) => {
    let target = contractDirectLabor.value.find(d => d.label === cd || String(d.label).includes(keyword));
    if (!target) {
      target = contractIndirectLabor.value.find(d => d.label === cd || String(d.label).includes(keyword));
    }
    return target?.values?.[staffCode] ? Number(target.values[staffCode]) : 0;
  };

  const annualAmt = findContractValue('연차', '04003001');
  if (annualAmt > 0) row.reserves.annualLeave = annualAmt;

  const severanceAmt = findContractValue('퇴직', '04003003');
  if (severanceAmt > 0) row.reserves.severance = severanceAmt;

  const sanjaeAmt = findContractValue('산재', '04003010');
  if (sanjaeAmt > 0) row.reserves.sanjae = sanjaeAmt;

  row.originalSanjae = sanjaeAmt;

  finalize();
};

const calculateRow = (row) => {
  let totalDeduct = 0;
  visibleDeductionItems.value.forEach(item => { totalDeduct += Number(row.deductionItems?.[item.itemCd]) || 0; });
  row.totalDeduct = totalDeduct;
  row.netPay = (Number(row.grossPay) || 0) - totalDeduct;

  let totalGross = Number(row.grossPay) || 0;
  if (meltOptions.annualLeave) totalGross += Number(row.reserves?.annualLeave) || 0;
  if (meltOptions.severance)   totalGross += Number(row.reserves?.severance)   || 0;

  row.reserves.empInsEmployer = totalGross > 0 ? Math.floor((totalGross * 0.0045) / 10) * 10 : 0;
};

const recalculateInsurances = (row) => {
  if (!meltOptions.annualLeave && !meltOptions.severance) {
    if (row.originalDeductions) row.deductionItems = JSON.parse(JSON.stringify(row.originalDeductions));
    if (row.originalSanjae !== undefined) row.reserves.sanjae = row.originalSanjae;
    return;
  }

  let baseAmount = Number(row.grossPay) || 0;
  if (meltOptions.annualLeave) baseAmount += Number(row.reserves.annualLeave) || 0;
  if (meltOptions.severance)   baseAmount += Number(row.reserves.severance)   || 0;

  const rates = insuranceRates.value;

  visibleDeductionItems.value.forEach(item => {
    const code = item.itemCd; const name = item.itemNm;
    if ((Number(row.originalDeductions?.[code]) || 0) === 0) { row.deductionItems[code] = 0; return; }

    let amt = 0;
    if (name.includes('국민연금')) amt = Math.floor((baseAmount * (rates.nationalPension / 100)) / 10) * 10;
    else if (name.includes('건강보험')) amt = Math.floor((baseAmount * (rates.healthInsurance / 100)) / 10) * 10;
    else if (name.includes('장기요양')) amt = Math.floor((Math.floor((baseAmount * (rates.healthInsurance / 100)) / 10) * 10 * (rates.longTermCare / 100)) / 10) * 10;
    else if (name.includes('고용보험')) amt = Math.floor((baseAmount * (rates.employmentInsurance / 100)) / 10) * 10;
    else amt = Number(row.originalDeductions?.[code]) || 0;
    row.deductionItems[code] = amt;
  });

  if ((Number(row.originalSanjae) || 0) > 0) {
    row.reserves.sanjae = Math.floor((baseAmount * (rates.industrialAccident / 100)) / 10) * 10;
  }
};

const getInsuranceTotal = (row) => {
  let total = 0;
  visibleDeductionItems.value.forEach(item => { total += Number(row.deductionItems?.[item.itemCd]) || 0; });
  total += Number(row.reserves?.empInsEmployer) || 0;
  total += Number(row.reserves?.sanjae) || 0;
  return total;
};

const onSalaryInput = (row) => {
  if (meltOptions.annualLeave || meltOptions.severance) recalculateInsurances(row);
  calculateRow(row);
};

watch(meltOptions, () => {
  if (isInitializing.value) return; //초기화 중엔 무시
  formData.value.payrollData.forEach(row => {
    recalculateInsurances(row);
    calculateRow(row);
  });
}, { deep: true });
watch(() => currentConfig.activeDeductionCodes, () => { formData.value.payrollData.forEach(row => calculateRow(row)); }, { deep: true });

// ──────────────────────────────────────────────
// 6. 총계 & 부가세 계산 (토글 기능 포함)
// ──────────────────────────────────────────────
const payrollTotals = computed(() => {
  const totals = { grossPay: 0, totalDeduct: 0, netPay: 0, annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0, insuranceTotal: 0, deductionItems: {} };
  formData.value.payrollData.forEach(row => {
    totals.grossPay       += Number(row.grossPay)    || 0;
    totals.totalDeduct    += Number(row.totalDeduct) || 0;
    totals.netPay         += Number(row.netPay)      || 0;
    totals.annualLeave    += Number(row.reserves?.annualLeave) || 0;
    totals.severance      += Number(row.reserves?.severance)   || 0;
    totals.sanjae         += Number(row.reserves?.sanjae)      || 0;
    totals.empInsEmployer += Number(row.reserves?.empInsEmployer) || 0;

    let rowInsTotal = (Number(row.reserves?.empInsEmployer) || 0) + (Number(row.reserves?.sanjae) || 0);
    visibleDeductionItems.value.forEach(item => {
      const code = item.itemCd;
      if (!totals.deductionItems[code]) totals.deductionItems[code] = 0;
      const dAmount = Number(row.deductionItems?.[code]) || 0;
      totals.deductionItems[code] += dAmount;
      rowInsTotal += dAmount;
    });
    totals.insuranceTotal += rowInsTotal;
  });
  return totals;
});

const estimatedInsuranceTotal = computed(() => {
  let total = 0;
  contractIndirectLabor.value.forEach(item => {
    if (item.values) {
      Object.entries(item.values).forEach(([staffCode, val]) => {
        const staffObj = contractStaffList.value.find(s => s.code === staffCode);
        const headcount = staffObj && staffObj.count ? Number(staffObj.count) : 1;
        total += (Number(val) || 0) * headcount;
      });
    }
  });
  return total;
});

const actualInsuranceTotal = computed(() => {
  let total = 0;
  visibleDeductionItems.value.forEach(item => {
    if (['국민', '건강', '장기', '고용'].some(kw => item.itemNm.includes(kw))) {
      total += Number(payrollTotals.value.deductionItems[item.itemCd]) || 0;
    }
  });
  total += Number(payrollTotals.value.empInsEmployer) || 0;
  total += Number(payrollTotals.value.sanjae) || 0;
  return total;
});

watch([estimatedInsuranceTotal, actualInsuranceTotal], ([est, act]) => {
  formData.value.billingData.insuranceDiff = est - act;
}, { immediate: true });

const toggleSummarySign = (key) => {
  if (currentConfig.summarySigns[key] !== undefined) {
    currentConfig.summarySigns[key] *= -1; // -1 <-> 1 전환
  }
};

const totalSummary = computed(() => {
  const monthlyFee  = contractTotalCost.value || 0;
  const severance   = payrollTotals.value.severance || 0;
  const annualLeave = payrollTotals.value.annualLeave || 0;
  const estIns      = estimatedInsuranceTotal.value || 0;
  const actIns      = actualInsuranceTotal.value || 0;
  const insDiff     = Number(formData.value.billingData.insuranceDiff) || 0;
  const signs       = currentConfig.summarySigns;

  const grandTotal  = monthlyFee
      + (severance * signs.severance)
      + (annualLeave * signs.annualLeave)
      + (insDiff * signs.insuranceDiff);

  return [
    { key: 'monthlyFee', label: '월간용역비', value: monthlyFee, sign: 1, toggleable: false },
    { key: 'severance', label: '퇴직적립금', value: severance, sign: signs.severance, toggleable: true },
    { key: 'annualLeave', label: '연차적립금', value: annualLeave, sign: signs.annualLeave, toggleable: true },
    // ★ 견적서 및 실비정산은 토글 비활성화, 기호 무조건 1 (UI에서는 안보이게)
    { key: 'estimatedIns', label: '견적서 4대보험료', value: estIns, sign: 1, toggleable: false },
    { key: 'actualIns', label: '실비정산 4대보험료', value: actIns, sign: 1, toggleable: false },
    { key: 'insuranceDiff', label: '4대보험차액', value: insDiff, sign: signs.insuranceDiff, toggleable: true },
    { key: 'grandTotal', label: '총 청구액', value: grandTotal, sign: 1, toggleable: false }
  ];
});

// ──────────────────────────────────────────────
// ★ 6-1. 세부내역서 -> 청구 공문(표지) 자동 동기화 로직
// ──────────────────────────────────────────────
const syncBillingItems = () => {
  // 1. 산정기간 계산 (1일 ~ 말일)
  let periodStr = '';
  let monthNum = '';
  const targetDateStr = formData.value.target_month || formData.value.billingDt;

  if (targetDateStr) {
    const parts = targetDateStr.split('-');
    if (parts.length >= 2) {
      const yyyy = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10);
      const yearStr = String(yyyy).slice(2);
      const monthStr = String(mm).padStart(2, '0');
      monthNum = String(mm);
      const lastDay = new Date(yyyy, mm, 0).getDate(); // 월의 말일 계산 완벽 보장
      periodStr = `${yearStr}.${monthStr}.01~${monthStr}.${lastDay}`;
    }
  }

  // 2. 구분값 계산 (type에 따른 텍스트)
  let categoryStr = '';
  if (formData.value.type && typeOptions.value) {
    const matched = typeOptions.value.find(t => t.itemCd === formData.value.type);
    if (matched) categoryStr = matched.itemNm;
  }

  // 3. 반영할 타겟 항목들 (4대보험차액만 반영)
  const targetKeys = ['monthlyFee', 'severance', 'annualLeave', 'insuranceDiff'];
  let currentItems = [...formData.value.billingData.items];

  // (비어있는 초기 기본행 1개가 있다면 지우기)
  if (currentItems.length === 1 && !currentItems[0].detail && currentItems[0].amount === 0) {
    currentItems = [];
  }

  targetKeys.forEach(key => {
    const summaryObj = totalSummary.value.find(s => s.key === key);
    if (!summaryObj) return;

    // 토글 상태(양수/음수)가 반영된 실제 금액
    const signedAmount = summaryObj.value * summaryObj.sign;

    // 해당 항목이 청구 테이블에 이미 있는지 키워드로 유연하게 검색
    let existIdx = -1;
    if (key === 'monthlyFee') existIdx = currentItems.findIndex(i => i.detail.includes('용역비') || i.detail.includes('도급비'));
    else if (key === 'severance') existIdx = currentItems.findIndex(i => i.detail.includes('퇴직'));
    else if (key === 'annualLeave') existIdx = currentItems.findIndex(i => i.detail.includes('연차'));
    else if (key === 'insuranceDiff') existIdx = currentItems.findIndex(i => i.detail.includes('보험') && i.detail.includes('차액'));

    const defaultDetail = key === 'monthlyFee' ? `${monthNum ? monthNum + '월 ' : ''}${categoryStr}용역비` : summaryObj.label;

    if (existIdx > -1) {
      // 이미 존재하면 값 업데이트 (산정기간과 구분도 동기화)
      currentItems[existIdx].period = periodStr || currentItems[existIdx].period;
      currentItems[existIdx].category = categoryStr || currentItems[existIdx].category;
      currentItems[existIdx].amount = signedAmount;

      // 용역비가 아닌데 금액이 0원이 되면 삭제 (청구서에 0원은 안보이게)
      if (key !== 'monthlyFee' && signedAmount === 0) {
        currentItems.splice(existIdx, 1);
      }
    } else {
      // 없으면 신규 행 추가
      if (key === 'monthlyFee' || signedAmount !== 0) {
        currentItems.push({
          period: periodStr,
          category: categoryStr,
          detail: defaultDetail,
          amount: signedAmount,
          note: ''
        });
      }
    }
  });

  formData.value.billingData.items = currentItems;
  calculateBillingTotal();
};

// 합계가 변하거나, 선택 조건이 변하면 자동 동기화 실행!
watch([
  totalSummary,
  () => formData.value.type,
  () => formData.value.billingDt,
  () => formData.value.target_month
], () => {
  if (isInitializing.value) return;
  // 현장이 선택되어 데이터가 있을 때만 동기화 실행
  if (formData.value.sIdx) {
    syncBillingItems();
  }
}, { deep: true });

const colspanForSummary = computed(() => {
  let cols = 6;
  if (currentConfig.showAnnualLeave) cols += 1;
  if (currentConfig.showSeverance) cols += 1;
  if (currentConfig.showGrossPay) cols += 1;
  cols += visibleDeductionItems.value.length;
  if (visibleDeductionItems.value.some(item => item.itemNm.includes('고용보험'))) cols += 1;
  if (currentConfig.showSanjae) cols += 1;
  return cols - 2;
});

const calculateAreaSupply = () => {
  const vb = formData.value.billingData.vatBreakdown;
  const totalArea = (Number(vb.under135.area) || 0) + (Number(vb.over135.area) || 0);
  const topSum = formData.value.billingData.items.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  if (totalArea > 0 && topSum > 0) {
    const unitPrice = topSum / totalArea;
    vb.under135.unitPrice = unitPrice.toFixed(2);
    vb.over135.unitPrice  = unitPrice.toFixed(2);
    const underSupply = Math.round(unitPrice * (Number(vb.under135.area)||0)) - 1;
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
  const topSum = formData.value.billingData.items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (formData.value.is_vat === 'Y') calculateAreaSupply();
  else { formData.value.subTotal = topSum; formData.value.vatAmount = 0; formData.value.grandTotal = topSum; }
};

const handleManualBreakdownUpdate = () => {
  const overVat = Number(formData.value.billingData.vatBreakdown.over135.vat) || 0;
  formData.value.vatAmount = overVat;
  formData.value.grandTotal = formData.value.subTotal + overVat;
};

// ──────────────────────────────────────────────
// 7. 폼 세팅 및 이벤트 핸들러
// ──────────────────────────────────────────────
const initForm = () => {
  if (props.initialData && Object.keys(props.initialData).length > 0) {
    isInitializing.value = true;

    const data = JSON.parse(JSON.stringify(props.initialData));
    if (!data.payrollData) data.payrollData = [];
    if (!data.billingData) data.billingData = { items: [], bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)', insuranceDiff: 0 };
    if (!data.billingData.items) data.billingData.items = [];
    if (!data.billingData.vatBreakdown) data.billingData.vatBreakdown = { under135: { area: '', unitPrice: '', supply: 0 }, over135: { area: '', unitPrice: '', supply: 0, vat: 0 } };
    data.billingData.insuranceDiff = data.billingData.insuranceDiff || 0;

    data.payrollData.forEach(row => {
      if (!row.deductionItems) row.deductionItems = {};
      row.totalDeduct = row.totalDeduct || 0;
      if (!row.reserves) row.reserves = { annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0 };
      row.reserves.annualLeave = row.reserves.annualLeave || 0;
      row.reserves.severance = row.reserves.severance || 0;
      row.reserves.empInsEmployer = row.reserves.empInsEmployer || 0;
      row.reserves.sanjae = row.reserves.sanjae || 0;

      // ★ 추가됨: 이미 저장된 원본 데이터(originalDeductions)가 없을 때만 현재값을 원본으로 복사
      if (!row.originalDeductions || Object.keys(row.originalDeductions).length === 0) {
        row.originalDeductions = JSON.parse(JSON.stringify(row.deductionItems));
      }
      if (row.originalSanjae === undefined) {
        row.originalSanjae = row.reserves.sanjae;
      }
    });

    const selectedSite = siteOptions.value.find(s => s.idx === data.sIdx);
    data.is_vat = selectedSite ? selectedSite.is_vat : (data.vatAmount > 0 ? 'Y' : 'N');

    // 서버에서 내려온 viewConfig에서 화면 설정과 meltOptions(연차/퇴직 포함 토글) 복구
    if (data.viewConfig) {
      const savedConfig = data.viewConfig.site || data.viewConfig;
      Object.assign(currentConfig, savedConfig);
      if (savedConfig.meltOptions) {
        Object.assign(meltOptions, savedConfig.meltOptions);
      }

      if (currentConfig.showSanjae === undefined) currentConfig.showSanjae = true;
      if (!currentConfig.summarySigns) {
        currentConfig.summarySigns = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
      }
    } else {
      currentConfig.summarySigns = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
      meltOptions.annualLeave = false;
      meltOptions.severance = false;
    }

    // 세팅이 끝났으니 formData에 들어가지 않도록 삭제하여 상태를 깔끔하게 유지
    delete data.viewConfig;

    if (data.defaultTab) activeTab.value = data.defaultTab;
    formData.value = data;
    formData.value.payrollData.forEach(row => {
      calculateRow(row); // 합계/netPay만 재계산, 보험료는 건드리지 않음
    });

    if (formData.value.sIdx && formData.value.type) fetchContractData();

    nextTick(() => {
      isInitializing.value = false;
    });

  } else {
    formData.value = {
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
        bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)',
        items: [
            {
              period: '',
              category: '',
              detail: '',
              amount: 0,
              note: ''
            }
        ],
        vatBreakdown: {
          under135: { area: '', unitPrice: '', supply: 0 },
          over135: { area: '', unitPrice: '', supply: 0, vat: 0 }
        },
        insuranceDiff: 0
      },
      payrollData: []
    };
    currentConfig.summarySigns = {
      severance: -1,
      annualLeave: -1,
      estimatedIns: -1,
      actualIns: -1,
      insuranceDiff: -1
    };
    meltOptions.annualLeave = false;
    meltOptions.severance = false;
  }
};

watch(() => props.initialData, initForm, { immediate: true });

const resetAll = () => {
  if (!confirm('청구 공문과 급여 내역 전체를 초기화하시겠습니까?\n현장/구분/날짜 선택값은 유지됩니다.')) return;

  isInitializing.value = true; // ★ 초기화 시작 (자동 동기화 차단)

  // 현장/날짜/구분 유지용 백업
  const { sIdx, type, target_month, billingDt } = formData.value;

  // 청구 공문 초기화
  formData.value = {
    sIdx,
    siteName: '',
    is_vat: 'N',
    type, target_month, billingDt,
    docNo: '',
    subTotal: 0, vatAmount: 0, grandTotal: 0,
    billingData: {
      summary: '',
      workerCount: 0,
      bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)',
      items: [{ period: '', category: '', detail: '', amount: 0, note: '' }], // 빈 칸 하나로 리셋
      vatBreakdown: {
        under135: { area: '', unitPrice: '', supply: 0 },
        over135:  { area: '', unitPrice: '', supply: 0, vat: 0 }
      },
      insuranceDiff: 0
    },
    payrollData: [],
  };

  // 급여 내역 설정 초기화
  meltOptions.annualLeave = false;
  meltOptions.severance   = false;
  currentConfig.showGrossPay    = true;
  currentConfig.showAnnualLeave = true;
  currentConfig.showSeverance   = true;
  currentConfig.showSanjae      = true;
  currentConfig.summarySigns    = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
  if (deductionItems.value.length > 0) {
    currentConfig.activeDeductionCodes = deductionItems.value.map(i => i.itemCd);
  }

  // docNo 재생성 + 현장 관련 데이터 유지
  updateDocNo();
  if (sIdx) {
    handleSiteChange();
  }

  // ★ 0.1초 뒤에 차단 해제 (테이블이 완벽히 지워진 후 복구)
  setTimeout(() => {
    isInitializing.value = false;
  }, 100);
};

const loadPayrollData = async () => {
  if (!formData.value.sIdx) { alert('현장을 먼저 선택해주세요.'); return; }
  if (formData.value.payrollData.length > 0 && !confirm('기존에 입력된 데이터가 모두 초기화됩니다. 정말 불러오시겠습니까?')) return;

  try {
    const targetDate = formData.value.target_month || formData.value.billingDt || '';
    const [year, month] = targetDate.split('-');

    await fetchTaxRates();
    if (contractStaffList.value.length === 0 || contractIndirectLabor.value.length === 0) await fetchContractData();

    const res = await axios.get('/api/v1/member/payroll/month', { params: { year, month } });
    const rawData = res.data?.data || [];
    const result = rawData.filter(item => item.type == formData.value.type && item.sIdx == formData.value.sIdx);

    const safeParse = (val) => { if (!val) return {}; if (typeof val === 'object') return val; try { return JSON.parse(val); } catch { return {}; } };

    formData.value.payrollData = result.map(item => {
      const parsedDeductions = safeParse(item.deductionItems);
      const parsedPayItems   = safeParse(item.payItems);

      const rowObj = {
        idx:        item.idx, empName: item.staff, position: item.role || '', personalNo: item.birthDt,
        inDate:     item.inDate, outDate: item.outDate ?? '', grossPay: Number(item.grossPay) || 0,
        payItems:   parsedPayItems, deductionItems: parsedDeductions,
        originalDeductions: {}, originalSanjae: 0,
        totalDeduct: 0, reserves: { annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0 }, netPay: 0,
      };

      applyContractReserves(rowObj);
      rowObj.originalDeductions = JSON.parse(JSON.stringify(rowObj.deductionItems));

      if (meltOptions.annualLeave || meltOptions.severance) recalculateInsurances(rowObj);
      calculateRow(rowObj);

      return rowObj;
    });

    if (formData.value.payrollData.length === 0) alert('조건에 맞는 직원 데이터가 없습니다.');
    else alert('직원 급여 데이터를 성공적으로 불러왔습니다.');

  } catch (error) {
    console.error('데이터 로드 에러 원인:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  }
};

const updateDocNo = () => {
  const targetDate = formData.value.target_month || formData.value.billingDt;
  if (targetDate && formData.value.sIdx) {
    const [year, month] = targetDate.split('-');
    formData.value.docNo = `에코그린 ${year}-${month.padStart(2, '0')}-${formData.value.sIdx}호`;
  }
};
watch(() => formData.value.sIdx, updateDocNo);
watch(() => formData.value.target_month, updateDocNo);
watch(() => formData.value.billingDt, updateDocNo);
watch(() => formData.value.type, (newType) => { if (newType && formData.value.sIdx) fetchContractData(); });

const handleSiteChange = () => {
  const selectedSite = siteOptions.value.find(s => s.idx === formData.value.sIdx);
  if (selectedSite) {
    formData.value.siteName = selectedSite.name;
    formData.value.is_vat   = selectedSite.is_vat || 'N';
    const vb = formData.value.billingData.vatBreakdown;
    const dbAreaUnder = Number(selectedSite.areaUnder || selectedSite.area_under) || 0;
    const dbAreaOver  = Number(selectedSite.areaOver || selectedSite.area_over) || 0;
    const dbAreaTotal = Number(selectedSite.areaUnder) + Number(selectedSite.areaOver) || 0;

    if (formData.value.is_vat === 'Y') {
      if (dbAreaUnder > 0 || dbAreaOver > 0) { vb.under135.area = dbAreaUnder; vb.over135.area = dbAreaOver; }
      else { vb.under135.area = 0; vb.over135.area = dbAreaTotal; }
    } else { vb.under135.area = dbAreaUnder > 0 ? dbAreaUnder : dbAreaTotal; vb.over135.area = 0; }
    calculateAreaSupply();
  } else { formData.value.siteName = ''; formData.value.is_vat = 'N'; }
  calculateBillingTotal();
  fetchContractData();
};

const addBillingRow = () => formData.value.billingData.items.push({ period: '', category: '', detail: '', amount: 0, note: '' });
const removeBillingRow = (i) => { formData.value.billingData.items.splice(i, 1); calculateBillingTotal(); };
const addPayrollRow = () => formData.value.payrollData.push({ empName: '', position: '', personalNo: '', inDate: '', outDate: '', grossPay: 0, deductionItems: {}, originalDeductions: {}, originalSanjae: 0, totalDeduct: 0, reserves: { annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0 }, netPay: 0 });
const removePayrollRow = (i) => { if (confirm('삭제하시겠습니까?')) formData.value.payrollData.splice(i, 1); };

const onDragStart = (index) => { dragIndex.value = index; };
const onDragEnd   = ()        => { dragIndex.value = null; };
const onDragOver  = (e, index) => {
  e.preventDefault();
  if (dragIndex.value === null || dragIndex.value === index) return;
  const list = formData.value.payrollData;
  const dragged = list.splice(dragIndex.value, 1)[0];
  list.splice(index, 0, dragged);
  dragIndex.value = index;
};

// ──────────────────────────────────────────────
// 8. 내보내기 & 저장
// ──────────────────────────────────────────────
const exportToExcel = () => {
  const wb         = XLSX.utils.book_new();
  const siteName   = formData.value.siteName   || '현장미지정';
  const targetMonth= formData.value.target_month || formData.value.billingDt || '';
  const fileName   = `정산서_${siteName}_${targetMonth}.xlsx`;

  const statementRows = [ ['청구 공문'], [], ['수신', formData.value.siteName ? formData.value.siteName + ' 관리사무소' : ''], ['문서번호', formData.value.docNo || ''], ['시행일자', formData.value.billingDt || ''], ['제목', formData.value.billingData.summary || ''], [], ['산정기간', '구분', '내역', '산출금액', '비고'] ];
  (formData.value.billingData.items || []).forEach(item => { statementRows.push([item.period || '', item.category || '', item.detail || '', Number(item.amount) || 0, item.note || '']); });
  statementRows.push([], ['', '', '합계', formData.value.subTotal, '']);

  if (formData.value.is_vat === 'Y') {
    const vb = formData.value.billingData.vatBreakdown;
    statementRows.push([], ['구분', '관리면적(㎡)', '단가(원)', '공급가액(원)', '부가세(원)', '합계금액(원)']);
    statementRows.push(['135㎡ 이하 (면세)', Number(vb.under135.area)||0, Number(vb.under135.unitPrice)||0, Number(vb.under135.supply)||0, 0, Number(vb.under135.supply)||0]);
    statementRows.push(['135㎡ 초과 (과세)', Number(vb.over135.area)||0, Number(vb.over135.unitPrice)||0, Number(vb.over135.supply)||0, Number(vb.over135.vat)||0, (Number(vb.over135.supply)||0)+(Number(vb.over135.vat)||0)]);
    statementRows.push(['총 계', (Number(vb.under135.area)||0)+(Number(vb.over135.area)||0), '-', formData.value.subTotal, formData.value.vatAmount, formData.value.grandTotal]);
  }
  statementRows.push([], ['입금계좌', formData.value.billingData.bankInfo || '']);
  const ws1 = XLSX.utils.aoa_to_sheet(statementRows);
  ws1['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws1, '청구공문');

  if (formData.value.payrollData.length > 0) {
    const cfg = currentConfig;
    const payrollRows = [];

    const header1 = ['NO', '이름', '직책', '생년월일', '입사일', '퇴사일'];
    if (cfg.showAnnualLeave) header1.push('연차수당');
    if (cfg.showSeverance) header1.push('퇴직충당금');
    if (cfg.showGrossPay) header1.push('급여');

    visibleDeductionItems.value.forEach(item => {
      if (item.itemNm.includes('고용보험')) { header1.push('실업급여(0.9%)'); header1.push('고용안정(0.45%)'); }
      else { header1.push(item.itemNm); }
    });
    if (cfg.showSanjae) header1.push('산재보험');
    header1.push('총계');
    payrollRows.push(header1);

    formData.value.payrollData.forEach((row, idx) => {
      const dataRow = [ idx + 1, row.empName || '', row.position || '', row.personalNo || '', row.inDate || '', row.outDate || '' ];
      if (cfg.showAnnualLeave) dataRow.push(Number(row.reserves?.annualLeave) || 0);
      if (cfg.showSeverance) dataRow.push(Number(row.reserves?.severance) || 0);
      if (cfg.showGrossPay) dataRow.push(Number(row.grossPay) || 0);

      visibleDeductionItems.value.forEach(item => {
        if (item.itemNm.includes('고용보험')) { dataRow.push(Number(row.deductionItems?.[item.itemCd]) || 0); dataRow.push(Number(row.reserves?.empInsEmployer) || 0); }
        else { dataRow.push(Number(row.deductionItems?.[item.itemCd]) || 0); }
      });
      if (cfg.showSanjae) dataRow.push(Number(row.reserves?.sanjae) || 0);
      dataRow.push(getInsuranceTotal(row));
      payrollRows.push(dataRow);
    });

    const totalRow = ['', '', '', '', '', '총 계'];
    if (cfg.showAnnualLeave) totalRow.push(payrollTotals.value.annualLeave);
    if (cfg.showSeverance) totalRow.push(payrollTotals.value.severance);
    if (cfg.showGrossPay) totalRow.push(payrollTotals.value.grossPay);

    visibleDeductionItems.value.forEach(item => {
      if (item.itemNm.includes('고용보험')) { totalRow.push(payrollTotals.value.deductionItems[item.itemCd] || 0); totalRow.push(payrollTotals.value.empInsEmployer || 0); }
      else { totalRow.push(payrollTotals.value.deductionItems[item.itemCd] || 0); }
    });
    if (cfg.showSanjae) totalRow.push(payrollTotals.value.sanjae);
    totalRow.push(payrollTotals.value.insuranceTotal);
    payrollRows.push(totalRow);
    payrollRows.push([]);

    totalSummary.value.forEach(summary => {
      const row = Array(header1.length).fill('');
      row[row.length - 3] = summary.label;
      let displayValue = summary.value;
      if (summary.sign < 0 && summary.value !== 0) displayValue = -summary.value;
      row[row.length - 1] = displayValue;
      payrollRows.push(row);
    });

    const ws2 = XLSX.utils.aoa_to_sheet(payrollRows);
    const colWidths = [{ wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    if (cfg.showAnnualLeave) colWidths.push({ wch: 14 });
    if (cfg.showSeverance) colWidths.push({ wch: 14 });
    if (cfg.showGrossPay) colWidths.push({ wch: 14 });
    visibleDeductionItems.value.forEach(item => {
      if (item.itemNm.includes('고용보험')) colWidths.push({ wch: 15 }, { wch: 15 });
      else colWidths.push({ wch: 14 });
    });
    if (cfg.showSanjae) colWidths.push({ wch: 14 });
    colWidths.push({ wch: 14 });
    ws2['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws2, `급여내역서`);
  }
  XLSX.writeFile(wb, fileName);
};

const handleSave = async () => {
  try {
    const sIdx = formData.value.sIdx;
    if (!sIdx) { alert('현장을 선택해주세요.'); return; }
    const [year, month] = (formData.value.target_month || formData.value.billingDt).split('-');
    if(!year || !month) { alert('날짜를 선택해주세요.'); return; }

    const payload = {
      idx:         props.settlementId,
      year:        parseInt(year)  || 0,
      month:       parseInt(month) || 0,
      type:        formData.value.type,
      docNo:       formData.value.docNo,
      billingDt:   formData.value.billingDt,
      subTotal:    formData.value.subTotal,
      vatAmount:   formData.value.vatAmount,
      grandTotal:  formData.value.grandTotal,
      billingData: formData.value.billingData,
      payrollData: formData.value.payrollData,
      // ★ 추가됨: 서버에 저장할 때 viewConfig를 만들어서 토글 상태(meltOptions)를 포함시킴
      viewConfig:  JSON.parse(JSON.stringify({
        ...currentConfig,
        meltOptions: meltOptions
      })),
      cIdx:        authStore.user?.cIdx || 0,
    };

    const response = await axios.post(`/api/v1/settle/site/data/${sIdx}`, payload);
    if (response.data.result) { alert('성공적으로 저장되었습니다.'); emit('save'); }
    else { alert(`저장 실패: ${response.data.msg}`); }
  } catch (error) { console.error('정산서 저장 중 오류 발생:', error); alert('서버 통신 중 오류가 발생했습니다.'); }
};

const closeModal = () => emit('close');

onMounted(async () => {
  await Promise.all([ fetchSiteOptions(), fetchTypeOptions() ]);
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
        </div>
        <div class="header-actions">
          <button class="btn-excel" @click="resetAll">
            <i class="mdi mdi-refresh"></i>
            <span class="btn-text">초기화</span>
          </button>
          <button class="btn-excel" @click="exportToExcel"><i class="mdi mdi-microsoft-excel"></i><span class="btn-text">엑셀 저장</span></button>
          <button class="btn-save" @click="handleSave"><i class="mdi mdi-content-save"></i><span class="btn-text">저장하기</span></button>
          <button class="btn-close" @click="closeModal"><i class="mdi mdi-close"></i></button>
        </div>
      </div>

      <div class="modal-tabs">
        <button :class="['tab-btn', { active: activeTab === 'statement' }]" @click="activeTab = 'statement'">
          <i class="mdi mdi-file-document-outline"></i> <span class="tab-text">청구 공문 (표지)</span>
        </button>
        <button :class="['tab-btn', { active: activeTab === 'details' }]" @click="activeTab = 'details'">
          <i class="mdi mdi-table-account"></i> <span class="tab-text">급여 세부 내역서</span>
        </button>
      </div>

      <div class="modal-body">

        <div v-show="activeTab === 'statement'" class="tab-content">
          <div class="document-paper">
            <div class="doc-header text-center"><h1>청 구 공 문</h1></div>

            <div class="form-grid">
              <div class="form-group">
                <label>현장 선택 <span class="text-red">*</span></label>
                <select v-model="formData.sIdx" @change="handleSiteChange" class="form-select">
                  <option value="" disabled>현장을 선택해주세요</option>
                  <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
                </select>
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
                <input type="text" :value="formData.siteName ? formData.siteName + ' 관리사무소' : ''" readonly class="bg-gray form-input" placeholder="현장을 선택하면 자동 입력됩니다" />
              </div>
              <div class="form-group">
                <label>문서번호</label>
                <input type="text" v-model="formData.docNo" class="form-input" placeholder="예: 에코그린 2026-01-09호" />
              </div>
              <div class="form-group">
                <label>시행일자</label>
                <input type="date" v-model="formData.billingDt" class="form-input" />
              </div>
              <div class="form-group">
                <label>제목</label>
                <input type="text" v-model="formData.billingData.summary" placeholder="예: 2026년 1월 미화용역비 청구의 건" class="form-input" />
              </div>
            </div>

            <div class="doc-message">
              <p>1. 귀 소의 무궁한 발전을 기원합니다.</p>
              <p>2. 당월 용역비를 아래와 같이 청구하오니 검토하시여 결재를 부탁드립니다.</p>
              <p class="text-center mt-4">- 아 래 -</p>
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
                <thead>
                <tr>
                  <th style="width:100px;">산정기간</th> <th style="width:70px;">구분</th> <th>내역</th> <th style="width:90px;">산출금액</th> <th style="width:90px;">비고</th> <th style="width:34px;"></th>
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
                  <td class="text-right text-blue">{{ formatCurrency(formData.subTotal) }}</td>
                  <td colspan="2"></td>
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
                    <th style="min-width:110px;">구분</th><th style="min-width:100px;">관리면적(㎡)</th><th style="min-width:90px;">단가(원)</th><th style="min-width:110px;">공급가액(원)</th><th style="min-width:100px;">부가세(원)</th><th style="min-width:110px;">합계금액(원)</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr>
                    <td class="text-center font-bold bg-gray-50">135㎡ 이하 (면세)</td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.under135.area)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.under135, 'area', null, 'area')" class="cell-input text-right" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.under135.unitPrice)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.under135, 'unitPrice', null, 'area')" class="cell-input text-right" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.under135.supply)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.under135, 'supply', null, 'billing')" class="cell-input text-right font-bold text-blue" /></td>
                    <td class="text-right bg-gray-50 text-gray-400">0</td>
                    <td class="text-right font-bold text-blue bg-blue-light">{{ formatCurrency(formData.billingData.vatBreakdown.under135.supply) }}</td>
                  </tr>
                  <tr>
                    <td class="text-center font-bold bg-gray-50">135㎡ 초과 (과세)</td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.over135.area)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'area', null, 'area')" class="cell-input text-right" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.over135.unitPrice)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'unitPrice', null, 'area')" class="cell-input text-right" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.over135.supply)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'supply', null, 'manual')" class="cell-input text-right font-bold text-blue" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.over135.vat)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'vat', null, 'manual')" class="cell-input text-right font-bold text-red" /></td>
                    <td class="text-right font-bold text-blue bg-blue-light">{{ formatCurrency(Number(formData.billingData.vatBreakdown.over135.supply) + Number(formData.billingData.vatBreakdown.over135.vat)) }}</td>
                  </tr>
                  </tbody>
                  <tfoot>
                  <tr class="bg-gray-50 font-bold" style="font-size:14px;">
                    <td class="text-center">총 계</td>
                    <td class="text-right">{{ formatCurrency(Number(formData.billingData.vatBreakdown.under135.area) + Number(formData.billingData.vatBreakdown.over135.area)) }}</td>
                    <td class="text-center">-</td>
                    <td class="text-right text-blue">{{ formatCurrency(formData.subTotal) }}</td>
                    <td class="text-right text-red">{{ formatCurrency(formData.vatAmount) }}</td>
                    <td class="text-right text-blue bg-blue-light">{{ formatCurrency(formData.grandTotal) }}</td>
                  </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div class="bank-info mt-5">
              <label>3. 입금계좌 : </label>
              <input type="text" v-model="formData.billingData.bankInfo" class="bank-input" />
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
              </div>

              <button class="btn-load-data" @click="loadPayrollData"><i class="mdi mdi-download-box-outline"></i> <span class="btn-text">데이터 불러오기</span></button>
              <button class="btn-add-row" @click="addPayrollRow"><i class="mdi mdi-plus-thick"></i> <span class="btn-text">직원 추가</span></button>
            </div>
          </div>

          <div class="deduction-toggles">
            <span class="toggle-label"><i class="mdi mdi-filter-variant"></i> 표시 설정 :</span>
            <label class="toggle-checkbox main-toggle">
              <input type="checkbox" v-model="currentConfig.showGrossPay" /> <span class="font-bold text-blue">급여(지급총액)</span>
            </label>
            <label class="toggle-checkbox main-toggle">
              <input type="checkbox" v-model="currentConfig.showAnnualLeave" /> <span class="font-bold" style="color: #b45309;">연차수당</span>
            </label>
            <label class="toggle-checkbox main-toggle">
              <input type="checkbox" v-model="currentConfig.showSeverance" /> <span class="font-bold" style="color: #b45309;">퇴직충당금</span>
            </label>
            <label class="toggle-checkbox main-toggle">
              <input type="checkbox" v-model="currentConfig.showSanjae" /> <span class="font-bold" style="color: #b45309;">산재보험</span>
            </label>
            <label v-for="item in deductionItems" :key="item.itemCd" class="toggle-checkbox">
              <input type="checkbox" :value="item.itemCd" v-model="currentConfig.activeDeductionCodes" /> <span>{{ item.itemNm }}</span>
            </label>
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

                <th v-if="currentConfig.showAnnualLeave" rowspan="2" class="bg-yellow-light" style="width:80px;min-width:120px;">연차수당</th>
                <th v-if="currentConfig.showSeverance" rowspan="2" class="bg-yellow-light" style="width:80px;min-width:120px;">퇴직충당금</th>
                <th v-if="currentConfig.showGrossPay" rowspan="2" class="bg-blue-light" style="width:80px;min-width:120px;">급여</th>

                <template v-for="item in visibleDeductionItems" :key="'th1-'+item.itemCd">
                  <th v-if="item.itemNm.includes('고용보험')" colspan="2" class="bg-red-light" style="min-width:200px;">고용보험({{ insuranceRates.employmentInsurance }}%)</th>
                  <th v-else rowspan="2" class="bg-red-light" style="min-width:120px;">{{ item.itemNm }}</th>
                </template>

                <th v-if="currentConfig.showSanjae" rowspan="2" class="bg-red-light" style="min-width:120px;">산재보험</th>

                <th rowspan="2" class="bg-red-light" style="min-width:120px;">총계</th>
                <th rowspan="2" style="width:20px;min-width:20px;">관리</th>
              </tr>

              <tr>
                <template v-for="item in visibleDeductionItems" :key="'th2-'+item.itemCd">
                  <template v-if="item.itemNm.includes('고용보험')">
                    <th class="bg-red-light" style="min-width:100px; font-size:11px;">실업급여<br>{{ insuranceRates.employmentInsurance }}%</th>
                    <th class="bg-red-light" style="min-width:100px; font-size:11px;">고용안정 등<br>0.45%</th>
                  </template>
                </template>
              </tr>
              </thead>

              <tbody>
              <tr
                  v-for="(row, index) in formData.payrollData" :key="'pay-'+index"
                  draggable="true" @dragstart="onDragStart(index)" @dragover="onDragOver($event, index)" @dragend="onDragEnd"
                  :class="{ dragging: dragIndex === index }"
              >
                <td class="text-center drag-handle"><i class="mdi mdi-drag-vertical drag-icon"></i> <span>{{ index + 1 }}</span></td>
                <td><input type="text" v-model="row.empName"    class="cell-input text-center" /></td>
                <td><input type="text" v-model="row.position" @input="applyContractReserves(row)" class="cell-input text-center" /></td>
                <td><input type="text" v-model="row.personalNo" class="cell-input text-center" /></td>
                <td><input type="text" v-model="row.inDate"     class="cell-input text-center" /></td>
                <td><input type="text" v-model="row.outDate"    class="cell-input text-center" /></td>

                <td v-if="currentConfig.showAnnualLeave">
                  <input
                      type="text"
                      :value="formatCurrency(row.reserves.annualLeave)"
                      @focus="$event.target.select()"
                      @input="handleCurrencyInput($event, row.reserves, 'annualLeave', row, 'salary')"
                      class="cell-input text-right"
                  />
                </td>
                <td v-if="currentConfig.showSeverance">
                  <input
                      type="text"
                      :value="formatCurrency(row.reserves.severance)"
                      @focus="$event.target.select()"
                      @input="handleCurrencyInput($event, row.reserves, 'severance', row, 'salary')"
                      class="cell-input text-right"
                  />
                </td>
                <td v-if="currentConfig.showGrossPay">
                  <input
                      type="text"
                      :value="formatCurrency(row.grossPay)"
                      @focus="$event.target.select()"
                      @input="handleCurrencyInput($event, row, 'grossPay', row, 'salary')"
                      class="cell-input text-right font-bold text-blue"
                  />
                </td>

                <template v-for="item in visibleDeductionItems" :key="'td-'+item.itemCd">
                  <template v-if="item.itemNm.includes('고용보험')">
                    <td>
                      <input
                          type="text"
                          :value="formatCurrency(row.deductionItems[item.itemCd])"
                          @focus="$event.target.select()"
                          @input="handleCurrencyInput($event, row.deductionItems, item.itemCd, row, 'row')"
                          class="cell-input text-right"
                      />
                    </td>
                    <td>
                      <input
                          type="text"
                          :value="formatCurrency(row.reserves.empInsEmployer)"
                          @focus="$event.target.select()"
                          @input="handleCurrencyInput($event, row.reserves, 'empInsEmployer', row, 'row')"
                          class="cell-input text-right"
                      />
                    </td>
                  </template>
                  <td v-else>
                    <input
                        type="text"
                        :value="formatCurrency(row.deductionItems[item.itemCd])"
                        @focus="$event.target.select()"
                        @input="handleCurrencyInput($event, row.deductionItems, item.itemCd, row, 'row')"
                        class="cell-input text-right" />
                  </td>
                </template>

                <td v-if="currentConfig.showSanjae">
                  <input
                      type="text"
                      :value="formatCurrency(row.reserves.sanjae)"
                      @focus="$event.target.select()"
                      @input="handleCurrencyInput($event, row.reserves, 'sanjae', row, 'row')"
                      class="cell-input text-right" />
                </td>

                <td class="text-right font-bold bg-gray-50">{{ formatCurrency(getInsuranceTotal(row)) }}</td>
                <td class="text-center"><button class="btn-delete-row" @click="removePayrollRow(index)"><i class="mdi mdi-trash-can-outline"></i></button></td>
              </tr>
              <tr v-if="formData.payrollData.length === 0">
                <td :colspan="9 + visibleDeductionItems.length + (currentConfig.showSanjae ? 1 : 0)" class="empty-row">등록된 데이터가 없습니다.</td>
              </tr>
              </tbody>

              <tfoot v-if="formData.payrollData.length > 0">
              <tr class="bg-gray-50 font-bold" style="font-size:14px;">
                <td colspan="6" class="text-center">총 계</td>
                <td v-if="currentConfig.showAnnualLeave" class="text-right bg-yellow-light" style="color:#a16207;">{{ formatCurrency(payrollTotals.annualLeave) }}</td>
                <td v-if="currentConfig.showSeverance" class="text-right bg-yellow-light" style="color:#a16207;">{{ formatCurrency(payrollTotals.severance) }}</td>
                <td v-if="currentConfig.showGrossPay" class="text-right text-blue bg-blue-light">{{ formatCurrency(payrollTotals.grossPay) }}</td>

                <template v-for="item in visibleDeductionItems" :key="'foot-'+item.itemCd">
                  <template v-if="item.itemNm.includes('고용보험')">
                    <td class="text-right">{{ formatCurrency(payrollTotals.deductionItems[item.itemCd]) }}</td>
                    <td class="text-right">{{ formatCurrency(payrollTotals.empInsEmployer) }}</td>
                  </template>
                  <td v-else class="text-right">{{ formatCurrency(payrollTotals.deductionItems[item.itemCd]) }}</td>
                </template>

                <td v-if="currentConfig.showSanjae" class="text-right">{{ formatCurrency(payrollTotals.sanjae) }}</td>

                <td class="text-right text-red bg-red-light">{{ formatCurrency(payrollTotals.insuranceTotal) }}</td>
                <td></td>
              </tr>

              <tr v-for="(summary, sIdx) in totalSummary" :key="'summary-'+sIdx">
                <td :colspan="colspanForSummary" style="border: none; background: transparent;"></td>
                <td colspan="2"
                    class="text-center bg-gray-50 font-bold"
                    :class="{'summary-label-cell': summary.toggleable}"
                    @click="summary.toggleable && toggleSummarySign(summary.key)"
                    style="font-size: 13px;"
                    :title="summary.toggleable ? '클릭하여 양수/음수 전환' : ''">
                  <div style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                    <span v-if="summary.toggleable" class="sign-badge" :class="summary.sign < 0 ? 'bg-red-badge' : 'bg-blue-badge'">
                      {{ summary.sign < 0 ? '-' : '+' }}
                    </span>
                    {{ summary.label }}
                  </div>
                </td>
                <td colspan="2" class="text-right font-bold" :class="summary.key === 'grandTotal' ? 'text-blue bg-blue-light' : 'bg-white'" style="padding: 0; border: 1px solid var(--border-color);">
                  <template v-if="summary.key === 'insuranceDiff'">
                    <div style="display: flex; align-items: center; padding-left: 8px;">
                      <span :class="summary.sign < 0 ? 'text-red' : 'text-blue'">{{ summary.sign < 0 ? '-' : '+' }}</span>
                      <input type="text" :value="formatCurrency(formData.billingData.insuranceDiff)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData, 'insuranceDiff', null, 'none')" class="cell-input text-right font-bold" :class="summary.sign < 0 ? 'text-red' : 'text-blue'" style="width: 100%; height: 100%; padding: 6px; box-sizing: border-box; border-radius: 0;" />
                    </div>
                  </template>
                  <template v-else>
                    <div style="padding: 6px;" :class="summary.sign < 0 ? 'text-red' : (summary.toggleable ? 'text-blue' : '')">
                      <span v-if="summary.value !== 0">{{ summary.sign < 0 ? '- ' : (summary.toggleable ? '+ ' : '') }}</span>{{ formatCurrency(summary.value) }}
                    </div>
                  </template>
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
.modal-container { background: var(--bg-surface); width: 100%; max-width: 1400px; height: 90vh; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,.1); overflow: hidden; border: 1px solid var(--border-color); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas); gap: 12px; flex-wrap: wrap; }
.header-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.header-title h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-main); white-space: nowrap; }
.badge { padding: 3px 8px; background: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.btn-excel { background: rgba(5, 150, 105, .1); color: var(--success); border: 1px solid rgba(5, 150, 105, .3); padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; font-size: 14px; white-space: nowrap; }
.btn-excel:hover { background: var(--success); color: #fff; }
.btn-save { background: var(--primary); color: var(--text-inverse); border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; font-size: 14px; white-space: nowrap; }
.btn-save:hover { background: var(--primary-hover); transform: translateY(-1px); }
.btn-close { background: none; border: none; font-size: 22px; color: var(--text-muted); cursor: pointer; transition: .2s; padding: 4px; line-height: 1; border-radius: 6px; }
.btn-close:hover { background: var(--bg-hover); color: var(--danger); }
.btn-reset {
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.3);
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
.btn-reset:hover { background: #f59e0b; color: #fff; }
.modal-tabs { display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); flex-shrink: 0; }
.tab-btn { padding: 14px 18px; background: none; border: none; border-bottom: 3px solid transparent; font-size: 14px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; margin-bottom: -1px; white-space: nowrap; }
.tab-btn:hover  { color: var(--text-main); }
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
.modal-body { flex: 1; overflow-y: auto; padding: 20px; background: var(--bg-canvas); -webkit-overflow-scrolling: touch; }
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
.excel-table-wrapper { background: var(--bg-surface); border-radius: 8px; border: 1px solid var(--border-color); overflow-x: auto; box-shadow: var(--shadow-sm); -webkit-overflow-scrolling: touch; }
.excel-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.excel-table th, .excel-table td { border: 1px solid var(--border-color); padding: 6px; vertical-align: middle; }
.excel-table thead th { background: var(--bg-hover); font-weight: 600; text-align: center; color: var(--text-main); padding: 10px 8px; white-space: nowrap; line-height: 1.3; position: sticky; top: 0; z-index: 10; }
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
@media (max-width: 768px) { .modal-overlay { padding: 0; align-items: flex-end; } .modal-container { height: 96vh; border-radius: 16px 16px 0 0; max-width: 100%; } .modal-header { padding: 12px 16px; } .header-title h2 { font-size: 15px; } .badge { display: none; } .modal-tabs { padding: 0 8px; } .tab-btn { padding: 12px 12px; font-size: 13px; } .tab-text { display: none; } .switcher-label { display: none; } .modal-body { padding: 12px; } .document-paper { padding: 16px 14px; } .doc-header h1 { font-size: 18px; letter-spacing: 4px; margin-bottom: 20px; } .form-grid { grid-template-columns: 1fr; gap: 12px; } .btn-text { display: none; } .action-btns { gap: 6px; } .btn-add-row, .btn-load-data { padding: 7px 10px; } .excel-table { font-size: 12px; } .excel-table thead th { padding: 8px 6px; font-size: 11px; } .excel-table td { padding: 4px; } .cell-input { font-size: 12px; padding: 3px; } .deduction-toggles { gap: 8px; padding: 10px; } }
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

/* ★ 요약 하단 토글 관련 디자인 */
.summary-label-cell { cursor: pointer; transition: background-color 0.2s; user-select: none; }
.summary-label-cell:hover { background-color: #e2e8f0; }
.sign-badge { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 4px; font-size: 12px; font-weight: 900; color: white; }
.bg-red-badge { background-color: #ef4444; }
.bg-blue-badge { background-color: #3b82f6; }
</style>
