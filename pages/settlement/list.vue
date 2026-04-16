<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import axios from 'axios'

import SettlementModal      from '@/components/SettlementModal.vue'
import SettlementPrintModal from '@/components/SettlementPrintModal.vue'
import EstimateModal        from '~/components/estimateModal.vue'
import EstimatePrintModal   from '~/components/estimatePrintModal.vue'
import Pagination           from '~/components/Pagination.vue'

const { typeOptions, siteOptions, fetchTypeOptions, fetchSiteOptions } = useApi()

// ────────────────────────────────────────────────────────────
// 상태 정의 (status 코드 → 표시 정보)
// ────────────────────────────────────────────────────────────
const STATUS_MAP = {
  0: { text: '작성중',   cls: 'status-pending', icon: 'mdi-progress-clock' },
  1: { text: '청구 완료',   cls: 'status-billed',  icon: 'mdi-file-document-check-outline' },
  2: { text: '입금 완료',   cls: 'status-active',  icon: 'mdi-check-circle-outline' },
  3: { text: '미수 처리',   cls: 'status-unpaid',  icon: 'mdi-alert-circle-outline' },
};
const statusInfo = (s) => STATUS_MAP[+s] ?? STATUS_MAP[0]

// ────────────────────────────────────────────────────────────
// 목록 상태
// ────────────────────────────────────────────────────────────
const isLoading   = ref(false)
const settlements = ref([])

// 기간 검색용 시작/종료 연월 분리
const todayMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
const selectedPeriod = reactive({
  start: todayMonth,
  end: todayMonth
})

const searchTerm   = ref('')
const selectedSite = ref('전체')
const selectedType = ref('전체')
const filterStatus = ref('all')

// 정렬
const sortKey   = ref('id')
const sortOrder = ref('desc')

// 페이지네이션
const currentPage = ref(1)
const pageSize    = ref(50)

// 선택
const selectAll = computed({
  get: () => pagedSettlements.value.length > 0 && pagedSettlements.value.every(p => p.selected),
  set: (v) => pagedSettlements.value.forEach(p => (p.selected = v)),
})
const selectedItems = computed(() => settlements.value.filter(s => s.selected))

// ────────────────────────────────────────────────────────────
// 모달 상태
// ────────────────────────────────────────────────────────────
const isModalOpen         = ref(false)
const selectedId          = ref(null)
const initialDataForModal = ref(null)
const editModalType       = ref('SERVICE')

const isPrintModalOpen = ref(false)
const printTargetItems = ref([])
const printModalType   = ref('SERVICE')

const isCreateMenuOpen = ref(false)

// 미수처리 모달
const isUnpaidModalOpen = ref(false)
const unpaidTarget      = ref(null)
const bigo              = ref('')
const isUnpaidSaving    = ref(false)

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
    billingData: safeParse(item.billingData, {}),
    payrollData: safeParse(item.payrollData, []),
    viewConfig:  safeParse(item.viewConfig,  null),
    id:          item.idx,
    siteName,
    target_month:  `${item.year}-${mm}`,
    total_amount:  item.grandTotal,
    selected:      false,
    bigo:          item.bigo || '',
  }
}

// ────────────────────────────────────────────────────────────
// API
// ────────────────────────────────────────────────────────────
async function fetchList() {
  // 시작일이 종료일보다 늦으면 예외처리
  if (selectedPeriod.start > selectedPeriod.end) {
    alert('시작 연월이 종료 연월보다 클 수 없습니다.')
    return
  }

  isLoading.value = true
  try {
    // 'YYYY-MM' -> 'YYYYMM' 변환하여 백엔드로 전송
    const startStr = selectedPeriod.start.replace('-', '')
    const endStr   = selectedPeriod.end.replace('-', '')

    const { data } = await axios.get('/api/v1/settle/site/list', {
      params: { startMonth: startStr, endMonth: endStr }
    })

    settlements.value = (data.data || []).map(mapItem)
    currentPage.value = 1
  } catch (e) {
    console.error('리스트 조회 에러:', e)
    alert('데이터를 불러오는 중 오류가 발생했습니다.')
  } finally {
    isLoading.value = false
  }
}

async function sendReceipe(item) {
  if (!confirm(`[${item.siteName}] 청구 완료 처리하시겠습니까?`)) return
  try {
    await axios.post('/api/v1/settle/site/status', {
      idx:       item.id,
      status:    1,
      changedBy: useAuthStore().user?.managerId,
    })
    alert('청구 완료 처리가 완료되었습니다.')
    await fetchList()
  } catch {
    alert('처리 중 오류가 발생했습니다.')
  }
}

