<script setup>
import { ref, computed, onMounted, reactive } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";

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
const newCodePrice = ref('');

const newCodeNumber = computed(() => {
  const list = currentCodeList.value;
  if (!list || list.length === 0) {
    return selectedSubGroupKey.value ? `${selectedSubGroupKey.value}001` : '';
  }
  const lastCode = list.reduce((max, code) => {
    const currentNum = parseInt(code.itemCd, 10);
    return currentNum > max ? currentNum : max;
  }, 0);
  const nextNum = lastCode + 1;
  const codeLength = list[0].itemCd.length;
  return String(nextNum).padStart(codeLength, '0');
});

// ==========================================
// 2. 데이터 변환 로직
// ==========================================
const transformCodeData = (rows) => {
  const result = {};
  rows.forEach(row => {
    const { groupCode, groupName, subCode, subName, detailCode, detailName, price, useFl } = row;

    if (!result[groupCode]) {
      result[groupCode] = {
        name: groupName,
        subGroups: [],
        codes: []
      };
    }
    const currentGroup = result[groupCode];

    const createCodeObj = (id, name, dbPrice, dbUseFl) => ({
      id: id,
      itemCd: id,
      name: name,
      price: dbPrice || 0,
      useFl: dbUseFl,
      isEditing: false
    });

    if (detailCode) {
      let subGroup = currentGroup.subGroups.find(sg => sg.id === subCode);
      if (!subGroup) {
        subGroup = { id: subCode, subName: subName, codes: [] };
        currentGroup.subGroups.push(subGroup);
      }
      subGroup.codes.push(createCodeObj(detailCode, detailName, price, useFl));
    } else if (subCode) {
      currentGroup.codes.push(createCodeObj(subCode, subName, price, useFl));
    }
  });
  return result;
};

const getCode = async () => {
  try {
    const res = await axios.get(`/api/v1/code/${cIdx}`);
    if (!res.data.data.length > 0) return;

    // 청소용품(03) 및 기타(05) 필터링
    const result = res.data.data.filter(item => item.groupCode == '03' || item.groupCode == '05');
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
  return (group && group.subGroups.length > 0) ? group.subGroups.map(sub => ({ key: sub.id, name: sub.subName })) : [];
});

const currentCodeList = computed(() => {
  const group = allCodeData.value[selectedGroupKey.value];
  if (!group) return [];

  let list = group.subGroups.length > 0
      ? (group.subGroups.find(s => s.id === selectedSubGroupKey.value)?.codes || [])
      : group.codes;

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(q) || c.itemCd.toLowerCase().includes(q));
  }
  return list;
});

// ==========================================
// 5. 이벤트 핸들러
// ==========================================
const handleMainGroupChange = () => {
  const group = allCodeData.value[selectedGroupKey.value];
  selectedSubGroupKey.value = (group && group.subGroups.length > 0) ? group.subGroups[0].id : '';
};

const startEdit = (code) => { code.isEditing = true; };
const cancelEdit = (code) => { code.isEditing = false; };

