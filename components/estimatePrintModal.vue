<script setup>
/**
 * RetireAnnualPrintModal.vue
 *
 * [수정 사항]
 * - itemType / rowType / 없음(legacy) 모든 케이스 처리
 * - docType으로 ANNUAL 단독 / RETIRE 단독 / RETIRE_ANNUAL 구분
 * - 빈 테이블은 렌더링하지 않음
 * - 인쇄 CSS를 teleport로 head에 주입
 */
import { computed, onMounted, onUnmounted } from 'vue';

// ── 인쇄 CSS를 head에 직접 주입 (scoped/전역 style 한계 우회) ──
const PRINT_STYLE_ID = 'retire-annual-print-style';

onMounted(() => {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      /* 컨트롤 바 및 UI 요소 숨김 */
      .no-print { display: none !important; }

      /* body 최상위 요소 중 print-overlay 외 모두 숨김 */
      body > *:not(.print-overlay) { display: none !important; }

      .print-overlay {
        position: static !important;
        background: none !important;
        overflow: visible !important;
      }
      .print-wrapper {
        background: white !important;
        max-width: 100% !important;
      }
      .print-area {
        padding: 0 !important;
        gap: 0 !important;
        background: white !important;
      }
      .print-page {
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 12mm 16mm !important;
        page-break-after: always;
        break-after: page;
      }
      .print-page:last-child {
        page-break-after: avoid;
        break-after: avoid;
      }
    }
    @page { size: A4 portrait; margin: 8mm; }
  `;
  document.head.appendChild(style);
});

onUnmounted(() => {
  document.getElementById(PRINT_STYLE_ID)?.remove();
});

const props = defineProps({
  isOpen: Boolean,
  items:  { type: Array, default: () => [] },
});
const emit = defineEmits(['close']);

const closeModal = () => emit('close');
const handlePrint = () => window.print();

// ── payrollData 행 분류 ────────────────────────────────
// 저장 형태가 다양하므로 우선순위 기반으로 처리:
// 1) itemType 필드
// 2) rowType 필드
// 3) docType으로 추론
// 4) 둘 다 없으면 ANNUAL로 간주
function classifyRows(payrollData, docType) {
  if (!Array.isArray(payrollData) || payrollData.length === 0) {
    return { annualRows: [], retireRows: [] };
  }

  const annualRows = [];
  const retireRows = [];

  payrollData.forEach((row, idx) => {
    const t = row.itemType || row.rowType || '';

    if (t === 'RETIRE') {
      retireRows.push(row);
    } else if (t === 'ANNUAL') {
      annualRows.push(row);
    } else {
      // 구분 필드 없는 레거시 데이터 처리
      if (docType === 'RETIRE') {
        retireRows.push(row);
      } else if (docType === 'ANNUAL') {
        annualRows.push(row);
      } else {
        // RETIRE_ANNUAL인데 rowType 없는 경우: 홀수=ANNUAL, 짝수=RETIRE
        if (idx % 2 === 0) annualRows.push(row);
        else retireRows.push(row);
      }
    }
  });

  return { annualRows, retireRows };
}

// ── 합계 계산 ─────────────────────────────────────────
function sumAmount(rows) {
  return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

// ── 날짜 포맷 ─────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`;
}

const fc = (v) => Number(v || 0).toLocaleString();

