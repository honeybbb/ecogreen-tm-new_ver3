<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue';
import axios from 'axios';
import SettlementModal from '@/components/SettlementModal.vue';
import SettlementPrintModal from '@/components/SettlementPrintModal.vue';

const { typeOptions, siteOptions, fetchTypeOptions, fetchSiteOptions } = useApi();

// ── 상태 ─────────────────────────────────────────────
const isLoading = ref(false);
const error     = ref(null);
const settlements = ref([]);

const selectedYear    = reactive({ month: '2026-01' });
const searchTerm      = ref('');
const selectedSite    = ref('전체');
const selectedType    = ref('전체');
const filterCompleted = ref(false);
const filterPending   = ref(false);

const sortKey   = ref('id');
const sortOrder = ref('desc');

const isModalOpen         = ref(false);
const selectedId          = ref(null);
const initialDataForModal = ref(null);

const isPrintModalOpen = ref(false);
const printTargetItems = ref([]);

const currentPage     = ref(1);
const pageSize        = ref(50);
const pageSizeOptions = [50, 100, 200, 500];

// ── watch ─────────────────────────────────────────────
watch([selectedSite, selectedType, searchTerm, filterCompleted, filterPending, selectedYear], () => {
  currentPage.value = 1;
});
watch(() => selectedYear.month, fetchList);

const resetFilters = () => {
  searchTerm.value = '';
  selectedSite.value = '전체';
  selectedType.value = '전체';
  filterPending.value = false;
  filterCompleted.value = false;
  currentPage.value = 1;
};

// ── JSON 파싱 헬퍼 ────────────────────────────────────
function parseJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val;
}

// ── API 호출 ─────────────────────────────────────────
async function fetchList() {
  isLoading.value = true;
  error.value = null;
  try {
    const params = {
      year:    selectedYear.month.split('-')[0],
      month:   selectedYear.month.split('-')[1],
      docType: 'SERVICE',
    };
    const res     = await axios.get('/api/v1/settle/site/list', { params });
    const rawData = res.data.data || [];

    setTimeout(() => {
      settlements.value = rawData.map(item => {
        const site     = siteOptions.value.find(s => s.idx === item.sIdx);
        const siteName = site ? site.name : `알수없는현장(${item.sIdx})`;
        const mm       = String(item.month).padStart(2, '0');

        let statusText = '진행중';
        if (item.status === 1) statusText = '입금확인';
        else if (item.status === 2) statusText = '반려';

        return {
          ...item,
          // billingData / payrollData 항상 객체/배열로 보정
          billingData: parseJson(item.billingData, {}),
          payrollData: parseJson(item.payrollData, []),
          id:           item.idx,
          siteName,
          target_month: `${item.year}-${mm}`,
          total_amount: item.grandTotal,
          statusText,
          regDtShort:   (item.regDt || '').split(' ')[0],
          selected:     false,
        };
      });
      currentPage.value = 1;
      isLoading.value   = false;
    }, 500);
  } catch (e) {
    console.error('리스트 조회 에러:', e);
    error.value     = '데이터를 불러오는 중 오류가 발생했습니다.';
    isLoading.value = false;
  }
}

// ── 정렬 ─────────────────────────────────────────────
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value   = key;
    sortOrder.value = 'asc';
  }
  currentPage.value = 1;
};

// ── 필터링 + 정렬 ─────────────────────────────────────
const filteredSettlements = computed(() => {
  let result = settlements.value.filter(item => {
    const monthMatch  = item.target_month === selectedYear.month;
    const siteMatch   = selectedSite.value === '전체' || item.sIdx === selectedSite.value;
    const searchMatch = item.siteName.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch   = selectedType.value === '전체' || item.type === selectedType.value;
    let   statusMatch = true;
    if (filterCompleted.value) statusMatch = item.statusText === '입금확인';
    if (filterPending.value)   statusMatch = item.statusText !== '입금확인';
    return monthMatch && siteMatch && searchMatch && typeMatch && statusMatch;
  });

  result.sort((a, b) => {
    const mod = sortOrder.value === 'asc' ? 1 : -1;
    const vA  = a[sortKey.value], vB = b[sortKey.value];
    if (typeof vA === 'string' && typeof vB === 'string') return vA.localeCompare(vB) * mod;
    return (vA < vB ? -1 : vA > vB ? 1 : 0) * mod;
  });

  return result;
});

