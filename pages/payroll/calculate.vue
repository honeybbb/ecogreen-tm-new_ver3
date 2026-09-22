<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";
import XLSX from 'xlsx-js-style'
import Pagination from "~/components/common/Pagination.vue";
import { useTableResize } from '~/composables/useTableResize.js';
import {calculateAge} from "~/utils/formatter.js";
import {formatCurrency} from "../../utils/formatter.js";
import {useRoute, useRouter} from "#vue-router";

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

// View Settings States
const staticCols = ref([
  { id: 'siteName', name: '현장명', show: true, width: 110, sticky: true },
  { id: 'role', name: '직책', show: true, width: 70, sticky: true },
  { id: 'id', name: '사번', show: true, width: 80, sticky: true },
  { id: 'staff', name: '성명', show: true, width: 80, sticky: true },
  { id: 'birthDt', name: '생년월일', show: true, width: 100, sticky: true },
  { id: 'age', name: '나이(만)', show: true, width: 70, sticky: true },
  { id: 'inDate', name: '입사일', show: true, width: 110, sticky: true },
  { id: 'workDays', name: '근무/기준', show: true, width: 110, sticky: true },
  { id: 'gross', name: '지급합계', show: true, width: 90, sticky: true },
  { id: 'ded', name: '공제합계', show: true, width: 90, sticky: true },
  { id: 'net', name: '실지급액', show: true, width: 90, sticky: true }
]);
const hiddenDynamicCols = ref({});

const visiblePayItems = computed(() => {
  return payItems.value.filter(i => !hiddenDynamicCols.value[i.itemCd]);
});

const visibleDeductionItems = computed(() => {
  return deductionItems.value.filter(i => !hiddenDynamicCols.value[i.itemCd]);
});

const getStickyStyle = (colId, extraStyle = {}) => {
  const baseOrder = [
    { id: 'check', width: 40, show: true },
    ...staticCols.value
  ];

  let left = 0;
  for (const col of baseOrder) {
    if (col.id === colId) {
      if (!col.show) return { display: 'none' };
      return {
        left: `${left}px`,
        minWidth: `${col.width}px`,
        maxWidth: `${col.width}px`,
        width: `${col.width}px`,
        ...extraStyle
      };
    }
    if (col.show) left += col.width;
  }
  return {};
};

const getSummaryGroupStyle = () => {
  const baseOrder = [
    { id: 'check', width: 40, show: true },
    ...staticCols.value.slice(0, 8)
  ];
  let left = 0;
  for (const col of baseOrder) {
    if (col.show) left += col.width;
  }
  const grossShow = staticCols.value.find(c => c.id === 'gross').show;
  const dedShow = staticCols.value.find(c => c.id === 'ded').show;
  const netShow = staticCols.value.find(c => c.id === 'net').show;
  if (!grossShow && !dedShow && !netShow) return { display: 'none' };
  return { left: `${left}px` };
};

const getSummaryGroupColspan = () => {
  let count = 0;
  if (staticCols.value.find(c => c.id === 'gross').show) count++;
  if (staticCols.value.find(c => c.id === 'ded').show) count++;
  if (staticCols.value.find(c => c.id === 'net').show) count++;
  return count;
}

const getFooterColspan = () => {
  let span = 1;
  for (let i = 0; i < 8; i++) {
    if (staticCols.value[i].show) span++;
  }
  return span;
};

const getFooterTotalWidth = () => {
  let width = 80;
  for (let i = 0; i < 8; i++) {
    if (staticCols.value[i].show) width += staticCols.value[i].width;
  }
  return width;
};

const loadColumnSettings = () => {
  if (typeof window === 'undefined') return;
  const userId = authStore.user?.id || authStore.user?.userId || authStore.user?.cIdx || authStore.user?.adminId || 'default';
  const saved = localStorage.getItem(`payroll_cols_${userId}`);
  if (saved) {
    try {
      const settings = JSON.parse(saved);
      if (settings.staticCols) {
        settings.staticCols.forEach(sc => {
          const col = staticCols.value.find(c => c.id === sc.id);
          if (col) col.show = sc.show;
        });
      }
      if (settings.hiddenDynamicCols) {
        hiddenDynamicCols.value = settings.hiddenDynamicCols;
      }
    } catch (e) {
      console.error('Failed to load column settings', e);
    }
  }
};

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
const ageLimits    = ref({ pension: 0, employment: 0 });
const paymentDayOptions = computed(() => {
  const days = [];
  for (let i = 1; i <= 31; i++) {
    days.push(String(i));
  }
  return days;
});

