<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";
import {useAuthStore} from "~/stores/auth.js";

const router = useRouter();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// 1. 전체 공통 코드 데이터
const allCodeData = {
  '04001': {
    name: '지급 항목',
    icon: 'mdi-plus-circle',
    color: '#10b981', // 그린
    codes: ref([]),
  },
  '04002': {
    name: '공제 항목',
    icon: 'mdi-minus-circle',
    color: '#ef4444', // 레드
    codes: ref([]),
  },
};

// 2. 선택 상태
const selectedGroupKey = ref('04001');
const searchQuery = ref('');

const newCodeName = ref('');
const newTaxFree = ref(0);
const newCodeSort = ref(0);

const newCodeNumber = computed(() => {
  const list = currentCodeList.value;
  if (!list || list.length === 0) {
    return selectedGroupKey.value ? `${selectedGroupKey.value}001` : '';
  }
  const lastCode = list.reduce((max, code) => {
    const currentNum = parseInt(code.itemCd, 10);
    return currentNum > max ? currentNum : max;
  }, 0);

  const nextNum = lastCode + 1;
  const codeLength = list[0].itemCd.length;
  return String(nextNum).padStart(codeLength, '0');
});

// 3. 옵션 목록 계산
const groupOptions = computed(() => {
  return Object.keys(allCodeData).map(key => ({
    key: key,
    name: allCodeData[key].name,
    icon: allCodeData[key].icon,
    color: allCodeData[key].color,
  }));
});

// 4. 현재 표시할 코드 목록 계산
const currentCodeList = computed(() => {
  const group = allCodeData[selectedGroupKey.value];
  let list = group ? group.codes.value : [];

  // 검색 필터 적용
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    return list.filter(code =>
        code.itemNm.toLowerCase().includes(query) ||
        code.itemCd.toLowerCase().includes(query)
    );
  }

  return list;
});

// 현재 선택된 그룹 정보
const currentGroupInfo = computed(() => {
  const group = allCodeData[selectedGroupKey.value];
  if (!group) return null;

  return {
    name: group.name,
    icon: group.icon,
    color: group.color,
    count: currentCodeList.value.length,
    activeCount: currentCodeList.value.filter(c => c.useFl === 'Y').length
  };
});

// 5. 코드 관리 함수
const getCurrentCodeGroupRef = () => {
  return allCodeData[selectedGroupKey.value].codes;
};

// [수정 모드]
const startEdit = (code) => {
  code.isEditing = true;
};

const cancelEdit = (code) => {
  code.isEditing = false;
  getConfigWage(); // 원래 데이터로 복원
};

const saveCode = (code) => {
  console.log(`수정(임시): ${JSON.stringify(code)}`);
  axios.post(`/api/v1/code/${code.itemCd}`, code);
  code.isEditing = false;
};

// [행 삭제]
const deleteCode = (itemCd) => {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  axios.delete(`/api/v1/code/${itemCd}`);
  const list = getCurrentCodeGroupRef();
  list.value = list.value.filter(c => c.itemCd !== itemCd);
};

// 신규 추가
const addCode = async () => {
  if (!newCodeName.value || !newCodeNumber.value) {
    alert('코드 번호와 항목명을 입력해주세요.');
    return;
  }

  const list = getCurrentCodeGroupRef();

  list.value.push({
    itemCd: newCodeNumber.value,
    itemNm: newCodeName.value,
    status: 'Y',
    useFl: 'Y',
    isEditing: false,
    tax_free: selectedGroupKey.value === '04001' ? newTaxFree.value : 0
  });

  let params = {
    groupCd: selectedGroupKey.value,
    itemCd: newCodeNumber.value,
    itemNm: newCodeName.value,
    sort: 0,
    useFl: 'Y',
    tax_free: selectedGroupKey.value === '04001' ? newTaxFree.value : 0
  }

  await axios.post(`/api/v1/code/${cIdx}`, params)
      .then(res => {
        console.log(res.data.data, 'addCode');
        alert('추가되었습니다.');
      })
      .catch(err => {
        console.error('추가 실패:', err);
        alert('추가에 실패했습니다.');
      });

  newCodeName.value = '';
  newCodeNumber.value = '';
  newTaxFree.value = 0;
};

const getConfigWage = () => {
  axios.get(`/api/v1/config/code/wage/${cIdx}`)
      .then(res => {
        const result = res.data.data || [];

        // 초기화
        allCodeData['04001'].codes.value = [];
        allCodeData['04002'].codes.value = [];

        // 데이터 분류
        result.forEach((item, index) => {
          const formattedItem = {
            id: index + 1,
            itemCd: item.itemCd,
            groupCd: item.groupCd,
            itemNm: item.itemNm,
            isEditing: false,
            useFl: item.useFl,
            deleteFl: item.deleteFl,
            editFl: item.editFl,
            tax_free: item.tax_free || 0,
            sort: item.sort || 0
          };

          if (item.groupCd === '04001') {
            allCodeData['04001'].codes.value.push(formattedItem);
          } else if (item.groupCd === '04002') {
            allCodeData['04002'].codes.value.push(formattedItem);
          }
        });
      })
      .catch(err => console.error('로드 실패:', err));
}

