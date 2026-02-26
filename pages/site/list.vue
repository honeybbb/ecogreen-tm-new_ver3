<script setup>
import {ref, computed, onMounted} from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";
const router = useRouter();

// 1. 상태 및 검색 조건
const searchTerm = ref('');
const selectedStatus = ref('전체');
const statusOptions = ref(['전체', '운영 중', '준비 중', '계약 종료']);

// 2. 정렬 관련 상태 추가
const sortKey = ref('idx'); // 기본 정렬 기준
const sortOrder = ref('asc'); // 'asc' 또는 'desc'

// 3. 현장 목록 더미 데이터
const sites = ref([
  { idx: 101, name: 'LH 위례 6단지', address: '경기 성남시 수정구 위례광장로 11', manager: '김철수', contract: '2023-01-01 ~ 2024-12-31', status: '운영 중', type: '아파트' },
  { idx: 102, name: '강서 대명 강동', address: '서울 강서구 양천로 1111', manager: '이영희', contract: '2024-05-01 ~ 2026-04-30', status: '운영 중', type: '주상복합' },
  { idx: 103, name: 'LH 율곡 제일 8단지', address: '경기 파주시 교하로 222', manager: '박민수', contract: '2025-01-01 ~ 2026-12-31', status: '준비 중', type: '아파트' },
  { idx: 104, name: '폐지된 현장 A', address: '데이터 없음', manager: '-', contract: '2021-01-01 ~ 2022-12-31', status: '계약 종료', type: '오피스텔' },
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

// 5. 필터링 및 정렬된 현장 목록 계산
const filteredSites = computed(() => {
  // A. 필터링 로직
  let result = sites.value.filter(site => {
    const statusMatch = selectedStatus.value === '전체' || site.status === selectedStatus.value;
    const searchMatch = site.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    return statusMatch && searchMatch;
  });

  // B. 정렬 로직
  result.sort((a, b) => {
    const modifier = sortOrder.value === 'asc' ? 1 : -1;
    const valA = a[sortKey.value];
    const valB = b[sortKey.value];

    // 문자열 비교 (한글 포함)
    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * modifier;
    }

    // 숫자 및 기타 비교
    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return result;
});

// 6. 이벤트 핸들러
const handleSearch = () => {
  console.log('현장 검색 시작:', searchTerm.value, selectedStatus.value);
};

const getSites = () => {
  const cIdx = 1;
  axios.get(`/api/v1/site/list/${cIdx}`)
      .then(res => {
        console.log(res.data.data, 'getSites')
        sites.value = res.data.data
      })
}

onMounted(() => {
  getSites();
});
const goToRegister = () => router.push('/site/register');
const goToDetail = (id) => router.push(`/site/${id}`);
</script>

<template>
  <div class="site-list-page">
    <div class="page-header">
      <h2 class="page-title">현장관리</h2>
    </div>

    <div class="search-panel">
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
            placeholder="현장명으로 검색..."
            class="input-text"
            @keyup.enter="handleSearch"
        >
        <button @click="handleSearch" class="btn btn-primary">검색</button>
      </div>

      <div class="spacer"></div>
      <button @click="goToRegister" class="btn btn-success">현장 등록</button>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
        <tr>
          <th @click="toggleSort('idx')" class="sortable">
            ID <span class="sort-icon">{{ sortKey === 'idx' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('name')" class="sortable">
            현장명 <span class="sort-icon">{{ sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <!--th @click="toggleSort('type')" class="sortable">
            구분 <span class="sort-icon">{{ sortKey === 'type' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th-->
          <th @click="toggleSort('address')" class="sortable">
            주소 <span class="sort-icon">{{ sortKey === 'address' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('contract')" class="sortable">
            계약 기간 <span class="sort-icon">{{ sortKey === 'contract' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('manager')" class="sortable">
            담당자 <span class="sort-icon">{{ sortKey === 'manager' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th @click="toggleSort('status')" class="sortable">
            상태 <span class="sort-icon">{{ sortKey === 'status' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}</span>
          </th>
          <th class="text-center">관리</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="site in filteredSites" :key="site.idx">
          <td>{{ site.idx }}</td>
          <td>{{ site.name }}</td>
          <!--td>{{ site.type }}</td-->
          <td>{{ site.address }}</td>
          <td>{{ site.contract }}</td>
          <td>{{ site.manager }}</td>
          <td>
              <span :class="['status-chip', {'status-active' : site.status == '운영 중', 'status-inactive':site.status == '계약 종료'}]">
                {{ site.status }}
              </span>
          </td>
          <td class="text-center">
            <button @click="goToDetail(site.idx)" class="btn btn-sm btn-info">상세</button>
          </td>
        </tr>
        <tr v-if="filteredSites.length === 0">
          <td colspan="8" class="text-center-none">검색된 현장이 없습니다.</td>
        </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
