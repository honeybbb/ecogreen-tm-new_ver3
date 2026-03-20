<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'nuxt/app'
import axios from 'axios'
import Pagination from '~/components/Pagination.vue'
import SiteSelect from "~/components/SiteSelect.vue";

const router = useRouter()

// ────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────
const EQUIP_CATEGORIES = [
  '청소기계 (탑승/보행)',
  '일반 청소용구',
  '경비/통신장비',
  '안전/제설장비',
  '기타',
]
const status = [
  { value: 'normal', label: '운영 정상',    color: 'success' },
  { value: 'check',  label: '수리/점검중',  color: 'warning' },
  { value: 'fault',  label: '고장/폐기대기', color: 'danger'  },
]
const equipStatusMap = Object.fromEntries(status.map(o => [o.value, o]))

const CATEGORY_ICONS = {
  '청소기계 (탑승/보행)': 'mdi-car-wash',
  '일반 청소용구':        'mdi-vacuum',
  '경비/통신장비':        'mdi-radio-handheld',
  '안전/제설장비':        'mdi-hard-hat',
  '기타':                 'mdi-toolbox-outline',
}
const getEquipIcon  = (cat) => CATEGORY_ICONS[cat] || 'mdi-cog-outline'
const isOverdue     = (d)   => !!d && new Date(d) < new Date()

// ────────────────────────────────────────────────────────────
// API / 현장 옵션
// ────────────────────────────────────────────────────────────
const { siteOptions, fetchSiteOptions } = useApi()

// ────────────────────────────────────────────────────────────
// 더미 데이터
// ────────────────────────────────────────────────────────────
const equipmentList = ref([
  {
    idx: 1, category: '청소기계 (탑승/보행)', name: '탑승식 습식 바닥세정기',
    model: 'T-1000', totalQty: 5, purchaseDate: '2023-01-10', price: 2500000,
    isExpanded: false,
    distributions: [
      { idx: 101, sIdx: 1, siteName: 'LH 위례 6단지',  qty: 2, status: 'normal', assignDate: '2023-05-10', nextCheckDate: '2024-11-10', note: '배터리 상태 양호' },
      { idx: 102, sIdx: 2, siteName: '강서 대명 강동',  qty: 1, status: 'check',  assignDate: '2023-06-01', nextCheckDate: '2024-05-01', note: '브러시 교체 대기' },
    ],
  },
  {
    idx: 2, category: '경비/통신장비', name: '업무용 무전기 (디지털)',
    model: 'RAD-200', totalQty: 20, purchaseDate: '2022-11-01', price: 150000,
    isExpanded: false,
    distributions: [
      { idx: 103, sIdx: 1, siteName: 'LH 위례 6단지',   qty: 10, status: 'normal', assignDate: '2023-01-15', nextCheckDate: '2024-12-01', note: '' },
      { idx: 104, sIdx: 3, siteName: '판교 테크노밸리', qty: 5,  status: 'fault',  assignDate: '2023-02-20', nextCheckDate: '2023-10-01', note: '3대 통신 불량, 2대 파손 (본사 입고 예정)' },
      { idx: 105, sIdx: 4, siteName: '수원 광교 A블록', qty: 2,  status: 'normal', assignDate: '2023-03-01', nextCheckDate: '2024-11-15', note: '' },
      { idx: 106, sIdx: 5, siteName: '인천 송도 2단지', qty: 3,  status: 'check',  assignDate: '2023-04-10', nextCheckDate: '2024-07-01', note: '배터리 불량 2대' },
    ],
  },
  {
    idx: 3, category: '일반 청소용구', name: '건습식 진공청소기',
    model: 'VC-PRO', totalQty: 10, purchaseDate: '2024-02-01', price: 300000,
    isExpanded: false,
    distributions: [],
  },
  {
    idx: 4, category: '안전/제설장비', name: '제설기 (소형)',
    model: 'SN-100', totalQty: 8, purchaseDate: '2023-10-15', price: 500000,
    isExpanded: false,
    distributions: [
      { idx: 107, sIdx: 1, siteName: 'LH 위례 6단지',  qty: 2, status: 'normal', assignDate: '2023-11-01', nextCheckDate: '2025-01-15', note: '' },
      { idx: 108, sIdx: 2, siteName: '강서 대명 강동',  qty: 2, status: 'normal', assignDate: '2023-11-01', nextCheckDate: '2025-01-15', note: '' },
    ],
  },
])

