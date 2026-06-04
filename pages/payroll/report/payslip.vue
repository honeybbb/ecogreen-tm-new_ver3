<script setup>
import { ref, computed } from 'vue';

// ── 상태 관리 (UI 옵션 및 필터) ─────────────────────────────
const showPersonalInfo = ref(true); // 개인정보표시

const filters = ref({
  yearMonth: '2026-05',
  payDate: '2026.06.09(급여)',
  department: '전체',
  empId: '', // 사번 검색
  outputType: '지급대장A', // 출력물 타입

  // 체크박스 옵션
  showApprovalLine: false, // 결재란출력
  printVertical: true,     // 세로출력
  printPayDate: false,     // 지급일인쇄

  // 라디오 옵션 (그룹핑 방식)
  groupOption: 'skip', // 'skip' | 'no-skip' | 'role-emp-dept'
});

const payDateOptions = [
  '2026.06.09(급여)',
  '2026.06.10(급여)',
  '2026.06.05(급여)',
];

const outputTypeOptions = [
  '지급대장A',
  '지급대장B',
  '개인별명세서',
];

// ── 숫자 포맷팅 및 마스킹 유틸 ──────────────────────────────
const formatNum = (val) => {
  if (!val && val !== 0) return '';
  return Number(val).toLocaleString('ko-KR');
};

const maskName = (name) => {
  if (showPersonalInfo.value) return name;
  if (!name) return '';
  if (name.length <= 2) return name.charAt(0) + '*';
  return name.charAt(0) + '*'.repeat(name.length - 2) + name.charAt(name.length - 1);
};

// ── Mock 데이터 (이미지 기반) ──────────────────────────────
const rawData = ref([
  { dept: '488답십리래미안...', empId: '656927', name: '김홍자', role: '총괄팀장', days: 31, gross: 2516710, ded: 164530, net: 2352180 },
  { dept: '488답십리래미안...', empId: '656928', name: '심연선', role: '미화반장', days: 31, gross: 1709190, ded: 99240, net: 1609950 },
  { dept: '488답십리래미안...', empId: '690492', name: '한순덕', role: '미화반장', days: 31, gross: 1709190, ded: 99240, net: 1609950 },
  { dept: '488답십리래미안...', empId: '656929', name: '정숙자', role: '미화원', days: 30, gross: 1605670, ded: 79540, net: 1526130 },
  { dept: '488답십리래미안...', empId: '656930', name: '이옥화A', role: '미화원', days: 31, gross: 1659190, ded: 95620, net: 1563570 },
  { dept: '488답십리래미안...', empId: '656932', name: '박병애', role: '미화원', days: 31, gross: 1659190, ded: 80690, net: 1578500 },
  { dept: '488답십리래미안...', empId: '656939', name: '이항옥', role: '미화원', days: 31, gross: 1659190, ded: 80690, net: 1578500 },
  { dept: '488답십리래미안...', empId: '656940', name: '신용자', role: '미화원', days: 31, gross: 1659190, ded: 95620, net: 1563570 },
  { dept: '488답십리래미안...', empId: '657085', name: '장성숙', role: '미화원', days: 31, gross: 1659190, ded: 174420, net: 1484770 },
  { dept: '488답십리래미안...', empId: '658011', name: '조천옥', role: '미화원', days: 31, gross: 1659190, ded: 80690, net: 1578500 },
  { dept: '488답십리래미안...', empId: '658059', name: '박영순B', role: '미화원', days: 31, gross: 1659190, ded: 80690, net: 1578500 },
  { dept: '488답십리래미안...', empId: '658113', name: '심재안', role: '미화원', days: 31, gross: 1659190, ded: 95620, net: 1563570 },
  { dept: '488답십리래미안...', empId: '658133', name: '송민숙', role: '미화원', days: 31, gross: 1659190, ded: 80690, net: 1578500 },
  { dept: '488답십리래미안...', empId: '690497', name: '윤민자', role: '미화원', days: 31, gross: 1659190, ded: 80690, net: 1578500 },
  { dept: '488답십리래미안...', empId: '690498', name: '손영숙', role: '미화원', days: 11, gross: 588740, ded: 67470, net: 521270 },
  { dept: '488답십리래미안...', empId: '695253', name: '최순자B', role: '미화원', days: 9, gross: 481700, ded: 67470, net: 414230 },
]);

// 필터링 적용 (실제 환경에서는 API 요청 시 파라미터로 사용)
const filteredList = computed(() => {
  return rawData.value.filter(row => {
    if (filters.value.empId && !row.empId.includes(filters.value.empId)) return false;
    return true;
  });
});

