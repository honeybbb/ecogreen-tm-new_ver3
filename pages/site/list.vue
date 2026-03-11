<script setup>
import {ref, computed, onMounted} from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";

const router = useRouter();

// 1. 상태 및 검색 조건
const searchTerm = ref('');
const selectedStatus = ref('전체');
const statusOptions = ref(['전체', '운영 중', '준비 중', '계약 종료']);

// 2. 정렬 관련 상태
const sortKey = ref('idx');
const sortOrder = ref('asc');

// 3. 현장 목록 데이터
const sites = ref([
  { idx: 101, name: 'LH 위례 6단지', address: '경기 성남시 수정구 위례광장로 11', manager: '김철수', contract: '2023-01-01 ~ 2024-12-31', status: '운영 중', type: '아파트' },
  { idx: 102, name: '강서 대명 강동', address: '서울 강서구 양천로 1111', manager: '이영희', contract: '2024-05-01 ~ 2026-04-30', status: '운영 중', type: '주상복합' },
  { idx: 103, name: 'LH 율곡 제일 8단지', address: '경기 파주시 교하로 222', manager: '박민수', contract: '2025-01-01 ~ 2026-12-31', status: '준비 중', type: '아파트' },
  { idx: 104, name: '폐지된 현장 A', address: '데이터 없음', manager: '-', contract: '2021-01-01 ~ 2022-12-31', status: '계약 종료', type: '오피스텔' },
]);

const isLoading = ref(false);

// 4. 정렬 토글
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

