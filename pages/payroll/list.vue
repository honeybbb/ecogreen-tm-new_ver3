<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";
import Pagination from "~/components/Pagination.vue";
import {calculateAge} from "~/utils/formatter.js";

const {
  siteOptions,
  typeOptions,
  fetchSiteOptions,
  fetchTypeOptions,
} = useApi();

// 상태
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const searchTerm = ref('');
const selectedSite = ref('전체');
const selectedType = ref('전체');

const items = ref([]);
const isLoading = ref(false);
const error = ref(null);

// ── 페이지네이션 상태 ──────────────────────────────
const currentPage = ref(1);
const pageSize    = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

// 동적 컬럼
const payItems = computed(() => items.value.filter(i => i.groupNm === '지급항목'));
const deductionItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));
const checkedItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));

// 데이터
const payrollList = ref([]);
const targetCodes = ref({ pension: '', health: '', longTerm: '', employment: '' });
const ageLimits = ref({ pension: 0, employment: 0 }); //4대보험 상한 연령 상태

// ── 데이터 변환 (상태값 추가) ──────────────────────
const transformPayrollList = (rows) => {
  return rows.map(row => {
    let payments = {}, deductions = {}, flags = {};
    try { payments = typeof row.payItems === 'string' ? JSON.parse(row.payItems) : row.payItems || {}; } catch {}
    try { deductions = typeof row.deductionItems === 'string' ? JSON.parse(row.deductionItems) : row.deductionItems || {}; } catch {}
    try {
      flags = typeof row.checkedItems === 'string'
          ? JSON.parse(row.checkedItems)
          : (row.checkedItems || {});
      if (Object.keys(flags).length === 0 && deductionItems.value.length) {
        deductionItems.value.forEach(item => flags[item.itemCd] = true);
      }
    } catch {}
    return {
      ...row,
      payments,
      deductions,
      deductionFlags: flags,
      selected: false,
      status: row.status // 1: 저장 완료 (기본값)
    };
  });
};

// ── 값 변경 시 '저장 대기'로 상태 변경 ─────────────
const markAsDraft = (row) => {
  row.status = 2;       // 2: 저장 대기 (수정됨)
  row.selected = true;  // 수정된 항목은 자동으로 체크되도록 편의성 추가
};

// 계산
const calculateRow = (row) => {
  let gross = 0, ded = 0;
  if (row.payments) payItems.value.forEach(i => gross += Number(row.payments[i.itemCd] || 0));
  if (row.deductions) deductionItems.value.forEach(i => ded += Number(row.deductions[i.itemCd] || 0));
  return { gross, ded, net: gross - ded };
};

// ── 필터링 ─────────────────────────────────────────
const onFilterChange = () => {
  currentPage.value = 1; // 필터 변경 시 1페이지로 리셋
};

const filteredPayrollList = computed(() => {
  const filtered = payrollList.value.filter(p =>
      (selectedSite.value === '전체' || p.sIdx == selectedSite.value) &&
      p.staff.toLowerCase().includes(searchTerm.value.toLowerCase()) &&
      (selectedType.value === '전체' || p.type === selectedType.value)
  );
  return filtered.sort((a, b) => Number(b.sIdx) - Number(a.sIdx) || Number(a.idx) - Number(b.idx));
});

// 전체 합계 (필터된 전체 목록 기준)
const totalSummary = computed(() => {
  const s = { gross: 0, ded: 0, net: 0 };
  filteredPayrollList.value.forEach(p => {
    const c = calculateRow(p);
    s.gross += c.gross; s.ded += c.ded; s.net += c.net;
  });
  return s;
});

// ── 페이지네이션 Computed ───────────────────────────
const pagedPayrollList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredPayrollList.value.slice(start, start + pageSize.value);
});

