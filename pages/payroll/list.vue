<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '~/stores/auth.js';
import Pagination from '~/components/Pagination.vue';
import { calculateAge } from '~/utils/formatter.js';
import { useTableResize } from '~/composables/useTableResize.js';

const {
  siteOptions,
  typeOptions,
  fetchSiteOptions,
  fetchTypeOptions,
} = useApi();

// ── 상태 ──────────────────────────────────────────
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const searchTerm = ref('');
const selectedSite = ref('전체');
const selectedType = ref('전체');
const selectedStatus = ref('전체');

const items = ref([]);
const isLoading = ref(false);
const error = ref(null);

// ── 페이지네이션 ──────────────────────────────────
const currentPage = ref(1);
const pageSize    = ref(50);
const pageSizeOptions = [50, 100, 200, 500];

// ── 동적 컬럼 ─────────────────────────────────────
const payItems       = computed(() => items.value.filter(i => i.groupNm === '지급항목'));
const deductionItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));

// ── 데이터 ────────────────────────────────────────
const payrollList  = ref([]);
const targetCodes  = ref({ pension: '', health: '', longTerm: '', employment: '' });
const ageLimits    = ref({ pension: 0, employment: 0 });

// ── 컬럼 리사이즈 ─────────────────────────────────
const { startResize } = useTableResize();

// ── 데이터 변환 ───────────────────────────────────
const transformPayrollList = (rows) => {
  return rows.map(row => {
    let payments = {}, deductions = {}, flags = {};

    // 1. JSON 데이터 파싱
    try { payments = typeof row.payItems === 'string' ? JSON.parse(row.payItems) : row.payItems || {}; } catch {}
    try { deductions = typeof row.deductionItems === 'string' ? JSON.parse(row.deductionItems) : row.deductionItems || {}; } catch {}
    try { flags = typeof row.checkedItems === 'string' ? JSON.parse(row.checkedItems) : (row.checkedItems || {}); } catch {}

    // 2. [핵심] 체크 정보가 없는 초기 로드 시 처리
    if (Object.keys(flags).length === 0 && deductionItems.value.length) {
      deductionItems.value.forEach(item => {
        const amount = Number(deductions[item.itemCd]) || 0;

        if (amount > 0) {
          // 🌟 값이 들어있다면 체크박스를 자동으로 'true'로 설정 (데이터 유지)
          flags[item.itemCd] = true;
        } else {
          // 값이 0이거나 없는 경우에만 false 및 0원 처리
          flags[item.itemCd] = false;
          deductions[item.itemCd] = 0;
        }
      });
    }

    return {
      ...row,
      payments,
      deductions,
      deductionFlags: flags,
      selected: false,
      // status: mbs.idx가 없으면(계약서데이터) 0, 있으면 1
      status: row.status ?? 0,
    };
  });
};

// ── 값 변경 시 '저장 대기'로 상태 변경 ─────────────
const markAsDraft = (row) => {
  row.status   = 2;
  row.selected = true;
};

// ── 4대보험 예외(경고) 상태 계산 ───────────────────
const getInsuranceWarning = (row) => {
  const age = calculateAge(row.birthDt);
  if (!age) return { type: 'normal', message: '' };

  const flags = row.deductionFlags || {};

  // 케이스 1: 국민연금 강제 해제 (위험 - 빨간색)
  if (age < ageLimits.value.pension && flags['04002003'] === false) {
    return {
      type: 'danger',
      message: '국민연금 대상자이나 임의로 해제되었습니다.'
    };
  }

  // 케이스 2: 고용보험 고용확대 (특이사항 - 파란색/보라색)
  if (age >= ageLimits.value.employment && flags['04002004'] === true) {
    return {
      type: 'info',
      message: '고용보험 가입 연령이 지났으나 임의 가입(고용확대) 되었습니다.'
    };
  }

  // 케이스 3: 건강보험 강제 해제 (주의 - 주황색)
  if (flags['04002001'] === false) {
    return {
      type: 'warning',
      message: '건강보험이 임의로 해제되었습니다.'
    };
  }

  // 정상
  return { type: 'normal', message: '' };
};

