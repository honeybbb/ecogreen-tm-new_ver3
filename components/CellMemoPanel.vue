<script setup>
defineProps({
  visible: Boolean, x: Number, y: Number, title: String,
  text: String, type: String, hasExisting: Boolean, updatedAt: String,
});
defineEmits(['update:text', 'update:type', 'close', 'save', 'remove']);
</script>

<template>
  <Transition name="memo-pop">
    <div v-if="visible" class="memo-popover" :style="{ top: y + 'px', left: x + 'px' }" @click.stop>
      <header class="memo-popover__header">
        <span>{{ title }}</span>
        <button class="memo-popover__close" @click="$emit('close')"><i class="mdi mdi-close"></i></button>
      </header>

      <div class="memo-popover__type">
        <button type="button" class="memo-type-btn danger" :class="{ active: type === '02004001' }"
                @click="$emit('update:type', '02004001')">중요</button>
        <button type="button" class="memo-type-btn normal" :class="{ active: type === '02004002' }"
                @click="$emit('update:type', '02004002')">일반</button>
      </div>

      <textarea class="memo-popover__textarea" rows="4" placeholder="메모를 입력하세요"
                :value="text" @input="$emit('update:text', $event.target.value)"></textarea>

      <div v-if="hasExisting" class="memo-popover__meta">최종 갱신 {{ updatedAt }}</div>

      <footer class="memo-popover__footer">
        <button v-if="hasExisting" class="memo-btn danger-outline" @click="$emit('remove')">삭제</button>
        <button class="memo-btn primary" @click="$emit('save')">{{ hasExisting ? '수정 저장' : '저장' }}</button>
      </footer>
    </div>
  </Transition>
</template>

<style scoped>
.memo-popover {
  position: fixed; z-index: 1001; width: 260px;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 12px; padding: 14px;
  box-shadow: 0 12px 32px rgba(15,23,42,.14), 0 2px 8px rgba(15,23,42,.06);
}
.memo-popover__header {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 10px;
}
.memo-popover__close {
  border: none; background: none; color: var(--text-sub); cursor: pointer;
  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; transition: background .15s;
}
.memo-popover__close:hover { background: var(--bg-hover); }

.memo-popover__type { display: flex; gap: 6px; margin-bottom: 10px; }
.memo-type-btn {
  flex: 1; padding: 6px 0; font-size: 11px; font-weight: 700; border-radius: 8px;
  border: 1px solid var(--border-color); background: var(--bg-canvas); color: var(--text-sub);
  cursor: pointer; transition: all .15s;
}
.memo-type-btn.danger.active { background: rgba(239,68,68,.1); border-color: var(--danger); color: var(--danger); }
.memo-type-btn.normal.active { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }

.memo-popover__textarea {
  width: 100%; box-sizing: border-box; resize: vertical;
  border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px;
  font-size: 12px; line-height: 1.5; outline: none; transition: border-color .15s, box-shadow .15s;
}
.memo-popover__textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }

.memo-popover__meta { font-size: 10px; color: var(--text-sub); text-align: right; margin-top: 6px; }

.memo-popover__footer { display: flex; gap: 6px; margin-top: 10px; }
.memo-btn { padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; transition: opacity .15s; }
.memo-btn:hover { opacity: .85; }
.memo-btn.danger-outline { background: transparent; border-color: var(--danger); color: var(--danger); }
.memo-btn.primary { flex: 1; background: var(--primary); color: var(--text-inverse); }

.memo-pop-enter-active, .memo-pop-leave-active { transition: opacity .12s ease, transform .12s ease; }
.memo-pop-enter-from, .memo-pop-leave-to { opacity: 0; transform: scale(.96) translateY(-4px); }
</style>