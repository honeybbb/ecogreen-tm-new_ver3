<script setup>
/**
 * SiteSelect — 현장 검색 + 선택 공용 컴포넌트
 *
 * [사용법]
 * <SiteSelect v-model="selectedSite" />
 * <SiteSelect v-model="selectedSite" placeholder="현장 선택" :allow-empty="false" />
 * <SiteSelect v-model="selectedSites" :multiple="true" />
 *
 * [Props]
 * modelValue  — 선택된 값 (siteOptions 항목 또는 '전체' 문자열)
 * placeholder — 미선택 시 표시 텍스트
 * multiple    — 다중 선택 여부 (기본 false)
 * allowEmpty  — 전체(빈 값) 선택 허용 여부 (기본 true)
 * disabled    — 비활성
 */
import { ref, computed, watch } from 'vue'
import Multiselect from 'vue-multiselect'

const props = defineProps({
  modelValue:  { default: '전체' },
  placeholder: { type: String,  default: '현장을 검색하세요...' },
  multiple:    { type: Boolean, default: false },
  allowEmpty:  { type: Boolean, default: true },
  disabled:    { type: Boolean, default: false },
  width:       { type: String,  default: '250px' }
})

const emit = defineEmits(['update:modelValue'])

// ────────────────────────────────────────────────────────────
// 현장 옵션 (useApi composable 사용)
// ────────────────────────────────────────────────────────────
const { siteOptions, fetchSiteOptions } = useApi()

// '전체' 옵션을 리스트 맨 앞에 추가
const options = computed(() => {
  const base = siteOptions.value.map(s => ({
    idx:   s.idx,
    name:  s.name,
    label: s.name,   // multiselect label 필드
  }))
  if (props.allowEmpty) {
    return [{ idx: null, name: '전체', label: '전체 현장' }, ...base]
  }
  return base
})

// 외부는 sIdx(숫자) 또는 '전체' 문자열을 쓰고
// multiselect 내부는 옵션 객체를 씀
const innerValue = computed({
  get() {
    if (props.multiple) {
      if (!Array.isArray(props.modelValue)) return []
      // 다중 선택: 타입을 강제로 맞춰서 찾음
      return props.modelValue.map(v => options.value.find(o => String(o.idx) === String(v))).filter(Boolean)
    }

    // 단일 선택: 전체 또는 빈 값 처리
    if (props.modelValue === '전체' || props.modelValue === null || props.modelValue === '') {
      return options.value.find(o => o.idx === null) ?? null
    }

    // 👉 핵심: 양쪽 모두 String()으로 감싸서 숫자(16)와 문자열("16")이 무조건 일치하도록 수정
    return options.value.find(o => String(o.idx) === String(props.modelValue)) ?? null
  },
  set(val) {
    if (props.multiple) {
      emit('update:modelValue', val.map(v => v.idx))
    } else {
      emit('update:modelValue', val?.idx ?? '전체')
    }
  },
})

// ────────────────────────────────────────────────────────────
// 초기 로드
// ────────────────────────────────────────────────────────────
fetchSiteOptions()
</script>

<template>
  <Multiselect
      :style="{ width: props.width }"
      v-model="innerValue"
      :options="options"
      :multiple="multiple"
      :searchable="true"
      :close-on-select="!multiple"
      :clear-on-select="false"
      :preserve-search="true"
      :placeholder="placeholder"
      label="label"
      track-by="idx"
      :allow-empty="allowEmpty"
      :disabled="disabled"
      select-label=""
      deselect-label=""
      selected-label="✓"
      :show-no-results="true"
      :show-no-options="false"
      class="site-select"
  >
    <!-- 옵션 아이템 슬롯 -->
    <template #option="{ option }">
      <div class="ss-option" :class="{ 'ss-option--all': option.idx === null }">
        <i
            :class="['mdi', option.idx === null
            ? 'mdi-view-list'
            : 'mdi-office-building-marker']"
            class="ss-option-icon"
        ></i>
        <span class="ss-option-name">{{ option.label }}</span>
      </div>
    </template>

    <!-- 선택된 태그 슬롯 (다중 선택 시) -->
    <template #tag="{ option, remove }">
      <span class="ss-tag">
        {{ option.name }}
        <button type="button" class="ss-tag-del" @click.stop="remove(option)">
          <i class="mdi mdi-close"></i>
        </button>
      </span>
    </template>

    <!-- 검색 결과 없음 -->
    <template #noResult>
      <div class="ss-no-result">
        <i class="mdi mdi-magnify-close"></i> 검색 결과가 없습니다.
      </div>
    </template>

    <!-- 카레트 아이콘 -->
    <template #caret="{ toggle }">
      <div class="ss-caret" @click.prevent.stop="toggle">
        <i class="mdi mdi-chevron-down"></i>
      </div>
    </template>
  </Multiselect>
</template>

<style>
.site-select.multiselect {
  /*width: 250px;*/
  height: 42px;             /* filter-select height: 42px 일치 */
  min-height: 42px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-main);
  cursor: pointer;
  position: relative;
  box-sizing: border-box;
}

.site-select .multiselect__tags {
  height: 42px;
  min-height: 42px;
  padding: 0 36px 0 14px;   /* filter-select padding: 10px 14px 기준 */
  border: 1px solid var(--border-color);
  border-radius: 8px;       /* filter-select border-radius: 8px 일치 */
  background: var(--bg-surface);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 4px;
  box-sizing: border-box;
  overflow: hidden;
}

.site-select .multiselect__tags:hover {
  border-color: var(--border-focus);
}

