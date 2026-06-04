<script setup>
import { ref, computed } from 'vue';

// ── 상태 관리 (필터 및 옵션) ─────────────────────────────
const showPersonalInfo = ref(true); // 개인정보표시

const filters = ref({
  department: '전체',
  bank: '전체',
  yearMonth: '2026-05',
  payDate: '2026.06.10(급여)',
  showApprovalLine: false, // 결재란출력
  showBirthDate: false,    // 생년월일출력
});

const payDateOptions = [
  '2026.06.10(급여)',
  '2026.06.09(급여)',
  '2026.06.05(급여)',
  '2026.06.04(급여)',
];

// ── 숫자 포맷팅 유틸 ───────────────────────────────────
const formatNum = (val) => {
  if (!val) return '0';
  return Number(val).toLocaleString('ko-KR');
};

// ── 마스킹 처리 (개인정보표시 체크 해제 시) ────────────────
const maskName = (name) => {
  if (showPersonalInfo.value) return name;
  if (!name) return '';
  if (name.length <= 2) return name.charAt(0) + '*';
  return name.charAt(0) + '*'.repeat(name.length - 2) + name.charAt(name.length - 1);
};

const maskAccount = (acc) => {
  if (showPersonalInfo.value) return acc;
  if (!acc) return '';
  const parts = acc.split('-');
  if (parts.length > 1) {
    parts[parts.length - 1] = '*'.repeat(parts[parts.length - 1].length);
    return parts.join('-');
  }
  return acc.substring(0, 6) + '*'.repeat(acc.length - 6);
};

const maskBirth = (birth) => {
  if (showPersonalInfo.value) return birth;
  if (!birth) return '';
  return birth.substring(0, 2) + '****';
};

// ── Mock 데이터 (이미지 기반) ──────────────────────────
// 실제 환경에서는 axios로 데이터를 받아온 뒤 이 배열에 넣어주면 됩니다.
const rawData = ref([
  { bank: '국민', dept: '08개포1.2차우...', empId: '602173', name: '최남규', birth: '870602', account: '879602-01-172610', amount: 1747760 },
  { bank: '국민', dept: '08개포1.2차우...', empId: '636605', name: '이봉식', birth: '420925', account: '427925-94-111839', amount: 1747760 },
  { bank: '국민', dept: '08개포1.2차우...', empId: '668955', name: '곽병임', birth: '340801', account: '347801-04-146019', amount: 1731210 },
  { bank: '국민', dept: '08개포1.2차우...', empId: '669059', name: '이경자', birth: '760212', account: '760-21-0295-921', amount: 1747760 },
  { bank: '국민', dept: '08개포1.2차우...', empId: '669436', name: '박춘자', birth: '010601', account: '019601-04-356089', amount: 1733760 },
  { bank: '국민', dept: '08개포1.2차우...', empId: '670158', name: '주세정', birth: '730602', account: '730602-04-221209', amount: 1747760 },
  { bank: '국민', dept: '08개포1.2차우...', empId: '670328', name: '나경열', birth: '420301', account: '425301-01-314777', amount: 1840970 },
  { bank: '국민', dept: '08개포1.2차우...', empId: '670511', name: '심선옥', birth: '810901', account: '816901-04-298588', amount: 1747760 },
  { bank: '국민', dept: '08개포1.2차우...', empId: '670512', name: '이원희', birth: '410102', account: '410102-01-524249', amount: 1747760 },
  { bank: '국민', dept: '08개포1.2차우...', empId: '670513', name: '노형자', birth: '040621', account: '046-21-0819-262', amount: 962970 },

  { bank: '국민', dept: '115자양우성2...', empId: '658115', name: '양봉조', birth: '040224', account: '042-24-0214-133', amount: 2435316 },
  { bank: '국민', dept: '115자양우성2...', empId: '658177', name: '이병희', birth: '040501', account: '045501-04-107864', amount: 2372040 },
  { bank: '국민', dept: '115자양우성2...', empId: '670324', name: '김종환', birth: '360302', account: '364302-04-087877', amount: 2372040 },

  { bank: '국민', dept: '116잠원한신-미화', empId: '602858', name: '김민정', birth: '800201', account: '802001-04-128149', amount: 1510520 },

  { bank: '국민', dept: '119제기이수브...', empId: '669565', name: '최성영', birth: '030102', account: '036102-04-212088', amount: 2695110 },
]);