// 전체 저장
const saveSubGroup = async () => {
  if (!confirm('현재 리스트로 전체 데이터를 저장(재설정)합니다. 진행하시겠습니까?')) return;

  const paymentList = allCodeData['04001'].codes.value;
  const deductionList = allCodeData['04002'].codes.value;

  try {
    await processGroupUpdate('04001', paymentList);
    await processGroupUpdate('04002', deductionList);

    alert('저장되었습니다.');
    getConfigWage();
  } catch (error) {
    console.error('저장 실패:', error);
    alert('저장 중 오류가 발생했습니다.');
  }
};

// 그룹별 삭제 후 저장
const processGroupUpdate = async (groupCd, list) => {
  await axios.delete(`/api/v1/code/${groupCd}`);

  if (list && list.length > 0) {
    const savePromises = list.map((item, index) => {
      return axios.post(`/api/v1/code/${cIdx}`, {
        groupCd: groupCd,
        itemCd: item.itemCd,
        itemNm: item.itemNm,
        sort: index + 1,
        useFl: item.useFl,
        tax_free: item.tax_free || 0
      });
    });
    await Promise.all(savePromises);
  }
};

// 새로고침
const refreshData = () => {
  getConfigWage();
};

onMounted(() => {
  getConfigWage();
});
</script>

<template>
  <div class="payroll-settings-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-cash-multiple"></i>
          기초 급여 정보
        </h1>
        <p class="page-subtitle">급여 지급 항목 및 공제 항목을 설정합니다</p>
      </div>
      <div class="header-actions">
        <button @click="refreshData" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
        <button @click="saveSubGroup" class="btn-save-all">
          <i class="mdi mdi-content-save-outline"></i>
          <span>전체 저장</span>
        </button>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i :class="['mdi', currentGroupInfo?.icon]"></i>
            설정 구분
          </label>
          <select v-model="selectedGroupKey" class="filter-select">
            <option v-for="opt in groupOptions" :key="opt.key" :value="opt.key">
              {{ opt.name }}
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
        <div class="active-badge">
          <i class="mdi mdi-check-circle-outline"></i>
          <span>활성 <strong>{{ currentGroupInfo.activeCount }}</strong>개</span>
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
            <th style="width: 180px;">
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
            <th v-if="selectedGroupKey == '04001'" style="width: 150px;">
              <div class="th-content">
                <i class="mdi mdi-cash-remove"></i>
                <span>비과세한도</span>
              </div>
            </th>
            <th style="width: 80px;">
              <div class="th-content">
                <i class="mdi mdi-sort-variant"></i>
                <span>순서</span>
              </div>
            </th>
            <th style="width: 120px;">
              <div class="th-content">
                <i class="mdi mdi-check-circle-outline"></i>
                <span>사용 여부</span>
              </div>
            </th>
            <th class="text-center" style="width: 140px;">
              <div class="th-content justify-center">
                <i class="mdi mdi-cog-outline"></i>
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
              <span class="code-number">{{ code.itemCd }}</span>
            </td>

            <td>
              <template v-if="code.isEditing">
                <input
                    type="text"
                    v-model="code.itemNm"
                    class="input-edit"
                    placeholder="항목명"
                />
              </template>
              <template v-else>
                <span class="code-name">{{ code.itemNm }}</span>
              </template>
            </td>

            <td v-if="selectedGroupKey == '04001'">
              <template v-if="code.isEditing">
                <div class="tax-input-wrapper">
                  <input
                      type="number"
                      v-model.number="code.tax_free"
                      class="input-tax"
                      placeholder="0"
                      min="0"
                  />
                  <span class="tax-unit">원</span>
                </div>
              </template>
              <template v-else>
                <span class="tax-display">{{ Number(code.tax_free).toLocaleString() }} 원</span>
              </template>
            </td>

            <td class="text-center">
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

            <td>
              <template v-if="code.isEditing">
                <select v-model="code.useFl" class="status-select">
                  <option value="Y">사용</option>
                  <option value="N">사용안함</option>
                </select>
              </template>
              <template v-else>
                  <span :class="['status-badge', code.useFl === 'Y' ? 'status-active' : 'status-inactive']">
                    <i :class="['mdi', code.useFl === 'Y' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline']"></i>
                    {{ code.useFl === 'Y' ? '사용' : '사용안함' }}
                  </span>
              </template>
            </td>

            <td class="text-center">
              <div class="action-buttons">
                <template v-if="code.isEditing">
                  <button @click="saveCode(code)" class="btn-action btn-save">
                    <i class="mdi mdi-content-save-outline"></i>
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
                    <i class="mdi mdi-pencil-outline"></i>
                    <span>수정</span>
                  </button>
                  <button
                      @click="deleteCode(code.itemCd)"
                      class="btn-action btn-delete"
                      :disabled="code.deleteFl == 'N'"
                  >
                    <i class="mdi mdi-trash-can-outline"></i>
                    <span>삭제</span>
                  </button>
                </template>
              </div>
            </td>
          </tr>

          <tr v-if="currentCodeList.length === 0" class="empty-row">
            <td :colspan="selectedGroupKey == '04001' ? 7 : 6">
              <div class="empty-state">
                <i class="mdi mdi-folder-open-outline"></i>
                <p>등록된 항목이 없습니다</p>
                <span>아래 입력란에서 새로운 항목을 추가해주세요</span>
              </div>
            </td>
          </tr>

          <tr class="add-row">
            <td class="text-center">
              <div class="add-icon">
                <i class="mdi mdi-plus-circle-outline"></i>
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
            <td v-if="selectedGroupKey == '04001'">
              <div class="tax-input-wrapper">
                <input
                    type="number"
                    v-model.number="newTaxFree"
                    placeholder="0"
                    class="input-add text-right"
                    min="0"
                />
                <span class="tax-unit">원</span>
              </div>
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
            <td>
                <span class="status-badge status-new">
                  <i class="mdi mdi-new-box"></i>
                  신규
                </span>
            </td>
            <td class="text-center">
              <button @click="addCode" class="btn-add-submit">
                <i class="mdi mdi-plus"></i>
                <span>추가</span>
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-box">
      <i class="mdi mdi-information-outline"></i>
      <div class="info-content">
        <strong>기초 급여 정보 안내</strong>
        <ul>
          <li><strong>지급 항목:</strong> 급여 지급 시 포함되는 항목입니다. (기본급, 수당 등)</li>
          <li><strong>공제 항목:</strong> 급여에서 차감되는 항목입니다. (국민연금, 건강보험 등)</li>
          <li><strong>비과세한도:</strong> 지급 항목에 대한 비과세 한도를 설정할 수 있습니다.</li>
          <li><strong>전체 저장:</strong> 모든 변경사항을 한번에 저장하려면 우측 상단의 '전체 저장' 버튼을 클릭하세요.</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Material Design Icons */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 설정 === */
