<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import XLSX from 'xlsx-js-style';
import { useAuthStore } from "~/stores/auth.js";

const { siteOptions, typeOptions, fetchSiteOptions, fetchTypeOptions } = useApi();

// 1. 상태 관리
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const selectedYearMonth = ref(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
const selectedPayDate = ref('');
const searchTerm = ref('');
const selectedSite = ref('전체');
const selectedType = ref('전체');

const items = ref([]); // 급여 항목 코드
const payrollList = ref([]);
const isLoading = ref(false);
const dataMode = ref(''); // 'saved' | 'draft'

const targetCodes = ref({ pension: 4.5, health: 3.545, longTerm: 12.95, employment: 0.9 });

// 2. 동적 컬럼 분류 (기존 로직 유지)
const payItems = computed(() => items.value.filter(item => item.groupCd === '04001'));
const deductionItems = computed(() => items.value.filter(item => item.groupCd === '04002'));

// 3. 필터링 및 통계 계산
const filteredPayrollList = computed(() =>
    payrollList.value.filter(p => {
      const siteMatch = selectedSite.value === '전체' || p.sIdx == selectedSite.value;
      const typeMatch = selectedType.value === '전체' || p.type == selectedType.value;
      const searchMatch = p.staff.includes(searchTerm.value);
      return siteMatch && typeMatch && searchMatch;
    })
);

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

const formatCurrency = (v) => new Intl.NumberFormat('ko-KR').format(v ?? 0);

// 행별 합계 계산 (기존 유틸 유지)
const calculateRowSummary = (row) => {
  let gross = 0, ded = 0;
  if (row.payments) payItems.value.forEach(i => { gross += Number(row.payments[i.itemCd] || 0); });
  if (row.deductions) deductionItems.value.forEach(i => { ded += Number(row.deductions[i.itemCd] || 0); });
  return { gross, ded, net: gross - ded };
};

// 4. 급여 계산 엔진 (핵심 기능)
const fetchCalculatedPay = async () => {
  if (!selectedYearMonth.value) { alert('급여 연월을 선택해주세요.'); return; }
  isLoading.value = true;
  try {
    const [year, month] = selectedYearMonth.value.split('-');
    const res = await axios.get('/api/v1/member/payroll/calculate', { params: { year, month } });

    if (res.data.result && res.data.data?.length > 0) {
      payrollList.value = res.data.data.map(calc => {
        const totalDays = new Date(year, month, 0).getDate();
        // 일할 계산 로직
        const proRatedBase = Math.floor((calc.contractBaseSalary / totalDays) * (calc.workedDays || 0));
        // 주휴수당 판정 (만근 시)
        const weeklyHolidayPay = calc.absentDays === 0 ? Math.round(calc.contractBaseSalary / 30) * 4 : 0;

        const payments = {};
        payItems.value.forEach(i => {
          if (i.itemCd === '04001001') payments[i.itemCd] = proRatedBase + weeklyHolidayPay;
          else if (i.itemNm.includes('식대')) payments[i.itemCd] = calc.contractMealAllowance || 0;
          else payments[i.itemCd] = 0;
        });

        const row = {
          ...calc, mIdx: calc.idx, payments, deductions: {}, deductionFlags: {}
        };
        deductionItems.value.forEach(i => { row.deductionFlags[i.itemCd] = true; });
        calculateInsurances(row); // 보험료 자동계산
        return row;
      });
      dataMode.value = 'draft';
    }
  } finally { isLoading.value = false; }
};

const calculateInsurances = (row) => {
  let taxablePay = 0;
  Object.keys(row.payments).forEach(k => {
    if (!payItems.value.find(i => i.itemCd === k)?.itemNm.includes('식대')) taxablePay += row.payments[k];
  });
  deductionItems.value.forEach(i => {
    let amt = 0;
    if (i.itemNm.includes('국민연금')) amt = taxablePay * (targetCodes.value.pension / 100);
    else if (i.itemNm.includes('건강보험')) amt = taxablePay * (targetCodes.value.health / 100);
    // ... 기타 보험료 로직
    row.deductions[i.itemCd] = Math.floor(amt / 10) * 10;
  });
};

const savePayroll = async () => {
  if (!confirm('정산 결과를 저장하시겠습니까?')) return;
  // 기존 저장 API 호출 로직...
  dataMode.value = 'saved';
};

const getWageCode = async function () {
  const cIdx = authStore.user?.cIdx;
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    items.value = res.data.data || [];

  } catch (err) {
    console.error("항목 로드 실패", err);
  }
}

