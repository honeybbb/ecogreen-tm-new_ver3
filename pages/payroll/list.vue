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
        <button @click="fetchMembers" class="btn-refresh"><i class="mdi mdi-refresh"></i><span>새로고침</span></button>
        <button @click="savePayroll" class="btn-save"><i class="mdi mdi-content-save"></i><span>저장하기</span></button>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
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
            <input type="text" v-model="searchTerm" placeholder="이름으로 검색..." class="search-input" @keyup.enter="fetchMembers">
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear"><i class="mdi mdi-close"></i></button>
          </div>
          <button @click="fetchMembers" class="btn-search"><i class="mdi mdi-magnify"></i><span>검색</span></button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state"><div class="spinner"></div><p>불러오는 중...</p></div>

    <div class="table-card">
      <!-- 상단 블루바 -->
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
            <th rowspan="2" class="text-center" style="width:20px;"></th>
            <th rowspan="2" class="text-center" style="width:50px;">No.</th>
            <th rowspan="2" class="text-center" style="width:130px;">현장명</th>
            <th rowspan="2" class="text-center" style="width:80px;">직책</th>
            <th rowspan="2" class="text-center" style="width:80px;">사번</th>
            <th rowspan="2" class="text-center" style="width:110px;">성명</th>
            <th colspan="2" class="text-center group-header-summary">합계</th>
            <th :colspan="payItems.length" class="text-center group-header-pay">지급 항목</th>
            <th :colspan="deductionItems.length * 2" class="text-center group-header-deduction">공제 항목</th>
          </tr>
          <tr>
            <th class="text-right">지급합계</th>
            <th class="text-right">공제합계</th>
            <th v-for="item in payItems" :key="item.itemCd" class="text-right bg-pay-sub amount-header">{{ item.itemNm }}</th>
            <th v-for="item in deductionItems" :key="item.itemCd" class="text-right bg-ded-sub amount-header">{{ item.itemNm }}</th>
            <th v-for="item in checkedItems" :key="'chk-'+item.itemCd" class="text-center bg-ded-sub" style="width:55px;">{{ item.itemNm }}<br>(적용)</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(p, i) in filteredPayrollList" :key="p.idx">
            <td class="text-center"><input type="checkbox"></td>
            <td class="text-center">{{ i+1 }}</td>
            <td class="text-center">{{ p.siteName }}</td>
            <td class="text-center">{{ p.role }}</td>
            <td class="text-center">{{ p.id }}</td>
            <td class="text-center fw-bold">{{ p.staff }}</td>

            <td class="text-right bg-light-gray amount-cell">{{ formatCurrency(calculateRow(p).gross) }}</td>
            <td class="text-right bg-light-gray amount-cell text-red">{{ formatCurrency(calculateRow(p).ded) }}</td>

            <td v-for="item in payItems" :key="item.itemCd" class="amount-cell">
              <input v-if="p.payments" type="number" v-model.number="p.payments[item.itemCd]" @input="calculateInsurances(p, item)" class="inline-input">
            </td>
            <td v-for="item in deductionItems" :key="item.itemCd" class="amount-cell">
              <input v-if="p.deductions" type="number" v-model.number="p.deductions[item.itemCd]" class="inline-input">
            </td>
            <td v-for="item in checkedItems" :key="'ded-chk-'+item.itemCd" class="text-center deduction-check-cell">
              <input type="checkbox" v-model="p.deductionFlags[item.itemCd]" @change="calculateInsurances(p, item)">
            </td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="table-footer sticky-footer">
            <td colspan="6" class="text-center"><span class="fw-bold">전체 합계</span></td>
            <td class="text-right">{{ formatCurrency(totalSummary.gross) }}</td>
            <td class="text-right text-red">{{ formatCurrency(totalSummary.ded) }}</td>
            <td :colspan="payItems.length" class="bg-light-gray"></td>
            <td :colspan="deductionItems.length * 2" class="bg-light-gray text-center fw-bold">
              실 지급액 합계: <span class="text-blue">{{ formatCurrency(totalSummary.net) }}</span> 원
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

.payroll-staff-list-page { padding: 0; }

.table-header {
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

/* 테이블 컨테이너 - 세로/가로 스크롤 모두 활성화 */
.table-scroll-container {
  overflow: auto;
  max-width: 100%;
  max-height: calc(100vh - 420px);   /* ← 화면 크기에 따라 자동 조절 */
  /*scrollbar-width: thin;
  scrollbar-color: #64748b #f1f5f9;*/
}
/*
.table-scroll-container::-webkit-scrollbar { height: 10px; width: 10px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: #64748b; border-radius: 10px; }
 */
/* 테이블 */
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

/* tfoot 전체 합계 행 고정 */
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
  word-break: keep-all;
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

.deduction-check-cell { background: #fffdfd; }
.deduction-check-cell input { width: 18px; height: 18px; cursor: pointer; }

/*
.group-header-pay { background: #eff6ff !important; color: #1e40af; }
.group-header-deduction { background: #fef2f2 !important; color: #b91c1c; }
.group-header-summary { background: #f3f4f6 !important; }

 */

.text-red { color: #ef4444; }
.text-blue { color: #2563eb; }
.bg-light-gray { background: #f8fafc; }
.fw-bold { font-weight: 600; }

/* 기타 */
.page-header { display: flex; justify-content: space-between; margin-bottom: 24px; }
.page-title { font-size: 28px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 12px; }
.btn-refresh, .btn-save { padding: 12px 20px; border-radius: 10px; font-weight: 600; transition: all 0.3s; }
.btn-save { background: linear-gradient(135deg, #10b981, #059669); color: white; }
.filter-panel { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); margin-bottom: 24px; }
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
