<script setup>
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import axios from 'axios';

const props = defineProps({
  isOpen: Boolean,
  settlementId: Number,
  initialData: Object
});
const emit = defineEmits(['close', 'save']);

const {
  siteOptions,
  typeOptions,
  fetchSiteOptions,
  fetchTypeOptions
} = useApi();

const activeTab = ref('statement');

const editData = ref({
  siteName: '',
  type: '01001',
  target_month: '',
  statement_data: [],
  details_data: []
});

watch(() => props.isOpen, async (newVal) => {
  if (newVal) {
    if (props.initialData) {
      const data = JSON.parse(JSON.stringify(props.initialData));
      editData.value = {
        ...data,
        statement_data: data.statement_data || [],
        details_data: data.details_data || []
      };
    }
    activeTab.value = props.initialData?.defaultTab || 'statement';

    try {
      if (siteOptions.value.length === 0) {
        await fetchSiteOptions();
      }
      if (typeOptions.value.length === 0) {
        await fetchTypeOptions();
      }
    } catch (e) {
      console.error('옵션 목록을 불러오는 중 에러:', e);
    }
  }
});

const addStatementRow = () => {
  editData.value.statement_data.push({ category: '', item: '', price: 0, count: 1, note: '' });
};

const addDetailRow = () => {
  editData.value.details_data.push({
    name: '',
    position: '',
    birth_date: '',
    inDate: '',
    outDate: '',
    basic_pay: 0,
    deduction: 0,
    note: ''
  });
};

const removeRow = (type, index) => {
  if (confirm('해당 행을 삭제하시겠습니까?')) {
    if (type === 'S') editData.value.statement_data.splice(index, 1);
    if (type === 'D') editData.value.details_data.splice(index, 1);
  }
};

const totalStatementAmount = computed(() => {
  return editData.value.statement_data.reduce((sum, row) => sum + (Number(row.price || 0) * Number(row.count || 0)), 0);
});

const totalDetailsAmount = computed(() => {
  return editData.value.details_data.reduce((sum, row) => sum + (Number(row.basic_pay || 0) - Number(row.deduction || 0)), 0);
});

const handleSave = async () => {
  if (!editData.value.siteName) return alert('현장을 선택해주세요.');

  try {
    const payload = {
      siteName: editData.value.siteName,
      type: editData.value.type,
      target_month: editData.value.target_month,
      total_amount: totalStatementAmount.value,
      statement_data: editData.value.statement_data,
      details_data: editData.value.details_data
    };

    if (props.settlementId) {
      await axios.put(`/api/v1/settlements/${props.settlementId}`, payload);
    } else {
      await axios.post('/api/v1/settlements', payload);
    }

    alert('저장되었습니다.');
    emit('save');
    emit('close');
  } catch (error) {
    console.error('저장 실패:', error);
    alert('저장 중 오류가 발생했습니다.');
  }
};

