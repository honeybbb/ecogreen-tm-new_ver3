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
          <i class="mdi mdi-pencil-plus-outline"></i>
          <span>공지 작성</span>
        </button>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-format-list-bulleted-type"></i>
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

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중...</p>
    </div>

    <div v-if="error" class="error-state">
      <i class="mdi mdi-alert-circle-outline"></i>
      <p>{{ error }}</p>
    </div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-format-list-bulleted"></i>
          <span>공지 목록 ({{ notices.length }}건)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 80px;" class="text-center">No.</th>
            <th style="width: 100px;" class="text-center">분류</th>
            <th style="width: 120px;" class="text-center">공지대상</th>
            <th>제목</th>
            <th style="width: 120px;">작성자</th>
            <th style="width: 140px;" class="text-center">등록일</th>
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
            <td class="text-center"><span class="type-tag">{{ notice.type }}</span></td>
            <td class="text-center"><span class="badge-target">{{ notice.targetName || '전체' }}</span></td>
            <td class="title-cell">
              <div class="flex items-center gap-2">
                <span class="title-text">{{ notice.title }}</span>
                <span v-if="isNew(notice.regDt)" class="badge-new">NEW</span>
              </div>
            </td>
            <td><span class="author-name">{{ notice.author }}</span></td>
            <td class="text-center text-gray">{{ notice.regDt.substring(0, 10) }}</td>
            <td class="text-center text-gray">{{ notice.views }}</td>
          </tr>

          <tr v-for="notice in normalNotices" :key="notice.idx" class="row-normal data-row" @click="openModal('view', notice)">
            <td class="text-center text-gray">{{ notice.idx }}</td>
            <td class="text-center"><span class="type-tag secondary">{{ notice.type }}</span></td>
            <td class="text-center"><span class="badge-target outline">{{ notice.targetName || '전체' }}</span></td>
            <td class="title-cell">
              <div class="flex items-center gap-2">
                <span class="title-text">{{ notice.title }}</span>
                <span v-if="isNew(notice.regDt)" class="badge-new">NEW</span>
              </div>
            </td>
            <td><span class="author-name">{{ notice.author }}</span></td>
            <td class="text-center text-gray">{{ notice.regDt.substring(0, 10) }}</td>
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

    <transition name="fade">
      <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
        <div class="modal-content-card">
          <div class="modal-header">
            <h3 class="modal-title">
              <i class="mdi" :class="modalMode === 'view' ? 'mdi-file-document-outline' : 'mdi-file-edit-outline'"></i>
              {{ modalMode === 'create' ? '공지사항 작성' : (modalMode === 'edit' ? '공지사항 수정' : '공지 상세 내역') }}
            </h3>
            <button @click="closeModal" class="btn-close-icon"><i class="mdi mdi-close"></i></button>
          </div>

          <div class="modal-body custom-scrollbar">
            <div v-if="modalMode === 'view'" class="notice-view-container">
              <div class="view-header-top">
                <div class="badges">
                  <span v-if="currentNotice.must === 'Y'" class="badge-pinned">필독</span>
                  <span class="badge-type-tag">{{ currentNotice.type }}</span>
                  <span class="badge-target-tag">대상: {{ currentNotice.targetName || '전체' }}</span>
                </div>
                <h2 class="view-main-title">{{ currentNotice.title }}</h2>
                <div class="view-metadata">
                  <div class="meta-left">
                    <span class="author"><i class="mdi mdi-account-circle-outline"></i> {{ currentNotice.author }}</span>
                    <span class="date"><i class="mdi mdi-calendar-blank-outline"></i> {{ currentNotice.regDt }}</span>
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
                  <label>옵션</label>
                  <label class="custom-checkbox-wrapper">
                    <input type="checkbox" v-model="form.must" class="custom-checkbox">
                    <span class="toggle-label text-red">상단 고정 (필독)</span>
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
              <button @click="deleteNotice" class="btn-footer-delete"><i class="mdi mdi-trash-can-outline"></i> 삭제</button>
              <div class="footer-right-btns">
                <button @click="switchToEdit" class="btn-footer-edit"><i class="mdi mdi-pencil-outline"></i> 수정</button>
                <button @click="closeModal" class="btn-footer-close">닫기</button>
              </div>
            </template>
            <template v-else>
              <button @click="closeModal" class="btn-footer-close">취소</button>
              <button @click="saveNotice" class="btn-footer-save">
                <i class="mdi mdi-check"></i> {{ modalMode === 'create' ? '게시물 등록' : '변경사항 저장' }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 설정 === */
.notice-management-page {
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #334155;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;
}
.header-left { flex: 1; }
.page-title {
  font-size: 24px; font-weight: 700; color: #1e293b; margin: 0 0 6px 0;
  display: flex; align-items: center; gap: 10px; letter-spacing: -0.5px;
}
.page-title i { font-size: 26px; color: #4f46e5; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

.header-actions { display: flex; gap: 10px; }
.btn-add {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px;
  background-color: #6d28d9; border: none; border-radius: 8px; color: white;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05); white-space: nowrap;
}
.btn-add:hover { background-color: #5b21b6; transform: translateY(-1px); }
.btn-add i { font-size: 18px; }

/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.filter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 140px; }

.filter-label {
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569;
}
.filter-label i { font-size: 16px; color: #4f46e5; }

.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; outline: none; transition: all 0.2s; height: 42px;
}
.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

/* 검색 그룹 */
.search-group { display: flex; gap: 8px; flex: 1; min-width: 280px; align-items: flex-end;}
.search-box {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #f8fafc;
  border: 1px solid #e2e8f0; border-radius: 8px; flex: 1; height: 42px; transition: all 0.2s; box-sizing: border-box;
}
.search-box:focus-within { background: white; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.search-input { border: none; background: transparent; outline: none; width: 100%; font-size: 13px; color: #334155; }
.search-input::placeholder { color: #94a3b8; }
.search-box i { font-size: 18px; color: #94a3b8; }

.search-clear { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;}
.search-clear:hover { background: #e2e8f0; color: #64748b; }

.btn-search {
  display: flex; align-items: center; gap: 6px; background-color: #6d28d9; color: white; border: none;
  padding: 0 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  height: 42px; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.btn-search:hover { background-color: #5b21b6; transform: translateY(-1px); }
.btn-search i { font-size: 16px; }

/* === 로딩 상태 === */
.loading-state, .error-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; background: white; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px;
}
.spinner {
  width: 40px; height: 40px; border: 3px solid #f1f5f9; border-top-color: #4f46e5;
  border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p, .error-state p { margin-top: 16px; font-size: 14px; color: #64748b; }
.error-state i { font-size: 40px; color: #ef4444; margin-bottom: 10px;}

/* === 테이블 영역 === */
.table-card {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); overflow: hidden; max-width: 100%;
}
.table-header { padding: 18px 24px; border-bottom: 1px solid #e2e8f0; background: #ffffff; }
.table-title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #1e293b; }
.table-title i { font-size: 20px; color: #4f46e5; }

.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

.data-table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: 13px; }
.data-table thead { background-color: #6d28d9; }
.data-table th { padding: 12px 16px; color: white; text-align: left; font-size: 12px; font-weight: 600; white-space: nowrap; }
.data-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }

/* 행 상태 및 호버 */
.row-pinned { background-color: #fff1f2; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid #ffe4e6 !important;}
.row-pinned:hover { background-color: #ffe4e6; }
.row-normal { cursor: pointer; transition: background 0.2s; }
.row-normal:hover { background-color: #f8fafc; }

/* 테이블 내 배지/태그 (플랫 파스텔톤) */
.badge-pinned { background-color: #ef4444; color: white; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.type-tag { font-size: 11px; font-weight: 600; color: #4f46e5; background-color: #eef2ff; padding: 3px 8px; border-radius: 4px; }
.type-tag.secondary { color: #475569; background-color: #f1f5f9; }
.badge-target { font-size: 11px; font-weight: 600; color: #0369a1; background-color: #e0f2fe; padding: 3px 8px; border-radius: 4px; }
.badge-target.outline { background-color: white; border: 1px solid #cbd5e1; color: #64748b;}
.badge-new { background-color: #f59e0b; color: white; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; line-height: 1;}

/* 테이블 텍스트 */
.title-cell { max-width: 300px; }
.title-text { font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;}
.author-name { font-weight: 500; color: #475569; }

/* 빈 상태 */
.empty-row { background-color: white !important; }
.empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: #cbd5e1; display: block;}
.empty-state p { font-size: 14px; font-weight: 500; color: #64748b; margin: 0; }

/* === 모달 오버레이 === */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
}
.modal-content-card {
  background: white; border-radius: 16px; width: 100%; max-width: 750px; max-height: 90vh;
  display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); overflow: hidden; border: 1px solid #e2e8f0;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }

/* 모달 헤더 */
.modal-header {
  padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;
}
.modal-title { font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px; margin: 0;}
.modal-title i { color: #4f46e5; font-size: 20px;}
.btn-close-icon {
  background: transparent; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; transition: 0.2s;
  display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 6px;
}
.btn-close-icon:hover { background: #e2e8f0; color: #ef4444; }

/* 모달 바디 */
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }

/* 조회 모드 (View) */
.view-header-top { border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; }
.badges { display: flex; gap: 8px; margin-bottom: 12px; }
.badge-type-tag { background-color: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.badge-target-tag { background-color: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.view-main-title { font-size: 20px; font-weight: 700; color: #1e293b; line-height: 1.4; margin: 0 0 16px 0; }
.view-metadata { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #64748b; }
.view-metadata i { font-size: 14px; margin-right: 4px; }
.meta-left { display: flex; gap: 16px; }
.view-main-content { line-height: 1.6; color: #334155; font-size: 14px; white-space: pre-wrap; min-height: 150px; }

/* 폼 모드 (Edit/Create) */
.notice-edit-form { display: flex; flex-direction: column; gap: 20px; }
.form-row { display: flex; gap: 16px; flex-wrap: wrap;}
.form-group { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.form-group label { font-size: 13px; font-weight: 600; color: #475569; }

.form-select, .form-input, .form-textarea {
  width: 100%; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; outline: none; transition: all 0.2s; color: #334155; background: white; box-sizing: border-box;
  font-family: inherit;
}
.form-select:focus, .form-input:focus, .form-textarea:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.form-textarea { height: 250px; resize: vertical; }

/* 커스텀 체크박스 토글 (플랫) */
.toggle-group { justify-content: flex-end; }
.custom-checkbox-wrapper { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; padding: 10px 0;}
.custom-checkbox {
  appearance: none; -webkit-appearance: none; width: 18px; height: 18px;
  border: 2px solid #cbd5e1; border-radius: 4px; cursor: pointer; transition: all 0.2s; background: white; margin: 0; position: relative;
}
.custom-checkbox:hover { border-color: #ef4444; }
.custom-checkbox:checked { border-color: #ef4444; background-color: #ef4444; }
.custom-checkbox:checked::after {
  content: ''; position: absolute; top: 2px; left: 5px; width: 4px; height: 8px;
  border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg);
}
.toggle-label.text-red { color: #dc2626; font-weight: 600; font-size: 13px;}

/* 모달 푸터 */
.modal-footer {
  padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0;
  display: flex; justify-content: space-between; align-items: center; border-radius: 0 0 16px 16px;
}
.footer-right-btns { display: flex; gap: 10px; }

.btn-footer-delete { color: #dc2626; font-weight: 600; background: transparent; border: none; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-radius: 6px; transition: 0.2s;}
.btn-footer-delete:hover { background-color: #fef2f2; }

.btn-footer-close { background: white; border: 1px solid #e2e8f0; color: #475569; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s;}
.btn-footer-close:hover { background: #f1f5f9; color: #1e293b;}

.btn-footer-edit { background: #4f46e5; color: white; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 4px;}
.btn-footer-edit:hover { background: #4338ca; transform: translateY(-1px);}

.btn-footer-save { background: #10b981; color: white; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 4px;}
.btn-footer-save:hover { background: #059669; transform: translateY(-1px);}

/* 유틸리티 */
.text-gray { color: #64748b; font-size: 12px; }
.text-center { text-align: center; }
.flex { display: flex; }
.items-center { align-items: center; }
.gap-2 { gap: 6px; }
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

/* === 반응형 === */
@media (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .search-group { width: 100%; min-width: 100%; }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 14px; align-items: flex-start; }
  .header-actions { width: 100%; display: flex; justify-content: stretch;}
  .btn-add { flex: 1; justify-content: center; }

  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group { min-width: 100%; }

  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
  .btn-search { flex-shrink: 0; }

  .form-row { flex-direction: column; gap: 16px;}
  .toggle-group { margin-top: -8px;}

  .modal-footer { flex-direction: column; gap: 16px; justify-content: center;}
  .footer-right-btns { width: 100%; display: flex; gap: 10px; }
  .btn-footer-edit, .btn-footer-close, .btn-footer-save { flex: 1; justify-content: center; }
}
</style>
