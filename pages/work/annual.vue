<template>
  <div class="annual-list-page">

    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calendar-check-outline"></i>연차 통합 관리
        </h1>
        <p class="page-subtitle">연차 신청 승인, 잔여 현황, 부여 및 중간정산을 관리합니다</p>
      </div>
      <div class="header-actions" v-if="activeTab === 'quota'">
        <button @click="openGrant" class="btn-add">
          <i class="mdi mdi-gift-outline"></i> 연차 일괄 부여
        </button>
      </div>
      <div class="header-actions" v-else>
        <div class="action-bar-left">
          <transition name="fade">
            <div v-if="selectedReq.length > 0" class="bulk-actions">
              <button class="btn-save" @click="bulkUpdateStatus(1)">일괄 승인</button>
              <button class="btn-delete" @click="bulkUpdateStatus(2)">일괄 반려</button>
            </div>
          </transition>
        </div>
      </div>
    </div>

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
              <input v-model="reqFilter.keyword" type="text" placeholder="직원명으로 검색..." class="search-input" @keyup.enter="fetchRequests" />
            </div>
            <button @click="fetchRequests" class="btn-search">
              <i class="mdi mdi-magnify"></i><span>조회</span>
            </button>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header">
          <div class="table-title">
            <span>연차 신청 목록 ({{ filteredReq.length }}건)</span>
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
                <td class="text-center">
                  <input
                      v-if="+req.status === 0"
                      type="checkbox" v-model="req._selected" class="custom-cb"
                  />
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
        <Pagination v-model:currentPage="currentPageReq" v-model:pageSize="pageSizeReq" :totalCount="filteredReq.length" />
      </div>
    </template>

    <template v-if="activeTab === 'quota'">
      <div class="stats-grid">
        <div class="stat-card" style="--card-color:var(--primary);--card-bg:var(--primary-soft)">
          <div class="stat-icon"><i class="mdi mdi-account-group-outline"></i></div>
          <div class="stat-content"><span class="stat-label">관리 직원</span><span class="stat-value">{{ quotaStats.total }}<small>명</small></span></div>
        </div>
        <div class="stat-card" style="--card-color:#0ea5e9;--card-bg:rgba(14,165,233,.1)">
          <div class="stat-icon"><i class="mdi mdi-gift-outline"></i></div>
          <div class="stat-content"><span class="stat-label">누적 총 부여</span><span class="stat-value">{{ formatDay(quotaStats.granted) }}<small>일</small></span></div>
        </div>
        <div class="stat-card" style="--card-color:var(--warning);--card-bg:rgba(245,158,11,.1)">
          <div class="stat-icon"><i class="mdi mdi-calendar-remove-outline"></i></div>
          <div class="stat-content"><span class="stat-label">누적 총 사용</span><span class="stat-value">{{ formatDay(quotaStats.used) }}<small>일</small></span></div>
        </div>
        <div class="stat-card" style="--card-color:var(--success);--card-bg:rgba(16,185,129,.1)">
          <div class="stat-icon"><i class="mdi mdi-calendar-clock-outline"></i></div>
          <div class="stat-content"><span class="stat-label">최종 총 잔여</span><span class="stat-value">{{ formatDay(quotaStats.remain) }}<small>일</small></span></div>
        </div>
      </div>

      <div class="filter-panel">
        <div class="filter-row">
          <div class="filter-group">
            <label class="filter-label">현장</label>
            <SiteSelect v-model="quotaFilter.sIdx" />
          </div>
          <div class="search-group">
            <div class="search-box">
              <i class="mdi mdi-magnify"></i>
              <input
                  v-model="quotaFilter.keyword"
                  placeholder="직원명 검색..."
                  class="search-input"
                  @keyup.enter="fetchQuotaList"
              />
            </div>
            <button @click="fetchQuotaList" class="btn-search">조회</button>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header">
          <div class="table-title">
            직원별 누적 연차 현황 ({{ filteredQuota.length }}명)
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
              <th>현장</th>
              <th>직원명</th>
              <th class="text-center">입사일</th>
              <th class="text-center">총 부여</th>
              <th class="text-center">총 이월</th>
              <th class="text-center">총 사용</th>
              <th class="text-center">총 정산</th>
              <th class="text-center">최종 잔여</th>
              <th class="text-center">사용률</th>
              <th class="text-center">상세/관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-if="isLoadingQuota" class="empty-row">
              <td colspan="11">
                <div class="empty-state"><div class="spinner"></div><p>데이터를 집계 중입니다...</p></div>
              </td>
            </tr>

            <template v-else>
              <template v-for="item in pagedQuota" :key="item.mIdx">
                <tr
                    class="data-row"
                    :class="{
                      'row-selected': item._selected,
                      'row-expanded-main': isExpanded(item.mIdx)
                    }"
                >
                  <td class="text-center">
                    <input type="checkbox" v-model="item._selected" class="custom-cb" />
                  </td>
                  <td class="text-gray text-sm">{{ item.siteName }}</td>
                  <td>
                    <span class="font-bold">{{ item.name }}</span>
                    <span class="badge badge-gray ml-1">{{ item.role }}</span>
                  </td>
                  <td class="text-center text-gray text-sm">{{ item.inDate || '-' }}</td>

                  <td class="text-center">
                    <span v-if="item.hasQuota">{{ formatDay(item.totalCountSum) }}일</span>
                    <span v-else class="badge badge-red">기록없음</span>
                  </td>
                  <td class="text-center">
                    <span v-if="item.overCountSum > 0" class="badge badge-blue">+{{ formatDay(item.overCountSum) }}일</span>
                    <span v-else class="text-gray">-</span>
                  </td>
                  <td class="text-center"><span class="day-chip used">{{ formatDay(item.usedCountSum) }}일</span></td>
                  <td class="text-center">
                    <span v-if="item.payCountSum > 0" class="badge badge-red">{{ formatDay(item.payCountSum) }}일</span>
                    <span v-else class="text-gray">-</span>
                  </td>
                  <td class="text-center">
                      <span :class="['day-chip', 'remain', item.remainDays <= 3 ? 'low' : '']">
                        {{ formatDay(item.remainDays) }}일
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
                    <div style="display:flex; gap:6px; justify-content:center;">
                      <button
                          @click="toggleExpand(item.mIdx)"
                          class="btn-toggle-details"
                          :disabled="!item.hasQuota"
                      >
                        상세 <i :class="['mdi', isExpanded(item.mIdx) ? 'mdi-chevron-up' : 'mdi-chevron-down']"></i>
                      </button>

                      <button
                          @click="openSettle(item)"
                          class="btn-detail"
                          :disabled="!item.hasQuota || item.remainDays <= 0"
                      >정산</button>
                    </div>
                  </td>
                </tr>

                <tr v-if="isExpanded(item.mIdx)" class="expanded-row">
                  <td colspan="11">
                    <div class="expanded-content">
                      <div class="history-header">
                        <h4 class="history-title">
                          <i class="mdi mdi-history"></i> {{ item.name }} 직원의 연도별 상세 연차
                        </h4>
                        <span class="history-desc">최신 발생 연도순</span>
                      </div>

                      <div class="sub-table-wrapper">
                        <table class="sub-table">
                          <thead>
                          <tr>
                            <th>발생 연도</th>
                            <th>부여일수</th>
                            <th>이월일수</th>
                            <th>사용일수</th>
                            <th>정산일수</th>
                            <th>해당연도 잔여</th>
                          </tr>
                          </thead>
                          <tbody>
                          <tr v-for="hist in item.history" :key="hist.idx">
                            <td><span class="year-badge">{{ hist.year }}년</span></td>
                            <td class="font-bold text-main">{{ formatDay(hist.totalCount) }}일</td>
                            <td>
                              <span v-if="hist.overCount > 0" class="num-text text-blue">+{{ formatDay(hist.overCount) }}일</span>
                              <span v-else class="text-gray">-</span>
                            </td>
                            <td>
                              <span v-if="hist.usedCount > 0" class="num-text text-warning">{{ formatDay(hist.usedCount) }}일</span>
                              <span v-else class="text-gray">-</span>
                            </td>
                            <td>
                              <span v-if="hist.payCount > 0" class="num-text text-danger">{{ formatDay(hist.payCount) }}일</span>
                              <span v-else class="text-gray">-</span>
                            </td>
                            <td>
                              <span class="num-text text-success font-bold">{{ formatDay(hist.remainDays) }}일</span>
                            </td>
                          </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
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

    <div v-if="isGrantOpen" class="modal-overlay" @click.self="isGrantOpen = false">
      <div class="modal-box grant-modal">
        <div class="modal-header">
          <h2 class="modal-title">
            <div class="icon-wrap bg-blue-tint"><i class="mdi mdi-gift-outline text-blue"></i></div>
            연차 일괄 부여
          </h2>
          <button class="modal-close" @click="isGrantOpen = false">
            <i class="mdi mdi-close"></i>
          </button>
        </div>

        <div class="modal-body">
          <div class="modal-info-box">
            <i class="mdi mdi-information-outline"></i>
            <div>
              <span v-if="selectedQuota.length > 0" class="highlight-text">{{ selectedQuota.length }}명</span>
              <span v-else class="highlight-text">기록없는 직원 전체</span>
              에게 아래 설정으로 연차를 일괄 부여합니다.
            </div>
          </div>

          <div class="mform-layout">
            <div class="mform-group">
              <label>부여 연도</label>
              <select v-model.number="grantForm.year" class="m-input">
                <option v-for="y in yearRange" :key="y" :value="y">{{ y }}년</option>
              </select>
            </div>
            <div class="mform-group">
              <label>부여일 (기준일)</label>
              <input v-model="grantForm.grantDate" type="date" class="m-input" />
            </div>
            <div class="mform-group">
              <label>연차 개수 (일)</label>
              <div class="input-with-suffix">
                <input v-model.number="grantForm.totalCount" type="number" min="1" class="m-input text-right" />
                <span class="suffix">일</span>
              </div>
            </div>
            <div class="mform-group full-width">
              <label>비고 (선택)</label>
              <input v-model="grantForm.bigo" type="text" class="m-input" placeholder="연차 부여 관련 메모를 입력하세요" />
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" @click="isGrantOpen = false">취소</button>
          <button class="btn-confirm primary" @click="executeGrant" :disabled="isGranting">
            <i class="mdi mdi-check"></i> {{ isGranting ? '처리 중...' : '부여 실행' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="isSettleOpen" class="modal-overlay" @click.self="isSettleOpen = false">
      <div class="modal-box settle-modal">
        <div class="modal-header">
          <h2 class="modal-title">
            <div class="icon-wrap bg-green-tint"><i class="mdi mdi-cash-fast text-green"></i></div>
            연차 중간정산
            <span class="modal-name-chip">{{ settleTarget?.name }}</span>
          </h2>
          <button class="modal-close" @click="isSettleOpen = false">
            <i class="mdi mdi-close"></i>
          </button>
        </div>

        <div class="modal-body">
          <div class="settle-summary-box">
            <div class="ss-item">
              <span class="ss-label">현재 잔여 연차</span>
              <span class="day-badge remain">{{ formatDay(settleTarget?.remainDays) }}일</span>
            </div>
            <div class="ss-divider"><i class="mdi mdi-arrow-right"></i></div>
            <div class="ss-item">
              <span class="ss-label">정산 후 잔여</span>
              <span class="day-badge remain">
                {{ formatDay(Math.max(0, (settleTarget?.remainDays ?? 0) - settleForm.settleDays)) }}일
              </span>
            </div>
            <div class="ss-divider">=</div>
            <div class="ss-item">
              <span class="ss-label">예상 정산금액</span>
              <span class="settle-amount-preview">{{ fc(settleAmount) }}<small>원</small></span>
            </div>
          </div>

          <div class="mform-layout">
            <div class="mform-group">
              <label>정산 연차일수</label>
              <div class="input-with-suffix">
                <input v-model.number="settleForm.settleDays" type="number" step="0.5" min="0.5" class="m-input text-right highlight-input" />
                <span class="suffix">일</span>
              </div>
            </div>
            <div class="mform-group">
              <label>기본급</label>
              <div class="input-with-suffix">
                <input v-model.number="settleForm.basicWage" type="number" class="m-input text-right" />
                <span class="suffix">원</span>
              </div>
            </div>
            <div class="mform-group">
              <label>월 통상근로시간</label>
              <div class="input-with-suffix">
                <input v-model.number="settleForm.workhourMonth" type="number" class="m-input text-right" />
                <span class="suffix">시간</span>
              </div>
            </div>
            <div class="mform-group">
              <label>1일 근로시간</label>
              <div class="input-with-suffix">
                <input v-model.number="settleForm.workhourDay" type="number" class="m-input text-right" />
                <span class="suffix">시간</span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" @click="isSettleOpen = false">취소</button>
          <button class="btn-confirm success" @click="executeSettle" :disabled="isSettling">
            <i class="mdi mdi-check-circle-outline"></i> {{ isSettling ? '처리 중...' : '정산 확정' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
/**
 * work/annual — 연차 통합 관리
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
const formatDay   = (v) => Number(v || 0).toString() // 15.0 -> 15 깔끔하게 처리
const today       = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

const currentYear = new Date().getFullYear();
const yearRange = computed(() => {
  const years = [];
  for (let y = currentYear + 1; y >= 2010; y--) {
    years.push(y);
  }
  return years;
});

async function withLoading(loadingRef, fn) {
  loadingRef.value = true
  try   { await fn() }
  catch (e) { console.error(e); alert(e.response?.data?.message || '처리 중 오류가 발생했습니다.') }
  finally   { loadingRef.value = false }
}

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
  { id: 'quota',   icon: 'mdi-chart-donut',              name: '잔여 현황' },
]

const activeTab = ref('request')

async function changeTab(id) {
  activeTab.value = id
  if (id === 'quota') fetchQuotaList()
  else fetchRequests()
}

// ════════════════════════════════════════════════════════════
// 탭1 — 신청 관리
// ════════════════════════════════════════════════════════════
const reqFilter = ref({
  startDate: firstOfMonth(),
  endDate:   today(),
  sIdx:      '전체',
  status:    '전체',
  keyword:   '',
})

const currentPageReq = ref(1)
const pageSizeReq    = ref(50)

const isLoadingReq = ref(false)
const requests     = ref([])

const statsReq = computed(() => {
  const all = requests.value
  return {
    total:    all.length,
    pending:  all.filter(r => +r.status === 0).length,
    approved: all.filter(r => +r.status === 1).length,
    rejected: all.filter(r => +r.status === 2).length,
  }
})

const filteredReq = computed(() =>
    requests.value.filter(r => {
      const stOk = reqFilter.value.status === '전체' || r.status == reqFilter.value.status
      const sIdx = reqFilter.value.sIdx === '전체' || reqFilter.value.sIdx === '' || r.sIdx == reqFilter.value.sIdx
      const kwOk = (r.name || r.staff || '').includes(reqFilter.value.keyword)
      return stOk && kwOk && sIdx
    })
)

const pagedReq = computed(() => {
  const s = (currentPageReq.value - 1) * pageSizeReq.value
  return filteredReq.value.slice(s, s + pageSizeReq.value)
})

const selectAllReq = computed({
  get: () => pagedReq.value.length > 0 && pagedReq.value.filter(r => +r.status === 0).length > 0 && pagedReq.value.filter(r => +r.status === 0).every(r => r._selected),
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

// ★ 결재 처리 (승인/반려) - approverIdx 기록
async function updateStatus(idx, status) {
  const label = status === 1 ? '승인' : '반려'
  if (!confirm(`${label}하시겠습니까?`)) return
  await withLoading(isLoadingReq, async () => {
    const { data } = await axios.post('/api/v1/member/off/status', {
      idx,
      status,
      approverIdx: authStore.user?.[0]?.idx
    })
    if (!data.result) throw new Error('처리 실패')
    alert(`${label} 처리가 완료되었습니다.`)
    await fetchRequests()
  })
}

async function bulkUpdateStatus(status) {
  const targets = selectedReq.value
  if (!targets.length) { alert('선택된 항목이 없습니다.'); return }
  const label = status === 1 ? '승인' : '반려'
  if (!confirm(`선택한 ${targets.length}건을 일괄 ${label}하시겠습니까?`)) return

  await withLoading(isLoadingReq, async () => {
    const results = await Promise.allSettled(
        targets.map(r => axios.post('/api/v1/member/off/status', {
          idx: r.idx,
          status,
          approverIdx: authStore.user?.[0]?.idx
        }))
    )
    const success = results.filter(r => r.status === 'fulfilled').length
    const fail    = results.length - success
    alert(`${success}건 ${label} 완료` + (fail > 0 ? `, ${fail}건 실패` : ''))
    await fetchRequests()
  })
}

const STATUS_MAP = {
  0: { cls: 'status-pending',  text: '승인대기', icon: 'mdi-clock-outline'         },
  1: { cls: 'status-approved', text: '승인완료', icon: 'mdi-check-circle-outline'  },
  2: { cls: 'status-rejected', text: '반려됨',   icon: 'mdi-close-circle-outline'  },
  3: { cls: 'status-rejected', text: '사용취소', icon: 'mdi-cancel'  },
}
const statusInfo = (s) => STATUS_MAP[+s] ?? STATUS_MAP[0]

// ════════════════════════════════════════════════════════════
// 탭2 — 잔여 현황 (신규 DB 구조)
// ════════════════════════════════════════════════════════════
const quotaFilter = ref({ sIdx: '전체', keyword: '' })
const currentPageQuota = ref(1)
const pageSizeQuota    = ref(50)

const isLoadingQuota = ref(false)
const rawQuotaList   = ref([])

const expandedRows = ref([])
const toggleExpand = (mIdx) => {
  const index = expandedRows.value.indexOf(mIdx)
  if (index > -1) expandedRows.value.splice(index, 1)
  else expandedRows.value.push(mIdx)
}
const isExpanded = (mIdx) => expandedRows.value.includes(mIdx)

const aggregatedQuotaList = computed(() => {
  const userMap = new Map()

  rawQuotaList.value.forEach(item => {
    if (!userMap.has(item.mIdx)) {
      userMap.set(item.mIdx, {
        mIdx: item.mIdx,
        sIdx: item.sIdx,
        name: item.mName || item.name,
        role: item.role || item.mType,
        siteName: item.siteName,
        inDate: item.inDate,
        _selected: false,
        hasQuota: false,
        history: [],
        totalCountSum: 0,
        overCountSum: 0,
        usedCountSum: 0,
        payCountSum: 0,
      })
    }

    const user = userMap.get(item.mIdx)

    if (item.year) {
      user.hasQuota = true

      user.history.push({
        idx:        item.idx,
        year:       item.year,
        totalCount: Number(item.totalCount || 0),
        overCount:  Number(item.overCount || 0),
        usedCount:  Number(item.usedCount || 0),
        payCount:   Number(item.payCount || 0),
        // remainCount 컬럼 우선, 없으면 직접 계산
        remainDays: item.remainCount !== undefined
            ? Number(item.remainCount)
            : (Number(item.totalCount||0) + Number(item.overCount||0) - Number(item.usedCount||0) - Number(item.payCount||0))
      })

      user.totalCountSum += Number(item.totalCount || 0)
      user.overCountSum  += Number(item.overCount || 0)
      user.usedCountSum  += Number(item.usedCount || 0)
      user.payCountSum   += Number(item.payCount || 0)
    }
  })

  return Array.from(userMap.values()).map(user => {
    const totalGranted = user.totalCountSum + user.overCountSum
    const totalUsed    = user.usedCountSum + user.payCountSum
    const remainDays   = user.history.reduce((acc, cur) => acc + cur.remainDays, 0)
    const usageRate    = totalGranted > 0 ? Math.round((user.usedCountSum / totalGranted) * 100) : 0

    user.history.sort((a, b) => b.year - a.year)

    return { ...user, totalGranted, totalUsed, remainDays, usageRate }
  })
})

const quotaStats = computed(() => ({
  total:    aggregatedQuotaList.value.length,
  granted:  aggregatedQuotaList.value.reduce((s, i) => s + i.totalGranted, 0),
  used:     aggregatedQuotaList.value.reduce((s, i) => s + i.totalUsed, 0),
  remain:   aggregatedQuotaList.value.reduce((s, i) => s + i.remainDays, 0),
}))

const filteredQuota = computed(() =>
    aggregatedQuotaList.value.filter(i => {
      const sOk = quotaFilter.value.sIdx === '전체' || i.sIdx == quotaFilter.value.sIdx
      const kOk = !quotaFilter.value.keyword || (i.name || '').includes(quotaFilter.value.keyword)
      return sOk && kOk
    })
)

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
  await withLoading(isLoadingQuota, async () => {
    const { data } = await axios.get('/api/v1/member/annual/list')
    rawQuotaList.value = data.data || []
  })
}

// ════════════════════════════════════════════════════════════
// 필터 동기화
// ════════════════════════════════════════════════════════════
const syncFiltersFromURL = () => {
  const q = route.query;

  if (q.tab) activeTab.value = q.tab;

  if (q.reqStart)  reqFilter.value.startDate = q.reqStart;
  if (q.reqEnd)    reqFilter.value.endDate = q.reqEnd;
  if (q.reqSite)   reqFilter.value.sIdx = q.reqSite;
  if (q.reqStatus) reqFilter.value.status = q.reqStatus;
  if (q.reqKw)     reqFilter.value.keyword = q.reqKw;
  if (q.reqPage)   currentPageReq.value = Number(q.reqPage) || 1;
  if (q.reqSize)   pageSizeReq.value = Number(q.reqSize) || 50;

  if (q.qSite)     quotaFilter.value.sIdx = q.qSite;
  if (q.qKw)       quotaFilter.value.keyword = q.qKw;
  if (q.qPage)     currentPageQuota.value = Number(q.qPage) || 1;
  if (q.qSize)     pageSizeQuota.value = Number(q.qSize) || 50;
};

watch(
    [
      activeTab,
      () => reqFilter.value.startDate, () => reqFilter.value.endDate, () => reqFilter.value.sIdx, () => reqFilter.value.status, () => reqFilter.value.keyword,
      currentPageReq, pageSizeReq,
      () => quotaFilter.value.sIdx, () => quotaFilter.value.keyword,
      currentPageQuota, pageSizeQuota
    ],
    () => {
      const query = {};
      query.tab = activeTab.value;

      if (reqFilter.value.startDate) query.reqStart = reqFilter.value.startDate;
      if (reqFilter.value.endDate)   query.reqEnd = reqFilter.value.endDate;
      if (reqFilter.value.sIdx !== '전체') query.reqSite = reqFilter.value.sIdx;
      if (reqFilter.value.status !== '전체') query.reqStatus = reqFilter.value.status;
      if (reqFilter.value.keyword)   query.reqKw = reqFilter.value.keyword;
      if (currentPageReq.value !== 1) query.reqPage = currentPageReq.value;
      if (pageSizeReq.value !== 50)   query.reqSize = pageSizeReq.value;

      if (quotaFilter.value.sIdx !== '전체') query.qSite = quotaFilter.value.sIdx;
      if (quotaFilter.value.keyword) query.qKw = quotaFilter.value.keyword;
      if (currentPageQuota.value !== 1) query.qPage = currentPageQuota.value;
      if (pageSizeQuota.value !== 50)   query.qSize = pageSizeQuota.value;

      router.replace({ query });
    },
    { deep: true }
);

watch([() => quotaFilter.value.sIdx], () => {
  currentPageQuota.value = 1;
  fetchQuotaList();
});

watch([() => reqFilter.value.sIdx, () => reqFilter.value.status], () => {
  currentPageReq.value = 1;
});

// ════════════════════════════════════════════════════════════
// 모달 — 연차 일괄 부여
// ════════════════════════════════════════════════════════════
const isGrantOpen = ref(false)
const isGranting  = ref(false)

const GRANT_DEFAULTS = () => ({
  year:       currentYear,
  grantDate:  `${currentYear}-01-01`,
  totalCount: 15,
  bigo:       '',
})
const grantForm = ref(GRANT_DEFAULTS())

watch(() => grantForm.value.year, (y) => {
  grantForm.value.grantDate  = `${y}-01-01`
})

function openGrant() {
  grantForm.value = GRANT_DEFAULTS()
  isGrantOpen.value = true
}

async function executeGrant() {
  const targets = selectedQuota.value.length > 0
      ? selectedQuota.value
      : filteredQuota.value.filter(i => !i.hasQuota)

  if (!targets.length) { alert('부여 대상 직원이 없습니다.'); return }
  if (!confirm(`${grantForm.value.year}년 연차를 ${targets.length}명에게 부여하시겠습니까?`)) return

  await withLoading(isGranting, async () => {
    const results = await Promise.allSettled(
        targets.map(i =>
            axios.post('/api/v1/member/annual/register', {
              mIdx:       i.mIdx,
              sIdx:       i.sIdx,
              mName:      i.name,
              mType:      i.role,
              year:       grantForm.value.year,
              middleDt:   grantForm.value.grantDate,
              totalCount: grantForm.value.totalCount,
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
// 모달 — 연차 중간 정산 (offType: PAY)
// ════════════════════════════════════════════════════════════
const isSettleOpen  = ref(false)
const isSettling    = ref(false)
const settleTarget  = ref(null)

const SETTLE_DEFAULTS = (item = {}) => ({
  mIdx:          item.mIdx       ?? null,
  sIdx:          item.sIdx       ?? null,
  settleDays:    item.remainDays > 0 ? item.remainDays : 0,
  basicWage:     item.basicWage  ?? 0,
  workhourMonth: 209,
  workhourDay:   8,
  settleDate:    today(),
  note:          '',
})
const settleForm = ref(SETTLE_DEFAULTS())

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
  const { settleDays, settleDate, note, sIdx, mIdx } = settleForm.value
  if (settleDays <= 0) { alert('정산할 연차 일수를 입력해주세요.'); return }
  if (settleDays > settleTarget.value.remainDays) {
    alert(`잔여 연차(${settleTarget.value.remainDays}일)보다 많을 수 없습니다.`); return
  }
  if (!confirm(`${settleDays}일 → ${fc(settleAmount.value)}원으로 중간정산하시겠습니까?`)) return

  await withLoading(isSettling, async () => {
    await axios.post('/api/v1/member/off/request', {
      mIdx: mIdx,
      sIdx: sIdx,
      cIdx: cIdx,
      startDt: settleDate,
      endDt: settleDate,
      usedCount: settleDays,
      offType: 'PAY',
      payAmount: settleAmount.value,
      reason: note || '연차 중간정산 지급',
      status: 1, // 관리자 직권 정산이므로 즉시 승인(1)
      approverIdx: authStore.user?.[0]?.idx
    })
    alert('중간정산 처리가 완료되었습니다.')
    isSettleOpen.value = false
    await fetchQuotaList()
  })
}

// ────────────────────────────────────────────────────────────
// 라이프사이클
// ────────────────────────────────────────────────────────────
onMounted(async () => {
  syncFiltersFromURL()
  await fetchSiteOptions()
  if (activeTab.value === 'quota') await fetchQuotaList()
  else await fetchRequests()
})
</script>

<style scoped>
/* ──────────────────────────────────────────────────────────
   전체 공통 스타일
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
.action-bar-left { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.bulk-actions { display:flex; align-items:center; gap:8px; }
.page-size-select { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-sub); }
.date-range { display:flex; align-items:center; gap:8px; }

/* ── 버튼류 ── */
.btn-delete, .btn-save { display: flex; align-items: center; gap: 6px; padding: 0 20px; height: 38px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm); white-space: nowrap; }
.btn-delete { background: var(--bg-hover); color: var(--text-main); }
.btn-delete:hover { background: var(--border-focus); }
.btn-save { background: var(--primary); color: #fff; }
.btn-save:hover { background: var(--primary-hover); }

.action-buttons { display:flex; gap:5px; justify-content:center; }
.btn-approve, .btn-reject { display:flex; align-items:center; gap:4px; padding:5px 10px; border:none; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; transition:all .2s; font-family:inherit; }
.btn-approve { background:var(--success); color:#fff; }
.btn-approve:hover { background:var(--success-hover); }
.btn-reject  { background:var(--danger);  color:#fff; }
.btn-reject:hover  { filter:brightness(.9); }

/* ── 상태 배지 ── */
.status-badge { display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; }
.status-pending  { background:rgba(245,158,11,.1); color:var(--warning); }
.status-approved { background:rgba(16,185,129,.1);  color:var(--success); }
.status-rejected { background:rgba(239,68,68,.1);   color:var(--danger);  }

/* ── 체크박스 ── */
.cb-col { width:44px; }
.cb-placeholder { display:inline-block; width:16px; height:16px; }
.custom-cb { appearance:none; -webkit-appearance:none; width:16px; height:16px; border:2px solid var(--border-focus); border-radius:4px; cursor:pointer; position:relative; transition:all .15s; background:var(--bg-surface); margin:0; flex-shrink:0; vertical-align:middle; }
.custom-cb:hover   { border-color:var(--primary); }
.custom-cb:checked { border-color:var(--primary); background:var(--primary); }
.custom-cb:checked::after { content:''; position:absolute; top:1px; left:4px; width:4px; height:8px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }

/* ── 행 상태 ── */
.row-selected { background-color:var(--primary-soft) !important; }

/* ── 이름/연차 칩 ── */
.modal-name-chip { font-size:13px; font-weight:700; padding:2px 10px; background:var(--primary-soft); color:var(--primary); border-radius:6px; margin-left:6px; }
.day-chip { display:inline-flex; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:700; background:var(--bg-hover); color:var(--text-sub); }
.day-chip.used   { background:rgba(245,158,11,.1); color:var(--warning); }
.day-chip.remain { background:rgba(16,185,129,.1); color:var(--success); }
.day-chip.remain.low { background:rgba(239,68,68,.1); color:var(--danger); }

/* ── 사용률 바 ── */
.progress-wrap { display:flex; align-items:center; gap:6px; }
.progress-bar  { flex:1; height:6px; background:var(--bg-canvas); border-radius:3px; overflow:hidden; min-width:50px; }
.progress-fill { height:100%; background:var(--primary); border-radius:3px; transition:width .3s; }

/* ── 사유 셀 ── */
.reason-cell { max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* ── 테이블 스크롤 ── */
.table-scroll-container { overflow-x:auto; -webkit-overflow-scrolling:touch; }
.table-scroll-container::-webkit-scrollbar { height:6px; }
.table-scroll-container::-webkit-scrollbar-thumb { background:var(--border-focus); border-radius:3px; }

/* ── 스피너 ── */
.spinner { width:36px; height:36px; border:3px solid var(--bg-canvas); border-top-color:var(--primary); border-radius:50%; animation:spin 1s linear infinite; margin:0 auto 12px; }
@keyframes spin { to { transform:rotate(360deg); } }

/* ── 모달 공통 ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
.modal-box { background: var(--bg-surface); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); width: 100%; display: flex; flex-direction: column; overflow: hidden; animation: modal-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.grant-modal { max-width: 480px; }
.settle-modal { max-width: 540px; }
@keyframes modal-pop { 0% { opacity: 0; transform: scale(0.95) translateY(10px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas); }
.modal-title { font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 10px; margin: 0; }
.icon-wrap { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; font-size: 18px; }
.bg-blue-tint { background: rgba(37, 99, 235, 0.1); }
.text-blue { color: #2563eb; }
.bg-green-tint { background: rgba(16, 185, 129, 0.1); }
.text-green { color: #10b981; }
.modal-close { background: none; border: none; font-size: 22px; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 6px; transition: 0.2s; }
.modal-close:hover { background: var(--bg-hover); color: var(--danger); }
.modal-body { padding: 24px; background: var(--bg-canvas); }
.modal-info-box { display: flex; align-items: flex-start; gap: 10px; background: rgba(37, 99, 235, 0.05); border: 1px dashed rgba(37, 99, 235, 0.3); padding: 14px 18px; border-radius: 10px; font-size: 13.5px; color: var(--text-main); margin-bottom: 20px; line-height: 1.5; }
.modal-info-box i { font-size: 20px; color: #2563eb; margin-top: 2px; }
.highlight-text { font-weight: 800; color: #2563eb; font-size: 14.5px; }
.mform-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
.mform-group { display: flex; flex-direction: column; gap: 8px; }
.mform-group.full-width { grid-column: 1 / -1; }
.mform-group label { font-size: 12px; font-weight: 700; color: var(--text-sub); }
.m-input { width: 100%; padding: 10px 12px; border: 1px solid var(--border-focus); border-radius: 8px; font-size: 14px; color: var(--text-main); font-weight: 600; background: var(--bg-surface); transition: all 0.2s; box-sizing: border-box; }
.m-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); outline: none; }
.highlight-input { border-color: #10b981; color: #059669; }
.highlight-input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2); }
.input-with-suffix { position: relative; display: flex; align-items: center; }
.input-with-suffix .m-input { padding-right: 36px; }
.input-with-suffix .suffix { position: absolute; right: 12px; font-size: 13px; color: var(--text-muted); font-weight: 700; pointer-events: none; }
.modal-footer { padding: 16px 24px; display: flex; justify-content: flex-end; gap: 10px; background: var(--bg-surface); border-top: 1px solid var(--border-color); }
.btn-cancel, .btn-confirm { padding: 10px 20px; border-radius: 8px; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: 0.2s; border: none; display: flex; align-items: center; gap: 6px; }
.btn-cancel { background: var(--bg-hover); color: var(--text-sub); }
.btn-cancel:hover { background: var(--border-focus); color: var(--text-main); }
.btn-confirm.primary { background: var(--primary); color: #fff; box-shadow: 0 4px 6px rgba(37,99,235,0.2); }
.btn-confirm.primary:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-2px); box-shadow: 0 6px 12px rgba(37,99,235,0.3); }
.btn-confirm.success { background: var(--success); color: #fff; box-shadow: 0 4px 6px rgba(16,185,129,0.2); }
.btn-confirm.success:hover:not(:disabled) { background: var(--success-hover); transform: translateY(-2px); box-shadow: 0 6px 12px rgba(16,185,129,0.3); }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
.settle-summary-box { display: flex; align-items: center; justify-content: space-around; gap: 12px; padding: 16px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 20px; box-shadow: var(--shadow-sm); flex-wrap: wrap; }
.ss-item { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ss-label { font-size: 11.5px; color: var(--text-sub); font-weight: 600; }
.day-badge { padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 800; }
.day-badge.remain { background: rgba(16, 185, 129, 0.1); color: var(--success); }
.ss-divider { font-size: 20px; color: var(--border-focus); font-weight: bold; }
.settle-amount-preview { font-size: 22px; font-weight: 800; color: var(--primary); }
.settle-amount-preview small { font-size: 14px; color: var(--text-sub); font-weight: 600; margin-left: 2px; }

/* ──────────────────────────────────────────────────────────
   ★ 세련된 아코디언(상세보기) UI 스타일
──────────────────────────────────────────────────────────── */
.btn-toggle-details, .btn-detail {
  display: flex; align-items: center; gap: 4px; padding: 4px 10px;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-sub);
  cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm);
}
.btn-toggle-details:hover:not(:disabled), .btn-detail:hover:not(:disabled) {
  background: var(--bg-hover); color: var(--text-main); border-color: var(--border-focus);
}
.btn-toggle-details:disabled, .btn-detail:disabled {
  opacity: 0.4; cursor: not-allowed; box-shadow: none;
}

.row-expanded-main {
  background-color: var(--primary-soft) !important;
  border-bottom: none !important;
}

.expanded-row {
  background-color: #f8fafc; /* Tailwind slate-50 느낌 */
}
.expanded-row td {
  padding: 0 !important;
  border-bottom: 2px solid var(--border-color) !important;
}

.expanded-content {
  padding: 24px 32px;
  box-shadow: inset 0 4px 6px -4px rgba(0, 0, 0, 0.05);
  animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  overflow: hidden;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.history-header {
  display: flex; align-items: flex-end; justify-content: space-between;
  margin-bottom: 12px; max-width: 800px;
}
.history-title {
  margin: 0; font-size: 14px; font-weight: 700; color: var(--text-main);
  display: flex; align-items: center; gap: 6px; letter-spacing: -0.01em;
}
.history-title i { color: var(--primary); font-size: 18px; }
.history-desc { font-size: 12px; color: var(--text-muted); font-weight: 600; }

.sub-table-wrapper {
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.sub-table {
  width: 100%; border-collapse: collapse; text-align: center;
}
.sub-table th, .sub-table td {
  padding: 12px 16px; font-size: 13px;
}
.sub-table th {
  background-color: #f1f5f9;
  color: var(--text-sub); font-weight: 700; font-size: 12px;
  border-bottom: 1px solid var(--border-color);
}
.sub-table td {
  border-bottom: 1px solid var(--border-color);
  color: var(--text-main);
}
.sub-table tbody tr:last-child td { border-bottom: none; }
.sub-table tbody tr { transition: background-color 0.2s; }
.sub-table tbody tr:hover { background-color: #f8fafc; }

.text-main { color: var(--text-main); }
.year-badge {
  display: inline-block; padding: 4px 10px; background: #f1f5f9;
  border-radius: 6px; font-size: 12px; font-weight: 800; color: #475569;
}
.num-text { font-weight: 700; }

@media (max-width:768px) {
  .mform-layout { grid-template-columns: 1fr; }
  .settle-summary-box { justify-content: center; }
}
</style>
