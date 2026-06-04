<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";

// ── 상태 관리 (UI 옵션 및 필터) ─────────────────────────────
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const showPersonalInfo = ref(true); // 개인정보 표시

const filters = ref({
  viewType: '월별', // '월별' | '기간별' | '항목별'
  yearMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  startMonth: `${new Date().getFullYear()}-01`,
  endMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  department: '전체',
  payDate: '전체',
  empIdName: '', // 사번/성명 검색
});

const viewTypeOptions = ['월별', '기간별', '항목별'];
// TODO: 실제 환경에서는 DB에서 부서(현장)와 지급일자 목록을 동적으로 불러와야 합니다.
const deptOptions = ref(['전체', '488답십리래미안위브', '115자양우성']);
const payDateOptions = ref(['전체', '10', '15', '20', '25', '말일']);

// ── 급여 항목 (동적 컬럼용) ─────────────────────────────
const payItems = ref([]);
const deductionItems = ref([]);

// ── 데이터 상태 ──────────────────────────────────────────
const rawData = ref([]);
const isLoading = ref(false);

// ── 숫자 포맷팅 및 마스킹 유틸 ──────────────────────────────
const formatNum = (val) => {
  if (!val && val !== 0) return '0';
  return Number(val).toLocaleString('ko-KR');
};

const maskName = (name) => {
  if (showPersonalInfo.value) return name;
  if (!name) return '';
  if (name.length <= 2) return name.charAt(0) + '*';
  return name.charAt(0) + '*'.repeat(name.length - 2) + name.charAt(name.length - 1);
};

const parseJSON = (data) => {
  if (!data) return {};
  if (typeof data === 'object') return data;
  try { return JSON.parse(data); } catch { return {}; }
};

// ── API 호출 (실제 데이터 연동) ──────────────────────────
const fetchWageCodes = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    const allItems = res.data.data || [];
    // 04001: 지급항목, 04002: 공제항목 (코드 그룹에 맞게 조정)
    payItems.value = allItems.filter(item => item.groupCd === '04001');
    deductionItems.value = allItems.filter(item => item.groupCd === '04002');
  } catch (error) {
    console.error('급여 항목 로드 실패:', error);
  }
};

