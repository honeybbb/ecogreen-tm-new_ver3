<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  show: { type: Boolean, required: true },
  equipment: { type: Object, default: () => null },
  typeNameMap: { type: Object, default: () => ({}) },
  siteNameMap: { type: Object, default: () => ({ 0: '본사' }) }
});

const typeDisplay = computed(() => {
  const t = props.equipment?.type;
  if (!t) return '';
  return props.typeNameMap[t] || t;
});

const siteLabel = (sIdx) => {
  if (sIdx === null || sIdx === undefined || sIdx === '') return '-';
  return props.siteNameMap[sIdx] || `#${sIdx}`;
};

// 이동 이력 리스트 (API의 assignments 원본, 시간순 역순)
const movementHistory = computed(() => {
  const list = props.equipment?.assignments || [];
  return [...list].sort((a, b) => {
    const ad = a.regDt || a.assignDt || '';
    const bd = b.regDt || b.assignDt || '';
    return bd.localeCompare(ad);
  });
});

// 이동 이력(assignments) + 폐기 이력(discards) 집계
// 각 sIdx의 현재 수량 + 그 사이트로 들어온 가장 최근 레코드의 비고
const displayAssignments = computed(() => {
  const assignments = props.equipment?.assignments || [];
  const discards = props.equipment?.discards || [];
  const map = {};
  const latestBigo = {};

  // 시간순(오름차순) 정렬 — 뒤에 들어오는 값이 최신 bigo
  const sorted = [...assignments].sort((a, b) => {
    const ad = a.regDt || a.assignDt || '';
    const bd = b.regDt || b.assignDt || '';
    return ad.localeCompare(bd);
  });

  sorted.forEach(a => {
    const q = Number(a.assignQty) || 0;
    const from = a.fromSidx;
    const to = a.sIdx;
    if (from !== null && from !== undefined && String(from) === String(to)) {
      if (to !== null && to !== undefined) {
        map[to] = (map[to] || 0) + q;
        if (a.bigo) latestBigo[to] = a.bigo;
      }
      return;
    }
    if (from !== null && from !== undefined) map[from] = (map[from] || 0) - q;
    if (to !== null && to !== undefined) {
      map[to] = (map[to] || 0) + q;
      if (a.bigo) latestBigo[to] = a.bigo;
    }
  });

  discards.forEach(d => {
    const q = Number(d.qty) || 0;
    if (d.sIdx !== null && d.sIdx !== undefined) map[d.sIdx] = (map[d.sIdx] || 0) - q;
  });

  return Object.entries(map)
      .filter(([, qty]) => qty > 0)
      .map(([sIdx, qty]) => ({
        sIdx: Number(sIdx),
        qty,
        bigo: latestBigo[sIdx] || ''
      }));
});

// 폐기 이력 리스트 (regDt 역순)
const discardHistory = computed(() => {
  const list = props.equipment?.discards || [];
  return [...list].sort((a, b) => {
    const ad = a.regDt || a.discardDt || '';
    const bd = b.regDt || b.discardDt || '';
    return bd.localeCompare(ad);
  });
});

// 수리/점검 이력 리스트 (regDt 역순)
const repairHistory = computed(() => {
  const list = props.equipment?.repairs || [];
  return [...list].sort((a, b) => {
    const ad = a.regDt || a.repairDt || '';
    const bd = b.regDt || b.repairDt || '';
    return bd.localeCompare(ad);
  });
});

const REPAIR_TYPE_LABEL = { repair: '고장 수리', change: '부품 교체', etc: '기타' };

// 수리 사진 경로 → URL 배열 (쉼표 구분, /api 프록시 prefix)
const repairImageUrls = (raw) => {
  if (!raw) return [];
  return String(raw)
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => (p.startsWith('http') ? p : `/api${p.startsWith('/') ? '' : '/'}${p}`));
};

// 등록 사진 URL 목록 — imgPath는 "/uploads/a.png,/uploads/b.png" 형태
const imageUrls = computed(() => {
  const raw = props.equipment?.imgPath;
  if (!raw) return [];
  return String(raw)
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => (p.startsWith('http') ? p : `/api${p.startsWith('/') ? '' : '/'}${p}`));
});

const lightboxUrl = ref(null);
const openLightbox = (url) => { lightboxUrl.value = url; };
const closeLightbox = () => { lightboxUrl.value = null; };

const emit = defineEmits(['close', 'update']);

const detailTab = ref('info');

const STATUS_LABEL = { normal: '정상', check: '수리/점검중', fault: '고장', discarded: '폐기' };

const closeDetailModal = () => {
  emit('close');
};

const formatCurrency = (val) => {
  if (val === undefined || val === null) return '0원';
  return val.toLocaleString() + '원';
};

// ========================================================
// 모달 상세 탭용 임시(가라) 데이터 및 필터 로직
// ========================================================
const mockMovements = ref([
  { idx: 1, eqIdx: 1, date: '2026-08-10', fromSite: '본사 창고', toSite: '반포 래미안', manager: '김철수' },
  { idx: 2, eqIdx: 2, date: '2026-07-15', fromSite: '옥정8단지', toSite: '북한산힐스테이트7차', manager: '이영희' },
  { idx: 3, eqIdx: 4, date: '2026-08-01', fromSite: '반포 래미안', toSite: '본사 창고', manager: '박민수' },
]);

