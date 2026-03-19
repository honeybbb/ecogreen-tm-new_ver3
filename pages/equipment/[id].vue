<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();
const route = useRoute();

// =============================================
// 상태 관리
// =============================================
const activeTab = ref(route.query.tab || 'distribution');
const isEditing = ref(false);
const isLoading = ref(false);

const EQUIP_CATEGORIES = ['청소기계 (탑승/보행)', '일반 청소용구', '경비/통신장비', '안전/제설장비', '기타'];
const EQUIP_STATUS_OPTIONS = [
  { value: 'normal', label: '정상', color: 'success' },
  { value: 'check', label: '수리/점검중', color: 'warning' },
  { value: 'fault', label: '고장/폐기대기', color: 'danger' }
];
const equipStatusMap = Object.fromEntries(EQUIP_STATUS_OPTIONS.map(o => [o.value, o]));

// =============================================
// 마스터 장비 데이터 (목업)
// =============================================
const equipment = ref({
  idx: 0,
  category: '',
  name: '',
  model: '',
  totalQty: 0,
  purchaseDate: '',
  price: 0,
  note: '',
  imageUrl: null
});

// 현장 배치(분배) 데이터
const distributions = ref([]);

// 이력(히스토리) 데이터
const historyLogs = ref([]);

// =============================================
// 통계 및 계산 (Computed)
// =============================================
const assignedQty = computed(() => distributions.value.reduce((acc, cur) => acc + cur.qty, 0));
const remainQty = computed(() => equipment.value.totalQty - assignedQty.value);
const faultQty = computed(() => distributions.value.filter(d => d.status === 'fault').reduce((acc, cur) => acc + cur.qty, 0));
const totalValue = computed(() => (equipment.value.price * equipment.value.totalQty).toLocaleString());

// =============================================
// 데이터 로드
// =============================================
let originalData = {};

const loadEquipmentDetail = async () => {
  isLoading.value = true;
  const equipIdx = route.params.id; // URL의 ID 값

  try {
    // API 호출 연동 (예시)
    // const res = await axios.get(`/api/v1/equipment/master/${equipIdx}`);
    // equipment.value = res.data.master;
    // distributions.value = res.data.distributions;

    // 목업 데이터 세팅
    equipment.value = {
      idx: equipIdx,
      category: '청소기계 (탑승/보행)',
      name: '탑승식 습식 바닥세정기',
      model: 'T-1000 PRO',
      totalQty: 5,
      purchaseDate: '2023-05-10',
      price: 3500000,
      note: '메인 브러시 교체 주기: 6개월\n지정 A/S 센터: 클린테크 (1588-0000)',
      imageUrl: '' // 이미지가 없으면 기본 아이콘 표시
    };

    distributions.value = [
      { assignIdx: 101, sIdx: 1, siteName: 'LH 위례 6단지', qty: 2, status: 'normal', assignDate: '2023-05-15', nextCheckDate: '2024-11-15', note: '배터리 상태 양호' },
      { assignIdx: 102, sIdx: 2, siteName: '강서 대명 강동', qty: 1, status: 'check', assignDate: '2023-06-01', nextCheckDate: '2024-05-01', note: '흡입 모터 소음으로 점검 중' },
    ];

    historyLogs.value = [
      { date: '2023-06-01', type: '배치', content: '[강서 대명 강동] 1대 현장 배치 완료' },
      { date: '2023-05-15', type: '배치', content: '[LH 위례 6단지] 2대 현장 배치 완료' },
      { date: '2023-05-10', type: '등록', content: '본사 자산 신규 등록 (총 5대 도입)' },
    ];

    originalData = JSON.parse(JSON.stringify(equipment.value));
  } catch (error) {
    console.error('장비 상세 로드 실패:', error);
    alert('데이터를 불러오는데 실패했습니다.');
  } finally {
    isLoading.value = false;
  }
};

