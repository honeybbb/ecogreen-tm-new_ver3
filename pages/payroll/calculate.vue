<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";
import Pagination from "~/components/common/Pagination.vue";
import ExportProgressModal from "~/components/common/ExportProgressModal.vue";
import { useTableResize } from '~/composables/useTableResize.js';
import { useListTable } from '~/composables/useListTable.js';
import { usePayrollColumns } from '~/composables/usePayrollColumns.js';
import { usePayrollExcel } from '~/composables/usePayrollExcel.js';
import { usePayslipPDF } from '~/composables/usePayslipPDF.js';
import { calculateAge } from "~/utils/formatter.js";
import { formatCurrency } from "../../utils/formatter.js";
import { useRoute, useRouter } from "#vue-router";

const {
  siteOptions,
  typeOptions,
  fetchSiteOptions,
  fetchTypeOptions
} = useApi();

// 1. 상태 관리
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const selectedYearMonth = ref(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
const searchTerm = ref('');
const selectedSite = ref(route.query.site || '전체');
const selectedType = ref('전체');
const selectedStatus = ref('전체');
const selectedBilling = ref('전체');
const selectedPaymentDay = ref('');
const selectedPayHistory = ref('');

// ── 빠른 필터 (저장 상태) ──────────────────────────
const filterSaveNone  = ref(false); // 계산/저장 전 (status: 0)
const filterSaveDraft = ref(false); // 저장 대기 (status: 2)
const filterSaveDone  = ref(false); // 저장 완료 (status: 1)

const items = ref([]);
const payrollList = ref([]);
const isLoading = ref(false);
const dataMode = ref('');
const billingManager = ref([]);

const targetCodes  = ref({ pension: '', health: '', longTerm: '', employment: '' });
const isTaxRateLoaded = ref(false);
const ageLimits    = ref({ pension: 0, employment: 0 });
const paymentDayOptions = computed(() => {
  const days = [];
  for (let i = 1; i <= 31; i++) {
    days.push(String(i));
  }
  return days;
});

// 2. 동적 컬럼
const payItems       = computed(() => items.value.filter(i => i.groupNm === '지급항목'));
const deductionItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));

// 컬럼 가시성 / sticky 위치
const {
  staticCols,
  hiddenDynamicCols,
  visiblePayItems,
  visibleDeductionItems,
  getStickyStyle,
  getSummaryGroupStyle,
  getSummaryGroupColspan,
  getFooterColspan,
  getFooterTotalWidth,
  loadColumnSettings,
} = usePayrollColumns({
  payItemsRef: payItems,
  deductionItemsRef: deductionItems,
  getUserId: () => authStore.user?.id || authStore.user?.userId || authStore.user?.cIdx || authStore.user?.adminId,
});

// 정렬 / 페이지네이션 (filteredPayrollList는 아래에서 선언, 지연 getter)
const {
  sortKey, sortOrder, currentPage, pageSize, pageSizeOptions,
  toggleSort, pagedItems: pagedPayrollList, handlePageChange,
} = useListTable(() => filteredPayrollList.value);

watch([
  selectedSite,
  selectedType,
  searchTerm,
  selectedYearMonth,
  selectedPayHistory], () => {
  currentPage.value = 1;
});

// 3. 필터링 및 정렬
const filteredPayrollList = computed(() => {
  const isQuickFilterActive = filterSaveNone.value || filterSaveDraft.value || filterSaveDone.value;

  const filtered = payrollList.value.filter(p => {
    const siteMatch = selectedSite.value === '전체' || p.sIdx == selectedSite.value;
    const typeMatch = selectedType.value === '전체' || p.type === selectedType.value;
    const statusMatch = selectedStatus.value === '전체' || p.mStatus == selectedStatus.value;
    const historyMatch = selectedPayHistory.value === '' || (() => {
      const [y, m, d] = selectedPayHistory.value.split('-');
      return String(p.year) === y
          && String(p.month) === String(Number(m))
          && String(p.payment_day) === String(Number(d));
    })();
    const billingMatch = selectedBilling.value === '전체' || p.billingManager === selectedBilling.value;
    const searchMatch = p.staff.toLowerCase().includes(searchTerm.value.toLowerCase());

    let saveStatusMatch = true;
    if (isQuickFilterActive) {
      if (p.status === 0 && filterSaveNone.value) saveStatusMatch = true;
      else if (p.status === 2 && filterSaveDraft.value) saveStatusMatch = true;
      else if (p.status === 1 && filterSaveDone.value) saveStatusMatch = true;
      else saveStatusMatch = false;
    }

    return siteMatch && typeMatch && statusMatch && historyMatch && billingMatch && searchMatch && saveStatusMatch;
  });

  filtered.sort((a, b) => {
    if (sortKey.value) {
      const mod = sortOrder.value === 'asc' ? 1 : -1;
      const valA = a[sortKey.value] ?? '';
      const valB = b[sortKey.value] ?? '';

      if (sortKey.value === 'birthDt') {
        return valB.localeCompare(valA) * mod;
      }
      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB, 'ko');
        if (cmp !== 0) return cmp * mod;
      } else {
        if (valA < valB) return -1 * mod;
        if (valA > valB) return 1 * mod;
      }
      return 0;
    }

    if (a.sIdx !== b.sIdx) return Number(b.sIdx) - Number(a.sIdx);
    return Number(a.idx) - Number(b.idx);
  });

  return filtered;
});

// ── 컬럼 리사이즈 ─────────────────────────────────
const { startResize } = useTableResize();

const markAsDraft = (row) => {
  row.status = 2;
  row.selected = true;
};

// 수동 입력 시 마이너스(-) 및 정규식 처리
const onInputAmount = (row, item, group, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  let currentValue = el.value.trim();

  const isNegative = currentValue.startsWith('-');
  const isJustMinus = currentValue === '-';
  const isMinusZero = currentValue === '-0';

  const rawValue = currentValue.replace(/[^\d]/g, '');
  const numValue = Number(rawValue) || 0;
  const finalNumValue = isNegative ? -numValue : numValue;

  if (group === 'pay') {
    row.payItems[item.itemCd] = finalNumValue;
    if (row._originalPayItems) row._originalPayItems[item.itemCd] = finalNumValue;
    if (item.itemCd === '04001001001') {
      row.originalBasePay = finalNumValue;
    }
  } else {
    row.deductionItems[item.itemCd] = finalNumValue;
    if (row._originalDeductionItems) row._originalDeductionItems[item.itemCd] = finalNumValue;
  }

  let formatted;
  if (isJustMinus) formatted = '-';
  else if (isMinusZero) formatted = '-0';
  else formatted = formatCurrency(finalNumValue);

  el.value = formatted;
  const newLength = formatted.length;
  const nextPos = selectionStart + (newLength - oldLength);
  el.setSelectionRange(nextPos, nextPos);

  markAsDraft(row);
  if (group === 'pay') {
    calculateInsurances(row);
  }
};

const selectAll = computed({
  get: () => pagedPayrollList.value.length > 0 && pagedPayrollList.value.every(p => p.selected),
  set: (val) => { pagedPayrollList.value.forEach(p => p.selected = val); }
});

