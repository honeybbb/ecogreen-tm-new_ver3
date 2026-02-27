<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import XLSX from 'xlsx-js-style';
import {useAuthStore} from "~/stores/auth.js";

const {
  siteOptions,
  typeOptions,
  fetchSiteOptions,
  fetchTypeOptions,
} = useApi();

// ------------------------------------------------------------------
// 1. 상태 변수
// ------------------------------------------------------------------
const today        = new Date();
const currentYear  = today.getFullYear();
const currentMonth = String(today.getMonth() + 1).padStart(2, '0');

const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const selectedYearMonth = ref(`${currentYear}-${currentMonth}`);
const selectedPayDate   = ref('');
const searchTerm        = ref('');
const selectedSite      = ref('전체');
const selectedType      = ref('전체');

const items       = ref([]);
const payrollList = ref([]);
const isLoading   = ref(false);
const showPrintModal = ref(false);
const dataMode    = ref('');

const targetCodes = ref({
  pension:    4.5,
  health:     3.545,
  longTerm:   12.95,
  employment: 0.9,
});

// ------------------------------------------------------------------
// 2. Computed
// ------------------------------------------------------------------
const payItems       = computed(() => items.value.filter(i => i.groupNm === '지급항목'));
const deductionItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));

const filteredPayrollList = computed(() =>
    payrollList.value.filter(p => {
      const siteMatch    = selectedSite.value    === '전체' || p.sIdx        == selectedSite.value;
      const typeMatch    = selectedType.value    === '전체' || p.type        == selectedType.value;
      const searchMatch  = p.staff.toLowerCase().includes(searchTerm.value.toLowerCase());
      const payDateMatch = selectedPayDate.value === ''    || p.payment_day == selectedPayDate.value;
      return siteMatch && typeMatch && searchMatch && payDateMatch;
    })
);

const totalSummary = computed(() => {
  const s = { gross: 0, ded: 0, net: 0 };
  filteredPayrollList.value.forEach(p => {
    const c = calculateRowSummary(p);
    s.gross += c.gross;
    s.ded   += c.ded;
    s.net   += c.net;
  });
  return s;
});

// ------------------------------------------------------------------
// 3. 유틸 / 핵심 계산
// ------------------------------------------------------------------
const formatCurrency = (v) => new Intl.NumberFormat('ko-KR').format(v ?? 0);

const calculateRowSummary = (row) => {
  let gross = 0, ded = 0;
  if (row.payments)   payItems.value.forEach(i      => { gross += Number(row.payments[i.itemCd]   || 0); });
  if (row.deductions) deductionItems.value.forEach(i => { ded   += Number(row.deductions[i.itemCd] || 0); });
  return { gross, ded, net: gross - ded };
};

// ── 주휴수당 계산 (프론트 자체 계산) ───────────────────────────
// 조건: 해당 월 결근 0일(만근) 시 지급
// 계산: 일급 × floor(월일수 / 7)
// 반환: 만근이면 주휴수당 금액, 아니면 0
const calcWeeklyHolidayPay = (row, grossPay) => {
  if (row.absentDays !== 0) return 0;           // 결근 있으면 미지급
  if (!grossPay || grossPay <= 0) return 0;

  const [year, month] = selectedYearMonth.value.split('-').map(Number);
  const daysInMonth   = new Date(year, month, 0).getDate();
  const dailyWage     = Math.round(grossPay / daysInMonth);
  const weeks         = Math.floor(daysInMonth / 7);
  return dailyWage * weeks;
};

// ── 기본급 항목에 주휴수당 포함하여 주입 ────────────────────────
const injectBasePay = (row, finalBaseSalary, grossPay) => {
  const basePayItem = payItems.value.find(i => i.itemCd === '04001001');
  if (!basePayItem) return;

  // 주휴수당 계산
  const weeklyHolidayPay = calcWeeklyHolidayPay(row, grossPay);

  // 기본급 = 일할계산된 기본급 + 주휴수당
  const totalBase = finalBaseSalary + weeklyHolidayPay;
  row.payments[basePayItem.itemCd] = totalBase;

  // 참고용으로 row에 저장 (툴팁 등에 활용 가능)
  row.weeklyHolidayPay   = weeklyHolidayPay;
  row.finalBaseSalary    = finalBaseSalary;
  row.basePayTotal       = totalBase; // 기본급 + 주휴수당 합산액
};

