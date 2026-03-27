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

const emit = defineEmits(['update:modelValue', 'update:label']) // label 업데이트 이벤트 추가

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
// v-model 양방향 바인딩 (목록에 있는 항목만 반환)
// ────────────────────────────────────────────────────────────
const innerValue = computed({
  get() {
    // modelValue(itemCd)를 기반으로 옵션에서 객체를 찾음
    return options.value.find(o => o.itemCd === props.modelValue) || null
  },
  set(val) {
    // 선택 시 부모의 label(이름)과 modelValue(코드)를 동시에 업데이트
    emit('update:modelValue', val?.itemCd || '');
    emit('update:label', val?.itemNm || ''); // 부모의 item.itemNm 등을 업데이트하기 위함
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

<style>
/* ==============================================
   테이블 내부 input과 완벽하게 높이를 맞추기 위한 CSS
============================================== */
.code-select.multiselect {
  font-family: inherit;
  font-size: 12px; /* 테이블 폰트 사이즈 연동 */
  color: var(--text-main);
  cursor: pointer;
  position: relative;
  box-sizing: border-box;
  min-height: 28px !important; /* 강제 높이 축소 */
}

/* 태그 박스 전체를 일반 input처럼 깎음 */
.code-select .multiselect__tags {
  min-height: 28px !important;
  padding: 0 24px 0 8px !important; /* 화살표 공간 24px 확보, 좌측 8px */
  border: 1px solid var(--border-color);
  border-radius: 5px; /* 테이블 input-value와 동일하게 */
  background: var(--bg-surface);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.code-select .multiselect__tags:hover {
  border-color: var(--border-focus);
}

.code-select.multiselect--active .multiselect__tags {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
  border-radius: 5px 5px 0 0;
}

/* 선택된 텍스트 */
.code-select .multiselect__single {
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

/* 검색창 (입력할 때) */
.code-select .multiselect__input {
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  font-size: 12px;
  color: var(--text-main);
  line-height: 1.2;
  width: 100% !important;
}
.code-select .multiselect__input::placeholder { color: var(--text-muted); opacity: 0.8; font-weight: normal; }

/* 플레이스홀더 */
.code-select .multiselect__placeholder {
  font-size: 12px;
  color: var(--text-muted);
  padding: 0;
  margin: 0;
  line-height: 1.2;
}

/* ── 드롭다운 패널 ── */
.code-select .multiselect__content-wrapper {
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

/* 리스트 아이템 기본 여백 제거 */
.code-select .multiselect__content,
.code-select .multiselect__element {
  list-style: none !important;
  padding: 0; margin: 0;
}
.code-select .multiselect__element::before, .code-select .multiselect__element::after { display: none !important; }

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

.code-select .multiselect__option { padding: 0; min-height: auto; transition: background 0.1s; }
.code-select .multiselect__option--highlight,
.code-select .multiselect__option--highlight::after { background: var(--primary-soft); color: var(--primary); }
.code-select .multiselect__option--selected,
.code-select .multiselect__option--selected::after { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
.code-select .multiselect__option::after { display: none !important; } /* vue-multiselect 특유의 텍스트 오버레이 제거 */

/* 우측 화살표 (Caret) */
.code-select .multiselect__select { display: none; }
.ss-caret {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  color: var(--text-sub); cursor: pointer; transition: transform .2s;
  display: flex; align-items: center; justify-content: center;
}
.code-select.multiselect--active .ss-caret { transform: translateY(-50%) rotate(180deg); }
.ss-caret i { font-size: 16px; }

/* 비활성화 상태 */
.code-select.multiselect--disabled { pointer-events: none; }
.code-select.multiselect--disabled .multiselect__tags { background: var(--bg-canvas); opacity: 0.7; }
</style>