// 전체 합계 계산
const grandTotalInfo = computed(() => {
  let count = 0;
  let gross = 0;
  let ded = 0;
  let net = 0;

  filteredList.value.forEach(row => {
    count++;
    gross += Number(row.gross);
    ded += Number(row.ded);
    net += Number(row.net);
  });

  return { count, gross, ded, net };
});

// ── 액션 핸들러 ──────────────────────────────────────────
const handleSearch = () => {
  alert('명세서/지급대장 조회를 실행합니다.');
};

const handlePrint = () => {
  window.print();
};
</script>

<template>
  <div class="payslip-print-page" :class="{ 'print-portrait': filters.printVertical }">
    <div class="page-header hide-on-print">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-star"></i> 명세서 출력
        </h1>
        <label class="check-personal-info">
          <input type="checkbox" v-model="showPersonalInfo" class="custom-chk" /> 개인정보 표시
        </label>
      </div>
      <div class="action-area">
        <button class="btn-search" @click="handleSearch">조회</button>
        <button class="btn-print" @click="handlePrint">인쇄</button>
      </div>
    </div>

    <div class="filter-panel hide-on-print">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label text-orange">
            <i class="mdi mdi-circle-small"></i> 지급년월
          </label>
          <input type="month" class="filter-select" v-model="filters.yearMonth" />
        </div>

        <div class="filter-group">
          <label class="filter-label text-orange">
            <i class="mdi mdi-circle-small"></i> 지급일자
          </label>
          <select class="filter-select highlight-select" v-model="filters.payDate">
            <option v-for="opt in payDateOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">부서</label>
          <select class="filter-select dept-select" v-model="filters.department">
            <option value="전체">488 | 488 답십리래미안위브-미화</option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label text-orange">
            <i class="mdi mdi-circle-small"></i> 사번
          </label>
          <input type="text" class="filter-select emp-input" v-model="filters.empId" placeholder="사번 입력" />
        </div>
      </div>

      <div class="filter-row options-row">
        <div class="filter-group">
          <span class="filter-label">출력물</span>
          <select class="filter-select" v-model="filters.outputType">
            <option v-for="opt in outputTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <div class="f-options-chk">
          <label class="check-opt"><input type="checkbox" v-model="filters.showApprovalLine" /> 결재란출력</label>
          <label class="check-opt"><input type="checkbox" v-model="filters.printVertical" /> 세로출력</label>
          <label class="check-opt"><input type="checkbox" v-model="filters.printPayDate" /> 지급일인쇄</label>
        </div>

        <!--span class="f-divider" style="margin: 0 16px;">|</span-->

        <div class="f-options-radio">
          <label class="radio-opt">
            <input type="radio" value="skip" v-model="filters.groupOption" /> 부서계(스킵)
          </label>
          <label class="radio-opt text-gray">
            <input type="radio" value="no-skip" v-model="filters.groupOption" /> 부서계(노스킵)
          </label>
          <label class="radio-opt text-gray">
            <input type="radio" value="role-emp-dept" v-model="filters.groupOption" /> 직위>사번>부서
          </label>
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
      <table class="statement-table">
        <thead>
        <tr>
          <th style="width: 18%;">부서명</th>
          <th style="width: 10%;">사번</th>
          <th style="width: 10%;">성명</th>
          <th style="width: 10%;">직위</th>
          <th style="width: 8%;">계산일수</th>
          <th style="width: 14%;">지급총액</th>
          <th style="width: 14%;">공제합계</th>
          <th style="width: 16%;">실수령액</th>
        </tr>
        </thead>

        <tbody>
        <tr v-for="row in filteredList" :key="row.empId" class="data-row">
          <td class="text-left cell-ellipsis">{{ row.dept }}</td>
          <td class="text-center text-gray">{{ row.empId }}</td>
          <td class="text-center font-bold text-dark">{{ maskName(row.name) }}</td>
          <td class="text-center">{{ row.role }}</td>
          <td class="text-center">{{ row.days }}</td>
          <td class="text-right text-dark">{{ formatNum(row.gross) }}</td>
          <td class="text-right text-red">{{ formatNum(row.ded) }}</td>
          <td class="text-right font-bold text-blue">{{ formatNum(row.net) }}</td>
        </tr>

        <tr v-if="filteredList.length === 0">
          <td colspan="8" class="text-center" style="padding: 40px; color: #888;">
            조회된 데이터가 없습니다.
          </td>
        </tr>
        </tbody>

        <tfoot>
        <tr class="row-total">
          <td class="text-center font-bold text-dark">합계</td>
          <td class="text-center font-bold text-dark">{{ formatNum(grandTotalInfo.count) }}</td>
          <td colspan="3" class="bg-total"></td>
          <td class="text-right font-bold text-dark">{{ formatNum(grandTotalInfo.gross) }}</td>
          <td class="text-right font-bold text-dark">{{ formatNum(grandTotalInfo.ded) }}</td>
          <td class="text-right font-bold text-dark">{{ formatNum(grandTotalInfo.net) }}</td>
        </tr>
        </tfoot>
      </table>
  </div>
  </div>
