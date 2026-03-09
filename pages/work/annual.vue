<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";

const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// 1. 상태 및 필터
const startDate = ref('');
const endDate = ref('');
const selectedStatus = ref('전체');
const selectedStaff = ref('');
const isLoading = ref(false);

// 2. 신청 내역 데이터
const requests = ref([]);

// 3. 통계 데이터 계산
const statsInfo = computed(() => {
  const total = requests.value.length;
  const pending = requests.value.filter(req => req.status == 0).length;
  const approved = requests.value.filter(req => req.status == 1).length;
  const rejected = requests.value.filter(req => req.status == 2).length;
  const totalDays = requests.value
      .filter(req => req.status == 1)
      .reduce((acc, cur) => acc + Number(cur.days), 0);

  return { total, pending, approved, rejected, totalDays };
});

// 4. 필터링 로직
const filteredRequests = computed(() => {
  return requests.value.filter(req => {
    const statusMatch = selectedStatus.value === '전체' || req.status == selectedStatus.value;
    const staffMatch = req.staff.toLowerCase().includes(selectedStaff.value.toLowerCase());
    return statusMatch && staffMatch;
  });
});

const getMemberOff = async () => {
  isLoading.value = true;
  try {
    let params = {
      startDt: startDate.value,
      endDt: endDate.value,
    };
    const res = await axios.get(`/api/v1/member/off/${cIdx}`, { params });
    requests.value = res.data.data;
  } catch (err) {
    console.error("연차 목록 로드 실패", err);
  } finally {
    isLoading.value = false;
  }
};

// 6. 승인/반려 처리
const updateStatus = async (idx, newStatus) => {
  const statusText = newStatus == '1' ? '승인' : '반려';
  if (!confirm(`${statusText}하시겠습니까?`)) return;

  try {
    const payload = { idx, status: newStatus };
    const res = await axios.post(`/api/v1/member/off/status`, payload);
    if (res.data.result) {
      alert(`${statusText} 처리가 완료되었습니다.`);
      getMemberOff(); // 목록 새로고침
    }
  } catch (err) {
    alert("처리 중 오류가 발생했습니다.");
  }
};

// 유틸리티 함수
const getStatusClass = (status) => {
  switch (Number(status)) {
    case 0: return 'status-pending';
    case 1: return 'status-approved';
    case 2: return 'status-rejected';
    default: return '';
  }
};

const getStatusText = (status) => {
  switch (Number(status)) {
    case 0: return '승인대기';
    case 1: return '승인완료';
    case 2: return '반려됨';
    default: return '-';
  }
};

const setDefaultDate = () => {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  startDate.value = start;
  endDate.value = end;
};

const refreshData = () => {
  getMemberOff();
};

onMounted(() => {
  setDefaultDate();
  getMemberOff();
});
</script>

