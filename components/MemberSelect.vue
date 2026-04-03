<script setup>
import { computed } from 'vue'
import Multiselect from 'vue-multiselect'

const props = defineProps({
  modelValue:  { default: null },
  options:     { type: Array, default: () => [] },
  placeholder: { type: String,  default: '직원 이름을 검색하세요...' },
  disabled:    { type: Boolean, default: false },
  width:       { type: String,  default: '100%' }
})

const emit = defineEmits(['update:modelValue'])

// ────────────────────────────────────────────────────────────
// [추가] 구글 스타일 아바타 생성 로직
// ────────────────────────────────────────────────────────────
// 1. 이름 기반 고유 색상 추출 함수
const getAvatarColor = (name) => {
  if (!name) return '#cbd5e1'; // 이름 없을 때 기본 회색

  const colors = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#f59e0b', // amber
    '#10b981', // emerald
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316'  // orange
  ];

  // 이름 문자열의 해시값을 계산하여 색상 배열 인덱스 매핑
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// 2. 이름 첫 글자 추출 함수
const getFirstChar = (name) => {
  if (!name) return '';
  return name.trim().charAt(0).toUpperCase();
}

// 외부에서 받은 직원 데이터를 Multiselect 형식에 맞게 변환 및 아바타 정보 추가
const formattedOptions = computed(() => {
  return props.options.map(s => ({
    idx: s.idx,
    name: s.name,
    label: s.name,
    // [추가] 아바타 스타일 정보
    avatarStyle: {
      backgroundColor: getAvatarColor(s.name),
      color: '#ffffff', // 글자색은 흰색 고정
    },
    initial: getFirstChar(s.name)
  }))
})

const innerValue = computed({
  get() {
    return formattedOptions.value.find(o => o.name === props.modelValue) ?? null
  },
  set(val) {
    emit('update:modelValue', val?.name ?? null)
  },
})
</script>

<template>
  <Multiselect
      :style="{ width: props.width }"
      v-model="innerValue"
      :options="formattedOptions"
      :searchable="true"
      :close-on-select="true"
      :clear-on-select="false"
      :preserve-search="true"
      :placeholder="placeholder"
      label="label"
      track-by="idx"
      :allow-empty="false"
      :disabled="disabled"
      select-label=""
      deselect-label=""
      selected-label="✓"
      :show-no-results="true"
      :show-no-options="false"
      class="member-select site-select"
  >
    <template #option="{ option }">
      <div class="ss-option">
        <div class="member-avatar" :style="option.avatarStyle">
          {{ option.initial }}
        </div>
        <span class="ss-option-name">{{ option.label }}</span>
      </div>
    </template>

    <template #noResult>
      <div class="ss-no-result">
        <i class="mdi mdi-magnify-close"></i> 검색 결과가 없습니다.
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
.member-select {
  width: 100% !important;
}

/* [추가] 구글 스타일 아바타 CSS */
.member-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
  text-transform: uppercase;
  /* 부모 .ss-option의 gap: 8px 로 인해 마진 불필요 */
}
</style>
