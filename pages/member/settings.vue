<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from "axios";
import { useAuthStore } from "~/stores/auth.js";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// ==========================================
// 1. 상태 관리 변수
// ==========================================
const rawCodeList = ref([]);

// 현재 선택된 카테고리 ID (2차 중분류부터 3차, 4차 등 깊숙한 소분류 ID까지 모두 담길 수 있음)
const selectedCategoryId = ref(null);
const searchQuery = ref('');

const addingToGroupId = ref(null);
const newCategoryName = ref('');
const editingCategoryId = ref(null);
const editingCategoryName = ref('');

const newCodeName = ref('');
const newCodeSort = ref(0);
const newCodeOption = ref('');

// ==========================================
// 2. 핵심 계층(Drill-down) 로직
// ==========================================

// 좌측 사이드바에 고정으로 보여질 2차 카테고리 (length: 5)
const categories = computed(() => {
  const baseGroups = [
    { id: '01', name: '인사 코드', icon: 'mdi-account-tie' },
    { id: '02', name: '관리 코드', icon: 'mdi-domain' }
  ];

  return baseGroups.map(group => {
    const children = rawCodeList.value
        .filter(c => c.groupCd === group.id && c.itemCd.length === 5)
        .sort((a, b) => a.sort - b.sort)
        .map(c => ({ id: c.itemCd, name: c.itemNm, editFl: c.editFl, deleteFl: c.deleteFl }));

    return { ...group, children };
  });
});

// 하위 코드로 깊게 들어갔을 때, 좌측 사이드바 하이라이트를 유지하기 위한 2차 부모 ID 추출
const activeSidebarId = computed(() => {
  if (!selectedCategoryId.value) return null;
  return selectedCategoryId.value.length >= 5
      ? selectedCategoryId.value.substring(0, 5)
      : selectedCategoryId.value;
});

// 상단 Breadcrumb(경로 표시줄)용 데이터 생성
const activeBreadcrumbs = computed(() => {
  if (!selectedCategoryId.value) return [];
  const crumbs = [];

  const baseGroup = categories.value.find(g => selectedCategoryId.value.startsWith(g.id));
  if (baseGroup) crumbs.push({ id: baseGroup.id, name: baseGroup.name });

  let currentPath = selectedCategoryId.value.substring(0, 2);
  for (let i = 5; i <= selectedCategoryId.value.length; i += 3) {
    currentPath = selectedCategoryId.value.substring(0, i);
    const node = rawCodeList.value.find(c => c.itemCd === currentPath);

    if (node) {
      crumbs.push({ id: node.itemCd, name: node.itemNm });
    } else if (i === 5 && baseGroup) { // 사이드바에서 신규 추가되어 DB 응답 전일 경우 대비
      const sidebarNode = baseGroup.children.find(c => c.id === currentPath);
      if (sidebarNode) crumbs.push({ id: sidebarNode.id, name: sidebarNode.name });
    }
  }
  return crumbs;
});

// 동적 컬럼(색상, 연령) 표시 여부 (최상위 2차 카테고리 기준 상속)
const isColorTarget = computed(() => ['02002', '02004'].includes(activeSidebarId.value));
const isAgeTarget = computed(() => activeSidebarId.value === '02003');

// 현재 3차 이상 하위 카테고리 내부로 들어와 있는지 여부
const isSubCategoryLevel = computed(() => selectedCategoryId.value && selectedCategoryId.value.length > 5);

// 우측 테이블 렌더링 리스트 (현재 선택된 부모 ID를 가진 자식들만)
const filteredCodeList = computed(() => {
  let list = rawCodeList.value.filter(
      code => code.groupCd === selectedCategoryId.value
  );
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    list = list.filter(code =>
        (code.itemNm && code.itemNm.toLowerCase().includes(query)) ||
        (code.itemCd && code.itemCd.toLowerCase().includes(query))
    );
  }
  return list.sort((a, b) => a.sort - b.sort);
});