// ────────────────────────────────────────────────────────────
// 수량 헬퍼
// ────────────────────────────────────────────────────────────
const assignedQty = (e) => e.distributions.reduce((s, d) => s + d.qty, 0)
const remainQty   = (e) => e.totalQty - assignedQty(e)
const faultQty    = (e) => e.distributions.filter(d => d.status === 'fault').reduce((s, d) => s + d.qty, 0)
const assignRate  = (e) => e.totalQty > 0 ? Math.round((assignedQty(e) / e.totalQty) * 100) : 0

// ────────────────────────────────────────────────────────────
// 통계
// ────────────────────────────────────────────────────────────
const stats = computed(() => {
  let totalQty = 0, normalQty = 0, checkQty = 0, faultQtySum = 0
  equipmentList.value.forEach(e => {
    totalQty += e.totalQty
    e.distributions.forEach(d => {
      if (d.status === 'normal') normalQty   += d.qty
      if (d.status === 'check')  checkQty    += d.qty
      if (d.status === 'fault')  faultQtySum += d.qty
    })
    normalQty += Math.max(0, remainQty(e))
  })
  return { totalKinds: equipmentList.value.length, totalQty, normalQty, checkQty, faultQty: faultQtySum }
})

// ────────────────────────────────────────────────────────────
// 필터
// ────────────────────────────────────────────────────────────
const searchTerm       = ref('')
const selectedSite     = ref('전체')
const selectedCategory = ref('전체')
const selectedStatus   = ref('전체')
const isLoading        = ref(false)

const filteredList = computed(() =>
    equipmentList.value.filter(e => {
      const catOk    = selectedCategory.value === '전체' || e.category === selectedCategory.value
      const searchOk = e.name.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
          e.model.toLowerCase().includes(searchTerm.value.toLowerCase())
      const siteOk   = selectedSite.value === '전체' ||
          e.distributions.some(d => d.siteName === selectedSite.value)
      const statusOk = selectedStatus.value === '전체' ||
          e.distributions.some(d => d.status === selectedStatus.value) ||
          (selectedStatus.value === 'normal' && remainQty(e) > 0)
      return catOk && searchOk && siteOk && statusOk
    })
)

function resetFilters() {
  searchTerm.value       = ''
  selectedSite.value     = '전체'
  selectedCategory.value = '전체'
  selectedStatus.value   = '전체'
  currentPage.value      = 1
}

// 필터 변경 시 페이지 리셋
watch([searchTerm, selectedSite, selectedCategory, selectedStatus], () => {
  currentPage.value = 1
})

// ────────────────────────────────────────────────────────────
// 페이지네이션
// ────────────────────────────────────────────────────────────
const currentPage     = ref(1)
const pageSize        = ref(10)
const pageSizeOptions = [50, 100, 200, 500];

const pagedList = computed(() => {
  const s = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(s, s + pageSize.value)
})