const statsInfo = computed(() => {
  const total = filteredPayrollList.value.length;
  let gross = 0, ded = 0;
  let pay = {};
  let deduct = {};

  filteredPayrollList.value.forEach(p => {
    const c = calculateRowSummary(p);
    gross += c.gross;
    ded += c.ded;

    if (p.payItems) {
      payItems.value.forEach(i => {
        pay[i.itemCd] = (pay[i.itemCd] || 0) + (Number(p.payItems[i.itemCd]) || 0);
      });
    }

    if (p.deductionItems) {
      deductionItems.value.forEach(i => {
        deduct[i.itemCd] = (deduct[i.itemCd] || 0) + (Number(p.deductionItems[i.itemCd]) || 0);
      });
    }
  });

  return { total, gross, ded, net: gross - ded, pay, deduct };
});

const rowSummaryMap = computed(() => {
  const map = new Map();
  pagedPayrollList.value.forEach(p => {
    map.set(p.idx, calculateRowSummary(p));
  });
  return map;
});

const calculateRowSummary = (row) => {
  let gross = 0, ded = 0;
  if (row.payItems)       payItems.value.forEach(i => { gross += Number(row.payItems[i.itemCd] || 0); });
  if (row.deductionItems) deductionItems.value.forEach(i => { ded += Number(row.deductionItems[i.itemCd] || 0); });
  return { gross, ded, net: gross - ded };
};

const deleteCalculatedPay = async () => {
  const selectedRows = payrollList.value.filter(p => p.selected);
  const [year, month] = selectedYearMonth.value.split('-');

  if (selectedRows.length === 0) {
    alert('삭제할 급여 데이터를 체크해주세요.');
    return;
  }

  if (!await window.customConfirm('선택한 직원의 급여 계산 내역을 삭제하시겠습니까?')) {
    return;
  }

  try {
    await axios.delete(`/api/v1/member/payroll/calculate`, {
      data: {
        idxList: selectedRows.map(r => r.idx),
        year:    year,
        month:   month,
      }
    });
    alert('삭제되었습니다.');
    await getPayrollMonth();
  } catch (err) {
    console.error('삭제 실패:', err);
    alert('삭제에 실패했습니다.');
  }
}

const resetCalculatedPay = async () => {
  const selectedRows = payrollList.value.filter(p => p.selected);

  if (selectedRows.length === 0) {
    alert('초기화할 직원을 체크해주세요.');
    return;
  }

  if (!await window.customConfirm('선택한 직원의 급여 계산 내역을 초기화하시겠습니까?\n(저장하지 않은 내역은 모두 0원으로 되돌아갑니다.)')) {
    return;
  }

  selectedRows.forEach(row => {
    row.status = 0;
    row.workedDays = 0;
    row.absentDays = 0;
    row.originalBasePay = undefined;

    if (row._originalPayItems) delete row._originalPayItems;
    if (row._originalDeductionItems) delete row._originalDeductionItems;

    payItems.value.forEach(item => { row.payItems[item.itemCd] = 0; });
    deductionItems.value.forEach(item => { row.deductionItems[item.itemCd] = 0; });

    row.selected = false;
  });
};

const fetchCalculatedPay = async () => {
  const selectedRows = payrollList.value.filter(p => p.selected);
  if (selectedRows.length === 0) { alert('급여를 계산할 직원을 체크해주세요.'); return; }
  if (!selectedYearMonth.value)  { alert('급여 연월을 선택해주세요.'); return; }
  if (selectedPaymentDay.value == '') { alert('지급일을 선택해주세요.'); return; }
  if (!isTaxRateLoaded.value) { alert('세율 정보가 로드되지 않아 급여 계산이 불가합니다.'); return; }
  if (items.value.length === 0) await getWageCode();
  isLoading.value = true;

  try {
    const [year, month] = selectedYearMonth.value.split('-');
    const sIdx = (selectedSite.value !== '전체') ? selectedSite.value: '';

    const res = await axios.get('/api/v1/member/payroll/calculate', { params: { year, month, sIdx } });
    if (res.data.result && res.data.data?.length > 0) {
      for (const row of selectedRows) {
        const calcData = res.data.data.find(c => c.idx === row.idx)
        if (!calcData) continue

        if (row._originalPayItems) delete row._originalPayItems;
        if (row._originalDeductionItems) delete row._originalDeductionItems;
        row.originalBasePay = undefined;

        let dbCheckedItems = {}
        if (calcData.checkedItems) {
          dbCheckedItems = typeof calcData.checkedItems === 'string'
              ? JSON.parse(calcData.checkedItems) : calcData.checkedItems
        }

        row.payItems = typeof calcData.payItems === 'string'
            ? JSON.parse(calcData.payItems || '{}') : (calcData.payItems || {})

        row.deductionItems = typeof calcData.deductionItems === 'string'
            ? JSON.parse(calcData.deductionItems || '{}') : (calcData.deductionItems || {})

        row.deductionFlags = typeof calcData.checkedItems === 'string'
            ? JSON.parse(calcData.checkedItems || '{}') : (calcData.checkedItems || {})

        row.workedDays      = calcData.workedDays
        row.scheduledDays   = calcData.scheduledDays
        row.absentDays      = calcData.absentDays

        deductionItems.value.forEach(i => {
          row.deductionFlags[i.itemCd] = dbCheckedItems[i.itemCd] !== false
        })

        row.status = 2
        await updatePayAsync(row)
      }
      dataMode.value = 'draft';
    }
  } finally { isLoading.value = false; }
};

const backupOriginalPayItems = (row) => {
  if (!row._originalPayItems) row._originalPayItems = { ...row.payItems }
}
const backupOriginalDeductionItems = (row) => {
  if (!row._originalDeductionItems) row._originalDeductionItems = { ...row.deductionItems }
}

const CALC_DEDUCTION_CODES = [
  '04002001001', '04002001002', '04002001003', '04002001004',
  '04002002004', '04002002003', '04002002006'
]

const updatePayAsync = async (row) => {
  backupOriginalPayItems(row)
  backupOriginalDeductionItems(row)

  const scheduled = Number(row.scheduledDays) || 1
  const worked    = Number(row.workedDays)    || 0
  const absent    = Number(row.absentDays)    || 0

  const prorate = (originalAmt) => {
    const dailyAmt = Math.floor(originalAmt / scheduled)
    return (worked + absent) < scheduled
        ? dailyAmt * worked
        : originalAmt - (dailyAmt * absent)
  }

  if (worked === 0) {
    payItems.value.forEach(item => { row.payItems[item.itemCd] = 0 })
    deductionItems.value.forEach(item => {
      if (!CALC_DEDUCTION_CODES.includes(item.itemCd)) row.deductionItems[item.itemCd] = 0
    })
  } else {
    payItems.value.forEach(item => {
      row.payItems[item.itemCd] = prorate(row._originalPayItems[item.itemCd] || 0)
    })
    deductionItems.value.forEach(item => {
      if (!CALC_DEDUCTION_CODES.includes(item.itemCd)) {
        row.deductionItems[item.itemCd] = prorate(row._originalDeductionItems[item.itemCd] || 0)
      }
    })
  }
  await calculateInsurances(row)
}

const fetchOverAgeOption = async () => {
  try {
    const res   = await axios.get(`/api/v1/code/group/02003`);
    const codes = res.data.data || [];
    const pensionCode = codes.find(c => c.itemNm.includes('국민연금'));
    const employCode  = codes.find(c => c.itemNm.includes('고용보험'));
    if (pensionCode?.option) ageLimits.value.pension    = Number(pensionCode.option);
    if (employCode?.option)  ageLimits.value.employment = Number(employCode.option);
  } catch (e) {
    console.error('연령 기준 코드를 불러오지 못해 기본값을 적용합니다.', e);
  }
};

