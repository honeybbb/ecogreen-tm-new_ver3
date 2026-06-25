<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';
import SiteSelect from "~/components/SiteSelect.vue";

const router = useRouter();

const selectedSite = ref('');

const columns = [
  { key: 'empNo', label: '사번', width: '100px', type: 'text' },
  { key: 'name', label: '이름', width: '100px', type: 'text' },
  { key: 'position', label: '직책', width: '100px', type: 'select', src: 'positionOptions' },
  { key: 'contractEndDate', label: '근로계약서', width: '100px', type: 'text' },
  { key: 'retirementPension', label: '퇴직연금', width: '80px', type: 'text' },
  { key: 'gender', label: '성별', width: '60px', type: 'text' },
  { key: 'rrn', label: '주민등록번호', width: '140px', type: 'text' },
  { key: 'bankName', label: '은행', width: '120px', type: 'select', src: 'bankOptions' },
  { key: 'accountNumber', label: '계좌번호', width: '160px', type: 'text' },
  { key: 'accountNm', label: '예금주', width: '100px', type: 'text' },
  { key: 'joinDate', label: '입사일', width: '100px', type: 'text' },
  { key: 'leaveDate', label: '퇴사일', width: '100px', type: 'text' },
  { key: 'resignReason', label: '사직사유', width: '100px', type: 'text' },
  { key: 'address', label: '주소', width: '250px', type: 'text' },
  { key: 'phone', label: '연락처', width: '150px', type: 'text' },
  { key: 'insurance', label: '4대보험', width: '80px', type: 'text' },
  { key: 'foreigner', label: '외국인여부', width: '80px', type: 'text' },
  { key: 'nationality', label: '국적', width: '100px', type: 'text' },
  { key: 'visa_code', label: '비자코드', width: '100px', type: 'text' },
  { key: 'visa_date', label: '비자만료일', width: '100px', type: 'text' },
  { key: 'defector', label: '새터민여부', width: '100px', type: 'text' },
  { key: 'patriot', label: '국가유공자여부', width: '120px', type: 'text' },
  { key: 'intern', label: '청년인턴여부', width: '120px', type: 'text' },
  { key: 'beneficiary', label: '기초수급자여부', width: '120px', type: 'text' },
  { key: 'disability', label: '장애여부', width: '80px', type: 'text' },
  { key: 'disability_grade', label: '장애등급', width: '120px', type: 'select', src: 'disabledOptions' },
  { key: 'disability_date', label: '장애등록일', width: '100px', type: 'text' },
  { key: 'note', label: '비고', width: '150px', type: 'text' }
];

const items = ref([]);

const { siteOptions, disabledOptions, bankOptions, positionOptions, fetchSiteOptions, fetchDisabledOptions, fetchBankOption, fetchPositionOptions } = useApi();

const isDragging = ref(false);
const selectionStart = ref({ r: -1, c: -1 });
const selectionEnd = ref({ r: -1, c: -1 });

const handleMouseUp = () => {
  isDragging.value = false;
};

const onMouseDown = (e, r, c) => {
  if (e.button === 0) {
    isDragging.value = true;
    selectionStart.value = { r, c };
    selectionEnd.value = { r, c };
  }
};

const onMouseEnter = (r, c) => {
  if (isDragging.value) {
    selectionEnd.value = { r, c };
  }
};

const onFocus = (r, c) => {
  if (!isDragging.value) {
    selectionStart.value = { r, c };
    selectionEnd.value = { r, c };
  }
};

const isSelected = (r, c) => {
  if (selectionStart.value.r === -1) return false;
  const minR = Math.min(selectionStart.value.r, selectionEnd.value.r);
  const maxR = Math.max(selectionStart.value.r, selectionEnd.value.r);
  const minC = Math.min(selectionStart.value.c, selectionEnd.value.c);
  const maxC = Math.max(selectionStart.value.c, selectionEnd.value.c);
  return r >= minR && r <= maxR && c >= minC && c <= maxC;
};