// 4대보험 자동 계산
const calculateInsurances = (row, sourceItem = null) => {
  let taxablePay = 0;
  if (row.payments) {
    payItems.value.forEach(item => {
      if (item.itemNm.includes('식대')) return;
      taxablePay += Number(row.payments[item.itemCd] || 0);
    });
  }

  const rates = targetCodes.value;

  const applyAll = () => {
    deductionItems.value.forEach(dedItem => {
      if (row.deductionFlags?.[dedItem.itemCd]) {
        applyDeductionLogic(row, dedItem, taxablePay, rates);
      } else {
        if (!row.deductions) row.deductions = {};
        row.deductions[dedItem.itemCd] = 0;
      }
    });
  };

  if (!sourceItem) { applyAll(); return; }

  const isPayItem = payItems.value.some(p => p.itemCd === sourceItem.itemCd);
  if (isPayItem) {
    applyAll();
  } else {
    if (!row.deductionFlags[sourceItem.itemCd]) {
      row.deductions[sourceItem.itemCd] = 0;
    } else {
      applyDeductionLogic(row, sourceItem, taxablePay, rates);
    }
    if (sourceItem.itemNm.includes('건강보험')) {
      const ltItem = deductionItems.value.find(i => i.itemNm.includes('장기요양'));
      if (ltItem && row.deductionFlags[ltItem.itemCd]) {
        applyDeductionLogic(row, ltItem, taxablePay, rates);
      }
    }
  }
};

const applyDeductionLogic = (row, item, calcAmount, rates) => {
  let amount = 0;
  if      (item.itemNm.includes('국민연금')) amount = calcAmount * (rates.pension    / 100);
  else if (item.itemNm.includes('건강보험')) amount = calcAmount * (rates.health     / 100);
  else if (item.itemNm.includes('장기요양')) {
    const healthItem = deductionItems.value.find(i => i.itemNm.includes('건강보험'));
    const healthAmt  = row.deductions[healthItem?.itemCd] || 0;
    amount = healthAmt * (rates.longTerm / 100);
  }
  else if (item.itemNm.includes('고용보험')) amount = calcAmount * (rates.employment / 100);
  else return;

  row.deductions[item.itemCd] = Math.floor(amount / 10) * 10;
};


const transformCalcResult = (calcList) => {
  return calcList.map(calc => {
    const payments       = {};
    const deductions     = {};
    const deductionFlags = {};

    // 공제 항목 초기화
    deductionItems.value.forEach(i => {
      deductions[i.itemCd]     = 0;
      deductionFlags[i.itemCd] = true;
    });

    // 지급 항목 초기화
    payItems.value.forEach(i => {
      payments[i.itemCd] = 0;
    });

    const row = {
      idx:            calc.idx,
      mIdx:           calc.idx,
      staff:          calc.staff          ?? '-',
      role:           calc.role           ?? '-',
      id:             calc.id             ?? '-',
      type:           calc.type           ?? '',
      siteName:       calc.siteName       ?? '-',
      sIdx:           calc.sIdx,
      payment_day:    calc.payment_day,
      scheduledDays:  calc.scheduledDays  ?? 0,
      workedDays:     calc.workedDays     ?? 0,
      absentDays:     calc.absentDays     ?? 0,
      totalWorkHours: calc.totalWorkHours ?? 0,
      // 주휴수당 계산을 위해 원본 기본급 계약액 저장
      grossPayContract: calc.grossPay     ?? 0,
      payments,
      deductions,
      deductionFlags,
    };

    // ① 기본급 + 주휴수당 합산 → 기본급 칸에 주입
    injectBasePay(row, calc.finalBaseSalary ?? 0, calc.grossPay ?? 0);

    // ② 야간수당(비과세) 주입 (경비직군 + 210h 이상 조건은 백엔드에서 판단)
    const nightItem = payItems.value.find(i => i.itemCd === '01001003');
    if (nightItem) payments[nightItem.itemCd] = calc.nightAllowance ?? 0;

    // ③ extraPaySum에서 기본급·야간수당 제외한 나머지 수당 배분
    //    백엔드 extraPaySum이 항목별로 쪼개져 있지 않으므로
    //    jsonData 항목별 값이 있으면 그걸 쓰고, 없으면 합계만 참고용으로 저장
    row.extraPaySum = calc.extraPaySum ?? 0;

    // ④ 4대보험 자동계산
    calculateInsurances(row);

    return row;
  });
};

