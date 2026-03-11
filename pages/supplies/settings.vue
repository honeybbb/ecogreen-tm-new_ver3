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
            <th class="text-center sticky-col" style="width: 180px;"><div class="th-content justify-center"><i class="mdi mdi-cog-outline"></i><span>관리</span></div></th>
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
              <span v-else class="price-value">{{ formatPrice(code.price) }}</span>
            </td>
            <td class="text-center sticky-col">
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
            <td><input type="text" v-model="newCodeNumber" placeholder="코드번호" class="input-add" /></td>
            <td><input type="text" v-model="newCodeName" placeholder="신규 품목명 입력" class="input-add" /></td>
            <td><span class="status-badge status-new"><i class="mdi mdi-new-box"></i>신규</span></td>
            <td><input type="number" v-model="newCodePrice" placeholder="단가 입력" class="input-add text-right" @keyup.enter="addCode"/></td>
            <td class="text-center sticky-col bg-add-row">
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
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 설정 === */
.price-settings-page {
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;
}
.header-left { flex: 1; }
.page-title {
  font-size: 24px; font-weight: 700; color: #1e293b;
  margin: 0 0 6px 0; display: flex; align-items: center; gap: 10px; letter-spacing: -0.5px;
}
.page-title i { font-size: 26px; color: #4f46e5; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

.header-actions { display: flex; gap: 10px; }
.btn-refresh {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px;
  background: white; border: 1px solid #e2e8f0; border-radius: 8px;
  color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
.btn-refresh i { font-size: 16px; }

/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.filter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 180px; flex: 1;}

.filter-label {
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569;
}
.filter-label i { font-size: 16px; color: #4f46e5; }

.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; cursor: pointer; transition: all 0.2s; height: 42px;
}
.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.filter-spacer { flex: 1; }

/* 검색 박스 */
.search-group { display: flex; gap: 8px; flex: 2; min-width: 280px; align-items: flex-end;}
.search-box {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
  flex: 1; height: 42px; transition: all 0.2s; box-sizing: border-box;
}
.search-box:focus-within { background: white; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.search-box i { font-size: 18px; color: #94a3b8; }
.search-input { flex: 1; border: none; background: transparent; font-size: 13px; color: #334155; outline: none; }
.search-input::placeholder { color: #94a3b8; }
.search-clear { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s;}
.search-clear:hover { background: #e2e8f0; color: #64748b; }

/* === 테이블 영역 === */
.table-card {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); overflow: hidden; margin-bottom: 24px;
}

.table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-wrapper::-webkit-scrollbar { height: 8px; }
.table-wrapper::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
.table-wrapper::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

.data-table { width: 100%; min-width: 1000px; border-collapse: collapse; font-size: 13px; }
.data-table thead { background-color: #6d28d9; position: sticky; top: 0; z-index: 10; }
.data-table th { padding: 14px 16px; text-align: left; font-size: 12px; font-weight: 600; color: white; white-space: nowrap; border-bottom: none;}

.th-content { display: flex; align-items: center; gap: 6px; }
.justify-center { justify-content: center; }
.justify-end { justify-content: flex-end; }
.th-content i { font-size: 14px; opacity: 0.8; }

.data-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
.data-row { transition: background 0.2s; }
.data-row:hover { background-color: #f8fafc; }

/* 텍스트/유틸 */
.text-center { text-align: center !important; }
.text-right { text-align: right !important; }

/* 행 번호 및 텍스트표시 */
.row-number {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; background: #f1f5f9; border-radius: 6px;
  font-weight: 600; color: #64748b; font-size: 12px;
}
.code-number {
  font-family: 'Courier New', monospace; font-weight: 600;
  color: #4f46e5; background: #eef2ff; padding: 4px 10px; border-radius: 6px; font-size: 12px;
}
.code-name { font-weight: 500; color: #1e293b; }
.price-value { font-family: 'Inter', monospace; font-weight: 700; color: #1e293b; font-size: 14px; }

/* 상태 배지 (플랫 파스텔톤) */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
  border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.status-active { background-color: #d1fae5; color: #065f46; }
.status-inactive { background-color: #f1f5f9; color: #475569; }
.status-new { background-color: #eff6ff; color: #1d4ed8; }
.status-badge i { font-size: 13px; }

/* 입력창 (포커스 링 개선) */
.input-edit, .input-add, .status-select {
  width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 13px; color: #334155; transition: all 0.2s; background: white; box-sizing: border-box;
}
.input-edit:focus, .input-add:focus, .status-select:focus {
  outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}
.input-add { background-color: #ffffff; }

/* 액션 버튼 */
.action-buttons { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;}
.btn-action {
  display: flex; align-items: center; gap: 4px; padding: 6px 10px; border: none;
  border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}

.btn-edit { background-color: #eef2ff; color: #4f46e5; }
.btn-edit:hover { background-color: #e0e7ff; color: #4338ca; }

.btn-save { background-color: #10b981; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05);}
.btn-save:hover { background-color: #059669; transform: translateY(-1px); }

.btn-cancel { background-color: #f1f5f9; color: #475569; }
.btn-cancel:hover { background-color: #e2e8f0; color: #1e293b; }

.btn-delete { background-color: #fef2f2; color: #dc2626; }
.btn-delete:hover { background-color: #fee2e2; }

/* 신규 추가 행 (플랫 스타일) */
.add-row { background-color: #f0fdf4; border-top: 1px solid #bbf7d0; }
.add-row:hover { background-color: #dcfce7; }
.add-icon { display: flex; align-items: center; justify-content: center; }
.add-icon i { font-size: 22px; color: #10b981; }

.btn-add-submit {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 14px; background-color: #10b981; border: none; border-radius: 6px;
  color: white; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; width: 100%;
}
.btn-add-submit:hover { background-color: #059669; transform: translateY(-1px); }
.bg-add-row { background-color: #f0fdf4 !important; }

/* Sticky 컬럼 영역 */
.sticky-col { position: sticky; right: 0; box-shadow: -4px 0 8px rgba(0,0,0,0.03); background: white; z-index: 5;}
.data-table thead .sticky-col { background-color: #6d28d9; z-index: 15; box-shadow: none; border-left: 1px solid rgba(255,255,255,0.1); }
.data-row:hover .sticky-col { background-color: #f8fafc; }

/* 빈 상태 */
.empty-row { background-color: white !important; }
.empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: #cbd5e1; display: block;}
.empty-state p { font-size: 14px; font-weight: 500; color: #64748b; margin: 0; }

/* === 하단 안내 박스 === */
.info-box {
  display: flex; gap: 14px; padding: 20px 24px; background-color: #eff6ff;
  border: 1px solid #bfdbfe; border-radius: 12px; margin-top: 24px; color: #1e40af;
}
.info-box i { font-size: 24px; color: #4f46e5; flex-shrink: 0; margin-top: 2px;}
.info-content strong { display: block; font-size: 14px; font-weight: 700; margin-bottom: 8px; }
.info-content ul { padding-left: 20px; margin: 0; }
.info-content li { font-size: 13px; line-height: 1.6; font-weight: 500; color: #1e3a8a;}


/* === 반응형 (Responsive) === */
@media (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .filter-group { flex: 1; min-width: calc(50% - 8px); }
  .search-group { width: 100%; flex: 1 1 100%; }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 14px; align-items: flex-start; }
  .header-actions { width: 100%; flex-direction: row; }
  .btn-refresh { flex: 1; justify-content: center; }

  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group, .search-group { width: 100%; min-width: 100%; }
  .filter-spacer { display: none; }

  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
}
</style>