// ── 페이지네이션 ──────────────────────────────────────
const totalPages = computed(() => Math.ceil(filteredSettlements.value.length / pageSize.value));

const pagedSettlements = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredSettlements.value.slice(start, start + pageSize.value);
});

const pageNumbers = computed(() => {
  const total = totalPages.value, cur = currentPage.value;
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
  get: () => pagedSettlements.value.length > 0 && pagedSettlements.value.every(p => p.selected),
  set: (val) => pagedSettlements.value.forEach(p => (p.selected = val)),
});

// ── 선택된 항목 ───────────────────────────────────────
const selectedItems = computed(() => settlements.value.filter(s => s.selected));

// ── 선택 삭제 ─────────────────────────────────────────
const deleteSelected = async () => {
  if (!selectedItems.value.length) {
    alert('삭제할 정산 내역을 체크해주세요.');
    return;
  }
  if (!confirm(`선택한 ${selectedItems.value.length}건의 정산 내역을 삭제하시겠습니까?\n(삭제 후 복구할 수 없습니다)`)) return;

  try {
    isLoading.value = true;
    await Promise.all(selectedItems.value.map(item => axios.delete(`/api/v1/settle/site/${item.id}`)));
    alert('삭제가 완료되었습니다.');
    await fetchList();
  } catch (e) {
    console.error('삭제 오류:', e);
    alert('삭제 중 오류가 발생했습니다.');
  } finally {
    isLoading.value = false;
  }
};

// ── 출력 ─────────────────────────────────────────────
const handlePrint = () => {
  if (!selectedItems.value.length) {
    alert('출력할 항목을 선택하세요.');
    return;
  }
  printTargetItems.value = selectedItems.value.map(item => ({ ...item }));
  isPrintModalOpen.value = true;
};

// ── 통계 ─────────────────────────────────────────────
const statsInfo = computed(() => {
  const d = filteredSettlements.value;
  return {
    totalCount:    d.length,
    totalAmount:   d.reduce((s, i) => s + (i.total_amount || 0), 0),
    completedCount:d.filter(i => i.status == 1).length,
    pendingCount:  d.filter(i => i.status != 1).length,
  };
});

const formatCurrency = (amount) => (amount || 0).toLocaleString();

// ── 모달 ─────────────────────────────────────────────
const openCreateModal = () => {
  selectedId.value          = null;
  initialDataForModal.value = {};
  isModalOpen.value         = true;
};

const openEditModal = (id, docType = 'statement') => {
  const item = settlements.value.find(s => s.id === id);
  selectedId.value          = id;
  initialDataForModal.value = { ...item, defaultTab: docType };
  isModalOpen.value         = true;
};

onMounted(() => {
  fetchTypeOptions();
  fetchSiteOptions();
  fetchList();
});
</script>

