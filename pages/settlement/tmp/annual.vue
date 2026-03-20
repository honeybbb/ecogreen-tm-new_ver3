<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue';
import axios from 'axios';
import EstimateModal from '~/components/estimateModal.vue';

const { siteOptions, fetchSiteOptions } = useApi();

// ── 상태 ──────────────────────────────────────────────
const isLoading  = ref(false);
const error      = ref(null);
const items      = ref([]);

const selectedYear  = reactive({ month: new Date().toISOString().slice(0, 7) });
const searchTerm    = ref('');
const selectedSite  = ref('전체');
const filterConfirmed = ref(false);
const filterPending   = ref(false);

const sortKey   = ref('id');
const sortOrder = ref('desc');

const currentPage      = ref(1);
const pageSize         = ref(50);
const pageSizeOptions  = [50, 100, 200];

const isModalOpen        = ref(false);
const selectedId         = ref(null);
const initialDataForModal = ref(null);

// ── 필터 변경 시 1페이지 리셋 ────────────────────────
watch([selectedSite, searchTerm, filterConfirmed, filterPending, selectedYear], () => {
  currentPage.value = 1;
});

const resetFilters = () => {
  searchTerm.value    = '';
  selectedSite.value  = '전체';
  filterConfirmed.value = false;
  filterPending.value   = false;
  currentPage.value   = 1;
};

// ── API 호출 ─────────────────────────────────────────
const fetchList = async () => {
  isLoading.value = true;
  error.value     = null;
  try {
    const params = {
      year:    selectedYear.month.split('-')[0],
      month:   selectedYear.month.split('-')[1],
      docType: 'ANNUAL',
    };
    const res     = await axios.get('/api/v1/settle/site/list', { params });
    const rawData = res.data.data || [];

    items.value = rawData.map(item => {
      const site     = siteOptions.value.find(s => s.idx === item.sIdx);
      const siteName = site ? site.name : `알수없는현장(${item.sIdx})`;
      const mm       = String(item.month).padStart(2, '0');

      const bd = item.billingData || {};
      let statusText = '작성중';
      if (item.status === 1) statusText = '확정';
      else if (item.status === 2) statusText = '반려';

      return {
        ...item,
        id:             item.idx,
        siteName,
        targetMonth:    `${item.year}-${mm}`,
        totalEmployees: bd.totalEmployees    || 0,
        totalDays:      bd.totalRemainingDays || 0,
        grandTotal:     item.grandTotal      || 0,
        statusText,
        regDtShort:     (item.regDt || '').split(' ')[0],
        selected:       false,
      };
    });
    currentPage.value = 1;
  } catch (e) {
    console.error('연차추계 조회 오류:', e);
    error.value = '데이터를 불러오는 중 오류가 발생했습니다.';
  } finally {
    isLoading.value = false;
  }
};

// ── 정렬 ─────────────────────────────────────────────
const toggleSort = (key) => {
  if (sortKey.value === key) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortOrder.value = 'asc'; }
  currentPage.value = 1;
};

// ── 필터링 + 정렬 ─────────────────────────────────────
const filteredItems = computed(() => {
  let result = items.value.filter(item => {
    const monthMatch  = item.targetMonth === selectedYear.month;
    const siteMatch   = selectedSite.value === '전체' || item.sIdx === selectedSite.value;
    const searchMatch = item.siteName.toLowerCase().includes(searchTerm.value.toLowerCase());
    let   statusMatch = true;
    if (filterConfirmed.value) statusMatch = item.statusText === '확정';
    if (filterPending.value)   statusMatch = item.statusText !== '확정';
    return monthMatch && siteMatch && searchMatch && statusMatch;
  });

  result.sort((a, b) => {
    const mod = sortOrder.value === 'asc' ? 1 : -1;
    const vA  = a[sortKey.value];
    const vB  = b[sortKey.value];
    if (typeof vA === 'string' && typeof vB === 'string') return vA.localeCompare(vB) * mod;
    return (vA < vB ? -1 : vA > vB ? 1 : 0) * mod;
  });
  return result;
});

