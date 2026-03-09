<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const { positionOptions, fetchPositionOptions } = useApi();
const authStore = useAuthStore();

// 1. 상태 데이터
const notices = ref([]);
const searchTerm = ref('');
const searchType = ref('title');
const isLoading = ref(false);
const error = ref(null);

// 모달 관련 상태
const isModalOpen = ref(false);
const modalMode = ref('view'); // 'create', 'edit', 'view'
const currentNotice = ref({});
const form = ref({
  title: '',
  type: '일반',
  target: '전체',
  content: '',
  must: false,
});

// 2. 데이터 가공 (필독 / 일반 분리 및 정렬)
const pinnedNotices = computed(() => notices.value.filter(n => n.must === 'Y'));
const normalNotices = computed(() => notices.value.filter(n => n.must === 'N'));

// 통계 데이터
const stats = computed(() => ({
  total: notices.value.length,
  pinned: pinnedNotices.value.length,
  new: notices.value.filter(n => isNew(n.regDt)).length
}));

// 3. 메서드
const isNew = (dateString) => {
  if (!dateString) return false;
  const today = new Date();
  const noticeDate = new Date(dateString);
  const diffTime = Math.abs(today - noticeDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 3;
};

const fetchNotices = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await axios.get('/api/v1/notice/list');
    if(res.data.data.length > 0) {
      notices.value = res.data.data;
    }else {
      notices.value = [];
      console.error("API 응답 구조가 예상과 다릅니다.", res.data);
    }

  } catch (e) {
    console.error("공지 로드 실패", e);
    error.value = '공지 목록을 불러오는 중 오류가 발생했습니다.';
    notices.value = [];
  } finally {
    isLoading.value = false;
  }
};

const openModal = (mode, notice = null) => {
  modalMode.value = mode;
  if (mode === 'view' && notice) {
    currentNotice.value = { ...notice };
  } else if (mode === 'create') {
    form.value = { title: '', type: '일반', target: '전체', content: '', must: false };
  }
  isModalOpen.value = true;
};

const switchToEdit = () => {
  form.value = {
    ...currentNotice.value,
    must: currentNotice.value.must === 'Y'
  };
  modalMode.value = 'edit';
};

const closeModal = () => {
  isModalOpen.value = false;
  currentNotice.value = {};
};

const saveNotice = async () => {
  if (!form.value.title || !form.value.content) {
    alert('제목과 내용을 입력해주세요.');
    return;
  }

  const payload = {
    idx: modalMode.value === 'edit' ? currentNotice.value.idx : undefined,
    must: form.value.must ? 'Y' : 'N',
    type: form.value.type,
    target: form.value.target,
    title: form.value.title,
    author: authStore.user?.managerId,
    content: form.value.content,
  };

  try {
    const url = '/api/v1/notice/register';
    await axios.post(url, payload);
    alert(`${modalMode.value === 'create' ? '등록' : '수정'}되었습니다.`);
    closeModal();
    await fetchNotices();
  } catch (err) {
    alert("저장 중 오류가 발생했습니다.");
  }
};

const deleteNotice = async () => {
  if (confirm('정말 삭제하시겠습니까?')) {
    try {
      await axios.delete(`/api/v1/notice/remove/${currentNotice.value.idx}`);
      alert('삭제되었습니다.');
      closeModal();
      fetchNotices();
    } catch (err) {
      alert("삭제 실패");
    }
  }
};

onMounted(() => {
  fetchNotices();
  fetchPositionOptions();
});
</script>

