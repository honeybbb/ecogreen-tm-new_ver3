<script setup>
import { ref, computed, onMounted } from 'vue';

// ── 1. 상태 및 검색 조건 ───────────────────────────────────────────
const isLoading = ref(false);
const workList = ref([]);

const searchDateStart = ref(''); // 기본값: 오늘 기준 한 달 전 설정 가능
const searchDateEnd = ref('');
const selectedDocType = ref('전체');
const selectedStatus = ref('전체');
const searchTerm = ref('');

const currentPage = ref(1);
const pageSize = ref(15);
const pageSizeOptions = [15, 30, 50, 100];

// 문서 종류 옵션 (올려주신 양식 반영)
const docTypeOptions = [
  { value: 'ACCIDENT', label: '사고보고서' },
  { value: 'INDUSTRIAL', label: '산재보고서' },
  { value: 'REPAIR', label: '장비수리의뢰서' },
  { value: 'CONTRACT', label: '근로계약서' },
  { value: 'SETTLEMENT', label: '정산서/청구공문' }
];

// 결재 상태 옵션
const statusOptions = [
  { value: 0, label: '결재 대기' },
  { value: 1, label: '결재 진행중' },
  { value: 2, label: '결재 완료' },
  { value: -1, label: '반려' }
];

// ── 2. 더미 데이터 로드 (API 대체) ─────────────────────────────────
const fetchWorkList = () => {
  isLoading.value = true;
  setTimeout(() => {
    workList.value = [
      {
        id: 101,
        docType: 'ACCIDENT',
        docTypeName: '사고보고서',
        title: '[쌍용플래티넘] 단지 내 미화원 미끄러짐 사고 보고',
        draftDate: '2026-03-24',
        currentStep: '부사장', // 현재 결재 차례
        totalSteps: ['담당', '부사장', '사장'],
        status: 1, // 진행중
      },
      {
        id: 102,
        docType: 'REPAIR',
        docTypeName: '장비수리의뢰서',
        title: '[LH 위례] 고압세척기 모터 고장 수리 의뢰',
        draftDate: '2026-03-23',
        currentStep: '담당',
        totalSteps: ['담당', '부사장', '사장'],
        status: 0, // 대기
      },
      {
        id: 103,
        docType: 'SETTLEMENT',
        docTypeName: '정산서/청구공문',
        title: '[에코그린] 2026-02월 연차수당 정산요청의 건',
        draftDate: '2026-03-20',
        currentStep: '완료',
        totalSteps: ['담당', '부사장', '사장'],
        status: 2, // 완료
      },
      {
        id: 104,
        docType: 'INDUSTRIAL',
        docTypeName: '산재보고서',
        title: '[이지아파트] 경비원 산재 신청 보고',
        draftDate: '2026-03-18',
        currentStep: '사장',
        totalSteps: ['담당', '부사장', '사장'],
        status: -1, // 반려
        rejectReason: '사고 경위서 보완 요망',
      },
    ];
    isLoading.value = false;
  }, 400);
};

// ── 3. 필터링 및 정렬 ──────────────────────────────────────────────
const filteredWorks = computed(() => {
  return workList.value.filter(item => {
    const typeMatch = selectedDocType.value === '전체' || item.docType === selectedDocType.value;
    const statusMatch = selectedStatus.value === '전체' || item.status === selectedStatus.value;
    const searchMatch = item.title.includes(searchTerm.value) || item.docTypeName.includes(searchTerm.value);

    // 날짜 필터 (start, end 가 있을 경우)
    let dateMatch = true;
    if (searchDateStart.value) dateMatch = dateMatch && item.draftDate >= searchDateStart.value;
    if (searchDateEnd.value) dateMatch = dateMatch && item.draftDate <= searchDateEnd.value;

    return typeMatch && statusMatch && searchMatch && dateMatch;
  });
});

// ── 4. 통계 ────────────────────────────────────────────────────────
const statsInfo = computed(() => {
  const d = filteredWorks.value;
  return {
    total: d.length,
    pending: d.filter(i => i.status === 0).length,
    inProgress: d.filter(i => i.status === 1).length,
    completed: d.filter(i => i.status === 2).length,
    rejected: d.filter(i => i.status === -1).length,
  };
});

// ── 5. 유틸리티 함수 ───────────────────────────────────────────────
const getStatusBadgeClass = (status) => {
  switch(status) {
    case 0: return 'status-pending';
    case 1: return 'status-progress';
    case 2: return 'status-active';
    case -1: return 'status-inactive';
    default: return '';
  }
};

const getStatusText = (status) => {
  switch(status) {
    case 0: return '결재 대기';
    case 1: return '결재 진행중';
    case 2: return '승인 완료';
    case -1: return '반려';
    default: return '알 수 없음';
  }
};

const resetFilters = () => {
  searchDateStart.value = '';
  searchDateEnd.value = '';
  selectedDocType.value = '전체';
  selectedStatus.value = '전체';
  searchTerm.value = '';
  currentPage.value = 1;
};

onMounted(() => {
  fetchWorkList();
});
</script>

