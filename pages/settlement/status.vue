<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import { useTableResize } from "~/composables/useTableResize.js";
import Pagination from "~/components/Pagination.vue";
const { startResize } = useTableResize();

// ── 1. 상태 관리 (필터 분리) ─────────────────────────────
const todayMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

const startMonth = ref(todayMonth);
const endMonth = ref(todayMonth);
const searchTerm = ref(''); // 현장명 등 검색어
const selectedSite = ref('전체')
const filterStatus = ref('전체'); // 청구 상태

// ── 데이터 및 정렬 상태 ─────────────────────────────────
const billingList = ref([]);
const isLoading = ref(false);

const sortKey = ref('idx');
const sortOrder = ref('asc');

// ── 페이지네이션 상태 ──────────────────────────────
const currentPage = ref(1);
const pageSize = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

const getStatusBadgeClass = (status) => {
  switch (String(status)) {
    case '0': return 'badge-default';
    case '1': return 'badge-billed';
    case '2': return 'badge-paid';
    case '3': return 'badge-unbilled';
    default: return 'badge-default';
  }
};

const getStatusText = (status) => {
  switch (String(status)) {
    case '0': return '진행중';
    case '1': return '청구완료';
    case '2': return '입금완료';
    case '3': return '미수처리';
    default: return '상태없음';
  }
};