function handlePageChange() {
  document.querySelector('.equip-list-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ────────────────────────────────────────────────────────────
// 아코디언
// ────────────────────────────────────────────────────────────
function toggleDetail(idx) {
  const e = equipmentList.value.find(e => e.idx === idx)
  if (e) e.isExpanded = !e.isExpanded
}

// ────────────────────────────────────────────────────────────
// 배치 수정 모달
// ────────────────────────────────────────────────────────────
const isEditOpen   = ref(false)
const editTarget   = ref(null)
const editForm     = ref({})

function openEditDist(equip, dist) {
  editTarget.value = { equipIdx: equip.idx, distIdx: dist.idx }
  editForm.value   = { ...dist }
  isEditOpen.value = true
}
function saveEdit() {
  const equip = equipmentList.value.find(e => e.idx === editTarget.value.equipIdx)
  if (!equip) return
  const i = equip.distributions.findIndex(d => d.idx === editTarget.value.distIdx)
  if (i !== -1) equip.distributions[i] = { ...editForm.value }
  isEditOpen.value = false
}

// ────────────────────────────────────────────────────────────
// 현장 배치 추가 모달
// ────────────────────────────────────────────────────────────
const isDistOpen         = ref(false)
const selectedEquipForDist = ref(null)
const distForm           = ref({
  siteName: '', qty: 1,
  assignDate: new Date().toISOString().slice(0, 10),
  nextCheckDate: '', note: '',
})

function openDistModal(equip) {
  if (remainQty(equip) <= 0) { alert('본사 창고에 남은 잔여 수량이 없습니다.'); return }
  selectedEquipForDist.value = equip
  distForm.value = {
    siteName: '', qty: 1,
    assignDate: new Date().toISOString().slice(0, 10),
    nextCheckDate: '', note: '',
  }
  isDistOpen.value = true
}
function saveDist() {
  if (!distForm.value.siteName || distForm.value.qty < 1) {
    alert('배치할 현장과 수량을 입력해주세요.'); return
  }
  const equip = equipmentList.value.find(e => e.idx === selectedEquipForDist.value.idx)
  if (!equip) return
  equip.distributions.push({
    idx:           Date.now(),
    sIdx:          Date.now(),
    siteName:      distForm.value.siteName,
    qty:           Number(distForm.value.qty),
    status:        'normal',
    assignDate:    distForm.value.assignDate,
    nextCheckDate: distForm.value.nextCheckDate,
    note:          distForm.value.note,
  })
  isDistOpen.value = false
}

// ────────────────────────────────────────────────────────────
// 본사 회수
// ────────────────────────────────────────────────────────────
function returnToHQ(equipIdx, distIdx) {
  if (!confirm('이 장비를 본사로 회수(배치 해제) 하시겠습니까?')) return
  const equip = equipmentList.value.find(e => e.idx === equipIdx)
  if (equip) equip.distributions = equip.distributions.filter(d => d.idx !== distIdx)
}

onMounted(() => { fetchSiteOptions() })
</script>

<template>
  <div class="equipment-list-page">

    <!-- ── 헤더 ── -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-toolbox"></i> 장비 및 재고 관리</h1>
        <p class="page-subtitle">본사 자산 기준 장비 마스터와 각 현장의 배치 현황을 관리합니다.</p>
      </div>
      <div class="header-actions">
        <button @click="router.push('/equipment/register')" class="btn-add">
          <i class="mdi mdi-plus-box"></i> 신규 장비 구매/등록
        </button>
      </div>
    </div>

    <!-- ── 통계 카드 ── -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color:var(--primary);--card-bg:var(--primary-soft)">
        <div class="stat-icon"><i class="mdi mdi-car-wash"></i></div>
        <div class="stat-content">
          <span class="stat-label">총 보유 장비</span>
          <span class="stat-value">{{ stats.totalQty }}<small>대 ({{ stats.totalKinds }}종)</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--success);--card-bg:rgba(16,185,129,.1)">
        <div class="stat-icon"><i class="mdi mdi-check-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">운영 정상 (잔여 포함)</span>
          <span class="stat-value text-green">{{ stats.normalQty }}<small>대</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--warning);--card-bg:rgba(245,158,11,.1)">
        <div class="stat-icon"><i class="mdi mdi-progress-wrench"></i></div>
        <div class="stat-content">
          <span class="stat-label">수리/점검중</span>
          <span class="stat-value text-orange">{{ stats.checkQty }}<small>대</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--danger);--card-bg:rgba(239,68,68,.1)">
        <div class="stat-icon"><i class="mdi mdi-alert-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">고장/폐기대기</span>
          <span class="stat-value text-red">{{ stats.faultQty }}<small>대</small></span>
        </div>
      </div>
    </div>

    <!-- ── 필터 ── -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-tag-outline"></i> 장비 분류</label>
          <select v-model="selectedCategory" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="cat in EQUIP_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-marker"></i> 배치 현장</label>
          <!--select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="s in siteOptions" :key="s.idx" :value="s.name">{{ s.name }}</option>
          </select-->
          <SiteSelect v-model="selectedSite" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-list-status"></i> 장비 상태</label>
          <select v-model="selectedStatus" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="s in status" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </div>
        <div class="search-group" style="flex:2">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                v-model="searchTerm" type="text"
                placeholder="장비명 또는 모델명 검색"
                class="search-input"
            />
            <button v-if="searchTerm" @click="resetFilters" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="resetFilters" class="btn-search" title="필터 초기화">
            <i class="mdi mdi-filter-off"></i><span>초기화</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ── 로딩 ── -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div><p>불러오는 중...</p>
    </div>

    <!-- ══════════════════════════════════════════════════════
         장비 목록 (아코디언 + 카드 그리드)
    ═══════════════════════════════════════════════════════ -->
    <div v-else class="table-card equip-list-wrap">

      <!-- 테이블 헤더 -->
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-toolbox-outline"></i>
          <span>장비 및 배치 현황 ({{ filteredList.length }}종)</span>
        </div>
        <div class="page-size-select">
          <label>페이지당</label>
          <select
              v-model="pageSize"
              @change="currentPage = 1"
              class="filter-select"
              style="height:32px;padding:4px 10px;font-size:12px;min-width:60px;"
          >
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <!-- 빈 상태 -->
      <div v-if="pagedList.length === 0" class="empty-state">
        <i class="mdi mdi-magnify-close"></i>
        <p>검색 조건에 맞는 장비가 없습니다.</p>
      </div>

      <!-- 장비 아이템 목록 -->
      <div
          v-for="equip in pagedList"
          :key="equip.idx"
          class="equip-item"
          :class="{ 'is-expanded': equip.isExpanded, 'has-fault': faultQty(equip) > 0 }"
      >

        <!-- ── 마스터 행 ── -->
        <div class="master-row" @click="toggleDetail(equip.idx)">

          <!-- 아이콘 -->
          <div class="master-icon">
            <i :class="['mdi', getEquipIcon(equip.category)]"></i>
          </div>

          <!-- 장비 정보 -->
          <div class="master-info">
            <div class="master-name-wrap">
              <span
                  class="master-name"
                  @click.stop="router.push(`/equipment/${equip.idx}`)"
              >{{ equip.name }}</span>
              <span class="master-model">({{ equip.model }})</span>
              <span class="cat-badge">{{ equip.category }}</span>
            </div>
            <!-- 배치율 바 -->
            <div class="assign-bar-wrap">
              <div class="assign-bar">
                <div
                    class="assign-bar-fill"
                    :style="{ width: assignRate(equip) + '%' }"
                    :class="{
                    'bar-empty':   assignRate(equip) === 0,
                    'bar-partial': assignRate(equip) > 0 && assignRate(equip) < 100,
                    'bar-full':    assignRate(equip) === 100,
                  }"
                ></div>
              </div>
              <span class="assign-bar-label">
                현장 배치 {{ assignRate(equip) }}%
                ({{ assignedQty(equip) }} / {{ equip.totalQty }}대)
              </span>
            </div>
          </div>

          <!-- 우측 수량 뱃지 + 토글 -->
          <div class="master-right">
            <div class="qty-badges">
              <span class="qty-badge badge-total">총 {{ equip.totalQty }}대</span>
              <span
                  class="qty-badge"
                  :class="remainQty(equip) === 0 ? 'badge-empty' : 'badge-remain'"
              >잔여 {{ remainQty(equip) }}대</span>
              <span v-if="faultQty(equip) > 0" class="qty-badge badge-fault">
                <i class="mdi mdi-alert"></i> 고장 {{ faultQty(equip) }}대
              </span>
            </div>
            <div class="toggle-btn" :class="{ 'toggle-open': equip.isExpanded }">
              <i class="mdi mdi-chevron-down"></i>
            </div>
          </div>
        </div>

        <!-- ── 펼쳐진 배치 상세 (카드 그리드) ── -->
        <transition name="accordion">
          <div v-if="equip.isExpanded" class="dist-panel">

            <!-- 패널 헤더 -->
            <div class="dist-panel-header">
              <div class="dist-panel-title">
                <i class="mdi mdi-map-marker-multiple-outline"></i>
                현장별 배치 상세 현황
                <span class="dist-count-badge">{{ equip.distributions.length }}개 현장</span>
              </div>
              <button
                  class="btn-add-dist"
                  :disabled="remainQty(equip) <= 0"
                  @click.stop="openDistModal(equip)"
              >
                <i class="mdi mdi-truck-delivery-outline"></i>
                현장 배치 추가
                <span v-if="remainQty(equip) > 0" class="remain-hint">
                  (잔여 {{ remainQty(equip) }}대)
                </span>
              </button>
            </div>

            <!-- 배치 카드 그리드 -->
            <div class="dist-grid">

              <!-- 현장 없을 때 -->
              <div v-if="equip.distributions.length === 0" class="dist-empty">
                <i class="mdi mdi-package-variant-closed"></i>
                <p>현재 현장에 배치된 내역이 없습니다.<br>모두 본사 창고에 보관 중입니다.</p>
              </div>

              <!-- 현장 카드 -->
              <div
                  v-for="dist in equip.distributions"
                  :key="dist.idx"
                  class="dist-card"
                  :class="{
                  'dist-card--check': dist.status === 'check',
                  'dist-card--fault': dist.status === 'fault',
                }"
              >
                <!-- 카드 헤더 -->
                <div class="dist-card-head">
                  <span class="dist-site">
                    <i class="mdi mdi-office-building-marker"></i>
                    {{ dist.siteName }}
                  </span>
                  <div class="dist-actions">
                    <button
                        class="icon-btn icon-btn--blue"
                        title="배치 정보 수정"
                        @click.stop="openEditDist(equip, dist)"
                    ><i class="mdi mdi-pencil-outline"></i></button>
                    <button
                        class="icon-btn icon-btn--red"
                        title="본사 회수"
                        @click.stop="returnToHQ(equip.idx, dist.idx)"
                    ><i class="mdi mdi-arrow-u-left-top"></i></button>
                  </div>
                </div>

                <!-- 카드 본문 -->
                <div class="dist-card-body">
                  <div class="dist-row">
                    <span class="dist-label">배치 수량</span>
                    <span class="dist-val fw-bold">{{ dist.qty }}대</span>
                  </div>
                  <div class="dist-row">
                    <span class="dist-label">현재 상태</span>
                    <span :class="['dist-status', `dist-${equipStatusMap[dist.status].color}`]">
                      {{ equipStatusMap[dist.status].label }}
                    </span>
                  </div>
                  <div class="dist-row">
                    <span class="dist-label">배치일</span>
                    <span class="dist-val">{{ dist.assignDate }}</span>
                  </div>
                  <div class="dist-row">
                    <span class="dist-label">다음 점검</span>
                    <span class="dist-val" :class="{ 'overdue': isOverdue(dist.nextCheckDate) }">
                      {{ dist.nextCheckDate || '—' }}
                      <span v-if="isOverdue(dist.nextCheckDate)" class="overdue-badge">초과</span>
                    </span>
                  </div>
                  <div v-if="dist.note" class="dist-note">
                    <i class="mdi mdi-note-text-outline"></i>{{ dist.note }}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </transition>
      </div>

      <!-- 페이지네이션 -->
      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredList.length"
          @change="handlePageChange"
      />

    </div>


    <!-- ════ 배치 수정 모달 ════ -->
    <div v-if="isEditOpen" class="modal-overlay" @click.self="isEditOpen = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3><i class="mdi mdi-pencil-outline"></i> 배치 정보 수정</h3>
          <button class="modal-close" @click="isEditOpen = false"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="mform-item">
            <label>배치 현장</label>
            <input :value="editForm.siteName" disabled class="info-input" />
          </div>
          <div class="mform-grid">
            <div class="mform-item required">
              <label>배치 수량</label>
              <input v-model.number="editForm.qty" type="number" min="1" class="info-input" />
            </div>
            <div class="mform-item required">
              <label>장비 상태</label>
              <select v-model="editForm.status" class="info-select">
                <option v-for="s in status" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
          </div>
          <div class="mform-item">
            <label>다음 점검 예정일</label>
            <input v-model="editForm.nextCheckDate" type="date" class="info-input" />
          </div>
          <div class="mform-item">
            <label>비고</label>
            <textarea v-model="editForm.note" class="info-textarea" rows="3" placeholder="수리 내역, 특이사항 등"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="isEditOpen = false">취소</button>
          <button class="btn-save" @click="saveEdit"><i class="mdi mdi-check"></i> 저장</button>
        </div>
      </div>
    </div>


    <!-- ════ 현장 배치 추가 모달 ════ -->
    <div v-if="isDistOpen" class="modal-overlay" @click.self="isDistOpen = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3><i class="mdi mdi-truck-delivery-outline"></i> 현장 장비 배치</h3>
          <button class="modal-close" @click="isDistOpen = false"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <!-- 대상 장비 요약 -->
          <div class="dist-target-info">
            <span class="cat-badge">{{ selectedEquipForDist?.category }}</span>
            <h4>{{ selectedEquipForDist?.name }}
              <small style="font-weight:400;color:var(--text-sub);">
                ({{ selectedEquipForDist?.model }})
              </small>
            </h4>
            <p class="remain-text">
              배분 가능 잔여 수량:
              <strong>{{ selectedEquipForDist ? remainQty(selectedEquipForDist) : 0 }}대</strong>
            </p>
          </div>

          <div class="mform-item required mt-3">
            <label>배치할 현장</label>
            <select v-model="distForm.siteName" class="info-select">
              <option value="">현장 선택</option>
              <option v-for="s in siteOptions" :key="s.idx" :value="s.name">{{ s.name }}</option>
            </select>
          </div>
          <div class="mform-grid">
            <div class="mform-item required">
              <label>배치 수량 (대)</label>
              <input
                  v-model.number="distForm.qty"
                  type="number" min="1"
                  :max="selectedEquipForDist ? remainQty(selectedEquipForDist) : 1"
                  class="info-input"
              />
            </div>
            <div class="mform-item required">
              <label>배치 일자</label>
              <input v-model="distForm.assignDate" type="date" class="info-input" />
            </div>
          </div>
          <div class="mform-item">
            <label>다음 점검 예정일</label>
            <input v-model="distForm.nextCheckDate" type="date" class="info-input" />
          </div>
          <div class="mform-item">
            <label>특이사항</label>
            <textarea v-model="distForm.note" class="info-textarea" rows="2" placeholder="배치 시 전달사항 등"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="isDistOpen = false">취소</button>
          <button class="btn-save" @click="saveDist">
            <i class="mdi mdi-check"></i> 배치 완료
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ──────────────────────────────────────────────────────
   공통 CSS(global.css) 변수 그대로 사용
   이 파일은 페이지 전용 스타일만 작성
