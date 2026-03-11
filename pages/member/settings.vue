<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";

// ==========================================
// 1. 상태 관리 (State)
// ==========================================
const allCodeData = ref({});
const selectedGroupKey = ref('');
const selectedSubGroupKey = ref('');
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;
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
      <div class="header-actions">
        <button @click="refreshData" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
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

        <div class="filter-spacer"></div>

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

      <div class="selection-info" v-if="currentGroupInfo">
        <div class="info-badge">
          <i class="mdi mdi-information-outline"></i>
          <span>현재 선택: <strong>{{ currentGroupInfo.name }}</strong></span>
        </div>
        <div class="count-badge">
          <i class="mdi mdi-format-list-numbered"></i>
          <span>총 <strong>{{ currentGroupInfo.count }}</strong>개 항목</span>
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
                  <i class="mdi mdi-new-box"></i>
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
          <li>코드 번호는 자동으로 생성되며, 중복될 수 없습니다.</li>
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
/* === 기본 레이아웃 === */
.code-settings-page {
  padding: 0;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left { flex: 1; }

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 6px 0;
  display: flex;
  align-items: center;
  gap: 10px;
  letter-spacing: -0.5px;
}

.page-title i {
  font-size: 26px;
  color: #4f46e5; /* 플랫 블루/퍼플 */
}

.page-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.header-actions { display: flex; gap: 10px; }

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1e293b;
}

.btn-refresh i { font-size: 18px; }

/* === 필터 패널 === */
.filter-panel {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
  flex: 1;
}

.filter-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.filter-label i { font-size: 16px; color: #4f46e5; }

.filter-select {
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  color: #334155;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  height: 42px;
}

.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.filter-spacer { flex: 1; }

/* 검색 박스 */
.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 320px;
  height: 42px;
  transition: all 0.2s;
}

