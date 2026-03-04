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

const formatPrice = (price) => (Number(price) || 0).toLocaleString() + '원';

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
        <p class="page-subtitle">현장별 청소용품 신청 현황을 관리하고 승인합니다</p>
      </div>
      <div class="header-actions">
        <button @click="fetchOrders" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #667eea;">
        <div class="stat-icon"><i class="mdi mdi-clipboard-text-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">누적 신청</span>
          <span class="stat-value">{{ stats.total }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f59e0b;">
        <div class="stat-icon"><i class="mdi mdi-clock-alert-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">대기 중</span>
          <span class="stat-value">{{ stats.pending }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #3b82f6;">
        <div class="stat-icon"><i class="mdi mdi-truck-delivery-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">배송 중</span>
          <span class="stat-value">{{ stats.shipping }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #10b981;">
        <div class="stat-icon"><i class="mdi mdi-check-decagram-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">완료</span>
          <span class="stat-value">{{ stats.completed }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #8b5cf6;">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 신청 금액</span>
          <span class="stat-value" style="font-size: 16px;">{{ formatPrice(stats.totalAmount) }}</span>
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

    <div class="table-card">
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
            <th>신청일시</th>
            <th>현장명</th>
            <th>신청자</th>
            <th>품목 요약</th>
            <th class="text-right">총 금액</th>
            <th class="text-center">상태</th>
            <th class="text-center sticky-col">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="order in filteredOrders" :key="order.regDt + order.mIdx" class="data-row">
            <td class="text-gray">{{ order.regDt }}</td>
            <td class="font-bold">{{ order.siteName }}</td>
            <td>{{ order.applicant }}</td>
            <td class="text-blue">{{ order.summary }}</td>
            <td class="text-right font-bold">{{ formatPrice(order.totalAmount) }}</td>
            <td class="text-center">
                <span :class="['status-badge', order.status === 0 ? 'status-pending' : order.status === 1 ? 'status-shipping' : 'status-completed']">
                  {{ getStatusText(order.status) }}
                </span>
            </td>
            <td class="text-center sticky-col">
              <button @click="openModal(order)" class="btn-detail">
                <i class="mdi mdi-eye"></i>
                <span>상세보기</span>
              </button>
            </td>
          </tr>
          <tr v-if="filteredOrders.length === 0">
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

    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <i class="mdi mdi-clipboard-text-search"></i>
            <span>신청 상세 내역</span>
          </div>
          <button @click="closeModal" class="btn-close">&times;</button>
        </div>

        <div class="modal-body">
          <div class="order-info-summary">
            <div class="info-item">
              <span class="label">현장명</span>
              <span class="value">{{ selectedOrder.siteName }}</span>
            </div>
            <div class="info-item">
              <span class="label">신청자</span>
              <span class="value">{{ selectedOrder.applicant }}</span>
            </div>
            <div class="info-item">
              <span class="label">신청일시</span>
              <span class="value">{{ selectedOrder.regDt }}</span>
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
                <td class="font-medium">{{ item.itemName }}</td>
                <td class="text-center">{{ item.qty }}개</td>
                <td class="text-right text-gray">{{ formatPrice(item.price) }}</td>
                <td class="text-right font-bold">{{ formatPrice(item.price * item.qty) }}</td>
              </tr>
              </tbody>
              <tfoot>
              <tr>
                <td colspan="3" class="text-right font-bold">최종 합계 금액</td>
                <td class="text-right font-extrabold text-blue">{{ formatPrice(selectedOrder.totalAmount) }}</td>
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
            <i class="mdi mdi-truck-delivery"></i>
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
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

.order-management-page { padding: 0; }

/* 헤더 & 통계 */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.page-title { font-size: 28px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 12px; }
.page-title i { color: #3b82f6; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 5px 0 0 0; }
.btn-refresh { display: flex; align-items: center; gap: 8px; padding: 10px 18px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 600; cursor: pointer; transition: 0.3s; }

.stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 28px; }
.stat-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 16px; position: relative; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--card-color); }
.stat-icon { width: 44px; height: 44px; border-radius: 10px; background: var(--card-color); opacity: 0.1; display: flex; align-items: center; justify-content: center; position: relative; }
.stat-icon i { font-size: 22px; color: var(--card-color); position: absolute; }
.stat-label { font-size: 11px; color: #64748b; font-weight: 600; }
.stat-value { font-size: 18px; font-weight: 800; color: #1e293b; }

/* 필터 패널 */
.filter-panel { background: white; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.filter-row { display: flex; align-items: flex-end; gap: 16px; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 180px; }
.filter-label { font-size: 12px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 4px; }
.filter-select { padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: #fff; }
.search-group { flex: 1; }
.search-box { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
.search-input { border: none; background: transparent; outline: none; width: 100%; font-size: 14px; }

/* 테이블 */
.table-card { background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; }
.table-header { padding: 18px 24px; border-bottom: 1px solid #f1f5f9; }
.table-title { font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px; }
.data-table { width: 100%; border-collapse: collapse; min-width: 1000px; }
.data-table thead { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.data-table th { padding: 14px 18px; color: white; text-align: left; font-size: 12px; }
.data-table td { padding: 14px 18px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
.status-badge { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.status-pending { background: #fef3c7; color: #92400e; }
.status-shipping { background: #dbeafe; color: #1e40af; }
.status-completed { background: #d1fae5; color: #065f46; }

/* Sticky 컬럼 */
.sticky-col { position: sticky; right: 0; background: #fff; box-shadow: -4px 0 8px rgba(0,0,0,0.05); }
.data-row:hover .sticky-col { background: #f8fafc; }

/* 버튼 스타일 */
.btn-detail { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: #3b82f6; border: none; border-radius: 6px; color: white; font-size: 11px; font-weight: 600; cursor: pointer; }
.text-right { text-align: right; }
.text-center { text-align: center; }
.text-gray { color: #94a3b8; }
.text-blue { color: #2563eb; font-weight: 600; }

/* === 모달 스타일 === */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-card { background: white; border-radius: 20px; width: 100%; max-width: 700px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; animation: slideUp 0.3s ease; }

@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.modal-header { padding: 20px 24px; background: #f8fafc; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
.modal-title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; color: #1e293b; }
.modal-title i { color: #3b82f6; }
.btn-close { background: none; border: none; font-size: 24px; color: #94a3b8; cursor: pointer; }

.modal-body { padding: 24px; }
.order-info-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; background: #f1f5f9; padding: 16px; border-radius: 12px; margin-bottom: 24px; }
.info-item { display: flex; flex-direction: column; gap: 4px; }
.info-item .label { font-size: 11px; color: #64748b; font-weight: 600; }
.info-item .value { font-size: 14px; color: #1e293b; font-weight: 700; }

.item-table { width: 100%; border-collapse: collapse; }
.item-table th { padding: 12px; text-align: left; font-size: 12px; color: #64748b; border-bottom: 2px solid #f1f5f9; }
.item-table td { padding: 14px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
.item-table tfoot td { padding-top: 20px; border-top: 2px solid #e2e8f0; font-size: 15px; }

.modal-footer { padding: 20px 24px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 12px; }
.btn-approve { padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.btn-complete { padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.btn-close-modal { padding: 12px 24px; background: #f1f5f9; color: #64748b; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }

.empty-state { text-align: center; padding: 60px; color: #cbd5e1; }
.empty-state i { font-size: 48px; margin-bottom: 10px; }
</style>
