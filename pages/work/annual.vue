<script setup>
/**
 * work/annual — 연차 통합 관리
 * 탭1: 신청 관리  (연차 신청 승인/반려 + 일괄 처리)
 * 탭2: 잔여 현황  (직원별 부여/사용/잔여 + 체크박스 부여 + 중간정산)
 *
 * [리팩토링 포인트]
 * 1. 유틸 함수 상단 집중 관리
 * 2. 탭1 체크박스 추가 → 일괄 승인/반려
 * 3. 중복 로직 함수화 (openModal, resetForm)
 * 4. API 호출 try/catch → withLoading 헬퍼로 일원화
 * 5. computed 파생값 정리 (selectedReq, selectAllReq 등)
 * 6. watch 조건 명시 (immediate 제거, 탭 전환 시만 fetch)
 */
import { ref, computed, onMounted, watch } from 'vue'
import axios from 'axios'
import { useRoute, useRouter } from '#app'
import { useAuthStore } from '~/stores/auth.js'
import Pagination from '~/components/Pagination.vue'
import SiteSelect from "~/components/SiteSelect.vue";

// ────────────────────────────────────────────────────────────
// 공통 유틸
// ────────────────────────────────────────────────────────────
const fc          = (v) => Number(v || 0).toLocaleString()
const today       = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
const yearRange = [2026, 2025, 2024, 2023]

/** 로딩 플래그를 감싸는 async 헬퍼 — try/catch/finally 중복 제거 */
async function withLoading(loadingRef, fn) {
  loadingRef.value = true
  try   { await fn() }
  catch (e) { console.error(e); alert('처리 중 오류가 발생했습니다.') }
  finally   { loadingRef.value = false }
}

// ────────────────────────────────────────────────────────────
// 인증 / 라우터
// ────────────────────────────────────────────────────────────
const route     = useRoute()
const router    = useRouter()
const authStore = useAuthStore()
const cIdx      = authStore.user?.cIdx

const { siteOptions, fetchSiteOptions } = useApi()

// ────────────────────────────────────────────────────────────
// 탭 관리
// ────────────────────────────────────────────────────────────
const tabs = [
  { id: 'request', icon: 'mdi-inbox-arrow-down-outline', name: '신청 관리' },
  // { id: 'quota',   icon: 'mdi-chart-donut',              name: '잔여 현황' },
]

const activeTab = ref(route.query.tab || 'request')

async function changeTab(id) {
  activeTab.value = id
  currentPageReq.value   = 1
  currentPageQuota.value = 1
  await router.replace({ query: { ...route.query, tab: id } })
  if (id === 'quota') fetchQuotaList()
}

// ════════════════════════════════════════════════════════════
// 탭1 — 신청 관리
// ════════════════════════════════════════════════════════════

// ── 필터 상태 ──
const reqFilter = ref({
  startDate: firstOfMonth(),
  endDate:   today(),
  sIdx: '전체',
  status:    '전체',
  keyword:   '',
})

// ── 페이지네이션 ──
const currentPageReq = ref(1)
const pageSizeReq    = ref(50)

// ── 데이터 ──
const isLoadingReq = ref(false)
const requests     = ref([])

// ── 통계 (computed) ──
const statsReq = computed(() => {
  const all = requests.value
  return {
    total:    all.length,
    pending:  all.filter(r => +r.status === 0).length,
    approved: all.filter(r => +r.status === 1).length,
    rejected: all.filter(r => +r.status === 2).length,
  }
})

// ── 필터된 목록 ──
const filteredReq = computed(() =>
    requests.value.filter(r => {
      const stOk = reqFilter.value.status === '전체' || r.status == reqFilter.value.status
      const sIdx = reqFilter.value.sIdx === '전체' || reqFilter.value.sIdx === '' || r.sIdx == reqFilter.value.sIdx
      const kwOk = (r.staff || '').includes(reqFilter.value.keyword)
      return stOk && kwOk && sIdx
    })
)

// ── 페이징 ──
const pagedReq = computed(() => {
  const s = (currentPageReq.value - 1) * pageSizeReq.value
  return filteredReq.value.slice(s, s + pageSizeReq.value)
})

// ── 체크박스 (신청 관리 일괄 처리) ──
const selectAllReq = computed({
  get: () => pagedReq.value.length > 0
      && pagedReq.value.filter(r => +r.status === 0).length > 0
      && pagedReq.value.filter(r => +r.status === 0).every(r => r._selected),
  set: (v) => pagedReq.value.forEach(r => { if (+r.status === 0) r._selected = v }),
})
const selectedReq = computed(() => filteredReq.value.filter(r => r._selected))

// ── API ──
async function fetchRequests() {
  await withLoading(isLoadingReq, async () => {
    const { data } = await axios.get(`/api/v1/member/off/${cIdx}`, {
      params: { startDt: reqFilter.value.startDate, endDt: reqFilter.value.endDate },
    })
    requests.value = (data.data || []).map(r => ({ ...r, _selected: false }))
    currentPageReq.value = 1
  })
}

