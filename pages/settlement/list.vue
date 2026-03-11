<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue';
import axios from 'axios';
// import { useRouter } from 'nuxt/app';
import SettlementModal from '@/components/SettlementModal.vue';

const {typeOptions, siteOptions, fetchTypeOptions, fetchSiteOptions} = useApi();
// const typeOptions = ref(['청소', '경비', '소독/방역']);}
// 옵션 데이터 (JSON의 sIdx인 16, 18에 맞춰서 세팅)
/*
const siteOptions = ref([
  { idx: 16, name: '쌍용플래티넘고산' },
  { idx: 18, name: '위례롯데캐슬' },
  { idx: 2, name: '답십리래미안' }
]);

 */
// 1. 상태 및 검색 조건
const isLoading = ref(false);
const error = ref(null);
const settlements = ref([]);

// 현재 년-월 (DB JSON에 맞춰 테스트용으로 2026-01로 세팅)
const selectedYear = reactive({
  month: '2026-01',
});
const searchTerm = ref('');
const selectedSite = ref('전체');
const selectedType = ref('전체');

const filterCompleted = ref(false);
const filterPending = ref(false);

// 2. 정렬 관련 상태
const sortKey = ref('id');
const sortOrder = ref('desc');

const isModalOpen = ref(false);
const selectedId = ref(null);
const initialDataForModal = ref(null);

// 백엔드에서 내려주는 실제 JSON 응답 예시
const mockApiResponse = {
  "result": true,
  "data": [
    {
      "idx": 5, "sIdx": 16, "cIdx": 1, "year": 2026, "month": 1,
      "docType": "SERVICE", "docNo": "에코그린 2026-01-29호", "type": "경비",
      "subTotal": 16800000, "vatAmount": 1680000, "grandTotal": 18480000,
      "regDt": "2026-03-06 12:01:59", "status": 1
    },
    {
      "idx": 7, "sIdx": 18, "cIdx": 1, "year": 2026, "month": 1,
      "docType": "SERVICE", "docNo": "에코그린 2026-01-29호", "type": "미화",
      "subTotal": 38586480, "vatAmount": 3858648, "grandTotal": 42445128,
      "regDt": "2026-03-06 12:01:59", "status": 0
    }
  ]
};

// 3. API 데이터 호출 및 매핑 로직 (핵심 변경점)
const fetchList = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    const params = {
      year: selectedYear.month.split('-')[0],
      month: selectedYear.month.split('-')[1],
    }
    // 실제 연동 시 아래 로직 사용
    const res = await axios.get('/api/v1/settle/site/list', { params });
    const rawData = res.data.data || [];
    console.log(rawData, 'rawData')

    setTimeout(() => {
      //const rawData = mockApiResponse.data;

      // DB 데이터를 프론트엔드 UI 테이블용 데이터로 변환(Mapping)
      settlements.value = rawData.map(item => {
        // 1) 현장명 매핑
        const site = siteOptions.value.find(s => s.idx === item.sIdx);
        const siteName = site ? site.name : `알수없는현장(${item.sIdx})`;

        // 2) 년월 포맷 매핑 (예: 2026, 1 -> 2026-01)
        const formattedMonth = String(item.month).padStart(2, '0');
        const targetMonth = `${item.year}-${formattedMonth}`;

        // 3) 상태값 매핑 (DB의 int값을 문자열로 변환)
        let statusText = '진행중';
        if (item.status === 1) statusText = '결재완료';
        else if (item.status === 2) statusText = '반려';

        return {
          ...item,
          id: item.idx,                       // No. 컬럼용 (idx)
          siteName: siteName,                 // 찾아낸 현장명
          target_month: targetMonth,          // YYYY-MM 형태
          total_amount: item.grandTotal,      // 총 청구금액
          statusText: statusText,             // 문자열 상태 (결재완료 등)
          regDtShort: item.regDt.split(' ')[0] // 날짜 시간 중 날짜만 표시 (YYYY-MM-DD)
        };
      });
      isLoading.value = false;
    }, 500);
  } catch (e) {
    console.error('리스트 조회 에러:', e);
    error.value = '데이터를 불러오는 중 오류가 발생했습니다.';
    isLoading.value = false;
  }
};

// 4. 정렬 토글 핸들러
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