<template>
  <div class="notice-management-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-bullhorn-variant-outline"></i>
          공지사항 관리
        </h1>
        <p class="page-subtitle">전 사원 및 특정 직군을 대상으로 공지사항을 발행합니다</p>
      </div>
      <div class="header-actions">
        <button @click="openModal('create')" class="btn-add">
          <i class="mdi mdi-pencil-plus"></i>
          <span>공지 작성</span>
        </button>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-mdi-format-list-bulleted-type"></i>
            구분
          </label>
          <select v-model="searchType" class="filter-select">
            <option value="title">제목</option>
            <option value="content">내용</option>
            <option value="author">작성자</option>
          </select>
        </div>

        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                @keyup.enter="fetchNotices"
                placeholder="찾으시는 공지 내용을 입력하세요..."
                class="search-input"
            />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="fetchNotices" class="btn-search">
            <i class="mdi mdi-magnify"></i>
            <span>검색</span>
          </button>
      </div>
    </div>
    </div>

    <!-- 로딩 및 에러 -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중...</p>
    </div>

    <div v-if="error" class="error-state">
      <i class="mdi mdi-alert-circle"></i>
      <p>{{ error }}</p>
    </div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table"></i>
          <span>공지 목록 ({{ notices.length }}명)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 80px;" class="text-center">No.</th>
            <th style="width: 100px;">분류</th>
            <th style="width: 120px;">공지대상</th>
            <th>제목</th>
            <th style="width: 120px;">작성자</th>
            <th style="width: 140px;">등록일</th>
            <th style="width: 100px;" class="text-center">조회수</th>
          </tr>
          </thead>
          <tbody>
          <tr
              v-for="notice in pinnedNotices"
              :key="'p'+notice.idx"
              class="row-pinned data-row"
              @click="openModal('view', notice)"
          >
            <td class="text-center"><span class="badge-pinned">필독</span></td>
            <td><span class="type-tag">{{ notice.type }}</span></td>
            <td><span class="badge-target">{{ notice.targetName || '전체' }}</span></td>
            <td class="title-cell">
              <div class="flex items-center gap-2">
                <span class="title-text">{{ notice.title }}</span>
                <span v-if="isNew(notice.regDt)" class="badge-new">NEW</span>
              </div>
            </td>
            <td><span class="author-name">{{ notice.author }}</span></td>
            <td class="text-gray">{{ notice.regDt.substring(0, 10) }}</td>
            <td class="text-center text-gray">{{ notice.views }}</td>
          </tr>
          <tr v-for="notice in normalNotices" :key="notice.idx" class="row-normal" @click="openModal('view', notice)">
            <td class="text-center text-gray">{{ notice.idx }}</td>
            <td><span class="type-tag secondary">{{ notice.type }}</span></td>
            <td><span class="badge-target outline">{{ notice.targetName || '전체' }}</span></td>
            <td class="title-cell">
              <div class="flex items-center gap-2">
                <span class="title-text">{{ notice.title }}</span>
                <span v-if="isNew(notice.regDt)" class="badge-new">NEW</span>
              </div>
            </td>
            <td><span class="author-name">{{ notice.author }}</span></td>
            <td class="text-gray">{{ notice.regDt.substring(0, 10) }}</td>
            <td class="text-center text-gray">{{ notice.views }}</td>
          </tr>
          <tr v-if="notices.length === 0">
            <td colspan="7" class="empty-row">
              <div class="empty-state">
                <i class="mdi mdi-text-search-variant"></i>
                <p>게시된 공지사항이 없습니다.</p>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content-card">
        <div class="modal-header">
          <h3 class="modal-title">
            <i class="mdi" :class="modalMode === 'view' ? 'mdi-file-document-outline' : 'mdi-file-edit-outline'"></i>
            {{ modalMode === 'create' ? '공지사항 작성' : (modalMode === 'edit' ? '공지사항 수정' : '공지 상세 내역') }}
          </h3>
          <button @click="closeModal" class="btn-close-icon">&times;</button>
        </div>

        <div class="modal-body custom-scrollbar">
          <div v-if="modalMode === 'view'" class="notice-view-container">
            <div class="view-header-top">
              <div class="badges">
                <span v-if="currentNotice.must === 'Y'" class="badge-pinned">필독</span>
                <span class="badge-type-tag">{{ currentNotice.type }}</span>
                <span class="badge-target-tag">대상: {{ currentNotice.targetName }}</span>
              </div>
              <h2 class="view-main-title">{{ currentNotice.title }}</h2>
              <div class="view-metadata">
                <div class="meta-left">
                  <span class="author"><i class="mdi mdi-account-circle-outline"></i> {{ currentNotice.author }}</span>
                  <span class="date"><i class="mdi mdi-calendar-blank"></i> {{ currentNotice.regDt }}</span>
                </div>
                <div class="meta-right">
                  <span class="views"><i class="mdi mdi-eye-outline"></i> 조회 {{ currentNotice.views }}</span>
                </div>
              </div>
            </div>
            <div class="view-main-content">
              {{ currentNotice.content }}
            </div>
          </div>

          <form v-else class="notice-edit-form">
            <div class="form-row">
              <div class="form-group">
                <label>분류</label>
                <select v-model="form.type" class="form-select">
                  <option value="일반">일반</option>
                  <option value="시스템">시스템</option>
                  <option value="인사">인사</option>
                  <option value="긴급">긴급</option>
                </select>
              </div>
              <div class="form-group">
                <label>공지 대상</label>
                <select v-model="form.target" class="form-select">
                  <option value="전체">전체 사원</option>
                  <option v-for="pos in positionOptions" :key="pos.itemCd" :value="pos.itemCd">{{ pos.itemNm }}</option>
                </select>
              </div>
              <div class="form-group toggle-group">
                <label class="toggle-container">
                  <input type="checkbox" v-model="form.must">
                  <span class="toggle-label">상단 고정 (필독)</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label>제목</label>
              <input type="text" v-model="form.title" placeholder="공지사항 제목을 입력하세요" class="form-input">
            </div>

            <div class="form-group">
              <label>상세 내용</label>
              <textarea v-model="form.content" placeholder="공지할 상세 내용을 입력하세요" class="form-textarea"></textarea>
            </div>
          </form>
        </div>

        <div class="modal-footer">
          <template v-if="modalMode === 'view'">
            <button @click="deleteNotice" class="btn-footer-delete">삭제</button>
            <div class="footer-right-btns">
              <button @click="switchToEdit" class="btn-footer-edit">정보 수정</button>
              <button @click="closeModal" class="btn-footer-close">닫기</button>
            </div>
          </template>
          <template v-else>
            <button @click="closeModal" class="btn-footer-close">취소</button>
            <button @click="saveNotice" class="btn-footer-save">
              {{ modalMode === 'create' ? '게시물 등록' : '변경사항 저장' }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 행 스타일 */
.row-pinned { background: #fff8f8; cursor: pointer; transition: 0.2s; }
.row-pinned:hover { background: #fff1f1; }
.row-normal { cursor: pointer; transition: 0.2s; }
.row-normal:hover { background: #f8fafc; }

/* 테이블 내 뱃지/태그 */
.badge-pinned { background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; }
.type-tag { font-size: 11px; font-weight: 700; color: #667eea; background: #eff6ff; padding: 3px 8px; border-radius: 6px; }
.type-tag.secondary { color: #64748b; background: #f1f5f9; }
.badge-target { font-size: 11px; font-weight: 600; color: #4f46e5; background: #eef2ff; padding: 2px 8px; border-radius: 4px; }
.badge-target.outline { background: white; border: 1px solid #e0e7ff; }
.title-text { font-weight: 600; color: #1e293b; }
.badge-new { background: #f59e0b; color: white; font-size: 9px; font-weight: 900; padding: 1px 5px; border-radius: 4px; }
.author-name { font-weight: 500; color: #475569; }

/* === 모달 === */
.modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-blur: 4px; display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-content-card { background: white; border-radius: 24px; width: 100%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; animation: slideUp 0.3s ease-out; }

@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.modal-header { padding: 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
.modal-title { font-size: 20px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; }
.modal-title i { color: #667eea; }
.btn-close-icon { background: none; border: none; font-size: 28px; color: #94a3b8; cursor: pointer; }

.modal-body { padding: 32px; overflow-y: auto; flex: 1; }

/* 모달 - 상세 보기 */
.view-header-top { border-bottom: 2px solid #f8fafc; padding-bottom: 24px; margin-bottom: 24px; }
.badges { display: flex; gap: 8px; margin-bottom: 12px; }
.badge-type-tag { background: #f1f5f9; color: #475569; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.badge-target-tag { background: #e0f2fe; color: #0369a1; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.view-main-title { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1.4; margin-bottom: 16px; }
.view-metadata { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #94a3b8; }
.view-metadata i { margin-right: 4px; }
.meta-left { display: flex; gap: 20px; }
.view-main-content { line-height: 1.8; color: #334155; font-size: 15px; white-space: pre-wrap; min-height: 200px; }

/* 모달 - 폼 작성 */
.notice-edit-form { display: flex; flex-direction: column; gap: 20px; }
.form-row { display: flex; gap: 16px; }
.form-group label { display: block; font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 8px; }
.form-select, .form-input { width: 100%; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 14px; outline: none; }
.form-textarea { width: 100%; height: 300px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 14px; resize: none; outline: none; }
.toggle-container { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.toggle-label { font-size: 14px; font-weight: 600; color: #ef4444; }

.modal-footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
.btn-footer-delete { color: #ef4444; font-weight: 600; background: none; border: none; cursor: pointer; }
.btn-footer-edit { background: #1e293b; color: white; padding: 10px 20px; border-radius: 10px; font-weight: 600; border: none; cursor: pointer; }
.btn-footer-save { background: #10b981; color: white; padding: 10px 24px; border-radius: 10px; font-weight: 600; border: none; cursor: pointer; }
.btn-footer-close { background: white; border: 1px solid #e2e8f0; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; }

/* 유틸리티 */
.text-gray { color: #94a3b8; }
.text-center { text-align: center; }
.flex { display: flex; }
.items-center { align-items: center; }
.gap-2 { gap: 8px; }
.empty-row { background: #fafbfc; }
.empty-state { padding: 60px; text-align: center; color: #cbd5e1; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.3; }

/* 스크롤바 커스텀 */
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
</style>