/** 단건 승인/반려 */
async function updateStatus(idx, status) {
  const label = status === 1 ? '승인' : '반려'
  if (!confirm(`${label}하시겠습니까?`)) return
  await withLoading(isLoadingReq, async () => {
    const { data } = await axios.post('/api/v1/member/off/status', { idx, status })
    if (!data.result) throw new Error('처리 실패')
    alert(`${label} 처리가 완료되었습니다.`)
    await fetchRequests()
    await fetchQuotaList()
  })
}

/** 일괄 승인/반려 */
async function bulkUpdateStatus(status) {
  const targets = selectedReq.value
  if (!targets.length) { alert('선택된 항목이 없습니다.'); return }
  const label = status === 1 ? '승인' : '반려'
  if (!confirm(`선택한 ${targets.length}건을 일괄 ${label}하시겠습니까?`)) return

  await withLoading(isLoadingReq, async () => {
    const results = await Promise.allSettled(
        targets.map(r => axios.post('/api/v1/member/off/status', { idx: r.idx, status }))
    )
    const success = results.filter(r => r.status === 'fulfilled').length
    const fail    = results.length - success
    alert(`${success}건 ${label} 완료` + (fail > 0 ? `, ${fail}건 실패` : ''))
    await fetchRequests()
    await fetchQuotaList()
  })
}

// ── 상태 표시 헬퍼 ──
const STATUS_MAP = {
  0: { cls: 'status-pending',  text: '승인대기', icon: 'mdi-clock-outline'         },
  1: { cls: 'status-approved', text: '승인완료', icon: 'mdi-check-circle-outline'  },
  2: { cls: 'status-rejected', text: '반려됨',   icon: 'mdi-close-circle-outline'  },
}
const statusInfo = (s) => STATUS_MAP[+s] ?? STATUS_MAP[0]

// ════════════════════════════════════════════════════════════
// 탭2 — 잔여 현황
// ════════════════════════════════════════════════════════════

// ── 필터 ──
const quotaFilter = ref({
  year:    new Date().getFullYear(),
  sIdx:    '전체',
  keyword: '',
})

// ── 페이지네이션 ──
const currentPageQuota = ref(1)
const pageSizeQuota    = ref(50)

// ── 데이터 ──
const isLoadingQuota = ref(false)
const quotaList      = ref([])

// ── 통계 ──
const quotaStats = computed(() => ({
  total:    quotaList.value.length,
  granted:  quotaList.value.reduce((s, i) => s + (+i.totalCount  || 0), 0),
  used:     quotaList.value.reduce((s, i) => s + (+i.usedCount   || 0), 0),
  remain:   quotaList.value.reduce((s, i) => s + (+i.remainDays  || 0), 0),
  notGrant: quotaList.value.filter(i => !i.quotaIdx).length,
}))

// ── 필터된 목록 ──
const filteredQuota = computed(() =>
    quotaList.value.filter(i => {
      const sOk = quotaFilter.value.sIdx === '전체' || i.sIdx == quotaFilter.value.sIdx
      const kOk = !quotaFilter.value.keyword || (i.name || '').includes(quotaFilter.value.keyword)
      return sOk && kOk
    })
)

// ── 페이징 ──
const pagedQuota = computed(() => {
  const s = (currentPageQuota.value - 1) * pageSizeQuota.value
  return filteredQuota.value.slice(s, s + pageSizeQuota.value)
})

// ── 체크박스 ──
const selectAllQuota = computed({
  get: () => pagedQuota.value.length > 0 && pagedQuota.value.every(i => i._selected),
  set: (v) => pagedQuota.value.forEach(i => (i._selected = v)),
})
const selectedQuota = computed(() => filteredQuota.value.filter(i => i._selected))

// ── API ──
async function fetchQuotaList() {
  await withLoading(isLoadingQuota, async () => {
    const { data } = await axios.get('/api/v1/member/annual/list', {
      params: { year: quotaFilter.value.year, sIdx: quotaFilter.value.sIdx, search: quotaFilter.value.keyword, cIdx },
    })
    quotaList.value = (data.data || []).map(r => ({
      ...r,
      _selected:  false,
      remainDays: (+r.totalCount + +(r.overCount || 0)) - +r.usedCount - +(r.payCount || 0),
      usageRate:  +r.totalCount > 0 ? Math.round((+r.usedCount / +r.totalCount) * 100) : 0,
    }))
    currentPageQuota.value = 1
  })
}

// 연도·현장 변경 시 자동 재조회
watch([() => quotaFilter.value.year, () => quotaFilter.value.sIdx], fetchQuotaList)

// ════════════════════════════════════════════════════════════
// 모달 — 연차 부여
// ════════════════════════════════════════════════════════════
const isGrantOpen = ref(false)
const isGranting  = ref(false)

const GRANT_DEFAULTS = () => ({
  year:       new Date().getFullYear(),
  grantDate:  `${new Date().getFullYear()}-01-01`,
  expireDate: `${new Date().getFullYear()}-12-31`,
  totalCount: 15,
  bigo:       '',
})
const grantForm = ref(GRANT_DEFAULTS())