const mockRepairs = ref([
  { idx: 1, eqIdx: 1, date: '2026-05-20', type: '수리', content: '엔진오일 및 필터 교체', center: '블루핸즈 강남점', cost: 150000 },
  { idx: 2, eqIdx: 2, date: '2026-06-11', type: '점검', content: '모터 정기 점검 (이상무)', center: '자체 점검', cost: 0 },
  { idx: 3, eqIdx: 4, date: '2026-08-15', type: '수리', content: '흡입 모터 고장 교체', center: 'LG전자 서비스', cost: 120000 },
]);

const mockTransactions = ref([
  { idx: 1, eqIdx: 1, date: '2023-01-15', type: 'BUY', partner: '현대자동차', qty: 1, price: 21000000 },
  { idx: 2, eqIdx: 2, date: '2025-04-10', type: 'GET', partner: '(주)크린환경 (양수)', qty: 1, price: 500000 },
  { idx: 3, eqIdx: 3, date: '2026-08-01', type: 'BUY', partner: '안전물산', qty: 500, price: 250000 },
  { idx: 4, eqIdx: 4, date: '2024-11-20', type: 'BUY', partner: '클린테크', qty: 3, price: 1500000 },
]);

// 요구사항: 폐기 이력도 이 모달 안에서만 관리 (임시 데이터)
const mockDiscards = ref([]);

const currentMovements = computed(() => mockMovements.value.filter(m => m.eqIdx === props.equipment?.idx));
const currentRepairs = computed(() => mockRepairs.value.filter(r => r.eqIdx === props.equipment?.idx));
const currentTransactions = computed(() => mockTransactions.value.filter(t => t.eqIdx === props.equipment?.idx));
const currentDiscards = computed(() => mockDiscards.value.filter(d => d.eqIdx === props.equipment?.idx));

// ========================================================
// 장비 이동 폼
// ========================================================
// const ALL_SITES = ['본사 창고', '반포 래미안', '북한산힐스테이트7차', '옥정8단지', 'LH 위례 6단지', '강서 대명 강동'];

const showMoveModal = ref(false);
const moveForm = ref({
  fromSite: '',
  toSite: '',
  qty: 1,
  maxQty: 1,
  date: new Date().toISOString().slice(0, 10),
  manager: ''
});

const openMoveForm = (assign) => {
  moveForm.value = {
    fromSite: assign.sIdx,          // 출발지 sIdx (0=본사)
    toSite: '',
    qty: 1,
    maxQty: assign.qty,
    date: new Date().toISOString().slice(0, 10),
    manager: ''
  };
  showMoveModal.value = true;
};

const executeMove = () => {
  const { fromSite, toSite, qty, maxQty, date, manager } = moveForm.value;

  if (toSite === '' || toSite === null || toSite === undefined) return alert('도착지를 선택해주세요.');
  if (String(fromSite) === String(toSite)) return alert('출발지와 도착지가 동일합니다.');
  if (qty < 1 || qty > maxQty) return alert(`수량은 1에서 ${maxQty} 사이여야 합니다.`);

  const payload = {
    eqIdx: props.equipment?.idx,
    fromSite: fromSite,
    toSite: toSite,
    qty: qty,
    date: date,
    manager: manager || ''
  };

  axios.put(`/api/v1/equipment/move`, payload)
      .then(() => {
        alert('장비 이동 처리가 완료되었습니다.');
        showMoveModal.value = false;
        emit('update', { type: 'move', data: moveForm.value });
      })
      .catch((err) => {
        console.error(err);
        alert('장비 이동 처리 중 오류가 발생했습니다.');
      });
};

// ========================================================
// 수리/점검 등록 폼
// ========================================================
const showRepairModal = ref(false);
const beforeFileInput = ref(null);
const beforeFiles = ref([]); // { file, previewUrl }
const onBeforeFileChange = (e) => {
  const files = e.target.files;
  if (!files) return;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    beforeFiles.value.push({ file: f, previewUrl: URL.createObjectURL(f) });
  }
  e.target.value = '';
};
const removeBeforeFile = (i) => {
  const [removed] = beforeFiles.value.splice(i, 1);
  if (removed) URL.revokeObjectURL(removed.previewUrl);
};

// 수리 완료 처리
const showCompleteModal = ref(false);
const completeForm = ref({ repairIdx: null, eqIdx: null, completedDt: '', restoreStatus: true });
const afterFileInput = ref(null);
const afterFiles = ref([]);
const onAfterFileChange = (e) => {
  const files = e.target.files;
  if (!files) return;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    afterFiles.value.push({ file: f, previewUrl: URL.createObjectURL(f) });
  }
  e.target.value = '';
};
const removeAfterFile = (i) => {
  const [removed] = afterFiles.value.splice(i, 1);
  if (removed) URL.revokeObjectURL(removed.previewUrl);
};
const openCompleteModal = (repair) => {
  completeForm.value = {
    repairIdx: repair.idx,
    eqIdx: props.equipment?.idx,
    completedDt: new Date().toISOString().slice(0, 10),
    restoreStatus: true
  };
  afterFiles.value.forEach(f => URL.revokeObjectURL(f.previewUrl));
  afterFiles.value = [];
  showCompleteModal.value = true;
};
const executeComplete = () => {
  const fd = new FormData();
  if (completeForm.value.eqIdx) fd.append('eqIdx', completeForm.value.eqIdx);
  fd.append('completedDt', completeForm.value.completedDt || new Date().toISOString().slice(0, 10));
  fd.append('restoreStatus', completeForm.value.restoreStatus ? 'true' : 'false');
  afterFiles.value.forEach(f => fd.append('afterImgPath', f.file));

  axios.post(`/api/v1/equipment/repair/${completeForm.value.repairIdx}/complete`, fd)
      .then(() => {
        alert('수리 완료 처리되었습니다.');
        showCompleteModal.value = false;
        emit('update', { type: 'complete' });
      })
      .catch(err => {
        console.error(err);
        alert('수리 완료 처리 중 오류가 발생했습니다.');
      });
};
const repairForm = ref({
  date: new Date().toISOString().slice(0, 10),
  startDt: '',
  endDt: '',
  type: 'repair',
  content: '',
  center: '',
  cost: 0,
  expense: 0, //출장비
  updateStatus: false
});

