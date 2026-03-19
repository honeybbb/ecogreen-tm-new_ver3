<script setup>
import { ref, computed, watch } from 'vue'
import Pagination from "~/components/Pagination.vue";
import {useRouter, useRoute} from "#app";

const route = useRoute();
const router = useRouter();
const {
  siteOptions,
  fetchSiteOptions
} = useApi();
// ════════════════════════════════════════════════════════════
// 상수 / 설정
// ════════════════════════════════════════════════════════════
const tabs = [
  { id: 'accident',  name: '사고보고서',     icon: 'mdi-alert-octagon-outline', prefix: 'ACC' },
  { id: 'safety',    name: '산재보고서',     icon: 'mdi-hard-hat',              prefix: 'SAF' },
  { id: 'equipment', name: '장비수리의뢰서', icon: 'mdi-tools',                 prefix: 'EQP' },
]
const STATUS_LIST    = ['신청 대기', '검토 중', '처리 중', '완료']
const ACCIDENT_TYPES = ['미끄러짐', '넘어짐', '낙상', '충돌', '기타']

// ════════════════════════════════════════════════════════════
// 초기 더미 데이터
// ════════════════════════════════════════════════════════════
const INITIAL_DB = {
  accident: [
    { id: 1, docNo: 'ACC-2026-001', site: 'LH 위례 6단지',    applicant: '김반장', date: '2026-03-10', title: '청소 중 미끄러짐 사고',       status: '검토 중',  accidentType: '미끄러짐', accidentTime: '09:30', victimName: '홍길동', victimContact: '010-1234-5678', victimAddress: '서울시 송파구', witnessName: '이길동', witnessContact: '010-9876-5432', witnessAddress: '서울시 송파구', incidentDesc: '오전 9시 30분경 로비 입구에서 바닥 청소 중 물기로 인해 미끄러짐. 피해자는 즉시 병원으로 후송됨.', specialNote: '현장 안전관리 강화 필요' },
    { id: 2, docNo: 'ACC-2026-002', site: '강서 대명 강동',    applicant: '이대리', date: '2026-03-05', title: '고압세척기 운반 중 발목 부상', status: '신청 대기', accidentType: '넘어짐',   accidentTime: '14:00', victimName: '박철수', victimContact: '010-2222-3333', victimAddress: '서울시 강서구', witnessName: '최영희', witnessContact: '010-4444-5555', witnessAddress: '서울시 강서구', incidentDesc: '고압세척기를 계단에서 운반하던 중 발을 헛디뎌 발목 염좌 발생.', specialNote: '' },
    { id: 3, docNo: 'ACC-2026-003', site: 'LH 율곡 제일 8단지', applicant: '박팀장', date: '2026-02-28', title: '주차장 순찰 중 낙상',          status: '완료',     accidentType: '낙상',     accidentTime: '23:10', victimName: '김경비', victimContact: '010-3333-4444', victimAddress: '경기도 고양시',  witnessName: '',     witnessContact: '',              witnessAddress: '',            incidentDesc: '야간 순찰 중 주차장 경사로에서 낙상, 허리 타박상.', specialNote: '야간 조명 보강 요청' },
  ],
  safety: [
    { id: 11, docNo: 'SAF-2026-001', site: 'LH 율곡 제일 8단지', applicant: '박팀장', date: '2026-02-25', title: '손가락 골절 산재 보고',   status: '처리 중',  workerName: '이근무', workerContact: '010-5555-6666', workerAddress: '경기도 일산시', joinDate: '2024-05-01', contractEnd: '2026-04-30', witnessName: '김팀장', witnessContact: '010-7777-8888', witnessAddress: '경기도 일산시', accidentDate: '2026-02-24', accidentTime: '10:20', incidentDesc: '장비 점검 중 볼트 조임 작업에서 손가락이 기계에 끼어 골절 발생.', specialNote: '산재 승인 후 치료비 처리 예정' },
    { id: 12, docNo: 'SAF-2026-002', site: 'LH 위례 6단지',    applicant: '최현장', date: '2026-03-01', title: '허리 디스크 산재 신청',  status: '신청 대기', workerName: '정미화', workerContact: '010-1111-2222', workerAddress: '서울시 송파구', joinDate: '2023-08-15', contractEnd: '2026-07-31', witnessName: '',     witnessContact: '',              witnessAddress: '',            accidentDate: '2026-02-28', accidentTime: '16:00', incidentDesc: '무거운 청소장비를 반복적으로 들어올리는 과정에서 허리 디스크 발생.', specialNote: '기존 병력 없음' },
  ],
  equipment: [
    { id: 31, docNo: 'EQP-2026-001', site: 'LH 율곡 제일 8단지', applicant: '오기술', date: '2026-03-13', title: '고압세척기 모터 수리 요청',  status: '처리 중',  equipmentName: '고압세척기',  model: 'KARCHER K5',      contractFrom: '2025-01-01', contractTo: '2025-12-31', faultDesc: '전원 인가 시 모터 이상음 발생 및 시동 불가. 3회 시도 후 연기 발생.', photoAttached: true,  specialNote: '긴급 수리 필요, 외부 업체 견적 수령 완료' },
    { id: 32, docNo: 'EQP-2026-002', site: '강서 대명 강동',    applicant: '김수리', date: '2026-03-10', title: 'CCTV 카메라 화면 끊김 현상', status: '신청 대기', equipmentName: 'CCTV 카메라', model: 'HANWHA QNV-8080R', contractFrom: '2025-03-01', contractTo: '2026-02-28', faultDesc: '주차장 B-3 구역 CCTV 영상이 간헐적으로 끊기는 현상. 케이블 단선 의심.',  photoAttached: false, specialNote: '' },
    { id: 33, docNo: 'EQP-2026-003', site: 'LH 위례 6단지',    applicant: '이관리', date: '2026-02-20', title: '엘리베이터 도어 오작동',      status: '완료',     equipmentName: '엘리베이터',  model: 'OTIS Gen2',        contractFrom: '2024-06-01', contractTo: '2025-05-31', faultDesc: '2호기 엘리베이터 도어가 완전히 닫히지 않고 반복 개폐.',                 photoAttached: true,  specialNote: '제조사 AS 완료' },
  ],
}

