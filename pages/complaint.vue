<template>
  <div class="complaint-board-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-alert-circle-outline"></i>
          민원 게시판
        </h1>
        <p class="page-subtitle">접수된 외부 민원 내역을 확인하고 답변을 등록/관리하는 페이지입니다.</p>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">접수 현장</label>
          <SiteSelect v-model="selectedSite" :width="'200px'" />
        </div>
        <div class="filter-group">
          <label class="filter-label">처리 상태</label>
          <select v-model="selectedStatus" class="filter-select">
            <option value="전체">전체</option>
            <option value="대기">대기</option>
            <option value="답변완료">답변완료</option>
          </select>
        </div>
        <FilterSearchGroup
            v-model="searchTerm"
            placeholder="이름 또는 제목으로 검색..."
        />
      </div>
    </div>

    <div class="table-card">
      <DataTable
          :items="mappedComplaints"
          :columns="complaintColumns"
          itemKey="id"
          :rowClass="() => 'clickable-row'"
          @row-click="openComplaint"
      >
        <template #empty>
          <div class="empty-state">
            <i class="mdi mdi-inbox-outline"></i>
            <p>등록된 민원이 없습니다.</p>
          </div>
        </template>
        <template #cell-no="{ item }"><span>{{ item.no }}</span></template>
        <template #cell-siteName="{ item }">
          <span style="font-weight: 500; color: var(--text-sub);">{{ item.siteName || '-' }}</span>
        </template>
        <template #cell-title="{ item }">
          <div class="title-cell">
            <span class="title-text" style="display:flex; align-items:center;">
              <i class="mdi mdi-lock-outline" style="color:var(--text-muted); margin-right:4px;"></i>
              {{ item.title }}
              <i v-if="item.image" class="mdi mdi-image-outline" style="color:var(--primary); margin-left:4px;"></i>
            </span>
          </div>
        </template>
        <template #cell-phone="{ item }"><span>{{ maskPhone(item.phone) }}</span></template>
        <template #cell-status="{ item }">
          <span class="badge-status" :class="item.status === '대기' ? 'waiting' : 'done'">
            {{ item.status }}
          </span>
        </template>
      </DataTable>
    </div>

    <!-- 민원 상세 및 답변 모달 -->
    <Transition name="fade">
      <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
        <div class="modal-content-card">
          <div class="modal-header">
            <h3 class="modal-title">
              <i class="mdi mdi-file-document-outline"></i>
              민원 상세 및 답변
            </h3>
            <button @click="closeModal" class="btn-close-icon"><i class="mdi mdi-close"></i></button>
          </div>

          <div class="modal-body custom-scrollbar">
            <div class="complaint-view">
              <div class="view-header-top">
                <div class="badges" style="margin-bottom: 12px;">
                  <span class="badge-status" :class="currentComplaint.status === '대기' ? 'waiting' : 'done'">
                    {{ currentComplaint.status }}
                  </span>
                </div>
                <h2 class="view-main-title">{{ currentComplaint.title }}</h2>
                <div class="view-metadata">
                  <div class="meta-left">
                    <span class="author"><i class="mdi mdi-account-circle-outline"></i> {{ currentComplaint.name }}</span>
                    <span class="phone"><i class="mdi mdi-phone-outline"></i> {{ currentComplaint.phone }}</span>
                    <span class="date"><i class="mdi mdi-calendar-blank-outline"></i> {{ currentComplaint.createdAt }}</span>
                  </div>
                </div>
              </div>
              <div class="view-main-content">
                {{ currentComplaint.content }}
              </div>
              <div v-if="currentComplaint.image" class="view-image">
                <img :src="currentComplaint.image" alt="첨부 사진" />
              </div>
            </div>

            <div class="reply-section">
              <h4 class="reply-title"><i class="mdi mdi-message-reply-text-outline"></i> 관리자 답변 등록</h4>
              <textarea v-model="replyInput" class="form-textarea" placeholder="민원에 대한 답변을 입력해주세요. (입력 후 저장 시 상태가 '답변완료'로 변경됩니다)"></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button @click="deleteComplaint" class="btn-footer-delete">삭제</button>
            <div style="display:flex; gap:10px;">
              <button @click="closeModal" class="btn-footer-close">닫기</button>
              <button @click="saveReply" class="btn-footer-save">답변 저장</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import FilterSearchGroup from "~/components/common/FilterSearchGroup.vue";
import SiteSelect from "~/components/SiteSelect.vue";

import { ref, computed, onMounted, watch } from 'vue';
import DataTable from "~/components/common/DataTable.vue";

const selectedSite = ref('전체');
const selectedStatus = ref('전체');

const complaintColumns = [
  { key: 'no', label: 'No', width: '80px', align: 'center' },
  { key: 'siteName', label: '접수 현장', width: '150px' },
  { key: 'title', label: '제목', width: '*' },
  { key: 'name', label: '작성자', width: '120px' },
  { key: 'phone', label: '연락처', width: '160px', align: 'center' },
  { key: 'createdAt', label: '접수일', width: '150px', align: 'center' },
  { key: 'status', label: '처리상태', width: '100px', align: 'center' }
];

const complaints = ref([]);
const searchTerm = ref('');

