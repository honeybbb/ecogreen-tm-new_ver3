<script setup>
/**
 * CodeSelect — 급여/공제/정산 항목 검색 + 선택 (목록에 있는 항목만 선택 가능)
 */
import { ref, computed, onMounted } from 'vue'
import Multiselect from 'vue-multiselect'
import axios from 'axios'
import {useAuthStore} from "~/stores/auth.js";
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const props = defineProps({
  modelValue:  { default: '' },
  placeholder: { type: String,  default: '항목 선택' },
  allowEmpty:  { type: Boolean, default: false },
  disabled:    { type: Boolean, default: false },
  width:       { type: String,  default: '100%' },
  defaultLabel:{ type: String,  default: '' } // 초기 라벨(예: 기본급, 국민연금) 유지를 위한 prop
})

const emit = defineEmits(['update:modelValue', 'update:label'])

const { wagesData, fetchWageCode } = useApi()

// 04003 정산항목 데이터를 담을 배열
const settleData = ref([])

// 정산항목 (04003) 별도 호출 함수
const fetchSettleCode = async () => {
  try {
    const res = await axios.get('/api/v1/code/group/04003')
    if (res.data && res.data.data) {
      settleData.value = res.data.data
    }
  } catch (error) {
    console.error('정산항목 04003 로드 실패:', error)
  }
}

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    const all = (res.data.data || []).filter(c => c.itemCd.startsWith('04'));

    // ── 1. itemCd → 노드 맵 ──────────────────────────
    const map = Object.fromEntries(all.map(c => [c.itemCd, c]));

    // ── 2. 부모 역할을 하는 코드 집합 ─────────────────
    const parentCds = new Set(all.map(c => c.groupCd));

    // ── 3. leaf 노드만 추출 (자식이 없는 최종 항목) ───
    const leaves = all.filter(c => !parentCds.has(c.itemCd));

    // ── 4. leaf의 04001/04002 직속 조상 탐색 ──────────
    const getTopAncestor = (itemCd) => {
      let cur = map[itemCd];
      while (cur) {
        const parent = map[cur.groupCd];
        // parent가 루트(04)이면 cur가 대분류
        if (!parent || parent.itemCd === parent.groupCd) return cur.itemCd;
        cur = parent;
      }
      return null;
    };

    // ── 5. groupNm 부여 ────────────────────────────────
    const GROUP_NM = {
      '04001': '지급항목',
      '04002': '공제항목',
      '04003': '정산항목',
    };

    wagesData.value = leaves.map(leaf => ({
      ...leaf,
      tax_free: Number(leaf.tax_free) || 0,
      groupNm:  GROUP_NM[getTopAncestor(leaf.itemCd)] ?? '기타',
    }));

  } catch (e) {
    console.error('임금코드 로드 실패:', e);
    wagesData.value = [];
  }
};

// ────────────────────────────────────────────────────────────
// 옵션 구성 (지급 04001, 공제 04002 + 정산 04003 병합)
// ────────────────────────────────────────────────────────────
const options = computed(() => {
  const map = new Map()

  // 1. 기존 wagesData (04001, 04002 등) 추가
  wagesData.value.forEach(wage => {
    map.set(wage.itemCd, {
      itemCd: wage.itemCd,
      itemNm: wage.itemNm,
      label:  wage.itemNm,
    })
  })
  /*
  // 2. 정산항목 (04003) 추가
  settleData.value.forEach(code => {
    map.set(code.itemCd, {
      itemCd: code.itemCd,
      itemNm: code.itemNm,
      label:  code.itemNm,
    })
  })

   */

  const merged = Array.from(map.values())

  if (props.allowEmpty) {
    return [{ itemCd: null, itemNm: '', label: '전체' }, ...merged]
  }
  return merged
})

// ────────────────────────────────────────────────────────────
// v-model 양방향 바인딩
// ────────────────────────────────────────────────────────────
const innerValue = computed({
  get() {
    const found = options.value.find(o => o.itemCd === props.modelValue)
    if (found) return found;

    // 코드가 아직 없지만 기본 라벨(defaultLabel)이 있는 경우 (초기 렌더링 시 이름 유지용)
    if (props.defaultLabel) {
      return options.value.find(o => o.itemNm === props.defaultLabel) || { itemCd: '', itemNm: props.defaultLabel, label: props.defaultLabel }
    }
    return null;
  },
  set(val) {
    emit('update:modelValue', val?.itemCd || '');
    emit('update:label', val?.itemNm || '');
  },
})

// 초기 로드
onMounted(() => {
  // fetchWageCode()
  getWageCode() // 정산항목 추가 로드
})
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
/* 기존 스타일 그대로 유지 */
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

:deep(.multiselect__input::placeholder) {
  color: transparent !important;
}
:deep(.multiselect--active .multiselect__input::placeholder) {
  color: var(--text-muted) !important;
}

:deep(.multiselect__placeholder) {
  font-size: 12px;
  color: var(--text-muted);
  padding: 0;
  margin: 0;
  line-height: 1.2;
}

:deep(.multiselect__content-wrapper) {
  position: absolute !important;
  left: -1px; right: -1px; top: 100%;
  border: 1px solid var(--primary) !important;
  border-top: none !important;
  border-radius: 0 0 5px 5px !important;
  background: var(--bg-surface, #ffffff) !important;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15) !important;
  max-height: 200px !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  z-index: 9999 !important;
}

:deep(.multiselect__content),
:deep(.multiselect__element) {
  list-style: none !important;
  padding: 0 !important; margin: 0 !important;
  width: 100% !important;
}
:deep(.multiselect__element::before),
:deep(.multiselect__element::after) {
  display: none !important;
}

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

:deep(.multiselect__select) { display: none; }
.ss-caret {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  color: var(--text-sub); cursor: pointer; transition: transform .2s;
  display: flex; align-items: center; justify-content: center;
}
:deep(.multiselect--active) .ss-caret { transform: translateY(-50%) rotate(180deg); }
.ss-caret i { font-size: 16px; }

:deep(.multiselect--disabled) { pointer-events: none; }
:deep(.multiselect--disabled .multiselect__tags) { background: var(--bg-canvas); opacity: 0.7; }

.ss-no-result {
  padding: 12px 14px;
  font-size: 12px;
  color: var(--text-sub);
  display: flex; align-items: center; gap: 6px;
}
.ss-no-result i { font-size: 16px; opacity: 0.5; }

:deep(.multiselect__content-wrapper::-webkit-scrollbar) { width: 6px; }
:deep(.multiselect__content-wrapper::-webkit-scrollbar-thumb) { background: var(--border-focus); border-radius: 3px; }
</style>
