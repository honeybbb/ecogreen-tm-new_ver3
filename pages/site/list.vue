<script setup>
import {ref, computed, onMounted, onActivated} from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";
import Pagination from "~/components/Pagination.vue";
import {useTableResize} from "~/composables/useTableResize.js";
const { startResize } = useTableResize();
const router = useRouter();

// 1. 상태 및 검색 조건
const searchTerm = ref('');
const selectedStatus = ref('전체');
const selectedType = ref('전체');
const selectedVat = ref('전체');
const statusOptions = ref(['전체', '운영 중', '준비 중', '계약 종료']);
const typeOptions = ref(['전체', '아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const vatOptions = ref([
  { label: '전체', value: '전체' },
  { label: '과세', value: 'Y' },
  { label: '면세', value: 'N' }
]);

// 2. 정렬 관련 상태
const sortKey = ref('idx');
const sortOrder = ref('asc');

// 3. 현장 목록 데이터
const sites = ref([]);

const isLoading = ref(false);
const error = ref(null);
// ── 페이지네이션 상태 ──────────────────────────────
const currentPage = ref(1);
const pageSize    = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

// 4. 정렬 토글
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

//필터 초기화
const resetFilters = () => {
  searchTerm.value     = '';
  selectedStatus.value   = '전체';
  selectedType.value   = '전체';
  selectedVat.value = '전체';
  currentPage.value = 1;
};

// 5. 필터링 및 정렬된 현장 목록
const filteredSites = computed(() => {
  let result = sites.value.filter(site => {
    const statusMatch = selectedStatus.value === '전체' || site.status === selectedStatus.value;
    const typeMatch   = selectedType.value === '전체' || site.sType === selectedType.value || site.type === selectedType.value;
    const vatMatch    = selectedVat.value === '전체' || site.is_vat === selectedVat.value;
    const searchMatch = site.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    return statusMatch && typeMatch && vatMatch && searchMatch;
  });

  result.sort((a, b) => {
    const modifier = sortOrder.value === 'asc' ? 1 : -1;
    const valA = a[sortKey.value];
    const valB = b[sortKey.value];

    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * modifier;
    }

    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return result;
});

// 통계 정보
const statsInfo = computed(() => {
  const total = sites.value.length;
  const active = sites.value.filter(s => s.status === '운영 중').length;
  const preparing = sites.value.filter(s => s.status === '준비 중').length;
  const ended = sites.value.filter(s => s.status === '계약 종료').length;

  return { total, active, preparing, ended };
});

const pagedSiteList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredSites.value.slice(start, start + pageSize.value);
});

