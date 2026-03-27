<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'nuxt/app'
import axios from 'axios'
import Pagination from '~/components/Pagination.vue'
import SiteSelect from '~/components/SiteSelect.vue'

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
const EQUIP_STATUS_OPTIONS = [
  { value: 'normal', label: '운영 정상',    color: 'success' },
  { value: 'check',  label: '수리/점검중',  color: 'warning' },
  { value: 'fault',  label: '고장/폐기대기', color: 'danger'  },
]
const equipStatusMap = Object.fromEntries(EQUIP_STATUS_OPTIONS.map(o => [o.value, o]))

const CATEGORY_ICONS = {
  '청소기계 (탑승/보행)': 'mdi-car-wash',
  '일반 청소용구':        'mdi-vacuum',
  '경비/통신장비':        'mdi-radio-handheld',
  '안전/제설장비':        'mdi-hard-hat',
  '기타':                 'mdi-toolbox-outline',
}
const getEquipIcon = (cat) => CATEGORY_ICONS[cat] || 'mdi-cog-outline'
const isOverdue    = (d)   => !!d && new Date(d) < new Date()

// ────────────────────────────────────────────────────────────
// API / 현장 옵션
// ────────────────────────────────────────────────────────────
const { siteOptions, fetchSiteOptions } = useApi()

