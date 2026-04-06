<script setup>
import { ref, watch, onMounted, computed, reactive } from 'vue';
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
// 탭 & 뷰타입 및 표시 설정(토글)
// ──────────────────────────────────────────────
const activeTab = ref('statement'); // 'statement' | 'details'

const VIEW_TYPES = {
  site: { label: '현장용',    icon: 'mdi-office-building-outline', color: '#2563eb' },
  tax:  { label: '세무사용',  icon: 'mdi-file-chart-outline',      color: '#7c3aed' },
};

const activeViewType = ref('site');

const viewConfig = reactive({
  site: { showGrossPay: true,  showAnnualLeave: true, showSeverance: true, activeDeductionCodes: [] },
  tax:  { showGrossPay: false, showAnnualLeave: true, showSeverance: true, activeDeductionCodes: [] },
});

const currentConfig = computed(() => viewConfig[activeViewType.value]);

// ──────────────────────────────────────────────
// ★ DB 적용요율(getTaxRate) 가져오기 로직
// ──────────────────────────────────────────────
const insuranceRates = ref({
  nationalPension: 0,
  healthInsurance: 0,
  longTermCare: 0,
  employmentInsurance: 0,
  industrialAccident: 0
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
    } else {
      insuranceRates.value = {
        nationalPension: 0,
        healthInsurance: 0,
        longTermCare: 0,
        employmentInsurance: 0,
        industrialAccident: 0
      };
    }
  } catch (err) {
    console.error('적용요율 로드 실패:', err);
  }
};

// ──────────────────────────────────────────────
// 동적 계약 데이터 로직
// ──────────────────────────────────────────────
const items = ref([]);
const contractIndirectLabels = ref([]);
const contractDirectLabor = ref([]);
const contractStaffList = ref([]);
const contractTotalCost = ref(0);

const deductionItems = computed(() => {
  if (!Array.isArray(items.value)) return [];
  let result = [];

  if (contractIndirectLabels.value.length > 0) {
    result = items.value.filter(item => {
      // 그룹코드가 04002(4대보험)이거나 04003(산재보험 포함)인 경우 허용
      if (item.groupCd !== '04002' && item.groupCd !== '04003') return false;
      return contractIndirectLabels.value.some(label => item.itemCd === label || item.itemNm.includes(label));
    });
  } else {
    const defaultKeywords = ['국민연금', '건강보험', '장기요양', '고용보험'];
    result = items.value.filter(item => item.groupCd === '04002' && defaultKeywords.some(kw => item.itemNm.includes(kw)));
  }

  // ★ 핵심: 계약데이터(직접노무비)에 산재보험(04003010)이 있다면 무조건 리스트에 추가
  const hasSanjaeInDirect = contractDirectLabor.value.some(
      d => d.label === '04003010' || String(d.label).includes('산재')
  );
  if (hasSanjaeInDirect && !result.some(i => i.itemCd === '04003010')) {
    const sanjaeItem = items.value.find(i => i.itemCd === '04003010');
    if (sanjaeItem) result.push(sanjaeItem);
  }

  const uniqueResult = [];
  const seen = new Set();
  for (const item of result) {
    if (!seen.has(item.itemCd)) {
      seen.add(item.itemCd);
      uniqueResult.push(item);
    }
  }
  return uniqueResult;
});

const totalSummary = computed(() => {
  const monthlyFee  = contractTotalCost.value || 0;
  const severance   = payrollTotals.value.severance || 0;
  const annualLeave = payrollTotals.value.annualLeave || 0;
  const insDiff     = Number(formData.value.billingData.insuranceDiff) || 0;
  const grandTotal  = monthlyFee - severance - annualLeave - insDiff;

  return [
    { label: '월간용역비', value: monthlyFee },
    { label: '퇴직적립금 (차감)', value: severance },
    { label: '연차적립금 (차감)', value: annualLeave },
    { label: '4대보험차액 (차감)', value: insDiff },
    { label: '총 청구액', value: grandTotal }
  ];
});