// =============================================
// 액션 핸들러
// =============================================
const goBack = () => router.push('/equipment/list');

const changeTab = async (tabId) => {
  activeTab.value = tabId;
  await router.replace({ query: { ...route.query, tab: tabId } });
};

const toggleEdit = () => {
  if (isEditing.value) {
    if (confirm('수정을 취소하시겠습니까?')) {
      equipment.value = JSON.parse(JSON.stringify(originalData));
      isEditing.value = false;
    }
  } else {
    isEditing.value = true;
    activeTab.value = 'info'; // 수정 모드 시 기본정보 탭으로 이동
  }
};

const saveEquipment = async () => {
  if (!confirm('장비 마스터 정보를 수정하시겠습니까?')) return;
  try {
    // await axios.put(`/api/v1/equipment/master/${equipment.value.idx}`, equipment.value);
    alert('저장되었습니다.');
    isEditing.value = false;
    originalData = JSON.parse(JSON.stringify(equipment.value));
  } catch (error) {
    alert('저장 실패');
  }
};

// 배치 회수
const returnToHQ = async (assignIdx) => {
  if (!confirm('해당 현장에서 장비를 회수하시겠습니까?\n(잔여 수량으로 복귀합니다)')) return;
  try {
    // await axios.put(`/api/v1/equipment/assign/${assignIdx}/return`);
    distributions.value = distributions.value.filter(d => d.assignIdx !== assignIdx);
    alert('본사 회수 완료');
  } catch (error) {
    alert('회수 처리 실패');
  }
};

// =============================================
// 분배 상태 변경 모달
// =============================================
const isStatusModalOpen = ref(false);
const statusForm = ref({ assignIdx: null, status: '', note: '', nextCheckDate: '' });

const openStatusModal = (dist) => {
  statusForm.value = {
    assignIdx: dist.assignIdx,
    status: dist.status,
    note: dist.note,
    nextCheckDate: dist.nextCheckDate
  };
  isStatusModalOpen.value = true;
};

const saveDistStatus = async () => {
  try {
    // await axios.put(`/api/v1/equipment/assign/${statusForm.value.assignIdx}/status`, statusForm.value);
    const target = distributions.value.find(d => d.assignIdx === statusForm.value.assignIdx);
    if (target) {
      target.status = statusForm.value.status;
      target.note = statusForm.value.note;
      target.nextCheckDate = statusForm.value.nextCheckDate;
    }
    isStatusModalOpen.value = false;
    alert('상태가 업데이트 되었습니다.');
  } catch (error) {
    alert('상태 업데이트 실패');
  }
};

const isCheckOverdue = (dateStr) => {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
};

onMounted(() => {
  loadEquipmentDetail();
});
</script>

