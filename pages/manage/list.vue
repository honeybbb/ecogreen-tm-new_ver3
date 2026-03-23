<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useRouter } from 'nuxt/app';
import { useAuthStore } from "~/stores/auth.js";
import Pagination from '@/components/Pagination.vue';

const router = useRouter();
const authStore = useAuthStore();

// ── 상태 관리 (목록) ───────────────────────────────────
const searchTerm   = ref('');
const selectedRole = ref('전체');
const selectedStatus = ref('전체');

const sortKey   = ref('idx');
const sortOrder = ref('desc');

const admins    = ref([]);
const isLoading = ref(false);
const error     = ref(null);

// ── 상태 관리 (모달 및 등록/수정) ────────────────────────
const isRegisterModalOpen = ref(false);
const isSubmitting = ref(false);
const isEditMode = ref(false); // 등록/수정 모드 구분
const currentEditIdx = ref(null); // 수정할 대상의 PK

const newAdmin = ref({
  isMaster: 'Y',
  managerId: '',
  password: '',
  managerNm: '',
  phone: '',
  email: ''
});

const roleOptions = [
  { isMaster: 'Y', name: '최고관리자 (전체 권한)' },
  { isMaster: 'N', name: '중간관리자 (부서 권한)' }
];

// ── 페이지네이션 ──────────────────────────────────────
const currentPage = ref(1);
const pageSize    = ref(50);
const pageSizeOptions = [50, 100, 200];

// ── API 호출 (목록 조회) ───────────────────────────────
const fetchAdmins = async () => {
  const cIdx = authStore.user?.cIdx;
  if (!cIdx) return;

  isLoading.value = true;
  error.value = null;
  try {
    const res = await axios.get(`/api/v1/manager/list/${cIdx}`);
    admins.value = res.data.data || [];
  } catch (e) {
    console.error('관리자 목록 로드 실패:', e);
    error.value = '관리자 목록을 불러오는 중 오류가 발생했습니다.';
    admins.value = [];
  } finally {
    isLoading.value = false;
  }
};

// ── 등록 모달 열기 ─────────────────────────────────────
const openRegisterModal = () => {
  isEditMode.value = false;
  currentEditIdx.value = null;
  newAdmin.value = {
    isMaster: 'N',
    managerId: '',
    password: '',
    managerNm: '',
    phone: '',
    email: ''
  };
  isRegisterModalOpen.value = true;
};

// ── 수정 모달 열기 ─────────────────────────────────────
const openEditModal = (admin) => {
  isEditMode.value = true;
  currentEditIdx.value = admin.idx; // 실제 DB의 고유 식별자(PK) 저장
  newAdmin.value = {
    isMaster: admin.isMaster,
    managerId: admin.managerId,
    password: '', // 비밀번호는 비워두고, 입력 시에만 변경
    managerNm: admin.managerNm,
    phone: admin.phone || '',
    email: admin.email || ''
  };
  isRegisterModalOpen.value = true;
};

const closeRegisterModal = () => {
  isRegisterModalOpen.value = false;
};

// ── 등록 및 수정 실행 ──────────────────────────────────
const handleSave = async () => {
  // 필수값 체크 (수정 모드일 때는 비밀번호 필수가 아님)
  if (!newAdmin.value.managerId || !newAdmin.value.managerNm) {
    alert('아이디와 이름은 필수입니다.');
    return;
  }
  if (!isEditMode.value && !newAdmin.value.password) {
    alert('비밀번호를 입력해주세요.');
    return;
  }

  const actionText = isEditMode.value ? '수정' : '등록';
  if (!confirm(`${newAdmin.value.managerNm} 관리자를 ${actionText}하시겠습니까?`)) return;

  isSubmitting.value = true;
  const payload = {
    ...newAdmin.value,
    cIdx: authStore.user?.cIdx,
  };

  try {
    let res;
    if (isEditMode.value) {
      // 수정 API (PUT) - 서버 환경에 맞게 URI 조정 (예: /api/v1/manager/{idx})
      res = await axios.put(`/api/v1/manager/${currentEditIdx.value}`, payload);
    } else {
      // 등록 API (POST)
      res = await axios.post('/api/v1/manager/register', payload);
    }

    if (res.data.result) {
      alert(`성공적으로 ${actionText}되었습니다.`);
      closeRegisterModal();
      await fetchAdmins(); // 목록 새로고침
    } else {
      alert(`${actionText} 실패: ` + (res.data.message || '오류가 발생했습니다.'));
    }
  } catch (error) {
    console.error(`${actionText} 에러:`, error);
    alert('서버 통신 중 오류가 발생했습니다.');
  } finally {
    isSubmitting.value = false;
  }
};

