<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";

const {
  siteOptions,
  typeOptions,
  fetchSiteOptions,
  fetchTypeOptions,
} = useApi();

// 상태
const searchTerm = ref('');
const selectedSite = ref('전체');
const selectedType = ref('전체');
const items = ref([]);
const isLoading = ref(false);
const error = ref(null);

const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// 동적 컬럼
const payItems = computed(() => items.value.filter(i => i.groupNm === '지급항목'));
const deductionItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));
const checkedItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));

// 데이터
const payrollList = ref([]);
const targetCodes = ref({ pension: '', health: '', longTerm: '', employment: '' });

// 변환 함수
const transformPayrollList = (rows) => {
  return rows.map(row => {
    let payments = {}, deductions = {}, flags = {};
    try { payments = typeof row.payItems === 'string' ? JSON.parse(row.payItems) : row.payItems || {}; } catch {}
    try { deductions = typeof row.deductionItems === 'string' ? JSON.parse(row.deductionItems) : row.deductionItems || {}; } catch {}
    try {
      flags = row.checkedItems ? (typeof row.checkedItems === 'boolean' ? JSON.parse(row.checkedItems) : row.checkedItems) : {};
      if (Object.keys(flags).length === 0 && deductionItems.value.length) {
        deductionItems.value.forEach(item => flags[item.itemCd] = true);
      }
    } catch {}
    return { ...row, payments, deductions, deductionFlags: flags };
  });
};

// 계산
const calculateRow = (row) => {
  let gross = 0, ded = 0;
  if (row.payments) payItems.value.forEach(i => gross += Number(row.payments[i.itemCd] || 0));
  if (row.deductions) deductionItems.value.forEach(i => ded += Number(row.deductions[i.itemCd] || 0));
  return { gross, ded, net: gross - ded };
};

const filteredPayrollList = computed(() => {
  const filtered = payrollList.value.filter(p =>
      (selectedSite.value === '전체' || p.sIdx == selectedSite.value) &&
      p.staff.toLowerCase().includes(searchTerm.value.toLowerCase()) &&
      (selectedType.value === '전체' || p.type === selectedType.value)
  );
  return filtered.sort((a, b) => Number(b.sIdx) - Number(a.sIdx) || Number(a.idx) - Number(b.idx));
});

const totalSummary = computed(() => {
  const s = { gross: 0, ded: 0, net: 0 };
  filteredPayrollList.value.forEach(p => {
    const c = calculateRow(p);
    s.gross += c.gross; s.ded += c.ded; s.net += c.net;
  });
  return s;
});

const formatCurrency = (n) => new Intl.NumberFormat('ko-KR').format(n || 0);

