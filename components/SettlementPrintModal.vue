<script setup>
/**
 * SettlementPrintModal.vue
 * 정산서 목록에서 선택한 항목을 출력하는 전용 모달
 * - 청구공문 / 급여내역서 / 둘 다 출력 모드 선택 가능
 * - @media print CSS를 onMounted에서 head에 직접 주입 (scoped 한계 우회)
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  items:  { type: Array, default: () => [] },
});
const emit = defineEmits(['close']);

const printMode = ref('statement'); // 'statement' | 'details' | 'both'

const closeModal  = () => emit('close');
const handlePrint = () => window.print();

// ── print CSS head 주입 ───────────────────────────────
const STYLE_ID = 'settlement-print-style';
onMounted(() => {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    @media print {
      .spo-no-print { display: none !important; }
      body > *:not(.spo-overlay) { display: none !important; }
      .spo-overlay {
        position: static !important; background: none !important; overflow: visible !important;
      }
      .spo-wrapper { background: white !important; max-width: 100% !important; }
      .spo-print-area { padding: 0 !important; gap: 0 !important; }
      .spo-page {
        box-shadow: none !important; border-radius: 0 !important;
        padding: 10mm 15mm !important;
        page-break-after: always; break-after: page;
      }
      .spo-page:last-child { page-break-after: avoid; break-after: avoid; }
    }
    @page { size: A4; margin: 8mm; }
  `;
  document.head.appendChild(el);
});
onUnmounted(() => { document.getElementById(STYLE_ID)?.remove(); });

// ── 헬퍼 ─────────────────────────────────────────────
function parseJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return fallback; } }
  return val;
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`;
}

const fc = (v) => Number(v || 0).toLocaleString();

// ── 공제 항목 키 목록 추출 ────────────────────────────
function getDeductionKeys(pd) {
  const keys = new Set();
  pd.forEach(row => Object.keys(row.deductionItems || {}).forEach(k => keys.add(k)));
  return [...keys];
}

// ── 렌더링 데이터 ─────────────────────────────────────
const printDocs = computed(() =>
    props.items.map(item => ({
      ...item,
      bd: parseJson(item.billingData, {}),
      pd: parseJson(item.payrollData, []),
    }))
);
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="spo-overlay">
      <div class="spo-wrapper">

        <!-- 컨트롤 바 (인쇄 시 숨김) -->
        <div class="spo-controls spo-no-print">
          <div class="spo-ctrl-left">
            <i class="mdi mdi-printer-outline"></i>
            <span>출력 미리보기</span>
            <span class="spo-badge">{{ items.length }}건 선택됨</span>
          </div>

          <!-- 모드 탭 -->
          <div class="spo-mode-tabs">
            <button :class="['spo-tab', { active: printMode === 'statement' }]" @click="printMode = 'statement'">
              <i class="mdi mdi-file-document-outline"></i> 청구공문
            </button>
            <button :class="['spo-tab', { active: printMode === 'details' }]" @click="printMode = 'details'">
              <i class="mdi mdi-table-account"></i> 급여내역서
            </button>
            <button :class="['spo-tab', { active: printMode === 'both' }]" @click="printMode = 'both'">
              <i class="mdi mdi-layers-outline"></i> 둘 다
            </button>
          </div>

          <div class="spo-ctrl-right">
            <button class="spo-btn-print" @click="handlePrint">
              <i class="mdi mdi-printer"></i> 인쇄하기
            </button>
            <button class="spo-btn-close" @click="closeModal">
              <i class="mdi mdi-close"></i> 닫기
            </button>
          </div>
        </div>

        <!-- 빈 상태 -->
        <div v-if="printDocs.length === 0" class="spo-empty spo-no-print">
          <i class="mdi mdi-printer-off-outline"></i>
          <p>출력할 데이터가 없습니다.</p>
        </div>

        <!-- 인쇄 영역 -->
        <div class="spo-print-area" v-else>
          <template v-for="(doc, di) in printDocs" :key="doc.id || di">

            <!-- ① 청구 공문 -->
            <div v-if="printMode === 'statement' || printMode === 'both'" class="spo-page">

              <div class="spo-letterhead">
                서울시 강서구 공항대로 325 에이스빌딩 7층 &nbsp;&nbsp; TEL. 02)355-3322 &nbsp; FAX. 02)355-3318
              </div>

              <div class="spo-meta">
                <div class="spo-meta-row"><span class="spo-ml">문서번호 :</span><span>{{ doc.docNo || '' }}</span></div>
                <div class="spo-meta-row"><span class="spo-ml">시행일자 :</span><span>{{ formatDate(doc.billingDt) }}</span></div>
                <div class="spo-meta-row"><span class="spo-ml">수&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신 :</span><span>{{ doc.siteName }} 관리사무소</span></div>
                <div class="spo-meta-row"><span class="spo-ml">제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목 :</span><span class="spo-bold">{{ doc.bd.summary || '용역비 청구의 건' }}</span></div>
              </div>

              <div class="spo-title-wrap">
                <h1 class="spo-main-title">청 구 공 문</h1>
              </div>

              <div class="spo-body-text">
                <p>1. 귀 소의 무궁한 발전을 기원합니다.</p>
                <p>2. 당월 용역비를 아래와 같이 청구하오니 검토하시여 결재를 부탁드립니다.</p>
                <p class="spo-center spo-bold" style="margin-top:8px;">- 아 래 -</p>
              </div>

              <!-- 청구 내역 표 -->
              <div class="spo-tbl-title">◈ 청구 내역 ◈</div>
              <table class="spo-table">
                <thead>
                <tr>
                  <th style="width:130px">산정기간</th>
                  <th style="width:80px">구분</th>
                  <th>내역</th>
                  <th style="width:120px">산출금액 (원)</th>
                  <th style="width:130px">비고</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(row, ri) in (doc.bd.items || [])" :key="ri">
                  <td class="spo-tc">{{ row.period }}</td>
                  <td class="spo-tc">{{ row.category }}</td>
                  <td>{{ row.detail }}</td>
                  <td class="spo-tr spo-bold">{{ fc(row.amount) }}</td>
                  <td>{{ row.note }}</td>
                </tr>
                <tr v-if="!(doc.bd.items || []).length">
                  <td colspan="5" class="spo-tc spo-muted">내역 없음</td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="spo-total-row">
                  <td colspan="3" class="spo-tc spo-bold">합계</td>
                  <td class="spo-tr spo-bold">{{ fc(doc.subTotal) }}</td>
                  <td></td>
                </tr>
                </tfoot>
              </table>

              <!-- VAT 분류표 (부가세 있는 경우) -->
              <template v-if="doc.vatAmount > 0 && doc.bd.vatBreakdown">
                <div class="spo-tbl-title spo-mt">◈ 과세/면세 관리면적별 산출내역 ◈</div>
                <table class="spo-table">
                  <thead>
                  <tr>
                    <th>구분</th><th>관리면적(㎡)</th><th>단가(원)</th>
                    <th>공급가액(원)</th><th>부가세(원)</th><th>합계금액(원)</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr>
                    <td class="spo-tc spo-bold">135㎡ 이하 (면세)</td>
                    <td class="spo-tr">{{ fc(doc.bd.vatBreakdown.under135?.area) }}</td>
                    <td class="spo-tr">{{ fc(doc.bd.vatBreakdown.under135?.unitPrice) }}</td>
                    <td class="spo-tr spo-bold">{{ fc(doc.bd.vatBreakdown.under135?.supply) }}</td>
                    <td class="spo-tc spo-muted">0</td>
                    <td class="spo-tr spo-bold">{{ fc(doc.bd.vatBreakdown.under135?.supply) }}</td>
                  </tr>
                  <tr>
                    <td class="spo-tc spo-bold">135㎡ 초과 (과세)</td>
                    <td class="spo-tr">{{ fc(doc.bd.vatBreakdown.over135?.area) }}</td>
                    <td class="spo-tr">{{ fc(doc.bd.vatBreakdown.over135?.unitPrice) }}</td>
                    <td class="spo-tr spo-bold">{{ fc(doc.bd.vatBreakdown.over135?.supply) }}</td>
                    <td class="spo-tr spo-red">{{ fc(doc.bd.vatBreakdown.over135?.vat) }}</td>
                    <td class="spo-tr spo-bold">
                      {{ fc((doc.bd.vatBreakdown.over135?.supply || 0) + (doc.bd.vatBreakdown.over135?.vat || 0)) }}
                    </td>
                  </tr>
                  </tbody>
                  <tfoot>
                  <tr class="spo-total-row">
                    <td class="spo-tc spo-bold">총 계</td>
                    <td class="spo-tr">
                      {{ fc((doc.bd.vatBreakdown.under135?.area || 0) + (doc.bd.vatBreakdown.over135?.area || 0)) }}
                    </td>
                    <td class="spo-tc">—</td>
                    <td class="spo-tr spo-bold">{{ fc(doc.subTotal) }}</td>
                    <td class="spo-tr spo-red">{{ fc(doc.vatAmount) }}</td>
                    <td class="spo-tr spo-bold spo-blue">{{ fc(doc.grandTotal) }}</td>
                  </tr>
                  </tfoot>
                </table>
              </template>

              <div class="spo-footer-info">
                <p>3. 입금계좌 : {{ doc.bd.bankInfo || '' }}</p>
              </div>

              <div class="spo-sign">
                <div>{{ formatDate(doc.billingDt) }}</div>
                <div class="spo-bold">주식회사 에코그린티엠 &nbsp; 대표이사</div>
              </div>
            </div>

            <!-- ② 급여 세부 내역서 -->
            <div v-if="printMode === 'details' || printMode === 'both'" class="spo-page">

              <div class="spo-letterhead">
                서울시 강서구 공항대로 325 에이스빌딩 7층 &nbsp;&nbsp; TEL. 02)355-3322 &nbsp; FAX. 02)355-3318
              </div>

              <div class="spo-title-wrap" style="margin-bottom:6px">
                <h2 class="spo-sub-title">급여 세부 내역서</h2>
                <div class="spo-detail-meta">
                  <span>{{ doc.siteName }}</span>
                  <span>{{ doc.target_month }}</span>
                  <span>{{ doc.typeNm }}</span>
                </div>
              </div>

              <div class="spo-tbl-title">◈ 직원별 급여/공제 내역 ◈</div>
              <table class="spo-table spo-payroll-tbl">
                <thead>
                <tr>
                  <th style="width:30px">No</th>
                  <th style="width:60px">이름</th>
                  <th style="width:55px">직책</th>
                  <th class="spo-bg-blue" style="width:90px">지급총액</th>
                  <th v-for="dKey in getDeductionKeys(doc.pd)" :key="'h'+dKey"
                      class="spo-bg-red" style="min-width:72px">{{ dKey }}</th>
                  <th class="spo-bg-red" style="width:70px">공제계</th>
                  <th class="spo-bg-green" style="width:88px">차인지급액</th>
                  <th class="spo-bg-yellow" style="width:70px">연차적립</th>
                  <th class="spo-bg-yellow" style="width:70px">퇴직적립</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(row, ri) in doc.pd" :key="ri">
                  <td class="spo-tc">{{ ri + 1 }}</td>
                  <td class="spo-tc spo-bold">{{ row.empName }}</td>
                  <td class="spo-tc">{{ row.position }}</td>
                  <td class="spo-tr spo-bold spo-blue">{{ fc(row.grossPay) }}</td>
                  <td v-for="dKey in getDeductionKeys(doc.pd)" :key="'d'+dKey" class="spo-tr">
                    {{ fc((row.deductionItems || {})[dKey]) }}
                  </td>
                  <td class="spo-tr spo-bold spo-red">{{ fc(row.totalDeduct) }}</td>
                  <td class="spo-tr spo-bold spo-green">{{ fc(row.netPay) }}</td>
                  <td class="spo-tr spo-amber">{{ fc(row.reserves?.annualLeave) }}</td>
                  <td class="spo-tr spo-amber">{{ fc(row.reserves?.severance) }}</td>
                </tr>
                <tr v-if="doc.pd.length === 0">
                  <td colspan="20" class="spo-tc spo-muted" style="padding:12px">급여 데이터 없음</td>
                </tr>
                </tbody>
                <tfoot v-if="doc.pd.length > 0">
                <tr class="spo-payroll-total">
                  <td colspan="3" class="spo-tc spo-bold">총 계</td>
                  <td class="spo-tr spo-bold spo-blue">
                    {{ fc(doc.pd.reduce((s, r) => s + (r.grossPay || 0), 0)) }}
                  </td>
                  <td v-for="dKey in getDeductionKeys(doc.pd)" :key="'ft'+dKey" class="spo-tr">
                    {{ fc(doc.pd.reduce((s, r) => s + ((r.deductionItems || {})[dKey] || 0), 0)) }}
                  </td>
                  <td class="spo-tr spo-bold spo-red">
                    {{ fc(doc.pd.reduce((s, r) => s + (r.totalDeduct || 0), 0)) }}
                  </td>
                  <td class="spo-tr spo-bold spo-green">
                    {{ fc(doc.pd.reduce((s, r) => s + (r.netPay || 0), 0)) }}
                  </td>
                  <td class="spo-tr spo-amber">
                    {{ fc(doc.pd.reduce((s, r) => s + (r.reserves?.annualLeave || 0), 0)) }}
                  </td>
                  <td class="spo-tr spo-amber">
                    {{ fc(doc.pd.reduce((s, r) => s + (r.reserves?.severance || 0), 0)) }}
                  </td>
                </tr>
                </tfoot>
              </table>

              <div class="spo-sign" style="margin-top:24px">
                <div>{{ formatDate(doc.billingDt) }}</div>
                <div class="spo-bold">주식회사 에코그린티엠 &nbsp; 대표이사</div>
              </div>
            </div>

          </template>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── 오버레이 ── */
