<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";

const { siteOptions, typeOptions, fetchSiteOptions, fetchTypeOptions } = useApi();

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

// 2. 동적 컬럼
const payItems = computed(() => items.value.filter(item => item.groupCd === '04001'));
const deductionItems = computed(() => items.value.filter(item => item.groupCd === '04002'));

// 3. 필터링 및 통계
const filteredPayrollList = computed(() =>
    payrollList.value.filter(p => {
      const siteMatch = selectedSite.value === '전체' || p.sIdx == selectedSite.value;
      const typeMatch = selectedType.value === '전체' || p.type == selectedType.value;
      const searchMatch = p.staff.toLowerCase().includes(searchTerm.value.toLowerCase());
      return siteMatch && typeMatch && searchMatch;
    })
);

// 전체 선택/해제 로직 (필터링된 리스트 기준)
const selectAll = computed({
  get: () => filteredPayrollList.value.length > 0 && filteredPayrollList.value.every(p => p.selected),
  set: (val) => {
    filteredPayrollList.value.forEach(p => p.selected = val);
  }
});

// 전체 합계
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

// 개별 직원의 지급/공제 합계 계산 함수
const calculateRowSummary = (row) => {
  let gross = 0, ded = 0;
  if (row.payItems) {
    payItems.value.forEach(i => {
      gross += Number(row.payItems[i.itemCd] || 0);
    });
  }
  if (row.deductionItems) {
    deductionItems.value.forEach(i => {
      ded += Number(row.deductionItems[i.itemCd] || 0);
    });
  }
  return { gross, ded, net: gross - ded };
};

// 스마트 급여 자동 계산 로직
const updatePay = (row) => {
  if (row.originalBasePay === undefined) {
    row.originalBasePay = row.payItems['04001001'] || 0;
  }

  const basePay = row.originalBasePay;
  const scheduled = Number(row.scheduledDays) || 1;
  const worked = Number(row.workedDays) || 0;
  const absent = Number(row.absentDays) || 0;

  const dailyWage = Math.floor(basePay / scheduled);

  if ((worked + absent) < scheduled) {
    // [중도 퇴사자] 일할 계산
    row.payItems['04001001'] = dailyWage * worked;
  } else {
    // [정상 근로자] 결근 차감
    row.payItems['04001001'] = basePay - (dailyWage * absent);
  }

  calculateInsurances(row);
};

// ★ 체크된 데이터만 급여 계산 실행
const fetchCalculatedPay = async () => {
  const selectedRows = payrollList.value.filter(p => p.selected);

  if (selectedRows.length === 0) {
    alert('급여를 계산할 직원을 체크해주세요.');
    return;
  }
  if (!selectedYearMonth.value) { alert('급여 연월을 선택해주세요.'); return; }

  isLoading.value = true;
  try {
    const [year, month] = selectedYearMonth.value.split('-');
    const res = await axios.get('/api/v1/member/payroll/calculate', { params: { year, month } });

    if (res.data.result && res.data.data?.length > 0) {
      selectedRows.forEach(row => {
        const calcData = res.data.data.find(c => c.idx === row.idx);

        if (calcData) {
          let dbCheckedItems = {};
          if (calcData.checkedItems) {
            dbCheckedItems = typeof calcData.checkedItems === 'string'
                ? JSON.parse(calcData.checkedItems)
                : calcData.checkedItems;
          }

          row.payItems = typeof calcData.payItems === 'string' ? JSON.parse(calcData.payItems || '{}') : (calcData.payItems || {});
          row.deductionItems = {};
          row.deductionFlags = {};
          row.workedDays = calcData.workedDays;
          row.scheduledDays = calcData.scheduledDays;

          deductionItems.value.forEach(i => {
            row.deductionFlags[i.itemCd] = dbCheckedItems[i.itemCd] !== false;
          });

          // ★ 상태를 2(임시 계산됨, 저장 대기)로 변경하여 색상이 노란색으로 바뀌게 함
          row.status = 2;

          updatePay(row);
        }
      });
      dataMode.value = 'draft';
    }
  } finally { isLoading.value = false; }
};

const calculateInsurances = (row) => {
  let taxablePay = 0;
  Object.keys(row.payItems || {}).forEach(k => {
    if (!payItems.value.find(i => i.itemCd === k)?.itemNm.includes('식대')) {
      taxablePay += Number(row.payItems[k] || 0);
    }
  });

  if(!row.deductionItems) row.deductionItems = {};

  deductionItems.value.forEach(i => {
    let amt = 0;

    if (row.deductionFlags[i.itemCd]) {
      if (i.itemNm.includes('국민연금')) amt = taxablePay * (targetCodes.value.pension / 100);
      else if (i.itemNm.includes('건강보험')) amt = taxablePay * (targetCodes.value.health / 100);
      else if (i.itemNm.includes('장기요양')) {
        const health = deductionItems.value.find(d => d.itemNm.includes('건강보험'));
        amt = (row.deductionItems[health?.itemCd] || 0) * (targetCodes.value.longTerm / 100);
      }
      else if (i.itemNm.includes('고용보험')) amt = taxablePay * (targetCodes.value.employment / 100);
    }

    row.deductionItems[i.itemCd] = Math.floor(amt / 10) * 10;
  });
};

