<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '~/stores/auth.js';

const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// ==========================================
// 1. 상태 관리
// ==========================================
const rawCodeList = ref([]);

const selectedCategoryId = ref(null);
const searchQuery = ref('');

// 중분류 (2차) 편집 상태
const addingToGroupId = ref(null);
const newCategoryName = ref('');
const editingCategoryId = ref(null);
const editingCategoryName = ref('');

// 대분류 (1차) 편집 상태
const addingBaseGroup = ref(false);
const newBaseGroupName = ref('');
const editingBaseGroupId = ref(null);
const editingBaseGroupName = ref('');

const newCodeName = ref('');
const newCodeSort = ref(0);

// ==========================================
// 2. Computed (핵심 트리 맵핑)
// ==========================================
const categories = computed(() => {
  const baseGroups = rawCodeList.value
      .filter(c => c.groupCd === '06' && c.itemCd.length === 5)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map(c => ({ id: c.itemCd, name: c.itemNm, icon: 'mdi-folder-outline' }));

  return baseGroups.map(group => {
    const children = rawCodeList.value
        .filter(c => c.groupCd === group.id)
        .sort((a, b) => a.sort - b.sort)
        .map(c => ({ id: c.itemCd, name: c.itemNm }));

    return { ...group, children };
  });
});

const currentCategoryInfo = computed(() => {
  if (!selectedCategoryId.value) return null;

  for (const group of categories.value) {
    const child = group.children.find(c => c.id === selectedCategoryId.value);
    if (child) {
      return {
        parentId: group.id,
        parentName: group.name,
        id: child.id,
        name: child.name
      };
    }
  }
  return null;
});

const filteredCodeList = computed(() => {
  let list = rawCodeList.value.filter(
      code => code.groupCd === selectedCategoryId.value
  );

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    list = list.filter(code =>
        code.itemNm.toLowerCase().includes(query) ||
        code.itemCd.toLowerCase().includes(query)
    );
  }
  return list.sort((a, b) => a.sort - b.sort);
});

const newCodeNumber = computed(() => {
  if (!selectedCategoryId.value) return '';
  const prefix = selectedCategoryId.value;

  const currentCodes = rawCodeList.value.filter(c => c.groupCd === prefix);
  if (!currentCodes.length) return prefix + '001';

  const nums = currentCodes.map(c => parseInt(c.itemCd.slice(-3)) || 0);
  const next = Math.max(...nums, 0) + 1;
  return prefix + String(next).padStart(3, '0');
});

// ==========================================
// 3. API 호출
// ==========================================
const fetchAllCodes = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    const targetData = (res.data.data || []).filter(item =>
        item.groupCd?.startsWith('06') || item.itemCd?.startsWith('06')
    );
    rawCodeList.value = targetData.map(item => ({
      ...item,
      isEditing: false
    }));

    if (!selectedCategoryId.value && categories.value[0]?.children.length > 0) {
      selectedCategoryId.value = categories.value[0].children[0].id;
    }
  } catch (err) {
    console.error('전체 코드 로드 실패:', err);
    rawCodeList.value = [];
  }
};

// ==========================================
// 4-0. 1차 대분류 CRUD
// ==========================================
const startBaseGroupAdd = () => {
  addingBaseGroup.value = true;
  newBaseGroupName.value = '';
};

const addBaseGroup = async () => {
  if (!newBaseGroupName.value.trim()) return alert('대분류명을 입력해주세요.');

  try {
    const currentBase = rawCodeList.value.filter(c => c.groupCd === '06' && c.itemCd.length === 5);
    const nums = currentBase.map(c => parseInt(c.itemCd.slice(-3)) || 0);
    const nextNum = Math.max(...nums, 0) + 1;
    const newId = `06${String(nextNum).padStart(3, '0')}`;

    await axios.post(`/api/v1/code/${cIdx}`, {
      groupCd: '06',
      itemCd: newId,
      itemNm: newBaseGroupName.value,
      sort: currentBase.length + 1,
      useFl: 'Y',
      option: ''
    });

    addingBaseGroup.value = false;
    newBaseGroupName.value = '';
    await fetchAllCodes();
    alert('대분류가 추가되었습니다.');
  } catch (err) {
    console.error('대분류 추가 실패:', err);
    alert('대분류 추가에 실패했습니다.');
  }
};