// ── 페이지네이션 ──────────────────────────────────────
const totalPages      = computed(() => Math.ceil(filteredItems.value.length / pageSize.value));
const pagedItems      = computed(() => {
  const s = (currentPage.value - 1) * pageSize.value;
  return filteredItems.value.slice(s, s + pageSize.value);
});
const pageNumbers = computed(() => {
  const total = totalPages.value;
  const cur   = currentPage.value;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [], left = Math.max(2, cur - 2), right = Math.min(total - 1, cur + 2);
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

// ── 전체선택 ──────────────────────────────────────────
const selectAll = computed({
  get: () => pagedItems.value.length > 0 && pagedItems.value.every(p => p.selected),
  set: (val) => { pagedItems.value.forEach(p => p.selected = val); },
});

// ── 선택 삭제 ─────────────────────────────────────────
const deleteSelected = async () => {
  const selected = items.value.filter(s => s.selected);
  if (!selected.length) { alert('삭제할 항목을 선택하세요.'); return; }
  if (!confirm(`선택한 ${selected.length}건을 삭제하시겠습니까?\n(삭제 후 복구할 수 없습니다)`)) return;
  try {
    isLoading.value = true;
    await Promise.all(selected.map(item => axios.delete(`/api/v1/settle/site/${item.id}`)));
    alert('삭제가 완료되었습니다.');
    await fetchList();
  } catch (e) {
    alert('삭제 중 오류가 발생했습니다.');
  } finally {
    isLoading.value = false;
  }
};

// ── 통계 ─────────────────────────────────────────────
const statsInfo = computed(() => {
  const data = filteredItems.value;
  return {
    totalCount:      data.length,
    totalEmployees:  data.reduce((s, i) => s + (i.totalEmployees || 0), 0),
    totalDays:       data.reduce((s, i) => s + (i.totalDays || 0), 0),
    totalAmount:     data.reduce((s, i) => s + (i.grandTotal || 0), 0),
    confirmedCount:  data.filter(i => i.statusText === '확정').length,
  };
});

const formatCurrency = (v) => (v || 0).toLocaleString();
const formatDays     = (v) => Number(v || 0).toFixed(1);

// ── 모달 ─────────────────────────────────────────────
const openCreateModal = () => {
  selectedId.value          = null;
  initialDataForModal.value = {};
  isModalOpen.value         = true;
};
const openEditModal = (id) => {
  const item                = items.value.find(s => s.id === id);
  selectedId.value          = id;
  initialDataForModal.value = { ...item };
  isModalOpen.value         = true;
};

onMounted(() => {
  fetchSiteOptions();
  fetchList();
});
watch(() => selectedYear.month, fetchList);
</script>

<template>
  <div class="annual-leave-page">

    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calendar-clock-outline"></i>
          연차 추계 관리
        </h1>
        <p class="page-subtitle">월별 현장 직원 미사용 연차 추계액을 관리합니다</p>
      </div>
      <div class="header-actions">
        <button v-if="items.some(s => s.selected)" @click="deleteSelected" class="btn-delete">
          <i class="mdi mdi-trash-can-outline"></i>
          <span>선택 삭제</span>
        </button>
        <button @click="openCreateModal" class="btn-add">
          <i class="mdi mdi-file-document-plus-outline"></i>
          <span>연차추계 작성</span>
        </button>
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-office-building-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">당월 총 청구건수</span>
          <span class="stat-value">{{ statsInfo.totalCount }}<small>개소</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #0ea5e9; --card-bg: rgba(14, 165, 233, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-account-group-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 대상 인원</span>
          <span class="stat-value">{{ statsInfo.totalEmployees }}<small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-calendar-remove-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 미사용 연차</span>
          <span class="stat-value">{{ formatDays(statsInfo.totalDays) }}<small>일</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 연차 추계액</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.totalAmount) }}<small>원</small></span>
        </div>
      </div>
    </div>

    <!-- 필터 패널 -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-calendar-month-outline"></i> 기준 연월</label>
          <input type="month" v-model="selectedYear.month" class="filter-select" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 현장 선택</label>
          <select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>
        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input type="text" v-model="searchTerm" placeholder="현장명으로 검색..."
                   class="search-input" @keyup.enter="fetchList" />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="resetFilters" class="btn-search" title="필터 초기화">
            <i class="mdi mdi-filter-off"></i>
            <span>초기화</span>
          </button>
        </div>
      </div>

      <div class="filter-toggles-row">
        <span class="toggles-label"><i class="mdi mdi-filter-variant"></i> 상태 필터:</span>
        <div class="filter-toggles">
          <label class="toggle-chip" :class="{ active: filterConfirmed }">
            <input type="checkbox" v-model="filterConfirmed" @change="filterPending = false">
            <i class="mdi mdi-check-circle-outline"></i>
            <span>확정만 보기</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterPending }">
            <input type="checkbox" v-model="filterPending" @change="filterConfirmed = false">
            <i class="mdi mdi-clock-alert-outline"></i>
            <span>미확정만 보기</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 로딩 -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>연차 추계 내역을 불러오는 중...</p>
    </div>

    <!-- 테이블 카드 -->
    <div class="table-card" v-else>
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>연차 추계 목록 ({{ filteredItems.length }}건)</span>
        </div>
        <div class="page-size-select">
          <label>페이지당</label>
          <select v-model="pageSize" @change="currentPage = 1" class="filter-select"
                  style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th class="text-center" style="width:40px;">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="selectAll" class="custom-checkbox" />
              </label>
            </th>
            <th @click="toggleSort('id')" class="sortable text-center" style="width:70px;">
              <div class="th-content justify-center">
                <span>No.</span>
                <i v-if="sortKey==='id'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('siteName')" class="sortable">
              <div class="th-content">
                <span>현장명</span>
                <i v-if="sortKey==='siteName'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('targetMonth')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>기준연월</span>
                <i v-if="sortKey==='targetMonth'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('totalEmployees')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>대상인원</span>
                <i v-if="sortKey==='totalEmployees'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('totalDays')" class="sortable text-right">
              <div class="th-content justify-end">
                <span>미사용연차(일)</span>
                <i v-if="sortKey==='totalDays'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('grandTotal')" class="sortable text-right">
              <div class="th-content justify-end">
                <span>연차추계액(원)</span>
                <i v-if="sortKey==='grandTotal'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('statusText')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>상태</span>
                <i v-if="sortKey==='statusText'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('regDtShort')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>작성일</span>
                <i v-if="sortKey==='regDtShort'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center" style="width:100px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="item in pagedItems" :key="item.id" class="data-row">
            <td class="text-center">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="item.selected" class="custom-checkbox" />
              </label>
            </td>
            <td class="text-center text-gray">{{ item.id }}</td>
            <td class="site-name">{{ item.siteName }}</td>
            <td class="text-center">{{ item.targetMonth }}</td>
            <td class="text-center">
              <span class="emp-count">{{ item.totalEmployees }}<small>명</small></span>
            </td>
            <td class="text-right">
              <span class="days-text">{{ formatDays(item.totalDays) }}<small>일</small></span>
            </td>
            <td class="text-right amount-text">{{ formatCurrency(item.grandTotal) }}</td>
            <td class="text-center">
                <span :class="['status-badge',
                  item.statusText === '확정'  ? 'status-active'   :
                  item.statusText === '반려'  ? 'status-inactive' : 'status-pending']">
                  <i :class="['mdi',
                    item.statusText === '확정'  ? 'mdi-check-circle' :
                    item.statusText === '반려'  ? 'mdi-close-circle' : 'mdi-dots-horizontal-circle']"></i>
                  {{ item.statusText }}
                </span>
            </td>
            <td class="text-center text-gray">{{ item.regDtShort }}</td>
            <td class="text-center">
              <button @click="openEditModal(item.id)" class="btn-detail">
                <i class="mdi mdi-pencil-outline"></i> 상세
              </button>
            </td>
          </tr>
          <tr v-if="filteredItems.length === 0" class="empty-row">
            <td colspan="10">
              <div class="empty-state">
                <i class="mdi mdi-calendar-blank-outline"></i>
                <p>조건에 맞는 연차 추계 내역이 없습니다.</p>
                <span>기준 연월 또는 필터 조건을 확인해주세요</span>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <!-- 페이지네이션 -->
      <div class="pagination-bar" v-if="totalPages > 1">
        <span class="pagination-info">
          {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredItems.length) }}
          / 총 {{ filteredItems.length }}건
        </span>
        <div class="pagination-controls">
          <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(1)">
            <i class="mdi mdi-chevron-double-left"></i>
          </button>
          <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
            <i class="mdi mdi-chevron-left"></i>
          </button>
          <template v-for="p in pageNumbers" :key="p">
            <span v-if="p === '...'" class="page-ellipsis">…</span>
            <button v-else class="page-btn" :class="{ active: p === currentPage }" @click="goToPage(p)">
              {{ p }}
            </button>
          </template>
          <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">
            <i class="mdi mdi-chevron-right"></i>
          </button>
          <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(totalPages)">
            <i class="mdi mdi-chevron-double-right"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 모달 -->
    <EstimateModal
        v-if="isModalOpen"
        :is-open="isModalOpen"
        :settlement-id="selectedId"
        :initial-data="initialDataForModal"
        @close="isModalOpen = false"
        @save="fetchList"
    />

  </div>