// 입력 시 숫자만 추출하여 저장하는 함수
const onInputAmount = (row, item, group, event) => {
  const el = event.target;
  const selectionStart = el.selectionStart;
  const oldLength = el.value.length;

  const rawValue = el.value.replace(/[^\d]/g, '');
  const numValue = Number(rawValue) || 0;

  if (group === 'pay') {
    row.payments[item.itemCd] = numValue;
  } else {
    row.deductions[item.itemCd] = numValue;
  }

  // 화면 업데이트 (콤마 포맷팅)
  const formatted = formatCurrency(numValue);
  el.value = formatted;

  // 커서 위치 보정
  const newLength = formatted.length;
  const nextPos = selectionStart + (newLength - oldLength);
  el.setSelectionRange(nextPos, nextPos);

  markAsDraft(row); // 저장 대기 상태로 변경

  // 지급 항목을 바꿀 때만 '자동 계산'을 실행합니다.
  // 사용자가 공제 항목을 직접 타이핑할 때는 자동 계산을 돌리지 않아야 값이 유지됩니다.
  if (group === 'pay') {
    calculateInsurances(row, item);
  }
};

// ── 행 합계 계산 ──────────────────────────────────
const calculateRow = (row) => {
  let gross = 0, ded = 0;
  if (row.payments)    payItems.value.forEach(i       => gross += Number(row.payments[i.itemCd]    || 0));
  if (row.deductions)  deductionItems.value.forEach(i => ded   += Number(row.deductions[i.itemCd]  || 0));
  return { gross, ded, net: gross - ded };
};

// ── 필터 변경 시 1페이지로 리셋 ───────────────────
const onFilterChange = () => { currentPage.value = 1; };