const startBaseGroupEdit = (group) => {
  editingBaseGroupId.value = group.id;
  editingBaseGroupName.value = group.name;
};

const saveBaseGroupEdit = async (group) => {
  if (!editingBaseGroupName.value.trim()) return alert('대분류명을 입력해주세요.');

  try {
    const targetCode = rawCodeList.value.find(c => c.itemCd === group.id);
    if (!targetCode) return;

    await axios.post(`/api/v1/code/${cIdx}`, {
      groupCd: targetCode.groupCd,
      itemCd: targetCode.itemCd,
      itemNm: editingBaseGroupName.value,
      sort: targetCode.sort,
      useFl: targetCode.useFl,
      option: targetCode.option || ''
    });
    editingBaseGroupId.value = null;
    await fetchAllCodes();
  } catch (err) {
    console.error('대분류 수정 실패:', err);
    alert('수정에 실패했습니다.');
  }
};

const cancelBaseGroupEdit = () => {
  editingBaseGroupId.value = null;
  editingBaseGroupName.value = '';
};

const deleteBaseGroup = async (group) => {
  const childCount = rawCodeList.value.filter(c => c.groupCd === group.id).length;
  if (childCount > 0) {
    return alert(`하위 중분류가 ${childCount}개 존재합니다. 중분류를 먼저 삭제해주세요.`);
  }

  if (!await window.customConfirm(`'${group.name}' 대분류를 삭제하시겠습니까?`)) return;

  try {
    await axios.delete(`/api/v1/code/${group.id}`);
    if (selectedCategoryId.value?.startsWith(group.id)) {
      selectedCategoryId.value = null;
    }
    await fetchAllCodes();
    alert('삭제되었습니다.');
  } catch (err) {
    console.error('대분류 삭제 실패:', err);
    alert('삭제에 실패했습니다.');
  }
};

// ==========================================
// 4. 2차 카테고리 (사이드바) CRUD
// ==========================================
const selectCategory = (childId) => {
  selectedCategoryId.value = childId;
  searchQuery.value = '';
};

const startCategoryAdd = (groupId) => {
  addingToGroupId.value = groupId;
  newCategoryName.value = '';
};

const addCategory = async (group) => {
  if (!newCategoryName.value.trim()) return alert('중분류명을 입력해주세요.');

  try {
    const currentChildren = rawCodeList.value.filter(c => c.groupCd === group.id);
    const nums = currentChildren.map(c => parseInt(c.itemCd.slice(-3)) || 0);
    const nextNum = Math.max(...nums, 0) + 1;
    const newId = `${group.id}${String(nextNum).padStart(3, '0')}`;

    const payload = {
      groupCd: group.id,
      itemCd: newId,
      itemNm: newCategoryName.value,
      sort: currentChildren.length + 1,
      useFl: 'Y',
      option: ''
    };

    await axios.post(`/api/v1/code/${cIdx}`, payload);

    addingToGroupId.value = null;
    newCategoryName.value = '';

    await fetchAllCodes();
    selectCategory(newId);
    alert('중분류가 추가되었습니다.');
  } catch (err) {
    console.error('중분류 추가 실패:', err);
    alert('중분류 추가에 실패했습니다.');
  }
};

const startCategoryEdit = (child) => {
  editingCategoryId.value = child.id;
  editingCategoryName.value = child.name;
};

const saveCategoryEdit = async (child) => {
  if (!editingCategoryName.value.trim()) return alert('분류명을 입력해주세요.');

  try {
    const targetCode = rawCodeList.value.find(c => c.itemCd === child.id);
    if (!targetCode) return;

    const payload = {
      groupCd: targetCode.groupCd,
      itemCd: targetCode.itemCd,
      itemNm: editingCategoryName.value,
      sort: targetCode.sort,
      useFl: targetCode.useFl,
      option: targetCode.option || ''
    };

    await axios.post(`/api/v1/code/${cIdx}`, payload);
    editingCategoryId.value = null;
    await fetchAllCodes();
  } catch (err) {
    console.error('중분류 수정 실패:', err);
    alert('수정에 실패했습니다.');
  }
};

