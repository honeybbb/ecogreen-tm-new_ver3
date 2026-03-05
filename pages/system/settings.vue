<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";

const authStore = useAuthStore();
const companyNo = authStore.user?.cIdx;

// computed 대신 ref로 관리해야 개별 행의 isEditing 상태를 Vue가 완벽히 추적합니다.
const menuTree = ref([]);
const isLoading = ref(false);

// 트리 구조 생성 함수 (자식 요소에도 isEditing 속성 부여)
const buildTree = (data) => {
  const parents = data.filter(m => !m.parentNo || m.parentNo === 0);
  menuTree.value = parents.map(p => ({
    ...p,
    isEditing: false,
    children: data.filter(c => c.parentNo === p.menuNo)
        .map(c => ({ ...c, isEditing: false }))
        .sort((a, b) => a.sort - b.sort)
  })).sort((a, b) => a.sort - b.sort);
};

// 데이터 로드
const fetchMenus = async () => {
  isLoading.value = true;
  try {
    let params = {
      isMaster: authStore.user?.isMaster,
      path: '/settings',
    }
    const res = await axios.get(`/api/v1/menu/${companyNo}`, {params});
    if (res.data.result) {
      buildTree(res.data.data);
    }
  } catch (err) {
    console.error("메뉴 로드 실패", err);
  } finally {
    isLoading.value = false;
  }
};


const handleParentMasterChange = (parent) => {
  if (parent.children && parent.children.length > 0) {
    parent.children.forEach(child => {
      child.masterOnly = parent.masterOnly;
    });
  }
};

// 통합 API 저장 함수 (모든 데이터를 한 번에 업데이트)
const saveChangesToApi = async (menu) => {
  const payload = {
    menuNo: menu.menuNo,
    menuNm: menu.menuNm,
    sort: menu.sort,
    masterOnly: menu.masterOnly,
    useFl: menu.useFl
  };

  await axios.put(`/api/v1/menu/update/${companyNo}`, payload);
};

// [버튼 액션] 수정 모드 진입
const startInlineEdit = (menu) => {
  menu.isEditing = true;
  menu.tempSort = menu.sort;
  menu.tempMenuNm = menu.menuNm;
  menu.tempMasterOnly = menu.masterOnly;
};

// [버튼 액션] 수정 취소 (원래 값으로 복구)
const cancelInlineEdit = (menu) => {
  menu.sort = menu.tempSort;
  menu.menuNm = menu.tempMenuNm;
  menu.masterOnly = menu.tempMasterOnly;
  menu.isEditing = false;
};

// [버튼 액션] 수정 사항 저장
const saveInlineEdit = async (menu) => {
  try {
    await saveChangesToApi(menu);
    menu.isEditing = false;
    alert("설정이 성공적으로 저장되었습니다.");
    await fetchMenus();
  } catch (err) {
    console.error('저장 실패:', err);
    alert('저장 중 오류가 발생했습니다.');
  }
};

// [버튼 액션] 사용 여부(ON/OFF) 즉시 토글
const toggleUse = async (menu) => {
  menu.useFl = menu.useFl === 'Y' ? 'N' : 'Y';
  try {
    await saveChangesToApi(menu);
    await fetchMenus();
  } catch (err) {
    alert("상태 변경에 실패했습니다.");
    menu.useFl = menu.useFl === 'Y' ? 'N' : 'Y';
  }
};

// ==========================================
// ★ Drag & Drop 순서 변경 (하위 메뉴 묶음 이동 적용)
// ==========================================
const draggedItem = ref(null);
const draggedType = ref(''); // 'parent' or 'child'
const draggedParentId = ref(null);
const dragTargetId = ref(null);

const onDragStart = (item, type, parentId, event) => {
  // 수정 중일 때는 드래그를 차단하여 입력(텍스트 드래그)에 방해되지 않도록 합니다.
  if (item.isEditing) {
    event.preventDefault();
    return;
  }

  draggedItem.value = item;
  draggedType.value = type;
  draggedParentId.value = parentId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item.menuNo);
};

const onDragEnter = (targetMenuNo, type, parentId) => {
  if (draggedType.value === 'parent') {
    // 부모를 드래그하여 자식 행 위로 마우스가 올라가더라도,
    // 전체 묶음인 '부모'를 드롭 타겟으로 인식하도록 처리합니다.
    dragTargetId.value = type === 'child' ? parentId : targetMenuNo;
  } else {
    dragTargetId.value = targetMenuNo;
  }
};