<template>
  <div class="settlement-list-page">

    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calculator-variant-outline"></i>
          정산서 및 내역서 관리
        </h1>
        <p class="page-subtitle">월별 단지 정산 및 청구 내역을 관리합니다</p>
      </div>
      <div class="header-actions">
        <template v-if="selectedItems.length > 0">
          <button @click="handlePrint" class="btn-print">
            <i class="mdi mdi-printer-outline"></i>
            <span>출력 ({{ selectedItems.length }}건)</span>
          </button>
          <button @click="deleteSelected" class="btn-delete">
            <i class="mdi mdi-trash-can-outline"></i>
            <span>선택 삭제</span>
          </button>
        </template>
        <button @click="openCreateModal" class="btn-add">
          <i class="mdi mdi-file-document-plus-outline"></i>
          <span>새 정산서 작성</span>
        </button>
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-file-document-multiple-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">당월 총 청구건수</span>
          <span class="stat-value">{{ statsInfo.totalCount }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">당월 총 청구금액</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.totalAmount) }}<small>원</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #0ea5e9; --card-bg: rgba(14, 165, 233, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-check-decagram-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">입금 확인</span>
          <span class="stat-value">{{ statsInfo.completedCount }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-clock-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">진행 중/반려</span>
          <span class="stat-value">{{ statsInfo.pendingCount }}<small>건</small></span>
        </div>
      </div>
    </div>

    <!-- 필터 패널 -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-calendar-month-outline"></i> 청구 연월</label>
          <input type="month" v-model="selectedYear.month" class="filter-select" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 현장 선택</label>
          <select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-format-list-bulleted-type"></i> 구분</label>
          <select v-model="selectedType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
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
          <label class="toggle-chip" :class="{ active: filterCompleted }">
            <input type="checkbox" v-model="filterCompleted" @change="filterPending = false">
            <i class="mdi mdi-check-circle-outline"></i>
            <span>입금확인만 보기</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterPending }">
            <input type="checkbox" v-model="filterPending" @change="filterCompleted = false">
            <i class="mdi mdi-clock-alert-outline"></i>
            <span>진행중/반려만 보기</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 로딩 -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>정산 내역을 불러오는 중...</p>
    </div>

    <!-- 테이블 -->
    <div class="table-card" v-else>
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>정산 목록 ({{ filteredSettlements.length }}건)</span>
          <span v-if="selectedItems.length > 0" class="selected-badge">
            {{ selectedItems.length }}건 선택됨
          </span>
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
            <th class="text-center" style="width: 40px;">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="selectAll" class="custom-checkbox" />
              </label>
            </th>
            <th @click="toggleSort('id')" class="sortable text-center" style="width: 80px;">
              <div class="th-content justify-center">
                <span>No.</span>
                <i v-if="sortKey === 'id'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('siteName')" class="sortable">
              <div class="th-content">
                <span>현장명</span>
                <i v-if="sortKey === 'siteName'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('type')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>구분</span>
                <i v-if="sortKey === 'type'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('target_month')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>청구연월</span>
                <i v-if="sortKey === 'target_month'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('total_amount')" class="sortable text-right">
              <div class="th-content justify-end">
                <span>청구금액</span>
                <i v-if="sortKey === 'total_amount'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('statusText')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>상태</span>
                <i v-if="sortKey === 'statusText'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('regDtShort')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>작성일</span>
                <i v-if="sortKey === 'regDtShort'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center" style="width: 220px;">
              <div class="th-content justify-center"><span>관리</span></div>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="item in pagedSettlements" :key="item.id"
              class="data-row" :class="{ 'row-selected': item.selected }">
            <td class="text-center">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="item.selected" class="custom-checkbox" />
              </label>
            </td>
            <td class="text-center text-gray">{{ item.id }}</td>
            <td class="site-name">{{ item.siteName }}</td>
            <td class="text-center">
                <span :class="['badge',
                  item.type === '01001002' ? 'badge-clean' :
                  item.type === '01001001' ? 'badge-guard' : 'badge-etc']">
                  {{ item.typeNm }}
                </span>
            </td>
            <td class="text-center">{{ item.target_month }}</td>
            <td class="text-right amount-text">{{ formatCurrency(item.total_amount) }}</td>
            <td class="text-center">
                <span :class="['status-badge',
                  item.statusText === '입금확인' ? 'status-active' :
                  item.statusText === '반려'    ? 'status-inactive' : 'status-pending']">
                  <i :class="['mdi',
                    item.statusText === '입금확인' ? 'mdi-check-circle' :
                    item.statusText === '반려'    ? 'mdi-close-circle' : 'mdi-dots-horizontal-circle']"></i>
                  {{ item.statusText }}
                </span>
            </td>
            <td class="text-center text-gray">{{ item.regDtShort }}</td>
            <td class="text-center">
              <div class="action-buttons">
                <button @click="openEditModal(item.id, 'statement')" class="btn-action btn-statement">
                  <i class="mdi mdi-file-document-outline"></i> 정산서
                </button>
                <button @click="openEditModal(item.id, 'details')" class="btn-action btn-details">
                  <i class="mdi mdi-format-list-bulleted"></i> 내역서
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filteredSettlements.length === 0" class="empty-row">
            <td colspan="9">
              <div class="empty-state">
                <i class="mdi mdi-text-box-search-outline"></i>
                <p>조건에 맞는 정산 내역이 없습니다.</p>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <!-- 페이지네이션 -->
      <div class="pagination-bar" v-if="totalPages > 1">
        <span class="pagination-info">
          {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredSettlements.length) }}
          / 총 {{ filteredSettlements.length }}건
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

    <!-- 편집 모달 -->
    <SettlementModal
        v-if="isModalOpen"
        :is-open="isModalOpen"
        :settlement-id="selectedId"
        :initial-data="initialDataForModal"
        @close="isModalOpen = false"
        @save="fetchList"
    />

    <!-- 출력 모달 -->
    <SettlementPrintModal
        v-if="isPrintModalOpen"
        :is-open="isPrintModalOpen"
        :items="printTargetItems"
        @close="isPrintModalOpen = false"
    />

  </div>