const getPayrollMonth = async function () {
  const [year, month] = selectedYearMonth.value.split('-');
  let params = {
    year: year,
    month: month,
  }
  axios.get(`/api/v1/member/payroll/month`, { params })
      .then(res => {
        console.log(res.data.data, 'getPayrollMonth')
        payrollList.value = res.data.data;
      })
}

onMounted(() => {
  fetchSiteOptions();
  fetchTypeOptions();
  getWageCode();
  getPayrollMonth();
});
</script>

<template>
  <div class="member-list-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calculator-variant"></i> 직원 급여 정산
        </h1>
        <p class="page-subtitle">계약 급여와 실제 근무일을 대조하여 정산을 진행합니다.</p>
      </div>
      <div class="header-actions">
        <button @click="fetchCalculatedPay" class="btn-search">
          <i class="mdi mdi-lightning-bolt"></i> <span>급여 계산 실행</span>
        </button>
        <button @click="savePayroll" class="btn-add" :disabled="dataMode !== 'draft'">
          <i class="mdi mdi-content-save"></i> <span>정산 결과 저장</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #667eea;">
        <div class="stat-icon"><i class="mdi mdi-account-group"></i></div>
        <div class="stat-content">
          <span class="stat-label">정산 대상</span>
          <span class="stat-value">{{ statsInfo.total }}명</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #10b981;">
        <div class="stat-icon"><i class="mdi mdi-cash-plus"></i></div>
        <div class="stat-content">
          <span class="stat-label">지급 합계</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.gross) }}</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #ef4444;">
        <div class="stat-icon"><i class="mdi mdi-cash-minus"></i></div>
        <div class="stat-content">
          <span class="stat-label">공제 합계</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.ded) }}</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f59e0b;">
        <div class="stat-icon"><i class="mdi mdi-wallet"></i></div>
        <div class="stat-content">
          <span class="stat-label">실 지급액</span>
          <span class="stat-value" style="color:#2563eb">{{ formatCurrency(statsInfo.net) }}</span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-calendar"></i> 급여연월</label>
          <input type="month" v-model="selectedYearMonth" class="filter-select" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building"></i> 근무 현장</label>
          <select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>
        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input type="text" v-model="searchTerm" placeholder="이름으로 검색..." class="search-input" />
          </div>
        </div>
      </div>
    </div>

    <div class="table-card" v-if="!isLoading">
      <!--div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table-edit"></i>
          <span>급여 산정 내역 ({{ dataMode === 'draft' ? '미저장 초안' : '저장된 데이터' }})</span>
        </div>
      </div-->

      <div class="table-scroll-container">
        <table class="data-table payroll">
          <thead>
          <tr>
            <th rowspan="2" style="width:30px;"><input type="checkbox"></th>
            <th rowspan="2" style="width:50px;">No.</th>
            <th rowspan="2" style="width:120px;">현장명</th>
            <th rowspan="2" style="width:80px;">직책</th>
            <th rowspan="2" style="width:80px;">사번</th>
            <th rowspan="2" style="width:100px;">성명</th>
            <th rowspan="2" style="width:110px;">근무/기준</th>
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
          <tr v-for="(p, index) in filteredPayrollList" :key="p.idx" class="data-row">
            <td class="text-center"><input type="checkbox"></td>
            <td class="text-center">{{ index + 1 }}</td>
            <td class="text-center">{{ p.siteName }}</td>
            <td class="text-center">{{ p.role }}</td>
            <td class="text-center">{{ p.id }}</td>
            <td class="text-center fw-bold">{{ p.staff }}</td>
            <td class="text-center">
              {{ p.workedDays }} / {{ p.scheduledDays }}
              <span v-if="p.absentDays === 0" class="weekly-badge">주휴✓</span>
            </td>
            <td class="text-right bg-light-gray amount-cell">{{ formatCurrency(calculateRowSummary(p).gross) }}</td>
            <td class="text-right bg-light-gray amount-cell text-red">{{ formatCurrency(calculateRowSummary(p).ded) }}</td>
            <td class="text-right bg-light-gray amount-cell text-blue fw-bold">{{ formatCurrency(calculateRowSummary(p).net) }}</td>

            <td v-for="item in payItems" :key="item.itemCd">
              <input type="number" v-model.number="p.finalBaseSalary" @input="calculateInsurances(p)" class="grid-input"/>
              <!--input type="number" v-model.number="p.payments[item.itemCd]" @input="calculateInsurances(p)" class="grid-input" /-->
            </td>
            <td v-for="item in deductionItems" :key="item.itemCd">
              <input type="number" v-model.number="p.finalBaseSalary" @input="calculateInsurances(p)" class="grid-input"/>
              <!--input type="number" v-model.number="p.deductions[item.itemCd]" class="grid-input" /-->
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 기존의 세련된 디자인 스타일 유지 */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

