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
const newCodeNumber = ref('');
const newCodePrice = ref('');

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

const formatPrice = (val) => Number(val).toLocaleString();
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
      <div class="header-actions">
        <button @click="getCode" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
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

        <div class="filter-spacer"></div>

        <div class="search-box">
          <i class="mdi mdi-magnify"></i>
          <input type="text" v-model="searchQuery" placeholder="코드 또는 품목명 검색..." class="search-input" />
          <button v-if="searchQuery" @click="searchQuery = ''" class="search-clear"><i class="mdi mdi-close"></i></button>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 70px;"><div class="th-content"><i class="mdi mdi-pound"></i><span>No.</span></div></th>
            <th style="width: 160px;"><div class="th-content"><i class="mdi mdi-barcode"></i><span>코드 번호</span></div></th>
            <th><div class="th-content"><i class="mdi mdi-tag-outline"></i><span>품목명</span></div></th>
            <th style="width: 140px;"><div class="th-content"><i class="mdi mdi-check-circle-outline"></i><span>상태</span></div></th>
            <th style="width: 180px;"><div class="th-content"><i class="mdi mdi-currency-usd"></i><span>단가(원)</span></div></th>
            <th class="text-center" style="width: 180px;"><div class="th-content"><i class="mdi mdi-cog"></i><span>관리</span></div></th>
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
                  <i :class="['mdi', code.useFl === 'Y' ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
                  {{ code.useFl === 'Y' ? '사용' : '사용안함' }}
                </span>
            </td>
            <td class="text-right">
              <input v-if="code.isEditing" type="number" v-model="code.price" class="input-edit text-right" />
              <span v-else class="price-value">{{ formatPrice(code.price) }}</span>
            </td>
            <td class="text-center">
              <div class="action-buttons">
                <template v-if="code.isEditing">
                  <button @click="saveCode(code)" class="btn-action btn-save"><i class="mdi mdi-content-save"></i>저장</button>
                  <button @click="cancelEdit(code)" class="btn-action btn-cancel"><i class="mdi mdi-close"></i>취소</button>
                </template>
                <template v-else>
                  <button @click="startEdit(code)" class="btn-action btn-edit"><i class="mdi mdi-pencil"></i>수정</button>
                  <button @click="deleteCode(code.id)" class="btn-action btn-delete"><i class="mdi mdi-delete"></i>삭제</button>
                </template>
              </div>
            </td>
          </tr>

          <tr class="add-row">
            <td class="text-center"><div class="add-icon"><i class="mdi mdi-plus-circle"></i></div></td>
            <td><input type="text" v-model="newCodeNumber" placeholder="코드번호" class="input-add" /></td>
            <td><input type="text" v-model="newCodeName" placeholder="신규 품목명 입력" class="input-add" /></td>
            <td><span class="status-badge status-new"><i class="mdi mdi-new-box"></i>신규</span></td>
            <td><input type="number" v-model="newCodePrice" placeholder="단가 입력" class="input-add text-right" @keyup.enter="addCode"/></td>
            <td class="text-center"><button @click="addCode" class="btn-add-submit"><i class="mdi mdi-plus"></i>추가</button></td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-box">
      <i class="mdi mdi-information"></i>
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
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 레이아웃 및 헤더 === */
.price-settings-page { padding: 0; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}
.header-left {
  flex: 1;
}
.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title i {
  font-size: 32px;
  color: #667eea;
}

.page-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #334155;
}

.btn-refresh i {
  font-size: 18px;
}

/* === 필터 패널 === */
.filter-panel {
  background: white;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
}

.filter-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.filter-label i {
  font-size: 16px;
  color: #667eea;
}

.filter-select {
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  color: #334155;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-select:hover {
  border-color: #cbd5e1;
}

.filter-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.filter-spacer {
  flex: 1;
}

/* 검색 박스 */
.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  min-width: 320px;
  transition: all 0.2s;
}