const handlePageChange = () => {
  document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// 필터 변경 시 첫 페이지로
const onFilterChange = () => { currentPage.value = 1; };

const getContractPeriods = (site) => {
  // contracts가 없거나 배열이 아니면
  if (!site?.contracts || !Array.isArray(site.contracts) || site.contracts.length === 0) {
    return '-';
  }

  return site.contracts
      .map(contract => contract?.contract_period)
      .filter(period => period)
      .join('<br>');
}
// 6. 이벤트 핸들러
const handleSearch = () => {
  console.log('현장 검색 시작:', searchTerm.value, selectedStatus.value);
};

const getSites = () => {
  isLoading.value = true;
  axios.get(`/api/v1/site/list`)
      .then(res => {
        sites.value = res.data.data || [];
      })
      .catch(err => {
        console.error('현장 로드 실패:', err);
      })
      .finally(() => {
        isLoading.value = false;
      });
}

onActivated(async () => {
  await getSites();
});

const goToRegister = () => router.push('/site/register');
const goToDetail = (id) => router.push(`/site/${id}`);
</script>

<template>
  <div class="site-list-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-map-marker-multiple-outline"></i>
          현장 관리
        </h1>
        <p class="page-subtitle">전체 현장 정보를 조회하고 관리합니다</p>
      </div>
      <div class="header-actions">
        <button @click="goToRegister" class="btn-add">
          <i class="mdi mdi-plus"></i>
          <span>현장 등록</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon">
          <i class="mdi mdi-office-building-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">전체 현장</span>
          <span class="stat-value">{{ statsInfo.total }} <small>건</small></span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon">
          <i class="mdi mdi-check-circle-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">운영 중</span>
          <span class="stat-value">{{ statsInfo.active }} <small>건</small></span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon">
          <i class="mdi mdi-clock-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">준비 중</span>
          <span class="stat-value">{{ statsInfo.preparing }} <small>건</small></span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: var(--text-sub); --card-bg: var(--bg-hover);">
        <div class="stat-icon">
          <i class="mdi mdi-close-circle-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">계약 종료</span>
          <span class="stat-value">{{ statsInfo.ended }} <small>건</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-filter-variant"></i> 상태
          </label>
          <select v-model="selectedStatus" class="filter-select">
            <option v-for="status in statusOptions" :key="status" :value="status">
              {{ status }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-office-building-cog-outline"></i> 현장 형태
          </label>
          <select v-model="selectedType" class="filter-select">
            <option v-for="type in typeOptions" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-cash-register"></i> 과세 여부
          </label>
          <select v-model="selectedVat" class="filter-select">
            <option v-for="vat in vatOptions" :key="vat.value" :value="vat.value">
              {{ vat.label }}
            </option>
          </select>
        </div>

        <div class="search-group" style="flex: 1;">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                placeholder="현장명으로 검색..."
                class="search-input"
            />
            <button v-if="searchTerm" @click="searchTerm = ''; onFilterChange()" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="resetFilters" class="btn-search" title="필터 초기화">
            <i class="mdi mdi-filter-off"></i>
            <span>초기화</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중...</p>
    </div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table"></i>
          <span>현장 목록 ({{ filteredSites.length }}개)</span>
        </div>
        <div class="page-size-select">
          <label>페이지당</label>
          <select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th @click="toggleSort('idx')" class="sortable resizable" style="width: 80px;">
              <div class="th-content">
                <span>ID</span>
                <i v-if="sortKey === 'idx'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('name')" class="sortable resizable">
              <div class="th-content">
                <span>현장명</span>
                <i v-if="sortKey === 'name'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('address')" class="sortable resizable">
              <div class="th-content">
                <span>주소</span>
                <i v-if="sortKey === 'address'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('contract')" class="sortable resizable" style="width: 220px;">
              <div class="th-content">
                <span>계약 기간</span>
                <i v-if="sortKey === 'contract'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('manager')" class="sortable resizable" style="width: 120px;">
              <div class="th-content">
                <span>본사 담당자</span>
                <i v-if="sortKey === 'manager'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th> <div class="th-content"><span>본사 연락처</span></div></th>
            <th @click="toggleSort('manager')" class="sortable resizable" style="width: 120px;">
              <div class="th-content">
                <span>현장 담당자</span>
                <i v-if="sortKey === 'director'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th><div class="th-content"><span>현장 연락처</span></div></th>
            <th @click="toggleSort('status')" class="sortable resizable" style="width: 120px;">
              <div class="th-content">
                <span>상태</span>
                <i v-if="sortKey === 'status'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="text-center" style="width: 100px;">
              <div class="th-content justify-center">
                <span>관리</span>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="site in pagedSiteList" :key="site.idx" class="data-row">
            <td>
              <span class="site-id">{{ site.idx }}</span>
            </td>
            <td>
              <div class="site-name-cell">
                <span class="site-name">{{ site.name }}</span>
              </div>
            </td>
            <td>
              <div class="address-cell">
                <i class="mdi mdi-map-marker-outline address-icon"></i>
                <span>{{ site.address }}</span>
              </div>
            </td>
            <td>
              <div class="contract-cell">
                <i class="mdi mdi-calendar-range contract-icon"></i>
                <span
                    v-if="site?.contracts?.length"
                    v-html="getContractPeriods(site)">
                </span>
                <span v-else class="text-muted">-</span>
              </div>
            </td>
            <td>
              <div class="manager-cell">
                <i class="mdi mdi-account-tie-outline manager-icon"></i>
                <span>{{ site.manager }}</span>
              </div>
            </td>
            <td><span>{{site.manager_phone}}</span></td>
            <td>
              <span>{{site.director}}</span>
            </td>
            <td><span>{{site.director_phone}}</span></td>
            <td>
                <span :class="[
                  'status-badge',
                  {
                    'status-active': site.status === '운영 중',
                    'status-preparing': site.status === '준비 중',
                    'status-inactive': site.status === '계약 종료'
                  }
                ]">
                  <i :class="[
                    'mdi',
                    site.status === '운영 중' ? 'mdi-check-circle-outline' :
                    site.status === '준비 중' ? 'mdi-clock-outline' :
                    'mdi-close-circle-outline'
                  ]"></i>
                  {{ site.status }}
                </span>
            </td>
            <td class="text-center">
              <button @click="goToDetail(site.idx)" class="btn-detail">
                <i class="mdi mdi-eye"></i>
                <span>상세</span>
              </button>
            </td>
          </tr>

          <tr v-if="filteredSites.length === 0" class="empty-row">
            <td colspan="7">
              <div class="empty-state">
                <i class="mdi mdi-office-building-outline"></i>
                <p>검색된 현장이 없습니다</p>
                <span>다른 조건으로 검색해보세요</span>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredSites.length"
          @change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped>
