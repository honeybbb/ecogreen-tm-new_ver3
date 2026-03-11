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
      <div class="header-actions">
        <button @click="refreshData" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #4f46e5; --card-bg: #eef2ff;">
        <div class="stat-icon"><i class="mdi mdi-file-document-edit-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">전체 신청</span>
          <span class="stat-value">{{ statsInfo.total }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #f59e0b; --card-bg: #fffbeb;">
        <div class="stat-icon"><i class="mdi mdi-clock-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">승인 대기</span>
          <span class="stat-value">{{ statsInfo.pending }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #10b981; --card-bg: #ecfdf5;">
        <div class="stat-icon"><i class="mdi mdi-check-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">승인 완료</span>
          <span class="stat-value">{{ statsInfo.approved }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #ef4444; --card-bg: #fef2f2;">
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
            <th class="text-center sticky-col">관리</th>
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
          </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 설정 === */
.member-list-page {
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

.btn-refresh {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px;
  background: white; border: 1px solid #e2e8f0; border-radius: 8px;
  color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
.btn-refresh i { font-size: 16px; }

/* === 통계 카드 (플랫 디자인) === */
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px; margin-bottom: 24px;
}

.stat-card {
  background: white; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); display: flex; align-items: center; gap: 16px;
  transition: transform 0.2s, box-shadow 0.2s; position: relative; overflow: hidden;
}
.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
  background-color: var(--card-color);
}
.stat-card:hover { transform: translateY(-2px); border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }

.stat-icon {
  width: 48px; height: 48px; border-radius: 12px; background-color: var(--card-bg);
  display: flex; align-items: center; justify-content: center; position: relative; flex-shrink: 0;
}
.stat-icon i { font-size: 24px; color: var(--card-color); position: absolute; }

.stat-content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 12px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 22px; font-weight: 700; color: #1e293b; letter-spacing: -0.5px;}

/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.filter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 200px; flex: 1;}

.filter-label {
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569;
}
.filter-label i { font-size: 16px; color: #4f46e5; }

.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; outline: none; transition: all 0.2s; height: 42px; box-sizing: border-box;
}
.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

.date-range { display: flex; align-items: center; gap: 8px; }
.date-range input { flex: 1; }
.date-sep { color: #94a3b8; font-weight: bold; }

/* 검색 그룹 */
.search-group { display: flex; gap: 8px; flex: 2; min-width: 280px; align-items: flex-end;}
.search-box {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #f8fafc;
  border: 1px solid #e2e8f0; border-radius: 8px; flex: 1; height: 42px; transition: all 0.2s; box-sizing: border-box;
}
.search-box:focus-within { background: white; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.search-input { border: none; background: transparent; outline: none; width: 100%; font-size: 13px; color: #334155; }
.search-input::placeholder { color: #94a3b8; }
.search-box i { font-size: 18px; color: #94a3b8; }

.btn-search {
  display: flex; align-items: center; gap: 6px; background-color: #6d28d9; color: white; border: none;
  padding: 0 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  height: 42px; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.btn-search:hover { background-color: #5b21b6; transform: translateY(-1px); }
.btn-search i { font-size: 16px; }

/* === 테이블 카드 === */
.table-card {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); overflow: hidden; max-width: 100%;
}
.table-header { padding: 18px 24px; border-bottom: 1px solid #e2e8f0; background: #ffffff; }
.table-title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; }
.table-title i { font-size: 20px; color: #4f46e5; }

.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

/* 데이터 테이블 (단색 헤더) */
.data-table { width: 100%; border-collapse: collapse; min-width: 1000px; font-size: 13px; }
.data-table thead { background-color: #6d28d9; }
.data-table th { padding: 14px 16px; color: white; text-align: left; font-size: 12px; font-weight: 600; white-space: nowrap; }
.data-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
.data-row:hover { background-color: #f8fafc; }

/* 테이블 내부 유틸리티 */
.text-center { text-align: center; }
.text-gray { color: #64748b; font-size: 12px; }
.text-dark { color: #334155; }
.member-name { font-weight: 600; color: #1e293b; }
.font-bold { font-weight: 700; }
.text-blue-600 { color: #2563eb; }
.text-blue-icon { color: #4f46e5; }

.period-box { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #475569; font-family: 'Inter', monospace;}
.reason-cell { max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #475569; }

/* 상태 배지 (플랫 파스텔톤) */
.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.status-pending { background-color: #fef3c7; color: #b45309; }
.status-approved { background-color: #d1fae5; color: #065f46; }
.status-rejected { background-color: #fee2e2; color: #b91c1c; }
.status-badge i { font-size: 13px; }

/* 관리 버튼 */
.action-buttons { display: flex; gap: 6px; justify-content: center; }
.btn-approve, .btn-reject {
  display: flex; align-items: center; gap: 4px; padding: 6px 12px;
  border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-approve { background-color: #10b981; color: white; }
.btn-reject { background-color: #ef4444; color: white; }
.btn-approve:hover { background-color: #059669; transform: translateY(-1px); }
.btn-reject:hover { background-color: #dc2626; transform: translateY(-1px); }

/* Sticky 컬럼 */
.sticky-col { position: sticky; right: 0; border-left: 1px solid #e2e8f0; z-index: 5; background: white; }
.data-table thead .sticky-col { z-index: 15; background-color: #6d28d9; border-left: 1px solid #5b21b6; }
.data-row:hover .sticky-col { background-color: #f8fafc; }
.text-xs { font-size: 11px; }

/* 빈 상태 */
.empty-row { background-color: white; }
.empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: #cbd5e1; display: block;}
.empty-state p { font-size: 14px; font-weight: 500; color: #64748b; margin: 0; }

/* === 반응형 === */
@media (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .filter-group { flex: 1; min-width: calc(50% - 10px); }
  .search-group { width: 100%; flex: 1 1 100%; }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 14px; align-items: flex-start; }
  .header-actions { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .btn-refresh { flex: 1; justify-content: center; }

  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }

  .filter-row { flex-direction: column; align-items: stretch; gap: 12px; }
  .filter-group, .search-group { width: 100%; min-width: 100%; }

  .date-range { flex-direction: column; align-items: stretch; }
  .date-sep { display: none; }

  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
  .btn-search { flex-shrink: 0; }
}
</style>
