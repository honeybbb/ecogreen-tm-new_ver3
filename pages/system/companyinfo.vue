<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '~/stores/auth.js';

const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const { bankOptions, fetchBankOption } = useApi();

// ── 상태 ──────────────────────────────────
const accountList = ref([]);
const isLoading   = ref(false);

// 추가 폼
const newAccount = ref(getEmptyAccount());
const isAdding   = ref(false);

// 수정 상태
const editingIdx  = ref(null);
const editForm    = ref({});

function getEmptyAccount() {
  return {
    bank: '',
    accountNumber: '',
    accountName: '',
    memo: '',
    isDefault: 'N'
  };
}

// ── API ───────────────────────────────────
const fetchAccounts = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get(`/api/v1/config/company/account`);
    accountList.value = res.data.data || [];
  } catch (e) {
    console.error('계좌 목록 로드 실패:', e);
  } finally {
    isLoading.value = false;
  }
};

const addAccount = async () => {
  if (!newAccount.value.bank)      return alert('은행을 선택해주세요.');
  if (!newAccount.value.accountNumber)   return alert('계좌번호를 입력해주세요.');
  if (!newAccount.value.accountName) return alert('예금주를 입력해주세요.');

  try {
    // 첫 계좌면 자동으로 대표 계좌
    if (accountList.value.length === 0) newAccount.value.isDefault = 'Y';

    await axios.post(`/api/v1/config/company/account/${cIdx}`, newAccount.value);
    await fetchAccounts();
    newAccount.value = getEmptyAccount();
    isAdding.value = false;
  } catch (e) {
    alert('추가에 실패했습니다.');
  }
};

const startEdit = (item) => {
  editingIdx.value = item.idx;
  editForm.value   = { ...item };
};

const saveEdit = async () => {
  if (!editForm.value.bank)      return alert('은행을 선택해주세요.');
  if (!editForm.value.accountNumber)   return alert('계좌번호를 입력해주세요.');
  if (!editForm.value.accountName) return alert('예금주를 입력해주세요.');

  try {
    await axios.put(`/api/v1/config/account/${editingIdx.value}`, editForm.value);
    await fetchAccounts();
    editingIdx.value = null;
  } catch (e) {
    alert('수정에 실패했습니다.');
  }
};

const cancelEdit = () => { editingIdx.value = null; editForm.value = {}; };

const deleteAccount = async (item) => {
  /*
  if (item.isDefault === 'Y' && accountList.value.length > 1) {
    return alert('대표 계좌는 삭제할 수 없습니다.\n다른 계좌를 대표로 설정한 후 삭제해주세요.');
  }

   */
  if (!confirm(`'${item.bank} ${item.accountNumber}' 계좌를 삭제하시겠습니까?`)) return;

  try {
    await axios.delete(`/api/v1/config/company/account/${item.idx}`);
    await fetchAccounts();
  } catch (e) {
    alert('삭제에 실패했습니다.');
  }
};

const setDefault = async (item) => {
  if (item.isDefault === 'Y') return;
  try {
    await axios.put(`/api/v1/config/account/${item.idx}/default`);
    await fetchAccounts();
  } catch (e) {
    alert('대표 계좌 설정에 실패했습니다.');
  }
};

onMounted(async () => {
  await fetchBankOption();
  await fetchAccounts();
});
</script>