const onDrop = async (targetItem, type, parentId) => {
  if (!draggedItem.value) return;

  let listToUpdate = [];

  if (draggedType.value === 'parent') {
    // 타겟이 자식이라면 그 자식의 부모를 진짜 타겟으로 변환
    const targetParentNo = type === 'child' ? parentId : targetItem.menuNo;
    if (draggedItem.value.menuNo === targetParentNo) return; // 제자리 드롭

    const fromIndex = menuTree.value.findIndex(m => m.menuNo === draggedItem.value.menuNo);
    const toIndex = menuTree.value.findIndex(m => m.menuNo === targetParentNo);

    // 배열 스왑
    const [movedItem] = menuTree.value.splice(fromIndex, 1);
    menuTree.value.splice(toIndex, 0, movedItem);
    listToUpdate = menuTree.value;

  } else if (draggedType.value === 'child') {
    if (type === 'parent') return; // 자식을 부모로 빼낼 수 없음
    if (draggedParentId.value !== parentId) return; // 다른 부모의 그룹으로 이동 불가
    if (draggedItem.value.menuNo === targetItem.menuNo) return;

    const parent = menuTree.value.find(p => p.menuNo === parentId);
    const fromIndex = parent.children.findIndex(m => m.menuNo === draggedItem.value.menuNo);
    const toIndex = parent.children.findIndex(m => m.menuNo === targetItem.menuNo);

    // 배열 스왑
    const [movedItem] = parent.children.splice(fromIndex, 1);
    parent.children.splice(toIndex, 0, movedItem);
    listToUpdate = parent.children;
  }

  // 1부터 순서 다시 덮어쓰기
  listToUpdate.forEach((item, index) => { item.sort = index + 1; });

  draggedItem.value = null;
  dragTargetId.value = null;

  // 변경된 순서들을 기존 API로 일괄 업데이트
  try {
    isLoading.value = true;
    for (const item of listToUpdate) {
      await saveChangesToApi(item);
    }
  } catch (err) {
    console.error('순서 저장 중 오류:', err);
    alert('순서 변경 저장 중 오류가 발생했습니다.');
  } finally {
    await fetchMenus(); // DB 반영 완료 후 화면 갱신
  }
};

const onDragEnd = () => {
  draggedItem.value = null;
  dragTargetId.value = null;
};

onMounted(() => {
  fetchMenus();
});
</script>