onMounted(() => {
  if (process.client) {
    const saved = localStorage.getItem('complaints_data_v2');
    if (saved && JSON.parse(saved).length > 0) {
      try {
        complaints.value = JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    } else {
      // 관리자가 테스트해볼 수 있도록 기본 더미 데이터 제공
      complaints.value = [
        { id: 1, siteName: '서울 강남 재건축 현장', name: '김철수', phone: '010-1234-5678', password: '123', title: '현장 소음 관련 민원입니다.', content: '공사 현장 소음이 너무 심합니다. 조치 부탁드립니다.', image: null, createdAt: '2026-09-03', status: '대기', reply: '' },
        { id: 2, siteName: '부산 해운대 터널 공사', name: '이영희', phone: '010-9876-5432', password: '123', title: '안전 장비 미착용자 신고', content: '작업자 한 분이 안전모를 쓰지 않고 작업중입니다.', image: null, createdAt: '2026-09-02', status: '답변완료', reply: '신고해주셔서 감사합니다. 해당 작업자에게 주의 조치 및 재교육을 실시하였습니다.' }
      ];
    }
  }
});

watch(complaints, (newVal) => {
  if (process.client) {
    localStorage.setItem('complaints_data_v2', JSON.stringify(newVal));
  }
}, { deep: true });

const filteredComplaints = computed(() => {
  return complaints.value.filter(c => {
    // 1. 상태 필터
    if (selectedStatus.value !== '전체' && c.status !== selectedStatus.value) {
      return false;
    }

    // 2. 현장 필터 (SiteSelect는 객체를 반환할 수 있으므로 방어 로직 추가)
    if (selectedSite.value && selectedSite.value !== '전체') {
      const siteNameFilter = typeof selectedSite.value === 'object' ? selectedSite.value.siteName : selectedSite.value;
      if (c.siteName !== siteNameFilter) {
        return false;
      }
    }

    // 3. 검색어 필터
    if (searchTerm.value) {
      const lowerSearch = searchTerm.value.toLowerCase();
      if (!c.title.toLowerCase().includes(lowerSearch) && !c.name.toLowerCase().includes(lowerSearch)) {
        return false;
      }
    }

    return true;
  });
});

const mappedComplaints = computed(() => {
  return filteredComplaints.value.map((c, idx) => ({
    ...c,
    no: filteredComplaints.value.length - idx
  }));
});

const maskPhone = (phone) => {
  if (!phone) return '';
  const parts = phone.split('-');
  if (parts.length === 3) {
    return `${parts[0]}-****-${parts[2]}`;
  }
  return phone.length > 8 ? phone.slice(0, 3) + '-****-' + phone.slice(-4) : '***';
};

const isModalOpen = ref(false);
const currentComplaint = ref(null);
const replyInput = ref('');

const openComplaint = (item) => {
  currentComplaint.value = item;
  replyInput.value = item.reply || '';
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
};

const saveReply = () => {
  const idx = complaints.value.findIndex(c => c.id === currentComplaint.value.id);
  if (idx !== -1) {
    complaints.value[idx].reply = replyInput.value;
    // 답변이 한 글자라도 있으면 '답변완료', 비우고 저장하면 다시 '대기'로 자동 변경
    complaints.value[idx].status = replyInput.value.trim() ? '답변완료' : '대기';
  }
  closeModal();
};

const deleteComplaint = () => {
  if (confirm("정말 이 민원을 삭제하시겠습니까?")) {
    complaints.value = complaints.value.filter(c => c.id !== currentComplaint.value.id);
    closeModal();
  }
};
</script>

<style scoped>
.table-card { background: var(--bg-surface); border-radius: 12px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); overflow: hidden; }
:deep(.clickable-row) { cursor: pointer; transition: background-color 0.2s; }
:deep(.clickable-row:hover) { background-color: var(--bg-hover) !important; }
.title-cell { max-width: 300px; }
.title-text { font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.badge-status { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block; }
.badge-status.waiting { background-color: #fef3c7; color: #d97706; }
.badge-status.done { background-color: #d1fae5; color: #059669; }

.modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-content-card { background: var(--bg-surface); border-radius: 16px; width: 100%; max-width: 700px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: var(--shadow-md); overflow: hidden; border: 1px solid var(--border-color); }
.btn-close-icon { background: transparent; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 6px; transition: 0.2s; }
.btn-close-icon:hover { background: var(--bg-hover); color: var(--danger); }

.view-header-top { border-bottom: 1px solid var(--border-color); padding-bottom: 20px; margin-bottom: 20px; }
.view-main-title { font-size: 20px; font-weight: 700; color: var(--text-main); line-height: 1.4; margin: 0 0 16px 0; }
.view-metadata { display: flex; font-size: 13px; color: var(--text-sub); }
.meta-left { display: flex; gap: 16px; }
.meta-left i { margin-right: 4px; font-size: 14px; }
.view-main-content { line-height: 1.6; color: var(--text-main); font-size: 15px; white-space: pre-wrap; min-height: 80px; }
.view-image img { max-width: 100%; border-radius: 8px; border: 1px solid var(--border-color); margin-top: 20px; }

.reply-section { background: var(--bg-canvas); padding: 20px; border-radius: 12px; border: 1px solid var(--border-focus); }
.reply-title { font-size: 15px; font-weight: 700; color: var(--primary); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; margin-top: 0;}
.form-textarea { width: 100%; padding: 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; height: 120px; resize: vertical; line-height: 1.5; }
.form-textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }

.modal-footer { padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); background: var(--bg-surface); }
.btn-footer-close, .btn-footer-save, .btn-footer-delete { padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; border: none; display: flex; align-items: center; gap: 4px; }
.btn-footer-close { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-footer-close:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-footer-save { background: var(--primary); color: var(--text-inverse); }
.btn-footer-save:hover { background: var(--primary-hover); transform: translateY(-1px); }
.btn-footer-delete { color: var(--danger); background: transparent; }
.btn-footer-delete:hover { background-color: rgba(239, 68, 68, 0.1); }

.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 3px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }
</style>
