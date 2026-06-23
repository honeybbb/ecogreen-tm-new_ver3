<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';

// ── 상태 관리 (필터 및 데이터) ─────────────────────────────
const filters = ref({
  yearMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  keyword: '', // 현장명 등 검색어
  status: '전체' // 청구 상태 (전체, 0=미청구, 1=청구완료, 2=입금완료, 3=미수처리)
});

const billingList = ref([]);
const isLoading = ref(false);

// ── 상태별 CSS 클래스 반환 ─────────────────────────────────
const getStatusBadgeClass = (status) => {
  switch (status) {
    case '0': return 'badge';
    case '1': return 'badge-billed';
    case '2': return 'badge-paid';
    case '3': return 'badge-unbilled';
    default: return 'badge-default';
  }
};

const getStatusText = (status) => {
  switch(status) {
    case 0: return '진행중';
    case 1: return '입금완료';
    case 2: return '미수처리';
    default: return '알 수 없음';
  }
};

// ── API 호출 (데이터 연동) ───────────────────────────────
const fetchBillingData = async () => {
  isLoading.value = true;
  try {

    const [year, month] = filters.value.yearMonth.split('-');
    const res = await axios.get('/api/v1/settle/billing/list', {
      params: {
        year,
        month,
        keyword: filters.value.keyword,
        status: filters.value.status === '전체' ? '' : filters.value.status
      }
    });
    billingList.value = res.data.data || [];
    isLoading.value = false
    /*
    // UI 퍼블리싱 확인용 목업 데이터 (API 연결 후 삭제)
    setTimeout(() => {
      billingList.value = Array.from({ length: 30 }, (_, i) => ({
        idx: i + 1,
        type: '미화',
        siteName: i % 3 === 0 ? '답십리 래미안 위브' : (i % 2 === 0 ? '자양 우성 아파트' : 'LH 위례 6단지'),
        billingMonth: filters.value.yearMonth,
        supplyValue: 2500000 + (i * 100000),
        vat: 250000 + (i * 10000),
        totalAmount: 2750000 + (i * 110000),
        billingDate: i % 2 === 0 ? '-' : `${filters.value.yearMonth}-10`,
        status: i % 4 === 0 ? '미청구' : (i % 3 === 0 ? '입금완료' : '청구완료'),
        manager: '홍길동',
        note: i === 5 ? '부가세 별도 합의건' : ''
      }));
      isLoading.value = false;
    }, 500);

     */

  } catch (error) {
    console.error('청구 데이터 조회 실패:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
    isLoading.value = false;
  }
};

// ── 요약 데이터 계산 ─────────────────────────────────────
const summary = computed(() => {
  return billingList.value.reduce((acc, cur) => {
    acc.totalSupply += cur.supplyValue || 0;
    acc.totalVat += cur.vat || 0;
    acc.grandTotal += cur.totalAmount || 0;
    if (cur.status === '입금완료') acc.collectedTotal += cur.totalAmount || 0;
    return acc;
  }, { totalSupply: 0, totalVat: 0, grandTotal: 0, collectedTotal: 0 });
});

// ── 이벤트 핸들러 ────────────────────────────────────────
const handleSearch = () => {
  fetchBillingData();
};

const handleExcelDownload = () => {
  alert('엑셀 다운로드 기능 구현 필요');
};

onMounted(() => {
  fetchBillingData();
});
</script>

<template>
  <div class="billing-status-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-receipt-text-outline"></i> 월별 청구 현황</h1>
        <p class="page-subtitle">현장별 청구 금액 및 수금 상태를 관리합니다.</p>
      </div>
      <div class="header-actions">
        <button class="btn-excel" @click="handleExcelDownload">
          <i class="mdi mdi-file-excel-outline"></i> 엑셀 다운로드
        </button>
      </div>
    </div>

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
      <div class="stat-card" style="--card-color: var(--danger); --card-bg: rgba(239, 68, 68, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-account-off-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">수금 완료 총액</span>
          <span class="stat-value">{{ formatCurrency(summary.collectedTotal) }} <small>원</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">청구 연월</label>
          <input type="month" v-model="filters.yearMonth" class="filter-select" @change="handleSearch" />
        </div>
        <div class="filter-group">
          <label class="filter-label">청구 상태</label>
          <select v-model="filters.status" class="filter-select" @change="handleSearch">
            <option value="전체">전체</option>
            <option value="0">미청구</option>
            <option value="1">청구완료</option>
            <option value="2">입금완료</option>
            <option value="3">미수처리</option>
          </select>
        </div>
        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
              <input
                  type="text"
                  v-model="filters.keyword"
                  class="search-input"
                  placeholder="현장명을 입력하세요."
                  @keyup.enter="handleSearch"
              />
            <button class="btn-search" @click="handleSearch">조회</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중입니다...</p>
    </div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header" style="justify-content: space-between; display: flex;">
        <div class="table-title">
          <span>청구 목록 ({{ billingList.length }}명)</span>
        </div>
        <div class="page-size-select">
          <label>페이지당</label>
          <!--select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select-->
        </div>
      </div>

      <div class="table-scroll-container">

      <table class="data-table">
        <colgroup>
          <col width="2%">
          <col width="3%">
          <col width="*%">
          <col width="5%">
          <col width="8%">
          <col width="8%">
          <col width="8%">
          <col width="10%">
          <col width="5%">
          <col width="5%">
          <col width="5%">
          <col width="5%">
          <col width="8%">
          <col width="8%">
        </colgroup>
        <thead>
        <tr>
          <th class="col-idx">No</th>
          <th class="col-type">구분</th>
          <th class="col-site">현장명</th>
          <th class="col-month text-center">비고</th>
          <th class="col-money text-right">공급가액</th>
          <th class="col-money text-right">부가세</th>
          <th class="col-money text-right">합계금액</th>
          <th class="col-date text-center">청구일자</th>
          <th class="col-status text-center">상태</th>
          <th class="col-manager text-center">담당자</th>
          <th class="col-billingManager text-center">청구 담당자</th>
          <th class="col-bankName text-center">은행명</th>
          <th class="col-depositDt text-center">입금일</th>
          <th class="col-price text-center">금액</th>
        </tr>
        </thead>
        <tbody>
        <tr v-if="billingList.length === 0 && !isLoading">
          <td colspan="10" class="empty-row text-center">해당 월의 청구 데이터가 없습니다.</td>
        </tr>
        <tr v-for="(item, index) in billingList" :key="item.idx" class="data-row">
          <td class="text-center">{{ index + 1 }}</td>
          <td class="text-center">{{ item.typeNm }}</td>
          <td class="font-bold">{{ item.siteName }}</td>
          <td class="text-center">{{ item.docType == 'SERVICE' ? '용역비':'연차퇴직금' }}</td>
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
          <td class="text-center">{{ item.bankName }}</td>
          <td class="text-center">{{ item.depositDt }}</td>
          <td class="text-center"></td>
        </tr>
        </tbody>
      </table>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── 요약 카드 ── */
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

/* ── 테이블 영역 (엑셀 스타일) ── */
.table-container {
  position: relative;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  overflow-y: auto;
  max-height: calc(100vh - 350px); /* 화면 크기에 맞게 스크롤 생성 */
}

.loading-overlay {
  position: absolute; inset: 0;
  background: rgba(255, 255, 255, 0.7);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 600; color: var(--primary, #3b82f6);
  z-index: 10;
}

.billing-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
}
.billing-table th, .billing-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  border-right: 1px solid var(--border-color, #e2e8f0);
}
.billing-table th:last-child, .billing-table td:last-child {
  border-right: none;
}

/* 상단 헤더 고정 (Sticky) */
.billing-table th {
  position: sticky; top: 0; z-index: 5;
  background: #f1f5f9; color: #475569;
  font-weight: 700; font-size: 12px;
}

.data-row:hover td { background: #f8fafc; }

/* 컬럼 넓이 및 정렬 설정 */
.text-center { text-align: center; }
.text-right { text-align: right; }
.font-bold { font-weight: 700; }
.text-primary { color: var(--primary, #3b82f6); }

.col-idx { width: 50px; }
.col-site { min-width: 180px; }
.col-month { width: 90px; }
.col-money { width: 120px; }
.col-date { width: 100px; }
.col-status { width: 90px; }
.col-manager { width: 80px; }
.cell-ellipsis { max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 상태 뱃지 */
.status-badge {
  display: inline-block; padding: 4px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 700; text-align: center; width: 60px;
}
.badge-billed { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.badge-paid { background: var(--success); color: #10b981; }
.badge-unbilled { background: #f1f5f9; color: #64748b; }
.badge-default { background: #fef08a; color: #854d0e; }

.empty-row { padding: 40px !important; color: #94a3b8; }
</style>
