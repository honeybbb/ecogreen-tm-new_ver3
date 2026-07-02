<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";
import { useAuthStore } from "~/stores/auth.js";

const router = useRouter();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// ==========================================
// 1. 상태 관리 변수
// ==========================================
// 백엔드에서 불러온 모든 1~3차 전체 코드 원본
const rawCodeList = ref([]);

// 사이드바 및 검색 상태
const selectedCategoryId = ref(null);
const searchQuery = ref('');

// 2차 카테고리(사이드바) 편집용 상태
const addingToGroupId = ref(null);
const newCategoryName = ref('');
const editingCategoryId = ref(null);
const editingCategoryName = ref('');

// 3차 카테고리(우측 테이블) 신규 추가 폼 상태
const newCodeName = ref('');
const newCodeSort = ref(0);
const newTaxFree = ref(0);

// ==========================================
// 2. Computed (핵심 트리 맵핑)
// ==========================================

// 1차(대분류)는 고정 틀로 유지하고, 2차(중분류)는 DB(rawCodeList)에서 동적으로 필터링하여 매핑합니다.
const categories = computed(() => {
  const baseGroups = [
    { id: '04001', name: '직접노무비', icon: 'mdi-account-hard-hat' },
    { id: '04002', name: '간접노무비', icon: 'mdi-account-tie' },
    { id: '04003', name: '제경비', icon: 'mdi-store-cog-outline' }
  ];

  return baseGroups.map(group => {
    // groupCd가 1차 카테고리 id(예: 04001)인 항목들을 찾아 2차 카테고리 자식으로 구성
    const children = rawCodeList.value
        .filter(c => c.groupCd === group.id)
        .sort((a, b) => a.sort - b.sort)
        .map(c => ({ id: c.itemCd, name: c.itemNm }));

    return { ...group, children };
  });
});

// 현재 선택된 2차 카테고리 정보 찾기 (테이블 헤더용)
const currentCategoryInfo = computed(() => {
  if (!selectedCategoryId.value) return null;

  for (const group of categories.value) {
    const child = group.children.find(c => c.id === selectedCategoryId.value);
    if (child) {
      return {
        parentId: group.id,
        parentName: group.name,
        // 비과세는 '04001'(직접노무비) 하위에 속한 2차 카테고리일 때만 노출
        hasTaxFree: group.id === '04001',
        id: child.id,
        name: child.name
      };
    }
  }
  return null;
});

// 우측 테이블 렌더링 리스트 (선택된 2차 카테고리의 3차 자식들만 필터링)
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
  // 정렬 순서대로 반환
  return list.sort((a, b) => a.sort - b.sort);
});

// 신규 3차 코드 번호 생성 (2차 코드 뒤에 순번 3자리 부여, 예: 04001002 + 001)
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
// 3. API 호출 함수
// ==========================================

// 전체 코드 로드 (1차~3차 모두 포함)
const fetchAllCodes = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    rawCodeList.value = (res.data.data || []).map(item => ({
      ...item,
      isEditing: false
    }));

    // 초기 로드 시 선택된 값이 없으면 첫 번째 자식 자동 선택
    if (!selectedCategoryId.value && categories.value[0]?.children.length > 0) {
      selectedCategoryId.value = categories.value[0].children[0].id;
    }
  } catch (err) {
    console.error('전체 코드 로드 실패:', err);
    rawCodeList.value = [];
  }
};

// ==========================================
// 4. 2차 카테고리 (사이드바) CRUD
// ==========================================
const selectCategory = (childId) => {
  selectedCategoryId.value = childId;
  searchQuery.value = '';
  newTaxFree.value = 0;
};

const startCategoryAdd = (groupId) => {
  addingToGroupId.value = groupId;
  newCategoryName.value = '';
};