const openRepairForm = () => {
  repairForm.value = {
    date: new Date().toISOString().slice(0, 10),
    startDt: '',
    endDt: '',
    type: 'repair',
    content: '',
    center: '',
    cost: 0,
    expense: 0,
    updateStatus: props.equipment?.status !== 'check'
  };
  showRepairModal.value = true;
};

const executeRepair = () => {
  if (!repairForm.value.content) return alert('수리 또는 점검 내용을 입력해주세요.');
  if (!repairForm.value.date) return alert('발생 일자를 선택해주세요.');

  const fd = new FormData();
  fd.append('eqIdx', props.equipment?.idx);
  fd.append('repairDt', repairForm.value.date);
  fd.append('repairType', repairForm.value.type);
  if (repairForm.value.startDt) fd.append('startDt', repairForm.value.startDt);
  if (repairForm.value.endDt) fd.append('endDt', repairForm.value.endDt);
  fd.append('content', repairForm.value.content);
  fd.append('repairCenter', repairForm.value.center || '자체 점검');
  fd.append('cost', String(Number(repairForm.value.cost) || 0));
  fd.append('expense', String(Number(repairForm.value.expense) || 0));
  fd.append('updateStatus', repairForm.value.updateStatus ? 'true' : 'false');
  beforeFiles.value.forEach(f => fd.append('beforeImgPath', f.file));

  axios.post(`/api/v1/equipment/repair`, fd)
      .then(() => {
        alert('수리/점검 내역이 성공적으로 등록되었습니다.');
        showRepairModal.value = false;
        beforeFiles.value.forEach(f => URL.revokeObjectURL(f.previewUrl));
        beforeFiles.value = [];
        emit('update', { type: 'repair', data: repairForm.value });
      })
      .catch((err) => {
        console.error(err);
        alert('수리/점검 등록 중 오류가 발생했습니다.');
      });
};

// ========================================================
// 요구사항: 장비 폐기 처리 폼
//   props.equipment 는 부모(EquipmentListPage)의 equipments 배열 안 객체와 같은 참조이므로,
//   여기서 직접 mutate 하면 부모 쪽 코드를 건드리지 않아도 목록에 바로 반영된다.
// ========================================================
const showDiscardModal = ref(false);
const discardForm = ref({
  siteName: '반포 래미안',
  qty: 1,
  maxQty: 1,
  date: new Date().toISOString().slice(0, 10),
  reason: ''
});

const openDiscardForm = (assign) => {
  discardForm.value = {
    sIdx: assign.sIdx,              // 폐기 대상 사이트 sIdx
    qty: assign.qty,                // 기본값은 해당 배치 수량 전체
    maxQty: assign.qty,
    date: new Date().toISOString().slice(0, 10),
    reason: ''
  };
  showDiscardModal.value = true;
};

const executeDiscard = async () => {
  const { sIdx, qty, maxQty, date, reason } = discardForm.value;
  const siteName = siteLabel(sIdx);

  if (qty < 1 || qty > maxQty) return alert(`수량은 1에서 ${maxQty} 사이여야 합니다.`);
  if (!reason.trim()) return alert('폐기 사유를 입력해주세요.');

  const isFullDiscard = displayAssignments.value.length === 1 && displayAssignments.value[0].qty === qty;

  const confirmMsg = isFullDiscard
      ? '이 장비의 남은 수량 전체를 폐기 처리합니다.\n폐기 후에는 목록에서 "폐기" 상태로 표시되며 되돌릴 수 없습니다.\n계속하시겠습니까?'
      : `"${siteName}"의 ${qty}개를 폐기 처리합니다.\n계속하시겠습니까?`;

  if (!await window.customConfirm(confirmMsg, 'warning')) return;

  const payload = {
    eqIdx: props.equipment?.idx,
    sIdx: sIdx,
    qty: qty,
    discardDt: date,
    reason: reason
  };

  axios.post(`/api/v1/equipment/discard`, payload)
      .then(() => {
        alert('폐기 처리가 완료되었습니다.');
        showDiscardModal.value = false;
        emit('update', { type: 'discard', data: discardForm.value });
      })
      .catch((err) => {
        console.error(err);
        alert('폐기 처리 중 오류가 발생했습니다.');
      });
};

// 모달이 열릴 때 기본 탭 초기화
import { watch } from 'vue';
import axios from "axios";
watch(() => props.show, (newVal) => {
  if (newVal) {
    detailTab.value = props.equipment?.assignments ? 'assignment' : 'info';
  }
});
</script>