// ── 데이터 그룹핑 (부서별 소계 처리) ─────────────────────
const groupedList = computed(() => {
  const groups = [];
  let currentGroup = null;

  rawData.value.forEach((row) => {
    // 부서가 바뀌면 새로운 그룹 생성
    if (!currentGroup || currentGroup.dept !== row.dept) {
      currentGroup = {
        bank: row.bank,
        dept: row.dept,
        rows: [],
        totalAmount: 0,
      };
      groups.push(currentGroup);
    }

    currentGroup.rows.push(row);
    currentGroup.totalAmount += Number(row.amount);
  });

  return groups;
});

// 전체 합계 계산
const grandTotalInfo = computed(() => {
  let count = 0;
  let amount = 0;
  rawData.value.forEach(row => {
    count++;
    amount += Number(row.amount);
  });
  return { count, amount };
});

// ── 조회 및 인쇄 함수 ─────────────────────────────────
const handleSearch = () => {
  alert('조회 로직을 실행합니다.');
};

const handlePrint = () => {
  window.print();
};
</script>

<template>
  <div class="payroll-transfer-page">
    <div class="page-header hide-on-print">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-star"></i> 급여 이체 출력
        </h1>
        <label class="check-personal-info">
          <input type="checkbox" v-model="showPersonalInfo" class="custom-chk" /> 개인정보표시
        </label>
      </div>
      <div class="header-actions">
        <button class="btn-search" @click="handleSearch">조회</button>
        <button class="btn-print" @click="handlePrint">인쇄</button>
      </div>
    </div>

    <div class="filter-panel hide-on-print">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">부서</label>
          <select class="filter-select" v-model="filters.department">
            <option value="전체">전체</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">이체은행</label>
          <select class="filter-select" v-model="filters.bank">
            <option value="전체">전체</option>
            <option value="국민">국민은행</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">지급년월</label>
          <input type="month" class="filter-select" v-model="filters.yearMonth" />
        </div>
        <div class="filter-group" style="position: relative;">
          <label class="filter-label">지급일자</label>
          <select class="filter-select highlight-select" v-model="filters.payDate">
            <option v-for="opt in payDateOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="check-opt"><input type="checkbox" v-model="filters.showApprovalLine" /> 결재란출력</label>
          <label class="check-opt"><input type="checkbox" v-model="filters.showBirthDate" /> 생년월일출력</label>
        </div>
      </div>
    </div>

    <div v-if="filters.showApprovalLine" class="approval-line">
      <table class="approval-table">
        <tr>
          <th rowspan="2" class="approval-title">결<br>재</th>
          <th>담당</th>
          <th>팀장</th>
          <th>대표이사</th>
        </tr>
        <tr>
          <td class="sign-box"></td>
          <td class="sign-box"></td>
          <td class="sign-box"></td>
        </tr>
      </table>
    </div>

    <div class="table-scroll-container">
      <table class="transfer-table">
        <thead>
        <tr>
          <th style="width: 8%;">은행명</th>
          <th style="width: 25%;">부서</th>
          <th style="width: 10%;">사번</th>
          <th style="width: 12%;">예금주</th>
          <th v-if="filters.showBirthDate" style="width: 12%;">생년월일</th>
          <th style="width: 20%;">계좌번호</th>
          <th style="width: 15%;">입금액</th>
        </tr>
        </thead>

        <tbody>
        <template v-for="(group, gIdx) in groupedList" :key="gIdx">

          <tr v-for="(row, rIdx) in group.rows" :key="row.empId">
            <td v-if="rIdx === 0" :rowspan="group.rows.length" class="text-center">{{ row.bank }}</td>
            <td v-if="rIdx === 0" :rowspan="group.rows.length" class="text-center">{{ row.dept }}</td>

            <td class="text-center">{{ row.empId }}</td>
            <td class="text-center">{{ maskName(row.name) }}</td>
            <td v-if="filters.showBirthDate" class="text-center">{{ maskBirth(row.birth) }}</td>
            <td class="text-center">{{ maskAccount(row.account) }}</td>
            <td class="text-right">{{ formatNum(row.amount) }}</td>
          </tr>

          <tr class="row-subtotal">
            <td class="text-center font-bold">소계</td>
            <td class="text-center font-bold">{{ formatNum(group.rows.length) }}</td>
            <td :colspan="filters.showBirthDate ? 4 : 3" class="bg-subtotal"></td>
            <td class="text-right font-bold text-dark">{{ formatNum(group.totalAmount) }}</td>
          </tr>

        </template>
        </tbody>

        <tfoot>
        <tr class="row-total">
          <td class="text-center font-bold text-dark">합계</td>
          <td class="text-center font-bold text-dark">{{ formatNum(grandTotalInfo.count) }}</td>
          <td :colspan="filters.showBirthDate ? 4 : 3" class="bg-total"></td>
          <td class="text-right font-bold text-dark">{{ formatNum(grandTotalInfo.amount) }}</td>
        </tr>
        </tfoot>
      </table>
    </div>

  </div>