const cancelCategoryEdit = () => {
  editingCategoryId.value = null;
  editingCategoryName.value = '';
};

const deleteCategory = async (group, childId) => {
  if (!await window.customConfirm('이 중분류를 삭제하시겠습니까? 하위 항목도 모두 보이지 않게 됩니다.')) return;

  try {
    await axios.delete(`/api/v1/code/${childId}`);
    if (selectedCategoryId.value === childId) {
      selectedCategoryId.value = null;
    }
    await fetchAllCodes();
    alert('삭제되었습니다.');
  } catch (err) {
    console.error('중분류 삭제 실패:', err);
    alert('삭제에 실패했습니다.');
  }
};

// ==========================================
// 5. 3차 카테고리 (우측 테이블) CRUD
// ==========================================
const startEdit = (code) => {
  code._original = { ...code };
  code.isEditing = true;
};

const cancelEdit = (code) => {
  Object.assign(code, code._original);
  delete code._original;
  code.isEditing = false;
};

const saveCode = async (code) => {
  try {
    const payload = {
      groupCd: selectedCategoryId.value,
      itemCd: code.itemCd,
      itemNm: code.itemNm,
      sort: code.sort,
      useFl: code.useFl,
      option: code.option || ''
    };

    await axios.post(`/api/v1/code/${cIdx}`, payload);
    alert('수정되었습니다.');
    code.isEditing = false;
    await fetchAllCodes();
  } catch (err) {
    console.error('수정 실패:', err);
    alert('수정에 실패했습니다.');
  }
};

const deleteCode = async (itemCd) => {
  if (!await window.customConfirm('정말 삭제하시겠습니까?')) return;
  try {
    await axios.delete(`/api/v1/code/${itemCd}`);
    alert('삭제되었습니다.');
    await fetchAllCodes();
  } catch (err) {
    console.error('삭제 실패:', err);
    alert('삭제에 실패했습니다.');
  }
};

const addCode = async () => {
  if (!newCodeName.value.trim()) return window.customAlert('항목명을 입력해주세요.', 'error');

  try {
    const payload = {
      groupCd: selectedCategoryId.value,
      itemCd: newCodeNumber.value,
      itemNm: newCodeName.value,
      sort: newCodeSort.value || (filteredCodeList.value.length + 1),
      useFl: 'Y',
      option: ''
    };

    await axios.post(`/api/v1/code/${cIdx}`, payload);
    alert('추가되었습니다.');

    newCodeName.value = '';
    newCodeSort.value = 0;
    await fetchAllCodes();
  } catch (err) {
    console.error('추가 실패:', err);
    alert('추가에 실패했습니다.');
  }
};

// ==========================================
// 6. 초기 구동
// ==========================================
onMounted(async () => {
  await fetchAllCodes();
});
</script>

