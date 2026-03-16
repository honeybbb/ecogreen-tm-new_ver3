<script setup>
/**
 * RetireAnnualModal.vue — 퇴직금·연차 정산 요청서 모달
 *
 * [업데이트 내용]
 * - 연차수당 / 퇴직수당 표를 동적으로 껐다 켤 수 있는 기능 추가 (hasAnnual, hasRetire)
 * - 필요 없는 표는 '표 삭제' 버튼으로 화면 및 전송 데이터에서 제외 가능
 * - 활성화된 표의 합계만 grandTotal 및 payload에 반영되도록 로직 수정
 */
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '~/stores/auth.js';

const { siteOptions, typeOptions, fetchSiteOptions, fetchTypeOptions } = useApi();
const authStore = useAuthStore();

const props = defineProps({
  isOpen:       Boolean,
  settlementId: Number,
  initialData:  Object,
});
const emit = defineEmits(['close', 'save']);

// ── 기본 행 템플릿 ─────────────────────────────────────
const newItem = (type) => ({
  itemType:     type, // 'ANNUAL' 또는 'RETIRE'
  empName:      '',
  position:     '',
  birthDt:      '',
  joinDate:     '',
  endDate:      '',
  middleDt:     '',
  period:       '',
  basis:        '',
  amount:       0,
  note:         '',
  usageHistory: '',
});

// ── 테이블 활성화 상태 관리 ─────────────────────────────
const hasAnnual = ref(false);
const hasRetire = ref(false);

// ── 폼 데이터 ─────────────────────────────────────────
const formData = ref({
  sIdx:         '',
  siteName:     '',
  type:         '',
  target_month: '',
  docNo:        '',
  billingDt:    '',
  summary:      '연차 및 퇴직수당 정산요청의 건',
  bankInfo:     '301-051564-01-017(기업은행, 예금주: 에코그린티엠)',
  attachment:   '1. 전자 계산서',
  annualItems:  [newItem('ANNUAL')],
  retireItems:  [newItem('RETIRE')],
});

// ── 폼 초기화 ─────────────────────────────────────────
const initForm = () => {
  if (props.initialData && Object.keys(props.initialData).length > 0) {
    const src = props.initialData;
    const bd  = src.billingData || {};

    let loadedAnnual = [];
    let loadedRetire = [];

    if (Array.isArray(src.payrollData)) {
      loadedAnnual = src.payrollData
          .filter(row => row.itemType === 'ANNUAL' || !row.itemType)
          .map(row => ({
            itemType:     'ANNUAL',
            empName:      row.empName      || '',
            position:     row.position     || '',
            birthDt:      row.birthDt      || '',
            joinDate:     row.joinDate     || '',
            endDate:      row.endDate      || '',
            middleDt:     row.middleDt     || '',
            period:       row.period       || '',
            basis:        row.basis        || '',
            amount:       row.amount       || 0,
            note:         row.note         || '',
            usageHistory: row.usageHistory || '',
          }));

      loadedRetire = src.payrollData
          .filter(row => row.itemType === 'RETIRE')
          .map(row => ({
            itemType:     'RETIRE',
            empName:      row.empName      || '',
            position:     row.position     || '',
            birthDt:      row.birthDt      || '',
            joinDate:     row.joinDate     || '',
            endDate:      row.endDate      || '',
            middleDt:     row.middleDt     || '',
            period:       row.period       || '',
            basis:        row.basis        || '',
            amount:       row.amount       || 0,
            note:         row.note         || '',
            usageHistory: row.usageHistory || '',
          }));
    }

    // 데이터가 있는 테이블만 활성화
    hasAnnual.value = loadedAnnual.length > 0;
    hasRetire.value = loadedRetire.length > 0;

    formData.value = {
      sIdx:         src.sIdx       || '',
      siteName:     src.siteName   || '',
      type:         src.type       || '',
      target_month: '',
      docNo:        src.docNo      || '',
      billingDt:    src.billingDt  || '',
      summary:      bd.summary     || '연차 및 퇴직수당 정산요청의 건',
      bankInfo:     bd.bankInfo    || '301-051564-01-017(기업은행, 예금주: 에코그린티엠)',
      attachment:   bd.attachment  || '1. 전자 계산서',
      annualItems:  loadedAnnual.length > 0 ? loadedAnnual : [newItem('ANNUAL')],
      retireItems:  loadedRetire.length > 0 ? loadedRetire : [newItem('RETIRE')],
    };
  } else {
    // 신규 작성 시 기본적으로 두 테이블 모두 미노출 상태로 시작 (원하는 것만 추가하도록)
    hasAnnual.value = false;
    hasRetire.value = false;

    formData.value = {
      sIdx: '', siteName: '', type: '', docNo: '', billingDt: '',
      summary: '연차 및 퇴직수당 정산요청의 건',
      bankInfo: '301-051564-01-017(기업은행, 예금주: 에코그린티엠)',
      attachment: '1. 전자 계산서',
      annualItems: [newItem('ANNUAL')],
      retireItems: [newItem('RETIRE')],
    };
  }
};
watch(() => props.initialData, initForm, { immediate: true });

