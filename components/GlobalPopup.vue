<template>
  <Transition name="popup-fade">
    <div v-if="isVisible" class="popup-overlay" @click.self="hide">
      <div class="popup-container">
        <div class="popup-header" :class="[`header--${(type === 'prompt' || type === 'confirm') ? 'info' : type}`]">
          <h3 class="popup-title">{{ title }}</h3>
          <button class="popup-close" @click="hide">×</button>
        </div>
        <div class="popup-body">
          <p>{{ message }}</p>
          <div v-if="type === 'prompt'" class="popup-prompt-wrap">
            <textarea
                v-model="promptValue"
                class="popup-input popup-textarea"
                ref="promptInput"
                rows="5"
            ></textarea>
          </div>
        </div>
        <div class="popup-footer">
          <button v-if="type === 'prompt' || type === 'confirm'" class="popup-btn-cancel" @click="hide">취소</button>
          <button class="popup-btn" @click="confirm">확인</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, watch, nextTick, ref } from 'vue';
import { usePopup } from '#imports';

const { isVisible, message, type, promptValue, confirm, hide } = usePopup();
const promptInput = ref(null);

const title = computed(() => {
  switch (type.value) {
    case 'success': return '성공';
    case 'error': return '오류';
    case 'warning': return '경고';
    case 'prompt': return '입력';
    case 'confirm': return '확인';
    default: return '알림';
  }
});

watch(isVisible, async (newVal) => {
  if (newVal && type.value === 'prompt') {
    await nextTick();
    if (promptInput.value) {
      promptInput.value.focus();
    }
  }
});
</script>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100000;
}

.popup-container {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.popup-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
}

.header--info { background-color: #3b82f6; }
.header--success { background-color: #10b981; }
.header--error { background-color: #ef4444; }
.header--warning { background-color: #f59e0b; }

.popup-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.popup-close {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
  opacity: 0.8;
  padding: 0;
}

.popup-close:hover {
  opacity: 1;
}

.popup-body {
  padding: 20px 16px;
  font-size: 15px;
  color: #374151;
  text-align: center;
  line-height: 1.5;
  white-space: pre-wrap;
}

.popup-prompt-wrap {
  margin-top: 16px;
}

.popup-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.popup-textarea {
  resize: vertical;
  min-height: 100px;
}

.popup-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.popup-footer {
  padding: 12px 16px;
  display: flex;
  justify-content: center;
  gap: 12px;
  border-top: 1px solid #e5e7eb;
}

.popup-btn {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 8px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.popup-btn:hover {
  background-color: #2563eb;
}

.popup-btn-cancel {
  background-color: #f3f4f6;
  color: #4b5563;
  border: none;
  padding: 8px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.popup-btn-cancel:hover {
  background-color: #e5e7eb;
}

.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: opacity 0.2s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
}
</style>