// ── 삭제 실행 ──────────────────────────────────────────
const deleteManager = async (managerId) => {
  if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

  try {
    const res = await axios.delete(`/api/v1/manager/${managerId}`);
    if (res.data.result) {
      alert('성공적으로 삭제되었습니다.');
      await fetchAdmins(); // 목록 새로고침
    } else {
      alert('삭제 실패: ' + (res.data.message || '오류가 발생했습니다.'));
    }
  } catch (error) {
    console.error('삭제 에러:', error);
    alert('서버 통신 중 오류가 발생했습니다.');
  }
};

// ── 정렬 및 필터 ──────────────────────────────────────
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
  currentPage.value = 1;
};

const resetFilters = () => {
  searchTerm.value     = '';
  selectedRole.value   = '전체';
  selectedStatus.value = '전체';
  currentPage.value    = 1;
};

const onFilterChange = () => { currentPage.value = 1; };

// ── 데이터 가공 (Computed) ────────────────────────────
const filteredAdmins = computed(() => {
  let result = admins.value.filter(admin => {
    const searchMatch = (admin.managerNm || '').toLowerCase().includes(searchTerm.value.toLowerCase()) ||
        (admin.managerId || '').toLowerCase().includes(searchTerm.value.toLowerCase());

    // role 필터 (SUPER/MANAGER 기준이 서버 응답 데이터 isMaster 'Y'/'N'과 일치해야 함)
    const roleMatch = selectedRole.value === '전체'
        || (selectedRole.value === 'SUPER' && admin.isMaster === 'Y')
        || (selectedRole.value === 'MANAGER' && admin.isMaster === 'N');

    const statusMatch = selectedStatus.value === '전체' || String(admin.status) === String(selectedStatus.value);

    return searchMatch && roleMatch && statusMatch;
  });

  result.sort((a, b) => {
    const mod = sortOrder.value === 'asc' ? 1 : -1;
    if (a[sortKey.value] < b[sortKey.value]) return -1 * mod;
    if (a[sortKey.value] > b[sortKey.value]) return  1 * mod;
    return 0;
  });

  return result;
});

const pagedAdmins = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredAdmins.value.slice(start, start + pageSize.value);
});

const statsInfo = computed(() => ({
  total:   filteredAdmins.value.length,
  super:   filteredAdmins.value.filter(a => a.isMaster === 'Y').length,
  manager: filteredAdmins.value.filter(a => a.isMaster === 'N').length,
  active:  filteredAdmins.value.filter(a => String(a.status) === '0').length,
}));

onMounted(() => {
  fetchAdmins();
});
</script>