// 신규 코드 번호 자동 채번 로직 (뎁스 무관하게 작동)
const newCodeNumber = computed(() => {
  if (!selectedCategoryId.value) return '';
  const prefix = selectedCategoryId.value;
  const currentCodes = rawCodeList.value.filter(c => c.groupCd === prefix);

  if (!currentCodes.length) return prefix + '001';

  const nums = currentCodes.map(c => parseInt(c.itemCd.substring(prefix.length)) || 0);
  const nextNum = Math.max(...nums, 0) + 1;

  return prefix + String(nextNum).padStart(3, '0');
});

// 특정 코드의 하위 분류 개수 계산 (뱃지 표시용)
const getChildCount = (itemCd) => rawCodeList.value.filter(c => c.groupCd === itemCd).length;

// ==========================================
// 3. 네비게이션 및 API 호출
// ==========================================

const fetchAllCodes = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    const targetData = (res.data.data || []).filter(item =>
        item.groupCd === '01' || item.itemCd.startsWith('01') ||
        item.groupCd === '02' || item.itemCd.startsWith('02')
    );

    rawCodeList.value = targetData.map(item => ({
      ...item, option: item.tax_free || '', isEditing: false
    }));

    const queryCat = route.query.category;
    if (queryCat && rawCodeList.value.some(c => c.itemCd === queryCat)) {
      selectedCategoryId.value = queryCat;
    } else if (!selectedCategoryId.value && categories.value[0]?.children.length > 0) {
      selectedCategoryId.value = categories.value[0].children[0].id;
    }
  } catch (err) {
    console.error('데이터 로드 실패:', err);
    rawCodeList.value = [];
  }
};

const selectCategory = (id) => {
  selectedCategoryId.value = id;
  searchQuery.value = '';
  newCodeOption.value = isColorTarget.value ? '#000000' : '';
  router.replace({ query: { ...route.query, category: id } });
};

// 한 단계 위로 빠져나오기
const goUpCategory = () => {
  if (isSubCategoryLevel.value) {
    selectCategory(selectedCategoryId.value.substring(0, selectedCategoryId.value.length - 3));
  }
};

// ==========================================
// 4. CRUD 로직 (사이드바 + 메인 테이블)
// ==========================================
// ... (중분류 추가/수정/삭제 로직은 기존과 동일하므로 길이상 요약, 하단 템플릿 로직에 맞춰 그대로 사용)

const startCategoryAdd = (groupId) => { addingToGroupId.value = groupId; newCategoryName.value = ''; };

const addCategory = async (group) => {
  if (!newCategoryName.value.trim()) return window.customAlert('중분류명을 입력해주세요.', 'error');
  try {
    const currentChildren = rawCodeList.value.filter(c => c.groupCd === group.id);
    const nums = currentChildren.map(c => parseInt(c.itemCd.slice(-3)) || 0);
    const newId = `${group.id}${String(Math.max(...nums, 0) + 1).padStart(3, '0')}`;

    await axios.post(`/api/v1/code/${cIdx}`, {
      groupCd: group.id, itemCd: newId, itemNm: newCategoryName.value, sort: currentChildren.length + 1, useFl: 'Y', option: ''
    });
    addingToGroupId.value = null; newCategoryName.value = '';
    await fetchAllCodes(); selectCategory(newId); window.alert('중분류가 추가되었습니다.');
  } catch (err) { window.customAlert('추가에 실패했습니다.', 'error'); }
};

const startCategoryEdit = (child) => {
  if (child.editFl === 'N') return window.customAlert('수정 권한이 없는 항목입니다.', 'error');
  editingCategoryId.value = child.id; editingCategoryName.value = child.name;
};

const saveCategoryEdit = async (child) => {
  if (!editingCategoryName.value.trim()) return window.customAlert('분류명을 입력해주세요.', 'error');
  try {
    const targetCode = rawCodeList.value.find(c => c.itemCd === child.id);
    await axios.put(`/api/v1/code/${targetCode.itemCd}`, {
      groupCd: targetCode.groupCd, itemCd: targetCode.itemCd, itemNm: editingCategoryName.value, sort: targetCode.sort, useFl: targetCode.useFl, option: targetCode.option
    });
    editingCategoryId.value = null; await fetchAllCodes();
  } catch (err) { window.customAlert('수정에 실패했습니다.', 'error'); }
};

