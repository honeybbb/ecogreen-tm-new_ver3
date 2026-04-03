<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import Pagination from "~/components/Pagination.vue";
import { useRoute, useRouter } from "#app";

// 1. API 및 상태 관리
const { siteOptions, fetchSiteOptions } = useApi();
const route     = useRoute()
const router    = useRouter()
const authStore = useAuthStore();

const tabs = [
  { id: 'orders', icon: 'mdi-format-list-bulleted', name: '신청 현황 목록' },
  { id: 'budgets',icon: 'mdi-cog-outline',          name: '현장별 예산 설정' },
]

// 메인 탭 상태 ('orders': 신청 현황, 'budgets': 예산 설정)
const activeTab = ref(route.query.tab || 'orders')

async function changeTab(id) {
  activeTab.value = id
  currentPage.value   = 1
  await router.replace({ query: { ...route.query, tab: id } })
}

// [필터] 공통 및 신청 현황용
const selectedSite   = ref('전체');
const searchTerm     = ref('');
const selectedStatus = ref('전체');
const statusOptions  = ['전체', '신청 완료', '배송 중', '수령 완료'];
const selectedMonth  = ref(new Date().toISOString().slice(0, 7)); // 기본값 당월 (YYYY-MM)

// [예산 설정 탭] 전용 상태
const budgetSearchTerm = ref('');
const siteBudgets = ref({}); // { sIdx: amount }
const budgetPage = ref(1);
const budgetPageSize = ref(50);

// --- [추가] 선택된 현장(체크박스) 상태 관리 ---
const selectedSites = ref([]); // 선택된 site.idx 배열 보관

const rawOrders = ref([]);
const isLoading = ref(false);

// 2. 통계 데이터 계산 (선택된 월 기준 필터링)
const stats = computed(() => {
  const monthlyData = rawOrders.value.filter(o => o.regDt && o.regDt.startsWith(selectedMonth.value));

  const total = monthlyData.length;
  const pending = monthlyData.filter(o => o.status === 0).length;
  const shipping = monthlyData.filter(o => o.status === 1).length;
  const completed = monthlyData.filter(o => o.status === 2).length;
  const totalAmount = monthlyData.reduce((acc, cur) => acc + (Number(cur.totalAmount) || 0), 0);

  return { total, pending, shipping, completed, totalAmount };
});

// 3. 신청 현황 필터링 및 페이징
const filteredOrders = computed(() => {
  return rawOrders.value.filter(order => {
    const monthMatch  = order.regDt && order.regDt.startsWith(selectedMonth.value);
    const siteMatch   = selectedSite.value === '전체' || String(order.sIdx) === String(selectedSite.value);
    const statusText  = getStatusText(order.status);
    const statusMatch = selectedStatus.value === '전체' || statusText === selectedStatus.value;
    const searchMatch = order.siteName.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
        (order.applicant && order.applicant.includes(searchTerm.value));

    return monthMatch && siteMatch && statusMatch && searchMatch;
  });
});

const currentPage = ref(1);
const pageSize    = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

const pagedOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredOrders.value.slice(start, start + pageSize.value);
});

// 4. 예산 설정 탭 필터링 (현장 검색 대응)
const filteredBudgetSites = computed(() => {
  if (!siteOptions.value) return [];
  return siteOptions.value.filter(site =>
      site.name.toLowerCase().includes(budgetSearchTerm.value.toLowerCase())
  );
});

const pagedBudgetSites = computed(() => {
  const start = (budgetPage.value - 1) * budgetPageSize.value;
  return filteredBudgetSites.value.slice(start, start + budgetPageSize.value);
});

// --- [추가] 현재 페이지 전체 선택/해제 Computed ---
const selectAll = computed({
  get: () => pagedBudgetSites.value.length > 0 && pagedBudgetSites.value.every(site => selectedSites.value.includes(site.idx)),
  set: (val) => {
    if (val) {
      pagedBudgetSites.value.forEach(site => {
        if (!selectedSites.value.includes(site.idx)) selectedSites.value.push(site.idx);
      });
    } else {
      const currentIds = pagedBudgetSites.value.map(s => s.idx);
      selectedSites.value = selectedSites.value.filter(id => !currentIds.includes(id));
    }
  }
});

// --- [추가] 예산 금액 입력 시 자동으로 체크하는 함수 ---
const markAsSelected = (idx) => {
  if (!selectedSites.value.includes(idx)) {
    selectedSites.value.push(idx);
  }
};