const onInput = (e, r, c) => {
  if (isSelected(r, c)) {
    const val = e.target.value;
    const minR = Math.min(selectionStart.value.r, selectionEnd.value.r);
    const maxR = Math.max(selectionStart.value.r, selectionEnd.value.r);
    const minC = Math.min(selectionStart.value.c, selectionEnd.value.c);
    const maxC = Math.max(selectionStart.value.c, selectionEnd.value.c);

    if (minR !== maxR || minC !== maxC) {
      for (let ir = minR; ir <= maxR; ir++) {
        for (let ic = minC; ic <= maxC; ic++) {
          if (ir !== r || ic !== c) {
            const col = columns[ic];
            items.value[ir][col.key] = val;
          }
        }
      }
    }
  }
};

const onKeyDown = (e, r, c) => {
  let nextR = r;
  let nextC = c;
  const isInput = e.target.tagName.toLowerCase() === 'input';

  if (e.key === 'ArrowUp') {
    nextR = Math.max(0, r - 1);
  } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
    nextR = Math.min(items.value.length - 1, r + 1);
  } else if (e.key === 'ArrowLeft' && isInput) {
    if (e.target.selectionStart === 0 && e.target.selectionEnd === 0) {
      nextC = Math.max(0, c - 1);
    }
  } else if (e.key === 'ArrowRight' && isInput) {
    if (e.target.selectionStart === e.target.value.length && e.target.selectionEnd === e.target.value.length) {
      nextC = Math.min(columns.length - 1, c + 1);
    }
  }

  if (nextR !== r || nextC !== c) {
    if (e.key !== 'Enter') {
      if (!isInput && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        return;
      }
    }

    e.preventDefault();
    const id = `cell-${nextR}-${nextC}`;
    const el = document.getElementById(id);
    if (el) {
      el.focus();
    }
  }
};

// 초기 빈 줄 생성
const generateEmptyRows = (count = 15) => {
  for (let i = 0; i < count; i++) {
    const obj = {};
    columns.forEach(col => {
      obj[col.key] = '';
    });
    items.value.push(obj);
  }
}

onMounted(() => {
  fetchSiteOptions();
  fetchDisabledOptions();
  fetchBankOption();
  fetchPositionOptions();
  generateEmptyRows();
  window.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  window.removeEventListener('mouseup', handleMouseUp);
});

// 붙여넣기 이벤트 처리 로직 (엑셀 등에서 복사한 데이터를 파싱)
const handlePaste = (event, rowIndex, colIndex) => {
  event.preventDefault();
  const clipboardData = event.clipboardData || window.clipboardData;
  const pastedData = clipboardData.getData('Text');

  if (!pastedData) return;

  // 행 단위 분리 (행 끝의 개행문자 처리)
  const rows = pastedData.split(/\r?\n/);

  let currentRow = rowIndex;
  rows.forEach((row, rIdx) => {
    // 마지막 줄이 빈 줄이면 무시
    if (!row.trim() && rIdx === rows.length - 1) return;

    // 탭 단위로 셀 분리 (엑셀은 탭으로 컬럼 구분)
    const cells = row.split('\t');

    // 붙여넣을 데이터가 남았는데 표의 행이 부족하면 추가
    if (currentRow >= items.value.length) {
      const obj = {};
      columns.forEach(col => obj[col.key] = '');
      items.value.push(obj);
    }

    // 붙여넣기 시작점(currentCol)부터 해당 셀들 맵핑
    let currentCol = colIndex;
    cells.forEach((cell, cIdx) => {
      // 엑셀에서 복사할 때 제일 좌측의 'No' 열까지 같이 복사했을 경우를 대비하여 밀림 방지 등 처리 가능
      // 여기서는 사용자가 클릭한 셀부터 순서대로 데이터를 넣습니다.
      if (currentCol < columns.length) {
        items.value[currentRow][columns[currentCol].key] = cell.trim();
        currentCol++;
      }
    });

    currentRow++;
  });
}

const addRow = () => {
  generateEmptyRows(5);
}

const deleteRow = (index) => {
  items.value.splice(index, 1);
}