const handlePageChange = () => {
  document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── 전체 선택/해제 로직 (현재 페이지 기준) ──────────────
const selectAll = computed({
  get: () => pagedPayrollList.value.length > 0 && pagedPayrollList.value.every(p => p.selected),
  set: (val) => {
    pagedPayrollList.value.forEach(p => p.selected = val);
  }
});

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

const fetchOverAgeOption = async () => {
  const groupCd = '02003';

  try {
    const res = await axios.get(`/api/v1/code/group/${groupCd}`);
    const codes = res.data.data || [];

    // (항목명에 특정 단어가 포함된 것을 찾아 option 값을 매핑)
    const pensionCode = codes.find(c => c.itemNm.includes('국민연금'));
    const employCode = codes.find(c => c.itemNm.includes('고용보험'));

    if (pensionCode && pensionCode.option) ageLimits.value.pension = Number(pensionCode.option);
    if (employCode && employCode.option) ageLimits.value.employment = Number(employCode.option);

  } catch (e) {
    console.error('연령 기준 코드를 불러오지 못해 기본값(60, 65)을 적용합니다.', e);
  }
};

const calculateInsurances = (row, sourceItem) => {
  // 과세 기준액: 식대(04001005) 10만원까지 비과세, 초과분은 과세
  let taxable = 0;
  if (row.payments) {
    Object.keys(row.payments).forEach(k => {
      if (k === '04001005') {
        // 식대: 100,000원 초과분만 과세
        const mealAmt = Number(row.payments[k] || 0);
        taxable += Math.max(0, mealAmt - 100000);
      } else {
        taxable += Number(row.payments[k] || 0);
      }
    });
  }

  const rates = targetCodes.value;

  if (!sourceItem) {
    // 전체 재계산
    deductionItems.value.forEach(d =>
        row.deductionFlags?.[d.itemCd]
            ? applyDeductionLogic(row, d, taxable, rates)
            : (row.deductions[d.itemCd] = 0)
    );
    return;
  }

  const isPay = payItems.value.some(p => p.itemCd === sourceItem.itemCd);
  if (isPay) {
    // 지급 항목 변경 시 → 건강보험 먼저, 나머지 순서대로
    const healthItem = deductionItems.value.find(d => d.itemCd === '04002001');
    if (healthItem && row.deductionFlags['04002001']) {
      applyDeductionLogic(row, healthItem, taxable, rates);
    }
    deductionItems.value.forEach(d => {
      if (d.itemCd === '04002001') return; // 이미 처리
      if (row.deductionFlags[d.itemCd]) applyDeductionLogic(row, d, taxable, rates);
    });
  } else {
    // 공제 항목 체크박스 변경 시
    if (!row.deductionFlags[sourceItem.itemCd]) {
      row.deductions[sourceItem.itemCd] = 0;
      // 건강보험 해제 시 장기요양도 0으로
      if (sourceItem.itemCd === '04002001') row.deductions['04002002'] = 0;
      return;
    }
    // 건강보험 체크 시 장기요양도 같이 재계산
    if (sourceItem.itemCd === '04002001') {
      applyDeductionLogic(row, sourceItem, taxable, rates);
      const ltItem = deductionItems.value.find(d => d.itemCd === '04002002');
      if (ltItem && row.deductionFlags['04002002']) applyDeductionLogic(row, ltItem, taxable, rates);
    } else {
      applyDeductionLogic(row, sourceItem, taxable, rates);
    }
  }
};

const applyDeductionLogic = async (row, item, base, rates) => {
  // 소득세(04002013): API 호출, 지방소득세(04002014) 동시 처리
  if (item.itemCd === '04002013') {
    const { incomeTax, localTax } = await getIncomeTax(base, row.familyCnt || 1);
    row.deductions['04002013'] = incomeTax;
    row.deductions['04002014'] = localTax;
    return;
  }

  if (item.itemCd === '04002014') return; // 소득세 계산 시 같이 처리됨

  let amt = 0;
  const currentAge = calculateAge(row.birthDt);
  console.log(currentAge, 'currentAge')

  // 💡 5. 나이 기준 초과 시 강제 0원 및 체크 해제 처리
  if (item.itemCd === '04002003') { // 국민연금
    if (currentAge > 0 && currentAge >= ageLimits.value.pension) {
      amt = 0;
      row.deductionFlags['04002003'] = false;
    } else {
      amt = base * (rates.pension / 100);
    }
  }
  else if (item.itemCd === '04002001') { // 건강보험
    amt = base * (rates.health / 100);
  }
  else if (item.itemCd === '04002002') { // 장기요양
    const healthAmt = row.deductions['04002001'] || 0;
    amt = healthAmt * (rates.longTerm / 100);
  }
  else if (item.itemCd === '04002004') { // 고용보험
    if (currentAge > 0 && currentAge >= ageLimits.value.employment) {
      amt = 0;
      row.deductionFlags['04002004'] = false;
    } else {
      amt = base * (rates.employment / 100);
    }
  }
  else return;

  row.deductions[item.itemCd] = Math.floor(amt / 10) * 10;
};

// 소득세/지방소득세 조회 (한 번에)
const getIncomeTax = async (taxableIncome, familyCnt = 1) => {
  const res = await axios.get(`/api/v1/config/tax/income/${new Date().getFullYear()}`, {
    params: { salary: taxableIncome, familyCnt, year: new Date().getFullYear() }
  });
  return res.data; // { incomeTax: 11810, localTax: 1180 }
};


// ── 선택 저장 로직 ────────────────────────
const savePayroll = async () => {
  const selectedRows = payrollList.value.filter(p => p.selected);

  if (selectedRows.length === 0) {
    alert('저장할 직원을 체크해주세요.');
    return;
  }

  if (!confirm(`체크된 ${selectedRows.length}명의 급여 정보를 저장하시겠습니까?`)) return;

  try {
    await Promise.all(selectedRows.map(row => {
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
    alert('급여 정보가 성공적으로 저장되었습니다.');
    await fetchMembers(); // 저장 후 목록 갱신 (상태가 다시 '저장 완료'로 바뀜)
  } catch (e) { alert('저장 실패'); }
};

const getPayrollList = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get('/api/v1/member/payroll');
    payrollList.value = res.data.data?.length ? transformPayrollList(res.data.data) : [];
    currentPage.value = 1; // 조회 성공 시 1페이지 리셋
  } catch(e) { payrollList.value = []; }
  finally { isLoading.value = false; }
};

onMounted(async () => {
  await Promise.all([
    getTaxRate(),
    getWageCode(),
    fetchOverAgeOption(),
    fetchSiteOptions(),
    fetchTypeOptions()
  ]);
  await getPayrollList();
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
        <button @click="savePayroll" class="btn-save">
          <i class="mdi mdi-content-save-outline"></i><span>선택 급여 저장</span>
        </button>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 근무 현장</label>
          <!--select v-model="selectedSite" @change="onFilterChange" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select-->
          <SiteSelect v-model="selectedSite" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-box-outline"></i> 구분</label>
          <select v-model="selectedType" @change="onFilterChange" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
          </select>
        </div>
        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input type="text" v-model="searchTerm" placeholder="이름으로 검색..." class="search-input" @input="onFilterChange" @keyup.enter="fetchMembers">
            <button v-if="searchTerm" @click="searchTerm = ''; onFilterChange()" class="search-clear"><i class="mdi mdi-close"></i></button>
          </div>
          <button @click="fetchMembers" class="btn-search"><i class="mdi mdi-magnify"></i><span>검색</span></button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div><p>불러오는 중...</p>
    </div>

    <div class="table-card" v-else>
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>급여 목록 ({{ filteredPayrollList.length }}명)</span>
        </div>

        <div class="header-right-controls" style="display: flex; align-items: center; gap: 16px;">
          <div class="status-legend">
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
            <th rowspan="2" class="text-center" style="width:30px;">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="selectAll" class="custom-checkbox" />
              </label>
            </th>
            <th rowspan="2" class="text-center" style="width:40px;">No.</th>
            <th rowspan="2" class="text-center" style="width:110px;">현장명</th>
            <th rowspan="2" class="text-center" style="width:70px;">직책</th>
            <th rowspan="2" class="text-center" style="width:80px;">사번</th>
            <th rowspan="2" class="text-center" style="width:80px;">성명</th>
            <th colspan="2" class="text-center group-header-summary">합계</th>
            <th :colspan="payItems.length" class="text-center group-header-pay">지급 항목</th>
            <th :colspan="deductionItems.length" class="text-center group-header-deduction">공제 항목 (체크 시 자동계산)</th>
          </tr>
          <tr>
            <th class="text-right sub-header">지급합계</th>
            <th class="text-right sub-header">공제합계</th>
            <th v-for="item in payItems" :key="item.itemCd" class="text-right sub-header amount-header">{{ item.itemNm }}</th>
            <th v-for="item in deductionItems" :key="item.itemCd" class="text-right sub-header amount-header">{{ item.itemNm }}</th>
          </tr>
          </thead>

          <tbody>
          <tr v-for="(p, i) in pagedPayrollList" :key="p.idx" class="data-row">
            <td class="text-center calculate-status transition-colors"
                :class="{
                  'calculate-active': p.status == 1,
                  'calculate-draft': p.status == 2,
                  'calculate-inactive': p.status == 0
                }"
            >
              <label class="checkbox-wrapper"><input type="checkbox" v-model="p.selected" class="custom-checkbox" /></label>
            </td>
            <td class="text-center text-gray">{{ (currentPage - 1) * pageSize + i + 1 }}</td>
            <td class="text-center text-dark compact-text">{{ p.siteName }}</td>
            <td class="text-center text-gray compact-text">{{ p.role }}</td>
            <td class="text-center text-gray compact-text">{{ p.id }}</td>
            <td class="text-center font-bold text-dark member-name">{{ p.staff }}</td>

            <td class="text-right bg-light-gray font-bold amount-cell">{{ formatCurrency(calculateRow(p).gross) }}</td>
            <td class="text-right bg-light-gray font-bold text-red amount-cell">{{ formatCurrency(calculateRow(p).ded) }}</td>

            <td v-for="item in payItems" :key="item.itemCd" class="amount-cell">
              <input v-if="p.payments" type="number" v-model.number="p.payments[item.itemCd]" @input="markAsDraft(p); calculateInsurances(p, item)" class="inline-input">
            </td>

            <td v-for="item in deductionItems" :key="item.itemCd" class="amount-cell">
              <div class="deduction-combo-box">
                <label class="checkbox-wrapper-sm">
                  <input type="checkbox" v-model="p.deductionFlags[item.itemCd]" @change="markAsDraft(p); calculateInsurances(p, item)" class="custom-checkbox custom-checkbox-sm">
                </label>
                <input v-if="p.deductions" type="number" v-model.number="p.deductions[item.itemCd]" @input="markAsDraft(p)" class="inline-input" :disabled="!p.deductionFlags[item.itemCd]">
              </div>
            </td>
          </tr>

          <tr v-if="filteredPayrollList.length === 0">
            <td :colspan="8 + payItems.length + deductionItems.length" class="empty-state">
              <i class="mdi mdi-text-box-search-outline"></i><p>조건에 맞는 급여 데이터가 없습니다.</p>
            </td>
          </tr>
          </tbody>

          <tfoot>
          <tr class="table-footer sticky-footer">
            <td colspan="6" class="text-center"><span class="font-bold text-dark">전체 합계</span></td>
            <td class="text-right font-bold">{{ formatCurrency(totalSummary.gross) }}</td>
            <td class="text-right font-bold text-red">{{ formatCurrency(totalSummary.ded) }}</td>
            <td :colspan="payItems.length" class="bg-light-gray border-none"></td>
            <td :colspan="deductionItems.length" class="bg-light-gray text-center border-none">
              <div class="net-pay-box">
                <span class="net-pay-label">실 지급액 합계</span>
                <span class="net-pay-value">{{ formatCurrency(totalSummary.net) }} 원</span>
              </div>
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
/* =========================================
   페이지 고유 스타일 (공통 CSS 이외)
========================================= */

/* === 상태 범례 (Legend) 스타일 추가 === */
.status-legend { display: flex; align-items: center; gap: 16px; font-size: 12px; color: var(--text-sub); font-weight: 600;}
.legend-item { display: flex; align-items: center; gap: 6px; }
.legend-color { width: 14px; height: 14px; border-radius: 4px; display: inline-block; box-shadow: var(--shadow-sm); }
.legend-color.calculate-inactive { background-color: var(--bg-canvas); border: 1px solid var(--border-color); }
.legend-color.calculate-draft { background-color: var(--warning); }
.legend-color.calculate-active { background-color: var(--success); }

/* === 상태 컬럼 디자인 (왼쪽 굵은 테두리로 시각적 임팩트 부여) === */
.calculate-status { position: relative; }

.calculate-inactive {
  background-color: var(--bg-canvas);
}
.calculate-draft {
  background-color: rgba(245, 158, 11, 0.15) !important;
  box-shadow: inset 4px 0 0 var(--warning);
}
.calculate-active {
  background-color: rgba(16, 185, 129, 0.15) !important;
  box-shadow: inset 4px 0 0 var(--success);
}

/* === 로딩 상태 === */
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

/* === 테이블 컨트롤 영역 === */
.page-size-select {
  display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub);
}

.table-scroll-container {
  overflow: auto; max-width: 100%;
  max-height: calc(100vh - 350px);
}
.table-scroll-container::-webkit-scrollbar { height: 8px; width: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* === 데이터 테이블 헤더 및 셀 (2단 헤더) === */
.data-table thead {
  position: sticky; top: 0; z-index: 30;
}

.data-table th:last-child { border-right: none; }
.data-table td:last-child { border-right: none; }

/* 그룹/서브 헤더 미세 색상 분리 */
.group-header-summary, .group-header-pay, .group-header-deduction { background-color: var(--bg-canvas); border-bottom: 1px solid var(--border-color); }
.sub-header { background-color: var(--bg-hover); border-bottom: 1px solid var(--border-color); }

.data-table td {
  padding: 8px 10px; border-bottom: 1px solid var(--bg-canvas);
  border-right: 1px solid var(--bg-hover); vertical-align: middle; word-break: keep-all;
}

/* 데이터 행 오버 시 색상 제거/변경을 원한다면 추가 설정 가능 */
.data-row { background: var(--bg-surface); }
.data-row:hover { background-color: var(--primary-soft); }

.amount-header, .amount-cell {
  min-width: 75px;
}

.deduction-combo-box {
  display: flex;
  gap: 4px;
  align-items: center;
}
/* 유틸리티 */
.member-name { font-weight: 700; color: var(--primary); }
.bg-light-gray { background-color: var(--bg-canvas); }

/* 입력창 (플랫 스타일, Hover/Focus 시 형태 강조) */
.inline-input {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%; /* 부모(td)를 절대 넘지 못하게 강제 */
  min-width: 0; /* 억지로 공간을 차지하던 min-width 제거 */
  padding: 6px 4px; /* 좌우 여백을 살짝 줄여서 글자 들어갈 공간 최대 확보 */
  text-align: right;
  font-size: 13px;
  color: var(--text-main);
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  transition: all 0.2s;
}
.inline-input:hover { border-color: var(--border-focus); background: var(--bg-surface); }
.inline-input:focus {
  outline: none; border-color: var(--primary); background: var(--bg-surface);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

/* 커스텀 체크박스 (체크 여부 및 선택 상태) */
.deduction-check-cell { background-color: var(--bg-surface); }
.checkbox-wrapper { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; cursor: pointer;}
.custom-checkbox {
  appearance: none; -webkit-appearance: none;
  width: 18px; height: 18px; border: 2px solid var(--border-focus); border-radius: 4px;
  cursor: pointer; position: relative; transition: all 0.2s; background: var(--bg-surface); margin:0;
}
.custom-checkbox:hover { border-color: var(--text-muted); }
.custom-checkbox:checked { border-color: var(--primary); background-color: var(--primary); }
.custom-checkbox:checked::after {
  content: ''; position: absolute; top: 2px; left: 5px;
  width: 4px; height: 8px; border: solid var(--text-inverse); border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* === 하단 통계 푸터 (Sticky Footer) === */
.table-footer.sticky-footer {
  position: sticky; bottom: 0; z-index: 25;
  background-color: var(--bg-canvas); border-top: 2px solid var(--border-focus);
  box-shadow: 0 -4px 6px -1px rgba(0,0,0,0.05);
}

.table-footer td { padding: 14px 10px; font-size: 14px; }

.net-pay-box {
  display: inline-flex; align-items: center; gap: 12px;
  background-color: var(--primary-soft); padding: 8px 20px; border-radius: 8px; border: 1px solid rgba(37, 99, 235, 0.2);
}
.net-pay-label { font-size: 13px; color: var(--primary); font-weight: 600; }
.net-pay-value { font-size: 18px; color: var(--primary); font-weight: 700; letter-spacing: 0.5px;}

/* === 반응형 === */
@media (max-width: 768px) {
  .status-legend { width: 100%; justify-content: space-between; padding: 10px 0; }
  .header-right-controls { flex-direction: column; align-items: stretch !important; gap: 8px !important; }
}
</style>