<template>
  <div class="equipment-detail-page">

    <div class="page-header">
      <div class="header-left">
        <button @click="goBack" class="btn-back"><i class="mdi mdi-arrow-left"></i></button>
        <div>
          <h1 class="page-title"><i class="mdi mdi-text-box-search-outline"></i> 장비 정보 상세</h1>
          <p class="page-subtitle">장비의 세부 스펙과 전 현장 배치 상황을 확인합니다.</p>
        </div>
      </div>
      <div class="header-actions">
        <template v-if="!isEditing">
          <button @click="toggleEdit" class="btn-edit"><i class="mdi mdi-pencil-outline"></i> 수정</button>
        </template>
        <template v-else>
          <button @click="toggleEdit" class="btn-cancel"><i class="mdi mdi-close"></i> 취소</button>
          <button @click="saveEquipment" class="btn-save"><i class="mdi mdi-check"></i> 저장</button>
        </template>
      </div>
    </div>

    <div class="integrated-paper">
      <div class="profile-section">
        <div class="profile-banner"></div>
        <div class="profile-content">
          <div class="profile-photo-wrapper">
            <div class="profile-photo">
              <img v-if="equipment.imageUrl" :src="equipment.imageUrl" alt="장비 사진" />
              <i v-else class="mdi mdi-toolbox-outline"></i>
            </div>
          </div>

          <div class="profile-info">
            <div class="profile-main">
              <span class="category-badge">{{ equipment.category }}</span>
              <h2 class="profile-name">{{ equipment.name }} <small class="text-muted">({{ equipment.model || '모델명 없음' }})</small></h2>
            </div>
            <div class="profile-details">
              <div class="detail-item"><i class="mdi mdi-barcode"></i> ID: EQ-{{ String(equipment.idx).padStart(4, '0') }}</div>
              <div class="detail-item"><i class="mdi mdi-calendar-check-outline"></i> 도입일: {{ equipment.purchaseDate || '-' }}</div>
            </div>
          </div>

          <div class="profile-stats">
            <div class="stat-item">
              <div class="stat-icon blue"><i class="mdi mdi-package-variant-closed"></i></div>
              <div class="stat-text">
                <span class="label">총 구매 수량</span>
                <span class="value">{{ equipment.totalQty }}대</span>
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-icon green"><i class="mdi mdi-truck-delivery-outline"></i></div>
              <div class="stat-text">
                <span class="label">현장 배치됨</span>
                <span class="value text-primary">{{ assignedQty }}대</span>
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-icon" :class="remainQty > 0 ? 'orange' : 'gray'"><i class="mdi mdi-warehouse"></i></div>
              <div class="stat-text">
                <span class="label">본사 잔여(예비)</span>
                <span class="value" :class="{'text-warning': remainQty > 0, 'text-red': remainQty === 0}">{{ remainQty }}대</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="integrated-tabs">
        <button :class="['tab-button', { active: activeTab === 'distribution' }]" @click="changeTab('distribution')">
          <i class="mdi mdi-map-marker-multiple-outline"></i> 현장 배치 현황
        </button>
        <button :class="['tab-button', { active: activeTab === 'info' }]" @click="changeTab('info')">
          <i class="mdi mdi-information-outline"></i> 자산 상세 정보
        </button>
        <button :class="['tab-button', { active: activeTab === 'history' }]" @click="changeTab('history')">
          <i class="mdi mdi-history"></i> 장비 이력
        </button>
      </div>

      <div class="integrated-content">

      <div v-show="activeTab === 'distribution'" class="tab-panel">

        <!--div class="action-bar-right mb-3">
          <button class="btn-primary-outline" @click="router.push('/equipment/list')">
            <i class="mdi mdi-plus-box-outline"></i> 잔여 수량 신규 배치하기
          </button>
        </div-->

        <div v-if="distributions.length === 0" class="empty-state">
          <i class="mdi mdi-warehouse"></i>
          <p>현장에 배치된 내역이 없습니다.</p>
          <span>현재 총 {{ remainQty }}대가 모두 본사 창고에 보관 중입니다.</span>
        </div>

        <div v-else class="table-scroll-container">
          <table class="data-table">
            <thead>
            <tr>
              <th>배치된 현장명</th>
              <th class="text-center">배치 수량</th>
              <th class="text-center">현장 지급일</th>
              <th class="text-center">다음 점검일</th>
              <th class="text-center">현재 상태</th>
              <th>비고 (수리내역 등)</th>
              <th class="text-center">관리 액션</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="dist in distributions" :key="dist.assignIdx" :class="{ 'row-fault': dist.status === 'fault' }">
              <td class="fw-bold"><i class="mdi mdi-office-building-marker text-primary"></i> {{ dist.siteName }}</td>
              <td class="text-center fw-bold">{{ dist.qty }}대</td>
              <td class="text-center text-muted">{{ dist.assignDate }}</td>
              <td class="text-center" :class="{ 'text-red fw-bold': isCheckOverdue(dist.nextCheckDate) }">
                {{ dist.nextCheckDate || '-' }}
                <span v-if="isCheckOverdue(dist.nextCheckDate)" class="overdue-chip">지연</span>
              </td>
              <td class="text-center">
                  <span :class="['dist-status', `dist-${equipStatusMap[dist.status].color}`]">
                    {{ equipStatusMap[dist.status].label }}
                  </span>
              </td>
              <td class="text-muted small-text">{{ dist.note || '-' }}</td>
              <td class="text-center">
                <div class="action-btns">
                  <button class="btn-sm btn-edit-status" @click="openStatusModal(dist)" title="상태 및 점검일 변경"><i class="mdi mdi-pencil-outline"></i></button>
                  <button class="btn-sm btn-return" @click="returnToHQ(dist.assignIdx)" title="본사 회수">회수</button>
                </div>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-show="activeTab === 'info'" class="tab-panel">
        <div class="info-section">
          <div class="section-header"><i class="mdi mdi-clipboard-text-outline"></i><h3>마스터 자산 정보</h3></div>
          <div class="info-grid">
            <div class="info-item">
              <label>장비명</label>
              <input v-if="isEditing" type="text" v-model="equipment.name" class="info-input" />
              <span v-else class="info-value">{{ equipment.name }}</span>
            </div>
            <div class="info-item">
              <label>모델명</label>
              <input v-if="isEditing" type="text" v-model="equipment.model" class="info-input" />
              <span v-else class="info-value">{{ equipment.model || '-' }}</span>
            </div>
            <div class="info-item">
              <label>장비 분류</label>
              <select v-if="isEditing" v-model="equipment.category" class="info-select">
                <option v-for="cat in EQUIP_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
              </select>
              <span v-else class="info-value">{{ equipment.category }}</span>
            </div>
            <div class="info-item">
              <label>도입(구매)일</label>
              <input v-if="isEditing" type="date" v-model="equipment.purchaseDate" class="info-input" />
              <span v-else class="info-value">{{ equipment.purchaseDate || '-' }}</span>
            </div>
            <div class="info-item">
              <label>총 구매 수량 (대)</label>
              <input v-if="isEditing" type="number" v-model.number="equipment.totalQty" :min="assignedQty" class="info-input" />
              <span v-else class="info-value">{{ equipment.totalQty }} 대</span>
            </div>
            <div class="info-item">
              <label>개당 구매 단가 (원)</label>
              <input v-if="isEditing" type="number" v-model.number="equipment.price" step="10000" class="info-input" />
              <span v-else class="info-value">{{ equipment.price.toLocaleString() }} 원</span>
            </div>
            <div class="info-item full-width">
              <label>총 자산 가치 (도입가 기준)</label>
              <span class="info-value fw-bold text-primary">{{ totalValue }} 원</span>
            </div>
            <div class="info-item full-width">
              <label>비고 (스펙, A/S 정보 등)</label>
              <textarea v-if="isEditing" v-model="equipment.note" class="info-textarea" rows="4"></textarea>
              <div v-else class="info-value note-box">{{ equipment.note || '-' }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'history'" class="tab-panel">
        <div v-if="historyLogs.length > 0" class="memo-timeline">
          <div v-for="(log, idx) in historyLogs" :key="idx" class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <i class="mdi mdi-clock-outline"></i>
                <span class="timeline-date">{{ log.date }}</span>
                <span class="timeline-type-badge">{{ log.type }}</span>
              </div>
              <p class="timeline-text">{{ log.content }}</p>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <i class="mdi mdi-history"></i><p>등록된 장비 이력이 없습니다</p>
        </div>
      </div>

    </div>
    </div>
      <div v-if="isStatusModalOpen" class="modal-overlay" @click.self="isStatusModalOpen = false">
    <div class="modal-box" style="max-width: 450px;">
      <div class="modal-header">
        <h3><i class="mdi mdi-clipboard-text-outline"></i> 배치 상태 및 점검일 변경</h3>
        <button class="modal-close" @click="isStatusModalOpen = false"><i class="mdi mdi-close"></i></button>
      </div>
      <div class="modal-body">
        <div class="modal-form-item">
          <label>현재 상태</label>
          <select v-model="statusForm.status" class="info-select">
            <option v-for="opt in EQUIP_STATUS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div class="modal-form-item">
          <label>다음 점검 예정일</label>
          <input type="date" v-model="statusForm.nextCheckDate" class="info-input" />
        </div>
        <div class="modal-form-item">
          <label>비고 (고장 증상, 수리 이력 등)</label>
          <textarea v-model="statusForm.note" class="info-textarea" rows="3"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="isStatusModalOpen = false">취소</button>
        <button class="btn-save" @click="saveDistStatus">변경 저장</button>
      </div>
    </div>
  </div>

  </div>
</template>

<style scoped>
/* =========================================
   Layout & Header
========================================= */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.btn-edit, .btn-cancel, .btn-save { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 18px; height: 42px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm); white-space: nowrap; }
.btn-edit { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); }
.btn-edit:hover { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.btn-cancel { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-save { background: var(--primary); border: 1px solid var(--primary); color: #fff; }
.btn-save:hover { background: var(--primary-hover); transform: translateY(-1px); }

/* =========================================
   Profile Card (Master Equipment Info)
========================================= */
.integrated-paper {
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
}
/* === 상단 프로필 영역 === */
.profile-section {
  position: relative;
}
.profile-banner {
  height: 100px;
  background-color: var(--primary);
  opacity: 0.9;
}

.profile-content {
  padding: 0 32px 24px;
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.profile-photo-wrapper {
  position: relative;
  margin-top: -40px;
  flex-shrink: 0;
}

.profile-photo {
  width: 110px; height: 110px;
  border-radius: 20px;
  background: var(--bg-surface);
  border: 4px solid var(--bg-surface);
  box-shadow: var(--shadow-md);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.profile-photo img { width: 100%; height: 100%; object-fit: cover; }
.profile-photo i { font-size: 60px; color: var(--text-muted); }

.profile-info {
  flex: 1;
  padding-top: 16px;
}

.profile-main {
  display: flex; align-items: center; gap: 16px; margin-bottom: 12px;
}
.category-badge { padding: 4px 10px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; color: var(--text-sub); font-weight: 600; white-space: nowrap; }
.profile-name { font-size: 22px; font-weight: 700; color: var(--text-main); margin: 0; word-break: break-all; }
.profile-details { display: flex; flex-wrap: wrap; gap: 16px; color: var(--text-sub); font-size: 13px; font-weight: 500; }
.detail-item { display: flex; align-items: center; white-space: nowrap; }
.detail-item i { margin-right: 4px; color: var(--text-muted); font-size: 16px; }

/* Profile Stats */
.profile-stats { display: flex; gap: 24px; padding-top: 16px; flex-shrink: 0; }
.stat-item { display: flex; gap: 12px; align-items: center; }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
.stat-icon.blue { background: var(--primary-soft); color: var(--primary); }
.stat-icon.green { background: rgba(16, 185, 129, 0.1); color: var(--success); }
.stat-icon.orange { background: rgba(245, 158, 11, 0.1); color: var(--warning); }
.stat-icon.gray { background: var(--bg-canvas); color: var(--text-muted); }
.stat-text { display: flex; flex-direction: column; gap: 2px; }
.stat-text .label { font-size: 12px; color: var(--text-sub); font-weight: 500; white-space: nowrap; }
.stat-text .value { font-size: 16px; font-weight: 700; color: var(--text-main); white-space: nowrap; }

/* =========================================
   Tabs & Content
========================================= */
.integrated-tabs { display: flex; padding: 0 32px; border-bottom: 1px solid var(--border-color); background: transparent; overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; }
.integrated-tabs::-webkit-scrollbar { display: none; } /* 모바일에서 탭 스크롤바 숨김 */
.tab-button { padding: 16px 24px; background: transparent; border: none; color: var(--text-sub); font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; position: relative; margin-bottom: -1px; flex-shrink: 0; }
.tab-button.active { color: var(--primary); background: var(--bg-surface); border: 1px solid var(--border-color); border-bottom-color: var(--bg-surface); border-radius: 8px 8px 0 0; }
.integrated-content { padding: 32px; background: var(--bg-surface); border: 1px solid var(--border-color); border-top: none; border-radius: 0 0 12px 12px; box-shadow: var(--shadow-sm); }
.tab-panel { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; } }

/* =========================================
   Tab 1: 현장 배치 현황 (Table)
========================================= */
.action-bar-right { display: flex; justify-content: flex-end; }
.mb-3 { margin-bottom: 16px; }
.btn-primary-outline { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 16px; background: white; border: 1px dashed var(--primary); border-radius: 8px; color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.btn-primary-outline:hover { background: var(--primary-soft); border-style: solid; }

.table-scroll-container { border: 1px solid var(--border-color); border-radius: 10px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.data-table { width: 100%; border-collapse: collapse; min-width: 800px; }
.data-table th { padding: 12px 16px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); font-size: 12px; font-weight: 600; color: var(--text-sub); text-align: left; white-space: nowrap; }
.data-table td { padding: 14px 16px; border-bottom: 1px solid var(--border-color); font-size: 13px; vertical-align: middle; }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover { background: var(--bg-canvas); }

.row-fault td { background: rgba(239, 68, 68, 0.02); }
.dist-status { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.dist-success { background: rgba(16, 185, 129, 0.1); color: var(--success); }
.dist-warning { background: rgba(245, 158, 11, 0.1); color: var(--warning); }
.dist-danger { background: rgba(239, 68, 68, 0.1); color: var(--danger); }

.action-btns { display: flex; gap: 6px; justify-content: center; }
.btn-sm { display: inline-flex; align-items: center; justify-content: center; height: 28px; border-radius: 6px; cursor: pointer; transition: 0.2s; }
.btn-edit-status { width: 28px; border: 1px solid var(--border-color); background: white; color: var(--text-sub); }
.btn-edit-status:hover { color: var(--primary); border-color: var(--primary); }
.btn-return { padding: 0 10px; border: 1px solid rgba(239, 68, 68, 0.3); background: white; color: var(--danger); font-size: 11px; font-weight: 600; white-space: nowrap; }
.btn-return:hover { background: rgba(239, 68, 68, 0.05); }

/* =========================================
   Tab 2: 자산 상세 정보 (Form)
========================================= */
.info-section { display: flex; flex-direction: column; gap: 20px; }
.section-header { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; border-bottom: 1px dashed var(--border-color); }
.section-header i { font-size: 20px; color: var(--primary); }
.section-header h3 { font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0; }

.info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
.info-item { display: flex; flex-direction: column; gap: 8px; }
.info-item.full-width { grid-column: 1 / -1; }
.info-item label { font-size: 12px; font-weight: 600; color: var(--text-sub); }
.info-value { font-size: 14px; color: var(--text-main); font-weight: 500; min-height: 40px; display: flex; align-items: center; word-break: break-all; }
.note-box { background: var(--bg-canvas); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); white-space: pre-line; align-items: flex-start; word-break: keep-all; }

.info-input, .info-select, .info-textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); background: var(--bg-canvas); transition: all 0.2s; box-sizing: border-box; }
.info-input:focus, .info-select:focus, .info-textarea:focus { outline: none; border-color: var(--primary); background: var(--bg-surface); box-shadow: 0 0 0 3px var(--primary-soft); }

/* =========================================
   Tab 3: 히스토리 타임라인
========================================= */
.memo-timeline { display: flex; flex-direction: column; padding-left: 24px; position: relative; }
.memo-timeline::before { content: ''; position: absolute; left: 7px; top: 8px; bottom: 8px; width: 2px; background: var(--border-focus); }
.timeline-item { position: relative; padding-bottom: 24px; }
.timeline-marker { position: absolute; left: -21px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); border: 2px solid var(--bg-surface); box-shadow: 0 0 0 2px var(--primary); }
.timeline-content { background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; }
.timeline-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.timeline-date { font-size: 12px; font-weight: 600; color: var(--text-sub); }
.timeline-type-badge { padding: 2px 8px; border-radius: 4px; background: var(--border-focus); color: var(--text-sub); font-size: 11px; font-weight: 700; white-space: nowrap; }
.timeline-text { font-size: 13px; color: var(--text-main); margin: 0; word-break: keep-all; }

/* =========================================
   Utils & Modal
========================================= */
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; display: block; }
.empty-state p { font-size: 15px; font-weight: 600; color: var(--text-main); margin: 0 0 4px 0; }
.empty-state span { font-size: 13px; }

.overdue-chip { display: inline-flex; margin-left: 4px; padding: 2px 6px; background: var(--danger); color: white; border-radius: 4px; font-size: 10px; font-weight: 700; white-space: nowrap; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal-box { background: var(--bg-surface); border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.2); width: 100%; max-width: 450px; display: flex; flex-direction: column; overflow: hidden; max-height: 90vh; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border-color); }
.modal-header h3 { font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px; }
.modal-close { width: 32px; height: 32px; border-radius: 8px; background: var(--bg-canvas); border: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;}
.modal-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px; }
.modal-form-item { display: flex; flex-direction: column; gap: 6px; }
.modal-form-item label { font-size: 12px; font-weight: 600; color: var(--text-sub); }