// 5. 필터링 + 정렬된 결과 계산 (필터 조건 변경됨)
const filteredSettlements = computed(() => {
  let result = settlements.value.filter(item => {
    const monthMatch = item.target_month === selectedYear.month;
    const siteMatch = selectedSite.value === '전체' || item.sIdx === selectedSite.value;
    const searchMatch = item.siteName.toLowerCase().includes(searchTerm.value.toLowerCase());

    // JSON 데이터는 '미화' 로 오고 UI는 '청소'일 수 있으므로 유연하게 처리
    const typeMatch = selectedType.value === '전체' || item.type === selectedType.value;

    let statusMatch = true;
    if (filterCompleted.value) statusMatch = item.statusText === '결재완료';
    if (filterPending.value) statusMatch = item.statusText !== '결재완료';

    return monthMatch && siteMatch && searchMatch && typeMatch && statusMatch;
  });

  result.sort((a, b) => {
    let modifier = sortOrder.value === 'asc' ? 1 : -1;
    let valA = a[sortKey.value];
    let valB = b[sortKey.value];

    if (typeof valA === 'string' && typeof valB === 'string') {
      return valA.localeCompare(valB) * modifier;
    }
    if (valA < valB) return -1 * modifier;
    if (valA > valB) return  1 * modifier;
    return 0;
  });

  return result;
});

// 6. 통계 정보 계산
const statsInfo = computed(() => {
  const currentMonthData = filteredSettlements.value;
  const totalCount = currentMonthData.length;
  const totalAmount = currentMonthData.reduce((sum, item) => sum + (item.total_amount || 0), 0);
  const completedCount = currentMonthData.filter(item => item.status == 1).length;
  const pendingCount = totalCount - completedCount;

  return { totalCount, totalAmount, completedCount, pendingCount };
});

const formatCurrency = (amount) => {
  return (amount || 0).toLocaleString() + ' 원';
};

const handleSearch = () => fetchList();
const refreshData = () => fetchList();

const openCreateModal = () => {
  selectedId.value = null;
  initialDataForModal.value = { /* 신규 작성 초기값 */ };
  isModalOpen.value = true;
};

const openEditModal = (id, docType = 'statement') => {
  const item = settlements.value.find(s => s.id === id);
  selectedId.value = id;
  initialDataForModal.value = { ...item, defaultTab: docType };
  isModalOpen.value = true;
};

onMounted(() => {
  fetchTypeOptions();
  fetchSiteOptions();
  fetchList();
});

watch(() => selectedYear.month, fetchList);
</script>

