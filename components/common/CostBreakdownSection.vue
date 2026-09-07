<script setup>
/**
 * 산출내역서 공통 컴포넌트
 *
 * 사용 예)
 *   <CostBreakdownSection :group="group" />
 *   <CostBreakdownSection :group="group" variant="register" />
 *
 * - group 객체를 그대로 받아 group.costBreakdown / group.manualMonthlyTotal 을 직접 수정합니다.
 *   (부모의 contractGroups 배열 안 객체를 참조하므로 저장 시 별도 동기화가 필요 없습니다.)
 * - 직책(staffList) 추가/삭제는 부모가 하고, 컬럼 동기화는 이 컴포넌트가 알아서 처리합니다.
 */
import { computed, watch } from 'vue';
import {
  syncCostBreakdownToStaff,
  createDefaultCostBreakdown,
  getRowTotal,
  getDirectLaborColTotal,
  getIndirectLaborColTotal,
  getExpensesColTotal,
  getLaborColTotal,
  getManagementFeeCol,
  getProfitCol,
  getMonthlyTotalCol,
  getSubtotalRowTotal,
  getTotalMonthlyFee,
  getDisplayMonthlyTotal,
  addCostItem,
  removeCostItem,
  onInputCost,
  onInputSingleCost,
  onInputSingleRaw,
  onInputMonthlyTotal,
  handleTableKeydown,
} from '~/composables/useCostBreakdown.js';

const props = defineProps({
  /** 계약 그룹 객체 (staffList / costBreakdown 포함) */
  group: { type: Object, required: true },

  /** 'detail' | 'register' — 안내 문구만 달라집니다. */
  variant: { type: String, default: 'detail' },

  /** 접기/펼치기 토글 버튼 노출 여부 */
  collapsible: { type: Boolean, default: true },

  /** 열림 상태를 부모가 제어할 때 사용 (미지정 시 group.showCostBreakdown 사용) */
  open: { type: Boolean, default: undefined },

  /** 읽기 전용 모드 */
  readonly: { type: Boolean, default: false },

  /** 빈 값의 기본값 ('' 또는 0) */
  emptyValue: { type: [String, Number], default: '' },

  /** 산출내역서 하단 특이사항 노출 여부 */
  showSpecialNote: { type: Boolean, default: true },
});

const emit = defineEmits(['update:open', 'change']);

const isRegister = computed(() => props.variant === 'register');

const isOpen = computed(() =>
    props.open !== undefined ? props.open : !!props.group.showCostBreakdown
);

const toggleOpen = () => {
  const next = !isOpen.value;
  if (props.open === undefined) props.group.showCostBreakdown = next;
  emit('update:open', next);
};

const staffList = computed(() => props.group.staffList ?? []);
const cb = computed(() => props.group.costBreakdown);
const displayTotal = computed(() => getDisplayMonthlyTotal(props.group));

const toggleLabel = computed(() => {
  if (isRegister.value) {
    return isOpen.value ? '상세 산출내역 닫기' : '상세 산출내역 작성하기 (선택)';
  }
  return isOpen.value ? '산출내역서 접기' : '산출내역서 펼치기';
});

const emptyMessage = computed(() =>
    isRegister.value ? '투입 인원을 먼저 추가해주세요.' : '직책별 인원 구성을 먼저 설정해주세요.'
);

const emptyIcon = computed(() =>
    isRegister.value ? 'mdi-account-plus-outline' : 'mdi-table-plus'
);

// costBreakdown 보장 + 직책 목록 변경 시 컬럼 자동 동기화
watch(
    () => staffList.value.map((s) => s.code).join('|'),
    () => {
      if (!props.group.costBreakdown) {
        props.group.costBreakdown = createDefaultCostBreakdown(staffList.value, props.emptyValue);
      } else {
        syncCostBreakdownToStaff(props.group, props.emptyValue);
      }
    },
    { immediate: true }
);

