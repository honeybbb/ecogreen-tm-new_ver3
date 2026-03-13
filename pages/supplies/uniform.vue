<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';

// 1. 상태 및 필터 조건
const searchTerm = ref('');
const selectedStatus = ref('전체');
const statusOptions = ['전체', '승인 대기', '지급 준비', '지급 완료', '반려'];
const startDate = ref('');
const endDate = ref('');
const isLoading = ref(false);

// 2. 피복 신청 데이터
const requests = ref([
  { idx: 1, date: '2026-02-01', staffName: '김철수', staffId: '202301', item: '안전화', size: '270mm', reason: '기존 안전화 파손', status: '승인 대기' },
  { idx: 2, date: '2026-02-01', staffName: '이영희', staffId: '202302', item: '근무복 조끼', size: '95(M)', reason: '신규 입사', status: '지급 준비' },
  { idx: 3, date: '2026-01-28', staffName: '박민준', staffId: '202305', item: '동계 점퍼', size: '105(XL)', reason: '정기 지급', status: '지급 완료' },
  { idx: 4, date: '2026-01-25', staffName: '최지우', staffId: '202401', item: '작업용 장갑', size: 'L', reason: '분실', status: '반려' },
]);

// 3. 통계 데이터 계산
const statsInfo = computed(() => {
  const total = requests.value.length;
  const pending = requests.value.filter(r => r.status === '승인 대기').length;
  const ready = requests.value.filter(r => r.status === '지급 준비').length;
  const completed = requests.value.filter(r => r.status === '지급 완료').length;
  return { total, pending, ready, completed };
});

// 4. 필터링 로직
const filteredRequests = computed(() => {
  return requests.value.filter(req => {
    const statusMatch = selectedStatus.value === '전체' || req.status === selectedStatus.value;
    const searchMatch = req.staffName.includes(searchTerm.value) || req.item.includes(searchTerm.value);
    let dateMatch = true;
    if (startDate.value) dateMatch = dateMatch && req.date >= startDate.value;
    if (endDate.value) dateMatch = dateMatch && req.date <= endDate.value;

    return statusMatch && searchMatch && dateMatch;
  });
});

// 5. 유틸리티 함수
const getStatusClass = (status) => {
  switch (status) {
    case '승인 대기': return 'status-pending';
    case '지급 준비': return 'status-shipping';
    case '지급 완료': return 'status-completed';
    case '반려': return 'status-rejected';
    default: return '';
  }
};

// 6. 모달 로직
const isModalOpen = ref(false);
const selectedRequest = ref({});

const openModal = (req) => {
  selectedRequest.value = req;
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
  selectedRequest.value = {};
};

const updateStatus = (idx, newStatus) => {
  if(!confirm(`'${newStatus}' 상태로 변경하시겠습니까?`)) return;
  const target = requests.value.find(r => r.idx === idx);
  if(target) {
    target.status = newStatus;
    alert('변경되었습니다.');
    closeModal();
  }
};

onMounted(() => {
  // fetchRequests(); // API 연동 시 호출
});
</script>