────────────────────────────────────────────────────── */

/* ── 헤더 ── */
.header-actions { display:flex; gap:10px; }

/* ── 페이지 사이즈 ── */
.page-size-select {
  display:flex; align-items:center; gap:8px;
  font-size:12px; color:var(--text-sub);
}

/* ════════════════════════════════════════════════════
   장비 리스트 래퍼
════════════════════════════════════════════════════ */
.equip-list-wrap { overflow: hidden; }

/* ── 장비 아이템 컨테이너 ── */
.equip-item {
  border-bottom: 1px solid var(--border-color);
  transition: background .15s;
}
.equip-item:last-of-type { border-bottom: none; }
/* 고장 있는 장비: 좌측 빨간 테두리 */
.equip-item.has-fault:not(.is-expanded) {
  border-left: 3px solid rgba(239,68,68,.4);
}
.equip-item.is-expanded {
  border-left: 3px solid var(--primary);
  background: rgba(37,99,235,.02);
}

/* ── 마스터 행 ── */
.master-row {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 20px; cursor: pointer; transition: background .15s;
}
.master-row:hover { background: var(--primary-soft); }

.master-icon {
  width: 42px; height: 42px; flex-shrink: 0;
  border-radius: 10px; background: var(--bg-canvas);
  border: 1px solid var(--border-color);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; color: var(--primary);
  transition: all .2s;
}
.is-expanded .master-row .master-icon {
  background: var(--primary); color: #fff; border-color: var(--primary);
}