// API
const getWageCode = async () => { try { const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`); items.value = res.data.data || []; } catch(e){} };
const getTaxRate = async () => {
  const year = new Date().getFullYear();
  try {
    const res = await axios.get(`/api/v1/config/tax/rate/${year}`);
    const list = res.data.data || [];
    const tax = list.find(t => Number(t.applied_year) === year) || list[0] || {};
    targetCodes.value = { pension: tax.pension_rate, health: tax.health_rate, longTerm: tax.long_term_care_rate, employment: tax.employment_rate };
  } catch(e){}
};

const calculateInsurances = (row, sourceItem) => {
  let taxable = 0;
  if (row.payments) payItems.value.forEach(i => { if (!i.itemNm.includes('식대')) taxable += Number(row.payments[i.itemCd] || 0); });
  const rates = targetCodes.value;
  if (!sourceItem) {
    deductionItems.value.forEach(d => row.deductionFlags?.[d.itemCd] ? applyDeductionLogic(row, d, taxable, rates) : row.deductions[d.itemCd] = 0);
    return;
  }
  const isPay = payItems.value.some(p => p.itemCd === sourceItem.itemCd);
  if (isPay) deductionItems.value.forEach(d => { if (row.deductionFlags[d.itemCd]) applyDeductionLogic(row, d, taxable, rates); });
  else {
    if (!row.deductionFlags[sourceItem.itemCd]) row.deductions[sourceItem.itemCd] = 0;
    else applyDeductionLogic(row, sourceItem, taxable, rates);
    if (sourceItem.itemNm.includes('건강보험')) {
      const lt = deductionItems.value.find(i => i.itemNm.includes('장기요양'));
      if (lt && row.deductionFlags[lt.itemCd]) applyDeductionLogic(row, lt, taxable, rates);
    }
  }
};

const applyDeductionLogic = (row, item, base, rates) => {
  let amt = 0;
  if (item.itemNm.includes('국민연금')) amt = base * (rates.pension / 100);
  else if (item.itemNm.includes('건강보험')) amt = base * (rates.health / 100);
  else if (item.itemNm.includes('장기요양')) {
    const h = deductionItems.value.find(i => i.itemNm.includes('건강보험'));
    amt = (row.deductions[h.itemCd] || 0) * (rates.longTerm / 100);
  }
  else if (item.itemNm.includes('고용보험')) amt = base * (rates.employment / 100);
  else return;
  row.deductions[item.itemCd] = Math.floor(amt / 10) * 10;
};

const savePayroll = async () => {
  if (!confirm('저장하시겠습니까?')) return;
  try {
    await Promise.all(payrollList.value.map(row => {
      const c = calculateRow(row);
      return axios.post(`/api/v1/member/base/salary/${row.idx}`, {
        mIdx: row.idx, sIdx: row.sIdx, year: new Date().getFullYear(),
        grossPay: c.gross, deductions: c.ded, netPay: c.net,
        payItems: JSON.stringify(row.payments || {}),
        deductionItems: JSON.stringify(row.deductions || {}),
        checkedItems: JSON.stringify(row.deductionFlags || {}),
        total: 0
      });
    }));
    alert('급여 정보가 저장되었습니다.');
    fetchMembers();
  } catch (e) { alert('저장 실패'); }
};

const fetchMembers = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get('/api/v1/member/payroll');
    payrollList.value = res.data.data?.length ? transformPayrollList(res.data.data) : [];
  } catch(e) { payrollList.value = []; }
  finally { isLoading.value = false; }
};

onMounted(() => {
  getTaxRate();
  getWageCode();
  fetchSiteOptions();
  fetchTypeOptions();
  fetchMembers();
});
</script>

<template>
  <div class="payroll-staff-list-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-cash-multiple"></i> 직원 급여 정보</h1>
        <p class="page-subtitle">지급·공제 항목 관리 및 4대보험 자동 계산</p>
      </div>
      <div class="header-actions">
        <button @click="fetchMembers" class="btn-refresh">
          <i class="mdi mdi-refresh"></i><span>새로고침</span>
        </button>
        <button @click="savePayroll" class="btn-save">
          <i class="mdi mdi-content-save-outline"></i><span>저장하기</span>
        </button>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
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
            <input type="text" v-model="searchTerm" placeholder="이름으로 검색..." class="search-input" @keyup.enter="fetchMembers">
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear"><i class="mdi mdi-close"></i></button>
          </div>
          <button @click="fetchMembers" class="btn-search"><i class="mdi mdi-magnify"></i><span>검색</span></button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state"><div class="spinner"></div><p>불러오는 중...</p></div>

    <div class="table-card" v-else>
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>급여 목록 ({{ filteredPayrollList.length }}명)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th rowspan="2" class="text-center" style="width:50px;">No.</th>
            <th rowspan="2" class="text-center" style="width:140px;">현장명</th>
            <th rowspan="2" class="text-center" style="width:90px;">직책</th>
            <th rowspan="2" class="text-center" style="width:90px;">사번</th>
            <th rowspan="2" class="text-center" style="width:100px;">성명</th>
            <th colspan="2" class="text-center group-header-summary">합계</th>
            <th :colspan="payItems.length" class="text-center group-header-pay">지급 항목</th>
            <th :colspan="deductionItems.length * 2" class="text-center group-header-deduction">공제 항목</th>
          </tr>
          <tr>
            <th class="text-right sub-header">지급합계</th>
            <th class="text-right sub-header">공제합계</th>
            <th v-for="item in payItems" :key="item.itemCd" class="text-right sub-header amount-header">{{ item.itemNm }}</th>
            <th v-for="item in deductionItems" :key="item.itemCd" class="text-right sub-header amount-header">{{ item.itemNm }}</th>
            <th v-for="item in checkedItems" :key="'chk-'+item.itemCd" class="text-center sub-header" style="width:60px; font-size: 11px;">{{ item.itemNm }}<br>적용</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(p, i) in filteredPayrollList" :key="p.idx" class="data-row">
            <td class="text-center text-gray">{{ i+1 }}</td>
            <td class="text-center text-dark">{{ p.siteName }}</td>
            <td class="text-center text-gray">{{ p.role }}</td>
            <td class="text-center text-gray">{{ p.id }}</td>
            <td class="text-center fw-bold text-dark">{{ p.staff }}</td>

            <td class="text-right bg-light-gray fw-bold amount-cell">{{ formatCurrency(calculateRow(p).gross) }}</td>
            <td class="text-right bg-light-gray fw-bold text-red amount-cell">{{ formatCurrency(calculateRow(p).ded) }}</td>

            <td v-for="item in payItems" :key="item.itemCd" class="amount-cell">
              <input v-if="p.payments" type="number" v-model.number="p.payments[item.itemCd]" @input="calculateInsurances(p, item)" class="inline-input">
            </td>
            <td v-for="item in deductionItems" :key="item.itemCd" class="amount-cell">
              <input v-if="p.deductions" type="number" v-model.number="p.deductions[item.itemCd]" class="inline-input">
            </td>
            <td v-for="item in checkedItems" :key="'ded-chk-'+item.itemCd" class="text-center deduction-check-cell">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="p.deductionFlags[item.itemCd]" @change="calculateInsurances(p, item)" class="custom-checkbox">
              </label>
            </td>
          </tr>
          <tr v-if="filteredPayrollList.length === 0">
            <td :colspan="6 + payItems.length + (deductionItems.length * 2)" class="empty-state">
              <i class="mdi mdi-text-box-search-outline"></i>
              <p>조건에 맞는 급여 데이터가 없습니다.</p>
            </td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="table-footer sticky-footer">
            <td colspan="5" class="text-center"><span class="fw-bold text-dark">전체 합계</span></td>
            <td class="text-right fw-bold">{{ formatCurrency(totalSummary.gross) }}</td>
            <td class="text-right fw-bold text-red">{{ formatCurrency(totalSummary.ded) }}</td>
            <td :colspan="payItems.length" class="bg-light-gray border-none"></td>
            <td :colspan="deductionItems.length * 2" class="bg-light-gray text-center border-none">
              <div class="net-pay-box">
                <span class="net-pay-label">실 지급액 합계</span>
                <span class="net-pay-value">{{ formatCurrency(totalSummary.net) }} 원</span>
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
.payroll-staff-list-page {
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

.btn-refresh, .btn-save {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}

.btn-refresh { background: white; border: 1px solid #e2e8f0; color: #475569; }
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }

.btn-save {
  background-color: #10b981; color: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.btn-save:hover { background-color: #059669; transform: translateY(-1px); }

.btn-refresh i, .btn-save i { font-size: 18px; }


/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px;
  margin-bottom: 24px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
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

/* 검색 그룹 */
.search-group { display: flex; gap: 8px; flex: 2; min-width: 280px; align-items: flex-end; }

.search-box {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 8px; flex: 1; height: 42px; box-sizing: border-box; transition: all 0.2s;
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

.btn-search {
  display: flex; align-items: center; gap: 6px; padding: 0 20px; height: 42px;
  background-color: #6d28d9; border: none; border-radius: 8px; color: white;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05); white-space: nowrap; flex-shrink: 0;
}
.btn-search:hover { background-color: #5b21b6; transform: translateY(-1px); }
.btn-search i { font-size: 18px; }

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

.table-header { padding: 18px 24px; border-bottom: 1px solid #e2e8f0; background: #ffffff; }
.table-title {
  display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: #1e293b;
}
.table-title i { font-size: 20px; color: #4f46e5; }

.table-scroll-container {
  overflow: auto; max-width: 100%; max-height: calc(100vh - 350px);
}

.table-scroll-container::-webkit-scrollbar { height: 8px; width: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: #f8fafc; }
.table-scroll-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* === 데이터 테이블 === */
.data-table {
  width: 100%; min-width: 1400px; border-collapse: collapse; font-size: 13px;
}

/* 테이블 헤더 */
.data-table thead {
  position: sticky; top: 0; z-index: 30;
  background-color: #6d28d9; /* 솔리드 다크 퍼플 */
}

.data-table th {
  padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600;
  color: white; white-space: nowrap; border-right: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.data-table th:last-child { border-right: none; }

/* 2단 헤더의 하단 부분 색상 미세 조정 */
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
.text-dark { color: #1e293b; }
.text-gray { color: #64748b; }
.fw-bold { font-weight: 600; }
.bg-light-gray { background-color: #f8fafc; }
.border-none { border: none !important; }

/* 셀 크기 고정 */
.amount-header, .amount-cell { min-width: 110px; }

/* 입력창 (플랫 스타일, 마우스 오버/포커스 시 형태 표시) */
.inline-input {
  width: 100%; min-width: 90px; padding: 8px 10px; text-align: right;
  font-size: 13px; font-family: 'Inter', monospace; color: #1e293b;
  border: 1px solid transparent; border-radius: 6px; background: transparent; transition: all 0.2s;
}
.inline-input:hover { border-color: #cbd5e1; background: white; }
.inline-input:focus {
  outline: none; border-color: #4f46e5; background: white;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

/* 커스텀 체크박스 */
.deduction-check-cell { background-color: #ffffff; }
.checkbox-wrapper { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; cursor: pointer;}
.custom-checkbox {
  appearance: none; -webkit-appearance: none;
  width: 18px; height: 18px; border: 2px solid #cbd5e1; border-radius: 4px;
  cursor: pointer; position: relative; transition: all 0.2s; background: white;
}
.custom-checkbox:hover { border-color: #94a3b8; }
.custom-checkbox:checked { border-color: #4f46e5; background-color: #4f46e5; }
.custom-checkbox:checked::after {
  content: ''; position: absolute; top: 2px; left: 5px;
  width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

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
@media (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .filter-group { flex: 1; min-width: calc(50% - 8px); }
  .search-group { width: 100%; flex: 1 1 100%; }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 14px; align-items: flex-start; }
  .header-actions { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .btn-refresh, .btn-save { flex: 1; justify-content: center; }

  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group, .search-group { width: 100%; min-width: 100%; }

  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
  .btn-search { flex-shrink: 0; }
}
</style>
