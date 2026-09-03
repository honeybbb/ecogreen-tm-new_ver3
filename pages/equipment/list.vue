<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'nuxt/app';
const router = useRouter()
import Pagination from '@/components/common/Pagination.vue'
import EquipmentDetailModal from '@/components/modal/EquipmentDetailModal.vue'
import FilterSearchGroup from "~/components/common/FilterSearchGroup.vue";

// ========================================================
// 1. 상태 및 상수 정의
// ========================================================
const EQUIP_TYPES = ['차량', '장비', '소모품'];

const searchTerm = ref('');
const selectedType = ref('전체');
const selectedStatus = ref('전체'); // 마스터 레벨에서의 상태 (정상/수리중 등 확장용)

// ── 페이지네이션 상태 ──────────────────────────────
const currentPage     = ref(1);
const pageSize        = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

// ========================================================
// 통계 데이터 계산 (stats-card 용)
// ========================================================
const stats = computed(() => {
  let totalQty = 0, normalQty = 0, checkQty = 0, faultQty = 0;

  equipments.value.forEach(eq => {
    totalQty += eq.totalQty;
    if (eq.status === 'normal') normalQty += eq.totalQty;
    else if (eq.status === 'check') checkQty += eq.totalQty;
    else if (eq.status === 'fault') faultQty += eq.totalQty;
  });

  return {
    totalKinds: equipments.value.length,
    totalQty,
    normalQty,
    checkQty,
    faultQty
  };
});

// 장비 마스터 임시 데이터
const equipments = ref([
  {
    idx: 1,
    type: '차량',
    name: '1톤 화물차(포터2)',
    model: '2023년형',
    serialNo: '12가 3456',
    totalQty: 1,
    assignments: [{ siteName: '반포 래미안', qty: 1 }],
    status: 'normal'
  },
  {
    idx: 2,
    type: '장비',
    name: '고압세척기',
    model: 'Karcher K7',
    serialNo: 'SN-9988-001',
    totalQty: 2,
    assignments: [
      { siteName: '북한산힐스테이트7차', qty: 1 },
      { siteName: '옥정8단지', qty: 1 }
    ],
    status: 'normal'
  },
  {
    idx: 3,
    type: '소모품',
    name: '작업용 반코팅 장갑',
    model: 'M사이즈',
    serialNo: '-',
    totalQty: 500,
    assignments: [
      { siteName: 'LH 위례 6단지', qty: 200 },
      { siteName: '강서 대명 강동', qty: 300 }
    ],
    status: 'normal'
  },
  {
    idx: 4,
    type: '장비',
    name: '산업용 진공청소기',
    model: 'VC-3000',
    serialNo: 'SN-7722-002',
    totalQty: 3,
    assignments: [{ siteName: '본사 창고', qty: 3 }],
    status: 'check'
  }
]);

// ========================================================
// 2. 필터링 로직
// ========================================================
const filteredList = computed(() => {
  return equipments.value.filter(eq => {
    // 1) 분류 필터
    const typeOk = selectedType.value === '전체' || eq.type === selectedType.value;

    // 2) 검색어 필터 (장비명, 모델명, 시리얼번호 통합 검색)
    const keyword = searchTerm.value.toLowerCase();
    const searchOk = !keyword ||
        eq.name.toLowerCase().includes(keyword) ||
        eq.model.toLowerCase().includes(keyword) ||
        eq.serialNo.toLowerCase().includes(keyword);

    return typeOk && searchOk;
  });
});

const resetFilters = () => {
  searchTerm.value = '';
  selectedType.value = '전체';
  selectedStatus.value = '전체';
};

// ========================================================
// 3. 상세 모달 (배치/이동/수리/거래 이력)
// ========================================================
const showDetailModal = ref(false);
const selectedEq = ref(null);

const openEquipmentDetail = (eq) => {
  selectedEq.value = eq;
  showDetailModal.value = true;
};

const closeDetailModal = () => {
  showDetailModal.value = false;
  selectedEq.value = null;
};

