<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import * as XLSX from 'xlsx';
import SiteSelect from '~/components/SiteSelect.vue';

const route = useRoute();
const router = useRouter();

const { typeOptions, bankOptions, fetchTypeOptions, fetchBankOption } = useApi();

// ── 1. 필터 상태 (URL 쿼리 우선 적용) ────────────────────────
const todayMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
const yearMonth = ref(route.query.yearMonth || todayMonth);
const selectedSite = ref(route.query.site || '전체');
const selectedType = ref(route.query.type || '');
const searchTerm = ref(route.query.search || '');

// URL 파라미터 자동 업데이트
watch(
    [yearMonth, selectedSite, selectedType, searchTerm],
    ([newYearMonth, newSite, newType, newSearch]) => {
      router.replace({
        query: {
          yearMonth: newYearMonth,
          site: newSite,
          type: newType,
          search: newSearch || undefined
        }
      });
    }
);

// ── 1-1. 인원 컬럼(계약/현재/여/남/입사/퇴사/공백) 통째로 표시/숨김 토글 ──
const showPersonnelCols = ref(true);
const PERSONNEL_COL_COUNT = 7;

// 인원 그룹 제외 고정 컬럼 수 (No, 급여일, 단지, 비고, 청구액, 급여인원, 계산서작성일, 매수, 지급액, 은행, 입금일, 입금액, 비고)
const FIXED_COL_COUNT = 13;
const totalColspan = computed(
    () => FIXED_COL_COUNT + (showPersonnelCols.value ? PERSONNEL_COL_COUNT : 0)
);

// ── 2. 데이터 및 모달 상태 ────────────────────────────────────
const rawData = ref([]);
const isLoading = ref(false);

const sortKey = ref('');
const sortOrder = ref('asc');

const isJoinLeaveModalOpen = ref(false);
const joinLeaveData = ref(null);

// ── 3. 유틸 함수 ──────────────────────────────────────────────
const formatCurrency = (val) => {
  if (val === null || val === undefined || val === '') return '';
  if (val === 0) return '0';
  return Number(val).toLocaleString('ko-KR');
};

const safeParse = (val, fallback) => {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
};

const hasError = (current, estimate) => {
  return Number(current) !== Number(estimate);
};

// ── 4. 데이터 조회 ────────────────────────────────────────────
const fetchSummaryData = async () => {
  isLoading.value = true;
  try {
    const params = {
      year: yearMonth.value.split('-')[0],
      month: yearMonth.value.split('-')[1],
    };
    const res = await axios.get('/api/v1/settle/payroll/summary', { params });
    rawData.value = res.data.data || [];
  } catch (error) {
    console.error('청구·급여 통합 데이터 조회 실패:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  } finally {
    isLoading.value = false;
  }
};

// ── 5. 필터링 및 가공 ────────────────────────────────────────
const filteredRawData = computed(() => {
  return rawData.value.filter((row) => {
    if (selectedSite.value !== '전체' && String(row.sIdx) !== String(selectedSite.value)) return false;
    if (selectedType.value && row.type !== selectedType.value) return false;
    if (searchTerm.value && !row.siteName?.toLowerCase().includes(searchTerm.value.toLowerCase())) return false;
    return true;
  }).map((row) => {
    const contract = Number(row.contractCnt) || 0;
    const current = Number(row.currentCnt) || 0;
    return {
      ...row,
      gap: contract - current,

      // ✅ 기준 청구액/지급액이 백엔드에서 온다고 가정 (없으면 0 처리)
      estBilledAmount: Number(row.estBilledAmount) || Number(row.billingAmt) || 0,
      estNetPay: Number(row.estNetPay) || Number(row.netPay) || 0,
      billingAmt: Number(row.billingAmt) || 0,
      netPay: Number(row.netPay) || 0,

      // ✅ 입퇴사자 모달을 위한 JSON 데이터 파싱
      payrollData: safeParse(row.payrollData, [])
    };
  });
});

// ── 6. 정렬 ────────────────────────────────────────────────
const sortedRawData = computed(() => {
  const list = [...filteredRawData.value];
  if (!sortKey.value) return list;

  const mod = sortOrder.value === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    const vA = a[sortKey.value] ?? '';
    const vB = b[sortKey.value] ?? '';
    if (typeof vA === 'string' && typeof vB === 'string') {
      return vA.localeCompare(vB, undefined, { numeric: true }) * mod;
    }
    return (vA < vB ? -1 : vA > vB ? 1 : 0) * mod;
  });
  return list;
});

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