<template>
  <div class="settlement-list-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calculator-variant-outline"></i>
          정산서 및 내역서 관리
        </h1>
        <p class="page-subtitle">월별 단지 정산 및 청구 내역을 관리합니다</p>
      </div>
      <div class="header-actions">
        <button @click="refreshData" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
        <button @click="openCreateModal" class="btn-add">
          <i class="mdi mdi-file-document-plus-outline"></i>
          <span>새 정산서 작성</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #4f46e5; --card-bg: #eef2ff;">
        <div class="stat-icon"><i class="mdi mdi-file-document-multiple-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">당월 총 청구건수</span>
          <span class="stat-value">{{ statsInfo.totalCount }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #10b981; --card-bg: #ecfdf5;">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">당월 총 청구금액</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.totalAmount) }}</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #0ea5e9; --card-bg: #e0f2fe;">
        <div class="stat-icon"><i class="mdi mdi-check-decagram-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">결재 완료</span>
          <span class="stat-value">{{ statsInfo.completedCount }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f59e0b; --card-bg: #fffbeb;">
        <div class="stat-icon"><i class="mdi mdi-clock-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">진행 중/반려</span>
          <span class="stat-value">{{ statsInfo.pendingCount }}건</span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-calendar-month-outline"></i> 청구 연월</label>
          <input type="month" v-model="selectedYear.month" class="filter-select" />
        </div>

        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 현장 선택</label>
          <select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
              {{ site.name }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-format-list-bulleted-type"></i> 구분</label>
          <select v-model="selectedType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">
              {{ opt.itemNm }}
            </option>
          </select>
        </div>

        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input type="text" v-model="searchTerm" placeholder="현장명으로 검색..." class="search-input" @keyup.enter="handleSearch" />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear"><i class="mdi mdi-close"></i></button>
          </div>
        </div>
      </div>

      <div class="filter-toggles-row">
        <span class="toggles-label"><i class="mdi mdi-filter-variant"></i> 상태 필터:</span>
        <div class="filter-toggles">
          <label class="toggle-chip" :class="{ active: filterCompleted }">
            <input type="checkbox" v-model="filterCompleted" @change="filterPending = false">
            <i class="mdi mdi-check-circle-outline"></i>
            <span>결재완료만 보기</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterPending }">
            <input type="checkbox" v-model="filterPending" @change="filterCompleted = false">
            <i class="mdi mdi-clock-alert-outline"></i>
            <span>진행중/반려만 보기</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>정산 내역을 불러오는 중...</p>
    </div>

    <div class="table-card" v-else>
      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th @click="toggleSort('id')" class="sortable text-center" style="width: 80px;">
              <div class="th-content justify-center">
                <span>No.</span>
                <i v-if="sortKey === 'id'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('siteName')" class="sortable">
              <div class="th-content">
                <span>현장명</span>
                <i v-if="sortKey === 'siteName'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('type')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>구분</span>
                <i v-if="sortKey === 'type'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('target_month')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>청구연월</span>
                <i v-if="sortKey === 'target_month'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('total_amount')" class="sortable text-right">
              <div class="th-content justify-end">
                <span>청구금액</span>
                <i v-if="sortKey === 'total_amount'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('statusText')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>상태</span>
                <i v-if="sortKey === 'statusText'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('regDtShort')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>작성일</span>
                <i v-if="sortKey === 'regDtShort'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center sticky-col" style="width: 220px;">
              <div class="th-content justify-center">
                <span>관리</span>
              </div>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="item in filteredSettlements" :key="item.id" class="data-row">
            <td class="text-center text-gray">{{ item.id }}</td>
            <td class="site-name">{{ item.siteName }}</td>
            <td class="text-center">
              <span :class="[
                  'badge', item.type === '01001002' ? 'badge-clean' :
                  item.type === '01001001' ? 'badge-guard' : 'badge-etc']">
                {{ item.typeNm }}
              </span>
            </td>
            <td class="text-center font-medium">{{ item.target_month }}</td>
            <td class="text-right amount-text">{{ formatCurrency(item.total_amount) }}</td>
            <td class="text-center">
               <span :class="['status-badge',
                 item.statusText === '결재완료' ? 'status-active' :
                 item.statusText === '반려' ? 'status-inactive' : 'status-pending']">
                  <i :class="['mdi',
                    item.statusText === '결재완료' ? 'mdi-check-circle' :
                    item.statusText === '반려' ? 'mdi-close-circle' : 'mdi-dots-horizontal-circle']"></i>
                  {{ item.statusText }}
                </span>
            </td>
            <td class="text-center text-gray">{{ item.regDtShort }}</td>
            <td class="text-center sticky-col">
              <div class="action-buttons">
                <button @click="openEditModal(item.id, 'statement')" class="btn-action btn-statement">
                  <i class="mdi mdi-file-document-outline"></i> 정산서
                </button>
                <button @click="openEditModal(item.id, 'details')" class="btn-action btn-details">
                  <i class="mdi mdi-format-list-bulleted"></i> 내역서
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filteredSettlements.length === 0" class="empty-row">
            <td colspan="8">
              <div class="empty-state">
                <i class="mdi mdi-text-box-search-outline"></i>
                <p>조건에 맞는 정산 내역이 없습니다.</p>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <SettlementModal
        v-if="isModalOpen"
        :is-open="isModalOpen"
        :settlement-id="selectedId"
        :initial-data="initialDataForModal"
        @close="isModalOpen = false"
        @save="fetchList"
    />

  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 설정 === */
.settlement-list-page {
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #334155;
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

.btn-refresh, .btn-add {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}

.btn-refresh { background: white; border: 1px solid #e2e8f0; color: #475569; }
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }

.btn-add { background-color: #6d28d9; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.btn-add:hover { background-color: #5b21b6; transform: translateY(-1px); }

.btn-refresh i, .btn-add i { font-size: 18px; }

/* === 통계 카드 (플랫 디자인) === */
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px; margin-bottom: 24px;
}

.stat-card {
  background: white; border-radius: 12px; padding: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  display: flex; align-items: center; gap: 16px;
  transition: all 0.2s; position: relative; overflow: hidden;
}

.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
  background: var(--card-color);
}
.stat-card:hover { transform: translateY(-2px); border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }

.stat-icon {
  width: 52px; height: 52px; border-radius: 12px;
  background-color: var(--card-bg, #f1f5f9);
  display: flex; align-items: center; justify-content: center; position: relative; flex-shrink: 0;
}
.stat-icon i { font-size: 24px; color: var(--card-color); position: absolute; }

.stat-content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.stat-label { font-size: 13px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 22px; font-weight: 700; color: #1e293b; letter-spacing: -0.5px;}

/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.filter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 160px; flex: 1;}

.filter-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569; }
.filter-label i { font-size: 16px; color: #4f46e5; }

.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; cursor: pointer; transition: all 0.2s;
  height: 42px; box-sizing: border-box; font-family: inherit;
}
.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