// 연도 변경 시 날짜 자동 세팅
watch(() => grantForm.value.year, (y) => {
  grantForm.value.grantDate  = `${y}-01-01`
  grantForm.value.expireDate = `${y}-12-31`
})

function openGrant() {
  grantForm.value = GRANT_DEFAULTS()
  isGrantOpen.value = true
}

async function executeGrant() {
  const targets = selectedQuota.value.length > 0
      ? selectedQuota.value
      : filteredQuota.value.filter(i => !i.quotaIdx)

  if (!targets.length) { alert('부여 대상 직원이 없습니다.'); return }
  if (!confirm(`${grantForm.value.year}년 연차를 ${targets.length}명에게 부여하시겠습니까?`)) return

  await withLoading(isGranting, async () => {
    const results = await Promise.allSettled(
        targets.map(i =>
            axios.post('/api/v1/member/annual/register', {
              mIdx:       i.mIdx,
              sIdx:       i.sIdx,
              name:       i.name,
              type:       i.mType,
              year:       grantForm.value.year,
              middleDt:   grantForm.value.grantDate,
              totalCount: grantForm.value.totalCount,
              overCount:  0,
              usedCount:  0,
              bigo:       grantForm.value.bigo,
            })
        )
    )
    const success = results.filter(r => r.status === 'fulfilled').length
    const fail    = results.length - success
    alert(`${success}명 부여 완료` + (fail > 0 ? `, ${fail}명 실패` : ''))
    isGrantOpen.value = false
    await fetchQuotaList()
  })
}

// ════════════════════════════════════════════════════════════
// 모달 — 중간정산
// ════════════════════════════════════════════════════════════
const isSettleOpen  = ref(false)
const isSettling    = ref(false)
const settleTarget  = ref(null)

const SETTLE_DEFAULTS = (item = {}) => ({
  mIdx:          item.mIdx       ?? null,
  quotaIdx:      item.quotaIdx   ?? null,
  sIdx:          item.sIdx       ?? null,
  settleDays:    item.remainDays > 0 ? item.remainDays : 0,
  basicWage:     item.basicWage  ?? 0,
  workhourMonth: 169.5,
  workhourDay:   6,
  settleDate:    today(),
  note:          '',
})
const settleForm = ref(SETTLE_DEFAULTS())

/** 예상 정산금액 */
const settleAmount = computed(() => {
  const { basicWage, workhourMonth, workhourDay, settleDays } = settleForm.value
  if (!basicWage || !workhourMonth || !workhourDay) return 0
  return Math.floor((basicWage / workhourMonth) * workhourDay * settleDays)
})

function openSettle(item) {
  settleTarget.value  = item
  settleForm.value    = SETTLE_DEFAULTS(item)
  isSettleOpen.value  = true
}

async function executeSettle() {
  const { settleDays } = settleForm.value
  if (settleDays <= 0) { alert('정산할 연차 일수를 입력해주세요.'); return }
  if (settleDays > settleTarget.value.remainDays) {
    alert(`잔여 연차(${settleTarget.value.remainDays}일)보다 많을 수 없습니다.`); return
  }
  if (!confirm(`${settleDays}일 → ${fc(settleAmount.value)}원으로 중간정산하시겠습니까?`)) return

  await withLoading(isSettling, async () => {
    await axios.post('/api/v1/annual/settle', { ...settleForm.value, settleAmount: settleAmount.value, cIdx })
    alert('중간정산이 완료되었습니다.')
    isSettleOpen.value = false
    await fetchQuotaList()
  })
}

// ────────────────────────────────────────────────────────────
// 라이프사이클
// ────────────────────────────────────────────────────────────
onMounted(async () => {
  await fetchSiteOptions()
  await fetchRequests()
  if (activeTab.value === 'quota') await fetchQuotaList()
})
</script>