const fetchContractData = async () => {
  const sIdx = formData.value.sIdx;
  const type = formData.value.type;

  if (!sIdx || !type) {
    contractIndirectLabels.value = []; contractDirectLabor.value = []; contractStaffList.value = []; contractTotalCost.value = 0;
    return;
  }

  try {
    const res = await axios.get(`/api/v1/site/data/${sIdx}`);
    const siteData = res.data.data?.[0];

    if (!siteData || !siteData.contractList) {
      contractIndirectLabels.value = []; contractDirectLabor.value = []; contractStaffList.value = []; contractTotalCost.value = 0;
      return;
    }

    const parsedContractList = typeof siteData.contractList === 'string' ? JSON.parse(siteData.contractList) : siteData.contractList;
    const targetContract = parsedContractList.find(c => c.type === type);

    if (targetContract) {
      contractIndirectLabels.value = (targetContract.budget && Array.isArray(targetContract.budget.indirectLabor)) ? targetContract.budget.indirectLabor.map(item => item.label) : [];
      contractDirectLabor.value = (targetContract.budget && Array.isArray(targetContract.budget.directLabor)) ? targetContract.budget.directLabor : [];
      contractStaffList.value = Array.isArray(targetContract.staffList) ? targetContract.staffList : [];
      contractTotalCost.value = Number(targetContract.totalCost) || 0;
    } else {
      contractIndirectLabels.value = []; contractDirectLabor.value = []; contractStaffList.value = []; contractTotalCost.value = 0;
    }
  } catch (error) {
    console.error('계약 정보를 불러오는 중 오류 발생:', error);
  }
};

watch(deductionItems, (newItems) => {
  if (newItems.length === 0) return;
  const allCodes = newItems.map(i => i.itemCd);
  if (viewConfig.site.activeDeductionCodes.length === 0) viewConfig.site.activeDeductionCodes = [...allCodes];
  if (viewConfig.tax.activeDeductionCodes.length === 0)  viewConfig.tax.activeDeductionCodes = [...allCodes];
}, { immediate: true });

const visibleDeductionItems = computed(() =>
    deductionItems.value.filter(item => currentConfig.value.activeDeductionCodes.includes(item.itemCd))
);

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    items.value = res.data.data || [];
  } catch (err) {
    console.error('급여 항목 로드 실패', err);
  }
};

// ──────────────────────────────────────────────
// ★ 연차/퇴직금 합산(녹이기) 재계산 로직
// ──────────────────────────────────────────────
const meltOptions = reactive({
  annualLeave: false,
  severance: false
});

const recalculateInsurances = (row) => {
  // 둘 다 꺼져있으면 원본 복구 후 종료
  if (!meltOptions.annualLeave && !meltOptions.severance) {
    if (row.originalDeductions) {
      row.deductionItems = JSON.parse(JSON.stringify(row.originalDeductions));
    }
    return;
  }

  // 1. 기준 금액 산정 (기본급 + 체크된 항목만 합산)
  let baseAmount = Number(row.grossPay) || 0;
  if (meltOptions.annualLeave) baseAmount += Number(row.reserves.annualLeave) || 0;
  if (meltOptions.severance)   baseAmount += Number(row.reserves.severance)   || 0;

  const rates = insuranceRates.value;

  // 2. 4대보험 및 산재보험 재계산 (1원 단위 절사)
  visibleDeductionItems.value.forEach(item => {
    const code = item.itemCd;
    const name = item.itemNm;

    // ★ 핵심 방어 로직: 원본 공제액이 아예 0원이면(가입 제외자 등) 재계산하지 않고 0원 유지!
    const originalAmt = Number(row.originalDeductions?.[code]) || 0;
    if (originalAmt === 0) {
      row.deductionItems[code] = 0;
      return;
    }

    let amt = 0;

    if (name.includes('국민연금')) {
      amt = Math.floor((baseAmount * (rates.nationalPension / 100)) / 10) * 10;
    } else if (name.includes('건강보험')) {
      amt = Math.floor((baseAmount * (rates.healthInsurance / 100)) / 10) * 10;
    } else if (name.includes('장기요양')) {
      const healthAmt = Math.floor((baseAmount * (rates.healthInsurance / 100)) / 10) * 10;
      amt = Math.floor((healthAmt * (rates.longTermCare / 100)) / 10) * 10;
    } else if (name.includes('고용보험')) {
      amt = Math.floor((baseAmount * (rates.employmentInsurance / 100)) / 10) * 10;
    } else if (name.includes('산재보험')) {
      // 산재보험 요율(1.116%) 적용하여 계산 (10원 단위 절사)
      amt = Math.floor((baseAmount * (rates.industrialAccident / 100)) / 10) * 10;
    } else {
      // 소득세, 지방소득세 등 기타 항목은 원본 유지
      amt = originalAmt;
    }

    row.deductionItems[code] = amt;
  });
};