// 5. 필터링 및 정렬된 현장 목록
const filteredSites = computed(() => {
  let result = sites.value.filter(site => {
    const statusMatch = selectedStatus.value === '전체' || site.status === selectedStatus.value;
    const searchMatch = site.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    return statusMatch && searchMatch;
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

// 6. 이벤트 핸들러
const handleSearch = () => {
  console.log('현장 검색 시작:', searchTerm.value, selectedStatus.value);
};

const getSites = () => {
  isLoading.value = true;
  const cIdx = 1;
  axios.get(`/api/v1/site/list/${cIdx}`)
      .then(res => {
        console.log(res.data.data, 'getSites');
        sites.value = res.data.data;
      })
      .catch(err => {
        console.error('현장 로드 실패:', err);
      })
      .finally(() => {
        isLoading.value = false;
      });
}

const refreshData = () => {
  getSites();
};

onMounted(() => {
  getSites();
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
        <button @click="refreshData" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
        <button @click="goToRegister" class="btn-add">
          <i class="mdi mdi-plus"></i>
          <span>현장 등록</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #4f46e5; --card-bg: #eef2ff;">
        <div class="stat-icon">
          <i class="mdi mdi-office-building-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">전체 현장</span>
          <span class="stat-value">{{ statsInfo.total }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #10b981; --card-bg: #ecfdf5;">
        <div class="stat-icon">
          <i class="mdi mdi-check-circle-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">운영 중</span>
          <span class="stat-value">{{ statsInfo.active }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #f59e0b; --card-bg: #fffbeb;">
        <div class="stat-icon">
          <i class="mdi mdi-clock-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">준비 중</span>
          <span class="stat-value">{{ statsInfo.preparing }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #64748b; --card-bg: #f1f5f9;">
        <div class="stat-icon">
          <i class="mdi mdi-close-circle-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">계약 종료</span>
          <span class="stat-value">{{ statsInfo.ended }}</span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-filter-variant"></i>
            상태
          </label>
          <select v-model="selectedStatus" class="filter-select">
            <option v-for="status in statusOptions" :key="status" :value="status">
              {{ status }}
            </option>
          </select>
        </div>

        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                placeholder="현장명으로 검색..."
                class="search-input"
                @keyup.enter="handleSearch"
            />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="handleSearch" class="btn-search">
            <i class="mdi mdi-magnify"></i>
            <span>검색</span>
          </button>
        </div>
      </div>

      <div class="result-info">
        <div class="info-badge">
          <i class="mdi mdi-information-outline"></i>
          <span>검색 결과: <strong>{{ filteredSites.length }}</strong>개 현장</span>
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
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th @click="toggleSort('idx')" class="sortable" style="width: 80px;">
              <div class="th-content">
                <span>ID</span>
                <i v-if="sortKey === 'idx'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('name')" class="sortable">
              <div class="th-content">
                <span>현장명</span>
                <i v-if="sortKey === 'name'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('address')" class="sortable">
              <div class="th-content">
                <span>주소</span>
                <i v-if="sortKey === 'address'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('contract')" class="sortable" style="width: 220px;">
              <div class="th-content">
                <span>계약 기간</span>
                <i v-if="sortKey === 'contract'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('manager')" class="sortable" style="width: 120px;">
              <div class="th-content">
                <span>담당자</span>
                <i v-if="sortKey === 'manager'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('status')" class="sortable" style="width: 120px;">
              <div class="th-content">
                <span>상태</span>
                <i v-if="sortKey === 'status'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center" style="width: 100px;">
              <div class="th-content justify-center">
                <span>관리</span>
              </div>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="site in filteredSites" :key="site.idx" class="data-row">
            <td>
              <span class="site-id">{{ site.idx }}</span>
            </td>
            <td>
              <div class="site-name-cell">
                <i class="mdi mdi-office-building-outline site-icon"></i>
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
                <span>{{ site.contract }}</span>
              </div>
            </td>
            <td>
              <div class="manager-cell">
                <i class="mdi mdi-account-tie-outline manager-icon"></i>
                <span>{{ site.manager }}</span>
              </div>
            </td>
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
    </div>
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 공통 === */
.site-list-page {
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
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 6px 0;
  display: flex;
  align-items: center;
  gap: 10px;
  letter-spacing: -0.5px;
}

.page-title i { font-size: 26px; color: #4f46e5; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

.header-actions { display: flex; gap: 10px; }

.btn-refresh, .btn-add {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}

.btn-refresh {
  background: white; border: 1px solid #e2e8f0; color: #475569;
}
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }

/* 그라디언트 제거 -> 단색 인디고 사용 */
.btn-add {
  background-color: #6d28d9; color: white;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.btn-add:hover { background-color: #5b21b6; transform: translateY(-1px); }

.btn-refresh i, .btn-add i { font-size: 18px; }


/* === 통계 카드 (단색 & 얇은 보더) === */
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px; margin-bottom: 24px;
}

.stat-card {
  background: white; border-radius: 12px; padding: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  display: flex; align-items: center; gap: 16px;
  transition: all 0.2s; position: relative; overflow: hidden;
}

.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0;
  width: 4px; height: 100%; background-color: var(--card-color);
}

.stat-card:hover {
  transform: translateY(-2px); border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.stat-icon {
  width: 48px; height: 48px; border-radius: 12px;
  background-color: var(--card-bg, #f1f5f9);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.stat-icon i { font-size: 24px; color: var(--card-color); }

.stat-content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.stat-label { font-size: 13px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 24px; font-weight: 700; color: #1e293b; }


/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px;
  margin-bottom: 24px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.filter-row { display: flex; align-items: flex-end; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }

.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 160px; }
.filter-label {
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569;
}
.filter-label i { font-size: 16px; color: #4f46e5; }

.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; cursor: pointer;
  transition: all 0.2s; height: 42px; box-sizing: border-box;
}
.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus {
  outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

/* 검색 그룹 */
.search-group { display: flex; gap: 8px; flex: 1; min-width: 280px; align-items: flex-end; }

.search-box {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 8px; flex: 1; height: 42px; box-sizing: border-box; transition: all 0.2s;
}
.search-box:focus-within {
  background: white; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

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

/* 결과 정보 */
.result-info { padding-top: 16px; border-top: 1px solid #f1f5f9; }
.info-badge {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
  background: #eff6ff; color: #1e40af; border-radius: 6px; font-size: 12px; font-weight: 500;
}
.info-badge i { font-size: 15px; }

/* === 로딩 상태 === */
.loading-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; background: white; border-radius: 12px; border: 1px solid #e2e8f0;
}

.spinner {
  width: 40px; height: 40px; border: 3px solid #f1f5f9;
  border-top-color: #4f46e5; border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p { margin-top: 16px; font-size: 14px; color: #64748b; }

/* === 테이블 카드 === */
.table-card {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); overflow: hidden; max-width: 100%;
}

.table-header { padding: 18px 24px; border-bottom: 1px solid #e2e8f0; }
.table-title {
  display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: #1e293b;
}
.table-title i { font-size: 20px; color: #4f46e5; }

.table-scroll-container {
  overflow-x: auto; overflow-y: visible; max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }


/* === 데이터 테이블 (단색 헤더 통일) === */
.data-table { width: 100%; min-width: 1000px; border-collapse: collapse; font-size: 13px; }
.data-table thead { background-color: #6d28d9; }

.data-table th {
  padding: 14px 16px; text-align: left; font-size: 12px; font-weight: 600;
  color: white; white-space: nowrap;
}

.data-table th.sortable { cursor: pointer; user-select: none; transition: background 0.2s; }
.data-table th.sortable:hover { background-color: #5b21b6; }

.th-content { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
.th-content.justify-center { justify-content: center; }
.th-content i { font-size: 14px; opacity: 0.8; }

.data-table td {
  padding: 14px 16px; border-bottom: 1px solid #e2e8f0;
  color: #334155; vertical-align: middle; word-break: keep-all;
}

.data-row { transition: background 0.2s; }
.data-row:hover { background-color: #f8fafc; }
.text-center { text-align: center !important; }

/* 데이터 셀 텍스트 및 아이콘 스타일 */
.site-id {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 40px; padding: 4px 8px; background: #f1f5f9;
  border-radius: 6px; font-weight: 600; color: #64748b; font-size: 12px;
}

.site-name-cell { display: flex; align-items: center; gap: 8px; }
.site-icon { font-size: 18px; color: #4f46e5; }
.site-name { font-weight: 600; color: #1e293b; }

.address-cell { display: flex; align-items: center; gap: 6px; }
.address-icon { font-size: 16px; color: #94a3b8; flex-shrink: 0; }

.contract-cell { display: flex; align-items: center; gap: 6px; font-family: 'Courier New', monospace; font-size: 12px;}
.contract-icon { font-size: 16px; color: #94a3b8; flex-shrink: 0; }

.manager-cell { display: flex; align-items: center; gap: 6px; }
.manager-icon { font-size: 16px; color: #94a3b8; flex-shrink: 0; }

/* 상태 배지 */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.status-badge i { font-size: 13px; }
.status-active { background-color: #d1fae5; color: #065f46; }
.status-preparing { background-color: #fef3c7; color: #b45309; }
.status-inactive { background-color: #f1f5f9; color: #475569; }

/* 상세 버튼 */
.btn-detail {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 6px 12px; background-color: #4f46e5; border: none; border-radius: 6px;
  color: white; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-detail:hover { background-color: #4338ca; transform: translateY(-1px); }
.btn-detail i { font-size: 14px; }

/* 빈 상태 */
.empty-row { background: white; }
.empty-state { text-align: center; padding: 50px 20px; color: #94a3b8; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: #cbd5e1; }
.empty-state p { font-size: 15px; font-weight: 600; color: #475569; margin: 0 0 6px 0; }
.empty-state span { font-size: 13px; }

/* === 반응형 === */
@media (max-width: 1024px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 16px;}
  .filter-row { flex-wrap: wrap; }
  .search-group { width: 100%; flex: 1 1 100%; }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 14px; align-items: flex-start; }
  .header-actions { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .btn-refresh, .btn-add { flex: 1; justify-content: center; }

  .stats-grid { grid-template-columns: 1fr; gap: 12px;}
  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group, .search-group { width: 100%; min-width: 100%; }

  /* 모바일 검색 영역 나란히 */
  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
  .btn-search { flex-shrink: 0; }
}
</style>
