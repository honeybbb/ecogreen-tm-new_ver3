<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import axios from 'axios'

import Pagination from '~/components/Pagination.vue'
import SiteSelect from '~/components/SiteSelect.vue'

const { siteOptions, fetchSiteOptions } = useApi()

// ────────────────────────────────────────────────────────────
// 상태 정의
// ────────────────────────────────────────────────────────────
const isLoading = ref(false)
const reviewItems = ref([])

// 기간 검색용 시작/종료 연월 분리
const todayMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
const selectedPeriod = reactive({
  start: todayMonth,
  end: todayMonth
})
const selectedSite = ref('전체')
const searchTerm = ref('')
const filterMismatchOnly = ref(false)

// 정렬
const sortKey = ref('id')
const sortOrder = ref('desc')

// 페이지네이션
const currentPage = ref(1)
const pageSize = ref(50)

// ────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────
const fmt = (v) => (v || 0).toLocaleString()

function safeParse(val, fallback) {
  if (!val) return fallback
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return fallback }
}

function mapItem(item) {
  const site     = siteOptions.value.find(s => s.idx === item.sIdx)
  const siteName = site ? site.name : `알수없는현장(${item.sIdx})`
  const mm       = String(item.month).padStart(2, '0')
  return {
    ...item,
    // billingData: safeParse(item.billingData, {}),
    payrollData: safeParse(item.payrollData, []),
    // viewConfig:  safeParse(item.viewConfig,  null),
    id:          item.idx,
    siteName,
    target_month:  `${item.year}-${mm}`,
    total_amount:  item.grandTotal,
  }
}

// ────────────────────────────────────────────────────────────
// API / 데이터 로드
// ────────────────────────────────────────────────────────────
async function fetchReviewList() {
  isLoading.value = true;
  try {
    // 실제 API가 구성되지 않았으므로 Mock 데이터 활용
    /*
    const mockData = [
      { id: 1, sIdx: 1, siteName: '서울 래미안 아파트', typeNm: '미화',
        empCount: 10, estEmpCount: 10,
        totalSalary: 25000000, estTotalSalary: 25000000,
        billedAmount: 30000000, estBilledAmount: 30000000 },
      { id: 2, sIdx: 2, siteName: '부산 센텀시티 푸르지오', typeNm: '경비',
        empCount: 7, estEmpCount: 8,
        totalSalary: 18000000, estTotalSalary: 20000000,
        billedAmount: 22000000, estBilledAmount: 24000000 },
      { id: 3, sIdx: 3, siteName: '제주 하늘채 아파트', typeNm: '미화',
        empCount: 5, estEmpCount: 5,
        totalSalary: 15500000, estTotalSalary: 15000000,
        billedAmount: 18500000, estBilledAmount: 18000000 },
      { id: 4, sIdx: 4, siteName: '광주 푸른마을', typeNm: '경비',
        empCount: 12, estEmpCount: 12,
        totalSalary: 32000000, estTotalSalary: 32000000,
        billedAmount: 40000000, estBilledAmount: 40000000 },
      { id: 5, sIdx: 5, siteName: '대전 둔산 크로바', typeNm: '경비',
        empCount: 15, estEmpCount: 15,
        totalSalary: 38000000, estTotalSalary: 38000000,
        billedAmount: 45000000, estBilledAmount: 45000000 },
      { id: 6, sIdx: 6, siteName: '세종 첫마을 1단지', typeNm: '미화',
        empCount: 8, estEmpCount: 7,
        totalSalary: 20000000, estTotalSalary: 17500000,
        billedAmount: 24000000, estBilledAmount: 21000000 },
    ]

     */

    // 서버가 있다면:
    //const startStr = selectedMonth.value.replace('-', '')
    const startStr = selectedPeriod.start.replace('-', '')
    const endStr   = selectedPeriod.end.replace('-', '')
    const { data } = await axios.get('/api/v1/settle/review/list', {
      // params: { month: startStr }
      params: { startMonth: startStr, endMonth: endStr }
    })
    reviewItems.value = (data.data || []).map(mapItem)

    // 시연을 위해 딜레이 추가
    //await new Promise(r => setTimeout(r, 400))
    //reviewItems.value = mockData
    console.log(reviewItems.value, 'reviewItems')

    currentPage.value = 1
  } catch (e) {
    console.error('검토 리스트 조회 에러:', e)
    alert('데이터를 불러오는 중 오류가 발생했습니다.')
  } finally {
    isLoading.value = false
  }
}

