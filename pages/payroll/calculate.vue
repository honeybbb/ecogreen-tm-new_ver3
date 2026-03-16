<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";
import * as XLSX from 'xlsx'; // ← npm install xlsx 필요

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

const items = ref([]);
const payrollList = ref([]);
const isLoading = ref(false);
const dataMode = ref(''); // 'saved' | 'draft'

const targetCodes = ref({ pension: 4.5, health: 3.545, longTerm: 12.95, employment: 0.9 });

// ── 페이지네이션 상태 ──────────────────────────────
const currentPage = ref(1);
const pageSize    = ref(50);
const pageSizeOptions = [50, 100, 200, 500];

watch([selectedSite, selectedType, searchTerm, selectedYearMonth], () => {
  currentPage.value = 1;
});

// 2. 동적 컬럼
const payItems = computed(() => items.value.filter(item => item.groupCd === '04001'));
const deductionItems = computed(() => items.value.filter(item => item.groupCd === '04002'));

// 3. 필터링
const filteredPayrollList = computed(() =>
    payrollList.value.filter(p => {
      const siteMatch = selectedSite.value === '전체' || p.sIdx == selectedSite.value;
      const typeMatch = selectedType.value === '전체' || p.type == selectedType.value;
      const searchMatch = p.staff.toLowerCase().includes(searchTerm.value.toLowerCase());
      return siteMatch && typeMatch && searchMatch;
    })
);

const totalPages = computed(() => Math.ceil(filteredPayrollList.value.length / pageSize.value));

const pagedPayrollList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredPayrollList.value.slice(start, start + pageSize.value);
});

const pageNumbers = computed(() => {
  const total = totalPages.value;
  const cur   = currentPage.value;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  const delta = 2;
  const left  = Math.max(2, cur - delta);
  const right = Math.min(total - 1, cur + delta);
  pages.push(1);
  if (left > 2) pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  pages.push(total);
  return pages;
});