const cancelCategoryEdit = () => { editingCategoryId.value = null; editingCategoryName.value = ''; };

const deleteCategory = async (child) => {
  if (child.deleteFl === 'N') return window.customAlert('삭제 권한이 없는 항목입니다.', 'error');
  const childCount = getChildCount(child.id);
  if (childCount > 0) return window.customAlert(`하위 분류가 ${childCount}개 존재합니다. 하위 항목을 먼저 삭제해주세요.`, 'error');

  if (!await window.customConfirm('이 분류를 삭제하시겠습니까?')) return;
  try {
    await axios.delete(`/api/v1/code/${child.id}`);
    if (activeSidebarId.value === child.id) { selectedCategoryId.value = null; router.replace({ query: { category: undefined } }); }
    await fetchAllCodes(); window.alert('삭제되었습니다.');
  } catch (err) { window.customAlert('삭제에 실패했습니다.', 'error'); }
};

// --- 테이블 3차/4차 항목 CRUD ---
const startEdit = (code) => {
  if (code.editFl === 'N') return window.customAlert('수정 권한이 없는 항목입니다.', 'error');
  code._original = { ...code }; code.isEditing = true;
};
const cancelEdit = (code) => { Object.assign(code, code._original); delete code._original; code.isEditing = false; };

const saveCode = async (code) => {
  try {
    await axios.put(`/api/v1/code/${code.itemCd}`, {
      groupCd: selectedCategoryId.value, itemCd: code.itemCd, itemNm: code.itemNm, sort: code.sort, useFl: code.useFl, option: code.option
    });
    window.alert('수정되었습니다.'); code.isEditing = false; await fetchAllCodes();
  } catch (err) { window.customAlert('수정에 실패했습니다.', 'error'); }
};

const deleteCode = async (code) => {
  if (code.deleteFl === 'N') return window.customAlert('삭제 권한이 없는 항목입니다.', 'error');

  // ★ 하위 분류가 존재하면 삭제 방어 로직 추가
  const childCount = getChildCount(code.itemCd);
  if (childCount > 0) {
    return window.customAlert(`해당 항목 아래에 하위 분류가 ${childCount}개 존재합니다. 하위 분류를 먼저 삭제해주세요.`, 'error');
  }

  if (!await window.customConfirm('정말 삭제하시겠습니까?')) return;
  try {
    await axios.delete(`/api/v1/code/${code.itemCd}`);
    window.alert('삭제되었습니다.'); await fetchAllCodes();
  } catch (err) { window.customAlert('삭제에 실패했습니다.', 'error'); }
};

const addCode = async () => {
  if (!newCodeName.value.trim()) return window.customAlert('항목명을 입력해주세요.', 'error');
  try {
    await axios.post(`/api/v1/code/${cIdx}`, {
      groupCd: selectedCategoryId.value, itemCd: newCodeNumber.value, itemNm: newCodeName.value,
      sort: newCodeSort.value || (filteredCodeList.value.length + 1), useFl: 'Y', option: newCodeOption.value
    });
    window.alert('추가되었습니다.');
    newCodeName.value = ''; newCodeSort.value = 0; newCodeOption.value = isColorTarget.value ? '#000000' : '';
    await fetchAllCodes();
  } catch (err) { window.customAlert('추가에 실패했습니다.', 'error'); }
};

onMounted(async () => { await fetchAllCodes(); });
</script>

