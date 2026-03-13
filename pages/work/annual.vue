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
          <i class="mdi mdi-calendar-check-outline"></i>
          연차 신청 관리
        </h1>
        <p class="page-subtitle">직원들의 연차 및 휴가 신청 내역을 검토하고 승인합니다</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-file-document-edit-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">전체 신청</span>
          <span class="stat-value">{{ statsInfo.total }} <small>건</small></span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-clock-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">승인 대기</span>
          <span class="stat-value">{{ statsInfo.pending }} <small>건</small></span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-check-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">승인 완료</span>
          <span class="stat-value">{{ statsInfo.approved }} <small>건</small></span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: var(--danger); --card-bg: rgba(239, 68, 68, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-close-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">반려 내역</span>
          <span class="stat-value">{{ statsInfo.rejected }} <small>건</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-calendar-month-outline"></i>
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
            <i class="mdi mdi-magnify"></i>
            <span>조회</span>
          </button>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table"></i>
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
            <th class="text-center">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-if="isLoading" class="empty-row">
            <td colspan="8">
              <div class="empty-state">
                <i class="mdi mdi-loading mdi-spin"></i>
                <p>데이터를 불러오는 중입니다...</p>
              </div>
            </td>
          </tr>
          <template v-else>
            <tr v-for="req in filteredRequests" :key="req.idx" class="data-row">
              <td class="text-gray">{{ req.reqDate }}</td>
              <td class="text-dark">{{ req.site }}</td>
              <td class="member-name">{{ req.staff }}</td>
              <td>
                <div class="period-box">
                  <i class="mdi mdi-calendar-clock text-blue-icon"></i>
                  {{ req.startDt }} ~ {{ req.endDt }}
                </div>
              </td>
              <td class="text-center font-bold text-blue-text">{{ req.days }}일</td>
              <td class="reason-cell" :title="req.reason">{{ req.reason }}</td>
              <td>
                  <span :class="['status-badge', getStatusClass(req.status)]">
                    <i :class="['mdi', Number(req.status) === 0 ? 'mdi-clock-outline' : Number(req.status) === 1 ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline']"></i>
                    {{ getStatusText(req.status) }}
                  </span>
              </td>
              <td class="text-center">
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
                <span v-else class="text-gray">처리완료</span>
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
          </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 페이지 고유 스타일 (공통 CSS 이외) */
.date-range { display: flex; align-items: center; gap: 8px; }
.date-range input { flex: 1; }
.date-sep { color: var(--text-sub); font-weight: bold; }

.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: var(--text-sub); }

.data-table {width: 100%; min-width: 100% !important; border-collapse: collapse; font-size: 13px;}

/* 테이블 내부 텍스트 유틸리티 */
.member-name { font-weight: 600; color: var(--primary); }
.text-blue-text { color: var(--primary); }
.text-blue-icon { color: var(--primary); }

.period-box { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-sub); }
.reason-cell { max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-sub); }

/* 상태 배지 (테마 변수 활용) */
.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.status-pending { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.status-approved { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-rejected { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }
.status-badge i { font-size: 13px; }

/* 관리 액션 버튼 */
.action-buttons { display: flex; gap: 6px; justify-content: center; }
.btn-approve, .btn-reject {
  display: flex; align-items: center; gap: 4px; padding: 6px 12px;
  border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-approve { background-color: var(--success); color: var(--text-inverse); }
.btn-reject { background-color: var(--danger); color: var(--text-inverse); }
.btn-approve:hover { background-color: var(--success-hover); transform: translateY(-1px); }
.btn-reject:hover { filter: brightness(0.9); transform: translateY(-1px); }

@media (max-width: 768px) {
  .date-range { flex-direction: column; align-items: stretch; }
  .date-sep { display: none; }
}
</style>