const fetchPayrollData = async () => {
  isLoading.value = true;
  rawData.value = [];

  try {
    let year, month;

    // 기간별 조회의 경우 백엔드 API 지원 여부에 따라 파라미터가 달라질 수 있습니다.
    // 현재 작성하신 getPayrollCalculate 쿼리는 특정 월(year, month) 1건 기준입니다.
    if (filters.value.viewType !== '기간별') {
      [year, month] = filters.value.yearMonth.split('-');
    } else {
      [year, month] = filters.value.startMonth.split('-'); // 임시: 시작월 기준으로 호출
    }

    const res = await axios.get('/api/v1/member/payroll/calculate', { params: { year, month } });

    if (res.data.result && res.data.data?.length > 0) {
      rawData.value = res.data.data;
    }
  } catch (error) {
    console.error('급여 데이터 조회 실패:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  } finally {
    isLoading.value = false;
  }
};

// ── 데이터 가공 ─────────────────────────────────────────

// 1. 전처리 (필터링 및 JSON 파싱)
const processedList = computed(() => {
  return rawData.value
      // .filter(row => row.status > 0) // 필요 시 주석 해제 (저장된 급여만 볼지 여부)
      .filter(row => filters.value.department === '전체' || row.siteName === filters.value.department)
      .filter(row => filters.value.payDate === '전체' || String(row.payment_day) === filters.value.payDate.replace(/[^0-9말일]/g, ''))
      .filter(row => !filters.value.empIdName || row.staff.includes(filters.value.empIdName) || String(row.id).includes(filters.value.empIdName))
      .map(row => {
        const p = parseJSON(row.payItems);
        const d = parseJSON(row.deductionItems);
        return { ...row, parsedPay: p, parsedDed: d };
      });
});

// 2. 항목별 (부서별) 요약 데이터 생성
const summaryBySite = computed(() => {
  const groups = {};
  processedList.value.forEach(row => {
    const siteKey = row.siteName || '소속없음';
    if (!groups[siteKey]) {
      groups[siteKey] = {
        siteName: siteKey,
        empCount: 0,
        grossPay: 0,
        totalDeduction: 0,
        netPay: 0,
        parsedPay: {},
        parsedDed: {},
      };
      payItems.value.forEach(i => groups[siteKey].parsedPay[i.itemCd] = 0);
      deductionItems.value.forEach(i => groups[siteKey].parsedDed[i.itemCd] = 0);
    }

    const g = groups[siteKey];
    g.empCount += 1;
    g.grossPay += Number(row.grossPay || 0);
    g.totalDeduction += Number(row.totalDeduction || 0);
    g.netPay += Number(row.netPay || 0);

    Object.keys(row.parsedPay).forEach(k => { if(g.parsedPay[k] !== undefined) g.parsedPay[k] += Number(row.parsedPay[k] || 0); });
    Object.keys(row.parsedDed).forEach(k => { if(g.parsedDed[k] !== undefined) g.parsedDed[k] += Number(row.parsedDed[k] || 0); });
  });

  return Object.values(groups).sort((a, b) => a.siteName.localeCompare(b.siteName));
});

// 3. 전체 총 합계 계산
const grandTotal = computed(() => {
  const t = { count: 0, grossPay: 0, totalDeduction: 0, netPay: 0, parsedPay: {}, parsedDed: {} };
  payItems.value.forEach(i => t.parsedPay[i.itemCd] = 0);
  deductionItems.value.forEach(i => t.parsedDed[i.itemCd] = 0);

  processedList.value.forEach(row => {
    t.count++;
    t.grossPay += Number(row.grossPay || 0);
    t.totalDeduction += Number(row.totalDeduction || 0);
    t.netPay += Number(row.netPay || 0);
    Object.keys(row.parsedPay).forEach(k => { if(t.parsedPay[k] !== undefined) t.parsedPay[k] += Number(row.parsedPay[k] || 0); });
    Object.keys(row.parsedDed).forEach(k => { if(t.parsedDed[k] !== undefined) t.parsedDed[k] += Number(row.parsedDed[k] || 0); });
  });

  return t;
});

// ── 액션 핸들러 ──────────────────────────────────────────
const handleSearch = () => {
  //gubun값, 지급년월값 또는 지급기간 값, 부서는 현장값
  fetchPayrollData();
};
const handlePrint = () => { window.print(); };
const handleRefresh = () => {
  filters.value.viewType = '월별';
  filters.value.department = '전체';
  filters.value.payDate = '전체';
  filters.value.empIdName = '';
  fetchPayrollData();
};

onMounted(async () => {
  await fetchWageCodes();
  await fetchPayrollData();
});
</script>

<template>
  <div class="payroll-status-page">

    <div class="page-header hide-on-print">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-star"></i> 급여 현황 출력
        </h1>
        <label class="check-personal-info">
          <input type="checkbox" v-model="showPersonalInfo" class="custom-chk" /> 개인정보 표시
        </label>
      </div>
      <div class="header-actions">
        <button class="btn-search" @click="handleSearch">조회</button>
        <button class="btn-print" @click="handlePrint">인쇄</button>
        <button class="btn-icon" @click="handleRefresh" title="새로고침"><i class="mdi mdi-refresh"></i></button>
      </div>
    </div>

    <div class="filter-panel hide-on-print">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label text-orange">* 구분</label>
          <select class="filter-select" v-model="filters.viewType" @change="handleSearch">
            <option v-for="opt in viewTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <div class="filter-group" v-if="filters.viewType !== '기간별'">
          <label class="filter-label text-orange">* 지급년월</label>
          <input type="month" class="filter-select" v-model="filters.yearMonth" @change="fetchPayrollData"/>
        </div>
        <div class="filter-group" v-else>
          <label class="filter-label text-orange">* 지급기간</label>
          <div class="date-range">
            <input type="month" class="filter-select" v-model="filters.startMonth" />
            <span style="margin: 0 4px;">~</span>
            <input type="month" class="filter-select" v-model="filters.endMonth" />
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">현장</label>
          <!--select class="filter-select dept-select" v-model="filters.department" @change="handleSearch">
            <option v-for="dept in deptOptions" :key="dept" :value="dept">{{ dept }}</option>
          </select-->
          <SiteSelect v-model="filters.department"/>
        </div>

        <div class="filter-group">
          <label class="filter-label">지급일자</label>
          <select class="filter-select" v-model="filters.payDate" @change="handleSearch">
            <option v-for="date in payDateOptions" :key="date" :value="date">{{ date }}{{ date !== '전체' && date !== '말일' ? '일' : '' }}</option>
          </select>
        </div>

      </div>
    </div>

    <div class="table-scroll-container">
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>조회 중입니다...</p>
      </div>

      <div v-else class="table-scroll-container">

        <table v-if="filters.viewType !== '항목별'" class="statement-table">
          <thead>
          <tr>
            <th rowspan="2" class="sticky-col sticky-col-1" style="width: 14%;">부서명</th>
            <th rowspan="2" class="sticky-col sticky-col-2" style="width: 7%;">사번</th>
            <th rowspan="2" class="sticky-col sticky-col-3" style="width: 8%;">성명</th>
            <th rowspan="2" class="sticky-col sticky-col-4" style="width: 8%;">직위</th>

            <th rowspan="2" class="text-center" style="width: 10%;">지급총액</th>
            <th rowspan="2" class="text-center" style="width: 7%;">계산일수</th>
            <th rowspan="2" class="text-center sticky-divider" style="width: 10%;">실수령액</th>
            <th rowspan="2" class="text-center" style="width: 10%;">공제합계</th>

            <th :colspan="payItems.length" class="text-center border-left">지급 항목</th>
            <th :colspan="deductionItems.length" class="text-center border-left">공제 항목</th>
          </tr>
          <tr>
            <th v-for="item in payItems" :key="item.itemCd" class="text-right border-left font-normal">{{ item.itemNm }}</th>
            <th v-for="item in deductionItems" :key="item.itemCd" class="text-right border-left font-normal">{{ item.itemNm }}</th>
          </tr>
          </thead>

          <tbody>
          <tr v-for="row in processedList" :key="row.idx" class="data-row">
            <td class="text-left cell-ellipsis sticky-col sticky-col-1" :title="row.siteName">{{ row.siteName }}</td>
            <td class="text-center text-gray sticky-col sticky-col-2">{{ row.id }}</td>
            <td class="text-center font-bold text-dark sticky-col sticky-col-3">{{ maskName(row.staff) }}</td>
            <td class="text-center sticky-col sticky-col-4">{{ row.role }}</td>

            <td class="text-right text-dark">{{ formatNum(row.grossPay) }}</td>
            <td class="text-center">{{ row.workedDays }}</td>
            <td class="text-right font-bold text-blue sticky-divider">{{ formatNum(row.netPay) }}</td>
            <td class="text-right text-red">{{ formatNum(row.totalDeduction) }}</td>

            <td v-for="item in payItems" :key="'p'+item.itemCd" class="text-right border-left">
              {{ formatNum(row.parsedPay[item.itemCd]) }}
            </td>
            <td v-for="item in deductionItems" :key="'d'+item.itemCd" class="text-right border-left">
              {{ formatNum(row.parsedDed[item.itemCd]) }}
            </td>
          </tr>
          <tr v-if="processedList.length === 0">
            <td :colspan="8 + payItems.length + deductionItems.length" class="text-center p-40">
              조회된 데이터가 없습니다.
            </td>
          </tr>
          </tbody>

          <tfoot>
          <tr class="row-total">
            <td colspan="4" class="text-center font-bold text-dark sticky-col sticky-col-span4">합계 ({{ grandTotal.count }}명)</td>
            <td class="text-right font-bold text-dark">{{ formatNum(grandTotal.grossPay) }}</td>
            <td class="text-center bg-total"></td>
            <td class="text-right font-bold text-blue sticky-divider">{{ formatNum(grandTotal.netPay) }}</td>
            <td class="text-right font-bold text-red">{{ formatNum(grandTotal.totalDeduction) }}</td>

            <td v-for="item in payItems" :key="'fp'+item.itemCd" class="text-right font-bold border-left">
              {{ formatNum(grandTotal.parsedPay[item.itemCd]) }}
            </td>
            <td v-for="item in deductionItems" :key="'fd'+item.itemCd" class="text-right font-bold border-left">
              {{ formatNum(grandTotal.parsedDed[item.itemCd]) }}
            </td>
          </tr>
          </tfoot>
        </table>

        <table v-else class="statement-table">
          <thead>
          <tr>
            <th rowspan="2" class="sticky-col sticky-col-1" style="width: 20%;">부서명</th>
            <th rowspan="2" class="sticky-col sticky-col-2" style="width: 8%;">인원수</th>

            <th rowspan="2" class="text-center" style="width: 12%;">지급총액</th>
            <th rowspan="2" class="text-center sticky-divider" style="width: 12%;">실수령액</th>
            <th rowspan="2" class="text-center" style="width: 12%;">공제합계</th>

            <th :colspan="payItems.length" class="text-center border-left">지급 항목 총액</th>
            <th :colspan="deductionItems.length" class="text-center border-left">공제 항목 총액</th>
          </tr>
          <tr>
            <th v-for="item in payItems" :key="item.itemCd" class="text-right border-left font-normal">{{ item.itemNm }}</th>
            <th v-for="item in deductionItems" :key="item.itemCd" class="text-right border-left font-normal">{{ item.itemNm }}</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="g in summaryBySite" :key="g.siteName" class="data-row">
            <td class="text-left font-bold cell-ellipsis sticky-col sticky-col-1" :title="g.siteName">{{ g.siteName }}</td>
            <td class="text-center font-bold text-blue sticky-col sticky-col-2">{{ g.empCount }}명</td>

            <td class="text-right text-dark">{{ formatNum(g.grossPay) }}</td>
            <td class="text-right font-bold text-blue sticky-divider">{{ formatNum(g.netPay) }}</td>
            <td class="text-right text-red">{{ formatNum(g.totalDeduction) }}</td>

            <td v-for="item in payItems" :key="'gp'+item.itemCd" class="text-right border-left">
              {{ formatNum(g.parsedPay[item.itemCd]) }}
            </td>
            <td v-for="item in deductionItems" :key="'gd'+item.itemCd" class="text-right border-left">
              {{ formatNum(g.parsedDed[item.itemCd]) }}
            </td>
          </tr>
          <tr v-if="summaryBySite.length === 0">
            <td :colspan="5 + payItems.length + deductionItems.length" class="text-center p-40">
              조회된 내역이 없습니다.
            </td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="row-total">
            <td class="text-center font-bold text-dark sticky-col sticky-col-1">전체 합계</td>
            <td class="text-center font-bold text-blue sticky-col sticky-col-2">{{ grandTotal.count }}명</td>

            <td class="text-right font-bold text-dark">{{ formatNum(grandTotal.grossPay) }}</td>
            <td class="text-right font-bold text-blue sticky-divider">{{ formatNum(grandTotal.netPay) }}</td>
            <td class="text-right font-bold text-red">{{ formatNum(grandTotal.totalDeduction) }}</td>

            <td v-for="item in payItems" :key="'gfp'+item.itemCd" class="text-right font-bold border-left">
              {{ formatNum(grandTotal.parsedPay[item.itemCd]) }}
            </td>
            <td v-for="item in deductionItems" :key="'gfd'+item.itemCd" class="text-right font-bold border-left">
              {{ formatNum(grandTotal.parsedDed[item.itemCd]) }}
            </td>
          </tr>
          </tfoot>
        </table>

      </div>
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
  color: #333;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
}

