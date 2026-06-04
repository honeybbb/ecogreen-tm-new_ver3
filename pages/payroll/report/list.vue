<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';

// ── 상태 관리 (필터) ─────────────────────────────
const filters = ref({
  yearMonth: '2026-05',
  empType: '청소용역', // 청소용역, 경비용역 등
});

const empTypeOptions = ['청소용역', '경비용역', '시설관리'];
const isLoading = ref(false);

// ── 숫자 포맷팅 유틸 ──────────────────────────────
const formatNum = (val) => {
  if (!val && val !== 0) return '';
  if (val === 0) return '0';
  return Number(val).toLocaleString('ko-KR');
};

// ── Mock 데이터 (엑셀 이미지 기반) ────────────────────────
const rawData = ref([]);

const fetchSummaryData = async () => {
  isLoading.value = true;
  let params = {
    year: filters.value.yearMonth.split('-')[0],
    month: filters.value.yearMonth.split('-')[1]
  }

  await axios.get('/api/v1/settle/payroll/summary', { params: params })
      .then((res) => {
        console.log(res.data.data, filters.value)
        rawData.value = res.data.data;
        isLoading.value = false;
      })
  /*
  setTimeout(() => {
    rawData.value = [
      { siteName: '동동스위트아파트(용인)', contractCnt: 3, currentCnt: 3, female: 3, male: 0, join: 0, resign: 0, gap: 0, billingAmt: 6021760, payrollCnt: 3, netPay: 4688350, note: '' },
      { siteName: '신동아아파트', contractCnt: 4, currentCnt: 4, female: 4, male: 0, join: 0, resign: 0, gap: 0, billingAmt: 7180060, payrollCnt: 4, netPay: 6214330, note: '반장 5만 별도' },
      { siteName: '광교마을', contractCnt: 9, currentCnt: 9, female: 7, male: 2, join: 0, resign: 0, gap: 0, billingAmt: 17806550, payrollCnt: 9, netPay: 15334960, note: '' },
      { siteName: '중앙하이츠', contractCnt: 2, currentCnt: 2, female: 2, male: 0, join: 0, resign: 0, gap: 0, billingAmt: 2864350, payrollCnt: 2, netPay: 2738350, note: '' },
      { siteName: '마산산에뜰림', contractCnt: 3, currentCnt: 3, female: 3, male: 0, join: 0, resign: 0, gap: 0, billingAmt: 5010480, payrollCnt: 3, netPay: 4699370, note: '' },
      { siteName: '푸른산힐스테이트2차', contractCnt: 12, currentCnt: 12, female: 10, male: 2, join: 0, resign: 0, gap: 0, billingAmt: 21117590, payrollCnt: 15, netPay: 16784750, note: '' },

      // 소계 분리를 위해 가상의 두 번째 그룹 생성
      { siteName: '고려대명E아파트', contractCnt: 2, currentCnt: 2, female: 2, male: 0, join: 0, resign: 0, gap: 0, billingAmt: 3383440, payrollCnt: 2, netPay: 2636300, note: '' },
      { siteName: '광교롯데캐슬파크', contractCnt: 18, currentCnt: 18, female: 16, male: 2, join: 0, resign: 0, gap: 0, billingAmt: 37175580, payrollCnt: 18, netPay: 29813870, note: '' },
      { siteName: '잠실동부센트레빌', contractCnt: 15, currentCnt: 15, female: 13, male: 2, join: 0, resign: 0, gap: 0, billingAmt: 27105410, payrollCnt: 15, netPay: 22182180, note: '' },
      { siteName: '농수동백송2차아파트', contractCnt: 3, currentCnt: 3, female: 3, male: 0, join: 0, resign: 0, gap: 0, billingAmt: 5770050, payrollCnt: 3, netPay: 4784060, note: '' },
      { siteName: '동탄푸르지오아이파크', contractCnt: 4, currentCnt: 4, female: 3, male: 1, join: 0, resign: 0, gap: 0, billingAmt: 7848770, payrollCnt: 4, netPay: 6225030, note: '' },
      { siteName: '동작성원상떼빌', contractCnt: 5, currentCnt: 5, female: 5, male: 0, join: 0, resign: 0, gap: 0, billingAmt: 10453320, payrollCnt: 5, netPay: 8554640, note: '신규 계약체결' },
      { siteName: '목동롯데캐슬마에스트로', contractCnt: 10, currentCnt: 10, female: 8, male: 2, join: 1, resign: 0, gap: 1, billingAmt: 15328680, payrollCnt: 11, netPay: 15028800, note: '' },
      { siteName: '서초자이', contractCnt: 9, currentCnt: 9, female: 7, male: 2, join: 0, resign: 1, gap: 0, billingAmt: 10261350, payrollCnt: 7, netPay: 8201350, note: '6/1 시작' },
    ];
    isLoading.value = false;
  }, 400);

   */
};