const onAddItem    = (section) => { addCostItem(props.group, section, props.emptyValue); emit('change'); };
const onRemoveItem = (section, idx) => { removeCostItem(props.group, section, idx); emit('change'); };

const handleCostInput = (item, code, event) => { onInputCost(item, code, event); emit('change'); };
const handleSingleInput = (obj, code, event) => { onInputSingleCost(obj, code, event); emit('change'); };
const handleRawInput = (obj, key, event) => { onInputSingleRaw(obj, key, event); emit('change'); };
const handleMonthlyTotalInput = (event) => { onInputMonthlyTotal(props.group, event); emit('change'); };

const mgmtLabel = ref('일반관리비');
const mgmtCode = ref(''); // 필요한 경우 DB 관리항목 코드 입력 (예: '04004001')

const profitLabel = ref('기업이윤');
const profitCode = ref(''); // 필요한 경우 DB 관리항목 코드 입력 (예: '04004002')

// 템플릿에서 쓰기 위해 노출
defineExpose({ displayTotal });
</script>

<template>
  <div class="cost-breakdown-wrapper">
    <!-- 토글 버튼 -->
    <button
        v-if="collapsible"
        type="button"
        class="btn-toggle-cost"
        @click="toggleOpen"
    >
      <i :class="isOpen ? 'mdi mdi-chevron-up' : 'mdi mdi-chevron-down'"></i>
      <span class="toggle-text">{{ toggleLabel }}</span>
      <span v-if="displayTotal > 0" class="cost-preview-badge">
        월 {{ formatCurrency(displayTotal) }}원
      </span>
    </button>

    <div v-show="isOpen" class="cost-breakdown-section">
      <!-- 직책 미설정 -->
      <div v-if="!staffList.length" class="cost-no-staff">
        <i class="mdi" :class="emptyIcon"></i>
        <p>{{ emptyMessage }}</p>
      </div>

      <template v-else-if="cb">
        <div class="cost-scroll-area" @keydown="handleTableKeydown">

          <!-- ── 근로시간 기준 ── -->
          <div class="cost-section-title">
            <span class="cost-block-label label-hours"><i class="mdi mdi-clock-check"></i></span>
            근로시간 기준 <em>(인건비 산출 근거)</em>
          </div>
          <table class="cost-table hours-standalone-table">
            <thead>
            <tr>
              <th class="col-label">항목</th>
              <th v-for="staff in staffList" :key="staff.code" class="col-staff">
                <span class="staff-th-name">{{ staff.name }}</span>
                <span class="staff-th-count">({{ staff.count }}명)</span>
              </th>
              <th class="col-rowtotal-head">행합계</th>
              <th class="col-bigo">산출내역 / 근거</th>
              <th class="col-action"></th>
            </tr>
            </thead>
            <tbody>
            <tr>
              <td class="hours-label-cell">
                <span class="summary-label">
                  <i class="mdi mdi-clock-outline text-primary"></i> 일 근로시간 (H)
                </span>
              </td>
              <td v-for="staff in staffList" :key="staff.code">
                <input
                    type="text"
                    inputmode="decimal"
                    v-model.number="cb.dailyWorkHours[staff.code]"
                    :disabled="readonly"
                    class="tbl-value-input text-right hours-input"
                    placeholder="0"
                    @focus="$event.target.select()"
                />
              </td>
              <td class="col-rowtotal-cell hours-empty-cell">-</td>
              <td>
                <input
                    type="text"
                    class="tbl-value-input"
                    v-model="cb.dailyHoursBigo"
                    :disabled="readonly"
                    placeholder="예: 휴게 1시간 제외"
                />
              </td>
              <td></td>
            </tr>
            <tr>
              <td class="hours-label-cell">
                <span class="summary-label">
                  <i class="mdi mdi-calendar-clock text-primary"></i> 월 근로시간 (H)
                </span>
              </td>
              <td v-for="staff in staffList" :key="staff.code">
                <input
                    type="text"
                    inputmode="decimal"
                    v-model.number="cb.monthlyWorkHours[staff.code]"
                    :disabled="readonly"
                    class="tbl-value-input text-right hours-input"
                    placeholder="0"
                    @focus="$event.target.select()"
                />
              </td>
              <td class="col-rowtotal-cell hours-empty-cell">-</td>
              <td>
                <input
                    type="text"
                    class="tbl-value-input"
                    v-model="cb.monthlyHoursBigo"
                    :disabled="readonly"
                    placeholder="예: 주 40시간 + 주휴"
                />
              </td>
              <td></td>
            </tr>
            </tbody>
          </table>

          <!-- ── A. 직접노무비 ── -->
          <div class="cost-section-title">
            <span class="cost-block-label label-direct">A</span>
            직접노무비 <em>(지급내역)</em>
            <button v-if="!readonly" type="button" class="btn-add-cost-item" @click="onAddItem('directLabor')">
              <i class="mdi mdi-plus"></i>항목 추가
            </button>
          </div>
          <table class="cost-table">
            <thead>
            <tr>
              <th class="col-label">항목</th>
              <th v-for="staff in staffList" :key="staff.code" class="col-staff">
                <span class="staff-th-name">{{ staff.name }}</span>
                <span class="staff-th-count">({{ staff.count }}명)</span>
              </th>
              <th class="col-rowtotal-head">행합계</th>
              <th class="col-bigo">산출내역</th>
              <th class="col-action"></th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(item, iIdx) in cb.directLabor" :key="'dl-' + iIdx">
              <td>
                <CategorySelect v-model="item.label" v-model:code="item.code" topCode="04001" />
              </td>
              <td v-for="staff in staffList" :key="staff.code">
                <input
                    type="text"
                    :value="formatCurrency(item.values[staff.code])"
                    :disabled="readonly"
                    class="tbl-value-input"
                    @focus="$event.target.select()"
                    @input="handleCostInput(item, staff.code, $event)"
                />
              </td>
              <td class="col-rowtotal-cell">{{ formatCurrency(getRowTotal(item, staffList)) }}</td>
              <td><input type="text" class="tbl-value-input" v-model="item.bigo" :disabled="readonly" /></td>
              <td>
                <button v-if="!readonly" type="button" class="btn-remove-cost" @click="onRemoveItem('directLabor', iIdx)">
                  <i class="mdi mdi-close"></i>
                </button>
              </td>
            </tr>
            <tr v-if="!cb.directLabor.length">
              <td :colspan="staffList.length + 4" class="cost-row-empty">항목을 추가해주세요.</td>
            </tr>
            </tbody>
            <tfoot>
            <tr class="tfoot-subtotal">
              <td>소계 (A)</td>
              <td v-for="staff in staffList" :key="staff.code">
                {{ formatCurrency(getDirectLaborColTotal(group, staff.code)) }}
              </td>
              <td class="col-rowtotal-cell subtotal-rowtotal">
                {{ formatCurrency(getSubtotalRowTotal(group, getDirectLaborColTotal)) }}
              </td>
              <td><input type="text" class="tbl-value-input" v-model="cb.directLaborBigo" :disabled="readonly" /></td>
              <td></td>
            </tr>
            </tfoot>
          </table>

          <!-- ── B. 간접노무비 ── -->
          <div class="cost-section-title">
            <span class="cost-block-label label-indirect">B</span>
            간접노무비 <em>(공제내역)</em>
            <button v-if="!readonly" type="button" class="btn-add-cost-item" @click="onAddItem('indirectLabor')">
              <i class="mdi mdi-plus"></i>항목 추가
            </button>
          </div>
          <table class="cost-table">
            <thead>
            <tr>
              <th class="col-label">항목</th>
              <th v-for="staff in staffList" :key="staff.code" class="col-staff">
                <span class="staff-th-name">{{ staff.name }}</span>
                <span class="staff-th-count">({{ staff.count }}명)</span>
              </th>
              <th class="col-rowtotal-head">행합계</th>
              <th class="col-bigo">산출내역</th>
              <th class="col-action"></th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(item, iIdx) in cb.indirectLabor" :key="'il-' + iIdx">
              <td>
                <CategorySelect v-model="item.label" v-model:code="item.code" topCode="04002" />
              </td>
              <td v-for="staff in staffList" :key="staff.code">
                <input
                    type="text"
                    :value="formatCurrency(item.values[staff.code])"
                    :disabled="readonly"
                    class="tbl-value-input"
                    @focus="$event.target.select()"
                    @input="handleCostInput(item, staff.code, $event)"
                />
              </td>
              <td class="col-rowtotal-cell">{{ formatCurrency(getRowTotal(item, staffList)) }}</td>
              <td><input type="text" class="tbl-value-input" v-model="item.bigo" :disabled="readonly" /></td>
              <td>
                <button v-if="!readonly" type="button" class="btn-remove-cost" @click="onRemoveItem('indirectLabor', iIdx)">
                  <i class="mdi mdi-close"></i>
                </button>
              </td>
            </tr>
            <tr v-if="!cb.indirectLabor.length">
              <td :colspan="staffList.length + 4" class="cost-row-empty">항목을 추가해주세요.</td>
            </tr>
            </tbody>
            <tfoot>
            <tr class="tfoot-subtotal">
              <td>소계 (B)</td>
              <td v-for="staff in staffList" :key="staff.code">
                {{ formatCurrency(getIndirectLaborColTotal(group, staff.code)) }}
              </td>
              <td class="col-rowtotal-cell subtotal-rowtotal">
                {{ formatCurrency(getSubtotalRowTotal(group, getIndirectLaborColTotal)) }}
              </td>
              <td><input type="text" class="tbl-value-input" v-model="cb.indirectLaborBigo" :disabled="readonly" /></td>
              <td></td>
            </tr>
            </tfoot>
          </table>

          <!-- ── C. 제경비 ── -->
          <div class="cost-section-title">
            <span class="cost-block-label label-expense">C</span>
            제경비
            <button v-if="!readonly" type="button" class="btn-add-cost-item" @click="onAddItem('expenses')">
              <i class="mdi mdi-plus"></i>항목 추가
            </button>
          </div>
          <table class="cost-table">
            <thead>
            <tr>
              <th class="col-label">항목</th>
              <th v-for="staff in staffList" :key="staff.code" class="col-staff">
                <span class="staff-th-name">{{ staff.name }}</span>
                <span class="staff-th-count">({{ staff.count }}명)</span>
              </th>
              <th class="col-rowtotal-head">행합계</th>
              <th class="col-bigo">산출내역</th>
              <th class="col-action"></th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(item, eIdx) in cb.expenses" :key="'exp-' + eIdx">
              <td>
                <CategorySelect v-model="item.label" v-model:code="item.code" topCode="04003" />
              </td>
              <td v-for="staff in staffList" :key="staff.code">
                <input
                    type="text"
                    :value="formatCurrency(item.values[staff.code])"
                    :disabled="readonly"
                    class="tbl-value-input"
                    @focus="$event.target.select()"
                    @input="handleCostInput(item, staff.code, $event)"
                />
              </td>
              <td class="col-rowtotal-cell">{{ formatCurrency(getRowTotal(item, staffList)) }}</td>
              <td><input type="text" class="tbl-value-input" v-model="item.bigo" :disabled="readonly" /></td>
              <td>
                <button v-if="!readonly" type="button" class="btn-remove-cost" @click="onRemoveItem('expenses', eIdx)">
                  <i class="mdi mdi-close"></i>
                </button>
              </td>
            </tr>
            <tr v-if="!cb.expenses.length">
              <td :colspan="staffList.length + 4" class="cost-row-empty">항목을 추가해주세요.</td>
            </tr>
            </tbody>
            <tfoot>
            <tr class="tfoot-subtotal">
              <td>소계 (C)</td>
              <td v-for="staff in staffList" :key="staff.code">
                {{ formatCurrency(getExpensesColTotal(group, staff.code)) }}
              </td>
              <td class="col-rowtotal-cell subtotal-rowtotal">
                {{ formatCurrency(getSubtotalRowTotal(group, getExpensesColTotal)) }}
              </td>
              <td><input type="text" class="tbl-value-input" v-model="cb.expensesBigo" :disabled="readonly" /></td>
              <td></td>
            </tr>
            </tfoot>
          </table>

          <!-- ── 합계 ── -->
          <div class="cost-section-title">
            <span class="cost-block-label label-total">합계</span>노무비 합계 및 용역비 산출
          </div>
          <table class="cost-table summary-table">
            <thead>
            <tr>
              <th class="col-label">항목</th>
              <th v-for="staff in staffList" :key="staff.code" class="col-staff">
                <span class="staff-th-name">{{ staff.name }}</span>
                <span class="staff-th-count">({{ staff.count }}명)</span>
              </th>
              <th class="col-rowtotal-head">행합계</th>
              <th class="col-bigo">산출 내역</th>
            </tr>
            </thead>
            <tbody>
            <!-- D -->
            <tr class="summary-row row-d">
              <td>
                <span class="summary-label">
                  <span class="cost-block-label label-total">D</span>노무비 합계 (A+B+C)
                </span>
              </td>
              <td v-for="staff in staffList" :key="staff.code">
                <span class="summary-val">{{ formatCurrency(getLaborColTotal(group, staff.code)) }}</span>
              </td>
              <td class="col-rowtotal-cell">
                <span class="summary-val">{{ formatCurrency(getSubtotalRowTotal(group, getLaborColTotal)) }}</span>
              </td>
              <td><input type="text" class="tbl-value-input" v-model="cb.laborTotalBigo" :disabled="readonly" /></td>
            </tr>
            <!-- E -->
            <tr class="summary-row row-e">
              <td>
                <span class="summary-label">
                  <span class="cost-block-label label-mgmt">E</span>
                  <!-- cb.managementFee 의 code/label 직접 연동 -->
                  <CategorySelect
                      v-model="cb.managementFee.label"
                      v-model:code="cb.managementFee.code"
                      topCode="04004"
                      disabled
                      style="flex: 1;"
                  />
                </span>
              </td>
              <td v-for="staff in staffList" :key="staff.code">
                <input
                    type="text"
                    :value="formatCurrency(cb.managementFee.values[staff.code])"
                    :disabled="readonly"
                    class="tbl-value-input text-right"
                    @focus="$event.target.select()"
                    @input="handleCostInput(cb.managementFee, staff.code, $event)"
                />
              </td>
              <td class="col-rowtotal-cell">
                <span class="summary-val">{{ formatCurrency(getSubtotalRowTotal(group, getManagementFeeCol)) }}</span>
              </td>
              <td><input type="text" class="tbl-value-input" v-model="cb.managementFeeBigo" :disabled="readonly" /></td>
            </tr>

            <!-- F -->
            <tr class="summary-row row-f">
              <td>
                <span class="summary-label">
                  <span class="cost-block-label label-profit">F</span>
                  <!-- cb.profit 의 code/label 직접 연동 -->
                  <CategorySelect
                      v-model="cb.profit.label"
                      v-model:code="cb.profit.code"
                      topCode="04004"
                      disabled
                      style="flex: 1;"
                  />
                </span>
              </td>
              <td v-for="staff in staffList" :key="staff.code">
                <input
                    type="text"
                    :value="formatCurrency(cb.profit.values[staff.code])"
                    :disabled="readonly"
                    class="tbl-value-input text-right"
                    @focus="$event.target.select()"
                    @input="handleCostInput(cb.profit, staff.code, $event)"
                />
              </td>
              <td class="col-rowtotal-cell">
                <span class="summary-val">{{ formatCurrency(getSubtotalRowTotal(group, getProfitCol)) }}</span>
              </td>
              <td><input type="text" class="tbl-value-input" v-model="cb.profitBigo" :disabled="readonly" /></td>
            </tr>
            <!-- 1인당 월 용역비 -->
            <tr class="summary-row row-monthly">
              <td>
                <span class="summary-label">
                  <span class="cost-block-label label-monthly">월</span>1인당 월 용역비 (D+E+F)
                </span>
              </td>
              <td v-for="staff in staffList" :key="staff.code">
                <span class="summary-val highlight">{{ formatCurrency(getMonthlyTotalCol(group, staff.code)) }}</span>
              </td>
              <td class="col-rowtotal-cell">
                <span class="summary-val highlight">{{ formatCurrency(getSubtotalRowTotal(group, getMonthlyTotalCol)) }}</span>
              </td>
              <td><input type="text" class="tbl-value-input" v-model="cb.monthlyFeeBigo" :disabled="readonly" /></td>
            </tr>
            <!-- 월간 용역비 총계 (수동 입력 가능) -->
            <tr class="summary-row row-total-fee">
              <td>
                <span class="summary-label">
                  <span class="cost-block-label label-total-fee">합</span>월간 용역비 총계
                </span>
              </td>
              <td :colspan="staffList.length">
                <input
                    type="text"
                    :value="formatCurrency(displayTotal)"
                    :disabled="readonly"
                    class="tbl-value-input grand-total-input"
                    @focus="$event.target.select()"
                    @input="handleMonthlyTotalInput"
                />
              </td>
              <td class="col-rowtotal-cell">
                <span class="summary-val grand-total">{{ formatCurrency(displayTotal) }}</span>
              </td>
              <td>
                <span v-if="displayTotal !== getTotalMonthlyFee(group)" class="manual-hint" title="자동 계산값과 다릅니다">
                  직접 입력됨 (자동 {{ formatCurrency(getTotalMonthlyFee(group)) }})
                </span>
              </td>
            </tr>
            <!-- 계약기간 총액 -->
            <tr class="summary-row row-contract-total">
              <td>
                <span class="summary-label">
                  <span class="cost-block-label label-contract-total">계</span>계약기간 총액
                </span>
              </td>
              <td :colspan="staffList.length">
                <input
                    type="text"
                    :value="formatCurrency(cb.contractTotalFee)"
                    :disabled="readonly"
                    class="tbl-value-input grand-total-input contract-total-input"
                    placeholder="직접 입력"
                    @focus="$event.target.select()"
                    @input="handleRawInput(cb, 'contractTotalFee', $event)"
                />
              </td>
              <td class="col-rowtotal-cell"></td>
              <td>
                <input
                    type="text"
                    class="tbl-value-input"
                    v-model="cb.contractTotalBigo"
                    :disabled="readonly"
                    placeholder="예: 24개월 × 월 용역비"
                />
              </td>
            </tr>
            </tbody>
          </table>
        </div>

        <!-- 특이사항 -->
        <div v-if="showSpecialNote" class="cost-special-note">
          <label class="form-label">
            <i class="mdi mdi-text-box-edit-outline"></i>특이사항
          </label>
          <textarea
              v-model="cb.specialNote"
              :disabled="readonly"
              class="form-textarea"
              rows="3"
              placeholder="예: 최저임금 기준 적용, 5대보험 전원 가입 조건 등"
          ></textarea>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* =============================================
   토글 버튼