// ── 페이지네이션 상태 ──────────────────────────────
const currentPage = ref(1);
const pageSize    = ref(50);
const pageSizeOptions = [50, 100, 200, 500];

watch([
  selectedSite,
  selectedType,
  searchTerm,
  selectedYearMonth,
  selectedPayHistory], () => {
  currentPage.value = 1;
});

// 2. 동적 컬럼
const payItems       = computed(() => items.value.filter(i => i.groupNm === '지급항목'));
const deductionItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));

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

const handlePageChange = () => {
  document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const pagedPayrollList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredPayrollList.value.slice(start, start + pageSize.value);
});

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

/* ══════════════════════════════════════════════════════════════════════════
   급여 지급대장 엑셀 출력 설정 (공통)
══════════════════════════════════════════════════════════════════════════ */
const REGISTER = {
  company: '주식회사이지종합관리',
  contact: 'Tel.031-906-2002 Fax.031-906-2211',
  notice: `${new Date().getFullYear()}년 직장인건강검진 받으시기 바랍니다.`,
  blocksPerPage: 6,
  pageHeightPt: 594,
}

const REG_PAY_SLOTS = [
  { r: 0, c: 6, nm: '기본급' }, { r: 0, c: 7, nm: '직책수당' }, { r: 0, c: 10, nm: '연차수당' },
  { r: 0, c: 11, nm: '야간수당' }, { r: 0, c: 12, nm: '기타수당', etc: true },
  { r: 1, c: 6, nm: '식대' }, { r: 1, c: 7, nm: '대근비' }, { r: 1, c: 10, nm: '휴가비' },
  { r: 1, c: 11, nm: '근로자의날수당' }, { r: 1, c: 12, nm: '복지수당' },
]
const REG_DED_SLOTS = [
  { r: 0, c: 13, nm: '건강보험' }, { r: 0, c: 14, nm: '장기요양보험' }, { r: 0, c: 16, nm: '국민연금' },
  { r: 1, c: 13, nm: '고용보험' }, { r: 1, c: 14, nm: '기타공제', etc: true }, { r: 1, c: 16, nm: '환급소득세' },
  { r: 2, c: 13, nm: '환급주민세' }, { r: 2, c: 14, nm: '기타보험료' },
  { r: 2, c: 16, nm: '피복비공제료', label: '피복비 공제료' },
  { r: 4, c: 13, nm: '소득세' }, { r: 4, c: 14, nm: '지방소득세' },
]

const REG_VB = {
  1: ['medium', 'thin'], 2: ['thin', 'thin'], 3: ['thin', 'thin'], 4: ['thin', 'thin'], 5: ['thin', 'double'],
  6: ['double', 'thin'], 7: ['thin', 'thin'], 8: [null, null], 9: [null, 'thin'],
  10: ['thin', 'thin'], 11: ['thin', 'thin'], 12: ['thin', 'double'],
  13: ['double', 'thin'], 14: ['thin', 'thin'], 15: [null, 'thin'], 16: ['thin', 'double'],
  17: ['double', 'thin'], 18: [null, null], 19: [null, 'thin'], 20: ['thin', null], 21: [null, 'medium'],
}
const REG_COL_W = [9.25, 9.625, 3.375, 3.375, 3.375, 3.375, 12.25, 6.75, 3.25, 2.625, 12.375, 12.25,
  12.625, 12.625, 1, 11.25, 12.625, 6.625, 4.875, 1.75, 2.25, 6.25, 0.25, 6.25]
const REG_NCOL = 24
const REG_RH = { pad: 51, title: 22.5, pay: 6, comp: 9, gap1: 7.5, gap2: 2.25, grp: 12.75, note: 13.5, tel: 13.5, brk: 10.5 }
const REG_BLOCK_H = [12, 12, 13.5, 12.75, 12.75]