</template>

<style scoped>
/* ── 페이지 고유 스타일 (공통 CSS 변수 활용) ── */
.header-actions { display: flex; gap: 10px; align-items: center; }

.btn-delete {
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px;
  border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; background: rgba(239,68,68,0.05); color: var(--danger);
}
.btn-delete:hover { background: var(--danger); color: white; border-color: var(--danger); }
.btn-delete i { font-size: 16px; }

.checkbox-wrapper { display: flex; justify-content: center; align-items: center; cursor: pointer; }
.custom-checkbox {
  appearance: none; -webkit-appearance: none;
  width: 18px; height: 18px; border: 2px solid var(--border-focus); border-radius: 4px;
  cursor: pointer; position: relative; transition: all 0.2s; background: var(--bg-surface); margin: 0;
}
.custom-checkbox:checked { border-color: var(--primary); background: var(--primary); }
.custom-checkbox:checked::after {
  content: ''; position: absolute; top: 2px; left: 5px;
  width: 4px; height: 8px; border: solid var(--text-inverse); border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.spinner {
  width: 40px; height: 40px; border: 3px solid var(--bg-canvas); border-top-color: var(--primary);
  border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

.th-content { display: flex; align-items: center; gap: 6px; }
.th-content.justify-center { justify-content: center; }
.th-content.justify-end { justify-content: flex-end; }
.th-content i { font-size: 14px; color: var(--text-muted); }
.sortable:hover .th-content i { color: var(--primary); }

.site-name { font-weight: 600; color: var(--text-main); }
.amount-text { font-weight: 700; color: var(--text-main); font-size: 14px; }
.days-text { font-weight: 600; color: var(--warning); }
.days-text small { font-size: 11px; margin-left: 2px; color: var(--text-sub); }
.emp-count { font-weight: 600; color: var(--primary); }
.emp-count small { font-size: 11px; margin-left: 2px; color: var(--text-sub); }

.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.status-active   { background: rgba(16,185,129,0.1); color: var(--success); }
.status-pending  { background: rgba(245,158,11,0.1); color: var(--warning); }
.status-inactive { background: rgba(239,68,68,0.1);  color: var(--danger); }

.page-size-select {
  display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub);
}
.pagination-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-top: 1px solid var(--border-color);
  background: var(--bg-hover); flex-wrap: wrap; gap: 12px;
}
.pagination-info { font-size: 13px; color: var(--text-sub); }
.pagination-controls { display: flex; align-items: center; gap: 4px; }
.page-btn {
  min-width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-color); border-radius: 7px; background: var(--bg-surface);
  color: var(--text-sub); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; padding: 0 6px;
}
.page-btn:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.page-btn.active { background: var(--primary); border-color: var(--primary); color: var(--text-inverse); font-weight: 700; }
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.page-ellipsis { min-width: 30px; text-align: center; font-size: 14px; color: var(--text-muted); }

@media (max-width: 600px) {
  .pagination-bar { justify-content: center; }
  .pagination-info { width: 100%; text-align: center; }
}
</style>