// ── 렌더링용 데이터 가공 ──────────────────────────────
const printDocs = computed(() =>
    props.items.map(item => {
      const bd = item.billingData || {};
      const { annualRows, retireRows } = classifyRows(item.payrollData, item.docType);
      return {
        ...item,
        bd,
        annualRows,
        retireRows,
        annualSum: sumAmount(annualRows),
        retireSum: sumAmount(retireRows),
        hasBoth:   annualRows.length > 0 && retireRows.length > 0,
      };
    })
);
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="print-overlay">
      <div class="print-wrapper">

        <!-- 컨트롤 바 (인쇄 시 숨김) -->
        <div class="print-controls no-print">
          <div class="ctrl-left">
            <i class="mdi mdi-printer-outline"></i>
            <span>출력 미리보기</span>
            <span class="ctrl-badge">{{ items.length }}건 선택됨</span>
          </div>
          <div class="ctrl-right">
            <button class="btn-exec" @click="handlePrint">
              <i class="mdi mdi-printer"></i> 인쇄하기
            </button>
            <button class="btn-cls" @click="closeModal">
              <i class="mdi mdi-close"></i> 닫기
            </button>
          </div>
        </div>

        <!-- 빈 상태 -->
        <div v-if="printDocs.length === 0" class="empty-print no-print">
          <i class="mdi mdi-printer-off-outline"></i>
          <p>출력할 데이터가 없습니다.</p>
        </div>

        <!-- 인쇄 영역 -->
        <div class="print-area" v-else>
          <div
              v-for="(doc, di) in printDocs"
              :key="doc.id || di"
              class="print-page"
          >
            <!-- 레터헤드 -->
            <div class="letterhead">
              서울시 강서구 공항대로 325 에이스빌딩 7층 &nbsp;&nbsp; TEL. 02)355-3322 &nbsp; FAX. 02)355-3318
            </div>

            <!-- 문서 메타 -->
            <div class="doc-meta">
              <div class="meta-row"><span class="mlabel">문서번호 :</span><span>{{ doc.docNo || '' }}</span></div>
              <div class="meta-row"><span class="mlabel">시행일자 :</span><span>{{ formatDate(doc.billingDt) }}</span></div>
              <div class="meta-row"><span class="mlabel">수&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신 :</span><span>{{ doc.siteName }} 관리사무소</span></div>
              <div class="meta-row"><span class="mlabel">제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목 :</span><span class="bold">{{ doc.bd.summary || '연차 및 퇴직수당 정산요청의 건' }}</span></div>
            </div>

            <!-- 공문 제목 -->
            <div class="doc-title-wrap">
              <h1 class="doc-title">청 구 공 문</h1>
            </div>

            <!-- 본문 -->
            <div class="doc-body">
              <p>1. 귀 소의 무궁한 발전을 기원합니다.</p>
              <p>2. 단지에 적립된 적립금 중 재직자의 미사용 연차수당 및 퇴직수당을 지급하고자 아래와 같이 요청하오니 검토하시여 결재를 부탁드립니다.</p>
              <p class="under-line">- 아 래 -</p>
            </div>

            <!-- 연차수당 표 -->
            <template v-if="doc.annualRows.length > 0">
              <div class="tbl-title">◈ 연차수당 정산 내역서 ◈</div>
              <table class="ptable">
                <thead>
                <tr>
                  <th>성명</th><th>직책</th><th>생년월일</th>
                  <th>입사일</th><th>퇴사일</th><th>중간정산일</th>
                  <th>정산기간</th><th>산출근거</th><th>금액 (원)</th><th>비고</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(r, ri) in doc.annualRows" :key="'a'+ri">
                  <td class="tc">{{ r.empName }}</td>
                  <td class="tc">{{ r.position }}</td>
                  <td class="tc">{{ r.birthDt }}</td>
                  <td class="tc">{{ r.joinDate }}</td>
                  <td class="tc">{{ r.endDate }}</td>
                  <td class="tc">{{ r.middleDt }}</td>
                  <td class="tc">{{ r.period }}</td>
                  <td>{{ r.basis }}</td>
                  <td class="tr bold">{{ fc(r.amount) }}</td>
                  <td>{{ r.note }}</td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="subtotal annual-subtotal">
                  <td colspan="8" class="tc bold">연차수당 소계</td>
                  <td class="tr bold">{{ fc(doc.annualSum) }}</td>
                  <td></td>
                </tr>
                </tfoot>
              </table>
            </template>

            <!-- 퇴직수당 표 -->
            <template v-if="doc.retireRows.length > 0">
              <div class="tbl-title" :class="{ 'mt-tbl': doc.annualRows.length > 0 }">◈ 퇴직수당 정산 내역서 ◈</div>
              <table class="ptable">
                <thead>
                <tr>
                  <th>성명</th><th>직책</th><th>생년월일</th>
                  <th>입사일</th><th>퇴사일</th><th>중간정산일</th>
                  <th>정산기간</th><th>산출근거</th><th>금액 (원)</th><th>비고</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(r, ri) in doc.retireRows" :key="'re'+ri">
                  <td class="tc">{{ r.empName }}</td>
                  <td class="tc">{{ r.position }}</td>
                  <td class="tc">{{ r.birthDt }}</td>
                  <td class="tc">{{ r.joinDate }}</td>
                  <td class="tc">{{ r.endDate }}</td>
                  <td class="tc">{{ r.middleDt }}</td>
                  <td class="tc">{{ r.period }}</td>
                  <td>{{ r.basis }}</td>
                  <td class="tr bold">{{ fc(r.amount) }}</td>
                  <td>{{ r.note }}</td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="subtotal retire-subtotal">
                  <td colspan="8" class="tc bold">퇴직수당 소계</td>
                  <td class="tr bold">{{ fc(doc.retireSum) }}</td>
                  <td></td>
                </tr>
                </tfoot>
              </table>
            </template>

            <!-- 연차+퇴직금 합계 (둘 다 있을 때만) -->
            <!--table v-if="doc.hasBoth" class="ptable grand-tbl">
              <tbody>
              <tr class="grand-row">
                <td class="tc bold" style="width:88%;">합 계 (연차수당 + 퇴직수당)</td>
                <td class="tr bold grand-amt">{{ fc(doc.grandTotal) }}</td>
              </tr>
              </tbody>
            </table-->

            <!-- 입금계좌 / 첨부 -->
            <div class="doc-footer">
              <p>3. 입금계좌 : {{ doc.bd.bankInfo || '' }}</p>
              <p v-if="doc.bd.attachment">첨부 : {{ doc.bd.attachment }}</p>
            </div>

            <!-- 날짜 / 서명 -->
            <div class="doc-sign">
              <div>{{ formatDate(doc.billingDt) }}</div>
              <div class="bold">주식회사 에코그린티엠 &nbsp; 대표이사</div>
            </div>

          </div><!-- /print-page -->
        </div><!-- /print-area -->

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── 화면 오버레이 ── */
.print-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(15, 23, 42, 0.75);
  overflow-y: auto;
  display: flex; justify-content: center;
}
.print-wrapper {
  width: 100%; max-width: 860px;
  display: flex; flex-direction: column;
  background: #e2e8f0;  /* 배경 회색으로 A4 종이 느낌 */
  min-height: 100%;
}