const F = (sz, bold) => ({ name: '나눔고딕', sz, bold: !!bold })
const F9 = F(9), F9B = F(9, true)
const FILL_H = { patternType: 'solid', fgColor: { rgb: 'E6E6FA' } }
const AC = { horizontal: 'center', vertical: 'center' }
const AR = { horizontal: 'right', vertical: 'center' }
const AL = { horizontal: 'left', vertical: 'top' }
const AD = { horizontal: 'distributed', vertical: 'center' }

// 공통 엑셀 데이터 생성 함수
const generateExcelSheetData = (siteGroupsArray, year, month, payDateLabel) => {
  const norm = (s) => String(s || '').replace(/[\s()]/g, '')
  const cdOf = (list, nm) => (list.find(i => norm(i.itemNm) === norm(nm)) || {}).itemCd || null
  const paySlots = REG_PAY_SLOTS.map(s => ({ ...s, cd: cdOf(payItems.value, s.nm) }))
  const dedSlots = REG_DED_SLOTS.map(s => ({ ...s, cd: cdOf(deductionItems.value, s.nm) }))
  const mappedPay = new Set(paySlots.map(s => s.cd).filter(Boolean))
  const mappedDed = new Set(dedSlots.map(s => s.cd).filter(Boolean))
  const etcPayKey = (() => { const s = paySlots.find(x => x.etc); return s ? `${s.r}_${s.c}` : null })()
  const etcDedKey = (() => { const s = dedSlots.find(x => x.etc); return s ? `${s.r}_${s.c}` : null })()

  const toGrid = (payMap, dedMap) => {
    const g = {}
    paySlots.forEach(s => { g[`${s.r}_${s.c}`] = Number(payMap?.[s.cd] || 0) })
    dedSlots.forEach(s => { g[`${s.r}_${s.c}`] = Number(dedMap?.[s.cd] || 0) })
    let restP = 0, restD = 0
    payItems.value.forEach(i => { if (!mappedPay.has(i.itemCd)) restP += Number(payMap?.[i.itemCd] || 0) })
    deductionItems.value.forEach(i => { if (!mappedDed.has(i.itemCd)) restD += Number(dedMap?.[i.itemCd] || 0) })
    if (etcPayKey) g[etcPayKey] = Number(g[etcPayKey] || 0) + restP
    if (etcDedKey) g[etcDedKey] = Number(g[etcDedKey] || 0) + restD
    return g
  }

  const BPP = REGISTER.blocksPerPage
  const pages = []

  siteGroupsArray.forEach((g, gi) => {
    const blocks = g.emps.map(e => ({ kind: 'emp', emp: e }))
    blocks.push({ kind: 'sum', label: g.isTotal ? '합계' : '부서계', emps: g.emps, siteName: g.siteName })
    // 단일 현장 출력이 아니고 전체 출력일 때 맨 마지막에 총합계 추가
    if (!g.isTotal && siteGroupsArray.length > 1 && gi === siteGroupsArray.length - 1) {
      const allEmps = siteGroupsArray.flatMap(sg => sg.emps);
      blocks.push({ kind: 'sum', label: '합계', emps: allEmps, siteName: '' })
    }
    for (let i = 0; i < blocks.length; i += BPP) pages.push(blocks.slice(i, i + BPP))
  })

  const wsData = []; const merges = []; const rowH = [];
  const pushH = (h) => rowH.push({ hpt: h })
  let R = 0

  const line = (top, bottom, fill) => {
    const row = new Array(REG_NCOL).fill(null)
    for (let c = 1; c <= 21; c++) {
      const [l, r] = REG_VB[c]
      row[c] = { v: '', t: 's', s: { font: F9, fill: fill ? FILL_H : { patternType: 'none' }, alignment: AC, border: { top: top ? { style: top } : undefined, bottom: bottom ? { style: bottom } : undefined, left: l ? { style: l } : undefined, right: r ? { style: r } : undefined } } }
    }
    return row
  }
  const blank = () => new Array(REG_NCOL).fill(null).map(() => ({ v: '', t: 's', s: { font: F9 } }))
  const seam = (row, a, b) => { for (let c = a; c <= b; c++) { if (!row[c]) continue; if (c > a) row[c].s.border.left = undefined; if (c < b) row[c].s.border.right = undefined; } }
  const hmerge = (row, r, a, b) => { seam(row, a, b); merges.push({ s: { r, c: a }, e: { r, c: b } }) }
  const vmerge = (r1, c1, r2, c2) => merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } })

  const put = (row, c, v, opt = {}) => {
    if (!row[c]) return
    const isNum = typeof v === 'number'
    row[c].v = v === null || v === undefined ? '' : v
    row[c].t = isNum ? 'n' : 's'
    if (isNum) row[c].z = opt.z || '#,##0_ '
    if (opt.font) row[c].s.font = opt.font
    row[c].s.alignment = opt.align || (isNum ? AR : AC)
  }
  const money = (row, c, v) => { if (Number(v || 0) !== 0) put(row, c, Number(v || 0)) }

  const pushHeader = () => {
    const g = line('medium', 'thin', true)
    put(g, 6, '지\u00a0\u00a0급\u00a0\u00a0내\u00a0\u00a0역', { font: F9B })
    put(g, 13, '공\u00a0\u00a0\u00a0제\u00a0\u00a0\u00a0내\u00a0\u00a0\u00a0역', { font: F9B })
    put(g, 17, '합계'); put(g, 20, '영수인')
    hmerge(g, R, 2, 5); hmerge(g, R, 6, 12); hmerge(g, R, 13, 16); seam(g, 17, 19); seam(g, 20, 21); vmerge(R, 17, R + 2, 19); vmerge(R, 20, R + 5, 21)
    wsData.push(g); R++
    const H = [0, 1, 2, 3, 4].map(() => line('thin', 'thin', true))
    const L = ['사 원 번 호', '직위', '성명', '근로일수', '근로시간수']
    L.forEach((t, i) => put(H[i], 1, t, { font: i === 4 ? F(8.6) : F9, align: i === 0 ? AC : AD }))
    put(H[0], 2, '입 사 일 자'); hmerge(H[0], R, 2, 5)
    put(H[1], 2, '경'); put(H[1], 3, '부'); put(H[1], 4, '7')
    put(H[2], 2, '배'); put(H[2], 3, '20\u00a0'); put(H[2], 4, '60\u00a0'); put(H[2], 5, '장')
    put(H[3], 2, '연장', { align: AD }); hmerge(H[3], R + 3, 2, 3); put(H[3], 4, '야간', { align: AD }); hmerge(H[3], R + 3, 4, 5)
    put(H[4], 2, '휴일', { align: AD }); hmerge(H[4], R + 4, 2, 3); hmerge(H[4], R + 4, 4, 5)
    ;[...paySlots, ...dedSlots].forEach(s => put(H[s.r], s.c, s.label || s.nm, { font: F9B, align: AD }))
    ;['지급합계', '공제합계', '차인지급액'].forEach((t, i) => put(H[i + 2], 17, t, { align: AD }))
    H.forEach((row, i) => { hmerge(row, R + i, 7, 9); hmerge(row, R + i, 14, 15) })
    ;[2, 3, 4].forEach(i => hmerge(H[i], R + i, 17, 19))
    H.forEach(row => { wsData.push(row); R++ })
  }

  const pushBlock = (blk) => {
    const rows = [line('medium', 'thin'), line('thin', 'thin'), line('thin', 'thin'), line('thin', 'thin'), line('thin', 'medium')]
    const R0 = R; let grid, sum;
    if (blk.kind === 'emp') {
      const e = blk.emp; grid = toGrid(e.payItems || {}, e.deductionItems || {})
      sum = calculateRowSummary(e)
      put(rows[0], 1, e.id || ''); put(rows[0], 2, e.inDate || '')
      put(rows[1], 1, e.role || ''); put(rows[1], 2, '0'); put(rows[1], 3, '0'); put(rows[1], 4, '0')
      put(rows[2], 1, e.staff || ''); put(rows[2], 3, '0'); put(rows[2], 4, '0'); put(rows[2], 5, '0')
      put(rows[3], 1, String(Number(e.workedDays || 0))); put(rows[3], 2, '0.00'); put(rows[3], 4, '0.00')
      put(rows[4], 1, 209, { z: '#,##0.00_ ', align: AC }); put(rows[4], 2, '0.00')
    } else {
      const pt = {}, dt = {}
      blk.emps.forEach(e => { Object.entries(e.payItems || {}).forEach(([k, v]) => { pt[k] = Number(pt[k] || 0) + Number(v || 0) }); Object.entries(e.deductionItems || {}).forEach(([k, v]) => { dt[k] = Number(dt[k] || 0) + Number(v || 0) }) })
      grid = toGrid(pt, dt)
      sum = blk.emps.reduce((a, e) => { const s = calculateRowSummary(e); return { gross: a.gross + s.gross, ded: a.ded + s.ded, net: a.net + s.net } }, { gross: 0, ded: 0, net: 0 })
      put(rows[0], 1, blk.label, { font: F9B })
      if (blk.siteName) put(rows[0], 2, blk.siteName)
      put(rows[4], 2, `${blk.emps.length}명`, { font: F9B })
    }
    ;[...paySlots, ...dedSlots].forEach(s => money(rows[s.r], s.c, grid[`${s.r}_${s.c}`]))
    put(rows[2], 17, Number(sum.gross || 0)); put(rows[3], 17, Number(sum.ded || 0)); put(rows[4], 17, Number(sum.net || 0))

    rows.forEach((row, i) => {
      const rr = R0 + i
      if (i === 0 || (blk.kind === 'sum' && (i === 3 || i === 4))) hmerge(row, rr, 2, 5)
      if (blk.kind === 'emp' && (i === 3 || i === 4)) { hmerge(row, rr, 2, 3); hmerge(row, rr, 4, 5) }
      hmerge(row, rr, 7, 9); hmerge(row, rr, 14, 15); hmerge(row, rr, 17, 19); seam(row, 20, 21)
      if (i > 0) { row[20].s.border.top = undefined; row[21].s.border.top = undefined }
      if (i < 4) { row[20].s.border.bottom = undefined; row[21].s.border.bottom = undefined }
      wsData.push(row); R++
    })
    vmerge(R0, 20, R0 + 4, 21)
  }

  pages.forEach((blocks, pi) => {
    wsData.push(blank()); R++; pushH(REG_RH.pad)
    const t = blank(); t[9] = { v: `${year}년 ${month}월 급여 지급대장`, t: 's', s: { font: F(16), alignment: AC } }
    wsData.push(t); merges.push({ s: { r: R, c: 9 }, e: { r: R, c: 14 } }); R++; pushH(REG_RH.title)
    const p = blank(); p[9] = { v: payDateLabel, t: 's', s: { font: F(10), alignment: AC } }
    wsData.push(p); merges.push({ s: { r: R, c: 9 }, e: { r: R + 1, c: 14 } }); R++; pushH(REG_RH.pay)
    const cp = blank(); cp[1] = { v: REGISTER.company, t: 's', s: { font: F(10), alignment: AL } }
    wsData.push(cp); merges.push({ s: { r: R, c: 1 }, e: { r: R + 1, c: 7 } }); R++; pushH(REG_RH.comp)
    wsData.push(blank()); R++; pushH(REG_RH.gap1); wsData.push(blank()); R++; pushH(REG_RH.gap2)

    pushHeader(); pushH(REG_RH.grp); REG_BLOCK_H.forEach(pushH)
    blocks.forEach(b => { pushBlock(b); REG_BLOCK_H.forEach(pushH) })

    const fixed = REG_RH.pad + REG_RH.title + REG_RH.pay + REG_RH.comp + REG_RH.gap1 + REG_RH.gap2 + REG_RH.grp + REG_BLOCK_H.reduce((a, b) => a + b, 0) + REG_RH.note + REG_RH.tel + REG_RH.brk
    const filler = Math.max(3, REGISTER.pageHeightPt - fixed - blocks.length * 63)
    wsData.push(blank()); R++; pushH(filler)

    const nt = blank(); nt[1] = { v: REGISTER.notice, t: 's', s: { font: F(8), alignment: AL } }
    wsData.push(nt); merges.push({ s: { r: R, c: 1 }, e: { r: R, c: 18 } }); R++; pushH(REG_RH.note)

    const ft = blank(); ft[1] = { v: REGISTER.contact, t: 's', s: { font: F(8), alignment: AL } }
    ft[19] = { v: `${pi + 1}/${pages.length}`, t: 's', s: { font: F(10), alignment: { horizontal: 'left', vertical: 'center' } } }
    wsData.push(ft); merges.push({ s: { r: R, c: 1 }, e: { r: R, c: 18 } }); merges.push({ s: { r: R, c: 19 }, e: { r: R, c: 21 } }); R++; pushH(REG_RH.tel)

    const brk = blank(); brk[23] = { v: ' ', t: 's', s: { font: F9 } }
    wsData.push(brk); R++; pushH(REG_RH.brk)
  })

  return { wsData, merges, rowH };
};