const isOtherInsuranceMonth = (row) => {
  if (!row.inDate) return false;
  const [inYearStr, inMonthStr, inDayStr] = String(row.inDate).split('-');
  let firstYear   = Number(inYearStr);
  let targetMonth = Number(inMonthStr);
  const inDay     = Number(inDayStr);

  if (inDay > 1) {
    targetMonth += 1;
    if (targetMonth > 12) { targetMonth = 1; firstYear += 1; }
  }
  const [selYear, selMonth] = selectedYearMonth.value.split('-').map(Number);
  return selMonth === targetMonth && selYear >= firstYear;
};

const getOtherInsuranceAmount = (row) => {
  if (row.type === '01001001') return 19500;
  if (row.type === '01001002') return 14000;
  return 0;
};

const isInsuranceWaivedMonth = (row) => {
  if (!row.inDate) return false;
  const [inYearStr, inMonthStr, inDayStr] = String(row.inDate).split('-');
  const firstYear  = Number(inYearStr);
  const firstMonth = Number(inMonthStr);
  const inDay      = Number(inDayStr);
  const [selYear, selMonth] = selectedYearMonth.value.split('-').map(Number);

  if (firstYear === selYear && firstMonth === selMonth && inDay > 1) return true;
  return false;
};

const calculateInsurances = async (row) => {
  let taxablePay = 0
  let originalTaxablePay = 0

  payItems.value.forEach(item => {
    const amt   = Number(row.payItems[item.itemCd] || 0)
    const limit = item.tax_free || 0
    const taxed = limit > 0 ? Math.max(0, amt - limit) : amt
    taxablePay += taxed

    const originalAmt = Number(row._originalPayItems[item.itemCd] || 0)
    const originalTaxed = limit > 0 ? Math.max(0, originalAmt - limit) : originalAmt
    originalTaxablePay += originalTaxed
  })

  if (!row.deductionItems) row.deductionItems = {};
  const rates = targetCodes.value;
  let incomeTax = 0, localTax = 0;

  if (row.deductionFlags['04002002004'] !== false) {
    try {
      const year = new Date().getFullYear();
      const taxRes = await axios.get(`/api/v1/config/tax/income/${year}`, {
        params: { salary: taxablePay, familyCnt: row.familyCnt || 1, year }
      });
      incomeTax = taxRes.data?.incomeTax || 0;
      localTax  = taxRes.data?.localTax  || 0;
    } catch (e) { console.error('소득세 조회 실패', e); }
  }

  const isWaived = isInsuranceWaivedMonth(row);
  let healthAmt = 0;

  if (row.deductionFlags['04002001001'] !== false) {
    if (isWaived) healthAmt = 0;
    else healthAmt = Math.floor((originalTaxablePay * (rates.health / 100)) / 10) * 10;
    row.deductionItems['04002001001'] = healthAmt;
  } else {
    row.deductionItems['04002001001'] = 0;
  }

  const calc = {
    '04002001002': () => isWaived ? 0 : Math.floor((healthAmt * (rates.longTerm / 100)) / 10) * 10,
    '04002001003': () => isWaived ? 0 : Math.floor((originalTaxablePay * (rates.pension / 100)) / 10) * 10,
    '04002001004': () => Math.floor((taxablePay * (rates.employment / 100)) / 10) * 10,
    '04002002004': () => incomeTax,
    '04002002003': () => localTax,
    '04002002006': () => isOtherInsuranceMonth(row) ? getOtherInsuranceAmount(row) : 0,
  };

  deductionItems.value.forEach(i => {
    if (i.itemCd === '04002001001') return;
    if (i.itemCd === '04002002006') { row.deductionItems[i.itemCd] = isOtherInsuranceMonth(row) ? getOtherInsuranceAmount(row) : 0; return; }
    if (row.deductionFlags[i.itemCd] === false) { row.deductionItems[i.itemCd] = 0; return; }
    const fn = calc[i.itemCd];
    if (fn) row.deductionItems[i.itemCd] = fn();
  });
};

const savePayroll = async () => {
  const selectedRows = payrollList.value.filter(p => p.selected);
  if (selectedRows.length === 0) { alert('저장할 직원을 체크해주세요.'); return; }
  if (!selectedPaymentDay.value) { alert('적용할 실제 급여 지급일을 선택해주세요.'); return; }
  if (!isTaxRateLoaded.value) { alert('세율 정보가 로드되지 않아 저장이 불가합니다.'); return; }

  if (!await window.customConfirm(`체크된 ${selectedRows.length}명의 정산 결과를 저장하시겠습니까?`)) return;
  try {
    const [saveYear, saveMonth] = selectedYearMonth.value.split('-');
    await Promise.all(selectedRows.map(row => {
      const c = calculateRowSummary(row);
      return axios.post(`/api/v1/member/payroll/month/${row.idx}`, {
        mIdx: row.idx, sIdx: row.sIdx, year: saveYear, month: saveMonth, payDt: selectedPaymentDay.value,
        grossPay: c.gross, deductions: c.ded, netPay: c.net,
        workedDays: row.workedDays, scheduledDays: row.scheduledDays,
        payItems: JSON.stringify(row.payItems || {}),
        deductionItems: JSON.stringify(row.deductionItems || {}),
        checkedItems: JSON.stringify(row.deductionFlags || {}),
        total: c.gross - c.ded
      });
    }));
    alert('선택한 직원의 정산 결과가 성공적으로 저장되었습니다.');
    dataMode.value = 'saved';
    await getPayrollMonth();
  } catch (e) { alert('저장 실패'); }
};

// ── Excel / PDF 출력 (추출된 composable) ──────────────────────────
const {
  exportPayrollExcel: _exportPayrollExcelFn,
  exportPayrollExcelBySite: _exportPayrollExcelBySiteFn,
  isExportModalOpen,
  isExportCancelled,
  exportTotal,
  exportProgress,
  currentExportSiteName,
  cancelSiteExport,
  REG_PAY_SLOTS,
  REG_DED_SLOTS,
} = usePayrollExcel({
  payItemsRef: payItems,
  deductionItemsRef: deductionItems,
  calculateRowSummary,
});

const {
  depRows,
  spaceOut,
  isPayslipModalOpen,
  payslipTotal,
  payslipProgress,
  currentPayslipSiteName,
  payslipRender,
  isPayslipCancelled,
  cancelPayslipExport,
  exportPayslipPDF: _exportPayslipPDFFn,
} = usePayslipPDF({
  payItemsRef: payItems,
  deductionItemsRef: deductionItems,
  calculateRowSummary,
  REG_PAY_SLOTS,
  REG_DED_SLOTS,
});

const exportPayrollExcel = () => {
  const [year, month] = selectedYearMonth.value.split('-');
  const rows = filteredPayrollList.value.length > 0 ? filteredPayrollList.value : payrollList.value;
  return _exportPayrollExcelFn({ rows, year, month, selectedPaymentDay: selectedPaymentDay.value });
};

const exportPayrollExcelBySite = () => {
  const [year, month] = selectedYearMonth.value.split('-');
  const rows = filteredPayrollList.value.length > 0 ? filteredPayrollList.value : payrollList.value;
  return _exportPayrollExcelBySiteFn({ rows, year, month, selectedPaymentDay: selectedPaymentDay.value });
};