const downloadExcel = async () => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('정산내역서', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }
    }
  });

  ws.columns = [
    { key: 'A', width: 6 }, { key: 'B', width: 12 }, { key: 'C', width: 12 }, { key: 'D', width: 15 },
    { key: 'E', width: 15 }, { key: 'F', width: 15 }, { key: 'G', width: 15 }, { key: 'H', width: 15 },
    { key: 'I', width: 15 }, { key: 'J', width: 15 }, { key: 'K', width: 20 },
  ];

  ws.addRow([]); ws.addRow([]); ws.addRow([]);

  const headerRow = ws.addRow(['', '서울시 강서구 공항대로 325 에이스빌딩 7층  TEL. 02)355-3322   FAX. 02)355-3318']);
  ws.mergeCells('B4:K4');
  headerRow.font = { bold: true, size: 11 };
  headerRow.alignment = { horizontal: 'center' };

  ws.addRow(['', `문서번호 : 에코그린 202X-XX-09호`]);
  ws.addRow(['', `시행일자 : ${editData.value.target_month.replace('-', '. ')}.`]);

  const selectedSite = siteOptions.value.find(s => s.idx === editData.value.siteName);
  const siteNameText = selectedSite ? selectedSite.name : '알수없음';

  ws.addRow(['', `수    신 : ${siteNameText} 관리사무소`]);

  const selectedType = typeOptions.value.find(t => t.code === editData.value.type);
  const typeNameText = selectedType ? selectedType.name : editData.value.type;

  const titleRow = ws.addRow(['', `제    목 : ${editData.value.target_month} ${typeNameText}용역비 청구의 건`]);
  titleRow.font = { bold: true, size: 12 };

  ws.addRow([]);
  ws.addRow(['', '       1. 귀 소의 무궁한 발전을 기원합니다.']);
  ws.addRow(['', `       2. 당월 ${typeNameText}용역비를 아래와 같이 첨부하오니 검토하시여 결재를 부탁드립니다.`]);
  ws.addRow([]);

  const subTitleRow = ws.addRow(['', '- 아    래 -']);
  ws.mergeCells('B13:K13');
  subTitleRow.alignment = { horizontal: 'center' };
  ws.addRow([]);

  const stmtHeader = ws.addRow(['', '구분', '항목', '단가(금액)', '인원/수량', '소계', '비고']);
  ws.mergeCells('G15:K15');

  stmtHeader.eachCell((cell, colNumber) => {
    if (colNumber >= 2) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    }
  });

  let statementTotal = 0;
  editData.value.statement_data.forEach((row) => {
    const subTotal = (Number(row.price || 0) * Number(row.count || 0));
    statementTotal += subTotal;

    const dataRow = ws.addRow(['', row.category, row.item, row.price, row.count, subTotal, row.note]);
    ws.mergeCells(`G${dataRow.number}:K${dataRow.number}`);

    dataRow.eachCell((cell, colNumber) => {
      if (colNumber >= 2) {
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { vertical: 'middle' };
        if (colNumber === 4 || colNumber === 5 || colNumber === 6) {
          cell.alignment = { horizontal: 'right' };
          cell.numFmt = '#,##0';
        } else {
          cell.alignment = { horizontal: 'center' };
        }
      }
    });
  });

  const totalRow = ws.addRow(['', '총 계', '', '', '', statementTotal, '']);
  ws.mergeCells(`B${totalRow.number}:E${totalRow.number}`);
  ws.mergeCells(`G${totalRow.number}:K${totalRow.number}`);

  totalRow.eachCell((cell, colNumber) => {
    if (colNumber >= 2) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
      cell.font = { bold: true, color: { argb: 'FFFF0000' } };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      if (colNumber === 6) cell.numFmt = '#,##0';
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });

  const currentRows = ws.rowCount;
  const targetSecondPageRow = 50;

  if (currentRows < targetSecondPageRow) {
    for (let i = currentRows; i < targetSecondPageRow; i++) {
      ws.addRow([]);
    }
  } else {
    ws.addRow([]); ws.addRow([]); ws.addRow([]);
  }

  const dtlTitleRow = ws.addRow(['', `[ ${editData.value.target_month} ${typeNameText} 개인별 세부 정산내역서 ]`]);
  dtlTitleRow.font = { bold: true, size: 14 };
  ws.addRow([]);

  const dtlHeader = ws.addRow(['NO', '이름', '직책', '생년월일', '입사일', '총 급여(A)', '공제액(B)', '실수령액(A-B)', '비고']);
  ws.mergeCells(`I${dtlHeader.number}:K${dtlHeader.number}`);

  dtlHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });

  editData.value.details_data.forEach((row, idx) => {
    const netPay = (Number(row.basic_pay || 0) - Number(row.deduction || 0));
    const dtlRow = ws.addRow([
      idx + 1,
      row.name,
      row.position,
      row.birth_date,
      row.inDate,
      row.outDate,
      row.basic_pay,
      row.deduction,
      netPay,
      row.note
    ]);
    ws.mergeCells(`I${dtlRow.number}:K${dtlRow.number}`);

    dtlRow.eachCell((cell, colNumber) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (colNumber >= 6 && colNumber <= 8) {
        cell.alignment = { horizontal: 'right' };
        cell.numFmt = '#,##0';
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${siteNameText}_${editData.value.target_month}_청구서.xlsx`);
};

</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <!-- 모달 헤더 -->
      <div class="modal-header">
        <div class="header-title">
          <i class="mdi mdi-file-document-edit"></i>
          <h2>{{ settlementId ? '정산서 수정' : '새 정산서 작성' }}</h2>
        </div>
        <button @click="$emit('close')" class="btn-close">
          <i class="mdi mdi-close"></i>
        </button>
      </div>

      <!-- 입력 필드 -->
      <div class="info-panel">
        <div class="info-group">
          <label class="info-label">
            <i class="mdi mdi-calendar"></i>
            청구 연월
          </label>
          <input type="month" v-model="editData.target_month" class="info-input" />
        </div>

        <div class="info-group">
          <label class="info-label">
            <i class="mdi mdi-office-building"></i>
            현장명
          </label>
          <select v-model="editData.siteName" class="info-select">
            <option value="" disabled>현장 선택</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
              {{ site.name }}
            </option>
          </select>
        </div>

        <div class="info-group">
          <label class="info-label">
            <i class="mdi mdi-tag"></i>
            구분
          </label>
          <select v-model="editData.type" class="info-select">
            <option v-for="type in typeOptions" :key="type.itemCd" :value="type.itemCd">
              {{ type.itemNm }}
            </option>
          </select>
        </div>
      </div>

      <!-- 탭 메뉴 -->
      <div class="tab-nav">
        <button
            :class="['tab-btn', { active: activeTab === 'statement' }]"
            @click="activeTab = 'statement'"
        >
          <i class="mdi mdi-file-document"></i>
          <span>정산서 (총괄)</span>
        </button>
        <button
            :class="['tab-btn', { active: activeTab === 'details' }]"
            @click="activeTab = 'details'"
        >
          <i class="mdi mdi-account-group"></i>
          <span>세부내역서 (인원별)</span>
        </button>
      </div>

      <!-- 탭 컨텐츠 -->
      <div class="modal-body">
        <!-- 정산서 탭 -->
        <div v-show="activeTab === 'statement'" class="tab-content">
          <div class="table-header">
            <div class="table-title">
              <i class="mdi mdi-format-list-bulleted"></i>
              <span>정산 항목 ({{ editData.statement_data.length }}개)</span>
            </div>
            <button @click="addStatementRow" class="btn-add-row">
              <i class="mdi mdi-plus"></i>
              <span>항목 추가</span>
            </button>
          </div>

          <div class="table-scroll">
            <table class="data-table">
              <thead>
              <tr>
                <th style="width: 15%;">구분</th>
                <th style="width: 20%;">항목</th>
                <th style="width: 15%;">단가(금액)</th>
                <th style="width: 10%;">인원/수량</th>
                <th style="width: 15%;">소계</th>
                <th style="width: 18%;">비고</th>
                <th style="width: 7%;">관리</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="(row, idx) in editData.statement_data" :key="'stmt-' + idx" class="data-row">
                <td>
                  <input
                      v-model="row.category"
                      placeholder="직접노무비"
                      class="cell-input"
                  />
                </td>
                <td>
                  <input
                      v-model="row.item"
                      placeholder="기본급"
                      class="cell-input"
                  />
                </td>
                <td>
                  <input
                      type="number"
                      v-model.number="row.price"
                      class="cell-input text-right"
                      placeholder="0"
                  />
                </td>
                <td>
                  <input
                      type="number"
                      v-model.number="row.count"
                      step="0.01"
                      class="cell-input text-center"
                      placeholder="1"
                  />
                </td>
                <td class="calc-cell">
                  {{ (row.price * row.count).toLocaleString() }}
                </td>
                <td>
                  <input
                      v-model="row.note"
                      placeholder="산출근거"
                      class="cell-input"
                  />
                </td>
                <td class="action-cell">
                  <button @click="removeRow('S', idx)" class="btn-remove">
                    <i class="mdi mdi-delete"></i>
                  </button>
                </td>
              </tr>

              <tr v-if="editData.statement_data.length === 0" class="empty-row">
                <td colspan="7">
                  <div class="empty-state">
                    <i class="mdi mdi-file-plus-outline"></i>
                    <p>항목을 추가해주세요</p>
                  </div>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 세부내역서 탭 -->
        <div v-show="activeTab === 'details'" class="tab-content">
          <div class="table-header">
            <div class="table-title">
              <i class="mdi mdi-account-multiple"></i>
              <span>인원 목록 ({{ editData.details_data.length }}명)</span>
            </div>
            <button @click="addDetailRow" class="btn-add-row">
              <i class="mdi mdi-plus"></i>
              <span>인원 추가</span>
            </button>
          </div>

          <div class="table-scroll">
            <table class="data-table">
              <thead>
              <tr>
                <th style="width: 10%;">이름</th>
                <th style="width: 10%;">직책</th>
                <th style="width: 12%;">생년월일</th>
                <th style="width: 12%;">입사일</th>
                <th style="width: 12%;">퇴사일</th>
                <th style="width: 13%;">총 급여(A)</th>
                <th style="width: 13%;">공제액(B)</th>
                <th style="width: 13%;">실수령액</th>
                <th style="width: 10%;">비고</th>
                <th style="width: 5%;">관리</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="(row, idx) in editData.details_data" :key="'dtl-' + idx" class="data-row">
                <td>
                  <input
                      v-model="row.name"
                      placeholder="홍길동"
                      class="cell-input"
                  />
                </td>
                <td>
                  <input
                      v-model="row.position"
                      placeholder="반장"
                      class="cell-input"
                  />
                </td>
                <td>
                  <input
                      v-model="row.birth_date"
                      placeholder="YYMMDD"
                      class="cell-input text-center"
                  />
                </td>
                <td>
                  <input
                      type="date"
                      v-model="row.inDate"
                      class="cell-input"
                  />
                </td>
                <td>
                  <input
                      type="date"
                      v-model="row.outDate"
                      class="cell-input"
                  />
                </td>
                <td>
                  <input
                      type="number"
                      v-model.number="row.basic_pay"
                      class="cell-input text-right"
                      placeholder="0"
                  />
                </td>
                <td>
                  <input
                      type="number"
                      v-model.number="row.deduction"
                      class="cell-input text-right"
                      placeholder="0"
                  />
                </td>
                <td class="calc-cell">
                  {{ (row.basic_pay - row.deduction).toLocaleString() }}
                </td>
                <td>
                  <input
                      v-model="row.note"
                      placeholder="메모"
                      class="cell-input"
                  />
                </td>
                <td class="action-cell">
                  <button @click="removeRow('D', idx)" class="btn-remove">
                    <i class="mdi mdi-delete"></i>
                  </button>
                </td>
              </tr>

              <tr v-if="editData.details_data.length === 0" class="empty-row">
                <td colspan="10">
                  <div class="empty-state">
                    <i class="mdi mdi-account-plus-outline"></i>
                    <p>인원을 추가해주세요</p>
                  </div>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 모달 푸터 -->
      <div class="modal-footer">
        <div class="footer-left">
          <div class="total-info">
            <span class="total-label">총 청구금액</span>
            <span class="total-amount">{{ totalStatementAmount.toLocaleString() }}원</span>
          </div>
        </div>

        <div class="footer-actions">
          <button @click="downloadExcel" class="btn-excel">
            <i class="mdi mdi-microsoft-excel"></i>
            <span>엑셀 다운로드</span>
          </button>
          <button @click="$emit('close')" class="btn-cancel">
            <i class="mdi mdi-close"></i>
            <span>취소</span>
          </button>
          <button @click="handleSave" class="btn-save">
            <i class="mdi mdi-check"></i>
            <span>저장하기</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Material Design Icons */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 모달 오버레이 === */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* === 모달 컨테이너 === */
.modal-container {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 1400px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.3s;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* === 모달 헤더 === */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px 16px 0 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  color: white;
}

.header-title i {
  font-size: 28px;
}

.header-title h2 {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
}

.btn-close {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-close i {
  font-size: 24px;
}

/* === 정보 패널 === */
.info-panel {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  padding: 24px 28px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.info-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.info-label i {
  font-size: 16px;
  color: #667eea;
}

.info-input,
.info-select {
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  color: #1e293b;
  font-weight: 500;
  transition: all 0.2s;
  background: white;
}

.info-input:focus,
.info-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* === 탭 네비게이션 === */
.tab-nav {
  display: flex;
  padding: 0 28px;
  background: white;
  border-bottom: 2px solid #e2e8f0;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.2s;
  position: relative;
  margin-bottom: -2px;
}

.tab-btn:hover {
  color: #667eea;
}

.tab-btn.active {
  color: #667eea;
  border-bottom-color: #667eea;
}

.tab-btn i {
  font-size: 18px;
}

/* === 모달 바디 === */
.modal-body {
  flex: 1;
  overflow: hidden;
  padding: 24px 28px;
  background: white;
}

.tab-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.table-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}

.table-title i {
  font-size: 20px;
  color: #667eea;
}

.btn-add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.btn-add-row:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-add-row i {
  font-size: 16px;
}

/* === 테이블 스크롤 === */
.table-scroll {
  flex: 1;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.table-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.table-scroll::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.table-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

/* === 데이터 테이블 === */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.data-table th {
  padding: 14px 12px;
  color: white;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.data-table td {
  padding: 0;
  border-bottom: 1px solid #f1f5f9;
}

.data-row:hover {
  background: #f8fafc;
}

/* === 셀 입력 === */
.cell-input {
  width: 100%;
  border: none;
  padding: 12px;
  font-size: 14px;
  color: #1e293b;
  background: transparent;
  outline: none;
  transition: background 0.2s;
}

.cell-input:focus {
  background: #eff6ff;
}

.cell-input::placeholder {
  color: #cbd5e1;
}

/* 텍스트 정렬 */
.text-right {
  text-align: right;
}

.text-center {
  text-align: center;
}

/* === 계산 셀 === */
.calc-cell {
  padding: 12px !important;
  font-weight: 700;
  color: #059669;
  background: #f0fdf4;
  text-align: right;
  border-bottom: 1px solid #f1f5f9;
}

/* === 액션 셀 === */
.action-cell {
  text-align: center;
  padding: 8px !important;
}

.btn-remove {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: #fef2f2;
  color: #ef4444;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  transition: all 0.2s;
}

.btn-remove:hover {
  background: #fee2e2;
}

.btn-remove i {
  font-size: 16px;
}

/* === 빈 상태 === */
.empty-row td {
  padding: 60px 20px !important;
}

.empty-state {
  text-align: center;
  color: #94a3b8;
}

.empty-state i {
  font-size: 48px;
  margin-bottom: 12px;
  display: block;
  opacity: 0.5;
}

.empty-state p {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

/* === 모달 푸터 === */
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 28px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0 0 16px 16px;
}

.footer-left {
  flex: 1;
}

.total-info {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.total-label {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
}

.total-amount {
  font-size: 28px;
  font-weight: 700;
  color: #ef4444;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.btn-excel,
.btn-cancel,
.btn-save {
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

.btn-excel {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}

.btn-excel:hover {
  background: #d1fae5;
}

.btn-cancel {
  background: white;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.btn-cancel:hover {
  background: #f8fafc;
}

.btn-save {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-save:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}

.btn-excel i,
.btn-cancel i,
.btn-save i {
  font-size: 18px;
}

/* === 반응형 === */
@media (max-width: 1200px) {
  .info-panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .modal-container {
    max-width: 100%;
    max-height: 95vh;
  }

  .modal-header,
  .info-panel,
  .modal-body,
  .modal-footer {
    padding-left: 20px;
    padding-right: 20px;
  }

  .tab-nav {
    padding: 0 20px;
  }

  .modal-footer {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }

  .footer-actions {
    width: 100%;
    flex-direction: column;
  }

  .btn-excel,
  .btn-cancel,
  .btn-save {
    width: 100%;
    justify-content: center;
  }

  .total-info {
    justify-content: center;
  }
}
</style>
