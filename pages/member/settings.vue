<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";

// ==========================================
// 1. 상태 관리 (State)
// ==========================================
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const allCodeData = ref({});
const selectedGroupKey = ref('');
const selectedSubGroupKey = ref('');
const searchQuery = ref('');

// 입력 폼 상태
const newCodeName = ref('');
const newCodeOption = ref('');
const newCodeSort = ref(0); // 신규 순서 상태 추가

const newCodeNumber = computed(() => {
  const list = currentCodeList.value;
  if (!list || list.length === 0) {
    return selectedSubGroupKey.value ? `${selectedSubGroupKey.value}001` : '';
  }
  const lastCode = list.reduce((max, code) => {
    const currentNum = parseInt(code.codeNumber, 10);
    return currentNum > max ? currentNum : max;
  }, 0);
  const nextNum = lastCode + 1;
  const codeLength = list[0].codeNumber.length;
  return String(nextNum).padStart(codeLength, '0');
});

const transformCodeData = (rows) => {
  const result = {};
  rows.forEach(row => {
    const {
      groupCode, groupName,
      subCode, subName,
      detailCode, detailName,
      useFl, editFl, deleteFl,
      option, sort // DB에서 sort 가져오기
    } = row;

    if (!result[groupCode]) {
      result[groupCode] = {
        name: groupName,
        subGroups: [],
        codes: []
      };
    }
    const currentGroup = result[groupCode];

    const createCodeObj = (id, name, dbUseFl, dbSort) => ({
      id: id,
      codeNumber: id,
      name: name,
      useFl: dbUseFl,
      sort: dbSort || 0, // 객체에 sort 연결
      isEditing: false,
      editFl: editFl,
      deleteFl: deleteFl,
      option: option,
    });

    if (detailCode) {
      let subGroup = currentGroup.subGroups.find(sg => sg.id === subCode);
      if (!subGroup) {
        subGroup = { id: subCode, subName: subName, codes: [] };
        currentGroup.subGroups.push(subGroup);
      }
      subGroup.codes.push(createCodeObj(detailCode, detailName, useFl, sort));
    } else if (subCode) {
      currentGroup.codes.push(createCodeObj(subCode, subName, useFl, sort));
    }
  });
  return result;
};

const getCode = async () => {
  try {
    const res = await axios.get(`/api/v1/code/${cIdx}`);
    if(!res.data.data.length > 0) return console.error("코드를 가져오지 못 했습니다.");
    const result = res.data.data.filter(item =>
        item.groupCode == '01' ||
        item.groupCode == '02'
    );
    allCodeData.value = transformCodeData(result);
    const firstKey = Object.keys(allCodeData.value)[0];
    if (firstKey) {
      selectedGroupKey.value = firstKey;
      handleMainGroupChange();
    }
  } catch (err) {
    console.error("데이터 로드 실패", err);
  }
};

onMounted(() => {
  getCode();
});

// ==========================================
// 4. Computed Properties
// ==========================================
const mainGroupOptions = computed(() => {
  return Object.keys(allCodeData.value).map(key => ({
    key: key,
    name: allCodeData.value[key].name,
    hasSub: allCodeData.value[key].subGroups.length > 0
  }));
});

const subGroupOptions = computed(() => {
  const group = allCodeData.value[selectedGroupKey.value];
  if (group && group.subGroups.length > 0) {
    return group.subGroups.map(sub => ({
      key: sub.id,
      name: sub.subName
    }));
  }
  return [];
});

const currentCodeList = computed(() => {
  const group = allCodeData.value[selectedGroupKey.value];
  if (!group) return [];
  let codeList = [];
  if (group.subGroups.length > 0) {
    const sub = group.subGroups.find(s => s.id === selectedSubGroupKey.value);
    codeList = sub ? sub.codes : [];
  } else {
    codeList = group.codes;
  }

  // 정렬 순서대로 데이터 정렬
  codeList.sort((a, b) => a.sort - b.sort);

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    return codeList.filter(code =>
        code.name.toLowerCase().includes(query) ||
        code.codeNumber.toLowerCase().includes(query)
    );
  }
  return codeList;
});

