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

const formatPrice = (price) => (Number(price) || 0).toLocaleString() + '원';

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
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-tshirt-crew"></i>
          피복 신청 관리
        </h1>
        <p class="page-subtitle">직원들의 피복 신청 내역을 검토하고 지급 프로세스를 관리합니다</p>
      </div>
      <div class="header-actions">
        <button class="btn-refresh">
          <i class="mdi mdi-plus-box"></i>
          <span>강제 지급 등록</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #667eea;">
        <div class="stat-icon"><i class="mdi mdi-clipboard-text-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">전체 신청</span>
          <span class="stat-value">{{ statsInfo.total }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f59e0b;">
        <div class="stat-icon"><i class="mdi mdi-clock-alert-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">승인 대기</span>
          <span class="stat-value">{{ statsInfo.pending }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #3b82f6;">
        <div class="stat-icon"><i class="mdi mdi-package-variant"></i></div>
        <div class="stat-content">
          <span class="stat-label">지급 준비</span>
          <span class="stat-value">{{ statsInfo.ready }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #10b981;">
        <div class="stat-icon"><i class="mdi mdi-check-decagram-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">지급 완료</span>
          <span class="stat-value">{{ statsInfo.completed }}건</span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group" style="min-width: 300px;">
          <label class="filter-label"><i class="mdi mdi-calendar-range"></i>신청 기간</label>
          <div style="display: flex; align-items: center; gap: 5px;">
            <input type="date" v-model="startDate" class="filter-select" style="flex: 1;">
            <span class="text-gray">~</span>
            <input type="date" v-model="endDate" class="filter-select" style="flex: 1;">
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-filter-variant"></i>상태 구분</label>
          <select v-model="selectedStatus" class="filter-select">
            <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
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
          </div>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>신청 목록 ({{ filteredRequests.length }}건)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th>신청일</th>
            <th>직원명(사번)</th>
            <th>품목명</th>
            <th class="text-center">사이즈</th>
            <th>신청사유</th>
            <th class="text-center">상태</th>
            <th class="text-center sticky-col">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="req in filteredRequests" :key="req.idx" class="data-row">
            <td class="text-gray">{{ req.date }}</td>
            <td class="font-bold">{{ req.staffName }} <span class="text-gray-sm">({{ req.staffId }})</span></td>
            <td class="text-blue">{{ req.item }}</td>
            <td class="text-center"><span class="size-badge">{{ req.size }}</span></td>
            <td class="text-gray" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ req.reason }}</td>
            <td class="text-center">
                <span :class="['status-badge', getStatusClass(req.status)]">
                  {{ req.status }}
                </span>
            </td>
            <td class="text-center sticky-col">
              <button @click="openModal(req)" class="btn-detail">
                <i class="mdi mdi-eye"></i>
                <span>상세보기</span>
              </button>
            </td>
          </tr>
          <tr v-if="filteredRequests.length === 0">
            <td colspan="7">
              <div class="empty-state">
                <i class="mdi mdi-package-variant"></i>
                <p>조회된 신청 내역이 없습니다</p>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <i class="mdi mdi-clipboard-text-search"></i>
            <span>피복 신청 상세</span>
          </div>
          <button @click="closeModal" class="btn-close">&times;</button>
        </div>

        <div class="modal-body">
          <div class="order-info-summary">
            <div class="info-item">
              <span class="label">신청자</span>
              <span class="value">{{ selectedRequest.staffName }} ({{ selectedRequest.staffId }})</span>
            </div>
            <div class="info-item">
              <span class="label">신청품목</span>
              <span class="value text-blue">{{ selectedRequest.item }}</span>
            </div>
            <div class="info-item">
              <span class="label">사이즈</span>
              <span class="value font-black">{{ selectedRequest.size }}</span>
            </div>
          </div>

          <div class="reason-box">
            <p class="label">신청 사유</p>
            <p class="value">{{ selectedRequest.reason }}</p>
          </div>
        </div>

        <div class="modal-footer">
          <template v-if="selectedRequest.status === '승인 대기'">
            <button @click="updateStatus(selectedRequest.idx, '지급 준비')" class="btn-approve">
              <i class="mdi mdi-check-circle"></i> 승인
            </button>
            <button @click="updateStatus(selectedRequest.idx, '반려')" class="btn-close-modal" style="background:#fee2e2; color:#ef4444;">
              <i class="mdi mdi-close-circle"></i> 반려
            </button>
          </template>
          <template v-else-if="selectedRequest.status === '지급 준비'">
            <button @click="updateStatus(selectedRequest.idx, '지급 완료')" class="btn-complete">
              <i class="mdi mdi-package-variant-closed"></i> 지급 완료 처리
            </button>
          </template>
          <button @click="closeModal" class="btn-close-modal">닫기</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

.order-management-page { padding: 0; }

/* 헤더 & 통계 */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.page-title { font-size: 28px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 12px; }
.page-title i { color: #f59e0b; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 5px 0 0 0; }
.btn-refresh { display: flex; align-items: center; gap: 8px; padding: 10px 18px; background: #10b981; color:white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; transition: 0.3s; }

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
.stat-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 16px; position: relative; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--card-color); }
.stat-icon { width: 44px; height: 44px; border-radius: 10px; background: var(--card-color); opacity: 0.1; display: flex; align-items: center; justify-content: center; position: relative; }
.stat-icon i { font-size: 22px; color: var(--card-color); position: absolute; }
.stat-label { font-size: 11px; color: #64748b; font-weight: 600; }
.stat-value { font-size: 18px; font-weight: 800; color: #1e293b; }

/* 필터 패널 */
.filter-panel { background: white; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.filter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 180px; }
.filter-label { font-size: 12px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 4px; }
.filter-select { padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: #fff; }
.search-group { flex: 1; min-width: 250px; }
.search-box { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
.search-input { border: none; background: transparent; outline: none; width: 100%; font-size: 14px; }

/* 테이블 */
.table-card { background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; }
.table-header { padding: 18px 24px; border-bottom: 1px solid #f1f5f9; }
.table-title { font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px; }
.data-table { width: 100%; border-collapse: collapse; min-width: 1000px; }
.data-table thead { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.data-table th { padding: 14px 18px; color: white; text-align: left; font-size: 12px; }
.data-table td { padding: 14px 18px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
.data-row:hover { background: #f8fafc; }

.size-badge { background: #eff6ff; color: #2563eb; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 12px; }

/* 상태 배지 */
.status-badge { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.status-pending { background: #fef3c7; color: #b45309; }
.status-shipping { background: #dbeafe; color: #1e40af; }
.status-completed { background: #d1fae5; color: #065f46; }
.status-rejected { background: #fee2e2; color: #991b1b; }

/* Sticky 컬럼 */
.sticky-col { position: sticky; right: 0; background: #fff; box-shadow: -4px 0 8px rgba(0,0,0,0.05); }
.data-row:hover .sticky-col { background: #f8fafc; }

/* 버튼 스타일 */
.btn-detail { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: #3b82f6; border: none; border-radius: 6px; color: white; font-size: 11px; font-weight: 600; cursor: pointer; }
.text-center { text-align: center; }
.text-gray { color: #94a3b8; }
.text-gray-sm { color: #94a3b8; font-size: 11px; }
.text-blue { color: #2563eb; font-weight: 600; }

/* 모달 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-card { background: white; border-radius: 20px; width: 100%; max-width: 600px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; animation: slideUp 0.3s ease; }
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.modal-header { padding: 20px 24px; background: #f8fafc; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
.modal-title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; color: #1e293b; }
.btn-close { background: none; border: none; font-size: 24px; color: #94a3b8; cursor: pointer; }
.modal-body { padding: 24px; }
.order-info-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; background: #f1f5f9; padding: 16px; border-radius: 12px; margin-bottom: 20px; }
.info-item { display: flex; flex-direction: column; gap: 4px; }
.info-item .label { font-size: 11px; color: #64748b; font-weight: 600; }
.info-item .value { font-size: 14px; color: #1e293b; font-weight: 700; }
.reason-box { background: #fff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 10px; }
.reason-box .label { font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 5px; }
.modal-footer { padding: 20px 24px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 12px; }
.btn-approve { padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
.btn-complete { padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
.btn-close-modal { padding: 12px 24px; background: #f1f5f9; color: #64748b; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }

.empty-state { text-align: center; padding: 60px; color: #cbd5e1; }
</style>
