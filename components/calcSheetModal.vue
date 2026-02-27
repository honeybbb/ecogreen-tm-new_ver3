<script setup>
import { ref, reactive, computed, watch } from 'vue';

const props = defineProps({
  isOpen:         { type: Boolean, default: false },
  selectedBudget: { type: Object,  default: null  },
  contractList:   { type: Array,   default: () => [] },
});

const emit = defineEmits(['close', 'save']);

// ── 직군 컬럼: contractList에서 경비(01001001) 또는 미화(01001002) staffList 파싱 ──
const cols = computed(() => {
  if (!props.contractList?.length) return [];
  // type에 따라 해당 계약의 staffList 사용
  const targetType = props.selectedBudget?.type || '01001001';
  const contract   = props.contractList.find(c => c.type === targetType)
      || props.contractList[0];
  if (!contract?.staffList?.length) return [];
  return contract.staffList.map(s => ({
    id:    s.name,
    label: s.name,
    count: Number(s.count) || 1,
  }));
});

// ── 섹션 데이터 ─────────────────────────────────────────────
// amounts 배열은 cols 길이에 맞춰 동적 생성
const makeRow = (label, vals, pct = null) => ({
  id:     'r' + Date.now() + Math.random().toString(36).slice(2),
  label,
  vals:   vals || [],
  pct,
});

// cols가 결정되면 기본 행 초기화
const initVals = () => cols.value.map(() => 0);

const sections = reactive({
  direct: {
    key: 'direct', label: '직접노무비', mainLabel: '인건비',
    rows: []
  },
  indirect: {
    key: 'indirect', label: '간접노무비', mainLabel: '인건비',
    rows: []
  },
  insurance: {
    key: 'insurance', label: '보험료', mainLabel: '보험료',
    rows: []
  },
  misc: {
    key: 'misc', label: '제경비', mainLabel: '제경비',
    rows: []
  },
  profit: {
    key: 'profit', label: '이윤', mainLabel: '이윤',
    rows: []
  },
});

// 기본 데이터로 초기화 (경비용역 기준)
const initDefaultRows = () => {
  const v = initVals;
  sections.direct.rows = [
    makeRow('품셈시급',     v()),
    makeRow('기존시급',     v()),
    makeRow('기본급',       v()),
    makeRow('야간근로수당', v()),
    makeRow('직책수당',     v()),
    makeRow('근로자의날 수당', v()),
    makeRow('연차적립금',   v()),
    makeRow('퇴직적립금',  v()),
  ];
  sections.indirect.rows = [
    makeRow('연차수당', v()),
    makeRow('퇴직적립금', v()),
  ];
  sections.insurance.rows = [
    makeRow('건강보험료',    v(), 3.595),
    makeRow('장기요양보험료', v(), 12.95),
    makeRow('국민연금',     v(), 4.5),
    makeRow('고용보험료',   v(), 1.35),
    makeRow('산재보험료',   v(), 1.0),
  ];
  sections.misc.rows = [
    makeRow('피복비 및 장구비', v()),
    makeRow('교육훈련비',       v()),
    makeRow('소모품비',         v()),
    makeRow('복리후생비',       v()),
  ];
  sections.profit.rows = [
    makeRow('일반관리비', v(), 2.0),
    makeRow('기업이윤',   v(), 2.0),
  ];
};

// ── 모달 열릴 때마다 초기화 ─────────────────────────────────
watch(() => props.isOpen, (v) => {
  if (v) {
    // selectedBudget에 items가 있으면 로드, 없으면 기본값
    if (props.selectedBudget?.items?.length) {
      loadFromItems(props.selectedBudget.items);
    } else {
      initDefaultRows();
    }
    docTitle.value = props.selectedBudget?.title
        || `${props.selectedBudget?.year || new Date().getFullYear()}년 산출내역서`;
  }
});

