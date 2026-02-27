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

// 2. 정렬 관련 상태 추가
const sortKey = ref('id'); // 기본 정렬 키
const sortOrder = ref('asc'); // 'asc' 또는 'desc'

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
  // A. 필터링 로직
  let result = equipmentList.value.filter(eq => {
    const statusMatch = selectedStatus.value === '전체' || eq.status === selectedStatus.value;
    const siteMatch = selectedSite.value === '전체' || eq.site === selectedSite.value;
    const searchMatch = eq.name.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
        eq.model.toLowerCase().includes(searchTerm.value.toLowerCase());

    return statusMatch && siteMatch && searchMatch;
  });

  // B. 정렬 로직
  result.sort((a, b) => {
    const modifier = sortOrder.value === 'asc' ? 1 : -1;
    const valA = a[sortKey.value];
    const valB = b[sortKey.value];

    // 문자열 비교 (한글/영문 대응)
    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * modifier;
    }

    // 숫자 비교 (ID 등)
    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return result;
});

// 6. 이벤트 핸들러
const handleSearch = () => {
  console.log('장비 검색 시작:', searchTerm.value, selectedStatus.value, selectedSite.value);
};

const goToRegister = () => router.push('/equipment/register');
const goToDetail = (id) => router.push(`/equipment/${id}`);
</script>

<template>
  <div class="equipment-list-page">
    <div class="page-header">
      <h2 class="page-title">장비관리</h2>
    </div>

    <div class="search-panel">
      <div class="input-group">
        <label for="site-select" class="input-label">현장:</label>
        <select id="site-select" v-model="selectedSite" class="input-select">
          <option v-for="site in siteOptions" :key="site" :value="site">{{ site }}</option>
        </select>
      </div>

      <div class="input-group">
        <label for="status-select" class="input-label">상태:</label>
        <select id="status-select" v-model="selectedStatus" class="input-select">
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </div>

      <div class="input-group search-term-group">
        <input
            type="text"
            v-model="searchTerm"
            placeholder="장비명 또는 모델명으로 검색..."
            class="input-text"
            @keyup.enter="handleSearch"
        >
        <button @click="handleSearch" class="btn btn-primary">검색</button>
      </div>

      <div class="spacer"></div>
      <button @click="goToRegister" class="btn btn-success">장비 등록</button>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
        <tr>
          <th @click="toggleSort('id')" class="sortable">
            ID <span class="sort-icon">{{ sortKey === 'id' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('name')" class="sortable">
            장비명 <span class="sort-icon">{{ sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('model')" class="sortable">
            모델명 <span class="sort-icon">{{ sortKey === 'model' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('serial')" class="sortable">
            시리얼 <span class="sort-icon">{{ sortKey === 'serial' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('site')" class="sortable">
            현재 위치 <span class="sort-icon">{{ sortKey === 'site' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('borrower')" class="sortable">
            사용자 <span class="sort-icon">{{ sortKey === 'borrower' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('status')" class="sortable">
            상태 <span class="sort-icon">{{ sortKey === 'status' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('purchaseDate')" class="sortable">
            구입일 <span class="sort-icon">{{ sortKey === 'purchaseDate' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th class="text-center">관리</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="eq in filteredEquipment" :key="eq.id">
          <td>{{ eq.id }}</td>
          <td class="fw-bold">{{ eq.name }}</td>
          <td>{{ eq.model }}</td>
          <td class="text-mono">{{ eq.serial }}</td>
          <td>{{ eq.site }}</td>
          <td>{{ eq.borrower }}</td>
          <td>
              <span :class="['status-chip', `status-${eq.status.replace(/\s/g, '').toLowerCase()}`]">
                {{ eq.status }}
              </span>
          </td>
          <td>{{ eq.purchaseDate }}</td>
          <td class="text-center">
            <button @click="goToDetail(eq.id)" class="btn btn-sm btn-info">상세/이력</button>
          </td>
        </tr>
        <tr v-if="filteredEquipment.length === 0">
          <td colspan="9" class="text-center-none">검색된 장비가 없습니다.</td>
        </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.search-panel { display: flex; align-items: center; gap: 15px; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; }
.input-group { display: flex; align-items: center; }
.input-label { margin-right: 8px; font-size: 0.9rem; font-weight: 500; color: #4b5563; white-space: nowrap; }
.input-text, .input-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; }
.search-term-group { gap: 8px; }

/* 정렬 헤더 스타일 */
.sortable { cursor: pointer; user-select: none; transition: background-color 0.2s; }
.sortable:hover { background-color: #f3f4f6 !important; }
.sort-icon { display: inline-block; width: 15px; margin-left: 4px; font-size: 0.75rem; color: #3b82f6; }

.btn { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: background-color 0.2s; white-space: nowrap; }
.btn-primary { background-color: #3b82f6; color: white; }
.btn-success { background-color: #10b981; color: white; }
.btn-info { background-color: #60a5fa; color: white; padding: 6px 10px; font-weight: 500; }

.table-container {
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  overflow-x: auto;
}
.data-table { width: 100%; border-collapse: collapse; min-width: 1100px; }
.data-table th, .data-table td { padding: 12px 15px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 0.9rem; }
.data-table th { background-color: #f9fafb; color: #1f2937; font-weight: 600; }
.data-table tbody tr:hover { background-color: #f3f4f6; }

.text-center { text-align: center; }
.text-center-none { text-align: center; padding: 30px !important; color: #9ca3af; }
.text-mono { font-family: monospace; color: #374151; }
.fw-bold { font-weight: 600; }

/* 상태 칩 */
.status-chip { padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
.status-보유중 { background-color: #e0f2fe; color: #075985; }
.status-대여중 { background-color: #fff7ed; color: #c2410c; border: 1px solid #f97316; }
.status-폐기 { background-color: #f3f4f6; color: #6b7280; }
</style>