const goToPage = (page) => {
  if (typeof page === 'number' && page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
    document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const markAsDraft = (row) => {
  row.status = 2;
  row.selected = true;
};

const selectAll = computed({
  get: () => pagedPayrollList.value.length > 0 && pagedPayrollList.value.every(p => p.selected),
  set: (val) => { pagedPayrollList.value.forEach(p => p.selected = val); }
});

const statsInfo = computed(() => {
  const total = filteredPayrollList.value.length;
  let gross = 0, ded = 0;
  filteredPayrollList.value.forEach(p => {
    const c = calculateRowSummary(p);
    gross += c.gross;
    ded += c.ded;
  });
  return { total, gross, ded, net: gross - ded };
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
  if (row.originalBasePay === undefined) row.originalBasePay = row.payItems['04001001'] || 0;
  const basePay   = row.originalBasePay;
  const scheduled = Number(row.scheduledDays) || 1;
  const worked    = Number(row.workedDays) || 0;
  const absent    = Number(row.absentDays) || 0;
  const dailyWage = Math.floor(basePay / scheduled);
  if ((worked + absent) < scheduled) row.payItems['04001001'] = dailyWage * worked;
  else                                row.payItems['04001001'] = basePay - (dailyWage * absent);
  calculateInsurances(row);
};

const resetBasePay = (row) => {
  row.originalBasePay = row.payItems['04001001'] || 0;
  calculateInsurances(row);
};

const fetchCalculatedPay = async () => {
  const selectedRows = payrollList.value.filter(p => p.selected);
  if (selectedRows.length === 0) { alert('급여를 계산할 직원을 체크해주세요.'); return; }
  if (!selectedYearMonth.value)  { alert('급여 연월을 선택해주세요.'); return; }
  if (items.value.length === 0) await getWageCode();
  isLoading.value = true;
  try {
    const [year, month] = selectedYearMonth.value.split('-');
    const res = await axios.get('/api/v1/member/payroll/calculate', { params: { year, month } });
    if (res.data.result && res.data.data?.length > 0) {
      for (const row of selectedRows) {
        const calcData = res.data.data.find(c => c.idx === row.idx);
        if (!calcData) continue;
        let dbCheckedItems = {};
        if (calcData.checkedItems) {
          dbCheckedItems = typeof calcData.checkedItems === 'string'
              ? JSON.parse(calcData.checkedItems) : calcData.checkedItems;
        }
        row.payItems        = typeof calcData.payItems === 'string'
            ? JSON.parse(calcData.payItems || '{}') : (calcData.payItems || {});
        row.deductionItems  = {};
        row.deductionFlags  = {};
        row.workedDays      = calcData.workedDays;
        row.scheduledDays   = calcData.scheduledDays;
        row.absentDays      = calcData.absentDays;
        row.originalBasePay = undefined;
        deductionItems.value.forEach(i => {
          row.deductionFlags[i.itemCd] = dbCheckedItems[i.itemCd] !== false;
        });
        row.status = 2;
        await updatePayAsync(row);
      }
      dataMode.value = 'draft';
    }
  } finally { isLoading.value = false; }
};

const updatePayAsync = async (row) => {
  if (row.originalBasePay === undefined) row.originalBasePay = row.payItems['04001001'] || 0;
  const basePay   = row.originalBasePay;
  const scheduled = Number(row.scheduledDays) || 1;
  const worked    = Number(row.workedDays) || 0;
  const absent    = Number(row.absentDays) || 0;
  const dailyWage = Math.floor(basePay / scheduled);
  if ((worked + absent) < scheduled) row.payItems['04001001'] = dailyWage * worked;
  else                                row.payItems['04001001'] = basePay - (dailyWage * absent);
  await calculateInsurances(row);
};

const calculateInsurances = async (row) => {
  // ── 과세 급여 계산 (비과세 한도는 DB option에서 가져옴) ──
  let taxablePay = 0;
  payItems.value.forEach(item => {
    const amt   = Number(row.payItems[item.itemCd] || 0);
    const limit = item.taxFreeLimit; // 0이면 비과세 없음

    taxablePay += limit > 0
        ? Math.max(0, amt - limit)  // 한도 초과분만 과세
        : amt;                       // 전액 과세
  });

  // ── 보험료 계산 (기존 코드 그대로) ──────────────────────
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
  if (!confirm(`체크된 ${selectedRows.length}명의 정산 결과를 저장하시겠습니까?`)) return;
  try {
    const [saveYear, saveMonth] = selectedYearMonth.value.split('-');
    await Promise.all(selectedRows.map(row => {
      const c = calculateRowSummary(row);
      return axios.post(`/api/v1/member/payroll/month/${row.idx}`, {
        mIdx: row.idx, sIdx: row.sIdx, year: saveYear, month: saveMonth,
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

// ════════════════════════════════════════════════════════════
// ✅ 지급대장 엑셀 출력 함수 (SheetJS 방식 - npm install xlsx)
// ════════════════════════════════════════════════════════════
const exportPayrollExcel = () => {
  const target = filteredPayrollList.value.length > 0 ? filteredPayrollList.value : payrollList.value;
  if (target.length === 0) { alert('출력할 데이터가 없습니다.'); return; }

  const [year, month] = selectedYearMonth.value.split('-');
  const wb = XLSX.utils.book_new();

  const HEADER_BG = 'E6E6FA'; // 연보라
  const PAGE_SIZE  = 7;
  const pages = [];
  for (let i = 0; i < target.length; i += PAGE_SIZE) {
    pages.push(target.slice(i, i + PAGE_SIZE));
  }

  // ── 워크시트 데이터 배열 구성 ─────────────────────────────
  const wsData = [];
  const merges = [];
  const colWidths = [
    { wch: 1 },   // A
    { wch: 9.5 }, // B
    { wch: 3.4 }, // C
    { wch: 3.4 }, // D
    { wch: 3.4 }, // E
    { wch: 3.4 }, // F
    { wch: 12.3 },// G
    { wch: 6.7 }, // H
    { wch: 3.3 }, // I
    { wch: 2.6 }, // J
    { wch: 12.4 },// K
    { wch: 12.3 },// L
    { wch: 12.6 },// M
    { wch: 12.6 },// N
    { wch: 1.0 }, // O
    { wch: 11.3 },// P
    { wch: 12.6 },// Q
    { wch: 6.6 }, // R
    { wch: 4.9 }, // S
    { wch: 1.7 }, // T
    { wch: 2.3 }, // U
    { wch: 6.3 }, // V
  ];

  // 헬퍼: 빈 행 추가
  const emptyRow = () => new Array(22).fill('');

  const addMerge = (rowStart, colStart, rowEnd, colEnd) => {
    merges.push({ s: { r: rowStart, c: colStart }, e: { r: rowEnd, c: colEnd } });
  };

  let rowIdx = 0;

  for (let pgIdx = 0; pgIdx < pages.length; pgIdx++) {
    const pgEmps = pages[pgIdx];

    // ── 1행: 제목 ─────────────────────────────────────
    const titleRow = emptyRow();
    titleRow[9] = `${year}년 ${month.padStart(2,'0')}월 급여 지급대장`; // J열(idx=9)
    wsData.push(titleRow);
    addMerge(rowIdx, 9, rowIdx, 14); // J:O
    rowIdx++;

    // ── 2행: 지급일자 ─────────────────────────────────
    const dateRow = emptyRow();
    // 지급일자는 현재 날짜 기준 또는 별도 props로
    const payDate = `${year}년 ${month.padStart(2,'0')}월`;
    dateRow[9] = `지급일자 : ${year}년 ${String(parseInt(month)+1).padStart(2,'0')}월 10일`;
    wsData.push(dateRow);
    addMerge(rowIdx, 9, rowIdx, 14);
    rowIdx++;

    // ── 3행: 회사명 ───────────────────────────────────
    const companyRow = emptyRow();
    // 현장명은 선택된 사이트 기준
    const siteLabel = selectedSite.value !== '전체'
        ? (siteOptions.value?.find(s => s.idx == selectedSite.value)?.name || '')
        : (pgEmps[0]?.siteName || '');
    companyRow[1] = siteLabel;
    wsData.push(companyRow);
    rowIdx++;

    // ── 구분선 행 ─────────────────────────────────────
    wsData.push(emptyRow()); rowIdx++;

    // ── 그룹 타이틀 행 ───────────────────────────────
    const groupRow = emptyRow();
    groupRow[6]  = '지  급  내  역';   // G
    groupRow[13] = '공   제   내   역'; // N
    groupRow[17] = '합계';              // R
    groupRow[20] = '영수인';            // U
    wsData.push(groupRow);
    addMerge(rowIdx, 6, rowIdx, 12);  // G:M
    addMerge(rowIdx, 13, rowIdx, 16); // N:Q
    addMerge(rowIdx, 17, rowIdx, 19); // R:T
    addMerge(rowIdx, 20, rowIdx+5, 21); // U:V (6행 병합)
    rowIdx++;

    // ── 헤더 행 1 (사번행) ────────────────────────────
    const h1 = emptyRow();
    h1[1] = '사 원 번 호'; h1[2] = '입 사 일 자';
    h1[6] = '기본급'; h1[7] = '직책수당';
    h1[10] = '야간수당'; h1[11] = '연차수당'; h1[12] = '식대';
    h1[13] = '건강보험'; h1[14] = '장기요양보험'; h1[16] = '국민연금';
    wsData.push(h1);
    addMerge(rowIdx, 2, rowIdx, 5);  // C:F
    addMerge(rowIdx, 7, rowIdx, 9);  // H:J
    addMerge(rowIdx, 14, rowIdx, 15); // O:P
    rowIdx++;

    // ── 헤더 행 2 (직위행) ────────────────────────────
    const h2 = emptyRow();
    h2[1] = '직위'; h2[2] = '경'; h2[3] = '부'; h2[4] = '7';
    h2[6] = '기타수당'; h2[7] = '근로자의날수당'; h2[10] = '대근비';
    h2[13] = '고용보험'; h2[14] = '기타공제'; h2[16] = '환급소득세';
    wsData.push(h2);
    addMerge(rowIdx, 2, rowIdx, 3); // C:D
    addMerge(rowIdx, 4, rowIdx, 5); // E:F
    addMerge(rowIdx, 7, rowIdx, 9);  // H:J
    addMerge(rowIdx, 14, rowIdx, 15); // O:P
    rowIdx++;

    // ── 헤더 행 3 (성명행) ────────────────────────────
    const h3 = emptyRow();
    h3[1] = '성명'; h3[2] = '배'; h3[3] = '20'; h3[4] = '60'; h3[5] = '장';
    h3[13] = '환급주민세'; h3[14] = '신원보증보험료'; h3[16] = '피복비공제';
    h3[17] = '지급합계';
    wsData.push(h3);
    addMerge(rowIdx, 7, rowIdx, 9);  // H:J
    addMerge(rowIdx, 14, rowIdx, 15); // O:P
    addMerge(rowIdx, 17, rowIdx, 19); // R:T
    rowIdx++;

    // ── 헤더 행 4 (근로일수행) ────────────────────────
    const h4 = emptyRow();
    h4[1] = '근로일수'; h4[2] = '연장'; h4[4] = '야간';
    h4[17] = '공제합계';
    wsData.push(h4);
    addMerge(rowIdx, 2, rowIdx, 3); addMerge(rowIdx, 4, rowIdx, 5);
    addMerge(rowIdx, 7, rowIdx, 9);
    addMerge(rowIdx, 17, rowIdx, 19);
    rowIdx++;

    // ── 헤더 행 5 (근로시간행) ───────────────────────
    const h5 = emptyRow();
    h5[1] = '근로시간수'; h5[2] = '휴일';
    h5[13] = '소득세'; h5[14] = '지방소득세';
    h5[17] = '차인지급액';
    wsData.push(h5);
    addMerge(rowIdx, 2, rowIdx, 3); addMerge(rowIdx, 4, rowIdx, 5);
    addMerge(rowIdx, 7, rowIdx, 9);
    addMerge(rowIdx, 14, rowIdx, 15);
    addMerge(rowIdx, 17, rowIdx, 19);
    rowIdx++;

    // ── 직원 데이터 (1인 5행) ────────────────────────
    for (const emp of pgEmps) {
      const pay = emp.payItems || {};
      const ded = emp.deductionItems || {};
      const s   = calculateRowSummary(emp);

      // emp 행0
      const e0 = emptyRow();
      e0[1]=emp.id||''; e0[2]=emp.joinDate||'';
      e0[6]=n(pay['04001001']); e0[7]=n(pay['04001002']);
      e0[10]=n(pay['04001003']); e0[11]=n(pay['04001004']); e0[12]=n(pay['04001005']);
      e0[13]=n(ded['04002001']); e0[14]=n(ded['04002002']); e0[16]=n(ded['04002003']);
      wsData.push(e0);
      addMerge(rowIdx,2,rowIdx,5); addMerge(rowIdx,7,rowIdx,9); addMerge(rowIdx,14,rowIdx,15);
      rowIdx++;

      // emp 행1
      const e1 = emptyRow();
      e1[1]=emp.role||''; e1[2]='0'; e1[3]='0'; e1[4]='0';
      e1[6]=n(pay['04001006']); e1[13]=n(ded['04002004']); e1[14]=n(ded['04002005']); e1[16]=n(ded['04002006']);
      wsData.push(e1);
      addMerge(rowIdx,2,rowIdx,5); addMerge(rowIdx,7,rowIdx,9); addMerge(rowIdx,14,rowIdx,15);
      rowIdx++;

      // emp 행2
      const e2 = emptyRow();
      e2[1]=emp.staff||emp.name||''; e2[3]='0'; e2[4]='0'; e2[5]='0';
      e2[13]=n(ded['04002007']); e2[14]=n(ded['04002008']); e2[16]=n(ded['04002009']);
      e2[17]=n(s.gross);
      wsData.push(e2);
      addMerge(rowIdx,3,rowIdx,5); addMerge(rowIdx,7,rowIdx,9);
      addMerge(rowIdx,14,rowIdx,15); addMerge(rowIdx,17,rowIdx,19);
      rowIdx++;

      // emp 행3
      const e3 = emptyRow();
      e3[1]=String(emp.workedDays||0); e3[2]='0.00'; e3[4]='0.00';
      e3[17]=n(s.ded);
      wsData.push(e3);
      addMerge(rowIdx,2,rowIdx,3); addMerge(rowIdx,4,rowIdx,5);
      addMerge(rowIdx,7,rowIdx,9); addMerge(rowIdx,17,rowIdx,19);
      rowIdx++;

      // emp 행4
      const e4 = emptyRow();
      e4[1]='209.00'; e4[2]='0.00';
      e4[13]=n(ded['04002013']); e4[14]=n(ded['04002014']);
      e4[17]=n(s.net);
      wsData.push(e4);
      addMerge(rowIdx,2,rowIdx,3); addMerge(rowIdx,4,rowIdx,5);
      addMerge(rowIdx,7,rowIdx,9); addMerge(rowIdx,14,rowIdx,15);
      addMerge(rowIdx,17,rowIdx,19);
      rowIdx++;
    }

    // ── 합계 (마지막 페이지에만) ─────────────────────
    if (pgIdx === pages.length - 1) {
      const allEmps  = target;
      const totalG   = allEmps.reduce((s,e) => s + calculateRowSummary(e).gross, 0);
      const totalD   = allEmps.reduce((s,e) => s + calculateRowSummary(e).ded, 0);
      const totalN   = allEmps.reduce((s,e) => s + calculateRowSummary(e).net, 0);
      const payTot   = {}; const dedTot = {};
      allEmps.forEach(e => {
        Object.entries(e.payItems||{}).forEach(([k,v]) => payTot[k]=(payTot[k]||0)+n(v));
        Object.entries(e.deductionItems||{}).forEach(([k,v]) => dedTot[k]=(dedTot[k]||0)+n(v));
      });

      for (let rep = 0; rep < 2; rep++) {
        const label = rep === 0 ? '부서계' : '합계';
        const s0=emptyRow(); s0[1]=label; s0[2]=siteLabel;
        s0[6]=n(payTot['04001001']); s0[7]=n(payTot['04001002']);
        s0[13]=n(dedTot['04002001']); s0[14]=n(dedTot['04002002']); s0[16]=n(dedTot['04002003']);
        wsData.push(s0);
        addMerge(rowIdx,2,rowIdx,5); addMerge(rowIdx,7,rowIdx,9); addMerge(rowIdx,14,rowIdx,15);
        rowIdx++;
        const s1=emptyRow(); s1[13]=n(dedTot['04002004']);
        wsData.push(s1); addMerge(rowIdx,7,rowIdx,9); addMerge(rowIdx,14,rowIdx,15); rowIdx++;
        const s2=emptyRow(); s2[14]=n(dedTot['04002005']); s2[17]=totalG;
        wsData.push(s2); addMerge(rowIdx,7,rowIdx,9); addMerge(rowIdx,14,rowIdx,15); addMerge(rowIdx,17,rowIdx,19); rowIdx++;
        const s3=emptyRow(); s3[17]=totalD;
        wsData.push(s3); addMerge(rowIdx,7,rowIdx,9); addMerge(rowIdx,17,rowIdx,19); rowIdx++;
        const s4=emptyRow(); s4[2]=`${allEmps.length}명`; s4[13]=n(dedTot['04002013']); s4[14]=n(dedTot['04002014']); s4[17]=totalN;
        wsData.push(s4); addMerge(rowIdx,2,rowIdx,3); addMerge(rowIdx,7,rowIdx,9); addMerge(rowIdx,14,rowIdx,15); addMerge(rowIdx,17,rowIdx,19); rowIdx++;
      }
    }

    // ── 페이지 하단 ──────────────────────────────────
    wsData.push(emptyRow()); rowIdx++;
    const fNote = emptyRow(); fNote[1] = '2026년 직장인건강검진 받아주시기 바랍니다.';
    wsData.push(fNote); rowIdx++;
    const fContact = emptyRow();
    fContact[1] = pgEmps[0]?.contact || '';
    fContact[19] = `${pgIdx+1}/${pages.length}`;
    wsData.push(fContact); rowIdx++;
    wsData.push(emptyRow()); rowIdx++;
  }

  // ── SheetJS 워크시트 생성 ────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!merges'] = merges;
  ws['!cols']   = colWidths;

  const sheetName = `pays_${year}m${month.padStart(2,'0')}`;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const fileName = `지급대장_${year}년${month.padStart(2,'0')}월.xlsx`;
  XLSX.writeFile(wb, fileName);
};

// 숫자 변환 헬퍼
const n = (v) => Number(v || 0);

/*
const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    items.value = res.data.data || [];
  } catch (err) { console.error("항목 로드 실패", err); }
};

 */
const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    items.value = (res.data.data || []).map(item => ({
      ...item,
      // option이 숫자 문자열이면 파싱, 없거나 0이면 비과세 없음
      taxFreeLimit: Number(item.option) || 0,
    }));
  } catch (err) { console.error("항목 로드 실패", err); }
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
    currentPage.value = 1;
  } catch (e) { payrollList.value = []; }
};

onMounted(async () => {
  await Promise.all([fetchSiteOptions(), fetchTypeOptions(), getTaxRate(), getWageCode()]);
  await getPayrollMonth();
});
</script>

<template>
  <div class="payroll-calc-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calculator-variant-outline"></i>
          직원 급여 정산
        </h1>
        <p class="page-subtitle">계약 급여와 실제 근무일을 대조하여 정산을 진행합니다</p>
      </div>
      <div class="header-actions">
        <button @click="fetchCalculatedPay" class="btn-calculate">
          <i class="mdi mdi-lightning-bolt-outline"></i>
          <span>선택 급여 계산</span>
        </button>
        <button @click="savePayroll" class="btn-save">
          <i class="mdi mdi-content-save-outline"></i>
          <span>선택 결과 저장</span>
        </button>
        <!-- ✅ 지급대장 출력 버튼 -->
        <button @click="exportPayrollExcel" class="btn-export">
          <i class="mdi mdi-microsoft-excel"></i>
          <span>지급대장 출력</span>
        </button>
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
          <label class="filter-label"><i class="mdi mdi-calendar-month-outline"></i> 급여연월</label>
          <input type="month" v-model="selectedYearMonth" class="filter-select" @change="getPayrollMonth"/>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 근무 현장</label>
          <select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-box-outline"></i> 구분</label>
          <select v-model="selectedType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
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
            <th rowspan="2" class="text-center" style="width:40px;">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="selectAll" class="custom-checkbox header-checkbox" />
              </label>
            </th>
            <th rowspan="2" class="text-center" style="width:50px;">No.</th>
            <th rowspan="2" class="text-center" style="width:140px;">현장명</th>
            <th rowspan="2" class="text-center" style="width:90px;">직책</th>
            <th rowspan="2" class="text-center" style="width:90px;">사번</th>
            <th rowspan="2" class="text-center" style="width:100px;">성명</th>
            <th rowspan="2" class="text-center" style="width:110px;">근무/기준</th>
            <th colspan="3" class="text-center group-header-summary">합계</th>
            <th :colspan="payItems.length" class="text-center group-header-pay">지급 항목</th>
            <th :colspan="deductionItems.length" class="text-center group-header-deduction">공제 항목</th>
          </tr>
          <tr>
            <th class="text-right sub-header">지급합계</th>
            <th class="text-right sub-header">공제합계</th>
            <th class="text-right sub-header">실지급액</th>
            <th v-for="item in payItems" :key="item.itemCd" class="text-right sub-header amount-header">{{ item.itemNm }}</th>
            <th v-for="item in deductionItems" :key="item.itemCd" class="text-right sub-header amount-header">{{ item.itemNm }}</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(p, index) in pagedPayrollList" :key="p.idx" class="data-row">
            <td
                class="text-center calculate-status transition-colors"
                :class="{
                    'calculate-active':   p.status == 1,
                    'calculate-draft':    p.status == 2,
                    'calculate-inactive': p.status == 0
                }">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="p.selected" class="custom-checkbox" />
              </label>
            </td>
            <td class="text-center text-gray">{{ (currentPage - 1) * pageSize + index + 1 }}</td>
            <td class="text-center text-dark">{{ p.siteName }}</td>
            <td class="text-center text-gray">{{ p.role }}</td>
            <td class="text-center text-gray">{{ p.id }}</td>
            <td class="text-center font-bold text-dark member-name">{{ p.staff }}</td>

            <td class="text-center">
              <div class="days-input-group">
                <input type="number" class="inline-input days-input" v-model.number="p.workedDays"
                       @input="markAsDraft(p); updatePay(p)" title="실제 일한 일수" />
                <span class="days-separator">/</span>
                <input type="number" class="inline-input days-input" v-model.number="p.scheduledDays"
                       @input="markAsDraft(p); updatePay(p)" title="한 달 기준 근무일수" />
              </div>
            </td>

            <td class="text-right bg-light-gray font-bold amount-cell">
              {{ formatCurrency(rowSummaryMap.get(p.idx)?.gross ?? 0) }}
            </td>
            <td class="text-right bg-light-gray font-bold text-red amount-cell">
              {{ formatCurrency(rowSummaryMap.get(p.idx)?.ded ?? 0) }}
            </td>
            <td class="text-right bg-light-gray font-bold text-blue amount-cell">
              {{ formatCurrency(rowSummaryMap.get(p.idx)?.net ?? 0) }}
            </td>

            <td v-for="item in payItems" :key="item.itemCd" class="amount-cell">
              <input type="number" v-model.number="p.payItems[item.itemCd]"
                     @input="markAsDraft(p); resetBasePay(p)" class="inline-input" />
            </td>
            <td v-for="item in deductionItems" :key="item.itemCd" class="amount-cell">
              <input type="number" v-model.number="p.deductionItems[item.itemCd]"
                     @input="markAsDraft(p)" class="inline-input" />
            </td>
          </tr>
          <tr v-if="filteredPayrollList.length === 0">
            <td :colspan="10 + payItems.length + deductionItems.length" class="empty-state">
              <i class="mdi mdi-calculator-variant-outline"></i>
              <p>조건에 맞는 급여 대상자가 없습니다.</p>
            </td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="table-footer sticky-footer">
            <td colspan="7" class="text-center"><span class="font-bold text-dark">전체 합계</span></td>
            <td class="text-right font-bold">{{ formatCurrency(statsInfo.gross) }}</td>
            <td class="text-right font-bold text-red">{{ formatCurrency(statsInfo.ded) }}</td>
            <td class="text-right font-bold text-blue">{{ formatCurrency(statsInfo.net) }}</td>
            <td :colspan="payItems.length" class="bg-light-gray border-none"></td>
            <td :colspan="deductionItems.length" class="bg-light-gray text-center border-none">
              <div class="net-pay-box">
                <span class="net-pay-label">실 지급액 합계</span>
                <span class="net-pay-value">{{ formatCurrency(statsInfo.net) }} 원</span>
              </div>
            </td>
          </tr>
          </tfoot>
        </table>
      </div>

      <div class="pagination-bar" v-if="totalPages > 1">
        <span class="pagination-info">
          {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredPayrollList.length) }} / 총 {{ filteredPayrollList.length }}명
        </span>
        <div class="pagination-controls">
          <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(1)" title="처음"><i class="mdi mdi-chevron-double-left"></i></button>
          <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)" title="이전"><i class="mdi mdi-chevron-left"></i></button>
          <template v-for="p in pageNumbers" :key="p">
            <span v-if="p === '...'" class="page-ellipsis">…</span>
            <button v-else class="page-btn" :class="{ active: p === currentPage }" @click="goToPage(p)">{{ p }}</button>
          </template>
          <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)" title="다음"><i class="mdi mdi-chevron-right"></i></button>
          <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(totalPages)" title="마지막"><i class="mdi mdi-chevron-double-right"></i></button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.table-scroll-container {
  overflow: auto; max-width: 100%; max-height: calc(100vh - 380px);
}
.table-scroll-container::-webkit-scrollbar { height: 8px; width: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.data-table { width: 100%; min-width: 1500px; border-collapse: collapse; font-size: 13px; }
.data-table thead { position: sticky; top: 0; z-index: 30; }
.data-table th:last-child, .data-table td:last-child { border-right: none; }

.group-header-summary, .group-header-pay, .group-header-deduction {
  background-color: var(--bg-canvas); border-bottom: 1px solid var(--border-color);
}
.sub-header { background-color: var(--bg-hover); border-bottom: 1px solid var(--border-color); }

.data-table td {
  padding: 8px 10px; border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--bg-canvas); vertical-align: middle; word-break: keep-all;
}
.amount-header, .amount-cell { min-width: 110px; }

.data-row { background: var(--bg-surface); }
.data-row:hover { background-color: var(--primary-soft); }

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
  width: 100%; min-width: 90px; padding: 8px 10px; text-align: right;
  font-size: 13px; color: var(--text-main); font-weight: 500;
  border: 1px solid transparent; border-radius: 6px; background: transparent;
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
  background-color: var(--bg-surface); border-top: 2px solid var(--border-focus);
  box-shadow: 0 -4px 12px rgba(0,0,0,0.05);
}
.table-footer td { padding: 14px 10px; font-size: 14px; }
.net-pay-box {
  display: inline-flex; align-items: center; gap: 12px;
  background-color: var(--primary-soft); padding: 8px 20px; border-radius: 8px; border: 1px solid rgba(37, 99, 235, 0.2);
}
.net-pay-label { font-size: 13px; color: var(--primary); font-weight: 600; }
.net-pay-value { font-size: 18px; color: var(--primary); font-weight: 700; letter-spacing: 0.5px;}

.pagination-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-top: 1px solid var(--border-color);
  background: var(--bg-hover); flex-wrap: wrap; gap: 12px;
}
.pagination-info { font-size: 13px; color: var(--text-sub); }
.pagination-controls { display: flex; align-items: center; gap: 4px; }
.page-btn {
  min-width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-color); border-radius: 7px;
  background: var(--bg-surface); color: var(--text-sub);
  font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; padding: 0 6px;
}
.page-btn:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.page-btn.active { background: var(--primary); border-color: var(--primary); color: var(--text-inverse); font-weight: 700; }
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.page-btn i { font-size: 16px; }
.page-ellipsis { min-width: 30px; text-align: center; font-size: 14px; color: var(--text-muted); letter-spacing: 1px; }

@media (max-width: 768px) {
  .btn-calculate, .btn-export { flex: 1; justify-content: center; }
  .status-legend { width: 100%; justify-content: space-between; padding: 10px 0; }
  .header-right-controls { flex-direction: column; align-items: stretch !important; gap: 8px !important; }
}
</style>
