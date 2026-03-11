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
        <p class="page-subtitle">현장별 청소용품 및 피복 신청 현황을 관리하고 승인합니다</p>
      </div>
      <div class="header-actions">
        <button @click="fetchOrders" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #4f46e5; --card-bg: #eef2ff;">
        <div class="stat-icon"><i class="mdi mdi-clipboard-text-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">누적 신청</span>
          <span class="stat-value">{{ stats.total }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f59e0b; --card-bg: #fffbeb;">
        <div class="stat-icon"><i class="mdi mdi-clock-alert-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">대기 중</span>
          <span class="stat-value">{{ stats.pending }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #0ea5e9; --card-bg: #e0f2fe;">
        <div class="stat-icon"><i class="mdi mdi-truck-delivery-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">배송 중</span>
          <span class="stat-value">{{ stats.shipping }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #10b981; --card-bg: #ecfdf5;">
        <div class="stat-icon"><i class="mdi mdi-check-decagram-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">완료</span>
          <span class="stat-value">{{ stats.completed }}건</span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #8b5cf6; --card-bg: #f3e8ff;">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 신청 금액</span>
          <span class="stat-value text-lg">{{ formatPrice(stats.totalAmount) }}</span>
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
            <th class="text-center sticky-col" style="width: 100px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="order in filteredOrders" :key="order.regDt + order.mIdx" class="data-row">
            <td class="text-center text-gray">{{ order.regDt }}</td>
            <td class="font-bold text-dark">{{ order.siteName }}</td>
            <td>{{ order.applicant }} <span class="staff-id">({{order.memberId }})</span></td>
            <td class="text-blue">{{ order.summary }}</td>
            <td class="text-right font-bold">{{ formatPrice(order.totalAmount) }}</td>
            <td class="text-center">
                <span :class="[
                    'status-badge', order.status === 0 ? 'status-pending' :
                    order.status === 1 ? 'status-shipping' : 'status-completed'
                    ]">
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
                  <td class="text-right text-gray">{{ formatPrice(item.price) }}</td>
                  <td class="text-right font-bold">{{ formatPrice(item.price * item.qty) }}</td>
                </tr>
                </tbody>
                <tfoot>
                <tr>
                  <td colspan="3" class="text-right font-bold">최종 합계 금액</td>
                  <td class="text-right font-extrabold text-blue-lg">{{ formatPrice(selectedOrder.totalAmount) }}</td>
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
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 설정 === */
.order-management-page {
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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

.btn-refresh {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px;
  background: white; border: 1px solid #e2e8f0; border-radius: 8px;
  color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
.btn-refresh i { font-size: 16px; }

/* === 통계 카드 (플랫 디자인) === */
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 20px; margin-bottom: 24px;
}

.stat-card {
  background: white; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); display: flex; align-items: center; gap: 16px;
  transition: transform 0.2s, box-shadow 0.2s; position: relative; overflow: hidden;
}
.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
  background-color: var(--card-color);
}
.stat-card:hover { transform: translateY(-2px); border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }

.stat-icon {
  width: 48px; height: 48px; border-radius: 12px; background-color: var(--card-bg);
  display: flex; align-items: center; justify-content: center; position: relative; flex-shrink: 0;
}
.stat-icon i { font-size: 24px; color: var(--card-color); position: absolute; }

.stat-content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 12px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 22px; font-weight: 700; color: #1e293b; letter-spacing: -0.5px;}
.text-lg { font-size: 18px; }

/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.filter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 160px; }

.filter-label {
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569;
}
.filter-label i { font-size: 16px; color: #4f46e5; }

.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; outline: none; transition: all 0.2s; height: 42px; box-sizing: border-box;
}
.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

