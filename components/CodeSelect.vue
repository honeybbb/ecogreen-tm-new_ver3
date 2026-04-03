<script setup>
/**
 * CodeSelect — 급여/공제 항목 검색 + 선택 (목록에 있는 항목만 선택 가능)
 */
import { ref, computed } from 'vue'
import Multiselect from 'vue-multiselect'

const props = defineProps({
  modelValue:  { default: '' },
  placeholder: { type: String,  default: '항목 선택' },
  allowEmpty:  { type: Boolean, default: false },
  disabled:    { type: Boolean, default: false },
  width:       { type: String,  default: '100%' }
})

const emit = defineEmits(['update:modelValue', 'update:label'])

const { wagesData, fetchWageCode } = useApi()

// ────────────────────────────────────────────────────────────
// 옵션 구성
// ────────────────────────────────────────────────────────────
const options = computed(() => {
  const base = wagesData.value.map(wage => ({
    itemCd: wage.itemCd,
    itemNm: wage.itemNm,
    label:  wage.itemNm,
  }))
  if (props.allowEmpty) {
    return [{ itemCd: null, itemNm: '', label: '전체' }, ...base]
  }
  return base
})

// ────────────────────────────────────────────────────────────
// v-model 양방향 바인딩
// ────────────────────────────────────────────────────────────
const innerValue = computed({
  get() {
    return options.value.find(o => o.itemCd === props.modelValue) || null
  },
  set(val) {
    emit('update:modelValue', val?.itemCd || '');
    emit('update:label', val?.itemNm || '');
  },
})

// 초기 로드
fetchWageCode()
</script>

<template>
  <Multiselect
      :style="{ width: props.width }"
      v-model="innerValue"
      :options="options"
      :multiple="false"
      :searchable="true"
      :taggable="false"
      :close-on-select="true"
      :clear-on-select="false"
      :placeholder="placeholder"
      label="label"
      track-by="itemNm"
      :allow-empty="allowEmpty"
      :disabled="disabled"
      select-label=""
      deselect-label=""
      selected-label="✓"
      :show-no-results="true"
      class="code-select"
  >
    <template #option="{ option }">
      <div class="ss-option" :class="{ 'ss-option--all': option.itemCd === null }">
        <i :class="['mdi', option.itemCd === null ? 'mdi-view-list' : 'mdi-tag-outline']" class="ss-option-icon"></i>
        <span class="ss-option-name">{{ option.label }}</span>
      </div>
    </template>

    <template #noResult>
      <div class="ss-no-result">
        <i class="mdi mdi-magnify-close"></i> 조건에 맞는 항목이 없습니다.
      </div>
    </template>

    <template #caret="{ toggle }">
      <div class="ss-caret" @click.prevent.stop="toggle">
        <i class="mdi mdi-chevron-down"></i>
      </div>
    </template>
  </Multiselect>
</template>

<style scoped>
/* ==============================================
   테이블 내부 input과 완벽하게 높이를 맞추기 위한 CSS
   (+ scoped 및 :deep 적용으로 겹침 현상 완벽 해결)
============================================== */
.code-select {
  font-family: inherit;
  font-size: 12px;
  color: var(--text-main);
  cursor: pointer;
  position: relative;
  box-sizing: border-box;
  min-height: 28px !important;
}

:deep(.multiselect__tags) {
  min-height: 28px !important;
  padding: 0 24px 0 8px !important;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-surface);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

:deep(.multiselect__tags:hover) {
  border-color: var(--border-focus);
}

:deep(.multiselect--active .multiselect__tags) {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
  border-radius: 5px 5px 0 0;
}