============================================= */
.cost-breakdown-wrapper { margin-top: 0; }

.btn-toggle-cost {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 12px 18px;
  background: var(--bg-canvas); border: 1px dashed var(--border-color);
  border-radius: 10px; font-size: 13px; font-weight: 600;
  color: var(--text-main); cursor: pointer; transition: all 0.2s; text-align: left;
}
.btn-toggle-cost:hover {
  background: var(--primary-soft); border-color: var(--primary);
  color: var(--primary); border-style: solid;
}
.btn-toggle-cost .toggle-text { flex: 1; }
.cost-preview-badge {
  padding: 3px 10px; background: var(--primary); color: var(--text-inverse, #fff);
  border-radius: 20px; font-size: 12px; font-weight: 700; white-space: nowrap;
}

/* =============================================
   본문 컨테이너
============================================= */
.cost-breakdown-section {
  margin-top: 8px; border: 1px solid var(--border-focus); border-radius: 10px;
  overflow: hidden; background: var(--bg-surface);
}
.cost-no-staff { padding: 32px 20px; text-align: center; color: var(--text-sub); }
.cost-no-staff i { font-size: 36px; margin-bottom: 10px; opacity: .5; display: block; }
.cost-no-staff p { margin: 0; font-size: 13px; }

.cost-scroll-area {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 20px 20px;
}

.cost-section-title {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 0 10px;
  font-weight: 700; font-size: 13px; color: var(--text-main);
}
.cost-section-title em { font-style: normal; font-weight: 400; font-size: 12px; color: var(--text-sub); }

.btn-add-cost-item {
  display: flex; align-items: center; gap: 4px; margin-left: auto;
  padding: 4px 10px; font-size: 11px; font-weight: 600;
  background: var(--bg-surface); border: 1px dashed var(--primary);
  border-radius: 6px; color: var(--primary); cursor: pointer;
}
.btn-add-cost-item:hover { background: var(--primary-soft); }

.cost-block-label {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 5px; border-radius: 5px;
  font-size: 11px; font-weight: 800; color: var(--text-inverse, #fff); flex-shrink: 0;
}
.label-hours { background: #6b7280; }
.label-direct { background: #3b82f6; }
.label-indirect { background: #8b5cf6; }
.label-expense { background: #f59e0b; }
.label-total { background: #10b981; }
.label-mgmt { background: #6b7280; }
.label-profit { background: #ec4899; }
.label-monthly { background: #0ea5e9; }
.label-total-fee { background: #f97316; }
.label-contract-total { background: #475569; }

/* =============================================
   테이블
============================================= */
.cost-table {
  width: 100%; border-collapse: collapse; font-size: 12px;
  color: var(--text-main); table-layout: fixed; min-width: 600px;
}
.cost-table thead tr { background: var(--bg-canvas); }
.cost-table th, .cost-table td {
  padding: 8px 10px; border: 1px solid var(--border-color); vertical-align: middle;
}
.cost-table th {
  font-size: 11px; font-weight: 700; color: var(--text-sub);
  text-align: center; white-space: nowrap;
}

.col-label { min-width: 140px; width: 170px; }
.col-staff { min-width: 130px; text-align: center; }
.col-action { width: 36px; text-align: center; }
.col-bigo { min-width: 120px; text-align: right; font-weight: 600; background: rgba(99, 102, 241, 0.04); }

.staff-th-name { display: block; font-size: 12px; font-weight: 700; color: var(--text-main); }
.staff-th-count { display: block; font-size: 11px; color: var(--text-sub); font-weight: 400; }

.col-rowtotal-head {
  width: 90px; min-width: 90px; text-align: right;
  background: rgba(99, 102, 241, 0.06) !important;
  color: var(--primary) !important; font-weight: 700 !important;
  border-right: 2px solid var(--border-focus) !important; white-space: nowrap;
}
.col-rowtotal-cell {
  text-align: right; font-size: 12px; font-weight: 700; color: var(--primary);
  background: rgba(99, 102, 241, 0.04);
  border-right: 2px solid var(--border-focus) !important;
  white-space: nowrap; padding: 8px 10px;
}
.subtotal-rowtotal { background: rgba(99, 102, 241, 0.10) !important; font-size: 13px; }
.hours-empty-cell { color: var(--text-muted); font-weight: 400; }

.cost-row-empty {
  text-align: center; color: var(--text-muted); font-size: 12px; padding: 16px 0;
}

.tbl-value-input {
  width: 100%; padding: 5px 8px; border: 1px solid var(--border-color);
  border-radius: 5px; font-size: 12px; color: var(--text-main);
  background: var(--bg-surface); box-sizing: border-box; text-align: right;
}
.tbl-value-input:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
.tbl-value-input:disabled {
  background: var(--bg-canvas); color: var(--text-sub); cursor: default;
}

.btn-remove-cost {
  width: 24px; height: 24px; border-radius: 4px;
  background: rgba(239, 68, 68, .1); border: none; color: var(--danger);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}

.tfoot-subtotal td {
  background: var(--bg-canvas); font-size: 12px; font-weight: 700;
  color: var(--text-main); text-align: right;
  border-top: 2px solid var(--border-focus);
}
.tfoot-subtotal td:first-child { text-align: left; }

/* =============================================
   합계 테이블
============================================= */
.summary-table tbody tr td { background: var(--bg-surface); }
.summary-row td { padding: 10px; }
.summary-label {
  display: flex; align-items: center; gap: 6px;
  font-weight: 600; font-size: 12px; white-space: nowrap;
}
.summary-val {
  display: block; text-align: right; font-size: 12px;
  font-weight: 600; color: var(--text-main); white-space: nowrap;
}
.summary-val.highlight { color: var(--primary); font-weight: 700; }
.summary-val.grand-total { font-size: 15px; font-weight: 800; color: var(--primary); }

.row-d td { background: rgba(16, 185, 129, .04) !important; }
.row-e td { background: rgba(107, 114, 128, .04) !important; }
.row-f td { background: rgba(236, 72, 153, .04) !important; }
.row-monthly td { background: rgba(14, 165, 233, .06) !important; }
.row-total-fee td { background: var(--primary-soft) !important; }

.grand-total-input {
  font-size: 16px; font-weight: 800; color: var(--primary);
  border-color: var(--primary); padding: 8px;
}
.contract-total-input { font-size: 14px; font-weight: 700; color: var(--text-main); }

.manual-hint { font-size: 11px; color: var(--text-muted); }

/* =============================================
   특이사항
============================================= */
.cost-special-note {
  padding: 16px 20px; display: flex; flex-direction: column; gap: 8px;
  border-top: 1px solid var(--border-color); background: var(--bg-canvas);
}
.cost-special-note .form-label {
  font-size: 12px; font-weight: 600; color: var(--text-sub);
  display: flex; align-items: center; gap: 4px;
}
.form-textarea {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border-color);
  border-radius: 8px; font-size: 13px; color: var(--text-main);
  background: var(--bg-surface); resize: vertical; box-sizing: border-box;
}
.form-textarea:focus {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft);
}

/* =============================================
   모바일
============================================= */
@media (max-width: 768px) {
  .cost-scroll-area { padding: 0 12px 16px; }
  .col-rowtotal-head, .col-rowtotal-cell { min-width: 80px; font-size: 11px; }
  .tbl-value-input { padding: 4px 6px; font-size: 11px; min-width: 60px; }
  .staff-th-name { font-size: 11px; }
  .staff-th-count { font-size: 10px; }
}

/* =============================================
   합계 테이블
============================================= */
.summary-table tbody tr td { background: var(--bg-surface); }
.summary-row td { padding: 10px; }
.summary-label {
  display: flex; align-items: center; gap: 6px;
  font-weight: 600; font-size: 12px; white-space: nowrap;
}

/* [추가] 요약 테이블 안의 Select 박스 폭 맞춤 */
.summary-label :deep(.category-select),
.summary-label :deep(select) {
  min-width: 120px;
}
</style>