const saveCode = async (code) => {
  const params = {
    itemCd: code.itemCd,
    itemNm: code.name,
    useFl: code.useFl,
    option: code.price,
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

const deleteCode = async (id) => {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    await axios.delete(`/api/v1/code/item/${id}`);
    await getCode();
  } catch (err) {
    console.error("삭제 실패", err);
  }
};

const addCode = async () => {
  if (!newCodeName.value || !newCodeNumber.value) return alert('항목 정보를 입력해주세요.');

  const params = {
    groupCd: selectedSubGroupKey.value || selectedGroupKey.value,
    itemCd: newCodeNumber.value,
    itemNm: newCodeName.value,
    price: newCodePrice.value,
    useFl: 'Y'
  };

  try {
    await axios.post(`/api/v1/code/item/${cIdx}`, params);
    await getCode();
    newCodeName.value = ''; newCodeNumber.value = ''; newCodePrice.value = '';
  } catch (err) {
    console.error(err);
  }
};
</script>

<template>
  <div class="price-settings-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-cash-register"></i>
          품목 단가 관리
        </h1>
        <p class="page-subtitle">청소 용품 및 소모품의 표준 단가를 관리합니다</p>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-folder-outline"></i>대분류</label>
          <select v-model="selectedGroupKey" @change="handleMainGroupChange" class="filter-select">
            <option v-for="group in mainGroupOptions" :key="group.key" :value="group.key">{{ group.name }}</option>
          </select>
        </div>

        <div class="filter-group" v-if="subGroupOptions.length > 0">
          <label class="filter-label"><i class="mdi mdi-folder-open-outline"></i>상세그룹</label>
          <select v-model="selectedSubGroupKey" class="filter-select">
            <option v-for="sub in subGroupOptions" :key="sub.key" :value="sub.key">{{ sub.name }}</option>
          </select>
        </div>

        <!--div class="filter-spacer"></div-->

        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input type="text" v-model="searchQuery" placeholder="코드 또는 품목명 검색..." class="search-input" />
            <button v-if="searchQuery" @click="searchQuery = ''" class="search-clear"><i class="mdi mdi-close"></i></button>
          </div>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 70px;"><div class="th-content justify-center"><i class="mdi mdi-pound"></i><span>No.</span></div></th>
            <th style="width: 160px;"><div class="th-content"><i class="mdi mdi-barcode"></i><span>코드 번호</span></div></th>
            <th><div class="th-content"><i class="mdi mdi-tag-outline"></i><span>품목명</span></div></th>
            <th style="width: 140px;"><div class="th-content"><i class="mdi mdi-check-circle-outline"></i><span>상태</span></div></th>
            <th style="width: 180px;"><div class="th-content justify-end"><i class="mdi mdi-currency-usd"></i><span>단가(원)</span></div></th>
            <th class="text-center" style="width: 180px;"><div class="th-content justify-center"><i class="mdi mdi-cog-outline"></i><span>관리</span></div></th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(code, index) in currentCodeList" :key="code.id" class="data-row">
            <td class="text-center"><span class="row-number">{{ index + 1 }}</span></td>
            <td><span class="code-number">{{ code.itemCd }}</span></td>
            <td>
              <input v-if="code.isEditing" type="text" v-model="code.name" class="input-edit" />
              <span v-else class="code-name">{{ code.name }}</span>
            </td>
            <td>
              <select v-if="code.isEditing" v-model="code.useFl" class="status-select">
                <option value="Y">사용</option>
                <option value="N">사용안함</option>
              </select>
              <span v-else :class="['status-badge', code.useFl === 'Y' ? 'status-active' : 'status-inactive']">
                  <i :class="['mdi', code.useFl === 'Y' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline']"></i>
                  {{ code.useFl === 'Y' ? '사용' : '사용안함' }}
                </span>
            </td>
            <td class="text-right">
              <input v-if="code.isEditing" type="number" v-model="code.price" class="input-edit text-right" />
              <span v-else class="price-value">{{ formatCurrency(code.price) }}</span>
            </td>
            <td class="text-center">
              <div class="action-buttons">
                <template v-if="code.isEditing">
                  <button @click="saveCode(code)" class="btn-action btn-save">
                    <i class="mdi mdi-content-save-outline"></i> 저장
                  </button>
                  <button @click="cancelEdit(code)" class="btn-action btn-cancel">
                    <i class="mdi mdi-close"></i> 취소
                  </button>
                </template>
                <template v-else>
                  <button @click="startEdit(code)" class="btn-action btn-edit">
                    <i class="mdi mdi-pencil-outline"></i> 수정
                  </button>
                  <button @click="deleteCode(code.id)" class="btn-action btn-delete">
                    <i class="mdi mdi-trash-can-outline"></i> 삭제
                  </button>
                </template>
              </div>
            </td>
          </tr>

          <tr v-if="currentCodeList.length === 0" class="empty-row">
            <td colspan="6">
              <div class="empty-state">
                <i class="mdi mdi-text-box-search-outline"></i>
                <p>등록된 품목이 없습니다.</p>
              </div>
            </td>
          </tr>

          <tr class="add-row">
            <td class="text-center"><div class="add-icon"><i class="mdi mdi-plus-circle-outline"></i></div></td>
            <td>
              <input
                  type="text"
                  v-model="newCodeNumber"
                  disabled
                  placeholder="코드번호"
                  class="input-add disabled"
              />
            </td>
            <td><input type="text" v-model="newCodeName" placeholder="신규 품목명 입력" class="input-add" /></td>
            <td><span class="status-badge status-new">신규</span></td>
            <td><input type="number" v-model="newCodePrice" placeholder="단가 입력" class="input-add text-right" @keyup.enter="addCode"/></td>
            <td class="text-center bg-add-row">
              <button @click="addCode" class="btn-add-submit"><i class="mdi mdi-plus"></i> 추가하기</button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-box">
      <i class="mdi mdi-information-outline"></i>
      <div class="info-content">
        <strong>단가 관리 가이드</strong>
        <ul>
          <li>등록된 단가는 현장의 용품 신청 및 정산 시 기초 데이터로 활용됩니다.</li>
          <li>단가 변경 시 기존에 신청 완료된 내역에는 소급 적용되지 않습니다.</li>
          <li>품목 중지 시 더 이상 현장에서 해당 물품을 신청할 수 없습니다.</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* =========================================
   페이지 고유 스타일 (공통 CSS 이외)
========================================= */
.filter-spacer { flex: 1; }

.table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-wrapper::-webkit-scrollbar { height: 8px; }
.table-wrapper::-webkit-scrollbar-track { background: var(--bg-hover); border-radius: 4px; }
.table-wrapper::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-wrapper::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* 데이터 테이블 세부 헤더 아이콘 정렬 */
.th-content { display: flex; align-items: center; gap: 6px; }
.th-content i { font-size: 14px; opacity: 0.8; }

/* 행 번호 및 텍스트표시 (테마 변수 적용) */
.row-number {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; background: var(--bg-hover); border-radius: 6px;
  font-weight: 600; color: var(--text-sub); font-size: 12px;
}

.code-number {
  font-weight: 600; color: var(--primary); background: var(--primary-soft);
  padding: 4px 10px; border-radius: 6px; font-size: 12px;
}
.code-name { font-weight: 500; color: var(--text-main); }
.price-value { font-weight: 700; color: var(--text-main); font-size: 14px; }

/* 상태 배지 */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
  border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: var(--bg-hover); color: var(--text-sub); }
