<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

definePageMeta({
  layout: 'default'
});

const templates = ref([]);
const fileInput = ref(null);
const isUploading = ref(false);
const showModal = ref(false);

// 업로드 폼 데이터 (정산서, 연차/퇴직금 청구서 2가지만 관리)
const form = ref({
  name: '',
  type: 'SERVICE',
  file: null
});

const fetchTemplates = async () => {
  try {
    const res = await axios.get('/api/v1/settle/template/list');
    templates.value = res.data.data || [];
  } catch (error) {
    console.error('템플릿 목록 로드 실패:', error);
    /*
    if (templates.value.length === 0) {
      templates.value = [
        { idx: 1, name: '에코그린 표준 정산서', docType: '정산서', originalName: 'standard_settlement_v1.xlsx', regDt: '2026-09-13', isDefault: true },
        { idx: 2, name: '에코그린 퇴직금 청구서', docType: '연차/퇴직금 청구서', originalName: 'severance_invoice_v2.xlsx', regDt: '2026-09-10', isDefault: false },
      ];
    }

     */
  }
};

onMounted(() => {
  fetchTemplates();
});

const triggerUpload = () => {
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  form.value = { name: '', type: '정산서', file: null };
  if (fileInput.value) fileInput.value.value = '';
};

const handleFileChange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.name.endsWith('.xlsx')) {
    alert('엑셀(.xlsx) 파일만 업로드 가능합니다.');
    e.target.value = '';
    form.value.file = null;
    return;
  }
  form.value.file = file;
};

const submitUpload = async () => {
  /*
  if (!form.value.name.trim()) {
    alert('템플릿명을 입력해주세요.');
    return;
  }

   */
  if (!form.value.file) {
    alert('엑셀 파일을 첨부해주세요.');
    return;
  }

  const formData = new FormData();
  formData.append('name', form.value.name);
  formData.append('type', form.value.type);
  formData.append('file', form.value.file);

  isUploading.value = true;
  try {
    await axios.post('/api/v1/upload/settle/template', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    // alert(`"${form.value.name}" 템플릿이 등록되었습니다.`);
    alert(`템플릿이 등록되었습니다.`);
    closeModal();
    await fetchTemplates();
  } catch (error) {
    console.error('업로드 실패:', error);
    alert('업로드 중 오류가 발생했습니다.');
  } finally {
    isUploading.value = false;
  }
};

const setDefault = async (id) => {
  try {
    await axios.put(`/api/v1/settle/template/${id}/default`);
    await fetchTemplates();
  } catch (error) {
    console.error('기본 템플릿 설정 실패:', error);
    templates.value.forEach(t => t.isDefault = (t.id === id));
  }
};

const deleteTemplate = async (idx) => {
  if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
  try {
    await axios.delete(`/api/v1/settle/template/${idx}`);
    await fetchTemplates();
  } catch (error) {
    console.error('템플릿 삭제 실패:', error);
    templates.value = templates.value.filter(t => t.id !== id);
  }
};

const copyKeyword = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    alert(`"${text}" 복사 완료.\n엑셀 파일에 붙여넣기(Ctrl+V) 하세요.`);
  } catch (err) {
    console.error('복사 실패', err);
  }
};
</script>