// 2차 카테고리 추가 로직 (DB 연동)
const addCategory = async (group) => {
  if (!newCategoryName.value.trim()) return alert('중분류명을 입력해주세요.');

  try {
    // 2차 코드 채번: 상위 1차 코드 뒤에 순번 3자리 부여
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
      tax_free: 0
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

// 2차 카테고리 수정 로직 (DB 연동)
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
      tax_free: targetCode.tax_free || 0
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

// 2차 카테고리 삭제 로직 (DB 연동)
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

// 3차 코드 수정 저장
const saveCode = async (code) => {
  try {
    const payload = {
      groupCd: selectedCategoryId.value,
      itemCd: code.itemCd,
      itemNm: code.itemNm,
      sort: code.sort,
      useFl: code.useFl,
      tax_free: currentCategoryInfo.value?.hasTaxFree ? code.tax_free : 0
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

// 3차 코드 삭제
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

// 신규 3차 코드 추가
const addCode = async () => {
  if (!newCodeName.value.trim()) return alert('항목명을 입력해주세요.');

  try {
    const payload = {
      groupCd: selectedCategoryId.value,
      itemCd: newCodeNumber.value,
      itemNm: newCodeName.value,
      sort: newCodeSort.value || (filteredCodeList.value.length + 1),
      useFl: 'Y',
      tax_free: currentCategoryInfo.value?.hasTaxFree ? newTaxFree.value : 0
    };

    await axios.post(`/api/v1/code/${cIdx}`, payload);
    alert('추가되었습니다.');

    // 입력 폼 리셋 및 최신화
    newCodeName.value = '';
    newCodeSort.value = 0;
    newTaxFree.value = 0;
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
        <h1 class="page-title"><i class="mdi mdi-cash-multiple"></i> 급여 코드 및 카테고리 관리</h1>
        <p class="page-subtitle">좌측에서 중분류를 관리하고, 우측에서 세부 급여 코드를 설정하세요.</p>
      </div>
    </div>

    <div class="layout-container">

      <aside class="sidebar-tree">
        <div v-for="group in categories" :key="group.id" class="tree-group">
          <div class="tree-group-title">
            <i :class="['mdi', group.icon]"></i> {{ group.name }}
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
                  <th style="width:52px;">No.</th>
                  <th style="width:150px;">코드 번호</th>
                  <th>항목명</th>
                  <th v-if="currentCategoryInfo?.hasTaxFree" style="width:160px;">비과세한도</th>
                  <th style="width:72px;">순서</th>
                  <th style="width:100px;">사용 여부</th>
                  <th style="width:84px;"></th>
                </tr>
                </thead>
                <tbody>

                <tr v-for="(code, index) in filteredCodeList" :key="code.itemCd" class="data-row">

                  <td class="text-center">
                    <span class="row-number">{{ index + 1 }}</span>
                  </td>

                  <td>
                    <span class="code-number">{{ code.itemCd }}</span>
                  </td>

                  <td>
                    <input v-if="code.isEditing" type="text" v-model="code.itemNm" class="input-inline w-full" />
                    <span v-else class="code-name">{{ code.itemNm }}</span>
                  </td>

                  <td v-if="currentCategoryInfo?.hasTaxFree">
                    <div v-if="code.isEditing" class="tax-input-wrapper">
                      <input type="number" v-model.number="code.tax_free" class="input-inline text-right" min="0" />
                      <span class="tax-unit">원</span>
                    </div>
                    <span v-else class="tax-display">
                        {{ Number(code.tax_free).toLocaleString() }}<em class="tax-em"> 원</em>
                      </span>
                  </td>

                  <td class="text-center">
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
                  <td :colspan="currentCategoryInfo?.hasTaxFree ? 7 : 6">
                    <div class="empty-state">
                      <div class="empty-icon-wrapper">
                        <i class="mdi mdi-text-box-plus-outline"></i>
                      </div>
                      <p>등록된 세부 급여 코드가 없습니다.</p>
                      <span>하단의 추가 폼을 이용해 이 카테고리에 속할 항목을 생성해주세요.</span>
                    </div>
                  </td>
                </tr>

                </tbody>
              </table>
            </div>

            <div class="add-form-bar">
              <div class="add-form-fields">
                <div class="add-field">
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
                <div v-if="currentCategoryInfo?.hasTaxFree" class="add-field">
                  <label>비과세한도</label>
                  <div class="tax-input-wrapper">
                    <input type="number" v-model.number="newTaxFree" placeholder="0" class="add-input text-right" min="0" />
                    <span class="tax-unit">원</span>
                  </div>
                </div>
                <div class="add-field" style="width:72px;">
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
.tree-group-title    { font-weight: 700; font-size: 12px; color: var(--text-sub); letter-spacing: .5px; text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; padding: 0 4px; }
.tree-group-title i  { font-size: 16px; }
.tree-children       { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }

.tree-item-wrapper   { position: relative; display: flex; align-items: center; border-radius: 7px; overflow: hidden; }
.tree-item-btn       { flex: 1; text-align: left; padding: 8px 10px 8px 18px; background: transparent; border: none; color: var(--text-sub); font-size: 13px; cursor: pointer; transition: all .15s; display: flex; align-items: center; }
.tree-item-wrapper:hover .tree-item-btn { background: var(--bg-hover); color: var(--text-main); }
.tree-item-btn.active{ background: var(--primary-soft); color: var(--primary); font-weight: 600; }
.tree-item-name      { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 사이드바 코드 번호(ID) 뱃지 */
.tree-item-id {
  font-size: 11px;
  font-family: monospace; /* 숫자가 깔끔하게 보이도록 고정폭 글꼴 사용 */
  color: var(--text-sub);
  background: var(--bg-canvas); /* 배경색보다 살짝 어두운 톤 */
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
  transition: opacity 0.15s;
}

/* 카테고리가 선택되었을 때의 뱃지 색상 반전 */
.tree-item-btn.active .tree-item-id {
  background: #ffffff; /* 또는 투명도 조절: rgba(255,255,255,0.5) */
  color: var(--primary);
  font-weight: 600;
}

/* 마우스 오버 시 수정/삭제 버튼이 나타나므로, 겹치지 않게 뱃지를 숨김 처리 */
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

.editable-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 700;
  background: var(--success); color: #fff;
  padding: 2px 8px; border-radius: 20px; margin-left: 4px;
}
.editable-chip .mdi { font-size: 11px; }

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
.code-number { font-size: 12px; font-weight: 600; color: var(--primary); background: var(--primary-soft); padding: 3px 9px; border-radius: 5px; white-space: nowrap; }
.code-name   { font-size: 13px; font-weight: 500; color: var(--text-main); }
.sort-number { font-size: 13px; color: var(--text-sub); }
.tax-display { font-size: 13px; color: var(--text-main); }
.tax-em      { font-style: normal; font-size: 11px; color: var(--text-sub); margin-left: 2px; }
.tax-unit    { font-size: 12px; color: var(--text-sub); white-space: nowrap; }
.tax-input-wrapper { display: flex; align-items: center; gap: 6px; }

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

/* ── 빈 상태 (Empty State) 개선 ── */
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
</style>