// ════════════════════════════════════════════════════════════
// State (Pinia 없이 단일 파일에서 관리 — 실서비스 시 store로 분리)
// ════════════════════════════════════════════════════════════
const db = ref({
  accident:  [...INITIAL_DB.accident],
  safety:    [...INITIAL_DB.safety],
  equipment: [...INITIAL_DB.equipment],
})

//const activeTab   = ref('accident')
const activeTab = ref(route.query.tab || 'accident');
const currentPage = ref(1);
const pageSize    = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

const filter = ref({ site: '', status: '', from: '', to: '', keyword: '' })

// ── Modal state ──
const isModalOpen = ref(false)
const modalMode   = ref('new')   // 'new' | 'view'
const selectedDoc = ref(null)

// ════════════════════════════════════════════════════════════
// Computed — store getters
// ════════════════════════════════════════════════════════════
const currentList = computed(() => db.value[activeTab.value] || [])

const filteredList = computed(() => {
  const { site, status, from, to, keyword } = filter.value
  return currentList.value.filter(d => {
    if (site    && d.site   !== site)   return false
    if (status  && d.status !== status) return false
    if (from    && d.date   <  from)    return false
    if (to      && d.date   >  to)      return false
    if (keyword) {
      const kw = keyword.toLowerCase()
      if (!d.title.toLowerCase().includes(kw) && !d.applicant.toLowerCase().includes(kw)) return false
    }
    return true
  })
})

const totalCount  = computed(() => filteredList.value.length)
const totalPages  = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const pagedList   = computed(() => {
  const s = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(s, s + pageSize.value)
})

const stats = computed(() => {
  const all = [...db.value.accident, ...db.value.safety, ...db.value.equipment]
  return {
    total:    all.length,
    pending:  all.filter(d => d.status === '신청 대기').length,
    progress: all.filter(d => d.status === '처리 중' || d.status === '검토 중').length,
    done:     all.filter(d => d.status === '완료').length,
  }
})

const tabCounts = computed(() => ({
  accident:  db.value.accident.length,
  safety:    db.value.safety.length,
  equipment: db.value.equipment.length,
}))

const tabConfig = computed(() => tabs.find(t => t.id === activeTab.value))