// 1. 기존의 통합 대장 출력
const exportPayrollExcel = () => {
  const target = filteredPayrollList.value.length > 0 ? filteredPayrollList.value : payrollList.value
  if (target.length === 0) { alert('출력할 데이터가 없습니다.'); return }

  const [year, month] = selectedYearMonth.value.split('-')
  const payDateLabel = (() => {
    if (selectedPaymentDay.value) { const [y, m, d] = String(selectedPaymentDay.value).split('-'); return `지급일자 : ${y}년${m}월${d}일` }
    const dt = new Date(Number(year), Number(month), 10); return `지급일자 : ${dt.getFullYear()}년${String(dt.getMonth() + 1).padStart(2, '0')}월10일`
  })()

  const siteMap = new Map()
  target.forEach(e => {
    const key = e.sIdx ?? e.siteName ?? '-';
    if (!siteMap.has(key)) siteMap.set(key, { siteName: e.siteName || '소속없음', emps: [], isTotal: false })
    siteMap.get(key).emps.push(e)
  })
  const sites = [...siteMap.values()]

  const { wsData, merges, rowH } = generateExcelSheetData(sites, year, month, payDateLabel)

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!merges'] = merges
  ws['!cols'] = REG_COL_W.map(w => ({ wch: w }))
  ws['!rows'] = rowH
  ws['!margins'] = { left: 0, right: 0, top: 0, bottom: 0, header: 0, footer: 0 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `pays_${year}m${month}`)
  XLSX.writeFile(wb, `지급대장_${year}년${month}월.xlsx`)
}