const exportPayslipPDF = () => {
  const [year, month] = selectedYearMonth.value.split('-');
  const selectedRows = payrollList.value.filter(p => p.selected);
  const companyNm = authStore.user?.companyNm || '';
  return _exportPayslipPDFFn({ selectedRows, year, month, companyNm });
};

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
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

    const GROUP_NM = { '04001': '지급항목', '04002': '공제항목', '04003': '정산항목' };
    const excludeCodes = [ '04001004', '04001005', '04001002002', '04001002004', '04001002009', '04001002010', '04001001002', '04002001006', '04002001007', '04002001008', '04002002001', '04002002008', '04002002009', '04002002010', '04002002011' ];

    items.value = leaves
        .filter(leaf => !excludeCodes.includes(leaf.itemCd))
        .map(leaf => ({
          ...leaf,
          tax_free: Number(leaf.tax_free) || 0,
          groupNm:  GROUP_NM[getTopAncestor(leaf.itemCd)] ?? '기타',
        }));

  } catch (e) {
    console.error('임금코드 로드 실패:', e);
    items.value = [];
  }
};

const getTaxRate = async () => {
  const year = new Date().getFullYear();
  try {
    const res = await axios.get(`/api/v1/config/tax/rate/${year}`);
    const list = res.data.data || [];
    const tax = list.find(t => Number(t.applied_year) === year) || list[0] || {};
    // 세율이 비어 있으면 로드 실패로 취급 (0으로 계산되는 사고 방지)
    if (!tax.pension_rate || !tax.health_rate || !tax.long_term_care_rate || !tax.employment_rate) {
      throw new Error('세율 응답 형식 오류 또는 누락');
    }
    targetCodes.value = { pension: tax.pension_rate, health: tax.health_rate, longTerm: tax.long_term_care_rate, employment: tax.employment_rate };
    isTaxRateLoaded.value = true;
  } catch (e) {
    console.error('세율 로드 실패:', e);
    isTaxRateLoaded.value = false;
    alert('세율 정보를 불러오지 못했습니다.\n페이지를 새로고침하거나 관리자에게 문의하세요.\n세율이 로드될 때까지 급여 계산/저장이 비활성화됩니다.');
  }
};

const resetFilters = () => {
  searchTerm.value = '';
  selectedYearMonth.value = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  selectedSite.value = '전체';
  selectedType.value = '전체';
  selectedStatus.value = '전체';
  selectedPaymentDay.value = '전체';
  selectedBilling.value = '전체';
  currentPage.value = 1;
}

const getPayrollMonth = async function () {
  const [year, month] = selectedYearMonth.value.split('-');
  try {
    const res = await axios.get(`/api/v1/member/payroll/month`, { params: { year, month } });
    payrollList.value = res.data.data
        ? res.data.data.map(item => ({
          ...item,
          selected:        false,
          status:          item.status ?? 0,
          payItems:        item.payItems       || {},
          deductionItems:  item.deductionItems || {},
          deductionFlags:  item.checkedItems   || {},
          originalBasePay: undefined,
        }))
        : [];

    const allBillingManagers = payrollList.value
        .map(p => p.billingManager)
        .filter(name => name && name.trim() !== '');

    const uniqueManagers = [...new Set(allBillingManagers)];
    billingManager.value = uniqueManagers.map(name => ({ value: name }));
    currentPage.value = 1;
  } catch (e) { payrollList.value = []; }
};

watch([selectedSite, selectedYearMonth], () => {
  if (selectedSite.value === '전체' || !siteOptions.value?.length) return;
  const site = siteOptions.value.find(s => s.idx == selectedSite.value);
  if (site && site.payment_day) {
    const [y, m] = selectedYearMonth.value.split('-');
    const targetDay = Number(site.payment_day);
    const nextMonthDate = new Date(Number(y), Number(m), targetDay);
    const nextY = nextMonthDate.getFullYear();
    const nextM = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
    const nextD = String(nextMonthDate.getDate()).padStart(2, '0');
    selectedPaymentDay.value = `${nextY}-${nextM}-${nextD}`;
  }
});

watch(selectedSite, (newSite) => {
  router.replace({
    query: {
      ...route.query,
      site: newSite === '전체' ? undefined : newSite
    }
  });
});

onMounted(async () => {
  loadColumnSettings();
  await Promise.all([
    fetchSiteOptions(),
    fetchTypeOptions(),
    fetchOverAgeOption(),
    getTaxRate(),
    getWageCode()
  ]);
  await getPayrollMonth();
});
</script>