// 토글 옵션 중 하나라도 변하면 전체 행 재계산
watch(meltOptions, () => {
  formData.value.payrollData.forEach(row => {
    recalculateInsurances(row);
    calculateRow(row);
  });
}, { deep: true });

// 사용자가 급여칸에 직접 숫자를 쳤을 때
const onSalaryInput = (row) => {
  if (meltOptions.annualLeave || meltOptions.severance) {
    recalculateInsurances(row);
  }
  calculateRow(row);
};

// ──────────────────────────────────────────────
// 계산 로직
// ──────────────────────────────────────────────
const calculateRow = (row) => {
  let totalDeduct = 0;
  visibleDeductionItems.value.forEach(item => {
    totalDeduct += Number(row.deductionItems?.[item.itemCd]) || 0;
  });
  row.totalDeduct = totalDeduct;
  row.netPay = (Number(row.grossPay) || 0) - totalDeduct;

  // 사업주 고용안정(0.45%)도 개별 토글 옵션에 따라 기준금액 변경
  let totalGross = Number(row.grossPay) || 0;
  if (meltOptions.annualLeave) totalGross += Number(row.reserves?.annualLeave) || 0;
  if (meltOptions.severance)   totalGross += Number(row.reserves?.severance)   || 0;

  if (totalGross > 0) {
    row.reserves.empInsEmployer = Math.floor((totalGross * 0.0045) / 10) * 10;
  } else {
    row.reserves.empInsEmployer = 0;
  }
};

const applyContractReserves = (row) => {
  const finalize = () => { calculateRow(row); };
  if (!row.position || !contractStaffList.value.length || !contractDirectLabor.value.length) return finalize();

  const positionName = row.position.trim();
  const staffObj = contractStaffList.value.find(s => s.name === positionName);

  if (!staffObj) return finalize();
  const staffCode = staffObj.code;

  const annualObj = contractDirectLabor.value.find(d => d.label === '04003001' || String(d.label).includes('연차'));
  if (annualObj && annualObj.values && annualObj.values[staffCode] !== undefined) {
    row.reserves.annualLeave = Number(annualObj.values[staffCode]) || 0;
  }

  const severanceObj = contractDirectLabor.value.find(d => d.label === '04003003' || String(d.label).includes('퇴직'));
  if (severanceObj && severanceObj.values && severanceObj.values[staffCode] !== undefined) {
    row.reserves.severance = Number(severanceObj.values[staffCode]) || 0;
  }

  // ★ 이 부분을 추가해 주세요! (산재보험 금액 주입)
  const sanjaeObj = contractDirectLabor.value.find(d => d.label === '04003010' || String(d.label).includes('산재'));
  if (sanjaeObj && sanjaeObj.values && sanjaeObj.values[staffCode] !== undefined) {
    if (!row.deductionItems) row.deductionItems = {};
    row.deductionItems['04003010'] = Number(sanjaeObj.values[staffCode]) || 0;
  }

  finalize();
};

const getInsuranceTotal = (row) => {
  let total = 0;
  visibleDeductionItems.value.forEach(item => { total += Number(row.deductionItems?.[item.itemCd]) || 0; });
  total += Number(row.reserves?.empInsEmployer) || 0;
  return total;
};

watch(activeViewType, () => { formData.value.payrollData.forEach(row => calculateRow(row)); });
watch(() => currentConfig.value.activeDeductionCodes, () => { formData.value.payrollData.forEach(row => calculateRow(row)); }, { deep: true });