// ── 데이터 가공 (그룹핑 및 합계) ─────────────────────────
// 실제 엑셀 이미지처럼 소계를 넣기 위해 임의로 6개 단위로 분할하여 소계를 계산합니다.
const processedGroups = computed(() => {
  const groups = [];
  const chunkSize = 6;

  for (let i = 0; i < rawData.value.length; i += chunkSize) {
    const chunk = rawData.value.slice(i, i + chunkSize);
    const subTotal = chunk.reduce((acc, cur) => ({
      contractCnt: acc.contractCnt + cur.contractCnt,
      currentCnt: acc.currentCnt + cur.currentCnt,
      female: acc.female + cur.female,
      male: acc.male + cur.male,
      join: acc.join + cur.join,
      resign: acc.resign + cur.resign,
      gap: acc.gap + cur.gap,
      billingAmt: acc.billingAmt + cur.billingAmt,
      payrollCnt: acc.payrollCnt + cur.payrollCnt,
      netPay: Number(acc.netPay) + Number(cur.netPay),
    }), { contractCnt: 0, currentCnt: 0, female: 0, male: 0, join: 0, resign: 0, gap: 0, billingAmt: 0, payrollCnt: 0, netPay: 0 });

    groups.push({
      rows: chunk,
      subTotal
    });
  }
  return groups;
});

// 전체 총합계
const grandTotal = computed(() => {
  return rawData.value.reduce((acc, cur) => ({
    contractCnt: acc.contractCnt + cur.contractCnt,
    currentCnt: acc.currentCnt + cur.currentCnt,
    female: acc.female + cur.female,
    male: acc.male + cur.male,
    join: acc.join + cur.join,
    resign: acc.resign + cur.resign,
    gap: acc.gap + cur.gap,
    billingAmt: acc.billingAmt + cur.billingAmt,
    payrollCnt: acc.payrollCnt + cur.payrollCnt,
    netPay: Number(acc.netPay) + Number(cur.netPay),
  }), { contractCnt: 0, currentCnt: 0, female: 0, male: 0, join: 0, resign: 0, gap: 0, billingAmt: 0, payrollCnt: 0, netPay: 0 });
});

// 타이틀 생성
const reportTitle = computed(() => {
  const [year, month] = filters.value.yearMonth.split('-');
  return `${year}년 ${month}월 ${filters.value.empType} 급여리스트`;
});

// ── 액션 핸들러 ──────────────────────────────────────────
const handleSearch = () => { fetchSummaryData(); };
const handlePrint = () => { window.print(); };

onMounted(() => {
  fetchSummaryData();
});
</script>