.spo-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(15, 23, 42, 0.78);
  overflow-y: auto; display: flex; justify-content: center;
}
.spo-wrapper {
  width: 100%; max-width: 920px;
  display: flex; flex-direction: column;
  background: #e2e8f0; min-height: 100%;
}

/* ── 컨트롤 바 ── */
.spo-controls {
  position: sticky; top: 0; z-index: 10;
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; background: #1e293b; color: white; gap: 10px; flex-wrap: wrap;
}
.spo-ctrl-left  { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.spo-ctrl-left .mdi { font-size: 18px; color: #60a5fa; }
.spo-badge { background: #3b82f6; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }

.spo-mode-tabs { display: flex; gap: 4px; }
.spo-tab {
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px;
  border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: transparent;
  color: rgba(255,255,255,0.6); font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.15s;
}
.spo-tab:hover { background: rgba(255,255,255,0.1); color: white; }
.spo-tab.active { background: #3b82f6; border-color: #3b82f6; color: white; }
.spo-tab .mdi { font-size: 14px; }

.spo-ctrl-right { display: flex; gap: 8px; }
.spo-btn-print {
  display: inline-flex; align-items: center; gap: 5px; padding: 7px 16px;
  background: #3b82f6; color: white; border: none; border-radius: 6px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s;
}
.spo-btn-print:hover { background: #2563eb; }
.spo-btn-close {
  display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px;
  background: rgba(255,255,255,0.1); color: white; border: none; border-radius: 6px;
  font-size: 13px; cursor: pointer; transition: 0.2s;
}
.spo-btn-close:hover { background: rgba(255,255,255,0.2); }

/* ── 빈 상태 ── */
.spo-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; color: #94a3b8; }
.spo-empty .mdi { font-size: 48px; margin-bottom: 12px; }
.spo-empty p { font-size: 15px; }

/* ── 인쇄 영역 ── */
.spo-print-area { padding: 16px; display: flex; flex-direction: column; gap: 16px; }

/* ── A4 페이지 ── */
.spo-page {
  background: white; padding: 28px 36px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12); border-radius: 2px;
  font-family: 'Malgun Gothic', '맑은 고딕', AppleGothic, sans-serif;
  font-size: 11.5px; color: #000; line-height: 1.5; box-sizing: border-box;
}

/* ── 레터헤드 ── */
.spo-letterhead {
  text-align: center; font-size: 9.5px; color: #555;
  padding-bottom: 5px; border-bottom: 1.5px solid #000; margin-bottom: 10px;
}

/* ── 문서 메타 ── */
.spo-meta { margin-bottom: 10px; }
.spo-meta-row { display: flex; align-items: baseline; font-size: 12px; line-height: 2; }
.spo-ml { min-width: 72px; font-weight: 600; }
.spo-bold { font-weight: 700; }

/* ── 제목 ── */
.spo-title-wrap { text-align: center; margin: 14px 0 10px; }
.spo-main-title {
  display: inline-block; font-size: 20px; font-weight: 700; letter-spacing: 10px;
  border-bottom: 2px solid #000; padding-bottom: 8px; margin: 0;
}
.spo-sub-title { font-size: 16px; font-weight: 700; letter-spacing: 3px; margin: 0 0 4px; }
.spo-detail-meta { display: flex; justify-content: center; gap: 20px; font-size: 11px; color: #555; }

/* ── 본문 ── */
.spo-body-text { font-size: 12px; line-height: 2; margin-bottom: 10px; }
.spo-center { text-align: center; }

/* ── 테이블 제목 ── */
.spo-tbl-title { text-align: center; font-size: 12px; font-weight: 700; margin-bottom: 4px; letter-spacing: 1px; }
.spo-mt { margin-top: 14px; }

/* ── 테이블 공통 ── */
.spo-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
.spo-table th, .spo-table td { border: 1px solid #555; padding: 3px 5px; vertical-align: middle; }
.spo-table thead th { background: #f0f0f0; font-weight: 700; text-align: center; white-space: nowrap; }
.spo-tc { text-align: center; }
.spo-tr { text-align: right; }
.spo-muted { color: #999; }
.spo-total-row td { background: #dbeafe; font-size: 12px; font-weight: 700; padding: 5px 6px; }

/* ── 급여 테이블 ── */
.spo-payroll-tbl { font-size: 9.5px; }
.spo-bg-blue   { background: rgba(59, 130, 246, 0.12) !important; }
.spo-bg-red    { background: rgba(239, 68, 68, 0.08)  !important; }
.spo-bg-green  { background: rgba(16, 185, 129, 0.08) !important; }
.spo-bg-yellow { background: rgba(245, 158, 11, 0.08) !important; }
.spo-blue  { color: #1d4ed8; }
.spo-red   { color: #dc2626; }
.spo-green { color: #059669; }
.spo-amber { color: #b45309; }
.spo-payroll-total td { background: #f8fafc; font-size: 10px; font-weight: 700; padding: 5px 4px; }

/* ── 하단 ── */
.spo-footer-info { margin-top: 12px; padding: 8px 10px; font-size: 12px; line-height: 2; background: #f8f9fa; border: 1px solid #ddd; }
.spo-sign { margin-top: 18px; text-align: right; font-size: 12px; line-height: 2.2; }
</style>