.fw-bold { font-weight: 700; }
.text-center { text-align: center; }
.text-primary { color: var(--primary); }
.text-danger, .text-red { color: var(--danger); }
.text-warning { color: var(--warning); }
.text-muted, .text-gray { color: var(--text-muted); }
.small-text { font-size: 12px; }

/* =========================================
   Responsive Breakpoints
========================================= */

/* 태블릿 세로 및 작은 노트북 */
@media (max-width: 1024px) {
  .profile-content { flex-direction: column; gap: 24px; }
  .profile-photo-wrapper { margin-top: -50px; }
  .profile-info { align-items: center; }
  .profile-main { justify-content: center; }
  .profile-details { justify-content: center; }
  .profile-stats { justify-content: center; width: 100%; border-top: 1px solid var(--border-color); padding-top: 24px; }
}

/* 모바일 일반 */
@media (max-width: 768px) {
  /*.equipment-detail-page { padding: 12px; gap: 16px; }   */
  .header-actions { width: 100%; justify-content: flex-end; }
  .header-actions button { flex: 1; }

  .profile-stats { flex-direction: column; gap: 16px; align-items: flex-start; }
  .stat-item { width: 100%; justify-content: flex-start; }

  .integrated-tabs { padding: 0 16px; overflow-x: auto; }
  .tab-button { padding: 12px 16px; white-space: nowrap; }

  .integrated-content { padding: 20px 16px; border-left: none; border-right: none; border-radius: 0; margin: 0 -16px; }

  .info-grid { grid-template-columns: 1fr; gap: 16px; }

  .action-bar-right { justify-content: stretch; }
  .btn-primary-outline { width: 100%; }
}

/* 초소형 모바일 */
@media (max-width: 480px) {
  .page-title { font-size: 20px; }
  .profile-name { font-size: 18px; }
  .modal-box { border-radius: 12px 12px 0 0; align-self: flex-end; max-height: 95vh; }
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-footer { flex-direction: column-reverse; }
  .modal-footer button { width: 100%; height: 44px; }
}
</style>
