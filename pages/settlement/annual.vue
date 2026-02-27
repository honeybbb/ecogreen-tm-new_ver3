<script setup>
import { ref, computed } from 'vue';
import axios from 'axios';

// 1. 상태 및 데이터
const currentYear = new Date().getFullYear();
const selectedSite = ref('전체');
const selectedStaff = ref('');
const isModalOpen = ref(false);
const editingStaff = ref(null);

const siteOptions = ref(['전체', 'LH 위례 6단지', '강서 대명 강동', 'LH 율곡 제일 8단지']);

// 2. 직원 연차 데이터 (일급/통상임금 dailyWage 추가)
const annualLeaveData = ref([
  { sIdx: 1, site: 'LH 위례 6단지', name: '김철수', inDate: '2024-03-01', middleDt: '2022-11-28', dailyWage: 96000, count: 15.0, carriedOver: 2.0, used_count: 3.5, remaining: 13.5 },
  { sIdx: 2, site: 'LH 위례 6단지', name: '이영희', inDate: '2025-01-15', middleDt: '2023-05-17', dailyWage: 85000, count: 11.0, carriedOver: 0.0, used_count: 1.0, remaining: 10.0 },
  { sIdx: 3, site: '강서 대명 강동', name: '박민준', inDate: '2020-05-10', middleDt: '', dailyWage: 105000, count: 17.0, carriedOver: 5.0, used_count: 22.0, remaining: 0.0 },
  { sIdx: 4, site: 'LH 율곡 제일 8단지', name: '최지우', inDate: '2023-10-01', middleDt: '2023-08-10', dailyWage: 92000, count: 15.0, carriedOver: 1.0, used_count: 5.0, remaining: 11.0 },
]);

// 3. 필터링 및 추계액 계산
const filteredStaff = computed(() => {
  return annualLeaveData.value.filter(staff => {
    const siteMatch = selectedSite.value === '전체' || staff.sIdx === selectedSite.value;
    const staffMatch = selectedStaff.value === '' || staff.staff.includes(selectedStaff.value);
    return siteMatch && staffMatch;
  }).map(staff => ({
    ...staff,
    // 추계액 = 잔여일수 * 통상임금(일급)
    estimatedCost: staff.remaining * staff.dailyWage
  }));
});

// 4. 합계 계산 (하단 Footer용)
const totalSummary = computed(() => {
  const totalRemaining = filteredStaff.value.reduce((acc, cur) => Number(acc) + cur.remaining, 0);
  const totalCost = filteredStaff.value.reduce((acc, cur) => Number(acc) + cur.estimatedCost, 0);
  return { totalRemaining: totalRemaining, totalCost };
});

// 5. 모달 및 조정 로직 (기존 코드 유지)
const openAdjustModal = (staff) => {
  editingStaff.value = { ...staff, adjustmentValue: 0, adjustmentReason: '' };
  isModalOpen.value = true;
};

const saveAdjustment = () => {
  if (!editingStaff.value.adjustmentReason) {
    alert('조정 사유를 입력해주세요.');
    return;
  }
  const index = annualLeaveData.value.findIndex(s => s.id === editingStaff.value.id);
  if (index !== -1) {
    const adj = parseFloat(editingStaff.value.adjustmentValue);
    annualLeaveData.value[index].carriedOver += adj;
    // 잔여일수 재계산
    annualLeaveData.value[index].remaining = annualLeaveData.value[index].count + annualLeaveData.value[index].carriedOver - annualLeaveData.value[index].used_count;
    alert('조정되었습니다.');
  }
  isModalOpen.value = false;
};
const getMemberAnnualLeave = async () => {
  const params = {
    year: currentYear
  }
  axios.get(`/api/v1/payroll/annual`, {params})
      .then(res => {
        console.log(res.data.data)
        annualLeaveData.value = res.data.data
      })
}

