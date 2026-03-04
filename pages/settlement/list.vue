<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue';
import axios from 'axios';
// import { useRouter } from 'nuxt/app'; // 필요시 주석 해제
// import SettlementModal from '@/components/SettlementModal.vue'; // 실제 경로에 맞게 수정

// const router = useRouter();

// 1. 상태 및 검색 조건
const isLoading = ref(false);
const error = ref(null);
const settlements = ref([]);

// 필터 상태
const selectedYear = reactive({
  month: new Date().toISOString().slice(0, 7), // YYYY-MM
});
const searchTerm = ref('');
const selectedSite = ref('전체');
const selectedType = ref('전체');

// 빠른 필터 (상태별)
const filterCompleted = ref(false);
const filterPending = ref(false);

// 옵션 데이터 (API 연동 대체용 Mock)
const siteOptions = ref([
  { idx: 1, name: '쌍용플래티넘고산' },
  { idx: 2, name: '센트럴푸르지오' },
  { idx: 3, name: '래미안에스티움' }
]);
const typeOptions = ref(['청소', '경비', '소독/방역']);

// 2. 정렬 관련 상태
const sortKey = ref('id');
const sortOrder = ref('desc'); // 최신순 기본

// 모달 제어 상태
const isModalOpen = ref(false);
const selectedId = ref(null);
const initialDataForModal = ref(null);