<template>
  <div class="summary-list-page">

    <div class="page-header hide-on-print">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-star"></i> 급여 총액 리스트
        </h1>
      </div>
      <div class="header-actions">
        <button class="btn-search" @click="handleSearch">조회</button>
        <button class="btn-print" @click="handlePrint">인쇄</button>
        <button class="btn-icon" @click="handleSearch" title="새로고침"><i class="mdi mdi-refresh"></i></button>
      </div>
    </div>

    <div class="filter-panel hide-on-print">
      <div class="filter-row">
        <!--div class="filter-group">
          <label class="filter-label text-orange">* 구분</label>
          <select class="filter-select" v-model="filters.empType" @change="handleSearch">
            <option v-for="opt in empTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div-->

        <div class="filter-group">
          <label class="filter-label">* 지급연월</label>
          <input type="month" class="filter-select" v-model="filters.yearMonth" @change="handleSearch" />
        </div>

      </div>
    </div>

    <div class="print-area">
      <div v-if="isLoading" class="loading-state hide-on-print">
        <div class="spinner"></div>
        <p>조회 중입니다...</p>
      </div>

      <div v-else>

        <!--div class="print-header">
          <h2 class="print-title">{{ reportTitle }}</h2>
          <!table class="approval-table">
            <tr>
              <th rowspan="2" class="approval-label">결<br>재</th>
              <th>담당</th>
              <th>이사</th>
              <th>대표이사</th>
            </tr>
            <tr>
              <td class="sign-box"></td>
              <td class="sign-box"></td>
              <td class="sign-box"></td>
            </tr>
          </table>
        </div-->

        <table class="excel-table">
          <thead>
          <tr>
            <th rowspan="2" style="width: 4%;">No</th>
            <th rowspan="2" style="width: 26%;">단지</th>
            <th colspan="7" style="width: 28%;">인원</th>
            <th rowspan="2" style="width: 12%;">청구액</th>
            <th rowspan="2" style="width: 8%;">급여작업<br>인원</th>
            <th rowspan="2" style="width: 12%;">급여지급액</th>
            <th rowspan="2" style="width: 10%;">비고</th>
          </tr>
          <tr>
            <th style="width: 4%;">계약인원</th>
            <th style="width: 4%;">현재</th>
            <th style="width: 4%;">여</th>
            <th style="width: 4%;">남</th>
            <th style="width: 4%;">입사</th>
            <th style="width: 4%;">퇴사</th>
            <th style="width: 4%;">공백</th>
          </tr>
          </thead>

          <tbody>
          <template v-for="(group, gIndex) in processedGroups" :key="'group-' + gIndex">

            <tr v-for="(row, rIndex) in group.rows" :key="'row-' + gIndex + '-' + rIndex" class="data-row">
              <td class="text-center">{{ (gIndex * 6) + rIndex + 1 }}</td>
              <td class="text-left cell-pad">{{ row.siteName }}</td>

              <td class="text-center">{{ row.contractCnt || '' }}</td>
              <td class="text-center">{{ row.currentCnt || '' }}</td>
              <td class="text-center">{{ row.female || '' }}</td>
              <td class="text-center">{{ row.male || '' }}</td>
              <td class="text-center">{{ row.join || '' }}</td>
              <td class="text-center text-red">{{ row.resign || '' }}</td>
              <td class="text-center text-red">{{ row.gap || '' }}</td>

              <td class="text-right cell-pad">{{ formatNum(row.billingAmt) }}</td>
              <td class="text-center">{{ row.payrollCnt || '' }}</td>
              <td class="text-right cell-pad font-bold">{{ formatNum(row.netPay) }}</td>

              <!--td class="text-center"
                  :class="{
                      'bg-yellow': row.note.includes('시작'),
                      'bg-red text-white': row.note.includes('계약체결')
                    }">
                {{ row.note }}
              </td-->
              <td>{{ row.note }}</td>
            </tr>

            <tr class="row-subtotal">
              <td colspan="2" class="text-center font-bold">소 계</td>
              <td class="text-center font-bold">{{ formatNum(group.subTotal.contractCnt) }}</td>
              <td class="text-center font-bold">{{ formatNum(group.subTotal.currentCnt) }}</td>
              <td class="text-center font-bold">{{ formatNum(group.subTotal.female) }}</td>
              <td class="text-center font-bold">{{ formatNum(group.subTotal.male) }}</td>
              <td class="text-center font-bold">{{ formatNum(group.subTotal.join) }}</td>
              <td class="text-center font-bold text-red">{{ formatNum(group.subTotal.resign) }}</td>
              <td class="text-center font-bold text-red">{{ formatNum(group.subTotal.gap) }}</td>
              <td class="text-right cell-pad font-bold">{{ formatNum(group.subTotal.billingAmt) }}</td>
              <td class="text-center font-bold">{{ formatNum(group.subTotal.payrollCnt) }}</td>
              <td class="text-right cell-pad font-bold">{{ formatNum(group.subTotal.netPay) }}</td>
              <td></td>
            </tr>
          </template>
          </tbody>

          <tfoot>
          <tr class="row-grandtotal">
            <td colspan="2" class="text-center font-bold text-dark">총 합 계</td>
            <td class="text-center font-bold">{{ formatNum(grandTotal.contractCnt) }}</td>
            <td class="text-center font-bold">{{ formatNum(grandTotal.currentCnt) }}</td>
            <td class="text-center font-bold">{{ formatNum(grandTotal.female) }}</td>
            <td class="text-center font-bold">{{ formatNum(grandTotal.male) }}</td>
            <td class="text-center font-bold">{{ formatNum(grandTotal.join) }}</td>
            <td class="text-center font-bold text-red">{{ formatNum(grandTotal.resign) }}</td>
            <td class="text-center font-bold text-red">{{ formatNum(grandTotal.gap) }}</td>
            <td class="text-right cell-pad font-bold">{{ formatNum(grandTotal.billingAmt) }}</td>
            <td class="text-center font-bold">{{ formatNum(grandTotal.payrollCnt) }}</td>
            <td class="text-right cell-pad font-bold">{{ formatNum(grandTotal.netPay) }}</td>
            <td></td>
          </tr>
          </tfoot>
        </table>

      </div>
    </div>

  </div>