// 저장된 데이터 → 프론트 포맷
const transformSavedResult = (rows) => {
  return rows.map(row => {
    let parsedPayments    = {};
    let parsedDeductions  = {};
    let deductionFlags    = {};

    try { parsedPayments   = typeof row.payItems       === 'string' ? JSON.parse(row.payItems)       : (row.payItems       || {}); } catch {}
    try { parsedDeductions = typeof row.deductionItems === 'string' ? JSON.parse(row.deductionItems) : (row.deductionItems || {}); } catch {}
    try {
      if (row.checkedItems) {
        deductionFlags = typeof row.checkedItems === 'string' ? JSON.parse(row.checkedItems) : row.checkedItems;
      }
    } catch (e) { console.warn('체크항목 파싱 에러', e); }

    if (Object.keys(deductionFlags).length === 0 && deductionItems.value.length > 0) {
      deductionItems.value.forEach(i => deductionFlags[i.itemCd] = true);
    }

    return { ...row, payments: parsedPayments, deductions: parsedDeductions, deductionFlags };
  });
};

// ------------------------------------------------------------------
// 5. API 통신
// ------------------------------------------------------------------
const getTaxRate = async () => {
  try {
    const res = await axios.get(`/api/v1/config/tax/rate/${currentYear}`);
    const taxList = res.data.data;
    if (taxList?.length > 0) {
      const t = taxList.find(t => Number(t.applied_year) === currentYear) || taxList[0];
      targetCodes.value = { pension: t.pension_rate, health: t.health_rate, longTerm: t.long_term_care_rate, employment: t.employment_rate };
    }
  } catch (e) { console.error('요율 로드 실패', e); }
};

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    items.value = res.data.data || [];
  } catch (e) { console.error('항목 로드 실패', e); }
};

// 저장된 급여 조회
const fetchMembers = async () => {
  isLoading.value = true;
  try {
    const [year, month] = selectedYearMonth.value.split('-');
    const res = await axios.get(`/api/v1/member/payroll/month`, { params: { year, month } });

    if (res.data.result && res.data.data?.length > 0) {
      payrollList.value = transformSavedResult(res.data.data);
      dataMode.value = 'saved';
    } else {
      payrollList.value = [];
      dataMode.value = '';
    }
  } catch (e) {
    console.error('데이터 로드 실패:', e);
    payrollList.value = [];
  } finally {
    isLoading.value = false;
  }
};

// 급여 계산 버튼
const fetchCalculatedPay = async () => {
  if (!selectedYearMonth.value) { alert('급여 연월을 선택해주세요.'); return; }
  isLoading.value = true;
  try {
    const [year, month] = selectedYearMonth.value.split('-');
    const res = await axios.get('/api/v1/member/payroll/calculate', {
      params: {
        year,
        month,
        // sIdx:       selectedSite.value !== '전체' ? selectedSite.value : undefined,
        // positionCd: selectedType.value !== '전체' ? selectedType.value : undefined,
      }
    });

    if (res.data.result && res.data.data?.length > 0) {
      payrollList.value = transformCalcResult(res.data.data);
      dataMode.value = 'draft';
      alert(`${res.data.data.length}명의 급여가 계산되었습니다.`);
    } else {
      alert(res.data.msg || '계산된 데이터가 없습니다.');
    }
  } catch (e) {
    console.error('급여 계산 실패:', e);
    alert('급여 계산 중 오류가 발생했습니다.');
  } finally {
    isLoading.value = false;
  }
};

// 저장
const savePayroll = async () => {
  if (!confirm('작성된 급여 정보를 저장하시겠습니까?')) return;
  const [year, month] = selectedYearMonth.value.split('-');
  try {
    const requests = payrollList.value.map(row => {
      const calc = calculateRowSummary(row);
      const cleanPay = {};
      const cleanDed = {};
      Object.keys(row.payments   || {}).forEach(k => { cleanPay[k] = Number(row.payments[k])    || 0; });
      Object.keys(row.deductions || {}).forEach(k => { cleanDed[k] = Number(row.deductions[k])  || 0; });

      return axios.post(`/api/v1/member/payroll/month/${row.mIdx}`, {
        mIdx:             row.mIdx,
        sIdx:             row.sIdx,
        year, month,
        workDays:         row.workedDays      ?? 0,
        scheduledDays:    row.scheduledDays   ?? 0,
        // 참고용으로 분리 저장 (DB 컬럼 있으면 활용)
        finalBaseSalary:  row.finalBaseSalary  ?? 0,
        weeklyHolidayPay: row.weeklyHolidayPay ?? 0,
        nightAllowance:   row.nightAllowance   ?? 0,
        grossPay:         calc.gross,
        deductions:       calc.ded,
        netPay:           calc.net,
        payItems:         JSON.stringify(cleanPay),
        deductionItems:   JSON.stringify(cleanDed),
        checkedItems:     JSON.stringify(row.deductionFlags || {}),
      });
    });

    await Promise.all(requests);
    alert('저장 완료되었습니다.');
    await fetchMembers();
  } catch (e) {
    console.error('저장 오류:', e);
    alert('저장 중 오류가 발생했습니다.');
  }
};