/* =========================================
   페이지 고유 스타일 (공통 CSS 예외)
========================================= */

/* 결과 정보 배지 */
.result-info { padding-top: 16px; border-top: 1px solid var(--border-color); }
.info-badge {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
  background: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 500;
}
.info-badge i { font-size: 15px; }

/* === 로딩 상태 === */
.loading-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color);
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

/* === 테이블 레이아웃 보완 === */
.table-scroll-container {
  overflow-x: auto; overflow-y: visible; max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.th-content { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
.th-content.justify-center { justify-content: center; }
.th-content i { font-size: 14px; opacity: 0.8; color: var(--text-muted); }
.sortable:hover .th-content i { color: var(--primary); opacity: 1;}

/* === 데이터 셀 스타일 === */
.site-id {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 40px; padding: 4px 8px; background: var(--bg-hover);
  border-radius: 6px; font-weight: 600; color: var(--text-sub); font-size: 12px;
}

.site-name-cell { display: flex; align-items: center; gap: 8px; }
.site-icon { font-size: 18px; color: var(--primary); }
.site-name { font-weight: 600; color: var(--text-main); }

.address-cell { display: flex; align-items: center; gap: 6px; color: var(--text-main); }
.address-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }

.contract-cell { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-main);}
.contract-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }

.manager-cell { display: flex; align-items: center; gap: 6px; color: var(--text-main); }
.manager-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }

/* === 상태 배지 === */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.status-badge i { font-size: 13px; }
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-preparing { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.status-inactive { background-color: var(--bg-hover); color: var(--text-sub); }

.resizable {
  position: relative;
  overflow: hidden;
}
.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 2px;
  height: 100%;
  cursor: col-resize;
  z-index: 1;
  user-select: none;
}
.resize-handle:hover,
.is-resizing .resize-handle {
  background: var(--primary);
  opacity: 0.5;
}

/* === 반응형 === */
@media (max-width: 1024px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 16px;}
  .filter-row { flex-wrap: wrap; }
  .search-group { width: 100%; flex: 1 1 100%; }
}

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: 1fr; gap: 12px;}
  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group, .search-group { width: 100%; min-width: 100%; }

  /* 모바일 검색 영역 나란히 */
  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
  .btn-search { flex-shrink: 0; }
}
</style>
