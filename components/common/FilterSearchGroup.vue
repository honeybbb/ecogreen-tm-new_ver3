<template>
  <div class="search-group" :style="{ flex: flex }">
    <div class="search-box">
      <i class="mdi mdi-magnify"></i>
      <input
          :value="modelValue"
          @input="$emit('update:modelValue', $event.target.value)"
          @keyup.enter="$emit('search')"
          type="text"
          :placeholder="placeholder"
          class="search-input"
      />
      <button v-if="modelValue" @click="handleClear" class="search-clear">
        <i class="mdi mdi-close"></i>
      </button>
    </div>
    <button v-if="showResetBtn" @click="$emit('reset')" class="btn-search" title="필터 초기화">
      <i class="mdi mdi-filter-off"></i>
      <span v-if="showResetText">검색필터 초기화</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '검색...'
  },
  flex: {
    type: [String, Number],
    default: 1
  },
  showResetBtn: {
    type: Boolean,
    default: true
  },
  showResetText: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['update:modelValue', 'search', 'reset']);

const handleClear = () => {
  emit('update:modelValue', '');
  emit('search');
};
</script>