const handleEquipmentUpdate = (payload) => {
  if (payload.type === 'move') {
    const { fromSite, toSite, qty } = payload.data;
    const eq = equipments.value.find(e => e.idx === selectedEq.value.idx);
    if (!eq) return;

    const fromAssign = eq.assignments.find(a => a.siteName === fromSite);
    if (fromAssign) fromAssign.qty -= qty;

    const toAssign = eq.assignments.find(a => a.siteName === toSite);
    if (toAssign) {
      toAssign.qty += qty;
    } else {
      eq.assignments.push({ siteName: toSite, qty: qty });
    }
    eq.assignments = eq.assignments.filter(a => a.qty > 0);
  } else if (payload.type === 'repair') {
    if (payload.data.updateStatus) {
      const eq = equipments.value.find(e => e.idx === selectedEq.value.idx);
      if (eq) {
        eq.status = 'check';
      }
    }
  }
};
</script>

<template>
  <div class="equipment-list-page">

    <!-- ── 헤더 ── -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-toolbox"></i> 장비 관리</h1>
        <p class="page-subtitle">전체 장비 및 자산 목록을 조회하고 상세 이력을 추적합니다.</p>
      </div>
      <div class="header-actions">
        <button class="btn-add" @click="router.push('/equipment/register')">
          <i class="mdi mdi-plus"></i> 신규 장비 등록
        </button>
      </div>
    </div>

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

    <!-- ── 검색 및 필터 패널 ── -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">장비 분류</label>
          <select v-model="selectedType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="type in EQUIP_TYPES" :key="type" :value="type">{{ type }}</option>
          </select>
        </div>

        <FilterSearchGroup
            v-model="searchTerm"
            placeholder="장비명, 모델명 또는 고유번호 검색"
            flex="2"
            @reset="resetFilters"
        />
      </div>
    </div>

    <!-- ── 장비 마스터 리스트 ── -->
    <div class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>장비 목록 ({{ filteredList.length }}건)</span>
        </div>
        <div class="page-size-select">
          <label>페이지당</label>
          <select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table table-hover">
          <thead>
          <tr>
            <th>분류</th>
            <th>품명/장비명</th>
            <th>모델/규격</th>
            <th>고유/차량번호</th>
            <th>총 보유량</th>
            <th>현재 투입 위치</th>
            <th></th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="eq in filteredList" :key="eq.idx" @click="openEquipmentDetail(eq)" class="cursor-pointer">
            <td>
                <span :class="['type-badge', `type-${eq.type === '차량' ? 'car' : (eq.type === '소모품' ? 'consumable' : 'equip')}`]">
                  {{ eq.type }}
                </span>
            </td>
            <td class="font-weight-bold">{{ eq.name }}</td>
            <td>{{ eq.model }}</td>
            <td>{{ eq.serialNo }}</td>
            <td>{{ eq.totalQty }}</td>

            <td>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <span v-for="(assign, i) in eq.assignments" :key="i" class="site-badge">
                  {{ assign.siteName }}
                  <small v-if="eq.totalQty > 1" style="opacity: 0.8; margin-left: 2px;">({{ assign.qty }})</small>
                </span>
              </div>
            </td>

            <td class="text-right text-muted">
              <i class="mdi mdi-chevron-right text-lg"></i>
            </td>
          </tr>
          <tr v-if="filteredList.length === 0" class="empty-state">
            <i class="mdi mdi-magnify-close"></i>
            <p>검색 조건에 맞는 장비가 없습니다.</p>
          </tr>
          </tbody>
        </table>

      </div>
      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredList.length"
          @change="handlePageChange"
      />
    </div>

    <!-- ── 상세 이력 모달 (공통 컴포넌트) ── -->
    <EquipmentDetailModal
        :show="showDetailModal"
        :equipment="selectedEq"
        @close="closeDetailModal"
        @update="handleEquipmentUpdate"
    />
  </div>
</template>

<style scoped>
/* ── 뱃지 & 유틸 ── */
.type-badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.type-car { background: #e0f2fe; color: #0284c7; }
.type-equip { background: #fef9c3; color: #ca8a04; }
.type-consumable { background: #f3f4f6; color: #4b5563; }
.site-badge { background: #e0e7ff; color: #4338ca; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.font-weight-bold { font-weight: 600; color: var(--text-main, #111827); }
.text-sub { color: var(--text-sub, #4b5563); }
.text-muted { color: #9ca3af; }
.text-right { text-align: right !important; }
.text-lg { font-size: 18px; }
.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 12px; }

/* ── 빈 상태 (Empty State) ── */
.empty-state { text-align: center; padding: 60px 20px; color: #9ca3af; }
.empty-state i { font-size: 40px; margin-bottom: 12px; opacity: 0.5; display: block; }

.page-size-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-sub);
}
</style>