// ────────────────────────────────────────────────────────────
// 데이터
// ────────────────────────────────────────────────────────────
const isLoading    = ref(false)
const equipmentList = ref([
  {
    idx: 1, category: '청소기계 (탑승/보행)', name: '탑승식 습식 바닥세정기',
    model: 'T-1000', totalQty: 5, purchaseDate: '2023-01-10', price: 2500000,
    distributions: [
      { idx: 101, sIdx: 1, siteName: 'LH 위례 6단지',  qty: 2, status: 'normal', assignDate: '2023-05-10', nextCheckDate: '2024-11-10', note: '배터리 상태 양호' },
      { idx: 102, sIdx: 2, siteName: '강서 대명 강동',  qty: 1, status: 'check',  assignDate: '2023-06-01', nextCheckDate: '2024-05-01', note: '브러시 교체 대기' },
    ],
  },
  {
    idx: 2, category: '경비/통신장비', name: '업무용 무전기 (디지털)',
    model: 'RAD-200', totalQty: 20, purchaseDate: '2022-11-01', price: 150000,
    distributions: [
      { idx: 103, sIdx: 1, siteName: 'LH 위례 6단지',   qty: 10, status: 'normal', assignDate: '2023-01-15', nextCheckDate: '2024-12-01', note: '' },
      { idx: 104, sIdx: 3, siteName: '판교 테크노밸리',  qty: 5,  status: 'fault',  assignDate: '2023-02-20', nextCheckDate: '2023-10-01', note: '3대 통신 불량, 2대 파손' },
      { idx: 105, sIdx: 4, siteName: '수원 광교 A블록',  qty: 2,  status: 'normal', assignDate: '2023-03-01', nextCheckDate: '2024-11-15', note: '' },
      { idx: 106, sIdx: 5, siteName: '인천 송도 2단지',  qty: 3,  status: 'check',  assignDate: '2023-04-10', nextCheckDate: '2024-07-01', note: '배터리 불량 2대' },
    ],
  },
  {
    idx: 3, category: '일반 청소용구', name: '건습식 진공청소기',
    model: 'VC-PRO', totalQty: 10, purchaseDate: '2024-02-01', price: 300000,
    distributions: [],
  },
  {
    idx: 4, category: '안전/제설장비', name: '제설기 (소형)',
    model: 'SN-100', totalQty: 8, purchaseDate: '2023-10-15', price: 500000,
    distributions: [
      { idx: 107, sIdx: 1, siteName: 'LH 위례 6단지', qty: 2, status: 'normal', assignDate: '2023-11-01', nextCheckDate: '2025-01-15', note: '' },
      { idx: 108, sIdx: 2, siteName: '강서 대명 강동', qty: 2, status: 'normal', assignDate: '2023-11-01', nextCheckDate: '2025-01-15', note: '' },
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
      if (d.status === 'normal') normalQty    += d.qty
      if (d.status === 'check')  checkQty     += d.qty
      if (d.status === 'fault')  faultQtySum  += d.qty
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

const filteredList = computed(() =>
    equipmentList.value.filter(e => {
      const catOk    = selectedCategory.value === '전체' || e.category === selectedCategory.value
      const searchOk = e.name.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
          e.model.toLowerCase().includes(searchTerm.value.toLowerCase())
      // const siteOk   = selectedSite.value === '전체' ||
      //     e.distributions.some(d => d.siteName === selectedSite.value)
      const statusOk = selectedStatus.value === '전체' ||
          e.distributions.some(d => d.status === selectedStatus.value) ||
          (selectedStatus.value === 'normal' && remainQty(e) > 0)
      return catOk && searchOk && statusOk
    })
)

function resetFilters() {
  searchTerm.value       = ''
  selectedSite.value     = '전체'
  selectedCategory.value = '전체'
  selectedStatus.value   = '전체'
  currentPage.value      = 1
}

watch([searchTerm, selectedSite, selectedCategory, selectedStatus], () => {
  currentPage.value = 1
})

// ────────────────────────────────────────────────────────────
// 페이지네이션
// ────────────────────────────────────────────────────────────
const currentPage = ref(1)
const pageSize    = ref(10)

const pagedList = computed(() => {
  const s = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(s, s + pageSize.value)
})

function handlePageChange() {
  document.querySelector('.panel-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ────────────────────────────────────────────────────────────
// 우측 패널 — 선택된 장비
// ────────────────────────────────────────────────────────────
const selectedEquip = ref(null)

function selectEquip(equip) {
  // 같은 행 클릭 시 패널 닫기
  selectedEquip.value = selectedEquip.value?.idx === equip.idx ? null : equip
}

// 목록에서 실시간 반영된 equip 객체를 항상 최신으로 참조
const liveEquip = computed(() =>
    selectedEquip.value
        ? equipmentList.value.find(e => e.idx === selectedEquip.value.idx) ?? null
        : null
)

// 드로어 내 펼쳐진 현장 카드 idx
const expandedDistIdx = ref(null)

function toggleDistCard(distIdx) {
  expandedDistIdx.value = expandedDistIdx.value === distIdx ? null : distIdx
}

// 장비 선택 바뀌면 펼침 초기화
watch(selectedEquip, () => { expandedDistIdx.value = null })

// ────────────────────────────────────────────────────────────
// 배치 수정 모달
// ────────────────────────────────────────────────────────────
const isEditOpen = ref(false)
const editTarget = ref(null)
const editForm   = ref({})

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
const isDistOpen = ref(false)
const distForm   = ref({
  sIdx: null, siteName: '', qty: 1,
  assignDate: new Date().toISOString().slice(0, 10),
  nextCheckDate: '', note: '',
})

function openDistModal() {
  if (!liveEquip.value || remainQty(liveEquip.value) <= 0) {
    alert('본사 창고에 남은 잔여 수량이 없습니다.')
    return
  }
  distForm.value = {
    sIdx: null, siteName: '', qty: 1,
    assignDate: new Date().toISOString().slice(0, 10),
    nextCheckDate: '', note: '',
  }
  isDistOpen.value = true
}

function saveDist() {
  if (!distForm.value.sIdx) { alert('배치할 현장을 선택해주세요.'); return }
  if (distForm.value.qty < 1) { alert('수량은 1 이상이어야 합니다.'); return }

  const equip = equipmentList.value.find(e => e.idx === liveEquip.value.idx)
  if (!equip) return

  // 현장명은 siteOptions에서 조회
  const site = siteOptions.value.find(s => s.idx === distForm.value.sIdx)
  equip.distributions.push({
    idx:           Date.now(),
    sIdx:          distForm.value.sIdx,
    siteName:      site?.name ?? '',
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
  if (!confirm('이 장비를 본사로 회수하시겠습니까?')) return
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
        <!--div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-marker"></i> 배치 현장</label>
          <SiteSelect v-model="selectedSite" />
        </div-->
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-list-status"></i> 장비 상태</label>
          <select v-model="selectedStatus" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="s in EQUIP_STATUS_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </div>
        <div class="search-group" style="flex:2">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input v-model="searchTerm" type="text" placeholder="장비명 또는 모델명 검색" class="search-input" />
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

    <!-- ════════════════════════════════════════════════════
         장비 목록
    ═════════════════════════════════════════════════════ -->
    <div v-else>

      <div class="table-card equip-list-wrap">
        <div class="table-header">
          <div class="table-title">
            <i class="mdi mdi-toolbox-outline"></i>
            <span>장비 및 배치 현황 ({{ filteredList.length }}종)</span>
          </div>
          <div class="page-size-select">
            <label>페이지당</label>
            <select v-model="pageSize" @change="currentPage = 1" class="filter-select"
                    style="height:32px;padding:4px 10px;font-size:12px;min-width:60px;">
              <option v-for="n in [10,20,50,100]" :key="n" :value="n">{{ n }}개</option>
            </select>
          </div>
        </div>

        <!-- 빈 상태 -->
        <div v-if="pagedList.length === 0" class="empty-state">
          <i class="mdi mdi-magnify-close"></i>
          <p>검색 조건에 맞는 장비가 없습니다.</p>
        </div>

        <!-- 장비 행 목록 -->
        <div
            v-for="equip in pagedList"
            :key="equip.idx"
            class="equip-row"
            :class="{
            'is-selected': selectedEquip?.idx === equip.idx,
            'has-fault':   faultQty(equip) > 0,
          }"
            @click="selectEquip(equip)"
        >
          <!-- 좌측 아이콘 -->
          <div class="equip-row-icon">
            <i :class="['mdi', getEquipIcon(equip.category)]"></i>
          </div>

          <!-- 중앙 정보 -->
          <div class="equip-row-body">
            <div class="equip-row-top">
              <span class="equip-row-name">{{ equip.name }}</span>
              <span class="equip-row-model">{{ equip.model }}</span>
              <span class="cat-badge">{{ equip.category }}</span>
            </div>
            <!-- 배치율 바 -->
            <div class="assign-bar-wrap">
              <div class="assign-bar">
                <div
                    class="assign-bar-fill"
                    :style="{ width: assignRate(equip) + '%' }"
                    :class="{
                    'bar-partial': assignRate(equip) > 0 && assignRate(equip) < 100,
                    'bar-full':    assignRate(equip) === 100,
                  }"
                ></div>
              </div>
              <span class="assign-bar-label">
                배치 {{ assignRate(equip) }}% ({{ assignedQty(equip) }}/{{ equip.totalQty }}대)
              </span>
            </div>
          </div>

          <!-- 우측 수량 칩 -->
          <div class="equip-row-chips">
            <span class="qty-chip chip-remain" :class="{ 'chip-empty': remainQty(equip) === 0 }">
              잔여 {{ remainQty(equip) }}대
            </span>
            <span v-if="faultQty(equip) > 0" class="qty-chip chip-fault">
              <i class="mdi mdi-alert"></i> {{ faultQty(equip) }}
            </span>
            <i class="mdi mdi-chevron-right row-chevron"></i>
          </div>
        </div>

        <!-- 페이지네이션 -->
        <Pagination
            v-model:currentPage="currentPage"
            v-model:pageSize="pageSize"
            :totalCount="filteredList.length"
            @change="handlePageChange"
        />
      </div>

    </div>

    <!-- ════════════════════════════════════════════════════
         배치 상세 드로어 (fixed 오버레이)
    ═════════════════════════════════════════════════════ -->
    <teleport to="body">
      <!-- 오버레이 배경 -->
      <transition name="fade-bg">
        <div
            v-if="liveEquip"
            class="drawer-overlay"
            @click="selectedEquip = null"
        ></div>
      </transition>

      <!-- 드로어 패널 -->
      <transition name="drawer-slide">
        <div v-if="liveEquip" class="detail-drawer">

          <!-- 드로어 헤더 -->
          <div class="detail-panel-head">
            <div class="dph-left">
              <div class="dph-icon">
                <i :class="['mdi', getEquipIcon(liveEquip.category)]"></i>
              </div>
              <div>
                <div class="dph-name">{{ liveEquip.name }}</div>
                <div class="dph-meta">{{ liveEquip.category }} · {{ liveEquip.model }}</div>
              </div>
            </div>
            <button class="panel-close-btn" @click="selectedEquip = null">
              <i class="mdi mdi-close"></i>
            </button>
          </div>

          <!-- 수량 요약 -->
          <div class="detail-qty-bar">
            <div class="dq-item">
              <span class="dq-label">총 보유</span>
              <span class="dq-val">{{ liveEquip.totalQty }}대</span>
            </div>
            <div class="dq-divider"></div>
            <div class="dq-item">
              <span class="dq-label">배치 중</span>
              <span class="dq-val dq-blue">{{ assignedQty(liveEquip) }}대</span>
            </div>
            <div class="dq-divider"></div>
            <div class="dq-item">
              <span class="dq-label">본사 잔여</span>
              <span class="dq-val" :class="remainQty(liveEquip) === 0 ? 'dq-red' : 'dq-green'">
                {{ remainQty(liveEquip) }}대
              </span>
            </div>
            <template v-if="faultQty(liveEquip) > 0">
              <div class="dq-divider"></div>
              <div class="dq-item">
                <span class="dq-label">고장</span>
                <span class="dq-val dq-red">{{ faultQty(liveEquip) }}대</span>
              </div>
            </template>
          </div>

          <!-- 배치 현장 목록 -->
          <div class="detail-dist-list">
            <div class="ddl-header">
              <span class="ddl-title">현장별 배치 현황</span>
              <span class="ddl-count">{{ liveEquip.distributions.length }}개 현장</span>
            </div>

            <!-- 배치 없음 -->
            <div v-if="liveEquip.distributions.length === 0" class="dist-empty-panel">
              <i class="mdi mdi-package-variant-closed"></i>
              <p>현재 배치된 현장이 없습니다.<br>모두 본사 창고에 보관 중입니다.</p>
            </div>

            <!-- 배치 카드 (현장명만 표시 → 클릭 시 상세 펼침) -->
            <div
                v-for="dist in liveEquip.distributions"
                :key="dist.idx"
                class="dist-card"
                :class="{
                'dist-card--check':    dist.status === 'check',
                'dist-card--fault':    dist.status === 'fault',
                'dist-card--expanded': expandedDistIdx === dist.idx,
              }"
            >
              <!-- 항상 보이는 현장 행 -->
              <div class="dist-card-row" @click="toggleDistCard(dist.idx)">
                <div class="dist-row-left">
                  <span :class="['dist-status-dot', `dot-${equipStatusMap[dist.status].color}`]"></span>
                  <span class="dist-site-name">
                    <i class="mdi mdi-office-building-marker"></i>
                    {{ dist.siteName }}
                  </span>
                  <span class="dist-qty-badge">{{ dist.qty }}대</span>
                </div>
                <div class="dist-row-right">
                  <span v-if="isOverdue(dist.nextCheckDate)" class="overdue-dot" title="점검 기한 초과">
                    <i class="mdi mdi-alert-circle"></i>
                  </span>
                  <i class="mdi dist-chevron" :class="expandedDistIdx === dist.idx ? 'mdi-chevron-up' : 'mdi-chevron-down'"></i>
                </div>
              </div>

              <!-- 펼쳐지는 상세 영역 -->
              <transition name="dist-expand">
                <div v-if="expandedDistIdx === dist.idx" class="dist-card-detail">
                  <div class="dist-detail-grid">
                    <div class="dist-detail-item">
                      <span class="dist-label">현재 상태</span>
                      <span :class="['dist-status', `dist-${equipStatusMap[dist.status].color}`]">
                        {{ equipStatusMap[dist.status].label }}
                      </span>
                    </div>
                    <div class="dist-detail-item">
                      <span class="dist-label">배치일</span>
                      <span class="dist-val">{{ dist.assignDate || '—' }}</span>
                    </div>
                    <div class="dist-detail-item">
                      <span class="dist-label">다음 점검</span>
                      <span class="dist-val" :class="{ overdue: isOverdue(dist.nextCheckDate) }">
                        {{ dist.nextCheckDate || '—' }}
                        <span v-if="isOverdue(dist.nextCheckDate)" class="overdue-badge">초과</span>
                      </span>
                    </div>
                    <div v-if="dist.note" class="dist-detail-item full">
                      <span class="dist-label">메모</span>
                      <div class="dist-note">
                        <i class="mdi mdi-note-text-outline"></i>{{ dist.note }}
                      </div>
                    </div>
                  </div>
                  <!-- 상세 내 액션 버튼 -->
                  <div class="dist-detail-actions">
                    <button class="btn-dist-action btn-dist-edit"
                            @click.stop="openEditDist(liveEquip, dist)">
                      <i class="mdi mdi-pencil-outline"></i> 수정
                    </button>
                    <button class="btn-dist-action btn-dist-return"
                            @click.stop="returnToHQ(liveEquip.idx, dist.idx)">
                      <i class="mdi mdi-arrow-u-left-top"></i> 본사 회수
                    </button>
                  </div>
                </div>
              </transition>
            </div>
          </div>

          <!-- 드로어 푸터 -->
          <div class="detail-panel-footer">
            <button
                class="btn-assign"
                :disabled="remainQty(liveEquip) <= 0"
                @click="openDistModal"
            >
              <i class="mdi mdi-truck-delivery-outline"></i>
              현장 배치 추가
              <span v-if="remainQty(liveEquip) > 0" class="btn-remain-hint">
                (잔여 {{ remainQty(liveEquip) }}대)
              </span>
            </button>
            <button class="btn-equip-link" @click="router.push(`/equipment/${liveEquip.idx}`)">
              <i class="mdi mdi-open-in-new"></i>상세
            </button>
          </div>

        </div>
      </transition>
    </teleport>


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
                <option v-for="s in EQUIP_STATUS_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
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
          <div class="dist-target-info" v-if="liveEquip">
            <span class="cat-badge">{{ liveEquip.category }}</span>
            <h4>{{ liveEquip.name }}
              <small style="font-weight:400;color:var(--text-sub);">({{ liveEquip.model }})</small>
            </h4>
            <p class="remain-text">
              배분 가능 잔여 수량: <strong>{{ remainQty(liveEquip) }}대</strong>
            </p>
          </div>

          <div class="mform-item required mt-3">
            <label>배치할 현장</label>
            <SiteSelect v-model="distForm.sIdx" :allow-empty="false" placeholder="현장을 검색하세요..." />
          </div>
          <div class="mform-grid">
            <div class="mform-item required">
              <label>배치 수량 (대)</label>
              <input
                  v-model.number="distForm.qty"
                  type="number" min="1"
                  :max="liveEquip ? remainQty(liveEquip) : 1"
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
────────────────────────────────────────────────────── */

.header-actions { display:flex; gap:10px; }
.page-size-select { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-sub); }

/* ── 장비 목록 ── */
.equip-list-wrap { overflow: hidden; }

/* ── 장비 행 ── */
.equip-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer; transition: background .15s;
  border-left: 3px solid transparent;
}
.equip-row:last-of-type { border-bottom: none; }
.equip-row:hover { background: var(--primary-soft); }
.equip-row.is-selected {
  background: var(--primary-soft);
  border-left-color: var(--primary);
}
.equip-row.has-fault:not(.is-selected) {
  border-left-color: rgba(239,68,68,.4);
}

.equip-row-icon {
  width: 40px; height: 40px; flex-shrink: 0;
  border-radius: 10px; background: var(--bg-canvas);
  border: 1px solid var(--border-color);
  display: flex; align-items: center; justify-content: center;
  font-size: 19px; color: var(--primary); transition: all .2s;
}
.equip-row.is-selected .equip-row-icon {
  background: var(--primary); color: #fff; border-color: var(--primary);
}

.equip-row-body   { flex: 1; min-width: 0; }
.equip-row-top    { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.equip-row-name   { font-size: 14px; font-weight: 700; color: var(--text-main); }
.equip-row-model  { font-size: 12px; color: var(--text-sub); }
.cat-badge {
  font-size: 10px; padding: 2px 7px;
  background: var(--bg-canvas); border: 1px solid var(--border-color);
  border-radius: 4px; color: var(--text-sub);
}

/* 배치율 바 */
.assign-bar-wrap  { display: flex; align-items: center; gap: 8px; }
.assign-bar       { flex: 1; max-width: 180px; height: 4px; background: var(--border-color); border-radius: 2px; overflow: hidden; }
.assign-bar-fill  { height: 100%; border-radius: 2px; background: var(--text-muted); transition: width .4s; }
.bar-partial      { background: var(--primary); }
.bar-full         { background: var(--success); }
.assign-bar-label { font-size: 11px; color: var(--text-sub); white-space: nowrap; }

/* 우측 칩 */
.equip-row-chips  { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.qty-chip         { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
.chip-remain      { background: rgba(5,150,105,.1); color: var(--success); }
.chip-empty       { background: rgba(239,68,68,.1); color: var(--danger); }
.chip-fault       { background: rgba(239,68,68,.1); color: var(--danger); display:inline-flex; align-items:center; gap:3px; }
.chip-fault i     { font-size: 11px; }
.row-chevron      { font-size: 18px; color: var(--text-muted); transition: color .15s; }
.equip-row.is-selected .row-chevron { color: var(--primary); }

/* ════════════════════════════════════════════════════
   우측 상세 패널
════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════
   드로어 (fixed 오버레이)
════════════════════════════════════════════════════ */

/* 배경 오버레이 */
.drawer-overlay {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  z-index: 1000;
}

/* 드로어 패널 */
.detail-drawer {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 420px;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-color);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  z-index: 1001;
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* 드로어 트랜지션 */
.drawer-slide-enter-active { transition: transform .28s cubic-bezier(.4,0,.2,1); }
.drawer-slide-leave-active { transition: transform .22s cubic-bezier(.4,0,.2,1); }
.drawer-slide-enter-from, .drawer-slide-leave-to { transform: translateX(100%); }

/* 배경 페이드 트랜지션 */
.fade-bg-enter-active { transition: opacity .25s ease; }
.fade-bg-leave-active { transition: opacity .2s ease; }
.fade-bg-enter-from, .fade-bg-leave-to { opacity: 0; }

/* 패널 헤더 */
.detail-panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface); flex-shrink: 0;
}
.dph-left  { display: flex; align-items: center; gap: 10px; }
.dph-icon  {
  width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0;
  background: var(--primary-soft); border: 1px solid rgba(37,99,235,.2);
  display: flex; align-items: center; justify-content: center;
  font-size: 19px; color: var(--primary);
}
.dph-name  { font-size: 14px; font-weight: 700; color: var(--text-main); letter-spacing: -.02em; }
.dph-meta  { font-size: 11px; color: var(--text-sub); margin-top: 1px; }
.panel-close-btn {
  width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
  background: var(--bg-canvas); border: 1px solid var(--border-color);
  color: var(--text-sub); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; transition: all .15s;
}
.panel-close-btn:hover { color: var(--danger); background: var(--bg-hover); }

/* 수량 요약 바 */
.detail-qty-bar {
  display: flex; align-items: center; justify-content: space-around;
  padding: 10px 12px; background: var(--bg-canvas);
  border-bottom: 1px solid var(--border-color); flex-shrink: 0;
}
.dq-item    { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dq-divider { width: 1px; height: 24px; background: var(--border-color); }
.dq-label   { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.dq-val     { font-size: 15px; font-weight: 800; color: var(--text-main); letter-spacing: -.03em; }
.dq-blue    { color: var(--primary); }
.dq-green   { color: var(--success); }
.dq-red     { color: var(--danger); }

/* 배치 현장 스크롤 영역 */
.detail-dist-list {
  flex: 1; overflow-y: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.detail-dist-list::-webkit-scrollbar       { width: 4px; }
.detail-dist-list::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 2px; }

.ddl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
.ddl-title  { font-size: 11px; font-weight: 700; color: var(--text-sub); text-transform: uppercase; letter-spacing: .05em; }
.ddl-count  { font-size: 11px; color: var(--text-muted); }

/* 배치 없음 */
.dist-empty-panel {
  text-align: center; padding: 28px 16px;
  color: var(--text-sub); font-size: 12px; line-height: 1.7;
  background: var(--bg-canvas); border-radius: 8px;
  border: 1px dashed var(--border-color);
}
.dist-empty-panel i { font-size: 30px; display: block; margin-bottom: 8px; opacity: .3; }

/* 배치 카드 */
/* ── 배치 카드 (아코디언) ── */
.dist-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 9px; overflow: hidden;
  transition: box-shadow .15s;
}
.dist-card:hover           { box-shadow: var(--shadow-md); }
.dist-card--check          { border-left: 3px solid var(--warning); }
.dist-card--fault          { border-left: 3px solid var(--danger); }
.dist-card--expanded       { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }

/* 항상 보이는 현장 행 */
.dist-card-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 13px; cursor: pointer;
  transition: background .15s;
  user-select: none;
}
.dist-card-row:hover { background: var(--bg-hover); }
.dist-card--expanded .dist-card-row {
  background: var(--primary-soft);
  border-bottom: 1px solid var(--border-color);
}

.dist-row-left  { display: flex; align-items: center; gap: 7px; }
.dist-row-right { display: flex; align-items: center; gap: 5px; }

/* 상태 도트 */
.dist-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot-success { background: var(--success); }
.dot-warning { background: var(--warning); }
.dot-danger  { background: var(--danger); }

.dist-site-name {
  font-size: 13px; font-weight: 600; color: var(--text-main);
  display: flex; align-items: center; gap: 4px;
}
.dist-site-name i { font-size: 14px; color: var(--primary); }

.dist-qty-badge {
  font-size: 10px; font-weight: 700; padding: 2px 7px;
  background: var(--bg-canvas); border: 1px solid var(--border-color);
  border-radius: 10px; color: var(--text-sub);
}

.overdue-dot { color: var(--danger); font-size: 15px; line-height: 1; }
.dist-chevron { font-size: 16px; color: var(--text-muted); transition: color .15s; }
.dist-card--expanded .dist-chevron { color: var(--primary); }

/* 펼쳐지는 상세 */
.dist-card-detail { padding: 12px 13px; background: var(--bg-canvas); }

.dist-detail-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px; margin-bottom: 10px;
}
.dist-detail-item { display: flex; flex-direction: column; gap: 3px; }
.dist-detail-item.full { grid-column: 1 / -1; }

.dist-label { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.dist-val   { font-size: 12px; color: var(--text-main); font-weight: 500; }
.fw-bold    { font-weight: 700; }
.overdue    { color: var(--danger); font-weight: 700; }
.overdue-badge { font-size: 10px; padding: 1px 5px; background: rgba(239,68,68,.1); color: var(--danger); border-radius: 3px; margin-left: 3px; }

.dist-note {
  font-size: 11px; color: var(--text-sub); line-height: 1.5;
  background: var(--bg-surface); border-radius: 5px; padding: 6px 8px;
  display: flex; gap: 5px; align-items: flex-start;
  border-left: 2px solid var(--border-focus);
}
.dist-note i { font-size: 13px; flex-shrink: 0; margin-top: 1px; }

.dist-status { padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.dist-success { background: rgba(5,150,105,.1);  color: var(--success); }
.dist-warning { background: rgba(245,158,11,.1); color: var(--warning); }
.dist-danger  { background: rgba(239,68,68,.1);  color: var(--danger);  }

/* 상세 내 액션 버튼 */
.dist-detail-actions { display: flex; gap: 7px; }
.btn-dist-action {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
  padding: 7px; border: none; border-radius: 7px;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all .15s; font-family: inherit;
}
.btn-dist-edit   { background: var(--primary-soft); color: var(--primary); }
.btn-dist-edit:hover   { background: var(--primary); color: #fff; }
.btn-dist-return { background: rgba(239,68,68,.08); color: var(--danger); }
.btn-dist-return:hover { background: var(--danger); color: #fff; }

/* 아코디언 트랜지션 */
.dist-expand-enter-active { transition: all .22s ease; }
.dist-expand-leave-active { transition: all .18s ease; }
.dist-expand-enter-from, .dist-expand-leave-to { opacity: 0; transform: translateY(-6px); }

/* 패널 푸터 */
.detail-panel-footer {
  display: flex; gap: 8px; padding: 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface); flex-shrink: 0;
}
.btn-assign {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px; border: none; border-radius: 8px;
  background: var(--primary); color: #fff;
  font-size: 12px; font-weight: 700; cursor: pointer; transition: all .2s; font-family: inherit;
}
.btn-assign:hover:not(:disabled) { background: var(--primary-hover); }
.btn-assign:disabled { opacity: .45; cursor: not-allowed; }
.btn-remain-hint { font-size: 11px; opacity: .85; }
.btn-equip-link {
  display: flex; align-items: center; gap: 4px;
  padding: 9px 12px; border: 1px solid var(--border-color);
  border-radius: 8px; background: var(--bg-surface);
  color: var(--text-sub); font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all .2s; font-family: inherit; white-space: nowrap;
}
.btn-equip-link:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-equip-link i { font-size: 13px; }



/* 아이콘 버튼 */
.icon-btn         { width: 27px; height: 27px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-sub); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .15s; font-size: 13px; }
.icon-btn--blue   { color: var(--primary); background: var(--primary-soft); border-color: rgba(37,99,235,.25); }
.icon-btn--blue:hover { background: var(--primary); color: #fff; }
.icon-btn--red    { color: var(--danger); background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.25); }
.icon-btn--red:hover  { background: var(--danger); color: #fff; }

/* 모달 */
.modal-overlay  { position: fixed; inset: 0; background: rgba(15,23,42,.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
.modal-box      { background: var(--bg-surface); border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,.15); width: 100%; max-width: 500px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-color); animation: slidein .22s ease; }
@keyframes slidein { from { opacity:0; transform:translateY(12px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
.modal-header   { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--border-color); }
.modal-header h3 { font-size: 16px; font-weight: 800; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 8px; letter-spacing: -.03em; }
.modal-header h3 i { color: var(--primary); font-size: 19px; }
.modal-close    { width: 30px; height: 30px; border-radius: 7px; background: var(--bg-canvas); border: 1px solid var(--border-color); color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 17px; }
.modal-close:hover { color: var(--danger); }
.modal-body     { flex: 1; overflow-y: auto; padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; background: var(--bg-canvas); }
.modal-body::-webkit-scrollbar { width: 4px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 2px; }
.modal-footer   { padding: 14px 22px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px; background: var(--bg-surface); }
.mform-grid     { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mform-item     { display: flex; flex-direction: column; gap: 5px; }
.mform-item label { font-size: 11px; font-weight: 700; color: var(--text-sub); text-transform: uppercase; letter-spacing: .04em; }
.mform-item.required label::after { content: '*'; color: var(--danger); margin-left: 3px; }
.info-input, .info-select, .info-textarea { width: 100%; padding: 9px 11px; border: 1px solid var(--border-color); border-radius: 7px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; font-family: inherit; }
.info-input:focus, .info-select:focus, .info-textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.info-input:disabled { background: var(--bg-canvas); color: var(--text-sub); }
.dist-target-info { background: var(--bg-surface); padding: 14px; border-radius: 8px; border: 1px solid var(--border-color); }
.dist-target-info h4 { margin: 8px 0 4px; font-size: 14px; color: var(--text-main); font-weight: 700; }
.remain-text { margin: 0; font-size: 12px; color: var(--text-sub); }
.remain-text strong { color: var(--primary); font-size: 14px; font-weight: 800; }
.btn-cancel { padding: 9px 18px; background: var(--text-sub); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all .2s; font-family: inherit; }
.btn-cancel:hover { background: var(--text-main); }
.btn-save   { padding: 9px 18px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all .2s; font-family: inherit; display: flex; align-items: center; gap: 5px; }
.btn-save:hover { background: var(--primary-hover); transform: translateY(-1px); }

/* 유틸 */
.mt-3       { margin-top: 12px; }
.text-green { color: var(--success); }
.text-orange{ color: var(--warning); }
.text-red   { color: var(--danger); }
.loading-state { display:flex; flex-direction:column; align-items:center; padding:60px; color:var(--text-sub); }
.spinner    { width: 36px; height: 36px; border: 3px solid var(--bg-canvas); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 12px; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-state i { font-size: 44px; margin-bottom: 12px; opacity: .4; display: block; }

/* 반응형 */
@media (max-width: 768px) {
  .detail-drawer { width: 100%; border-left: none; border-top: 1px solid var(--border-color); }
}
@media (max-width: 768px) {
  .assign-bar { max-width: 100px; }
  .mform-grid { grid-template-columns: 1fr; }
}
</style>