// ── 필터링 + 정렬 ─────────────────────────────────
const filteredPayrollList = computed(() => {
  const filtered = payrollList.value.filter(p =>
      (selectedSite.value === '전체' || p.sIdx == selectedSite.value) &&
      p.staff.toLowerCase().includes(searchTerm.value.toLowerCase()) &&
      (selectedType.value === '전체' || p.type === selectedType.value) &&
      (selectedStatus.value === '전체' || p.mStatus == selectedStatus.value)
  );

  filtered.sort((a, b) => {
    // ★ 사용자 클릭 정렬 (직책 컬럼 클릭 시 문자열 정렬 등)
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

// ── 전체 합계 (필터된 전체 목록 기준) ─────────────
const totalSummary = computed(() => {
  const s = { gross: 0, ded: 0, net: 0 };
  filteredPayrollList.value.forEach(p => {
    const c = calculateRow(p);
    s.gross += c.gross; s.ded += c.ded; s.net += c.net;
  });
  return s;
});

// ── 페이지네이션 ──────────────────────────────────
const pagedPayrollList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredPayrollList.value.slice(start, start + pageSize.value);
});

const handlePageChange = () => {
  document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── 현재 페이지 전체 선택/해제 ────────────────────
const selectAll = computed({
  get: () => pagedPayrollList.value.length > 0 && pagedPayrollList.value.every(p => p.selected),
  set: (val) => pagedPayrollList.value.forEach(p => p.selected = val),
});

// ── API: 임금 코드 ────────────────────────────────
const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    items.value = res.data.data || [];
  } catch {}
};

// ── API: 세율 ─────────────────────────────────────
const getTaxRate = async () => {
  const year = new Date().getFullYear();
  try {
    const res  = await axios.get(`/api/v1/config/tax/rate/${year}`);
    const list = res.data.data || [];
    const tax  = list.find(t => Number(t.applied_year) === year) || list[0] || {};
    targetCodes.value = {
      pension:    tax.pension_rate,
      health:     tax.health_rate,
      longTerm:   tax.long_term_care_rate,
      employment: tax.employment_rate,
    };
  } catch {}
};

// ── API: 4대보험 연령 상한 ────────────────────────
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

// ── 보험료 계산 ───────────────────────────────────
const calculateInsurances = (row, sourceItem) => {
  // 식대(04001005) 10만원까지 비과세, 초과분 과세
  let taxable = 0;
  if (row.payments) {
    Object.keys(row.payments).forEach(k => {
      if (k === '04001005') {
        taxable += Math.max(0, Number(row.payments[k] || 0) - 100000);
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
    // 지급 항목 변경 → 건강보험 먼저, 나머지 순서대로
    const healthItem = deductionItems.value.find(d => d.itemCd === '04002001');
    if (healthItem && row.deductionFlags['04002001']) {
      applyDeductionLogic(row, healthItem, taxable, rates);
    }
    deductionItems.value.forEach(d => {
      if (d.itemCd === '04002001') return;
      if (row.deductionFlags[d.itemCd]) applyDeductionLogic(row, d, taxable, rates);
    });
  } else {
    // 공제 항목 체크박스 변경
    if (!row.deductionFlags[sourceItem.itemCd]) {
      row.deductions[sourceItem.itemCd] = 0;
      if (sourceItem.itemCd === '04002001') row.deductions['04002002'] = 0;
      return;
    }
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
  // 소득세: API 호출 후 지방소득세 동시 처리
  if (item.itemCd === '04002013') {
    const { incomeTax, localTax } = await getIncomeTax(base, row.familyCnt || 1);
    row.deductions['04002013'] = incomeTax;
    row.deductions['04002014'] = localTax;
    return;
  }
  if (item.itemCd === '04002014') return;

  let amt = 0;
  // const currentAge = calculateAge(row.birthDt); // 연령 체크가 필요 없다면 이 변수도 생략 가능합니다.

  if (item.itemCd === '04002003') {        // 국민연금
    // 기존의 연령 체크 및 deductionFlags = false 로직 삭제
    amt = base * (rates.pension / 100);
  } else if (item.itemCd === '04002001') { // 건강보험
    amt = base * (rates.health / 100);
  } else if (item.itemCd === '04002002') { // 장기요양
    const healthAmt = row.deductions['04002001'] || 0;
    amt = healthAmt * (rates.longTerm / 100);
  } else if (item.itemCd === '04002004') { // 고용보험
    // 기존의 연령 체크 및 deductionFlags = false 로직 삭제
    amt = base * (rates.employment / 100);
  } else return;

  row.deductions[item.itemCd] = Math.floor(amt / 10) * 10;
};

// ── API: 소득세/지방소득세 조회 ───────────────────
const getIncomeTax = async (taxableIncome, familyCnt = 1) => {
  const year = new Date().getFullYear();
  const res  = await axios.get(`/api/v1/config/tax/income/${year}`, {
    params: { salary: taxableIncome, familyCnt, year },
  });
  return res.data; // { incomeTax, localTax }
};

// ── 선택 저장 ─────────────────────────────────────
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
        mIdx:           row.idx,
        sIdx:           row.sIdx,
        year:           new Date().getFullYear(),
        grossPay:       c.gross,
        deductions:     c.ded,
        netPay:         c.net,
        payItems:       JSON.stringify(row.payments       || {}),
        deductionItems: JSON.stringify(row.deductions     || {}),
        checkedItems:   JSON.stringify(row.deductionFlags || {}),
        total:          0,
      });
    }));
    alert('급여 정보가 성공적으로 저장되었습니다.');
    await getPayrollList();
  } catch {
    alert('저장 실패');
  }
};

// ── 정렬 ──────────────────────────────────────────
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

// ── API: 급여 목록 조회 ───────────────────────────
const getPayrollList = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get('/api/v1/member/payroll');
    payrollList.value = res.data.data?.length ? transformPayrollList(res.data.data) : [];
    currentPage.value = 1;
  } catch {
    payrollList.value = [];
  } finally {
    isLoading.value = false;
  }
};

// ── 초기 로드 ─────────────────────────────────────
onMounted(async () => {
  await Promise.all([
    getTaxRate(),
    getWageCode(),
    fetchOverAgeOption(),
    fetchSiteOptions(),
    fetchTypeOptions(),
  ]);
  await getPayrollList();
});
</script>