// ── 현장/직종 변경 ────────────────────────────────────
const handleSiteChange = () => {
  const site = siteOptions.value.find(s => s.idx === formData.value.sIdx);
  formData.value.siteName = site ? site.name : '';
  updateSummary();
};
const handleTypeChange = () => updateSummary();
const updateSummary = () => {
  const typeNm = typeOptions.value.find(t => t.itemCd === formData.value.type)?.itemNm || formData.value.type;
  if (typeNm) formData.value.summary = `연차 및 퇴직수당 정산요청의 건(${typeNm})`;
};

// ── 테이블 제어 ───────────────────────────────────────
const toggleTable = (type, action) => {
  if (type === 'ANNUAL') {
    hasAnnual.value = action === 'add';
    if (action === 'remove') formData.value.annualItems = [newItem('ANNUAL')]; // 삭제 시 초기화
  } else {
    hasRetire.value = action === 'add';
    if (action === 'remove') formData.value.retireItems = [newItem('RETIRE')]; // 삭제 시 초기화
  }
};

// ── 행 추가/삭제 ─────────────────────────────────────
const addRow = (type) => {
  if (type === 'ANNUAL') formData.value.annualItems.push(newItem('ANNUAL'));
  else formData.value.retireItems.push(newItem('RETIRE'));
};
const removeRow = (type, index) => {
  if (type === 'ANNUAL') {
    if (formData.value.annualItems.length <= 1) { alert('최소 1명의 데이터가 필요합니다. 표 전체를 삭제하시려면 [표 삭제]를 이용해주세요.'); return; }
    formData.value.annualItems.splice(index, 1);
  } else {
    if (formData.value.retireItems.length <= 1) { alert('최소 1명의 데이터가 필요합니다. 표 전체를 삭제하시려면 [표 삭제]를 이용해주세요.'); return; }
    formData.value.retireItems.splice(index, 1);
  }
};

// ── 총액 계산 (활성화된 표만 계산) ────────────────────────
const annualTotal = computed(() =>
    hasAnnual.value ? formData.value.annualItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) : 0
);

const retireTotal = computed(() =>
    hasRetire.value ? formData.value.retireItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) : 0
);

const grandTotal = computed(() => annualTotal.value + retireTotal.value);