const currentGroupInfo = computed(() => {
  const group = allCodeData.value[selectedGroupKey.value];
  if (!group) return null;
  let groupName = group.name;
  if (group.subGroups.length > 0) {
    const sub = group.subGroups.find(s => s.id === selectedSubGroupKey.value);
    if (sub) groupName += ` > ${sub.subName}`;
  }
  return {
    name: groupName,
    count: currentCodeList.value.length
  };
});

// ==========================================
// 5. 이벤트 핸들러
// ==========================================
const handleMainGroupChange = () => {
  const group = allCodeData.value[selectedGroupKey.value];
  if (group && group.subGroups.length > 0) {
    selectedSubGroupKey.value = group.subGroups[0].id;
  } else {
    selectedSubGroupKey.value = '';
  }
  searchQuery.value = '';
};

const startEdit = (code) => {
  if (!code.editFl) {
    alert('수정 권한이 없는 항목입니다.');
    return;
  }
  code.isEditing = true;
};

const cancelEdit = (code) => {
  code.isEditing = false;
};

const saveCode = async (code) => {
  const params = {
    itemCd: code.itemCd,
    itemNm: code.name,
    useFl: code.useFl,
    option: code.option,
    sort: code.sort // 정렬 순서 파라미터 추가
  };

  try {
    await axios.put(`/api/v1/code/${code.id}`, params);
    alert('수정되었습니다.');
    code.isEditing = false;
    await getCode(); // 데이터 새로고침
  } catch (err) {
    console.error("수정 실패", err);
  }
};

const deleteCode = async (itemCd) => {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    await axios.delete(`/api/v1/code/${itemCd}`);
    alert('삭제되었습니다.');
    await getCode();
  } catch (err) {
    console.error("삭제 실패", err);
  }
};

const addCode = async () => {
  if (!newCodeName.value) {
    alert('항목명을 입력해주세요.');
    return;
  }
  const generatedNumber = newCodeNumber.value;
  let params = {
    groupCd: selectedSubGroupKey.value,
    itemCd: generatedNumber,
    itemNm: newCodeName.value,
    option: newCodeOption.value,
    sort: newCodeSort.value, // 입력한 순서 전송
    useFl: 'Y'
  };
  try {
    await axios.post(`/api/v1/code/${cIdx}`, params);
    await getCode();
    newCodeName.value = '';
    newCodeOption.value = '';
    newCodeSort.value = 0;
  } catch (err) {
    console.error("추가 실패", err);
  }
};

const refreshData = () => {
  getCode();
};
</script>