<template>
  <div class="payroll-settings-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-toolbox-outline"></i> 장비 카테고리 설정</h1>
        <p class="page-subtitle">좌측에서 중분류를 관리하고, 우측에서 세부 장비 코드를 설정하세요.</p>
      </div>
    </div>

    <div class="layout-container">

      <aside class="sidebar-tree">
        <div v-for="group in categories" :key="group.id" class="tree-group">

          <div v-if="editingBaseGroupId === group.id" class="tree-edit-box base-edit-box">
            <input
                type="text" v-model="editingBaseGroupName" class="tree-input"
                @keyup.enter="saveBaseGroupEdit(group)" @keyup.esc="cancelBaseGroupEdit" autofocus
            />
            <div class="tree-edit-actions">
              <button @click="saveBaseGroupEdit(group)" class="icon-btn text-success" title="저장"><i class="mdi mdi-check"></i></button>
              <button @click="cancelBaseGroupEdit" class="icon-btn text-danger" title="취소"><i class="mdi mdi-close"></i></button>
            </div>
          </div>

          <div v-else class="tree-group-title-wrapper">
            <div class="tree-group-title">
              <i :class="['mdi', group.icon]"></i> {{ group.name }}
            </div>
            <div class="tree-group-hover-actions">
              <button @click.stop="startBaseGroupEdit(group)" class="icon-btn" title="대분류 수정"><i class="mdi mdi-pencil-outline"></i></button>
              <button @click.stop="deleteBaseGroup(group)" class="icon-btn text-danger" title="대분류 삭제"><i class="mdi mdi-trash-can-outline"></i></button>
            </div>
          </div>

          <ul class="tree-children">
            <li v-for="child in group.children" :key="child.id">
              <div v-if="editingCategoryId === child.id" class="tree-edit-box">
                <input
                    type="text" v-model="editingCategoryName" class="tree-input"
                    @keyup.enter="saveCategoryEdit(child)" @keyup.esc="cancelCategoryEdit"
                />
                <div class="tree-edit-actions">
                  <button @click="saveCategoryEdit(child)" class="icon-btn text-success" title="저장"><i class="mdi mdi-check"></i></button>
                  <button @click="cancelCategoryEdit" class="icon-btn text-danger" title="취소"><i class="mdi mdi-close"></i></button>
                </div>
              </div>

              <div v-else class="tree-item-wrapper">
                <button
                    :class="['tree-item-btn', { active: selectedCategoryId === child.id }]"
                    @click="selectCategory(child.id)"
                >
                  <span class="tree-item-name">{{ child.name }}</span>
                  <span class="tree-item-id">{{ child.id }}</span>
                </button>
                <div class="tree-item-hover-actions">
                  <button @click.stop="startCategoryEdit(child)" class="icon-btn" title="수정"><i class="mdi mdi-pencil-outline"></i></button>
                  <button @click.stop="deleteCategory(group, child.id)" class="icon-btn text-danger" title="삭제"><i class="mdi mdi-trash-can-outline"></i></button>
                </div>
              </div>

            </li>

            <li v-if="addingToGroupId === group.id" class="tree-add-box">
              <input
                  type="text" v-model="newCategoryName" placeholder="새 중분류명 입력" class="tree-input"
                  @keyup.enter="addCategory(group)" @keyup.esc="addingToGroupId = null" autofocus
              />
              <div class="tree-edit-actions">
                <button @click="addCategory(group)" class="icon-btn text-success"><i class="mdi mdi-check"></i></button>
                <button @click="addingToGroupId = null" class="icon-btn text-danger"><i class="mdi mdi-close"></i></button>
              </div>
            </li>
            <li v-else>
              <button class="tree-add-btn" @click="startCategoryAdd(group.id)">
                <i class="mdi mdi-plus"></i> 중분류 추가
              </button>
            </li>
          </ul>
        </div>

        <div v-if="addingBaseGroup" class="base-add-box">
          <input
              type="text" v-model="newBaseGroupName" placeholder="새 대분류명 입력" class="tree-input"
              @keyup.enter="addBaseGroup" @keyup.esc="addingBaseGroup = false" autofocus
          />
          <div class="tree-edit-actions">
            <button @click="addBaseGroup" class="icon-btn text-success"><i class="mdi mdi-check"></i></button>
            <button @click="addingBaseGroup = false" class="icon-btn text-danger"><i class="mdi mdi-close"></i></button>
          </div>
        </div>
        <button v-else class="btn-add-base-group" @click="startBaseGroupAdd">
          <i class="mdi mdi-plus-circle-outline"></i> 대분류 추가
        </button>
      </aside>

      <main class="main-content">

        <div v-if="!selectedCategoryId" class="empty-selection-box">
          <i class="mdi mdi-arrow-left-top-bold"></i>
          <p>좌측에서 관리할 카테고리를 선택해주세요.</p>
        </div>

        <template v-else>

          <div class="content-header">
            <div class="breadcrumb">
              <span class="breadcrumb-parent">{{ currentCategoryInfo?.parentName }}</span>
              <i class="mdi mdi-chevron-right"></i>
              <span class="breadcrumb-current">{{ currentCategoryInfo?.name }}</span>
            </div>
            <div class="search-box">
              <i class="mdi mdi-magnify"></i>
              <input
                  type="text" v-model="searchQuery"
                  placeholder="코드번호 또는 항목명 검색..."
                  class="search-input"
              />
              <button v-if="searchQuery" @click="searchQuery = ''" class="search-clear">
                <i class="mdi mdi-close"></i>
              </button>
            </div>
          </div>

          <div class="table-card">
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                <tr>
                  <th class="col-hide-mobile" style="width:52px;">No.</th>
                  <th class="col-hide-mobile" style="width:150px;">코드 번호</th>
                  <th>항목명</th>
                  <th class="col-hide-mobile" style="width:72px;">순서</th>
                  <th style="width:100px;">사용 여부</th>
                  <th style="width:84px;"></th>
                </tr>
                </thead>
                <tbody>

                <tr v-for="(code, index) in filteredCodeList" :key="code.itemCd" class="data-row">

                  <td class="text-center col-hide-mobile">
                    <span class="row-number">{{ index + 1 }}</span>
                  </td>

                  <td class="col-hide-mobile">
                    <span class="code-number">{{ code.itemCd }}</span>
                  </td>

                  <td>
                    <input v-if="code.isEditing" type="text" v-model="code.itemNm" class="input-inline w-full" />
                    <span v-else class="code-name">{{ code.itemNm }}</span>
                    <!-- 모바일에서 숨긴 보조 정보 (코드번호) -->
                    <div class="mobile-meta">
                      <span class="code-number">{{ code.itemCd }}</span>
                    </div>
                  </td>

                  <td class="text-center col-hide-mobile">
                    <input v-if="code.isEditing" type="number" v-model.number="code.sort" class="input-inline text-center" style="width:52px;" min="0" />
                    <span v-else class="sort-number">{{ code.sort }}</span>
                  </td>

                  <td>
                    <select v-if="code.isEditing" v-model="code.useFl" class="select-inline">
                      <option value="Y">사용</option>
                      <option value="N">미사용</option>
                    </select>
                    <span v-else :class="['use-dot', code.useFl === 'Y' ? 'use-on' : 'use-off']">
                        {{ code.useFl === 'Y' ? '사용' : '미사용' }}
                      </span>
                  </td>

                  <td class="text-center">
                    <div class="row-actions">
                      <template v-if="code.isEditing">
                        <button @click="saveCode(code)" class="icon-btn-row icon-btn-row--save" title="저장">
                          <i class="mdi mdi-check"></i>
                        </button>
                        <button @click="cancelEdit(code)" class="icon-btn-row icon-btn-row--cancel" title="취소">
                          <i class="mdi mdi-close"></i>
                        </button>
                      </template>
                      <template v-else>
                        <button @click="startEdit(code)" class="icon-btn-row icon-btn-row--edit" title="수정">
                          <i class="mdi mdi-pencil-outline"></i>
                        </button>
                        <button @click="deleteCode(code.itemCd)" class="icon-btn-row icon-btn-row--del" title="삭제">
                          <i class="mdi mdi-trash-can-outline"></i>
                        </button>
                      </template>
                    </div>
                  </td>
                </tr>

                <tr v-if="filteredCodeList.length === 0" class="empty-row">
                  <td colspan="6">
                    <div class="empty-state">
                      <div class="empty-icon-wrapper">
                        <i class="mdi mdi-text-box-plus-outline"></i>
                      </div>
                      <p>등록된 세부 장비 코드가 없습니다.</p>
                      <span>하단의 추가 폼을 이용해 이 카테고리에 속할 항목을 생성해주세요.</span>
                    </div>
                  </td>
                </tr>

                </tbody>
              </table>
            </div>

            <div class="add-form-bar">
              <div class="add-form-fields">
                <div class="add-field col-hide-mobile">
                  <label>코드번호</label>
                  <input type="text" :value="newCodeNumber" disabled class="add-input add-input--disabled" />
                </div>
                <div class="add-field add-field--grow">
                  <label>항목명 <span class="req">*</span></label>
                  <input
                      type="text" v-model="newCodeName"
                      placeholder="항목명을 입력하세요"
                      class="add-input"
                      @keyup.enter="addCode"
                  />
                </div>
                <div class="add-field col-hide-mobile" style="width:72px;">
                  <label>순서</label>
                  <input type="number" v-model.number="newCodeSort" placeholder="0" class="add-input text-center" min="0" />
                </div>
              </div>
              <button @click="addCode" class="btn-add-submit">
                <i class="mdi mdi-plus"></i> 추가
              </button>
            </div>

          </div>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ── 유틸 ── */