<template>
  <div class="menu-settings-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-menu-open"></i>
          시스템 메뉴 설정
        </h1>
        <p class="page-subtitle">ERP 좌측 메뉴의 구성, 접근 권한, 노출 여부를 통합 관리합니다</p>
      </div>
      <div class="header-actions">
        <button @click="fetchMenus" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <div class="table-card">
      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 80px;"><div class="th-content"><i class="mdi mdi-sort-variant"></i><span>순서</span></div></th>
            <th style="width: 100px;"><div class="th-content"><i class="mdi mdi-emoticon-outline"></i><span>아이콘</span></div></th>
            <th><div class="th-content"><i class="mdi mdi-tag-outline"></i><span>메뉴명 (식별키)</span></div></th>
            <th><div class="th-content"><i class="mdi mdi-link-variant"></i><span>연결 경로</span></div></th>
            <th style="width: 160px;"><div class="th-content"><i class="mdi mdi-lock-outline"></i><span>접근 권한</span></div></th>
            <th style="width: 120px;"><div class="th-content"><i class="mdi mdi-toggle-switch-outline"></i><span>사용 여부</span></div></th>
            <th class="text-center sticky-col" style="width: 140px;"><div class="th-content justify-center"><span>관리</span></div></th>
          </tr>
          </thead>

          <tbody
              v-for="parent in menuTree"
              :key="'tbody-' + parent.menuNo"
              class="menu-tbody"
              :class="{
              'dragging-tbody': draggedItem?.menuNo === parent.menuNo && draggedType === 'parent',
              'drop-target-tbody': dragTargetId === parent.menuNo && draggedType === 'parent'
            }"
              :draggable="!parent.isEditing"
              @dragstart="onDragStart(parent, 'parent', null, $event)"
              @dragover.prevent
              @dragenter.prevent="onDragEnter(parent.menuNo, 'parent', null)"
              @drop="onDrop(parent, 'parent', null)"
              @dragend="onDragEnd"
          >
          <tr class="row-parent">
            <td class="text-center">
              <div class="drag-handle-wrap">
                <i class="mdi mdi-drag drag-icon" title="드래그하여 순서 변경"></i>
                <input v-if="parent.isEditing" type="number" v-model="parent.sort" class="input-sort">
                <span v-else class="sort-badge">{{ parent.sort }}</span>
              </div>
            </td>
            <td class="text-center">
              <div class="icon-box">{{parent.menuIcon}}</div>
            </td>
            <td>
              <div class="menu-name-wrap">
                <input v-if="parent.isEditing" type="text" v-model="parent.menuNm" class="input-edit">
                <strong v-else class="parent-name">{{ parent.menuNm }}</strong>
                <span class="menu-key-tag">{{ parent.menuKey }}</span>
              </div>
            </td>
            <td class="text-gray">{{ parent.menuPath }}</td>
            <td>
              <select v-if="parent.isEditing" v-model="parent.masterOnly" @change="handleParentMasterChange(parent)" class="input-select">
                <option value="Y">마스터 전용</option>
                <option value="N">전체 허용</option>
              </select>
              <span v-else :class="['auth-badge', parent.masterOnly === 'Y' ? 'master' : 'all']">
                    <i :class="['mdi', parent.masterOnly === 'Y' ? 'mdi-shield-lock' : 'mdi-account-group']"></i>
                    {{ parent.masterOnly === 'Y' ? '마스터 전용' : '전체 허용' }}
                  </span>
            </td>
            <td class="text-center">
              <div @click="toggleUse(parent)" :class="['toggle-switch', parent.useFl === 'Y' ? 'active' : '']">
                <div class="switch-handle"></div>
                <span class="switch-label">{{ parent.useFl === 'Y' ? 'ON' : 'OFF' }}</span>
              </div>
            </td>
            <td class="text-center sticky-col bg-parent">
              <div class="action-buttons">
                <template v-if="!parent.isEditing">
                  <button @click="startInlineEdit(parent)" class="btn-action btn-edit"><i class="mdi mdi-pencil"></i> 수정</button>
                </template>
                <template v-else>
                  <button @click="saveInlineEdit(parent)" class="btn-action btn-save"><i class="mdi mdi-check"></i> 저장</button>
                  <button @click="cancelInlineEdit(parent)" class="btn-action btn-cancel"><i class="mdi mdi-close"></i></button>
                </template>
              </div>
            </td>
          </tr>

          <tr
              v-for="child in parent.children"
              :key="child.menuNo"
              class="row-child"
              :class="{
                'drop-target-child': dragTargetId === child.menuNo && draggedType === 'child',
                'dragging-child': draggedItem?.menuNo === child.menuNo && draggedType === 'child'
              }"
              :draggable="!child.isEditing"
              @dragstart.stop="onDragStart(child, 'child', parent.menuNo, $event)"
              @dragover.prevent.stop
              @dragenter.prevent.stop="onDragEnter(child.menuNo, 'child', parent.menuNo)"
              @drop.stop="onDrop(child, 'child', parent.menuNo)"
              @dragend.stop="onDragEnd"
          >
            <td class="text-center">
              <div class="drag-handle-wrap child-handle">
                <i class="mdi mdi-drag drag-icon-sm" title="드래그하여 순서 변경"></i>
                <input v-if="child.isEditing" type="number" v-model="child.sort" class="input-sort">
                <span v-else class="sort-dot">{{ child.sort }}</span>
              </div>
            </td>
            <td class="text-center">
              <div class="child-connector"></div>
            </td>
            <td class="pl-8">
              <div class="menu-name-wrap">
                <i class="mdi mdi-subdirectory-arrow-right connector-icon"></i>
                <input v-if="child.isEditing" type="text" v-model="child.menuNm" class="input-edit-sm">
                <span v-else class="child-name">{{ child.menuNm }}</span>
              </div>
            </td>
            <td class="text-gray-sm">{{ child.menuPath }}</td>
            <td>
              <select v-if="child.isEditing" v-model="child.masterOnly" class="input-select sm">
                <option value="Y">마스터 전용</option>
                <option value="N">전체 허용</option>
              </select>
              <span v-else :class="['auth-badge sm', child.masterOnly === 'Y' ? 'master' : 'all']">
                    {{ child.masterOnly === 'Y' ? '마스터 전용' : '전체 허용' }}
                  </span>
            </td>
            <td class="text-center">
              <div @click="toggleUse(child)" :class="['toggle-switch sm', child.useFl === 'Y' ? 'active' : '']" style="margin: 0 auto;">
                <div class="switch-handle sm"></div>
              </div>
            </td>
            <td class="text-center sticky-col bg-child">
              <div class="action-buttons">
                <template v-if="!child.isEditing">
                  <button @click="startInlineEdit(child)" class="btn-action btn-edit-outline">수정</button>
                </template>
                <template v-else>
                  <button @click="saveInlineEdit(child)" class="btn-action btn-save-small">저장</button>
                  <button @click="cancelInlineEdit(child)" class="btn-action btn-cancel-small"><i class="mdi mdi-close"></i></button>
                </template>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-box">
      <i class="mdi mdi-information-outline"></i>
      <div class="info-content">
        <strong>메뉴 통합 설정 안내</strong>
        <ul>
          <li><strong>마우스 드래그:</strong> 좌측의 <i class="mdi mdi-drag"></i> 아이콘을 클릭하고 <strong>위아래로 끌어 메뉴 그룹 혹은 하위 메뉴의 노출 순서를 직관적으로 변경</strong>할 수 있습니다.</li>
          <li><strong>노출 여부:</strong> 'OFF' 처리된 메뉴는 해당 회사 전체 사용자에게 보이지 않습니다.</li>
          <li><strong>동기화 규칙:</strong> 상위 그룹 메뉴의 권한을 '마스터 전용'으로 변경하면 하위 메뉴들도 자동 동기화됩니다.</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.justify-center { justify-content: center; }