const loadFromItems = (items) => {
  // 기존 budget.items 배열을 섹션별로 분배
  const map = { '직접노무비': 'direct', '간접노무비': 'indirect',
    '보험료': 'insurance', '제경비': 'misc',
    '일반관리비': 'profit', '기업이윤': 'profit' };
  Object.values(sections).forEach(s => s.rows = []);
  items.forEach(item => {
    const key = map[item.category] || 'misc';
    sections[key].rows.push(makeRow(
        item.itemNm || item.name || item.label,
        item.amounts?.length ? [...item.amounts] : cols.value.map(() => item.amount || 0),
        item.pct || null
    ));
  });
  // 비어있는 섹션은 기본 1행 추가
  if (!sections.direct.rows.length)   initDefaultRows();
};

// ── 문서 제목 ─────────────────────────────────────────────────
const docTitle = ref('산출내역서');

// ── 합계 계산 ─────────────────────────────────────────────────
const num     = v => Number(v) || 0;
const fmt     = v => Math.round(num(v)).toLocaleString();
const rowSum  = row => row.vals.reduce((s, v) => s + num(v), 0);
const secSum  = (key, ci) => sections[key].rows.reduce((s, r) => s + num(r.vals[ci]), 0);

// 직접노무비: row[2]부터 합산 (품셈시급, 기존시급 제외)
const directSub   = ci => sections.direct.rows.slice(2).reduce((s, r) => s + num(r.vals[ci]), 0);
const indirectSub = ci => secSum('indirect', ci);
const laborSub    = ci => directSub(ci) + indirectSub(ci);
const insSub      = ci => secSum('insurance', ci);
const miscSub     = ci => secSum('misc', ci);
const costTotal   = ci => laborSub(ci) + insSub(ci) + miscSub(ci);
const profitSub   = ci => secSum('profit', ci);
const grandTotal  = ci => costTotal(ci) + profitSub(ci);

const grandWithCount = computed(() =>
    cols.value.reduce((s, c, ci) => s + grandTotal(ci) * c.count, 0)
);

// ── 행 추가/삭제 ────────────────────────────────────────────
const addRow = (key) => {
  sections[key].rows.push(makeRow('새 항목', cols.value.map(() => 0)));
};
const delRow = (key, ri) => {
  sections[key].rows.splice(ri, 1);
};

// ── 저장 ──────────────────────────────────────────────────────
const isSaving = ref(false);
const save = async () => {
  isSaving.value = true;
  try {
    // 기존 budget.items 형식으로 변환 (서버 호환)
    const items = [];
    const push = (category, rows) => rows.forEach(r => {
      items.push({ category, itemNm: r.label, amounts: [...r.vals], pct: r.pct, formula: '' });
    });
    push('직접노무비', sections.direct.rows);
    push('간접노무비', sections.indirect.rows);
    push('보험료',     sections.insurance.rows);
    push('제경비',     sections.misc.rows);
    push('이윤',       sections.profit.rows);

    const payload = {
      ...props.selectedBudget,
      title:       docTitle.value,
      items,
      totalAmount: grandWithCount.value,
    };

    emit('save', payload);
  } finally {
    isSaving.value = false;
  }
};