// ── 7. 그룹핑 및 합계 계산 ──────────────────────────────────
const emptyTotal = () => ({
  contractCnt: 0, currentCnt: 0, female: 0, male: 0, join: 0, resign: 0, gap: 0,
  estBilledAmount: 0, billingAmt: 0,
  estNetPay: 0, netPay: 0, payrollCnt: 0
});

const addRow = (acc, cur) => ({
  contractCnt: acc.contractCnt + (cur.contractCnt || 0),
  currentCnt: Number(acc.currentCnt) + Number(cur.currentCnt || 0),
  female: Number(acc.female) + Number(cur.female || 0),
  male: Number(acc.male) + Number(cur.male || 0),
  join: Number(acc.join) + Number(cur.join || 0),
  resign: Number(acc.resign) + Number(cur.resign || 0),
  gap: Number(acc.gap) + Number(cur.gap || 0),

  // 기준 금액과 실 금액 누적
  estBilledAmount: Number(acc.estBilledAmount) + Number(cur.estBilledAmount || 0),
  billingAmt: Number(acc.billingAmt) + Number(cur.billingAmt || 0),
  estNetPay: Number(acc.estNetPay) + Number(cur.estNetPay || 0),
  netPay: Number(acc.netPay) + Number(cur.netPay || 0),
  payrollCnt: Number(acc.payrollCnt) + Number(cur.payrollCnt || 0),
});

const processedGroups = computed(() => {
  if (!sortedRawData.value.length) return [];
  const grouped = sortedRawData.value.reduce((acc, row) => {
    const day = row.payment_day || '미지정';
    (acc[day] ||= []).push(row);
    return acc;
  }, {});

  return Object.keys(grouped).sort().map((day) => {
    const rows = grouped[day];
    const subTotal = rows.reduce(addRow, emptyTotal());
    return { paymentDay: day, rows, subTotal };
  });
});

const grandTotal = computed(() => filteredRawData.value.reduce(addRow, emptyTotal()));

const reportTitle = computed(() => {
  const [year, month] = yearMonth.value.split('-');
  return `${year}년 ${month}월 청구·급여 손익 검토`;
});

// ── 8. 모달 액션 (입사/퇴사자 보기) ──────────────────────────
const openJoinLeaveModal = (row) => {
  const targetYm = yearMonth.value.replace(/-/g, ''); // ex) '2026-05' -> '202605'

  // payrollData 배열이 있다면 해당 월에 입사/퇴사한 사람을 필터링합니다.
  const joined = (row.payrollData || []).filter(emp => emp.inDate && emp.inDate.replace(/-/g, '').startsWith(targetYm));
  const left = (row.payrollData || []).filter(emp => emp.outDate && emp.outDate.replace(/-/g, '').startsWith(targetYm));

  joinLeaveData.value = {
    siteName: row.siteName,
    targetMonth: yearMonth.value,
    joined,
    left
  };
  isJoinLeaveModalOpen.value = true;
};

const closeJoinLeaveModal = () => {
  isJoinLeaveModalOpen.value = false;
};

// ── 9. 일반 액션 (초기화, 엑셀) ──────────────────────────────
const handleSearch = () => { fetchSummaryData(); };

function resetFilters() {
  selectedSite.value = '전체';
  yearMonth.value = todayMonth;
  selectedType.value = '';
  searchTerm.value = '';
  sortKey.value = '';
  fetchSummaryData();
}

