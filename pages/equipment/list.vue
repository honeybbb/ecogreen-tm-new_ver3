<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'nuxt/app';

const router = useRouter();

// 1. 상태 및 검색 조건
const searchTerm = ref('');
const selectedStatus = ref('전체');
const selectedSite = ref('전체');
const statusOptions = ref(['전체', '보유 중', '대여 중', '폐기']);
const siteOptions = ref(['전체', 'LH 위례 6단지', '강서 대명 강동', '본사']);

// 2. 정렬 관련 상태
const sortKey = ref('id');
const sortOrder = ref('asc');

// 3. 장비 목록 더미 데이터
const equipmentList = ref([
  { id: 201, name: '고압 세척기 A-1', model: 'HS-3000', serial: 'SN12345', site: 'LH 위례 6단지', borrower: '김철수', status: '대여 중', purchaseDate: '2024-01-01' },
  { id: 202, name: '무선 청소기 V-2', model: 'VC-100', serial: 'SN67890', site: '강서 대명 강동', borrower: '이영희', status: '대여 중', purchaseDate: '2024-03-10' },
  { id: 203, name: 'CCTV 카메라 (예비)', model: 'CAM-IP5', serial: 'SN11223', site: '본사', borrower: '-', status: '보유 중', purchaseDate: '2023-05-20' },
  { id: 204, name: '낡은 바닥 청소기', model: 'OLD-A01', serial: 'SN00001', site: '없음', borrower: '-', status: '폐기', purchaseDate: '2020-10-01' },
]);

// 4. 정렬 토글 함수
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