.w-full    { width: 100%; box-sizing: border-box; }
.text-center { text-align: center; }
.text-right  { text-align: right; }
.text-primary{ color: var(--primary); }
.text-success{ color: var(--success) !important; }
.text-danger { color: var(--danger)  !important; }

/* ── 페이지 ── */
.layout-container { display: flex; gap: 20px; align-items: flex-start; }

/* ═══════════════════════════
   사이드바 트리
═══════════════════════════ */
.sidebar-tree {
  width: 240px; flex-shrink: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 12px;
}
.tree-group          { margin-bottom: 20px; }
.tree-group:last-child{ margin-bottom: 0; }
.tree-group-title    { font-weight: 700; font-size: 12px; color: var(--text-sub); letter-spacing: .5px; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
.tree-group-title i  { font-size: 16px; }
.tree-group-title-wrapper { position: relative; display: flex; align-items: center; justify-content: space-between; padding: 0 4px; margin-bottom: 6px; min-height: 24px; border-radius: 6px; }
.tree-group-title-wrapper:hover { background: var(--bg-hover); }
.tree-group-hover-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
.tree-group-title-wrapper:hover .tree-group-hover-actions { opacity: 1; }
.base-edit-box { padding: 0 4px; margin-bottom: 6px; }
.base-add-box { display: flex; align-items: center; gap: 4px; padding: 8px 4px; margin-top: 8px; border-top: 1px dashed var(--border-color); }
.btn-add-base-group {
  width: 100%; margin-top: 12px; padding: 10px 12px;
  background: var(--primary-soft); border: 1px dashed var(--primary); border-radius: 8px;
  color: var(--primary); font-size: 12px; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: all .15s;
}
.btn-add-base-group:hover { background: var(--primary); color: #fff; }
.btn-add-base-group i { font-size: 16px; }
.tree-children       { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }

.tree-item-wrapper   { position: relative; display: flex; align-items: center; border-radius: 7px; overflow: hidden; }
.tree-item-btn       { flex: 1; text-align: left; padding: 8px 10px 8px 18px; background: transparent; border: none; color: var(--text-sub); font-size: 13px; cursor: pointer; transition: all .15s; display: flex; align-items: center; }
.tree-item-wrapper:hover .tree-item-btn { background: var(--bg-hover); color: var(--text-main); }
.tree-item-btn.active{ background: var(--primary-soft); color: var(--primary); font-weight: 600; }
.tree-item-name      { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tree-item-id {
  font-size: 11px;
  font-family: monospace;
  color: var(--text-sub);
  background: var(--bg-canvas);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
  transition: opacity 0.15s;
}

.tree-item-btn.active .tree-item-id {
  background: #ffffff;
  color: var(--primary);
  font-weight: 600;
}

.tree-item-wrapper:hover .tree-item-id {
  opacity: 0;
}

.tree-item-hover-actions {
  position: absolute; right: 4px;
  display: flex; gap: 2px;
  opacity: 0; transition: opacity .15s;
}
.tree-item-wrapper:hover .tree-item-hover-actions { opacity: 1; }

.tree-add-box, .tree-edit-box { display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 18px; }
.tree-input  { flex: 1; padding: 5px 7px; border: 1px solid var(--border-color); border-radius: 5px; font-size: 12px; }
.tree-input:focus { outline: none; border-color: var(--primary); }
.tree-edit-actions { display: flex; gap: 2px; }

.icon-btn {
  background: none; border: none; padding: 4px; border-radius: 4px;
  cursor: pointer; color: var(--text-sub);
  display: flex; align-items: center; justify-content: center; font-size: 14px;
}
.icon-btn:hover { background: var(--bg-canvas); color: var(--text-main); }

.tree-add-btn { width: 100%; text-align: left; padding: 7px 10px 7px 18px; background: transparent; border: none; border-radius: 7px; color: var(--primary); font-size: 12px; font-weight: 600; cursor: pointer; transition: background .15s; opacity: .75; }
.tree-add-btn:hover { background: var(--primary-soft); opacity: 1; }

/* ═══════════════════════════
   메인 콘텐츠
═══════════════════════════ */
.main-content { flex: 1; min-width: 0; }

.empty-selection-box { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; background: var(--bg-surface); border: 1px dashed var(--border-color); border-radius: 12px; color: var(--text-sub); font-size: 14px; gap: 12px; }
.empty-selection-box i { font-size: 32px; color: var(--border-color); }

/* 콘텐츠 헤더 */
.content-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; background: var(--bg-surface);
  padding: 14px 16px; border-radius: 12px; border: 1px solid var(--border-color);
  gap: 16px;
}
.breadcrumb          { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.breadcrumb-parent   { font-size: 13px; color: var(--text-sub); font-weight: 500; }
.breadcrumb .mdi-chevron-right { font-size: 16px; color: var(--border-color); }
.breadcrumb-current  { font-size: 14px; color: var(--text-main); font-weight: 700; }

/* 검색 */
.search-box  { display: flex; align-items: center; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 12px; min-width: 220px; }
.search-box i{ color: var(--text-sub); margin-right: 8px; font-size: 15px; }
.search-input{ border: none; background: transparent; outline: none; width: 100%; font-size: 13px; }
.search-clear{ background: none; border: none; cursor: pointer; color: var(--text-sub); padding: 0; }

/* 테이블 카드 */
.table-card    { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); overflow: hidden; }
.table-wrapper { overflow-x: auto; }
.data-table    { width: 100%; border-collapse: collapse; font-size: 13px; }

.data-table thead th {
  background: var(--bg-canvas); padding: 10px 12px;
  font-size: 11px; font-weight: 700; color: var(--text-sub); letter-spacing: .3px;
  border-bottom: 1px solid var(--border-color); white-space: nowrap;
}
.data-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
.data-row:last-child td { border-bottom: none; }
.data-row:hover { background: var(--bg-hover); }

/* 셀 요소 */
.row-number  { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: var(--bg-hover); border-radius: 5px; font-weight: 600; color: var(--text-sub); font-size: 11px; }
.code-number { font-size: 12px; font-weight: 600; color: var(--primary); background: var(--primary-soft); padding: 3px 9px; border-radius: 5px; white-space: nowrap; display: inline-block; }
.mobile-meta { display: none; margin-top: 6px; }
.code-name   { font-size: 13px; font-weight: 500; color: var(--text-main); }
.sort-number { font-size: 13px; color: var(--text-sub); }

/* 사용여부 도트 */
.use-dot::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; flex-shrink: 0; }
.use-dot  { display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; }
.use-on   { color: var(--success); }
.use-on::before  { background: var(--success); }
.use-off  { color: var(--text-sub); }
.use-off::before { background: var(--border-color); }

/* 인라인 편집 */
.input-inline { padding: 6px 9px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; transition: border-color .15s; }
.input-inline:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.select-inline { padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; background: var(--bg-surface); cursor: pointer; }

/* 행 아이콘 버튼 */
.row-actions    { display: flex; gap: 4px; justify-content: center; }
.icon-btn-row   { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-surface); cursor: pointer; transition: all .15s; font-size: 15px; color: var(--text-sub); }
.icon-btn-row:disabled { opacity: .35; cursor: not-allowed; }
.icon-btn-row--edit:hover   { background: var(--primary); border-color: var(--primary); color: #fff; }
.icon-btn-row--del:hover    { background: var(--danger);  border-color: var(--danger);  color: #fff; }
.icon-btn-row--save:hover   { background: var(--success); border-color: var(--success); color: #fff; }
.icon-btn-row--cancel:hover { background: var(--text-sub);border-color: var(--text-sub);color: #fff; }

/* ── 빈 상태 (Empty State) ── */
.empty-row td { padding: 30px 20px !important; border-bottom: none; }
.empty-state  {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px; background: var(--bg-canvas); border: 1px dashed var(--border-color); border-radius: 10px;
  gap: 10px; color: var(--text-sub);
}
.empty-icon-wrapper {
  display: flex; align-items: center; justify-content: center;
  width: 64px; height: 64px; background: var(--primary-soft); border-radius: 50%; margin-bottom: 8px;
}
.empty-icon-wrapper i { font-size: 32px; color: var(--primary); }
.empty-state p { font-size: 15px; font-weight: 600; margin: 0; color: var(--text-main); }
.empty-state span { font-size: 13px; opacity: 0.8; }

/* ── 추가 폼 바 ── */
.add-form-bar {
  display: flex; align-items: flex-end; gap: 10px;
  padding: 16px;
  background: var(--bg-canvas);
  border-top: 1px solid var(--border-color);
}
.add-form-fields { display: flex; gap: 10px; flex: 1; flex-wrap: wrap; }
.add-field       { display: flex; flex-direction: column; gap: 4px; }
.add-field--grow { flex: 1; min-width: 160px; }
.add-field label { font-size: 11px; font-weight: 600; color: var(--text-sub); white-space: nowrap; }
.add-field .req  { color: var(--danger); }

.add-input { padding: 7px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; width: 100%; transition: border-color .15s; }
.add-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.add-input--disabled { background: var(--bg-hover); color: var(--text-sub); cursor: not-allowed; border-color: transparent; }

.btn-add-submit { display: inline-flex; align-items: center; gap: 5px; padding: 0 20px; height: 36px; background: var(--primary); border: none; border-radius: 7px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s; white-space: nowrap; flex-shrink: 0; }
.btn-add-submit:hover { background: var(--primary-hover, #2563eb); }
.btn-add-submit .mdi { font-size: 16px; }

/* ═══════════════════════════
   반응형
═══════════════════════════ */
@media (max-width: 1024px) {
  .layout-container { flex-direction: column; }
  .sidebar-tree { width: 100%; box-sizing: border-box; }
  .tree-item-hover-actions,
  .tree-group-hover-actions { opacity: 1; } /* 터치 디바이스에서는 항상 노출 */
  .tree-item-wrapper:hover .tree-item-id { opacity: 1; } /* ID 뱃지도 유지 */
}

@media (max-width: 768px) {
  .page-header .page-title { font-size: 18px; }
  .page-header .page-subtitle { font-size: 12px; }

  /* 콘텐츠 헤더: breadcrumb + search 세로 */
  .content-header { flex-direction: column; align-items: stretch; gap: 10px; padding: 12px; }
  .search-box { min-width: 0; width: 100%; box-sizing: border-box; }
  .breadcrumb { font-size: 13px; }

  /* 모바일에서 보조 컬럼/필드 숨김 */
  .col-hide-mobile { display: none !important; }
  .mobile-meta { display: block; }
  .data-table { min-width: 0; width: 100%; }
  .data-table tbody td { padding: 12px 10px; }

  /* 상위 분류 이동 바 */
  .go-up-bar { flex-direction: column; align-items: stretch; gap: 8px; }
  .btn-go-up { align-self: flex-start; }
  .current-sub-title { font-size: 12px; }

  /* 추가 폼 바: 세로 쌓기 */
  .add-form-bar { flex-direction: column; align-items: stretch; gap: 12px; padding: 12px; }
  .add-form-fields { flex-direction: column; gap: 10px; }
  .add-field { width: 100% !important; }
  .add-field .add-input { width: 100% !important; }
  .btn-add-submit { width: 100%; justify-content: center; height: 42px; }

  /* 사이드바: 분류 목록 좀 더 컴팩트 */
  .sidebar-tree { padding: 12px 10px; }
  .tree-group { margin-bottom: 14px; }
  .btn-add-base-group { padding: 12px; }
}
</style>
