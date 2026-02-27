<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from "axios";

// 1. 상태 및 데이터
const staffList = ref([]); // API에서 받아온 원본 데이터
const selectedSite = ref('전체'); // 필터용
const searchName = ref('');     // 검색용

// 2. 데이터 가져오기 (API 호출)
const getRetirements = async () => {
  try {
    const res = await axios.get('/api/v1/payroll/retirement');
    staffList.value = res.data.data || [];
  } catch (error) {
    console.error("퇴직금 추계액 로딩 실패:", error);
  }
};

// 3. 필터링 로직 (검색어 & 현장명)
// 이미 계산된 데이터 내에서 '보여줄 항목'만 걸러냅니다.
const filteredList = computed(() => {
  return staffList.value.filter(staff => {
    // 현장명 필터 (API에서 siteName을 준다고 가정)
    const matchSite = selectedSite.value === '전체' || (staff.siteName && staff.siteName === selectedSite.value);
    // 이름 검색
    const matchName = searchName.value === '' || staff.name.includes(searchName.value);

    return matchSite && matchName;
  });
});

// 4. 합계 계산 (1년 이상 대상자만 집계)
const summary = computed(() => {
  // 퇴직금(retirementPay)이 0보다 큰 사람만 필터링 (= 1년 이상 근무자)
  const eligibleStaff = filteredList.value.filter(staff => staff.retirementPay > 0);

  // 필터링된 인원들의 퇴직금 합계
  const totalAmount = eligibleStaff.reduce((acc, cur) => acc + cur.retirementPay, 0);

  return {
    count: eligibleStaff.length, // 지급 대상 인원 수
    totalAmount                  // 지급 대상 총액
  };
});

// 유틸리티: 금액 포맷
const formatMoney = (val) => {
  if (!val) return '0원';
  return Number(val).toLocaleString() + '원';
};

onMounted(() => {
  getRetirements();
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">퇴직금 추계액 관리</h2>
      <p class="page-subtitle">현재 기준(오늘)으로 산출된 예상 퇴직금 현황입니다.</p>
    </div>

    <div class="summary-cards">
      <div class="summary-item">
        <span class="label">지급 대상자 (1년 이상)</span>
        <span class="value">{{ summary.count }} 명</span>
      </div>
      <div class="summary-item highlight">
        <span class="label">퇴직급여 충당 부채총액</span>
        <span class="value text-red">{{ formatMoney(summary.totalAmount) }}</span>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
        <tr>
          <!--th>현장</th-->
          <th>No.</th>
          <th>이름</th>
          <th>입사일</th>
          <th class="text-center">근속일수</th>
          <th class="text-right">기준 급여(통상)</th>
          <th class="text-center">지급대상</th>
          <th class="text-right highlight-th">예상 퇴직금</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="(staff, i) in filteredList" :key="staff.idx">
          <!--td>{{ staff.siteName || '-' }}</td-->
          <td>{{i+1}}</td>

          <td class="font-bold">{{ staff.name }}</td>

          <td class="text-gray">{{ staff.inDate }}</td>

          <td class="text-center">
            {{ Number(staff.workDays).toLocaleString() }}일
            <span class="text-sm text-gray">
              ({{ (staff.workDays / 365).toFixed(1) }}년)
            </span>
          </td>

          <td class="text-right text-gray-500">
            {{ formatMoney(staff.baseSalary) }}
          </td>

          <td class="text-center">
            <span v-if="staff.workDays >= 365" class="badge badge-green">지급 대상</span>
            <span v-else class="badge badge-gray">1년 미만</span>
          </td>

          <td class="text-right font-bold text-red">
            {{ formatMoney(staff.retirementPay) }}
          </td>
        </tr>

        <tr v-if="filteredList.length === 0">
          <td colspan="7" class="empty-msg">데이터가 없거나 조회 중입니다.</td>
        </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* 기존 스타일 그대로 유지 */
.page-container { /*padding: 20px;*/ background: #f8fafc; min-height: 100vh; }
.page-header { margin-bottom: 20px; }
.page-title { font-size: 1.5rem; font-weight: 700; color: #1e293b; }
.page-subtitle { color: #64748b; font-size: 0.9rem; margin-top: 5px; }

.summary-cards { display: flex; gap: 20px; margin-bottom: 25px; }
.summary-item {
  flex: 1; background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;
  display: flex; flex-direction: column; gap: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.summary-item.highlight { border-bottom: 3px solid #ef4444; background: #fef2f2; }
.summary-item .label { font-size: 0.9rem; color: #64748b; font-weight: 600; }
.summary-item .value { font-size: 1.4rem; font-weight: 800; color: #0f172a; }

.table-wrapper { background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; }
.data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.data-table th, .data-table td { padding: 14px 12px; border-bottom: 1px solid #f1f5f9; }
.data-table th { background: #f8fafc; font-weight: 600; text-align: left; color: #475569; }

.highlight-th { background: #fff1f2 !important; color: #991b1b !important; }
.text-right { text-align: right; }
.text-center { text-align: center; }
.font-bold { font-weight: 700; }
.text-red { color: #dc2626; }
.text-gray { color: #6b7280; }
.text-gray-500 { color: #9ca3af; } /* 기준급여용 연한 색 */
.text-sm { font-size: 0.8rem; }

.badge { padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-gray { background: #f3f4f6; color: #9ca3af; }

.empty-msg { text-align: center; padding: 40px; color: #9ca3af; }
</style>