.master-info { flex: 1; min-width: 0; }
.master-name-wrap {
  display: flex; align-items: baseline; gap: 6px;
  margin-bottom: 8px; flex-wrap: wrap;
}
.master-name {
  font-size: 15px; font-weight: 700; color: var(--text-main);
  cursor: pointer; letter-spacing: -.02em;
  transition: color .15s;
}
.master-name:hover { color: var(--primary); }
.master-model { font-size: 12px; color: var(--text-sub); }
.cat-badge {
  font-size: 10px; padding: 2px 8px;
  background: var(--bg-canvas); border: 1px solid var(--border-color);
  border-radius: 4px; color: var(--text-sub);
}

/* 배치율 바 */
.assign-bar-wrap { display: flex; align-items: center; gap: 10px; }
.assign-bar {
  flex: 1; max-width: 200px; height: 5px;
  background: var(--border-color); border-radius: 3px; overflow: hidden;
}
.assign-bar-fill { height: 100%; border-radius: 3px; transition: width .4s; }
.bar-empty   { background: var(--border-color); }
.bar-partial { background: var(--primary); }
.bar-full    { background: var(--success); }
.assign-bar-label { font-size: 11px; color: var(--text-sub); white-space: nowrap; }

/* 우측 수량 뱃지 + 토글 */
.master-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.qty-badges   { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.qty-badge {
  font-size: 10px; font-weight: 700; padding: 3px 9px;
  border-radius: 10px; white-space: nowrap;
}
.badge-total  { background: var(--bg-canvas); color: var(--text-sub); border: 1px solid var(--border-color); }
.badge-remain { background: rgba(5,150,105,.1); color: var(--success); }
.badge-empty  { background: rgba(239,68,68,.1); color: var(--danger); }
.badge-fault  { background: rgba(239,68,68,.1); color: var(--danger); display:inline-flex; align-items:center; gap:3px; }
.badge-fault i { font-size: 11px; }

.toggle-btn {
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--bg-canvas); border: 1px solid var(--border-color);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: var(--text-sub); transition: all .2s; flex-shrink: 0;
}
.is-expanded .toggle-btn { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.toggle-btn.toggle-open i { transform: rotate(180deg); }
.toggle-btn i { transition: transform .25s; }

/* ════════════════════════════════════════════════════
   배치 상세 패널 (카드 그리드)
════════════════════════════════════════════════════ */

/* 아코디언 트랜지션 */
.accordion-enter-active { transition: all .28s ease; }
.accordion-leave-active { transition: all .22s ease; }
.accordion-enter-from,
.accordion-leave-to     { opacity: 0; transform: translateY(-8px); }

.dist-panel {
  background: var(--bg-canvas);
  border-top: 1px solid var(--border-color);
  padding: 20px 20px 24px;
}

/* 패널 헤더 */
.dist-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; flex-wrap: wrap; gap: 10px;
}
.dist-panel-title {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 700; color: var(--text-main);
}
.dist-panel-title i { font-size: 17px; color: var(--primary); }
.dist-count-badge {
  font-size: 11px; padding: 2px 8px;
  background: var(--primary-soft); color: var(--primary);
  border-radius: 10px; font-weight: 700;
}