<template>
  <div v-if="show && equipment" class="modal-overlay" @click.self="closeDetailModal" style="z-index: 1000;">
    <div class="modal-content modal-box-wide" style="width: 800px; background: var(--bg-surface); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div class="modal-header">
        <h3 style="margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;">
          <span v-if="equipment.type" class="type-badge type-equip" style="margin-right: 8px;">
            {{ typeDisplay }}
          </span>
          <i v-else class="mdi mdi-toolbox" style="margin-right: 8px;"></i>
          {{ equipment.name }} 상세 정보
          <span v-if="equipment.status === 'discarded'" class="status-badge status-discarded" style="margin-left: 8px;">폐기됨</span>
        </h3>
        <button class="btn-close" @click="closeDetailModal" style="background: none; border: none; font-size: 20px; color: #6b7280; cursor: pointer;"><i class="mdi mdi-close"></i></button>
      </div>

      <div class="modal-tabs" style="display: flex; background: var(--bg-canvas); border-bottom: 1px solid var(--border-color);">
        <button v-if="!equipment.assignments" :class="{ active: detailTab === 'info' }" @click="detailTab = 'info'">기본 정보</button>
        <button v-if="equipment.assignments" :class="{ active: detailTab === 'assignment' }" @click="detailTab = 'assignment'">현재 배치 현황</button>
        <button :class="{ active: detailTab === 'movement' }" @click="detailTab = 'movement'">단지 이동 이력</button>
        <button :class="{ active: detailTab === 'repair' }" @click="detailTab = 'repair'">수리/점검 대장</button>
        <button :class="{ active: detailTab === 'discard' }" @click="detailTab = 'discard'">폐기 이력</button>
        <button :class="{ active: detailTab === 'transaction' }" @click="detailTab = 'transaction'">구매/양도 내역</button>
      </div>

      <div class="modal-body" style="padding: 24px; overflow-y: auto; min-height: 300px;">
        <!-- 1-a) 기본 정보 탭 (현장 상세 페이지용) -->
        <div v-if="detailTab === 'info'">
          <!-- 등록 사진 갤러리 -->
          <div v-if="imageUrls.length > 0" class="equip-image-gallery">
            <div v-for="(url, i) in imageUrls" :key="i" class="equip-image-thumb" @click="openLightbox(url)">
              <img :src="url" :alt="`장비 사진 ${i + 1}`" @error="e => e.target.style.display='none'" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; font-size:14px;">
            <div><strong style="color:var(--text-sub);">모델명:</strong> {{ equipment.model || '-' }}</div>
            <div><strong style="color:var(--text-sub);">고유번호(S/N):</strong> {{ equipment.serialNo || '-' }}</div>
            <div><strong style="color:var(--text-sub);">도입(구매)일:</strong> {{ equipment.purchaseDate || '-' }}</div>
            <div><strong style="color:var(--text-sub);">현재 상태:</strong> {{ STATUS_LABEL[equipment.status] || equipment.status || '-' }}</div>
            <div style="grid-column: 1 / -1;"><strong style="color:var(--text-sub);">보관/지급 위치:</strong> {{ equipment.location || '-' }}</div>
            <div style="grid-column: 1 / -1;"><strong style="color:var(--text-sub);">보유 수량:</strong> <span class="fw-bold text-primary">{{ equipment.quantity || equipment.totalQty }}</span></div>
          </div>
        </div>

        <!-- 1-b) 현재 배치 탭 (장비 목록 페이지용) -->
        <div v-if="detailTab === 'assignment'">
          <div v-if="imageUrls.length > 0" class="equip-image-gallery">
            <div v-for="(url, i) in imageUrls" :key="i" class="equip-image-thumb" @click="openLightbox(url)">
              <img :src="url" :alt="`장비 사진 ${i + 1}`" @error="e => e.target.style.display='none'" />
            </div>
          </div>
          <div class="info-row"><strong>모델명:</strong> {{ equipment.model }}</div>
          <div class="info-row"><strong>고유번호:</strong> {{ equipment.serialNo }}</div>
          <div class="info-row" style="margin-top: 12px;">
            <strong>현재 투입 현장 (이동 / 폐기 처리):</strong>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
              <div v-for="(assign, i) in displayAssignments" :key="i" class="assignment-card">
                <div class="assign-info">
                  <span class="site-badge">{{ siteLabel(assign.sIdx) }}</span>
                  <strong style="color: var(--primary);">{{ assign.qty }}대(개)</strong>
                  <span v-if="assign.bigo" class="assign-bigo" :title="assign.bigo">
                    <i class="mdi mdi-text-box-outline"></i> {{ assign.bigo }}
                  </span>
                </div>
                <div class="assign-actions">
                  <button class="btn-move" @click="openMoveForm(assign)">
                    <i class="mdi mdi-truck-delivery-outline"></i> 이동
                  </button>
                  <button class="btn-discard" @click="openDiscardForm(assign)">
                    <i class="mdi mdi-trash-can-outline"></i> 폐기
                  </button>
                </div>
              </div>
              <div v-if="displayAssignments.length === 0" class="empty-state-mini">
                남아있는 배치 수량이 없습니다 (전량 폐기됨).
              </div>
            </div>
          </div>
          <p class="text-sub mt-2" style="margin-top: 8px; font-size: 13px;">※ 이동 버튼을 눌러 타 현장이나 창고로 장비를 탁송하거나, 폐기 버튼으로 사용 종료 처리할 수 있습니다. 폐기는 되돌릴 수 없습니다.</p>
        </div>

        <!-- 2) 단지 이동 이력 탭 -->
        <div v-else-if="detailTab === 'movement'">
          <div v-if="movementHistory.length === 0" class="empty-state-mini">이동 이력이 없습니다.</div>
          <table v-else class="modal-table">
            <thead>
            <tr>
              <th>이동 일자</th>
              <th>출발지</th>
              <th>도착지</th>
              <th>수량</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in movementHistory" :key="item.idx">
              <td>{{ (item.assignDt || item.regDt || '').toString().slice(0, 10) || '-' }}</td>
              <td>{{ siteLabel(item.fromSidx) }}</td>
              <td><strong>{{ siteLabel(item.sIdx) }}</strong></td>
              <td class="text-center">{{ item.assignQty }}</td>
            </tr>
            </tbody>
          </table>
        </div>

        <!-- 3) 수리/점검 대장 탭 -->
        <div v-else-if="detailTab === 'repair'">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <p class="text-sub" style="margin: 0; font-size: 13px;">※ 장비의 수리 및 정기 점검 이력을 관리합니다.</p>
            <button class="btn-add" @click="openRepairForm" style="padding:6px 12px; border-radius:4px; border:none; background:var(--primary); color:#fff; cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:600; font-size:12px;">
              <i class="mdi mdi-wrench-outline"></i> 수리/점검 등록
            </button>
          </div>
          <div v-if="repairHistory.length === 0" class="empty-state-mini">수리 및 점검 내역이 없습니다.</div>
          <table v-else class="modal-table">
            <thead>
            <tr>
              <th>일자</th>
              <th>구분</th>
              <th>점검/수리 내용</th>
              <th>수리 업체</th>
              <th>사진 (전/후)</th>
              <th>비용</th>
              <th>상태</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in repairHistory" :key="item.idx">
              <td>{{ (item.repairDt || item.regDt || '').toString().slice(0, 10) || '-' }}</td>
              <td>
                  <span :class="['type-badge', item.repairType === 'repair' ? 'type-car' : (item.repairType === 'change' ? 'type-equip' : 'type-consumable')]">
                    {{ REPAIR_TYPE_LABEL[item.repairType] || item.repairType }}
                  </span>
              </td>
              <td>{{ item.content }}</td>
              <td>{{ item.repairCenter || '-' }}</td>
              <td>
                <div class="repair-photo-cell">
                  <div class="photo-group">
                    <span class="photo-label">전</span>
                    <template v-if="repairImageUrls(item.beforeImgPath).length > 0">
                      <img v-for="(url, i) in repairImageUrls(item.beforeImgPath).slice(0, 2)" :key="`b${i}`"
                           :src="url" class="repair-thumb-mini" @click="openLightbox(url)" @error="e => e.target.style.display='none'" />
                      <span v-if="repairImageUrls(item.beforeImgPath).length > 2" class="photo-more">+{{ repairImageUrls(item.beforeImgPath).length - 2 }}</span>
                    </template>
                    <span v-else class="text-muted" style="font-size: 11px;">-</span>
                  </div>
                  <div class="photo-group">
                    <span class="photo-label photo-label-after">후</span>
                    <template v-if="repairImageUrls(item.afterImgPath).length > 0">
                      <img v-for="(url, i) in repairImageUrls(item.afterImgPath).slice(0, 2)" :key="`a${i}`"
                           :src="url" class="repair-thumb-mini" @click="openLightbox(url)" @error="e => e.target.style.display='none'" />
                      <span v-if="repairImageUrls(item.afterImgPath).length > 2" class="photo-more">+{{ repairImageUrls(item.afterImgPath).length - 2 }}</span>
                    </template>
                    <span v-else class="text-muted" style="font-size: 11px;">-</span>
                  </div>
                </div>
              </td>
              <td style="color: var(--danger); font-weight: 600;">{{ formatCurrency(item.cost) }}</td>
              <td class="text-center">
                <span v-if="item.completedDt" class="repair-status-done">
                  <i class="mdi mdi-check-circle"></i> 완료
                  <small style="display:block; color:var(--text-muted); font-size:10px;">{{ item.completedDt.toString().slice(0,10) }}</small>
                </span>
                <button v-else class="btn-complete" @click="openCompleteModal(item)">
                  <i class="mdi mdi-check-circle-outline"></i> 완료
                </button>
              </td>
            </tr>
            </tbody>
          </table>
        </div>

        <!-- 4) 폐기 이력 탭 (신규 추가) -->
        <div v-else-if="detailTab === 'discard'">
          <p class="text-sub" style="margin: 0 0 12px; font-size: 13px;">※ 이 장비에 대한 폐기 처리 이력입니다. 배치 현황 탭의 "폐기" 버튼으로 새로 등록할 수 있습니다.</p>
          <div v-if="discardHistory.length === 0" class="empty-state-mini">폐기 이력이 없습니다.</div>
          <table v-else class="modal-table">
            <thead>
            <tr>
              <th>일자</th>
              <th>현장</th>
              <th>수량</th>
              <th>사유</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in discardHistory" :key="item.idx">
              <td>{{ (item.discardDt || item.regDt || '').toString().slice(0, 10) || '-' }}</td>
              <td>{{ siteLabel(item.sIdx) }}</td>
              <td>{{ item.qty }}</td>
              <td>{{ item.reason || '-' }}</td>
            </tr>
            </tbody>
          </table>
        </div>

        <!-- 5) 구매/양도 내역 탭 -->
        <div v-else-if="detailTab === 'transaction'">
          <div v-if="currentTransactions.length === 0" class="empty-state-mini">거래 이력이 없습니다.</div>
          <table v-else class="modal-table">
            <thead>
            <tr>
              <th>일자</th>
              <th>구분</th>
              <th>거래처 (대상)</th>
              <th>수량</th>
              <th>금액</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in currentTransactions" :key="item.idx">
              <td>{{ item.date }}</td>
              <td>
                  <span :class="['type-badge', item.type === 'BUY' ? 'bg-green' : (item.type === 'SELL' ? 'bg-red' : 'bg-blue')]">
                    {{ item.type === 'BUY' ? '구매' : (item.type === 'SELL' ? '양도' : '양수') }}
                  </span>
              </td>
              <td>{{ item.partner }}</td>
              <td>{{ item.qty }}</td>
              <td style="font-weight: 600;">{{ formatCurrency(item.price) }}</td>
            </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>

  <!-- ── 5) 장비 이동 폼 모달 ── -->
  <div v-if="showMoveModal" class="modal-overlay" style="z-index: 1100;" @click.self="showMoveModal = false">
    <div class="modal-content" style="max-width: 440px; width: 100%; background: var(--bg-surface); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div class="modal-header">
        <h3 style="margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 6px;"><i class="mdi mdi-truck-delivery-outline"></i> 장비 이동 처리</h3>
        <button class="btn-close" @click="showMoveModal = false" style="background: none; border: none; font-size: 20px; color: #6b7280; cursor: pointer;"><i class="mdi mdi-close"></i></button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <div class="move-form-group">
          <label>출발지</label>
          <SiteSelect v-model="moveForm.fromSite" :include-hq="true" :allow-empty="false" disabled />
        </div>
        <div class="move-form-group">
          <label>도착지</label>
          <SiteSelect v-model="moveForm.toSite" :include-hq="true" :allow-empty="false" />
        </div>
        <div class="move-form-group">
          <label>이동 수량 (최대 {{ moveForm.maxQty }}개)</label>
          <input type="number" v-model.number="moveForm.qty" min="1" :max="moveForm.maxQty" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>이동 일자</label>
          <input type="date" v-model="moveForm.date" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>담당자 (선택)</label>
          <input type="text" v-model="moveForm.manager" placeholder="탁송자 입력" class="form-input" />
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color, #e5e7eb); display: flex; gap: 8px; justify-content: flex-end;">
        <button @click="showMoveModal = false" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #e5e7eb; background: var(--bg-surface); cursor: pointer;">취소</button>
        <button @click="executeMove" style="padding: 8px 16px; border-radius: 6px; border: none; background: var(--primary, #4f46e5); color: #fff; cursor: pointer; font-weight: 600;">이동 확정</button>
      </div>
    </div>
  </div>

  <!-- ── 6) 수리/점검 등록 모달 ── -->
  <div v-if="showRepairModal" class="modal-overlay" style="z-index: 1100;" @click.self="showRepairModal = false">
    <div class="modal-content" style="max-width: 600px; background: var(--bg-surface); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div class="modal-header">
        <h3 style="margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;"><i class="mdi mdi-wrench-outline" style="margin-right: 4px;"></i> 수리 내역 등록</h3>
        <button class="btn-close" @click="showRepairModal = false" style="background: none; border: none; font-size: 20px; color: #6b7280; cursor: pointer;"><i class="mdi mdi-close"></i></button>
      </div>
      <div class="modal-body">
        <div class="move-form-group">
          <label>수리 유형</label>
          <select v-model="repairForm.type" class="form-input">
            <option value="repair">고장 수리</option>
            <option value="change">부품 교체</option>
            <option value="etc">기타 수리</option>
          </select>
        </div>
        <div class="move-form-group">
          <label>발생 일자</label>
          <input type="date" v-model="repairForm.date" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>수리 시작일</label>
          <input type="date" v-model="repairForm.startDt" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>수리 종료일</label>
          <input type="date" v-model="repairForm.endDt" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>점검 및 수리 내용</label>
          <input type="text" v-model="repairForm.content" placeholder="예: 필터 교체 및 모터 점검" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>수리 업체 (카센터 등)</label>
          <input type="text" v-model="repairForm.center" placeholder="자체 점검인 경우 비워두세요" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>발생 비용 (원)</label>
          <input type="number" v-model.number="repairForm.cost" min="0" step="1000" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>출장 비용 (원)</label>
          <input type="number" v-model.number="repairForm.expense" min="0" step="1000" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>수리 전 사진 (복수 업로드 가능)</label>
          <input type="file" ref="beforeFileInput" multiple accept="image/*" @change="onBeforeFileChange" hidden />
          <button type="button" class="btn-upload-sm" @click="beforeFileInput?.click()">
            <i class="mdi mdi-camera-plus-outline"></i> 사진 선택
          </button>
          <div v-if="beforeFiles.length > 0" class="repair-thumb-row">
            <div v-for="(f, i) in beforeFiles" :key="i" class="repair-thumb">
              <img :src="f.previewUrl" alt="before" />
              <button type="button" class="repair-thumb-del" @click="removeBeforeFile(i)"><i class="mdi mdi-close"></i></button>
            </div>
          </div>
        </div>
        <div class="move-form-group" style="flex-direction: row; align-items: center; gap: 8px; margin-top: 6px;">
          <input type="checkbox" id="updateStatusChk" v-model="repairForm.updateStatus" style="width: 16px; height: 16px; cursor: pointer;" />
          <label for="updateStatusChk" style="margin: 0; cursor: pointer; color: var(--danger, #ef4444);">
            저장 시 장비 상태를 '수리/점검중'으로 변경
          </label>
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color, #e5e7eb); display: flex; gap: 8px; justify-content: flex-end;">
        <button @click="showRepairModal = false" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #e5e7eb; background: var(--bg-surface); cursor: pointer;">취소</button>
        <button @click="executeRepair" style="padding: 8px 16px; border-radius: 6px; border: none; background: var(--primary, #4f46e5); color: #fff; cursor: pointer; font-weight: 600;">등록 완료</button>
      </div>
    </div>
  </div>

  <!-- ── 수리 완료 처리 모달 ── -->
  <div v-if="showCompleteModal" class="modal-overlay" style="z-index: 1100;" @click.self="showCompleteModal = false">
    <div class="modal-content" style="max-width: 500px; background: var(--bg-surface); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div class="modal-header">
        <h3 style="margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; color: var(--success, #10b981);">
          <i class="mdi mdi-check-circle-outline" style="margin-right: 4px;"></i> 수리 완료 처리
        </h3>
        <button class="btn-close" @click="showCompleteModal = false" style="background: none; border: none; font-size: 20px; color: #6b7280; cursor: pointer;"><i class="mdi mdi-close"></i></button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <div class="move-form-group">
          <label>완료 일자</label>
          <input type="date" v-model="completeForm.completedDt" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>수리 후 사진 (복수 업로드 가능)</label>
          <input type="file" ref="afterFileInput" multiple accept="image/*" @change="onAfterFileChange" hidden />
          <button type="button" class="btn-upload-sm" @click="afterFileInput?.click()">
            <i class="mdi mdi-camera-plus-outline"></i> 사진 선택
          </button>
          <div v-if="afterFiles.length > 0" class="repair-thumb-row">
            <div v-for="(f, i) in afterFiles" :key="i" class="repair-thumb">
              <img :src="f.previewUrl" alt="after" />
              <button type="button" class="repair-thumb-del" @click="removeAfterFile(i)"><i class="mdi mdi-close"></i></button>
            </div>
          </div>
        </div>
        <div class="move-form-group" style="flex-direction: row; align-items: center; gap: 8px; margin-top: 6px;">
          <input type="checkbox" id="restoreStatusChk" v-model="completeForm.restoreStatus" style="width: 16px; height: 16px; cursor: pointer;" />
          <label for="restoreStatusChk" style="margin: 0; cursor: pointer; color: var(--text-sub);">
            완료 시 장비 상태를 '정상'으로 복원
          </label>
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color, #e5e7eb); display: flex; gap: 8px; justify-content: flex-end;">
        <button @click="showCompleteModal = false" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #e5e7eb; background: var(--bg-surface); cursor: pointer;">취소</button>
        <button @click="executeComplete" style="padding: 8px 16px; border-radius: 6px; border: none; background: var(--success, #10b981); color: #fff; cursor: pointer; font-weight: 600;">완료 처리</button>
      </div>
    </div>
  </div>

  <!-- ── 7) 장비 폐기 처리 모달 (신규 추가, 요구사항) ── -->
  <div v-if="showDiscardModal" class="modal-overlay" style="z-index: 1100;" @click.self="showDiscardModal = false">
    <div class="modal-content" style="max-width: 400px; background: var(--bg-surface); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div class="modal-header">
        <h3 style="margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; color: var(--danger, #ef4444);">
          <i class="mdi mdi-trash-can-outline" style="margin-right: 4px;"></i> 장비 폐기 처리
        </h3>
        <button class="btn-close" @click="showDiscardModal = false" style="background: none; border: none; font-size: 20px; color: #6b7280; cursor: pointer;"><i class="mdi mdi-close"></i></button>
      </div>
      <div class="modal-body">
        <p class="discard-warning">
          <i class="mdi mdi-alert-outline"></i> 폐기 처리는 되돌릴 수 없습니다. 보유 수량이 전부 소진되면 이 장비는 목록에서 "폐기" 상태로 표시됩니다.
        </p>
        <div class="move-form-group">
          <label>대상 현장</label>
          <SiteSelect v-model="discardForm.sIdx" :include-hq="true" :allow-empty="false" disabled />
        </div>
        <div class="move-form-group">
          <label>폐기 수량 (최대 {{ discardForm.maxQty }}개)</label>
          <input type="number" v-model.number="discardForm.qty" min="1" :max="discardForm.maxQty" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>폐기 일자</label>
          <input type="date" v-model="discardForm.date" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>폐기 사유 <span style="color: var(--danger, #ef4444);">*</span></label>
          <input type="text" v-model="discardForm.reason" placeholder="예: 노후화로 인한 사용 불가" class="form-input" />
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color, #e5e7eb); display: flex; gap: 8px; justify-content: flex-end;">
        <button @click="showDiscardModal = false" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #e5e7eb; background: var(--bg-surface); cursor: pointer;">취소</button>
        <button @click="executeDiscard" style="padding: 8px 16px; border-radius: 6px; border: none; background: var(--danger, #ef4444); color: #fff; cursor: pointer; font-weight: 600;">폐기 확정</button>
      </div>
    </div>
  </div>

  <!-- 이미지 라이트박스 -->
  <div v-if="lightboxUrl" class="equip-lightbox" @click.self="closeLightbox" style="z-index: 1100;">
    <button class="equip-lightbox-close" @click="closeLightbox"><i class="mdi mdi-close"></i></button>
    <img :src="lightboxUrl" alt="장비 사진 확대" />
  </div>