.search-box:focus-within {
  background: white;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-box i {
  font-size: 20px;
  color: #94a3b8;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #334155;
  outline: none;
}

.search-input::placeholder {
  color: #94a3b8;
}

.search-clear {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.search-clear:hover {
  background: #e2e8f0;
  color: #64748b;
}

/* === 테이블 === */
.table-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  margin-bottom: 24px;
}

.table-wrapper {
  overflow-x: auto;
}

/* === 데이터 테이블 === */
.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.data-table th {
  padding: 16px 20px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.th-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.th-content i {
  font-size: 16px;
  opacity: 0.9;
}

.data-table td {
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
  color: #334155;
  vertical-align: middle;
}

.data-row {
  transition: background 0.2s;
}

.data-row:hover {
  background: #f8fafc;
}

.text-center {
  text-align: center;
}

.row-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #f1f5f9;
  border-radius: 8px;
  font-weight: 600;
  color: #64748b;
}
.code-number {
  font-family: 'Courier New', monospace;
  font-weight: 600;
  color: #667eea;
  background: #eff6ff;
  padding: 6px 12px;
  border-radius: 6px;
  display: inline-block;
}
.code-name { font-weight: 500; color: #1e293b; }

/* 상태 배지 */
m.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.status-active { background: #d1fae5; color: #065f46; }
.status-inactive { background: #fee2e2; color: #991b1b; }
.status-new { background: #dbeafe; color: #1e40af; }

/* 입력창 */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.status-active {
  background: #d1fae5;
  color: #065f46;
}

.status-inactive {
  background: #fee2e2;
  color: #991b1b;
}

.status-new {
  background: #dbeafe;
  color: #1e40af;
}

.status-badge i {
  font-size: 14px;
}

/* 입력 필드 */
.input-edit,
.input-add {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  color: #334155;
  transition: all 0.2s;
}

.input-edit:focus,
.input-add:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.input-add {
  background: #f8fafc;
}

.input-add.disabled {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
}

.status-select {
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
  transition: all 0.2s;
}

.status-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.text-right { text-align: right; }

/* 액션 버튼 */
.action-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.btn-action {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-action i {
  font-size: 16px;
}

.btn-save {
  background: #10b981;
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: #059669;
  transform: translateY(-1px);
}

.btn-cancel {
  background: #6b7280;
  color: white;
}

.btn-cancel:hover {
  background: #4b5563;
}

.btn-edit {
  background: #667eea;
  color: white;
}

.btn-edit:hover:not(:disabled) {
  background: #5568d3;
  transform: translateY(-1px);
}

.btn-delete {
  background: #ef4444;
  color: white;
}

.btn-delete:hover:not(:disabled) {
  background: #dc2626;
  transform: translateY(-1px);
}

/* 추가 행 */
.add-row {
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  border-top: 2px dashed #bbf7d0;
}

.add-row:hover {
  background: linear-gradient(135deg, #dcfce7 0%, #d1fae5 100%);
}

.add-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-icon i {
  font-size: 24px;
  color: #10b981;
}

.btn-add-submit {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.btn-add-submit:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.btn-add-submit i {
  font-size: 18px;
}

/* 빈 상태 */
.empty-row {
  background: #fafafa;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #94a3b8;
}

.empty-state i {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 16px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 8px 0;
}

.empty-state span {
  font-size: 13px;
}

/* === 안내 박스 === */
.info-box {
  display: flex;
  gap: 16px;
  padding: 20px 24px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  color: #1e40af;
}

.info-box i {
  font-size: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

.info-content {
  flex: 1;
}

.info-content strong {
  display: block;
  font-size: 15px;
  margin-bottom: 10px;
}

.info-content ul {
  margin: 0;
  padding-left: 20px;
}

.info-content li {
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 6px;
}

.info-content li:last-child {
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .filter-row {
    flex-wrap: wrap;
  }

  .filter-group {
    min-width: 180px;
  }

  .search-box {
    min-width: 100%;
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
  }

  .btn-refresh {
    flex: 1;
    justify-content: center;
  }

  .filter-row {
    flex-direction: column;
  }

  .filter-group,
  .search-box {
    width: 100%;
    min-width: auto;
  }

  .selection-info {
    flex-direction: column;
    align-items: stretch;
  }

  .action-buttons {
    flex-direction: column;
  }

  .btn-action {
    width: 100%;
    justify-content: center;
  }
}
</style>