<template>
  <div class="payroll-staff-list-page">

    <!-- ─── 페이지 헤더 ───────────────────────────── -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-cash-multiple"></i> 직원 급여 정보
        </h1>
        <p class="page-subtitle">지급·공제 항목 관리 및 4대보험 자동 계산</p>
      </div>
      <div class="header-actions">
        <button @click="savePayroll" class="btn-save">
          <i class="mdi mdi-content-save-outline"></i><span>선택 급여 저장</span>
        </button>
      </div>
    </div>

    <!-- ─── 필터 패널 ─────────────────────────────── -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-office-building-outline"></i> 근무 현장
          </label>
          <SiteSelect v-model="selectedSite" @update:modelValue="onFilterChange" />
        </div>
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-account-box-outline"></i> 구분
          </label>
          <select v-model="selectedType" @change="onFilterChange" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">
              {{ opt.itemNm }}
            </option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-check"></i> 재직 상태</label>
          <select v-model="selectedStatus" class="filter-select" @change="onFilterChange">
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
                @input="onFilterChange"
                @keyup.enter="getPayrollList"
            />
            <button v-if="searchTerm" @click="searchTerm = ''; onFilterChange()" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="getPayrollList" class="btn-search">
            <i class="mdi mdi-magnify"></i><span>검색</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ─── 로딩 ──────────────────────────────────── -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>불러오는 중...</p>
    </div>

    <!-- ─── 테이블 카드 ───────────────────────────── -->
    <div class="table-card" v-else>

      <!-- 테이블 헤더 컨트롤 -->
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>급여 목록 ({{ filteredPayrollList.length }}명)</span>
        </div>
        <div class="header-right-controls">
          <div class="status-legend">
            <span class="legend-item">
              <span class="legend-color calculate-draft"></span>저장 대기
            </span>
            <span class="legend-item">
              <span class="legend-color calculate-active"></span>저장 완료
            </span>
          </div>
          <div class="page-size-select">
            <label>페이지당</label>
            <select
                v-model="pageSize"
                @change="currentPage = 1"
                class="filter-select"
                style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;"
            >
              <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
            </select>
          </div>
        </div>
      </div>

      <!-- 스크롤 컨테이너 -->
      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-1" style="min-width:30px; max-width:30px;">
              <label class="checkbox-wrapper"><input type="checkbox" v-model="selectAll" class="custom-checkbox" /></label>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-2" style="min-width:40px; max-width:40px;" data-col-key="no">No.</th>
            <th rowspan="2" class="text-center sortable col-site sticky-col sticky-col-3" style="min-width:110px; max-width:110px;" data-col-key="siteName" @click="toggleSort('siteName')">
              <div class="th-content">현장명<i v-if="sortKey==='siteName'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-4" style="min-width:70px; max-width:70px;" data-col-key="role" @click="toggleSort('role')">
              <div class="th-content">직책<i v-if="sortKey==='role'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-5" style="min-width:80px; max-width:80px;" data-col-key="id" @click="toggleSort('id')">
              <div class="th-content">사번<i v-if="sortKey==='id'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-6" style="min-width:80px; max-width:80px;" data-col-key="staff" @click="toggleSort('staff')">
              <div class="th-content">성명<i v-if="sortKey==='staff'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th rowspan="2" class="text-center sticky-col sticky-col-7" style="min-width:100px; max-width:100px;">생년월일</th>
            <th rowspan="2" class="text-center sortable sticky-col sticky-col-8" style="min-width:70px; max-width:70px;" data-col-key="age" @click="toggleSort('birthDt')">
              <div class="th-content">나이(만)<i v-if="sortKey==='birthDt'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>

            <th colspan="2" class="text-center group-header-summary group-divider sticky-col sticky-col-group">합계</th>

            <th :colspan="payItems.length" class="text-center group-header-pay theme-pay-header group-divider">지급 항목<span class="resize-handle" @mousedown.prevent="startResize($event)"></span></th>
            <th :colspan="deductionItems.length" class="text-center group-header-deduction theme-deduct-header group-divider">공제 항목 (체크 시 자동계산)<span class="resize-handle" @mousedown.prevent="startResize($event)"></span></th>
          </tr>

          <tr>
            <th class="text-right sub-header group-divider sticky-col sticky-col-9" style="min-width:80px; max-width:80px;" data-col-key="gross">지급합계</th>
            <th class="text-right sub-header sticky-col sticky-col-10 sticky-divider" style="min-width:80px; max-width:80px;" data-col-key="ded">공제합계</th>

            <th v-for="(item, index) in payItems" :key="item.itemCd" :class="['text-right sub-header amount-header theme-pay-sub resizable', { 'group-divider': index === 0 }]" :data-col-key="'pay-' + item.itemCd">
              {{ item.itemNm }}<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
            <th v-for="(item, index) in deductionItems" :key="item.itemCd" :class="['text-right sub-header amount-header theme-deduct-sub resizable', { 'group-divider': index === 0 }]" :data-col-key="'ded-' + item.itemCd">
              {{ item.itemNm }}<span class="resize-handle" @mousedown.prevent="startResize($event)"></span>
            </th>
          </tr>
          </thead>

          <tbody>
          <tr v-for="(p, i) in pagedPayrollList" :key="p.idx" class="data-row">
            <td class="text-center calculate-status transition-colors sticky-col sticky-col-1" :class="{'calculate-active': p.status == 1, 'calculate-draft': p.status == 2, 'calculate-inactive': p.status == 0}">
              <label class="checkbox-wrapper"><input type="checkbox" v-model="p.selected" class="custom-checkbox" /></label>
            </td>
            <td class="text-center text-gray sticky-col sticky-col-2">{{ (currentPage - 1) * pageSize + i + 1 }}</td>
            <td class="text-center text-dark compact-text cell-ellipsis sticky-col sticky-col-3" :title="p.siteName">{{ p.siteName }}</td>
            <td class="text-center text-gray compact-text cell-ellipsis sticky-col sticky-col-4" :title="p.role">{{ p.role }}</td>
            <td class="text-center text-gray compact-text cell-ellipsis sticky-col sticky-col-5" :title="p.id">{{ p.id }}</td>
            <td class="text-center font-bold text-dark member-name sticky-col sticky-col-6">{{ p.staff }}</td>
            <td class="text-center text-gray sticky-col sticky-col-7">{{ p.birthDt }}</td>
            <td class="text-center sticky-col sticky-col-8">
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
            <td class="text-right bg-light-gray font-bold amount-cell group-divider sticky-col sticky-col-9">{{ formatCurrency(calculateRow(p).gross) }}</td>
            <td class="text-right bg-light-gray font-bold text-red amount-cell sticky-col sticky-col-10 sticky-divider">{{ formatCurrency(calculateRow(p).ded) }}</td>

            <td v-for="(item, index) in payItems" :key="item.itemCd" :class="['amount-cell theme-pay-cell', { 'group-divider': index === 0 }]">
              <input v-if="p.payments" @focus="$event.target.select()" type="text" :value="formatCurrency(p.payments[item.itemCd])" @input="onInputAmount(p, item, 'pay', $event)" class="inline-input" />
            </td>
            <td v-for="(item, index) in deductionItems" :key="item.itemCd" :class="['amount-cell theme-deduct-cell', { 'group-divider': index === 0 }]">
              <div class="deduction-combo-box">
                <label class="checkbox-wrapper-sm"><input type="checkbox" v-model="p.deductionFlags[item.itemCd]" @change="markAsDraft(p); calculateInsurances(p, item)" class="custom-checkbox custom-checkbox-sm" /></label>
                <input v-if="p.deductions" type="text" @focus="$event.target.select()" @input="onInputAmount(p, item, 'deduct', $event)" :value="formatCurrency(p.deductions[item.itemCd])" class="inline-input" />
              </div>
            </td>
          </tr>
          <tr v-if="filteredPayrollList.length === 0">
            <td :colspan="10 + payItems.length + deductionItems.length" class="empty-state">
              <i class="mdi mdi-text-box-search-outline"></i>
              <p>조건에 맞는 급여 데이터가 없습니다.</p>
            </td>
          </tr>
          </tbody>

          <tfoot>
          <tr class="table-footer sticky-footer">
            <td colspan="8" class="text-center sticky-col" style="left:0; z-index: 35;"><span class="font-bold text-dark">전체 합계</span></td>
            <td class="text-right font-bold group-divider sticky-col sticky-col-9">{{ formatCurrency(totalSummary.gross) }}</td>
            <td class="text-right font-bold text-red sticky-col sticky-col-10 sticky-divider">{{ formatCurrency(totalSummary.ded) }}</td>
            <td :colspan="payItems.length" class="bg-light-gray border-none theme-pay-sub group-divider"></td>
            <td :colspan="deductionItems.length" class="bg-light-gray text-center border-none theme-deduct-sub group-divider">
              <div class="net-pay-box">
                <span class="net-pay-label">실 지급액 합계</span>
                <span class="net-pay-value">{{ formatCurrency(totalSummary.net) }} 원</span>
              </div>
            </td>
          </tr>
          </tfoot>
        </table>
      </div>

      <!-- 페이지네이션 -->
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