<template>
  <div class="order-management-page">
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-tshirt-crew"></i>
          피복 신청 관리
        </h1>
        <p class="page-subtitle">직원들의 피복 신청 내역을 검토하고 지급 프로세스를 관리합니다</p>
      </div>
      <div class="header-actions">
        <button class="btn-add">
          <i class="mdi mdi-plus-box"></i>
          <span>강제 지급 등록</span>
        </button>
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #667eea;">
        <div class="stat-icon">
          <i class="mdi mdi-clipboard-text-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">전체 신청</span>
          <span class="stat-value">{{ statsInfo.total }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #f59e0b;">
        <div class="stat-icon">
          <i class="mdi mdi-clock-alert-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">승인 대기</span>
          <span class="stat-value">{{ statsInfo.pending }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #3b82f6;">
        <div class="stat-icon">
          <i class="mdi mdi-package-variant"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">지급 준비</span>
          <span class="stat-value">{{ statsInfo.ready }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #10b981;">
        <div class="stat-icon">
          <i class="mdi mdi-check-decagram-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">지급 완료</span>
          <span class="stat-value">{{ statsInfo.completed }}건</span>
        </div>
      </div>
    </div>

    <!-- 필터 패널 -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group date-range-group">
          <label class="filter-label">
            <i class="mdi mdi-calendar-range"></i>
            신청 기간
          </label>
          <div class="date-range">
            <input type="date" v-model="startDate" class="filter-select" />
            <span class="date-separator">~</span>
            <input type="date" v-model="endDate" class="filter-select" />
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-filter-variant"></i>
            상태 구분
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
                placeholder="직원명 또는 품목 검색..."
                class="search-input"
            />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- 결과 배지 -->
      <div class="result-badge" v-if="filteredRequests.length > 0">
        <i class="mdi mdi-information"></i>
        <span>{{ filteredRequests.length }}건의 신청이 조회되었습니다</span>
      </div>
    </div>

    <!-- 테이블 카드 -->
    <div class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>신청 목록</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 120px;">신청일</th>
            <th style="width: 180px;">직원명(사번)</th>
            <th style="width: 150px;">품목명</th>
            <th class="text-center" style="width: 100px;">사이즈</th>
            <th>신청사유</th>
            <th class="text-center" style="width: 110px;">상태</th>
            <th class="text-center sticky-col" style="width: 120px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="req in filteredRequests" :key="req.idx" class="data-row">
            <td class="text-gray">{{ req.date }}</td>
            <td class="staff-name">
              {{ req.staffName }}
              <span class="staff-id">({{ req.staffId }})</span>
            </td>
            <td class="item-name">{{ req.item }}</td>
            <td class="text-center">
              <span class="size-badge">{{ req.size }}</span>
            </td>
            <td class="reason-text">{{ req.reason }}</td>
            <td class="text-center">
                <span :class="['status-badge', getStatusClass(req.status)]">
                  <i :class="[
                    'mdi',
                    req.status === '승인 대기' ? 'mdi-clock-alert-outline' :
                    req.status === '지급 준비' ? 'mdi-package-variant' :
                    req.status === '지급 완료' ? 'mdi-check-circle' : 'mdi-close-circle'
                  ]"></i>
                  {{ req.status }}
                </span>
            </td>
            <td class="text-center sticky-col">
              <button @click="openModal(req)" class="btn-detail">
                <i class="mdi mdi-eye"></i>
                <span>상세</span>
              </button>
            </td>
          </tr>

          <tr v-if="filteredRequests.length === 0" class="empty-row">
            <td colspan="7">
              <div class="empty-state">
                <i class="mdi mdi-package-variant-closed"></i>
                <p>조회된 신청 내역이 없습니다</p>
                <span>검색 조건을 변경해보세요</span>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 모달 -->
    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-container">
        <!-- 모달 헤더 -->
        <div class="modal-header">
          <div class="modal-title">
            <i class="mdi mdi-clipboard-text-search"></i>
            <span>피복 신청 상세</span>
          </div>
          <button @click="closeModal" class="btn-modal-close">
            <i class="mdi mdi-close"></i>
          </button>
        </div>

        <!-- 모달 바디 -->
        <div class="modal-body">
          <!-- 신청 정보 요약 -->
          <div class="info-summary">
            <div class="info-item">
              <span class="info-label">신청일</span>
              <span class="info-value">{{ selectedRequest.date }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">신청자</span>
              <span class="info-value">
                {{ selectedRequest.staffName }}
                <span class="info-sub">({{ selectedRequest.staffId }})</span>
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">현재 상태</span>
              <span :class="['status-badge', getStatusClass(selectedRequest.status)]">
                <i :class="[
                  'mdi',
                  selectedRequest.status === '승인 대기' ? 'mdi-clock-alert-outline' :
                  selectedRequest.status === '지급 준비' ? 'mdi-package-variant' :
                  selectedRequest.status === '지급 완료' ? 'mdi-check-circle' : 'mdi-close-circle'
                ]"></i>
                {{ selectedRequest.status }}
              </span>
            </div>
          </div>

          <!-- 품목 정보 -->
          <div class="detail-section">
            <h4 class="section-title">
              <i class="mdi mdi-tshirt-crew"></i>
              품목 정보
            </h4>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">품목명</span>
                <span class="detail-value item-highlight">{{ selectedRequest.item }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">사이즈</span>
                <span class="detail-value">
                  <span class="size-badge large">{{ selectedRequest.size }}</span>
                </span>
              </div>
            </div>
          </div>

          <!-- 신청 사유 -->
          <div class="detail-section">
            <h4 class="section-title">
              <i class="mdi mdi-text-box-outline"></i>
              신청 사유
            </h4>
            <div class="reason-box">
              <p>{{ selectedRequest.reason }}</p>
            </div>
          </div>
        </div>

        <!-- 모달 푸터 -->
        <div class="modal-footer">
          <template v-if="selectedRequest.status === '승인 대기'">
            <button @click="updateStatus(selectedRequest.idx, '지급 준비')" class="btn-approve">
              <i class="mdi mdi-check-circle"></i>
              <span>승인</span>
            </button>
            <button @click="updateStatus(selectedRequest.idx, '반려')" class="btn-reject">
              <i class="mdi mdi-close-circle"></i>
              <span>반려</span>
            </button>
          </template>
          <template v-else-if="selectedRequest.status === '지급 준비'">
            <button @click="updateStatus(selectedRequest.idx, '지급 완료')" class="btn-complete">
              <i class="mdi mdi-package-variant-closed"></i>
              <span>지급 완료</span>
            </button>
          </template>
          <button @click="closeModal" class="btn-cancel">
            <i class="mdi mdi-close"></i>
            <span>닫기</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 기본 레이아웃 === */
.order-management-page {
  padding: 0;
  color: #334155;
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

.btn-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-add:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.btn-add i {
  font-size: 18px;
}

/* === 통계 카드 === */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
  opacity: 0.15;
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
  font-size: 13px;
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
  margin-bottom: 0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.date-range-group {
  min-width: 320px;
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

.date-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-separator {
  color: #94a3b8;
  font-weight: 700;
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
  flex: 1;
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
  padding: 0 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  flex: 1;
  height: 42px;
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

/* 결과 배지 */
.result-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  color: #1e40af;
  font-size: 13px;
  font-weight: 600;
  margin-top: 16px;
}

.result-badge i {
  font-size: 16px;
}

/* === 테이블 카드 === */
.table-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
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

/* === 데이터 테이블 === */
.data-table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.data-table th {
  padding: 14px 16px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: white;
  white-space: nowrap;
}

.data-table td {
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
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

/* 직원명 */
.staff-name {
  font-weight: 600;
  color: #1e293b;
}

.staff-id {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 400;
  margin-left: 4px;
}

/* 품목명 */
.item-name {
  color: #2563eb;
  font-weight: 600;
}

/* 사이즈 배지 */
.size-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid #bfdbfe;
}

.size-badge.large {
  padding: 6px 14px;
  font-size: 13px;
}

/* 신청사유 */
.reason-text {
  color: #64748b;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 상태 배지 */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.status-badge i {
  font-size: 14px;
}

.status-pending {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fcd34d;
}

.status-shipping {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #93c5fd;
}

.status-completed {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #6ee7b7;
}

.status-rejected {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

/* Sticky 컬럼 */
.sticky-col {
  position: sticky;
  right: 0;
  box-shadow: -4px 0 8px rgba(0, 0, 0, 0.05);
  z-index: 5;
  background: white;
}

.data-table thead .sticky-col {
  z-index: 15;
  background: #764ba2;
  box-shadow: none;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.data-row:hover .sticky-col {
  background: #f8fafc;
}

/* 상세 버튼 */
.btn-detail {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-detail:hover {
  background: #2563eb;
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

/* === 모달 === */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-container {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 600px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 모달 헤더 */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px 16px 0 0;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: white;
}

.modal-title i {
  font-size: 22px;
}

.btn-modal-close {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-modal-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-modal-close i {
  font-size: 20px;
}

/* 모달 바디 */
.modal-body {
  padding: 24px;
  max-height: 60vh;
  overflow-y: auto;
}

.modal-body::-webkit-scrollbar {
  width: 8px;
}

.modal-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

/* 정보 요약 */
.info-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 20px;
  background: #f8fafc;
  border-radius: 12px;
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.info-value {
  font-size: 15px;
  color: #1e293b;
  font-weight: 700;
}

.info-sub {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 400;
}

/* 상세 섹션 */
.detail-section {
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #f1f5f9;
}

.section-title i {
  font-size: 18px;
  color: #667eea;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.detail-value {
  font-size: 14px;
  color: #334155;
  font-weight: 600;
}

.item-highlight {
  color: #2563eb;
  font-weight: 700;
}

/* 신청 사유 박스 */
.reason-box {
  padding: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  line-height: 1.6;
}

.reason-box p {
  margin: 0;
  color: #475569;
  font-size: 14px;
}

/* 모달 푸터 */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0 0 16px 16px;
}

.btn-approve,
.btn-reject,
.btn-complete,
.btn-cancel {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-approve {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-approve:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}

.btn-reject {
  background: #fee2e2;
  color: #ef4444;
  border: 1px solid #fecaca;
}

.btn-reject:hover {
  background: #fecaca;
}

.btn-complete {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.btn-complete:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.btn-cancel {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-cancel:hover {
  background: #f8fafc;
}

.btn-approve i,
.btn-reject i,
.btn-complete i,
.btn-cancel i {
  font-size: 16px;
}

/* === 반응형 === */
@media (max-width: 1024px) {
  .filter-row {
    flex-wrap: wrap;
  }

  .date-range-group,
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
  }

  .btn-add {
    width: 100%;
    justify-content: center;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .info-summary {
    grid-template-columns: 1fr;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .modal-footer {
    flex-direction: column;
  }

  .btn-approve,
  .btn-reject,
  .btn-complete,
  .btn-cancel {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
