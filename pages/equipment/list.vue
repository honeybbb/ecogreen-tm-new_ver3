<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
const router = useRouter()
import Pagination from '@/components/common/Pagination.vue'
import EquipmentDetailModal from '@/components/modal/EquipmentDetailModal.vue'
import FilterSearchGroup from "~/components/common/FilterSearchGroup.vue";
import axios from "axios";
import { useAuthStore } from '~/stores/auth.js';

const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// ========================================================
// 1. 상태 및 상수 정의
// ========================================================
const equipCodes = ref([]); // '06' 트리 전체 코드 (대/중/소)

const searchTerm = ref('');
const selectedBaseType = ref('전체'); // 대분류 itemCd (5자리)
const selectedMidType = ref('전체');  // 중분류 itemCd (8자리)
const selectedSubType = ref('전체');  // 소분류 itemCd (11자리)
const selectedStatus = ref('전체');

// 현장(단지) 목록 & 이름 lookup (sIdx=0 = 본사)
const siteList = ref([]);
const siteNameMap = computed(() => {
  const m = { 0: '본사' };
  siteList.value.forEach(s => { m[s.idx] = s.name; });
  return m;
});
const fetchSiteList = async () => {
  try {
    const res = await axios.get(`/api/v1/site/list`);
    siteList.value = res.data?.data || [];
  } catch (e) {
    console.error('현장 목록 로드 실패:', e);
  }
};

// 이동 이력(assignments) + 폐기 이력(discards)을 집계해 현재 위치별 수량 산출
// assignment: fromSidx 에서 sIdx 로 assignQty 만큼 이동 (fromSidx === sIdx는 자가 입고)
// discard: sIdx 에서 qty 만큼 소실
const currentAssignments = (assignments, discards) => {
  const map = {}; // sIdx -> qty
  (assignments || []).forEach(a => {
    const qty = Number(a.assignQty) || 0;
    const from = a.fromSidx;
    const to = a.sIdx;
    if (from !== null && from !== undefined && String(from) === String(to)) {
      if (to !== null && to !== undefined) map[to] = (map[to] || 0) + qty;
      return;
    }
    if (from !== null && from !== undefined) map[from] = (map[from] || 0) - qty;
    if (to !== null && to !== undefined) map[to] = (map[to] || 0) + qty;
  });
  (discards || []).forEach(d => {
    const qty = Number(d.qty) || 0;
    if (d.sIdx !== null && d.sIdx !== undefined) map[d.sIdx] = (map[d.sIdx] || 0) - qty;
  });
  return Object.entries(map)
      .filter(([, qty]) => qty > 0)
      .map(([sIdx, qty]) => ({ sIdx: Number(sIdx), qty }));
};

const fetchEquipCategories = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    equipCodes.value = (res.data?.data || []).filter(c =>
        c.useFl === 'Y' && (c.groupCd === '06' || c.itemCd?.startsWith('06'))
    );
  } catch (e) {
    console.error('장비 분류 코드를 불러오지 못했습니다.', e);
    equipCodes.value = [];
  }
};

// 레벨별 옵션 (cascade)
const baseOptions = computed(() =>
    equipCodes.value
        .filter(c => c.groupCd === '06' && c.itemCd?.length === 5)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
);

const midOptions = computed(() => {
  if (selectedBaseType.value === '전체') return [];
  return equipCodes.value
      .filter(c => c.groupCd === selectedBaseType.value)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
});

const subOptions = computed(() => {
  if (selectedMidType.value === '전체') return [];
  return equipCodes.value
      .filter(c => c.groupCd === selectedMidType.value)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
});

watch(selectedBaseType, () => {
  selectedMidType.value = '전체';
  selectedSubType.value = '전체';
});
watch(selectedMidType, () => {
  selectedSubType.value = '전체';
});

// 선택된 가장 깊은 레벨의 itemCd prefix (eq.type matches when starts with this)
const matchingPrefix = computed(() => {
  if (selectedBaseType.value === '전체') return null;
  if (selectedSubType.value !== '전체') return selectedSubType.value;
  if (selectedMidType.value !== '전체') return selectedMidType.value;
  return selectedBaseType.value;
});

// itemCd → itemNm 룩업 맵 (테이블 표시용)
const typeNameMap = computed(() => {
  const m = {};
  equipCodes.value.forEach(c => { m[c.itemCd] = c.itemNm; });
  return m;
});

// itemCd → 브레드크럼 (예: 청소장비 > 바닥청소장비 > 탑승식청소차량)
const typeLabel = (cd) => {
  if (!cd) return '-';
  const path = [];
  if (cd.length >= 5) path.push(typeNameMap.value[cd.substring(0, 5)]);
  if (cd.length >= 8) path.push(typeNameMap.value[cd.substring(0, 8)]);
  if (cd.length >= 11) path.push(typeNameMap.value[cd.substring(0, 11)]);
  const names = path.filter(Boolean);
  return names.length ? names.join(' > ') : cd;
};

// 리프 이름만 표시 (가장 깊은 레벨)
const typeLeafName = (cd) => {
  if (!cd) return '-';
  return typeNameMap.value[cd] || cd;
};

// 전량 폐기 여부 — 현재 배치가 비어있거나 장비 마스터 status=2
const isDiscarded = (eq) => {
  if (eq?.status === 2) return true;
  return currentAssignments(eq?.assignments, eq?.discards).length === 0;
};

// ── 페이지네이션 상태 ──────────────────────────────
const currentPage     = ref(1);
const pageSize        = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