/* ── 컨트롤 바 ── */
.print-controls {
  position: sticky; top: 0; z-index: 10;
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 20px; background: #1e293b; color: white; gap: 12px; flex-wrap: wrap;
}
.ctrl-left { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.ctrl-left .mdi { font-size: 20px; color: #60a5fa; }
.ctrl-badge { background: #3b82f6; color: white; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; }
.ctrl-right { display: flex; gap: 8px; }
.btn-exec {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; background: #3b82f6; color: white; border: none;
  border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.2s;
}
.btn-exec:hover { background: #2563eb; }
.btn-cls {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; background: rgba(255,255,255,0.1); color: white; border: none;
  border-radius: 6px; font-size: 14px; cursor: pointer; transition: 0.2s;
}
.btn-cls:hover { background: rgba(255,255,255,0.2); }

/* ── 빈 상태 ── */
.empty-print {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px; color: #94a3b8; flex: 1;
}
.empty-print .mdi { font-size: 48px; margin-bottom: 12px; }
.empty-print p { font-size: 16px; }

/* ── 인쇄 영역 ── */
.print-area { padding: 20px; display: flex; flex-direction: column; gap: 20px; }

/* ── 각 페이지 (A4 흰 종이 모양) ── */
.print-page {
  background: white;
  padding: 30px 36px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  border-radius: 2px;
  font-family: 'Malgun Gothic', '맑은 고딕', AppleGothic, sans-serif;
  font-size: 11.5px;
  color: #000;
  line-height: 1.5;
}

/* ── 레터헤드 ── */
.letterhead {
  text-align: center; font-size: 10px; color: #444;
  padding-bottom: 6px; border-bottom: 1.5px solid #000; margin-bottom: 10px;
}

/* ── 문서 메타 ── */
.doc-meta { margin-bottom: 12px; }
.meta-row { display: flex; align-items: baseline; font-size: 12px; line-height: 2; }
.mlabel { min-width: 72px; font-weight: 600; }
.bold { font-weight: 700; }

/* ── 제목 ── */
.doc-title-wrap { text-align: center; margin: 14px 0 10px; }
.doc-title {
  display: inline-block;
  font-size: 20px; font-weight: 700; letter-spacing: 10px;
  border-bottom: 2px solid #000; padding-bottom: 8px; margin: 0;
}

/* ── 본문 ── */
.doc-body { font-size: 12px; line-height: 2; margin-bottom: 10px; }
.under-line { text-align: center; font-weight: 700; margin-top: 6px; }

/* ── 테이블 제목 ── */
.tbl-title {
  text-align: center; font-size: 12px; font-weight: 700;
  margin-bottom: 4px; letter-spacing: 1px;
}
.mt-tbl { margin-top: 14px; }

/* ── 인쇄 테이블 ── */
.ptable { width: 100%; border-collapse: collapse; font-size: 10.5px; }
.ptable th, .ptable td {
  border: 1px solid #555; padding: 3px 4px; vertical-align: middle;
}
.ptable thead th {
  background: #f0f0f0; font-weight: 700; text-align: center; white-space: nowrap;
}
.tc { text-align: center; }
.tr { text-align: right; }

.subtotal td { font-size: 11.5px; font-weight: 700; padding: 5px 6px; }
.annual-subtotal td { background: #dbeafe; }
.retire-subtotal td { background: #fef3c7; }

.grand-tbl { margin-top: 3px; }
.grand-row td { padding: 6px 8px; background: #eff6ff; border: 1.5px solid #3b82f6; font-size: 13px; }
.grand-amt { font-size: 13px; color: #1d4ed8; white-space: nowrap; }

/* ── 하단 ── */
.doc-footer {
  margin-top: 12px; padding: 8px 10px; font-size: 12px; line-height: 2;
  background: #f8f9fa; border: 1px solid #ddd;
}
.doc-sign { margin-top: 18px; text-align: right; font-size: 12px; line-height: 2.2; }
</style>

<!-- 인쇄 CSS는 onMounted에서 document.head에 직접 주입 -->
