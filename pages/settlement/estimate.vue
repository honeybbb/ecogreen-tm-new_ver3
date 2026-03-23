<script setup>
/**
 * settlement/estimate  —  연차 · 퇴직금 추계 관리
 * 공통 CSS (stats-grid, filter-panel, table-card, data-table,
 *           btn-add, btn-delete, btn-excel, toggle-chip 등) 완전 준수
 */
import { ref, computed, onMounted, reactive, watch } from 'vue';
import axios from 'axios';
// import EstimateModal from '@/components/EstimateModal.vue';
// import EstimatePrintModal from '@/components/EstimatePrintModal.vue';

const { siteOptions, fetchSiteOptions } = useApi();

// ── 상태 ─────────────────────────────────────────────
const isLoading   = ref(false);
const isExporting = ref(false);
const items       = ref([]);

const selectedYear    = reactive({ month: new Date().toISOString().slice(0, 7) });
const searchTerm      = ref('');
const selectedSite    = ref('전체');
const activeType      = ref('미화');   // '미화' | '경비'
const activeSection   = ref('annual'); // 'annual' | 'retire'
const filterConfirmed = ref(false);
const filterPending   = ref(false);

const sortKey   = ref('id');
const sortOrder = ref('desc');

const currentPage     = ref(1);
const pageSize        = ref(50);
const pageSizeOptions = [50, 100, 200];

// ── 모달 ─────────────────────────────────────────────
const isModalOpen         = ref(false);
const selectedId          = ref(null);
const initialDataForModal = ref(null);

const isPrintModalOpen = ref(false);
const printTargetItems = ref([]);

const isExportMenuOpen = ref(false);

// ── 현장 전환 목록 ────────────────────────────────────
const currentSite = ref({ idx: null, siteName: '' });

// ── 기준 정보 ─────────────────────────────────────────
const baseInfo = ref({
  baseDate: '2025.12.31', writeDate: '', workhourMonth: 169.5, workhourDay: 6,
});

// ── 추계 데이터 ───────────────────────────────────────
const annualRows = ref({ 미화: [], 경비: [] });
const retireRows = ref({ 미화: [], 경비: [] });

// ── watch ─────────────────────────────────────────────
watch([selectedSite, searchTerm, filterConfirmed, filterPending, selectedYear], () => {
  currentPage.value = 1;
});
watch(() => selectedYear.month, fetchList);
watch(activeType, () => { currentPage.value = 1; });

// baseInfo 변경 시 자동 저장 (debounce)
let baseTimer = null;
watch(baseInfo, (val) => {
  clearTimeout(baseTimer);
  baseTimer = setTimeout(async () => {
    if (!currentSite.value.idx) return;
    try { await axios.put(`/api/v1/accrual/sites/${currentSite.value.idx}/base`, val); }
    catch { /* 무시 */ }
  }, 800);
}, { deep: true });

const resetFilters = () => {
  searchTerm.value      = '';
  selectedSite.value    = '전체';
  filterConfirmed.value = false;
  filterPending.value   = false;
  currentPage.value     = 1;
};

// ── API : 목록 ────────────────────────────────────────
async function fetchList() {
  isLoading.value = true;
  try {
    const res = await axios.get('/api/v1/accrual/sites');
    const raw = res.data.data || [];
    items.value = raw.map(item => ({
      ...item,
      id:        item.idx,
      selected:  false,
      annualSum: (item.annualTotal?.미화 || 0) + (item.annualTotal?.경비 || 0),
      retireSum: (item.retireTotal?.미화 || 0) + (item.retireTotal?.경비 || 0),
      totalSum:  (item.annualTotal?.미화 || 0) + (item.annualTotal?.경비 || 0)
          + (item.retireTotal?.미화 || 0) + (item.retireTotal?.경비 || 0),
      empCount:  (item.annualCount?.미화 || 0) + (item.annualCount?.경비 || 0),
    }));

    // 현장 선택이 없으면 첫 번째 현장 자동 선택
    if (items.value.length && !currentSite.value.idx) {
      await selectSite(items.value[0]);
    } else if (currentSite.value.idx) {
      await loadSiteDetail(currentSite.value.idx);
    }
    currentPage.value = 1;
  } catch (e) {
    console.error('목록 조회 오류:', e);
  } finally {
    isLoading.value = false;
  }
}

async function selectSite(site) {
  currentSite.value = { idx: site.idx, siteName: site.siteName };
  selectedSite.value = site.idx;
  await loadSiteDetail(site.idx);
}

async function loadSiteDetail(sIdx) {
  try {
    const res = await axios.get(`/api/v1/accrual/sites/${sIdx}`);
    const d   = res.data.data;
    baseInfo.value   = d.baseInfo || baseInfo.value;
    annualRows.value = d.annualRows || { 미화: [], 경비: [] };
    retireRows.value = d.retireRows || { 미화: [], 경비: [] };
  } catch (e) {
    // 목업 — 빈 상태 유지
    annualRows.value = { 미화: [], 경비: [] };
    retireRows.value = { 미화: [], 경비: [] };
  }
}

// ── 필터링 ────────────────────────────────────────────
const filteredItems = computed(() => {
  let result = items.value.filter(item => {
    const siteMatch   = selectedSite.value === '전체' || item.idx === selectedSite.value;
    const searchMatch = item.siteName.toLowerCase().includes(searchTerm.value.toLowerCase());
    return siteMatch && searchMatch;
  });
  result.sort((a, b) => {
    const mod = sortOrder.value === 'asc' ? 1 : -1;
    const [vA, vB] = [a[sortKey.value], b[sortKey.value]];
    if (typeof vA === 'string' && typeof vB === 'string') return vA.localeCompare(vB) * mod;
    return (vA < vB ? -1 : vA > vB ? 1 : 0) * mod;
  });
  return result;
});