/* 선택된 텍스트 */
:deep(.multiselect__single) {
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  font-size: 12px;
  color: var(--text-main);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 검색창 */
:deep(.multiselect__input) {
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  font-size: 12px;
  color: var(--text-main);
  line-height: 1.2;
  width: 100% !important;
  box-shadow: none !important;
}

/* ★ 핵심 해결: 입력창 플레이스홀더를 숨겨서 겹침 방지 (선명하게 보이도록 처리) */
:deep(.multiselect__input::placeholder) {
  color: transparent !important;
}
:deep(.multiselect--active .multiselect__input::placeholder) {
  color: var(--text-muted) !important;
}

/* 커스텀 플레이스홀더 */
:deep(.multiselect__placeholder) {
  font-size: 12px;
  color: var(--text-muted);
  padding: 0;
  margin: 0;
  line-height: 1.2;
}

/* 드롭다운 패널 */
:deep(.multiselect__content-wrapper) {
  position: absolute;
  left: -1px; right: -1px; top: 100%;
  border: 1px solid var(--primary);
  border-top: none;
  border-radius: 0 0 5px 5px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  max-height: 200px;
  z-index: 999;
}

/* 리스트 스타일 제거 */
:deep(.multiselect__content),
:deep(.multiselect__element) {
  list-style: none !important;
  padding: 0; margin: 0;
}
:deep(.multiselect__element::before),
:deep(.multiselect__element::after) {
  display: none !important;
}

/* 커스텀 옵션 디자인 */
.ss-option {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-main);
  cursor: pointer;
}
.ss-option-icon { font-size: 14px; color: var(--primary); flex-shrink: 0; }
.ss-option-name { flex: 1; }

:deep(.multiselect__option) { padding: 0; min-height: auto; transition: background 0.1s; }
:deep(.multiselect__option--highlight),
:deep(.multiselect__option--highlight::after) { background: var(--primary-soft); color: var(--primary); }
:deep(.multiselect__option--selected),
:deep(.multiselect__option--selected::after) { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
:deep(.multiselect__option::after) { display: none !important; }

/* 우측 화살표 (Caret) */
:deep(.multiselect__select) { display: none; }
.ss-caret {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  color: var(--text-sub); cursor: pointer; transition: transform .2s;
  display: flex; align-items: center; justify-content: center;
}
:deep(.multiselect--active) .ss-caret { transform: translateY(-50%) rotate(180deg); }
.ss-caret i { font-size: 16px; }

/* 비활성화 상태 */
:deep(.multiselect--disabled) { pointer-events: none; }
:deep(.multiselect--disabled .multiselect__tags) { background: var(--bg-canvas); opacity: 0.7; }

.ss-no-result {
  padding: 12px 14px;
  font-size: 12px;
  color: var(--text-sub);
  display: flex; align-items: center; gap: 6px;
}
.ss-no-result i { font-size: 16px; opacity: 0.5; }

/* ── 드롭다운 패널 (스크롤 강제 생성 및 겹침 완벽 방지) ── */
:deep(.multiselect__content-wrapper) {
  position: absolute !important;
  left: -1px;
  right: -1px;
  top: 100%;

  /* 배경, 테두리, 그림자 설정 */
  background-color: var(--bg-surface, #ffffff) !important;
  border: 1px solid var(--primary) !important;
  border-top: none !important;
  border-radius: 0 0 5px 5px !important;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15) !important;

  /* ★ 핵심: 높이를 200px로 제한하고 넘어갈 경우 무조건 스크롤바 생성 */
  max-height: 200px !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;

  /* 테이블 tr보다 무조건 위로 뜨게 설정 */
  z-index: 9999 !important;
}

/* ★ 추가 방어: 내부 ul 태그가 제멋대로 커지는 것 방지 */
:deep(.multiselect__content) {
  display: block !important;
  padding: 0 !important;
  margin: 0 !important;
  width: 100% !important;
}

/* 스크롤바 디자인 (옵션) */
:deep(.multiselect__content-wrapper::-webkit-scrollbar) {
  width: 6px;
}
:deep(.multiselect__content-wrapper::-webkit-scrollbar-thumb) {
  background: var(--border-focus);
  border-radius: 3px;
}
</style>
