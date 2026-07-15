<template>
  <div class="settlement-detail-page">
    <SettlementModal
        v-if="isDataLoaded"
        :is-open="true"
        :settlement-id="id"
        :initial-data="initialData"
        @close="closePage"
        @save="onSave"
    />
  </div>
</template>

<script setup>
definePageMeta({ layout: 'empty' })
import SettlementModal from '@/components/SettlementModal.vue'
import { ref, onMounted } from 'vue'
import { useRoute } from 'nuxt/app'

const route = useRoute()
const idStr = route.params.id
const id = idStr === 'new' ? null : Number(idStr)
const initialData = ref(null)
const isDataLoaded = ref(false)

onMounted(() => {
  try {
    const key = idStr === 'new' ? 'settlement_edit_new' : `settlement_edit_${id}`
    const stored = localStorage.getItem(key)
    if (stored) {
      initialData.value = JSON.parse(stored)
    } else {
      initialData.value = {}
    }
  } catch (e) {
    initialData.value = {}
  }
  isDataLoaded.value = true
})

const closePage = () => {
  window.close()
}

const onSave = () => {
  if (window.opener) {
    window.opener.postMessage('refresh_settlement_list', '*')
  }
  window.close()
}
</script>

<style>
/* Reset modal overlay to be a normal page container */
.settlement-detail-page :deep(.modal-overlay) {
  position: static !important;
  background: var(--bg-surface) !important;
  padding: 0 !important;
  display: flex !important;
  align-items: flex-start !important;
  justify-content: center !important;
  min-height: 100vh;
}
.settlement-detail-page :deep(.modal-container) {
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  min-height: 100vh !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  border: none !important;
  margin: 0 !important;
}
</style>