// ── 저장 ─────────────────────────────────────────────
const isSaving = ref(false);
const handleSave = async () => {
  if (!formData.value.sIdx) { alert('현장을 선택해주세요.'); return; }
  if (!hasAnnual.value && !hasRetire.value) { alert('최소 1개 이상의 정산 내역 표를 추가해주세요.'); return; }

  const [year, month] = (formData.value.target_month || formData.value.billingDt || '0-0').split('-');

  isSaving.value = true;
  try {
    // 활성화된 테이블의 데이터만 추출
    const activeAnnualItems = hasAnnual.value ? formData.value.annualItems : [];
    const activeRetireItems = hasRetire.value ? formData.value.retireItems : [];
    const combinedPayrollData = [...activeAnnualItems, ...activeRetireItems];

    const payload = {
      idx:      props.settlementId || null,
      year:     parseInt(year) || 0,
      month:    parseInt(month) || 0,
      docType:  'RETIRE_ANNUAL',
      type:     formData.value.type     || null,
      docNo:    formData.value.docNo    || null,
      billingDt:formData.value.billingDt || null,
      subTotal: grandTotal.value,
      vatAmount:0,
      grandTotal: grandTotal.value,
      billingData: {
        summary:        formData.value.summary,
        bankInfo:       formData.value.bankInfo,
        attachment:     formData.value.attachment,
        totalAnnualAmt: annualTotal.value,
        totalRetireAmt: retireTotal.value,
        totalEmployees: combinedPayrollData.length,
      },
      payrollData: combinedPayrollData,
      cIdx: authStore.user?.cIdx || 0,
    };

    const res = await axios.post(`/api/v1/settle/site/data/${formData.value.sIdx}`, payload);

    if (res.data.result) {
      alert('저장되었습니다.');
      emit('save');
      closeModal();
    } else {
      alert(`저장 실패: ${res.data.msg}`);
    }
  } catch (e) {
    console.error('저장 오류:', e);
    alert('서버 통신 중 오류가 발생했습니다.');
  } finally {
    isSaving.value = false;
  }
};

const closeModal = () => emit('close');
const fc = (v) => Number(v || 0).toLocaleString();