<template>
  <div class="annual-list-page">

    <!-- ── 헤더 ── -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calendar-check-outline"></i>연차 통합 관리
        </h1>
        <p class="page-subtitle">연차 신청 승인, 잔여 현황, 부여 및 중간정산을 관리합니다</p>
      </div>
      <!-- 액션바 -->
      <div class="header-actions" v-if="activeTab === 'quota'">
        <button @click="openGrant" class="btn-add">
          <i class="mdi mdi-gift-outline"></i> 연차 부여
        </button>
      </div>
      <!-- 일괄 처리 액션바 -->
      <div class="header-actions" v-else>
        <div class="action-bar-left">
          <transition name="fade">
            <div v-if="selectedReq.length > 0" class="bulk-actions">
              <button class="btn-save" @click="bulkUpdateStatus(1)">
                <!--i class="mdi mdi-check-all"></i--> 일괄 승인
              </button>
              <button class="btn-delete" @click="bulkUpdateStatus(2)">
                <!--i class="mdi mdi-close-circle-outline"></i--> 일괄 반려
              </button>
            </div>
          </transition>
        </div>

      </div>
    </div>

    <!-- ── 탭 ── -->
    <div class="tab-nav">
      <button
          v-for="tab in tabs" :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="changeTab(tab.id)"
      >
        <i :class="['mdi', tab.icon]"></i>
        {{ tab.name }}
        <span v-if="tab.id === 'request' && statsReq.pending > 0" class="tab-badge">
          {{ statsReq.pending }}
        </span>
      </button>
    </div>

    <!-- ════════════════════════════════════════════════════
         탭1 — 신청 관리
    ═════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'request'">

      <!-- 통계 카드 -->
      <div class="stats-grid">
        <div class="stat-card" style="--card-color:var(--primary);--card-bg:var(--primary-soft)">
          <div class="stat-icon"><i class="mdi mdi-file-document-edit-outline"></i></div>
          <div class="stat-content">
            <span class="stat-label">전체 신청</span>
            <span class="stat-value">{{ statsReq.total }}<small>건</small></span>
          </div>
        </div>
        <div class="stat-card" style="--card-color:var(--warning);--card-bg:rgba(245,158,11,.1)">
          <div class="stat-icon"><i class="mdi mdi-clock-outline"></i></div>
          <div class="stat-content">
            <span class="stat-label">승인 대기</span>
            <span class="stat-value">{{ statsReq.pending }}<small>건</small></span>
          </div>
        </div>
        <div class="stat-card" style="--card-color:var(--success);--card-bg:rgba(16,185,129,.1)">
          <div class="stat-icon"><i class="mdi mdi-check-circle-outline"></i></div>
          <div class="stat-content">
            <span class="stat-label">승인 완료</span>
            <span class="stat-value">{{ statsReq.approved }}<small>건</small></span>
          </div>
        </div>
        <div class="stat-card" style="--card-color:var(--danger);--card-bg:rgba(239,68,68,.1)">
          <div class="stat-icon"><i class="mdi mdi-close-circle-outline"></i></div>
          <div class="stat-content">
            <span class="stat-label">반려 내역</span>
            <span class="stat-value">{{ statsReq.rejected }}<small>건</small></span>
          </div>
        </div>
      </div>

      <!-- 필터 -->
      <div class="filter-panel">
        <div class="filter-row">
          <div class="filter-group">
            <label class="filter-label"><i class="mdi mdi-calendar-month-outline"></i> 신청 기간</label>
            <div class="date-range">
              <input type="date" v-model="reqFilter.startDate" class="filter-select" />
              <span class="text-gray">~</span>
              <input type="date" v-model="reqFilter.endDate"   class="filter-select" />
            </div>
          </div>
          <div class="filter-group">
            <label class="filter-label"><span>현장</span></label>
            <SiteSelect v-model="reqFilter.sIdx" />
          </div>
          <div class="filter-group">
            <label class="filter-label"><i class="mdi mdi-list-status"></i> 상태</label>
            <select v-model="reqFilter.status" class="filter-select">
              <option value="전체">전체 상태</option>
              <option value="0">승인 대기</option>
              <option value="1">승인 완료</option>
              <option value="2">반려</option>
            </select>
          </div>
          <div class="search-group">
            <div class="search-box">
              <i class="mdi mdi-magnify"></i>
              <input v-model="reqFilter.keyword" type="text" placeholder="직원명으로 검색..." class="search-input" />
            </div>
            <button @click="fetchRequests" class="btn-search">
              <i class="mdi mdi-magnify"></i><span>조회</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 테이블 -->
      <div class="table-card">
        <div class="table-header">
          <div class="table-title">
            <span>연차 신청 목록 ({{ filteredReq.length }}건)</span>
            <span v-if="selectedReq.length > 0" class="selected-badge">{{ selectedReq.length }}건 선택됨</span>
          </div>
          <div class="page-size-select">
            <label>페이지당</label>
            <select v-model="pageSizeReq" @change="currentPageReq = 1" class="filter-select" style="height:32px;padding:4px 10px;font-size:12px;min-width:60px">
              <option v-for="n in [50,100,200,500]" :key="n" :value="n">{{ n }}개</option>
            </select>
          </div>
        </div>

        <div class="table-scroll-container">
          <table class="data-table">
            <thead>
            <tr>
              <th class="text-center cb-col">
                <input type="checkbox" v-model="selectAllReq" class="custom-cb" title="대기 항목 전체선택" />
              </th>
              <th>신청일</th>
              <th>현장</th>
              <th>직원명</th>
              <th>사용 기간</th>
              <th class="text-center">일수</th>
              <th>사유</th>
              <th class="text-center">상태</th>
              <th class="text-center">관리</th>
            </tr>
            </thead>
            <tbody>
            <!-- 로딩 -->
            <tr v-if="isLoadingReq" class="empty-row">
              <td colspan="9">
                <div class="empty-state"><div class="spinner"></div><p>불러오는 중...</p></div>
              </td>
            </tr>
            <template v-else>
              <tr
                  v-for="req in pagedReq" :key="req.idx"
                  class="data-row"
                  :class="{ 'row-selected': req._selected }"
              >
                <!-- 체크박스: 대기 상태만 선택 가능 -->
                <td class="text-center">
                  <input
                      v-if="+req.status === 0"
                      type="checkbox" v-model="req._selected" class="custom-cb"
                  />
                  <span v-else class="cb-placeholder"></span>
                </td>
                <td class="text-gray text-sm">{{ req.reqDate }}</td>
                <td class="text-gray text-sm">{{ req.site }}</td>
                <td><span class="font-bold text-blue">{{ req.staff }}</span></td>
                <td class="text-sm">{{ req.startDt }} ~ {{ req.endDt }}</td>
                <td class="text-center font-bold text-blue">{{ req.usedCount || req.days }}일</td>
                <td class="text-gray text-sm reason-cell">{{ req.reason || '-' }}</td>
                <td class="text-center">
                    <span :class="['status-badge', statusInfo(req.status).cls]">
                      <i :class="['mdi', statusInfo(req.status).icon]"></i>
                      {{ statusInfo(req.status).text }}
                    </span>
                </td>
                <td class="text-center">
                  <div v-if="+req.status === 0" class="action-buttons">
                    <button @click="updateStatus(req.idx, 1)" class="btn-approve">
                      <i class="mdi mdi-check"></i> 승인
                    </button>
                    <button @click="updateStatus(req.idx, 2)" class="btn-reject">
                      <i class="mdi mdi-close"></i> 반려
                    </button>
                  </div>
                  <span v-else class="text-gray text-sm">처리완료</span>
                </td>
              </tr>
              <tr v-if="filteredReq.length === 0" class="empty-row">
                <td colspan="9">
                  <div class="empty-state">
                    <i class="mdi mdi-calendar-remove-outline"></i>
                    <p>해당 신청 내역이 없습니다</p>
                  </div>
                </td>
              </tr>
            </template>
            </tbody>
          </table>
        </div>

        <Pagination
            v-model:currentPage="currentPageReq"
            v-model:pageSize="pageSizeReq"
            :totalCount="filteredReq.length"
        />
      </div>
    </template>

    <!-- ════════════════════════════════════════════════════
         탭2 — 잔여 현황
    ═════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'quota'">

      <!-- 통계 카드 -->
      <div class="stats-grid">
        <div class="stat-card" style="--card-color:var(--primary);--card-bg:var(--primary-soft)">
          <div class="stat-icon"><i class="mdi mdi-account-group-outline"></i></div>
          <div class="stat-content"><span class="stat-label">관리 직원</span><span class="stat-value">{{ quotaStats.total }}<small>명</small></span></div>
        </div>
        <div class="stat-card" style="--card-color:#0ea5e9;--card-bg:rgba(14,165,233,.1)">
          <div class="stat-icon"><i class="mdi mdi-gift-outline"></i></div>
          <div class="stat-content"><span class="stat-label">총 부여</span><span class="stat-value">{{ quotaStats.granted }}<small>일</small></span></div>
        </div>
        <div class="stat-card" style="--card-color:var(--warning);--card-bg:rgba(245,158,11,.1)">
          <div class="stat-icon"><i class="mdi mdi-calendar-remove-outline"></i></div>
          <div class="stat-content"><span class="stat-label">총 사용</span><span class="stat-value">{{ quotaStats.used }}<small>일</small></span></div>
        </div>
        <div class="stat-card" style="--card-color:var(--success);--card-bg:rgba(16,185,129,.1)">
          <div class="stat-icon"><i class="mdi mdi-calendar-clock-outline"></i></div>
          <div class="stat-content"><span class="stat-label">총 잔여</span><span class="stat-value">{{ quotaStats.remain }}<small>일</small></span></div>
        </div>
      </div>

      <!-- 필터 -->
      <div class="filter-panel">
        <div class="filter-row">
          <div class="filter-group">
            <label class="filter-label">연도</label>
            <select v-model.number="quotaFilter.year" class="filter-select">
              <option v-for="y in yearRange" :key="y" :value="y">{{ y }}년</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">현장</label>
            <!--select v-model="quotaFilter.sIdx" class="filter-select">
              <option value="전체">전체 현장</option>
              <option v-for="s in siteOptions" :key="s.idx" :value="s.idx">{{ s.name }}</option>
            </select-->
            <SiteSelect v-model="quotaFilter.sIdx" />
          </div>
          <div class="search-group">
            <div class="search-box">
              <i class="mdi mdi-magnify"></i>
              <input
                  v-model="quotaFilter.keyword"
                  placeholder="직원명 검색..."
                  class="search-input"
                  @input="fetchQuotaList"
              />
            </div>
            <button @click="fetchQuotaList" class="btn-search">조회</button>
          </div>
        </div>
      </div>

      <!-- 테이블 -->
      <div class="table-card">
        <div class="table-header">
          <div class="table-title">
            연차 잔여 현황 ({{ filteredQuota.length }}명)
            <transition name="fade">
            <span v-if="selectedQuota.length > 0" class="selected-badge">
              {{ selectedQuota.length }}명 선택됨
            </span>
            </transition>
          </div>
          <div class="page-size-select">
            <label>페이지당</label>
            <select v-model="pageSizeQuota" @change="currentPageQuota = 1" class="filter-select" style="height:32px;padding:4px 10px;font-size:12px;min-width:60px">
              <option v-for="n in [50,100,200,500]" :key="n" :value="n">{{ n }}개</option>
            </select>
          </div>
        </div>
        <div class="table-scroll-container">
          <table class="data-table">
            <thead>
            <tr>
              <th class="text-center cb-col">
                <input type="checkbox" v-model="selectAllQuota" class="custom-cb" />
              </th>
              <th>직원명</th>
              <th>발생년도</th>
              <th>현장</th>
              <th class="text-center">입사일</th>
              <th class="text-center">부여</th>
              <th class="text-center">이월</th>
              <th class="text-center">사용</th>
              <th class="text-center">정산</th>
              <th class="text-center">잔여</th>
              <th class="text-center">사용률</th>
              <th class="text-center">관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-if="isLoadingQuota" class="empty-row">
              <td colspan="11">
                <div class="empty-state"><div class="spinner"></div><p>불러오는 중...</p></div>
              </td>
            </tr>
            <template v-else>
              <tr
                  v-for="item in pagedQuota" :key="item.mIdx"
                  class="data-row"
                  :class="{ 'row-selected': item._selected }"
              >
                <td class="text-center">
                  <input type="checkbox" v-model="item._selected" class="custom-cb" />
                </td>
                <td>
                  <span class="font-bold">{{ item.name }}</span>
                  <span class="badge badge-gray ml-1">{{ item.role }}</span>
                </td>
                <td>2026</td>
                <td class="text-gray text-sm">{{ item.siteName }}</td>
                <td class="text-center text-gray text-sm">{{ item.inDate }}</td>
                <td class="text-center">
                  <span v-if="item.quotaIdx">{{ item.totalCount }}일</span>
                  <span v-else class="badge badge-red">미부여</span>
                </td>
                <td class="text-center">
                  <span v-if="+item.overCount > 0" class="badge badge-blue">+{{ item.overCount }}일</span>
                  <span v-else class="text-gray">-</span>
                </td>
                <td class="text-center"><span class="day-chip used">{{ item.usedCount }}일</span></td>
                <td class="text-center">
                  <span v-if="+item.payCount > 0" class="badge badge-red">{{ item.payCount }}일</span>
                  <span v-else class="text-gray">-</span>
                </td>
                <td class="text-center">
                    <span :class="['day-chip', 'remain', item.remainDays <= 3 ? 'low' : '']">
                      {{ item.remainDays }}일
                    </span>
                </td>
                <td class="text-center">
                  <div class="progress-wrap">
                    <div class="progress-bar">
                      <div class="progress-fill" :style="`width:${item.usageRate}%`"></div>
                    </div>
                    <span class="text-gray text-sm">{{ item.usageRate }}%</span>
                  </div>
                </td>
                <td class="text-center">
                  <button
                      @click="openSettle(item)"
                      class="btn-detail"
                      :disabled="!item.quotaIdx || item.remainDays <= 0"
                  >정산</button>
                </td>
              </tr>
              <tr v-if="filteredQuota.length === 0" class="empty-row">
                <td colspan="11">
                  <div class="empty-state">
                    <i class="mdi mdi-calendar-blank-outline"></i>
                    <p>연차 데이터가 없습니다</p>
                  </div>
                </td>
              </tr>
            </template>
            </tbody>
          </table>
        </div>

        <Pagination
            v-model:currentPage="currentPageQuota"
            v-model:pageSize="pageSizeQuota"
            :totalCount="filteredQuota.length"
        />
      </div>
    </template>

    <!-- ════════════════════════════════════════════════════
         모달 — 연차 부여
    ═════════════════════════════════════════════════════ -->
    <div v-if="isGrantOpen" class="modal-overlay" @click.self="isGrantOpen = false">
      <div class="modal-box">
        <div class="modal-header">
          <h2 class="modal-title">
            <i class="mdi mdi-gift-outline"></i>
            연차 부여
            <span v-if="selectedQuota.length > 0" class="badge badge-blue ml-1">
              {{ selectedQuota.length }}명 선택
            </span>
            <span v-else class="badge badge-gray ml-1">미부여자 전체</span>
          </h2>
          <button class="modal-close" @click="isGrantOpen = false">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="mform-grid">
            <div class="mform-item">
              <label>부여 연도</label>
              <select v-model.number="grantForm.year" class="input-add">
                <option v-for="y in [2026, 2025]" :key="y" :value="y">{{ y }}년</option>
              </select>
            </div>
            <div class="mform-item">
              <label>부여일</label>
              <input v-model="grantForm.grantDate" type="date" class="input-add" />
            </div>
            <div class="mform-item">
              <label>연차 개수 (일)</label>
              <input v-model.number="grantForm.totalCount" type="number" min="1" class="input-add" />
            </div>
            <div class="mform-item">
              <label>비고</label>
              <input v-model="grantForm.bigo" type="text" class="input-add" placeholder="비고 (선택)" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel btn-m" @click="isGrantOpen = false">취소</button>
          <button class="btn-submit btn-m" @click="executeGrant" :disabled="isGranting">
            <i class="mdi mdi-gift-outline"></i>부여 실행
          </button>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════
         모달 — 중간정산
    ═════════════════════════════════════════════════════ -->
    <div v-if="isSettleOpen" class="modal-overlay" @click.self="isSettleOpen = false">
      <div class="modal-box">
        <div class="modal-header">
          <h2 class="modal-title">
            <i class="mdi mdi-cash-fast"></i>
            연차 중간정산
            <span class="modal-name-chip">{{ settleTarget?.name }}</span>
          </h2>
          <button class="modal-close" @click="isSettleOpen = false">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
        <div class="modal-body">
          <!-- 요약 -->
          <div class="settle-summary">
            <div class="ss-item">
              <span class="ss-label">잔여 연차</span>
              <span class="day-chip remain">{{ settleTarget?.remainDays }}일</span>
            </div>
            <div class="ss-divider"><i class="mdi mdi-arrow-right"></i></div>
            <div class="ss-item">
              <span class="ss-label">정산 후 잔여</span>
              <span class="day-chip remain">
                {{ Math.max(0, (settleTarget?.remainDays ?? 0) - settleForm.settleDays) }}일
              </span>
            </div>
            <div class="ss-divider">=</div>
            <div class="ss-item">
              <span class="ss-label">예상 정산금액</span>
              <span class="settle-amount-preview">{{ fc(settleAmount) }}원</span>
            </div>
          </div>
          <!-- 입력 -->
          <div class="mform-grid">
            <div class="mform-item">
              <label>정산 연차일수</label>
              <input v-model.number="settleForm.settleDays" type="number" step="0.5" min="0.5" class="input-add" />
            </div>
            <div class="mform-item">
              <label>기본급 (원)</label>
              <input v-model.number="settleForm.basicWage" type="number" class="input-add" />
            </div>
            <div class="mform-item">
              <label>월 근로시간 (h)</label>
              <input v-model.number="settleForm.workhourMonth" type="number" class="input-add" />
            </div>
            <div class="mform-item">
              <label>일 근로시간 (h)</label>
              <input v-model.number="settleForm.workhourDay" type="number" class="input-add" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel btn-m" @click="isSettleOpen = false">취소</button>
          <button class="btn-submit green btn-m" @click="executeSettle" :disabled="isSettling">
            <i class="mdi mdi-check-circle-outline"></i>정산 확정
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ──────────────────────────────────────────────────────────
   공통 CSS 변수는 global.css 에서 주입 — 여기는 이 페이지 전용만