.btn-add-dist {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border: none; border-radius: 8px;
  background: var(--primary); color: #fff;
  font-size: 12px; font-weight: 700; cursor: pointer;
  transition: all .2s; font-family: inherit;
}
.btn-add-dist:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
.btn-add-dist:disabled { opacity: .45; cursor: not-allowed; }
.remain-hint { font-size: 11px; opacity: .85; }

/* 카드 그리드 — 핵심! 현장 수에 따라 자동 확장 */
.dist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

/* 빈 상태 */
.dist-empty {
  grid-column: 1 / -1;
  padding: 28px; text-align: center;
  color: var(--text-sub); font-size: 12px; line-height: 1.7;
  background: var(--bg-surface); border-radius: 8px;
  border: 1px dashed var(--border-color);
}
.dist-empty i { font-size: 30px; display: block; margin-bottom: 8px; opacity: .3; }

/* ── 현장 배치 카드 ── */
.dist-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px; overflow: hidden;
  transition: box-shadow .15s;
}
.dist-card:hover { box-shadow: var(--shadow-md); }
/* 상태별 왼쪽 테두리 강조 */
.dist-card--check { border-left: 3px solid var(--warning); }
.dist-card--fault { border-left: 3px solid var(--danger); }

.dist-card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-canvas);
}
.dist-site {
  font-size: 13px; font-weight: 700; color: var(--text-main);
  display: flex; align-items: center; gap: 5px;
}
.dist-site i { font-size: 15px; color: var(--primary); }
.dist-actions { display: flex; gap: 5px; }

