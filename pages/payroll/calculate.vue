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
  await axios.get(`/api/v1/member/payroll/month`, { params })
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
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #4f46e5; --card-bg: #eef2ff;">
        <div class="stat-icon"><i class="mdi mdi-account-group-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">정산 대상</span>
          <span class="stat-value">{{ statsInfo.total }}명</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #10b981; --card-bg: #ecfdf5;">
        <div class="stat-icon"><i class="mdi mdi-cash-plus"></i></div>
        <div class="stat-content">
          <span class="stat-label">지급 합계</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.gross) }}</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #ef4444; --card-bg: #fef2f2;">
        <div class="stat-icon"><i class="mdi mdi-cash-minus"></i></div>
        <div class="stat-content">
          <span class="stat-label">공제 합계</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.ded) }}</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f59e0b; --card-bg: #fffbeb;">
        <div class="stat-icon"><i class="mdi mdi-wallet-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">실 지급액</span>
          <span class="stat-value text-orange">{{ formatCurrency(statsInfo.net) }}</span>
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

        <div class="status-legend">
          <span class="legend-item"><span class="legend-color calculate-inactive"></span>계산 전</span>
          <span class="legend-item"><span class="legend-color calculate-draft"></span>저장 대기</span>
          <span class="legend-item"><span class="legend-color calculate-active"></span>저장 완료</span>
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
          <tr v-for="(p, index) in filteredPayrollList" :key="p.idx" class="data-row">
            <td
                class="text-center calculate-status transition-colors"
                :class="{
                    'calculate-active': p.status == 1,
                    'calculate-draft': p.status == 2,
                    'calculate-inactive': p.status == 0
                }">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="p.selected" class="custom-checkbox" />
              </label>
            </td>
            <td class="text-center text-gray">{{ index + 1 }}</td>
            <td class="text-center text-dark">{{ p.siteName }}</td>
            <td class="text-center text-gray">{{ p.role }}</td>
            <td class="text-center text-gray">{{ p.id }}</td>
            <td class="text-center fw-bold text-dark">{{ p.staff }}</td>

            <td class="text-center">
              <div class="days-input-group">
                <input
                    type="number"
                    class="inline-input days-input"
                    v-model.number="p.workedDays"
                    @input="updatePay(p)"
                    title="실제 일한 일수"
                />
                <span class="days-separator">/</span>
                <input
                    type="number"
                    class="inline-input days-input"
                    v-model.number="p.scheduledDays"
                    @input="updatePay(p)"
                    title="한 달 기준 근무일수"
                />
              </div>
            </td>

            <td class="text-right bg-light-gray fw-bold amount-cell">{{ formatCurrency(calculateRowSummary(p).gross) }}</td>
            <td class="text-right bg-light-gray fw-bold text-red amount-cell">{{ formatCurrency(calculateRowSummary(p).ded) }}</td>
            <td class="text-right bg-light-gray fw-bold text-blue amount-cell">{{ formatCurrency(calculateRowSummary(p).net) }}</td>

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
          <tr v-if="filteredPayrollList.length === 0">
            <td :colspan="10 + payItems.length + deductionItems.length" class="empty-state">
              <i class="mdi mdi-calculator-variant-outline"></i>
              <p>조건에 맞는 급여 대상자가 없습니다.</p>
            </td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="table-footer sticky-footer">
            <td colspan="7" class="text-center"><span class="fw-bold text-dark">전체 합계</span></td>
            <td class="text-right fw-bold">{{ formatCurrency(statsInfo.gross) }}</td>
            <td class="text-right fw-bold text-red">{{ formatCurrency(statsInfo.ded) }}</td>
            <td class="text-right fw-bold text-blue">{{ formatCurrency(statsInfo.net) }}</td>
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
    </div>
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 설정 === */
.payroll-calc-page {
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left { flex: 1; }
.page-title {
  font-size: 24px; font-weight: 700; color: #1e293b;
  margin: 0 0 6px 0; display: flex; align-items: center; gap: 10px;
  letter-spacing: -0.5px;
}
.page-title i { font-size: 26px; color: #4f46e5; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

.header-actions { display: flex; gap: 10px; }

.btn-calculate, .btn-save {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}

/* 계산 버튼 - 옐로우 플랫 */
.btn-calculate { background-color: #f59e0b; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.btn-calculate:hover { background-color: #d97706; transform: translateY(-1px); }

/* 저장 버튼 - 그린 플랫 */
.btn-save { background-color: #10b981; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.btn-save:hover { background-color: #059669; transform: translateY(-1px); }
.btn-save:disabled { background-color: #cbd5e1; cursor: not-allowed; transform: none; box-shadow: none;}

.btn-calculate i, .btn-save i { font-size: 18px; }

/* === 통계 카드 (플랫 디자인) === */
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px; margin-bottom: 24px;
}

.stat-card {
  background: white; border-radius: 12px; padding: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  display: flex; align-items: center; gap: 16px; transition: all 0.2s;
}
.stat-card:hover { border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.04); transform: translateY(-2px);}

.stat-icon {
  width: 52px; height: 52px; border-radius: 12px;
  background-color: var(--card-bg, #f1f5f9);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.stat-icon i { font-size: 24px; color: var(--card-color); }

.stat-content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.stat-label { font-size: 13px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 22px; font-weight: 700; color: #1e293b; letter-spacing: -0.5px;}

/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px;
  margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.filter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 160px; flex: 1; }

.filter-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; color: #475569;
}
.filter-label i { font-size: 16px; color: #4f46e5; }

.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; cursor: pointer;
  transition: all 0.2s; height: 42px; box-sizing: border-box;
}
.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

.search-group { display: flex; gap: 8px; flex: 2; min-width: 280px; align-items: flex-end; }
.search-box {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
  flex: 1; height: 42px; box-sizing: border-box; transition: all 0.2s;
}
.search-box:focus-within { background: white; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.search-box i { font-size: 20px; color: #94a3b8; }
.search-input { flex: 1; border: none; background: transparent; font-size: 13px; color: #334155; outline: none; }
.search-input::placeholder { color: #94a3b8; }

.search-clear {
  background: none; border: none; color: #94a3b8; cursor: pointer;
  padding: 4px; border-radius: 4px; transition: all 0.2s; display: flex; align-items: center;
}
.search-clear:hover { background: #e2e8f0; color: #64748b; }

/* === 로딩 상태 === */
.loading-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px;
}
.spinner {
  width: 40px; height: 40px; border: 3px solid #f1f5f9;
  border-top-color: #4f46e5; border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p { margin-top: 16px; font-size: 14px; color: #64748b; }

/* 빈 상태 */
.empty-state { text-align: center; padding: 60px 20px !important; color: #94a3b8; background: white; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: #cbd5e1; }
.empty-state p { font-size: 14px; font-weight: 500; color: #64748b; margin: 0; }

/* === 테이블 카드 === */
.table-card {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); overflow: hidden; max-width: 100%;
}

.table-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px; border-bottom: 1px solid #e2e8f0; background: #ffffff; flex-wrap: wrap; gap: 12px;
}

.table-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: #1e293b; }
.table-title i { font-size: 20px; color: #4f46e5; }

/* 상태 범례 */
.status-legend { display: flex; align-items: center; gap: 16px; font-size: 12px; color: #475569; font-weight: 500;}
.legend-item { display: flex; align-items: center; gap: 6px; }
.legend-color { width: 12px; height: 12px; border-radius: 3px; display: inline-block; border: 1px solid rgba(0,0,0,0.1); }

.table-scroll-container {
  overflow: auto; max-width: 100%; max-height: calc(100vh - 380px);
}
.table-scroll-container::-webkit-scrollbar { height: 8px; width: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: #f8fafc; }
.table-scroll-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* === 데이터 테이블 === */
.data-table { width: 100%; min-width: 1500px; border-collapse: collapse; font-size: 13px; }

/* 테이블 헤더 */
.data-table thead {
  position: sticky; top: 0; z-index: 30; background-color: #6d28d9; /* 솔리드 다크 퍼플 */
}

.data-table th {
  padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600;
  color: white; white-space: nowrap; border-right: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.data-table th:last-child { border-right: none; }
.sub-header { background-color: #5b21b6; }

.data-table td {
  padding: 8px 10px; border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #f8fafc; vertical-align: middle; word-break: keep-all;
}
.data-table td:last-child { border-right: none; }

.data-row { transition: background 0.2s; }
.data-row:hover { background-color: #f8fafc; }

/* 유틸리티 클래스 */
.text-center { text-align: center !important; }
.text-right { text-align: right !important; }
.text-red { color: #dc2626 !important; }
.text-blue { color: #2563eb !important; }
.text-orange { color: #d97706 !important; }
.text-dark { color: #1e293b; }
.text-gray { color: #64748b; }
.fw-bold { font-weight: 600; }
.bg-light-gray { background-color: #f8fafc; }
.border-none { border: none !important; }

.amount-header, .amount-cell { min-width: 110px; }

/* 일수 입력 폼 그룹 */
.days-input-group { display: flex; align-items: center; justify-content: center; gap: 4px; }
.days-input { width: 44px !important; text-align: center; padding: 6px 4px !important;}
.days-separator { color: #cbd5e1; font-weight: 400; font-size: 14px;}

/* 입력창 (플랫 스타일) */
.inline-input {
  width: 100%; min-width: 90px; padding: 8px 10px; text-align: right;
  font-size: 13px; font-family: 'Inter', monospace; color: #1e293b;
  border: 1px solid transparent; border-radius: 6px; background: transparent; transition: all 0.2s;
}
.inline-input:hover { border-color: #cbd5e1; background: white; }
.inline-input:focus {
  outline: none; border-color: #4f46e5; background: white; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

/* 커스텀 체크박스 */
.checkbox-wrapper { display: flex; justify-content: center; align-items: center; cursor: pointer; }
.custom-checkbox {
  appearance: none; -webkit-appearance: none;
  width: 18px; height: 18px; border: 2px solid #cbd5e1; border-radius: 4px;
  cursor: pointer; position: relative; transition: all 0.2s; background: white; margin: 0;
}
.custom-checkbox:hover { border-color: #94a3b8; }
.custom-checkbox:checked { border-color: #4f46e5; background-color: #4f46e5; }
.custom-checkbox:checked::after {
  content: ''; position: absolute; top: 2px; left: 5px;
  width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg);
}

/* 헤더용 화이트 체크박스 */
.header-checkbox { border-color: rgba(255,255,255,0.6); background: transparent; }
.header-checkbox:hover { border-color: white; }
.header-checkbox:checked { border-color: white; background-color: white; }
.header-checkbox:checked::after { border-color: #6d28d9; }

/* ★ 상태 컬럼 (노골적인 원색 대신 파스텔/플랫 톤) */
.calculate-status { transition: background-color 0.3s ease; }
.calculate-inactive { background-color: #f1f5f9; } /* 계산 전: 연회색 */
.calculate-draft { background-color: #fef3c7; border-right: 1px solid #fde68a !important;} /* 계산됨/저장전: 연노랑 */
.calculate-active { background-color: #e0e7ff; border-right: 1px solid #c7d2fe !important;} /* 저장완료: 연파랑 */

/* Footer (총 합계) */
.table-footer.sticky-footer {
  position: sticky; bottom: 0; z-index: 25;
  background-color: #ffffff; border-top: 2px solid #e2e8f0;
  box-shadow: 0 -4px 6px -1px rgba(0,0,0,0.05);
}

.table-footer td { padding: 14px 10px; font-size: 14px; }

.net-pay-box {
  display: inline-flex; align-items: center; gap: 12px;
  background-color: #eef2ff; padding: 8px 20px; border-radius: 8px; border: 1px solid #c7d2fe;
}
.net-pay-label { font-size: 13px; color: #4f46e5; font-weight: 600; }
.net-pay-value { font-size: 18px; color: #4f46e5; font-weight: 700; letter-spacing: 0.5px;}

/* === 반응형 (Responsive) === */
@media (max-width: 1400px) {
  .stats-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
}

@media (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .filter-group { flex: 1; min-width: calc(33% - 10px); }
  .search-group { width: 100%; flex: 1 1 100%; }
  .table-header { flex-direction: column; align-items: flex-start;}
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 14px; align-items: flex-start; }
  .header-actions { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .btn-calculate, .btn-save { flex: 1; justify-content: center; }

  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px;}

  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group, .search-group { width: 100%; min-width: 100%; }
  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
}
</style>
