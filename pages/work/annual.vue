<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
const cIdx = 1;
// 1. 상태 및 필터
const startDate = ref('');
const endDate = ref('');
const selectedStatus = ref('전체');
const selectedStaff = ref('');

// 2. 더미 데이터 (연차 신청 내역)
const requests = ref([
  { idx: 1, reqDate: '2026-02-01', staff: '김철수', site: 'LH 위례 6단지', type: '연차', period: '2026-02-10 (1일)', days: 1.0, reason: '개인 사정', status: '승인 대기' },
  { idx: 2, reqDate: '2026-02-01', staff: '이영희', site: 'LH 위례 6단지', type: '반차', period: '2026-02-05 (오전)', days: 0.5, reason: '병원 진료', status: '승인 완료' },
  { idx: 3, reqDate: '2026-01-28', staff: '박민준', site: '강서 대명 강동', type: '경조', period: '2026-02-12 ~ 02-14', days: 3.0, reason: '부친상', status: '승인 완료' },
  { idx: 4, reqDate: '2026-01-25', staff: '최지우', site: 'LH 율곡 8단지', type: '연차', period: '2026-02-20 (1일)', days: 1.0, reason: '여행', status: '반려' },
]);

// 3. 필터링 로직
const filteredRequests = computed(() => {
  return requests.value.filter(req => {
    const statusMatch = selectedStatus.value === '전체' || req.status == selectedStatus.value;
    const staffMatch = req.staff.includes(selectedStaff.value);
    // 날짜 필터는 필요 시 추가
    return statusMatch && staffMatch;
  });
});

// 4. 승인/반려 처리 로직
const updateStatus = (idx, newStatus) => {
  const confirmMsg = newStatus == '1' ? '승인하시겠습니까?' : '반려하시겠습니까?';
  if (!confirm(confirmMsg)) return;

  const target = requests.value.find(r => r.idx === idx);
  if (target) {
    target.status = newStatus;
    const payload = {
      idx: idx,
      status: newStatus
    }

    console.log(payload)
    // TODO: 실제 API 호출하여 DB 업데이트 및 연차 차감 로직 수행
    axios.post(`/api/v1/member/off/status`, payload)
        .then(res => {
          console.log(res.data.data)
        })
  }
};

const getStatusClass = (status) => {
  switch (status) {
    case 0: return 'status-pending';
    case 1: return 'status-approved';
    case 2: return 'status-rejected';
    default: return '';
  }
};

const handleSearch = () => {
  getMemberOff()
}

const getMemberOff = () => {
  console.log('연차 신청 현황')
  let params = {
    startDt: startDate.value,
    endDt: endDate.value,
  }

  axios.get(`/api/v1/member/off/${cIdx}`, {params})
      .then((res) => {
        console.log(res.data.data, 'getMemberOff')
        requests.value = res.data.data
      })
}

const setDefaultDate = () => {
  const today = new Date();
  // 오늘
  const end = today.toISOString().slice(0, 10);
  // 이번 달 1일
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

  startDate.value = start;
  endDate.value = end;

};

onMounted(() => {
  setDefaultDate(); //날짜 셋팅
  getMemberOff();
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">연차 신청 관리</h2>
    </div>

    <div class="search-panel">
      <div class="input-group">
        <label class="input-label">신청기간:</label>
        <input type="date" v-model="startDate" class="input-text"> ~
        <input type="date" v-model="endDate" class="input-text">
      </div>
      <div class="input-group">
        <label class="input-label">상태:</label>
        <select v-model="selectedStatus" class="input-select">
          <option value="전체">전체</option>
          <option value="0">승인 대기</option>
          <option value="1">승인 완료</option>
          <option value="2">반려</option>
        </select>
      </div>
      <div class="input-group">
        <input type="text" v-model="selectedStaff" placeholder="직원명 검색" class="input-text">
        <button class="btn btn-primary" @click="handleSearch">조회</button>
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <colgroup>
          <col width="10%">
          <col width="25%">
          <col width="10%">
          <col width="15%">
          <col width="10%">
          <col width="10%">
          <col width="10%">
          <col width="10%">
        </colgroup>
        <thead>
        <tr>
          <th>신청일</th>
          <th>현장</th>
          <th>직원명</th>
          <!--th>구분</th-->
          <th>사용기간</th>
          <th>사용일수</th>
          <th>사유</th>
          <th>상태</th>
          <th class="text-center">관리</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="req in filteredRequests" :key="req.idx">
          <td>{{ req.reqDate }}</td>
          <td>{{ req.site }}</td>
          <td class="font-bold">{{ req.staff }}</td>
          <!--td>{{ req.type }}</td-->
          <td>{{ req.startDt }} ~ {{req.endDt}}</td>
          <td class="text-center font-bold">{{ req.days }}일</td>
          <td>{{ req.reason }}</td>
          <td><span :class="['status-chip', getStatusClass(req.status)]">{{ req.status == '0' ? '승인대기' : req.status == '1' ? '승인' : '반려' }}</span></td>
          <td class="text-center">
            <template v-if="req.status == 0">
              <button @click="updateStatus(req.idx, 1)" class="btn btn-sm btn-success mr-1">승인</button>
              <button @click="updateStatus(req.idx, 2)" class="btn btn-sm btn-danger">반려</button>
            </template>
            <span v-else class="text-gray-400">-</span>
          </td>
        </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 20px; }
.page-title { font-size: 1.5rem; font-weight: 700; color: #1f2937; }
.search-panel { display: flex; gap: 15px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; align-items: center;}
.input-group { display: flex; align-items: center; gap: 8px; }
.input-label { font-size: 0.9rem; font-weight: 600; color: #4b5563; }
.input-text, .input-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; }
.btn { padding: 8px 15px; border-radius: 4px; font-weight: 600; cursor: pointer; border: none; }
.btn-primary { background: #3b82f6; color: white; }
.btn-success { background: #10b981; color: white; }
.btn-danger { background: #ef4444; color: white; }
.btn-sm { padding: 5px 10px; font-size: 0.8rem; }
.mr-1 { margin-right: 5px; }

.table-container { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; min-width: 900px; }
.data-table th, .data-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 0.9rem; }
.data-table th { background: #f9fafb; font-weight: 600; color: #374151; }
.text-center { text-align: center; }
.font-bold { font-weight: 700; }

.status-chip { padding: 4px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-pending { background: #fff7ed; color: #c2410c; }
.status-approved { background: #d1fae5; color: #065f46; }
.status-rejected { background: #fee2e2; color: #991b1b; }
</style>
