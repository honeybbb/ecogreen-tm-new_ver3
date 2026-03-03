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
    color: '#10b981',
    codes: ref([]),
  },
  '04002': {
    name: '공제 항목',
    icon: 'mdi-minus-circle',
    color: '#ef4444',
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
    <!-- 페이지 헤더 -->
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
          <i class="mdi mdi-content-save"></i>
          <span>전체 저장</span>
        </button>
      </div>
    </div>

    <!-- 통계 카드 -->
    <!--div class="stats-grid">
      <div
          v-for="option in groupOptions"
          :key="option.key"
          :class="['stat-card', { active: selectedGroupKey === option.key }]"
          :style="{ '--card-color': option.color }"
          @click="selectedGroupKey = option.key"
      >
        <div class="stat-icon">
          <i :class="['mdi', option.icon]"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">{{ option.name }}</span>
          <span class="stat-value">{{ allCodeData[option.key].codes.value.length }}</span>
        </div>
      </div>
    </div-->

    <!-- 필터 패널 -->
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

      <!-- 현재 선택 정보 -->
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
          <i class="mdi mdi-check-circle"></i>
          <span>활성 <strong>{{ currentGroupInfo.activeCount }}</strong>개</span>
        </div>
      </div>
    </div>

    <!-- 테이블 카드 -->
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
            <th style="width: 50px;">
              <div class="th-content">
                <i class="mdi mdi-sort-variant"></i>
                <span>순서</span>
              </div>
            </th>
            <th style="width: 140px;">
              <div class="th-content">
                <i class="mdi mdi-check-circle-outline"></i>
                <span>사용 여부</span>
              </div>
            </th>
            <th class="text-center" style="width: 100px;">
              <div class="th-content">
                <i class="mdi mdi-cog"></i>
                <span>관리</span>
              </div>
            </th>
          </tr>
          </thead>
          <tbody>
          <!-- 기존 데이터 행 -->
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
                <span>{{ code.tax_free }} 원</span>
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
                      @click="deleteCode(code.itemCd)"
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

          <!-- 데이터 없음 -->
          <tr v-if="currentCodeList.length === 0" class="empty-row">
            <td :colspan="selectedGroupKey == '04001' ? 6 : 5">
              <div class="empty-state">
                <i class="mdi mdi-folder-open-outline"></i>
                <p>등록된 항목이 없습니다</p>
                <span>아래 입력란에서 새로운 항목을 추가해주세요</span>
              </div>
            </td>
          </tr>

          <!-- 추가 행 -->
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
            <td v-if="selectedGroupKey == '04001'">
              <div class="tax-input-wrapper">
                <input
                    type="number"
                    v-model.number="newTaxFree"
                    placeholder="0"
                    class="input-add"
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

    <!-- 안내 메시지 -->
    <div class="info-box">
      <i class="mdi mdi-information"></i>
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

/* === 기본 레이아웃 === */
.payroll-settings-page {
  padding: 0;
}

/* === 페이지 헤더 === */
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

.btn-refresh,
.btn-save-all {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-refresh {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-refresh:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-save-all {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-save-all:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}

.btn-refresh i,
.btn-save-all i {
  font-size: 18px;
}

/* === 통계 카드 === */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 28px;
}

.stat-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 20px;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
  border: 2px solid transparent;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--card-color);
  transform: scaleY(0);
  transition: transform 0.3s;
}

.stat-card:hover,
.stat-card.active {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  border-color: var(--card-color);
}

.stat-card.active::before {
  transform: scaleY(1);
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 14px;
  background: var(--card-color);
  opacity: 0.1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.stat-icon i {
  font-size: 28px;
  color: var(--card-color);
  position: absolute;
}

.stat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--card-color);
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

/* 선택 정보 */
.selection-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #f1f5f9;
}

.info-badge,
.count-badge,
.active-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
}

.info-badge {
  background: #eff6ff;
  color: #1e40af;
}

.count-badge {
  background: #f0fdf4;
  color: #166534;
}

.active-badge {
  background: #fef3c7;
  color: #92400e;
}

.info-badge i,
.count-badge i,
.active-badge i {
  font-size: 16px;
}

/* === 테이블 카드 === */
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

/* 행 번호 */
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

/* 코드 표시 */
.code-number {
  font-family: 'Courier New', monospace;
  font-weight: 600;
  color: #667eea;
  background: #eff6ff;
  padding: 6px 12px;
  border-radius: 6px;
  display: inline-block;
}

/* 비과세 입력 */
.tax-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-tax {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  color: #334155;
  text-align: right;
  font-family: 'Courier New', monospace;
}

.input-tax:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.tax-unit {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

/* 상태 배지 */
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
  width: 100%;
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

/* 액션 버튼 */
.action-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

/* 액션 버튼 */
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
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-action i {
  font-size: 16px;
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

.btn-save {
  background: #10b981;
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: #059669;
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
  padding: 8px 16px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
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
  font-size: 16px;
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

/* === 반응형 === */
@media (max-width: 1200px) {
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
    flex-direction: column;
  }

  .btn-refresh,
  .btn-save-all {
    width: 100%;
    justify-content: center;
  }

  .stats-grid {
    grid-template-columns: 1fr;
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
}
</style>