const saveData = async () => {
  // 이름이 입력된 행만 필터링
  const validItems = items.value.filter(item => item.name && item.name.trim() !== '');

  if(!selectedSite.value) {
    alert('배치할 현장을 선택해주세요.');
    return;
  }
  if(validItems.length === 0) {
    alert('저장할 직원 정보가 없습니다. (이름 필수)');
    return;
  }

  try {
    const payload = { sIdx: selectedSite.value, members: validItems };
    await axios.post('/api/v1/member/bulk', payload);

    console.log("저장 대상 데이터:", validItems);
    alert(`${validItems.length}명의 직원이 일괄 등록 처리되었습니다! (임시)`);

    // 저장이 완료되면 목록으로 이동하거나 초기화
    // router.push('/member/list');
  } catch(e) {
    console.error(e);
    alert('저장 중 오류가 발생했습니다.');
  }
}
</script>

<template>
  <div class="bulk-register-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-table-arrow-right"></i>
          직원 일괄 등록
        </h1>
        <p class="page-subtitle">엑셀표의 데이터를 복사(Ctrl+C)하여 아래 칸에 붙여넣기(Ctrl+V) 하시면 쉽게 여러 명을 등록할 수 있습니다.</p>
      </div>
      <div class="header-actions">
        <button class="btn-save" @click="saveData">
          <i class="mdi mdi-content-save"></i> 일괄 저장하기
        </button>
      </div>
    </div>

    <!-- 현장 선택 섹션 -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building"></i> 배치 현장</label>
          <SiteSelect v-model="selectedSite" />
        </div>
      </div>
    </div>

    <!-- 그리드(데이터 시트) 섹션 -->
    <div class="grid-section">
      <div class="grid-header-notice">
        <i class="mdi mdi-information-outline"></i>
        <span>
          엑셀 또는 스프레드시트에서 <strong style="color: #1e40af">[사번]</strong> 열부터 데이터를 드래그하여 복사한 후,
          데이터가 들어갈 첫 번째 빈 칸을 클릭하고 <strong>Ctrl + V</strong>를 누르세요.
        </span>
      </div>

      <div class="table-responsive">
        <table class="data-grid">
          <thead>
          <tr>
            <th class="col-action">동작</th>
            <th class="col-num">No.</th>
            <th v-for="col in columns" :key="col.key" :style="{ minWidth: col.width }">{{ col.label }}</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(item, rIndex) in items" :key="rIndex">
            <td class="col-action text-center p-0">
              <button class="btn-delete-row" @click="deleteRow(rIndex)" title="줄 삭제">
                <i class="mdi mdi-close"></i>
              </button>
            </td>
            <td class="col-num text-center">{{ rIndex + 1 }}</td>
            <td v-for="(col, cIndex) in columns" :key="col.key" class="p-0" :class="{ 'selected-cell': isSelected(rIndex, cIndex) }">
              <template v-if="col.type === 'select'">
                <select
                    v-model="item[col.key]"
                    :id="`cell-${rIndex}-${cIndex}`"
                    class="grid-input select-input"
                    @focus="onFocus(rIndex, cIndex)"
                    @mousedown="onMouseDown($event, rIndex, cIndex)"
                    @mouseenter="onMouseEnter(rIndex, cIndex)"
                    @change="onInput($event, rIndex, cIndex)"
                    @keydown="onKeyDown($event, rIndex, cIndex)"
                >
                  <option value="">선택</option>
                  <!-- bankName -->
                  <template v-if="col.src === 'bankOptions'">
                    <option v-for="opt in bankOptions" :key="opt.itemNm" :value="opt.itemNm">{{ opt.itemNm }}</option>
                  </template>
                  <!-- disability_grade -->
                  <template v-if="col.src === 'disabledOptions'">
                    <option v-for="opt in disabledOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
                  </template>
                  <!-- position -->
                  <template v-if="col.src === 'positionOptions'">
                    <option v-for="opt in positionOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
                  </template>
                </select>
              </template>
              <template v-else>
                <input
                    type="text"
                    v-model="item[col.key]"
                    :id="`cell-${rIndex}-${cIndex}`"
                    @focus="onFocus(rIndex, cIndex)"
                    @mousedown="onMouseDown($event, rIndex, cIndex)"
                    @mouseenter="onMouseEnter(rIndex, cIndex)"
                    @input="onInput($event, rIndex, cIndex)"
                    @keydown="onKeyDown($event, rIndex, cIndex)"
                    @paste="handlePaste($event, rIndex, cIndex)"
                    class="grid-input"
                    :placeholder="rIndex === 0 && cIndex === 0 ? '여기에 붙여넣기' : ''"
                />
              </template>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div class="grid-actions">
        <button class="btn-add-row" @click="addRow">
          <i class="mdi mdi-plus"></i> 줄 추가 (5줄)
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-section {
  background: #fff;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  border: 1px solid #e5e7eb;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-group {
  flex-direction: row;
  align-items: center;
  gap: 16px;
}

