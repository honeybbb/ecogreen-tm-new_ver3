<script setup>
import { ref, computed, onMounted } from 'vue';
// import axios from "axios"; // API 연동 시 주석 해제

// 1. 상태 및 검색 조건
const searchTerm = ref('');
const selectedStatus = ref('전체');
const statusOptions = ref(['전체', '승인 대기', '지급 준비', '지급 완료', '반려']);
const startDate = ref('');
const endDate = ref('');

// 2. 정렬 관련 상태
const sortKey = ref('date');
const sortOrder = ref('desc');

// 3. 피복 신청 더미 데이터
const requests = ref([
  { idx: 1, date: '2026-02-01', staffName: '김철수', staffId: '202301', item: '안전화', size: '270mm', reason: '기존 안전화 파손', status: '승인 대기' },
  { idx: 2, date: '2026-02-01', staffName: '이영희', staffId: '202302', item: '근무복 조끼', size: '95(M)', reason: '신규 입사', status: '지급 준비' },
  { idx: 3, date: '2026-01-28', staffName: '박민준', staffId: '202305', item: '동계 점퍼', size: '105(XL)', reason: '정기 지급', status: '지급 완료' },
  { idx: 4, date: '2026-01-25', staffName: '최지우', staffId: '202401', item: '작업용 장갑', size: 'L', reason: '분실', status: '반려' },
]);

// 4. 정렬 토글 함수
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc'; // 날짜는 최신순(desc)이 보통이지만 로직 통일을 위해 asc 시작
  }
};

// 5. 필터링 및 정렬
const filteredRequests = computed(() => {
  let result = requests.value.filter(req => {
    // 상태 필터
    const statusMatch = selectedStatus.value === '전체' || req.status === selectedStatus.value;
    // 검색어 (이름 또는 품목)
    const searchMatch = req.staffName.includes(searchTerm.value) || req.item.includes(searchTerm.value);
    // 날짜 필터 (입력된 경우만)
    let dateMatch = true;
    if (startDate.value) dateMatch = dateMatch && req.date >= startDate.value;
    if (endDate.value) dateMatch = dateMatch && req.date <= endDate.value;

    return statusMatch && searchMatch && dateMatch;
  });

  // 정렬
  result.sort((a, b) => {
    const modifier = sortOrder.value === 'asc' ? 1 : -1;
    const valA = a[sortKey.value];
    const valB = b[sortKey.value];
    if (typeof valA === 'string') return valA.localeCompare(valB) * modifier;
    return (valA - valB) * modifier;
  });

  return result;
});

// 6. 이벤트 핸들러
const handleSearch = () => {
  console.log('검색 실행:', searchTerm.value);
};

const updateStatus = (idx, newStatus) => {
  if(!confirm(`${newStatus} 상태로 변경하시겠습니까?`)) return;
  // API 호출 로직 위치
  const target = requests.value.find(r => r.idx === idx);
  if(target) target.status = newStatus;
};

onMounted(() => {
  // getRequests(); // API 호출
});
</script>