<template>
  <div class="payroll-settings-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-account-cog"></i> 인사 코드 설정</h1>
        <p class="page-subtitle">좌측에서 중분류를 선택하고 우측에서 하위 직책 및 세부 코드를 설정하세요.</p>
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
                <input type="text" v-model="editingCategoryName" class="tree-input" @keyup.enter="saveCategoryEdit(child)" @keyup.esc="cancelCategoryEdit" />
                <div class="tree-edit-actions">
                  <button @click="saveCategoryEdit(child)" class="icon-btn text-success"><i class="mdi mdi-check"></i></button>
                  <button @click="cancelCategoryEdit" class="icon-btn text-danger"><i class="mdi mdi-close"></i></button>
                </div>
              </div>

              <div v-else class="tree-item-wrapper">
                <button :class="['tree-item-btn', { active: activeSidebarId === child.id }]" @click="selectCategory(child.id)">
                  <span class="tree-item-name">{{ child.name }}</span>
                  <span class="tree-item-id">{{ child.id }}</span>
                </button>
                <div class="tree-item-hover-actions">
                  <button @click.stop="startCategoryEdit(child)" class="icon-btn" :disabled="child.editFl === 'N'"><i class="mdi mdi-pencil-outline"></i></button>
                  <button @click.stop="deleteCategory(child)" class="icon-btn text-danger" :disabled="child.deleteFl === 'N'"><i class="mdi mdi-trash-can-outline"></i></button>
                </div>
              </div>
            </li>
            <li v-if="addingToGroupId === group.id" class="tree-add-box">
              <input type="text" v-model="newCategoryName" placeholder="새 중분류명 입력" class="tree-input" @keyup.enter="addCategory(group)" @keyup.esc="addingToGroupId = null" autofocus />
              <div class="tree-edit-actions">
                <button @click="addCategory(group)" class="icon-btn text-success"><i class="mdi mdi-check"></i></button>
                <button @click="addingToGroupId = null" class="icon-btn text-danger"><i class="mdi mdi-close"></i></button>
              </div>
            </li>
            <li v-else>
              <button class="tree-add-btn" @click="startCategoryAdd(group.id)"><i class="mdi mdi-plus"></i> 중분류 추가</button>
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
              <template v-for="(crumb, index) in activeBreadcrumbs" :key="crumb.id">
                <span
                    class="breadcrumb-crumb"
                    :class="{ 'is-link': index < activeBreadcrumbs.length - 1 }"
                    @click="index < activeBreadcrumbs.length - 1 ? selectCategory(crumb.id) : null"
                >
                  {{ crumb.name }}
                </span>
                <i v-if="index < activeBreadcrumbs.length - 1" class="mdi mdi-chevron-right"></i>
              </template>
            </div>
            <div class="search-box">
              <i class="mdi mdi-magnify"></i>
              <input type="text" v-model="searchQuery" placeholder="코드 또는 항목명 검색..." class="search-input" />
              <button v-if="searchQuery" @click="searchQuery = ''" class="search-clear"><i class="mdi mdi-close"></i></button>
            </div>
          </div>

          <div class="table-card">

            <div v-if="isSubCategoryLevel" class="go-up-bar">
              <button @click="goUpCategory" class="btn-go-up">
                <i class="mdi mdi-arrow-up-left"></i> 상위 분류로 이동
              </button>
              <span class="current-sub-title">
                <i class="mdi mdi-folder-open"></i>
                [{{ activeBreadcrumbs[activeBreadcrumbs.length - 1]?.name }}] 하위 항목 리스트
              </span>
            </div>

            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                <tr>
                  <th style="width:52px;">No.</th>
                  <th style="width:140px;">코드 번호</th>
                  <th>항목명</th>
                  <th style="width:100px;">하위 분류</th>
                  <th v-if="isColorTarget" style="width:150px;">색상 지정</th>
                  <th v-if="isAgeTarget" style="width:150px;">연령 설정</th>
                  <th style="width:68px;">순서</th>
                  <th style="width:90px;">사용 여부</th>
                  <th style="width:84px;">관리</th>
                </tr>
                </thead>
                <tbody>

                <tr v-for="(code, index) in filteredCodeList" :key="code.itemCd" class="data-row">
                  <td class="text-center"><span class="row-number">{{ index + 1 }}</span></td>
                  <td><span class="code-number">{{ code.itemCd }}</span></td>

                  <td>
                    <input v-if="code.isEditing" type="text" v-model="code.itemNm" class="input-edit w-full" disabled/>
                    <span v-else class="code-name">{{ code.itemNm }}</span>
                  </td>

                  <td class="text-center">
                    <button :disabled="code.groupCd !== '01002'" @click="selectCategory(code.itemCd)" class="btn-manage-sub" title="이 항목의 하위 코드를 관리합니다.">
                      <i class="mdi mdi-subdirectory-arrow-right"></i> 설정
                      <span v-if="getChildCount(code.itemCd) > 0" class="sub-count">{{ getChildCount(code.itemCd) }}</span>
                    </button>
                  </td>

                  <td v-if="isColorTarget">
                    <div v-if="code.isEditing" class="color-edit-wrapper">
                      <input type="color" v-model="code.option" class="color-picker"/>
                      <input type="text" v-model="code.option" class="color-text-input" maxlength="7"/>
                    </div>
                    <div v-else class="color-display">
                      <span class="color-swatch" :style="{ backgroundColor: code.option || '#cccccc' }"></span>
                      <span class="color-code">{{ code.option || '미지정' }}</span>
                    </div>
                  </td>

                  <td v-if="isAgeTarget" class="text-center">
                    <div v-if="code.isEditing" class="age-input-wrapper">
                      <span>만</span><input type="text" v-model="code.option" class="input-inline text-center" style="width:50px;"/><span>세</span>
                    </div>
                    <div v-else class="age-display">
                      <span>만 <strong style="margin:0 4px;">{{ code.option || '-' }}</strong> 세</span>
                    </div>
                  </td>

                  <td class="text-center">
                    <input v-if="code.isEditing" type="number" v-model.number="code.sort" class="input-inline text-center" style="width:48px;" min="0" />
                    <span v-else class="sort-number">{{ code.sort }}</span>
                  </td>

                  <td>
                    <select v-if="code.isEditing" v-model="code.useFl" class="select-inline">
                      <option value="Y">사용</option><option value="N">미사용</option>
                    </select>
                    <span v-else :class="['use-dot', code.useFl === 'Y' ? 'use-on' : 'use-off']">{{ code.useFl === 'Y' ? '사용' : '미사용' }}</span>
                  </td>

                  <td class="text-center">
                    <div class="row-actions">
                      <template v-if="code.isEditing">
                        <button @click="saveCode(code)" class="icon-btn-row icon-btn-row--save" title="저장"><i class="mdi mdi-check"></i></button>
                        <button @click="cancelEdit(code)" class="icon-btn-row icon-btn-row--cancel" title="취소"><i class="mdi mdi-close"></i></button>
                      </template>
                      <template v-else>
                        <button @click="startEdit(code)" class="icon-btn-row icon-btn-row--edit" :disabled="code.editFl === 'N'"><i class="mdi mdi-pencil-outline"></i></button>
                        <button @click="deleteCode(code)" class="icon-btn-row icon-btn-row--del" :disabled="code.deleteFl === 'N'"><i class="mdi mdi-trash-can-outline"></i></button>
                      </template>
                    </div>
                  </td>
                </tr>

                <tr v-if="filteredCodeList.length === 0" class="empty-row">
                  <td :colspan="(isColorTarget || isAgeTarget) ? 8 : 7">
                    <div class="empty-state">
                      <div class="empty-icon-wrapper">
                        <i class="mdi mdi-folder-outline"></i>
                      </div>
                      <p>등록된 항목이 없습니다.</p>
                      <span>하단의 폼을 이용해 새로운 코드를 생성해주세요.</span>
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
                  <input type="text" :value="newCodeNumber" disabled class="add-input add-input--disabled" style="width: 130px;"/>
                </div>
                <div class="add-field add-field--grow">
                  <label>항목명 <span class="req">*</span></label>
                  <input type="text" v-model="newCodeName" placeholder="항목명을 입력하세요" class="add-input" @keyup.enter="addCode"/>
                </div>

                <div v-if="isColorTarget" class="add-field">
                  <label>색상 지정</label>
                  <div class="color-edit-wrapper" style="height: 36px; padding: 0;">
                    <input type="color" v-model="newCodeOption" class="color-picker" style="height: 100%; border:1px solid var(--border-color);" />
                    <input type="text" v-model="newCodeOption" class="color-text-input" placeholder="#000000" maxlength="7" style="height:100%;"/>
                  </div>
                </div>

                <div v-if="isAgeTarget" class="add-field">
                  <label>연령 설정</label>
                  <div class="age-input-wrapper" style="height: 36px; display: flex; align-items: center; gap:6px;">
                    <span style="font-size:13px; color:var(--text-sub);">만</span>
                    <input type="text" v-model="newCodeOption" class="add-input text-center" style="width: 60px;" placeholder="숫자" />
                    <span style="font-size:13px; color:var(--text-sub);">세</span>
                  </div>
                </div>

                <div class="add-field" style="width:64px;">
                  <label>순서</label>
                  <input type="number" v-model.number="newCodeSort" placeholder="0" class="add-input text-center" min="0" />
                </div>
              </div>
              <button @click="addCode" class="btn-add-submit"><i class="mdi mdi-plus"></i> 추가</button>
            </div>
          </div>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ── 유틸 및 레이아웃 ── */
