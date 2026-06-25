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
/* ─── 버튼 ─────────────────────────────────────────── */
.btn-search {
  display: flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 42px;
  background-color: var(--primary); border: none; border-radius: 8px;
  color: var(--text-inverse); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm);
}
.btn-search:hover { background-color: var(--primary-hover); transform: translateY(-1px); }

.btn-print {
  display: flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 42px;
  background-color: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 8px; color: var(--text-sub);
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-print:hover { background-color: var(--bg-hover); border-color: var(--border-focus); color: var(--text-main); }

.btn-icon {
  display: flex; align-items: center; justify-content: center;
  width: 42px; height: 42px;
  background-color: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 8px; color: var(--text-sub); font-size: 18px;
  cursor: pointer; transition: all 0.2s;
}
.btn-icon:hover { background-color: var(--bg-hover); border-color: var(--border-focus); color: var(--text-main); }

/* ─── 필터 패널 ─────────────────────────────────────── */
.filter-panel {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 24px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.filter-row {
  display: flex; align-items: flex-end; flex-wrap: wrap; gap: 16px;
}

.filter-group {
  display: flex; flex-direction: column; gap: 8px; min-width: 160px;
}

.filter-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; color: var(--text-sub);
}
.filter-label i { font-size: 16px; color: var(--primary); }

.filter-select {
  padding: 10px 14px; border: 1px solid var(--border-color);
  border-radius: 8px; font-size: 13px; color: var(--text-main);
  background: var(--bg-surface); cursor: pointer;
  transition: all 0.2s; height: 42px; box-sizing: border-box;
}
.filter-select:hover { border-color: var(--border-focus); }
.filter-select:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

/* ─── 로딩 ──────────────────────────────────────────── */
.loading-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 60px 0; color: var(--text-sub); gap: 16px;
}
.spinner {
  width: 32px; height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── 테이블 카드 ─────────────────────────────────── */
.print-area {
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

/* ─── 엑셀 스타일 테이블 ──────────────────────────── */
.excel-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

/* 헤더 */
.excel-table thead {
  position: sticky; top: 0; z-index: 10;
  background-color: var(--bg-canvas);
  border-bottom: 2px solid var(--border-color);
}
.excel-table thead th {
  padding: 12px 10px;
  text-align: center;
  font-size: 12px; font-weight: 600;
  color: var(--text-main);
  border: 1px solid var(--border-color);
  white-space: nowrap;
}

/* 바디 셀 */
.excel-table td {
  padding: 8px 6px;
  border: 1px solid var(--border-color);
  color: var(--text-main);
  vertical-align: middle;
  font-size: 13px;
}

/* 데이터 행 hover */
.data-row { transition: background 0.15s; background: var(--bg-surface); }
.data-row:hover { background-color: var(--primary-soft); }

/* 소계 행 */
.row-subtotal td {
  background-color: rgba(16, 185, 129, 0.1);
  border-color: var(--border-color);
  color: var(--text-main);
}

/* 총합계 행 */
.row-grandtotal td {
  background-color: rgba(245, 158, 11, 0.1);
  border-color: var(--border-color);
  color: var(--text-main);
  border-top: 2px solid var(--border-focus);
}

/* 특정 셀 강조 */
.bg-yellow { background-color: rgba(245, 158, 11, 0.2) !important; font-weight: 600; }
.bg-red    { background-color: rgba(239, 68, 68, 0.15) !important; font-weight: 600; }

/* ─── 유틸리티 ──────────────────────────────────────── */
.text-center { text-align: center; }
.text-left   { text-align: left; }
.text-right  { text-align: right; }
.font-bold   { font-weight: 700; }
.text-dark   { color: var(--text-main); }
.text-red    { color: var(--danger) !important; }
.cell-pad    { padding-left: 12px !important; padding-right: 12px !important; }

/* ─── 인쇄용 미디어 쿼리 ─────────────────────────── */
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  .hide-on-print { display: none !important; }
  .summary-list-page { padding: 0; background: #fff; }

  .print-area {
    border: none; box-shadow: none; border-radius: 0;
  }

  .excel-table thead {
    position: static;
    background-color: #f0f0f0 !important;
  }
  .excel-table thead th { border-color: #333; font-size: 10px; padding: 4px; }
  .excel-table td      { border-color: #333; font-size: 10px; padding: 3px; }
  .excel-table thead tr:first-child th { border-bottom: 2px solid #000; }

  .row-subtotal  td { background-color: #b2d8b2 !important; }
  .row-grandtotal td { background-color: #ffffb2 !important; }
}
</style>