// ── 현재 탭 추계 데이터 ───────────────────────────────
const isKyeongbi    = computed(() => activeType.value === '경비');
const currentAnnual = computed(() => annualRows.value[activeType.value] || []);
const currentRetire = computed(() => retireRows.value[activeType.value] || []);

const annualTotal      = computed(() => currentAnnual.value.reduce((s, r) => s + (r.amount || 0), 0));
const retireTotal      = computed(() => currentRetire.value.reduce((s, r) => s + (r.amount || 0), 0));
const annualTotalBasic = computed(() => currentAnnual.value.reduce((s, r) => s + (r.basicWage || 0), 0));
const retireTotalBasic = computed(() => currentRetire.value.reduce((s, r) => s + (r.basicWage || 0), 0));
const usedTotal        = computed(() => currentAnnual.value.reduce((s, r) => s + (r.usedCount || 0), 0));

// ── 통계 카드 ─────────────────────────────────────────
const stats = computed(() => {
  const all = items.value;
  return {
    siteCount:   all.length,
    empCount:    all.reduce((s, i) => s + (i.empCount || 0), 0),
    annualGrand: all.reduce((s, i) => s + (i.annualSum || 0), 0),
    retireGrand: all.reduce((s, i) => s + (i.retireSum || 0), 0),
  };
});