</template>

<style scoped>
/* ── 뱃지 & 유틸 ── */
.type-badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.type-car { background: #e0f2fe; color: #0284c7; }
.type-equip { background: #fef9c3; color: #ca8a04; }
.type-consumable { background: #f3f4f6; color: #4b5563; }
.bg-green { background: rgba(16,185,129,.1); color: var(--success); }
.bg-red { background: rgba(239,68,68,.1); color: var(--danger); }
.bg-blue { background: #e0f2fe; color: #0284c7; }
.site-badge { background: #e0e7ff; color: #4338ca; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.font-weight-bold { font-weight: 600; color: var(--text-main, #111827); }
.text-sub { color: var(--text-sub, #4b5563); }
.text-primary { color: var(--primary); }

/* ── 상태 뱃지 (요구사항: 폐기 상태 표시) ── */
.status-badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.status-discarded { background: #f3f4f6; color: #6b7280; }

/* ── 빈 상태 (Empty State) ── */
.empty-state-mini { text-align: center; padding: 40px 0; color: #9ca3af; font-size: 13px; }

/* ── 모달 ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
.modal-tabs button { flex: 1; padding: 14px; background: none; border: none; font-size: 13px; font-weight: 600; color: var(--text-sub, #4b5563); cursor: pointer; border-bottom: 2px solid transparent; }
.modal-tabs button:hover { color: var(--primary, #4f46e5); }
.modal-tabs button.active {
  color: var(--primary, #4f46e5);
  border-bottom-color: var(--primary, #4f46e5);
  background: var(--bg-surface);
}
.info-row { margin-bottom: 10px; font-size: 14px; color: var(--text-main, #111827); }
.modal-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.modal-table th, .modal-table td { padding: 12px; border-bottom: 1px solid var(--border-color, #e5e7eb); text-align: left; }
.modal-table th { background: var(--bg-canvas, #f9fafb); color: var(--text-sub, #4b5563); font-weight: 600; }

/* ── 배치 탭 이동/폐기 버튼 & 카드 ── */
.assignment-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-surface);
}
.assign-info { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.assign-bigo {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 4px;
  background: var(--bg-canvas, #f9fafb);
  color: var(--text-sub, #4b5563);
  font-size: 12px; font-weight: 500;
  max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.assign-bigo i { font-size: 13px; opacity: 0.7; }
.assign-actions { display: flex; align-items: center; gap: 6px; }
.btn-move { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--primary); border: 1px solid var(--primary, #4f46e5); color: #fff; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-move:hover { background: var(--primary-hover); }
.btn-discard { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: #fff; border: 1px solid var(--danger, #ef4444); color: var(--danger, #ef4444); border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-discard:hover { background: var(--danger, #ef4444); color: #fff; }

/* ── 폐기 경고 문구 ── */
.discard-warning {
  display: flex; align-items: flex-start; gap: 6px; margin: 0 0 16px;
  padding: 10px 12px; background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.25);
  border-radius: 8px; font-size: 12px; color: var(--danger, #ef4444); line-height: 1.5;
}

/* ── 장비 이동/폐기 폼 (Sub Modal) ── */
.move-form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.move-form-group label { font-size: 12px; font-weight: 600; color: var(--text-main, #111827); }
.form-input { padding: 10px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; font-size: 13px; outline: none; }
.form-input:focus { border-color: var(--primary, #4f46e5); box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1); }
.bg-gray { background: var(--bg-canvas, #f9fafb); color: var(--text-sub, #4b5563); }

/* ── 장비 사진 갤러리 ── */
.equip-image-gallery { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.equip-image-thumb { width: 100px; height: 100px; border-radius: 8px; overflow: hidden; cursor: pointer; border: 1px solid var(--border-color, #e5e7eb); background: var(--bg-canvas, #f9fafb); transition: transform 0.15s, box-shadow 0.15s; }
.equip-image-thumb:hover { transform: scale(1.03); box-shadow: 0 4px 10px rgba(0,0,0,0.15); }
.equip-image-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* ── 라이트박스 ── */
.equip-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; }
.equip-lightbox img { max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
.equip-lightbox-close { position: absolute; top: 20px; right: 24px; background: rgba(255,255,255,0.1); border: none; color: #fff; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; transition: background 0.15s; }
.equip-lightbox-close:hover { background: rgba(255,255,255,0.25); }

/* ── 수리 사진 업로드 / 썸네일 ── */
.btn-upload-sm {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 12px; border: 1px dashed var(--primary, #4f46e5);
  background: rgba(79,70,229,0.05); color: var(--primary, #4f46e5);
  border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all .15s;
}
.btn-upload-sm:hover { background: rgba(79,70,229,0.12); }

.repair-thumb-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.repair-thumb {
  position: relative; width: 80px; height: 80px; border-radius: 6px; overflow: hidden;
  border: 1px solid var(--border-color, #e5e7eb); background: var(--bg-canvas, #f9fafb);
}
.repair-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.repair-thumb-del {
  position: absolute; top: 2px; right: 2px;
  width: 20px; height: 20px; border-radius: 50%;
  background: rgba(0,0,0,0.6); color: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; padding: 0;
}
.repair-thumb-del i { font-size: 14px; }

/* 수리 이력 테이블의 사진 셀 */
.repair-photo-cell { display: flex; flex-direction: column; gap: 4px; }
.photo-group { display: flex; align-items: center; gap: 4px; }
.photo-label {
  display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center;
  border-radius: 50%; background: var(--border-color, #e5e7eb); color: var(--text-sub);
  font-size: 10px; font-weight: 700; flex-shrink: 0;
}
.photo-label-after { background: rgba(16,185,129,0.15); color: var(--success, #10b981); }
.repair-thumb-mini {
  width: 32px; height: 32px; object-fit: cover; border-radius: 4px; cursor: pointer;
  border: 1px solid var(--border-color);
  transition: transform .15s;
}
.repair-thumb-mini:hover { transform: scale(1.5); z-index: 10; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.photo-more { font-size: 11px; color: var(--text-sub); font-weight: 600; }

/* 수리 완료 상태 */
.repair-status-done { color: var(--success, #10b981); font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 3px; }
.btn-complete {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 6px; border: 1px solid var(--success, #10b981);
  background: #fff; color: var(--success, #10b981);
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.btn-complete:hover { background: var(--success, #10b981); color: #fff; }
</style>