// ========================================================
// 통계 데이터 계산 (stats-card 용)
// ========================================================
const stats = computed(() => {
  let totalQty = 0,
      normalQty = 0,
      checkQty = 0,
      faultQty = 0;

  equipments.value.forEach(eq => {
    const t = Number(eq.totalQty) || 0;
    totalQty += t;

    // 폐기 수량: discards 합계 (또는 장비 마스터 status=2면 전량 폐기로 간주)
    const discardedQty = (eq.discards || []).reduce((s, d) => s + (Number(d.qty) || 0), 0);
    const fullyDiscarded = eq.status === 2 ? t : 0;
    faultQty += Math.min(t, discardedQty + fullyDiscarded);

    // 수리/점검중 (현재 추적 필드 없음)
    if (eq.status === 1) checkQty += t;

    // 운영 정상 = 전체 - (폐기 + 수리중)
    const operating = Math.max(0, t - discardedQty - fullyDiscarded - (eq.status === 1 ? t : 0));
    normalQty += operating;
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
    // 1) 분류 필터 (eq.type이 선택된 레벨의 itemCd prefix로 시작하는지)
    const prefix = matchingPrefix.value;
    const typeOk = !prefix || (eq.type && String(eq.type).startsWith(prefix));

    // 2) 검색어 필터
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
  selectedBaseType.value = '전체';
  selectedMidType.value = '전체';
  selectedSubType.value = '전체';
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

const handleEquipmentUpdate = async (payload) => {
  // 이동/폐기/수리 등 변경 발생 시 서버에서 최신 데이터 재조회
  const prevIdx = selectedEq.value?.idx;
  await getEquipmentList();
  if (prevIdx) {
    const refreshed = equipments.value.find(e => e.idx === prevIdx);
    if (refreshed) selectedEq.value = refreshed;
  }
};

const getEquipmentList = async () => {
  // isLoading.value = true;

  try {
    const response = await axios.get('/api/v2/equipment/list');

    if (response.data.result) {
      equipments.value = response.data.data;
    } else {
      alert(response.data.msg || '데이터를 불러오지 못했습니다.');
    }
  } catch (error) {
    console.error('장비 목록 조회 에러:', error);
    alert('서버와 통신 중 오류가 발생했습니다.');
  } finally {
    // isLoading.value = false;
  }
};

// 3. 컴포넌트 마운트 시 자동 호출
onMounted(() => {
  getEquipmentList();
  fetchEquipCategories();
  fetchSiteList();
});
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
          <span class="stat-label">수리중</span>
          <span class="stat-value text-orange">{{ stats.checkQty }}<small>대</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--danger);--card-bg:rgba(239,68,68,.1)">
        <div class="stat-icon"><i class="mdi mdi-alert-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">폐기</span>
          <span class="stat-value text-red">{{ stats.faultQty }}<small>대</small></span>
        </div>
      </div>
    </div>

    <!-- ── 검색 및 필터 패널 ── -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">대분류</label>
          <select v-model="selectedBaseType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="c in baseOptions" :key="c.itemCd" :value="c.itemCd">{{ c.itemNm }}</option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">중분류</label>
          <select v-model="selectedMidType" class="filter-select" :disabled="selectedBaseType === '전체'">
            <option value="전체">전체</option>
            <option v-for="c in midOptions" :key="c.itemCd" :value="c.itemCd">{{ c.itemNm }}</option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">소분류</label>
          <select v-model="selectedSubType" class="filter-select" :disabled="selectedMidType === '전체'">
            <option value="전체">전체</option>
            <option v-for="c in subOptions" :key="c.itemCd" :value="c.itemCd">{{ c.itemNm }}</option>
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
          <tr v-for="eq in filteredList" :key="eq.idx" @click="openEquipmentDetail(eq)"
              class="cursor-pointer" :class="{ 'row-discarded': isDiscarded(eq) }">
            <td>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="type-badge type-equip" :title="typeLabel(eq.type)">
                  {{ typeLeafName(eq.type) }}
                </span>
                <span v-if="isDiscarded(eq)" class="discarded-badge">
                  <i class="mdi mdi-trash-can-outline"></i> 폐기
                </span>
              </div>
            </td>
            <td class="font-weight-bold">{{ eq.name }}</td>
            <td>{{ eq.model }}</td>
            <td>{{ eq.serialNo }}</td>
            <td>{{ eq.totalQty }}</td>

            <td>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <span v-for="(assign, i) in currentAssignments(eq.assignments, eq.discards)" :key="i" class="site-badge">
                  {{ siteNameMap[assign.sIdx] || `#${assign.sIdx}` }}
                  <small style="opacity: 0.8; margin-left: 2px;">({{ assign.qty }})</small>
                </span>
                <span v-if="currentAssignments(eq.assignments, eq.discards).length === 0" style="color: var(--text-muted); font-size: 12px;">
                  미배치
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
        :typeNameMap="typeNameMap"
        :siteNameMap="siteNameMap"
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

/* ── 폐기 상태 표시 ── */
.discarded-badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px; border-radius: 4px;
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger, #ef4444);
  font-size: 10px; font-weight: 700;
}
.discarded-badge i { font-size: 12px; }

.row-discarded td {
  background: var(--bg-canvas, #f9fafb);
  color: var(--text-muted, #9ca3af);
  opacity: 0.75;
}
.row-discarded .font-weight-bold {
  text-decoration: line-through;
  text-decoration-color: var(--text-muted, #9ca3af);
  color: var(--text-muted, #9ca3af);
}
.row-discarded .type-badge,
.row-discarded .site-badge {
  opacity: 0.6;
  filter: grayscale(0.8);
}
.row-discarded:hover td { background: var(--bg-hover, #f3f4f6); }

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