<template>
  <div class="notice-page max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">

    <div class="page-header">
      <h2 class="page-title">공지사항</h2>
      <button @click="openModal('create')" class="btn btn-primary">
        글쓰기
      </button>
    </div>

    <div class="search-panel">
      <div class="input-group search-term-group">
        <select v-model="searchType" class="input-select">
          <option value="title">제목</option>
          <option value="content">내용</option>
          <option value="author">작성자</option>
        </select>
        <input
            type="text"
            v-model="searchQuery"
            @keyup.enter="fetchNotices"
            placeholder="검색어를 입력하세요"
            class="input-text"
        >
        <button @click="fetchNotices" class="btn btn-secondary">검색</button>
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
        <tr>
          <th style="width: 60px;">No.</th>
          <th style="width: 80px;">분류</th>
          <th style="width: 80px;">대상</th>
          <th>제목</th>
          <th style="width: 100px;">작성자</th>
          <th style="width: 120px;">작성일</th>
          <th style="width: 80px;">조회수</th>
        </tr>
        </thead>
        <tbody>
        <tr
            v-for="notice in pinnedNotices"
            :key="'pinned-' + notice.idx"
            class="pinned-row"
            @click="openModal('view', notice)"
        >
          <td><span class="badge-pinned">필독</span></td>
          <td>{{ notice.type }}</td>
          <td class="target-cell">{{ notice.target }}</td>
          <td class="text-left title-cell">
            {{ notice.title }}
            <span v-if="isNew(notice.date)" class="badge-new">N</span>
          </td>
          <td>{{ notice.author }}</td>
          <td>{{ notice.regDt.substring(0, 10) }}</td>
          <td>{{ notice.views }}</td>
        </tr>

        <tr
            v-for="notice in normalNotices"
            :key="notice.idx"
            class="hover-row"
            @click="openModal('view', notice)"
        >
          <td>{{ notice.idx }}</td>
          <td>{{ notice.type }}</td>
          <td class="target-cell">{{ notice.target }}</td>
          <td class="text-left title-cell">
            {{ notice.title }}
            <span v-if="isNew(notice.regDt)" class="badge-new">N</span>
          </td>
          <td>{{ notice.author }}</td>
          <td>{{ notice.regDt.substring(0, 10) }}</td>
          <td>{{ notice.views }}</td>
        </tr>

        <tr v-if="totalNotices.length === 0">
          <td colspan="7" class="empty-message">등록된 공지사항이 없습니다.</td>
        </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <button class="btn-page" disabled>&lt;</button>
      <button class="btn-page active">1</button>
      <button class="btn-page">2</button>
      <button class="btn-page">3</button>
      <button class="btn-page">&gt;</button>
    </div>

    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">
            {{ modalMode === 'create' ? '공지사항 등록' : (modalMode === 'edit' ? '공지사항 수정' : '공지사항 상세') }}
          </h3>
          <button @click="closeModal" class="close-btn">&times;</button>
        </div>

        <div class="modal-body">

          <div v-if="modalMode === 'view'" class="view-mode">
            <div class="view-header">
              <div class="header-badges mb-2">
                <span v-if="currentNotice.must" class="badge-pinned inline-block mr-2">필독</span>
                <span class="badge-target">대상: {{ currentNotice.target }}</span>
              </div>

              <h2 class="view-title">{{ currentNotice.title }}</h2>

              <div class="view-meta">
                <span>{{ currentNotice.type }}</span>
                <span class="divider">|</span>
                <span>{{ currentNotice.author }}</span>
                <span class="divider">|</span>
                <span>{{ currentNotice.date }}</span>
                <span class="divider">|</span>
                <span>조회 {{ currentNotice.views }}</span>
              </div>
            </div>
            <div class="view-content">
              {{ currentNotice.content }}
            </div>
          </div>

          <form v-else @submit.prevent="saveNotice" class="edit-form">
            <div class="input-group">
              <label>옵션</label>
              <div class="checkbox-wrapper">
                <label>
                  <input type="checkbox" v-model="form.must"> 상단 고정 (필독)
                </label>
              </div>
            </div>

            <div class="form-row">
              <div class="input-group half">
                <label>분류</label>
                <select v-model="form.type" class="input-select w-full">
                  <option value="일반">일반</option>
                  <option value="시스템">시스템</option>
                  <option value="인사">인사</option>
                  <option value="긴급">긴급</option>
                </select>
              </div>

              <div class="input-group half">
                <label>공지 대상 (직위)</label>
                <select v-model="form.target" class="input-select w-full">
                  <option value="전체">전체</option>
                  <option v-for="target in positionOptions" :key="target" :value="target.itemCd">
                    {{ target.itemNm }}
                  </option>
                </select>
              </div>
            </div>

            <div class="input-group">
              <label>제목</label>
              <input type="text" v-model="form.title" class="input-text w-full" placeholder="제목을 입력하세요" required>
            </div>

            <div class="input-group">
              <label>내용</label>
              <textarea v-model="form.content" class="input-text w-full h-40" placeholder="내용을 입력하세요" required></textarea>
            </div>
          </form>
        </div>

        <div class="modal-footer">
          <template v-if="modalMode === 'view'">
            <div class="left-btns">
              <button @click="deleteNotice" class="btn btn-danger">삭제</button>
            </div>
            <div class="right-btns">
              <button @click="switchToEdit" class="btn btn-primary">수정</button>
              <button @click="closeModal" class="btn btn-secondary">닫기</button>
            </div>
          </template>

          <template v-else>
            <button @click="closeModal" class="btn btn-secondary">취소</button>
            <button @click="saveNotice" class="btn btn-success">
              {{ modalMode === 'create' ? '등록' : '저장' }}
            </button>
          </template>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
