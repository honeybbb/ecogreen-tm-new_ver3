<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';

// 1. 상태 관리
const searchTerm = ref('');
const selectedStatus = ref('전체');
const statusOptions = ['전체', '신청 완료', '배송 중', '수령 완료'];
const rawOrders = ref([]);
const isLoading = ref(false);

// 2. 통계 데이터 계산
const stats = computed(() => {
  const total = rawOrders.value.length;
  const pending = rawOrders.value.filter(o => o.status === 0).length;
  const shipping = rawOrders.value.filter(o => o.status === 1).length;
  const completed = rawOrders.value.filter(o => o.status === 2).length;
  const totalAmount = rawOrders.value.reduce((acc, cur) => acc + (Number(cur.totalAmount) || 0), 0);

  return { total, pending, shipping, completed, totalAmount };
});

// 3. 필터링 및 검색 로직
const filteredOrders = computed(() => {
  return rawOrders.value.filter(order => {
    const statusText = getStatusText(order.status);
    const statusMatch = selectedStatus.value === '전체' || statusText === selectedStatus.value;
    const searchMatch = order.siteName.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
        order.applicant.includes(searchTerm.value);
    return statusMatch && searchMatch;
  });
});

// 4. API 호출
const fetchOrders = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get('/api/v1/code/item/order');
    if (res.data.result) {
      rawOrders.value = res.data.data;
    }
  } catch (err) {
    console.error('데이터 로드 에러:', err);
  } finally {
    isLoading.value = false;
  }
};

// 5. 유틸리티 함수
const getStatusText = (status) => {
  if (status === 0) return '신청 완료';
  if (status === 1) return '배송 중';
  return '수령 완료';
};

// 6. 모달 로직 및 상태 변경
const isModalOpen = ref(false);
const selectedOrder = ref({});

const openModal = (order) => {
  selectedOrder.value = order;
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
  selectedOrder.value = {};
};

const processOrder = async (nextStatus) => {
  const statusLabel = nextStatus === 1 ? '배송 중' : '수령 완료';
  if (!confirm(`해당 신청 건을 '${statusLabel}' 상태로 변경하시겠습니까?`)) return;

  try {
    const idxs = selectedOrder.value.items.map(i => i.idx);
    const res = await axios.put('/api/v1/order/status', { idxs, status: nextStatus });
    if (res.data.result) {
      alert('상태가 성공적으로 변경되었습니다.');
      fetchOrders();
      closeModal();
    }
  } catch (err) {
    alert('오류가 발생했습니다.');
  }
};

onMounted(fetchOrders);
</script>

<template>
  <div class="order-management-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-cart-check"></i>
          용품 신청 관리
        </h1>
        <p class="page-subtitle">현장별 청소용품 및 피복 신청 현황을 관리하고 승인합니다</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-clipboard-text-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">누적 신청</span>
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
          <span class="stat-label">완료</span>
          <span class="stat-value">{{ stats.completed }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #8b5cf6; --card-bg: rgba(139, 92, 246, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 신청 금액</span>
          <span class="stat-value">{{ formatCurrency(stats.totalAmount) }}<small>원</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-filter-variant"></i>상태 구분</label>
          <select v-model="selectedStatus" class="filter-select">
            <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
          </select>
        </div>

        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                placeholder="현장명 또는 신청자 검색..."
                class="search-input"
            />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중...</p>
    </div>

    <div class="table-card" v-else>
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>신청 목록 ({{ filteredOrders.length }}건)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 140px;" class="text-center">신청일시</th>
            <th>현장명</th>
            <th style="width: 140px;">신청자</th>
            <th>품목 요약</th>
            <th class="text-right" style="width: 140px;">총 금액</th>
            <th class="text-center" style="width: 100px;">상태</th>
            <th class="text-center" style="width: 100px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="order in filteredOrders" :key="order.regDt + order.mIdx" class="data-row">
            <td class="text-center text-gray">{{ order.regDt }}</td>
            <td class="font-bold text-dark">{{ order.siteName }}</td>
            <td>{{ order.applicant }} <span class="staff-id">({{order.memberId }})</span></td>
            <td class="text-blue">{{ order.summary }}</td>
            <td class="text-right font-bold">{{ formatCurrency(order.totalAmount) }}</td>
            <td class="text-center">
                <span :class="[
                    'status-badge', order.status === 0 ? 'status-pending' :
                    order.status === 1 ? 'status-shipping' : 'status-completed'
                    ]">
                  {{ getStatusText(order.status) }}
                </span>
            </td>
            <td class="text-center-col">
              <button @click="openModal(order)" class="btn-detail">
                <i class="mdi mdi-eye"></i>
                <span>상세</span>
              </button>
            </td>
          </tr>
          <tr v-if="filteredOrders.length === 0" class="empty-row">
            <td colspan="7">
              <div class="empty-state">
                <i class="mdi mdi-package-variant"></i>
                <p>조회된 신청 내역이 없습니다</p>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <transition name="fade">
      <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">
              <i class="mdi mdi-clipboard-text-search-outline"></i>
              <span>신청 상세 내역</span>
            </h3>
            <button @click="closeModal" class="btn-close"><i class="mdi mdi-close"></i></button>
          </div>

          <div class="modal-body custom-scrollbar">
            <div class="order-info-summary">
              <div class="info-item">
                <span class="label">현장명</span>
                <span class="value text-dark">{{ selectedOrder.siteName }}</span>
              </div>
              <div class="info-item">
                <span class="label">신청자</span>
                <span class="value text-dark">{{ selectedOrder.applicant }}</span>
              </div>
              <div class="info-item">
                <span class="label">신청일시</span>
                <span class="value text-dark">{{ selectedOrder.regDt }}</span>
              </div>
            </div>

            <div class="item-table-wrapper">
              <table class="item-table">
                <thead>
                <tr>
                  <th>품목명</th>
                  <th class="text-center">수량</th>
                  <th class="text-right">단가</th>
                  <th class="text-right">소계</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="item in selectedOrder.items" :key="item.idx">
                  <td class="font-medium">{{item.categoryName}} - {{ item.itemName }}</td>
                  <td class="text-center">{{ item.qty }}개</td>
                  <td class="text-right text-gray">{{ formatCurrency(item.price) }}</td>
                  <td class="text-right font-bold">{{ formatCurrency(item.price * item.qty) }}</td>
                </tr>
                </tbody>
                <tfoot>
                <tr>
                  <td colspan="3" class="text-right font-bold">최종 합계 금액</td>
                  <td class="text-right font-extrabold text-blue-lg">{{ formatCurrency(selectedOrder.totalAmount) }}</td>
                </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div class="modal-footer">
            <button
                v-if="selectedOrder.status === 0"
                @click="processOrder(1)"
                class="btn-approve"
            >
              <i class="mdi mdi-truck-delivery-outline"></i>
              승인 및 배송시작
            </button>
            <button
                v-if="selectedOrder.status === 1"
                @click="processOrder(2)"
                class="btn-complete"
            >
              <i class="mdi mdi-check-all"></i>
              수령 완료 처리
            </button>
            <button @click="closeModal" class="btn-close-modal">닫기</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* =========================================
   페이지 고유 스타일 (공통 CSS 제외)
