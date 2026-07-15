<template>
  <div ref="wrapperEl" class="editor-wrapper">
    <textarea ref="editorEl"></textarea>
    <input
        ref="fileInputEl"
        type="file"
        accept="image/*"
        style="display: none"
        @change="handleFileSelect"
    />
    <input
        ref="attachInputEl"
        type="file"
        accept=".pdf,.xls,.xlsx,.doc,.docx,.hwp,.ppt,.pptx,.zip"
        style="display: none"
        @change="handleAttachSelect"
    />
    <div class="attach-bar">
      <button type="button" class="btn-attach" @click="attachInputEl?.click()" :disabled="isUploading">
        <i class="mdi mdi-paperclip"></i> 파일 첨부
      </button>
      <span v-if="isUploading" class="upload-status">업로드 중...</span>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import axios from "axios";
import "suneditor/dist/css/suneditor.min.css";

const props = defineProps({ modelValue: String });
const emit = defineEmits(['update:modelValue']);

const wrapperEl = ref(null);
const editorEl = ref(null);
const fileInputEl = ref(null);
const attachInputEl = ref(null);
const isUploading = ref(false);
let instance = null;
let interceptImageClick = null;

onMounted(async () => {
  const suneditorModule = await import("suneditor");
  const suneditor = suneditorModule.default || suneditorModule;

  const pluginsModule = await import("suneditor/src/plugins");
  const plugins = pluginsModule.default || pluginsModule;

  const koModule = await import("suneditor/src/lang/ko");
  const ko = koModule.default || koModule;

  instance = suneditor.create(editorEl.value, {
    plugins,
    lang: ko,
    width: '100%',
    height: 'auto',        // 내용에 따라 늘어나되
    minHeight: '200px',    // 최소 200px은 보장
    value: "",
    buttonList: [
      // ['undo', 'redo'],
      ['fontSize'],
      ['bold', 'underline', 'italic', 'strike'],
      ['fontColor'],
      ['outdent', 'indent'],
      ['image'],
    ],
    resizingBar: false,
  });

  console.log('instance 메서드:', Object.getOwnPropertyNames(Object.getPrototypeOf(instance)));

  instance.setContents(props.modelValue || '');
  instance.onChange = (content) => {
    emit('update:modelValue', content);
  };

  interceptImageClick = (e) => {
    const btn = e.target.closest('[data-command="image"]');
    if (btn && wrapperEl.value.contains(btn)) {
      e.stopPropagation();
      e.preventDefault();
      fileInputEl.value.click();
    }
  };
  document.addEventListener('click', interceptImageClick, true);
});

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  axios.post('/api/v1/upload/image', formData)
      .then(({ data }) => {
        const url = data.url.startsWith('http') ? data.url : `/api${data.url}`;
        try {
          instance.insertHTML(`<img src="${url}" alt="${file.name}" style="max-width:100%;">`, true, false);
        } catch (insertErr) {
          console.error('이미지 삽입 실패:', insertErr);
          alert('이미지는 업로드됐지만 에디터 삽입에 실패했습니다.');
        }
      })
      .catch((uploadErr) => {
        console.error('업로드 실패:', uploadErr);
        alert('이미지 업로드에 실패했습니다.');
      })
      .finally(() => { e.target.value = ''; });
}

function handleAttachSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file); // ← 서버 필드명 확인 필요 (아래 참고)

  isUploading.value = true;

  axios.post('/api/v1/upload/file', formData)
      .then(({ data }) => {
        const url = data.url.startsWith('http') ? data.url : `/api${data.url}`;
        const isImage = file.type.startsWith('image/');

        const html = isImage
            ? `<img src="${url}" alt="${file.name}" style="max-width:100%;">`
            : `<a href="${url}" target="_blank" rel="noopener" download="${file.name}">📎 ${file.name}</a>`;

        try {
          instance.insertHTML(html, true, false);
        } catch (insertErr) {
          console.error('첨부 삽입 실패:', insertErr);
          alert('파일은 업로드됐지만 에디터 삽입에 실패했습니다.');
        }
      })
      .catch((uploadErr) => {
        console.error('업로드 실패:', uploadErr);
        alert('파일 업로드에 실패했습니다.');
      })
      .finally(() => {
        isUploading.value = false;
        e.target.value = '';
      });
}

onBeforeUnmount(() => {
  if (interceptImageClick) document.removeEventListener('click', interceptImageClick, true);
  if (instance) instance.destroy();
});
</script>

<style scoped>
.editor-wrapper {
  border: 1px solid var(--border-color, #ccc);
  border-radius: 6px;
  background: white;
  /* overflow: hidden 제거 */
}

:deep(.sun-editor) {
  border: none;
  font-family: inherit;
  border-radius: 6px;
  overflow: visible; /* 드롭다운이 밖으로 나올 수 있게 */
}

:deep(.sun-editor .se-toolbar) {
  border-radius: 6px 6px 0 0; /* 위쪽만 둥글게 */
}

.attach-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px 0;
}
.btn-attach {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--primary, #2563eb);
  background: var(--primary-soft, #eff6ff);
  border: 1px solid var(--primary, #2563eb);
  border-radius: 6px;
  cursor: pointer;
}
.btn-attach:disabled { opacity: .5; cursor: not-allowed; }
.upload-status { font-size: 12px; color: var(--text-muted, #94a3b8); }
</style>