<template>
  <div class="account-manage-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-bank-outline"></i> 회사 계좌 관리
        </h1>
        <p class="page-subtitle">정산서 및 급여 지급에 사용할 계좌를 등록하고 관리합니다.</p>
      </div>
      <button class="btn-add" @click="isAdding = true" v-if="!isAdding">
        <i class="mdi mdi-plus"></i> 계좌 추가
      </button>
    </div>

    <!-- 추가 폼 -->
    <transition name="slide-down">
      <div v-if="isAdding" class="add-form-card">
        <div class="add-form-header">
          <span><i class="mdi mdi-bank-plus"></i> 새 계좌 등록</span>
          <button class="btn-icon-close" @click="isAdding = false; newAccount = getEmptyAccount()">
            <i class="mdi mdi-close"></i>
          </button>
        </div>

        <div class="add-form-body">
          <div class="form-row">
            <div class="form-field">
              <label>은행 <span class="req">*</span></label>
              <select v-model="newAccount.bank" class="form-select">
                <option value="">선택</option>
                <option v-for="b in bankOptions" :key="b.itemNm" :value="b.itemNm">
                  {{ b.itemNm }}
                </option>
              </select>
            </div>

            <div class="form-field grow">
              <label>계좌번호 <span class="req">*</span></label>
              <input v-model="newAccount.accountNumber" type="text" class="form-input"
                     placeholder="예: 123-456-789012" />
            </div>

            <div class="form-field">
              <label>예금주 <span class="req">*</span></label>
              <input v-model="newAccount.accountName" type="text" class="form-input"
                     placeholder="예금주명" />
            </div>

            <div class="form-field grow">
              <label>용도 메모</label>
              <input v-model="newAccount.memo" type="text" class="form-input"
                     placeholder="예: 급여 지급용, 세금계산서 수금용" />
            </div>

            <!--div class="form-field center">
              <label>대표 계좌</label>
              <label class="switch">
                <input type="checkbox"
                       :checked="newAccount.isDefault === 'Y'"
                       @change="newAccount.isDefault = $event.target.checked ? 'Y' : 'N'" />
                <span class="slider round"></span>
              </label>
            </div-->
          </div>
        </div>

        <div class="add-form-footer">
          <button class="btn-cancel" @click="isAdding = false; newAccount = getEmptyAccount()">
            취소
          </button>
          <button class="btn-save" @click="addAccount">
            <i class="mdi mdi-check"></i> 저장
          </button>
        </div>
      </div>
    </transition>

    <!-- 계좌 목록 -->
    <div class="account-list-card">

      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>불러오는 중...</p>
      </div>

      <div v-else-if="accountList.length === 0" class="empty-state">
        <i class="mdi mdi-bank-off-outline"></i>
        <p>등록된 계좌가 없습니다</p>
        <span>상단 [계좌 추가] 버튼을 눌러 계좌를 등록해주세요.</span>
      </div>

      <template v-else>
        <div v-for="item in accountList" :key="item.idx"
             :class="['account-item', { 'is-default': item.isDefault === 'Y', 'is-editing': editingIdx === item.idx }]">

          <!-- 조회 모드 -->
          <template v-if="editingIdx !== item.idx">
            <div class="account-icon">
              <i class="mdi mdi-bank"></i>
            </div>

            <div class="account-info">
              <div class="account-top">
                <span class="account-bank">{{ item.bank }}</span>
                <span v-if="item.isDefault === 'Y'" class="default-badge">
                  <i class="mdi mdi-star"></i> 대표
                </span>
                <span v-if="item.memo" class="memo-badge">{{ item.memo }}</span>
              </div>
              <div class="account-number">{{ item.accountNumber }}</div>
              <div class="account-holder">예금주: {{ item.accountName }}</div>
            </div>

            <div class="account-actions">
              <!--button v-if="item.isDefault !== 'Y'"
                      class="btn-set-default" @click="setDefault(item)"
                      title="대표 계좌로 설정">
                <i class="mdi mdi-star-outline"></i>
              </button-->
              <button class="btn-edit" @click="startEdit(item)" title="수정">
                <i class="mdi mdi-pencil-outline"></i>
              </button>
              <button class="btn-delete" @click="deleteAccount(item)" title="삭제">
                <i class="mdi mdi-trash-can-outline"></i>
              </button>
            </div>
          </template>

          <!-- 수정 모드 -->
          <template v-else>
            <div class="edit-form">
              <div class="form-row">
                <div class="form-field">
                  <label>은행 <span class="req">*</span></label>
                  <select v-model="editForm.bank" class="form-select">
                    <option value="">선택</option>
                    <option v-for="b in bankOptions" :key="b.itemNm" :value="b.itemNm">
                      {{ b.itemNm }}
                    </option>
                  </select>
                </div>

                <div class="form-field grow">
                  <label>계좌번호 <span class="req">*</span></label>
                  <input v-model="editForm.accountNumber" type="text" class="form-input"
                         placeholder="예: 123-456-789012" />
                </div>

                <div class="form-field">
                  <label>예금주 <span class="req">*</span></label>
                  <input v-model="editForm.accountName" type="text" class="form-input"
                         placeholder="예금주명" />
                </div>

                <div class="form-field grow">
                  <label>용도 메모</label>
                  <input v-model="editForm.memo" type="text" class="form-input"
                         placeholder="예: 급여 지급용" />
                </div>

                <!--div class="form-field center">
                  <label>대표 계좌</label>
                  <label class="switch">
                    <input type="checkbox"
                           :checked="editForm.isDefault === 'Y'"
                           @change="editForm.isDefault = $event.target.checked ? 'Y' : 'N'" />
                    <span class="slider round"></span>
                  </label>
                </div-->
              </div>

              <div class="edit-actions">
                <button class="btn-cancel" @click="cancelEdit">취소</button>
                <button class="btn-save" @click="saveEdit">
                  <i class="mdi mdi-check"></i> 저장
                </button>
              </div>
            </div>
          </template>

        </div>
      </template>
    </div>

  </div>
</template>

<style scoped>
/* ── 추가 폼 카드 ── */
.add-form-card {
  background: var(--bg-surface);
  border: 1px solid var(--primary);
  border-radius: 12px;
  margin-bottom: 20px;
  overflow: hidden;
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.add-form-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px;
  background: var(--primary-soft);
  border-bottom: 1px solid var(--primary);
  font-size: 14px; font-weight: 700; color: var(--primary);
}

.add-form-header i { margin-right: 6px; }