// ── 페이지네이션 ──────────────────────────────────────
const toggleSort = (key) => {
  if (sortKey.value === key) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortOrder.value = 'asc'; }
  currentPage.value = 1;
};
const totalPages  = computed(() => Math.ceil(filteredItems.value.length / pageSize.value));
const pagedItems  = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredItems.value.slice(start, start + pageSize.value);
});
const pageNumbers = computed(() => {
  const total = totalPages.value, cur = currentPage.value;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1], left = Math.max(2, cur - 2), right = Math.min(total - 1, cur + 2);
  if (left > 2) pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  pages.push(total);
  return pages;
});
const goToPage = (page) => {
  if (typeof page !== 'number' || page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── 전체선택 ──────────────────────────────────────────
const selectAll = computed({
  get: () => pagedItems.value.length > 0 && pagedItems.value.every(p => p.selected),
  set: (val) => pagedItems.value.forEach(p => (p.selected = val)),
});
const selectedItems = computed(() => items.value.filter(s => s.selected));

// ── 삭제 ─────────────────────────────────────────────
const deleteSelected = async () => {
  if (!selectedItems.value.length) { alert('삭제할 항목을 선택하세요.'); return; }
  if (!confirm(`선택한 ${selectedItems.value.length}건의 추계 데이터를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;
  try {
    isLoading.value = true;
    await Promise.all(selectedItems.value.map(({ id }) => axios.delete(`/api/v1/accrual/sites/${id}`)));
    alert('삭제 완료되었습니다.');
    await fetchList();
  } catch {
    alert('삭제 중 오류가 발생했습니다.');
  } finally {
    isLoading.value = false;
  }
};

// ── 출력 ─────────────────────────────────────────────
const handlePrint = () => {
  if (!selectedItems.value.length) { alert('출력할 항목을 선택하세요.'); return; }
  printTargetItems.value = selectedItems.value.map(item => ({ ...item }));
  isPrintModalOpen.value = true;
};

// ── 엑셀 출력 ─────────────────────────────────────────
const exportExcel = async (mode = 'single') => {
  isExporting.value    = true;
  isExportMenuOpen.value = false;
  try {
    let sites;
    if (mode === 'single') {
      sites = [{ siteName: currentSite.value.siteName, annualRows: annualRows.value, retireRows: retireRows.value }];
    } else {
      const allRes = await axios.get('/api/v1/accrual/all');
      sites = allRes.data.data;
    }
    const payload = { singleMode: mode === 'single', ...baseInfo.value, sites };
    const res = await axios.post('/api/v1/accrual/export', payload, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a   = document.createElement('a');
    a.href     = url;
    a.download = mode === 'single'
        ? `${currentSite.value.siteName}_연차퇴직금추계.xlsx`
        : `전체현장_연차퇴직금추계.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    alert('엑셀 출력에 실패했습니다.');
  } finally {
    isExporting.value = false;
  }
};

// ── 추계 행 CRUD ──────────────────────────────────────
const defAnnual = () => ({ no:0, name:'', position:'', joinDate:'', midSettleDate:'', calcPeriod:'', basis:'', amount:0, note:'', basicWage:0, allowance:0, usedCount:0, usedDates:'', workersDayAllowance:0, totalWage:0 });
const defRetire = () => ({ no:0, name:'', position:'', joinDate:'', midSettleDate:'', calcPeriod:'', basis:'', amount:0, note:'', basicWage:0, allowance:0, total:0, posAllowance:0, nightAllowance:0, workersDayAllowance:0 });
const editingRow = ref(null);
const modalMode  = ref('annual');
const form       = ref(defAnnual());

const openAdd = (section) => {
  modalMode.value  = section;
  editingRow.value = null;
  form.value = section === 'annual' ? defAnnual() : defRetire();
  const rows = section === 'annual' ? currentAnnual.value : currentRetire.value;
  form.value.no = rows.length ? Math.max(...rows.map(r => r.no)) + 1 : 1;
  isModalOpen.value = true;
};

const openEdit = (row, section) => {
  modalMode.value  = section;
  editingRow.value = row;
  form.value = { ...row };
  isModalOpen.value = true;
};

const saveModal = async () => {
  if (!form.value.name?.trim()) { alert('이름을 입력해주세요.'); return; }
  const sIdx   = currentSite.value.idx;
  const target = modalMode.value === 'annual' ? annualRows.value[activeType.value] : retireRows.value[activeType.value];
  try {
    if (editingRow.value?.idx) {
      await axios.put(`/api/v1/accrual/${modalMode.value}/${editingRow.value.idx}`, { ...form.value, jobType: activeType.value });
      const i = target.findIndex(r => r.no === editingRow.value.no);
      if (i !== -1) target[i] = { ...target[i], ...form.value };
    } else {
      const res = await axios.post(`/api/v1/accrual/sites/${sIdx}/${modalMode.value}`, { ...form.value, jobType: activeType.value });
      target.push({ ...form.value, idx: res.data.idx, no: res.data.sortNo, jobType: activeType.value });
    }
    isModalOpen.value = false;
  } catch { alert('저장에 실패했습니다.'); }
};

const deleteRow = async (row, section) => {
  if (!confirm(`'${row.name}' 항목을 삭제하시겠습니까?`)) return;
  const target = section === 'annual' ? annualRows.value[activeType.value] : retireRows.value[activeType.value];
  try {
    if (row.idx) await axios.delete(`/api/v1/accrual/${section}/${row.idx}`);
    const i = target.findIndex(r => r.no === row.no);
    if (i !== -1) target.splice(i, 1);
    target.forEach((r, idx) => { r.no = idx + 1; });
  } catch { alert('삭제에 실패했습니다.'); }
};

const fc = (v) => Number(v || 0).toLocaleString();

onMounted(() => {
  fetchSiteOptions();
  fetchList();
});
</script>

<template>
  <div class="estimate-page">

    <!-- ── 페이지 헤더 ── -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calculator-variant-outline"></i>
          연차 · 퇴직금 추계 관리
        </h1>
        <p class="page-subtitle">현장별 연차 및 퇴직금 추계액을 관리합니다</p>
      </div>
      <div class="header-actions">
        <template v-if="selectedItems.length > 0">
          <button @click="handlePrint" class="btn-print">
            <i class="mdi mdi-printer-outline"></i>
            <span>출력 ({{ selectedItems.length }}건)</span>
          </button>
          <button @click="deleteSelected" class="btn-delete-sel">
            <i class="mdi mdi-trash-can-outline"></i>
            <span>선택 삭제</span>
          </button>
        </template>

        <!-- 엑셀 출력 드롭다운 -->
        <!--div class="export-wrap" v-click-outside="() => isExportMenuOpen = false">
          <button class="btn-excel" @click="isExportMenuOpen = !isExportMenuOpen" :disabled="isExporting">
            <i :class="isExporting ? 'mdi mdi-loading mdi-spin' : 'mdi mdi-file-excel-outline'"></i>
            {{ isExporting ? '생성 중...' : '엑셀 출력' }}
            <i class="mdi mdi-chevron-down"></i>
          </button>
          <div v-if="isExportMenuOpen" class="export-menu">
            <button class="em-item" @click="exportExcel('single')">
              <i class="mdi mdi-office-building-outline"></i>
              <div><span class="em-title">현재 현장만 출력</span><span class="em-sub">{{ currentSite.siteName }}</span></div>
            </button>
            <div class="em-div"></div>
            <button class="em-item" @click="exportExcel('all')">
              <i class="mdi mdi-domain"></i>
              <div><span class="em-title">전체 현장 출력</span><span class="em-sub">요약 시트 + 현장별 시트</span></div>
            </button>
          </div>
        </div-->

        <button @click="openAdd(activeSection)" class="btn-add">
          <i class="mdi mdi-plus"></i>
          <span>직원 추가</span>
        </button>
      </div>
    </div>

    <!-- ── 통계 카드 ── -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color:var(--primary);--card-bg:var(--primary-soft)">
        <div class="stat-icon"><i class="mdi mdi-office-building-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">관리 현장</span>
          <span class="stat-value">{{ stats.siteCount }}<small>개소</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:#0ea5e9;--card-bg:rgba(14,165,233,0.1)">
        <div class="stat-icon"><i class="mdi mdi-account-group-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">전체 인원</span>
          <span class="stat-value">{{ stats.empCount }}<small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--warning);--card-bg:rgba(245,158,11,0.1)">
        <div class="stat-icon"><i class="mdi mdi-calendar-check-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">연차 추계 합계</span>
          <span class="stat-value">{{ fc(stats.annualGrand) }}<small>원</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--success);--card-bg:rgba(16,185,129,0.1)">
        <div class="stat-icon"><i class="mdi mdi-piggy-bank-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">퇴직금 추계 합계</span>
          <span class="stat-value">{{ fc(stats.retireGrand) }}<small>원</small></span>
        </div>
      </div>
    </div>

    <!-- ── 필터 패널 ── -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 현장</label>
          <!--select v-model="selectedSite" class="filter-select" @change="val => { const s = items.find(i=>i.idx===val); if(s) selectSite(s); }">
            <option value="전체">전체</option>
            <option v-for="s in siteOptions" :key="s.idx" :value="s.idx">{{ s.name }}</option>
          </select-->
          <SiteSelect v-model="selectedSite"/>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-calendar-range-outline"></i> 기준일</label>
          <input v-model="baseInfo.baseDate" class="filter-select" placeholder="2025.12.31" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-clock-time-eight-outline"></i> 월 근로시간</label>
          <input v-model.number="baseInfo.workhourMonth" type="number" class="filter-select" style="width:100px" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-sun-clock-outline"></i> 일 근로시간</label>
          <input v-model.number="baseInfo.workhourDay" type="number" class="filter-select" style="width:80px" />
        </div>
        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input type="text" v-model="searchTerm" placeholder="현장명으로 검색..." class="search-input" />
            <button v-if="searchTerm" @click="searchTerm=''" class="search-clear"><i class="mdi mdi-close"></i></button>
          </div>
          <button @click="resetFilters" class="btn-search" title="필터 초기화">
            <i class="mdi mdi-filter-off"></i><span>초기화</span>
          </button>
        </div>
      </div>

      <!-- 직종 토글 -->
      <div class="filter-toggles-row">
        <span class="toggles-label"><i class="mdi mdi-account-hard-hat-outline"></i> 직종:</span>
        <div class="filter-toggles">
          <label v-for="t in ['미화','경비']" :key="t"
                 :class="['toggle-chip', { active: activeType === t }]"
                 @click="activeType = t">
            <i :class="['mdi', t==='미화' ? 'mdi-broom' : 'mdi-shield-account-outline']"></i>
            <span>{{ t }}</span>
          </label>
        </div>
        <div class="section-divider"></div>
        <span class="toggles-label"><i class="mdi mdi-file-document-outline"></i> 구분:</span>
        <div class="filter-toggles">
          <label :class="['toggle-chip', { active: activeSection === 'annual' }]" @click="activeSection = 'annual'">
            <i class="mdi mdi-calendar-check-outline"></i><span>연차 추계</span>
          </label>
          <label :class="['toggle-chip', { active: activeSection === 'retire' }]" @click="activeSection = 'retire'">
            <i class="mdi mdi-piggy-bank-outline"></i><span>퇴직금 추계</span>
          </label>
        </div>
      </div>
    </div>

    <!-- ── 현장 목록 테이블 ── -->
    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-office-building-outline"></i>
          <span>현장 목록 ({{ filteredItems.length }}개소)</span>
          <span v-if="selectedItems.length > 0" class="selected-badge">{{ selectedItems.length }}건 선택됨</span>
        </div>
        <div class="page-size-select">
          <label>페이지당</label>
          <select v-model="pageSize" @change="currentPage=1" class="filter-select"
                  style="height:32px;padding:4px 10px;font-size:12px;min-width:60px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th class="text-center" style="width:40px;">
              <label class="checkbox-wrapper"><input type="checkbox" v-model="selectAll" class="custom-checkbox" /></label>
            </th>
            <th @click="toggleSort('id')" class="sortable text-center" style="width:60px;">
              <div class="th-content justify-center"><span>No.</span>
                <i v-if="sortKey==='id'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('siteName')" class="sortable">
              <div class="th-content"><span>현장명</span>
                <i v-if="sortKey==='siteName'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('empCount')" class="sortable text-center">
              <div class="th-content justify-center"><span>인원</span>
                <i v-if="sortKey==='empCount'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('annualSum')" class="sortable text-right">
              <div class="th-content justify-end"><span>연차 추계(원)</span>
                <i v-if="sortKey==='annualSum'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('retireSum')" class="sortable text-right">
              <div class="th-content justify-end"><span>퇴직금 추계(원)</span>
                <i v-if="sortKey==='retireSum'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('totalSum')" class="sortable text-right">
              <div class="th-content justify-end"><span>합계(원)</span>
                <i v-if="sortKey==='totalSum'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center" style="width:80px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="item in pagedItems" :key="item.id"
              class="data-row"
              :class="{ 'row-selected': item.selected, 'row-active': item.idx === currentSite.idx }">
            <td class="text-center"><label class="checkbox-wrapper"><input type="checkbox" v-model="item.selected" class="custom-checkbox" /></label></td>
            <td class="text-center text-gray">{{ item.id }}</td>
            <td>
              <span class="site-name-link" @click="selectSite(item)">{{ item.siteName }}</span>
              <span class="badge badge-blue" style="margin-left:6px">{{ item.siteType }}</span>
            </td>
            <td class="text-center"><span class="emp-badge">{{ item.empCount }}명</span></td>
            <td class="text-right"><span class="annual-amount">{{ fc(item.annualSum) }}</span></td>
            <td class="text-right"><span class="retire-amount">{{ fc(item.retireSum) }}</span></td>
            <td class="text-right amount-text">{{ fc(item.totalSum) }}</td>
            <td class="text-center">
              <button @click="selectSite(item)" class="btn-detail">
                <i class="mdi mdi-pencil-outline"></i> 상세
              </button>
            </td>
          </tr>
          <tr v-if="filteredItems.length === 0" class="empty-row">
            <td colspan="8">
              <div class="empty-state">
                <i class="mdi mdi-calculator-variant-outline"></i>
                <p>등록된 현장이 없습니다.</p>
                <span>현장 관리 메뉴에서 현장을 먼저 등록해주세요</span>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <!-- 페이지네이션 -->
      <div class="pagination-bar" v-if="totalPages > 1">
        <span class="pagination-info">
          {{ (currentPage-1)*pageSize+1 }}–{{ Math.min(currentPage*pageSize, filteredItems.length) }} / 총 {{ filteredItems.length }}건
        </span>
        <div class="pagination-controls">
          <button class="page-btn" :disabled="currentPage===1" @click="goToPage(1)"><i class="mdi mdi-chevron-double-left"></i></button>
          <button class="page-btn" :disabled="currentPage===1" @click="goToPage(currentPage-1)"><i class="mdi mdi-chevron-left"></i></button>
          <template v-for="p in pageNumbers" :key="p">
            <span v-if="p==='...'" class="page-ellipsis">…</span>
            <button v-else class="page-btn" :class="{active: p===currentPage}" @click="goToPage(p)">{{ p }}</button>
          </template>
          <button class="page-btn" :disabled="currentPage===totalPages" @click="goToPage(currentPage+1)"><i class="mdi mdi-chevron-right"></i></button>
          <button class="page-btn" :disabled="currentPage===totalPages" @click="goToPage(totalPages)"><i class="mdi mdi-chevron-double-right"></i></button>
        </div>
      </div>
    </div>

    <!-- 로딩 -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중...</p>
    </div>

    <!-- ── 추계 상세 테이블 (현장 선택 시) ── -->
    <template v-if="currentSite.idx">

      <!-- 현재 현장 + 섹션 안내 바 -->
      <div class="detail-section-header">
        <div class="dsh-left">
          <i class="mdi mdi-domain"></i>
          <span class="dsh-site">{{ currentSite.siteName }}</span>
          <span :class="['dsh-type-badge', activeType==='미화' ? 'dtb-blue' : 'dtb-green']">{{ activeType }}</span>
          <span class="dsh-section">{{ activeSection==='annual' ? '연차 추계' : '퇴직금 추계' }}</span>
        </div>
        <div class="dsh-right">
          <span class="dsh-total" v-if="activeSection==='annual'">
            합계 <strong>{{ fc(annualTotal) }}원</strong>
          </span>
          <span class="dsh-total" v-else>
            합계 <strong>{{ fc(retireTotal) }}원</strong>
          </span>
          <button class="btn-add" @click="openAdd(activeSection)">
            <i class="mdi mdi-plus"></i> 직원 추가
          </button>
        </div>
      </div>

      <!-- ══ 연차 추계 테이블 ══ -->
      <div class="table-card" v-show="activeSection==='annual'">
        <div class="table-header">
          <div class="table-title">
            <i class="mdi mdi-calendar-check-outline"></i>
            <span>연차 추계 — {{ activeType }} ({{ currentAnnual.length }}명)</span>
          </div>
          <div class="table-title-right">
            <span class="amount-summary">연차 사용 <strong>{{ usedTotal }}개</strong></span>
            <span class="amount-summary primary">추계 합계 <strong>{{ fc(annualTotal) }}원</strong></span>
          </div>
        </div>

        <div class="table-scroll-container">
          <table class="data-table">
            <thead>
            <tr>
              <th class="text-center" style="width:42px">No</th>
              <th>이름</th>
              <th>직책</th>
              <th>입사일</th>
              <th>중간정산일</th>
              <th>정산(재직)기간</th>
              <th>산출근거</th>
              <th class="text-right">기본급</th>
              <template v-if="isKyeongbi">
                <th class="text-right">직책수당</th>
                <th class="text-right">근로자의날</th>
                <th class="text-right">계</th>
              </template>
              <th class="text-right" style="min-width:120px">추계 금액</th>
              <th>비고</th>
              <th class="text-center">사용수</th>
              <th>사용일</th>
              <th class="text-center" style="width:72px">관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="row in currentAnnual" :key="row.no" class="data-row"
                :class="{ 'row-used': row.usedCount > 0 }">
              <td class="text-center text-gray">{{ row.no }}</td>
              <td class="font-bold">{{ row.name }}</td>
              <td><span class="badge badge-gray">{{ row.position }}</span></td>
              <td class="text-gray">{{ row.joinDate }}</td>
              <td class="text-gray">{{ row.midSettleDate || '-' }}</td>
              <td class="text-gray" style="white-space:nowrap">{{ row.calcPeriod }}</td>
              <td class="text-gray" style="font-size:11px;max-width:180px;word-break:break-all">{{ row.basis }}</td>
              <td class="text-right">{{ fc(row.basicWage) }}</td>
              <template v-if="isKyeongbi">
                <td class="text-right">{{ row.allowance ? fc(row.allowance) : '-' }}</td>
                <td class="text-right">{{ row.workersDayAllowance ? fc(row.workersDayAllowance) : '-' }}</td>
                <td class="text-right font-bold">{{ fc(row.totalWage) }}</td>
              </template>
              <td class="text-right">
                <span class="badge badge-blue" style="font-size:12px">{{ fc(row.amount) }}</span>
              </td>
              <td class="text-gray" style="font-size:12px;max-width:160px">{{ row.note }}</td>
              <td class="text-center">
                <span v-if="row.usedCount > 0" class="badge badge-red">{{ row.usedCount }}개</span>
                <span v-else class="text-gray">-</span>
              </td>
              <td class="text-gray" style="font-size:11px;max-width:150px;word-break:break-all">{{ row.usedDates || '-' }}</td>
              <td class="text-center">
                <div class="action-buttons">
                  <button @click="openEdit(row,'annual')" class="btn-action btn-statement">
                    <i class="mdi mdi-pencil-outline"></i>
                  </button>
                  <button @click="deleteRow(row,'annual')" class="btn-action btn-del-action">
                    <i class="mdi mdi-trash-can-outline"></i>
                  </button>
                </div>
              </td>
            </tr>

            <!-- 합계 행 -->
            <tr v-if="currentAnnual.length" class="tfoot-sum-row">
              <td :colspan="isKyeongbi ? 7 : 7" class="text-center font-bold text-gray">합  계</td>
              <td class="text-right font-bold">{{ fc(annualTotalBasic) }}</td>
              <template v-if="isKyeongbi"><td></td><td></td><td></td></template>
              <td class="text-right">
                <span class="badge badge-blue" style="font-size:13px;font-weight:800">{{ fc(annualTotal) }}원</span>
              </td>
              <td></td>
              <td class="text-center font-bold">{{ usedTotal }}개</td>
              <td></td><td></td>
            </tr>

            <tr v-if="currentAnnual.length === 0" class="empty-row">
              <td :colspan="isKyeongbi ? 15 : 12">
                <div class="empty-state">
                  <i class="mdi mdi-calendar-blank-outline"></i>
                  <p>연차 추계 데이터가 없습니다.</p>
                  <span>상단 직원 추가 버튼을 눌러 추가하세요</span>
                </div>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ══ 퇴직금 추계 테이블 ══ -->
      <div class="table-card" v-show="activeSection==='retire'">
        <div class="table-header">
          <div class="table-title">
            <i class="mdi mdi-piggy-bank-outline"></i>
            <span>퇴직금 추계 — {{ activeType }} ({{ currentRetire.length }}명)</span>
          </div>
          <div class="table-title-right">
            <span class="amount-summary retire">추계 합계 <strong>{{ fc(retireTotal) }}원</strong></span>
          </div>
        </div>

        <div class="table-scroll-container">
          <table class="data-table">
            <thead>
            <tr>
              <th class="text-center" style="width:42px">No</th>
              <th>이름</th>
              <th>직책</th>
              <th>입사일</th>
              <th>중간정산일</th>
              <th>정산기간</th>
              <th>산출근거</th>
              <th class="text-right">기본급</th>
              <template v-if="isKyeongbi">
                <th class="text-right">직책수당</th>
                <th class="text-right">야간수당</th>
                <th class="text-right">근로자의날</th>
                <th class="text-right">계</th>
              </template>
              <th class="text-right" style="min-width:120px">추계 금액</th>
              <th>비고</th>
              <th class="text-center" style="width:72px">관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="row in currentRetire" :key="row.no" class="data-row">
              <td class="text-center text-gray">{{ row.no }}</td>
              <td class="font-bold">{{ row.name }}</td>
              <td><span class="badge badge-gray">{{ row.position }}</span></td>
              <td class="text-gray">{{ row.joinDate }}</td>
              <td class="text-gray">{{ row.midSettleDate || '-' }}</td>
              <td class="text-gray" style="white-space:nowrap">{{ row.calcPeriod }}</td>
              <td class="text-gray" style="font-size:11px;max-width:200px;word-break:break-all">{{ row.basis }}</td>
              <td class="text-right">{{ fc(row.basicWage) }}</td>
              <template v-if="isKyeongbi">
                <td class="text-right">{{ row.posAllowance ? fc(row.posAllowance) : '-' }}</td>
                <td class="text-right">{{ row.nightAllowance ? fc(row.nightAllowance) : '-' }}</td>
                <td class="text-right">{{ row.workersDayAllowance ? fc(row.workersDayAllowance) : '-' }}</td>
                <td class="text-right font-bold">{{ fc(row.total) }}</td>
              </template>
              <td class="text-right">
                <span class="badge badge-green" style="font-size:12px">{{ fc(row.amount) }}</span>
              </td>
              <td class="text-gray" style="font-size:12px;max-width:160px">{{ row.note }}</td>
              <td class="text-center">
                <div class="action-buttons">
                  <button @click="openEdit(row,'retire')" class="btn-action btn-statement">
                    <i class="mdi mdi-pencil-outline"></i>
                  </button>
                  <button @click="deleteRow(row,'retire')" class="btn-action btn-del-action">
                    <i class="mdi mdi-trash-can-outline"></i>
                  </button>
                </div>
              </td>
            </tr>

            <!-- 합계 행 -->
            <tr v-if="currentRetire.length" class="tfoot-sum-row">
              <td :colspan="isKyeongbi ? 7 : 7" class="text-center font-bold text-gray">합  계</td>
              <td class="text-right font-bold">{{ fc(retireTotalBasic) }}</td>
              <template v-if="isKyeongbi"><td></td><td></td><td></td><td></td></template>
              <td class="text-right">
                <span class="badge badge-green" style="font-size:13px;font-weight:800">{{ fc(retireTotal) }}원</span>
              </td>
              <td></td><td></td>
            </tr>

            <tr v-if="currentRetire.length === 0" class="empty-row">
              <td :colspan="isKyeongbi ? 14 : 11">
                <div class="empty-state">
                  <i class="mdi mdi-piggy-bank-outline"></i>
                  <p>퇴직금 추계 데이터가 없습니다.</p>
                  <span>상단 직원 추가 버튼을 눌러 추가하세요</span>
                </div>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

    </template>

    <!-- ── 추계 행 입력 / 수정 모달 ── -->
    <div v-if="isModalOpen" class="modal-overlay" @click.self="isModalOpen=false">
      <div class="modal-container">
        <div class="modal-header">
          <h2 class="modal-title">
            <i :class="['mdi', modalMode==='annual' ? 'mdi-calendar-check-outline' : 'mdi-piggy-bank-outline']"></i>
            {{ editingRow ? '수정' : '추가' }} — {{ modalMode==='annual' ? '연차 추계' : '퇴직금 추계' }}
            <span class="badge badge-blue" style="margin-left:8px">{{ activeType }}</span>
          </h2>
          <button class="modal-close" @click="isModalOpen=false"><i class="mdi mdi-close"></i></button>
        </div>

        <div class="modal-body">
          <!-- 기본 정보 -->
          <div class="modal-section-title">기본 정보</div>
          <div class="modal-grid">
            <div class="form-group"><label>이름 *</label><input v-model="form.name" class="input-add" placeholder="홍길동" /></div>
            <div class="form-group"><label>직책</label><input v-model="form.position" class="input-add" placeholder="미화, 반장, 팀장 등" /></div>
            <div class="form-group"><label>입사일</label><input v-model="form.joinDate" type="date" class="input-add" /></div>
            <div class="form-group"><label>중간 정산일</label><input v-model="form.midSettleDate" class="input-add" placeholder="예: 23.05.05" /></div>
            <div class="form-group form-full"><label>정산(재직)기간</label><input v-model="form.calcPeriod" class="input-add" placeholder="예: 23.05.06~25.05.05" /></div>
            <div class="form-group form-full"><label>산출근거</label><input v-model="form.basis" class="input-add" placeholder="예: 1,709,290/169.5*6*32개" /></div>
          </div>

          <!-- 급여 구성 -->
          <div class="modal-section-title">급여 구성</div>
          <div class="modal-grid">
            <div class="form-group"><label>기본급</label><input v-model.number="form.basicWage" type="number" class="input-add text-right" /></div>
            <div class="form-group"><label>수당</label><input v-model.number="form.allowance" type="number" class="input-add text-right" /></div>
            <template v-if="isKyeongbi && modalMode==='annual'">
              <div class="form-group"><label>근로자의날수당</label><input v-model.number="form.workersDayAllowance" type="number" class="input-add text-right" /></div>
              <div class="form-group"><label>계</label><input v-model.number="form.totalWage" type="number" class="input-add text-right" /></div>
            </template>
            <template v-if="isKyeongbi && modalMode==='retire'">
              <div class="form-group"><label>직책수당</label><input v-model.number="form.posAllowance" type="number" class="input-add text-right" /></div>
              <div class="form-group"><label>야간수당</label><input v-model.number="form.nightAllowance" type="number" class="input-add text-right" /></div>
              <div class="form-group"><label>근로자의날수당</label><input v-model.number="form.workersDayAllowance" type="number" class="input-add text-right" /></div>
              <div class="form-group"><label>계</label><input v-model.number="form.total" type="number" class="input-add text-right" /></div>
            </template>
          </div>

          <!-- 추계 결과 -->
          <div class="modal-section-title">추계 결과</div>
          <div class="modal-grid">
            <div class="form-group"><label>추계 금액 *</label><input v-model.number="form.amount" type="number" class="input-add text-right" style="font-weight:700;font-size:15px;color:var(--primary)" /></div>
            <div class="form-group"><label>비고</label><input v-model="form.note" class="input-add" placeholder="예: 3,4년차/32개 중 0개사용" /></div>
            <template v-if="modalMode==='annual'">
              <div class="form-group"><label>연차 사용 수</label><input v-model.number="form.usedCount" type="number" class="input-add" /></div>
              <div class="form-group form-full"><label>연차 사용일</label><input v-model="form.usedDates" class="input-add" placeholder="예: 2024-04/05,06/11,12" /></div>
            </template>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel btn-save" @click="isModalOpen=false"><i class="mdi mdi-close"></i> 취소</button>
          <button class="btn-submit btn-save" @click="saveModal"><i class="mdi mdi-check"></i> 저장</button>
        </div>
      </div>
    </div>

    <!-- 출력 모달 -->
    <EstimatePrintModal
        v-if="isPrintModalOpen"
        :is-open="isPrintModalOpen"
        :items="printTargetItems"
        @close="isPrintModalOpen = false"
    />

  </div>
</template>

<style scoped>
/* ── 이 페이지에서만 필요한 추가 스타일 ──────────────────
   (page-header, filter-panel, stats-grid, table-card,
    data-table, btn-add, btn-delete, btn-excel, badge,
    toggle-chip, pagination 등은 공통 CSS 그대로 사용) */

/* 선택된 행 */
.row-selected { background-color: var(--primary-soft) !important; }
.row-active   { background-color: rgba(14, 165, 233, 0.05) !important; }
.row-used     { background-color: rgba(245, 158, 11, 0.04) !important; }

/* 체크박스 */
.checkbox-wrapper { display: flex; justify-content: center; align-items: center; cursor: pointer; }
.custom-checkbox {
  appearance: none; -webkit-appearance: none;
  width: 18px; height: 18px; border: 2px solid var(--border-focus); border-radius: 4px;
  cursor: pointer; position: relative; transition: all 0.2s; background: var(--bg-surface); margin: 0;
}
.custom-checkbox:checked { border-color: var(--primary); background: var(--primary); }
.custom-checkbox:checked::after {
  content: ''; position: absolute; top: 2px; left: 5px;
  width: 4px; height: 8px; border: solid var(--text-inverse); border-width: 0 2px 2px 0; transform: rotate(45deg);
}

/* 선택 뱃지 */
.selected-badge {
  font-size: 12px; font-weight: 600; padding: 2px 10px;
  background: #0ea5e9; color: white; border-radius: 10px; margin-left: 8px;
}

/* 출력·삭제 버튼 */
.btn-print {
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px;
  border: 1px solid rgba(14,165,233,0.4); border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; background: rgba(14,165,233,0.08); color: #0ea5e9;
}
.btn-print:hover { background: #0ea5e9; color: white; border-color: #0ea5e9; }

.btn-delete-sel {
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px;
  border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; background: rgba(239,68,68,0.05); color: var(--danger);
}
.btn-delete-sel:hover { background: var(--danger); color: white; border-color: var(--danger); }

/* 엑셀 드롭다운 */
.export-wrap { position: relative; }
.export-menu {
  position: absolute; right: 0; top: calc(100% + 6px);
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 10px; box-shadow: var(--shadow-md); padding: 6px; min-width: 200px; z-index: 200;
}
.em-item {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 10px 12px; border: none; background: transparent; border-radius: 7px;
  cursor: pointer; text-align: left; transition: background .15s;
}
.em-item:hover { background: var(--bg-hover); }
.em-item i { font-size: 20px; color: var(--primary); flex-shrink: 0; }
.em-title { display: block; font-size: 13px; font-weight: 600; color: var(--text-main); }
.em-sub   { display: block; font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.em-div   { height: 1px; background: var(--border-color); margin: 4px 6px; }

/* 섹션 구분선 (필터 토글 사이) */
.section-divider { width: 1px; height: 20px; background: var(--border-color); margin: 0 4px; }

/* 현장명 클릭 링크 */
.site-name-link {
  font-weight: 600; color: var(--primary); cursor: pointer;
  text-decoration: underline; text-underline-offset: 2px;
}
.site-name-link:hover { color: var(--primary-hover); }

/* 금액 강조 */
.annual-amount { color: var(--warning); font-weight: 600; }
.retire-amount { color: var(--success); font-weight: 600; }
.emp-badge { font-size: 12px; font-weight: 600; color: var(--primary); background: var(--primary-soft); padding: 2px 8px; border-radius: 10px; }

/* 테이블 헤더 우측 정렬 영역 */
.table-title-right { display: flex; align-items: center; gap: 16px; }
.amount-summary { font-size: 13px; color: var(--text-sub); }
.amount-summary strong { color: var(--text-main); font-weight: 700; }
.amount-summary.primary strong { color: var(--primary); }
.amount-summary.retire strong  { color: var(--success); }

/* 추계 상세 섹션 헤더 */
.detail-section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; margin-bottom: 0;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 12px 12px 0 0; border-bottom: none;
}
.dsh-left  { display: flex; align-items: center; gap: 10px; }
.dsh-right { display: flex; align-items: center; gap: 14px; }
.dsh-left i { font-size: 20px; color: var(--primary); }
.dsh-site  { font-size: 16px; font-weight: 700; color: var(--text-main); }
.dsh-type-badge {
  padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;
}
.dtb-blue   { background: var(--primary-soft); color: var(--primary); }
.dtb-green  { background: rgba(16,185,129,0.1); color: var(--success); }
.dsh-section { font-size: 13px; color: var(--text-sub); font-weight: 500; }
.dsh-total { font-size: 13px; color: var(--text-sub); }
.dsh-total strong { color: var(--primary); font-size: 15px; font-weight: 700; }

/* detail 바로 아래 table-card 는 위 모서리 제거 */
.detail-section-header + .table-card { border-radius: 0 0 12px 12px; }

/* 합계 행 */
.tfoot-sum-row td {
  padding: 11px 16px; background: var(--bg-hover);
  font-size: 12px; border-top: 2px solid var(--border-focus); border-bottom: none;
}

/* 스피너 */
.spinner {
  width: 40px; height: 40px; border: 3px solid var(--bg-canvas); border-top-color: var(--primary);
  border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* 액션 버튼 */
.action-buttons { display: flex; gap: 6px; justify-content: center; }
.btn-action { display: inline-flex; align-items: center; justify-content: center; padding: 6px; border-radius: 6px; font-size: 14px; cursor: pointer; transition: all 0.2s; border: none; }
.btn-statement { background: var(--primary-soft); color: var(--primary); }
.btn-statement:hover { background: var(--primary); color: white; }
.btn-del-action { background: rgba(239,68,68,0.1); color: var(--danger); }
.btn-del-action:hover { background: var(--danger); color: white; }

/* 모달 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-container {
  background: var(--bg-surface); border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,.2);
  width: 100%; max-width: 640px; max-height: 88vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 16px 28px; border-top: 1px solid var(--border-color); background: var(--bg-surface);
}
.btn-save { display: flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; }

/* 모달 폼 */
.modal-section-title {
  font-size: 12px; font-weight: 700; color: var(--text-sub);
  padding: 0 0 8px; margin: 0 0 12px; border-bottom: 1px dashed var(--border-color);
}
.modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-group.form-full { grid-column: 1/-1; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-sub); }

/* th-content */
.th-content { display: flex; align-items: center; gap: 6px; }
.th-content.justify-center { justify-content: center; }
.th-content.justify-end { justify-content: flex-end; }
.th-content i { font-size: 14px; color: var(--text-muted); }
.sortable:hover .th-content i { color: var(--primary); }

/* 페이지네이션 (공통 CSS 그대로, 혹시 누락 대비) */
.pagination-bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-top: 1px solid var(--border-color); background: var(--bg-hover); flex-wrap: wrap; gap: 12px; }
.pagination-info { font-size: 13px; color: var(--text-sub); }
.pagination-controls { display: flex; align-items: center; gap: 4px; }
.page-btn { min-width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: 7px; background: var(--bg-surface); color: var(--text-sub); font-size: 13px; cursor: pointer; transition: all .15s; padding: 0 6px; }
.page-btn:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.page-btn.active { background: var(--primary); border-color: var(--primary); color: var(--text-inverse); font-weight: 700; }
.page-btn:disabled { opacity: .35; cursor: not-allowed; }
.page-ellipsis { min-width: 30px; text-align: center; font-size: 14px; color: var(--text-muted); }

@media (max-width: 768px) {
  .detail-section-header { flex-direction: column; align-items: flex-start; gap: 10px; }
  .modal-grid { grid-template-columns: 1fr; }
  .table-title-right { flex-direction: column; align-items: flex-end; gap: 4px; }
}
</style>