<template>
  <div class="payroll-calc-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calculator-variant-outline"></i>
          직원 급여 계산
        </h1>
        <p class="page-subtitle">계약 급여와 실제 근무일을 대조하여 계산을 진행합니다</p>
      </div>
      <div class="header-actions">
        <button @click="resetCalculatedPay" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>선택 초기화</span>
        </button>
        <button @click="deleteCalculatedPay" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>선택 삭제</span>
        </button>
        <button @click="fetchCalculatedPay" class="btn-calculate">
          <i class="mdi mdi-lightning-bolt-outline"></i>
          <span>선택 급여 계산</span>
        </button>
        <button @click="savePayroll" class="btn-save">
          <i class="mdi mdi-content-save-outline"></i>
          <span>선택 결과 저장</span>
        </button>

        <button @click="exportPayrollExcel" class="btn-export">
          <i class="mdi mdi-microsoft-excel"></i>
          <span>전체 지급대장</span>
        </button>

        <button @click="exportPayrollExcelBySite" class="btn-export-site">
          <i class="mdi mdi-office-building"></i>
          <span>단지별 지급대장</span>
        </button>

        <button @click="exportPayslipPDF" class="btn-export-payslip">
          <i class="mdi mdi-file-pdf-box"></i>
          <span>급여 명세서 PDF</span>
        </button>
      </div>
    </div>

    <ExportProgressModal
        :open="isExportModalOpen"
        title="단지별 엑셀 출력 중..."
        icon-class="mdi-microsoft-excel"
        :current-name="currentExportSiteName"
        :progress="exportProgress"
        :total="exportTotal"
        :cancelled="isExportCancelled"
        @cancel="cancelSiteExport"
        @close="isExportModalOpen = false"
    />

    <ExportProgressModal
        :open="isPayslipModalOpen"
        title="급여 명세서 PDF 출력 중..."
        icon-class="mdi-file-pdf-box"
        :current-name="currentPayslipSiteName"
        :progress="payslipProgress"
        :total="payslipTotal"
        :cancelled="isPayslipCancelled"
        @cancel="cancelPayslipExport"
        @close="isPayslipModalOpen = false"
    />

    <!-- 숨겨진 급여명세서 렌더링 영역 (html2canvas 캡처용) -->
    <div v-if="payslipRender.emps.length" id="payslip-render-root" class="payslip-render-root">
      <template v-for="(emp, idx) in payslipRender.emps" :key="idx">
        <div v-if="idx === 1" class="ps-cut-line">
          <span class="ps-scissor">&#9986;</span>
          <span class="ps-cut-text">절&nbsp;&nbsp;취&nbsp;&nbsp;선</span>
          <span class="ps-scissor">&#9986;</span>
        </div>
        <div class="payslip-card">
          <!-- 상단: 회사명 | 급여명세서 -->
          <div class="ps-top">
            <div class="ps-top-company">{{ payslipRender.companyNm }}</div>
            <div class="ps-top-title">{{ payslipRender.year }}년 {{ String(payslipRender.month).padStart(2,'0') }}월 급여 명세서</div>
          </div>

          <!-- 본문 -->
          <div class="ps-body">
            <!-- 좌측 사이드바 -->
            <div class="ps-sidebar">
              <div class="ps-sidebar-title">급여지급명세서</div>
              <div class="ps-info-list">
                <div class="ps-info-line">부&nbsp;&nbsp;서&nbsp;:&nbsp;<b>{{ emp.siteName }}</b></div>
                <div class="ps-info-line">사&nbsp;&nbsp;번&nbsp;:&nbsp;<b>{{ emp.id }}</b></div>
                <div class="ps-info-line">직&nbsp;&nbsp;위&nbsp;:&nbsp;<b>{{ emp.role }}</b></div>
                <div class="ps-info-line">성&nbsp;&nbsp;명&nbsp;:&nbsp;<b>{{ emp.staff }}</b></div>
              </div>
              <div class="ps-thanks">귀하의 노고에 감사합니다.</div>
            </div>

            <!-- 소득공제대상 (15행: 8 라벨 + 7 공백) -->
            <div class="ps-col ps-dep">
              <div class="ps-col-head">소득공제대상</div>
              <div v-for="(dep, di) in depRows" :key="'dp'+di" class="ps-grid-row">
                <div class="ps-cell lbl">{{ dep }}</div>
                <div class="ps-cell val"></div>
              </div>
              <div v-for="n in 7" :key="'de'+n" class="ps-grid-row">
                <div class="ps-cell lbl"></div><div class="ps-cell val"></div>
              </div>
            </div>

            <!-- 지급내역 (15행: 10 지급 + 4 공백 + 지급합계) -->
            <div class="ps-col ps-pay">
              <div class="ps-col-head">지급내역</div>
              <div v-for="(p, pi) in emp.pays" :key="'p'+pi" class="ps-grid-row">
                <div class="ps-cell lbl">{{ spaceOut(p.nm) }}</div>
                <div class="ps-cell num">{{ p.amt ? formatCurrency(p.amt) : '0' }}</div>
              </div>
              <div v-for="n in 4" :key="'pe'+n" class="ps-grid-row">
                <div class="ps-cell lbl"></div><div class="ps-cell num"></div>
              </div>
              <div class="ps-grid-row ps-sum-top">
                <div class="ps-cell lbl">지 급 합 계</div>
                <div class="ps-cell num">{{ formatCurrency(emp.grossTotal) }}</div>
              </div>
            </div>

            <!-- 공제내역 (15행: 9 공제 + 1공백 + 소득세 + 지방소득세 + 1공백 + 공제합계 + 차인지급액) -->
            <div class="ps-col ps-ded">
              <div class="ps-col-head">공제내역</div>
              <div v-for="(d, di) in emp.deds" :key="'d'+di" class="ps-grid-row">
                <div class="ps-cell lbl">{{ spaceOut(d.nm) }}</div>
                <div class="ps-cell num">{{ d.amt ? formatCurrency(d.amt) : '0' }}</div>
              </div>
              <div class="ps-grid-row"><div class="ps-cell lbl"></div><div class="ps-cell num"></div></div>
              <div class="ps-grid-row"><div class="ps-cell lbl">소 득 세</div><div class="ps-cell num">{{ emp.incomeTax ? formatCurrency(emp.incomeTax) : '0' }}</div></div>
              <div class="ps-grid-row"><div class="ps-cell lbl">지 방 소 득 세</div><div class="ps-cell num">{{ emp.localTax ? formatCurrency(emp.localTax) : '0' }}</div></div>
              <div class="ps-grid-row"><div class="ps-cell lbl"></div><div class="ps-cell num"></div></div>
              <div class="ps-grid-row ps-sum-top"><div class="ps-cell lbl">공 제 합 계</div><div class="ps-cell num">{{ formatCurrency(emp.dedTotal) }}</div></div>
              <div class="ps-grid-row"><div class="ps-cell lbl">차 인 지 급 액</div><div class="ps-cell num">{{ formatCurrency(emp.netPay) }}</div></div>
            </div>
          </div>
        </div>
      </template>
    </div>
    <!-- ==================================== -->

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-account-group-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">정산 대상</span>
          <span class="stat-value">{{ statsInfo.total }} <small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-cash-plus"></i></div>
        <div class="stat-content">
          <span class="stat-label">지급 합계</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.gross) }} <small>원</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--danger); --card-bg: rgba(239, 68, 68, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-cash-minus"></i></div>
        <div class="stat-content">
          <span class="stat-label">공제 합계</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.ded) }} <small>원</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-wallet-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">실 지급액</span>
          <span class="stat-value text-orange">{{ formatCurrency(statsInfo.net) }} <small>원</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            급여연월
          </label>
          <input type="month" v-model="selectedYearMonth" class="filter-select" @change="getPayrollMonth"/>
        </div>
        <div class="filter-group">
          <label class="filter-label">
            근무 현장
          </label>
          <SiteSelect v-model="selectedSite" width="100%" />
        </div>
        <div class="filter-group">
          <label class="filter-label">
            지급일
          </label>
          <input type="date" v-model="selectedPaymentDay" class="filter-select" />
        </div>

        <div class="filter-group">
          <label class="filter-label">
            청구 담당
          </label>
          <select v-model="selectedBilling" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="b in billingManager" :key="b.value" :value="b.value">
              {{ b.value }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">구분</label>
          <select v-model="selectedType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">재직 상태</label>
          <select v-model="selectedStatus" class="filter-select">
            <option value="전체">전체</option>
            <option value="0">재직</option>
            <option value="1">퇴사</option>
            <option value="2">일용직</option>
            <option value="3">대근</option>
          </select>
        </div>
        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                placeholder="이름으로 검색..."
                class="search-input"
                @keyup.enter="fetchCalculatedPay"
            />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="resetFilters" class="btn-search" title="필터 초기화">
            <i class="mdi mdi-filter-off"></i>
            <span>초기화</span>
          </button>
        </div>
      </div>

      <div class="filter-toggles-row">
        <span class="toggles-label"><i class="mdi mdi-filter-variant"></i> 상태 필터:</span>
        <div class="filter-toggles">
          <label class="toggle-chip" :class="{ active: filterSaveNone }">
            <input type="checkbox" v-model="filterSaveNone" @change="currentPage = 1">
            <span class="legend-color calculate-inactive" style="width:12px; height:12px;"></span>
            <span>계산 전</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterSaveDraft }">
            <input type="checkbox" v-model="filterSaveDraft" @change="currentPage = 1">
            <span class="legend-color calculate-draft" style="width:12px; height:12px;"></span>
            <span>저장 대기</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterSaveDone }">
            <input type="checkbox" v-model="filterSaveDone" @change="currentPage = 1">
            <span class="legend-color calculate-active" style="width:12px; height:12px;"></span>
            <span>저장 완료</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>급여 데이터 처리 중...</p>
    </div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>급여 정산 내역 ({{ filteredPayrollList.length }}명)</span>
        </div>

        <div class="header-right-controls" style="display: flex; align-items: center; gap: 16px;">
          <div class="status-legend">
            <span class="legend-item"><span class="legend-color calculate-inactive"></span>계산 전</span>
            <span class="legend-item"><span class="legend-color calculate-draft"></span>저장 대기</span>
            <span class="legend-item"><span class="legend-color calculate-active"></span>저장 완료</span>
          </div>
          <div class="page-size-select">
            <label>페이지당</label>
            <select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
              <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
            </select>
          </div>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-1" :style="getStickyStyle('check')">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="selectAll" class="custom-checkbox" />
              </label>
            </th>
            <th rowspan="2" class="text-center sortable col-site sticky-col sticky-col-3" data-col-key="siteName" @click="toggleSort('siteName')" :style="getStickyStyle('siteName')">
              <div class="th-content">현장명<i v-if="sortKey==='siteName'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-4" data-col-key="role" @click="toggleSort('role')" :style="getStickyStyle('role')">
              <div class="th-content">직책<i v-if="sortKey==='role'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-5" data-col-key="id" @click="toggleSort('id')" :style="getStickyStyle('id')">
              <div class="th-content">사번<i v-if="sortKey==='id'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-6" data-col-key="staff" @click="toggleSort('staff')" :style="getStickyStyle('staff')">
              <div class="th-content">성명<i v-if="sortKey==='staff'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-7" :style="getStickyStyle('birthDt')">생년월일</th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-8" data-col-key="age" @click="toggleSort('birthDt')" :style="getStickyStyle('age')">
              <div class="th-content">나이(만)<i v-if="sortKey==='birthDt'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-9" :style="getStickyStyle('inDate')">입사일</th>
            <th rowspan="2" class="text-center sticky-col sticky-col-10" :style="getStickyStyle('workDays')">근무/기준</th>

            <th :colspan="getSummaryGroupColspan()" class="text-center group-header-summary group-divider sticky-col sticky-col-group" :style="getSummaryGroupStyle()">합계</th>

            <th v-if="visiblePayItems.length > 0" :colspan="visiblePayItems.length" class="text-center group-header-pay theme-pay-header group-divider">
              지급 항목<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
            <th v-if="visibleDeductionItems.length > 0" :colspan="visibleDeductionItems.length" class="text-center group-header-deduction theme-deduct-header group-divider">
              공제 항목<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
          </tr>
          <tr>
            <th class="text-right sub-header group-divider sticky-col sticky-col-11" :style="getStickyStyle('gross')">지급합계</th>
            <th class="text-right sub-header sticky-col sticky-col-12" :style="getStickyStyle('ded')">공제합계</th>
            <th class="text-right sub-header sticky-col sticky-col-13 sticky-divider" :style="getStickyStyle('net')">실지급액</th>

            <th v-for="(item, index) in visiblePayItems" :key="item.itemCd" :class="['text-right theme-pay-sub amount-header resizable', { 'group-divider': index === 0 }]">
              {{ item.itemNm }}<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
            <th v-for="(item, index) in visibleDeductionItems" :key="item.itemCd" :class="['text-right theme-deduct-sub amount-header resizable', { 'group-divider': index === 0 }]">
              {{ item.itemNm }}<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
          </tr>
          </thead>

          <tbody>
          <tr v-for="(p, index) in pagedPayrollList" :key="p.idx" class="data-row">
            <td class="text-center calculate-status transition-colors sticky-col sticky-col-1" :class="{'calculate-active': p.status == 1, 'calculate-draft': p.status == 2, 'calculate-inactive': p.status == 0}" :style="getStickyStyle('check')">
              <label class="checkbox-wrapper"><input type="checkbox" v-model="p.selected" class="custom-checkbox" /></label>
            </td>
            <td class="text-center text-dark compact-text cell-ellipsis sticky-col sticky-col-3" :title="p.siteName" :style="getStickyStyle('siteName')">{{ p.siteName }}</td>
            <td class="text-center text-gray compact-text cell-ellipsis sticky-col sticky-col-4" :title="p.role" :style="getStickyStyle('role')">{{ p.role }}</td>
            <td class="text-center text-gray compact-text cell-ellipsis sticky-col sticky-col-5" :title="p.id" :style="getStickyStyle('id')">{{ p.id }}</td>
            <td class="text-center font-bold text-dark member-name sticky-col sticky-col-6" :style="getStickyStyle('staff')">{{ p.staff }}</td>
            <td class="text-center text-gray sticky-col sticky-col-7" :style="getStickyStyle('birthDt')">{{ p.birthDt }}</td>
            <td class="text-center sticky-col sticky-col-8" :style="getStickyStyle('age')">
              <span class="font-bold text-gray">
                {{ calculateAge(p.birthDt) ? calculateAge(p.birthDt) + '세' : '-' }}
              </span>
            </td>
            <td class="text-center sticky-col sticky-col-9" :style="getStickyStyle('inDate')">{{p.inDate}}</td>

            <td class="text-center sticky-col sticky-col-10" :style="getStickyStyle('workDays')">
              <div class="days-input-group">
                <input type="number" class="inline-input days-input" v-model.number="p.workedDays" @focus="$event.target.select()" @input="markAsDraft(p); updatePayAsync(p)" title="실제 일한 일수" />
                <span class="days-separator">/</span>
                <input type="number" class="inline-input days-input" v-model.number="p.scheduledDays" @focus="$event.target.select()" @input="markAsDraft(p); updatePayAsync(p)" title="한 달 기준 근무일수" />
              </div>
            </td>

            <td class="text-right bg-light-gray font-bold amount-cell group-divider sticky-col sticky-col-11" :style="getStickyStyle('gross')">
              {{ formatCurrency(rowSummaryMap.get(p.idx)?.gross ?? 0) }}
            </td>
            <td class="text-right bg-light-gray font-bold text-red amount-cell sticky-col sticky-col-12" :style="getStickyStyle('ded')">
              {{ formatCurrency(rowSummaryMap.get(p.idx)?.ded ?? 0) }}
            </td>
            <td class="text-right bg-light-gray font-bold text-blue amount-cell sticky-col sticky-col-13 sticky-divider" :style="getStickyStyle('net')">
              {{ formatCurrency(rowSummaryMap.get(p.idx)?.net ?? 0) }}
            </td>

            <td v-for="(item, index) in visiblePayItems" :key="item.itemCd" :class="['amount-cell theme-pay-cell', { 'group-divider': index === 0 }]">
              <input type="text" :value="formatCurrency(p.payItems[item.itemCd])" @focus="$event.target.select()" @input="onInputAmount(p, item, 'pay', $event)" class="inline-input" />
            </td>
            <td v-for="(item, index) in visibleDeductionItems" :key="item.itemCd" :class="['amount-cell theme-deduct-cell', { 'group-divider': index === 0 }]">
              <input type="text" :value="formatCurrency(p.deductionItems[item.itemCd])" @focus="$event.target.select()" @input="onInputAmount(p, item, 'deduct', $event)" class="inline-input" />
            </td>
          </tr>
          <tr v-if="filteredPayrollList.length === 0">
            <td :colspan="getFooterColspan() + getSummaryGroupColspan() + visiblePayItems.length + visibleDeductionItems.length" class="empty-state">
              <i class="mdi mdi-calculator-variant-outline"></i>
              <p>조건에 맞는 급여 대상자가 없습니다.</p>
            </td>
          </tr>
          </tbody>

          <tfoot>
          <tr class="table-footer sticky-footer">
            <td :colspan="getFooterColspan()" class="sticky-col sticky-col-span-footer" :style="{ left: 0, minWidth: getFooterTotalWidth() + 'px', zIndex: 35 }">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 16px;">
                <span class="font-bold text-dark">전체 합계</span>
                <div class="net-pay-box" style="padding: 4px 16px; background-color: var(--primary-soft); border-radius: 6px;">
                  <span class="net-pay-label" style="font-size: 12px; margin-right: 8px;">실 지급액 합계</span>
                  <span class="net-pay-value" style="font-size: 16px;">{{ formatCurrency(statsInfo.net) }} 원</span>
                </div>
              </div>
            </td>

            <td class="text-right font-bold group-divider sticky-col sticky-col-11" :style="getStickyStyle('gross')">{{ formatCurrency(statsInfo.gross) }}</td>
            <td class="text-right font-bold text-red sticky-col sticky-col-12" :style="getStickyStyle('ded')">{{ formatCurrency(statsInfo.ded) }}</td>
            <td class="text-right font-bold text-blue sticky-col sticky-col-13 sticky-divider" :style="getStickyStyle('net')">{{ formatCurrency(statsInfo.net) }}</td>

            <td v-for="(item, index) in visiblePayItems" :key="'foot-pay-' + item.itemCd"
                :class="['text-right font-bold text-blue bg-light-gray theme-pay-sub amount-cell', { 'group-divider': index === 0 }]">
              {{ formatCurrency(statsInfo.pay[item.itemCd] || 0) }}
            </td>

            <td v-for="(item, index) in visibleDeductionItems" :key="'foot-ded-' + item.itemCd"
                :class="['text-right font-bold text-red bg-light-gray theme-deduct-sub amount-cell', { 'group-divider': index === 0 }]">
              {{ formatCurrency(statsInfo.deduct[item.itemCd] || 0) }}
            </td>

          </tr>
          </tfoot>
        </table>
      </div>

      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredPayrollList.length"
          @change="handlePageChange"
      />

    </div>
  </div>