const payrollTotals = computed(() => {
  const totals = { grossPay: 0, totalDeduct: 0, netPay: 0, annualLeave: 0, severance: 0, empInsEmployer: 0, insuranceTotal: 0, deductionItems: {} };
  formData.value.payrollData.forEach(row => {
    totals.grossPay       += Number(row.grossPay)    || 0;
    totals.totalDeduct    += Number(row.totalDeduct) || 0;
    totals.netPay         += Number(row.netPay)      || 0;
    totals.annualLeave    += Number(row.reserves?.annualLeave) || 0;
    totals.severance      += Number(row.reserves?.severance)   || 0;
    totals.empInsEmployer += Number(row.reserves?.empInsEmployer) || 0;

    let rowInsTotal = Number(row.reserves?.empInsEmployer) || 0;
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

// 하단 합계용 colspan 동적 계산 (연차, 퇴직금 토글 고려)
const colspanForSummary = computed(() => {
  let cols = 6;
  if (currentConfig.value.showAnnualLeave) cols += 1;
  if (currentConfig.value.showSeverance) cols += 1;
  if (currentConfig.value.showGrossPay) cols += 1;
  cols += visibleDeductionItems.value.length;
  if (visibleDeductionItems.value.some(item => item.itemNm.includes('고용보험'))) cols += 1;
  return cols - 2;
});

// ──────────────────────────────────────────────
// formData & Load Data
// ──────────────────────────────────────────────
const formData = ref({
  sIdx: '', siteName: '', is_vat: 'N', type: '', target_month: '', docNo: '', billingDt: '', subTotal: 0, vatAmount: 0, grandTotal: 0,
  billingData: { summary: '', workerCount: 0, bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)', items: [], vatBreakdown: { under135: { area: '', unitPrice: '', supply: 0 }, over135: { area: '', unitPrice: '', supply: 0, vat: 0 } }, insuranceDiff: 0 },
  payrollData: [], viewConfig: null,
});

const initForm = () => {
  if (props.initialData && Object.keys(props.initialData).length > 0) {
    const data = JSON.parse(JSON.stringify(props.initialData));
    if (!data.payrollData) data.payrollData = [];
    if (!data.billingData) data.billingData = { items: [], bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)', insuranceDiff: 0 };
    if (!data.billingData.items) data.billingData.items = [];
    if (!data.billingData.vatBreakdown) data.billingData.vatBreakdown = { under135: { area: '', unitPrice: '', supply: 0 }, over135: { area: '', unitPrice: '', supply: 0, vat: 0 } };
    data.billingData.insuranceDiff = data.billingData.insuranceDiff || 0;

    data.payrollData.forEach(row => {
      if (!row.deductionItems) row.deductionItems = {};
      row.totalDeduct = row.totalDeduct || 0;
      if (!row.reserves) row.reserves = {};
      row.reserves.annualLeave = row.reserves.annualLeave || 0;
      row.reserves.severance = row.reserves.severance || 0;
      row.reserves.empInsEmployer = row.reserves.empInsEmployer || 0;
      row.originalDeductions = JSON.parse(JSON.stringify(row.deductionItems));
    });

    const selectedSite = siteOptions.value.find(s => s.idx === data.sIdx);
    data.is_vat = selectedSite ? selectedSite.is_vat : (data.vatAmount > 0 ? 'Y' : 'N');

    if (data.viewConfig) {
      viewConfig.site = { ...viewConfig.site, ...data.viewConfig.site };
      viewConfig.tax  = { ...viewConfig.tax, ...data.viewConfig.tax };
    }
    if (data.defaultTab) activeTab.value = data.defaultTab;
    formData.value = data;
    if (formData.value.sIdx && formData.value.type) fetchContractData();
  } else {
    formData.value = {
      sIdx: '', siteName: '', is_vat: 'N', type: '', target_month: '', docNo: '', billingDt: '', subTotal: 0, vatAmount: 0, grandTotal: 0,
      billingData: { summary: '', workerCount: 0, bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)', items: [{ period: '', category: '', detail: '', amount: 0, note: '' }], vatBreakdown: { under135: { area: '', unitPrice: '', supply: 0 }, over135: { area: '', unitPrice: '', supply: 0, vat: 0 } }, insuranceDiff: 0 },
      payrollData: [], viewConfig: null,
    };
  }
};

watch(() => props.initialData, initForm, { immediate: true });

// 드래그 앤 드롭
const dragIndex = ref(null);
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

// 현장 및 구분 변경
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
    } else {
      vb.under135.area = dbAreaUnder > 0 ? dbAreaUnder : dbAreaTotal; vb.over135.area = 0;
    }
    calculateAreaSupply();
  } else {
    formData.value.siteName = ''; formData.value.is_vat = 'N';
  }
  calculateBillingTotal();
  fetchContractData();
};

watch(() => formData.value.type, (newType) => { if (newType && formData.value.sIdx) fetchContractData(); });

// 청구공문 계산
const addBillingRow = () => { formData.value.billingData.items.push({ period: '', category: '', detail: '', amount: 0, note: '' }); };
const removeBillingRow = (index) => { formData.value.billingData.items.splice(index, 1); calculateBillingTotal(); };

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

// 급여 데이터 로드
const loadPayrollData = async () => {
  if (!formData.value.sIdx) { alert('현장을 먼저 선택해주세요.'); return; }
  if (formData.value.payrollData.length > 0 && !confirm('기존에 입력된 데이터가 모두 초기화됩니다. 정말 불러오시겠습니까?')) return;

  try {
    const targetDate = formData.value.target_month || formData.value.billingDt || '';
    const [year, month] = targetDate.split('-');

    await fetchTaxRates();
    if (contractStaffList.value.length === 0) await fetchContractData();

    const res = await axios.get('/api/v1/member/payroll/month', { params: { year, month } });

    // ★ 에러 방어 1: res.data.data가 null이나 undefined일 경우 빈 배열([])로 처리
    const rawData = res.data?.data || [];
    const result = rawData.filter(item => item.type == formData.value.type && item.sIdx == formData.value.sIdx);

    const safeParse = (val) => { if (!val) return {}; if (typeof val === 'object') return val; try { return JSON.parse(val); } catch { return {}; } };

    formData.value.payrollData = result.map(item => {
      const parsedDeductions = safeParse(item.deductionItems);
      const parsedPayItems   = safeParse(item.payItems);
      let totalDeduct = 0;
      visibleDeductionItems.value.forEach(dItem => { totalDeduct += Number(parsedDeductions[dItem.itemCd]) || 0; });

      const rowObj = {
        idx:        item.idx, empName: item.staff, position: item.role || '', personalNo: item.birthDt,
        inDate:     item.inDate, outDate: item.outDate ?? '', grossPay: Number(item.grossPay) || 0,
        payItems:   parsedPayItems, deductionItems: parsedDeductions,
        originalDeductions: {}, // ★ 여기서는 일단 빈 객체로 둡니다! (중요)
        totalDeduct, reserves: { annualLeave: 0, severance: 0, empInsEmployer: 0 }, netPay: (Number(item.grossPay) || 0) - totalDeduct,
      };

      // 1. 계약서의 연차, 퇴직금, 산재보험을 rowObj에 매핑합니다.
      applyContractReserves(rowObj);

      // 2. ★ 산재보험이 매핑된 직후의 값을 원본(originalDeductions)으로 복사합니다.
      rowObj.originalDeductions = JSON.parse(JSON.stringify(rowObj.deductionItems));

      // 3. 토글 옵션 적용에 따른 재계산 로직 실행
      if (meltOptions.annualLeave || meltOptions.severance) {
        recalculateInsurances(rowObj);
      }

      return rowObj;
    });

    if (formData.value.payrollData.length === 0) alert('조건에 맞는 직원 데이터가 없습니다.');
    else alert('직원 급여 데이터를 성공적으로 불러왔습니다.');

  } catch (error) {
    // F12 콘솔창에 찍힌 진짜 에러를 확인하기 위한 로그
    console.error('데이터 로드 에러 원인:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  }
};

const addPayrollRow = () => {
  formData.value.payrollData.push({
    empName: '', position: '', personalNo: '', inDate: '', outDate: '', grossPay: 0, deductionItems: {}, originalDeductions: {}, totalDeduct: 0,
    reserves: { annualLeave: 0, severance: 0, empInsEmployer: 0 }, netPay: 0,
  });
};

const removePayrollRow = (index) => { if (confirm('이 직원의 데이터를 삭제하시겠습니까?')) formData.value.payrollData.splice(index, 1); };

const formatCurrency = (val) => Number(val || 0).toLocaleString();

// 엑셀 내보내기
const exportToExcel = () => {
  const wb         = XLSX.utils.book_new();
  const siteName   = formData.value.siteName   || '현장미지정';
  const targetMonth= formData.value.target_month || formData.value.billingDt || '';
  const viewLabel  = VIEW_TYPES[activeViewType.value].label;
  const fileName   = `정산서_${siteName}_${targetMonth}_${viewLabel}.xlsx`;

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
    const cfg = currentConfig.value;
    const payrollRows = [];

    const header1 = ['NO', '이름', '직책', '생년월일', '입사일', '퇴사일'];
    if (cfg.showAnnualLeave) header1.push('연차수당');
    if (cfg.showSeverance) header1.push('퇴직충당금');
    if (cfg.showGrossPay) header1.push('급여');

    visibleDeductionItems.value.forEach(item => {
      if (item.itemNm.includes('고용보험')) { header1.push('실업급여(0.9%)'); header1.push('고용안정(0.45%)'); }
      else { header1.push(item.itemNm); }
    });
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
    totalRow.push(payrollTotals.value.insuranceTotal);
    payrollRows.push(totalRow);
    payrollRows.push([]);

    totalSummary.value.forEach(summary => {
      const row = Array(header1.length).fill('');
      row[row.length - 3] = summary.label;
      row[row.length - 1] = summary.label.includes('차감') && summary.value > 0 ? -summary.value : summary.value;
      payrollRows.push(row);
    });

    const ws2 = XLSX.utils.aoa_to_sheet(payrollRows);
    const colWidths = [{ wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    if (cfg.showAnnualLeave) colWidths.push({ wch: 12 });
    if (cfg.showSeverance) colWidths.push({ wch: 12 });
    if (cfg.showGrossPay) colWidths.push({ wch: 14 });

    visibleDeductionItems.value.forEach(item => {
      if (item.itemNm.includes('고용보험')) colWidths.push({ wch: 15 }, { wch: 15 });
      else colWidths.push({ wch: 12 });
    });
    colWidths.push({ wch: 14 });
    ws2['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws2, `급여내역서_${viewLabel}`);
  }
  XLSX.writeFile(wb, fileName);
};

const closeModal  = () => emit('close');

const handleSave = async () => {
  try {
    const sIdx = formData.value.sIdx;
    if (!sIdx) { alert('현장을 선택해주세요.'); return; }
    const [year, month] = (formData.value.target_month || formData.value.billingDt).split('-');

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
      viewConfig:  JSON.parse(JSON.stringify(viewConfig)),
      cIdx:        authStore.user?.cIdx || 0,
    };

    const response = await axios.post(`/api/v1/settle/site/data/${sIdx}`, payload);
    if (response.data.result) { alert('성공적으로 저장되었습니다.'); emit('save'); }
    else { alert(`저장 실패: ${response.data.msg}`); }
  } catch (error) { console.error('정산서 저장 중 오류 발생:', error); alert('서버 통신 중 오류가 발생했습니다.'); }
};

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

        <transition name="slide-fade">
          <div v-if="activeTab === 'details'" class="view-type-switcher">
            <span class="switcher-label">출력 형식</span>
            <button
                v-for="(meta, key) in VIEW_TYPES" :key="key"
                :class="['view-type-btn', { active: activeViewType === key }]"
                :style="activeViewType === key ? `--vt-color:${meta.color}` : ''"
                @click="activeViewType = key"
            >
              <i :class="['mdi', meta.icon]"></i> {{ meta.label }}
            </button>
          </div>
        </transition>
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
                  <td><input type="number" v-model="item.amount" @input="calculateBillingTotal" class="cell-input text-right font-bold text-blue" /></td>
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
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.under135.area"      @input="calculateAreaSupply" class="cell-input text-right" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.under135.unitPrice" @input="calculateAreaSupply" class="cell-input text-right" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.under135.supply"    @input="calculateBillingTotal" class="cell-input text-right font-bold text-blue" /></td>
                    <td class="text-right bg-gray-50 text-gray-400">0</td>
                    <td class="text-right font-bold text-blue bg-blue-light">{{ formatCurrency(formData.billingData.vatBreakdown.under135.supply) }}</td>
                  </tr>
                  <tr>
                    <td class="text-center font-bold bg-gray-50">135㎡ 초과 (과세)</td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.area"      @input="calculateAreaSupply" class="cell-input text-right" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.unitPrice" @input="calculateAreaSupply" class="cell-input text-right" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.supply"    @input="handleManualBreakdownUpdate" class="cell-input text-right font-bold text-blue" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.vat"       @input="handleManualBreakdownUpdate" class="cell-input text-right font-bold text-red" /></td>
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
            <h4>
              <i class="mdi mdi-table-account"></i> 직원별 정산 내역
              <span class="view-indicator" :style="`--vi-color:${VIEW_TYPES[activeViewType].color}`">
                <i :class="['mdi', VIEW_TYPES[activeViewType].icon]"></i> {{ VIEW_TYPES[activeViewType].label }}
              </span>
            </h4>

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
            <label v-for="item in deductionItems" :key="item.itemCd" class="toggle-checkbox">
              <input type="checkbox" :value="item.itemCd" v-model="currentConfig.activeDeductionCodes" /> <span>{{ item.itemNm }}</span>
            </label>
          </div>

          <div class="excel-table-wrapper">
            <table class="excel-table">
              <thead>
              <tr>
                <th rowspan="2" style="min-width:50px;">NO</th>
                <th rowspan="2" style="min-width:70px;">이름</th>
                <th rowspan="2" style="min-width:70px;">직책</th>
                <th rowspan="2" style="min-width:70px;">생년월일</th>
                <th rowspan="2" style="min-width:70px;">입사일</th>
                <th rowspan="2" style="min-width:70px;">퇴사일</th>

                <th v-if="currentConfig.showAnnualLeave" rowspan="2" class="bg-yellow-light" style="min-width:80px;">연차수당</th>
                <th v-if="currentConfig.showSeverance" rowspan="2" class="bg-yellow-light" style="min-width:80px;">퇴직충당금</th>

                <th v-if="currentConfig.showGrossPay" rowspan="2" class="bg-blue-light" style="min-width:100px;">급여</th>

                <template v-for="item in visibleDeductionItems" :key="'th1-'+item.itemCd">
                  <th v-if="item.itemNm.includes('고용보험')" colspan="2" class="bg-red-light" style="min-width:150px;">고용보험({{ insuranceRates.employmentInsurance }}%)</th>
                  <th v-else rowspan="2" class="bg-red-light" style="min-width:90px;">{{ item.itemNm }}</th>
                </template>

                <th rowspan="2" class="bg-red-light" style="min-width:80px;">총계</th>
                <th rowspan="2" style="min-width:20px;">관리</th>
              </tr>

              <tr>
                <template v-for="item in visibleDeductionItems" :key="'th2-'+item.itemCd">
                  <template v-if="item.itemNm.includes('고용보험')">
                    <th class="bg-red-light" style="min-width:80px; font-size:11px;">실업급여<br>{{ insuranceRates.employmentInsurance }}%</th>
                    <th class="bg-red-light" style="min-width:80px; font-size:11px;">고용안정 등<br>0.45%</th>
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

                <td v-if="currentConfig.showAnnualLeave"><input type="number" v-model="row.reserves.annualLeave" @input="onSalaryInput(row)" class="cell-input text-right" /></td>
                <td v-if="currentConfig.showSeverance"><input type="number" v-model="row.reserves.severance"   @input="onSalaryInput(row)" class="cell-input text-right" /></td>

                <td v-if="currentConfig.showGrossPay">
                  <input type="number" v-model="row.grossPay" @input="onSalaryInput(row)" class="cell-input text-right font-bold text-blue" />
                </td>

                <template v-for="item in visibleDeductionItems" :key="'td-'+item.itemCd">
                  <template v-if="item.itemNm.includes('고용보험')">
                    <td><input type="number" v-model="row.deductionItems[item.itemCd]" @input="calculateRow(row)" class="cell-input text-right" /></td>
                    <td><input type="number" v-model="row.reserves.empInsEmployer" @input="calculateRow(row)" class="cell-input text-right" /></td>
                  </template>
                  <td v-else>
                    <input type="number" v-model="row.deductionItems[item.itemCd]" @input="calculateRow(row)" class="cell-input text-right" />
                  </td>
                </template>

                <td class="text-right font-bold bg-gray-50">{{ formatCurrency(getInsuranceTotal(row)) }}</td>
                <td class="text-center"><button class="btn-delete-row" @click="removePayrollRow(index)"><i class="mdi mdi-trash-can-outline"></i></button></td>
              </tr>
              <tr v-if="formData.payrollData.length === 0">
                <td :colspan="9 + visibleDeductionItems.length" class="empty-row">등록된 데이터가 없습니다.</td>
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

                <td class="text-right text-red bg-red-light">{{ formatCurrency(payrollTotals.insuranceTotal) }}</td>
                <td></td>
              </tr>

              <tr v-for="(summary, sIdx) in totalSummary" :key="'summary-'+sIdx">
                <td :colspan="colspanForSummary" style="border: none; background: transparent;"></td>
                <td colspan="2" class="text-center bg-gray-50 font-bold" style="font-size: 13px;">{{ summary.label }}</td>
                <td colspan="2" class="text-right font-bold" :class="summary.label === '총 청구액' ? 'text-blue bg-blue-light' : 'bg-white'" style="padding: 0; border: 1px solid var(--border-color);">
                  <template v-if="summary.label.includes('4대보험차액')">
                    <input type="number" v-model="formData.billingData.insuranceDiff" class="cell-input text-right font-bold text-red" style="width: 100%; height: 100%; padding: 6px; box-sizing: border-box; border-radius: 0;" />
                  </template>
                  <template v-else>
                    <div style="padding: 6px;" :class="{'text-red': summary.label.includes('차감')}">
                      <span v-if="summary.label.includes('차감') && summary.value > 0">- </span>{{ formatCurrency(summary.value) }}
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
/* 모달 레이아웃 (이전과 동일) */
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
.modal-tabs { display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); flex-shrink: 0; }
.tab-btn { padding: 14px 18px; background: none; border: none; border-bottom: 3px solid transparent; font-size: 14px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; margin-bottom: -1px; white-space: nowrap; }
.tab-btn:hover  { color: var(--text-main); }
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
.view-type-switcher { display: flex; align-items: center; gap: 6px; margin-left: auto; padding-left: 12px; }
.switcher-label { font-size: 11px; font-weight: 600; color: var(--text-muted); white-space: nowrap; margin-right: 2px; }
.view-type-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border-color); background: var(--bg-canvas); color: var(--text-sub); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .2s; white-space: nowrap; }
.view-type-btn:hover { border-color: var(--border-focus); background: var(--bg-hover); }
.view-type-btn.active { background: color-mix(in srgb, var(--vt-color, var(--primary)) 12%, transparent); border-color: var(--vt-color, var(--primary)); color: var(--vt-color, var(--primary)); }
.view-indicator { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; margin-left: 8px; padding: 3px 9px; border-radius: 20px; background: color-mix(in srgb, var(--vi-color, var(--primary)) 12%, transparent); color: var(--vi-color, var(--primary)); border: 1px solid color-mix(in srgb, var(--vi-color, var(--primary)) 30%, transparent); }
.slide-fade-enter-active { transition: all .2s ease; }
.slide-fade-leave-active { transition: all .15s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { opacity: 0; transform: translateX(8px); }
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
.excel-table thead th { background: var(--bg-hover); font-weight: 600; text-align: center; color: var(--text-main); padding: 10px 8px; white-space: nowrap; line-height: 1.3; }
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
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mt-5 { margin-top: 30px; }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
@media (max-width: 1024px) { .modal-overlay { padding: 10px; } .modal-container { height: 95vh; } .document-paper { padding: 24px 20px; } .excel-table { table-layout: auto; } }
@media (max-width: 768px) { .modal-overlay { padding: 0; align-items: flex-end; } .modal-container { height: 96vh; border-radius: 16px 16px 0 0; max-width: 100%; } .modal-header { padding: 12px 16px; } .header-title h2 { font-size: 15px; } .badge { display: none; } .modal-tabs { padding: 0 8px; } .tab-btn { padding: 12px 12px; font-size: 13px; } .tab-text { display: none; } .switcher-label { display: none; } .modal-body { padding: 12px; } .document-paper { padding: 16px 14px; } .doc-header h1 { font-size: 18px; letter-spacing: 4px; margin-bottom: 20px; } .form-grid { grid-template-columns: 1fr; gap: 12px; } .btn-text { display: none; } .action-btns { gap: 6px; } .btn-add-row, .btn-load-data { padding: 7px 10px; } .excel-table { font-size: 12px; } .excel-table thead th { padding: 8px 6px; font-size: 11px; } .excel-table td { padding: 4px; } .cell-input { font-size: 12px; padding: 3px; } .deduction-toggles { gap: 8px; padding: 10px; } }
@media (max-width: 480px) { .header-title h2 { font-size: 14px; } .modal-body { padding: 8px; } .document-paper { padding: 12px 10px; } .doc-header h1 { font-size: 16px; letter-spacing: 3px; } .tab-btn { padding: 10px 10px; } }

/* 연차/퇴직금 개별 녹이기 토글 디자인 */
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
</style>