.w-full { width: 100%; box-sizing: border-box; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-primary { color: var(--primary); }
.text-success { color: var(--success) !important; }
.text-danger { color: var(--danger) !important; }
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
.tree-group { margin-bottom: 20px; }
.tree-group:last-child { margin-bottom: 0; }
.tree-group-title {
  font-weight: 700; font-size: 12px; color: var(--text-sub);
  letter-spacing: .5px; margin-bottom: 6px;
  display: flex; align-items: center; gap: 6px; padding: 0 4px;
}
.tree-group-title i { font-size: 16px; }
.tree-children { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }

.tree-item-wrapper { position: relative; display: flex; align-items: center; border-radius: 7px; overflow: hidden; }
.tree-item-btn {
  flex: 1; text-align: left; padding: 8px 10px 8px 18px;
  background: transparent; border: none; color: var(--text-sub);
  font-size: 13px; cursor: pointer; transition: all .15s;
  display: flex; align-items: center;
}
.tree-item-wrapper:hover .tree-item-btn { background: var(--bg-hover); color: var(--text-main); }
.tree-item-btn.active { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
.tree-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 사이드바 코드 번호(ID) 뱃지 */
.tree-item-id {
  font-size: 11px; font-family: monospace; color: var(--text-sub);
  background: var(--bg-canvas); padding: 2px 6px; border-radius: 4px;
  margin-left: 8px; transition: opacity 0.15s;
}
.tree-item-btn.active .tree-item-id { background: #ffffff; color: var(--primary); font-weight: 600; }
.tree-item-wrapper:hover .tree-item-id { opacity: 0; }

.tree-item-hover-actions {
  position: absolute; right: 4px; display: flex; gap: 2px;
  opacity: 0; transition: opacity .15s;
}
.tree-item-wrapper:hover .tree-item-hover-actions { opacity: 1; }

.tree-add-box, .tree-edit-box { display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 18px; }
.tree-input { flex: 1; padding: 5px 7px; border: 1px solid var(--border-color); border-radius: 5px; font-size: 12px; }
.tree-input:focus { outline: none; border-color: var(--primary); }
.tree-edit-actions { display: flex; gap: 2px; }

.icon-btn {
  background: none; border: none; padding: 4px; border-radius: 4px;
  cursor: pointer; color: var(--text-sub);
  display: flex; align-items: center; justify-content: center; font-size: 14px;
}
.icon-btn:hover:not(:disabled) { background: var(--bg-canvas); color: var(--text-main); }
.icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.tree-add-btn {
  width: 100%; text-align: left; padding: 7px 10px 7px 18px;
  background: transparent; border: none; border-radius: 7px;
  color: var(--primary); font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background .15s; opacity: .75;
}
.tree-add-btn:hover { background: var(--primary-soft); opacity: 1; }

/* ═══════════════════════════
   메인 콘텐츠
═══════════════════════════ */
.main-content { flex: 1; min-width: 0; }

.empty-selection-box {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 300px; background: var(--bg-surface);
  border: 1px dashed var(--border-color); border-radius: 12px;
  color: var(--text-sub); font-size: 14px; gap: 12px;
}
.empty-selection-box i { font-size: 32px; color: var(--border-color); }

/* 콘텐츠 헤더 */
.content-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; background: var(--bg-surface);
  padding: 14px 16px; border-radius: 12px; border: 1px solid var(--border-color); gap: 16px;
}
.breadcrumb { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

/* ── Breadcrumb 링크 형태 ── */
.breadcrumb-crumb { font-size: 14px; font-weight: 600; color: var(--text-main); }
.breadcrumb-crumb.is-link {
  color: var(--text-sub); font-weight: 500; cursor: pointer; transition: color 0.2s;
}
.breadcrumb-crumb.is-link:hover { color: var(--primary); text-decoration: underline; }
.breadcrumb .mdi-chevron-right { font-size: 16px; color: var(--border-color); margin: 0 4px; }

/* 검색 */
.search-box {
  display: flex; align-items: center; background: var(--bg-canvas);
  border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 12px; min-width: 220px;
}
.search-box i { color: var(--text-sub); margin-right: 8px; font-size: 15px; }
.search-input { border: none; background: transparent; outline: none; width: 100%; font-size: 13px; }
.search-clear { background: none; border: none; cursor: pointer; color: var(--text-sub); padding: 0; }

/* ── 테이블 상단 - 상위 항목으로 이동 (Go Up Bar) ── */
.go-up-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; background: var(--bg-hover);
  border-bottom: 1px solid var(--border-color);
}
.btn-go-up {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 10px; background: #fff; border: 1px solid var(--border-color);
  border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-main);
  cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.btn-go-up:hover { border-color: var(--text-sub); background: var(--bg-canvas); }
.current-sub-title { font-size: 13px; font-weight: 600; color: var(--primary); }

/* 테이블 카드 */
.table-card { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); overflow: hidden; }
.table-wrapper { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }

.data-table thead th {
  background: var(--bg-canvas); padding: 10px 12px;
  font-size: 11px; font-weight: 700; color: var(--text-sub); letter-spacing: .3px;
  border-bottom: 1px solid var(--border-color); white-space: nowrap; text-align: left;
}
.data-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
.data-row:last-child td { border-bottom: none; }
.data-row:hover { background: var(--bg-hover); }

/* 셀 요소 */
.row-number {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; background: var(--bg-hover);
  border-radius: 5px; font-weight: 600; color: var(--text-sub); font-size: 11px;
}
.code-number { font-size: 12px; font-weight: 600; color: var(--primary); background: var(--primary-soft); padding: 3px 9px; border-radius: 5px; white-space: nowrap; }
.code-name { font-size: 13px; font-weight: 500; color: var(--text-main); }
.sort-number { font-size: 13px; color: var(--text-sub); }

/* ── 하위 분류 진입 버튼 (Drill-down) ── */
.btn-manage-sub {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 8px; border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-canvas);
  color: var(--text-main);
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-manage-sub:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
.btn-manage-sub:disabled {
  background: var(--bg-canvas);
  color: var(--text-sub);
  cursor: not-allowed;
}
.sub-count { background: var(--primary); color: #fff; padding: 1px 5px; border-radius: 10px; font-size: 10px; margin-left: 2px; }

/* 색상 표시/편집 */
.color-display { display: flex; align-items: center; gap: 8px; }
.color-swatch { width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border-color); display: inline-block; }
.color-code { font-size: 12px; color: var(--text-sub); }
.color-edit-wrapper { display: flex; align-items: center; gap: 6px; }
.color-picker { width: 32px; height: 32px; padding: 2px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; background: var(--bg-surface); }
.color-text-input { width: 70px; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; text-transform: uppercase; color: var(--text-main); background: var(--bg-surface); }
.color-text-input:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 2px var(--primary-soft); }