// ────────────────────────────────────────────────────────────
// 필터 / 정렬 / 페이지네이션
// ────────────────────────────────────────────────────────────
watch([selectedSite, searchTerm, filterMismatchOnly], () => {
  currentPage.value = 1
})

watch(() => [selectedPeriod.start, selectedPeriod.end], fetchReviewList)

function resetFilters() {
  searchTerm.value = ''
  selectedSite.value = '전체'
  filterMismatchOnly.value = false
  currentPage.value = 1
}

function toggleSort(key) {
  sortOrder.value = sortKey.value === key && sortOrder.value === 'asc' ? 'desc' : 'asc'
  sortKey.value = key
  currentPage.value = 1
}

const filteredItems = computed(() => {
  let list = reviewItems.value.filter(item => {
    if (selectedSite.value !== '전체' && item.sIdx !== selectedSite.value) return false
    if (searchTerm.value && !item.siteName.toLowerCase().includes(searchTerm.value.toLowerCase())) return false

    if (filterMismatchOnly.value) {
      const isMismatch = item.staffCount !== item.estEmpCount ||
          item.totalSalary !== item.estTotalSalary ||
          item.billedAmount !== item.estBilledAmount
      if (!isMismatch) return false
    }

    return true
  })

  list.sort((a, b) => {
    const mod = sortOrder.value === 'asc' ? 1 : -1
    const vA = a[sortKey.value], vB = b[sortKey.value]
    if (typeof vA === 'string') return vA.localeCompare(vB) * mod
    return (vA < vB ? -1 : vA > vB ? 1 : 0) * mod
  })

  return list
})

const pagedItems = computed(() => {
  const s = (currentPage.value - 1) * pageSize.value
  return filteredItems.value.slice(s, s + pageSize.value)
})

// 통계
const statsInfo = computed(() => {
  const all = reviewItems.value
  const mismatches = all.filter(item =>
      item.staffCount !== item.workStaffCount ||
      item.totalSalary !== item.estTotalSalary ||
      item.billedAmount !== item.estBilledAmount
  )
  return {
    totalCount: all.length,
    mismatchCount: mismatches.length,
    normalCount: all.length - mismatches.length
  }
})

const isJoinLeaveModalOpen = ref(false)
const joinLeaveData = ref(null)

function openJoinLeaveModal(item) {
  if (!item || !item.payrollData) return;

  const targetMonth = item.target_month // '2026-07'
  const targetYm = targetMonth.replace(/-/g, '') // '202607'

  const joined = item.payrollData.filter(row => row.inDate && row.inDate.replace(/-/g, '').startsWith(targetYm))
  const left = item.payrollData.filter(row => row.outDate && row.outDate.replace(/-/g, '').startsWith(targetYm))

  joinLeaveData.value = {
    siteName: item.siteName,
    targetMonth,
    joined,
    left
  }
  isJoinLeaveModalOpen.value = true
}

function closeJoinLeaveModal() {
  isJoinLeaveModalOpen.value = false
}

function hasError(current, estimate) {
  return current !== estimate
}

onMounted(async () => {
  await fetchSiteOptions()
  await fetchReviewList()
})
</script>