/* 검색 그룹 */
.search-group { display: flex; gap: 8px; flex: 2; min-width: 280px; align-items: flex-end; }
.search-box {
  display: flex; align-items: center; gap: 10px; padding: 0 16px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; flex: 1; height: 42px; transition: all 0.2s;
  box-sizing: border-box;
}
.search-box:focus-within { background: white; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.search-box i { font-size: 20px; color: #94a3b8; }
.search-input { flex: 1; border: none; background: transparent; font-size: 13px; color: #334155; outline: none; }
.search-input::placeholder { color: #94a3b8; }
.search-clear { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 4px; }
.search-clear:hover { background: #e2e8f0; color: #64748b; }

/* 필터 토글 */
.filter-toggles-row {
  display: flex; align-items: center; gap: 12px; padding-top: 16px; border-top: 1px solid #f1f5f9; margin-top: 16px;
}
.toggles-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #64748b; }
.filter-toggles { display: flex; gap: 10px; flex-wrap: wrap; }

.toggle-chip {
  display: flex; align-items: center; gap: 6px; padding: 6px 14px;
  background: white; border: 1px solid #cbd5e1; border-radius: 20px; cursor: pointer;
  font-size: 12px; font-weight: 500; color: #475569; transition: all 0.2s;
}
.toggle-chip input[type="checkbox"] { display: none; }
.toggle-chip:hover { background: #f8fafc; border-color: #94a3b8; }
.toggle-chip.active { background: #eef2ff; border-color: #4f46e5; color: #4f46e5; font-weight: 600;}

/* === 로딩 & 에러 상태 === */
.loading-state, .empty-state { text-align: center; padding: 60px 20px; color: #64748b; background: white; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px;}
.spinner {
  width: 40px; height: 40px; border: 3px solid #f1f5f9; border-top-color: #4f46e5;
  border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state i { font-size: 48px; color: #cbd5e1; margin-bottom: 12px; display: block;}
.empty-state p { font-size: 15px; font-weight: 600; color: #475569; margin: 0 0 4px; }
.empty-row { background-color: white !important; }

/* === 테이블 영역 === */
.table-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); overflow: hidden; }

.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }

.data-table { width: 100%; min-width: 1000px; border-collapse: collapse; font-size: 13px; }
.data-table thead { background-color: #6d28d9; }
.data-table th { padding: 12px 16px; font-size: 12px; font-weight: 600; color: white; white-space: nowrap; border-right: 1px solid rgba(255,255,255,0.1);}
.data-table th:last-child { border-right: none; }
.data-table th.sortable { cursor: pointer; user-select: none; transition: background 0.2s; }
.data-table th.sortable:hover { background-color: #5b21b6; }

.th-content { display: flex; align-items: center; gap: 6px; }
.justify-center { justify-content: center; }
.justify-end { justify-content: flex-end; }

.data-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; word-break: keep-all;}
.data-row:hover { background-color: #f8fafc; }

/* 텍스트 정렬 & 유틸리티 */
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-gray { color: #64748b; font-size: 12px; }
.font-medium { font-weight: 500; font-family: 'Inter', monospace; }
.site-name { font-weight: 600; color: #1e293b; }
.amount-text { font-weight: 700; color: #1e293b; font-size: 14px; font-family: 'Inter', monospace;}

/* 배지 스타일 (플랫) */
.badge { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; word-break: keep-all; }
.badge-clean { background-color: #ecfdf5; color: #059669; }
.badge-guard { background-color: #eff6ff; color: #2563eb; }
.badge-etc { background-color: #fef2f2; color: #dc2626; }

/* 상태 배지 */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.status-active { background-color: #d1fae5; color: #065f46; }
.status-pending { background-color: #fef3c7; color: #b45309; }
.status-inactive { background-color: #fee2e2; color: #b91c1c; }

/* 액션 버튼 그룹 */
.action-buttons { display: flex; gap: 8px; justify-content: center; }
.btn-action {
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px;
  border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; white-space: nowrap;
}
.btn-statement { background-color: #e0e7ff; color: #4338ca; }
.btn-statement:hover { background-color: #c7d2fe; }
.btn-details { background-color: #f1f5f9; color: #475569; }
.btn-details:hover { background-color: #e2e8f0; }

/* Sticky 컬럼 (관리 영역) */
.sticky-col { position: sticky; right: 0; border-left: 1px solid #e2e8f0; z-index: 5; background: white; }
.data-table thead .sticky-col { z-index: 15; background-color: #6d28d9; border-left: 1px solid #5b21b6; }
.data-row:hover .sticky-col { background-color: #f8fafc; }

/* === 반응형 === */
@media (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .filter-group { flex: 1; min-width: calc(33% - 10px);}
  .search-group { width: 100%; flex: 1 1 100%; }
}
@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 14px; align-items: flex-start;}
  .header-actions { width: 100%; flex-direction: row; flex-wrap: wrap;}
  .btn-refresh, .btn-add { flex: 1; justify-content: center; }

  .filter-group, .search-group { width: 100%; min-width: 100%; }
  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
  .filter-toggles-row { flex-direction: column; align-items: flex-start; gap: 10px; }
}
</style>