<template>
  <div class="admin-list-page">

    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-shield-account-outline"></i> 본사 관리자 관리
        </h1>
        <p class="page-subtitle">최고관리자 및 중간관리자 계정을 관리합니다</p>
      </div>
      <div class="header-actions">
        <button @click="openRegisterModal" class="btn-add">
          <i class="mdi mdi-account-plus"></i> 관리자 등록
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--text-main); --card-bg: var(--bg-hover);">
        <div class="stat-icon"><i class="mdi mdi-account-group"></i></div>
        <div class="stat-content">
          <span class="stat-label">전체 계정</span>
          <span class="stat-value">{{ statsInfo.total }} <small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-shield-crown-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">최고관리자</span>
          <span class="stat-value">{{ statsInfo.super }} <small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-shield-account-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">중간관리자</span>
          <span class="stat-value">{{ statsInfo.manager }} <small>명</small></span>
        </div>
      </div>
      <!--div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-account-check"></i></div>
        <div class="stat-content">
          <span class="stat-label">재직(활성) 중</span>
          <span class="stat-value">{{ statsInfo.active }} <small>명</small></span>
        </div>
      </div-->
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-shield-outline"></i> 권한</label>
          <select v-model="selectedRole" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option value="SUPER">최고관리자</option>
            <option value="MANAGER">중간관리자</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-check-outline"></i> 상태</label>
          <select v-model="selectedStatus" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option value="0">활성</option>
            <option value="1">비활성</option>
          </select>
        </div>
        <div class="search-group" style="flex: 1; justify-content: flex-end;">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                placeholder="이름 또는 아이디 검색"
                class="search-input"
                @input="onFilterChange"
            />
          </div>
          <button @click="resetFilters" class="btn-search" title="초기화">
            <i class="mdi mdi-filter-off"></i> <span>초기화</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div><p>데이터를 불러오는 중...</p>
    </div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header" style="justify-content: space-between; display: flex;">
        <div class="table-title"><span>관리자 목록 ({{ filteredAdmins.length }}명)</span></div>
        <div class="page-size-select">
          <label>페이지당</label>
          <select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th @click="toggleSort('idx')" class="sortable text-center" style="width: 80px;">
              No <i v-if="sortKey==='idx'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
            </th>
            <th @click="toggleSort('managerId')" class="sortable">
              아이디 <i v-if="sortKey==='managerId'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
            </th>
            <th @click="toggleSort('managerNm')" class="sortable">
              이름 <i v-if="sortKey==='managerNm'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
            </th>
            <th @click="toggleSort('isMaster')" class="sortable text-center">
              권한 <i v-if="sortKey==='isMaster'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
            </th>
            <th>연락처</th>
            <th @click="toggleSort('status')" class="sortable text-center">
              상태 <i v-if="sortKey==='status'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i>
            </th>
            <th class="text-center" style="width: 140px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="admin in pagedAdmins" :key="admin.idx" class="data-row">
            <td class="text-center text-sub">{{ admin.idx }}</td>
            <td class="font-bold">{{ admin.managerId }}</td>
            <td>{{ admin.managerNm }}</td>
            <td class="text-center">
              <span v-if="admin.isMaster === 'Y'" class="badge badge-super">최고관리자</span>
              <span v-else class="badge badge-manager">중간관리자</span>
            </td>
            <td>{{ admin.phone || '-' }}</td>
            <td class="text-center">
              <span :class="['status-badge', String(admin.status) === '0' ? 'status-active' : 'status-inactive']">
                {{ String(admin.status) === '0' ? '활성화' : '비활성화' }}
              </span>
            </td>
            <td class="text-center">
              <div class="action-buttons">
                <button @click="openEditModal(admin)" class="btn-action-edit">
                  <i class="mdi mdi-pencil-outline"></i>
                </button>
                <button @click="deleteManager(admin.managerId)" class="btn-action-delete">
                  <i class="mdi mdi-trash-can-outline"></i>
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filteredAdmins.length === 0" class="empty-row">
            <td colspan="7">
              <div class="empty-state">
                <i class="mdi mdi-account-off-outline"></i>
                <p>검색된 관리자가 없습니다</p>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredAdmins.length"
      />
    </div>

    <transition name="fade">
      <div v-if="isRegisterModalOpen" class="modal-overlay" @click.self="closeRegisterModal">
        <div class="modal-box">
          <div class="modal-header">
            <h2 class="modal-title">
              <i class="mdi mdi-shield-account-outline text-primary"></i>
              {{ isEditMode ? '관리자 정보 수정' : '새 관리자 등록' }}
            </h2>
            <button class="modal-close" @click="closeRegisterModal">
              <i class="mdi mdi-close"></i>
            </button>
          </div>

          <div class="modal-body">
            <form @submit.prevent="handleSave" class="simple-form">

              <div class="form-group">
                <label class="required">시스템 권한</label>
                <div class="radio-group">
                  <label v-for="role in roleOptions" :key="role.isMaster" class="radio-label">
                    <input type="radio" name="isMaster" :value="role.isMaster" v-model="newAdmin.isMaster" />
                    <span>{{ role.name }}</span>
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label class="required">아이디</label>
                <input
                    type="text"
                    v-model="newAdmin.managerId"
                    required
                    class="form-input"
                    :disabled="isEditMode"
                    :class="{'input-disabled': isEditMode}"
                    placeholder="로그인 아이디"
                />
              </div>

              <div class="form-group">
                <label :class="{'required': !isEditMode}">
                  비밀번호
                  <span v-if="isEditMode" style="font-size:11px; color:var(--text-muted); font-weight:normal;">(변경시에만 입력)</span>
                </label>
                <input
                    type="password"
                    v-model="newAdmin.password"
                    :required="!isEditMode"
                    class="form-input"
                    placeholder="비밀번호"
                />
              </div>

              <div class="form-group">
                <label class="required">이름</label>
                <input type="text" v-model="newAdmin.managerNm" required class="form-input" placeholder="담당자 이름" />
              </div>

              <div class="form-group">
                <label>연락처</label>
                <input type="tel" v-model="newAdmin.phone" class="form-input" placeholder="010-0000-0000" />
              </div>

              <div class="form-group">
                <label>이메일</label>
                <input type="email" v-model="newAdmin.email" class="form-input" placeholder="example@email.com" />
              </div>

            </form>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-cancel-modal" @click="closeRegisterModal">취소</button>
            <button type="button" class="btn-submit-modal" @click="handleSave" :disabled="isSubmitting">
              <i class="mdi mdi-check"></i>
              {{ isSubmitting ? '처리 중...' : (isEditMode ? '수정 완료' : '등록 완료') }}
            </button>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
