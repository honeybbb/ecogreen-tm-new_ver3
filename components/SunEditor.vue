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
      ['undo', 'redo'],
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
</style>