.dist-card-body {
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 7px;
}
.dist-row {
  display: flex; justify-content: space-between;
  align-items: center; font-size: 12px;
}
.dist-label { color: var(--text-sub); }
.dist-val   { color: var(--text-main); font-weight: 500; }
.fw-bold    { font-weight: 700; }

.overdue       { color: var(--danger); font-weight: 700; }
.overdue-badge {
  font-size: 10px; padding: 1px 5px;
  background: rgba(239,68,68,.1); color: var(--danger);
  border-radius: 4px; margin-left: 4px; font-weight: 700;
}
.dist-note {
  font-size: 11px; color: var(--text-sub); line-height: 1.5;
  background: var(--bg-hover); border-radius: 5px;
  padding: 6px 8px; display: flex; gap: 5px; align-items: flex-start;
  border-left: 2px solid var(--border-focus);
  margin-top: 2px;
}
.dist-note i { font-size: 13px; flex-shrink: 0; margin-top: 1px; }

/* 상태 배지 */
.dist-status { padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.dist-success { background: rgba(5,150,105,.1);  color: var(--success); }
.dist-warning { background: rgba(245,158,11,.1); color: var(--warning); }
.dist-danger  { background: rgba(239,68,68,.1);  color: var(--danger);  }

/* ── 아이콘 버튼 ── */
.icon-btn {
  width: 27px; height: 27px; border-radius: 6px;
  border: 1px solid var(--border-color); background: var(--bg-surface);
  color: var(--text-sub); display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .15s; font-size: 14px;
}
.icon-btn--blue { color: var(--primary); background: var(--primary-soft); border-color: rgba(37,99,235,.25); }
.icon-btn--blue:hover { background: var(--primary); color: #fff; }
.icon-btn--red  { color: var(--danger); background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.25); }
.icon-btn--red:hover { background: var(--danger); color: #fff; }

/* ── 모달 ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15,23,42,.6);
  backdrop-filter: blur(2px); display: flex; align-items: center;
  justify-content: center; z-index: 2000; padding: 20px;
}
.modal-box {
  background: var(--bg-surface); border-radius: 14px;
  box-shadow: 0 20px 50px rgba(0,0,0,.15);
  width: 100%; max-width: 500px; max-height: 90vh;
  display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--border-color);
  animation: slidein .22s ease;
}
@keyframes slidein {
  from { opacity:0; transform:translateY(12px) scale(.97); }
  to   { opacity:1; transform:translateY(0) scale(1); }
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px; border-bottom: 1px solid var(--border-color);
}
.modal-header h3 {
  font-size: 16px; font-weight: 800; color: var(--text-main);
  margin: 0; display: flex; align-items: center; gap: 8px; letter-spacing: -.03em;
}
.modal-header h3 i { color: var(--primary); font-size: 19px; }
.modal-close {
  width: 30px; height: 30px; border-radius: 7px;
  background: var(--bg-canvas); border: 1px solid var(--border-color);
  color: var(--text-sub); cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 17px;
}
.modal-close:hover { color: var(--danger); }
.modal-body {
  flex: 1; overflow-y: auto; padding: 20px 22px;
  display: flex; flex-direction: column; gap: 14px;
  background: var(--bg-canvas);
}
.modal-body::-webkit-scrollbar { width: 4px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 2px; }
.modal-footer {
  padding: 14px 22px; border-top: 1px solid var(--border-color);
  display: flex; justify-content: flex-end; gap: 10px;
  background: var(--bg-surface);
}
.mform-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mform-item { display: flex; flex-direction: column; gap: 5px; }
.mform-item label {
  font-size: 11px; font-weight: 700; color: var(--text-sub);
  text-transform: uppercase; letter-spacing: .04em;
}
.mform-item.required label::after { content: '*'; color: var(--danger); margin-left: 3px; }
.info-input, .info-select, .info-textarea {
  width: 100%; padding: 9px 11px; border: 1px solid var(--border-color);
  border-radius: 7px; font-size: 13px; color: var(--text-main);
  background: var(--bg-surface); box-sizing: border-box; font-family: inherit;
}
.info-input:focus, .info-select:focus, .info-textarea:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.info-input:disabled { background: var(--bg-canvas); color: var(--text-sub); }

.dist-target-info {
  background: var(--bg-surface); padding: 14px;
  border-radius: 8px; border: 1px solid var(--border-color);
}
.dist-target-info h4 {
  margin: 8px 0 4px; font-size: 14px; color: var(--text-main); font-weight: 700;
}
.remain-text { margin: 0; font-size: 12px; color: var(--text-sub); }
.remain-text strong { color: var(--primary); font-size: 14px; font-weight: 800; }

.btn-cancel {
  padding: 9px 18px; background: var(--text-sub); color: #fff;
  border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: all .2s; font-family: inherit;
}
.btn-cancel:hover { background: var(--text-main); }
.btn-save {
  padding: 9px 18px; background: var(--primary); color: #fff;
  border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: all .2s; font-family: inherit;
  display: flex; align-items: center; gap: 5px;
}
.btn-save:hover { background: var(--primary-hover); transform: translateY(-1px); }

/* ── 유틸 ── */
.mt-3       { margin-top: 12px; }
.text-green { color: var(--success); }
.text-orange{ color: var(--warning); }
.text-red   { color: var(--danger);  }
.loading-state { display:flex; flex-direction:column; align-items:center; padding:60px; color:var(--text-sub); }
.spinner {
  width: 36px; height: 36px; border: 3px solid var(--bg-canvas);
  border-top-color: var(--primary); border-radius: 50%;
  animation: spin 1s linear infinite; margin-bottom: 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state {
  text-align: center; padding: 60px 20px; color: var(--text-muted);
}
.empty-state i { font-size: 44px; margin-bottom: 12px; opacity: .4; display: block; }

/* ── 반응형 ── */
@media (max-width: 768px) {
  .master-row { flex-wrap: wrap; gap: 10px; }
  .master-right { width: 100%; justify-content: flex-end; }
  .assign-bar { max-width: 120px; }
  .dist-grid { grid-template-columns: 1fr; }
  .mform-grid { grid-template-columns: 1fr; }
}
</style>