const formatMoney = (val) => val ? val.toLocaleString() + '원' : '0원';
onMounted(() => {
  getMemberAnnualLeave();
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">연차 추계액 및 현황 관리</h2>
      <p class="text-sm text-gray-500">직원별 잔여 연차 일수와 미사용 연차 수당 추계액을 관리합니다.</p>
    </div>

    <div class="search-panel">
      <div class="input-group">
        <label class="input-label">귀속연도:</label>
        <select v-model="currentYear" class="input-text" @change="">
          <option>2025</option>
          <option>2026</option>
        </select>
      </div>

      <div class="input-group">
        <label class="input-label">현장:</label>
        <select v-model="selectedSite" class="input-select">
          <option v-for="site in siteOptions" :key="site" :value="site">{{ site }}</option>
        </select>
      </div>
      <div class="input-group">
        <input type="text" v-model="selectedStaff" placeholder="직원명 검색" class="input-text">
        <button class="btn btn-primary">조회</button>
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
        <tr>
          <th>No.</th>
          <!--th>현장명</th-->
          <th>직원명</th>
          <th>직책</th>
          <th>입사일</th>
          <!--th class="text-right">통상임금(일)</th-->
          <th class="text-center">중간 정산일</th>
          <th class="text-center">정산(재직)기간</th>
          <th class="text-center">총 발생</th>
          <th class="text-center">사용</th>
          <th class="text-center">잔여</th>
          <th class="text-right bg-blue-50">연차수당 추계액</th>
          <th class="text-right bg-blue-50">비고</th>
          <!--th class="text-center">관리</th-->
        </tr>
        </thead>
        <tbody>
        <tr v-for="(staff, index) in filteredStaff" :key="staff.id">
          <td>{{ index + 1 }}</td>
          <!--td>{{ staff.site }}</td-->
          <td class="font-bold text-blue-600">{{ staff.name }}</td>
          <td class="text-center">{{ staff.position || '팀원' }}</td>
          <td>{{ staff.inDate }}</td>
          <td>{{ staff.middleDt }}</td>
          <td class="text-right">{{ staff.middleDt ? staff.middleDt : staff.inDate }} ~ {{ new Date().toISOString().slice(0, 10) }}</td>
          <td class="text-center">{{ staff.count }}</td>
          <td class="text-center text-red-500">{{ staff.used_count }}</td>
          <td class="text-center font-bold">{{ staff.remaining }}</td>
          <td class="text-right font-bold bg-blue-50">{{ formatMoney(staff.estimatedCost) }}</td>
          <td class="text-center">
            <!--button @click="openAdjustModal(staff)" class="btn btn-xs btn-adjust">조정</button-->
            {{ staff.count }} 중 {{staff.used_count}} 개 사용
          </td>
        </tr>
        </tbody>
        <tfoot v-if="filteredStaff.length > 0">
        <tr>
          <td colspan="8" class="text-center font-bold bg-gray-100">합계</td>
          <!--          <td class="text-center font-bold bg-gray-100">{{ totalSummary.totalRemaining.toFixed(1) }}일</td>-->
          <td class="text-center font-bold bg-gray-100">{{ totalSummary.totalRemaining }}일</td>
          <td class="text-right font-bold text-blue-700 bg-gray-100">{{ formatMoney(totalSummary.totalCost) }}</td>
          <td class="bg-gray-100"></td>
        </tr>
        </tfoot>
      </table>
    </div>

    <div v-if="isModalOpen" class="modal-overlay">
      <div class="modal-content">
        <h3>연차 조정 ({{ editingStaff.staff }})</h3>
        <div class="input-group-v">
          <label>조정 일수 ( +/- )</label>
          <input type="number" v-model="editingStaff.adjustmentValue" class="input-text" step="0.5">
        </div>
        <div class="input-group-v">
          <label>사유</label>
          <textarea v-model="editingStaff.adjustmentReason" class="input-text"></textarea>
        </div>
        <div class="modal-actions">
          <button @click="isModalOpen = false" class="btn btn-secondary">취소</button>
          <button @click="saveAdjustment" class="btn btn-success">저장</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 20px; }
.page-title { font-size: 1.5rem; font-weight: 700; color: #1f2937; }
.search-panel { display: flex; gap: 15px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px; }
.input-group { display: flex; align-items: center; gap: 8px; }
.input-text, .input-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; }
.btn { padding: 8px 15px; border-radius: 4px; font-weight: 600; cursor: pointer; border: none; }
.btn-primary { background: #3b82f6; color: white; }
.btn-adjust { background: #f59e0b; color: white; }
.btn-secondary { background: #e5e7eb; color: #374151; }
.btn-success { background: #10b981; color: white; }
.btn-xs { padding: 4px 8px; font-size: 0.8rem; }

.table-container { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; min-width: 900px; }
.data-table th, .data-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 0.9rem; }
.data-table th { background: #f9fafb; font-weight: 600; }
.data-table tfoot td { border-top: 2px solid #cbd5e1; }

.text-right { text-align: right; }
.text-center { text-align: center; }
.font-bold { font-weight: 700; }
.text-red-500 { color: #ef4444; }
.text-blue-600 { color: #2563eb; }
.text-blue-700 { color: #1d4ed8; }
.bg-blue-50 { background-color: #eff6ff; }
.bg-gray-100 { background-color: #f3f4f6; }

/* 모달 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 50; }
.modal-content { background: white; padding: 25px; border-radius: 8px; width: 400px; }
.input-group-v { display: flex; flex-direction: column; margin-bottom: 15px; }
.input-group-v label { font-weight: 600; margin-bottom: 5px; font-size: 0.9rem; color: #4b5563; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