// ── 5. 데이터 패치 로직 ─────────────────────────────────
const fetchBillingData = async () => {
  if (startMonth.value > endMonth.value) {
    alert('시작 연월이 종료 연월보다 클 수 없습니다.');
    return;
  }

  isLoading.value = true;
  try {
    // 'YYYY-MM' -> 'YYYYMM' 변환하여 백엔드로 전송
    const startStr = startMonth.value.replace('-', '');
    const endStr = endMonth.value.replace('-', '');

    const res = await axios.get('/api/v1/settle/billing/list', {
      params: {
        startMonth: startStr,
        endMonth: endStr,
        keyword: searchTerm.value,
        status: filterStatus.value === '전체' ? '' : filterStatus.value
      }
    });

    billingList.value = res.data.data || [];
  } catch (error) {
    console.error('청구 데이터 조회 실패:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  } finally {
    isLoading.value = false;
  }
};

// ── 데이터 필터링 & 정렬 ────────────────────────
const filteredBillingList = computed(() => {
  // 1) 필터 적용 (백엔드에서도 필터링하지만 클라이언트에서도 이중 체크)
  let list = billingList.value.filter(item => {
    // 1. 상태 필터
    if (filterStatus.value !== '전체' && String(item.status) !== String(filterStatus.value)) {
      return false;
    }

    // 2. 검색어 필터 (현장명 - 템플릿에선 주석처리되어 있으나 로직은 유지)
    if (searchTerm.value && !item.siteName?.toLowerCase().includes(searchTerm.value.toLowerCase())) {
      return false;
    }

    // 3. 현장 콤보박스(Select) 필터
    // 선택된 값이 '전체'가 아닌데, 아이템의 현장명과 다르면 필터링(제외)
    if (selectedSite.value !== '전체' && item.sIdx !== selectedSite.value) {
      return false;
    }

    currentPage.value = 1;

    // 위 조건들을 모두 통과한 데이터만 남김
    return true;
  });

  // 2) 정렬 적용
  list.sort((a, b) => {
    const mod = sortOrder.value === 'asc' ? 1 : -1;
    const vA = a[sortKey.value] || '';
    const vB = b[sortKey.value] || '';

    if (typeof vA === 'string' && typeof vB === 'string') {
      return vA.localeCompare(vB) * mod;
    }
    return (vA < vB ? -1 : vA > vB ? 1 : 0) * mod;
  });

  return list;
});

// 3) 페이지네이션 적용
const pagedBillingList = computed(() => {
  const s = (currentPage.value - 1) * pageSize.value;
  return filteredBillingList.value.slice(s, s + pageSize.value);
});

// ── 7. 요약 데이터 계산 ─────────────────────────────────────
const summary = computed(() => {
  return filteredBillingList.value.reduce((acc, cur) => {
    acc.totalSupply += Number(cur.subTotal) || 0;
    acc.totalVat += Number(cur.vatAmount) || 0;
    acc.grandTotal += Number(cur.grandTotal) || 0;

    // 입금완료(2) 상태인 경우에만 수금액 합계 계산
    if (String(cur.status) === '2') {
      acc.collectedTotal += Number(cur.grandTotal) || 0;
    }
    return acc;
  }, { totalSupply: 0, totalVat: 0, grandTotal: 0, collectedTotal: 0 });
});

// ── 8. 이벤트 핸들러 및 왓처 ────────────────────────────────────────
const handleSearch = () => {
  currentPage.value = 1; // 검색 시 첫 페이지로 이동
  fetchBillingData();
};

function resetFilters() {
  searchTerm.value   = ''
  selectedSite.value = '전체'
  filterStatus.value = '전체'
  currentPage.value  = 1
}

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

// 시작/종료월이 바뀌면 자동으로 데이터 재조회
watch([startMonth, endMonth], fetchBillingData);

onMounted(() => {
  fetchBillingData();
});
</script>

<template>
  <div class="billing-status-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-receipt-text-outline"></i> 월별 청구 현황</h1>
        <p class="page-subtitle">현장별 청구 금액 및 수금 상태를 조회합니다.</p>
      </div>
    </div>

    <!-- 요약 카드 영역 -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-account-group"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 공급가액</span>
          <span class="stat-value">{{ formatCurrency(summary.totalSupply) }} <small>원</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-account-check"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 부가세</span>
          <span class="stat-value">{{ formatCurrency(summary.totalVat) }} <small>원</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f97316; --card-bg: rgba(249, 115, 22, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-shield-remove-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">청구 합계</span>
          <span class="stat-value">{{ formatCurrency(summary.grandTotal) }} <small>원</small></span>
        </div>
      </div>
    </div>

    <!-- 검색 필터 영역 -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">청구 연월</label>
          <div class="period-inputs">
            <!-- 개별 변수로 분리된 v-model 적용 -->
            <input type="month" v-model="startMonth" class="filter-select period-select" />
            <span class="period-separator">~</span>
            <input type="month" v-model="endMonth" class="filter-select period-select" />
          </div>
        </div>
        <div class="filter-group">
          <label class="filter-label"><!--i class="mdi mdi-office-building-outline"></i--> 현장</label>
          <SiteSelect v-model="selectedSite" />
        </div>
        <div class="filter-group">
          <label class="filter-label">청구 상태</label>
          <select v-model="filterStatus" class="filter-select" @change="handleSearch">
            <option value="전체">전체</option>
            <option value="0">진행중</option>
            <option value="1">청구완료</option>
            <option value="2">입금완료</option>
            <option value="3">미수처리</option>
          </select>
        </div>
        <div class="search-group">
          <!--div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                class="search-input"
                placeholder="현장명을 입력하세요."
                @keyup.enter="handleSearch"
            />
            <button
                v-if="searchTerm" @click="searchTerm = ''; handleSearch()" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div-->
          <button @click="resetFilters" class="btn-search">
            <i class="mdi mdi-filter-off"></i><span>초기화</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 로딩 상태 -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중입니다...</p>
    </div>

    <!-- 테이블 영역 -->
    <div class="table-card" v-if="!isLoading">
      <div class="table-header" style="justify-content: space-between; display: flex;">
        <div class="table-title">
          <span>청구 목록 ({{ filteredBillingList.length }}건)</span>
        </div>
        <div class="page-size-select">
          <label>페이지당</label>
          <select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <!-- 컬럼 너비 지정 부분 (기존 유지) -->
          <colgroup>
            <col width="2%">
            <col width="5%">
            <col width="*%">
            <col width="5%">
            <col width="8%">
            <col width="8%">
            <col width="8%">
            <col width="10%">
            <col width="8%">
            <col width="8%">
            <col width="8%">
            <col width="8%">
            <!--col width="8%">
            <col width="8%"-->
          </colgroup>
          <thead>
          <tr>
            <th class="text-center">
              <div class="th-content">No</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('type')" class="sortable resizable">
              <div class="th-content text-center">
                구분 <i v-if="sortKey === 'type'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
                <div class="resize-handle" @mousedown.stop="startResize"></div>
              </div>
            </th>
            <th @click="toggleSort('siteName')" class="sortable resizable col-site">
              <div class="th-content">
                <span class="font-bold">현장명</span> <i v-if="sortKey === 'siteName'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('docType')" class="sortable resizable text-center">
              <div class="th-content">비고 <i v-if="sortKey==='docType'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('subTotal')" class="sortable resizable">
              <div class="th-content"> 공급가액 <i v-if="sortKey==='subTotal'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('vatAmount')" class="sortable resizable">
              <div class="th-content">부가세 <i v-if="sortKey==='vatAmount'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('grandTotal')" class="sortable resizable">
              <div class="th-content">합계금액 <i v-if="sortKey==='grandTotal'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('billingDt')" class="sortable resizable text-center">
              <div class="th-content">청구일자 <i v-if="sortKey==='billingDt'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('status')" class="sortable resizable text-center">
              <div class="th-content">상태 <i v-if="sortKey==='status'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable text-center">
              <div class="th-content">담당자</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable text-center">
              <div class="th-content">청구 담당자</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <!--th class="col-bankName text-center">은행명</th-->
            <th class="resizable text-center">
              <div class="th-content">입금일</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <!--th class="col-price text-center">비고(금액)</th-->
          </tr>
          </thead>
          <tbody>
            <tr v-if="pagedBillingList.length === 0">
              <td colspan="14" class="empty-row text-center">조건에 맞는 데이터가 없습니다.</td>
            </tr>
            <tr v-for="(item, index) in pagedBillingList" :key="item.idx || index" class="data-row">
              <td class="text-center">{{ (currentPage - 1) * pageSize + index + 1 }}</td>
              <td class="text-center">
                <span :class="['badge',
                  item.type === '01001002' ? 'badge-clean' :
                  item.type === '01001001' ? 'badge-guard' : 'badge-etc'
                ]">
                  {{ item.typeNm || '-' }}
                </span>
              </td>
              <td class="font-bold">{{ item.siteName }}</td>
              <td class="text-center">{{ item.docType === 'SERVICE' ? '용역비' : (item.docType || '-') }}</td>
              <td class="text-right">{{ formatCurrency(item.subTotal) }}</td>
              <td class="text-right">{{ formatCurrency(item.vatAmount) }}</td>
              <td class="text-right font-bold text-primary">{{ formatCurrency(item.grandTotal) }}</td>
              <td class="text-center">{{ item.billingDt }}</td>
              <td class="text-center">
                    <span class="status-badge" :class="getStatusBadgeClass(item.status)">
                      {{ getStatusText(item.status) }}
                    </span>
              </td>
              <td class="text-center">{{ item.manager }}</td>
              <td class="text-center">{{ item.billingManager }}</td>
              <!--td class="text-center">{{ item.bankName }}</td-->
              <td class="text-center">{{ item.depositDt }}</td>
              <!--td class="text-center"></td-->
            </tr>
          </tbody>
          <tfoot>
            <tr class="table-footer sticky-footer">
              <td colspan="4" class="text-center">
                <span class="font-bold">검색결과 합계</span>
              </td>
              <td class="text-right font-bold">{{ formatCurrency(summary.totalSupply) }}</td>
              <td class="text-right font-bold">{{ formatCurrency(summary.totalVat) }}</td>
              <td class="text-right font-bold">{{ formatCurrency(summary.grandTotal) }}</td>
              <td colspan="7"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredBillingList.length"
      />
    </div>
  </div>
</template>

<style scoped>
/* 기존의 style 유지 */
.summary-cards {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
}
.summary-card {
  background: var(--bg-surface, #ffffff);
  padding: 20px; border-radius: 10px;
  border: 1px solid var(--border-color, #e2e8f0);
  display: flex; flex-direction: column; gap: 8px;
}
.total-card { background: rgba(59, 130, 246, 0.05); border-color: rgba(59, 130, 246, 0.3); }
.collected-card { background: rgba(16, 185, 129, 0.05); border-color: rgba(16, 185, 129, 0.3); }

.summary-title { font-size: 13px; font-weight: 600; color: var(--text-sub, #64748b); }
.summary-value { font-size: 20px; font-weight: 700; color: var(--text-main, #1e293b); }
.summary-value small { font-size: 14px; font-weight: 500; }
.total-card .summary-value { color: var(--primary, #3b82f6); }
.collected-card .summary-value { color: #10b981; }

.loading-overlay {
  position: absolute; inset: 0;
  background: rgba(255, 255, 255, 0.7);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 600; color: var(--primary, #3b82f6);
  z-index: 10;
}

/* === 테이블 컨트롤 영역 === */
.page-size-select {
  display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub);
}

.data-row:hover td { background: #f8fafc; }

.col-idx { width: 50px; }
.col-site {
  min-width: 80px;
  max-width: 160px;
  width: 120px;
}
.col-month { width: 90px; }
.col-money { width: 120px; }
.col-date { width: 100px; }
.col-status { width: 90px; }
.col-manager { width: 80px; }
.cell-ellipsis { max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.resizable {
  position: relative;
  overflow: hidden;
}
.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 2px;
  height: 100%;
  cursor: col-resize;
  z-index: 1;
  user-select: none;
}
.resize-handle:hover,
.is-resizing .resize-handle {
  background: var(--primary);
  opacity: 0.5;
}

/* 상태 뱃지 */
.status-badge {
  display: inline-block; padding: 4px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 700; text-align: center; width: auto; min-width: 60px;
}
.badge-billed { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.badge-paid { background: #dcfce7; color: #15803d; }
.badge-unbilled { background: #f1f5f9; color: #64748b; }
.badge-default { background: #fef08a; color: #854d0e; }

.badge       { padding:3px 9px; border-radius:6px; font-size:11px; font-weight:600; }
.badge-clean { background:rgba(16,185,129,.1); color:var(--success); }
.badge-guard { background:var(--primary-soft);  color:var(--primary); }
.badge-etc   { background:rgba(239,68,68,.1);  color:var(--danger); }

.empty-row { padding: 40px !important; color: #94a3b8; }

.table-footer.sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 25;
  background-color: #f8fafc;
  border-top: 2px solid var(--border-focus);
}
</style>