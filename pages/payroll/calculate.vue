<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";
import XLSX from 'xlsx-js-style'
import Pagination from "~/components/Pagination.vue";
import { useTableResize } from '~/composables/useTableResize.js';
import {calculateAge} from "~/utils/formatter.js";
import {formatCurrency} from "../../utils/formatter.js";

const {
  siteOptions,
  typeOptions,
  fetchSiteOptions,
  fetchTypeOptions
} = useApi();

// 1. 상태 관리
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const selectedYearMonth = ref(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
const searchTerm = ref('');
const selectedSite = ref('전체');
const selectedType = ref('전체');
const selectedStatus = ref('전체');
const selectedBilling = ref('전체');
const selectedPaymentDay = ref('');
const selectedPayHistory = ref(''); // "2025-04-10" 형태

const items = ref([]);
const payrollList = ref([]);
const isLoading = ref(false);
const dataMode = ref(''); // 'saved' | 'draft'
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
  // selectedPaymentDay,
  selectedPayHistory], () => {
    currentPage.value = 1;
});

// 2. 동적 컬럼
const payItems       = computed(() => items.value.filter(i => i.groupNm === '지급항목'));
const deductionItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));

// 3. 필터링 및 정렬
const filteredPayrollList = computed(() => {
  const filtered = payrollList.value.filter(p =>
      (selectedSite.value === '전체' || p.sIdx == selectedSite.value) &&
      (selectedType.value === '전체' || p.type === selectedType.value) &&
      (selectedStatus.value === '전체' || p.mStatus == selectedStatus.value) &&
      // (selectedPaymentDay.value === '' || String(p.payment_day) === String(Number(selectedPaymentDay.value.split('-')[2]))) &&
      (selectedPayHistory.value === '' || (() => {
        const [y, m, d] = selectedPayHistory.value.split('-');
        return String(p.year) === y
            && String(p.month) === String(Number(m))
            && String(p.payment_day) === String(Number(d));
      })()) &&
      (selectedBilling.value === '전체' || p.billingManager === selectedBilling.value) &&
      p.staff.toLowerCase().includes(searchTerm.value.toLowerCase())
  );

  filtered.sort((a, b) => {
    // 사용자 클릭 정렬 (직책 컬럼 클릭 시 문자열 정렬 등)
    if (sortKey.value) {
      const mod = sortOrder.value === 'asc' ? 1 : -1;
      const valA = a[sortKey.value] ?? '';
      const valB = b[sortKey.value] ?? '';

      if (sortKey.value === 'birthDt') {
        return valB.localeCompare(valA) * mod;   // 생년월일은 역순 처리 유지
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

    // 1. 현장 내림차순 (s.idx)
    if (a.sIdx !== b.sIdx) return Number(b.sIdx) - Number(a.sIdx);

    // 2. 직책 sort 오름차순 (c.sort ASC) → NULL은 가장 뒤로
    const sortA = a.sort != null ? Number(a.sort) : 999999;
    const sortB = b.sort != null ? Number(b.sort) : 999999;
    if (sortA !== sortB) return sortA - sortB;

    // 3. 직원 idx 오름차순
    return Number(a.idx) - Number(b.idx);
  });

  return filtered;
});

// 저장 완료된 지급내역 옵션 목록
const payHistoryOptions = computed(() => {
  const seen = new Set();
  const options = [];
  const [year, month] = selectedYearMonth.value.split('-'); // ← 여기서 가져오기

  payrollList.value.forEach(p => {
    if (p.status == 1 && p.payment_day != null) {
      const key = `${year}-${month}-${String(p.payment_day).padStart(2,'0')}`;
      if (!seen.has(key)) {
        seen.add(key);
        options.push({
          value: key,
          label: `${year}년 ${month}월 ${Number(p.payment_day)}일 지급분`
        });
      }
    }
  });

  return options.sort((a, b) => a.value.localeCompare(b.value));
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

// ── 4대보험 예외(경고) 상태 계산 ───────────────────
// ── 4대보험 예외(경고) 상태 계산 (저장 대기 상태일 때만 동작) ───────────────────
const getInsuranceWarning = (row) => {
  // '저장 대기' (수정 중) 상태가 아니면 경고 무시
  if (row.status !== 2) return { type: 'normal', message: '' };

  const age = calculateAge(row.birthDt);
  if (!age) return { type: 'normal', message: '' };

  const ded = row.deductionItems || {};

  // 케이스 1: 국민연금 강제 해제 (위험 - 빨간색)
  if (age < ageLimits.value.pension && (!ded['04002003'] || ded['04002003'] === 0)) {
    return {
      type: 'danger',
      message: '국민연금 대상자이나 임의로 해제되었습니다.'
    };
  }

  // 케이스 2: 고용보험 고용확대 (특이사항 - 파란색)
  if (age >= ageLimits.value.employment && ded['04002004'] > 0) {
    return {
      type: 'info',
      message: '고용보험 가입 연령이 지났으나 임의 가입(고용확대) 되었습니다.'
    };
  }

  // 케이스 3: 건강보험 강제 해제 (주의 - 주황색)
  if (!ded['04002001'] || ded['04002001'] === 0) {
    return {
      type: 'warning',
      message: '건강보험이 임의로 해제되었습니다.'
    };
  }

  return { type: 'normal', message: '' };
};

const onInputAmount = (row, item, group, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  const rawValue = el.value.replace(/[^\d]/g, '');
  const numValue = Number(rawValue) || 0;

  if (group === 'pay') {
    row.payItems[item.itemCd] = numValue;
    if (item.itemCd === '04001001') {
      row.originalBasePay = numValue;
    }
  } else {
    row.deductionItems[item.itemCd] = numValue;
  }

  const formatted = formatCurrency(numValue);
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

// ── 전체 통계 & 합계 계산 ──────────────────────────────
const statsInfo = computed(() => {
  const total = filteredPayrollList.value.length;
  let gross = 0, ded = 0;

  // 개별 항목 합계를 담을 객체 추가
  let pay = {};
  let deduct = {};

  filteredPayrollList.value.forEach(p => {
    const c = calculateRowSummary(p);
    gross += c.gross;
    ded += c.ded;

    // 각 지급 항목별 합계 누적
    if (p.payItems) {
      payItems.value.forEach(i => {
        pay[i.itemCd] = (pay[i.itemCd] || 0) + (Number(p.payItems[i.itemCd]) || 0);
      });
    }

    // 각 공제 항목별 합계 누적
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

const updatePay = (row) => {
  backupOriginalPayItems(row)

  if (row.originalBasePay === undefined) {
    row.originalBasePay = row._originalPayItems['04001001'] || 0
  }

  const basePay   = row.originalBasePay
  const scheduled = Number(row.scheduledDays) || 1
  const worked    = Number(row.workedDays)    || 0
  const absent    = Number(row.absentDays)    || 0

  if (worked === 0) {
    payItems.value.forEach(item => {
      row.payItems[item.itemCd] = 0
    })
  } else {
    payItems.value.forEach(item => {
      row.payItems[item.itemCd] = row._originalPayItems[item.itemCd] || 0
    })

    const dailyWage = Math.floor(basePay / scheduled)
    row.payItems['04001001'] = (worked + absent) < scheduled
        ? dailyWage * worked
        : basePay - (dailyWage * absent)
  }

  calculateInsurances(row)
}

const resetBasePay = (row) => {
  row.originalBasePay = row.payItems['04001001'] || 0;
  calculateInsurances(row);
};

const resetCalculatedPay = () => {
  const selectedRows = payrollList.value.filter(p => p.selected);

  if (selectedRows.length === 0) {
    alert('초기화할 직원을 체크해주세요.');
    return;
  }

  if (!confirm('선택한 직원의 급여 계산 내역을 초기화하시겠습니까?\n(저장하지 않은 내역은 모두 0원으로 되돌아갑니다.)')) {
    return;
  }

  selectedRows.forEach(row => {
    row.status = 0;
    row.workedDays = 0;
    row.absentDays = 0;
    row.originalBasePay = undefined;

    if (row._originalPayItems) {
      delete row._originalPayItems;
    }

    payItems.value.forEach(item => {
      row.payItems[item.itemCd] = 0;
    });

    deductionItems.value.forEach(item => {
      row.deductionItems[item.itemCd] = 0;
    });

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
    const res = await axios.get('/api/v1/member/payroll/calculate', { params: { year, month } });
    if (res.data.result && res.data.data?.length > 0) {
      for (const row of selectedRows) {
        const calcData = res.data.data.find(c => c.idx === row.idx)
        if (!calcData) continue

        let dbCheckedItems = {}
        if (calcData.checkedItems) {
          dbCheckedItems = typeof calcData.checkedItems === 'string'
              ? JSON.parse(calcData.checkedItems)
              : calcData.checkedItems
        }

        row.payItems = typeof calcData.payItems === 'string'
            ? JSON.parse(calcData.payItems || '{}')
            : (calcData.payItems || {})

        row.deductionItems  = {}
        row.deductionFlags  = {}
        row.workedDays      = calcData.workedDays
        row.scheduledDays   = calcData.scheduledDays
        row.absentDays      = calcData.absentDays
        row.originalBasePay = undefined

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
  if (!row._originalPayItems) {
    row._originalPayItems = { ...row.payItems }
  }
}

const updatePayAsync = async (row) => {
  backupOriginalPayItems(row)

  if (row.originalBasePay === undefined) {
    row.originalBasePay = row._originalPayItems['04001001'] || 0
  }

  const basePay   = row.originalBasePay
  const scheduled = Number(row.scheduledDays) || 1
  const worked    = Number(row.workedDays)    || 0
  const absent    = Number(row.absentDays)    || 0

  if (worked === 0) {
    payItems.value.forEach(item => {
      row.payItems[item.itemCd] = 0
    })
  } else {
    payItems.value.forEach(item => {
      row.payItems[item.itemCd] = row._originalPayItems[item.itemCd] || 0
    })

    const dailyWage = Math.floor(basePay / scheduled)
    row.payItems['04001001'] = (worked + absent) < scheduled
        ? dailyWage * worked
        : basePay - (dailyWage * absent)
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

const calculateInsurances = async (row) => {
  let taxablePay = 0
  payItems.value.forEach(item => {
    const amt   = Number(row.payItems[item.itemCd] || 0)
    const limit = item.taxFreeLimit
    const taxed = limit > 0 ? Math.max(0, amt - limit) : amt
    taxablePay += taxed
  })

  if (!row.deductionItems) row.deductionItems = {};
  const rates = targetCodes.value;
  let incomeTax = 0, localTax = 0;

  if (row.deductionFlags['04002013']) {
    try {
      const year = new Date().getFullYear();
      const taxRes = await axios.get(`/api/v1/config/tax/income/${year}`, {
        params: { salary: taxablePay, familyCnt: row.familyCnt || 1, year }
      });
      incomeTax = taxRes.data?.incomeTax || 0;
      localTax  = taxRes.data?.localTax  || 0;
    } catch (e) { console.error('소득세 조회 실패', e); }
  }

  let healthAmt = 0;
  if (row.deductionFlags['04002001']) {
    healthAmt = Math.floor((taxablePay * (rates.health / 100)) / 10) * 10;
    row.deductionItems['04002001'] = healthAmt;
  } else {
    row.deductionItems['04002001'] = 0;
  }

  const calc = {
    '04002002': () => Math.floor((healthAmt * (rates.longTerm / 100)) / 10) * 10,
    '04002003': () => Math.floor((taxablePay * (rates.pension / 100)) / 10) * 10,
    '04002004': () => Math.floor((taxablePay * (rates.employment / 100)) / 10) * 10,
    '04002013': () => incomeTax,
    '04002014': () => localTax,
  };

  deductionItems.value.forEach(i => {
    if (i.itemCd === '04002001') return;
    if (!row.deductionFlags[i.itemCd]) { row.deductionItems[i.itemCd] = 0; return; }
    const fn = calc[i.itemCd];
    if (fn) row.deductionItems[i.itemCd] = fn();
  });
};

const savePayroll = async () => {
  const selectedRows = payrollList.value.filter(p => p.selected);
  if (selectedRows.length === 0) { alert('저장할 직원을 체크해주세요.'); return; }
  if (!selectedPaymentDay.value) { alert('적용할 실제 급여 지급일을 선택해주세요.'); return; }

  if (!confirm(`체크된 ${selectedRows.length}명의 정산 결과를 저장하시겠습니까?`)) return;
  try {
    const [saveYear, saveMonth] = selectedYearMonth.value.split('-');
    await Promise.all(selectedRows.map(row => {
      const c = calculateRowSummary(row);
      return axios.post(`/api/v1/member/payroll/month/${row.idx}`, {
        mIdx: row.idx,
        sIdx: row.sIdx,
        year: saveYear,
        month: saveMonth,
        payDt: selectedPaymentDay.value,
        grossPay: c.gross,
        deductions: c.ded,
        netPay: c.net,
        workedDays: row.workedDays,
        scheduledDays: row.scheduledDays,
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

const exportTransferExcel = () => {
  const rawTarget = filteredPayrollList.value.length > 0
      ? filteredPayrollList.value
      : payrollList.value;

  if (rawTarget.length === 0) { alert('출력할 데이터가 없습니다.'); return; }

  const [year, month] = selectedYearMonth.value.split('-');
  const wb = XLSX.utils.book_new();

  // [1] 데이터 정렬: 은행(1순위) -> 현장(2순위) -> 직책순서(3순위)
  const sortedTarget = [...rawTarget].sort((a, b) => {
    const bankA = a.bank || '기타';
    const bankB = b.bank || '기타';
    if (bankA !== bankB) return bankA.localeCompare(bankB, 'ko');

    const siteA = a.siteName || '';
    const siteB = b.siteName || '';
    if (siteA !== siteB) return siteA.localeCompare(siteB, 'ko');

    const sortA = a.sort != null ? Number(a.sort) : 999999;
    const sortB = b.sort != null ? Number(b.sort) : 999999;
    return sortA - sortB;
  });

  /**
   * ── 시트 생성 및 셀 병합 로직 헬퍼 ──────────────────────────────
   */
  const generateTransferSheet = (emps, isTotalSheet = false) => {
    const wsData = [];
    const merges = [];

    // 기본 헤더 생성
    wsData.push([null]);
    wsData.push([null, null, null, `${parseInt(month)}월분 급여이체`]);
    wsData.push([null]);
    wsData.push([null, '(주)에코그린티엠', null, null, null, null, `급여일자 : ${year}년 ${String(parseInt(month) + 1).padStart(2, '0')}월 10일`]);
    wsData.push([null]);
    wsData.push([null, '은행', '부서', null, '사번', null, null, '예금주', null, '생년월일', null, '계좌번호', null, null, null, '입금액']);

    let currentRow = 6; // 데이터가 시작되는 엑셀 행 번호 (0부터 시작)

    // 은행별 그룹핑
    const bankGroups = {};
    emps.forEach(emp => {
      const b = emp.bank || '기타';
      if (!bankGroups[b]) bankGroups[b] = {};
      const s = emp.siteName || '소속없음';
      if (!bankGroups[b][s]) bankGroups[b][s] = [];
      bankGroups[b][s].push(emp);
    });

    // 데이터 채우기 및 병합 계산
    Object.entries(bankGroups).forEach(([bankName, sites]) => {
      const bankStartRow = currentRow;

      Object.entries(sites).forEach(([siteName, siteEmps]) => {
        const siteStartRow = currentRow;

        siteEmps.forEach((emp) => {
          const s = calculateRowSummary(emp);
          wsData.push([
            null,
            bankName,
            siteName,
            null,
            emp.id || '',
            null, null,
            emp.staff || '',
            null,
            emp.birthDt ? emp.birthDt.replace(/-/g, '').substring(2, 8) : '',
            null,
            emp.accountNumber || '',
            null, null, null,
            s.net,
          ]);
          currentRow++;
        });

        // 부서계(현장계) 추가
        const siteTotal = siteEmps.reduce((sum, e) => sum + calculateRowSummary(e).net, 0);
        wsData.push([null, bankName, '부서계', null, null, null, null, null, null, null, null, `${siteEmps.length}건`, null, null, null, siteTotal]);

        // 부서명(현장명) 셀 병합 (부서 데이터 + 부서계 행까지)
        merges.push({ s: { r: siteStartRow, c: 2 }, e: { r: currentRow, c: 2 } });
        currentRow++;
      });

      // 은행계 추가
      const bankTotalNet = Object.values(sites).flat().reduce((sum, e) => sum + calculateRowSummary(e).net, 0);
      const bankTotalCnt = Object.values(sites).flat().length;
      wsData.push([null, bankName, '은행계', null, null, null, null, null, null, null, null, `${bankTotalCnt}건`, null, null, null, bankTotalNet]);

      // [핵심] 은행 셀 병합 (은행 데이터 시작점부터 은행계 행까지)
      merges.push({ s: { r: bankStartRow, c: 1 }, e: { r: currentRow, c: 1 } });
      currentRow++;
    });

    // 최종 합계
    const grandTotal = emps.reduce((sum, e) => sum + calculateRowSummary(e).net, 0);
    wsData.push([null]);
    wsData.push([null, null, '총합계', null, null, null, null, null, null, null, null, `${emps.length}건`, null, null, null, grandTotal]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges; // 병합 정보 주입

    // 스타일 설정
    ws['!cols'] = [{wch:2},{wch:12},{wch:25},{wch:2},{wch:12},{wch:2},{wch:2},{wch:12},{wch:2},{wch:12},{wch:2},{wch:20},{wch:2},{wch:2},{wch:2},{wch:14}];

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 6; R <= range.e.r; R++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: 15 })];
      if (cell && cell.t === 'n') cell.z = '#,##0';
    }

    // 셀 상하좌우 중앙 정렬 스타일 (병합된 셀 때문)
    for (let R = 6; R <= range.e.r; R++) {
      [1, 2].forEach(C => { // 은행, 부서 열
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell) {
          cell.s = { alignment: { vertical: 'center', horizontal: 'center' } };
        }
      });
    }

    return ws;
  };

  // 1. 첫 번째 시트: 은행별로 정렬 및 병합된 전체 리스트 (10일자)
  XLSX.utils.book_append_sheet(wb, generateTransferSheet(sortedTarget, true), "10일자");

  // 2. 은행별 개별 시트
  const banks = [...new Set(sortedTarget.map(e => e.bank || '기타'))].sort();
  banks.forEach(bankName => {
    const bankEmps = sortedTarget.filter(e => (e.bank || '기타') === bankName);
    XLSX.utils.book_append_sheet(wb, generateTransferSheet(bankEmps), bankName.substring(0, 31));
  });

  XLSX.writeFile(wb, `급여이체리스트_${year}년${month.padStart(2,'0')}월.xlsx`);
};

const exportPayrollExcel = () => {
  const target = filteredPayrollList.value.length > 0 ? filteredPayrollList.value : payrollList.value
  if (target.length === 0) { alert('출력할 데이터가 없습니다.'); return }

  const [year, month] = selectedYearMonth.value.split('-')
  const wb = XLSX.utils.book_new()

  const siteGroups = []
  target.forEach(emp => {
    const last = siteGroups[siteGroups.length - 1]
    if (!last || last[0].siteName !== emp.siteName) siteGroups.push([emp])
    else last.push(emp)
  })

  const PAGE_SIZE = 7
  const pages = []
  siteGroups.forEach(group => {
    for (let i = 0; i < group.length; i += PAGE_SIZE) {
      pages.push({
        emps:        group.slice(i, i + PAGE_SIZE),
        siteName:    group[0].siteName,
        isLastPage:  i + PAGE_SIZE >= group.length,
        siteGroup:   group,
      })
    }
  })

  const FH = { patternType: 'solid', fgColor: { rgb: 'E6E6FA' } }
  const FN = { patternType: 'none' }
  const FB  = { name: '맑은 고딕', sz: 9, bold: true }
  const FN9 = { name: '맑은 고딕', sz: 9 }
  const AC = { horizontal: 'center',      vertical: 'center' }
  const AR = { horizontal: 'right',       vertical: 'center' }
  const AL = { horizontal: 'left',        vertical: 'center' }
  const AD = { horizontal: 'distributed', vertical: 'center' }

  const T = (s) => ({ style: s })
  const TT = T('thin')
  const TM = T('medium')
  const TD = T('double')

  const bd = (t, b, l, r) => ({ top: t, bottom: b, left: l, right: r })

  const B = {
    hOL:  bd(TT, TT, TM, TT), hSL:  bd(TT, TT, TD, TT), hSR:  bd(TT, TT, TT, TD), hMid: bd(TT, TT, TT, TT),
    d0OL:  bd(TM, TT, TM, TT), d0SL:  bd(TM, TT, TD, TT), d0SR:  bd(TM, TT, TT, TD), d0Mid: bd(TM, TT, TT, TT), d0OR:  bd(TM, TT, TT, TM),
    dOL:  bd(TT, TT, TM, TT), dSL:  bd(TT, TT, TD, TT), dSR:  bd(TT, TT, TT, TD), dMid: bd(TT, TT, TT, TT), dOR:  bd(TT, TT, TT, TM),
    dbOL:  bd(TT, TM, TM, TT), dbSL:  bd(TT, TM, TD, TT), dbSR:  bd(TT, TM, TT, TD), dbMid: bd(TT, TM, TT, TT), dbOR:  bd(TT, TM, TT, TM),
  }

  const c = (v, font, fill, align, border) => ({
    v: v ?? '', t: typeof v === 'number' ? 'n' : 's',
    s: { font, fill, alignment: align, border }
  })
  const hc  = (v, font = FN9, align = AC, border = B.hMid) => c(v, font, FH, align, border)
  const dc  = (v, font = FN9, align = AC, border = B.dMid) => c(v, font, FN, align, border)
  const nc  = (v, border = B.dOL) => ({
    v: Number(v || 0), t: 'n', z: '#,##0',
    s: { font: FN9, fill: FN, alignment: AR, border }
  })
  const ec  = () => new Array(22).fill(null).map(() => ({ v: '', t: 's', s: { font: FN9, fill: FN } }))

  const wsData = []
  const merges = []
  const mg = (rs, cs, re, ce) => merges.push({ s: { r: rs, c: cs }, e: { r: re, c: ce } })
  let R = 0

  for (let pgIdx = 0; pgIdx < pages.length; pgIdx++) {
    const { emps: pgEmps, siteName: siteLabel, isLastPage, siteGroup } = pages[pgIdx]
    const sitePages    = pages.filter(p => p.siteName === siteLabel)
    const sitePageNo   = sitePages.findIndex((_, i) => pages.indexOf(sitePages[i]) === pgIdx) + 1
    const siteTotalPg  = sitePages.length

    const r0 = ec()
    r0[9] = { v: `${year}년 ${month.padStart(2,'0')}월 급여 지급대장`, t: 's',
      s: { font: { name: '맑은 고딕', sz: 13, bold: true }, fill: FN, alignment: AC } }
    wsData.push(r0); mg(R,9,R,14); R++

    const r1 = ec()
    r1[9] = { v: `지급일자 : ${year}년 ${String(parseInt(month)+1).padStart(2,'0')}월 10일`, t: 's',
      s: { font: FN9, fill: FN, alignment: AC } }
    wsData.push(r1); mg(R,9,R,14); R++

    const r2 = ec()
    r2[1] = { v: siteLabel, t: 's', s: { font: FN9, fill: FN, alignment: AL } }
    wsData.push(r2); R++
    wsData.push(ec()); R++

    const rG = ec()
    rG[1]  = hc('', FN9, AC, bd(TM,TT,TM,TT)); rG[2]  = hc('', FN9, AC, bd(TM,TT,TT,TD))
    rG[3]  = hc('', FN9, AC, bd(TM,TT,TT,TT)); rG[4]  = hc('', FN9, AC, bd(TM,TT,TT,TT))
    rG[5]  = hc('', FN9, AC, bd(TM,TT,TT,TD)); rG[6]  = hc('지  급  내  역', FB, AC, bd(TM,TT,TD,TD))
    for (let i = 7; i <= 12; i++) rG[i] = hc('', FB, AC, bd(TM,TT,TT, i===12 ? TD : TT))
    rG[13] = hc('공   제   내   역', FB, AC, bd(TM,TT,TD,TD))
    for (let i = 14; i <= 16; i++) rG[i] = hc('', FB, AC, bd(TM,TT,TT, i===16 ? TD : TT))
    rG[17] = hc('합계', FN9, AC, bd(TM,TT,TD,TT))
    rG[18] = hc('', FN9, AC, bd(TM,TT,TT,TT)); rG[19] = hc('', FN9, AC, bd(TM,TT,TT,TT))
    rG[20] = hc('영수인', FN9, AC, bd(TM,TT,TT,TT)); rG[21] = hc('', FN9, AC, bd(TM,TT,TT,TM))
    wsData.push(rG)
    mg(R,1,R,1); mg(R,2,R,5); mg(R,6,R,12); mg(R,13,R,16)
    mg(R,17,R,19); mg(R,20,R+5,21); R++

    const h0 = ec()
    h0[1]  = hc('사 원 번 호', FN9, AC, bd(TT,TT,TM,TT))
    h0[2]  = hc('입 사 일 자', FN9, AC, bd(TT,TT,TT,TD))
    for (let i=3;i<=5;i++) h0[i] = hc('',FN9,AC,bd(TT,TT,TT,i===5?TD:TT))
    h0[6]  = hc('기본급',    FB, AD, B.hSL)
    h0[7]  = hc('직책수당',  FB, AD, B.hMid)
    for (let i=8;i<=9;i++) h0[i] = hc('',FB,AD,B.hMid)
    h0[10] = hc('야간수당',  FB, AD, B.hMid)
    h0[11] = hc('연차수당',  FB, AD, B.hMid)
    h0[12] = hc('식대',      FB, AD, B.hSR)
    h0[13] = hc('건강보험',  FB, AD, B.hSL)
    h0[14] = hc('장기요양보험',FB,AD, B.hMid)
    h0[15] = hc('',          FB, AD, B.hMid)
    h0[16] = hc('국민연금',  FB, AD, B.hSR)
    h0[17] = hc('',FN9,AD,bd(TT,TT,TD,TT))
    h0[18] = hc('',FN9,AD,B.hMid); h0[19] = hc('',FN9,AD,B.hMid)
    h0[20] = hc('',FN9,AC,bd(TT,TT,TT,TT)); h0[21] = hc('',FN9,AC,bd(TT,TT,TT,TM))
    wsData.push(h0); mg(R,2,R,5); mg(R,7,R,9); mg(R,14,R,15); R++

    const h1 = ec()
    h1[1]  = hc('직위',      FN9, AD, bd(TT,TT,TM,TT))
    h1[2]  = hc('경',        FN9, AC, B.hMid)
    h1[3]  = hc('부',        FN9, AC, B.hMid)
    h1[4]  = hc('7',         FN9, AC, B.hMid)
    h1[5]  = hc('',          FN9, AC, bd(TT,TT,TT,TD))
    h1[6]  = hc('기타수당',  FB, AD, B.hSL)
    h1[7]  = hc('근로자의날수당',FB,AD,B.hMid)
    for (let i=8;i<=9;i++) h1[i]=hc('',FB,AD,B.hMid)
    h1[10] = hc('대근비',    FB, AD, B.hMid)
    h1[11] = hc('',          FB, AD, B.hMid)
    h1[12] = hc('',          FB, AD, B.hSR)
    h1[13] = hc('고용보험',  FB, AD, B.hSL)
    h1[14] = hc('기타공제',  FB, AD, B.hMid)
    h1[15] = hc('',          FB, AD, B.hMid)
    h1[16] = hc('환급소득세',FB, AD, B.hSR)
    h1[17] = hc('',FN9,AD,bd(TT,TT,TD,TT))
    h1[18] = hc('',FN9,AD,B.hMid); h1[19] = hc('',FN9,AD,B.hMid)
    h1[20] = hc('',FN9,AC,bd(TT,TT,TT,TT)); h1[21] = hc('',FN9,AC,bd(TT,TT,TT,TM))
    wsData.push(h1); mg(R,2,R,3); mg(R,4,R,5); mg(R,7,R,9); mg(R,14,R,15); R++

    const h2 = ec()
    h2[1]  = hc('성명',      FN9, AD, bd(TT,TT,TM,TT))
    h2[2]  = hc('배',        FN9, AC, B.hMid)
    h2[3]  = hc('20 ',       FN9, AC, B.hMid)
    h2[4]  = hc('60 ',       FN9, AC, B.hMid)
    h2[5]  = hc('장',        FN9, AC, bd(TT,TT,TT,TD))
    for (let i=6;i<=12;i++) h2[i]=hc('',FB,AD, i===6?B.hSL:i===12?B.hSR:B.hMid)
    h2[13] = hc('환급주민세',FB, AD, B.hSL)
    h2[14] = hc('신원보증보험료',FB,AD,B.hMid)
    h2[15] = hc('',          FB, AD, B.hMid)
    h2[16] = hc('피복비공제',FB, AD, B.hSR)
    h2[17] = hc('지급합계',  FN9,AD,bd(TT,TT,TD,TT))
    h2[18] = hc('',FN9,AD,B.hMid); h2[19] = hc('',FN9,AD,B.hMid)
    h2[20] = hc('',FN9,AC,bd(TT,TT,TT,TT)); h2[21] = hc('',FN9,AC,bd(TT,TT,TT,TM))
    wsData.push(h2); mg(R,7,R,9); mg(R,14,R,15); mg(R,17,R,19); R++

    const h3 = ec()
    h3[1]  = hc('근로일수',  FN9, AD, bd(TT,TT,TM,TT))
    h3[2]  = hc('연장',      FN9, AD, B.hMid)
    h3[3]  = hc('',          FN9, AD, B.hMid)
    h3[4]  = hc('야간',      FN9, AD, B.hMid)
    h3[5]  = hc('',          FN9, AD, bd(TT,TT,TT,TD))
    for (let i=6;i<=12;i++) h3[i]=hc('',FB,AD, i===6?B.hSL:i===12?B.hSR:B.hMid)
    for (let i=13;i<=16;i++) h3[i]=hc('',FB,AD, i===13?B.hSL:i===16?B.hSR:B.hMid)
    h3[17] = hc('공제합계',  FN9,AD,bd(TT,TT,TD,TT))
    h3[18] = hc('',FN9,AD,B.hMid); h3[19] = hc('',FN9,AD,B.hMid)
    h3[20] = hc('',FN9,AC,bd(TT,TT,TT,TT)); h3[21] = hc('',FN9,AC,bd(TT,TT,TT,TM))
    wsData.push(h3); mg(R,2,R,3); mg(R,4,R,5); mg(R,7,R,9); mg(R,14,R,15); mg(R,17,R,19); R++

    const h4 = ec()
    h4[1]  = hc('근로시간수',FN9, AD, bd(TT,TT,TM,TT))
    h4[2]  = hc('휴일',      FN9, AD, B.hMid)
    h4[3]  = hc('',          FN9, AD, B.hMid)
    h4[4]  = hc('',          FN9, AD, B.hMid)
    h4[5]  = hc('',          FN9, AD, bd(TT,TT,TT,TD))
    for (let i=6;i<=12;i++) h4[i]=hc('',FB,AD, i===6?B.hSL:i===12?B.hSR:B.hMid)
    h4[13] = hc('소득세',    FB, AD, B.hSL)
    h4[14] = hc('지방소득세',FB, AD, B.hMid)
    h4[15] = hc('',          FB, AD, B.hMid)
    h4[16] = hc('',          FB, AD, B.hSR)
    h4[17] = hc('차인지급액',FN9,AD,bd(TT,TT,TD,TT))
    h4[18] = hc('',FN9,AD,B.hMid); h4[19] = hc('',FN9,AD,B.hMid)
    h4[20] = hc('',FN9,AC,bd(TT,TT,TT,TT)); h4[21] = hc('',FN9,AC,bd(TT,TT,TT,TM))
    wsData.push(h4); mg(R,2,R,3); mg(R,4,R,5); mg(R,7,R,9); mg(R,14,R,15); mg(R,17,R,19); R++

    for (const emp of pgEmps) {
      const pay = emp.payItems || {}
      const ded = emp.deductionItems || {}
      const s   = calculateRowSummary(emp)

      const e0 = ec()
      e0[1]  = dc(emp.id||'',     FN9, AC, B.d0OL)
      e0[2]  = dc(emp.inDate||'', FN9, AC, bd(TM,TT,TT,TD))
      e0[3]  = dc('',FN9,AC,bd(TM,TT,TT,TT))
      e0[4]  = dc('',FN9,AC,bd(TM,TT,TT,TT))
      e0[5]  = dc('',FN9,AC,bd(TM,TT,TT,TD))
      e0[6]  = nc(pay['04001001'], B.d0SL)
      e0[7]  = nc(pay['04001002'], B.d0Mid)
      e0[8]  = dc('',FN9,AC,B.d0Mid)
      e0[9]  = dc('',FN9,AC,B.d0Mid)
      e0[10] = nc(pay['04001003'], B.d0Mid)
      e0[11] = nc(pay['04001004'], B.d0Mid)
      e0[12] = nc(pay['04001005'], B.d0SR)
      e0[13] = nc(ded['04002001'], B.d0SL)
      e0[14] = nc(ded['04002002'], B.d0Mid)
      e0[15] = dc('',FN9,AC,B.d0Mid)
      e0[16] = nc(ded['04002003'], B.d0SR)
      e0[17] = dc('',FN9,AC,bd(TM,TT,TD,TT))
      e0[18] = dc('',FN9,AC,B.d0Mid); e0[19] = dc('',FN9,AC,B.d0Mid)
      e0[20] = dc('',FN9,AC,B.d0Mid); e0[21] = dc('',FN9,AC,B.d0OR)
      wsData.push(e0); mg(R,2,R,5); mg(R,7,R,9); mg(R,14,R,15); R++

      const e1 = ec()
      e1[1]  = dc(emp.role||'', FN9, AC, B.dOL)
      e1[2]  = dc('0',FN9,AC,B.dMid); e1[3]=dc('0',FN9,AC,B.dMid)
      e1[4]  = dc('0',FN9,AC,B.dMid); e1[5]=dc('',FN9,AC,B.dSR)
      e1[6]  = nc(pay['04001006'], B.dSL)
      e1[7]  = dc('',FN9,AC,B.dMid); e1[8]=dc('',FN9,AC,B.dMid); e1[9]=dc('',FN9,AC,B.dMid)
      e1[10] = dc('',FN9,AC,B.dMid); e1[11]=dc('',FN9,AC,B.dMid); e1[12]=dc('',FN9,AC,B.dSR)
      e1[13] = nc(ded['04002004'], B.dSL)
      e1[14] = nc(ded['04002005'], B.dMid)
      e1[15] = dc('',FN9,AC,B.dMid)
      e1[16] = nc(ded['04002006'], B.dSR)
      e1[17] = dc('',FN9,AC,bd(TT,TT,TD,TT))
      e1[18] = dc('',FN9,AC,B.dMid); e1[19]=dc('',FN9,AC,B.dMid)
      e1[20] = dc('',FN9,AC,B.dMid); e1[21]=dc('',FN9,AC,B.dOR)
      wsData.push(e1); mg(R,2,R,5); mg(R,7,R,9); mg(R,14,R,15); R++

      const e2 = ec()
      e2[1]  = dc(emp.staff||'', FN9, AC, B.dOL)
      e2[2]  = dc('',FN9,AC,B.dMid); e2[3]=dc('0',FN9,AC,B.dMid)
      e2[4]  = dc('0',FN9,AC,B.dMid); e2[5]=dc('0',FN9,AC,B.dSR)
      e2[6]  = dc('',FN9,AC,B.dSL)
      e2[7]  = dc('',FN9,AC,B.dMid); e2[8]=dc('',FN9,AC,B.dMid); e2[9]=dc('',FN9,AC,B.dMid)
      e2[10] = dc('',FN9,AC,B.dMid); e2[11]=dc('',FN9,AC,B.dMid); e2[12]=dc('',FN9,AC,B.dSR)
      e2[13] = nc(ded['04002007'], B.dSL)
      e2[14] = nc(ded['04002008'], B.dMid)
      e2[15] = dc('',FN9,AC,B.dMid)
      e2[16] = nc(ded['04002009'], B.dSR)
      e2[17] = nc(s.gross, bd(TT,TT,TD,TT))
      e2[18] = dc('',FN9,AC,B.dMid); e2[19]=dc('',FN9,AC,B.dMid)
      e2[20] = dc('',FN9,AC,B.dMid); e2[21]=dc('',FN9,AC,B.dOR)
      wsData.push(e2); mg(R,3,R,5); mg(R,6,R,9); mg(R,14,R,15); mg(R,17,R,19); R++

      const e3 = ec()
      e3[1]  = dc(String(emp.workedDays||0), FN9, AC, B.dOL)
      e3[2]  = dc('0.00',FN9,AC,B.dMid); e3[3]=dc('',FN9,AC,B.dMid)
      e3[4]  = dc('0.00',FN9,AC,B.dMid); e3[5]=dc('',FN9,AC,B.dSR)
      e3[6]  = dc('',FN9,AC,B.dSL)
      e3[7]  = dc('',FN9,AC,B.dMid); e3[8]=dc('',FN9,AC,B.dMid); e3[9]=dc('',FN9,AC,B.dMid)
      e3[10] = dc('',FN9,AC,B.dMid); e3[11]=dc('',FN9,AC,B.dMid); e3[12]=dc('',FN9,AC,B.dSR)
      e3[13] = dc('',FN9,AC,B.dSL)
      e3[14] = dc('',FN9,AC,B.dMid); e3[15]=dc('',FN9,AC,B.dMid); e3[16]=dc('',FN9,AC,B.dSR)
      e3[17] = nc(s.ded, bd(TT,TT,TD,TT))
      e3[18] = dc('',FN9,AC,B.dMid); e3[19]=dc('',FN9,AC,B.dMid)
      e3[20] = dc('',FN9,AC,B.dMid); e3[21]=dc('',FN9,AC,B.dOR)
      wsData.push(e3); mg(R,2,R,3); mg(R,4,R,5); mg(R,6,R,9); mg(R,17,R,19); R++

      const e4 = ec()
      e4[1]  = dc('209.00', FN9, AC, B.dbOL)
      e4[2]  = dc('0.00',FN9,AC,B.dbMid); e4[3]=dc('',FN9,AC,B.dbMid)
      e4[4]  = dc('',FN9,AC,B.dbMid); e4[5]=dc('',FN9,AC,B.dbSR)
      e4[6]  = dc('',FN9,AC,B.dbSL)
      e4[7]  = dc('',FN9,AC,B.dbMid); e4[8]=dc('',FN9,AC,B.dbMid); e4[9]=dc('',FN9,AC,B.dbMid)
      e4[10] = dc('',FN9,AC,B.dbMid); e4[11]=dc('',FN9,AC,B.dbMid); e4[12]=dc('',FN9,AC,B.dbSR)
      e4[13] = nc(ded['04002013'], B.dbSL)
      e4[14] = nc(ded['04002014'], B.dbMid)
      e4[15] = dc('',FN9,AC,B.dbMid)
      e4[16] = dc('',FN9,AC,B.dbSR)
      e4[17] = nc(s.net, bd(TT,TM,TD,TT))
      e4[18] = dc('',FN9,AC,B.dbMid); e4[19]=dc('',FN9,AC,B.dbMid)
      e4[20] = dc('',FN9,AC,B.dbMid); e4[21]=dc('',FN9,AC,B.dbOR)
      wsData.push(e4); mg(R,2,R,3); mg(R,4,R,5); mg(R,6,R,9); mg(R,14,R,15); mg(R,17,R,19); R++
    }

    if (isLastPage) {
      const allEmps = siteGroup
      const totalG  = allEmps.reduce((s,e) => s + calculateRowSummary(e).gross, 0)
      const totalD  = allEmps.reduce((s,e) => s + calculateRowSummary(e).ded,   0)
      const totalN  = allEmps.reduce((s,e) => s + calculateRowSummary(e).net,   0)
      const payTot  = {}; const dedTot = {}
      allEmps.forEach(e => {
        Object.entries(e.payItems||{}).forEach(([k,v]) => payTot[k]=(payTot[k]||0)+n(v))
        Object.entries(e.deductionItems||{}).forEach(([k,v]) => dedTot[k]=(dedTot[k]||0)+n(v))
      })

      for (let rep = 0; rep < 2; rep++) {
        const label = rep === 0 ? '부서계' : '합계'

        const s0 = ec()
        s0[1]  = dc(label,     FB, AC, B.d0OL)
        s0[2]  = dc(siteLabel, FB, AC, bd(TM,TT,TT,TD))
        s0[3]  = dc('',FN9,AC,bd(TM,TT,TT,TT)); s0[4]=dc('',FN9,AC,bd(TM,TT,TT,TT)); s0[5]=dc('',FN9,AC,bd(TM,TT,TT,TD))
        s0[6]  = nc(payTot['04001001'], B.d0SL)
        s0[7]  = nc(payTot['04001002'], B.d0Mid)
        s0[8]  = dc('',FN9,AC,B.d0Mid); s0[9]=dc('',FN9,AC,B.d0Mid)
        s0[10] = dc('',FN9,AC,B.d0Mid); s0[11]=dc('',FN9,AC,B.d0Mid); s0[12]=dc('',FN9,AC,B.d0SR)
        s0[13] = nc(dedTot['04002001'], B.d0SL)
        s0[14] = nc(dedTot['04002002'], B.d0Mid)
        s0[15] = dc('',FN9,AC,B.d0Mid)
        s0[16] = nc(dedTot['04002003'], B.d0SR)
        s0[17] = dc('',FN9,AC,bd(TM,TT,TD,TT))
        s0[18] = dc('',FN9,AC,B.d0Mid); s0[19]=dc('',FN9,AC,B.d0Mid)
        s0[20] = dc('',FN9,AC,B.d0Mid); s0[21]=dc('',FN9,AC,B.d0OR)
        wsData.push(s0); mg(R,2,R,5); mg(R,7,R,9); mg(R,14,R,15); R++

        const s1 = ec()
        s1[1]  = dc('',FN9,AC,B.dOL)
        s1[2]  = dc('',FN9,AC,B.dSR)
        s1[6]  = dc('',FN9,AC,B.dSL)
        s1[7]  = dc('',FN9,AC,B.dMid); s1[8]=dc('',FN9,AC,B.dMid); s1[9]=dc('',FN9,AC,B.dMid)
        s1[12] = dc('',FN9,AC,B.dSR)
        s1[13] = nc(dedTot['04002004'], B.dSL)
        s1[14] = dc('',FN9,AC,B.dMid); s1[15]=dc('',FN9,AC,B.dMid); s1[16]=dc('',FN9,AC,B.dSR)
        s1[17] = dc('',FN9,AC,bd(TT,TT,TD,TT))
        s1[18] = dc('',FN9,AC,B.dMid); s1[19]=dc('',FN9,AC,B.dMid)
        s1[20] = dc('',FN9,AC,B.dMid); s1[21]=dc('',FN9,AC,B.dOR)
        wsData.push(s1); mg(R,2,R,5); mg(R,6,R,9); mg(R,14,R,15); R++

        const s2 = ec()
        s2[1]  = dc('',FN9,AC,B.dOL)
        s2[2]  = dc('',FN9,AC,B.dSR)
        s2[6]  = dc('',FN9,AC,B.dSL)
        s2[7]  = dc('',FN9,AC,B.dMid); s2[8]=dc('',FN9,AC,B.dMid); s2[9]=dc('',FN9,AC,B.dMid)
        s2[12] = dc('',FN9,AC,B.dSR)
        s2[13] = dc('',FN9,AC,B.dSL)
        s2[14] = nc(dedTot['04002005'], B.dMid)
        s2[15] = dc('',FN9,AC,B.dMid); s2[16]=dc('',FN9,AC,B.dSR)
        s2[17] = nc(totalG, bd(TT,TT,TD,TT))
        s2[18] = dc('',FN9,AC,B.dMid); s2[19]=dc('',FN9,AC,B.dMid)
        s2[20] = dc('',FN9,AC,B.dMid); s2[21]=dc('',FN9,AC,B.dOR)
        wsData.push(s2); mg(R,2,R,5); mg(R,6,R,9); mg(R,14,R,15); mg(R,17,R,19); R++

        const s3 = ec()
        s3[1]  = dc('',FN9,AC,B.dOL)
        s3[2]  = dc('',FN9,AC,B.dSR)
        s3[6]  = dc('',FN9,AC,B.dSL)
        s3[7]  = dc('',FN9,AC,B.dMid); s3[8]=dc('',FN9,AC,B.dMid); s3[9]=dc('',FN9,AC,B.dMid)
        s3[12] = dc('',FN9,AC,B.dSR)
        s3[13] = dc('',FN9,AC,B.dSL)
        s3[14] = dc('',FN9,AC,B.dMid); s3[15]=dc('',FN9,AC,B.dMid); s3[16]=dc('',FN9,AC,B.dSR)
        s3[17] = nc(totalD, bd(TT,TT,TD,TT))
        s3[18] = dc('',FN9,AC,B.dMid); s3[19]=dc('',FN9,AC,B.dMid)
        s3[20] = dc('',FN9,AC,B.dMid); s3[21]=dc('',FN9,AC,B.dOR)
        wsData.push(s3); mg(R,2,R,5); mg(R,6,R,9); mg(R,17,R,19); R++

        const s4 = ec()
        s4[1]  = dc('',     FN9, AC, B.dbOL)
        s4[2]  = dc(`${allEmps.length}명`, FB, AC, B.dbMid)
        s4[3]  = dc('',FN9,AC,B.dbMid); s4[4]=dc('',FN9,AC,B.dbMid); s4[5]=dc('',FN9,AC,B.dbSR)
        s4[6]  = dc('',FN9,AC,B.dbSL)
        s4[7]  = dc('',FN9,AC,B.dbMid); s4[8]=dc('',FN9,AC,B.dbMid); s4[9]=dc('',FN9,AC,B.dbMid)
        s4[12] = dc('',FN9,AC,B.dbSR)
        s4[13] = nc(dedTot['04002013'], B.dbSL)
        s4[14] = nc(dedTot['04002014'], B.dbMid)
        s4[15] = dc('',FN9,AC,B.dbMid); s4[16]=dc('',FN9,AC,B.dbSR)
        s4[17] = nc(totalN, bd(TT,TM,TD,TT))
        s4[18] = dc('',FN9,AC,B.dbMid); s4[19]=dc('',FN9,AC,B.dbMid)
        s4[20] = dc('',FN9,AC,B.dbMid); s4[21]=dc('',FN9,AC,B.dbOR)
        wsData.push(s4); mg(R,2,R,3); mg(R,6,R,9); mg(R,14,R,15); mg(R,17,R,19); R++
      }
    }

    wsData.push(ec()); R++
    const fNote = ec()
    fNote[1] = { v: '2026년 직장인건강검진 받아주시기 바랍니다.', t: 's',
      s: { font: FN9, fill: FN, alignment: AL } }
    wsData.push(fNote); R++
    const fFoot = ec()
    fFoot[1]  = { v: pgEmps[0]?.contact || '', t: 's', s: { font: FN9, fill: FN, alignment: AL } }
    fFoot[19] = { v: `${sitePageNo}/${siteTotalPg}`, t: 's', s: { font: FN9, fill: FN, alignment: AR } }
    wsData.push(fFoot); R++
    wsData.push(ec()); R++
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!merges'] = merges
  ws['!cols'] = [
    {wch:1},{wch:9.5},{wch:3.4},{wch:3.4},{wch:3.4},{wch:3.4},
    {wch:12.3},{wch:6.7},{wch:3.3},{wch:2.6},{wch:12.4},{wch:12.3},
    {wch:12.6},{wch:12.6},{wch:1.0},{wch:11.3},{wch:12.6},
    {wch:6.6},{wch:4.9},{wch:1.7},{wch:2.3},{wch:6.3},
  ]

  const sheetName = `pays_${year}m${month.padStart(2,'0')}`
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `지급대장_${year}년${month.padStart(2,'0')}월.xlsx`)
}

const n = (v) => Number(v || 0);

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    const all = (res.data.data || []).filter(c => c.itemCd.startsWith('04'));

    // ── 1. itemCd → 노드 맵 ──────────────────────────
    const map = Object.fromEntries(all.map(c => [c.itemCd, c]));

    // ── 2. 부모 역할을 하는 코드 집합 ─────────────────
    const parentCds = new Set(all.map(c => c.groupCd));

    // ── 3. leaf 노드만 추출 (자식이 없는 최종 항목) ───
    const leaves = all.filter(c => !parentCds.has(c.itemCd));

    // ── 4. leaf의 04001/04002 직속 조상 탐색 ──────────
    const getTopAncestor = (itemCd) => {
      let cur = map[itemCd];
      while (cur) {
        const parent = map[cur.groupCd];
        // parent가 루트(04)이면 cur가 대분류
        if (!parent || parent.itemCd === parent.groupCd) return cur.itemCd;
        cur = parent;
      }
      return null;
    };

    // ── 5. groupNm 부여 ────────────────────────────────
    const GROUP_NM = {
      '04001': '지급항목',
      '04002': '공제항목',
      '04003': '정산항목',
    };

    items.value = leaves.map(leaf => ({
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
        .filter(name => name && name.trim() !== ''); // 빈 값이나 null 제거

    const uniqueManagers = [...new Set(allBillingManagers)]; // 중복 제거

    // 드롭다운에서 사용할 수 있도록 배열 형태({ value: '이름' })로 변환
    billingManager.value = uniqueManagers.map(name => ({ value: name }));
    currentPage.value = 1;
  } catch (e) { payrollList.value = []; }
};

// ── 현장 또는 귀속월 변경 시 지급일 자동 세팅 ──────────────────────────────
watch([selectedSite, selectedYearMonth], () => {
  // 1. 현장이 '전체'이거나, 사이트 옵션 데이터가 없으면 자동 세팅 생략
  if (selectedSite.value === '전체' || !siteOptions.value?.length) {
    return;
  }

  // 2. 선택한 현장의 정보 찾기
  // 주의: 'idx'와 'paymentDay'는 실제 API(siteOptions)의 키값에 맞게 수정해 주세요.
  const site = siteOptions.value.find(s => s.idx == selectedSite.value);

  // 3. 현장 정보에 급여일(dd)이 설정되어 있다면 다음 달 날짜로 계산
  if (site && site.payment_day) {
    const [y, m] = selectedYearMonth.value.split('-');
    const targetDay = Number(site.payment_day);

    // JS Date는 month가 0부터 시작하므로,
    // m(귀속월)을 그대로 넣으면 자동으로 +1달(다음 달)로 계산됩니다!
    // 예: 귀속월 2026-12 -> m은 12 -> new Date(2026, 12, 10) -> 2027-01-10 으로 자동 변환됨.
    const nextMonthDate = new Date(Number(y), Number(m), targetDay);

    const nextY = nextMonthDate.getFullYear();
    const nextM = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
    const nextD = String(nextMonthDate.getDate()).padStart(2, '0');

    // 계산된 날짜를 입력 폼에 덮어쓰기
    selectedPaymentDay.value = `${nextY}-${nextM}-${nextD}`;
  }
});

onMounted(async () => {
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
        <button @click="fetchCalculatedPay" class="btn-calculate">
          <i class="mdi mdi-lightning-bolt-outline"></i>
          <span>선택 급여 계산</span>
        </button>
        <button @click="savePayroll" class="btn-save">
          <i class="mdi mdi-content-save-outline"></i>
          <span>선택 결과 저장</span>
        </button>

        <!--button @click="exportTransferExcel" class="btn-save">
          <i class="mdi mdi-bank-transfer"></i>
          <span>이체 리스트 출력</span>
        </button>

        <button @click="exportPayrollExcel" class="btn-export">
          <i class="mdi mdi-microsoft-excel"></i>
          <span>지급대장 출력</span>
        </button-->
      </div>
    </div>

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
            <i class="mdi mdi-calendar-month-outline"></i> 급여연월
          </label>
          <input type="month" v-model="selectedYearMonth" class="filter-select" @change="getPayrollMonth"/>
        </div>
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-office-building-outline"></i> 근무 현장
          </label>
          <SiteSelect v-model="selectedSite" />
        </div>
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-account-cash"></i> 지급일
          </label>
          <input type="date" v-model="selectedPaymentDay" class="filter-select" />
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-account-cash"></i> 청구 담당
          </label>
          <select v-model="selectedBilling" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="b in billingManager" :key="b.value" :value="b.value">
              {{ b.value }}
            </option>
          </select>
        </div>

        <!--div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-cash-check"></i> 지급내역
          </label>
          <select v-model="selectedPayHistory" class="filter-select">
            <option value="">전체</option>
            <option v-for="opt in payHistoryOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div-->

        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-box-outline"></i> 구분</label>
          <select v-model="selectedType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-check"></i> 재직 상태</label>
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
            <input type="text" v-model="searchTerm" placeholder="이름으로 검색..." class="search-input" @keyup.enter="fetchCalculatedPay" />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear"><i class="mdi mdi-close"></i></button>
          </div>
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
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-1">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="selectAll" class="custom-checkbox" />
              </label>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-2" data-col-key="no">No.</th>
            <th rowspan="2" class="text-center sortable col-site sticky-col sticky-col-3" data-col-key="siteName" @click="toggleSort('siteName')">
              <div class="th-content">현장명<i v-if="sortKey==='siteName'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-4" data-col-key="role" @click="toggleSort('role')">
              <div class="th-content">직책<i v-if="sortKey==='role'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-5" data-col-key="id" @click="toggleSort('id')">
              <div class="th-content">사번<i v-if="sortKey==='id'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-6" data-col-key="staff" @click="toggleSort('staff')">
              <div class="th-content">성명<i v-if="sortKey==='staff'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-7">생년월일</th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-8" data-col-key="age" @click="toggleSort('birthDt')">
              <div class="th-content">나이(만)<i v-if="sortKey==='birthDt'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-9">입사일</th>
            <th rowspan="2" class="text-center sticky-col sticky-col-9">근무/기준</th>

            <th colspan="3" class="text-center group-header-summary group-divider sticky-col sticky-col-group">합계</th>

            <th :colspan="payItems.length" class="text-center group-header-pay theme-pay-header group-divider">
              지급 항목<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
            <th :colspan="deductionItems.length" class="text-center group-header-deduction theme-deduct-header group-divider">
              공제 항목<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
          </tr>
          <tr>
            <th class="text-right sub-header group-divider sticky-col sticky-col-10">지급합계</th>
            <th class="text-right sub-header sticky-col sticky-col-11">공제합계</th>
            <th class="text-right sub-header sticky-col sticky-col-12 sticky-divider">실지급액</th>

            <th v-for="(item, index) in payItems" :key="item.itemCd" :class="['text-right theme-pay-sub amount-header resizable', { 'group-divider': index === 0 }]">
              {{ item.itemNm }}<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
            <th v-for="(item, index) in deductionItems" :key="item.itemCd" :class="['text-right theme-deduct-sub amount-header resizable', { 'group-divider': index === 0 }]">
              {{ item.itemNm }}<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
          </tr>
          </thead>

          <tbody>
          <tr v-for="(p, index) in pagedPayrollList" :key="p.idx" class="data-row">
            <td class="text-center calculate-status transition-colors sticky-col sticky-col-1" :class="{'calculate-active': p.status == 1, 'calculate-draft': p.status == 2, 'calculate-inactive': p.status == 0}">
              <label class="checkbox-wrapper"><input type="checkbox" v-model="p.selected" class="custom-checkbox" /></label>
            </td>
            <td class="text-center text-gray sticky-col sticky-col-2">{{ (currentPage - 1) * pageSize + index + 1 }}</td>
            <td class="text-center text-dark compact-text cell-ellipsis sticky-col sticky-col-3" :title="p.siteName">{{ p.siteName }}</td>
            <td class="text-center text-gray compact-text cell-ellipsis sticky-col sticky-col-4" :title="p.role">{{ p.role }}</td>
            <td class="text-center text-gray compact-text cell-ellipsis sticky-col sticky-col-5" :title="p.id">{{ p.id }}</td>
            <td class="text-center font-bold text-dark member-name sticky-col sticky-col-6">{{ p.staff }}</td>
            <td class="text-center text-gray sticky-col sticky-col-7">{{ p.birthDt }}</td>
            <td class="text-center sticky-col sticky-col-8" style="overflow: visible !important;">
              <div class="tooltip-container" style="display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
                <span :class="[
                  'font-bold',
                  getInsuranceWarning(p).type === 'danger' ? 'text-red' :
                  getInsuranceWarning(p).type === 'warning' ? 'text-orange' :
                  getInsuranceWarning(p).type === 'info' ? 'text-blue' : 'text-gray'
                ]">
                  {{ calculateAge(p.birthDt) ? calculateAge(p.birthDt) + '세' : '-' }}
                </span>

                <i v-if="getInsuranceWarning(p).type !== 'normal'"
                   :class="[
                     'mdi',
                     getInsuranceWarning(p).type === 'danger' ? 'mdi-alert-circle text-red' :
                     getInsuranceWarning(p).type === 'warning' ? 'mdi-alert text-orange' :
                     'mdi-information text-blue'
                   ]"
                   style="font-size: 14px;">
                </i>

                <span v-if="getInsuranceWarning(p).type !== 'normal'" class="tooltip-text">
                  {{ getInsuranceWarning(p).message }}
                </span>

              </div>
            </td>
            <td class="text-center sticky-col sticky-col-9">{{p.inDate}}</td>

            <td class="text-center sticky-col sticky-col-9">
              <div class="days-input-group">
                <input type="number" class="inline-input days-input" v-model.number="p.workedDays" @focus="$event.target.select()" @input="markAsDraft(p); updatePay(p)" title="실제 일한 일수" />
                <span class="days-separator">/</span>
                <input type="number" class="inline-input days-input" v-model.number="p.scheduledDays" @focus="$event.target.select()" @input="markAsDraft(p); updatePay(p)" title="한 달 기준 근무일수" />
              </div>
            </td>

            <td class="text-right bg-light-gray font-bold amount-cell group-divider sticky-col sticky-col-10">
              {{ formatCurrency(rowSummaryMap.get(p.idx)?.gross ?? 0) }}
            </td>
            <td class="text-right bg-light-gray font-bold text-red amount-cell sticky-col sticky-col-11">
              {{ formatCurrency(rowSummaryMap.get(p.idx)?.ded ?? 0) }}
            </td>
            <td class="text-right bg-light-gray font-bold text-blue amount-cell sticky-col sticky-col-12 sticky-divider">
              {{ formatCurrency(rowSummaryMap.get(p.idx)?.net ?? 0) }}
            </td>

            <td v-for="(item, index) in payItems" :key="item.itemCd" :class="['amount-cell theme-pay-cell', { 'group-divider': index === 0 }]">
              <input type="text" :value="formatCurrency(p.payItems[item.itemCd])" @focus="$event.target.select()" @input="onInputAmount(p, item, 'pay', $event)" class="inline-input" />
            </td>
            <td v-for="(item, index) in deductionItems" :key="item.itemCd" :class="['amount-cell theme-deduct-cell', { 'group-divider': index === 0 }]">
              <input type="text" :value="formatCurrency(p.deductionItems[item.itemCd])" @focus="$event.target.select()" @input="onInputAmount(p, item, 'deduct', $event)" class="inline-input" />
            </td>
          </tr>
          <tr v-if="filteredPayrollList.length === 0">
            <td :colspan="12 + payItems.length + deductionItems.length" class="empty-state">
              <i class="mdi mdi-calculator-variant-outline"></i>
              <p>조건에 맞는 급여 대상자가 없습니다.</p>
            </td>
          </tr>
          </tbody>

          <tfoot>
          <tr class="table-footer sticky-footer">

            <td colspan="10" class="sticky-col sticky-col-span9" style="left:0; min-width: 700px; z-index: 35;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 16px;">
                <span class="font-bold text-dark">전체 합계</span>
                <div class="net-pay-box" style="padding: 4px 16px; background-color: var(--primary-soft); border-radius: 6px;">
                  <span class="net-pay-label" style="font-size: 12px; margin-right: 8px;">실 지급액 합계</span>
                  <span class="net-pay-value" style="font-size: 16px;">{{ formatCurrency(statsInfo.net) }} 원</span>
                </div>
              </div>
            </td>

            <td class="text-right font-bold group-divider sticky-col sticky-col-10">{{ formatCurrency(statsInfo.gross) }}</td>
            <td class="text-right font-bold text-red sticky-col sticky-col-11">{{ formatCurrency(statsInfo.ded) }}</td>
            <td class="text-right font-bold text-blue sticky-col sticky-col-12 sticky-divider">{{ formatCurrency(statsInfo.net) }}</td>

            <td v-for="(item, index) in payItems" :key="'foot-pay-' + item.itemCd"
                :class="['text-right font-bold text-blue bg-light-gray theme-pay-sub amount-cell', { 'group-divider': index === 0 }]">
              {{ formatCurrency(statsInfo.pay[item.itemCd] || 0) }}
            </td>

            <td v-for="(item, index) in deductionItems" :key="'foot-ded-' + item.itemCd"
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

/* 지급대장 출력 버튼 */
.btn-export {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
  background-color: #217346; /* 엑셀 그린 */
  color: #ffffff;
  box-shadow: var(--shadow-sm);
}
.btn-export:hover { filter: brightness(0.88); transform: translateY(-1px); }
.btn-export i { font-size: 18px; }

/* 계산 버튼 */
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

/* =========================================
   테이블 스크롤 & 레이아웃 코어 (투명도/깨짐 완벽 해결판)
========================================= */

.table-scroll-container {
  overflow-x: auto;
  max-width: 100%;
  max-height: calc(100vh - 350px);
  position: relative;
  background-color: #ffffff; /* 스크롤 뒷배경 하얗게 */
}
.table-scroll-container::-webkit-scrollbar { height: 8px; width: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.data-table {
  table-layout: fixed;
  width: max-content;
  min-width: 100%;

  /* border-collapse: separate 사용으로 틀고정 테두리 깨짐 방지 */
  border-collapse: separate;
  border-spacing: 0;
}

.data-table th, .data-table td {
  box-sizing: border-box;
  background-clip: padding-box;
  padding: 6px 6px;
  vertical-align: middle;
  /*
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
   */
}

.data-table tr td:first-child,
.data-table tr th:first-child {
  border-left: 1px solid var(--border-color);
}

.data-table th {
  position: relative;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-header-summary,
.group-header-pay,
.group-header-deduction {
  border-bottom: 1px solid var(--border-color);
}
.sub-header {
  border-bottom: 1px solid var(--border-color);
}

/* =========================================
   가로 스크롤 & 고정 너비 틀고정 (Sticky)
========================================= */
.sticky-col {
  position: sticky !important;
  z-index: 3;
  overflow: visible; /* 리사이즈 핸들용 */
}

/* 테이블 헤더 Z-index 및 불투명 배경 처리 */
thead .sticky-col {
  z-index: 50 !important;
  background-color: #f8fafc !important;
}
thead tr:nth-child(2) .sticky-col {
  background-color: #f1f5f9 !important;
}

tfoot .sticky-col {
  z-index: 35 !important;
  background-color: #f8fafc !important;
}

/* 각 컬럼 left 위치 고정 (가로 너비 총합: 700px -> 합계 그룹 3개 270px -> 총 970px) */
.sticky-col-1  { left: 0px;   min-width: 40px;  max-width: 40px;  width: 40px; }
.sticky-col-2  { left: 40px;  min-width: 40px;  max-width: 40px;  width: 40px; }
.sticky-col-3  { left: 80px;  min-width: 110px; max-width: 110px; width: 110px; }
.sticky-col-4  { left: 190px; min-width: 70px;  max-width: 70px;  width: 70px; }
.sticky-col-5  { left: 260px; min-width: 80px;  max-width: 80px;  width: 80px; }
.sticky-col-6  { left: 340px; min-width: 80px;  max-width: 80px;  width: 80px; }
.sticky-col-7  { left: 420px; min-width: 100px; max-width: 100px; width: 100px; }
.sticky-col-8  { left: 520px; min-width: 70px;  max-width: 70px;  width: 70px; }
.sticky-col-9  { left: 590px; min-width: 110px; max-width: 110px; width: 110px; }

/* tfoot의 "전체 합계" colspan=9 셀: 너비 700px (1~9 합산) 고정 */
tfoot .sticky-col-span9 {
  position: sticky !important;
  left: 0px;
  width: 700px;
  min-width: 700px;
  z-index: 35 !important;
  background-color: #f8fafc !important;
}

/* 합계 그룹 (상단 병합 헤더) -> 이전 너비 총합 700px */
.sticky-col-group { left: 700px; z-index: 41 !important; border-right: 2px solid var(--border-focus) !important; }

/* 10: 지급합계, 11: 공제합계, 12: 실지급액 */
.sticky-col-10 { left: 700px; min-width: 90px;  max-width: 90px;  width: 90px; }
.sticky-col-11 { left: 790px; min-width: 90px;  max-width: 90px;  width: 90px; }
.sticky-col-12 { left: 880px; min-width: 90px;  max-width: 90px;  width: 90px; }

/* 마지막 고정 컬럼 우측 경계선 효과 */
.sticky-divider {
  border-right: 2px solid var(--border-focus) !important;
}

/* =========================================
   데이터 상태별 배경색 덮어쓰기 (★글자 비침 방지를 위해 rgba 금지)
========================================= */

tr.data-row:has(td.calculate-inactive) .sticky-col {
  background-color: #ffffff !important;
}

tr.data-row:has(td.calculate-draft) td {
  background-color: rgba(245, 158, 11, 0.10); /* 우측 스크롤 영역 */
}
tr.data-row:has(td.calculate-draft) td.sticky-col {
  background-color: #fef3c7 !important; /* 고정 영역은 무조건 불투명 컬러 */
}

tr.data-row:has(td.calculate-active) td {
  background-color: rgba(16, 185, 129, 0.08); /* 우측 스크롤 영역 */
}
tr.data-row:has(td.calculate-active) td.sticky-col {
  background-color: #d1fae5 !important; /* 고정 영역은 무조건 불투명 컬러 */
}

/* 호버 시 sticky 셀도 같이 반응 */
tr.data-row:hover td.sticky-col {
  filter: brightness(0.97);
}

/* =========================================
   기타 컴포넌트 세부 스타일
========================================= */

.amount-header,
.amount-cell {
  width: 90px;
}

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
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 6px 4px;
  text-align: right;
  font-size: 13px;
  color: var(--text-main);
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.inline-input:hover { border-color: var(--border-focus); background: var(--bg-surface); }
.inline-input:focus { outline: none; border-color: var(--primary); background: var(--bg-surface); box-shadow: 0 0 0 3px var(--primary-soft); }

.checkbox-wrapper { display: flex; justify-content: center; align-items: center; cursor: pointer; }
.custom-checkbox {
  appearance: none; -webkit-appearance: none;
  width: 18px; height: 18px; border: 2px solid var(--border-focus); border-radius: 4px;
  cursor: pointer; position: relative; background: var(--bg-surface); margin: 0; transition: border-color 0.2s;
}
.custom-checkbox:hover { border-color: var(--text-muted); }
.custom-checkbox:checked { border-color: var(--primary); background-color: var(--primary); }
.custom-checkbox:checked::after {
  content: ''; position: absolute; top: 2px; left: 5px;
  width: 4px; height: 8px; border: solid var(--text-inverse); border-width: 0 2px 2px 0; transform: rotate(45deg);
}

.table-footer.sticky-footer {
  position: sticky; bottom: 0; z-index: 25;
  background-color: var(--bg-canvas);
  border-top: 2px solid var(--border-focus);
  box-shadow: 0 -4px 12px rgba(0,0,0,0.05);
}
.table-footer td { padding: 14px 10px; font-size: 14px; }
.net-pay-box {
  display: inline-flex; align-items: center; gap: 12px;
  background-color: var(--primary-soft); padding: 8px 20px;
  border-radius: 8px; border: 1px solid rgba(37, 99, 235, 0.2);
}
.net-pay-label { font-size: 13px; color: var(--primary); font-weight: 600; }
.net-pay-value { font-size: 18px; color: var(--primary); font-weight: 700; letter-spacing: 0.5px;}

.resize-handle {
  position: absolute;
  top: 0;
  right: -2px; /* 셀 경계선에 위치 */
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background-color: transparent;
  transition: background-color 0.2s ease;
}

/* 마우스를 올릴 때만 은은한 회색 선 표시 */
.resize-handle:hover,
.resize-handle:active {
  background-color: var(--border-focus);
}

/* 리사이즈 중일 때 커서 고정 */
body.is-resizing,
body.is-resizing * {
  cursor: col-resize !important;
  user-select: none !important;
}

@media (max-width: 768px) {
  .btn-calculate, .btn-export { flex: 1; justify-content: center; }
  .status-legend { width: 100%; justify-content: space-between; padding: 10px 0; }
  .header-right-controls { flex-direction: column; align-items: stretch !important; gap: 8px !important; }
}

.group-divider {
  border-left: 2px solid var(--border-color) !important;
}

.theme-pay-header {
  background-color: #f8fafc !important;
  border-top: 2px solid #3b82f6 !important;
  color: #1e40af !important;
}
.theme-pay-sub {
  border-bottom: 1px solid var(--border-color) !important;
}
.theme-pay-cell {
  background-color: transparent;
}

.theme-deduct-header {
  background-color: #fef2f2 !important;
  border-top: 2px solid #ef4444 !important;
  color: #991b1b !important;
}
.theme-deduct-sub {
  border-bottom: 1px solid var(--border-color) !important;
}
.theme-deduct-cell {
  background-color: transparent;
}

/* ── 현장 컬럼 기본 너비 및 말줄임표 ── */
.col-site {
  min-width: 80px;
  max-width: 160px;
  width: 120px;
}

/* td 말줄임표 */
.cell-ellipsis {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tooltip-container { position: relative; cursor: help; width: 100%; }
.tooltip-text {
  visibility: hidden; opacity: 0;
  position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%);
  background: var(--header-bg); color: var(--text-inverse);
  padding: 8px 12px; border-radius: 6px;
  font-size: 11px; line-height: 1.4; white-space: nowrap;
  z-index: 1000; box-shadow: var(--shadow-md);
  transition: opacity 0.15s; pointer-events: none;
  font-weight: 500;
}
.tooltip-text::after {
  content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 5px solid transparent; border-top-color: var(--header-bg);
}
.tooltip-container:hover .tooltip-text { visibility: visible; opacity: 1; }
</style>