<template>
  <div class="code-settings-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-account-cog"></i>
          인사 코드 관리
        </h1>
        <p class="page-subtitle">직원 구분, 직책, 직급 등 인사 관련 코드를 관리합니다</p>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-folder-outline"></i>
            대분류
          </label>
          <select
              v-model="selectedGroupKey"
              @change="handleMainGroupChange"
              class="filter-select"
          >
            <option v-for="group in mainGroupOptions" :key="group.key" :value="group.key">
              {{ group.name }}
            </option>
          </select>
        </div>

        <div class="filter-group" v-if="subGroupOptions.length > 0">
          <label class="filter-label">
            <i class="mdi mdi-folder-open-outline"></i>
            상세그룹
          </label>
          <select
              v-model="selectedSubGroupKey"
              class="filter-select"
          >
            <option v-for="subGroup in subGroupOptions" :key="subGroup.key" :value="subGroup.key">
              {{ subGroup.name }}
            </option>
          </select>
        </div>

        <!--div class="filter-spacer"></div-->

        <div class="search-box">
          <i class="mdi mdi-magnify"></i>
          <input
              type="text"
              v-model="searchQuery"
              placeholder="코드번호 또는 항목명 검색..."
              class="search-input"
          />
          <button v-if="searchQuery" @click="searchQuery = ''" class="search-clear">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
      </div>

    </div>

    <div class="table-card">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 70px;">
              <div class="th-content">
                <i class="mdi mdi-pound"></i>
                <span>No.</span>
              </div>
            </th>
            <th style="width: 140px;">
              <div class="th-content">
                <i class="mdi mdi-barcode"></i>
                <span>코드 번호</span>
              </div>
            </th>
            <th>
              <div class="th-content">
                <i class="mdi mdi-tag-outline"></i>
                <span>항목명</span>
              </div>
            </th>
            <th style="width: 100px;">
              <div class="th-content">
                <i class="mdi mdi-sort-variant"></i>
                <span>순서</span>
              </div>
            </th>
            <th v-if="selectedSubGroupKey == '02002'" style="width: 150px;">
              <div class="th-content">
                <i class="mdi mdi-palette"></i>
                <span>색상</span>
              </div>
            </th>
            <th style="width: 140px;">
              <div class="th-content">
                <i class="mdi mdi-check-circle-outline"></i>
                <span>사용 여부</span>
              </div>
            </th>
            <th class="text-center" style="width: 180px;">
              <div class="th-content">
                <i class="mdi mdi-cog"></i>
                <span>관리</span>
              </div>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(code, index) in currentCodeList" :key="code.id" class="data-row">
            <td class="text-center">
              <span class="row-number">{{ index + 1 }}</span>
            </td>

            <td>
              <span class="code-number">{{ code.codeNumber }}</span>
            </td>

            <td>
              <template v-if="code.isEditing">
                <input
                    type="text"
                    v-model="code.name"
                    class="input-edit"
                    placeholder="항목명"
                />
              </template>
              <template v-else>
                <span class="code-name">{{ code.name }}</span>
              </template>
            </td>

            <td>
              <template v-if="code.isEditing">
                <input
                    type="number"
                    v-model.number="code.sort"
                    class="input-edit text-center"
                    min="0"
                />
              </template>
              <template v-else>
                <span class="sort-number">{{ code.sort }}</span>
              </template>
            </td>

            <td v-if="selectedSubGroupKey == '02002'">
              <template v-if="code.isEditing">
                <div class="color-edit-wrapper">
                  <input
                      type="color"
                      v-model="code.option"
                      class="color-picker"
                  />
                  <input
                      type="text"
                      v-model="code.option"
                      class="color-text-input"
                      placeholder="#000000"
                      maxlength="7"
                  />
                </div>
              </template>
              <template v-else>
                <div class="color-display">
                    <span
                        class="color-swatch"
                        :style="{ backgroundColor: code.option || '#cccccc' }"
                    ></span>
                  <span class="color-code">{{ code.option || '미지정' }}</span>
                </div>
              </template>
            </td>

            <td>
              <template v-if="code.isEditing">
                <select v-model="code.useFl" class="status-select">
                  <option value="Y">사용</option>
                  <option value="N">사용안함</option>
                </select>
              </template>
              <template v-else>
                  <span :class="['status-badge', code.useFl === 'Y' ? 'status-active' : 'status-inactive']">
                    <i :class="['mdi', code.useFl === 'Y' ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
                    {{ code.useFl === 'Y' ? '사용' : '사용안함' }}
                  </span>
              </template>
            </td>

            <td class="text-center">
              <div class="action-buttons">
                <template v-if="code.isEditing">
                  <button @click="saveCode(code)" class="btn-action btn-save">
                    <i class="mdi mdi-content-save"></i>
                    <span>저장</span>
                  </button>
                  <button @click="cancelEdit(code)" class="btn-action btn-cancel">
                    <i class="mdi mdi-close"></i>
                    <span>취소</span>
                  </button>
                </template>
                <template v-else>
                  <button
                      @click="startEdit(code)"
                      class="btn-action btn-edit"
                      :disabled="!code.editFl"
                  >
                    <i class="mdi mdi-pencil"></i>
                    <span>수정</span>
                  </button>
                  <button
                      @click="deleteCode(code.id)"
                      class="btn-action btn-delete"
                      :disabled="code.deleteFl == 'N'"
                  >
                    <i class="mdi mdi-delete"></i>
                    <span>삭제</span>
                  </button>
                </template>
              </div>
            </td>
          </tr>

          <tr v-if="currentCodeList.length === 0" class="empty-row">
            <td :colspan="selectedSubGroupKey == '02002' ? 7 : 6">
              <div class="empty-state">
                <i class="mdi mdi-folder-open-outline"></i>
                <p>등록된 코드가 없습니다</p>
                <span>아래 입력란에서 새로운 코드를 추가해주세요</span>
              </div>
            </td>
          </tr>

          <tr class="add-row">
            <td class="text-center">
              <div class="add-icon">
                <i class="mdi mdi-plus-circle"></i>
              </div>
            </td>
            <td>
              <input
                  type="text"
                  v-model="newCodeNumber"
                  disabled
                  placeholder="자동생성"
                  class="input-add disabled"
              />
            </td>
            <td>
              <input
                  type="text"
                  v-model="newCodeName"
                  placeholder="항목명 입력"
                  class="input-add"
                  @keyup.enter="addCode"
              />
            </td>
            <td>
              <input
                  type="number"
                  v-model.number="newCodeSort"
                  placeholder="순서"
                  class="input-add text-center"
                  min="0"
              />
            </td>
            <td v-if="selectedSubGroupKey == '02002'">
              <div class="color-edit-wrapper">
                <input
                    type="color"
                    v-model="newCodeOption"
                    class="color-picker"
                />
                <input
                    type="text"
                    v-model="newCodeOption"
                    class="color-text-input"
                    placeholder="#000000"
                    maxlength="7"
                />
              </div>
            </td>
            <td>
                <span class="status-badge status-new">
                  신규
                </span>
            </td>
            <td class="text-center">
              <button @click="addCode" class="btn-add-submit">
                <i class="mdi mdi-plus"></i>
                <span>추가하기</span>
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-box">
      <i class="mdi mdi-information"></i>
      <div class="info-content">
        <strong>인사 코드 관리 안내</strong>
        <ul>
          <li>코드 번호는 자동으로 생성되며, <b>중복될 수 없습니다.</b></li>
          <li>순서를 통해 목록에 표시되는 순서를 조정할 수 있습니다 (낮은 숫자가 먼저 표시).</li>
          <li>현장 구분 코드의 색상은 현장 관리 화면에서 시각적 구분에 사용됩니다.</li>
          <li>수정/삭제 권한이 없는 항목은 버튼이 비활성화됩니다.</li>
          <li>코드 수정 후에는 반드시 '저장' 버튼을 클릭해야 변경사항이 저장됩니다.</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* =========================================
   페이지 고유 스타일 (공통 CSS 이외)