// ── 모달 상태 관리 (단지별 출력용) ─────────────────────────
const isExportModalOpen = ref(false);
const isExportCancelled = ref(false);
const exportTotal = ref(0);
const exportProgress = ref(0);
const currentExportSiteName = ref('');

const cancelSiteExport = () => {
  isExportCancelled.value = true;
};

// 2. 단지별 개별 대장 비동기 출력
const exportPayrollExcelBySite = async () => {
  const target = filteredPayrollList.value.length > 0 ? filteredPayrollList.value : payrollList.value;
  if (target.length === 0) { alert('출력할 데이터가 없습니다.'); return; }

  const [year, month] = selectedYearMonth.value.split('-');
  const payDateLabel = (() => {
    if (selectedPaymentDay.value) { const [y, m, d] = String(selectedPaymentDay.value).split('-'); return `지급일자 : ${y}년${m}월${d}일` }
    const dt = new Date(Number(year), Number(month), 10); return `지급일자 : ${dt.getFullYear()}년${String(dt.getMonth() + 1).padStart(2, '0')}월10일`
  })();

  const siteMap = new Map();
  target.forEach(e => {
    const key = e.sIdx ?? e.siteName ?? '-';
    if (!siteMap.has(key)) siteMap.set(key, { siteName: e.siteName || '소속없음', emps: [], isTotal: true }); // 개별파일은 자기자신이 곧 합계
    siteMap.get(key).emps.push(e);
  });
  const sites = [...siteMap.values()];

  // 모달 초기화
  isExportCancelled.value = false;
  exportTotal.value = sites.length;
  exportProgress.value = 0;
  isExportModalOpen.value = true;

  // 브라우저 팝업 차단 안내
  alert("다운로드가 시작됩니다.\n※ 여러 개의 파일이 다운로드 되므로 브라우저 상단의 '다중 파일 다운로드 허용'을 꼭 선택해주세요.");

  // 비동기 딜레이 함수 (UI 렌더링 및 중단 버튼 입력을 위해 필수)
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < sites.length; i++) {
    if (isExportCancelled.value) break;

    const siteData = sites[i];
    currentExportSiteName.value = siteData.siteName;

    // UI가 업데이트 될 시간을 주고 파일 동시 다운로드 과부하 방지 (500ms 간격)
    await delay(500);

    if (isExportCancelled.value) break;

    try {
      const { wsData, merges, rowH } = generateExcelSheetData([siteData], year, month, payDateLabel);

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!merges'] = merges;
      ws['!cols'] = REG_COL_W.map(w => ({ wch: w }));
      ws['!rows'] = rowH;
      ws['!margins'] = { left: 0, right: 0, top: 0, bottom: 0, header: 0, footer: 0 };

      const wb = XLSX.utils.book_new();
      const safeSiteName = siteData.siteName.replace(/[\\/?*\[\]]/g, '_'); // 파일명 제한 문자 필터링

      XLSX.utils.book_append_sheet(wb, ws, `지급대장`);
      XLSX.writeFile(wb, `지급대장_${year}년${month}월_${safeSiteName}.xlsx`);

      exportProgress.value = i + 1;
    } catch (err) {
      console.error(`${siteData.siteName} 엑셀 생성 중 오류:`, err);
    }
  }

  if (!isExportCancelled.value) {
    currentExportSiteName.value = '모든 파일 출력 완료!';
    // 완료 후 1.5초 뒤 모달 자동 닫기
    setTimeout(() => {
      isExportModalOpen.value = false;
    }, 1500);
  }
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
    targetCodes.value = { pension: tax.pension_rate, health: tax.health_rate, longTerm: tax.long_term_care_rate, employment: tax.employment_rate };
  } catch(e) {}
};