/* === 상태 범례 === */
.age-warning { color: var(--danger) !important; font-weight: 600; }
.status-legend {
  display: flex; align-items: center; gap: 16px;
  font-size: 12px; color: var(--text-sub); font-weight: 600;
}
.legend-item { display: flex; align-items: center; gap: 6px; }
.legend-color {
  width: 14px; height: 14px; border-radius: 4px;
  display: inline-block; box-shadow: var(--shadow-sm);
}
.legend-color.calculate-inactive { background-color: var(--bg-canvas); border: 1px solid var(--border-color); }
.legend-color.calculate-draft    { background-color: var(--warning); }
.legend-color.calculate-active   { background-color: var(--success); }

/* === 상태 컬럼 === */
.calculate-status  { position: relative; }
.calculate-inactive { background-color: var(--bg-canvas); }
.calculate-draft    { background-color: rgba(245, 158, 11, 0.15) !important; box-shadow: inset 4px 0 0 var(--warning); }
.calculate-active   { background-color: rgba(16, 185, 129, 0.15) !important; box-shadow: inset 4px 0 0 var(--success); }

/* === 로딩 === */
.loading-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; background: var(--bg-surface);
  border-radius: 12px; border: 1px solid var(--border-color);
  margin-bottom: 24px;
}
.spinner {
  width: 40px; height: 40px;
  border: 3px solid var(--bg-canvas); border-top-color: var(--primary);
  border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p { margin-top: 16px; font-size: 14px; color: var(--text-sub); }

/* === 테이블 컨트롤 영역 === */
.header-right-controls { display: flex; align-items: center; gap: 16px; }
.page-size-select {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--text-sub);
}