/* 연령 표시/편집 */
.age-display { display: flex; align-items: center; font-size: 13px; color: var(--text-main); justify-content: center;}
.age-input-wrapper { display: flex; align-items: center; gap: 6px; justify-content: center;}

/* 사용여부 도트 */
.use-dot::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; flex-shrink: 0; }
.use-dot { display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; }
.use-on { color: var(--success); }
.use-on::before { background: var(--success); }
.use-off { color: var(--text-sub); }
.use-off::before { background: var(--border-color); }

/* 인라인 편집 */
.input-inline { padding: 6px 9px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; transition: border-color .15s; }
.input-inline:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.select-inline { padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; background: var(--bg-surface); cursor: pointer; }

/* 행 아이콘 버튼 */
.row-actions { display: flex; gap: 4px; justify-content: center; }
.icon-btn-row {
  width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-surface);
  cursor: pointer; transition: all .15s; font-size: 15px; color: var(--text-sub);
}
.icon-btn-row:disabled { opacity: .35; cursor: not-allowed; }
.icon-btn-row--edit:hover:not(:disabled) { background: var(--primary); border-color: var(--primary); color: #fff; }
.icon-btn-row--del:hover:not(:disabled) { background: var(--danger); border-color: var(--danger); color: #fff; }
.icon-btn-row--save:hover { background: var(--success); border-color: var(--success); color: #fff; }
.icon-btn-row--cancel:hover { background: var(--text-sub); border-color: var(--text-sub); color: #fff; }

/* 빈 상태 */
.empty-row td { padding: 30px 20px !important; border-bottom: none; }
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px; background: var(--bg-canvas); border: 1px dashed var(--border-color);
  border-radius: 10px; gap: 10px; color: var(--text-sub);
}
.empty-icon-wrapper {
  display: flex; align-items: center; justify-content: center;
  width: 64px; height: 64px; background: var(--primary-soft);
  border-radius: 50%; margin-bottom: 8px;
}
.empty-icon-wrapper i { font-size: 32px; color: var(--primary); }
.empty-state p { font-size: 15px; font-weight: 600; margin: 0; color: var(--text-main); }
.empty-state span { font-size: 13px; opacity: 0.8; }

/* ── 추가 폼 바 ── */
.add-form-bar {
  display: flex; align-items: flex-end; gap: 10px;
  padding: 16px; background: var(--bg-canvas);
  border-top: 1px solid var(--border-color);
}
.add-form-fields { display: flex; gap: 10px; flex: 1; flex-wrap: wrap; }
.add-field { display: flex; flex-direction: column; gap: 4px; }
.add-field--grow { flex: 1; min-width: 160px; }
.add-field label { font-size: 11px; font-weight: 600; color: var(--text-sub); white-space: nowrap; }
.add-field .req { color: var(--danger); }

.add-input {
  padding: 7px 10px; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 13px; color: var(--text-main); background: var(--bg-surface);
  box-sizing: border-box; width: 100%; transition: border-color .15s;
}
.add-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.add-input--disabled { background: var(--bg-hover); color: var(--text-sub); cursor: not-allowed; border-color: transparent; }

.btn-add-submit {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 0 20px; height: 36px; background: var(--primary);
  border: none; border-radius: 7px; color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s;
  white-space: nowrap; flex-shrink: 0;
}
.btn-add-submit:hover { background: var(--primary-hover, #2563eb); }
.btn-add-submit .mdi { font-size: 16px; }

/* === 비활성화된 입력창 스타일 === */
.input-edit:disabled {
  background-color: var(--bg-canvas, #f3f4f6);
  color: var(--text-muted, #9ca3af);
  cursor: not-allowed;
  opacity: 0.7;
}
.input-edit:disabled:hover,
.input-edit:disabled:focus { border-color: var(--border-color); box-shadow: none; outline: none; }
</style>