const downloadExcel = () => {
  if (!filteredRawData.value.length) { alert('다운로드할 데이터가 없습니다.'); return; }

  const excelData = filteredRawData.value.map((row, index) => {
    return {
      'No': index + 1,
      '급여일': row.payment_day,
      '단지': row.siteName,
      '계약인원': row.contractCnt,
      '현재인원': row.currentCnt,
      '여': row.female,
      '남': row.male,
      '입사': row.join,
      '퇴사': row.resign,
      '공백': row.gap,
      '기준청구액': row.estBilledAmount,
      '실청구액': row.billingAmt,
      '기준급여지급액': row.estNetPay,
      '실급여지급액': row.netPay,
      '입금일': row.depositDt || '',
      '입금액': row.depositAmount || 0,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '청구급여손익');
  XLSX.writeFile(workbook, `청구급여손익검토_${yearMonth.value}.xlsx`);
};

onMounted(async () => {
  await fetchTypeOptions();
  await fetchBankOption();
  await fetchSummaryData();
});
</script>

<template>
  <div class="settlement-statistics-page">
    <div class="page-header hide-on-print">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-receipt-text-outline"></i> 월별 청구 현황
        </h1>
        <p class="page-subtitle">현장별 기준 금액과 실 금액을 비교하고 손익을 확인합니다.</p>
      </div>
      <div class="header-actions">
        <button @click="downloadExcel" class="btn-excel" :disabled="isLoading || filteredRawData.length === 0">
          <i class="mdi mdi-microsoft-excel"></i> 엑셀 다운로드
        </button>
        <button @click="downloadExcel" class="btn-save" :disabled="isLoading || filteredRawData.length === 0">
          <i class="mdi mdi-microsoft-excel"></i> 데이터 저장
        </button>
      </div>
    </div>

    <!-- 요약 카드 -->
    <div class="stats-grid hide-on-print">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-receipt-text-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 실청구액</span>
          <span class="stat-value">{{ formatCurrency(grandTotal.billingAmt) }} <small>원</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 실급여지급액</span>
          <span class="stat-value">{{ formatCurrency(grandTotal.netPay) }} <small>원</small></span>
        </div>
      </div>
    </div>

    <!-- 필터 패널 -->
    <div class="filter-panel hide-on-print">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">청구연월</label>
          <input type="month" class="filter-select" v-model="yearMonth" @change="handleSearch" />
        </div>
        <div class="filter-group">
          <label class="filter-label">현장</label>
          <SiteSelect v-model="selectedSite" />
        </div>
        <div class="filter-group">
          <label class="filter-label">구분</label>
          <select v-model="selectedType" class="filter-select">
            <option value="">전체</option>
            <option v-for="type in typeOptions" :key="type.itemCd" :value="type.itemCd">{{ type.itemNm }}</option>
          </select>
        </div>
        <div class="search-group">
          <button @click="resetFilters" class="btn-search">
            <i class="mdi mdi-filter-off"></i><span>검색필터 초기화</span>
          </button>
        </div>
      </div>

      <!-- ✅ 인원 컬럼 통째로 표시/숨김 토글 -->
      <div class="filter-row col-toggle-row">
        <label class="col-toggle-item">
          <input type="checkbox" v-model="showPersonnelCols" />
          <span>인원 컬럼 표시 (계약/현재/여/남/입사/퇴사/공백)</span>
        </label>
      </div>
    </div>

    <!-- 데이터 테이블 영역 -->
    <div v-if="isLoading" class="loading-state hide-on-print">
      <div class="spinner"></div>
      <p>조회 중입니다...</p>
    </div>

    <div class="table-card" v-else>
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table"></i>
          <span>청구 목록 ({{ filteredRawData.length }}개)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="excel-table">
          <thead>
          <tr>
            <th rowspan="2" style="width: 2%;">No</th>
            <th rowspan="2" style="width: 2%;" @click="toggleSort('payment_day')" class="sortable">
              급여일 <i v-if="sortKey === 'payment_day'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
            </th>
            <th rowspan="2" style="width: 14%;" @click="toggleSort('siteName')" class="sortable">
              단지 <i v-if="sortKey === 'siteName'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
            </th>
            <th rowspan="2" style="width: 4%;">비고</th>
            <th v-if="showPersonnelCols" :colspan="PERSONNEL_COL_COUNT" style="width: 20%;">인원</th>
            <th rowspan="2" style="width: 16%;" @click="toggleSort('billingAmt')" class="sortable">
              청구액 (기준 / 실청구) <i v-if="sortKey === 'billingAmt'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
            </th>
            <th rowspan="2" style="width: 4%;">급여<br>인원</th>
            <th rowspan="2" style="width: 6%;">계산서 작성일</th>
            <th rowspan="2" style="width: 2%;">매수</th>
            <th rowspan="2" style="width: 16%;" @click="toggleSort('netPay')" class="sortable">
              급여총액 <i v-if="sortKey === 'netPay'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
            </th>
            <th rowspan="2" style="width: 5%;">은행</th>
            <th rowspan="2" style="width: 6%;">입금일</th>
            <th rowspan="2" style="width: 9%;">입금액</th>
            <th rowspan="2" style="width: 12%;">비고</th>
          </tr>
          <tr v-if="showPersonnelCols">
            <th style="width: 3%;">계약</th>
            <th style="width: 3%;">현재</th>
            <th style="width: 3%;">여</th>
            <th style="width: 3%;">남</th>
            <th style="width: 4%;">입사</th>
            <th style="width: 4%;">퇴사</th>
            <th style="width: 3%;">공백</th>
          </tr>
          </thead>

          <tbody>
          <template v-if="processedGroups.length === 0">
            <tr><td :colspan="totalColspan" class="empty-row text-center">조건에 맞는 데이터가 없습니다.</td></tr>
          </template>

          <template v-for="(group, gIndex) in processedGroups" :key="'group-' + gIndex">
            <!-- 개별 행 -->
            <tr v-for="(row, rIndex) in group.rows" :key="'row-' + gIndex + '-' + rIndex" class="data-row"
                :class="{'row-mismatch': hasError(row.billingAmt, row.estBilledAmount) || hasError(row.netPay, row.estNetPay)}">
              <td class="text-center">{{ rIndex + 1 }}</td>
              <td class="text-center">{{ row.payment_day }}</td>
              <td class="text-left cell-pad font-bold">{{ row.siteName }}</td>
              <td class="text-center">
                {{ row.docType == 'SERVICE' ? '용역비' : row.docType == 'RETIRE' ? '퇴직금' : row.docType == 'ANNUAL' ? '연차' :'' }}
              </td>
              <template v-if="showPersonnelCols">
                <td class="text-center">{{ row.contractCnt || '' }}</td>
                <td class="text-center">{{ row.currentCnt || '' }}</td>
                <td class="text-center">{{ row.female || '' }}</td>
                <td class="text-center">{{ row.male || '' }}</td>

                <!-- ✅ 클릭 시 팝업 열리는 입/퇴사자 셀 -->
                <td class="text-center cursor-pointer hover-bg text-blue" @click.stop="openJoinLeaveModal(row)">
                  <u>{{ row.join || '' }}</u>
                </td>
                <td class="text-center cursor-pointer hover-bg text-red" @click.stop="openJoinLeaveModal(row)">
                  <u>{{ row.resign || '' }}</u>
                </td>

                <td class="text-center text-red">{{ row.gap || '' }}</td>
              </template>

              <!-- ✅ 청구액 (기준 / 실청구 비교) -->
              <td class="text-right cell-pad">
                <span class="est-text">{{ formatCurrency(row.estBilledAmount) }}</span> /
                <span :class="['real-text', { 'error-text': hasError(row.billingAmt, row.estBilledAmount) }]">
                  {{ formatCurrency(row.billingAmt) }}
                  <i v-if="hasError(row.billingAmt, row.estBilledAmount)" class="mdi mdi-alert-circle-outline"></i>
                </span>
              </td>

              <td class="text-center">{{ row.payrollCnt || '' }}</td>
              <td class="text-center">
                <input type="date" v-model="row.invoiceDt" class="cell-input">
              </td><!-- 계산서 작성일 -->
              <td class="text-center">
                <input type="text" v-model="row.invoiceAmount" class="cell-input cell-input-sm">
              </td><!-- 매수 -->

              <!-- ✅ 지급액 (기준 / 실지급 비교) -->
              <td class="text-right cell-pad">
                <!--span class="est-text">{{ formatCurrency(row.estNetPay) }}</span> / -->
                <span :class="['real-text', { 'error-text': hasError(row.netPay, row.estNetPay) }]">
                  {{ formatCurrency(row.netPay) }}
                  <i v-if="hasError(row.netPay, row.estNetPay)" class="mdi mdi-alert-circle-outline"></i>
                </span>
              </td>
              <td class="text-center">
                <select v-model="row.bankName" class="cell-select">
                  <option v-for="bank in bankOptions" :key="bank.itemNm" :value="bank.itemNm">{{ bank.itemNm }}</option>
                </select>
              </td>

              <td class="text-center">{{ row.depositDt }}</td>
              <td class="text-right cell-pad">{{ formatCurrency(row.depositAmount) }}</td>
              <td class="text-right cell-pad">
                <input type="text" v-model="row.bigo" class="cell-input">
              </td>
            </tr>

            <!-- 날짜별 소계 -->
            <tr class="row-subtotal">
              <td colspan="4" class="text-center font-bold">소 계</td>
              <template v-if="showPersonnelCols">
                <td class="text-center font-bold">{{ formatCurrency(group.subTotal.contractCnt) }}</td>
                <td class="text-center font-bold">{{ formatCurrency(group.subTotal.currentCnt) }}</td>
                <td class="text-center font-bold">{{ formatCurrency(group.subTotal.female) }}</td>
                <td class="text-center font-bold">{{ formatCurrency(group.subTotal.male) }}</td>
                <td class="text-center font-bold">{{ formatCurrency(group.subTotal.join) }}</td>
                <td class="text-center font-bold text-red">{{ formatCurrency(group.subTotal.resign) }}</td>
                <td class="text-center font-bold text-red">{{ formatCurrency(group.subTotal.gap) }}</td>
              </template>
              <td class="text-right cell-pad font-bold">
                <span class="est-text">{{ formatCurrency(group.subTotal.estBilledAmount) }}</span> /
                <span :class="['real-text', { 'error-text': hasError(group.subTotal.billingAmt, group.subTotal.estBilledAmount) }]">
                  {{ formatCurrency(group.subTotal.billingAmt) }}
                </span>
              </td>
              <td class="text-center font-bold">{{ formatCurrency(group.subTotal.payrollCnt) }}</td>
              <td></td>
              <td></td>
              <td class="text-right cell-pad font-bold">
                <span class="est-text">{{ formatCurrency(group.subTotal.estNetPay) }}</span> /
                <span :class="['real-text', { 'error-text': hasError(group.subTotal.netPay, group.subTotal.estNetPay) }]">
                  {{ formatCurrency(group.subTotal.netPay) }}
                </span>
              </td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </template>
          </tbody>

          <!-- 전체 총계 -->
          <tfoot>
          <tr class="row-grandtotal">
            <td colspan="4" class="text-center font-bold text-dark">총 합 계</td>
            <template v-if="showPersonnelCols">
              <td class="text-center font-bold">{{ formatCurrency(grandTotal.contractCnt) }}</td>
              <td class="text-center font-bold">{{ formatCurrency(grandTotal.currentCnt) }}</td>
              <td class="text-center font-bold">{{ formatCurrency(grandTotal.female) }}</td>
              <td class="text-center font-bold">{{ formatCurrency(grandTotal.male) }}</td>
              <td class="text-center font-bold">{{ formatCurrency(grandTotal.join) }}</td>
              <td class="text-center font-bold text-red">{{ formatCurrency(grandTotal.resign) }}</td>
              <td class="text-center font-bold text-red">{{ formatCurrency(grandTotal.gap) }}</td>
            </template>
            <td class="text-right cell-pad font-bold">
              <span class="est-text">{{ formatCurrency(grandTotal.estBilledAmount) }}</span> /
              <span :class="['real-text', { 'error-text': hasError(grandTotal.billingAmt, grandTotal.estBilledAmount) }]">
                {{ formatCurrency(grandTotal.billingAmt) }}
              </span>
            </td>
            <td class="text-center font-bold">{{ formatCurrency(grandTotal.payrollCnt) }}</td>
            <td></td>
            <td></td>
            <td class="text-right cell-pad font-bold">
              <span class="est-text">{{ formatCurrency(grandTotal.estNetPay) }}</span> /
              <span :class="['real-text', { 'error-text': hasError(grandTotal.netPay, grandTotal.estNetPay) }]">
                {{ formatCurrency(grandTotal.netPay) }}
              </span>
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- ✅ 입/퇴사 현황 팝업 (모달) -->
    <div v-if="isJoinLeaveModalOpen" class="modal-overlay" @click.self="closeJoinLeaveModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ joinLeaveData.siteName }} ({{ joinLeaveData.targetMonth }}) 입/퇴사 현황</h3>
          <button @click="closeJoinLeaveModal" class="btn-close"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="tables-wrapper">
            <!-- 입사자 -->
            <div class="table-section">
              <h4><span class="badge badge-clean">입사자 {{ joinLeaveData.joined.length }}명</span></h4>
              <table class="detail-table">
                <thead>
                <tr>
                  <th class="text-center">이름</th>
                  <th class="text-center">직책</th>
                  <th class="text-center">입사일</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(emp, idx) in joinLeaveData.joined" :key="'in-'+idx">
                  <td class="text-center">{{ emp.empName || '-' }}</td>
                  <td class="text-center">{{ emp.position || '-' }}</td>
                  <td class="text-center">{{ emp.inDate || '-' }}</td>
                </tr>
                <tr v-if="joinLeaveData.joined.length === 0">
                  <td colspan="3" class="text-center text-muted" style="padding:20px;">당월 입사자가 없습니다.</td>
                </tr>
                </tbody>
              </table>
            </div>

            <!-- 퇴사자 -->
            <div class="table-section">
              <h4><span class="badge badge-etc">퇴사자 {{ joinLeaveData.left.length }}명</span></h4>
              <table class="detail-table">
                <thead>
                <tr>
                  <th class="text-center">이름</th>
                  <th class="text-center">직책</th>
                  <th class="text-center">퇴사일</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(emp, idx) in joinLeaveData.left" :key="'out-'+idx">
                  <td class="text-center">{{ emp.empName || '-' }}</td>
                  <td class="text-center">{{ emp.position || '-' }}</td>
                  <td class="text-center">{{ emp.outDate || '-' }}</td>
                </tr>
                <tr v-if="joinLeaveData.left.length === 0">
                  <td colspan="3" class="text-center text-muted" style="padding:20px;">당월 퇴사자가 없습니다.</td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeJoinLeaveModal" class="btn-cancel">닫기</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* (기존 버튼, 로딩, 엑셀 테이블 스타일 유지) */
.btn-print { display: flex; align-items: center; gap: 6px; padding: 0 18px; height: 42px; background-color: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-sub); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-print:hover { background-color: var(--bg-hover); border-color: var(--border-focus); color: var(--text-main); }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state { display: flex; flex-direction: column; align-items: center; padding: 60px 0; color: var(--text-sub); gap: 16px; }

/* 테이블 컨테이너 및 엑셀 스타일 */
.table-card { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); overflow: hidden; }
.table-header { padding: 14px 20px; border-bottom: 1px solid var(--border-color); }
.table-title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: var(--text-main); }
.table-scroll-container { overflow-x: auto; }
.excel-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; min-width: 1200px; }
.excel-table thead { position: sticky; top: 0; z-index: 10; background-color: var(--bg-canvas); border-bottom: 2px solid var(--border-color); }
.excel-table thead th { padding: 12px 10px; text-align: center; font-size: 12px; font-weight: 600; color: var(--text-main); border: 1px solid var(--border-color); white-space: nowrap; }
.excel-table thead th.sortable { cursor: pointer; }
.excel-table thead th.sortable:hover { background: var(--bg-hover); }
.excel-table td { padding: 8px 6px; border: 1px solid var(--border-color); color: var(--text-main); vertical-align: middle; font-size: 13px; }