onMounted(() => {
  fetchSiteOptions();
  fetchTypeOptions();
});
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @mousedown.self="closeModal">
    <div class="modal-container">

      <div class="modal-header">
        <div class="header-title">
          <h2>{{ settlementId ? '연차·퇴직금 정산서 수정' : '새 연차·퇴직금 정산서 작성' }}</h2>
          <span class="badge">{{ formData.siteName || '현장 미지정' }} ({{ formData.target_month || '연월 미지정' }})</span>
        </div>
        <div class="header-actions">
          <button class="btn-save" @click="handleSave" :disabled="isSaving"><i class="mdi mdi-content-save"></i><span>{{ isSaving ? '저장 중...' : '저장하기' }}</span></button>
          <button class="btn-close" @click="closeModal"><i class="mdi mdi-close"></i></button>
        </div>
      </div>

      <div class="modal-body">
        <div class="document-paper">
          <div class="doc-header text-center">
            <h1>청 구 공 문</h1>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label>현장 선택 <span class="text-red">*</span></label>
              <select v-model="formData.sIdx" @change="handleSiteChange" class="form-select">
                <option value="" disabled>현장을 선택해주세요</option>
                <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>구분 (직종)</label>
              <select v-model="formData.type" @change="handleTypeChange" class="form-select">
                <option value="" disabled>직종 선택</option>
                <option v-for="tp in typeOptions" :key="tp.itemCd" :value="tp.itemCd">{{ tp.itemNm }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>문서번호</label>
              <input type="text" v-model="formData.docNo" class="form-input" placeholder="예: 에코그린 2026-02-39호" />
            </div>
            <div class="form-group">
              <label>시행일자</label>
              <input type="date" v-model="formData.billingDt" class="form-input" />
            </div>
          </div>

          <div class="doc-message">
            <p>1. 귀 소의 무궁한 발전을 기원합니다.</p>
            <p>2. 단지에 적립된 적립금 중 재직자의 미사용 연차수당 및 퇴직수당을 지급하고자 아래와 같이 요청하오니 검토하시여 결재를 부탁드립니다.</p>
            <p class="text-center mt-4 font-bold">- 아 래 -</p>
          </div>

          <!--div class="doc-meta-info">
            <div class="meta-row">
              <span class="meta-label">수 신 :</span>
              <span class="meta-value">{{ formData.siteName ? formData.siteName + ' 관리사무소' : '(현장을 선택해주세요)' }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">제 목 :</span>
              <input type="text" v-model="formData.summary" class="meta-input font-bold" />
            </div>
          </div-->

          <div class="table-add-controls mt-5 text-center" v-if="!hasAnnual || !hasRetire">
            <button v-if="!hasAnnual" class="btn-outline-primary mr-2" @click="toggleTable('ANNUAL', 'add')">
              <i class="mdi mdi-plus"></i> 연차수당 표 추가
            </button>
            <button v-if="!hasRetire" class="btn-outline-warning" @click="toggleTable('RETIRE', 'add')">
              <i class="mdi mdi-plus"></i> 퇴직수당 표 추가
            </button>
          </div>

          <div v-if="hasAnnual" class="table-section mt-5">
            <div class="table-actions">
              <h4><i class="mdi mdi-calendar-check text-blue"></i> 연차수당 정산 내역</h4>
              <div class="action-group">
                <button class="btn-add-row" @click="addRow('ANNUAL')">
                  <i class="mdi mdi-plus-thick"></i> 직원 추가
                </button>
                <button class="btn-delete-table" @click="toggleTable('ANNUAL', 'remove')">
                  <i class="mdi mdi-close"></i> 표 삭제
                </button>
              </div>
            </div>

            <div class="table-scroll-wrapper">
              <table class="excel-table statement-table">
                <thead>
                <tr>
                  <th rowspan="2" style="width:40px;">구분</th>
                  <th colspan="8">내역</th>
                  <th rowspan="2" style="min-width:110px;">금액 (원)</th>
                  <th rowspan="2" style="min-width:140px;">비고</th>
                  <th rowspan="2" style="width:40px;"></th>
                </tr>
                <tr>
                  <th style="min-width:70px;">이름</th>
                  <th style="min-width:60px;">직책</th>
                  <th style="min-width:80px;">생년월일</th>
                  <th style="min-width:100px;">입사일</th>
                  <th style="min-width:100px;">퇴사일</th>
                  <th style="min-width:100px;">중간정산일</th>
                  <th style="min-width:120px;">정산기간</th>
                  <th style="min-width:160px;">산출근거</th>
                </tr>
                </thead>
                <tbody v-for="(item, index) in formData.annualItems" :key="'annual-' + index">
                <tr>
                  <td class="text-center font-bold text-gray">{{ index + 1 }}</td>
                  <td><input type="text"   v-model="item.empName"  class="cell-input text-center" placeholder="이름" /></td>
                  <td><input type="text"   v-model="item.position" class="cell-input text-center" placeholder="직책" /></td>
                  <td><input type="text"   v-model="item.birthDt"  class="cell-input text-center" placeholder="590216" /></td>
                  <td><input type="date"   v-model="item.joinDate" class="cell-input text-center" /></td>
                  <td><input type="text"   v-model="item.endDate"  class="cell-input text-center" placeholder="재직중" /></td>
                  <td><input type="text"   v-model="item.middleDt" class="cell-input text-center" placeholder="중간정산일" /></td>
                  <td><input type="text"   v-model="item.period"   class="cell-input text-center" placeholder="24.02.04~25.02.03" /></td>
                  <td><input type="text"   v-model="item.basis"    class="cell-input"             placeholder="1,614,360/156*6*3개" /></td>
                  <td><input type="number" v-model.number="item.amount" class="cell-input text-right font-bold text-blue" /></td>
                  <td><input type="text"   v-model="item.note"     class="cell-input"             placeholder="3년차 16개 중 14개" /></td>
                  <td class="text-center">
                    <button class="btn-delete-row" @click="removeRow('ANNUAL', index)">
                      <i class="mdi mdi-minus"></i>
                    </button>
                  </td>
                </tr>
                <!--tr class="usage-row">
                  <td colspan="11" class="usage-cell">
                    <div class="usage-inner">
                      <span class="usage-label">※ {{ item.empName || '이름' }} 연차사용내역 :</span>
                      <input type="text" v-model="item.usageHistory" class="cell-input usage-input"
                             placeholder="예: 2025-02-27, 03-27, 28 여름..." />
                    </div>
                  </td>
                </tr-->
                </tbody>
                <tfoot>
                <tr class="tfoot-total">
                  <td colspan="9" class="text-center">연차수당 소계</td>
                  <td class="text-right text-blue font-bold">{{ fc(annualTotal) }}</td>
                  <td colspan="2"></td>
                </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div v-if="hasRetire" class="table-section mt-5">
            <div class="table-actions">
              <h4><i class="mdi mdi-account-cash text-orange"></i> 퇴직수당 정산 내역</h4>
              <div class="action-group">
                <button class="btn-add-row" @click="addRow('RETIRE')" style="background-color: #f59e0b;">
                  <i class="mdi mdi-plus-thick"></i> 직원 추가
                </button>
                <button class="btn-delete-table" @click="toggleTable('RETIRE', 'remove')">
                  <i class="mdi mdi-close"></i> 표 삭제
                </button>
              </div>
            </div>

            <div class="table-scroll-wrapper">
              <table class="excel-table statement-table">
                <thead>
                <tr>
                  <th rowspan="2" style="width:40px;">구분</th>
                  <th colspan="8">내역</th>
                  <th rowspan="2" style="min-width:110px;">금액 (원)</th>
                  <th rowspan="2" style="min-width:140px;">비고</th>
                  <th rowspan="2" style="width:40px;"></th>
                </tr>
                <tr>
                  <th style="min-width:70px;">이름</th>
                  <th style="min-width:60px;">직책</th>
                  <th style="min-width:80px;">생년월일</th>
                  <th style="min-width:100px;">입사일</th>
                  <th style="min-width:100px;">퇴사일</th>
                  <th style="min-width:100px;">중간정산일</th>
                  <th style="min-width:120px;">정산기간</th>
                  <th style="min-width:160px;">산출근거</th>
                </tr>
                </thead>
                <tbody v-for="(item, index) in formData.retireItems" :key="'retire-' + index">
                <tr>
                  <td class="text-center font-bold text-gray">{{ index + 1 }}</td>
                  <td><input type="text"   v-model="item.empName"  class="cell-input text-center" placeholder="이름" /></td>
                  <td><input type="text"   v-model="item.position" class="cell-input text-center" placeholder="직책" /></td>
                  <td><input type="text"   v-model="item.birthDt"  class="cell-input text-center" placeholder="590216" /></td>
                  <td><input type="date"   v-model="item.joinDate" class="cell-input text-center" /></td>
                  <td><input type="text"   v-model="item.endDate"  class="cell-input text-center" placeholder="퇴사일" /></td>
                  <td><input type="text"   v-model="item.middleDt" class="cell-input text-center" placeholder="중간정산일" /></td>
                  <td><input type="text"   v-model="item.period"   class="cell-input text-center" placeholder="근속기간" /></td>
                  <td><input type="text"   v-model="item.basis"    class="cell-input"             placeholder="산출근거" /></td>
                  <td><input type="number" v-model.number="item.amount" class="cell-input text-right font-bold text-orange" /></td>
                  <td><input type="text"   v-model="item.note"     class="cell-input"             placeholder="비고" /></td>
                  <td class="text-center">
                    <button class="btn-delete-row" @click="removeRow('RETIRE', index)">
                      <i class="mdi mdi-minus"></i>
                    </button>
                  </td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="tfoot-total" style="background-color: #fef3c7;">
                  <td colspan="9" class="text-center" style="color: #b45309;">퇴직수당 소계</td>
                  <td class="text-right font-bold" style="color: #b45309;">{{ fc(retireTotal) }}</td>
                  <td colspan="2"></td>
                </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!--div v-if="hasAnnual || hasRetire" class="table-scroll-wrapper mt-4">
            <table class="excel-table">
              <tbody>
              <tr class="tfoot-total" style="background-color: var(--primary-soft); border: 2px solid var(--primary);">
                <td class="text-center" style="font-size: 15px; width: calc(100% - 330px);">총 청구 합계액 (연차 + 퇴직수당)</td>
                <td class="text-right text-blue font-bold" style="font-size: 18px; width: 110px;">{{ fc(grandTotal) }} 원</td>
                <td style="width: 180px;"></td>
              </tr>
              </tbody>
            </table>
          </div-->

          <div class="footer-info mt-5">
            <div class="info-row">
              <label>3. 입금계좌 :</label>
              <input type="text" v-model="formData.bankInfo" class="meta-input flex-1" />
            </div>
            <div class="info-row mt-2">
              <label>첨부 :</label>
              <input type="text" v-model="formData.attachment" class="meta-input flex-1" />
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 오버레이/컨테이너 ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; padding: 16px; box-sizing: border-box;
}
.modal-container {
  background: var(--bg-surface); width: 100%; max-width: 1200px; height: 90vh;
  border-radius: 16px; display: flex; flex-direction: column;
  box-shadow: 0 20px 40px rgba(0,0,0,0.15); overflow: hidden; border: 1px solid var(--border-color);
}

/* ── 헤더 ── */
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid var(--border-color);
  background: var(--bg-canvas); gap: 12px; flex-shrink: 0;
}
.header-title { display: flex; align-items: center; gap: 10px; }
.header-title h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-main); }
.badge { padding: 3px 10px; background: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 600; }
.header-actions { display: flex; gap: 10px; }
.btn-save {
  background: var(--primary); color: var(--text-inverse); border: none;
  padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;
  display: flex; align-items: center; gap: 6px; font-size: 14px;
}
.btn-save:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-close {
  background: none; border: none; font-size: 22px; color: var(--text-muted);
  cursor: pointer; transition: 0.2s; padding: 4px; border-radius: 6px; display: flex; align-items: center;
}
.btn-close:hover { background: var(--bg-hover); color: var(--danger); }