.btn-icon-close {
  width: 28px; height: 28px; border-radius: 6px;
  background: none; border: none; color: var(--primary);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 18px; transition: background 0.15s;
}
.btn-icon-close:hover { background: rgba(0,0,0,0.08); }

.add-form-body { padding: 20px; }
.add-form-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 14px 20px;
  background: var(--bg-canvas);
  border-top: 1px solid var(--border-color);
}

/* ── 폼 공통 ── */
.form-row {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end;
}
.form-field {
  display: flex; flex-direction: column; gap: 5px; min-width: 140px;
}
.form-field.grow { flex: 1; min-width: 180px; }
.form-field.center { align-items: center; justify-content: flex-end; gap: 8px; }
.form-field label {
  font-size: 11px; font-weight: 700; color: var(--text-sub); white-space: nowrap;
}
.req { color: var(--danger); }

.form-input, .form-select {
  padding: 8px 10px;
  border: 1px solid var(--border-color); border-radius: 7px;
  font-size: 13px; color: var(--text-main);
  background: var(--bg-surface); box-sizing: border-box;
  transition: border-color 0.15s;
}
.form-input:focus, .form-select:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

/* ── 스위치 ── */
.switch { position: relative; display: inline-block; width: 40px; height: 22px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; inset: 0; background: #cbd5e1; transition: .3s; }
.slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background: #fff; transition: .3s; }
.slider.round { border-radius: 22px; }
.slider.round:before { border-radius: 50%; }
input:checked + .slider { background: var(--primary); }
input:checked + .slider:before { transform: translateX(18px); }

/* ── 계좌 목록 카드 ── */
.account-list-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

/* ── 계좌 아이템 ── */
.account-item {
  display: flex; align-items: center; gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
  transition: background 0.15s;
}
.account-item:last-child { border-bottom: none; }
.account-item:hover { background: var(--bg-hover); }

.account-item.is-default {
  background: var(--primary-soft);
  border-left: 4px solid var(--primary);
}
.account-item.is-default:hover { background: color-mix(in srgb, var(--primary-soft) 80%, white); }

.account-item.is-editing {
  background: var(--bg-canvas);
  border-left: 4px solid var(--warning);
  flex-direction: column;
  align-items: stretch;
  padding: 20px;
}

/* 계좌 아이콘 */
.account-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--primary-soft); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.account-icon i { font-size: 22px; color: var(--primary); }

/* 계좌 정보 */
.account-info { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }

.account-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.account-bank { font-size: 15px; font-weight: 700; color: var(--text-main); }

.default-badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; border-radius: 20px;
  background: var(--primary); color: #fff;
  font-size: 11px; font-weight: 700;
}
.default-badge i { font-size: 12px; }

.memo-badge {
  padding: 2px 8px; border-radius: 20px;
  background: var(--bg-canvas); color: var(--text-sub);
  border: 1px solid var(--border-color);
  font-size: 11px; font-weight: 600;
}

.account-number {
  font-size: 16px; font-weight: 600; color: var(--text-main);
  letter-spacing: 0.5px;
}
.account-holder { font-size: 12px; color: var(--text-sub); }

/* 액션 버튼 */
.account-actions { display: flex; gap: 6px; flex-shrink: 0; }

.btn-set-default, .btn-edit, .btn-delete {
  width: 32px; height: 32px; border-radius: 7px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 16px; color: var(--text-sub);
  transition: all 0.15s;
}
.btn-set-default:hover { background: #fef9c3; border-color: #eab308; color: #eab308; }
.btn-edit:hover { background: var(--primary); border-color: var(--primary); color: #fff; }
.btn-delete:hover { background: var(--danger); border-color: var(--danger); color: #fff; }

/* 수정 폼 */
.edit-form { width: 100%; }
.edit-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 14px; padding-top: 14px;
  border-top: 1px dashed var(--border-color);
}

/* 공통 버튼 */
.btn-cancel {
  padding: 8px 16px; border-radius: 7px;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  color: var(--text-sub); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); }

.btn-save {
  display: flex; align-items: center; gap: 5px;
  padding: 8px 18px; border-radius: 7px;
  background: var(--primary); border: none;
  color: #fff; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.btn-save:hover { background: var(--primary-hover); }

/* 로딩 / 빈 상태 */
.loading-state, .empty-state {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 60px 20px; color: var(--text-sub);
}
.spinner {
  width: 36px; height: 36px; border-radius: 50%;
  border: 3px solid var(--bg-canvas); border-top-color: var(--primary);
  animation: spin 1s linear infinite; margin-bottom: 14px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state i { font-size: 48px; opacity: 0.3; margin-bottom: 12px; }
.empty-state p { font-size: 15px; font-weight: 600; margin: 0 0 6px; }
.empty-state span { font-size: 13px; }

/* 애니메이션 */
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.25s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-10px); }

@media (max-width: 768px) {
  .form-row { flex-direction: column; }
  .form-field.grow { min-width: 100%; }
  .account-item { flex-wrap: wrap; }
  .account-actions { width: 100%; justify-content: flex-end; }
}
</style>
