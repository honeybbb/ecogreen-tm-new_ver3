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

// useApi()에서 필요한 상태와 함수 가져오기
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

// 💡 핵심 해결부분: 모달이 열릴 때(isOpen === true) API를 호출합니다.
watch(() => props.isOpen, async (newVal) => {
  if (newVal) {
    // 1. 기존 데이터 복사 (원본 훼손 방지)
    if (props.initialData) {
      const data = JSON.parse(JSON.stringify(props.initialData));
      editData.value = {
        ...data,
        statement_data: data.statement_data || [],
        details_data: data.details_data || []
      };
    }
    activeTab.value = 'statement';

    // 2. 모달이 화면에 뜨는 시점에 안전하게 API를 호출합니다!
    // (이미 옵션 목록을 불러왔다면 중복 호출하지 않도록 방어 코드 추가)
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

// === 정산서(총괄) 행 제어 ===
const addStatementRow = () => {
  editData.value.statement_data.push({ category: '', item: '', price: 0, count: 1, note: '' });
};

// === 내역서(인원별) 행 제어 ===
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

// 공통 행 삭제
const removeRow = (type, index) => {
  if (confirm('해당 행을 삭제하시겠습니까?')) {
    if (type === 'S') editData.value.statement_data.splice(index, 1);
    if (type === 'D') editData.value.details_data.splice(index, 1);
  }
};

// 정산서 실시간 총계 계산
const totalStatementAmount = computed(() => {
  return editData.value.statement_data.reduce((sum, row) => sum + (Number(row.price || 0) * Number(row.count || 0)), 0);
});

// 서버 저장 로직 (Axios 직접 호출)
const handleSave = async () => {
  if (!editData.value.siteName) return alert('단지명을 선택해주세요.');

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

// 엑셀 다운로드 함수
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

  // 현장명 텍스트 추출 (siteOptions에서 매칭)
  const selectedSite = siteOptions.value.find(s => s.idx === editData.value.siteName);
  const siteNameText = selectedSite ? selectedSite.name : '알수없음';

  ws.addRow(['', `수    신 : ${siteNameText} 관리사무소`]);

  // 구분명 텍스트 추출 (청소/경비 등)
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
    <div class="modal-content">

      <header class="modal-header">
        <div class="header-inputs">
          <input v-model="editData.target_month" type="month" class="input-month" />
          <select v-model="editData.type" class="input-select">
            <option v-for="type in typeOptions">{{ type.itemNm }}</option>
          </select>
          <!--input v-model="editData.siteName" placeholder="단지명 (예: 쌍용플래티넘고산)" class="input-complex" /-->
          <select v-model="editData.siteName" class="site-select">
            <option value="" disabled>현장 선택</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
              {{ site.name }}
            </option>
          </select>
        </div>
        <button @click="$emit('close')" class="close-btn">✕</button>
      </header>

      <div class="tab-menu">
        <button :class="{ active: activeTab === 'statement' }" @click="activeTab = 'statement'">
          📋 정산서
        </button>
        <button :class="{ active: activeTab === 'details' }" @click="activeTab = 'details'">
          🧑‍🤝‍🧑 세부내역서
        </button>
      </div>

      <div class="modal-body">

        <div v-show="activeTab === 'statement'" class="tab-content">
          <table class="data-table">
            <thead>
            <tr>
              <th width="15%">구분</th>
              <th width="20%">항목</th>
              <th width="15%">단가(금액)</th>
              <th width="10%">인원/수량</th>
              <th width="15%">소계</th>
              <th width="18%">비고</th>
              <th width="7%">관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(row, idx) in editData.statement_data" :key="'stmt-'+idx">
              <td><input v-model="row.category" placeholder="직접노무비" /></td>
              <td><input v-model="row.item" placeholder="기본급" /></td>
              <td><input type="number" v-model.number="row.price" class="text-right" /></td>
              <td><input type="number" v-model.number="row.count" step="0.01" class="text-center" /></td>
              <td class="text-right calc-cell">{{ (row.price * row.count).toLocaleString() }}</td>
              <td><input v-model="row.note" placeholder="산출근거 등" /></td>
              <td class="text-center"><button @click="removeRow('S', idx)" class="del-btn">삭제</button></td>
            </tr>
            </tbody>
          </table>
          <button @click="addStatementRow" class="add-row-btn">+ 정산 항목 추가</button>
        </div>

        <div v-show="activeTab === 'details'" class="tab-content">
          <table class="data-table">
            <thead>
            <tr>
              <th>이름</th>
              <th>직책</th>
              <th>생년월일</th>
              <th>입사일</th>
              <th>퇴사일</th>
              <th>총 급여(A)</th>
              <th>공제액(B)</th>
              <th>지급금액(A-B)</th>
              <th>비고</th>
              <th>관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(row, idx) in editData.details_data" :key="'dtl-'+idx">
              <td><input v-model="row.name" placeholder="홍길동" /></td>
              <td><input v-model="row.position" placeholder="반장" /></td>
              <td><input v-model="row.birth_date" placeholder="YYMMDD" /></td>
              <td><input type="date" v-model="row.inDate" /></td>
              <td><input type="date" v-model="row.outDate" /></td>
              <td><input type="number" v-model.number="row.basic_pay" class="text-right" /></td>
              <td><input type="number" v-model.number="row.deduction" class="text-right" /></td>
              <td class="text-right calc-cell">{{ (row.basic_pay - row.deduction).toLocaleString() }}</td>
              <td><input v-model="row.note" /></td>
              <td class="text-center"><button @click="removeRow('D', idx)" class="del-btn">삭제</button></td>
            </tr>
            </tbody>
          </table>
          <button @click="addDetailRow" class="add-row-btn">+ 인원 추가</button>
        </div>

      </div>

      <footer class="modal-footer">
        <div class="total-summary">
          총 청구 금액 : <span class="highlight">{{ totalStatementAmount.toLocaleString() }}</span> 원
        </div>
        <div class="footer-btns">
          <button @click="downloadExcel" class="excel-btn">📊 엑셀 다운로드</button>
          <button @click="$emit('close')" class="cancel-btn">취소</button>
          <button @click="handleSave" class="save-btn">저장하기</button>
        </div>
      </footer>

    </div>


  </div>
</template>

<style scoped>
/* 모달 배경 및 컨테이너 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(17, 24, 39, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(2px); }
.modal-content { background: #fff; width: 95%; max-width: 1300px; height: 90vh; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; }

/* 헤더 */
.modal-header { padding: 20px 25px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
.header-inputs { display: flex; gap: 10px; flex: 1; }
.input-month, .input-select, .input-complex { padding: 10px 15px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 16px; font-weight: 600; color: #1e293b; outline: none; }
.input-complex { flex: 0.5; }
.input-complex:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.close-btn { background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer; }
.close-btn:hover { color: #0f172a; }

/* 탭 메뉴 */
.tab-menu { display: flex; padding: 0 25px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.tab-menu button { padding: 15px 25px; border: none; background: none; font-size: 15px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 3px solid transparent; transition: 0.2s; }
.tab-menu button:hover { color: #3b82f6; }
.tab-menu button.active { color: #3b82f6; border-bottom-color: #3b82f6; }

/* 바디 및 테이블 */
.modal-body { flex: 1; overflow-y: auto; padding: 25px; background: #fff; }
.data-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
.data-table th { background: #f1f5f9; padding: 12px; font-size: 13px; color: #475569; border: 1px solid #e2e8f0; font-weight: 700; text-align: center; }
.data-table td { border: 1px solid #e2e8f0; padding: 0; }
.data-table input { width: 100%; border: none; padding: 12px 10px; font-size: 14px; color: #0f172a; box-sizing: border-box; outline: none; background: transparent; }
.data-table input:focus { background: #eff6ff; }

/* 유틸리티 클래스 */
.text-right { text-align: right; }
.text-center { text-align: center; }
.calc-cell { padding: 0 15px !important; font-weight: 700; color: #334155; background: #f8fafc; }
.del-btn { padding: 6px 12px; background: #fee2e2; color: #ef4444; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
.del-btn:hover { background: #fecaca; }

/* 추가 버튼 */
.add-row-btn { width: 100%; padding: 12px; border: 1px dashed #cbd5e1; background: #f8fafc; color: #64748b; font-weight: 600; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.add-row-btn:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }

/* 푸터 */
.modal-footer { padding: 20px 25px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
.total-summary { font-size: 18px; font-weight: 600; color: #475569; }
.total-summary .highlight { font-size: 26px; color: #ef4444; font-weight: 800; }
.footer-btns { display: flex; gap: 10px; }
.cancel-btn { padding: 12px 24px; border: 1px solid #cbd5e1; background: #fff; color: #475569; border-radius: 8px; font-weight: 600; cursor: pointer; }
.save-btn { padding: 12px 30px; border: none; background: #00dc82; color: #fff; border-radius: 8px; font-weight: 700; font-size: 16px; cursor: pointer; box-shadow: 0 4px 6px rgba(0, 220, 130, 0.2); }
.save-btn:hover { background: #00c373; }

/* 엑셀 다운로드 버튼 스타일 */
.excel-btn {
  padding: 12px 20px;
  border: 1px solid #10b981;
  background: #ecfdf5;
  color: #047857;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.2s;
}
.excel-btn:hover {
  background: #d1fae5;
}
</style>