.payroll-settings-page {
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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

.page-title i { font-size: 26px; color: #4f46e5; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

.header-actions { display: flex; gap: 10px; }

.btn-refresh, .btn-save-all {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 18px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}

.btn-refresh { background: white; border: 1px solid #e2e8f0; color: #475569; }
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }

.btn-save-all {
  background-color: #10b981; color: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); /* 진한 그림자, 그라디언트 제거 */
}
.btn-save-all:hover { background-color: #059669; transform: translateY(-1px); }

.btn-refresh i, .btn-save-all i { font-size: 18px; }

/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px;
  margin-bottom: 24px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.filter-row { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 200px; flex: 1; }

.filter-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; color: #475569;
}
.filter-label i { font-size: 16px; color: #4f46e5; }

.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; cursor: pointer;
  transition: all 0.2s; height: 42px; box-sizing: border-box;
}
.filter-select:hover { border-color: #cbd5e1; }
.filter-select:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

.filter-spacer { flex: 1; }

/* 검색 박스 */
.search-box {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 8px; min-width: 320px; height: 42px; box-sizing: border-box; transition: all 0.2s;
}
.search-box:focus-within { background: white; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.search-box i { font-size: 20px; color: #94a3b8; }

.search-input {
  flex: 1; border: none; background: transparent;
  font-size: 13px; color: #334155; outline: none;
}
.search-input::placeholder { color: #94a3b8; }

.search-clear {
  background: none; border: none; color: #94a3b8; cursor: pointer;
  padding: 4px; border-radius: 4px; transition: all 0.2s;
}
.search-clear:hover { background: #e2e8f0; color: #64748b; }

/* 선택 정보 배지 */
.selection-info {
  display: flex; align-items: center; gap: 12px;
  padding-top: 16px; border-top: 1px solid #f1f5f9; flex-wrap: wrap;
}
.info-badge, .count-badge, .active-badge {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; white-space: nowrap;
}
.info-badge { background-color: #eff6ff; color: #1e40af; }
.count-badge { background-color: #f1f5f9; color: #475569; }
.active-badge { background-color: #ecfdf5; color: #065f46; }
.info-badge i, .count-badge i, .active-badge i { font-size: 15px; }

/* === 테이블 카드 === */
.table-card {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); overflow: hidden; margin-bottom: 24px;
}

.table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-wrapper::-webkit-scrollbar { height: 8px; }
.table-wrapper::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
.table-wrapper::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

/* === 데이터 테이블 === */
.data-table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: 13px;}

.data-table thead { background-color: #6d28d9; } /* 솔리드 퍼플 */

.data-table th {
  padding: 14px 16px; text-align: left; font-size: 12px;
  font-weight: 600; color: white; white-space: nowrap;
}

.th-content { display: flex; align-items: center; gap: 6px; }
.th-content.justify-center { justify-content: center; }
.th-content i { font-size: 14px; opacity: 0.8; }

.data-table td {
  padding: 12px 16px; border-bottom: 1px solid #e2e8f0;
  color: #334155; vertical-align: middle;
}

.data-row { transition: background 0.2s; }
.data-row:hover { background-color: #f8fafc; }

.text-center { text-align: center !important; }
.text-right { text-align: right; }

/* 행 번호 및 코드 표시 */
.row-number {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; background: #f1f5f9; border-radius: 6px;
  font-weight: 600; color: #64748b; font-size: 12px;
}
.code-number {
  font-family: 'Courier New', monospace; font-weight: 600;
  color: #4f46e5; background: #eff6ff; padding: 4px 10px; border-radius: 6px; font-size: 12px;
}
.code-name { font-weight: 500; color: #1e293b; }

/* 비과세 입력 */
.tax-input-wrapper { display: flex; align-items: center; gap: 6px; }
.input-tax {
  width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 13px; color: #334155; text-align: right; transition: all 0.2s; box-sizing: border-box;
}
.input-tax:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.tax-unit { font-size: 12px; color: #64748b; font-weight: 500; }
.tax-display { color: #475569; font-weight: 500; }

/* 상태 배지 */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.status-new { background-color: #eff6ff; color: #1d4ed8; }
.status-active { background-color: #d1fae5; color: #065f46; }
.status-inactive { background-color: #f1f5f9; color: #475569; }
.status-badge i { font-size: 13px; }

/* 입력 필드 공통 */
.input-edit, .input-add, .status-select {
  width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px;
  font-size: 13px; color: #334155; transition: all 0.2s; background: white; box-sizing: border-box;
}
.input-edit:focus, .input-add:focus, .status-select:focus {
  outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.input-add.disabled { background-color: #f1f5f9; color: #94a3b8; cursor: not-allowed; border-color: transparent; }

/* 액션 버튼 */
.action-buttons { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;}
.btn-action {
  display: flex; align-items: center; gap: 4px; padding: 6px 10px;
  border: none; border-radius: 6px; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-action:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-action i { font-size: 14px; }

.btn-cancel { background-color: #64748b; color: white; }
.btn-cancel:hover { background-color: #475569; }

.btn-edit { background-color: #4f46e5; color: white; }
.btn-edit:hover:not(:disabled) { background-color: #4338ca; }

.btn-delete { background-color: #ef4444; color: white; }
.btn-delete:hover:not(:disabled) { background-color: #dc2626; }

.btn-save { background-color: #10b981; color: white; }
.btn-save:hover:not(:disabled) { background-color: #059669; }

/* 추가 행 */
.add-row { background-color: #f0fdf4; border-top: 1px solid #bbf7d0; }
.add-row:hover { background-color: #dcfce7; }
.add-icon { display: flex; align-items: center; justify-content: center; }
.add-icon i { font-size: 22px; color: #10b981; }

.btn-add-submit {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 8px 14px; background-color: #10b981; border: none; border-radius: 6px;
  color: white; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; width: 100%;
}
.btn-add-submit:hover { transform: translateY(-1px); background-color: #059669; }
.btn-add-submit i { font-size: 15px; }

/* 빈 상태 */
.empty-row { background: white; }
.empty-state { text-align: center; padding: 50px 20px; color: #94a3b8; }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: #cbd5e1;}
.empty-state p { font-size: 15px; font-weight: 600; color: #475569; margin: 0 0 6px 0; }
.empty-state span { font-size: 13px; }

/* === 안내 박스 === */
.info-box {
  display: flex; gap: 14px; padding: 20px;
  background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; color: #1e40af;
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
  .header-actions { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .btn-refresh, .btn-save-all { flex: 1; justify-content: center; }

  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group, .search-box { width: 100%; min-width: 100%; }
  .filter-spacer { display: none; }

  .selection-info { flex-direction: column; align-items: stretch; gap: 8px; }
}
</style>