const handlePageChange = () => {
  document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── 모달용 탭 결정 (조회 시 data의 타입 기준)
const resolvedTab = computed(() => {
  if (modalMode.value === 'view' && selectedDoc.value) {
    const id = selectedDoc.value.id
    if (id < 10)  return 'accident'
    if (id < 30)  return 'safety'
    return 'equipment'
  }
  return activeTab.value
})

// ════════════════════════════════════════════════════════════
// Form state (모달 내부)
// ════════════════════════════════════════════════════════════
function emptyForm(tab) {
  const base = { sIdx: '', title: '' }
  if (tab === 'accident')
    return { ...base, accidentType: '', accidentDateTime: '', victimName: '', victimContact: '', victimAddress: '', witnessName: '', witnessContact: '', witnessAddress: '', incidentDesc: '', specialNote: '' }
  if (tab === 'safety')
    return { ...base, workerName: '', workerContact: '', workerAddress: '', joinDate: '', contractEnd: '', accidentDateTime: '', witnessName: '', witnessContact: '', witnessAddress: '', incidentDesc: '', specialNote: '' }
  if (tab === 'equipment')
    return { ...base, equipmentName: '', model: '', contractFrom: '', contractTo: '', faultDesc: '', specialNote: '' }
  return base
}

const form = ref(emptyForm('accident'))

watch(isModalOpen, (open) => {
  if (!open) return
  if (modalMode.value === 'new')       form.value = emptyForm(activeTab.value)
  else if (selectedDoc.value)          form.value = { ...selectedDoc.value }
})

// ════════════════════════════════════════════════════════════
// Actions
// ════════════════════════════════════════════════════════════
function setTab(tab) {
  activeTab.value = tab
  currentPage.value = 1
  Object.assign(filter.value, { site: '', status: '', from: '', to: '', keyword: '' })
}

const changeTab = async (tabId) => {
  activeTab.value = tabId;
  currentPage.value = 1
  await router.replace({ query: { ...route.query, tab: tabId } });
};

function setPage(p) {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
}

function setFilter(key, val) {
  filter.value[key] = val
  currentPage.value = 1
}

function resetFilter() {
  Object.assign(filter.value, { site: '', status: '', from: '', to: '', keyword: '' })
  currentPage.value = 1
}

function openNewModal() {
  modalMode.value   = 'new'
  selectedDoc.value = null
  isModalOpen.value = true
}

function openViewModal(doc) {
  modalMode.value   = 'view'
  selectedDoc.value = { ...doc }
  isModalOpen.value = true
}

function closeModal() { isModalOpen.value = false }

function submitForm() {
  if (!form.value.sIdx && !form.value.site) { alert('현장을 선택해주세요.'); return }
  if (!form.value.title)                    { alert('문서 제목을 입력해주세요.'); return }

  const tab    = activeTab.value
  const cfg    = tabs.find(t => t.id === tab)
  const nextNo = String(db.value[tab].length + 1).padStart(3, '0')
  const today  = new Date().toISOString().slice(0, 10)

  db.value[tab].unshift({
    ...form.value,
    id:        Date.now(),
    docNo:     `${cfg.prefix}-2026-${nextNo}`,
    site:      form.value.sIdx || form.value.site,
    applicant: '관리자',
    date:      today,
    status:    '신청 대기',
  })
  closeModal()
}

// ── Helpers ──
function statusClass(status) {
  return { '완료': 'status-done', '검토 중': 'status-review', '처리 중': 'status-progress' }[status] ?? 'status-pending'
}

onMounted(() => {
  fetchSiteOptions()
})
</script>

<template>
  <div class="document-page">

    <!-- ══════════════════ 페이지 헤더 ══════════════════ -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-file-document-edit-outline"></i>
          보고서 · 의뢰서 관리
        </h1>
        <p class="page-subtitle">사고보고서, 산재보고서, 장비수리의뢰서를 통합 관리합니다.</p>
      </div>
      <div class="header-actions">
        <button class="btn-add" @click="openNewModal">
          <i class="mdi mdi-plus-circle-outline"></i>신규 문서 신청
        </button>
      </div>
    </div>

    <!-- ══════════════════ 통계 카드 ══════════════════ -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color:var(--primary);--card-bg:var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-file-multiple-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">전체 문서</span>
          <span class="stat-value">{{ stats.total }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--warning);--card-bg:rgba(245,158,11,.1);">
        <div class="stat-icon"><i class="mdi mdi-clock-alert-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">처리 대기</span>
          <span class="stat-value">{{ stats.pending }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:#7c3aed;--card-bg:rgba(124,58,237,.1);">
        <div class="stat-icon"><i class="mdi mdi-progress-clock"></i></div>
        <div class="stat-content">
          <span class="stat-label">진행 중</span>
          <span class="stat-value">{{ stats.progress }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color:var(--success);--card-bg:rgba(5,150,105,.1);">
        <div class="stat-icon"><i class="mdi mdi-check-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">처리 완료</span>
          <span class="stat-value">{{ stats.done }}<small>건</small></span>
        </div>
      </div>
    </div>

    <!-- ══════════════════ 탭 ══════════════════ -->
    <div class="tab-nav">
      <button
          v-for="tab in tabs" :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="changeTab(tab.id)"
      >
        <i :class="['mdi', tab.icon]"></i>
        {{ tab.name }}
        <!--span class="tab-count">{{ tabCounts[tab.id] }}</span-->
      </button>
    </div>

    <!-- ══════════════════ 필터바 ══════════════════ -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 현장</label>
          <!--select class="filter-select" :value="filter.site" @change="setFilter('site', $event.target.value)">
            <option value="">전체 현장</option>
            <option v-for="s in siteOptions" :key="s.idx" :value="s.idx">{{ s.name }}</option>
          </select-->
          <SiteSelect v-model="filter.site" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi mdi-filter-variant"></i> 상태</label>
          <select class="filter-select" :value="filter.status" @change="setFilter('status', $event.target.value)">
            <option value="">전체 상태</option>
            <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="filter-group">
          <span class="filter-label"><i class="mdi mdi-calendar-month-outline"></i> 기간</span>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="date" v-model="filter.from" class="filter-select" @change="setFilter('from', $event.target.value)" />
            <span class="text-gray">~</span>
            <input type="date" v-model="filter.to"   class="filter-select" @change="setFilter('to', $event.target.value)" />
          </div>
        </div>
        <div class="search-group">
          <div class="search-box">
          <i class="mdi mdi-magnify"></i>
          <input
              type="text"
              placeholder="문서 제목, 신청자로 검색..."
              v-model="filter.keyword"
              class="search-input"
              @input="setFilter('keyword', $event.target.value)"
          />
          </div>
        </div>
        <button class="btn-search" @click="resetFilter"><i class="mdi mdi-refresh"></i>초기화</button>
      </div>
    </div>

    <!-- ══════════════════ 테이블 카드 ══════════════════ -->
    <div class="table-card">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>{{ tabConfig.name }} 내역 (총 {{ totalCount }}건)</span>
        </div>
        <!--button class="btn-sm"><i class="mdi mdi-microsoft-excel"></i>엑셀 다운로드</button-->
        <div class="page-size-select">
          <label>페이지당</label>
          <select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th class="text-center col-no">No.</th>
            <th>문서 제목</th>
            <th class="col-site">현장명</th>
            <th class="col-person">신청자</th>
            <th class="text-center col-date">사고/신청일</th>
            <th class="text-center col-status">진행 상태</th>
            <th class="text-center col-action">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="doc in pagedList" :key="doc.id" class="data-row">
            <td class="text-center"><span class="doc-no">{{ doc.docNo }}</span></td>
            <td>
              <div class="doc-title">{{ doc.title }}</div>
              <div v-if="doc.equipmentName" class="doc-sub">{{ doc.equipmentName }}{{ doc.model ? ' · ' + doc.model : '' }}</div>
            </td>
            <td><span class="badge-site">{{ doc.site }}</span></td>
            <td class="text-sm text-gray">{{ doc.applicant }}</td>
            <td class="text-center text-sm text-gray">{{ doc.date }}</td>
            <td class="text-center"><span :class="['status-badge', statusClass(doc.status)]">{{ doc.status }}</span></td>
            <td class="text-center"><button class="btn-detail" @click="openViewModal(doc)">상세조회</button></td>
          </tr>
          <tr v-if="pagedList.length === 0" class="empty-row">
            <td colspan="7">
              <div class="empty-state">
                <i class="mdi mdi-file-search-outline"></i>
                <p>해당 문서 내역이 없습니다.</p>
                <span>검색 조건을 변경하거나 신규 신청을 해주세요.</span>
              </div>
            </td>
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

    <!-- ══════════════════ 모달 ══════════════════ -->
    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-box">

        <!-- 모달 헤더 -->
        <div class="modal-header">
          <div class="modal-title">
            <i :class="['mdi', tabConfig.icon]"></i>
            <span>{{ tabConfig.name }} {{ modalMode === 'new' ? '신규 신청' : '상세 조회' }}</span>
            <span class="modal-badge" :class="modalMode==='new' ? 'badge-new' : ''">
              {{ modalMode === 'new' ? '신규' : selectedDoc?.docNo }}
            </span>
          </div>
          <button class="modal-close" @click="closeModal"><i class="mdi mdi-close"></i></button>
        </div>

        <!-- 모달 바디 -->
        <div class="modal-body">

          <!-- 기본 정보 섹션 -->
          <div class="form-section">
            <div class="form-section-title"><i class="mdi mdi-information-outline"></i>기본 정보</div>
            <div class="mform-grid">
              <div class="mform-item">
                <label>근무 현장 <span class="req">*</span></label>
                <!--select v-if="modalMode==='new'" v-model="form.sIdx" class="input-add">
                  <option value="">현장을 선택하세요.</option>
                  <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
                </select-->
                <SiteSelect  v-if="modalMode==='new'" v-model="form.sIdx"/>
                <div v-else class="field-value">{{ selectedDoc?.site }}</div>
              </div>
              <div class="mform-item">
                <label>문서 제목 <span class="req">*</span></label>
                <input v-if="modalMode==='new'" v-model="form.title" type="text" class="input-add" placeholder="제목을 입력하세요" />
                <div v-else class="field-value">{{ selectedDoc?.title }}</div>
              </div>
            </div>
          </div>

          <!-- ── 사고보고서 ── -->
          <template v-if="resolvedTab === 'accident'">
            <div class="form-section">
              <div class="form-section-title"><i class="mdi mdi-alert-circle-outline"></i>사고 정보</div>
              <div class="mform-grid">
                <div class="mform-item">
                  <label>사고 유형 <span class="req">*</span></label>
                  <select v-if="modalMode==='new'" v-model="form.accidentType" class="input-add">
                    <option value="">선택하세요</option>
                    <option v-for="t in ACCIDENT_TYPES" :key="t" :value="t">{{ t }}</option>
                  </select>
                  <div v-else class="field-value">{{ selectedDoc?.accidentType }}</div>
                </div>
                <div class="mform-item">
                  <label>사고 일시 <span class="req">*</span></label>
                  <input v-if="modalMode==='new'" v-model="form.accidentDateTime" type="datetime-local" class="input-add" />
                  <div v-else class="field-value">{{ selectedDoc?.date }} {{ selectedDoc?.accidentTime }}</div>
                </div>
              </div>

              <!-- 피해자 -->
              <div class="sub-section-title"><i class="mdi mdi-account-injury-outline"></i>피해자 인적사항</div>
              <div class="mform-grid">
                <div class="mform-item">
                  <label>성명 <span class="req">*</span></label>
                  <input v-if="modalMode==='new'" v-model="form.victimName" type="text" class="input-add" placeholder="피해자 이름" />
                  <div v-else class="field-value">{{ selectedDoc?.victimName }}</div>
                </div>
                <div class="mform-item">
                  <label>연락처</label>
                  <input v-if="modalMode==='new'" v-model="form.victimContact" type="text" class="input-add" placeholder="010-0000-0000" />
                  <div v-else class="field-value">{{ selectedDoc?.victimContact || '—' }}</div>
                </div>
                <div class="mform-item full">
                  <label>주소</label>
                  <input v-if="modalMode==='new'" v-model="form.victimAddress" type="text" class="input-add" placeholder="주소를 입력하세요" />
                  <div v-else class="field-value">{{ selectedDoc?.victimAddress || '—' }}</div>
                </div>
              </div>

              <!-- 목격자 -->
              <div class="sub-section-title"><i class="mdi mdi-eye-outline"></i>목격자 인적사항</div>
              <div class="mform-grid">
                <div class="mform-item">
                  <label>성명</label>
                  <input v-if="modalMode==='new'" v-model="form.witnessName" type="text" class="input-add" placeholder="없으면 공란" />
                  <div v-else class="field-value">{{ selectedDoc?.witnessName || '—' }}</div>
                </div>
                <div class="mform-item">
                  <label>연락처</label>
                  <input v-if="modalMode==='new'" v-model="form.witnessContact" type="text" class="input-add" placeholder="010-0000-0000" />
                  <div v-else class="field-value">{{ selectedDoc?.witnessContact || '—' }}</div>
                </div>
                <div class="mform-item full">
                  <label>주소</label>
                  <input v-if="modalMode==='new'" v-model="form.witnessAddress" type="text" class="input-add" placeholder="주소를 입력하세요" />
                  <div v-else class="field-value">{{ selectedDoc?.witnessAddress || '—' }}</div>
                </div>
              </div>

              <div class="mform-grid" style="margin-top:10px">
                <div class="mform-item full">
                  <label>사고 발생 경위 <span class="req">*</span></label>
                  <textarea v-if="modalMode==='new'" v-model="form.incidentDesc" class="input-add" rows="5" placeholder="6하원칙 (누가, 언제, 어디서, 무엇을, 어떻게, 왜)"></textarea>
                  <div v-else class="field-value pre">{{ selectedDoc?.incidentDesc || '—' }}</div>
                </div>
                <div class="mform-item full">
                  <label>특이사항</label>
                  <textarea v-if="modalMode==='new'" v-model="form.specialNote" class="input-add" rows="2" placeholder="추가 사항을 입력하세요"></textarea>
                  <div v-else class="field-value pre">{{ selectedDoc?.specialNote || '—' }}</div>
                </div>
              </div>
            </div>
          </template>

          <!-- ── 산재보고서 ── -->
          <template v-else-if="resolvedTab === 'safety'">
            <div class="form-section">
              <div class="form-section-title"><i class="mdi mdi-account-hard-hat-outline"></i>근무자 인적사항</div>
              <div class="mform-grid">
                <div class="mform-item">
                  <label>성명 <span class="req">*</span></label>
                  <input v-if="modalMode==='new'" v-model="form.workerName" type="text" class="input-add" placeholder="근무자 이름" />
                  <div v-else class="field-value">{{ selectedDoc?.workerName }}</div>
                </div>
                <div class="mform-item">
                  <label>연락처</label>
                  <input v-if="modalMode==='new'" v-model="form.workerContact" type="text" class="input-add" placeholder="010-0000-0000" />
                  <div v-else class="field-value">{{ selectedDoc?.workerContact || '—' }}</div>
                </div>
                <div class="mform-item full">
                  <label>주소</label>
                  <input v-if="modalMode==='new'" v-model="form.workerAddress" type="text" class="input-add" placeholder="주소를 입력하세요" />
                  <div v-else class="field-value">{{ selectedDoc?.workerAddress || '—' }}</div>
                </div>
                <div class="mform-item">
                  <label>입사일자 <span class="req">*</span></label>
                  <input v-if="modalMode==='new'" v-model="form.joinDate" type="date" class="input-add" />
                  <div v-else class="field-value">{{ selectedDoc?.joinDate }}</div>
                </div>
                <div class="mform-item">
                  <label>근로계약 만료일</label>
                  <input v-if="modalMode==='new'" v-model="form.contractEnd" type="date" class="input-add" />
                  <div v-else class="field-value">{{ selectedDoc?.contractEnd || '—' }}</div>
                </div>
              </div>
            </div>
            <div class="form-section">
              <div class="form-section-title"><i class="mdi mdi-alert-circle-outline"></i>사고 정보</div>
              <div class="mform-grid">
                <div class="mform-item">
                  <label>사고 일시 <span class="req">*</span></label>
                  <input v-if="modalMode==='new'" v-model="form.accidentDateTime" type="datetime-local" class="input-add" />
                  <div v-else class="field-value">{{ selectedDoc?.accidentDate }} {{ selectedDoc?.accidentTime }}</div>
                </div>
                <div class="mform-item">
                  <label>목격자 성명</label>
                  <input v-if="modalMode==='new'" v-model="form.witnessName" type="text" class="input-add" placeholder="없으면 공란" />
                  <div v-else class="field-value">{{ selectedDoc?.witnessName || '—' }}</div>
                </div>
                <div class="mform-item">
                  <label>목격자 연락처</label>
                  <input v-if="modalMode==='new'" v-model="form.witnessContact" type="text" class="input-add" placeholder="010-0000-0000" />
                  <div v-else class="field-value">{{ selectedDoc?.witnessContact || '—' }}</div>
                </div>
                <div class="mform-item full">
                  <label>목격자 주소</label>
                  <input v-if="modalMode==='new'" v-model="form.witnessAddress" type="text" class="input-add" placeholder="주소를 입력하세요" />
                  <div v-else class="field-value">{{ selectedDoc?.witnessAddress || '—' }}</div>
                </div>
                <div class="mform-item full">
                  <label>사고 발생 경위 <span class="req">*</span></label>
                  <textarea v-if="modalMode==='new'" v-model="form.incidentDesc" class="input-add" rows="5" placeholder="6하원칙 (누가, 언제, 어디서, 무엇을, 어떻게, 왜)"></textarea>
                  <div v-else class="field-value pre">{{ selectedDoc?.incidentDesc || '—' }}</div>
                </div>
                <div class="mform-item full">
                  <label>특이사항</label>
                  <textarea v-if="modalMode==='new'" v-model="form.specialNote" class="input-add" rows="2" placeholder="추가 사항을 입력하세요"></textarea>
                  <div v-else class="field-value pre">{{ selectedDoc?.specialNote || '—' }}</div>
                </div>
              </div>
            </div>
          </template>

          <!-- ── 장비수리의뢰서 ── -->
          <template v-else-if="resolvedTab === 'equipment'">
            <div class="form-section">
              <div class="form-section-title"><i class="mdi mdi-tools"></i>장비 정보</div>
              <div class="mform-grid">
                <div class="mform-item">
                  <label>장비명 <span class="req">*</span></label>
                  <input v-if="modalMode==='new'" v-model="form.equipmentName" type="text" class="input-add" placeholder="예: 고압세척기" />
                  <div v-else class="field-value">{{ selectedDoc?.equipmentName }}</div>
                </div>
                <div class="mform-item">
                  <label>모델명</label>
                  <input v-if="modalMode==='new'" v-model="form.model" type="text" class="input-add" placeholder="예: KARCHER K5" />
                  <div v-else class="field-value">{{ selectedDoc?.model || '—' }}</div>
                </div>
                <div class="mform-item">
                  <label>계약기간 시작일</label>
                  <input v-if="modalMode==='new'" v-model="form.contractFrom" type="date" class="input-add" />
                  <div v-else class="field-value">{{ selectedDoc?.contractFrom || '—' }}</div>
                </div>
                <div class="mform-item">
                  <label>계약기간 종료일</label>
                  <input v-if="modalMode==='new'" v-model="form.contractTo" type="date" class="input-add" />
                  <div v-else class="field-value">{{ selectedDoc?.contractTo || '—' }}</div>
                </div>
                <div class="mform-item full">
                  <label>고장 사유 및 내용 <span class="req">*</span></label>
                  <textarea v-if="modalMode==='new'" v-model="form.faultDesc" class="input-add" rows="5" placeholder="고장 사유, 내용, 발생 시점 등을 상세히 기재해주세요."></textarea>
                  <div v-else class="field-value pre">{{ selectedDoc?.faultDesc || '—' }}</div>
                </div>
                <div v-if="modalMode==='new'" class="mform-item full">
                  <label>첨부 사진</label>
                  <input type="file" class="input-add" accept="image/*" multiple style="padding:6px;" />
                </div>
                <div v-else class="mform-item">
                  <label>첨부 사진</label>
                  <div class="field-value">{{ selectedDoc?.photoAttached ? '✅ 첨부됨' : '없음' }}</div>
                </div>
                <div class="mform-item full">
                  <label>특이사항</label>
                  <textarea v-if="modalMode==='new'" v-model="form.specialNote" class="input-add" rows="2" placeholder="추가 사항을 입력하세요"></textarea>
                  <div v-else class="field-value pre">{{ selectedDoc?.specialNote || '—' }}</div>
                </div>
              </div>
            </div>
          </template>

          <!-- 조회 모드 하단 메타 -->
          <div v-if="modalMode === 'view'" class="info-footer">
            <div class="info-chip"><i class="mdi mdi-account-outline"></i>신청자: <strong>{{ selectedDoc?.applicant }}</strong></div>
            <div class="info-chip"><i class="mdi mdi-calendar-outline"></i>신청일: <strong>{{ selectedDoc?.date }}</strong></div>
            <div class="info-chip"><i class="mdi mdi-circle-small"></i>상태: <span :class="['status-badge', statusClass(selectedDoc?.status)]">{{ selectedDoc?.status }}</span></div>
          </div>

        </div><!-- /modal-body -->

        <!-- 모달 푸터 -->
        <div class="modal-footer">
          <button class="btn-cancel" @click="closeModal">닫기</button>
          <button v-if="modalMode==='new'" class="btn-submit" @click="submitForm">
            <i class="mdi mdi-send-outline"></i>신청서 제출
          </button>
        </div>

      </div>
    </div>
    <!-- /modal -->

  </div>
</template>

<style scoped>
/* ── 탭 ── */
.tab-nav { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid var(--border-color); }
.tab-btn { padding: 10px 20px; border: none; background: none; font-size: 13px; font-weight: 600; color: var(--text-sub); cursor: pointer; border-radius: 8px 8px 0 0; display: flex; align-items: center; gap: 7px; transition: all .2s; position: relative; bottom: -2px; font-family: inherit; letter-spacing: -.02em; }
.tab-btn i { font-size: 17px; }
.tab-btn:hover { background: var(--primary-soft); color: var(--primary); }
.tab-btn.active { color: var(--primary); background: var(--bg-surface); border: 2px solid var(--border-color); border-bottom: 2px solid var(--bg-surface); }
.tab-count { background: var(--primary-soft); color: var(--primary); font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; min-width: 20px; text-align: center; }
.tab-btn.active .tab-count { background: var(--primary); color: #fff; }

/* === 테이블 컨트롤 영역 === */
.page-size-select {
  display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub);
}

.col-no { width: 100px; } .col-site { width: 190px; } .col-person { width: 100px; } .col-date { width: 120px; } .col-status { width: 110px; } .col-action { width: 90px; }
.doc-no { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-sub); font-weight: 600; }
.doc-title { font-weight: 700; color: var(--text-main); }
.doc-sub { font-size: 11px; color: var(--text-sub); margin-top: 2px; }
.badge-site { font-size: 10px; padding: 2px 8px; background: var(--primary-soft); color: var(--primary); border-radius: 4px; font-weight: 700; white-space: nowrap; }

/* ── 상태 뱃지 ── */
.status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.status-badge::before { content: ''; width: 5px; height: 5px; border-radius: 50%; }
.status-pending  { background: #fef3c7; color: #92400e; } .status-pending::before  { background: var(--warning); }
.status-review   { background: #dbeafe; color: #1e40af; } .status-review::before   { background: var(--primary); }
.status-progress { background: #ede9fe; color: #5b21b6; } .status-progress::before { background: #7c3aed; }
.status-done     { background: #d1fae5; color: #065f46; } .status-done::before     { background: var(--success); }

/* ── 버튼 공통 ── */
.btn-cancel { padding: 9px 20px; background: var(--text-sub); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all .2s; font-family: inherit; letter-spacing: -.02em; }
.btn-cancel:hover { background: var(--text-main); }
.btn-submit { padding: 9px 20px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all .2s; font-family: inherit; letter-spacing: -.02em; display: flex; align-items: center; gap: 6px; }
.btn-submit:hover { background: var(--primary-hover); transform: translateY(-1px); }
.btn-submit i { font-size: 16px; }

/* ── 유틸 ── */
.text-center { text-align: center !important; }
.text-gray { color: var(--text-sub); }
.text-sm { font-size: 12px; }

/* ── 모달 ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.65); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; animation: fadein .15s ease; }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
@keyframes slidein { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-box { background: var(--bg-surface); border-radius: 16px; width: 100%; max-width: 780px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-color); box-shadow: 0 25px 50px rgba(0,0,0,.15); animation: slidein .25s ease; }
.modal-header { padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); }
.modal-title { font-size: 17px; font-weight: 800; color: var(--text-main); display: flex; align-items: center; gap: 10px; letter-spacing: -.04em; }
.modal-title i { color: var(--primary); font-size: 20px; }
.modal-badge { font-size: 10px; padding: 3px 9px; background: var(--primary-soft); color: var(--primary); border-radius: 4px; font-weight: 700; }
.modal-badge.badge-new { background: #d1fae5; color: var(--success); }
.modal-close { background: none; border: none; color: var(--text-sub); font-size: 22px; cursor: pointer; padding: 4px; border-radius: 6px; transition: all .2s; display: flex; align-items: center; }
.modal-close:hover { background: var(--bg-hover); color: var(--danger); }

.modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; background: var(--bg-canvas); }
.modal-body::-webkit-scrollbar { width: 5px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

.modal-footer { padding: 14px 24px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border-color); background: var(--bg-surface); }

/* ── 폼 섹션 ── */
.form-section { background: var(--bg-surface); border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; border: 1px solid var(--border-color); }
.form-section-title { font-size: 11px; font-weight: 800; color: var(--text-sub); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }
.form-section-title i { font-size: 14px; color: var(--primary); }
.sub-section-title { font-size: 11px; font-weight: 700; color: var(--text-sub); text-transform: uppercase; letter-spacing: .05em; margin: 14px 0 10px; display: flex; align-items: center; gap: 5px; padding-top: 14px; border-top: 1px dashed var(--border-color); }
.sub-section-title i { font-size: 13px; color: var(--primary); opacity: .7; }

.mform-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mform-item { display: flex; flex-direction: column; gap: 5px; }
.mform-item.full { grid-column: 1 / -1; }
.mform-item label { font-size: 11px; font-weight: 700; color: var(--text-sub); display: flex; align-items: center; gap: 4px; text-transform: uppercase; letter-spacing: .04em; }
.req { color: var(--danger); }

.input-add { width: 100%; padding: 8px 11px; border: 1px solid var(--border-color); border-radius: 7px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); transition: all .2s; font-family: inherit; letter-spacing: -.02em; box-sizing: border-box; }
.input-add:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--primary-soft); }
textarea.input-add { resize: vertical; min-height: 90px; }

.field-value { font-size: 13px; color: var(--text-main); font-weight: 500; padding: 8px 11px; background: var(--bg-canvas); border-radius: 7px; border: 1px solid var(--border-color); min-height: 36px; line-height: 1.6; word-break: keep-all; }
.field-value.pre { white-space: pre-wrap; min-height: 80px; }

.info-footer { display: flex; gap: 16px; flex-wrap: wrap; padding: 12px 16px; background: var(--bg-canvas); border-radius: 8px; margin-top: 4px; border: 1px solid var(--border-color); }
.info-chip { font-size: 12px; color: var(--text-sub); font-weight: 500; display: flex; align-items: center; gap: 5px; }
.info-chip i { font-size: 14px; }
.info-chip strong { color: var(--text-main); font-weight: 700; }

/* ── 반응형 ── */
@media (max-width: 1024px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) {
  .tab-nav { overflow-x: auto; white-space: nowrap; }
  .filter-bar { flex-direction: column; align-items: stretch; }
  .mform-grid { grid-template-columns: 1fr; }
  .mform-item.full { grid-column: 1; }
  .info-footer { flex-direction: column; gap: 8px; }
  .modal-box { border-radius: 12px; }
  .pagination { justify-content: center; }
  .page-info-text { display: none; }
}
</style>