// ── 인쇄 ──────────────────────────────────────────────────────
const printSheet = () => window.print();
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="cs-overlay" @click.self="emit('close')">
      <div class="cs-modal">
        <div class="cs-header no-print">
          <div class="cs-header-left">
            <input v-model="docTitle" class="cs-title-inp" placeholder="산출내역서 제목" />
          </div>
          <div class="cs-header-right">
            <button class="cs-btn cs-btn-print" @click="printSheet">🖨 인쇄</button>
            <button class="cs-btn cs-btn-save" @click="save" :disabled="isSaving">
              {{ isSaving ? '저장 중...' : '💾 저장' }}
            </button>
            <button class="cs-btn cs-btn-close" @click="emit('close')">✕ 닫기</button>
          </div>
        </div>

        <div class="cs-body">
          <div class="cs-sheet">
            <div class="cs-sheet-title">{{ docTitle }}</div>
            <div class="cs-sheet-unit">단위:원/VAT별도</div>

            <div class="cs-table-wrap">
              <table class="cs-table">

                <!-- ── 헤더 ──────────────────────────────── -->
                <thead>
                <tr class="cs-hdr-row">
                  <th rowspan="2" colspan="2" class="cs-th-cat">구 분</th>
                  <th v-for="col in cols" :key="col.id" class="cs-th-col">
                    {{ col.label }}
                  </th>
                  <th class="cs-th-total">계</th>
                  <th class="cs-th-note" rowspan="2">비 고</th>
                </tr>
                <tr class="cs-hdr-row2">
                  <td v-for="col in cols" :key="col.id + '_c'" class="cs-td-cnt">
                    {{ col.count }}명
                  </td>
                  <td class="cs-td-cnt cs-cnt-total">
                    {{ cols.reduce((s, c) => s + c.count, 0) }}
                  </td>
                </tr>
                </thead>

                <!-- ── 직접노무비 ─────────────────────────── -->
                <tbody>
                <tr v-for="(row, ri) in sections.direct.rows" :key="row.id">
                  <td v-if="ri === 0" class="cs-td-main"
                      :rowspan="sections.direct.rows.length + 2">인건비</td>
                  <td v-if="ri === 0" class="cs-td-sub"
                      :rowspan="sections.direct.rows.length + 1">직접노무비</td>
                  <!-- 항목명 -->
                  <td class="cs-td-item">
                    <div class="cs-item-wrap">
                      <input v-model="row.label" class="cs-lbl-inp" placeholder="항목명" />
                      <button class="cs-row-del" @click="delRow('direct', ri)"
                              v-if="sections.direct.rows.length > 1">−</button>
                    </div>
                  </td>
                  <!-- 값 -->
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val">
                    <input v-model.number="row.vals[ci]" type="number" class="cs-val-inp" />
                  </td>
                  <td class="cs-td-cal">{{ fmt(rowSum(row)) }}</td>
                  <td v-if="ri === 0" :rowspan="sections.direct.rows.length + 6"
                      class="cs-td-note-cell"></td>
                </tr>
                <!-- 직접노무비 계 -->
                <tr class="cs-tr-sub">
                  <td class="cs-td-item cs-center cs-bold">계</td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val cs-bold cs-right">
                    {{ fmt(directSub(ci)) }}
                  </td>
                  <td class="cs-td-cal cs-bold">
                    {{ fmt(cols.reduce((s,_,ci)=>s+directSub(ci),0)) }}
                  </td>
                </tr>
                <!-- 행 추가 -->
                <tr class="cs-tr-add no-print">
                  <td :colspan="cols.length + 2">
                    <button class="cs-add-btn" @click="addRow('direct')">+ 행 추가</button>
                  </td>
                </tr>
                </tbody>

                <!-- ── 간접노무비 ─────────────────────────── -->
                <tbody>
                <tr v-for="(row, ri) in sections.indirect.rows" :key="row.id">
                  <td v-if="ri === 0" class="cs-td-main"
                      :rowspan="sections.indirect.rows.length + 2">인건비</td>
                  <td v-if="ri === 0" class="cs-td-sub"
                      :rowspan="sections.indirect.rows.length + 1">간접노무비</td>
                  <td class="cs-td-item">
                    <div class="cs-item-wrap">
                      <input v-model="row.label" class="cs-lbl-inp" placeholder="항목명" />
                      <button class="cs-row-del" @click="delRow('indirect', ri)"
                              v-if="sections.indirect.rows.length > 1">−</button>
                    </div>
                  </td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val">
                    <input v-model.number="row.vals[ci]" type="number" class="cs-val-inp" />
                  </td>
                  <td class="cs-td-cal">{{ fmt(rowSum(row)) }}</td>
                </tr>
                <tr class="cs-tr-sub">
                  <td class="cs-td-item cs-center cs-bold">계</td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val cs-bold cs-right">
                    {{ fmt(indirectSub(ci)) }}
                  </td>
                  <td class="cs-td-cal cs-bold">
                    {{ fmt(cols.reduce((s,_,ci)=>s+indirectSub(ci),0)) }}
                  </td>
                </tr>
                <tr class="cs-tr-add no-print">
                  <td :colspan="cols.length + 2">
                    <button class="cs-add-btn" @click="addRow('indirect')">+ 행 추가</button>
                  </td>
                </tr>
                <!-- 인건비 소계 -->
                <tr class="cs-tr-sec-sub">
                  <td colspan="2" class="cs-center cs-bold">소 계</td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-right cs-bold">
                    {{ fmt(laborSub(ci)) }}
                  </td>
                  <td class="cs-right cs-bold cs-darker">
                    {{ fmt(cols.reduce((s,_,ci)=>s+laborSub(ci),0)) }}
                  </td>
                </tr>
                </tbody>

                <!-- ── 보험료 ─────────────────────────────── -->
                <tbody>
                <tr v-for="(row, ri) in sections.insurance.rows" :key="row.id">
                  <td v-if="ri === 0" class="cs-td-main"
                      :rowspan="sections.insurance.rows.length + 2">보험료</td>
                  <td class="cs-td-item">
                    <div class="cs-item-wrap">
                      <span v-if="row.pct" class="cs-pct">{{ row.pct }}%</span>
                      <input v-model="row.label" class="cs-lbl-inp" placeholder="항목명" />
                      <button class="cs-row-del" @click="delRow('insurance', ri)"
                              v-if="sections.insurance.rows.length > 1">−</button>
                    </div>
                  </td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val">
                    <input v-model.number="row.vals[ci]" type="number" class="cs-val-inp" />
                  </td>
                  <td class="cs-td-cal">{{ fmt(rowSum(row)) }}</td>
                </tr>
                <tr class="cs-tr-sub">
                  <td class="cs-td-item cs-center cs-bold">소 계</td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val cs-bold cs-right">
                    {{ fmt(insSub(ci)) }}
                  </td>
                  <td class="cs-td-cal cs-bold">
                    {{ fmt(cols.reduce((s,_,ci)=>s+insSub(ci),0)) }}
                  </td>
                </tr>
                <tr class="cs-tr-add no-print">
                  <td :colspan="cols.length + 2">
                    <button class="cs-add-btn" @click="addRow('insurance')">+ 행 추가</button>
                  </td>
                </tr>
                </tbody>

                <!-- ── 제경비 ─────────────────────────────── -->
                <tbody>
                <tr v-for="(row, ri) in sections.misc.rows" :key="row.id">
                  <td v-if="ri === 0" class="cs-td-main"
                      :rowspan="sections.misc.rows.length + 3">제경비</td>
                  <td class="cs-td-item">
                    <div class="cs-item-wrap">
                      <input v-model="row.label" class="cs-lbl-inp" placeholder="항목명" />
                      <button class="cs-row-del" @click="delRow('misc', ri)"
                              v-if="sections.misc.rows.length > 1">−</button>
                    </div>
                  </td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val">
                    <input v-model.number="row.vals[ci]" type="number" class="cs-val-inp" />
                  </td>
                  <td class="cs-td-cal">{{ fmt(rowSum(row)) }}</td>
                </tr>
                <tr class="cs-tr-sub">
                  <td class="cs-td-item cs-center cs-bold">소 계</td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val cs-bold cs-right">
                    {{ fmt(miscSub(ci)) }}
                  </td>
                  <td class="cs-td-cal cs-bold">
                    {{ fmt(cols.reduce((s,_,ci)=>s+miscSub(ci),0)) }}
                  </td>
                </tr>
                <tr class="cs-tr-add no-print">
                  <td :colspan="cols.length + 2">
                    <button class="cs-add-btn" @click="addRow('misc')">+ 행 추가</button>
                  </td>
                </tr>
                <!-- 비용 합계 -->
                <tr class="cs-tr-cost">
                  <td colspan="2" class="cs-center cs-bold">비용 합계</td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-right cs-bold">
                    {{ fmt(costTotal(ci)) }}
                  </td>
                  <td class="cs-right cs-bold cs-darker">
                    {{ fmt(cols.reduce((s,_,ci)=>s+costTotal(ci),0)) }}
                  </td>
                </tr>
                </tbody>

                <!-- ── 이윤 ───────────────────────────────── -->
                <tbody>
                <tr v-for="(row, ri) in sections.profit.rows" :key="row.id">
                  <td v-if="ri === 0" class="cs-td-main"
                      :rowspan="sections.profit.rows.length + 1">이윤</td>
                  <td class="cs-td-item">
                    <div class="cs-item-wrap">
                      <span v-if="row.pct" class="cs-pct">{{ row.pct }}%</span>
                      <input v-model="row.label" class="cs-lbl-inp" placeholder="항목명" />
                    </div>
                  </td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val">
                    <input v-model.number="row.vals[ci]" type="number" class="cs-val-inp" />
                  </td>
                  <td class="cs-td-cal">{{ fmt(rowSum(row)) }}</td>
                </tr>
                <tr class="cs-tr-sub">
                  <td class="cs-td-item cs-center cs-bold">소 계</td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-td-val cs-bold cs-right">
                    {{ fmt(profitSub(ci)) }}
                  </td>
                  <td class="cs-td-cal cs-bold">
                    {{ fmt(cols.reduce((s,_,ci)=>s+profitSub(ci),0)) }}
                  </td>
                </tr>
                </tbody>

                <!-- ── 총 계 ──────────────────────────────── -->
                <tbody>
                <!-- 월간 1인당 용역비 -->
                <tr class="cs-tr-person-total">
                  <td colspan="2" class="cs-center cs-bold">월간 1인당 용역비</td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-right cs-bold">
                    {{ fmt(grandTotal(ci)) }}
                  </td>
                  <td class="cs-right cs-bold">—</td>
                </tr>
                <!-- 총계 -->
                <tr class="cs-tr-grand">
                  <td colspan="2" class="cs-center">총 계</td>
                  <td v-for="(col, ci) in cols" :key="ci" class="cs-grand-num">
                    {{ fmt(grandTotal(ci)) }} × {{ col.count }}명
                  </td>
                  <td class="cs-grand-num cs-grand-highlight">
                    {{ fmt(grandWithCount) }} 원
                  </td>
                </tr>
                </tbody>

              </table>
            </div><!-- /.cs-table-wrap -->

            <!-- ── 하단 요약 카드 ─────────────────────────── -->
            <div class="cs-cards no-print">
              <div class="cs-card" v-for="(col, ci) in cols" :key="col.id">
                <div class="cs-card-lbl">{{ col.label }} ({{ col.count }}명)</div>
                <div class="cs-card-val">{{ fmt(grandTotal(ci)) }}<span>원</span></div>
              </div>
              <div class="cs-card cs-card-total">
                <div class="cs-card-lbl">월 용역비 합계</div>
                <div class="cs-card-val">{{ fmt(grandWithCount) }}<span>원</span></div>
              </div>
            </div>

          </div><!-- /.cs-sheet -->
        </div><!-- /.cs-body -->

      </div><!-- /.cs-modal -->
    </div><!-- /.cs-overlay -->
  </Teleport>