.member-list-page { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.page-title { font-size: 28px; font-weight: 700; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 12px; }
.page-title i { color: #667eea; }
.page-subtitle { font-size: 14px; color: #64748b; }

.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
.stat-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 16px; position: relative; overflow: hidden; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--card-color); }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; background: var(--card-color); opacity: 0.1; display: flex; align-items: center; justify-content: center; position: relative; }
.stat-icon i { font-size: 24px; color: var(--card-color); position: absolute; }
.stat-label { font-size: 12px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 22px; font-weight: 700; color: var(--card-color); }

.filter-panel { background: white; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.filter-row { display: flex; align-items: flex-end; gap: 16px; }
.filter-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px; }
.filter-select { padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; min-width: 150px; }
.search-group { flex: 1; display: flex; }
.search-box { flex: 1; display: flex; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0 12px; }
.search-input { border: none; background: transparent; padding: 10px; width: 100%; outline: none; }

/* 테이블 스타일 (기존 구조 호환) */
.table-card { background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table thead { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
.data-table th { padding: 12px; border: 1px solid rgba(255,255,255,0.1); font-weight: 600; text-align: center; }
.data-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; }
.bg-pay-sub { background: rgba(255,255,255,0.05); }
.bg-ded-sub { background: rgba(0,0,0,0.05); }
.group-header-pay { background: rgba(59, 130, 246, 0.2); }
.group-header-deduction { background: rgba(239, 68, 68, 0.2); }

/* 그리드 입력창 스타일 */
.grid-input { width: 100%; border: 1px solid transparent; text-align: right; font-size: 13px; background: transparent; padding: 4px; border-radius: 4px; }
.grid-input:hover { border-color: #cbd5e1; background: #fff; }
.grid-input:focus { border-color: #667eea; background: #fff; outline: none; box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1); }

.weekly-badge { font-size: 10px; background: #dcfce7; color: #15803d; padding: 2px 4px; border-radius: 4px; margin-left: 4px; font-weight: bold; }
.amount-cell { font-weight: 600; background: #f8fafc; }
.text-red { color: #ef4444; }
.text-blue { color: #2563eb; }
.fw-bold { font-weight: bold; }

.btn-search { background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.btn-add { background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; }
.btn-add:disabled { background: #cbd5e1; cursor: not-allowed; }
</style>