</template>

<style scoped>
.btn-search {
  background-color: #1a3b5c; color: #fff; border: 1px solid #1a3b5c;
  padding: 6px 20px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 4px;
}
.btn-print {
  background-color: #fff; color: #1a3b5c; border: 1px solid #1a3b5c;
  padding: 6px 20px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 4px;
}
.btn-icon {
  background-color: #fff; color: #333; border: 1px solid #ccc;
  padding: 6px 10px; font-size: 16px; cursor: pointer; border-radius: 4px; display: flex; align-items: center;
}
.btn-icon:hover { background-color: #f1f1f1; }

/* ─── 필터 영역 (수직선 UI) ─── */
.filter-section {
  padding: 12px 24px; border-bottom: 1px solid #c8d4e0; background-color: #f8f9fa;
  display: flex; flex-direction: column;
}
.filter-row { display: flex; align-items: center; flex-wrap: wrap; gap: 24px; }
.f-group { display: flex; align-items: center; }
.f-label { font-size: 13px; font-weight: 700; color: #333; }
.text-orange { color: #e65100; }
.f-divider { color: #1a3b5c; margin: 0 10px; font-weight: bold; }

.f-select, .f-input {
  border: 1px solid #ccc; padding: 2px 6px; font-size: 13px;
  min-width: 140px; height: 26px; box-sizing: border-box;
}
.f-select:focus, .f-input:focus { outline: none; border-color: #1a3b5c; }
.highlight-select { border-color: #2b4b6b; color: #111; }

/* ─── 로딩 ─── */
.loading-state { display: flex; flex-direction: column; align-items: center; padding: 60px; }
.spinner {
  width: 30px; height: 30px; border: 3px solid #ccc; border-top-color: #1a3b5c;
  border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── 인쇄 및 테이블 공통 영역 ─── */
.print-area { padding: 24px; }

.print-header {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-bottom: 16px;
}
.print-title {
  font-size: 26px; font-weight: 700; letter-spacing: 1px; color: #000; margin: 0;
}

/* 결재란 테이블 */
.approval-table { border-collapse: collapse; text-align: center; font-size: 12px; }
.approval-table th, .approval-table td { border: 1px solid #000; padding: 4px 8px; }
.approval-label { width: 20px; background-color: #f4f4f4; }
.sign-box { height: 40px; width: 60px; }

/* 엑셀 스타일 메인 테이블 */
.excel-table {
  width: 100%; border-collapse: collapse; font-size: 12px;
  table-layout: fixed;
}
.excel-table th, .excel-table td {
  border: 1px solid #444; /* 명확한 엑셀 라인 */
  padding: 4px; vertical-align: middle;
}

/* 헤더 스타일 (이미지: 옅은 회색) */
.excel-table thead th {
  background-color: #f0f0f0; color: #000; font-weight: 600; text-align: center;
}

/* 소계 행 (이미지: 그린 #92d050 계열) */
.row-subtotal td { background-color: #b2d8b2; border-color: #444; }

/* 총합계 행 (이미지: 옐로우 #ffff00 계열) */
.row-grandtotal td { background-color: #ffffb2; border-color: #444; color: #000; }

/* 특정 셀 강조 하이라이트 */
.bg-yellow { background-color: #ffff00; font-weight: 600; }
.bg-red { background-color: #ff0000; font-weight: 600; }
.text-white { color: #fff; }

/* 유틸리티 */
.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }
.font-bold { font-weight: 700; }
.text-dark { color: #000; }
.text-red { color: #dc2626; }
.cell-pad { padding-left: 8px !important; padding-right: 8px !important; }

/* ─── 인쇄용 미디어 쿼리 ─── */
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  .hide-on-print { display: none !important; }
  .summary-list-page { padding: 0; background: #fff; }
  .print-area { padding: 0; }

  .excel-table { border: 2px solid #000; }
  .excel-table th, .excel-table td { border-color: #333; font-size: 10px; padding: 3px; }
  .excel-table thead th { border-bottom: 2px solid #000; }

  /* 프린트 시 색상 강제 적용 */
  .row-subtotal td { background-color: #b2d8b2 !important; }
  .row-grandtotal td { background-color: #ffffb2 !important; }
}
</style>