/* ── 바디 ── */
.modal-body {
  flex: 1; overflow-y: auto; padding: 24px; background: var(--bg-canvas);
}
.modal-body::-webkit-scrollbar { width: 8px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

/* ── 설정 패널 ── */
.settings-panel {
  background: var(--bg-surface); padding: 20px; border-radius: 12px;
  border: 1px solid var(--border-color); margin-bottom: 20px;
}
.form-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-sub); margin-bottom: 6px; }
.form-input, .form-select {
  width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px;
  font-size: 13px; color: var(--text-main); background: var(--bg-canvas);
  outline: none; transition: border-color 0.2s; box-sizing: border-box; font-family: inherit;
}
.form-input:focus, .form-select:focus {
  border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); background: var(--bg-surface);
}

/* ── 공문 문서 ── */
.document-paper {
  max-width: 900px; margin: 0 auto; background: var(--bg-surface);
  padding: 40px; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);
}
.doc-header h1 {
  font-size: 26px; letter-spacing: 12px; margin-bottom: 30px;
  border-bottom: 2px solid var(--text-main); padding-bottom: 20px; color: var(--text-main);
}
.doc-meta-info { margin-bottom: 24px; }
.meta-row { display: flex; align-items: center; margin-bottom: 10px; font-size: 15px; }
.meta-label { width: 64px; font-weight: 600; color: var(--text-main); flex-shrink: 0; }
.meta-value { color: var(--text-main); }
.meta-input {
  flex: 1; border: none; border-bottom: 1px solid transparent; padding: 4px 8px;
  font-size: 15px; outline: none; transition: 0.2s; color: var(--text-main);
  background: transparent; font-family: inherit;
}
.meta-input:hover, .meta-input:focus { border-bottom-color: var(--primary); background: var(--bg-canvas); }
.flex-1 { flex: 1; }
.doc-message { line-height: 1.9; color: var(--text-main); font-size: 14px; }