const sortKey   = ref('');
const sortOrder = ref('asc');

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value   = key;
    sortOrder.value = 'asc';
  }
  currentPage.value = 1;
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
      </div>
    </div>

    <!-- ===== 단지별 출력 프로그래스 모달 ===== -->
    <div v-if="isExportModalOpen" class="export-modal-overlay">
      <div class="export-modal-box">
        <h3 class="modal-title"><i class="mdi mdi-microsoft-excel"></i> 단지별 엑셀 출력 중...</h3>

        <div class="modal-status-text">
          <span v-if="!isExportCancelled">{{ currentExportSiteName }} ({{ exportProgress }} / {{ exportTotal }})</span>
          <span v-else class="text-red font-bold">출력이 사용자에 의해 중단되었습니다.</span>
        </div>

        <div class="progress-container">
          <div class="progress-bar-fill" :style="{ width: `${(exportProgress / exportTotal) * 100}%` }" :class="{ 'bg-red': isExportCancelled }"></div>
        </div>

        <div class="modal-actions mt-4">
          <button v-if="exportProgress < exportTotal && !isExportCancelled" @click="cancelSiteExport" class="btn-cancel">
            <i class="mdi mdi-stop-circle-outline"></i> 중단하기
          </button>
          <button v-else @click="isExportModalOpen = false" class="btn-confirm">
            닫기
          </button>
        </div>
      </div>
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