.action-area {
  display: flex;
  gap: 8px;
}

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
  padding: 12px 24px;
  border-bottom: 1px solid #c8d4e0;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
}

.filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.f-group {
  display: flex;
  align-items: center;
}

.f-label {
  font-size: 13px;
  font-weight: 700;
  color: #333;
}
.text-orange { color: #e65100; }

.f-divider {
  color: #1a3b5c;
  margin: 0 10px;
  font-weight: bold;
}

.f-select, .f-input {
  border: 1px solid #ccc;
  padding: 2px 6px;
  font-size: 13px;
  min-width: 120px;
  height: 26px;
  box-sizing: border-box;
}
.f-select:focus, .f-input:focus { outline: none; border-color: #1a3b5c; }
.highlight-select { border-color: #2b4b6b; color: #111; }
.dept-select { min-width: 200px; }
.date-range { display: flex; align-items: center; }

/* ─── 로딩 ─── */
.loading-state {
  display: flex; flex-direction: column; align-items: center; padding: 60px;
}
.spinner {
  width: 30px; height: 30px; border: 3px solid #ccc; border-top-color: #1a3b5c;
  border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── 테이블 영역 ─── */
.table-section {
  padding: 16px 24px;
}

.table-scroll-container {
  overflow-x: auto;
  max-width: 100%;
  max-height: calc(100vh - 250px); /* 스크롤 높이 제한 */
  border: 1px solid #a8b8c8;
  border-bottom: none;
}

.statement-table {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  table-layout: fixed;
}

.statement-table th, .statement-table td {
  border-bottom: 1px solid #a8b8c8;
  border-right: 1px solid #a8b8c8;
  padding: 8px 10px;
  vertical-align: middle;
  background-clip: padding-box;
}

/* 첫 번째 열 왼쪽 테두리 보정 */
.statement-table tr td:first-child,
.statement-table tr th:first-child {
  border-left: 1px solid #a8b8c8;
}

.border-left { border-left: 1px solid #8ba6c1 !important; }

/* 헤더 (다크 블루) */
.statement-table thead th {
  background-color: #2b4b6b;
  color: #fff;
  font-weight: 600;
  text-align: center;
  border-top: 1px solid #2b4b6b;
  position: sticky;
  top: 0;
  z-index: 10;
}
/* 두 번째 헤더 줄 탑값 보정 */
.statement-table thead tr:nth-child(2) th {
  top: 35px; /* 첫 번째 tr의 높이에 맞게 조절 필요 */
}
.font-normal { font-weight: 400 !important; }

/* 데이터 행 */
.data-row { background-color: #fff; }
.data-row:nth-child(even) { background-color: #f8fafc; }
.data-row:hover td { background-color: #e2e8f0; }

/* 합계 행 (연한 파란색) */
.row-total td {
  background-color: #d0e4f0;
  border-color: #a8b8c8;
}
.bg-total { background-color: #d0e4f0 !important; }

/* 정렬 및 유틸 */
.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }
.font-bold { font-weight: 700; }
.text-dark { color: #111; }
.text-gray { color: #555; }
.text-red { color: #dc2626; }
.text-blue { color: #2563eb; }
.p-40 { padding: 40px !important; }

.cell-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ─── 틀고정 (Sticky Columns) ─── */
.sticky-col { position: sticky !important; z-index: 5; }
/* 틀고정 시 배경색 덮어씌움 (투명화 방지) */
.data-row .sticky-col { background-color: #fff; }
.data-row:nth-child(even) .sticky-col { background-color: #f8fafc; }
.data-row:hover .sticky-col { background-color: #e2e8f0; }

thead .sticky-col { z-index: 15 !important; background-color: #2b4b6b !important; border-right: 1px solid #5a7b9b !important; }
tfoot .sticky-col { z-index: 15 !important; background-color: #d0e4f0 !important; }

/* 고정 픽셀이 아닌 퍼센트로 틀고정 시, 열 너비가 깨지지 않게 픽셀(px)로 고정하는 것이 안전합니다. */
.sticky-col-1 { left: 0px; min-width: 140px; max-width: 140px; }
.sticky-col-2 { left: 140px; min-width: 70px; max-width: 70px; }
.sticky-col-3 { left: 210px; min-width: 80px; max-width: 80px; }
.sticky-col-4 { left: 290px; min-width: 80px; max-width: 80px; }
.sticky-col-span4 { left: 0px; width: 370px; z-index: 15 !important; background-color: #d0e4f0 !important; }
.sticky-divider { border-right: 2px solid #5a7b9b !important; }

/* ─── 인쇄용 미디어 쿼리 ─── */
@media print {
  @page { size: A4 landscape; margin: 15mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .hide-on-print { display: none !important; }
  .payroll-status-page { padding: 0; background: #fff; }
  .table-section { padding: 0; }
  .table-scroll-container { border: none; overflow: visible; max-height: none; }
  .statement-table { border: 2px solid #000; }
  .statement-table th, .statement-table td { border: 1px solid #666; font-size: 11px; padding: 4px; }
  .statement-table thead th { border-bottom: 2px solid #000; color: #000; background-color: #eee !important;}
  .row-total td { background-color: #ddd !important; }
}
</style>
