<script setup>
import { ref, computed, onMounted } from 'vue';

// 1. 상태 관리
const isLoading = ref(false);
const estimates = ref([]);

// 필터 상태 (추계 기준일)
const baseDate = ref('2026-12-31'); // 보통 연말 기준으로 많이 추계함
const selectedSite = ref('전체');
const selectedType = ref('전체');
const searchTerm = ref('');
const filterEligible = ref(false); // 1년 이상(지급대상)만 보기

// 드롭다운 옵션 (더미)
const siteOptions = ref([{ idx: 1, name: '쌍용플래티넘아파트' }, { idx: 2, name: 'LH 위례 6단지' }]);
const typeOptions = ref([{ itemCd: '01001001', itemNm: '미화' }, { itemCd: '01001002', itemNm: '경비' }]);

// 2. 더미 데이터 로드
const fetchList = () => {
  isLoading.value = true;
  setTimeout(() => {
    estimates.value = [
      { id: 1, siteName: '쌍용플래티넘아파트', type: '01001001', typeNm: '미화', empName: '김갑수', hireDate: '2020-03-01', tenure: '5년 9개월', avgWage: 2100000, estAmount: 12075000, isEligible: true, selected: false },
      { id: 2, siteName: '쌍용플래티넘아파트', type: '01001002', typeNm: '경비', empName: '이을용', hireDate: '2025-06-15', tenure: '6개월', avgWage: 2400000, estAmount: 0, isEligible: false, selected: false },
      { id: 3, siteName: 'LH 위례 6단지', type: '01001001', typeNm: '미화', empName: '박병호', hireDate: '2022-01-10', tenure: '3년 11개월', avgWage: 2150000, estAmount: 8420000, isEligible: true, selected: false },
    ];
    isLoading.value = false;
  }, 400);
};

// 3. 필터링 로직
const filteredList = computed(() => {
  return estimates.value.filter(item => {
    const siteMatch = selectedSite.value === '전체' || item.siteName === siteOptions.value.find(s=>s.idx===selectedSite.value)?.name;
    const searchMatch = item.empName.includes(searchTerm.value);
    const eligibleMatch = !filterEligible.value || item.isEligible;
    return siteMatch && searchMatch && eligibleMatch;
  });
});

// 4. 통계 계산
const statsInfo = computed(() => {
  const eligibleItems = filteredList.value.filter(item => item.isEligible);
  const totalAmount = eligibleItems.reduce((sum, item) => sum + item.estAmount, 0);
  return {
    totalCount: filteredList.value.length,
    eligibleCount: eligibleItems.length,
    totalAmount: totalAmount
  };
});

const formatCurrency = (amount) => (amount || 0).toLocaleString();

onMounted(() => {
  fetchList();
});
</script>

<template>
  <div class="estimate-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-piggy-bank-outline"></i> 퇴직금 추계 내역</h1>
        <p class="page-subtitle">단지별/직원별 예상 퇴직금을 산정하고 관리합니다.</p>
      </div>
      <div class="header-actions">
        <button class="btn-action btn-excel"><i class="mdi mdi-file-excel-outline"></i> 엑셀 다운로드</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-account-group-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 인원</span>
          <span class="stat-value">{{ statsInfo.totalCount }}<small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-check-decagram-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">지급 대상 (1년 이상)</span>
          <span class="stat-value">{{ statsInfo.eligibleCount }}<small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f59e0b; --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 예상 퇴직금액</span>
          <span class="stat-value text-orange">{{ formatCurrency(statsInfo.totalAmount) }}<small>원</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-calendar-search"></i> 추계 기준일</label>
          <input type="date" v-model="baseDate" class="filter-select" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 현장 선택</label>
          <select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>
        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input type="text" v-model="searchTerm" placeholder="직원명 검색..." class="search-input" />
          </div>
        </div>
      </div>
      <div class="filter-toggles-row">
        <label class="toggle-chip" :class="{ active: filterEligible }">
          <input type="checkbox" v-model="filterEligible">
          <i class="mdi mdi-filter-check-outline"></i> <span>지급 대상자(1년 이상)만 보기</span>
        </label>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i> <span>퇴직금 추계 목록 ({{ filteredList.length }}건)</span>
        </div>
      </div>
      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th class="text-center" style="width: 50px;">No.</th>
            <th>현장명</th>
            <th class="text-center">직책</th>
            <th class="text-center">이름</th>
            <th class="text-center">입사일</th>
            <th class="text-center">근속기간</th>
            <th class="text-right">3개월 평균임금</th>
            <th class="text-right">예상 퇴직금액</th>
            <th class="text-center" style="width: 100px;">상태</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(item, index) in filteredList" :key="item.id" class="data-row">
            <td class="text-center text-gray">{{ index + 1 }}</td>
            <td class="font-bold">{{ item.siteName }}</td>
            <td class="text-center"><span class="badge" :class="item.type==='01001001'?'badge-clean':'badge-guard'">{{ item.typeNm }}</span></td>
            <td class="text-center font-bold">{{ item.empName }}</td>
            <td class="text-center">{{ item.hireDate }}</td>
            <td class="text-center text-blue font-bold">{{ item.tenure }}</td>
            <td class="text-right">{{ formatCurrency(item.avgWage) }}</td>
            <td class="text-right font-bold" :class="{'text-orange': item.isEligible}">{{ formatCurrency(item.estAmount) }}</td>
            <td class="text-center">
                <span class="status-badge" :class="item.isEligible ? 'status-active' : 'status-inactive'">
                  {{ item.isEligible ? '지급대상' : '1년미만' }}
                </span>
            </td>
          </tr>
          <tr v-if="filteredList.length === 0" class="empty-row">
            <td colspan="9">
              <div class="empty-state"><i class="mdi mdi-text-box-search-outline"></i><p>조회된 추계 내역이 없습니다.</p></div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
<style scoped>
/* 헤더 및 유틸리티 */
.header-actions { display: flex; gap: 10px; }
.btn-excel {
  background-color: #10b981; color: white; border: none; padding: 10px 16px;
  border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;
  display: flex; align-items: center; gap: 6px; font-size: 13px;
}
.btn-excel:hover { background-color: #059669; transform: translateY(-1px); }

/* 배지 공통 */
.badge { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.badge-clean { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.badge-guard { background-color: var(--primary-soft); color: var(--primary); }

.status-badge { padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }

/* 테이블 헤더 커스텀 컬러 */
.bg-gray-50 { background-color: #f8fafc !important; }
.bg-red-light { background-color: rgba(239, 68, 68, 0.05) !important; color: var(--danger) !important; }
.bg-green-light { background-color: rgba(16, 185, 129, 0.05) !important; color: var(--success) !important; }

/* 텍스트 컬러 */
.text-orange { color: #f59e0b; }
.text-red { color: var(--danger); }
.text-green { color: var(--success); }
.text-blue { color: var(--primary); }

/* 스크롤 및 레이아웃 */
.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

/* 기존 common.css에 선언된 클래스들(table-card, stats-grid, filter-panel 등)은 자동으로 상속됩니다! */
</style>