/* ── 테이블 제어 버튼 ── */
.table-add-controls { padding: 20px; border: 2px dashed var(--border-color); border-radius: 8px; background: var(--bg-canvas); }
.btn-outline-primary {
  border: 1px solid var(--primary); color: var(--primary); background: transparent;
  padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 14px;
}
.btn-outline-primary:hover { background: var(--primary-soft); }
.btn-outline-warning {
  border: 1px solid #f59e0b; color: #f59e0b; background: transparent;
  padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 14px;
}
.btn-outline-warning:hover { background: #fef3c7; }
.mr-2 { margin-right: 8px; }

/* ── 테이블 ── */
.table-section { position: relative; }
.table-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.table-actions h4 { margin: 0; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 6px; font-weight: 700; }
.action-group { display: flex; gap: 8px; }

.btn-add-row {
  display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px;
  background: var(--success); color: var(--text-inverse); border: none; border-radius: 8px;
  font-weight: 600; cursor: pointer; font-size: 13px; transition: 0.2s;
}
.btn-add-row:hover { background: var(--success-hover); transform: translateY(-1px); opacity: 0.9; }

.btn-delete-table {
  display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px;
  background: rgba(239, 68, 68, 0.1); color: var(--danger); border: none; border-radius: 8px;
  font-weight: 600; cursor: pointer; font-size: 13px; transition: 0.2s;
}
.btn-delete-table:hover { background: var(--danger); color: var(--text-inverse); }

.table-scroll-wrapper { overflow-x: auto; border-radius: 6px; border: 1px solid var(--border-color); }
.excel-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.excel-table th, .excel-table td { border: 1px solid var(--border-color); padding: 6px; vertical-align: middle; }
.excel-table thead th {
  background: var(--bg-canvas); font-weight: 600; text-align: center;
  color: var(--text-main); padding: 9px 6px; white-space: nowrap;
}

/* 사용내역 행 */
.usage-row td { background: var(--bg-canvas); }
.usage-cell { padding: 5px 8px; }
.usage-inner { display: flex; align-items: center; gap: 8px; }
.usage-label { font-size: 12px; font-weight: 600; color: var(--text-sub); white-space: nowrap; }
.usage-input { flex: 1; }

/* 합계 행 */
.tfoot-total td { background: var(--primary-soft); padding: 12px; font-size: 14px; font-weight: 600; }

/* 셀 인풋 */
.cell-input {
  width: 100%; border: 1px solid transparent; background: transparent; padding: 5px 6px;
  outline: none; transition: 0.15s; border-radius: 3px; box-sizing: border-box;
  font-size: 13px; color: var(--text-main); font-family: inherit;
}
.cell-input:hover, .cell-input:focus { border-color: var(--primary); background: var(--bg-surface); }
.btn-delete-row {
  background: rgba(239,68,68,0.1); color: var(--danger); border: none;
  padding: 5px; border-radius: 4px; cursor: pointer; transition: 0.2s;
  display: inline-flex; align-items: center;
}
.btn-delete-row:hover { background: var(--danger); color: var(--text-inverse); }

/* 하단 정보 */
.footer-info {
  background: var(--bg-canvas); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color);
}
.info-row { display: flex; align-items: center; font-size: 14px; font-weight: 600; color: var(--text-main); }
.info-row label { width: 100px; flex-shrink: 0; }

/* 유틸 */
.text-center { text-align: center; }
.text-right  { text-align: right; }
.text-blue   { color: var(--primary); }
.text-orange { color: #d97706; }
.text-red    { color: var(--danger); }
.text-gray   { color: var(--text-sub); }
.font-bold   { font-weight: 700; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mt-5 { margin-top: 32px; }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; }

/* ── 반응형 ── */
@media (max-width: 1024px) {
  .form-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-container { height: 96vh; border-radius: 16px 16px 0 0; }
  .modal-body { padding: 12px; }
  .document-paper { padding: 20px; }
  .doc-header h1 { font-size: 20px; letter-spacing: 6px; }
  .form-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 480px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