// 5. 예산 초과 로직
const getSiteMonthlyTotal = (sIdx) => {
  return rawOrders.value
      .filter(o => String(o.sIdx) === String(sIdx) && o.regDt.startsWith(selectedMonth.value))
      .reduce((acc, cur) => acc + (Number(cur.totalAmount) || 0), 0);
};

const isOverBudget = (sIdx) => {
  const budget = siteBudgets.value[sIdx] || 0;
  if (!budget || budget === 0) return false;
  return getSiteMonthlyTotal(sIdx) > budget;
};

// 6. API 및 액션
const fetchOrders = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get('/api/v1/code/item/order');
    if (res.data.result) rawOrders.value = res.data.data;
    // 실제 환경에서는 여기서 예산 데이터도 GET 해옵니다.
  } catch (err) { console.error(err); }
  finally { isLoading.value = false; }
};

// --- [수정] 체크된 예산만 저장하도록 로직 변경 ---
const saveBudgets = async () => {
  if (selectedSites.value.length === 0) {
    alert('저장할 현장을 체크해주세요.');
    return;
  }

  if (!confirm(`체크된 ${selectedSites.value.length}개 현장의 예산 설정을 저장하시겠습니까?`)) return;

  // 선택된 현장 ID에 대한 데이터만 추출
  const dataToSave = {};
  selectedSites.value.forEach(idx => {
    dataToSave[idx] = siteBudgets.value[idx] || 0;
  });

  try {
    await axios.post('/api/v1/site/order/budgets', dataToSave);
    alert('선택한 현장의 기준 금액 설정이 저장되었습니다.');
    selectedSites.value = []; // 저장 성공 시 선택 초기화
  } catch (err) {
    alert('저장 중 오류 발생');
  }
};

const getStatusText = (status) => {
  if (status === 0) return '신청 완료';
  if (status === 1) return '배송 중';
  return '수령 완료';
};

// 모달 로직
const isModalOpen = ref(false);
const selectedOrder = ref({});
const openModal = (order) => { selectedOrder.value = order; isModalOpen.value = true; };
const closeModal = () => { isModalOpen.value = false; };

onMounted(async () => {
  await Promise.all([
    fetchSiteOptions(),
    fetchOrders()
  ]);
});
</script>