<template>
  <div class="settlement-review-page">

    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-check-all"></i>
          정산 및 청구액 총액리스트
        </h1>
        <p class="page-subtitle">견적서 기준 금액 및 인원 변동을 확인합니다.</p>
      </div>
      <div class="header-actions">
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color:var(--primary);--card-bg:var(--primary-soft)">
        <div class="stat-icon"><i class="mdi mdi-office-building-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">대상 현장 수</span>
          <span class="stat-value">{{ statsInfo.totalCount }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--success);--card-bg:rgba(16,185,129,.1)">
        <div class="stat-icon"><i class="mdi mdi-check-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">정상 건수</span>
          <span class="stat-value">{{ statsInfo.normalCount }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--danger);--card-bg:rgba(239,68,68,.1)">
        <div class="stat-icon"><i class="mdi mdi-alert-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">변동(오류) 발생 건수</span>
          <span class="stat-value">{{ statsInfo.mismatchCount }}<small>건</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group period-group">
          <label class="filter-label">청구 연월</label>
          <div class="period-inputs">
            <input type="month" v-model="selectedPeriod.start" class="filter-select period-select" />
            <span class="period-separator">~</span>
            <input type="month" v-model="selectedPeriod.end" class="filter-select period-select" />
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">현장</label>
          <SiteSelect v-model="selectedSite" />
        </div>

        <div class="search-group">
          <!--div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                v-model="searchTerm" type="text"
                placeholder="현장명으로 검색..."
                class="search-input"
                @keyup.enter="fetchReviewList"
            />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div-->
          <button @click="resetFilters" class="btn-search">
            <i class="mdi mdi-filter-off"></i><span>검색필터 초기화</span>
          </button>
        </div>
      </div>

      <div class="filter-toggles-row">
        <span class="toggles-label"><i class="mdi mdi-filter-variant"></i> 필터:</span>
        <div class="filter-toggles">
          <button
              :class="['toggle-chip', { active: !filterMismatchOnly }]"
              @click="filterMismatchOnly = false"
          >
            <i class="mdi mdi-view-list"></i>
            <span>전체 현장 보기</span>
            <span class="chip-count">{{ statsInfo.totalCount }}</span>
          </button>
          <button
              :class="['toggle-chip', { active: filterMismatchOnly }]"
              @click="filterMismatchOnly = true"
          >
            <i class="mdi mdi-alert-circle-outline"></i>
            <span>변동/오류 발생 건만 보기</span>
            <span class="chip-count">{{ statsInfo.mismatchCount }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>검토 데이터를 불러오는 중...</p>
    </div>

    <div v-else class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>현장별 정산 및 청구 목록 ({{ filteredItems.length }}건)</span>
        </div>
        <div class="page-size-select">
          <label>페이지당</label>
          <select
              v-model="pageSize"
              @change="currentPage = 1"
              class="filter-select"
              style="height:32px;padding:4px 10px;font-size:12px;min-width:60px;"
          >
            <option v-for="n in [50, 100, 200, 500]" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <colgroup>
            <col width="5%">
            <col width="*">
            <col width="5%">
            <col width="5%">
            <col width="5%">
            <col width="10%">
            <col width="12%">
            <col width="12%">
            <col width="12%">
            <col width="12%">
            <col width="5%">
          </colgroup>
          <thead>
          <tr>
            <th class="sortable text-center" style="width:70px" @click="toggleSort('id')">
              <div class="th-content justify-center">
                No.<i v-if="sortKey==='id'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="sortable" @click="toggleSort('siteName')">
              <div class="th-content">
                현장명 <i v-if="sortKey==='siteName'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center" style="width:80px">구분</th>
            <td class="text-center">청구연월</td>
            <th class="text-center" style="width:160px">인원 (기준 / 당월)</th>
            <th class="sortable text-center" @click="toggleSort('deductionDays')">
              공제일수 <i v-if="sortKey==='deductionDays'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
            </th>
            <th class="text-center">지급총액 (기준 / 당월)</th>
            <th class="text-center">공제총액 (기준 / 당월)</th>
            <th class="text-right" style="width:200px">급여총액 (기준 / 당월)</th>
            <th class="text-right" style="width:200px">청구액 (기준 / 당월)</th>
            <th class="text-center" style="width:120px">상태</th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="(item, index) in pagedItems"
              :key="index"
              class="data-row"
              :class="{
                'row-mismatch':
                  hasError(item.staffCount, item.workStaffCount) ||
                  hasError(item.totalSalary, item.estTotalSalary) ||
                  hasError(item.billedAmount, item.estBilledAmount)
              }"
          >
            <td class="text-center text-gray text-sm">{{ index + 1 }}</td>

            <td class="site-name">{{ item.siteName }}</td>

            <td class="text-center">
              <span :class="['badge',
                  item.type === '01001002' ? 'badge-clean' :
                  item.type === '01001001' ? 'badge-guard' : 'badge-etc'
                ]">
                {{ item.type === '01001002' ? '미화' : '경비' || '-' }}
              </span>
            </td>
            <td class="text-center">{{ item.target_month }}</td>

            <td class="text-center cursor-pointer hover-underline text-blue" @click.stop="openJoinLeaveModal(item)">
              <span class="">{{ item.staffCount }}명</span> /
              <span :class="['real-text', { 'error-text': hasError(item.staffCount, item.workStaffCount) }]">
                {{ item.workStaffCount }}명
                <i v-if="hasError(item.staffCount, item.workStaffCount)" class="mdi mdi-arrow-up-down-bold"></i>
              </span>
            </td>
            <td class="text-center">
              {{ item.deductionDays }} 일</td>

            <td class="text-right">
              <span class="">{{ fmt(item.estTotalSalary) }}원</span> /
              <span :class="['real-text', { 'error-text': hasError(item.totalPaySum, item.estTotalSalary) }]">
                {{ fmt(item.totalGrossPay) }}원
                <i v-if="hasError(item.totalGrossPay, item.estTotalSalary)" class="mdi mdi-alert-circle-outline"></i>
              </span>
            </td>

            <td class="text-right">
              <span class="">{{ fmt(item.estTotalSalary) }}원</span> /
              <span :class="['real-text', { 'error-text': hasError(item.totalDeductions, item.estTotalSalary) }]">
                {{ fmt(item.totalDeductions) }}원
                <i v-if="hasError(item.totalDeductions, item.estTotalSalary)" class="mdi mdi-alert-circle-outline"></i>
              </span>
            </td>

            <td class="text-right">
              <span class="">{{ fmt(item.estTotalSalary) }}원</span> /
              <span :class="['real-text', { 'error-text': hasError(item.totalNetPay, item.estTotalSalary) }]">
                {{ fmt(item.totalNetPay) }}원
                <i v-if="hasError(item.totalNetPay, item.estTotalSalary)" class="mdi mdi-alert-circle-outline"></i>
              </span>
            </td>

            <td class="text-right">
              <span class="">{{ fmt(item.estBilledAmount) }}원</span> /
              <span :class="['real-text', { 'error-text': hasError(item.billedAmount, item.estBilledAmount) }]">
                {{ fmt(item.billedAmount) }}원
                <i v-if="hasError(item.billedAmount, item.estBilledAmount)" class="mdi mdi-alert-circle-outline"></i>
              </span>
            </td>

            <td class="text-center">
              <span v-if="hasError(item.staffCount, item.workStaffCount) || hasError(item.totalSalary, item.estTotalSalary) || hasError(item.billedAmount, item.estBilledAmount)" class="badge badge-etc">
                변동 확인 필요
              </span>
              <span v-else class="badge badge-clean">
                정상
              </span>
            </td>
          </tr>

          <tr v-if="filteredItems.length === 0" class="empty-row">
            <td colspan="7">
              <div class="empty-state">
                <i class="mdi mdi-check-network-outline"></i>
                <p>조건에 맞는 현장이 없습니다.</p>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredItems.length"
      />
    </div>

    <!-- 입/퇴사 현황 팝업 -->
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
              <h4>
                <span class="badge badge-clean">입사자 {{ joinLeaveData.joined.length }}명</span>
              </h4>
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
                  <td colspan="3" class="text-center text-muted" style="padding:20px;">입사자가 없습니다.</td>
                </tr>
                </tbody>
              </table>
            </div>

            <!-- 퇴사자 -->
            <div class="table-section">
              <h4>
                <span class="badge badge-etc">퇴사자 {{ joinLeaveData.left.length }}명</span>
              </h4>
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
                  <td colspan="3" class="text-center text-muted" style="padding:20px;">퇴사자가 없습니다.</td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.period-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
}
.period-select {
  width: 130px;
}

