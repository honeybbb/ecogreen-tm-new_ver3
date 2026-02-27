<script setup>
import axios from 'axios';
import {ref} from "vue";
const settlements = ref([]);
const isLoading = ref(true);

// 필터 상태
const selectedYear = reactive({
  month: new Date().toISOString().slice(0, 7), // YYYY-MM
});

// 모달 제어 상태
const isModalOpen = ref(false);
const selectedId = ref(null);
const initialDataForModal = ref(null);

const selectedSite = ref('전체');

// 리스트 불러오기
const fetchList = async () => {
  isLoading.value = true;
  try {
    settlements.value = [
      { id: 1, siteName: '쌍용플래티넘고산', type: '청소', target_month: '2024-01', total_amount: 1542400 }
    ];
    //const res = await axios.get('/api/v1/settlements', { params: selectedYear });
    //settlements.value = res.data.list || [];
  } catch (error) {
    console.error('리스트 조회 에러:', error);
    // 테스트용 임시 데이터 (백엔드가 아직 없을 때 화면 확인용)
    settlements.value = [
      { id: 1, siteName: '쌍용플래티넘고산', type: '청소', target_month: '2024-01', total_amount: 1542400 }
    ];
  } finally {
    isLoading.value = false;
  }
};

// 상세/수정 클릭 (모달 열기)
const openEditModal = (item) => {
  selectedId.value = item.id;
  initialDataForModal.value = item;
  isModalOpen.value = true;
};

// 신규 작성 클릭
const openCreateModal = (idx) => {
  if(idx==null){
    selectedId.value = null;
    initialDataForModal.value = {
      siteName: '',
      type: '청소',
      target_month: selectedYear.month,
      total_amount: 0,
      // 정산서(공문) 기본 JSON 뼈대
      statement_data: [
        { category: '직접노무비', item: '기본급', price: 0, count: 1, note: '' },
        { category: '직접노무비', item: '연차수당', price: 0, count: 1, note: '' }
      ],
      // 세부내역서(인원별) 기본 JSON 뼈대
      details_data: [
        { name: '', position: '', birth_date: '', join_date: '', basic_pay: 0, deduction: 0, note: '' }
      ]
    };
    isModalOpen.value = true;
  } else {
    selectedId.value = idx;
    initialDataForModal.value = {

    }
    isModalOpen.value = true;
  }

};

onMounted(fetchList);
watch(() => selectedYear.month, fetchList);
</script>

<template>
  <div class="settlement-list-page">
    <div class="page-header">
      <h2 class="page-title">정산서 및 내역서 관리</h2>
      <p class="text-sm text-gray-500">월별 단지 정산 내역을 관리합니다.</p>
    </div>

    <div class="search-panel">
      <div class="input-group search-term-group">
        <input type="month" v-model="selectedYear.month" class="input-text" />
        <select id="input-select" v-model="selectedSite" class="input-select">
          <option value="전체">전체</option>
          <option v-for="site in siteOptions" :key="site" :value="site.idx">{{ site.name }}</option>
        </select>
        <button @click="openCreateModal(null)" class="btn btn-register">+ 새 정산서 작성</button>
      </div>


    </div>

    <div v-if="isLoading" class="loader-box">
      <span class="loader"></span> 데이터를 불러오는 중...
    </div>

    <div v-else-if="settlements.length === 0" class="empty-box">
      해당 월에 등록된 정산서가 없습니다.
    </div>

    <!--div v-else class="list-grid">
      <div v-for="item in settlements" :key="item.id" class="item-card" @click="openEditModal(item)">
        <div class="card-tag" :class="item.type === '청소' ? 'tag-clean' : 'tag-guard'">
          {{ item.type }}
        </div>
        <h3>{{ item.siteName }}</h3>
        <p class="month">{{ item.target_month }}</p>
        <div class="amount">{{ (item.total_amount || 0).toLocaleString() }} 원</div>
        <div class="footer">클릭하여 내역 확인/수정</div>
      </div>
    </div-->
    <div v-else class="table-container">
      <table class="data-table">
      <thead>
      <tr>
        <th>No.</th>
        <th>현장</th>
        <th>구분</th>
        <th>청구연월</th>
        <th>청구금액</th>
        <th>정산서</th>
        <th>청구내역서</th>
      </tr>
      </thead>
      <tbody>
      <tr v-for="item in settlements">
        <td>{{ item.id}}</td>
        <td>{{item.siteName}}</td>
        <td>{{item.type}}</td>
        <td>{{item.target_month}}</td>
        <td>{{formatCurrency(item.total_amount)}}</td>
        <td><button class="btn btn-success" @click="openCreateModal">정산서 보기</button></td>
        <td><button class="btn btn-success" @click="openCreateModal">내역서 보기</button></td>
      </tr>
      </tbody>
    </table>
    </div>

    <SettlementModal
        :is-open="isModalOpen"
        :settlement-id="selectedId"
        :initial-data="initialDataForModal"
        @close="isModalOpen = false"
        @save="fetchList"
    />
  </div>
</template>

<style scoped>
.loader-box, .empty-box { text-align: center; padding: 50px; background: #f9fafb; border-radius: 12px; color: #6b7280; }

.list-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
.item-card {
  background: white; border-radius: 12px; padding: 25px 20px; border: 1px solid #e5e7eb;
  cursor: pointer; transition: all 0.2s ease; position: relative; box-shadow: 0 4px 6px rgba(0,0,0,0.02);
}
.item-card:hover { transform: translateY(-4px); box-shadow: 0 12px 20px rgba(0,0,0,0.08); border-color: #3b82f6; }

.card-tag { position: absolute; top: 20px; right: 20px; font-size: 12px; padding: 4px 10px; border-radius: 6px; font-weight: bold; }
.tag-clean { background: #ecfdf5; color: #059669; }
.tag-guard { background: #eff6ff; color: #2563eb; }

.item-card h3 { margin: 0 0 5px 0; font-size: 18px; color: #1f2937; padding-right: 50px; }
.month { color: #6b7280; font-size: 14px; margin: 0 0 15px 0; }
.amount { font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 15px; }
.footer { font-size: 13px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 12px; text-align: center; }
</style>