</template>

<style scoped>
.age-warning { color: var(--danger) !important; font-weight: 600; }

.btn-export {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
  background-color: #217346;
  color: #ffffff;
  box-shadow: var(--shadow-sm);
}
.btn-export:hover { filter: brightness(0.88); transform: translateY(-1px); }
.btn-export i { font-size: 18px; }

/* 단지별 출력 버튼 스타일 추가 */
.btn-export-site {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
  background-color: #0f766e; /* 조금 다른 녹색 계열 */
  color: #ffffff;
  box-shadow: var(--shadow-sm);
}
.btn-export-site:hover { filter: brightness(0.88); transform: translateY(-1px); }
.btn-export-site i { font-size: 18px; }

.btn-calculate {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
  background-color: var(--warning); color: var(--text-inverse); box-shadow: var(--shadow-sm);
}
.btn-calculate:hover { filter: brightness(0.9); transform: translateY(-1px); }
.btn-calculate i { font-size: 18px; }

.page-size-select { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub); }

.loading-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 24px;
}
.spinner {
  width: 40px; height: 40px; border: 3px solid var(--bg-canvas);
  border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p { margin-top: 16px; font-size: 14px; color: var(--text-sub); }

.status-legend { display: flex; align-items: center; gap: 16px; font-size: 12px; color: var(--text-sub); font-weight: 600;}
.legend-item { display: flex; align-items: center; gap: 6px; }
.legend-color { width: 14px; height: 14px; border-radius: 4px; display: inline-block; box-shadow: var(--shadow-sm); }
.legend-color.calculate-inactive { background-color: var(--bg-canvas); border: 1px solid var(--border-color); }
.legend-color.calculate-draft { background-color: var(--warning); }
.legend-color.calculate-active { background-color: var(--success); }

/* 테이블 스크롤 & 레이아웃 코어 */
.table-scroll-container { overflow-x: auto; max-width: 100%; max-height: calc(100vh - 350px); position: relative; background-color: #ffffff; }
.table-scroll-container::-webkit-scrollbar { height: 8px; width: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.data-table { table-layout: fixed; width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; }
.data-table th, .data-table td { box-sizing: border-box; background-clip: padding-box; padding: 6px 6px; vertical-align: middle; }
.data-table tr td:first-child, .data-table tr th:first-child { border-left: 1px solid var(--border-color); }
.data-table th { position: relative; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.group-header-summary, .group-header-pay, .group-header-deduction { border-bottom: 1px solid var(--border-color); }
.sub-header { border-bottom: 1px solid var(--border-color); }

.sticky-col { position: sticky !important; z-index: 3; overflow: visible; }
thead .sticky-col { z-index: 50 !important; background-color: #f8fafc !important; }
thead tr:nth-child(2) .sticky-col { background-color: #f1f5f9 !important; }
tfoot .sticky-col { z-index: 35 !important; background-color: #f8fafc !important; }

.sticky-col-1  { left: 0px;   min-width: 40px;  max-width: 40px;  width: 40px; }
.sticky-col-2  { left: 40px;  min-width: 40px;  max-width: 40px;  width: 40px; }
.sticky-col-3  { left: 80px;  min-width: 110px; max-width: 110px; width: 110px; }
.sticky-col-4  { left: 190px; min-width: 70px;  max-width: 70px;  width: 70px; }
.sticky-col-5  { left: 260px; min-width: 80px;  max-width: 80px;  width: 80px; }
.sticky-col-6  { left: 340px; min-width: 80px;  max-width: 80px;  width: 80px; }
.sticky-col-7  { left: 420px; min-width: 100px; max-width: 100px; width: 100px; }
.sticky-col-8  { left: 520px; min-width: 70px;  max-width: 70px;  width: 70px; }
.sticky-col-9  { left: 590px; min-width: 110px; max-width: 110px; width: 110px; }

tfoot .sticky-col-span9 { position: sticky !important; left: 0px; width: 700px; min-width: 700px; z-index: 35 !important; background-color: #f8fafc !important; }
.sticky-col-group { left: 700px; z-index: 41 !important; border-right: 2px solid var(--border-focus) !important; }
.sticky-col-10 { left: 700px; min-width: 90px;  max-width: 90px;  width: 90px; }
.sticky-col-11 { left: 790px; min-width: 90px;  max-width: 90px;  width: 90px; }
.sticky-col-12 { left: 880px; min-width: 90px;  max-width: 90px;  width: 90px; }
.sticky-divider { border-right: 2px solid var(--border-focus) !important; }

tr.data-row:has(td.calculate-inactive) .sticky-col { background-color: #ffffff !important; }
tr.data-row:has(td.calculate-draft) td { background-color: rgba(245, 158, 11, 0.10); }
tr.data-row:has(td.calculate-draft) td.sticky-col { background-color: #fef3c7 !important; }
tr.data-row:has(td.calculate-active) td { background-color: rgba(16, 185, 129, 0.08); }
tr.data-row:has(td.calculate-active) td.sticky-col { background-color: #d1fae5 !important; }
tr.data-row:hover td.sticky-col { filter: brightness(0.97); }

.amount-header, .amount-cell { width: 90px; }
.calculate-status { position: relative; }
.calculate-inactive { background-color: var(--bg-canvas); }
.calculate-draft { background-color: rgba(245, 158, 11, 0.15) !important; box-shadow: inset 4px 0 0 var(--warning); }
.calculate-active { background-color: rgba(16, 185, 129, 0.15) !important; box-shadow: inset 4px 0 0 var(--success); }
.member-name { font-weight: 700; color: var(--primary); }
.bg-light-gray { background-color: var(--bg-canvas); }
.days-input-group { display: flex; align-items: center; justify-content: center; gap: 4px; }
.days-input { width: 44px !important; text-align: center; padding: 6px 4px !important;}
.days-separator { color: var(--text-muted); font-weight: 400; font-size: 14px;}

.inline-input {
  box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0; padding: 6px 4px;
  text-align: right; font-size: 13px; color: var(--text-main); border: 1px solid transparent;
  border-radius: 6px; background: transparent; transition: border-color 0.2s, box-shadow 0.2s;
}
.inline-input:hover { border-color: var(--border-focus); background: var(--bg-surface); }
.inline-input:focus { outline: none; border-color: var(--primary); background: var(--bg-surface); box-shadow: 0 0 0 3px var(--primary-soft); }

.checkbox-wrapper { display: flex; justify-content: center; align-items: center; cursor: pointer; }
.custom-checkbox {
  appearance: none; -webkit-appearance: none; width: 18px; height: 18px; border: 2px solid var(--border-focus); border-radius: 4px;
  cursor: pointer; position: relative; background: var(--bg-surface); margin: 0; transition: border-color 0.2s;
}
.custom-checkbox:hover { border-color: var(--text-muted); }
.custom-checkbox:checked { border-color: var(--primary); background-color: var(--primary); }
.custom-checkbox:checked::after { content: ''; position: absolute; top: 2px; left: 5px; width: 4px; height: 8px; border: solid var(--text-inverse); border-width: 0 2px 2px 0; transform: rotate(45deg); }

.table-footer.sticky-footer { position: sticky; bottom: 0; z-index: 25; background-color: var(--bg-canvas); border-top: 2px solid var(--border-focus); box-shadow: 0 -4px 12px rgba(0,0,0,0.05); }
.table-footer td { padding: 14px 10px; font-size: 14px; }
.net-pay-box { display: inline-flex; align-items: center; gap: 12px; background-color: var(--primary-soft); padding: 8px 20px; border-radius: 8px; border: 1px solid rgba(37, 99, 235, 0.2); }
.net-pay-label { font-size: 13px; color: var(--primary); font-weight: 600; }
.net-pay-value { font-size: 18px; color: var(--primary); font-weight: 700; letter-spacing: 0.5px;}

.resize-handle { position: absolute; top: 0; right: -2px; width: 5px; height: 100%; cursor: col-resize; z-index: 10; background-color: transparent; transition: background-color 0.2s ease; }
.resize-handle:hover, .resize-handle:active { background-color: var(--border-focus); }
body.is-resizing, body.is-resizing * { cursor: col-resize !important; user-select: none !important; }
@media (max-width: 768px) { .btn-calculate, .btn-export { flex: 1; justify-content: center; } .status-legend { width: 100%; justify-content: space-between; padding: 10px 0; } .header-right-controls { flex-direction: column; align-items: stretch !important; gap: 8px !important; } }
.group-divider { border-left: 2px solid var(--border-color) !important; }
.theme-pay-header { background-color: #f8fafc !important; border-top: 2px solid #3b82f6 !important; color: #1e40af !important; }
.theme-pay-sub { border-bottom: 1px solid var(--border-color) !important; }
.theme-pay-cell { background-color: transparent; }
.theme-deduct-header { background-color: #fef2f2 !important; border-top: 2px solid #ef4444 !important; color: #991b1b !important; }
.theme-deduct-sub { border-bottom: 1px solid var(--border-color) !important; }
.theme-deduct-cell { background-color: transparent; }
.col-site { min-width: 80px; max-width: 160px; width: 120px; }
.cell-ellipsis { max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ===== 급여 명세서 PDF 버튼 ===== */
.btn-export-payslip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 8px; border: 1px solid #b91c1c;
  background: #dc2626; color: #fff; font-weight: 600; cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
}
.btn-export-payslip:hover { background: #b91c1c; box-shadow: 0 2px 6px rgba(185, 28, 28, 0.3); }

/* ===== 급여 명세서 html2canvas 렌더링 영역 (A4 세로 비율: 820×1160) ===== */
.payslip-render-root,
.payslip-render-root * { box-sizing: border-box; }   /* 전체 border-box 강제 */

.payslip-render-root {
  position: fixed; left: -10000px; top: 0;
  width: 820px; height: 1160px;
  background: #fff; padding: 0;
  font-family: '맑은 고딕', 'Malgun Gothic', '나눔고딕', 'Nanum Gothic', sans-serif;
  color: #000;
  display: flex; flex-direction: column;
  z-index: -1;
}
.payslip-card {
  flex: 0 0 555px;
  border: 1px solid #000;
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* 절취선 */
.ps-cut-line {
  flex: 0 0 50px;
  display: flex; align-items: center; justify-content: center;
  gap: 10px; font-size: 11px; color: #555;
  letter-spacing: 3px;
  padding: 0 16px;
}
.ps-cut-line::before, .ps-cut-line::after {
  content: ''; flex: 1;
  border-top: 1.5px dashed #666;
}
.ps-scissor { font-size: 16px; color: #555; }
.ps-cut-text { font-weight: 700; }

/* 상단: 회사명 | 급여 명세서 */
.ps-top { display: flex; border-bottom: 1px solid #000; flex: 0 0 56px; }
.ps-top-company {
  flex: 0 0 200px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 500;
  border-right: 1px solid #000;
  color: #333;
}
.ps-top-title {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 700; letter-spacing: 1px;
}

/* 본문 영역 */
.ps-body { flex: 1; display: flex; min-height: 0; }

/* 사이드바 */
.ps-sidebar {
  flex: 0 0 200px;
  border-right: 1px solid #000;
  display: flex; flex-direction: column;
  padding: 16px 12px 0 12px;
}
.ps-sidebar-title {
  border: 1px solid #000; border-radius: 4px;
  padding: 10px 4px;
  text-align: center;
  font-weight: 700; font-size: 15px;
  background: #cfd8f2;
  margin-bottom: 8px;
  letter-spacing: 1px;
}
.ps-info-list {
  flex: 1;
  display: flex; flex-direction: column; justify-content: space-around;
  padding: 24px 0 12px 10px;
}
.ps-info-line { font-size: 12px; letter-spacing: 0.5px; }
.ps-info-line b { font-weight: 700; margin-left: 2px; }
.ps-thanks {
  font-size: 11px;
  padding: 6px 0;
  border-top: 1px solid #000;
  text-align: left;
}

/* 데이터 3열: 모두 동일한 15행 구조 → 완벽 정렬 */
.ps-col {
  display: flex; flex-direction: column;
  border-right: 1px solid #000;
  min-width: 0;
}
.ps-col:last-child { border-right: none; }

.ps-dep { flex: 0 0 140px; }
.ps-pay { flex: 1; }
.ps-ded { flex: 1; }

.ps-col-head {
  flex: 0 0 22px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 11.5px;
  background: #e8ecf5;
  border-bottom: 1px solid #000;
  letter-spacing: 0.5px;
}

.ps-grid-row {
  flex: 1 1 0;              /* basis 0 → 모든 행 균등분배 */
  display: flex;
  border-bottom: 1px solid #000;
  min-height: 0;
}
.ps-grid-row:last-child { border-bottom: none; }

/* 셀 */
.ps-cell {
  display: flex; align-items: center;
  padding: 0 6px;
  font-size: 11px;
  overflow: hidden;
}
.ps-cell.lbl {
  flex: 1 1 0;
  letter-spacing: 0.3px;
  border-right: 1px solid #000;
  justify-content: center;
}
.ps-cell.val { flex: 0 0 45%; }
.ps-cell.num {
  flex: 0 0 55%;
  justify-content: flex-end;
}
/* 중요: pay/ded 라벨도 flex:1 유지 → num 55% 고정, 나머지 lbl 45% 자동 */
/* .ps-pay/.ps-ded .ps-cell.lbl 재정의 하지 않음 (overflow 방지) */

/* 지급합계/공제합계: 테두리 유지(모든 열 공통)하고 폰트만 bold → 열 간 높이 일정 */
.ps-grid-row.ps-sum-top .ps-cell.lbl,
.ps-grid-row.ps-sum-top .ps-cell.num { font-weight: 700; }
</style>