/* 페이지 공통 */
.page-size-select { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub); }
.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

/* 배지 */
.badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.badge-super { background-color: var(--primary-soft); color: var(--primary); }
.badge-manager { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }

.status-badge { display: inline-flex; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }

/* 관리 액션 버튼들 (수정 / 삭제) */
.action-buttons {
  display: flex; justify-content: center; gap: 6px;
}
.btn-action-edit, .btn-action-delete {
  width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-surface); transition: 0.2s;
}
.btn-action-edit { color: var(--primary); }
.btn-action-edit:hover { background: var(--primary-soft); border-color: var(--primary); }
.btn-action-delete { color: var(--danger); }
.btn-action-delete:hover { background: rgba(239, 68, 68, 0.1); border-color: var(--danger); }
.btn-action-edit i, .btn-action-delete i { font-size: 16px; }

/* 로딩/에러 */
.loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: var(--text-sub); gap: 16px; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── 모달 스타일 ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;
}
.modal-box {
  background: var(--bg-surface); width: 100%; max-width: 420px; border-radius: 16px;
  box-shadow: var(--shadow-md); display: flex; flex-direction: column; overflow: hidden;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 24px; border-bottom: 1px solid var(--border-color);
}
.modal-title { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 8px; }
.modal-close {
  background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 20px;
  display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 6px; transition: 0.2s;
}
.modal-close:hover { background: var(--bg-hover); color: var(--text-main); }

.modal-body { padding: 24px; }
.simple-form { display: flex; flex-direction: column; gap: 16px; }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 13px; font-weight: 600; color: var(--text-sub); }
.form-group label.required::after { content: '*'; color: var(--danger); margin-left: 4px; }

.form-input {
  padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px;
  font-size: 13px; color: var(--text-main); background: var(--bg-surface); transition: all 0.2s;
}
.form-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.input-disabled { background: var(--bg-hover); color: var(--text-muted); cursor: not-allowed; }

.radio-group { display: flex; gap: 8px; }
.radio-label {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-canvas); cursor: pointer; font-size: 13px; color: var(--text-sub); transition: 0.2s;
}
.radio-label input[type="radio"] { display: none; }
.radio-label:has(input:checked) {
  border-color: var(--primary); background: var(--primary-soft);
  color: var(--primary); font-weight: 600;
}

.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 16px 24px; border-top: 1px solid var(--border-color); background: var(--bg-canvas);
}
.btn-cancel-modal, .btn-submit-modal {
  padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
  border: none; display: flex; align-items: center; gap: 6px; transition: 0.2s;
}
.btn-cancel-modal { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-cancel-modal:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-submit-modal { background: var(--primary); color: var(--text-inverse); }
.btn-submit-modal:hover:not(:disabled) { background: var(--primary-hover); }
.btn-submit-modal:disabled { opacity: 0.7; cursor: not-allowed; }

/* 트랜지션 */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-10px); }

.text-primary { color: var(--primary); }
</style>