const { positionOptions, fetchPositionOptions } = useApi()
// 1. 상태 데이터
const notices = ref([]);
const searchQuery = ref('');
const searchType = ref('title');

// ✅ [추가] 공지 대상 옵션 목록
const targetOptions = ref(['전체', '소장', '반장', '경비원', '미화원', '관리자']);

// 모달 관련 상태
const isModalOpen = ref(false);
const modalMode = ref('view');
const currentNotice = ref({});
const form = ref({
  title: '',
  type: '일반',
  target: '전체', // ✅ 기본값 설정
  content: '',
  must: false,
});

// 2. 더미 데이터 로드
onMounted(() => {
  /*
  notices.value = [
    // ✅ target 필드 추가
    { id: 10, title: '[안내] 반장급 이상 긴급 회의 소집', category: '인사', target: '반장', author: '관리자', date: '2026-01-30', views: 120, must: true, content: '금일 오후 2시 회의실 A에서 긴급 회의가 있습니다.' },
    { id: 9, title: '시스템 서버 점검 공지 (02/01)', category: '시스템', target: '전체', author: '개발팀', date: '2026-01-29', views: 45, must: true, content: '새벽 2시부터 4시까지 점검이 있을 예정입니다.' },
    { id: 8, title: '신규 직원 소개 (김철수 님)', category: '일반', target: '전체', author: '인사팀', date: '2026-01-28', views: 88, must: false, content: '환영합니다.' },
    { id: 7, title: '현장 소장 월간 보고서 제출 양식', category: '업무', target: '소장', author: '관리자', date: '2026-01-15', views: 230, must: false, content: '첨부된 양식을 사용해주세요.' },
  ];

   */
  fetchNotices()
  fetchPositionOptions();
});

// 3. Computed (필독 / 일반 분리)
const pinnedNotices = computed(() => {
  return notices.value.filter(n => n.must == 'Y');
});

const normalNotices = computed(() => {
  return notices.value.filter(n => n.must == 'N');
});

const totalNotices = computed(() => notices.value);