.form-group label {
  font-size: 15px;
  font-weight: 700;
  color: #374151;
}

.required {
  color: #ef4444;
}

.form-control {
  padding: 12px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 15px;
  outline: none;
  transition: all 0.2s;
}

.form-control:focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.grid-section {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  border: 1px solid #e5e7eb;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.grid-header-notice {
  padding: 16px 20px;
  background: #eff6ff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1e3a8a;
  font-size: 14px;
}
.grid-header-notice i {
  font-size: 20px;
  color: #3b82f6;
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
  max-height: 600px;
  overflow-y: auto;
}

/* 스크롤바 스타일링 */
.table-responsive::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.table-responsive::-webkit-scrollbar-track {
  background: #f1f1f1;
}
.table-responsive::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}
.table-responsive::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.data-grid {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  white-space: nowrap;
}

.data-grid th {
  background: #f9fafb;
  padding: 14px 12px;
  font-size: 13px;
  font-weight: 700;
  color: #4b5563;
  border-bottom: 2px solid #e5e7eb;
  border-right: 1px solid #e5e7eb;
  text-align: center;
  position: sticky;
  top: 0;
  z-index: 10;
}

.data-grid th:last-child {
  border-right: none;
}

.data-grid td {
  border-bottom: 1px solid #e5e7eb;
  border-right: 1px solid #e5e7eb;
}
.data-grid td:last-child {
  border-right: none;
}

.data-grid tbody tr:hover td {
  background: #f8fafc;
}

.selected-cell {
  background-color: #e0e7ff !important;
  outline: 1px solid #4f46e5;
  outline-offset: -1px;
}
.selected-cell input, .selected-cell select {
  background-color: transparent !important;
}

.p-0 {
  padding: 0;
}

.col-num {
  min-width: 50px;
  background: #f9fafb;
  font-weight: 600;
  color: #6b7280;
  font-size: 13px;
  position: sticky;
  left: 40px; /* offset by col-action */
  z-index: 5;
  border-right: 2px solid #e5e7eb !important;
}
.data-grid th.col-num {
  z-index: 20;
}

.col-action {
  min-width: 40px;
  background: #f9fafb;
  position: sticky;
  left: 0;
  z-index: 5;
  border-right: 1px solid #e5e7eb;
}
.data-grid th.col-action {
  z-index: 20;
  font-size: 11px;
  color: #9ca3af;
}

.btn-delete-row {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  color: #9ca3af;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 0;
}
.btn-delete-row:hover {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #ef4444;
}

.select-input {
  min-width: 100px;
}

.text-center {
  text-align: center;
}

.grid-input {
  border: none;
  outline: none;
  background: transparent;
  color: #111827;
}

.grid-input::placeholder {
  color: #9ca3af;
  font-size: 12px;
}

.grid-input:focus {
  background: #eff6ff;
  box-shadow: inset 0 0 0 2px #4f46e5;
}

.grid-actions {
  padding: 16px;
  display: flex;
  justify-content: center;
  background: #fff;
  border-top: 1px solid #e5e7eb;
}

.btn-add-row {
  padding: 10px 24px;
  background: white;
  border: 1px dashed #9ca3af;
  border-radius: 8px;
  color: #4b5563;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-add-row:hover {
  border-color: #4f46e5;
  color: #4f46e5;
  background: #eff6ff;
}
</style>