/* 행 배경색 및 호버 효과 */
.row-parent, .row-child { transition: background-color 0.2s; }
.row-parent { background: #fff; border-bottom: 1px solid #e2e8f0; }
.row-parent:hover { background: #f8fafc; }
.row-parent td { padding: 16px 20px; vertical-align: middle; }

.row-child { background: #fdfdfd; border-bottom: 1px solid #f1f5f9; }
.row-child:hover { background: #f8fafc; }
.row-child td { padding: 12px 20px; font-size: 13px; vertical-align: middle; }

/* === ★ 드래그 앤 드롭 관련 스타일 변경 ★ === */

/* 부모 전체 그룹 덩어리를 타겟으로 삼을 때의 시각적 피드백 */
.drop-target-tbody {
  border-top: 3px solid #8b5cf6 !important;
}
.drop-target-tbody > tr {
  background: #f5f3ff !important;
}

/* 드래그 되는 요소 반투명 처리 */
.dragging-tbody > tr { opacity: 0.4; background: #e2e8f0 !important; }
.dragging-child { opacity: 0.4; background: #e2e8f0 !important; }

/* 자식 타겟 시각적 피드백 */
.drop-target-child { border-top: 2px solid #8b5cf6 !important; background: #f5f3ff !important; }

.drag-handle-wrap { display: flex; align-items: center; justify-content: center; gap: 4px; }
.child-handle { justify-content: flex-end; padding-right: 10px; }
.drag-icon { font-size: 20px; color: #cbd5e1; cursor: grab; transition: 0.2s; }
.drag-icon:hover { color: #8b5cf6; }
.drag-icon:active { cursor: grabbing; color: #5b21b6; }
.drag-icon-sm { font-size: 16px; color: #cbd5e1; cursor: grab; transition: 0.2s; }
.drag-icon-sm:hover { color: #8b5cf6; }
.drag-icon-sm:active { cursor: grabbing; color: #5b21b6; }
/* ==================================== */

/* 순서 표시 */
.sort-badge { display: inline-flex; width: 30px; height: 30px; background: #ede9fe; color: #6d28d9; border-radius: 8px; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; border: 1px solid #ddd6fe; }
.sort-dot { display: inline-flex; width: 22px; height: 22px; background: #f1f5f9; color: #64748b; border-radius: 6px; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
.input-sort { width: 50px; padding: 6px; border: 2px solid #a78bfa; border-radius: 6px; text-align: center; outline: none; font-weight: 700; color: #1e293b; }

/* 메뉴명 & 아이콘 */
.menu-name-wrap { display: flex; align-items: center; gap: 10px; }
.parent-name { font-weight: 800; color: #1e293b; font-size: 15px; }
.child-name { color: #475569; font-weight: 600; }
.menu-key-tag { font-family: 'Courier New', monospace; font-size: 11px; background: #f1f5f9; color: #64748b; padding: 3px 8px; border-radius: 6px; font-weight: 600; }
.icon-box { font-size: 24px; color: #8b5cf6; background: #f5f3ff; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
.connector-icon { color: #cbd5e1; font-size: 20px; }

/* 토글 스위치 */
.toggle-switch { width: 64px; background: #cbd5e1; border-radius: 20px; position: relative; cursor: pointer; transition: 0.3s; padding: 4px; margin: 0 auto; }
.toggle-switch.active { background: #10b981; }
.switch-handle { width: 22px; height: 22px; background: #fff; border-radius: 50%; transition: 0.3s; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
.toggle-switch.active .switch-handle { transform: translateX(34px); }
.switch-label { position: absolute; right: 10px; top: 7px; font-size: 11px; font-weight: 800; color: #fff; }
.toggle-switch.active .switch-label { left: 10px; right: auto; }

.toggle-switch.sm { width: 44px; height: 24px; }
.switch-handle.sm { width: 16px; height: 16px; }
.toggle-switch.sm.active .switch-handle { transform: translateX(20px); }

/* 권한 배지 */
.auth-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; letter-spacing: -0.3px; }
.auth-badge.master { background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; }
.auth-badge.all { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
.auth-badge.sm { padding: 4px 10px; font-size: 11px; }

/* 인라인 편집 Input / Select */
.input-select { padding: 6px 10px; border: 2px solid #a78bfa; border-radius: 8px; font-size: 13px; font-weight: 600; color: #1e293b; outline: none; background: white; cursor: pointer; width: 120px; }
.input-select.sm { padding: 4px 8px; font-size: 12px; width: 110px; }
.input-edit, .input-edit-sm { padding: 6px 12px; border: 2px solid #a78bfa; border-radius: 8px; font-size: 14px; font-weight: 700; width: 160px; outline: none; }
.input-edit-sm { font-size: 13px; font-weight: 600; width: 140px; }

/* 버튼 관리 */
.action-buttons { display: flex; justify-content: center; gap: 6px; align-items: center; }
.btn-action { padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 4px; border: none; }
.btn-edit { background: #7c3aed; color: white; box-shadow: 0 2px 6px rgba(124, 58, 237, 0.2); }
.btn-edit:hover { background: #6d28d9; transform: translateY(-1px); }
.btn-edit-outline { background: white; border: 1px solid #cbd5e1; color: #475569; }
.btn-edit-outline:hover { border-color: #7c3aed; color: #7c3aed; }

.btn-save { background: #10b981; color: white; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.2); }
.btn-save:hover { background: #059669; transform: translateY(-1px); }
.btn-save-small { background: #10b981; color: white; padding: 6px 14px; }
.btn-cancel { background: #fee2e2; color: #dc2626; padding: 6px 8px; }
.btn-cancel-small { background: #fee2e2; color: #dc2626; padding: 6px 8px; }

.sticky-col { position: sticky; right: 0; box-shadow: -4px 0 8px rgba(0,0,0,0.03); }
.bg-parent { background: #fff; }
.row-parent:hover .bg-parent { background: #f8fafc; }
.bg-child { background: #fdfdfd; }
.row-child:hover .bg-child { background: #f8fafc; }

/* 하단 정보 박스 */
.info-box { display: flex; gap: 16px; padding: 24px; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 16px; margin-top: 24px; color: #5b21b6; }
.info-box i { font-size: 28px; color: #7c3aed; }
.info-content strong { display: block; font-size: 16px; font-weight: 800; margin-bottom: 10px; }
.info-content ul { padding-left: 20px; margin: 0; }
.info-content li { font-size: 14px; line-height: 1.8; font-weight: 500; }

.text-gray { color: #64748b; font-size: 13px; font-weight: 500;}
.text-gray-sm { color: #94a3b8; font-size: 12px; }
.pl-8 { padding-left: 32px !important; }
</style>