// 4. 메서드
const isNew = (dateString) => {
  const today = new Date();
  const noticeDate = new Date(dateString);
  const diffTime = Math.abs(today - noticeDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 3;
};

const fetchNotices = () => {
  // alert(`검색: [${searchType.value}] ${searchQuery.value}`);
  axios.get('/api/v1/notice/list')
      .then(res => {
        notices.value = res.data.data;
      })
};

// 모달 열기
const openModal = (mode, notice = null) => {
  modalMode.value = mode;
  if (mode === 'view' && notice) {
    currentNotice.value = { ...notice };
  } else if (mode === 'create') {
    // ✅ 작성 시 기본값 초기화
    form.value = { title: '', type: '일반', target: '전체', content: '', must: false };
  }
  isModalOpen.value = true;
};

// 수정 모드로 전환
const switchToEdit = () => {
  form.value = { ...currentNotice.value };
  modalMode.value = 'edit';
};

const closeModal = () => {
  isModalOpen.value = false;
};

// 저장 (등록/수정)
const saveNotice = () => {
  if (!form.value.title || !form.value.content) {
    alert('제목과 내용을 입력해주세요.');
    return;
  }

  const text = modalMode.value === 'create' ? '등록':'수정'
  /*
  if (modalMode.value === 'create') {
    const newIdx = notices.value.length > 0 ? Math.max(...notices.value.map(n => n.id)) + 1 : 1;
    notices.value.unshift({
      idx: newIdx,
      ...form.value,
      author: '관리자',
      date: new Date().toISOString().slice(0, 10),
      views: 0
    });

  } else {
    // 수정 로직
    const index = notices.value.findIndex(n => n.id === currentNotice.value.id);
    if (index !== -1) {
      notices.value[index] = { ...notices.value[index], ...form.value };
      // 현재 보고 있는 상세 내용도 업데이트
      currentNotice.value = { ...notices.value[index] };
    }
    alert('수정되었습니다.');
  }

   */
  const payload = {
    must: !form.value.must ? 'N':'Y',
    type: form.value.type,
    target: form.value.target,
    title: form.value.title,
    content: form.value.content,
  }

  axios.post('/api/v1/notice/register', payload)
  alert(`${text}되었습니다.`);
  closeModal();
};

const deleteNotice = () => {
  if (confirm('정말 삭제하시겠습니까?')) {
    //notices.value = notices.value.filter(n => n.id !== currentNotice.value.id);
    axios.delete('/api/v1/notice/remove')
    alert('삭제되었습니다.');
    closeModal();
  }
};
</script>

<style scoped>
.hover-row:hover { background-color: #f9fafb; cursor: pointer; }

/* 필독 공지 스타일 */
.pinned-row { background-color: #fef2f2; cursor: pointer; }
.pinned-row:hover { background-color: #fee2e2; }
.pinned-row td { font-weight: 600; }

.badge-pinned { display: inline-block; padding: 2px 6px; background-color: #ef4444; color: white; font-size: 0.75rem; border-radius: 4px; font-weight: 700; }
.badge-new { display: inline-block; margin-left: 5px; width: 16px; height: 16px; line-height: 16px; background-color: #f59e0b; color: white; font-size: 0.7rem; border-radius: 50%; text-align: center; vertical-align: text-top; }

/* ✅ [추가] 상세 보기 대상 뱃지 스타일 */
.badge-target {
  display: inline-block;
  padding: 2px 8px;
  background-color: #e0e7ff;
  color: #3730a3;
  font-size: 0.8rem;
  border-radius: 4px;
  font-weight: 600;
}

/* ✅ [추가] 리스트 내 대상 컬럼 강조 */
.target-cell {
  color: #4b5563;
  font-weight: 500;
}

.title-cell { text-align: left; padding-left: 15px; }
.empty-message { padding: 40px; color: #9ca3af; }

/* 페이지네이션 */
.pagination { display: flex; justify-content: center; margin-top: 20px; gap: 5px; }
.btn-page { width: 32px; height: 32px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; color: #4b5563; }
.btn-page.active { background-color: #4f46e5; color: white; border-color: #4f46e5; }
.btn-page:disabled { opacity: 0.5; cursor: not-allowed; }

/* === 모달 스타일 === */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: white; width: 800px; max-width: 90%; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); display: flex; flex-direction: column; max-height: 85vh; }
.modal-header { padding: 15px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
.modal-title { font-size: 1.2rem; font-weight: 700; color: #1f2937; }
.close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #9ca3af; }

.modal-body { padding: 20px; overflow-y: auto; flex: 1; }

/* 상세 보기 모드 */
.view-header { border-bottom: 1px solid #e5e7eb; padding-bottom: 15px; margin-bottom: 15px; }
.view-title { font-size: 1.3rem; font-weight: 700; color: #1f2937; margin-bottom: 8px; }
.view-meta { font-size: 0.9rem; color: #6b7280; }
.divider { margin: 0 8px; color: #d1d5db; }
.view-content { min-height: 200px; line-height: 1.6; color: #374151; white-space: pre-wrap; }

/* 작성/수정 폼 */
.edit-form .input-group { margin-bottom: 15px; }
.edit-form label { display: block; font-size: 0.9rem; font-weight: 600; color: #4b5563; margin-bottom: 5px; }

/* ✅ [추가] 폼 가로 배치용 */
.form-row { display: flex; gap: 15px; margin-bottom: 15px; }
.form-row .input-group { margin-bottom: 0; }
.half { flex: 1; }

.w-full { width: 100%; }
.h-40 { height: 200px; resize: vertical; }
.checkbox-wrapper label { display: flex; align-items: center; gap: 5px; cursor: pointer; }

.modal-footer { padding: 15px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 10px; }
.modal-footer:has(.left-btns) { justify-content: space-between; }
.right-btns { display: flex; gap: 10px; }
</style>