<template>
  <div class="my-work-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-briefcase-check-outline"></i>
          내 업무 관리
        </h1>
        <p class="page-subtitle">내가 상신한 결재 문서의 진행 상태를 확인하고 이력을 관리합니다.</p>
      </div>
      <!--div class="header-actions">
        <button class="btn-action btn-add">
          <i class="mdi mdi-pencil-plus-outline"></i>
          <span>새 기안 작성</span>
        </button>
      </div-->
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--text-sub); --card-bg: var(--bg-hover);">
        <div class="stat-icon"><i class="mdi mdi-file-document-multiple-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">전체 업무</span>
          <span class="stat-value">{{ statsInfo.total }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-clock-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">결재 대기</span>
          <span class="stat-value">{{ statsInfo.pending }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-account-arrow-right-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">결재 진행중</span>
          <span class="stat-value">{{ statsInfo.inProgress }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-check-decagram-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">승인 완료</span>
          <span class="stat-value">{{ statsInfo.completed }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--danger); --card-bg: rgba(239, 68, 68, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-file-cancel-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">반려</span>
          <span class="stat-value text-red">{{ statsInfo.rejected }}<small>건</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-calendar-range"></i> 기안 일자</label>
          <div class="date-range-inputs">
            <input type="date" v-model="searchDateStart" class="filter-select date-input" />
            <span class="date-separator">~</span>
            <input type="date" v-model="searchDateEnd" class="filter-select date-input" />
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-format-list-bulleted-type"></i> 문서 종류</label>
          <select v-model="selectedDocType" class="filter-select">
            <option value="전체">전체보기</option>
            <option v-for="opt in docTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-list-status"></i> 결재 상태</label>
          <select v-model="selectedStatus" class="filter-select">
            <option value="전체">전체보기</option>
            <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <div class="search-group" style="flex: 1;">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input type="text" v-model="searchTerm" placeholder="문서 제목 검색..." class="search-input" />
            <button v-if="searchTerm" @click="searchTerm=''" class="search-clear"><i class="mdi mdi-close"></i></button>
          </div>
          <button @click="resetFilters" class="btn-search" title="초기화">
            <i class="mdi mdi-filter-off"></i><span>초기화</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>결재 내역을 불러오는 중...</p>
    </div>

    <div class="table-card" v-else>
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>나의 상신 문서 ({{ filteredWorks.length }}건)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th class="text-center" style="width: 60px;">No.</th>
            <th class="text-center" style="width: 140px;">문서 종류</th>
            <th style="min-width: 300px;">문서 제목</th>
            <th class="text-center" style="width: 120px;">기안일</th>
            <th class="text-center" style="width: 200px;">결재 진행 단계</th>
            <th class="text-center" style="width: 120px;">결재 상태</th>
            <th class="text-center" style="width: 100px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(item, index) in filteredWorks" :key="item.id" class="data-row">
            <td class="text-center text-gray">{{ index + 1 }}</td>
            <td class="text-center">
              <span class="badge doc-badge">{{ item.docTypeName }}</span>
            </td>
            <td>
              <div class="title-cell">
                <span class="doc-title">{{ item.title }}</span>
                <span v-if="item.status === -1" class="reject-reason">
                    <i class="mdi mdi-alert-circle-outline"></i> {{ item.rejectReason }}
                  </span>
              </div>
            </td>
            <td class="text-center text-gray">{{ item.draftDate }}</td>
            <td class="text-center">
              <div class="approval-steps">
                  <span class="step-text" :class="{'step-current': item.status === 1 || item.status === 0}">
                    {{ item.currentStep === '완료' ? '결재 완료됨' : item.currentStep + ' 결재 대기 중' }}
                  </span>
              </div>
            </td>
            <td class="text-center">
                <span :class="['status-badge', getStatusBadgeClass(item.status)]">
                  {{ getStatusText(item.status) }}
                </span>
            </td>
            <td class="text-center">
              <button class="btn-detail">
                <i class="mdi mdi-file-find-outline"></i> 열람
              </button>
            </td>
          </tr>
          <tr v-if="filteredWorks.length === 0" class="empty-row">
            <td colspan="7">
              <div class="empty-state">
                <i class="mdi mdi-text-box-search-outline"></i>
                <p>기안한 문서 내역이 없습니다.</p>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 페이지 헤더 및 액션 버튼 */
.header-actions { display: flex; gap: 10px; align-items: center; }
.btn-add {
  background: var(--primary); color: white; border: none; padding: 10px 16px;
  border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;
}
.btn-add:hover { background: var(--primary-hover); transform: translateY(-1px); }

/* 날짜 검색 영역 특화 */
.date-range-inputs { display: flex; align-items: center; gap: 8px; }
.date-input { flex: 1; min-width: 130px; }
.date-separator { color: var(--text-sub); font-weight: bold; }

/* 뱃지 및 상태 스타일 */
.doc-badge { background-color: var(--bg-hover); color: var(--text-main); border: 1px solid var(--border-color); font-weight: 600; }
.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; }
.status-pending { background: rgba(245,158,11,0.1); color: var(--warning); } /* 주황색 */
.status-progress { background: var(--primary-soft); color: var(--primary); } /* 파란색 */
.status-active { background: rgba(16,185,129,0.1); color: var(--success); } /* 초록색 */
.status-inactive { background: rgba(239,68,68,0.1); color: var(--danger); } /* 빨간색 */

/* 테이블 셀 특화 */
.title-cell { display: flex; flex-direction: column; gap: 4px; }
.doc-title { font-weight: 700; color: var(--text-main); font-size: 14px; cursor: pointer; transition: color 0.2s; }
.doc-title:hover { color: var(--primary); text-decoration: underline; }
.reject-reason { font-size: 12px; color: var(--danger); display: flex; align-items: center; gap: 4px; }

/* 결재 진행 단계 텍스트 */
.approval-steps { background: var(--bg-canvas); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color); display: inline-block;}
.step-text { font-size: 12px; font-weight: 600; color: var(--text-sub); }
.step-current { color: var(--primary); }

/* 스피너 및 유틸 */
.spinner { width: 40px; height: 40px; border: 3px solid var(--bg-canvas); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
@keyframes spin { to { transform: rotate(360deg); } }
.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.btn-detail { background: var(--bg-hover); color: var(--text-sub); border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px; transition: 0.2s;}
.btn-detail:hover { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); }
</style>
