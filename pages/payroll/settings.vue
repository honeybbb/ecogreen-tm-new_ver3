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
    color: '#10b981', // 그린 (스크립트 데이터이므로 로직유지)
    codes: ref([]),
  },
  '04002': {
    name: '공제 항목',
    icon: 'mdi-minus-circle',
    color: '#ef4444', // 레드
    codes: ref([]),
  },
  '04003': {
    name: '정산 항목',
    icon: 'mdi-plus-minus-box',
    codes: ref([]),
  }
};

// 2. 선택 상태
const selectedGroupKey = ref('04001');
const searchQuery = ref('');

const newCodeName = ref('');
const newTaxFree = ref(0);
const newCodeSort = ref(0);

const newCodeNumber = computed(() => {
  const prefix = selectedGroupKey.value; // e.g. '04001'
  const list = currentCodeList.value;
  if (!list.length) return prefix + '001';
  const nums = list.map(c => parseInt(c.itemCd.slice(-3)));
  const next = Math.max(...nums) + 1;
  return prefix + String(next).padStart(3, '0');
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
  code._original = { ...code };  // 원본 백업
  code.isEditing = true;
};

const cancelEdit = (code) => {
  Object.assign(code, code._original);  // 원본 복원
  delete code._original;
  code.isEditing = false;
};

const saveCode = async (code) => {
  try {
    // 1. URL의 파라미터는 cIdx(업체번호)여야 함
    // 2. 전달하는 객체(payload)에 필요한 모든 정보가 있어야 함
    const payload = {
      groupCd: selectedGroupKey.value, // 현재 선택된 그룹 (04001 등)
      itemCd: code.itemCd,
      itemNm: code.itemNm,
      sort: code.sort,
      useFl: code.useFl,
      tax_free: code.tax_free,
      option: code.option || null
    };

    await axios.post(`/api/v1/code/${cIdx}`, payload); // code.itemCd가 아니라 cIdx를 전달

    alert('수정되었습니다.');
    code.isEditing = false;
    // getConfigWage(); // 필요 시 리스트 새로고침
  } catch (err) {
    console.error('수정 실패:', err);
    alert('수정에 실패했습니다.');
  }
};

// [행 삭제]
const deleteCode = async (itemCd) => {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  await axios.delete(`/api/v1/code/${itemCd}`);
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
    option: selectedGroupKey.value === '04001' ? newTaxFree.value : 0
  });

  let params = {
    groupCd: selectedGroupKey.value,
    itemCd: newCodeNumber.value,
    itemNm: newCodeName.value,
    sort: 0,
    useFl: 'Y',
    option: selectedGroupKey.value === '04001' ? newTaxFree.value : 0
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
        allCodeData['04003'].codes.value = [];

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
          } else if (item.groupCd === '04003') {
            allCodeData['04003'].codes.value.push(formattedItem);
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
      <!--div class="header-actions">
        <button @click="saveSubGroup" class="btn-save-all">
          <i class="mdi mdi-content-save-outline"></i>
          <span>전체 저장</span>
        </button>
      </div-->
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
                    <i :class="['mdi', code.useFl === 'Y' ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
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
                      :disabled="code.editFl == 'N'"
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
          <!--li><strong>전체 저장:</strong> 모든 변경사항을 한번에 저장하려면 우측 상단의 '전체 저장' 버튼을 클릭하세요.</li-->
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
.table-wrapper::-webkit-scrollbar-thumb:hover { background: var(--text-sub); }

.th-content { display: flex; align-items: center; gap: 6px; }
.th-content.justify-center { justify-content: center; }
.th-content i { font-size: 14px; opacity: 0.8; }

/* 행 번호 및 코드 표시 */
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
.sort-number { color: var(--text-main); }

/* 비과세 입력 */
.tax-input-wrapper { display: flex; align-items: center; gap: 6px; }
.input-tax {
  width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 13px; color: var(--text-main); background: var(--bg-surface); text-align: right; transition: all 0.2s; box-sizing: border-box;
}
.input-tax:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.tax-unit { font-size: 12px; color: var(--text-sub); font-weight: 500; }
.tax-display { color: var(--text-sub); font-weight: 500; }

/* 상태 배지 */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.status-new { background-color: var(--primary-soft); color: var(--primary); }
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: var(--bg-hover); color: var(--text-sub); }
.status-badge i { font-size: 13px; }

/* 입력 필드 공통
.input-edit, .input-add, .status-select {
  width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 13px; color: var(--text-main); transition: all 0.2s; background: var(--bg-surface); box-sizing: border-box;
}
.input-edit:focus, .input-add:focus, .status-select:focus {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft);
}
.input-add.disabled { background-color: var(--bg-canvas); color: var(--text-muted); cursor: not-allowed; border-color: transparent; }
 */

/* 액션 버튼 (테이블 내부) */
.action-buttons { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;}

.btn-action {
  display: flex; align-items: center; gap: 4px; padding: 6px 10px;
  border: none; border-radius: 6px; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-action:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-action i { font-size: 14px; }
/*
.btn-cancel { background-color: var(--text-sub); color: var(--text-inverse); }
.btn-cancel:hover { background-color: var(--text-main); }

.btn-edit { background-color: var(--primary); color: var(--text-inverse); }
.btn-edit:hover:not(:disabled) { background-color: var(--primary-hover); }

.btn-delete { background-color: var(--danger); color: var(--text-inverse); }
.btn-delete:hover:not(:disabled) { filter: brightness(0.9); }
 */
.btn-save { height: 100%}

/* 추가 행 */
.add-row { background-color: rgba(16, 185, 129, 0.03); border-top: 1px solid var(--border-color); }
.add-row:hover { background-color: rgba(16, 185, 129, 0.06); }
.add-icon { display: flex; align-items: center; justify-content: center; }
.add-icon i { font-size: 22px; color: var(--success); }

.btn-add-submit {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 8px 14px; background-color: var(--success); border: none; border-radius: 6px;
  color: var(--text-inverse); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; width: 100%;
}
.btn-add-submit:hover { transform: translateY(-1px); background-color: var(--success-hover); }
.btn-add-submit i { font-size: 15px; }

/* === 안내 박스 === */
.info-box {
  display: flex; gap: 14px; padding: 20px;
  background-color: var(--primary-soft); border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 12px; color: var(--primary); margin-top: 24px;
}
.info-box i { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
.info-content { flex: 1; }
.info-content strong { display: block; font-size: 14px; margin-bottom: 8px; font-weight: 700; color: var(--primary); }
.info-content ul { margin: 0; padding-left: 20px; }
.info-content li { font-size: 12px; line-height: 1.6; margin-bottom: 4px; color: var(--text-main); }
</style>