// 5. 필터링 및 정렬된 장비 목록 계산
const filteredEquipment = computed(() => {
  let result = equipmentList.value.filter(eq => {
    const statusMatch = selectedStatus.value === '전체' || eq.status === selectedStatus.value;
    const siteMatch = selectedSite.value === '전체' || eq.site === selectedSite.value;
    const searchMatch = eq.name.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
        eq.model.toLowerCase().includes(searchTerm.value.toLowerCase());

    return statusMatch && siteMatch && searchMatch;
  });

  result.sort((a, b) => {
    const modifier = sortOrder.value === 'asc' ? 1 : -1;
    const valA = a[sortKey.value];
    const valB = b[sortKey.value];

    if (typeof valA === 'string' && typeof valB === 'string') {
      return valA.localeCompare(valB) * modifier;
    }

    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return result;
});

// 6. 통계 정보 계산
const statsInfo = computed(() => {
  const total = filteredEquipment.value.length;
  const possessed = filteredEquipment.value.filter(eq => eq.status === '보유 중').length;
  const rented = filteredEquipment.value.filter(eq => eq.status === '대여 중').length;
  const discarded = filteredEquipment.value.filter(eq => eq.status === '폐기').length;

  return { total, possessed, rented, discarded };
});

// 7. 상태별 스타일/아이콘 매핑 헬퍼
const getStatusClass = (status) => {
  switch(status) {
    case '보유 중': return 'status-active';
    case '대여 중': return 'status-warning';
    case '폐기': return 'status-inactive';
    default: return '';
  }
};

const getStatusIcon = (status) => {
  switch(status) {
    case '보유 중': return 'mdi-check-circle';
    case '대여 중': return 'mdi-truck-fast';
    case '폐기': return 'mdi-delete-circle';
    default: return 'mdi-help-circle';
  }
};

// 8. 이벤트 핸들러
const handleSearch = () => {
  console.log('검색어:', searchTerm.value);
};

const refreshData = () => {
  searchTerm.value = '';
  selectedStatus.value = '전체';
  selectedSite.value = '전체';
};

const goToRegister = () => router.push('/equipment/register');
const goToDetail = (id) => router.push(`/equipment/${id}`);
</script>

<template>
  <div class="equipment-list-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-toolbox"></i>
          장비 관리
        </h1>
        <p class="page-subtitle">전체 장비 현황을 조회하고 관리합니다</p>
      </div>
      <div class="header-actions">
        <button @click="refreshData" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>초기화</span>
        </button>
        <button @click="goToRegister" class="btn-add">
          <i class="mdi mdi-plus-box"></i>
          <span>장비 등록</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #667eea;">
        <div class="stat-icon">
          <i class="mdi mdi-tools"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">전체 장비</span>
          <span class="stat-value">{{ statsInfo.total }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #10b981;">
        <div class="stat-icon">
          <i class="mdi mdi-check-decagram"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">보유 중</span>
          <span class="stat-value">{{ statsInfo.possessed }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #f59e0b;">
        <div class="stat-icon">
          <i class="mdi mdi-truck-delivery"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">대여 중</span>
          <span class="stat-value">{{ statsInfo.rented }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #94a3b8;">
        <div class="stat-icon">
          <i class="mdi mdi-delete-empty"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">폐기</span>
          <span class="stat-value">{{ statsInfo.discarded }}</span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-office-building"></i>
            현장 위치
          </label>
          <select v-model="selectedSite" class="filter-select">
            <option v-for="site in siteOptions" :key="site" :value="site">
              {{ site }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-tag-outline"></i>
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
                placeholder="장비명 또는 모델명으로 검색..."
                class="search-input"
                @keyup.enter="handleSearch"
            />
            <button v-if="searchTerm" @click="refreshData" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="handleSearch" class="btn-search">
            <i class="mdi mdi-magnify"></i>
            <span>검색</span>
          </button>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table"></i>
          <span>장비 목록 ({{ filteredEquipment.length }}건)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th @click="toggleSort('id')" class="sortable" style="width: 80px;">
              <div class="th-content">
                <span>ID</span>
                <i v-if="sortKey === 'id'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('name')" class="sortable">
              <div class="th-content">
                <span>장비명</span>
                <i v-if="sortKey === 'name'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('model')" class="sortable">
              <div class="th-content">
                <span>모델명</span>
                <i v-if="sortKey === 'model'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('serial')" class="sortable">
              <div class="th-content">
                <span>시리얼 번호</span>
                <i v-if="sortKey === 'serial'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('site')" class="sortable">
              <div class="th-content">
                <span>현재 위치</span>
                <i v-if="sortKey === 'site'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('borrower')" class="sortable">
              <div class="th-content">
                <span>사용자</span>
                <i v-if="sortKey === 'borrower'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('status')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>상태</span>
                <i v-if="sortKey === 'status'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('purchaseDate')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>구입일</span>
                <i v-if="sortKey === 'purchaseDate'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center sticky-col" style="width: 100px;">
              <div class="th-content justify-center">
                <span>관리</span>
              </div>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="eq in filteredEquipment" :key="eq.id" class="data-row">
            <td class="text-gray">{{ eq.id }}</td>
            <td class="item-name">{{ eq.name }}</td>
            <td>{{ eq.model }}</td>
            <td><span class="serial-badge">{{ eq.serial }}</span></td>
            <td>
              <div class="site-info">
                <i class="mdi mdi-map-marker-outline"></i>
                {{ eq.site }}
              </div>
            </td>
            <td>
              <div class="borrower-info" v-if="eq.borrower !== '-'">
                <i class="mdi mdi-account"></i>
                {{ eq.borrower }}
              </div>
              <span v-else class="text-gray">-</span>
            </td>
            <td class="text-center">
              <span :class="['status-badge', getStatusClass(eq.status)]">
                <i :class="['mdi', getStatusIcon(eq.status)]"></i>
                {{ eq.status }}
              </span>
            </td>
            <td class="text-center text-gray">{{ eq.purchaseDate }}</td>
            <td class="text-center sticky-col">
              <button @click="goToDetail(eq.id)" class="btn-detail">
                <i class="mdi mdi-text-box-search-outline"></i>
                <span>상세</span>
              </button>
            </td>
          </tr>

          <tr v-if="filteredEquipment.length === 0" class="empty-row">
            <td colspan="9">
              <div class="empty-state">
                <i class="mdi mdi-toolbox-outline"></i>
                <p>검색된 장비가 없습니다</p>
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
/* Material Design Icons */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 기본 레이아웃 === */
.equipment-list-page {
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

.header-left {
  flex: 1;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title i {
  font-size: 32px;
  color: #667eea;
}

.page-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-refresh,
.btn-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-refresh {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-refresh:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-add {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-add:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.btn-refresh i,
.btn-add i {
  font-size: 18px;
}

/* === 통계 카드 === */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--card-color);
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--card-color);
  opacity: 0.1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.stat-icon i {
  font-size: 24px;
  color: var(--card-color);
  position: absolute;
}

.stat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--card-color);
}

/* === 필터 패널 === */
.filter-panel {
  background: white;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.filter-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.filter-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.filter-label i {
  font-size: 16px;
  color: #667eea;
}

.filter-select {
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  color: #334155;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-select:hover {
  border-color: #cbd5e1;
}

.filter-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* 검색 그룹 */
.search-group {
  display: flex;
  gap: 8px;
  flex: 1;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  flex: 1;
  transition: all 0.2s;
}

.search-box:focus-within {
  background: white;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-box i {
  font-size: 20px;
  color: #94a3b8;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #334155;
  outline: none;
}

.search-input::placeholder {
  color: #94a3b8;
}

.search-clear {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.search-clear:hover {
  background: #e2e8f0;
  color: #64748b;
}

.btn-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  white-space: nowrap;
}

.btn-search:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-search i {
  font-size: 18px;
}

/* === 테이블 카드 === */
.table-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  max-width: 100%;
}

.table-header {
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.table-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.table-title i {
  font-size: 20px;
  color: #667eea;
}

.table-scroll-container {
  overflow-x: auto;
  overflow-y: visible;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}

.table-scroll-container::-webkit-scrollbar {
  height: 8px;
}

.table-scroll-container::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.table-scroll-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.table-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* === 데이터 테이블 === */
.data-table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  position: sticky;
  top: 0;
  z-index: 10;
}

.data-table th {
  padding: 14px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: white;
  white-space: nowrap;
}

.data-table th.sortable {
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.data-table th.sortable:hover {
  background: rgba(255, 255, 255, 0.1);
}

.th-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.justify-center {
  justify-content: center;
}

.th-content i {
  font-size: 14px;
  opacity: 0.8;
  margin-left: auto;
}

.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  vertical-align: middle;
}

.data-row {
  transition: background 0.2s;
}

.data-row:hover {
  background: #f8fafc;
}

.text-center {
  text-align: center !important;
}

.text-gray {
  color: #94a3b8;
}

.item-name {
  font-weight: 600;
  color: #1e293b;
  font-size: 14px;
}

/* 텍스트 배지 룩 */
.serial-badge {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 4px;
  color: #475569;
  font-weight: 600;
}

.site-info, .borrower-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.site-info i, .borrower-info i {
  color: #94a3b8;
  font-size: 16px;
}

/* 상태 배지 */
.status-badge {
  word-break: keep-all;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  min-width: 80px;
}

.status-badge i {
  font-size: 14px;
}

.status-active {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.status-warning {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}

.status-inactive {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

/* Sticky 컬럼 */
.sticky-col {
  position: sticky;
  right: 0;
  box-shadow: -4px 0 8px rgba(0, 0, 0, 0.05);
  z-index: 5;
  background: #ffffff;
}

.data-table thead .sticky-col {
  z-index: 15;
  background: inherit;
}

.data-row:hover .sticky-col {
  background: #f8fafc;
}

/* 상세 버튼 */
.btn-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  width: 100%;
}

.btn-detail:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #3b82f6;
  transform: translateY(-1px);
}

.btn-detail i {
  font-size: 14px;
}

/* 빈 상태 */
.empty-row {
  background: #fafafa;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #94a3b8;
}

.empty-state i {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 16px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 8px 0;
}

.empty-state span {
  font-size: 13px;
}

/* === 반응형 === */
@media (max-width: 1200px) {
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
}
</style>
