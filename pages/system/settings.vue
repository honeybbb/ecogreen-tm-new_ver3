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

// 화면 적용 (페이지 새로고침)
const applyToScreen = () => {
  if (confirm("메뉴 변경 사항을 화면에 적용하시겠습니까?\n페이지가 새로고침됩니다.")) {
    window.location.reload();
  }
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
        <button @click="applyToScreen" class="btn-add">
          <i class="mdi mdi-laptop"></i> 화면 적용
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
            <th class="text-center" style="width: 140px;"><div class="th-content justify-center"><span>관리</span></div></th>
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
                <input v-if="parent.isEditing" type="number" v-model="parent.sort" class="input-edit text-center" style="width: 50px;">
                <span v-else class="sort-badge">{{ parent.sort }}</span>
              </div>
            </td>
            <td class="text-center">
              <div class="icon-box"><i :class="['mdi', parent.menuIcon]"></i></div>
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
              <select v-if="parent.isEditing" v-model="parent.masterOnly" @change="handleParentMasterChange(parent)" class="filter-select" style="width: 100%;">
                <option value="Y">마스터 전용</option>
                <option value="N">전체 허용</option>
              </select>
              <span v-else :class="['auth-badge', parent.masterOnly === 'Y' ? 'master' : 'all']">
                  {{ parent.masterOnly === 'Y' ? '마스터 전용' : '전체 허용' }}
                </span>
            </td>
            <td class="text-center">
              <div @click="toggleUse(parent)" :class="['custom-toggle', parent.useFl === 'Y' ? 'active' : '']">
                <div class="toggle-handle"></div>
                <span class="toggle-text">{{ parent.useFl === 'Y' ? 'ON' : 'OFF' }}</span>
              </div>
            </td>
            <td class="text-center">
              <div class="action-buttons">
                <template v-if="!parent.isEditing">
                  <button @click="startInlineEdit(parent)" class="btn-detail" style="background-color: var(--primary-soft); color: var(--primary);">
                    <i class="mdi mdi-pencil-outline"></i> 수정
                  </button>
                </template>
                <template v-else>
                  <button @click="saveInlineEdit(parent)" class="btn-detail" style="background-color: var(--success); color: white;">
                    <i class="mdi mdi-check"></i> 저장
                  </button>
                  <button @click="cancelInlineEdit(parent)" class="btn-detail" style="background-color: var(--bg-canvas); color: var(--text-sub);">
                    <i class="mdi mdi-close"></i>
                  </button>
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
                <i class="mdi mdi-drag drag-icon-sm"></i>
                <input v-if="child.isEditing" type="number" v-model="child.sort" class="input-edit text-center" style="width: 45px; padding: 4px;">
                <span v-else class="sort-dot">{{ child.sort }}</span>
              </div>
            </td>
            <td class="text-center"><div class="child-connector"></div></td>
            <td class="pl-8">
              <div class="menu-name-wrap">
                <i class="mdi mdi-subdirectory-arrow-right connector-icon"></i>
                <input v-if="child.isEditing" type="text" v-model="child.menuNm" class="input-edit" style="font-size: 12px;">
                <span v-else class="child-name">{{ child.menuNm }}</span>
              </div>
            </td>
            <td class="text-gray" style="font-size: 12px;">{{ child.menuPath }}</td>
            <td>
              <select v-if="child.isEditing" v-model="child.masterOnly" class="filter-select" style="width: 100%; height: 32px; font-size: 11px;">
                <option value="Y">마스터 전용</option>
                <option value="N">전체 허용</option>
              </select>
              <span v-else :class="['auth-badge', child.masterOnly === 'Y' ? 'master' : 'all']" style="transform: scale(0.9);">
                  {{ child.masterOnly === 'Y' ? '마스터 전용' : '전체 허용' }}
                </span>
            </td>
            <td class="text-center">
              <div @click="toggleUse(child)" :class="['custom-toggle sm', child.useFl === 'Y' ? 'active' : '']">
                <div class="toggle-handle"></div>
                <span class="toggle-text">{{ child.useFl === 'Y' ? 'ON' : 'OFF' }}</span>
              </div>
            </td>
            <td class="text-center">
              <div class="action-buttons">
                <template v-if="!child.isEditing">
                  <button @click="startInlineEdit(child)" class="btn-detail" style="background-color: var(--primary-soft); color: var(--primary);">
                    <i class="mdi mdi-pencil-outline"></i> 수정
                  </button>
                </template>
                <template v-else>
                  <button @click="saveInlineEdit(child)" class="btn-detail" style="background-color: var(--success); color: var(--bg-surface);">
                    <i class="mdi mdi-check"></i> 저장
                  </button>
                  <button @click="cancelInlineEdit(child)" class="btn-detail" style="background-color: var(--bg-canvas); color: var(--text-sub);"><i class="mdi mdi-close"></i></button>
                </template>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-box-container">
      <i class="mdi mdi-information-outline"></i>
      <div class="info-content">
        <strong>메뉴 통합 설정 안내</strong>
        <ul>
          <li><strong>마우스 드래그:</strong> 좌측의 <i class="mdi mdi-drag"></i> 아이콘을 클릭하여 메뉴 노출 순서를 변경할 수 있습니다.</li>
          <li><strong>노출 여부:</strong> 'OFF' 처리된 메뉴는 해당 회사 전체 사용자에게 숨겨집니다.</li>
          <li><strong>동기화 규칙:</strong> 상위 그룹 권한 변경 시 하위 메뉴도 자동 동기화됩니다.</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 스크롤바 */
.table-scroll-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-canvas); }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