<template>
  <div class="member-list-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calendar-check"></i>
          연차 신청 관리
        </h1>
        <p class="page-subtitle">직원들의 연차 및 휴가 신청 내역을 검토하고 승인합니다</p>
      </div>
      <div class="header-actions">
        <button @click="refreshData" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #667eea;">
        <div class="stat-icon"><i class="mdi mdi-file-document-edit-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">전체 신청</span>
          <span class="stat-value">{{ statsInfo.total }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #f59e0b;">
        <div class="stat-icon"><i class="mdi mdi-clock-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">승인 대기</span>
          <span class="stat-value">{{ statsInfo.pending }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #10b981;">
        <div class="stat-icon"><i class="mdi mdi-check-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">승인 완료</span>
          <span class="stat-value">{{ statsInfo.approved }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #ef4444;">
        <div class="stat-icon"><i class="mdi mdi-close-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">반려 내역</span>
          <span class="stat-value">{{ statsInfo.rejected }}건</span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-calendar-month"></i>
            신청 기간
          </label>
          <div class="date-range">
            <input type="date" v-model="startDate" class="filter-select">
            <span class="date-sep">~</span>
            <input type="date" v-model="endDate" class="filter-select">
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-list-status"></i>
            진행 상태
          </label>
          <select v-model="selectedStatus" class="filter-select">
            <option value="전체">전체 상태</option>
            <option value="0">승인 대기</option>
            <option value="1">승인 완료</option>
            <option value="2">반려</option>
          </select>
        </div>

        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="selectedStaff"
                placeholder="직원명으로 검색..."
                class="search-input"
                @keyup.enter="getMemberOff"
            />
          </div>
          <button @click="getMemberOff" class="btn-search">
            <span>조회</span>
          </button>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table-large"></i>
          <span>연차 신청 목록 ({{ filteredRequests.length }}건)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th>신청일</th>
            <th>현장명</th>
            <th>직원명</th>
            <th>사용 기간</th>
            <th class="text-center">사용일수</th>
            <th>신청 사유</th>
            <th>상태</th>
            <th class="text-center sticky-col">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="req in filteredRequests" :key="req.idx" class="data-row">
            <td class="text-gray">{{ req.reqDate }}</td>
            <td>{{ req.site }}</td>
            <td class="member-name">{{ req.staff }}</td>
            <td>
              <div class="period-box">
                <i class="mdi mdi-calendar-clock text-blue-400"></i>
                {{ req.startDt }} ~ {{ req.endDt }}
              </div>
            </td>
            <td class="text-center font-bold text-blue-600">{{ req.days }}일</td>
            <td class="reason-cell" :title="req.reason">{{ req.reason }}</td>
            <td>
                <span :class="['status-badge', getStatusClass(req.status)]">
                  <i :class="['mdi', Number(req.status) === 0 ? 'mdi-clock-outline' : Number(req.status) === 1 ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
                  {{ getStatusText(req.status) }}
                </span>
            </td>
            <td class="text-center sticky-col">
              <div v-if="Number(req.status) === 0" class="action-buttons">
                <button @click="updateStatus(req.idx, 1)" class="btn-approve" title="승인">
                  <i class="mdi mdi-check"></i>
                  승인
                </button>
                <button @click="updateStatus(req.idx, 2)" class="btn-reject" title="반려">
                  <i class="mdi mdi-close"></i>
                  반려
                </button>
              </div>
              <span v-else class="text-gray text-xs">처리완료</span>
            </td>
          </tr>

          <tr v-if="filteredRequests.length === 0" class="empty-row">
            <td colspan="8">
              <div class="empty-state">
                <i class="mdi mdi-calendar-remove-outline"></i>
                <p>해당 조건의 연차 신청 내역이 없습니다</p>
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
/* 필터 패널 */
.filter-panel { background: white; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); }
.filter-row { display: flex; align-items: flex-end; gap: 20px; }
.filter-group { display: flex; flex-direction: column; gap: 8px; }
.filter-label { font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px; }
.filter-select { padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: white; outline: none; }
.date-range { display: flex; align-items: center; gap: 8px; }
.date-sep { color: #94a3b8; }

.search-group { display: flex; gap: 8px; flex: 1; }
.search-box { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; flex: 1; }
.search-input { border: none; background: transparent; outline: none; width: 100%; font-size: 14px; }
.btn-search { background: #667eea; color: white; border: none; padding: 0 20px; border-radius: 8px; font-weight: 700; cursor: pointer; transition: 0.3s; }
.btn-search:hover { background: #5568d3; }

/* 테이블 */
.table-card { background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); overflow: hidden; }
.table-header { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; }
.table-title { display: flex; align-items: center; gap: 10px; font-weight: 700; color: #1e293b; }
.data-table { width: 100%; border-collapse: collapse; min-width: 1000px; }
.data-table thead { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.data-table th { padding: 14px 18px; color: white; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; }
.data-table td { padding: 16px 18px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
.data-row:hover { background: #f8fafc; }

.member-name { font-weight: 700; color: #1e293b; }
.period-box { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #475569; }
.reason-cell { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #64748b; }

/* 상태 배지 */
.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.status-pending { background: #fff7ed; color: #c2410c; }
.status-approved { background: #d1fae5; color: #065f46; }
.status-rejected { background: #fee2e2; color: #991b1b; }

/* 관리 버튼 */
.action-buttons { display: flex; gap: 6px; justify-content: center; }
.btn-approve, .btn-reject { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; }
.btn-approve { background: #10b981; color: white; }
.btn-reject { background: #ef4444; color: white; }
.btn-approve:hover { background: #059669; transform: translateY(-1px); }
.btn-reject:hover { background: #dc2626; transform: translateY(-1px); }

/* Sticky 컬럼 */
.sticky-col {
  position: sticky;
  right: 0;
  box-shadow: -4px 0 8px rgba(0, 0, 0, 0.05);
  z-index: 5;
}
.data-row:hover .sticky-col { background: #f8fafc; }

.text-gray { color: #94a3b8; }
.text-blue-600 { color: #2563eb; }
.empty-state { text-align: center; padding: 60px; color: #94a3b8; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.3; }

@media (max-width: 1024px) {
  .filter-row { flex-direction: column; align-items: stretch; }
  .search-group { width: 100%; }
}
</style>