async function confirmDeposit(item) {
  if (!confirm(`[${item.siteName}] 입금 확인 처리하시겠습니까?`)) return
  try {
    await axios.post('/api/v1/settle/site/status', {
      idx:       item.id,
      status:    2,
      changedBy: useAuthStore().user?.managerId,
    })
    alert('입금 확인 처리가 완료되었습니다.')
    await fetchList()
  } catch {
    alert('처리 중 오류가 발생했습니다.')
  }
}

function openUnpaidModal(item) {
  unpaidTarget.value      = item
  bigo.value              = item.bigo || ''
  isUnpaidModalOpen.value = true
}

async function executeUnpaid() {
  if (!bigo.value.trim()) { alert('미수 사유를 입력해주세요.'); return }
  isUnpaidSaving.value = true
  try {
    await axios.post('/api/v1/settle/site/status', {
      idx:      unpaidTarget.value.id,
      status:   3,
      bigo:     bigo.value.trim(),
      changeBy: useAuthStore().user?.managerId || 'unknown',
    })
    alert('미수 처리가 완료되었습니다.')
    isUnpaidModalOpen.value = false
    await fetchList()
  } catch {
    alert('처리 중 오류가 발생했습니다.')
  } finally {
    isUnpaidSaving.value = false
  }
}

async function revertStatus(item) {
  const label = statusInfo(item.status).text
  if (!confirm(`[${item.siteName}] ${label} 상태를 작성중으로 되돌리시겠습니까?`)) return
  try {
    await axios.post('/api/v1/settle/site/status', {
      idx:      item.id,
      status:   0, // ★ 작성중으로 되돌리기이므로 0으로 전송
      changeBy: useAuthStore().user?.managerId || 'unknown',
    })
    await fetchList()
  } catch {
    alert('처리 중 오류가 발생했습니다.')
  }
}

async function deleteSelected() {
  if (!selectedItems.value.length) return
  if (!confirm(`선택한 ${selectedItems.value.length}건을 삭제하시겠습니까?\n(복구 불가)`)) return
  try {
    isLoading.value = true
    await Promise.all(selectedItems.value.map(i => axios.delete(`/api/v1/settle/site/${i.id}`)))
    alert('삭제가 완료되었습니다.')
    await fetchList()
  } catch {
    alert('삭제 중 오류가 발생했습니다.')
  } finally {
    isLoading.value = false
  }
}

function handlePrint() {
  if (!selectedItems.value.length) return
  const firstType = selectedItems.value[0].docType === 'RETIRE_ANNUAL' ? 'RETIRE_ANNUAL' : 'SERVICE'
  const isMixed   = selectedItems.value.some(
      i => (i.docType === 'RETIRE_ANNUAL' ? 'RETIRE_ANNUAL' : 'SERVICE') !== firstType
  )
  if (isMixed) {
    alert('일반 용역 정산서와 연차/퇴직금 정산서는 함께 출력할 수 없습니다.\n동일한 유형만 선택해주세요.')
    return
  }
  printTargetItems.value = selectedItems.value.map(i => ({ ...i }))
  printModalType.value   = firstType
  isPrintModalOpen.value = true
}

// ────────────────────────────────────────────────────────────
// 필터 / 정렬 / 페이지네이션
// ────────────────────────────────────────────────────────────
watch([selectedSite, selectedType, searchTerm, filterStatus], () => {
  currentPage.value = 1
})

// ★ 기간이 변경되면 fetchList 재호출
watch(() => [selectedPeriod.start, selectedPeriod.end], fetchList)

function resetFilters() {
  searchTerm.value   = ''
  selectedSite.value = '전체'
  selectedType.value = '전체'
  filterStatus.value = 'all'
  currentPage.value  = 1
}

function toggleSort(key) {
  sortOrder.value   = sortKey.value === key && sortOrder.value === 'asc' ? 'desc' : 'asc'
  sortKey.value     = key
  currentPage.value = 1
}