.search-group { display: flex; gap: 8px; flex: 1; min-width: 280px; align-items: flex-end;}
.search-box {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #f8fafc;
  border: 1px solid #e2e8f0; border-radius: 8px; flex: 1; height: 42px; transition: all 0.2s; box-sizing: border-box;
}
.search-box:focus-within { background: white; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.search-input { border: none; background: transparent; outline: none; width: 100%; font-size: 13px; color: #334155; }
.search-input::placeholder { color: #94a3b8; }
.search-box i { font-size: 18px; color: #94a3b8; }
.search-clear { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center;}
.search-clear:hover { background: #e2e8f0; color: #64748b; }

/* === 로딩 및 에러 === */
.loading-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px;
}
.spinner {
  width: 40px; height: 40px; border: 3px solid #f1f5f9; border-top-color: #4f46e5;
  border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p { margin-top: 16px; font-size: 14px; color: #64748b; }

/* === 테이블 === */
.table-card {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); overflow: hidden; max-width: 100%;
}
.table-header { padding: 18px 24px; border-bottom: 1px solid #e2e8f0; background: #ffffff; }
.table-title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; }
.table-title i { font-size: 20px; color: #4f46e5; }

.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

.data-table { width: 100%; border-collapse: collapse; min-width: 1000px; font-size: 13px; }
.data-table thead { background-color: #6d28d9; }
.data-table th { padding: 14px 16px; color: white; text-align: left; font-size: 12px; font-weight: 600; white-space: nowrap; border-bottom: none;}
.data-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
.data-row { transition: background 0.2s; }
.data-row:hover { background-color: #f8fafc; }

/* 텍스트/유틸 */
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-gray { color: #64748b; font-size: 12px;}
.text-blue { color: #4f46e5; }
.text-dark { color: #1e293b; }
.font-bold { font-weight: 700; }
.font-medium { font-weight: 500; }

.staff-id { font-size: 11px; color: #94a3b8; margin-left: 4px; font-weight: 400;}

/* 상태 배지 (플랫 파스텔톤) */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
  border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.status-pending { background-color: #fef3c7; color: #b45309; }
.status-shipping { background-color: #e0f2fe; color: #0369a1; }
.status-completed { background-color: #d1fae5; color: #065f46; }

/* 액션 버튼 */
.btn-detail {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 12px;
  background-color: #eef2ff; color: #4f46e5; border: none; border-radius: 6px;
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-detail:hover { background-color: #e0e7ff; color: #4338ca; }
.btn-detail i { font-size: 14px; }

/* Sticky 컬럼 */
.sticky-col { position: sticky; right: 0; box-shadow: -4px 0 8px rgba(0,0,0,0.03); z-index: 5; background: white;}
.data-table thead .sticky-col { z-index: 15; background-color: #6d28d9; border-left: 1px solid #5b21b6; box-shadow: none;}
.data-row:hover .sticky-col { background-color: #f8fafc; }

/* 빈 상태 */
.empty-row { background-color: white !important; }
.empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: #cbd5e1; display: block;}
.empty-state p { font-size: 14px; font-weight: 500; color: #64748b; margin: 0; }

/* === 모달창 스타일 === */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
}
.modal-card {
  background: white; border-radius: 16px; width: 100%; max-width: 700px; max-height: 90vh;
  display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); overflow: hidden; border: 1px solid #e2e8f0;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }

/* 모달 헤더 */
.modal-header {
  padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;
}
.modal-title { font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px; margin: 0;}
.modal-title i { color: #4f46e5; font-size: 20px;}
.btn-close {
  background: transparent; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; transition: 0.2s;
  display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 6px;
}
.btn-close:hover { background: #e2e8f0; color: #ef4444; }

/* 모달 바디 */
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }

.order-info-summary {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
  background: #f8fafc; padding: 16px 20px; border-radius: 10px; margin-bottom: 24px; border: 1px solid #e2e8f0;
}
.info-item { display: flex; flex-direction: column; gap: 4px; }
.info-item .label { font-size: 11px; color: #64748b; font-weight: 600; }
.info-item .value { font-size: 13px; color: #1e293b; font-weight: 700; }

/* 모달 테이블 */
.item-table-wrapper { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;}
.item-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.item-table thead { background-color: #f1f5f9; }
.item-table th { padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #475569; }
.item-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle;}
.item-table tfoot td { padding: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; background-color: #f8fafc; }
.text-blue-lg { color: #4f46e5; font-size: 16px; font-weight: 800; font-family: 'Inter', monospace; }
.font-extrabold { font-weight: 800; }

/* 모달 푸터 */
.modal-footer {
  padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0;
  display: flex; justify-content: flex-end; align-items: center; gap: 10px; border-radius: 0 0 16px 16px;
}

.btn-approve {
  background-color: #f59e0b; color: white; padding: 10px 20px; border-radius: 8px;
  font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px;
}
.btn-approve:hover { background-color: #d97706; transform: translateY(-1px);}

.btn-complete {
  background-color: #10b981; color: white; padding: 10px 20px; border-radius: 8px;
  font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px;
}
.btn-complete:hover { background-color: #059669; transform: translateY(-1px);}

.btn-close-modal {
  background: white; border: 1px solid #e2e8f0; color: #475569; padding: 10px 20px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s;
}
.btn-close-modal:hover { background: #f1f5f9; color: #1e293b;}

/* 스크롤바 커스텀 */
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

/* === 반응형 (Responsive) === */
@media (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .filter-group { flex: 1; min-width: calc(33% - 10px); }
  .search-group { width: 100%; flex: 1 1 100%; }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 14px; align-items: flex-start; }
  .header-actions { width: 100%; flex-direction: row; }
  .btn-refresh { flex: 1; justify-content: center; }

  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }

  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group, .search-group { width: 100%; min-width: 100%; }
  .filter-select { width: 100%; }

  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }

  .order-info-summary { grid-template-columns: 1fr; gap: 12px; }

  .modal-footer { flex-direction: column-reverse; align-items: stretch; gap: 10px;}
  .modal-footer button { width: 100%; justify-content: center; }
}
</style>