<template>
  <div class="settle-template-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">엑셀 템플릿 양식 관리</h1>
        <p>정산서 및 연차/퇴직금 청구서 생성 시 사용될 엑셀 원본 템플릿을 관리합니다.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" @click="triggerUpload">
          <i class="mdi mdi-upload"></i> 새 템플릿 등록
        </button>
      </div>
    </div>

    <div class="layout-grid">
      <!-- 왼쪽: 템플릿 목록 -->
      <div class="card">
        <div class="card-header">
          <h3>등록된 템플릿 목록</h3>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
            <tr>
              <!--th class="text-center">기본양식</th-->
              <th class="text-center">구분</th>
              <!--th>템플릿명</th-->
              <th>파일명</th>
              <th class="text-center">등록일</th>
              <th class="text-center">관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="tpl in templates" :key="tpl.idx">
              <!--td class="text-center">
                <span v-if="tpl.isDefault" class="badge badge-success">기본</span>
                <button v-else class="btn btn-small btn-outline" @click="setDefault(tpl.id)">기본 설정</button>
              </td-->
              <td class="text-center"><span class="badge badge-light">{{ tpl.docType }}</span></td>
              <!--td class="font-bold">{{ tpl.name }}</td-->
              <td class="text-gray">{{ tpl.originalName }}</td>
              <td class="text-center text-gray">{{ tpl.regDt }}</td>
              <td class="text-center">
                <button class="btn btn-icon btn-danger" @click="deleteTemplate(tpl.idx)" title="삭제">✕</button>
              </td>
            </tr>
            <tr v-if="templates.length === 0">
              <td colspan="6" class="empty-row">등록된 템플릿이 없습니다.</td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 우측: 템플릿 작성 가이드 -->
      <div class="card bg-light">
        <div class="card-header">
          <h3 class="text-primary">템플릿 작성 가이드</h3>
        </div>
        <p class="guide-desc">
          엑셀 빈칸에 아래 키워드를 입력해 두세요.<br>
          <b>키워드 클릭 시 자동으로 복사됩니다.</b>
        </p>

        <div class="guide-scroll-area">
          <div class="guide-section-title">기본 정보 매핑</div>
          <div class="keyword-item" @click="copyKeyword('{{yyyy}}')">
            <!-- v-pre 추가 -->
            <span class="kw-tag" v-pre>{{yyyy}}</span>
            <span class="kw-desc">청구 연도 (예: 2026)</span>
          </div>
          <div class="keyword-item" @click="copyKeyword('{{mm}}')">
            <span class="kw-tag" v-pre>{{mm}}</span>
            <span class="kw-desc">청구 월 (예: 08)</span>
          </div>
          <div class="keyword-item" @click="copyKeyword('{{문서번호}}')">
            <span class="kw-tag" v-pre>{{docNo}}</span>
            <span class="kw-desc">문서번호 (예: 에코-2026-411호)</span>
          </div>
          <div class="keyword-item" @click="copyKeyword('{{총청구금액}}')">
            <span class="kw-tag" v-pre>{{grandTotal}}</span>
            <span class="kw-desc">총 청구 합계 금액</span>
          </div>

          <div class="guide-section-title text-danger mt-4">직원 목록 (다중 행)</div>
          <p class="guide-sub-desc">※ 표 첫 줄에 시작 태그를 넣으면 데이터 개수만큼 줄이 늘어납니다.</p>

          <div class="keyword-item border-danger" @click="copyKeyword('{{#empList}}')">
            <!-- v-pre 추가 -->
            <span class="kw-tag tag-danger" v-pre>{{#empList}}</span>
            <span class="kw-desc">목록 시작점 (A열에 입력)</span>
          </div>
          <div class="keyword-item" @click="copyKeyword('{{empName}}')">
            <span class="kw-tag" v-pre>{{empName}}</span>
            <span class="kw-desc">직원 이름</span>
          </div>
          <div class="keyword-item" @click="copyKeyword('{{netPay}}')">
            <span class="kw-tag" v-pre>{{netPay}}</span>
            <span class="kw-desc">실수령액</span>
          </div>
          <div class="keyword-item border-danger" @click="copyKeyword('{{/empList}}')">
            <span class="kw-tag tag-danger" v-pre>{{/empList}}</span>
            <span class="kw-desc">목록 종료점 (마지막 열에 입력)</span>
          </div>
        </div>

        <div class="info-box">
          <strong>※ 주의사항</strong>
          <ul>
            <li>엑셀 수식(SUM 등)은 유지됩니다.</li>
            <li>글꼴, 병합된 셀 모두 원본대로 출력됩니다.</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 모달 -->
    <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal-window">
        <div class="modal-header">
          <h3>새 템플릿 등록</h3>
          <button class="close-btn" @click="closeModal">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>구분 <span class="required">*</span></label>
            <select v-model="form.type" class="form-control">
              <option value="SERVICE">정산서</option>
              <option value="RETIRE_ANNUAL">연차/퇴직금 청구서</option>
            </select>
          </div>
          <!--div class="form-group">
            <label>템플릿명 <span class="required">*</span></label>
            <input type="text" v-model="form.name" class="form-control" placeholder="예: 2026 에코그린 정산서 양식" />
          </div-->
          <div class="form-group">
            <label>엑셀 원본 첨부(.xlsx) <span class="required">*</span></label>
            <div class="file-drop-area">
              <input type="file" ref="fileInput" @change="handleFileChange" accept=".xlsx" class="file-input" />
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeModal">취소</button>
          <button class="btn btn-primary" @click="submitUpload" :disabled="isUploading">
            {{ isUploading ? '업로드 중...' : '등록 완료' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
}

@media (max-width: 1024px) {
  .layout-grid { grid-template-columns: 1fr; }
}

/* 카드 UI */
.card {
  background-color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.card.bg-light {
  background-color: #f8fafc;
}

.card-header h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 20px 0;
  color: #1e293b;
}

.text-primary { color: #2563eb !important; }
.text-danger { color: #dc2626 !important; }
.text-gray { color: #64748b; }
.font-bold { font-weight: 600; }
.mt-4 { margin-top: 16px; }

/* 공통 버튼 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #2563eb;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background-color: #1d4ed8;
}

.btn-outline {
  background-color: #ffffff;
  border: 1px solid #cbd5e1;
  color: #475569;
}

.btn-outline:hover {
  background-color: #f1f5f9;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 6px;
}

.btn-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  background-color: #fee2e2;
  color: #dc2626;
}

.btn-icon:hover {
  background-color: #fca5a5;
  color: #991b1b;
}

/* 뱃지 */
.badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.badge-success { background-color: #dcfce7; color: #166534; }
.badge-light { background-color: #f1f5f9; color: #475569; }

/* 테이블 */
.table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.data-table th, .data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 14px;
}

.data-table th {
  background-color: #f8fafc;
  font-weight: 600;
  color: #475569;
}

.data-table tbody tr:hover {
  background-color: #f1f5f9;
}
.empty-row { text-align: center; padding: 40px !important; color: #94a3b8; }

/* 우측 가이드 영역 */
.guide-desc {
  font-size: 13px;
  color: #475569;
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.guide-scroll-area {
  flex: 1;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 스크롤바 커스텀 */
.guide-scroll-area::-webkit-scrollbar { width: 6px; }
.guide-scroll-area::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
.guide-scroll-area::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.guide-scroll-area::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

.guide-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  margin-top: 8px;
}

.guide-sub-desc {
  font-size: 11px;
  color: #94a3b8;
  margin: -6px 0 6px 0;
}

.keyword-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.keyword-item:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
  transform: translateY(-1px);
}

.keyword-item.border-danger:hover {
  border-color: #dc2626;
  box-shadow: 0 2px 4px rgba(220, 38, 38, 0.1);
}

.kw-tag {
  background-color: #eff6ff;
  color: #2563eb;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
  font-size: 13px;
}

.tag-danger {
  background-color: #fef2f2;
  color: #dc2626;
}

.kw-desc {
  font-size: 13px;
  color: #334155;
}

.info-box {
  margin-top: 24px;
  padding: 16px;
  background-color: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  font-size: 13px;
}

.info-box strong {
  color: #b45309;
  display: block;
  margin-bottom: 8px;
}

.info-box ul {
  margin: 0;
  padding-left: 20px;
  color: #92400e;
  line-height: 1.6;
}

/* 모달 */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-window {
  background-color: #ffffff;
  width: 100%;
  max-width: 480px;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  animation: modalIn 0.2s ease-out;
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
}

.close-btn:hover { color: #0f172a; }

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.required { color: #dc2626; }

.form-control {
  padding: 12px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 14px;
  color: #334155;
  outline: none;
  transition: border-color 0.2s;
}

.form-control:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.file-drop-area {
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  background-color: #f8fafc;
  transition: all 0.2s;
}

.file-drop-area:hover {
  border-color: #94a3b8;
  background-color: #f1f5f9;
}

.file-input {
  width: 100%;
  font-size: 14px;
  color: #64748b;
}

.modal-footer {
  padding: 16px 24px;
  background-color: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>