</template>

<style scoped>
.check-personal-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #1a3b5c;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
}

.action-area {
  display: flex;
  gap: 8px;
}

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

/* ─── 필터 영역 (수직선 UI 2줄 레이아웃) ─── */
.filter-section {
  padding: 16px 24px;
  border-bottom: 1px solid #c8d4e0;
  background-color: #fcfcfc;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

/* 두 번째 줄 약간의 배경/패딩 조절로 그룹핑 효과 */
.options-row {
  padding-top: 14px;
  border-top: 1px dashed #e2e8f0;
}

.f-group {
  display: flex;
  align-items: center;
}

.f-label {
  font-size: 13px;
  font-weight: 700;
  color: #333;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.text-orange {
  color: #d97706; /* 필수 항목 느낌의 주황색 텍스트 */
}
.text-orange i {
  font-size: 10px;
  margin-right: 2px;
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
  height: 28px;
  box-sizing: border-box;
}

.f-select:focus, .f-input:focus {
  outline: none;
  border-color: #1a3b5c;
}

.highlight-select {
  border-color: #1a3b5c;
}

.dept-select { min-width: 220px; }
.emp-input { width: 100px; }

/* 체크박스 & 라디오 버튼 묶음 */
.f-options-chk, .f-options-radio {
  display: flex;
  align-items: center;
  gap: 16px;
}

.check-opt, .radio-opt {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-weight: 600;
}

/* 선택 안된 라디오 라벨 회색 처리 */
.radio-opt.text-gray {
  color: #888;
  font-weight: 400;
}
.radio-opt input[type="radio"]:checked + span {
  color: #1a3b5c;
  font-weight: 700;
}


/* ─── 결재란 (옵션) ─── */
.approval-line {
  display: flex;
  justify-content: flex-end;
  padding-bottom: 6px;
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

.table-scroll-container {
  overflow-x: auto;
  max-width: 100%;
  border: 1px solid #a8b8c8;
  border-bottom: none;
}

.statement-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
  min-width: 800px;
}

.statement-table th, .statement-table td {
  border: 1px solid #a8b8c8;
  padding: 8px 10px;
  vertical-align: middle;
}

/* 헤더 (다크 블루) */
.statement-table thead th {
  background-color: #2b4b6b;
  color: #fff;
  font-weight: 600;
  text-align: center;
  border-color: #2b4b6b;
  border-right: 1px solid #5a7b9b;
  position: sticky;
  top: 0;
  z-index: 10;
}

/* 데이터 행 */
.data-row {
  background-color: #fff;
}
.data-row:nth-child(even) {
  background-color: #f8fafc;
}
.data-row:hover {
  background-color: #e2e8f0;
}

/* 합계 행 (연한 파란색) */
.row-total td {
  background-color: #d0e4f0;
  border-color: #a8b8c8;
}
.bg-total {
  background-color: #d0e4f0;
}

/* 정렬 및 유틸 */
.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }
.font-bold { font-weight: 700; }
.text-dark { color: #111; }
.text-gray { color: #555; }
.text-red { color: #dc2626; }
.text-blue { color: #2563eb; }

.cell-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── 인쇄용 미디어 쿼리 ─── */
@media print {
  /* 세로출력 옵션에 따라 방향 변경 */
  .print-portrait {
    @page { size: A4 portrait; margin: 15mm; }
  }

  @page {
    size: A4 landscape; /* 기본 가로 인쇄 */
    margin: 15mm;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .hide-on-print {
    display: none !important;
  }

  .statement-print-page { padding: 0; }
  .table-section { padding: 0; }
  .table-scroll-container { border: none; overflow: visible; }

  .statement-table { border: 2px solid #000; }
  .statement-table th, .statement-table td { border: 1px solid #444; }
  .statement-table thead th { border-bottom: 2px solid #000; }
}
</style>
