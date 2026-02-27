<script setup>
import { ref, computed } from 'vue';

// 1. 상태 및 데이터
const searchTerm = ref(''); // 현장명 검색
const selectedStatus = ref('전체');
const statusOptions = ref(['전체', '신청 완료', '배송 중', '수령 완료']);

const orders = ref([
  {
    orderNo: 'REQ-240201-01', date: '2026-02-01', siteName: 'LH 위례 6단지', applicant: '김철수',
    summary: '락스 외 4건', totalAmount: 125000, status: '신청 완료',
    items: [ // 상세 품목 데이터
      { name: '락스(18L)', qty: 2, unit: '통', price: 25000 },
      { name: '고무장갑(L)', qty: 10, unit: '켤레', price: 1500 },
      { name: '대형 빗자루', qty: 5, unit: '개', price: 8000 }
    ]
  },
  {
    orderNo: 'REQ-240201-02', date: '2026-02-01', siteName: '강서 대명 강동', applicant: '이영희',
    summary: '쓰레기봉투(100L)', totalAmount: 50000, status: '배송 중',
    items: [
      { name: '쓰레기봉투(100L)', qty: 20, unit: '묶음', price: 2500 }
    ]
  },
]);

// 2. 모달 관련 상태
const isModalOpen = ref(false);
const selectedOrder = ref({});

// 3. 필터링 로직
const filteredOrders = computed(() => {
  return orders.value.filter(order => {
    const statusMatch = selectedStatus.value === '전체' || order.status === selectedStatus.value;
    const searchMatch = order.siteName.includes(searchTerm.value);
    return statusMatch && searchMatch;
  });
});

// 4. 모달 열기/닫기
const openModal = (order) => {
  selectedOrder.value = order;
  isModalOpen.value = true;
};
const closeModal = () => {
  isModalOpen.value = false;
  selectedOrder.value = {};
};

// 5. 금액 포맷팅
const formatPrice = (price) => price.toLocaleString() + '원';

// 6. 상태 변경 (더미)
const processOrder = (status) => {
  alert(`'${status}' 상태로 변경하시겠습니까? (API 호출)`);
  closeModal();
};
</script>

<template>
  <div class="site-list-page">
    <div class="page-header">
      <h2 class="page-title">용품 신청 관리</h2>
    </div>

    <div class="search-panel">
      <div class="input-group">
        <label class="input-label">상태:</label>
        <select v-model="selectedStatus" class="input-select">
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </div>
      <div class="input-group search-term-group">
        <input type="text" v-model="searchTerm" placeholder="현장명 검색..." class="input-text">
        <button class="btn btn-primary">검색</button>
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
        <tr>
          <th>신청번호</th>
          <th>신청일</th>
          <th>현장명</th>
          <th>신청자</th>
          <th>품목 요약</th>
          <th class="text-right">총 금액</th>
          <th>상태</th>
          <th class="text-center">상세</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="order in filteredOrders" :key="order.orderNo">
          <td>{{ order.orderNo }}</td>
          <td>{{ order.date }}</td>
          <td>{{ order.siteName }}</td>
          <td>{{ order.applicant }}</td>
          <td>{{ order.summary }}</td>
          <td class="text-right font-bold">{{ formatPrice(order.totalAmount) }}</td>
          <td>
            <span :class="['status-chip', `status-${order.status.replace(/\s/g, '')}`]">
              {{ order.status }}
            </span>
          </td>
          <td class="text-center">
            <button @click="openModal(order)" class="btn btn-sm btn-info">보기</button>
          </td>
        </tr>
        </tbody>
      </table>
    </div>

    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>신청 상세 ({{ selectedOrder.orderNo }})</h3>
          <button @click="closeModal" class="close-btn">&times;</button>
        </div>

        <div class="modal-body">
          <div class="info-row">
            <span><strong>현장명:</strong> {{ selectedOrder.siteName }}</span>
            <span><strong>신청자:</strong> {{ selectedOrder.applicant }}</span>
          </div>

          <table class="data-table modal-table">
            <thead>
            <tr>
              <th>품목명</th>
              <th class="text-center">단위</th>
              <th class="text-center">수량</th>
              <th class="text-right">단가</th>
              <th class="text-right">금액</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in selectedOrder.items" :key="item.name">
              <td>{{ item.name }}</td>
              <td class="text-center">{{ item.unit }}</td>
              <td class="text-center">{{ item.qty }}</td>
              <td class="text-right">{{ formatPrice(item.price) }}</td>
              <td class="text-right">{{ formatPrice(item.price * item.qty) }}</td>
            </tr>
            </tbody>
            <tfoot>
            <tr>
              <td colspan="4" class="text-right font-bold">합계</td>
              <td class="text-right font-bold text-blue">{{ formatPrice(selectedOrder.totalAmount) }}</td>
            </tr>
            </tfoot>
          </table>
        </div>

        <div class="modal-footer">
          <template v-if="selectedOrder.status === '신청 완료'">
            <button @click="processOrder('배송 중')" class="btn btn-success">승인 및 발주</button>
            <button class="btn btn-danger">반려</button>
          </template>
          <button @click="closeModal" class="btn btn-gray">닫기</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.page-header { margin-bottom: 20px; }
.page-title { font-size: 1.5rem; font-weight: 700; color: #1f2937; }
.search-panel { display: flex; align-items: center; gap: 15px; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; }
.input-group { display: flex; align-items: center; }
.input-label { margin-right: 8px; font-size: 0.9rem; font-weight: 500; color: #4b5563; white-space: nowrap; }
.input-text, .input-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; }
.search-term-group { gap: 8px; }
.btn { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: background-color 0.2s; white-space: nowrap; }
.btn-primary { background-color: #3b82f6; color: white; }
.btn-success { background-color: #10b981; color: white; }
.btn-info { background-color: #60a5fa; color: white; padding: 6px 10px; font-weight: 500; }
.btn-danger { background-color: #ef4444; color: white; }
.btn-gray { background-color: #9ca3af; color: white; }
.btn-sm { padding: 5px 10px; font-size: 0.85rem; }

.table-container { background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; /*min-width: 900px;*/ }
.data-table th, .data-table td { padding: 12px 15px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 0.9rem; }
.data-table th { background-color: #f9fafb; color: #1f2937; font-weight: 600; text-transform: uppercase; }
.text-right { text-align: right; }
.text-center { text-align: center; }
.font-bold { font-weight: bold; }
.text-blue { color: #2563eb; }

/* 상태 칩 */
.status-chip { padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
.status-신청완료 { background-color: #fef3c7; color: #b45309; }
.status-배송중 { background-color: #dbeafe; color: #1e40af; }
.status-수령완료 { background-color: #d1fae5; color: #065f46; }

/* === 모달 스타일 (추가) === */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: white; padding: 25px; border-radius: 8px; width: 600px; max-width: 90%; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
.modal-header h3 { margin: 0; font-size: 1.2rem; font-weight: 700; color: #1f2937; }
.close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666; }
.modal-body { margin-bottom: 20px; }
.info-row { display: flex; gap: 20px; margin-bottom: 15px; background: #f9fafb; padding: 10px; border-radius: 4px; }
.modal-table th { background-color: #f3f4f6; font-size: 0.85rem; padding: 8px; }
.modal-table td { padding: 8px; font-size: 0.9rem; border-bottom: 1px solid #eee; }
.modal-table tfoot td { padding-top: 15px; border-top: 2px solid #e5e7eb; font-size: 1rem; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; }
</style>