/* 필터 토글 */
.filter-toggles-row {
  display:flex; align-items:center; gap:12px;
  padding-top:14px; margin-top:14px; border-top:1px solid var(--border-color); flex-wrap:wrap;
}
.toggles-label {
  display:flex; align-items:center; gap:6px;
  font-size:13px; font-weight:600; color:var(--text-sub); white-space:nowrap;
}
.filter-toggles { display:flex; gap:8px; flex-wrap:wrap; }

.toggle-chip {
  display:inline-flex; align-items:center; gap:5px;
  padding:6px 12px; background:var(--bg-surface);
  border:1px solid var(--border-color); border-radius:20px;
  cursor:pointer; transition:all .2s;
  font-size:12px; font-weight:600; color:var(--text-sub); font-family:inherit;
}
.toggle-chip:hover  { background:var(--bg-hover); border-color:var(--border-focus); }
.toggle-chip.active { background:var(--primary-soft); border-color:var(--primary); color:var(--primary); }
.toggle-chip i      { font-size:15px; }

.chip-count {
  background:var(--bg-canvas); color:var(--text-sub);
  font-size:10px; font-weight:700;
  padding:1px 6px; border-radius:8px; margin-left:2px;
  font-family:'JetBrains Mono', monospace;
}
.toggle-chip.active .chip-count { background:var(--primary); color:#fff; }

/* 테이블 */
.table-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.table-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:14px 20px; border-bottom:1px solid var(--border-color);
}
.table-title  { display:flex; align-items:center; gap:10px; font-size:15px; font-weight:700; color:var(--text-main); }
.table-title i { font-size:18px; color:var(--primary); }
.page-size-select { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-sub); }

