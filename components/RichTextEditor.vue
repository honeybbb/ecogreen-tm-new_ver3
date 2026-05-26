<template>
  <div v-if="editor" class="editor-wrapper">
    <div class="menu-bar">
      <button @click="editor.chain().focus().toggleBold().run()" :class="{ 'is-active': editor.isActive('bold') }">B</button>
      <button @click="editor.chain().focus().toggleItalic().run()" :class="{ 'is-active': editor.isActive('italic') }">I</button>
      <button @click="addImage">이미지</button>
      <input type="file" ref="fileInput" @change="handleFileUpload" style="display:none" accept="image/*" />
    </div>
    <editor-content :editor="editor" class="editor-content" />
  </div>
</template>

<script setup>
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { ref, watch } from 'vue';
import axios from 'axios';

const props = defineProps({ modelValue: String });
const emit = defineEmits(['update:modelValue']);
const fileInput = ref(null);

const editor = useEditor({
  content: props.modelValue,
  extensions: [StarterKit, Image],
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML());
  },
});

// 외부에서 값이 변경될 때 동기화
watch(() => props.modelValue, (value) => {
  const isSame = editor.value.getHTML() === value;
  if (isSame) return;
  editor.value.commands.setContent(value, false);
});

const addImage = () => fileInput.value.click();

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // 서버로 이미지 업로드 (API 구현 필요)
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await axios.post('/api/v1/upload/image', formData);
    const imageUrl = response.data.url; // 서버에서 반환하는 이미지 URL
    editor.value.chain().focus().setImage({ src: imageUrl }).run();
  } catch (error) {
    alert('이미지 업로드 실패');
  }
};
</script>

<style scoped>
.editor-wrapper { border: 1px solid #ccc; border-radius: 6px; overflow: hidden; }
.menu-bar { background: #f3f4f6; padding: 5px; border-bottom: 1px solid #ccc; display: flex; gap: 5px; }
.editor-content { min-height: 150px; padding: 10px; background: white; }
.is-active { background: #e5e7eb; font-weight: bold; }
</style>