<template>
  <div class="site-list-page">
    <div class="page-header">
      <h2 class="page-title">피복 신청 관리</h2>
    </div>

    <div class="search-panel">
      <div class="input-group">
        <label class="input-label">신청일:</label>
        <input type="date" v-model="startDate" class="input-text">
        <span style="margin: 0 5px;">~</span>
        <input type="date" v-model="endDate" class="input-text">
      </div>

      <div class="input-group">
        <label class="input-label">상태:</label>
        <select v-model="selectedStatus" class="input-select">
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </div>

      <div class="input-group search-term-group">
        <input
            type="text"
            v-model="searchTerm"
            placeholder="직원명/품목 검색..."
            class="input-text"
            @keyup.enter="handleSearch"
        >
        <button @click="handleSearch" class="btn btn-primary">검색</button>
      </div>

      <div class="spacer"></div>
      <button class="btn btn-success">+ 강제 지급 등록</button>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
        <tr>
          <th @click="toggleSort('date')" class="sortable">
            신청일 <span class="sort-icon">{{ sortKey === 'date' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('staffName')" class="sortable">
            직원명 <span class="sort-icon">{{ sortKey === 'staffName' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('item')" class="sortable">
            품목명 <span class="sort-icon">{{ sortKey === 'item' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th>사이즈</th>
          <th>신청사유</th>
          <th @click="toggleSort('status')" class="sortable">
            상태 <span class="sort-icon">{{ sortKey === 'status' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th class="text-center">관리</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="req in filteredRequests" :key="req.idx">
          <td>{{ req.date }}</td>
          <td>{{ req.staffName }} <span style="font-size:0.8em; color:#888;">({{ req.staffId }})</span></td>
          <td>{{ req.item }}</td>
          <td style="font-weight: bold; color: #2563eb;">{{ req.size }}</td>
          <td>{{ req.reason }}</td>
          <td>
            <span :class="['status-chip', `status-${req.status.replace(/\s/g, '')}`]">
              {{ req.status }}
            </span>
          </td>
          <td class="text-center">
            <template v-if="req.status === '승인 대기'">
              <button @click="updateStatus(req.idx, '지급 준비')" class="btn btn-sm btn-success" style="margin-right: 5px;">승인</button>
              <button @click="updateStatus(req.idx, '반려')" class="btn btn-sm btn-danger">반려</button>
            </template>
            <template v-else-if="req.status === '지급 준비'">
              <button @click="updateStatus(req.idx, '지급 완료')" class="btn btn-sm btn-info">지급완료</button>
            </template>
            <span v-else style="color: #9ca3af;">-</span>
          </td>
        </tr>
        <tr v-if="filteredRequests.length === 0">
          <td colspan="7" class="text-center-none">내역이 없습니다.</td>
        </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 20px; }
.page-title { font-size: 1.5rem; font-weight: 700; color: #1f2937; }

.search-panel { display: flex; align-items: center; gap: 15px; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; flex-wrap: wrap; }
.input-group { display: flex; align-items: center; }
.input-label { margin-right: 8px; font-size: 0.9rem; font-weight: 500; color: #4b5563; white-space: nowrap; }
.input-text, .input-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; }
.search-term-group { gap: 8px; }
.spacer { flex-grow: 1; }

.sortable { cursor: pointer; user-select: none; transition: background-color 0.2s; }
.sortable:hover { background-color: #f3f4f6 !important; }
.sort-icon { display: inline-block; width: 15px; margin-left: 5px; font-size: 0.7rem; color: #3b82f6; }

.btn { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: background-color 0.2s; white-space: nowrap; }
.btn-primary { background-color: #3b82f6; color: white; }
.btn-success { background-color: #10b981; color: white; }
.btn-info { background-color: #60a5fa; color: white; padding: 6px 10px; font-weight: 500; }
.btn-danger { background-color: #ef4444; color: white; padding: 6px 10px; font-weight: 500; }
.btn-sm { padding: 5px 10px; font-size: 0.85rem; }

.table-container { background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; min-width: 900px; }
.data-table th, .data-table td { padding: 12px 15px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 0.9rem; }
.data-table th { background-color: #f9fafb; color: #1f2937; font-weight: 600; text-transform: uppercase; }
.data-table tbody tr:hover { background-color: #f3f4f6; }
.text-center { text-align: center; }
.text-center-none { text-align: center; padding: 30px !important; color: #9ca3af; }

/* 상태 칩 색상 커스텀 */
.status-chip { padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
.status-승인대기 { background-color: #fef3c7; color: #b45309; }
.status-지급준비 { background-color: #dbeafe; color: #1e40af; }
.status-지급완료 { background-color: #d1fae5; color: #065f46; }
.status-반려 { background-color: #fee2e2; color: #991b1b; }
</style>