</template>

<style scoped>
.btn-search {
  background-color: #1a3b5c;
  color: #fff;
  border: 1px solid #1a3b5c;
  padding: 6px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 4px;
}
.btn-print {
  background-color: #fff;
  color: #1a3b5c;
  border: 1px solid #1a3b5c;
  padding: 6px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 4px;
}

/* ─── 필터 영역 (이미지 UI 재현) ─── */
.filter-section {
  padding: 12px 24px;
  border-bottom: 1px solid #c8d4e0;
  background-color: #fcfcfc;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 30px;
}

.f-group {
  display: flex;
  align-items: center;
}

.f-label {
  font-size: 13px;
  font-weight: 700;
  color: #333;
  width: 60px;
}

.f-divider {
  color: #1a3b5c;
  margin: 0 10px;
  font-weight: bold;
}

.f-select, .f-input {
  border: 1px solid #ccc;
  padding: 4px 8px;
  font-size: 13px;
  min-width: 140px;
  height: 28px;
  box-sizing: border-box;
}

.f-select:focus, .f-input:focus {
  outline: none;
  border-color: #1a3b5c;
}

/* 포커스된 select 박스 효과 (이미지 재현) */
.highlight-select {
  border-color: #1a3b5c;
  box-shadow: 0 0 0 1px #1a3b5c;
}

.f-options {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: -10px;
}

.check-opt {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

/* ─── 결재란 (옵션) ─── */
.approval-line {
  display: flex;
  justify-content: flex-end;
  padding: 10px 24px 0;
}
.approval-table {
  border-collapse: collapse;
  text-align: center;
  font-size: 13px;
}
.approval-table th, .approval-table td {
  border: 1px solid #333;
  padding: 4px 10px;
}
.approval-title {
  background: #f0f0f0;
  width: 25px;
}
.sign-box {
  height: 50px;
  width: 70px;
}

/* ─── 테이블 영역 ─── */
.table-section {
  padding: 16px 24px;
}

.transfer-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed; /* 컬럼 너비 고정 */
}

.transfer-table th, .transfer-table td {
  border: 1px solid #a8b8c8;
  padding: 8px 10px;
  vertical-align: middle;
}

/* 헤더 스타일 (다크 블루) */
.transfer-table thead th {
  background-color: #2b4b6b;
  color: #fff;
  font-weight: 600;
  text-align: center;
  border-color: #2b4b6b;
  border-right: 1px solid #5a7b9b;
}

/* 소계 행 스타일 (연한 하늘색) */
.row-subtotal td {
  background-color: #e0f0f5;
  border-color: #a8b8c8;
}
.bg-subtotal {
  background-color: #e0f0f5;
}

/* 합계 행 스타일 (조금 더 진한 파란색) */
.row-total td {
  background-color: #c0d8e0;
  border-color: #a8b8c8;
}
.bg-total {
  background-color: #c0d8e0;
}

/* 정렬 유틸 */
.text-center { text-align: center; }
.text-right { text-align: right; }
.font-bold { font-weight: 700; }
.text-dark { color: #111; }

/* ─── 인쇄용 미디어 쿼리 ─── */
@media print {
  @page {
    size: A4 landscape; /* 가로 방향 인쇄 */
    margin: 15mm;
  }

  /* 배경색과 테두리가 인쇄되도록 강제 설정 */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* 인쇄 시 불필요한 요소 숨김 */
  .hide-on-print {
    display: none !important;
  }

  /* 테이블을 전체 너비로 */
  .transfer-print-page {
    padding: 0;
  }
  .table-section {
    padding: 0;
  }

  .transfer-table {
    border: 2px solid #000;
  }
  .transfer-table th, .transfer-table td {
    border: 1px solid #666;
  }
}
</style>