// 체크된 데이터만 저장
const savePayroll = async () => {
  const selectedRows = payrollList.value.filter(p => p.selected);

  if (selectedRows.length === 0) {
    alert('저장할 직원을 체크해주세요.');
    return;
  }
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
    await getPayrollMonth(); // 저장 후 전체 데이터를 DB에서 다시 불러옴 (status가 1로 바뀜)
  } catch (e) {
    alert('저장 실패');
  }
};

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    items.value = res.data.data || [];
  } catch (err) {
    console.error("항목 로드 실패", err);
  }
};

const getPayrollMonth = async function () {
  const [year, month] = selectedYearMonth.value.split('-');
  let params = {
    year: year,
    month: month,
  }
  axios.get(`/api/v1/member/payroll/month`, { params })
      .then(res => {
        if (res.data.data) {
          payrollList.value = res.data.data.map(item => ({
            ...item,
            selected: false,
            payItems: item.payItems || {},
            deductionItems: item.deductionItems || {},
            deductionFlags: item.checkedItems || {}
          }));
        } else {
          payrollList.value = [];
        }
      })
};

onMounted(() => {
  fetchSiteOptions();
  fetchTypeOptions();
  getWageCode();
  getPayrollMonth()
});
</script>

<template>
  <div class="payroll-calc-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calculator-variant"></i>
          직원 급여 정산
        </h1>
        <p class="page-subtitle">계약 급여와 실제 근무일을 대조하여 정산을 진행합니다</p>
      </div>
      <div class="header-actions">
        <button @click="fetchCalculatedPay" class="btn-calculate">
          <i class="mdi mdi-lightning-bolt"></i>
          <span>선택 급여 계산</span>
        </button>
        <button @click="savePayroll" class="btn-save">
          <i class="mdi mdi-content-save"></i>
          <span>선택 결과 저장</span>
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
          <span class="stat-value text-blue">{{ formatCurrency(statsInfo.net) }}</span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-calendar"></i> 급여연월</label>
          <input type="month" v-model="selectedYearMonth" class="filter-select" @change="getPayrollMonth"/>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building"></i> 근무 현장</label>
          <select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-box"></i> 구분</label>
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
      <p>급여 계산 중...</p>
    </div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>급여 정산 내역 ({{ filteredPayrollList.length }}명)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th rowspan="2" class="text-center" style="width:30px;">
              <input type="checkbox" v-model="selectAll" />
            </th>
            <th rowspan="2" class="text-center" style="width:50px;">No.</th>
            <th rowspan="2" class="text-center" style="width:130px;">현장명</th>
            <th rowspan="2" class="text-center" style="width:80px;">직책</th>
            <th rowspan="2" class="text-center" style="width:80px;">사번</th>
            <th rowspan="2" class="text-center" style="width:110px;">성명</th>
            <th rowspan="2" class="text-center" style="width:110px;">근무/기준</th>
            <th colspan="3" class="text-center group-header-summary">합계</th>
            <th :colspan="payItems.length" class="text-center group-header-pay">지급 항목</th>
            <th :colspan="deductionItems.length" class="text-center group-header-deduction">공제 항목</th>
          </tr>
          <tr>
            <th class="text-right">지급합계</th>
            <th class="text-right">공제합계</th>
            <th class="text-right">실지급액</th>
            <th v-for="item in payItems" :key="item.itemCd" class="text-right bg-pay-sub amount-header">{{ item.itemNm }}</th>
            <th v-for="item in deductionItems" :key="item.itemCd" class="text-right bg-ded-sub amount-header">{{ item.itemNm }}</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(p, index) in filteredPayrollList" :key="p.idx" class="data-row">
            <td
                class="text-center calculate-status transition-colors duration-300"
                :class="{
                    'calculate-active': p.status == 1,
                    'calculate-draft': p.status == 2,
                    'calculate-inactive': p.status == 0
                }">
              <input type="checkbox" v-model="p.selected" />
            </td>
            <td class="text-center">{{ index + 1 }}</td>
            <td class="text-center">{{ p.siteName }}</td>
            <td class="text-center">{{ p.role }}</td>
            <td class="text-center">{{ p.id }}</td>
            <td class="text-center fw-bold">{{ p.staff }}</td>

            <td class="text-center">
              <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                <input
                    type="number"
                    class="inline-input"
                    style="width:40px !important; text-align:center;"
                    v-model.number="p.workedDays"
                    @input="updatePay(p)"
                    title="실제 일한 일수"
                />
                <span style="color:#94a3b8; font-weight:bold;">/</span>
                <input
                    type="number"
                    class="inline-input"
                    style="width:40px !important; text-align:center;"
                    v-model.number="p.scheduledDays"
                    @input="updatePay(p)"
                    title="한 달 기준 근무일수"
                />
              </div>
            </td>
            <td class="text-right bg-light-gray amount-cell">{{ formatCurrency(calculateRowSummary(p).gross) }}</td>
            <td class="text-right bg-light-gray amount-cell text-red">{{ formatCurrency(calculateRowSummary(p).ded) }}</td>
            <td class="text-right bg-light-gray amount-cell text-blue fw-bold">{{ formatCurrency(calculateRowSummary(p).net) }}</td>

            <td v-for="item in payItems" :key="item.itemCd" class="amount-cell">
              <input
                  type="number"
                  v-model.number="p.payItems[item.itemCd]"
                  @input="calculateInsurances(p)"
                  class="inline-input"
              />
            </td>
            <td v-for="item in deductionItems" :key="item.itemCd" class="amount-cell">
              <input
                  type="number"
                  v-model.number="p.deductionItems[item.itemCd]"
                  class="inline-input"
              />
            </td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="table-footer sticky-footer">
            <td colspan="7" class="text-center fw-bold">전체 합계</td>
            <td class="text-right">{{ formatCurrency(statsInfo.gross) }}</td>
            <td class="text-right text-red">{{ formatCurrency(statsInfo.ded) }}</td>
            <td class="text-right text-blue fw-bold">{{ formatCurrency(statsInfo.net) }}</td>
            <td :colspan="payItems.length" class="bg-light-gray"></td>
            <td :colspan="deductionItems.length" class="bg-light-gray"></td>
          </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