</template>

<style scoped>
.header-actions { display: flex; gap: 10px; align-items: center; }

.btn-print {
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px;
  border: 1px solid rgba(14, 165, 233, 0.4); border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; background: rgba(14, 165, 233, 0.08); color: #0ea5e9;
}
.btn-print:hover { background: #0ea5e9; color: white; border-color: #0ea5e9; }
.btn-print i { font-size: 16px; }

.btn-delete {
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px;
  border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; background-color: rgba(239, 68, 68, 0.05); color: var(--danger);
}
.btn-delete:hover { background-color: var(--danger); color: white; border-color: var(--danger); }
.btn-delete i { font-size: 16px; }

.row-selected { background-color: var(--primary-soft) !important; }

.selected-badge {
  font-size: 12px; font-weight: 600; padding: 2px 10px;
  background: #0ea5e9; color: white; border-radius: 10px; margin-left: 8px;
}

.checkbox-wrapper { display: flex; justify-content: center; align-items: center; cursor: pointer; }
.custom-checkbox {
  appearance: none; -webkit-appearance: none; width: 18px; height: 18px;
  border: 2px solid var(--border-focus); border-radius: 4px; cursor: pointer;
  position: relative; transition: all 0.2s; background: var(--bg-surface); margin: 0;
}
.custom-checkbox:hover { border-color: var(--text-muted); }
.custom-checkbox:checked { border-color: var(--primary); background-color: var(--primary); }
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

.table-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border-color); }
.table-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: var(--text-main); }
.table-title i { font-size: 20px; color: var(--primary); display: none; }
.page-size-select { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub); }

.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; width: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.th-content { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
.th-content.justify-center { justify-content: center; }
.th-content.justify-end { justify-content: flex-end; }
.th-content i { font-size: 14px; opacity: 0.8; color: var(--text-muted); transition: color 0.2s; }
.sortable:hover .th-content i { color: var(--primary); opacity: 1; }

.site-name { font-weight: 600; color: var(--text-main); }
.amount-text { font-weight: 700; color: var(--text-main); font-size: 14px; }

.badge { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; word-break: keep-all; }
.badge-clean { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.badge-guard { background-color: var(--primary-soft); color: var(--primary); }
.badge-etc   { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }

.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.status-active   { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-pending  { background-color: rgba(245, 158, 11, 0.1);  color: var(--warning); }
.status-inactive { background-color: rgba(239, 68, 68, 0.1);   color: var(--danger); }

.action-buttons { display: flex; gap: 8px; justify-content: center; }
.btn-action { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; white-space: nowrap; }
.btn-statement { background-color: var(--primary-soft); color: var(--primary); }
.btn-statement:hover { background-color: rgba(37, 99, 235, 0.15); }
.btn-details { background-color: var(--bg-canvas); color: var(--text-sub); }
.btn-details:hover { background-color: var(--border-color); color: var(--text-main); }

.pagination-bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-top: 1px solid var(--border-color); background: var(--bg-hover); flex-wrap: wrap; gap: 12px; }
.pagination-info { font-size: 13px; color: var(--text-sub); }
.pagination-controls { display: flex; align-items: center; gap: 4px; }
.page-btn { min-width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: 7px; background: var(--bg-surface); color: var(--text-sub); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; padding: 0 6px; }
.page-btn:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.page-btn.active { background: var(--primary); border-color: var(--primary); color: var(--text-inverse); font-weight: 700; }
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.page-btn i { font-size: 16px; }
.page-ellipsis { min-width: 30px; text-align: center; font-size: 14px; color: var(--text-muted); letter-spacing: 1px; }

@media (max-width: 600px) {
  .pagination-bar { justify-content: center; }
  .pagination-info { width: 100%; text-align: center; }
}
</style>