/* 행 배경색 제어 */
.data-row { transition: background 0.15s; background: var(--bg-surface); }
.data-row:hover { background-color: var(--bg-hover); }
.row-subtotal td { background-color: rgba(16, 185, 129, 0.1); border-color: var(--border-color); color: var(--text-main); }
.row-grandtotal td { background-color: rgba(245, 158, 11, 0.1); border-color: var(--border-color); color: var(--text-main); border-top: 2px solid var(--border-focus); }

/* ✨ 에러 셀 및 텍스트 강조 */
.row-mismatch { background: rgba(239, 68, 68, 0.03) !important; }
.row-mismatch:hover { background: rgba(239, 68, 68, 0.06) !important; }
.est-text { font-size: 12px; color: var(--text-muted); margin-right: 4px; }
.real-text { font-size: 13px; font-weight: 700; color: var(--text-main); }
.error-text { color: var(--danger); display: inline-flex; align-items: center; gap: 4px; }
.cursor-pointer { cursor: pointer; }
.hover-bg:hover { background-color: var(--primary-soft); }

/* ✅ 테이블 셀 내부 입력/선택 컨트롤 (계산서 작성일, 매수, 은행, 비고) */
.cell-input,
.cell-select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  height: 30px;
  padding: 0 8px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-main);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cell-input:hover,