──────────────────────────────────────────────────────────── */

/* ── 탭 ── */
.tab-nav { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid var(--border-color); }
.tab-btn { padding: 10px 20px; border: none; background: none; font-size: 13px; font-weight: 600; color: var(--text-sub); cursor: pointer; border-radius: 8px 8px 0 0; display: flex; align-items: center; gap: 7px; transition: all .2s; position: relative; bottom: -2px; font-family: inherit; letter-spacing: -.02em; }
.tab-btn i { font-size: 17px; }
.tab-btn:hover { background: var(--primary-soft); color: var(--primary); }
.tab-btn.active { color: var(--primary); background: var(--bg-surface); border: 2px solid var(--border-color); border-bottom: 2px solid var(--bg-surface); }
.tab-count { background: var(--primary-soft); color: var(--primary); font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; min-width: 20px; text-align: center; }
.tab-btn.active .tab-count { background: var(--primary); color: #fff; }

.tab-badge {
  min-width:18px; height:18px; padding:0 5px;
  background:var(--danger); color:#fff;
  border-radius:9px; font-size:10px; font-weight:700;
  display:inline-flex; align-items:center; justify-content:center;
}

/* ── 액션바 ── */
.action-bar {
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:12px; gap:10px; flex-wrap:wrap;
}
.action-bar-left { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.bulk-actions { display:flex; align-items:center; gap:8px; }
.selected-badge {
  font-size:12px;
  font-weight:600;
  padding:4px 12px;
  background:var(--primary);
  color:#fff;
  border-radius:20px;
}
.page-size-select {
  display:flex; align-items:center; gap:8px;
  font-size:12px; color:var(--text-sub);
}
.date-range { display:flex; align-items:center; gap:8px; }

/* ── 일괄 승인/반려 버튼 ── */
.btn-delete {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  height: 42px;
  border: none;
  border-radius: 8px;
  color: var(--text-inverse);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
  white-space: nowrap;
}

/* ── 상태 배지 ── */
.status-badge {
  display:inline-flex; align-items:center; gap:4px;
  padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600;
}
.status-pending  { background:rgba(245,158,11,.1); color:var(--warning); }
.status-approved { background:rgba(16,185,129,.1);  color:var(--success); }
.status-rejected { background:rgba(239,68,68,.1);   color:var(--danger);  }

/* ── 승인/반려 단건 버튼 ── */
.action-buttons { display:flex; gap:5px; justify-content:center; }
.btn-approve, .btn-reject {
  display:flex; align-items:center; gap:4px;
  padding:5px 10px; border:none; border-radius:6px;
  font-size:11px; font-weight:600; cursor:pointer; transition:all .2s; font-family:inherit;
}
.btn-approve { background:var(--success); color:#fff; }
.btn-approve:hover { background:var(--success-hover); }
.btn-reject  { background:var(--danger);  color:#fff; }
.btn-reject:hover  { filter:brightness(.9); }

/* ── 체크박스 ── */
.cb-col { width:44px; }
.cb-placeholder { display:inline-block; width:16px; height:16px; }
.custom-cb {
  appearance:none; -webkit-appearance:none;
  width:16px; height:16px;
  border:2px solid var(--border-focus); border-radius:4px;
  cursor:pointer; position:relative; transition:all .15s;
  background:var(--bg-surface); margin:0; flex-shrink:0;
  vertical-align:middle;
}
.custom-cb:hover   { border-color:var(--primary); }
.custom-cb:checked { border-color:var(--primary); background:var(--primary); }
.custom-cb:checked::after {
  content:''; position:absolute;
  top:1px; left:4px; width:4px; height:8px;
  border:solid #fff; border-width:0 2px 2px 0;
  transform:rotate(45deg);
}

/* ── 행 상태 ── */
.row-selected { background-color:var(--primary-soft) !important; }

/* ── 이름 칩 ── */
.modal-name-chip {
  font-size:13px; font-weight:700; padding:2px 10px;
  background:var(--primary-soft); color:var(--primary);
  border-radius:6px; margin-left:6px;
}

/* ── 연차 칩 ── */
.day-chip {
  display:inline-flex; padding:3px 10px; border-radius:20px;
  font-size:12px; font-weight:700;
  background:var(--bg-hover); color:var(--text-sub);
}
.day-chip.used   { background:rgba(245,158,11,.1); color:var(--warning); }
.day-chip.remain { background:rgba(16,185,129,.1); color:var(--success); }
.day-chip.remain.low { background:rgba(239,68,68,.1); color:var(--danger); }

/* ── 사용률 바 ── */
.progress-wrap { display:flex; align-items:center; gap:6px; }
.progress-bar  { flex:1; height:6px; background:var(--bg-canvas); border-radius:3px; overflow:hidden; min-width:50px; }
.progress-fill { height:100%; background:var(--primary); border-radius:3px; transition:width .3s; }

/* ── btn-detail 비활성 ── */
.btn-detail:disabled { opacity:.4; cursor:not-allowed; transform:none; }

/* ── 사유 셀 말줄임 ── */
.reason-cell { max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* ── 테이블 스크롤 ── */
.table-scroll-container { overflow-x:auto; -webkit-overflow-scrolling:touch; }
.table-scroll-container::-webkit-scrollbar { height:6px; }
.table-scroll-container::-webkit-scrollbar-thumb { background:var(--border-focus); border-radius:3px; }

/* ── 스피너 ── */
.spinner {
  width:36px; height:36px;
  border:3px solid var(--bg-canvas); border-top-color:var(--primary);
  border-radius:50%; animation:spin 1s linear infinite; margin:0 auto 12px;
}
@keyframes spin { to { transform:rotate(360deg); } }

/* ── 모달 ── */
.modal-overlay {
  position:fixed; inset:0; background:rgba(0,0,0,.45);
  display:flex; align-items:center; justify-content:center;
  z-index:1000; padding:20px;
}
.modal-box {
  background:var(--bg-surface); border-radius:16px;
  box-shadow:0 20px 60px rgba(0,0,0,.2);
  width:100%; max-width:540px; max-height:90vh;
  display:flex; flex-direction:column; overflow:hidden;
}
.modal-footer {
  display:flex; justify-content:flex-end; gap:10px;
  padding:16px 28px; border-top:1px solid var(--border-color);
  background:var(--bg-surface);
}
.btn-m {
  display:flex; align-items:center; gap:6px;
  padding:10px 20px; border-radius:8px;
  font-size:13px; font-weight:600; cursor:pointer;
  border:none; transition:all .2s; font-family:inherit;
}

/* ── 정산 요약 ── */
.settle-summary {
  display:flex; align-items:center; gap:16px;
  padding:14px 16px; background:var(--bg-canvas);
  border:1px solid var(--border-color); border-radius:10px;
  margin-bottom:20px; flex-wrap:wrap; justify-content:center;
}
.ss-item { display:flex; flex-direction:column; align-items:center; gap:5px; }
.ss-label { font-size:11px; color:var(--text-muted); font-weight:500; }
.ss-divider { font-size:18px; color:var(--text-muted); display:flex; align-items:center; }
.settle-amount-preview { font-size:20px; font-weight:800; color:var(--primary); }

/* ── fade 트랜지션 ── */
.fade-enter-active, .fade-leave-active { transition:opacity .2s, transform .2s; }
.fade-enter-from, .fade-leave-to { opacity:0; transform:translateY(-4px); }

/* ── 반응형 ── */
@media (max-width:768px) {
  .tab-btn    { padding:11px 16px; font-size:13px; }
  .action-bar { flex-direction:column; align-items:flex-start; }
  .mform-grid { grid-template-columns:1fr; }
  .settle-summary { justify-content:center; }
  .date-range { flex-wrap:wrap; }
}

.ml-1 { margin-left:4px; }
.text-sm { font-size:12px; }
</style>