/* === 공제 콤보 === */
.deduction-combo-box { display: flex; gap: 4px; align-items: center; }

/* === 유틸 === */
.member-name   { font-weight: 700; color: var(--primary); }
.bg-light-gray { background-color: var(--bg-canvas); }

/* === 인라인 인풋 === */
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
.inline-input:hover  { border-color: var(--border-focus); background: var(--bg-surface); }
.inline-input:focus  {
  outline: none; border-color: var(--primary); background: var(--bg-surface);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.inline-input:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
.amount-cell { width: 90px; }
  /* === 커스텀 체크박스 === */
.checkbox-wrapper    { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; cursor: pointer; }
.checkbox-wrapper-sm { display: flex; align-items: center; cursor: pointer; }
.custom-checkbox {
  appearance: none; -webkit-appearance: none;
  width: 18px; height: 18px;
  border: 2px solid var(--border-focus); border-radius: 4px;
  cursor: pointer; position: relative; transition: all 0.2s;
  background: var(--bg-surface); margin: 0;
}
.custom-checkbox-sm { width: 14px; height: 14px; }
.custom-checkbox:hover   { border-color: var(--text-muted); }
.custom-checkbox:checked { border-color: var(--primary); background-color: var(--primary); }
.custom-checkbox:checked::after {
  content: ''; position: absolute;
  top: 2px; left: 5px; width: 4px; height: 8px;
  border: solid var(--text-inverse); border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.custom-checkbox-sm:checked::after {
  top: 1px; left: 3px; width: 3px; height: 7px;
}

.net-pay-box {
  display: inline-flex; align-items: center; gap: 12px;
  background-color: var(--primary-soft); padding: 8px 20px;
  border-radius: 8px; border: 1px solid rgba(37, 99, 235, 0.2);
}
.net-pay-label { font-size: 13px; color: var(--primary); font-weight: 600; }
.net-pay-value { font-size: 18px; color: var(--primary); font-weight: 700; letter-spacing: 0.5px; }

/* ── 컬럼 리사이즈 ── */
.resizable {
  position: relative;
  overflow: hidden; /* 셀 내용이 핸들을 밀지 않도록 */
}
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
.resize-handle:hover,
.resize-handle:active {
  background-color: var(--border-focus);
}
body.is-resizing,
body.is-resizing * {
  cursor: col-resize !important;
  user-select: none !important;
}

@media (max-width: 768px) {
  .status-legend         { width: 100%; justify-content: space-between; padding: 10px 0; }
  .header-right-controls { flex-direction: column; align-items: stretch !important; gap: 8px !important; }
}

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

  /* ★ 핵심: border-collapse: collapse 대신 separate를 써야 틀고정 테두리 깨짐이 방지됨 */
  border-collapse: separate;
  border-spacing: 0;
}

/* separate 사용으로 인해 테두리를 직접 그려줘야 함 */
.data-table th, .data-table td {
  box-sizing: border-box;
  /*
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
   */
  background-clip: padding-box; /* 글자 비침 원천 차단 */
  padding: 6px 6px;
  vertical-align: middle;
}
/*.data-table th { border-top: 1px solid var(--border-color); }*/
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

/* 그룹/서브 헤더 색상 */
.group-header-summary,
.group-header-pay,
.group-header-deduction {
  border-bottom: 1px solid var(--border-color);
}
.sub-header {
  border-bottom: 1px solid var(--border-color);
}
/*
.group-divider {
  border-left: 2px solid var(--border-color) !important;
}
*/
.theme-pay-header { background-color: #f8fafc !important; border-top: 2px solid #3b82f6 !important; color: #1e40af !important; }
.theme-pay-sub { border-bottom: 1px solid var(--border-color) !important; background-color: #f8fafc !important; }
.theme-deduct-header { background-color: #fef2f2 !important; border-top: 2px solid #ef4444 !important; color: #991b1b !important; }
.theme-deduct-sub { border-bottom: 1px solid var(--border-color) !important; background-color: #fef2f2 !important; }

/* ── 현장 컬럼 기본 너비 및 말줄임표 ── */
.col-site { min-width: 80px; max-width: 160px; width: 120px; }
.cell-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* =========================================
   가로 스크롤 & 고정 너비 틀고정 (Sticky)
========================================= */

.sticky-col {
  position: sticky !important;
  z-index: 3;
  overflow: visible; /* 리사이즈 핸들용 */
}

/* 테이블 헤더 Z-index 및 불투명 배경 처리 (rgba 금지) */
thead .sticky-col {
  z-index: 50 !important;
  background-color: #f8fafc !important; /* 불투명 연회색 */
}
thead tr:nth-child(2) .sticky-col {
  background-color: #f1f5f9 !important; /* 불투명 연회색 (살짝 짙음) */
}

/* tfoot 고정 셀 */
tfoot .sticky-col {
  z-index: 35 !important;
  background-color: #f8fafc !important;
}

/* 각 컬럼 left 위치 (정확한 픽셀 고정) */
.sticky-col-1  { left: 0px;   min-width: 40px;  max-width: 40px;  width: 40px; }
.sticky-col-2  { left: 40px;  min-width: 40px;  max-width: 40px;  width: 40px; }
.sticky-col-3  { left: 80px;  min-width: 110px; max-width: 110px; width: 110px; }
.sticky-col-4  { left: 190px; min-width: 70px;  max-width: 70px;  width: 70px; }
.sticky-col-5  { left: 260px; min-width: 80px;  max-width: 80px;  width: 80px; }
.sticky-col-6  { left: 340px; min-width: 80px;  max-width: 80px;  width: 80px; }
.sticky-col-7  { left: 420px; min-width: 100px; max-width: 100px; width: 100px; }
.sticky-col-8  { left: 520px; min-width: 70px;  max-width: 70px;  width: 70px; }

/* tfoot의 "전체 합계" colspan=8 셀: 너비 580px(1~8 합산)으로 고정 */
tfoot .sticky-col-span8 {
  position: sticky !important;
  left: 0px;
  width: 590px;
  min-width: 590px;
  z-index: 35 !important;
  background-color: #f8fafc !important;
  overflow: hidden;
}

/* 합계 그룹 (상단 병합 헤더) -> 이전 너비 총합 590px */
.sticky-col-group { left: 590px; z-index: 41 !important; border-right: 2px solid var(--border-focus) !important; }

/* 9: 지급합계, 10: 공제합계 (+10px) */
.sticky-col-9  { left: 590px; min-width: 80px;  max-width: 80px;  width: 80px; }
.sticky-col-10 { left: 670px; min-width: 80px;  max-width: 80px;  width: 80px; }

/* 마지막 고정 컬럼(공제합계) 우측에 그림자 효과 */
.sticky-divider {
  border-right: 2px solid var(--border-focus) !important;
  /*box-shadow: 4px 0 6px -4px rgba(0,0,0,0.15) !important;
  clip-path: inset(0 -10px 0 0); 우측으로만 그림자가 퍼지도록 제한

   */
}

/* =========================================
   데이터 상태별 배경색 덮어쓰기 (★글자 비침 방지를 위해 rgba 금지, Hex 컬러 사용)
========================================= */

/* 1. 비활성 (기본 흰색) */
tr.data-row:has(td.calculate-inactive) .sticky-col {
  background-color: #ffffff !important;
}

/* 2. 저장 대기 (노랑/주황 계열) */
tr.data-row:has(td.calculate-draft) td {
  background-color: rgba(245, 158, 11, 0.10); /* 우측 스크롤 영역은 기존대로 투명도 사용 가능 */
}
tr.data-row:has(td.calculate-draft) td.sticky-col {
  background-color: #fef3c7 !important; /* ★ 고정 영역은 무조건 불투명 컬러 */
}

/* 3. 저장 완료 (초록 계열) */
tr.data-row:has(td.calculate-active) td {
  background-color: rgba(16, 185, 129, 0.08); /* 우측 스크롤 영역 */
}
tr.data-row:has(td.calculate-active) td.sticky-col {
  background-color: #d1fae5 !important; /* ★ 고정 영역은 무조건 불투명 컬러 */
}

/* 호버 시 sticky 셀도 같이 어두워지게 반응 */
tr.data-row:hover td.sticky-col {
  filter: brightness(0.97);
}

/* 푸터 고정(하단 sticky) 관련 z-index */
.table-footer.sticky-footer {
  position: sticky; bottom: 0; z-index: 25;
  background-color: #f8fafc;
  border-top: 2px solid var(--border-focus);
}

/* === 툴팁 디자인 === */
.tooltip-container { position: relative; cursor: help; }
.tooltip-text {
  visibility: hidden; opacity: 0;
  position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%);
  background: var(--header-bg); color: var(--text-inverse);
  padding: 8px 12px; border-radius: 6px;
  font-size: 11px; line-height: 1.4; white-space: nowrap;
  z-index: 100; box-shadow: var(--shadow-md);
  transition: opacity 0.15s;
  pointer-events: none;
}
.tooltip-text::after {
  content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 5px solid transparent; border-top-color: var(--header-bg);
}
.tooltip-container:hover .tooltip-text { visibility: visible; opacity: 1; }
</style>