.status-new { background-color: var(--primary-soft); color: var(--primary); }
.status-badge i { font-size: 13px; }

/* 입력창 (포커스 개선) */
.input-edit, .input-add, .status-select {
  width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 13px; color: var(--text-main); transition: all 0.2s; background: var(--bg-surface); box-sizing: border-box;
}
.input-edit:focus, .input-add:focus, .status-select:focus {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft);
}
.input-add.disabled { background-color: var(--bg-canvas); color: var(--text-muted); cursor: not-allowed; border-color: transparent; }

/* 액션 버튼 (테이블 내부) */
.action-buttons { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;}
.btn-action {
  display: flex; align-items: center; gap: 4px; padding: 6px 10px; border: none;
  border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}

.btn-edit { background-color: var(--primary-soft); color: var(--primary); }
.btn-edit:hover { background-color: rgba(59, 130, 246, 0.15); filter: brightness(0.95); }

.btn-save { background-color: var(--success); color: var(--text-inverse); height: 100%;}
.btn-save:hover { background-color: var(--success-hover); transform: translateY(-1px); }

.btn-cancel { background-color: var(--bg-hover); color: var(--text-sub); }
.btn-cancel:hover { background-color: var(--border-color); color: var(--text-main); }

.btn-delete { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }
.btn-delete:hover { filter: brightness(0.9); }

/* 신규 추가 행 */
.add-row { background-color: rgba(16, 185, 129, 0.03); border-top: 1px solid var(--border-color); }
.add-row:hover { background-color: rgba(16, 185, 129, 0.06); }
.add-icon { display: flex; align-items: center; justify-content: center; }
.add-icon i { font-size: 22px; color: var(--success); }

.bg-add-row { background-color: transparent !important; }
.btn-add-submit {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 14px; background-color: var(--success); border: none; border-radius: 6px;
  color: var(--text-inverse); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; width: 100%;
}
.btn-add-submit:hover { background-color: var(--success-hover); transform: translateY(-1px); }

/* Sticky 컬럼 영역 (필요 시) */
.sticky-col { position: sticky; right: 0; box-shadow: -4px 0 8px rgba(0,0,0,0.03); background: var(--bg-surface); z-index: 5;}
.data-table thead .sticky-col { background-color: var(--bg-canvas); z-index: 15; box-shadow: none; border-left: 1px solid var(--border-color); }
.data-row:hover .sticky-col { background-color: var(--primary-soft); }

/* === 하단 안내 박스 === */
.info-box {
  display: flex; gap: 14px; padding: 20px 24px; background-color: var(--primary-soft);
  border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; margin-top: 24px; color: var(--primary);
}
.info-box i { font-size: 24px; color: var(--primary); flex-shrink: 0; margin-top: 2px;}
.info-content strong { display: block; font-size: 14px; font-weight: 700; margin-bottom: 8px; color: var(--primary); }
.info-content ul { padding-left: 20px; margin: 0; }
.info-content li { font-size: 13px; line-height: 1.6; font-weight: 500; color: var(--text-main);}
</style>