<template>
  <div class="order-management-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-cart-check"></i> 용품 신청 및 예산 관리</h1>
        <p class="page-subtitle">현장별 소모품 신청 현황과 월별 예산 한도를 관리합니다.</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-calendar-month"></i></div>
        <div class="stat-content">
          <span class="stat-label">{{ selectedMonth.split('-')[1] }}월 신청 건수</span>
          <span class="stat-value">{{ stats.total }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-clock-alert-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">대기 중</span>
          <span class="stat-value">{{ stats.pending }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #0ea5e9; --card-bg: rgba(14, 165, 233, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-truck-delivery-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">배송 중</span>
          <span class="stat-value">{{ stats.shipping }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-check-decagram-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">수령 완료</span>
          <span class="stat-value">{{ stats.completed }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #8b5cf6; --card-bg: rgba(139, 92, 246, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">당월 총 신청액</span>
          <span class="stat-value text-blue">{{ formatCurrency(stats.totalAmount) }}<small>원</small></span>
        </div>
      </div>
    </div>

    <div class="tab-nav">
      <button
          v-for="tab in tabs" :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="changeTab(tab.id)"
      >
        <i :class="['mdi', tab.icon]"></i>
        {{ tab.name }}
      </button>
    </div>

    <div v-if="activeTab === 'orders'" class="tab-content-area">
      <div class="filter-panel">
        <div class="filter-row">
          <div class="filter-group">
            <label class="filter-label"><i class="mdi mdi-calendar-search"></i>조회 월</label>
            <input type="month" v-model="selectedMonth" class="filter-select" @change="currentPage = 1" />
          </div>
          <div class="filter-group">
            <label class="filter-label"><i class="mdi mdi-office-building-outline"></i>현장</label>
            <SiteSelect v-model="selectedSite" @update:modelValue="currentPage = 1" />
          </div>
          <div class="filter-group">
            <label class="filter-label"><i class="mdi mdi-filter-variant"></i>상태</label>
            <select v-model="selectedStatus" class="filter-select" @change="currentPage = 1">
              <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
            </select>
          </div>
          <div class="search-group">
            <div class="search-box">
              <i class="mdi mdi-magnify"></i>
              <input type="text" v-model="searchTerm" placeholder="신청자 검색..." class="search-input" />
            </div>
          </div>
        </div>
      </div>

      <div class="table-card" v-if="!isLoading">
        <div class="table-header">
          <div class="table-title"><span>신청 목록 ({{ filteredOrders.length }}건)</span></div>
          <div class="page-size-select">
            <label>페이지당</label>
            <select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
              <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
            </select>
          </div>
        </div>
        <div class="table-scroll-container">
          <table class="data-table">
            <thead>
            <tr>
              <th class="text-center" style="width: 140px;">신청일시</th>
              <th>현장명</th>
              <th style="width: 120px;">신청자</th>
              <th>품목 요약</th>
              <th class="text-right" style="width: 150px;">신청 금액</th>
              <th class="text-center" style="width: 100px;">상태</th>
              <th class="text-center" style="width: 80px;">관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="order in pagedOrders" :key="order.regDt + order.mIdx"
                :class="['data-row', { 'row-over-budget': isOverBudget(order.sIdx) }]">
              <td class="text-center text-gray">{{ order.regDt }}</td>
              <td class="font-bold">{{ order.siteName }}</td>
              <td>{{ order.applicant }}</td>
              <td class="text-blue">{{ order.summary }}</td>
              <td class="text-right">
                <span class="font-bold">{{ formatCurrency(order.totalAmount) }}</span>
                <div v-if="isOverBudget(order.sIdx)" class="budget-alert-text">예산 초과</div>
              </td>
              <td class="text-center">
                  <span :class="['status-badge', order.status === 0 ? 'status-pending' : order.status === 1 ? 'status-shipping' : 'status-completed']">
                    {{ getStatusText(order.status) }}
                  </span>
              </td>
              <td class="text-center">
                <button @click="openModal(order)" class="btn-detail">
                  <i class="mdi mdi-eye"></i> 상세
                </button>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
        <Pagination v-model:currentPage="currentPage" v-model:pageSize="pageSize" :totalCount="filteredOrders.length" />
      </div>
    </div>

    <div v-else class="tab-content-area">
      <div class="filter-panel">
        <div class="filter-row" style="justify-content: space-between;">
          <div class="search-group" style="max-width: 400px;">
            <div class="search-box">
              <i class="mdi mdi-magnify"></i>
              <input type="text" v-model="budgetSearchTerm" placeholder="현장 이름 검색..." class="search-input" @input="budgetPage = 1" />
            </div>
          </div>
          <button class="btn-save" @click="saveBudgets" :disabled="selectedSites.length === 0">
            <i class="mdi mdi-content-save-outline"></i> 선택 예산 저장
            <span v-if="selectedSites.length > 0">({{ selectedSites.length }}건)</span>
          </button>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header">
          <div class="table-title"><span>현장 목록 ({{ filteredBudgetSites.length }}건)</span></div>
          <div class="page-size-select">
            <label>페이지당</label>
            <select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
              <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
            </select>
          </div>
        </div>

        <table class="data-table">
          <thead>
          <tr>
            <th class="text-center" style="width: 50px;">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="selectAll" class="custom-checkbox" />
              </label>
            </th>
            <th>현장명</th>
            <th class="text-right">당월 신청 누적액</th>
            <th class="text-center" style="width: 280px;">월 기준 금액 (예산 한도)</th>
            <th class="text-center" style="width: 120px;">상태</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="site in pagedBudgetSites" :key="site.idx"
              :class="['data-row', { 'row-selected': selectedSites.includes(site.idx) }]">
            <td class="text-center">
              <label class="checkbox-wrapper">
                <input type="checkbox" v-model="selectedSites" :value="site.idx" class="custom-checkbox" />
              </label>
            </td>
            <td class="font-bold">{{ site.name }}</td>
            <td class="text-right">
                <span :class="{ 'text-red font-bold': isOverBudget(site.idx) }">
                  {{ formatCurrency(getSiteMonthlyTotal(site.idx)) }}원
                </span>
            </td>
            <td class="text-center">
              <div class="budget-input-wrap">
                <input type="number"
                       v-model.number="siteBudgets[site.idx]"
                       @input="markAsSelected(site.idx)"
                       class="input-edit text-right"
                       placeholder="0" />
                <span class="unit-text">원</span>
              </div>
            </td>
            <td class="text-center">
              <span v-if="isOverBudget(site.idx)" class="badge badge-red">한도초과</span>
              <span v-else-if="siteBudgets[site.idx] > 0" class="badge badge-green">정상</span>
              <span v-else class="badge badge-gray">미설정</span>
            </td>
          </tr>
          </tbody>
        </table>
        <Pagination v-model:currentPage="budgetPage" v-model:pageSize="budgetPageSize" :totalCount="filteredBudgetSites.length" />
      </div>
    </div>

    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card" style="max-width: 700px;">
        <div class="modal-header">
          <h3 class="modal-title">신청 내역 상세</h3>
          <button @click="closeModal" class="modal-close"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="order-info-summary" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: var(--bg-surface); padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border-color);">
            <div class="info-item"><span class="text-gray">현장</span><div class="font-bold">{{ selectedOrder.siteName }}</div></div>
            <div class="info-item"><span class="text-gray">신청자</span><div class="font-bold">{{ selectedOrder.applicant }}</div></div>
            <div class="info-item"><span class="text-gray">당월 누적</span><div :class="['font-bold', { 'text-red': isOverBudget(selectedOrder.sIdx) }]">{{ formatCurrency(getSiteMonthlyTotal(selectedOrder.sIdx)) }}원</div></div>
          </div>
          <table class="data-table">
            <thead><tr><th>품목</th><th class="text-center">수량</th><th class="text-right">단가</th><th class="text-right">소계</th></tr></thead>
            <tbody>
            <tr v-for="item in selectedOrder.items" :key="item.idx">
              <td>{{ item.itemName }}</td>
              <td class="text-center">
                <input type="number" v-model="item.qty" class="input-add" style="width: 60px !important;"> 개
              </td>
              <td class="text-right">{{ formatCurrency(item.price) }}</td>
              <td class="text-right font-bold">{{ formatCurrency(item.price * item.qty) }}</td>
            </tr>
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button @click="closeModal" class="btn-refresh" style="height: 36px;">닫기</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 페이지 부가 설정 */
.page-size-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-sub);
}

/* 탭 네비게이션 스타일 */
.tab-nav { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid var(--border-color); }
.tab-btn { padding: 10px 20px; border: none; background: none; font-size: 13px; font-weight: 600; color: var(--text-sub); cursor: pointer; border-radius: 8px 8px 0 0; display: flex; align-items: center; gap: 7px; transition: all .2s; position: relative; bottom: -2px; font-family: inherit; letter-spacing: -.02em; }
.tab-btn i { font-size: 17px; }
.tab-btn:hover { background: var(--primary-soft); color: var(--primary); }
.tab-btn.active { color: var(--primary); background: var(--bg-surface); border: 2px solid var(--border-color); border-bottom: 2px solid var(--bg-surface); }
.tab-count { background: var(--primary-soft); color: var(--primary); font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; min-width: 20px; text-align: center; }
.tab-btn.active .tab-count { background: var(--primary); color: #fff; }

/* 예산 관리 전용 스타일 */
.row-over-budget { background-color: rgba(239, 68, 68, 0.04) !important; }
.row-selected { background-color: var(--primary-soft) !important; }
.budget-alert-text { font-size: 10px; color: var(--danger); font-weight: 700; margin-top: 2px; }
.budget-input-wrap { display: flex; align-items: center; gap: 8px; justify-content: center; }
.budget-input-wrap .input-edit { width: 160px; font-weight: 600; font-size: 14px; }
.unit-text { font-size: 12px; color: var(--text-sub); }

.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
}
/* 모달 푸터 액션 버튼 */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 28px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.status-shipping { background-color: rgba(14, 165, 233, 0.1); color: #0ea5e9; }
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: var(--bg-hover); color: var(--text-sub); }

/* --- [추가] 커스텀 체크박스 스타일 (급여 페이지와 동일) --- */
.checkbox-wrapper {
  display: flex; justify-content: center; align-items: center;
  width: 100%; height: 100%; cursor: pointer;
}
.custom-checkbox {
  appearance: none; -webkit-appearance: none;
  width: 18px; height: 18px;
  border: 2px solid var(--border-focus); border-radius: 4px;
  cursor: pointer; position: relative; transition: all 0.2s;
  background: var(--bg-surface); margin: 0;
}
.custom-checkbox:hover { border-color: var(--text-muted); }
.custom-checkbox:checked { border-color: var(--primary); background-color: var(--primary); }
.custom-checkbox:checked::after {
  content: ''; position: absolute;
  top: 2px; left: 5px; width: 4px; height: 8px;
  border: solid var(--text-inverse); border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* 버튼 비활성화 스타일 */
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(100%);
}

.table-scroll-container { max-height: 600px; overflow-y: auto; }

@media (max-width: 768px) {
  .budget-input-wrap .input-edit { width: 100px; }
}
</style>