// ------------------------------------------------------------------
// 6. 출력 / 엑셀
// ------------------------------------------------------------------
const executePrint = () => { showPrintModal.value = false; setTimeout(() => window.print(), 300); };

const downloadExcel = () => {
  const wb = XLSX.utils.book_new();
  const wsData = [];
  wsData.push([]);
  wsData.push(["","","","","","","","","", `${selectedYearMonth.value.split('-')[0]}년 ${selectedYearMonth.value.split('-')[1]}월 급여 지급대장`]);
  wsData.push(["","","","","","","","","", `지급일자 : ${selectedPayDate.value ? currentYear + '년' + currentMonth + '월' + selectedPayDate.value + '일' : '-'}`]);
  wsData.push(["(주)에코그린티엠"]);
  wsData.push([]);
  wsData.push(["","","","","","","지  급  내  역","","","","","공  제  내  역","","","합계"]);

  const h1 = ["","사원번호","입사일자","","","",
    payItems.value[0]?.itemNm||"", payItems.value[1]?.itemNm||"","",
    payItems.value[2]?.itemNm||"", payItems.value[3]?.itemNm||"", payItems.value[4]?.itemNm||"",
    deductionItems.value[0]?.itemNm||"", deductionItems.value[1]?.itemNm||"","",deductionItems.value[2]?.itemNm||""];
  const h2 = ["","직위","경","부","7","",
    payItems.value[5]?.itemNm||"", payItems.value[6]?.itemNm||"","",
    payItems.value[7]?.itemNm||"","","",
    deductionItems.value[3]?.itemNm||"","기타공제","","환급소득세"];
  wsData.push(h1); wsData.push(h2);

  filteredPayrollList.value.forEach(p => {
    const calc = calculateRowSummary(p);
    const py = p.payments   || {};
    const de = p.deductions || {};
    wsData.push(["",p.id,p.joinDate||"-","","","",
      py[payItems.value[0]?.itemCd]||0, py[payItems.value[1]?.itemCd]||0,"",
      py[payItems.value[2]?.itemCd]||0, py[payItems.value[3]?.itemCd]||0, py[payItems.value[4]?.itemCd]||0,
      de[deductionItems.value[0]?.itemCd]||0, de[deductionItems.value[1]?.itemCd]||0,"",calc.gross]);
    wsData.push(["",p.role,"","","","",
      py[payItems.value[5]?.itemCd]||0, py[payItems.value[6]?.itemCd]||0,"",
      py[payItems.value[7]?.itemCd]||0,"","",
      de[deductionItems.value[3]?.itemCd]||0,0,"",calc.ded]);
    wsData.push(["",p.staff,"","","","","","","","","","","","","",calc.net]);
    wsData.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "지급대장");
  XLSX.writeFile(wb, `${selectedYearMonth.value}_급여지급대장.xlsx`);
  showPrintModal.value = false;
};

// ------------------------------------------------------------------
// 7. 라이프사이클
// ------------------------------------------------------------------
onMounted(async () => {
  await getWageCode();
  await getTaxRate();
  await fetchSiteOptions();
  await fetchTypeOptions();
  await fetchMembers();
});

watch(selectedYearMonth, () => fetchMembers());
</script>

<template>
  <div class="payroll-staff-list-page">
    <div class="screen-only">

      <div class="page-header">
        <h2 class="page-title">직원 급여 계산</h2>
        <span v-if="dataMode === 'saved'" class="badge badge-success">💾 저장된 데이터</span>
        <span v-else-if="dataMode === 'draft'" class="badge badge-warning">✏️ 미저장 (계산 초안)</span>
      </div>

      <div class="search-panel">
        <div class="input-group">
          <label class="input-label">급여연월:</label>
          <input type="month" v-model="selectedYearMonth" class="input-text" />
        </div>
        <div class="input-group">
          <label class="input-label">지급일:</label>
          <select v-model="selectedPayDate" class="input-text">
            <option value="">전체</option>
            <option v-for="day in 31" :key="day" :value="day">{{ day }}일</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label">근무현장:</label>
          <select v-model="selectedSite" class="input-select" style="min-width:150px;">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label">구분:</label>
          <select v-model="selectedType" class="input-select" style="min-width:150px;">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
          </select>
        </div>
        <div class="input-group search-term-group">
          <input type="text" v-model="searchTerm" placeholder="이름 검색..." class="input-text">
          <button class="btn btn-primary" @click="fetchMembers">검색</button>
        </div>
        <div style="flex:1;"></div>
        <div style="display:flex;gap:8px;">
          <button @click="fetchCalculatedPay" class="btn btn-success" :disabled="isLoading">
            {{ isLoading ? '계산 중...' : '💰 급여 계산' }}
          </button>
          <button @click="savePayroll" class="btn btn-success" :disabled="dataMode !== 'draft'">
            💾 저장하기
          </button>
          <button @click="showPrintModal = true" class="btn btn-dark">🖨️ 출력</button>
        </div>
      </div>

      <div v-if="isLoading" style="text-align:center;padding:40px;color:#3b82f6;font-weight:bold;">
        데이터를 불러오는 중입니다...
      </div>

      <div v-else class="table-container">
        <table class="data-table">
          <thead>
          <tr>
            <th rowspan="2" style="width:30px;"><input type="checkbox"></th>
            <th rowspan="2" style="width:50px;">No.</th>
            <th rowspan="2" style="width:120px;">현장명</th>
            <th rowspan="2" style="width:80px;">직책</th>
            <th rowspan="2" style="width:80px;">사번</th>
            <th rowspan="2" style="width:100px;">성명</th>
            <th rowspan="2" style="width:110px;">
              근무/기준
              <div style="font-size:0.7rem;color:#6b7280;font-weight:400;">(주휴 포함 여부)</div>
            </th>
            <th colspan="3" class="text-center group-header-summary">합계</th>
            <th :colspan="payItems.length" class="text-center group-header-pay">지급 항목</th>
            <th :colspan="deductionItems.length" class="text-center group-header-deduction">공제 항목</th>
          </tr>
          <tr>
            <th class="text-right">지급합계</th>
            <th class="text-right">공제합계</th>
            <th class="text-right">차인지급</th>
            <th v-for="item in payItems" :key="item.itemCd" class="text-right bg-pay-sub">{{ item.itemNm }}</th>
            <th v-for="item in deductionItems" :key="item.itemCd" class="text-right bg-ded-sub">{{ item.itemNm }}</th>
          </tr>
          </thead>

          <tbody>
          <tr v-if="filteredPayrollList.length === 0">
            <td :colspan="7 + 3 + payItems.length + deductionItems.length"
                style="text-align:center;padding:30px;color:#9ca3af;">
              급여 계산 버튼을 눌러 계산을 시작하세요.
            </td>
          </tr>
          <tr v-for="(p, index) in filteredPayrollList" :key="p.idx">
            <td class="text-center"><input type="checkbox"></td>
            <td class="text-center">{{ index + 1 }}</td>
            <td class="text-center">{{ p.siteName }}</td>
            <td class="text-center">{{ p.role }}</td>
            <td class="text-center">{{ p.id }}</td>
            <td class="text-center fw-bold">{{ p.staff }}</td>
            <td class="text-center">
              <span class="fw-bold text-blue">{{ p.workedDays }}</span>
              /
              <span class="text-gray">{{ p.scheduledDays }}</span>
              <!-- 만근 시 주휴수당 포함 뱃지 -->
              <span v-if="p.weeklyHolidayPay > 0"
                    class="weekly-badge"
                    :title="`주휴수당 ${formatCurrency(p.weeklyHolidayPay)}원 포함`">
                  주휴✓
                </span>
            </td>
            <td class="text-right bg-light-gray amount-cell">
              {{ formatCurrency(calculateRowSummary(p).gross) }}
            </td>
            <td class="text-right bg-light-gray amount-cell text-red">
              {{ formatCurrency(calculateRowSummary(p).ded) }}
            </td>
            <td class="text-right bg-light-gray amount-cell text-blue fw-bold">
              {{ formatCurrency(calculateRowSummary(p).net) }}
            </td>

            <!-- 지급 항목: 기본급 칸에 주휴수당 포함 툴팁 표시 -->
            <td v-for="item in payItems" :key="item.itemCd" class="pay-cell">
              <input
                  type="number"
                  v-model.number="p.payments[item.itemCd]"
                  @input="calculateInsurances(p, item)"
                  class="inline-input"
                  :title="item.itemCd === '04001001' && p.weeklyHolidayPay > 0
                    ? `일할기본급 ${formatCurrency(p.finalBaseSalary)}원 + 주휴수당 ${formatCurrency(p.weeklyHolidayPay)}원`
                    : ''"
                  :class="{ 'input-weekly': item.itemCd === '04001001' && p.weeklyHolidayPay > 0 }"
              />
            </td>

            <!-- 공제 항목 -->
            <td v-for="item in deductionItems" :key="item.itemCd">
              <input
                  type="number"
                  v-model.number="p.deductions[item.itemCd]"
                  class="inline-input"
              />
            </td>
          </tr>
          </tbody>

          <tfoot>
          <tr class="table-footer">
            <td colspan="7" class="text-center">전체 합계</td>
            <td class="text-right">{{ formatCurrency(totalSummary.gross) }}</td>
            <td class="text-right text-red">{{ formatCurrency(totalSummary.ded) }}</td>
            <td class="text-right text-blue fw-bold">{{ formatCurrency(totalSummary.net) }}</td>
            <td :colspan="payItems.length" class="bg-light-gray"></td>
            <td :colspan="deductionItems.length" class="bg-light-gray text-center fw-bold">
              실 지급액 합계: <span class="text-blue">{{ formatCurrency(totalSummary.net) }}</span> 원
            </td>
          </tr>
          </tfoot>
        </table>
      </div>

      <!-- 출력 모달 -->
      <div v-if="showPrintModal" class="modal-overlay" @click.self="showPrintModal = false">
        <div class="modal-content">
          <h3>출력 방식 선택</h3>
          <p>급여대장을 어떻게 출력하시겠습니까?</p>
          <div class="modal-buttons">
            <button @click="executePrint"  class="btn-modal btn-print">🖨️ 인쇄 (프린터)</button>
            <button @click="downloadExcel" class="btn-modal btn-pdf">📊 엑셀 다운로드</button>
          </div>
          <button class="btn-close" @click="showPrintModal = false">닫기</button>
        </div>
      </div>

      <!-- 인쇄 영역 -->
      <div id="print-section">
        <div class="print-header-area">
          <div class="ph-left">(주)에코그린티엠</div>
          <div class="ph-center">
            <h1>{{ currentYear }}년 {{ currentMonth }}월 급여 지급대장</h1>
            <p>지급일자 : {{ selectedPayDate }}</p>
          </div>
          <div class="ph-right">
            <table class="sign-table">
              <tr><th rowspan="2">결<br>재</th><th>담당</th><th>검토</th><th>승인</th></tr>
              <tr><td></td><td></td><td></td></tr>
            </table>
          </div>
        </div>

        <table class="multi-row-table">
          <thead>
          <tr class="header-top">
            <th colspan="2">성명 / 입사일</th>
            <th v-for="i in 5" :key="'hp1-'+i">{{ payItems[i-1]?.itemNm || '' }}</th>
            <th v-for="i in 3" :key="'hd1-'+i">{{ deductionItems[i-1]?.itemNm || '' }}</th>
            <th class="bg-final">비고</th>
          </tr>
          <tr class="header-mid">
            <th colspan="2">사번 / 직책</th>
            <th v-for="i in 5" :key="'hp2-'+i">{{ payItems[i+4]?.itemNm || '' }}</th>
            <th v-for="i in 3" :key="'hd2-'+i">{{ deductionItems[i+2]?.itemNm || '' }}</th>
            <th class="bg-final">서명</th>
          </tr>
          <tr class="header-bot">
            <th colspan="2">부서 / 현장</th>
            <th colspan="5" class="bg-sum">지급 총액</th>
            <th colspan="3" class="bg-sum">공제 총액</th>
            <th class="bg-final-dark">차인지급액</th>
          </tr>
          </thead>
          <tbody>
          <template v-for="p in filteredPayrollList" :key="'emp-'+p.idx">
            <tr class="row-1">
              <td class="label-cell">성명</td>
              <td class="value-cell fw-bold text-center">{{ p.staff }}</td>
              <td class="text-right" v-for="i in 5" :key="'vp1-'+i">
                {{ payItems[i-1] ? formatCurrency(p.payments[payItems[i-1].itemCd] || 0) : '' }}
              </td>
              <td class="text-right" v-for="i in 3" :key="'vd1-'+i">
                {{ deductionItems[i-1] ? formatCurrency(p.deductions[deductionItems[i-1].itemCd] || 0) : '' }}
              </td>
              <td></td>
            </tr>
            <tr class="row-2">
              <td class="label-cell">입사일</td>
              <td class="value-cell text-center">{{ p.joinDate || '-' }}</td>
              <td class="text-right" v-for="i in 5" :key="'vp2-'+i">
                {{ payItems[i+4] ? formatCurrency(p.payments[payItems[i+4].itemCd] || 0) : '' }}
              </td>
              <td class="text-right" v-for="i in 3" :key="'vd2-'+i">
                {{ deductionItems[i+2] ? formatCurrency(p.deductions[deductionItems[i+2].itemCd] || 0) : '' }}
              </td>
              <td></td>
            </tr>
            <tr class="row-3">
              <td class="label-cell">현장</td>
              <td class="value-cell text-center" style="font-size:8px;">{{ p.siteName }}</td>
              <td colspan="5" class="text-right bg-sum fw-bold">{{ formatCurrency(calculateRowSummary(p).gross) }}</td>
              <td colspan="3" class="text-right bg-sum fw-bold text-danger">{{ formatCurrency(calculateRowSummary(p).ded) }}</td>
              <td class="text-right bg-final-dark fw-bold">{{ formatCurrency(calculateRowSummary(p).net) }}</td>
            </tr>
          </template>
          </tbody>
          <tfoot>
          <tr class="total-row">
            <td colspan="2" class="text-center fw-bold">전체 합계</td>
            <td colspan="5" class="text-right fw-bold">{{ formatCurrency(totalSummary.gross) }}</td>
            <td colspan="3" class="text-right fw-bold text-danger">{{ formatCurrency(totalSummary.ded) }}</td>
            <td class="text-right fw-bold bg-final-dark">{{ formatCurrency(totalSummary.net) }}</td>
          </tr>
          </tfoot>
        </table>

        <div class="print-footer">
          2025년 연말정산서류 1/31까지 제출하시기 바랍니다.<br>
          (주)에코그린티엠 | 전화 02-355-3322
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.payroll-staff-list-page { display:grid; grid-template-columns:minmax(0,1fr); width:100%; }
.page-header { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
.page-title  { font-size:1.4rem; font-weight:700; }
.badge { padding:3px 10px; border-radius:12px; font-size:.8rem; font-weight:600; }
.badge-success { background:#d1fae5; color:#065f46; }
.badge-warning { background:#fef3c7; color:#92400e; }
.search-panel { display:flex; align-items:center; gap:15px; background:#fff; padding:20px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.05); margin-bottom:20px; flex-wrap:wrap; }
.input-group { display:flex; align-items:center; }
.input-label { margin-right:8px; font-size:.9rem; font-weight:500; color:#4b5563; white-space:nowrap; }
.input-text, .input-select { padding:8px 12px; border:1px solid #d1d5db; border-radius:4px; font-size:.9rem; }
.search-term-group { gap:8px; }
.btn { padding:8px 15px; border:none; border-radius:4px; cursor:pointer; font-weight:600; white-space:nowrap; }
.btn:disabled { opacity:.5; cursor:not-allowed; }
.btn-primary { background:#3b82f6; color:#fff; }
.btn-success { background:#10b981; color:#fff; }
.btn-dark    { background:#374151; color:#fff; }
.table-container { overflow-x:auto; }
.data-table { width:100%; border-collapse:collapse; }
.data-table th, .data-table td { padding:10px; border:1px solid #e5e7eb; font-size:.85rem; white-space:nowrap; }
.data-table th { background:#f9fafb; font-weight:600; }
.group-header-pay       { background:#eff6ff !important; color:#2563eb; }
.group-header-deduction { background:#fef2f2 !important; color:#ef4444; }
.group-header-summary   { background:#f3f4f6 !important; }
.inline-input { width:100%; border:1px solid transparent; padding:4px; text-align:right; font-size:.85rem; border-radius:4px; background:transparent; }
.inline-input:hover { border-color:#d1d5db; background:#f8fafc; }
.inline-input:focus { outline:none; border-color:#3b82f6; background:#fff; }
/* 주휴수당 포함된 기본급 칸 강조 */
.input-weekly { background:#eff6ff !important; border-color:#bfdbfe !important; color:#1d4ed8; font-weight:600; }
/* 주휴 포함 뱃지 */
.weekly-badge { display:inline-block; margin-left:4px; font-size:.65rem; background:#dbeafe; color:#1d4ed8; padding:1px 5px; border-radius:4px; font-weight:700; cursor:default; }
.table-footer { background:#f8fafc; font-weight:bold; }
.text-center { text-align:center; }
.text-right  { text-align:right; }
.text-red    { color:#ef4444; }
.text-blue   { color:#2563eb; }
.text-gray   { color:#9ca3af; }
.fw-bold     { font-weight:600; }
.amount-cell { font-weight:600; }
.bg-light-gray { background:#f8fafc; }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance:none; }
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:9999; display:flex; justify-content:center; align-items:center; }
.modal-content { background:#fff; padding:30px; border-radius:10px; text-align:center; width:400px; }
.modal-buttons { display:flex; gap:10px; justify-content:center; margin:20px 0; }
.btn-modal { padding:10px 20px; border:none; border-radius:5px; cursor:pointer; font-size:1rem; font-weight:bold; color:#fff; }
.btn-print { background:#3b82f6; }
.btn-pdf   { background:#10b981; }
.btn-close { background:transparent; border:1px solid #ccc; padding:5px 15px; border-radius:4px; cursor:pointer; }
#print-section { display:none; }
</style>

<style>
#print-section { font-family:"Malgun Gothic","Dotum",sans-serif; color:#000; box-sizing:border-box; width:100%; }
#print-section .print-header-area { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:10px; border-bottom:2px solid #000; padding-bottom:5px; }
#print-section .ph-center { text-align:center; flex-grow:1; }
#print-section .ph-center h1 { font-size:20pt; margin:0; font-weight:bold; }
#print-section .sign-table { border-collapse:collapse; font-size:9pt; text-align:center; }
#print-section .sign-table th, #print-section .sign-table td { border:1px solid #000; padding:2px 5px; }
#print-section .sign-table tr:last-child td { height:40px; }
#print-section .multi-row-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:9pt; }
#print-section .multi-row-table th, #print-section .multi-row-table td { border:.5px solid #888; padding:4px; height:24px; white-space:nowrap; overflow:hidden; }
#print-section .multi-row-table thead th { background:#f2f2f2; text-align:center; font-weight:normal; font-size:8pt; }
#print-section .header-top th { border-top:2px solid #000; }
#print-section .header-bot th { border-bottom:2px solid #000; }
#print-section .row-1 td { border-top:2px solid #000; }
#print-section .row-2 td { border-top:.5px dotted #aaa; border-bottom:.5px dotted #aaa; }
#print-section .row-3 td { border-bottom:2px solid #000; }
#print-section .label-cell { background:#f9fafb; text-align:center; font-size:8pt; color:#555; }
#print-section .text-right { text-align:right; }
#print-section .text-center { text-align:center; }
#print-section .fw-bold { font-weight:bold; }
#print-section .bg-sum { background:#fdfdf0; }
#print-section .bg-final { background:#f0f8ff; }
#print-section .bg-final-dark { background:#dce6f1; font-weight:bold; }
#print-section .total-row td { background:#eee; border-top:3px double #000; height:35px; font-size:11pt; }
#print-section .print-footer { margin-top:10px; font-size:9pt; border-top:1px solid #000; padding-top:5px; }
@media print {
  body * { visibility:hidden !important; height:0 !important; overflow:hidden !important; }
  #print-section { display:block !important; visibility:visible !important; position:fixed !important; top:0 !important; left:0 !important; width:100% !important; background:white !important; z-index:99999 !important; padding:10mm 5mm !important; margin:0 !important; height:auto !important; overflow:visible !important; }
  #print-section * { visibility:visible !important; height:auto !important; overflow:visible !important; }
  @page { size:landscape; margin:0; }
}
</style>