.table-scroll-container { overflow-x:auto; -webkit-overflow-scrolling:touch; }
.table-scroll-container::-webkit-scrollbar       { height:6px; }
.table-scroll-container::-webkit-scrollbar-thumb { background:var(--border-focus); border-radius:3px; }

.data-table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
}
.data-table th {
  background: var(--bg-canvas);
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-sub);
  border-bottom: 1px solid var(--border-color);
  text-align: left;
}
.data-table td {
  padding: 12px 16px;
  font-size: 14px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}
.data-table tbody tr {
  transition: background-color 0.15s;
}
.data-table tbody tr:hover {
  background-color: var(--bg-hover);
}

.th-content { display:flex; align-items:center; gap:5px; }
.th-content.justify-center { justify-content:center; }
.th-content.justify-end    { justify-content:flex-end; }
.sortable       { cursor:pointer; user-select:none; }
.sortable:hover { background:var(--bg-hover); }

/* 행 상태 */
.row-mismatch { background:rgba(239,68,68,.03) !important; }
.row-mismatch:hover { background:rgba(239,68,68,.06) !important; }

/* 뱃지 */
.badge       { padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; display: inline-block; }
.badge-clean { background:rgba(16,185,129,.1); color:var(--success); }
.badge-guard { background:var(--primary-soft);  color:var(--primary); }
.badge-etc   { background:rgba(239,68,68,.1);  color:var(--danger); }

/* 텍스트 / 금액 */
.site-name   { font-weight:600; color:var(--text-main); }
.est-text    { font-size: 13px; color: var(--text-sub); text-decoration: line-through; margin-right: 4px; }
.real-text   { font-size: 14px; font-weight: 700; color: var(--text-main); }
.error-text  { color: var(--danger); display: inline-flex; align-items: center; gap: 4px; }

/* 스피너 / 빈 상태 */
.spinner {
  width:38px; height:38px; border:3px solid var(--bg-canvas);
  border-top-color:var(--primary); border-radius:50%;
  animation:spin 1s linear infinite; margin:0 auto 14px;
}
@keyframes spin { to { transform:rotate(360deg); } }

.loading-state {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:80px 20px; color:var(--text-sub); font-size:14px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-sub);
}
.empty-state i {
  font-size: 48px;
  color: var(--text-muted);
  margin-bottom: 16px;
}
.empty-state p {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--text-main);
}
.hover-underline:hover { text-decoration: underline; background-color: var(--primary-soft); }
.cursor-pointer { cursor: pointer; }

/* 팝업 모달 CSS */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.modal-content {
  background: var(--bg-surface);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
}
.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}
.btn-close {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-muted);
  cursor: pointer;
}
.modal-body {
  padding: 20px;
  overflow-y: auto;
}
.tables-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.table-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}
.detail-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}
.detail-table th, .detail-table td {
  padding: 10px 14px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-color);
}
.detail-table th {
  background: rgba(0,0,0,0.02);
  color: var(--text-sub);
  font-weight: 600;
}
</style>