========================================= */
.filter-spacer { flex: 1; } /* 필터 간격 띄우기용 */

/* === 선택 정보 뱃지 === */
.selection-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.info-badge, .count-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.info-badge { background: var(--primary-soft); color: var(--primary); }
.count-badge { background: rgba(16, 185, 129, 0.1); color: var(--success); }
.info-badge i, .count-badge i { font-size: 16px; }

/* === 테이블 스크롤 및 공통 래퍼 === */
.table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.table-wrapper::-webkit-scrollbar { height: 8px; }
.table-wrapper::-webkit-scrollbar-track { background: var(--bg-hover); border-radius: 4px; }
.table-wrapper::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-wrapper::-webkit-scrollbar-thumb:hover { background: var(--text-sub); }

.th-content { display: flex; align-items: center; gap: 6px; }
.th-content i { font-size: 14px; opacity: 0.8; }

/* === 테이블 내부 커스텀 셀 === */
.row-number {
  display: inline-flex; justify-content: center; align-items: center;
  width: 28px; height: 28px;
  background: var(--bg-hover); border-radius: 6px;
  font-weight: 600; color: var(--text-sub); font-size: 12px;
}

.code-number {
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 4px 10px; border-radius: 6px; font-size: 12px;
}

.code-name { font-weight: 500; color: var(--text-main); }
.sort-number { color: var(--text-main); }