.site-select.multiselect--active .multiselect__tags {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
  border-radius: 8px 8px 0 0;  /* 드롭다운 열릴 때 하단 radius 제거 */
  overflow: visible;
}

/* ── 단일 선택 표시 텍스트 ── */
.site-select .multiselect__single {
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  font-size: 13px;             /* filter-select font-size: 13px 일치 */
  color: var(--text-main);
  font-family: inherit;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* ── 검색 입력 ── */
.site-select .multiselect__input {
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  font-size: 13px;
  color: var(--text-main);
  font-family: inherit;
  line-height: 1;
  width: 100% !important;
  min-width: 60px;
}
.site-select .multiselect__input::placeholder { color: var(--text-sub); opacity: 0.7; }

/* placeholder: filter-select 미선택 상태와 동일한 색 */
.site-select .multiselect__placeholder {
  font-size: 13px;
  color: var(--text-sub);
  opacity: 0.7;
  padding: 0;
  margin: 0;
  line-height: 1;
}

/* ── 드롭다운 패널 ── */
.site-select .multiselect__content-wrapper {
  position: absolute;
  left: -1px;
  right: -1px;
  top: 100%;
  border: 1px solid var(--primary);   /* 열린 상태 포커스 border와 동일 */
  border-top: none;
  border-radius: 0 0 8px 8px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  max-height: 260px;
  overflow-y: auto;
  z-index: 200;
}
.site-select .multiselect__content-wrapper::-webkit-scrollbar       { width: 4px; }
.site-select .multiselect__content-wrapper::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 2px; }
/* ── ul/li list-style 완전 제거 ── */
.site-select .multiselect__content {
  list-style: none !important;
  padding: 4px 0;
  margin: 0;
  width: 100%;
}
.site-select .multiselect__element {
  list-style: none !important;
  padding: 0;
  margin: 0;
}
.site-select .multiselect__element::before,
.site-select .multiselect__element::after { display: none !important; }

/* ── 옵션 행 기본 ── */
.site-select .multiselect__option {
  list-style: none !important;
  padding: 0;
  margin: 0;
  min-height: auto;
  background: transparent;
  transition: background 0.15s;
}

/* hover: data-row:hover 패턴 일치 */
.site-select .multiselect__option--highlight,
.site-select .multiselect__option--highlight::after {
  background: var(--primary-soft);
  color: var(--primary);
}

/* 선택된 항목 */
.site-select .multiselect__option--selected,
.site-select .multiselect__option--selected::after {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

/* 선택 + hover 동시: 진한 강조 */
.site-select .multiselect__option--selected.multiselect__option--highlight,
.site-select .multiselect__option--selected.multiselect__option--highlight::after {
  background: var(--primary);
  color: var(--text-inverse);
}

/* 라이브러리 기본 after 라벨 완전 제거 */
.site-select .multiselect__option::after,
.site-select .multiselect__option--highlight::after,
.site-select .multiselect__option--selected::after {
  content: '' !important;
  display: none !important;
}

/* ── 기본 카레트(화살표) 숨김 → 커스텀 슬롯으로 대체 ── */
.site-select .multiselect__select { display: none; }

/* 셀렉트 박스가 닫혀있을 때 검색창(input)의 placeholder 숨김 */
.site-select:not(.multiselect--active) .multiselect__input::placeholder {
  color: transparent;
}

/* ── 커스텀 카레트: filter-select의 브라우저 기본 화살표 위치와 동일 ── */
.ss-caret {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-sub);
  pointer-events: auto;
  cursor: pointer;
  transition: transform .2s;
}
/* 열렸을 때 180도 회전 */
.site-select.multiselect--active .ss-caret { transform: translateY(-50%) rotate(180deg); }
.ss-caret i { font-size: 17px; line-height: 1; }

/* ── 커스텀 옵션 아이템 레이아웃 ── */
.ss-option {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-main);
  cursor: pointer;
  line-height: 1.3;
}
/* 전체 옵션: 구분선 + 연한 스타일 */
.ss-option--all {
  border-bottom: 1px solid var(--border-color);
  color: var(--text-sub);
}
.ss-option-icon     { font-size: 15px; color: var(--primary); flex-shrink: 0; }
.ss-option--all .ss-option-icon { color: var(--text-muted); }
.ss-option-name     { flex: 1; }

/* ── 다중 선택 태그: badge-blue 스타일과 동일 ── */
.ss-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px;
  background: var(--primary-soft);   /* badge-blue background */
  color: var(--primary);             /* badge-blue color */
  border-radius: 4px;                /* badge border-radius */
  font-size: 11px; font-weight: 700; /* badge font 일치 */
  max-width: 150px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex-shrink: 0;
}
.ss-tag-del {
  background: none; border: none; cursor: pointer;
  color: var(--primary); padding: 0;
  display: flex; align-items: center;
  opacity: 0.6; transition: opacity .15s; flex-shrink: 0;
}
.ss-tag-del:hover { opacity: 1; }
.ss-tag-del i { font-size: 11px; }

/* ── 검색 결과 없음 ── */
.ss-no-result {
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text-sub);
  display: flex; align-items: center; gap: 6px;
}
.ss-no-result i { font-size: 16px; opacity: 0.5; }

/* ── disabled: input-add.disabled 스타일 일치 ── */
.site-select.multiselect--disabled { pointer-events: none; }
.site-select.multiselect--disabled .multiselect__tags {
  background: var(--bg-canvas);
  color: var(--text-muted);
  cursor: not-allowed;
  border-color: transparent;
  opacity: 0.6;
}
</style>