.cell-select:hover {
  border-color: var(--border-focus);
}
.cell-input:focus,
.cell-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
.cell-input-sm {
  text-align: center;
  padding: 0 4px;
}
.cell-input[type="date"] {
  padding: 0 6px;
}
select.cell-select {
  cursor: pointer;
  appearance: auto;
  padding: 0 4px;
  text-overflow: ellipsis;
}

/* ✅ 인원 컬럼 토글 UI */
.col-toggle-row { margin-top: 10px; }
.col-toggle-item { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-main); cursor: pointer; user-select: none; }
.col-toggle-item input[type="checkbox"] { cursor: pointer; width: 15px; height: 15px; }

/* 유틸리티 클래스 */
.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }
.font-bold { font-weight: 700; }
.text-dark { color: var(--text-main); }
.text-red { color: var(--danger) !important; }
.text-blue { color: var(--primary) !important; }
.text-muted { color: #94a3b8; }
.cell-pad { padding-left: 12px !important; padding-right: 12px !important; }
.empty-row { padding: 40px !important; color: #94a3b8; }

/* ✨ 팝업 모달 스타일 */
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.modal-content { background: #fff; border-radius: 12px; width: 90%; max-width: 600px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
.modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-main); }
.btn-close { background: none; border: none; font-size: 20px; color: var(--text-sub); cursor: pointer; }
.modal-body { padding: 20px; overflow-y: auto; }
.tables-wrapper { display: flex; flex-direction: column; gap: 24px; }
.table-section h4 { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: var(--text-main); }
.badge { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-block; }
.badge-clean { background: rgba(16,185,129,.1); color: var(--success); }
.badge-etc { background: rgba(239,68,68,.1); color: var(--danger); }
.detail-table { width: 100%; border-collapse: collapse; border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; }
.detail-table th, .detail-table td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid var(--border-color); }
.detail-table th { background: #f8fafc; color: var(--text-sub); font-weight: 600; }
.modal-footer { padding: 16px 20px; border-top: 1px solid var(--border-color); text-align: right; }
.btn-cancel { padding: 8px 16px; border-radius: 6px; background: var(--bg-surface); border: 1px solid var(--border-color); cursor: pointer; font-weight: 600; }
.btn-cancel:hover { background: var(--bg-hover); }
</style>