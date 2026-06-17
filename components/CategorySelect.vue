<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { useAuthStore } from '~/stores/auth.js'

const authStore = useAuthStore()
const cIdx = authStore.user?.cIdx

const props = defineProps({
  modelValue:  { default: '' },
  code:        { type: String, default: '' },
  placeholder: { type: String, default: '항목 선택' },
  disabled:    { type: Boolean, default: false },
  topCode:     { type: String, default: '' }, // '04001' | '04002' | '04003'
})
const emit = defineEmits(['update:modelValue', 'update:code'])

// ── 데이터 ──────────────────────────────────────
const allCodes     = ref([])
const isOpen       = ref(false)
const expandedMids = ref(new Set()) // 펼쳐진 2차 코드 집합
const containerRef = ref(null)

const fetchCodes = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`)
    allCodes.value = (res.data.data || []).filter(c => c.itemCd.startsWith('04'))
  } catch (e) {
    console.error('CategorySelect: 코드 로드 실패', e)
    allCodes.value = []
  }
}

// ── 트리 구성 ────────────────────────────────────
const codeMap = computed(() =>
    Object.fromEntries(allCodes.value.map(c => [c.itemCd, c]))
)

// 부모로 쓰이는 코드 집합 (= 자식이 있는 코드)
const parentCdSet = computed(() =>
    new Set(allCodes.value.map(c => c.groupCd))
)

const isLeaf = (itemCd) => !parentCdSet.value.has(itemCd)

// topCode 기준 2차 항목
const midItems = computed(() => {
  const filterParent = props.topCode || '04001'
  return allCodes.value.filter(c => c.groupCd === filterParent)
})

// 특정 2차 코드의 3차 항목들
const getChildren = (midCd) =>
    allCodes.value.filter(c => c.groupCd === midCd)

// ── 표시값 ───────────────────────────────────────
const displayValue = computed(() => {
  if (!props.modelValue) return ''
  const byCode = allCodes.value.find(c => c.itemCd === props.modelValue)
  return byCode ? byCode.itemNm : props.modelValue
})

// ── 이벤트 핸들러 ────────────────────────────────
const toggle = () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (!isOpen.value) expandedMids.value.clear()
}

// 2차 항목 클릭: leaf면 선택, 자식 있으면 펼치기/닫기
const clickMid = (mid) => {
  if (isLeaf(mid.itemCd)) {
    selectItem(mid)
  } else {
    if (expandedMids.value.has(mid.itemCd)) {
      expandedMids.value.delete(mid.itemCd)
    } else {
      expandedMids.value.add(mid.itemCd)
    }
    // Set 반응성 트리거
    expandedMids.value = new Set(expandedMids.value)
  }
}

const selectItem = (item) => {
  emit('update:modelValue', item.itemNm)
  emit('update:code', item.itemCd)
  isOpen.value = false
  expandedMids.value.clear()
}

const handleClickOutside = (e) => {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  fetchCodes()
  document.addEventListener('mousedown', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <div
      ref="containerRef"
      class="cat-select"
      :class="{ 'cat-select--open': isOpen, 'cat-select--disabled': disabled }"
  >

    <!-- 트리거 -->
    <div class="cat-trigger" @click="toggle">
      <span :class="displayValue ? 'cat-value' : 'cat-placeholder'">
        {{ displayValue || placeholder }}
      </span>
      <i class="mdi mdi-chevron-down cat-caret"></i>
    </div>

    <!-- 드롭다운 -->
    <div v-show="isOpen" class="cat-dropdown">
      <div class="cat-list">

        <template v-for="mid in midItems" :key="mid.itemCd">

          <!-- 2차 항목 -->
          <div
              class="cat-mid-item"
              :class="{
              'cat-mid-item--expanded':  expandedMids.has(mid.itemCd),
              'cat-mid-item--selected':  modelValue === mid.itemNm || modelValue === mid.itemCd,
              'cat-mid-item--has-child': !isLeaf(mid.itemCd),
            }"
              @click="clickMid(mid)"
          >
            <!-- 자식 있으면 폴더, 없으면 태그 아이콘 -->
            <i
                class="mdi cat-mid-icon"
                :class="isLeaf(mid.itemCd) ? 'mdi-tag-outline' : 'mdi-folder-outline'"
            ></i>
            <span class="cat-mid-label">{{ mid.itemNm }}</span>

            <!-- 자식 있을 때 화살표 -->
            <i
                v-if="!isLeaf(mid.itemCd)"
                class="mdi mdi-chevron-down cat-expand-arrow"
                :class="{ 'cat-expand-arrow--open': expandedMids.has(mid.itemCd) }"
            ></i>
          </div>

          <!-- 3차 항목 (펼쳐진 경우만) -->
          <template v-if="!isLeaf(mid.itemCd) && expandedMids.has(mid.itemCd)">
            <div
                v-for="child in getChildren(mid.itemCd)"
                :key="child.itemCd"
                class="cat-child-item"
                :class="{ 'cat-child-item--selected': modelValue === child.itemNm || modelValue === child.itemCd }"
                @click="selectItem(child)"
            >
              <i class="mdi mdi-tag-outline cat-child-icon"></i>
              {{ child.itemNm }}
            </div>
          </template>

        </template>

        <div v-if="midItems.length === 0" class="cat-empty">
          <i class="mdi mdi-alert-circle-outline"></i> 항목이 없습니다
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.cat-select {
  position: relative;
  width: 100%;
  font-size: 12px;
  color: var(--text-main);
}

/* 트리거 */
.cat-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-surface);
  cursor: pointer;
  min-height: 28px;
  transition: all 0.2s;
  gap: 4px;
}
.cat-trigger:hover { border-color: var(--border-focus); }
.cat-select--open .cat-trigger {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
  border-radius: 5px 5px 0 0;
}
.cat-select--disabled .cat-trigger {
  background: var(--bg-canvas);
  opacity: 0.7;
  cursor: not-allowed;
}
.cat-value    { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-placeholder { flex: 1; color: var(--text-muted); }
.cat-caret {
  font-size: 16px;
  color: var(--text-sub);
  flex-shrink: 0;
  transition: transform 0.2s;
}
.cat-select--open .cat-caret { transform: rotate(180deg); }

/* 드롭다운 */
.cat-dropdown {
  position: absolute;
  left: -1px; right: -1px; top: 100%;
  z-index: 9999;
  background: var(--bg-surface);
  border: 1px solid var(--primary);
  border-top: none;
  border-radius: 0 0 5px 5px;
  box-shadow: 0 8px 20px rgba(0,0,0,0.15);
  max-height: 260px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 리스트 */
.cat-list {
  overflow-y: auto;
  flex: 1;
}
.cat-list::-webkit-scrollbar { width: 5px; }
.cat-list::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 3px; }

/* 2차 항목 */
.cat-mid-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  border-bottom: 1px solid var(--border-color);
  transition: background 0.15s;
  user-select: none;
}
.cat-mid-item:last-child { border-bottom: none; }
.cat-mid-item:hover { background: var(--bg-hover); }

/* 자식 있는 2차 항목 — 폴더 스타일 */
.cat-mid-item--has-child { color: var(--primary); }
.cat-mid-item--has-child .cat-mid-icon { color: var(--primary); }

/* 펼쳐진 상태 */
.cat-mid-item--expanded {
  background: var(--primary-soft);
  border-bottom-color: var(--border-focus);
}

/* 선택된 상태 (leaf 2차) */
.cat-mid-item--selected {
  background: var(--primary-soft);
  color: var(--primary);
}

.cat-mid-icon { font-size: 14px; color: var(--text-sub); flex-shrink: 0; }
.cat-mid-label { flex: 1; }

.cat-expand-arrow {
  font-size: 15px;
  color: var(--primary);
  transition: transform 0.2s;
  flex-shrink: 0;
}
.cat-expand-arrow--open { transform: rotate(180deg); }

/* 3차 항목 */
.cat-child-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px 7px 28px; /* 들여쓰기 */
  cursor: pointer;
  font-size: 12px;
  color: var(--text-main);
  border-bottom: 1px solid var(--border-color);
  transition: background 0.15s;
  user-select: none;
  background: var(--bg-canvas);
}
.cat-child-item:last-child { border-bottom: none; }
.cat-child-item:hover { background: var(--bg-hover); }
.cat-child-item--selected {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}
.cat-child-icon { font-size: 13px; color: var(--text-muted); flex-shrink: 0; }
.cat-child-item--selected .cat-child-icon { color: var(--primary); }

.cat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