/* === 색상 표시/편집 === */
.color-display { display: flex; align-items: center; gap: 8px; }
.color-swatch {
  width: 28px; height: 28px; border-radius: 6px;
  border: 1px solid var(--border-color); display: inline-block;
}
.color-code { font-size: 12px; color: var(--text-sub); }

.color-edit-wrapper { display: flex; align-items: center; gap: 6px; }
.color-picker {
  width: 36px; height: 36px; padding: 2px;
  border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer;
  background: var(--bg-surface);
}
.color-text-input {
  width: 80px; padding: 6px 10px; border: 1px solid var(--border-color);
  border-radius: 6px; font-size: 12px; text-transform: uppercase;
  color: var(--text-main); background: var(--bg-surface);
}
.color-text-input:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--primary-soft); }

/* === 상태 배지 === */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: var(--bg-hover); color: var(--text-sub); }
.status-new { background-color: var(--primary-soft); color: var(--primary); }
.status-badge i { font-size: 13px; }

/* === 입력 폼 (수정/추가) === */
/*
.input-edit, .input-add {
  width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 13px; color: var(--text-main); transition: all 0.2s; box-sizing: border-box;
}
.input-edit:focus, .input-add:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--primary-soft); }

.input-edit { background: var(--bg-surface); }
.input-add { background: var(--bg-surface); }
.input-add.disabled { background: var(--bg-canvas); color: var(--text-muted); cursor: not-allowed; border-color: transparent; }

.status-select {
  padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 12px; color: var(--text-main); background: var(--bg-surface); cursor: pointer;
}
.status-select:focus { border-color: var(--primary); outline: none; }
 */

/* === 액션 버튼 (테이블 내부) === */
.action-buttons { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
.btn-action {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px; border: none; border-radius: 6px;
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-action i { font-size: 14px; }

.btn-save {height: 100% }
/*
.btn-cancel { background-color: var(--text-sub); color: var(--text-inverse); }
.btn-cancel:hover { background-color: var(--text-main); }

.btn-edit { background-color: var(--primary); color: var(--text-inverse); }
.btn-edit:hover:not(:disabled) { background-color: var(--primary-hover); }

.btn-delete { background-color: var(--danger); color: var(--text-inverse); }
.btn-delete:hover:not(:disabled) { filter: brightness(0.9); }

 */

/* === 추가 행 === */
.add-row { background-color: rgba(16, 185, 129, 0.03); border-top: 1px solid var(--border-color); }
.add-row:hover { background-color: rgba(16, 185, 129, 0.06) !important; }
.add-icon { display: flex; align-items: center; justify-content: center; }
.add-icon i { font-size: 22px; color: var(--success); }

.btn-add-submit {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 8px 14px; width: 100%;
  background-color: var(--success); border: none; border-radius: 6px;
  color: var(--text-inverse); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-add-submit:hover { background-color: var(--success-hover); transform: translateY(-1px); }
.btn-add-submit i { font-size: 16px; }

/* === 하단 안내 박스 === */
.info-box {
  display: flex; gap: 14px; padding: 20px; margin-top: 24px;
  background: var(--primary-soft);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 12px; color: var(--primary);
}
.info-box i { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
.info-content { flex: 1; }
.info-content strong { display: block; font-size: 14px; margin-bottom: 8px; font-weight: 700; color: var(--primary); }
.info-content ul { margin: 0; padding-left: 20px; }
.info-content li { font-size: 12px; line-height: 1.6; margin-bottom: 4px; color: var(--text-main); }

/* === 반응형 === */
@media (max-width: 768px) {
  .selection-info { flex-direction: column; align-items: stretch; gap: 8px; }
  .color-edit-wrapper { flex-direction: column; align-items: flex-start; }
  .filter-spacer { display: none; }
}
</style>