/* 모달창 스타일 (진행 상황 바) */
.export-modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,0.6); z-index: 9999;
  display: flex; align-items: center; justify-content: center;
}
.export-modal-box {
  background: #fff; width: 400px; padding: 24px;
  border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  text-align: center;
}
.modal-title { font-size: 18px; font-weight: 700; color: #1f2937; margin-bottom: 16px; display:flex; align-items:center; justify-content: center; gap:8px;}
.modal-title i { color: #217346; font-size: 24px; }
.modal-status-text { font-size: 14px; color: #4b5563; margin-bottom: 12px; height: 20px;}
.progress-container { width: 100%; height: 12px; background-color: #e5e7eb; border-radius: 6px; overflow: hidden; }
.progress-bar-fill { height: 100%; background-color: #217346; transition: width 0.3s ease; }
.progress-bar-fill.bg-red { background-color: #ef4444 !important; }
.btn-cancel { padding: 8px 16px; border: none; background-color: #fee2e2; color: #b91c1c; border-radius: 6px; cursor: pointer; font-weight: 600; transition: background 0.2s; }
.btn-cancel:hover { background-color: #fca5a5; }
.btn-confirm { padding: 8px 24px; border: none; background-color: #e5e7eb; color: #374151; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-confirm:hover { background-color: #d1d5db; }
.mt-4 { margin-top: 20px; }

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
</style>