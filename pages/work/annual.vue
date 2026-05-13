<template>
  <div class="annual-list-page">
    <!-- 1. 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calendar-check-outline"></i>연차 통합 관리
        </h1>
        <p class="page-subtitle">연차 신청 승인과 직원별 잔여 현황을 관리하고 수정합니다</p>
      </div>

      <div class="header-actions">
        <button v-if="activeTab === 'quota'" @click="openGrant" class="btn-add">
          <i class="mdi mdi-gift-outline"></i> 연차 일괄 부여
        </button>
        <div v-else-if="selectedReq.length > 0" class="bulk-actions">
          <button class="btn-save" @click="bulkUpdateStatus(1)">일괄 승인</button>
          <button class="btn-delete" @click="bulkUpdateStatus(2)">일괄 반려</button>
        </div>
      </div>
    </div>

    <!-- 2. 상단 탭 네비게이션 -->
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

    <!-- 3. [탭1] 연차 신청 관리 -->
    <template v-if="activeTab === 'request'">
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

      <div class="filter-panel">
        <div class="filter-row">
          <div class="filter-group">
            <label class="filter-label">신청 기간</label>
            <div class="date-range">
              <input type="date" v-model="reqFilter.startDate" class="filter-select" />
              <span class="text-gray">~</span>
              <input type="date" v-model="reqFilter.endDate"   class="filter-select" />
            </div>
          </div>
          <div class="filter-group"><label class="filter-label">현장</label><SiteSelect v-model="reqFilter.sIdx" /></div>
          <div class="filter-group">
            <label class="filter-label">상태</label>
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
              <input v-model="reqFilter.keyword" type="text" placeholder="직원명 검색..." class="search-input" @keyup.enter="fetchRequests" />
            </div>
            <button @click="fetchRequests" class="btn-search">조회</button>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-scroll-container">
          <table class="data-table">
            <thead>
            <tr>
              <th class="text-center cb-col"><input type="checkbox" v-model="selectAllReq" class="custom-cb" /></th>
              <th>현장</th>
              <th>신청일</th>
              <th>직원명</th>
              <th>사용 기간</th>
              <th class="text-center">일수</th>
              <th>사유</th>
              <th class="text-center">상태</th>
              <th class="text-center">관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-if="isLoadingReq" class="empty-row"><td colspan="9"><div class="empty-state"><div class="spinner"></div><p>로딩 중...</p></div></td></tr>
            <template v-else>
              <tr v-for="req in pagedReq" :key="req.idx" class="data-row" :class="{ 'row-selected': req._selected }">
                <td class="text-center">
                  <input v-if="+req.status === 0" type="checkbox" v-model="req._selected" class="custom-cb" />
                  <span v-else class="cb-placeholder"></span>
                </td>
                <td class="text-gray text-sm">{{ req.site }}</td>
                <td class="text-gray text-sm">{{ req.regDt ? req.regDt.substring(0,10) : '-' }}</td>
                <td><span class="font-bold text-blue">{{ req.staff || req.name }}</span></td>
                <td class="text-sm">{{ req.startDt }} ~ {{ req.endDt }}</td>
                <td class="text-center font-bold text-blue">{{ formatDay(req.usedCount || req.days) }}일</td>
                <td class="text-gray text-sm reason-cell" :title="req.reason">{{ req.reason || '-' }}</td>
                <td class="text-center">
                  <span :class="['status-badge', statusInfo(req.status).cls]">
                    <i :class="['mdi', statusInfo(req.status).icon]"></i>
                    {{ statusInfo(req.status).text }}
                  </span>
                </td>
                <td class="text-center">
                  <div v-if="+req.status === 0" class="action-buttons">
                    <button @click="updateStatus(req.idx, 1)" class="btn-approve">승인</button>
                    <button @click="updateStatus(req.idx, 2)" class="btn-reject">반려</button>
                  </div>
                  <span v-else class="text-gray text-sm">처리완료</span>
                </td>
              </tr>
            </template>
            </tbody>
          </table>
        </div>
        <Pagination v-model:currentPage="currentPageReq" v-model:pageSize="pageSizeReq" :totalCount="filteredReq.length" />
      </div>
    </template>

    <!-- 4. [탭2] 연차 잔여 현황 -->
    <template v-if="activeTab === 'quota'">
      <div class="stats-grid">
        <div class="stat-card" style="--card-color:var(--primary);--card-bg:var(--primary-soft)">
          <div class="stat-icon"><i class="mdi mdi-account-group-outline"></i></div>
          <div class="stat-content"><span class="stat-label">관리 직원</span><span class="stat-value">{{ quotaStats.total }}<small>명</small></span></div>
        </div>
        <div class="stat-card" style="--card-color:#0ea5e9;--card-bg:rgba(14,165,233,.1)">
          <div class="stat-icon"><i class="mdi mdi-gift-outline"></i></div>
          <div class="stat-content"><span class="stat-label">총 부여</span><span class="stat-value">{{ formatDay(quotaStats.granted) }}<small>일</small></span></div>
        </div>
        <div class="stat-card" style="--card-color:var(--warning);--card-bg:rgba(245,158,11,.1)">
          <div class="stat-icon"><i class="mdi mdi-calendar-remove-outline"></i></div>
          <div class="stat-content"><span class="stat-label">총 사용</span><span class="stat-value">{{ formatDay(quotaStats.used) }}<small>일</small></span></div>
        </div>
        <div class="stat-card" style="--card-color:var(--success);--card-bg:rgba(16,185,129,.1)">
          <div class="stat-icon"><i class="mdi mdi-calendar-clock-outline"></i></div>
          <div class="stat-content"><span class="stat-label">최종 잔여</span><span class="stat-value">{{ formatDay(quotaStats.remain) }}<small>일</small></span></div>
        </div>
      </div>

      <div class="filter-panel">
        <div class="filter-row">
          <div class="filter-group"><label class="filter-label">현장</label><SiteSelect v-model="quotaFilter.sIdx" /></div>
          <div class="search-group">
            <div class="search-box">
              <i class="mdi mdi-magnify"></i>
              <input v-model="quotaFilter.keyword" placeholder="직원명 검색..." class="search-input" @keyup.enter="fetchQuotaList" />
            </div>
            <button @click="fetchQuotaList" class="btn-search">조회</button>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-scroll-container">
          <table class="data-table">
            <thead>
            <tr>
              <th class="text-center cb-col"><input type="checkbox" v-model="selectAllQuota" class="custom-cb" /></th>
              <th>현장</th>
              <th>직원명</th>
              <th class="text-center">입사일</th>
              <th class="text-center">총 부여</th>
              <th class="text-center">총 이월</th>
              <th class="text-center">총 사용</th>
              <th class="text-center">최종 잔여</th>
              <th class="text-center">사용률</th>
              <th class="text-center">상세</th>
            </tr>
            </thead>
            <tbody>
            <tr v-if="isLoadingQuota" class="empty-row"><td colspan="10"><div class="empty-state"><div class="spinner"></div><p>집계 중...</p></div></td></tr>
            <template v-else>
              <template v-for="item in pagedQuota" :key="item.mIdx">
                <tr class="data-row" :class="{ 'row-selected': item._selected, 'row-expanded-main': isExpanded(item.mIdx) }">
                  <td class="text-center"><input type="checkbox" v-model="item._selected" class="custom-cb" /></td>
                  <td class="text-gray text-sm">{{ item.siteName }}</td>
                  <td><span class="font-bold">{{ item.name }}</span><span class="badge badge-gray ml-1">{{ item.role }}</span></td>
                  <td class="text-center text-gray text-sm">{{ item.inDate || '-' }}</td>
                  <td class="text-center">{{ item.hasQuota ? formatDay(item.totalCountSum) + '일' : '-' }}</td>
                  <td class="text-center">
                    <span v-if="item.overCountSum > 0" class="badge badge-blue">+{{ formatDay(item.overCountSum) }}일</span>
                    <span v-else class="text-gray">-</span>
                  </td>
                  <td class="text-center"><span class="day-chip used">{{ formatDay(item.usedCountSum) }}일</span></td>
                  <td class="text-center">
                    <span :class="['day-chip', 'remain', item.remainDays <= 3 ? 'low' : '']">{{ formatDay(item.remainDays) }}일</span>
                  </td>
                  <td class="text-center">
                    <div class="progress-wrap">
                      <div class="progress-bar"><div class="progress-fill" :style="`width:${item.usageRate}%`"></div></div>
                      <span class="text-gray text-sm">{{ item.usageRate }}%</span>
                    </div>
                  </td>
                  <td class="text-center">
                    <button @click="toggleExpand(item.mIdx)" class="btn-toggle-details" :disabled="!item.hasQuota">
                      상세 <i :class="['mdi', isExpanded(item.mIdx) ? 'mdi-chevron-up' : 'mdi-chevron-down']"></i>
                    </button>
                  </td>
                </tr>
                <!-- 상세 이력 및 수정 버튼 -->
                <tr v-if="isExpanded(item.mIdx)" class="expanded-row">
                  <td colspan="10">
                    <div class="expanded-content">
                      <div class="history-header">
                        <h4 class="history-title"><i class="mdi mdi-history"></i> {{ item.name }} 직원의 연도별 상세 연차</h4>
                      </div>
                      <div class="sub-table-wrapper">
                        <table class="sub-table">
                          <thead>
                          <tr>
                            <th>발생 연도</th>
                            <th>신규 부여</th> <!-- 신규 발생분 -->
                            <th>전년 이월</th> <!-- 넘어온 분 -->
                            <th>가용 합계</th> <!-- 부여 + 이월 -->
                            <th>사용일수</th>
                            <th>정산/차감</th>
                            <th>연도별 잔여</th>
                            <th class="text-center">관리</th>
                          </tr>
                          </thead>
                          <tbody>
                          <tr v-for="hist in item.history" :key="hist.idx">
                            <td><span class="year-badge">{{ hist.year }}년</span></td>
                            <td class="font-bold">{{ formatDay(hist.totalCount) }}일</td>
                            <td class="text-blue">+{{ formatDay(hist.overCount) }}일</td>
                            <td class="bg-gray-soft font-bold">
                              {{ formatDay(hist.totalCount + hist.overCount) }}일
                            </td>
                            <td class="text-warning">{{ formatDay(hist.usedCount) }}일</td>
                            <td class="text-danger">{{ formatDay(hist.payCount) }}일</td>
                            <td>
                              <span class="text-success font-bold">{{ formatDay(hist.remainDays) }}일</span>
                            </td>
                            <td class="text-center">
                              <button @click="openEdit(hist, item)" class="btn-toggle-details" style="padding: 2px 8px; margin: 0 auto;">
                                <i class="mdi mdi-pencil-outline"></i> 수정
                              </button>
                            </td>
                          </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </template>
            </tbody>
          </table>
        </div>
        <Pagination v-model:currentPage="currentPageQuota" v-model:pageSize="pageSizeQuota" :totalCount="filteredQuota.length" />
      </div>
    </template>

    <!-- 5. 모달: 일괄 부여 -->
    <div v-if="isGrantOpen" class="modal-overlay" @click.self="isGrantOpen = false">
      <div class="modal-box grant-modal">
        <div class="modal-header">
          <h2 class="modal-title"><div class="icon-wrap bg-blue-tint"><i class="mdi mdi-gift-outline"></i></div> 연차 일괄 부여</h2>
          <button class="modal-close" @click="isGrantOpen = false"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="mform-layout">
            <div class="mform-group"><label>부여 연도</label>
              <select v-model.number="grantForm.year" class="m-input">
                <option v-for="y in yearRange" :key="y" :value="y">{{ y }}년</option>
              </select>
            </div>
            <div class="mform-group">
              <label>기준일</label>
              <input v-model="grantForm.grantDate" type="date" class="m-input" />
            </div>
            <div class="mform-group">
              <label>연차 개수</label>
              <div class="input-with-suffix">
                <input v-model.number="grantForm.totalCount" type="number" class="m-input text-right" />
                <span class="suffix">일</span>
              </div>
            </div>
            <div class="mform-group full-width"><label>비고</label><input v-model="grantForm.bigo" type="text" class="m-input" /></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="isGrantOpen = false">취소</button>
          <button class="btn-confirm primary" @click="executeGrant" :disabled="isGranting">부여 실행</button>
        </div>
      </div>
    </div>

    <!-- 6. 모달: 개별 내역 수정 (핵심 부분) -->
    <div v-if="isEditOpen" class="modal-overlay" @click.self="isEditOpen = false">
      <div class="modal-box grant-modal">
        <div class="modal-header">
          <h2 class="modal-title">
            <div class="icon-wrap bg-blue-tint"><i class="mdi mdi-pencil-outline text-blue"></i></div>
            연차 내역 수정 <span class="modal-name-chip">{{ editForm.mName }}</span>
          </h2>
          <button class="modal-close" @click="isEditOpen = false"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="mform-layout">
            <div class="mform-group">
              <label>연도</label>
              <input :value="editForm.year + '년'" class="m-input" readonly />
            </div>
            <div class="mform-group">
              <label>부여일수</label>
              <div class="input-with-suffix">
                <input
                    v-model.number="editForm.totalCount"
                    type="number"
                    step="0.5"
                    class="m-input text-right"
                />
                <span class="suffix">일</span>
              </div>
            </div>
            <div class="mform-group">
              <label>전년 이월분 (+)</label>
              <div class="input-with-suffix">
                <input v-model.number="editForm.overCount" type="number" step="0.5" class="m-input text-right text-blue" />
                <span class="suffix">일</span>
              </div>
            </div>
            <div class="mform-group">
              <label>사용일수</label>
              <div class="input-with-suffix">
                <input
                    v-model.number="editForm.usedCount"
                    type="number"
                    step="0.5"
                    class="m-input text-right"
                />
                <span class="suffix">일</span>
              </div>
            </div>
            <div class="mform-group">
              <label>정산/차감</label>
              <div class="input-with-suffix">
                <input
                    v-model.number="editForm.payCount"
                    type="number"
                    step="0.5"
                    class="m-input text-right"
                />
                <span class="suffix">일</span>
              </div>
            </div>
            <div class="mform-group full-width">
              <label>비고</label>
              <input v-model="editForm.bigo" type="text" class="m-input" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="isEditOpen = false">취소</button>
          <!-- 수정된 executeEdit 함수 연결 -->
          <button class="btn-confirm primary" @click="executeEdit" :disabled="isEditing">
            <i class="mdi mdi-check"></i> {{ isEditing ? '저장 중...' : '변경사항 저장' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onActivated } from 'vue'
import axios from 'axios'
import { useRoute, useRouter } from '#app'
import { useAuthStore } from '~/stores/auth.js'
import Pagination from '~/components/Pagination.vue'
import SiteSelect from "~/components/SiteSelect.vue";

// 유틸
const formatDay = (v) => Number(v || 0).toString()
const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

const authStore = useAuthStore()
const approverIdx = authStore.user?.[0]?.idx
const currentYear = new Date().getFullYear();

const yearRange = computed(() => {
  const years = [];
  for (let y = currentYear + 1; y >= 2010; y--) years.push(y);
  return years;
});

async function withLoading(loadingRef, fn) {
  loadingRef.value = true
  try { await fn() }
  catch (e) { console.error(e); alert(e.response?.data?.message || '오류가 발생했습니다.') }
  finally { loadingRef.value = false }
}

// 탭
const tabs = [
  { id: 'request', icon: 'mdi-inbox-arrow-down-outline', name: '신청 관리' },
  { id: 'quota',   icon: 'mdi-chart-donut',              name: '잔여 현황' },
]
const activeTab = ref('request')
async function changeTab(id) {
  activeTab.value = id
  if (id === 'quota') await fetchQuotaList()
  else await fetchRequests()
}

// ------------------------------------------------------------
// [탭1] 신청 관리 로직
// ------------------------------------------------------------
const requests = ref([])
const isLoadingReq = ref(false)
const currentPageReq = ref(1)
const pageSizeReq = ref(50)
const reqFilter = ref({ startDate: firstOfMonth(), endDate: today(), sIdx: '전체', status: '전체', keyword: '' })

const statsReq = computed(() => ({
  total: requests.value.length,
  pending: requests.value.filter(r => +r.status === 0).length,
  approved: requests.value.filter(r => +r.status === 1).length,
  rejected: requests.value.filter(r => +r.status === 2).length,
}))

const filteredReq = computed(() => requests.value.filter(r => {
  const stOk = reqFilter.value.status === '전체' || r.status == reqFilter.value.status
  const sIdx = reqFilter.value.sIdx === '전체' || r.sIdx == reqFilter.value.sIdx
  const kwOk = (r.name || r.staff || '').includes(reqFilter.value.keyword)
  return stOk && kwOk && sIdx
}))

const pagedReq = computed(() => {
  const s = (currentPageReq.value - 1) * pageSizeReq.value
  return filteredReq.value.slice(s, s + pageSizeReq.value)
})

const selectAllReq = computed({
  get: () => pagedReq.value.length > 0 && pagedReq.value.filter(r => +r.status === 0).every(r => r._selected),
  set: (v) => pagedReq.value.forEach(r => { if (+r.status === 0) r._selected = v }),
})
const selectedReq = computed(() => filteredReq.value.filter(r => r._selected))

async function fetchRequests() {
  await withLoading(isLoadingReq, async () => {
    const { data } = await axios.get(`/api/v1/member/off`, {
      params: { startDt: reqFilter.value.startDate, endDt: reqFilter.value.endDate },
    })
    requests.value = (data.data || []).map(r => ({ ...r, _selected: false }))
  })
}

async function updateStatus(idx, status) {
  if (!confirm('처리하시겠습니까?')) return
  await withLoading(isLoadingReq, async () => {
    await axios.post('/api/v1/member/off/status', { idx, status, approverIdx })
    await fetchRequests()
  })
}

async function bulkUpdateStatus(status) {
  const targets = selectedReq.value
  if (!targets.length || !confirm(`${targets.length}건을 일괄 처리하시겠습니까?`)) return
  await withLoading(isLoadingReq, async () => {
    await Promise.allSettled(targets.map(r => axios.post('/api/v1/member/off/status', { idx: r.idx, status, approverIdx })))
    await fetchRequests()
  })
}

const statusInfo = (s) => ({
  0: { cls: 'status-pending',  text: '승인대기', icon: 'mdi-clock-outline' },
  1: { cls: 'status-approved', text: '승인완료', icon: 'mdi-check-circle-outline' },
  2: { cls: 'status-rejected', text: '반려됨',   icon: 'mdi-close-circle-outline' },
}[+s] || { cls: 'status-pending', text: '대기', icon: 'mdi-clock-outline' })

// ------------------------------------------------------------
// [탭2] 잔여 현황 로직
// ------------------------------------------------------------
const rawQuotaList = ref([])
const isLoadingQuota = ref(false)
const currentPageQuota = ref(1)
const pageSizeQuota = ref(50)
const quotaFilter = ref({ sIdx: '전체', keyword: '' })
const expandedRows = ref([])

const toggleExpand = (mIdx) => {
  const idx = expandedRows.value.indexOf(mIdx)
  idx > -1 ? expandedRows.value.splice(idx, 1) : expandedRows.value.push(mIdx)
}
const isExpanded = (mIdx) => expandedRows.value.includes(mIdx)

const aggregatedQuotaList = computed(() => {
  const userMap = new Map();
  rawQuotaList.value.forEach(item => {
    if (!userMap.has(item.mIdx)) {
      userMap.set(item.mIdx, {
        ...item,
        mIdx: item.mIdx,
        name: item.mName || item.name,
        _selected: false,
        hasQuota: false,
        history: [],
        totalCountSum: 0,
        overCountSum: 0,
        usedCountSum: 0,
        payCountSum: 0,
      });
    }
    const user = userMap.get(item.mIdx);
    if (item.year) {
      user.hasQuota = true;
      const t = parseFloat(item.totalCount || 0), o = parseFloat(item.overCount || 0), u = parseFloat(item.usedCount || 0), p = parseFloat(item.payCount || 0);
      const r = item.remainCount !== undefined ? parseFloat(item.remainCount) : (t + o - u - p);
      // console.log(item,' item')
      user.history.push({
        idx: item.quotaIdx,
        year: item.year,
        totalCount: t,
        overCount: o,
        usedCount: u,
        payCount: p,
        remainDays: r,
        bigo: item.bigo,
        middleDt: item.middleDt
      });
      user.totalCountSum += t;
      user.overCountSum += o;
      user.usedCountSum += u;
      user.payCountSum += p;
    }
  });
  return Array.from(userMap.values()).map(user => {
    const remainDays = user.history.reduce((acc, cur) => acc + cur.remainDays, 0);
    const usageRate = (user.totalCountSum + user.overCountSum) > 0 ? Math.round((user.usedCountSum / (user.totalCountSum + user.overCountSum)) * 100) : 0;
    user.history.sort((a, b) => b.year - a.year);
    return { ...user, remainDays, usageRate };
  });
});

const quotaStats = computed(() => ({
  total: aggregatedQuotaList.value.length,
  granted: aggregatedQuotaList.value.reduce((s, i) => s + i.totalCountSum, 0),
  used: aggregatedQuotaList.value.reduce((s, i) => s + i.usedCountSum, 0),
  remain: aggregatedQuotaList.value.reduce((s, i) => s + i.remainDays, 0),
}))

const filteredQuota = computed(() => aggregatedQuotaList.value.filter(i => {
  const sOk = quotaFilter.value.sIdx === '전체' || i.sIdx == quotaFilter.value.sIdx
  const kOk = !quotaFilter.value.keyword || (i.name || '').includes(quotaFilter.value.keyword)
  return sOk && kOk
}))

const pagedQuota = computed(() => {
  const s = (currentPageQuota.value - 1) * pageSizeQuota.value
  return filteredQuota.value.slice(s, s + pageSizeQuota.value)
})

const selectAllQuota = computed({
  get: () => pagedQuota.value.length > 0 && pagedQuota.value.every(i => i._selected),
  set: (v) => pagedQuota.value.forEach(i => (i._selected = v)),
})
const selectedQuota = computed(() => filteredQuota.value.filter(i => i._selected))

async function fetchQuotaList() {
  await withLoading(isLoadingQuota,
      async () => {
    const { data } = await axios.get('/api/v1/member/annual/list')
    rawQuotaList.value = data.data || [];
  });
}

// 일괄 부여
const isGrantOpen = ref(false)
const isGranting = ref(false)
const grantForm = ref({
  year: currentYear, grantDate: `${currentYear}-01-01`, totalCount: 15, bigo: '' })
function openGrant() {
  grantForm.value = { year: currentYear, grantDate: `${currentYear}-01-01`, totalCount: 15, bigo: '' }
  isGrantOpen.value = true
}
async function executeGrant() {
  const targets = selectedQuota.value.length > 0 ? selectedQuota.value : filteredQuota.value.filter(i => !i.hasQuota);
  if (!targets.length || !confirm(`${targets.length}명에게 일괄 부여하시겠습니까?`)) return;
  await withLoading(isGranting, async () => {
    await Promise.allSettled(targets.map(i => axios.post('/api/v1/member/annual/register', {
      mIdx: i.mIdx, sIdx: i.sIdx, mName: i.name, mType: i.positionCd,
      year: grantForm.value.year, middleDt: grantForm.value.grantDate, totalCount: grantForm.value.totalCount, bigo: grantForm.value.bigo,
    })));
    isGrantOpen.value = false; await fetchQuotaList();
  });
}

// ------------------------------------------------------------
// [핵심] 개별 수정 로직
// ------------------------------------------------------------
const isEditOpen = ref(false)
const isEditing  = ref(false)
const editForm   = ref({
  idx: null,
  mIdx: null,
  sIdx: null,
  mName: '',
  mType: '',
  year: '',
  middleDt: '',
  totalCount: 0,
  overCount: 0,
  payCount: 0,
  bigo: '',
})

// 수정 모달 열기: 모든 필수 정보를 item(직원)과 hist(기록)에서 추출하여 세팅
function openEdit(hist, item) {
  console.log(hist, item, 'openEdit')
  editForm.value = {
    idx:        hist.idx,
    mIdx:       item.mIdx,
    sIdx:       item.sIdx,
    mName:      item.name,
    mType:      item.positionCd,
    year:       hist.year,
    middleDt:   hist.middleDt || `${hist.year}-01-01`,
    totalCount: hist.totalCount,
    overCount:  hist.overCount,
    payCount:   hist.payCount,
    bigo:       hist.bigo || '',
  }
  isEditOpen.value = true
}

// 변경사항 저장 실행
async function executeEdit() {
  // 필수 정보 체크
  if (!editForm.value.idx || !editForm.value.mIdx) {
    alert('수정할 데이터 정보가 부족합니다.');
    return;
  }

  if (!confirm('연차 정보를 수정하시겠습니까?')) return;

  await withLoading(isEditing, async () => {
    // 백엔드 register API는 idx가 있으면 Update, 없으면 Insert로 동작하므로
    // 부여할 때와 동일한 모든 필드를 전송해야 안전합니다.
    const payload = {
      idx:        editForm.value.idx,
      mIdx:       editForm.value.mIdx,
      sIdx:       editForm.value.sIdx,
      mName:      editForm.value.mName,
      mType:      editForm.value.mType,
      year:       editForm.value.year,
      middleDt:   editForm.value.middleDt,
      totalCount: editForm.value.totalCount,
      overCount:  editForm.value.overCount,
      payCount:   editForm.value.payCount,
      bigo:       editForm.value.bigo,
      updaterIdx: approverIdx
    };

    const { data } = await axios.post('/api/v1/member/annual/register', payload);

    if (data.result || data.idx) {
      alert('수정이 완료되었습니다.');
      isEditOpen.value = false;
      await fetchQuotaList(); // 목록 새로고침
    } else {
      throw new Error(data.message || '수정 처리 중 오류가 발생했습니다.');
    }
  });
}

onMounted(async () => {
  if (activeTab.value === 'quota') await fetchQuotaList()
  else await fetchRequests()
})
onActivated(async () => { await fetchQuotaList(); });
</script>

<style scoped>
/* (기존 CSS 스타일 유지 - 이전 응답의 스타일 시트와 동일함) */
.tab-nav { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid var(--border-color); }
.tab-btn { padding: 10px 20px; border: none; background: none; font-size: 13px; font-weight: 600; color: var(--text-sub); cursor: pointer; border-radius: 8px 8px 0 0; display: flex; align-items: center; gap: 7px; transition: all .2s; position: relative; bottom: -2px; font-family: inherit; }
.tab-btn.active { color: var(--primary); background: var(--bg-surface); border: 2px solid var(--border-color); border-bottom: 2px solid var(--bg-surface); }
.tab-badge { min-width:18px; height:18px; padding:0 5px; background:var(--danger); color:#fff; border-radius:9px; font-size:10px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; }
.bulk-actions { display:flex; align-items:center; gap:8px; }
.btn-delete, .btn-save { display: flex; align-items: center; gap: 6px; padding: 0 20px; height: 38px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm); white-space: nowrap; }
.btn-delete { background: var(--bg-hover); color: var(--text-main); }
.btn-save { background: var(--primary); color: #fff; }
.action-buttons { display:flex; gap:5px; justify-content:center; }
.btn-approve, .btn-reject { display:flex; align-items:center; gap:4px; padding:5px 10px; border:none; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; transition:all .2s; }
.btn-approve { background:var(--success); color:#fff; }
.btn-reject  { background:var(--danger);  color:#fff; }
.status-badge { display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; }
.status-pending  { background:rgba(245,158,11,.1); color:var(--warning); }
.status-approved { background:rgba(16,185,129,.1);  color:var(--success); }
.status-rejected { background:rgba(239,68,68,.1);   color:var(--danger);  }
.custom-cb { appearance:none; -webkit-appearance:none; width:16px; height:16px; border:2px solid var(--border-focus); border-radius:4px; cursor:pointer; position:relative; vertical-align:middle; background:var(--bg-surface); }
.custom-cb:checked { border-color:var(--primary); background:var(--primary); }
.custom-cb:checked::after { content:''; position:absolute; top:1px; left:4px; width:4px; height:8px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }
.row-selected { background-color:var(--primary-soft) !important; }
.modal-name-chip { font-size:13px; font-weight:700; padding:2px 10px; background:var(--primary-soft); color:var(--primary); border-radius:6px; margin-left:6px; }
.day-chip { display:inline-flex; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:700; background:var(--bg-hover); color:var(--text-sub); }
.day-chip.used   { background:rgba(245,158,11,.1); color:var(--warning); }
.day-chip.remain { background:rgba(16,185,129,.1); color:var(--success); }
.day-chip.remain.low { background:rgba(239,68,68,.1); color:var(--danger); }
.progress-wrap { display:flex; align-items:center; gap:6px; }
.progress-bar  { flex:1; height:6px; background:var(--bg-canvas); border-radius:3px; overflow:hidden; min-width:50px; }
.progress-fill { height:100%; background:var(--primary); border-radius:3px; transition:width .3s; }
.reason-cell { max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.spinner { width:36px; height:36px; border:3px solid var(--bg-canvas); border-top-color:var(--primary); border-radius:50%; animation:spin 1s linear infinite; margin:0 auto 12px; }
@keyframes spin { to { transform:rotate(360deg); } }
.modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
.modal-box { background: var(--bg-surface); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); width: 100%; max-width: 480px; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas); }
.modal-title { font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 10px; margin: 0; }
.icon-wrap { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; font-size: 18px; }
.bg-blue-tint { background: rgba(37, 99, 235, 0.1); }
.text-blue { color: #2563eb; }
.modal-close { background: none; border: none; font-size: 22px; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 6px; }
.modal-info-box { display: flex; align-items: flex-start; gap: 10px; background: rgba(37, 99, 235, 0.05); border: 1px dashed rgba(37, 99, 235, 0.3); padding: 14px 18px; border-radius: 10px; font-size: 13.5px; margin-bottom: 20px; }
.highlight-text { font-weight: 800; color: #2563eb; }
.mform-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); }
.mform-group { display: flex; flex-direction: column; gap: 8px; }
.mform-group.full-width { grid-column: 1 / -1; }
.mform-group label { font-size: 12px; font-weight: 700; color: var(--text-sub); }
.m-input { width: 100%; padding: 10px 12px; border: 1px solid var(--border-focus); border-radius: 8px; font-size: 14px; font-weight: 600; background: var(--bg-surface); }
.input-with-suffix { position: relative; display: flex; align-items: center; }
.suffix { position: absolute; right: 12px; font-size: 13px; color: var(--text-muted); font-weight: 700; }
.modal-footer { padding: 16px 24px; display: flex; justify-content: flex-end; gap: 10px; background: var(--bg-surface); border-top: 1px solid var(--border-color); }
.btn-cancel, .btn-confirm { padding: 10px 20px; border-radius: 8px; font-size: 13.5px; font-weight: 700; cursor: pointer; border: none; display: flex; align-items: center; gap: 6px; }
.btn-cancel { background: var(--bg-hover); color: var(--text-sub); }
.btn-confirm.primary { background: var(--primary); color: #fff; }
.btn-toggle-details { display: flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.row-expanded-main { background-color: var(--primary-soft) !important; border-bottom: none !important; }
.expanded-row { background-color: #f8fafc; }
.expanded-row td { border-bottom: 2px solid var(--border-color) !important; }
.expanded-content { padding: 24px 32px; animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
.history-header { display: flex; margin-bottom: 12px; }
.history-title { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px; }
.sub-table-wrapper { background: #ffffff; border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; box-shadow: var(--shadow-sm); }
.sub-table { width: 100%; border-collapse: collapse; text-align: center; }
.sub-table th, .sub-table td { padding: 6px; font-size: 13px; }
.sub-table th { background-color: #f1f5f9; color: var(--text-sub); font-weight: 700; border-bottom: 1px solid var(--border-color); }
.sub-table td { border-bottom: 1px solid var(--border-color); color: var(--text-main); }
.year-badge { display: inline-block; padding: 4px 10px; background: #f1f5f9; border-radius: 6px; font-size: 12px; font-weight: 800; color: #475569; }
</style>