.search-box:focus-within {
  background: white;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.search-box i { font-size: 20px; color: #94a3b8; }

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #334155;
  outline: none;
}
.search-input::placeholder { color: #94a3b8; }

.search-clear {
  background: none; border: none; color: #94a3b8; cursor: pointer;
  padding: 4px; border-radius: 4px; transition: all 0.2s;
}
.search-clear:hover { background: #e2e8f0; color: #64748b; }

/* 선택 정보 */
.selection-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #f1f5f9;
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

.info-badge { background: #eff6ff; color: #1e40af; }
.count-badge { background: #f0fdf4; color: #166534; }
.info-badge i, .count-badge i { font-size: 16px; }

/* === 테이블 카드 === */
.table-card {
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  overflow: hidden;
  margin-bottom: 24px;
}

.table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.table-wrapper::-webkit-scrollbar { height: 8px; }
.table-wrapper::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
.table-wrapper::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.table-wrapper::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* === 데이터 테이블 === */
.data-table {
  width: 100%;
  min-width: 900px; /* 모바일 대응 가로 스크롤 유도 */
  border-collapse: collapse;
}

/* 테이블 헤더 (그라디언트 제거 -> 단색) */
.data-table thead {
  background-color: #6d28d9;
}

.data-table th {
  padding: 14px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: white;
  white-space: nowrap;
}

.th-content { display: flex; align-items: center; gap: 6px; }
.th-content i { font-size: 14px; opacity: 0.8; }

.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
  color: #334155;
  vertical-align: middle;
}

.data-row { transition: background 0.2s; }
.data-row:hover { background-color: #f8fafc; }

.text-center { text-align: center; }

/* 행 번호 */
.row-number {
  display: inline-flex; justify-content: center; align-items: center;
  width: 28px; height: 28px;
  background: #f1f5f9; border-radius: 6px;
  font-weight: 600; color: #64748b; font-size: 12px;
}

/* 코드 표시 */
.code-number {
  font-family: 'Courier New', monospace; font-weight: 600;
  color: #4f46e5; background: #eff6ff;
  padding: 4px 10px; border-radius: 6px; font-size: 12px;
}

.code-name { font-weight: 500; color: #1e293b; }

/* 색상 표시 */
.color-display { display: flex; align-items: center; gap: 8px; }
.color-swatch {
  width: 28px; height: 28px; border-radius: 6px;
  border: 1px solid #e2e8f0; display: inline-block;
}
.color-code { font-family: 'Courier New', monospace; font-size: 12px; color: #64748b; }

/* 색상 편집 */
.color-edit-wrapper { display: flex; align-items: center; gap: 6px; }
.color-picker {
  width: 36px; height: 36px; padding: 2px;
  border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer;
}
.color-text-input {
  width: 80px; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 12px; font-family: 'Courier New', monospace; text-transform: uppercase;
}
.color-text-input:focus { border-color: #4f46e5; outline: none; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

/* 상태 배지 */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.status-active { background-color: #d1fae5; color: #065f46; }
.status-inactive { background-color: #f1f5f9; color: #475569; }
.status-new { background-color: #eff6ff; color: #1d4ed8; }
.status-badge i { font-size: 13px; }

/* 입력 필드 */
.input-edit, .input-add {
  width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 13px; color: #334155; transition: all 0.2s; box-sizing: border-box;
}
.input-edit:focus, .input-add:focus { border-color: #4f46e5; outline: none; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

.input-add { background: #ffffff; }
.input-add.disabled { background: #f1f5f9; color: #94a3b8; cursor: not-allowed; border-color: transparent; }

.status-select {
  padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 12px; color: #334155; cursor: pointer;
}
.status-select:focus { border-color: #4f46e5; outline: none; }

/* 액션 버튼 */
.action-buttons { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
.btn-action {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px; border: none; border-radius: 6px;
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-action i { font-size: 14px; }

.btn-save { background-color: #10b981; color: white; }
.btn-save:hover:not(:disabled) { background-color: #059669; }

.btn-cancel { background-color: #64748b; color: white; }
.btn-cancel:hover { background-color: #475569; }

.btn-edit { background-color: #4f46e5; color: white; }
.btn-edit:hover:not(:disabled) { background-color: #4338ca; }

.btn-delete { background-color: #ef4444; color: white; }
.btn-delete:hover:not(:disabled) { background-color: #dc2626; }

/* 추가 행 (그라디언트 제외) */
.add-row { background-color: #f0fdf4; border-top: 1px solid #bbf7d0; }
.add-row:hover { background-color: #dcfce7; }
.add-icon { display: flex; align-items: center; justify-content: center; }
.add-icon i { font-size: 22px; color: #10b981; }

.btn-add-submit {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 8px 14px; width: 100%;
  background-color: #10b981; border: none; border-radius: 6px;
  color: white; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-add-submit:hover { background-color: #059669; transform: translateY(-1px); }
.btn-add-submit i { font-size: 16px; }

/* 빈 상태 */
.empty-row { background: white; }
.empty-state { text-align: center; padding: 50px 20px; color: #94a3b8; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: #cbd5e1; }
.empty-state p { font-size: 15px; font-weight: 600; color: #475569; margin: 0 0 6px 0; }
.empty-state span { font-size: 13px; }

/* === 안내 박스 === */
.info-box {
  display: flex; gap: 14px; padding: 20px;
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; color: #1e40af;
}
.info-box i { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
.info-content { flex: 1; }
.info-content strong { display: block; font-size: 14px; margin-bottom: 8px; font-weight: 700; }
.info-content ul { margin: 0; padding-left: 20px; }
.info-content li { font-size: 12px; line-height: 1.6; margin-bottom: 4px; color: #1e3a8a; }

/* === 반응형 (Responsive) === */
@media (max-width: 1024px) {
  .search-box { flex: 1; min-width: 200px; }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 14px; align-items: flex-start; }
  .header-actions, .btn-refresh { width: 100%; justify-content: center; }

  .filter-row { flex-direction: column; align-items: stretch; gap: 12px; }
  .filter-group, .search-box { width: 100%; min-width: 100%; }
  .filter-spacer { display: none; }

  .selection-info { flex-direction: column; align-items: stretch; gap: 8px; }

  .color-edit-wrapper { flex-direction: column; align-items: flex-start; }
}
</style>