.payroll-calc-page { padding: 0; }

/* 페이지 헤더 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

.header-left { flex: 1; }
.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-title i { font-size: 32px; color: #667eea; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

.header-actions { display: flex; gap: 12px; }
.btn-calculate, .btn-save {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}
.btn-calculate { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; }
.btn-save { background: linear-gradient(135deg, #10b981, #059669); color: white; }
.btn-save:disabled { background: #9ca3af; cursor: not-allowed; }

/* 통계 카드 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}
.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  gap: 16px;
}
.stat-icon {
  width: 48px; height: 48px; border-radius: 12px;
  background: var(--card-color); opacity: 0.1;
  display: flex; align-items: center; justify-content: center;
}
.stat-icon i { font-size: 24px; color: var(--card-color); }
.stat-label { font-size: 12px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 22px; font-weight: 700; }

/* 필터 패널 */
.filter-panel {
  background: white;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.filter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 180px; }
.filter-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569; }
.filter-select { padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
.search-group { flex: 1; display: flex; gap: 8px; }
.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 16px;
}
.search-input { border: none; background: transparent; padding: 10px; flex: 1; outline: none; }
.search-clear { background: none; border: none; color: #94a3b8; cursor: pointer; }

/* 테이블 카드 */
.table-card { background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; }

.table-scroll-container {
  overflow: auto;
  max-width: 100%;
  max-height: calc(100vh - 460px);
}
.table-scroll-container::-webkit-scrollbar { height: 10px; width: 10px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: #64748b; border-radius: 10px; }

.data-table {
  width: 100%;
  min-width: 1400px;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table thead {
  position: sticky;
  top: 0;
  z-index: 30;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.data-table th {
  padding: 14px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: white;
  white-space: nowrap;
}

.data-table th.amount-header { min-width: 115px; }

.table-footer.sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 25;
  background: #f8fafc !important;
  box-shadow: 0 -3px 8px rgba(0,0,0,0.12);
}

.data-table td {
  padding: 10px 10px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.amount-cell { min-width: 115px; }

.inline-input {
  width: 100%;
  min-width: 95px;
  padding: 7px 8px;
  text-align: right;
  font-size: 0.9rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  box-sizing: border-box;
}
.inline-input:hover { border-color: #cbd5e1; background: #f8fafc; }
.inline-input:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }

/* ★ 체크박스 배경 상태 CSS 업데이트 */
.calculate-inactive { background: #e2e8f0; } /* 계산 전 (회색) */
.calculate-draft { background: #fde68a; } /* 계산 실행됨, 저장 전 (노란색) */
.calculate-active { background: #4f46e5; } /* 저장 완료 (파란색) */

.bg-light-gray { background: #f8fafc; }
.text-red { color: #ef4444; }
.text-blue { color: #2563eb; }
.fw-bold { font-weight: 600; }

/* 로딩 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.spinner {
  width: 48px; height: 48px;
  border: 4px solid #f1f5f9;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* === 반응형 === */
@media (max-width: 1400px) {
  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
}

@media (max-width: 1024px) {
  .filter-row {
    flex-wrap: wrap;
  }

  .search-group {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
  }

  .btn-refresh,
  .btn-add {
    width: 100%;
    justify-content: center;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .filter-row {
    flex-direction: column;
  }

  .filter-group,
  .search-group {
    width: 100%;
  }

  .filter-toggles-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .filter-toggles {
    flex-wrap: wrap;
  }
}
</style>