// 3. API 데이터 호출 (Mock 데이터 적용)
const fetchList = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    // 실제 API 호출 로직
    // const res = await axios.get('/api/v1/settlements', { params: selectedYear });
    // settlements.value = res.data.list || [];

    // UI 확인용 임시 데이터
    setTimeout(() => {
      settlements.value = [
        { id: 105, siteName: '쌍용플래티넘고산', sIdx: 1, type: '청소', target_month: selectedYear.month, total_amount: 1542400, status: '결재완료', regDt: '2024-02-01' },
        { id: 104, siteName: '쌍용플래티넘고산', sIdx: 1, type: '경비', target_month: selectedYear.month, total_amount: 3200000, status: '진행중', regDt: '2024-02-02' },
        { id: 103, siteName: '센트럴푸르지오', sIdx: 2, type: '청소', target_month: selectedYear.month, total_amount: 4500000, status: '결재완료', regDt: '2024-02-03' },
        { id: 102, siteName: '래미안에스티움', sIdx: 3, type: '소독/방역', target_month: selectedYear.month, total_amount: 850000, status: '반려', regDt: '2024-02-04' },
        { id: 101, siteName: '센트럴푸르지오', sIdx: 2, type: '경비', target_month: '2023-12', total_amount: 3100000, status: '결재완료', regDt: '2024-01-05' },
      ];
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

// 5. 필터링 + 정렬된 결과 계산
const filteredSettlements = computed(() => {
  let result = settlements.value.filter(item => {
    const monthMatch = item.target_month === selectedYear.month;
    const siteMatch = selectedSite.value === '전체' || item.sIdx === selectedSite.value;
    const searchMatch = item.siteName.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch = selectedType.value === '전체' || item.type === selectedType.value;

    let statusMatch = true;
    if (filterCompleted.value) statusMatch = item.status === '결재완료';
    if (filterPending.value) statusMatch = item.status !== '결재완료';

    return monthMatch && siteMatch && searchMatch && typeMatch && statusMatch;
  });

  // 정렬 로직
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

// 6. 통계 정보 계산 (현재 달 기준)
const statsInfo = computed(() => {
  const currentMonthData = filteredSettlements.value;

  const totalCount = currentMonthData.length;
  const totalAmount = currentMonthData.reduce((sum, item) => sum + (item.total_amount || 0), 0);
  const completedCount = currentMonthData.filter(item => item.status === '결재완료').length;
  const pendingCount = totalCount - completedCount;

  return { totalCount, totalAmount, completedCount, pendingCount };
});

// 7. 유틸리티 함수
const formatCurrency = (amount) => {
  return (amount || 0).toLocaleString() + ' 원';
};

// 8. 이벤트 핸들러 (모달 열기 등)
const handleSearch = () => {
  fetchList();
};

const refreshData = () => {
  fetchList();
};

// 신규 작성 모달
const openCreateModal = () => {
  selectedId.value = null;
  initialDataForModal.value = {
    siteName: '',
    type: '청소',
    target_month: selectedYear.month,
    total_amount: 0,
    statement_data: [
      { category: '직접노무비', item: '기본급', price: 0, count: 1, note: '' },
      { category: '직접노무비', item: '연차수당', price: 0, count: 1, note: '' }
    ],
    details_data: [
      { name: '', position: '', birth_date: '', join_date: '', basic_pay: 0, deduction: 0, note: '' }
    ]
  };
  isModalOpen.value = true;
};

// 기존 내역 열기 (정산서 or 내역서 구분용 플래그 전달 가능)
const openEditModal = (id, docType = 'statement') => {
  const item = settlements.value.find(s => s.id === id);
  selectedId.value = id;
  initialDataForModal.value = { ...item, defaultTab: docType };
  isModalOpen.value = true;
};

onMounted(() => {
  fetchList();
});

watch(() => selectedYear.month, fetchList);
</script>

<template>
  <div class="settlement-list-page">
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calculator"></i>
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
          <i class="mdi mdi-file-document-plus"></i>
          <span>새 정산서 작성</span>
        </button>
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #667eea;">
        <div class="stat-icon">
          <i class="mdi mdi-file-document-multiple-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">당월 총 청구건수</span>
          <span class="stat-value">{{ statsInfo.totalCount }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #10b981;">
        <div class="stat-icon">
          <i class="mdi mdi-cash-multiple"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">당월 총 청구금액</span>
          <span class="stat-value">{{ formatCurrency(statsInfo.totalAmount) }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #3b82f6;">
        <div class="stat-icon">
          <i class="mdi mdi-check-decagram"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">결재 완료</span>
          <span class="stat-value">{{ statsInfo.completedCount }}건</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #f59e0b;">
        <div class="stat-icon">
          <i class="mdi mdi-clock-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">진행 중/반려</span>
          <span class="stat-value">{{ statsInfo.pendingCount }}건</span>
        </div>
      </div>
    </div>

    <!-- 검색 및 필터 패널 -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-calendar-month"></i>
            청구 연월
          </label>
          <input type="month" v-model="selectedYear.month" class="filter-select" />
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-office-building"></i>
            현장 선택
          </label>
          <select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
              {{ site.name }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-format-list-bulleted-type"></i>
            구분
          </label>
          <select v-model="selectedType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt" :value="opt">
              {{ opt }}
            </option>
          </select>
        </div>

        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                placeholder="현장명으로 검색..."
                class="search-input"
                @keyup.enter="handleSearch"
            />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- 필터 토글 -->
      <div class="filter-toggles-row">
        <span class="toggles-label">
          <i class="mdi mdi-filter-variant"></i>
          상태 필터:
        </span>
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

    <!-- 로딩 및 에러 -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중...</p>
    </div>

    <div v-if="error" class="error-state">
      <i class="mdi mdi-alert-circle"></i>
      <p>{{ error }}</p>
    </div>

    <!-- 테이블 -->
    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table"></i>
          <span>정산 내역 목록 ({{ filteredSettlements.length }}건)</span>
        </div>
      </div>

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
            <th @click="toggleSort('status')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>상태</span>
                <i v-if="sortKey === 'status'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('regDt')" class="sortable text-center">
              <div class="th-content justify-center">
                <span>작성일</span>
                <i v-if="sortKey === 'regDt'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
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
              <span :class="['badge', item.type === '청소' ? 'badge-clean' : item.type === '경비' ? 'badge-guard' : 'badge-etc']">
                {{ item.type }}
              </span>
            </td>
            <td class="text-center font-medium">{{ item.target_month }}</td>
            <td class="text-right amount-text">{{ formatCurrency(item.total_amount) }}</td>
            <td class="text-center">
               <span :class="['status-badge',
                 item.status === '결재완료' ? 'status-active' :
                 item.status === '반려' ? 'status-inactive' : 'status-pending']">
                  <i :class="['mdi',
                    item.status === '결재완료' ? 'mdi-check-circle' :
                    item.status === '반려' ? 'mdi-close-circle' : 'mdi-dots-horizontal-circle']"></i>
                  {{ item.status }}
                </span>
            </td>
            <td class="text-center text-gray">{{ item.regDt }}</td>
            <td class="text-center sticky-col">
              <div class="action-buttons">
                <button @click="openEditModal(item.id, 'statement')" class="btn-action btn-statement">
                  <i class="mdi mdi-file-document"></i> 정산서
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
                <i class="mdi mdi-file-search-outline"></i>
                <p>조건에 맞는 정산서가 없습니다</p>
                <span>다른 월이나 현장으로 검색해보세요</span>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- SettlementModal 컴포넌트 렌더링 -->
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
/* Material Design Icons */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 기본 레이아웃 === */
.settlement-list-page {
  padding: 0;
  color: #334155;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

.header-left { flex: 1; }

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title i { font-size: 32px; color: #667eea; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

.header-actions { display: flex; gap: 12px; }

.btn-refresh, .btn-add {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 20px; border: none; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s;
}

.btn-refresh { background: white; border: 1px solid #e2e8f0; color: #64748b; }
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; }

.btn-add {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}
.btn-add:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4); }

/* === 통계 카드 === */
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px; margin-bottom: 28px;
}

.stat-card {
  background: white; border-radius: 12px; padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex; align-items: center; gap: 16px;
  transition: all 0.3s; position: relative; overflow: hidden;
}

.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
  background: var(--card-color);
}
.stat-card:hover { transform: translateY(-4px); box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12); }

.stat-icon {
  width: 48px; height: 48px; border-radius: 12px;
  background: var(--card-color); opacity: 0.15;
  display: flex; align-items: center; justify-content: center; position: relative; flex-shrink: 0;
}
.stat-icon i { font-size: 24px; color: var(--card-color); position: absolute; }

.stat-content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.stat-label { font-size: 13px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 22px; font-weight: 700; color: #1e293b; }

/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 16px; padding: 24px; margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.filter-row { display: flex; align-items: flex-end; gap: 16px; margin-bottom: 20px; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 160px; }
.filter-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569; }
.filter-label i { font-size: 16px; color: #667eea; }

.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 14px; color: #334155; background: white; cursor: pointer; transition: all 0.2s;
  font-family: inherit;
}
.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }

/* 검색 그룹 */
.search-group { display: flex; gap: 8px; flex: 1; }
.search-box {
  display: flex; align-items: center; gap: 10px; padding: 0 16px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; flex: 1; height: 42px; transition: all 0.2s;
}
.search-box:focus-within { background: white; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
.search-box i { font-size: 20px; color: #94a3b8; }
.search-input { flex: 1; border: none; background: transparent; font-size: 14px; color: #334155; outline: none; }
.search-clear { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 4px; }
.search-clear:hover { background: #e2e8f0; color: #64748b; }

/* 필터 토글 */
.filter-toggles-row {
  display: flex; align-items: center; gap: 12px; padding-top: 20px; border-top: 1px solid #f1f5f9;
}
.toggles-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #64748b; }
.filter-toggles { display: flex; gap: 12px; }

.toggle-chip {
  display: flex; align-items: center; gap: 8px; padding: 8px 16px;
  background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 8px; cursor: pointer;
  font-size: 13px; font-weight: 500; color: #64748b; transition: all 0.2s;
}
.toggle-chip input[type="checkbox"] { display: none; }
.toggle-chip:hover { background: #f1f5f9; }
.toggle-chip.active { background: #eff6ff; border-color: #3b82f6; color: #2563eb; }

/* === 테이블 영역 === */
.table-card { background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); overflow: hidden; }
.table-header { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; }
.table-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: #1e293b; }
.table-title i { font-size: 20px; color: #667eea; }

.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }

.data-table { width: 100%; min-width: 1000px; border-collapse: collapse; font-size: 14px; }
.data-table thead { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.data-table th { padding: 14px 16px; font-size: 13px; font-weight: 600; color: white; white-space: nowrap; }
.data-table th.sortable { cursor: pointer; user-select: none; transition: background 0.2s; }
.data-table th.sortable:hover { background: rgba(255, 255, 255, 0.1); }
.th-content { display: flex; align-items: center; gap: 6px; }
.justify-center { justify-content: center; }
.justify-end { justify-content: flex-end; }

.data-table td { padding: 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.data-row:hover { background: #f8fafc; }

/* 텍스트 정렬 & 유틸리티 */
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-gray { color: #94a3b8; }
.font-medium { font-weight: 500; }
.site-name { font-weight: 600; color: #1e293b; }
.amount-text { font-weight: 700; color: #0f172a; font-size: 15px; }

/* 배지 스타일 */
.badge { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; word-break: keep-all; }
.badge-clean { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
.badge-guard { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
.badge-etc { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

/* 상태 배지 */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
}
.status-active { background: #f0fdf4; color: #16a34a; }
.status-pending { background: #fffbeb; color: #d97706; }
.status-inactive { background: #fef2f2; color: #dc2626; }

/* 액션 버튼 그룹 */
.action-buttons { display: flex; gap: 8px; justify-content: center; }
.btn-action {
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px;
  border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none;
}
.btn-statement { background: #e0e7ff; color: #4338ca; }
.btn-statement:hover { background: #c7d2fe; }
.btn-details { background: #f1f5f9; color: #475569; }
.btn-details:hover { background: #e2e8f0; }

/* Sticky 컬럼 (관리 영역) */
.sticky-col { position: sticky; right: 0; box-shadow: -4px 0 8px rgba(0, 0, 0, 0.05); z-index: 5; background: white; }
.data-table thead .sticky-col { z-index: 15; background: #764ba2; box-shadow: none; border-left: 1px solid rgba(255,255,255,0.1); }
.data-row:hover .sticky-col { background: #f8fafc; }

/* 상태 표시 */
.loading-state, .error-state, .empty-state { text-align: center; padding: 60px 20px; color: #64748b; }
.spinner {
  width: 40px; height: 40px; border: 3px solid #f1f5f9; border-top-color: #667eea;
  border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state i { font-size: 48px; color: #cbd5e1; margin-bottom: 12px; display: block;}
.empty-state p { font-size: 16px; font-weight: 600; color: #475569; margin: 0 0 4px; }
.empty-state span { font-size: 13px; }

/* === 반응형 === */
@media (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .search-group { width: 100%; }
}
@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 16px; }
  .header-actions { width: 100%; flex-direction: column; }
  .btn-refresh, .btn-add { width: 100%; justify-content: center; }
  .filter-group { width: 100%; }
}
</style>