========================================= */

.staff-id { font-size: 11px; color: var(--text-muted); margin-left: 4px; font-weight: 400;}

/* 상태 배지 (테마 변수 활용) */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
  border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.status-pending { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.status-shipping { background-color: rgba(14, 165, 233, 0.1); color: #0ea5e9; } /* 하늘색 */
.status-completed { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }

/* === 모달창 스타일 === */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
}
.modal-card {
  background: var(--bg-surface); border-radius: 16px; width: 100%; max-width: 700px; max-height: 90vh;
  display: flex; flex-direction: column; box-shadow: var(--shadow-md); overflow: hidden; border: 1px solid var(--border-color);
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }

/* 모달 헤더 */
.modal-header {
  padding: 20px 24px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-canvas);
}
.modal-title { font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px; margin: 0;}
.modal-title i { color: var(--primary); font-size: 20px;}

.btn-close {
  background: transparent; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; transition: 0.2s;
  display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 6px;
}
.btn-close:hover { background: var(--bg-hover); color: var(--danger); }

/* 모달 바디 */
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }

.order-info-summary {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
  background: var(--bg-canvas); padding: 16px 20px; border-radius: 10px; margin-bottom: 24px; border: 1px solid var(--border-color);
}
.info-item { display: flex; flex-direction: column; gap: 4px; }
.info-item .label { font-size: 11px; color: var(--text-sub); font-weight: 600; }
.info-item .value { font-size: 13px; color: var(--text-main); font-weight: 700; }

/* 모달 테이블 */
.item-table-wrapper { border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden;}
.item-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--bg-surface); }
.item-table thead { background-color: var(--bg-hover); border-bottom: 1px solid var(--border-color);}
.item-table th { padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: var(--text-sub); }
.item-table td { padding: 14px 16px; border-bottom: 1px solid var(--border-color); color: var(--text-main); vertical-align: middle;}
.item-table tfoot td { padding: 16px; font-size: 14px; background-color: var(--bg-canvas); border-bottom: none;}

.text-blue-lg { color: var(--primary); font-size: 16px; font-weight: 800;  }
.font-extrabold { font-weight: 800; }

/* 모달 푸터 */
.modal-footer {
  padding: 16px 24px; background: var(--bg-canvas); border-top: 1px solid var(--border-color);
  display: flex; justify-content: flex-end; align-items: center; gap: 10px; border-radius: 0 0 16px 16px;
}

.btn-approve {
  background-color: var(--warning); color: var(--text-inverse); padding: 10px 20px; border-radius: 8px;
  font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; box-shadow: var(--shadow-sm);
}
.btn-approve:hover { filter: brightness(0.9); transform: translateY(-1px);}

.btn-complete {
  background-color: var(--success); color: var(--text-inverse); padding: 10px 20px; border-radius: 8px;
  font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; box-shadow: var(--shadow-sm);
}
.btn-complete:hover { background-color: var(--success-hover); transform: translateY(-1px);}

.btn-close-modal {
  background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); padding: 10px 20px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s;
}
.btn-close-modal:hover { background: var(--bg-hover); color: var(--text-main);}

/* 스크롤바 커스텀 */
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* === 반응형 (Responsive) === */
@media (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .filter-group { flex: 1; min-width: calc(33% - 10px); }
  .search-group { width: 100%; flex: 1 1 100%; }
}

@media (max-width: 768px) {
  .order-info-summary { grid-template-columns: 1fr; gap: 12px; }

  .modal-footer { flex-direction: column-reverse; align-items: stretch; gap: 10px;}
  .modal-footer button { width: 100%; justify-content: center; }
}
</style>