/* 테이블 커스텀 */
.th-content { display: flex; align-items: center; gap: 6px; color: var(--text-main); }
.row-parent { background-color: var(--bg-surface); }
.row-child { background-color: var(--bg-hover); opacity: 0.9; }

/* 드래그 앤 드롭 피드백 */
.drop-target-tbody { border-top: 2px solid var(--primary) !important; }
.drop-target-tbody > tr { background-color: var(--primary-soft) !important; }
.dragging-tbody { opacity: 0.4; }
.drop-target-child { border-top: 2px solid var(--primary) !important; background-color: var(--primary-soft) !important; }

/* 아이콘 및 텍스트 */
.icon-box {
  width: 36px; height: 36px; border-radius: 8px;
  background: var(--bg-canvas); color: var(--text-sub);
  display: flex; align-items: center; justify-content: center; margin: 0 auto;
}
.parent-name { color: var(--text-main); font-weight: 700; }
.child-name { color: var(--text-sub); font-weight: 500; }
.menu-key-tag { font-size: 11px; background: var(--bg-canvas); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; margin-left: 6px; }

/* 드래그 핸들 */
.drag-icon { font-size: 20px; color: var(--text-muted); cursor: grab; }
.drag-icon:hover { color: var(--primary); }
.sort-badge { background: var(--bg-canvas); color: var(--text-main); padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; }
.sort-dot { background: var(--border-color); color: var(--text-sub); padding: 2px 6px; border-radius: 4px; font-size: 10px; }

/* 커스텀 토글 스위치 (기존 CSS와 충돌 방지를 위해 클래스명 변경) */
.custom-toggle {
  width: 52px; height: 26px; background: var(--border-focus); border-radius: 13px;
  position: relative; cursor: pointer; transition: 0.3s; margin: 0 auto;
}
.custom-toggle.active { background: var(--success); }
.toggle-handle {
  width: 20px; height: 20px; background: var(--bg-surface); border-radius: 50%;
  position: absolute; top: 3px; left: 3px; transition: 0.3s;
}
.custom-toggle.active .toggle-handle { left: 29px; }
.toggle-text {
  font-size: 9px; font-weight: 800; color: var(--bg-surface);
  position: absolute; top: 6px; right: 8px;
}
.custom-toggle.active .toggle-text { left: 8px; right: auto; }
/*
.custom-toggle.sm { width: 42px; height: 20px; }
.custom-toggle.sm .toggle-handle { width: 14px; height: 14px; }
.custom-toggle.sm.active .toggle-handle { left: 25px; }
 */

/* 권한 배지 */
.auth-badge {
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;
}
.auth-badge.master { background: rgba(239, 68, 68, 0.1); color: var(--danger); }
.auth-badge.all { background: var(--primary-soft); color: var(--primary); }

/* 하단 정보 박스 */
.info-box-container {
  display: flex; gap: 14px; padding: 20px;
  background: var(--primary-soft); border-radius: 12px;
  border: 1px solid var(--border-color); margin-top: 20px;
}
.info-box-container i { font-size: 24px; color: var(--primary); }
.info-content strong { color: var(--text-main); font-size: 14px; margin-bottom: 6px; display: block; }
.info-content ul { padding-left: 20px; margin: 0; color: var(--text-sub); font-size: 13px; line-height: 1.6; }

/* 공통 유틸리티 */
.action-buttons { display: flex; gap: 4px; justify-content: center; }
.pl-8 { padding-left: 32px !important; }
.text-gray { color: var(--text-sub); }
</style>