const baseFilteredSettlements = computed(() => {
  const { start, end } = selectedPeriod
  let list = settlements.value.filter(item => {
    // ★ 기간 필터링 적용 (YYYY-MM 문자열 비교)
    if (item.target_month < start || item.target_month > end)                return false
    if (selectedSite.value !== '전체' && item.sIdx !== selectedSite.value)   return false
    if (selectedType.value !== '전체' && item.type !== selectedType.value)   return false
    if (!item.siteName.toLowerCase().includes(searchTerm.value.toLowerCase())) return false
    return true
  })

  // ── 현장 + 월 + 구분 기준으로 중복 제거 (가장 최근 idx 우선) ──
  const seen = new Map()
  list.forEach(item => {
    const key = `${item.sIdx}-${item.target_month}-${item.type}`
    if (!seen.has(key) || item.id > seen.get(key).id) seen.set(key, item)
  })

  return [...seen.values()]
})

// 상태 필터와 정렬을 추가 적용
const filteredSettlements = computed(() => {
  let list = baseFilteredSettlements.value.filter(item => {
    if (filterStatus.value === 'pending' && +item.status !== 0) return false
    if (filterStatus.value === 'billed'  && +item.status !== 1) return false
    if (filterStatus.value === 'deposit' && +item.status !== 2) return false
    if (filterStatus.value === 'unpaid'  && +item.status !== 3) return false
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

const pagedSettlements = computed(() => {
  const s = (currentPage.value - 1) * pageSize.value
  return filteredSettlements.value.slice(s, s + pageSize.value)
})

//통계
const statsInfo = computed(() => {
  const d = baseFilteredSettlements.value
  return {
    totalCount:   d.length,
    totalAmount:  d.reduce((s, i) => s + (i.total_amount || 0), 0),
    pendingCount: d.filter(i => +i.status === 0).length,
    billedCount:  d.filter(i => +i.status === 1).length,
    depositCount: d.filter(i => +i.status === 2).length,
    unpaidCount:  d.filter(i => +i.status === 3).length,
  }
})

// ────────────────────────────────────────────────────────────
// 모달 제어
// ────────────────────────────────────────────────────────────
function openCreateModal(docType = 'SERVICE') {
  selectedId.value          = null
  initialDataForModal.value = {}
  editModalType.value       = docType
  isModalOpen.value         = true
  isCreateMenuOpen.value    = false
}

function openEditModal(item, tabType = 'statement') {
  selectedId.value          = item.id
  initialDataForModal.value = { ...item, defaultTab: tabType }
  editModalType.value       = item.docType === 'RETIRE_ANNUAL' ? 'RETIRE_ANNUAL' : 'SERVICE'
  isModalOpen.value         = true
}

onMounted(async () => {
  await Promise.all([
    fetchTypeOptions(),
    fetchSiteOptions()
  ])
  await fetchList()
})
</script>

<template>
  <div class="settlement-list-page">

    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calculator-variant-outline"></i>
          정산서 및 내역서 관리
        </h1>
        <p class="page-subtitle">단지 정산 및 청구 내역을 기간별로 관리합니다</p>
      </div>
      <div class="header-actions">
        <transition name="fade">
          <div v-if="selectedItems.length > 0" class="bulk-actions">
            <button @click="handlePrint" class="btn-print">
              <i class="mdi mdi-printer-outline"></i>출력 ({{ selectedItems.length }}건)
            </button>
            <button @click="deleteSelected" class="btn-delete">
              <i class="mdi mdi-trash-can-outline"></i>선택 삭제
            </button>
          </div>
        </transition>

        <div class="create-dropdown" v-click-outside="() => isCreateMenuOpen = false">
          <button @click="isCreateMenuOpen = !isCreateMenuOpen" class="btn-add">
            <i class="mdi mdi-file-document-plus-outline"></i>
            새 정산서 작성
            <i class="mdi mdi-chevron-down"></i>
          </button>
          <ClientOnly>
            <div v-if="isCreateMenuOpen" class="create-menu">
              <button class="cm-item" @click="openCreateModal('SERVICE')">
                <i class="mdi mdi-file-document-outline"></i>
                <span class="cm-title">일반 용역 정산서</span>
              </button>
              <div class="cm-divider"></div>
              <button class="cm-item" @click="openCreateModal('RETIRE_ANNUAL')">
                <i class="mdi mdi-calendar-check-outline"></i>
                <span class="cm-title">연차·퇴직금 정산서</span>
              </button>
            </div>
          </ClientOnly>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color:var(--primary);--card-bg:var(--primary-soft)">
        <div class="stat-icon"><i class="mdi mdi-file-document-multiple-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">기간 내 총 청구</span>
          <span class="stat-value">{{ statsInfo.totalCount }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--success);--card-bg:rgba(16,185,129,.1)">
        <div class="stat-icon"><i class="mdi mdi-cash-multiple"></i></div>
        <div class="stat-content">
          <span class="stat-label">기간 내 청구금액</span>
          <span class="stat-value">{{ fmt(statsInfo.totalAmount) }}<small>원</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:#0ea5e9;--card-bg:rgba(14,165,233,.1)">
        <div class="stat-icon"><i class="mdi mdi-check-decagram-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">입금 완료</span>
          <span class="stat-value">{{ statsInfo.depositCount }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--danger);--card-bg:rgba(239,68,68,.1)">
        <div class="stat-icon"><i class="mdi mdi-alert-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">미수 처리</span>
          <span class="stat-value">{{ statsInfo.unpaidCount }}<small>건</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group period-group">
          <label class="filter-label"><i class="mdi mdi-calendar-month-outline"></i> 청구 연월</label>
          <div class="period-inputs">
            <input type="month" v-model="selectedPeriod.start" class="filter-select period-select" />
            <span class="period-separator">~</span>
            <input type="month" v-model="selectedPeriod.end" class="filter-select period-select" />
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 현장</label>
          <SiteSelect v-model="selectedSite" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-format-list-bulleted-type"></i> 구분</label>
          <select v-model="selectedType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
          </select>
        </div>
        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                v-model="searchTerm" type="text"
                placeholder="현장명으로 검색..."
                class="search-input"
                @keyup.enter="fetchList"
            />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="resetFilters" class="btn-search">
            <i class="mdi mdi-filter-off"></i><span>초기화</span>
          </button>
        </div>
      </div>

      <div class="filter-toggles-row">
        <span class="toggles-label"><i class="mdi mdi-filter-variant"></i> 상태 필터:</span>
        <div class="filter-toggles">
          <button
              v-for="opt in [
        { val:'all',     icon:'mdi-view-list',                   label:'전체',     count: statsInfo.totalCount },
        { val:'pending', icon:'mdi-progress-clock',              label:'작성중',   count: statsInfo.pendingCount },
        { val:'billed',  icon:'mdi-file-document-check-outline', label:'청구완료', count: statsInfo.billedCount },
        { val:'deposit', icon:'mdi-check-circle-outline',        label:'입금완료', count: statsInfo.depositCount },
        { val:'unpaid',  icon:'mdi-alert-circle-outline',        label:'미수처리', count: statsInfo.unpaidCount },
      ]"
              :key="opt.val"
              :class="['toggle-chip', { active: filterStatus === opt.val }]"
              @click="filterStatus = opt.val"
          >
            <i :class="['mdi', opt.icon]"></i>
            <span>{{ opt.label }}</span>
            <span class="chip-count">{{ opt.count }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>정산 내역을 불러오는 중...</p>
    </div>

    <div v-else class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>정산 목록 ({{ filteredSettlements.length }}건)</span>
          <span v-if="selectedItems.length > 0" class="selected-badge">
            {{ selectedItems.length }}건 선택됨
          </span>
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
          <thead>
          <tr>
            <th class="text-center" style="width:40px">
              <input type="checkbox" v-model="selectAll" class="custom-checkbox" />
            </th>
            <th class="sortable text-center" style="width:70px" @click="toggleSort('id')">
              <div class="th-content justify-center">
                No.<i v-if="sortKey==='id'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th style="width:110px;">문서 종류</th>
            <th class="sortable" @click="toggleSort('siteName')">
              <div class="th-content">
                현장명<i v-if="sortKey==='siteName'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="sortable text-center" style="width:80px" @click="toggleSort('type')">
              <div class="th-content justify-center">
                구분<i v-if="sortKey==='type'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="sortable text-center" style="width:100px" @click="toggleSort('target_month')">
              <div class="th-content justify-center">
                청구연월<i v-if="sortKey==='target_month'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="sortable text-right" style="width:120px" @click="toggleSort('total_amount')">
              <div class="th-content justify-end">
                청구금액<i v-if="sortKey==='total_amount'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center" style="width:100px">상태</th>
            <th class="text-center" style="width:150px">미수 사유</th>
            <th class="sortable text-center" style="width:90px" @click="toggleSort('regDt')">
              <div class="th-content justify-center">
                작성일<i v-if="sortKey==='regDt'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="sortable text-center" style="width:90px" @click="toggleSort('modDt')">
              <div class="th-content justify-center">
                수정일<i v-if="sortKey==='modDt'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center" style="width:150px">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="item in pagedSettlements"
              :key="item.id"
              class="data-row"
              :class="{
                'row-selected': item.selected,
                'row-unpaid':   +item.status === 2,
              }"
          >
            <td class="text-center">
              <input type="checkbox" v-model="item.selected" class="custom-checkbox" />
            </td>
            <td class="text-center text-gray text-sm">{{ item.id }}</td>

            <td>
                <span v-if="item.docType === 'RETIRE_ANNUAL'" class="doc-type-badge retire">
                  <i class="mdi mdi-calendar-check-outline"></i> 연차/퇴직
                </span>
              <span v-else class="doc-type-badge service">
                  <i class="mdi mdi-file-document-outline"></i> 일반용역
                </span>
            </td>

            <td class="site-name">{{ item.siteName }}</td>

            <td class="text-center">
                <span :class="['badge',
                  item.type === '01001002' ? 'badge-clean' :
                  item.type === '01001001' ? 'badge-guard' : 'badge-etc'
                ]">
                  {{ item.typeNm || '-' }}
                </span>
            </td>

            <td class="text-center text-sm">{{ item.target_month }}</td>
            <td class="text-right amount-text">{{ fmt(item.total_amount) }}</td>

            <td class="text-center">
                <span :class="['status-badge', statusInfo(item.status).cls]">
                  <i :class="['mdi', statusInfo(item.status).icon]"></i>
                  {{ statusInfo(item.status).text }}
                </span>
            </td>

            <td class="text-center">
                <span v-if="+item.status === 3 && item.bigo" class="unpaid-note" :title="item.bigo">
                  <i class="mdi mdi-note-text-outline"></i>
                  {{ item.bigo }}
                </span>
              <span v-else class="text-gray text-sm">—</span>
            </td>

            <td class="text-center text-gray text-sm">{{ item.regDt }}</td>
            <td class="text-center text-gray text-sm">{{ item.modDt }}</td>

            <td class="text-center">
              <div class="action-buttons">
                <button
                    @click="openEditModal(item, 'statement')"
                    class="icon-btn icon-btn--blue"
                    title="청구 공문"
                ><i class="mdi mdi-file-document-outline"></i></button>

                <button
                    v-if="item.docType !== 'RETIRE_ANNUAL'"
                    @click="openEditModal(item, 'details')"
                    class="icon-btn"
                    title="급여 내역서 (현장용/세무사용)"
                ><i class="mdi mdi-table-account"></i></button>

                <span class="icon-divider"></span>

                <template v-if="item.status === 0">
                  <button
                      @click="sendReceipe(item)"
                      class="icon-btn"
                      title="청구 완료"
                  ><i class="mdi mdi-check-circle-outline"></i></button>
                </template>

                <template v-else-if="item.status === 1">
                  <button
                      @click="confirmDeposit(item)"
                      class="icon-btn icon-btn--green"
                      title="입금 확인"
                  ><i class="mdi mdi-check-circle-outline"></i></button>
                  <button
                      @click="openUnpaidModal(item)"
                      class="icon-btn icon-btn--red"
                      title="미수 처리"
                  ><i class="mdi mdi-alert-circle-outline"></i></button>
                </template>

                <template v-else>
                  <button
                      @click="revertStatus(item)"
                      class="icon-btn"
                      title="작성중으로 되돌리기"
                  ><i class="mdi mdi-undo-variant"></i></button>
                </template>
              </div>
            </td>
          </tr>

          <tr v-if="filteredSettlements.length === 0" class="empty-row">
            <td colspan="12">
              <div class="empty-state">
                <i class="mdi mdi-text-box-search-outline"></i>
                <p>조건에 맞는 정산 내역이 없습니다.</p>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredSettlements.length"
      />
    </div>

    <div v-if="isUnpaidModalOpen" class="modal-overlay" @click.self="isUnpaidModalOpen = false">
      <div class="modal-box">
        <div class="modal-header">
          <h2 class="modal-title">
            <i class="mdi mdi-alert-circle-outline"></i>
            미수 처리
            <span class="modal-site-chip">{{ unpaidTarget?.siteName }}</span>
          </h2>
          <button class="modal-close" @click="isUnpaidModalOpen = false">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="unpaid-summary">
            <div class="us-item">
              <span class="us-label">청구연월</span>
              <span class="us-value">{{ unpaidTarget?.target_month }}</span>
            </div>
            <div class="us-item">
              <span class="us-label">청구금액</span>
              <span class="us-value amount">{{ fmt(unpaidTarget?.total_amount) }}원</span>
            </div>
            <div class="us-item">
              <span class="us-label">현재 상태</span>
              <span :class="['status-badge', statusInfo(unpaidTarget?.status).cls]" style="font-size:11px;">
                <i :class="['mdi', statusInfo(unpaidTarget?.status).icon]"></i>
                {{ statusInfo(unpaidTarget?.status).text }}
              </span>
            </div>
          </div>
          <div class="mform-item" style="margin-top:16px">
            <label>미수 사유 <span style="color:var(--danger)">*</span></label>
            <textarea
                v-model="bigo"
                class="input-add"
                rows="4"
                placeholder="미수 발생 사유를 입력해주세요. (예: 업체 연락 불가, 분쟁 중, 지급 보류 등)"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="isUnpaidModalOpen = false">취소</button>
          <button class="btn-submit-unpaid" @click="executeUnpaid" :disabled="isUnpaidSaving">
            <i class="mdi mdi-alert-circle-outline"></i>
            미수 처리 확정
          </button>
        </div>
      </div>
    </div>

    <SettlementModal
        v-if="isModalOpen && editModalType === 'SERVICE'"
        :is-open="isModalOpen"
        :settlement-id="selectedId"
        :initial-data="initialDataForModal"
        @close="isModalOpen = false"
        @save="fetchList"
    />

    <EstimateModal
        v-if="isModalOpen && editModalType === 'RETIRE_ANNUAL'"
        :is-open="isModalOpen"
        :settlement-id="selectedId"
        :initial-data="initialDataForModal"
        @close="isModalOpen = false"
        @save="fetchList"
    />

    <SettlementPrintModal
        v-if="isPrintModalOpen && printModalType === 'SERVICE'"
        :is-open="isPrintModalOpen"
        :items="printTargetItems"
        @close="isPrintModalOpen = false"
    />
    <EstimatePrintModal
        v-if="isPrintModalOpen && printModalType !== 'SERVICE'"
        :is-open="isPrintModalOpen"
        :items="printTargetItems"
        @close="isPrintModalOpen = false"
    />
  </div>
</template>

<style scoped>
/* ──────────────────────────────────────────────
   헤더 액션
────────────────────────────────────────────── */
.header-actions { display:flex; gap:10px; align-items:center; }
.bulk-actions   { display:flex; gap:8px;  align-items:center; }

.fade-enter-active, .fade-leave-active { transition: opacity .2s, transform .2s; }
.fade-enter-from,   .fade-leave-to     { opacity:0; transform:translateY(-4px); }

/* ──────────────────────────────────────────────
   새 정산서 드롭다운
────────────────────────────────────────────── */
.create-dropdown { position:relative; }
.create-menu {
  position:absolute; right:0; top:calc(100% + 6px);
  background:var(--bg-surface); border:1px solid var(--border-color);
  border-radius:10px; padding:6px; min-width:200px; z-index:200;
  box-shadow:0 8px 24px rgba(0,0,0,.12);
}
.cm-item {
  display:flex; align-items:center; gap:10px; width:100%;
  padding:10px 12px; border:none; background:transparent;
  border-radius:7px; cursor:pointer; text-align:left; transition:background .15s;
  font-family:inherit;
}
.cm-item:hover  { background:var(--bg-hover); }
.cm-item i      { font-size:18px; color:var(--primary); flex-shrink:0; }
.cm-title       { font-size:13px; font-weight:600; color:var(--text-main); }
.cm-divider     { height:1px; background:var(--border-color); margin:4px 6px; }

/* ──────────────────────────────────────────────
   출력 / 삭제 버튼
────────────────────────────────────────────── */
.btn-print {
  display:inline-flex; align-items:center; gap:6px; padding:9px 14px;
  border:1px solid rgba(14,165,233,.4); border-radius:8px;
  font-size:13px; font-weight:600; cursor:pointer; transition:all .2s;
  background:rgba(14,165,233,.08); color:#0ea5e9; font-family:inherit;
}
.btn-print:hover { background:#0ea5e9; color:#fff; border-color:#0ea5e9; }

.btn-delete {
  display:inline-flex; align-items:center; gap:6px; padding:9px 14px;
  border:1px solid rgba(239,68,68,.3); border-radius:8px;
  font-size:13px; font-weight:600; cursor:pointer; transition:all .2s;
  background:rgba(239,68,68,.05); color:var(--danger); font-family:inherit;
}
.btn-delete:hover { background:var(--danger); color:#fff; border-color:var(--danger); }

/* ──────────────────────────────────────────────
   ★ 기간 필터 CSS 추가
────────────────────────────────────────────── */
.period-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
}
.period-select {
  width: 130px;
}
.period-separator {
  color: var(--text-sub);
  font-weight: 700;
}

/* ──────────────────────────────────────────────
   상태 필터 토글
────────────────────────────────────────────── */
.filter-toggles-row {
  display:flex; align-items:center; gap:12px;
  padding-top:14px; border-top:1px solid var(--border-color); flex-wrap:wrap;
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

/* ──────────────────────────────────────────────
   테이블
────────────────────────────────────────────── */
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

.th-content { display:flex; align-items:center; gap:5px; }
.th-content.justify-center { justify-content:center; }
.th-content.justify-end    { justify-content:flex-end; }
.sortable       { cursor:pointer; user-select:none; }
.sortable:hover { background:var(--bg-hover); }

/* ──────────────────────────────────────────────
   행 상태
────────────────────────────────────────────── */
.row-selected { background:var(--primary-soft) !important; }
.row-unpaid   { background:rgba(239,68,68,.02) !important; }
.row-unpaid:hover { background:rgba(239,68,68,.05) !important; }

/* ──────────────────────────────────────────────
   뱃지
────────────────────────────────────────────── */
.doc-type-badge {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700;
  border:1px solid transparent; white-space:nowrap;
}
.doc-type-badge.retire  { background:rgba(168,85,247,.1);  color:#a855f7; border-color:rgba(168,85,247,.2); }
.doc-type-badge.service { background:var(--bg-canvas); color:var(--text-sub); border-color:var(--border-color); }

.badge       { padding:3px 9px; border-radius:6px; font-size:11px; font-weight:600; }
.badge-clean { background:rgba(16,185,129,.1); color:var(--success); }
.badge-guard { background:var(--primary-soft);  color:var(--primary); }
.badge-etc   { background:rgba(239,68,68,.1);  color:var(--danger); }

.status-badge {
  display:inline-flex; align-items:center; gap:4px;
  padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600;
}
.status-pending { background: rgba(245, 158, 11, 0.1); color: var(--warning, #f59e0b); }
.status-billed { background: rgba(59, 130, 246, 0.1); color: var(--primary, #3b82f6); }
.status-active { background: rgba(16, 185, 129, 0.1); color: var(--success, #10b981); }
.status-unpaid { background: rgba(239, 68, 68, 0.1); color: var(--danger, #ef4444); }

.unpaid-note {
  display:inline-flex; align-items:center; gap:4px;
  font-size:11px; color:var(--danger); font-weight:500;
  max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:help;
}
.unpaid-note i { font-size:13px; flex-shrink:0; }

.selected-badge {
  font-size:12px; font-weight:600; padding:4px 12px;
  background:var(--primary); color:#fff; border-radius:20px;
}

/* ──────────────────────────────────────────────
   텍스트 / 금액
────────────────────────────────────────────── */
.site-name   { font-weight:600; color:var(--text-main); }
.amount-text { font-weight:700; color:var(--text-main); font-size:13px; }

/* ──────────────────────────────────────────────
   관리 버튼
────────────────────────────────────────────── */
.action-buttons { display:flex; align-items:center; gap:4px; justify-content:center; }
.icon-divider   { width:1px; height:16px; background:var(--border-color); margin:0 2px; flex-shrink:0; }

.icon-btn {
  width:30px; height:30px; border-radius:8px;
  border:1px solid var(--border-color); background:var(--bg-surface); color:var(--text-sub);
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .15s; font-size:15px; flex-shrink:0;
}
.icon-btn:hover { background:var(--bg-hover); color:var(--text-main); border-color:var(--border-focus); }

.icon-btn--blue  { color:var(--primary); background:var(--primary-soft); border-color:rgba(37,99,235,.25); }
.icon-btn--blue:hover  { background:var(--primary); color:#fff; border-color:var(--primary); }

.icon-btn--green { color:var(--success); background:rgba(5,150,105,.08); border-color:rgba(5,150,105,.25); }
.icon-btn--green:hover { background:var(--success); color:#fff; border-color:var(--success); }

.icon-btn--red   { color:var(--danger); background:rgba(239,68,68,.08); border-color:rgba(239,68,68,.25); }
.icon-btn--red:hover   { background:var(--danger); color:#fff; border-color:var(--danger); }

/* ──────────────────────────────────────────────
   체크박스
────────────────────────────────────────────── */
.custom-checkbox {
  appearance:none; -webkit-appearance:none;
  width:16px; height:16px; border:2px solid var(--border-focus);
  border-radius:4px; cursor:pointer; position:relative; transition:all .15s;
  background:var(--bg-surface); margin:0; vertical-align:middle;
}
.custom-checkbox:hover   { border-color:var(--primary); }
.custom-checkbox:checked { border-color:var(--primary); background:var(--primary); }
.custom-checkbox:checked::after {
  content:''; position:absolute;
  top:1px; left:4px; width:4px; height:8px;
  border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg);
}

/* ──────────────────────────────────────────────
   스피너 / 빈 상태
────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────
   미수 모달
────────────────────────────────────────────── */
.modal-overlay {
  position:fixed; inset:0; background:rgba(15,23,42,.6); backdrop-filter:blur(2px);
  display:flex; align-items:center; justify-content:center; z-index:2000; padding:20px;
}
.modal-box {
  background:var(--bg-surface); border-radius:14px; width:100%; max-width:480px;
  display:flex; flex-direction:column; overflow:hidden;
  border:1px solid var(--border-color); box-shadow:0 20px 50px rgba(0,0,0,.15);
  animation:slidein .22s ease;
}
@keyframes slidein {
  from { opacity:0; transform:translateY(12px) scale(.97); }
  to   { opacity:1; transform:translateY(0) scale(1); }
}

.modal-header {
  padding:16px 22px; display:flex; align-items:center; justify-content:space-between;
  border-bottom:1px solid var(--border-color);
}
.modal-title {
  font-size:16px; font-weight:800; color:var(--text-main);
  display:flex; align-items:center; gap:8px; letter-spacing:-.03em;
}
.modal-title i     { color:var(--danger); font-size:19px; }
.modal-site-chip   { font-size:12px; padding:2px 9px; background:rgba(239,68,68,.1); color:var(--danger); border-radius:5px; font-weight:700; }
.modal-close       { background:none; border:none; color:var(--text-sub); font-size:20px; cursor:pointer; padding:4px; border-radius:5px; transition:all .2s; display:flex; align-items:center; }
.modal-close:hover { background:var(--bg-hover); color:var(--danger); }
.modal-body        { padding:20px 22px; background:var(--bg-canvas); }
.modal-footer      { padding:14px 22px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border-color); background:var(--bg-surface); }

.unpaid-summary {
  display:flex; gap:12px; flex-wrap:wrap; padding:12px 14px;
  background:var(--bg-surface); border:1px solid var(--border-color); border-radius:9px; margin-bottom:4px;
}
.us-item          { display:flex; flex-direction:column; gap:3px; }
.us-label         { font-size:10px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.us-value         { font-size:13px; color:var(--text-main); font-weight:600; }
.us-value.amount  { color:var(--primary); font-weight:800; }

.mform-item       { display:flex; flex-direction:column; gap:6px; }
.mform-item label { font-size:11px; font-weight:700; color:var(--text-sub); text-transform:uppercase; letter-spacing:.04em; }

.input-add {
  width:100%; padding:9px 11px; border:1px solid var(--border-color); border-radius:7px;
  font-size:13px; color:var(--text-main); background:var(--bg-surface);
  transition:all .2s; font-family:inherit; resize:vertical; box-sizing:border-box;
}
.input-add:focus { border-color:var(--danger); outline:none; box-shadow:0 0 0 3px rgba(239,68,68,.1); }

.btn-cancel {
  padding:9px 18px; background:var(--text-sub); color:#fff; border:none;
  border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; transition:all .2s; font-family:inherit;
}
.btn-cancel:hover { background:var(--text-main); }

.btn-submit-unpaid {
  padding:9px 18px; background:var(--danger); color:#fff; border:none;
  border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; transition:all .2s;
  font-family:inherit; display:flex; align-items:center; gap:6px;
}
.btn-submit-unpaid:hover:not(:disabled) { filter:brightness(.9); transform:translateY(-1px); }
.btn-submit-unpaid:disabled             { opacity:.5; cursor:not-allowed; }

/* ──────────────────────────────────────────────
   유틸
────────────────────────────────────────────── */
.text-sm   { font-size:12px; }
.text-gray { color:var(--text-muted); }
</style>