</template>

<style scoped>
/* ── 오버레이 / 모달 ────────────────────────────────────────── */
.cs-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.55);
  display: flex; align-items: flex-start; justify-content: center;
  z-index: 2000;
  overflow-y: auto;
  padding: 24px 12px 40px;
}
.cs-modal {
  background: #dde0e5;
  border-radius: 12px;
  width: 100%; max-width: 1160px;
  box-shadow: 0 20px 60px rgba(0,0,0,.3);
  overflow: hidden;
  display: flex; flex-direction: column;
}

/* ── 모달 헤더 ──────────────────────────────────────────────── */
.cs-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px;
  background: #1a3a5c;
  gap: 12px;
  flex-shrink: 0;
}
.cs-header-left { flex: 1; }
.cs-title-inp {
  font-size: 15px; font-weight: 700; color: #fff;
  background: transparent; border: 1px solid rgba(255,255,255,.3);
  border-radius: 6px; padding: 6px 12px; width: 100%; max-width: 420px;
  font-family: inherit;
}
.cs-title-inp:focus { outline: none; border-color: #ffd700; }
.cs-header-right { display: flex; gap: 8px; }
.cs-btn {
  padding: 7px 16px; border: none; border-radius: 6px;
  font-size: 13px; font-weight: 700; cursor: pointer;
  font-family: inherit; transition: .15s;
}
.cs-btn-print { background: #2c7a4b; color: #fff; }
.cs-btn-print:hover { background: #1f5c38; }
.cs-btn-save  { background: #ffd700; color: #1a3a5c; }
.cs-btn-save:hover { background: #f0c800; }
.cs-btn-save:disabled { background: #ccc; color: #888; cursor: not-allowed; }
.cs-btn-close { background: rgba(255,255,255,.15); color: #fff; }
.cs-btn-close:hover { background: rgba(255,255,255,.25); }

/* ── 스크롤 바디 ────────────────────────────────────────────── */
.cs-body { overflow-y: auto; padding: 20px 16px 28px; }

/* ── 문서 시트 ──────────────────────────────────────────────── */
.cs-sheet {
  background: #fff;
  box-shadow: 0 4px 20px rgba(0,0,0,.14);
  padding: 22px 26px 28px;
}
.cs-sheet-title { text-align: center; font-size: 16px; font-weight: 700; margin-bottom: 3px; letter-spacing: .5px; }
.cs-sheet-unit  { text-align: right; font-size: 10px; color: #666; margin-bottom: 8px; }

/* ── 테이블 래퍼 (가로 스크롤) ─────────────────────────────── */
.cs-table-wrap { overflow-x: auto; }

/* ── 테이블 ─────────────────────────────────────────────────── */
.cs-table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: 12px; }
th, td { border: 1px solid #999; padding: 0; vertical-align: middle; }

/* 헤더 */
.cs-hdr-row th, .cs-hdr-row2 td {
  background: #d6dce7; text-align: center; font-weight: 700;
  font-size: 11px; padding: 5px 4px;
}
.cs-th-cat   { width: 120px; min-width: 90px; }
.cs-th-col   { min-width: 110px; }
.cs-th-total { background: #bfc9d9; min-width: 100px; }
.cs-th-note  { background: #d6dce7; width: 60px; }
.cs-td-cnt   { font-size: 11px; font-weight: 600; padding: 3px; }
.cs-cnt-total{ background: #bfc9d9; font-weight: 700; }

/* 구분 */
.cs-td-main { background: #eef1f6; text-align: center; font-weight: 700; font-size: 12px; padding: 4px; }
.cs-td-sub  { background: #f4f6fa; text-align: center; font-weight: 600; font-size: 11px; padding: 4px 3px; }

/* 항목 */
.cs-td-item { padding: 1px 5px; background: #fafafa; white-space: nowrap; }
.cs-item-wrap { display: flex; align-items: center; gap: 4px; }
.cs-pct { font-size: 10px; color: #777; min-width: 38px; }
.cs-lbl-inp {
  flex: 1; min-width: 80px;
  border: 1px solid transparent; font-size: 11px;
  padding: 2px 4px; border-radius: 3px; background: transparent;
  font-family: inherit;
}
.cs-lbl-inp:focus { border-color: #4a6fa5; background: #f0f4ff; outline: none; }
.cs-row-del {
  background: none; border: none; color: #c0392b;
  cursor: pointer; font-size: 14px; padding: 0 2px; flex-shrink: 0;
}

/* 값 */
.cs-td-val { text-align: right; padding: 1px 3px; }
.cs-val-inp {
  width: 100%; min-width: 80px;
  border: 1px solid transparent; font-size: 11px;
  text-align: right; padding: 2px 4px; border-radius: 3px;
  background: transparent; font-family: inherit;
}
.cs-val-inp:focus { border-color: #4a6fa5; background: #f0f4ff; outline: none; }
.cs-val-inp::-webkit-inner-spin-button { opacity: 0; }
.cs-val-inp:hover::-webkit-inner-spin-button { opacity: .5; }

.cs-td-cal { text-align: right; padding: 2px 6px; background: #f0f3f8; font-weight: 600; white-space: nowrap; }
.cs-td-note-cell { background: #fafafa; }

/* 소계 */
.cs-tr-sub td   { background: #e8edf5; font-weight: 700; }
.cs-tr-sub .cs-td-item { text-align: center; }

/* 섹션 소계 */
.cs-tr-sec-sub td { background: #cdd5e5; font-weight: 700; font-size: 12px; padding: 4px 6px; }
.cs-darker { background: #b8c5d8 !important; }

/* 비용합계 */
.cs-tr-cost td { background: #b5c1d6; font-weight: 700; font-size: 13px; padding: 5px 6px; }

/* 1인당 합계 */
.cs-tr-person-total td {
  background: #4a6fa5; color: #fff;
  font-weight: 700; font-size: 12px; padding: 5px 6px;
  text-align: right;
}
.cs-tr-person-total td:first-child { text-align: center; }

/* 총계 */
.cs-tr-grand td {
  background: #1a3a5c; color: #fff;
  font-weight: 700; font-size: 13px; padding: 7px 6px;
  text-align: right; border-color: #0f2540;
}
.cs-tr-grand td:first-child { text-align: center; }
.cs-grand-num { font-size: 12px; white-space: nowrap; }
.cs-grand-highlight { color: #ffd700; font-size: 15px; }

/* 행 추가 */
.cs-tr-add td { border: none; background: transparent; padding: 2px 0; }
.cs-add-btn {
  font-size: 11px; color: #4a6fa5; background: transparent;
  border: 1px dashed #4a6fa5; border-radius: 4px; padding: 2px 10px; cursor: pointer;
}
.cs-add-btn:hover { background: #f0f4ff; }

/* 공통 유틸 */
.cs-center { text-align: center !important; }
.cs-right  { text-align: right !important; padding: 2px 6px; }
.cs-bold   { font-weight: 700 !important; }

/* ── 카드 ───────────────────────────────────────────────────── */
.cs-cards { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.cs-card {
  flex: 1; min-width: 130px;
  background: #f4f6fa; border: 1px solid #cdd5e5; border-radius: 8px; padding: 10px 14px;
}
.cs-card-total { background: #1a3a5c; border-color: #0f2540; }
.cs-card-lbl   { font-size: 10px; color: #777; margin-bottom: 3px; }
.cs-card-total .cs-card-lbl { color: #aac4e0; }
.cs-card-val   { font-size: 17px; font-weight: 700; color: #1a3a5c; }
.cs-card-val span { font-size: 11px; font-weight: 400; margin-left: 2px; }
.cs-card-total .cs-card-val { color: #ffd700; }

/* ── 인쇄 ───────────────────────────────────────────────────── */
@media print {
  .no-print, .cs-header, .cs-row-del, .cs-add-btn, .cs-cards { display: none !important; }
  .cs-overlay { position: static; background: none; padding: 0; }
  .cs-modal   { box-shadow: none; background: white; }
  .cs-body    { padding: 0; overflow: visible; }
  .cs-sheet   { box-shadow: none; padding: 10px; }
  .cs-lbl-inp, .cs-val-inp { display: none !important; }
  .cs-table   { font-size: 10px; }
  .cs-tr-grand td, .cs-tr-person-total td,
  .cs-tr-cost td, .cs-tr-sec-sub td {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}
</style>
