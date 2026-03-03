<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();
const { siteOptions, fetchSiteOptions } = useApi(); // 현장 목록 가져오기

// 상태 관리
const selectedSite = ref(''); // 선택된 sIdx
const excelFile = ref(null);
const isUploading = ref(false);
const uploadResult = ref(null);

// 파일 선택 핸들러
const onFileChange = (e) => {
  excelFile.value = e.target.files[0];
};

// 업로드 실행
const handleUpload = async () => {
  if (!selectedSite.value) return alert('배치할 현장을 먼저 선택해주세요.');
  if (!excelFile.value) return alert('업로드할 엑셀 파일을 선택해주세요.');

  const formData = new FormData();
  formData.append('file', excelFile.value);
  formData.append('sIdx', selectedSite.value); // 화면에서 선택한 현장 ID 전송

  isUploading.value = true;
  try {
    const res = await axios.post('/api/v1/member/upload-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    if (res.data.result) {
      uploadResult.value = res.data;
      alert(`${res.data.count}명의 직원이 성공적으로 등록 및 배치되었습니다.`);
      router.push('/member/list');
    }
  } catch (err) {
    console.error(err);
    alert(err.response?.data?.message || '업로드 중 오류가 발생했습니다.');
  } finally {
    isUploading.value = false;
  }
};

onMounted(() => {
  fetchSiteOptions();
});
</script>

<template>
  <div class="excel-upload-page">
    <div class="page-header">
      <h1 class="page-title"><i class="mdi mdi-file-excel"></i> 직원 일괄 등록 (엑셀)</h1>
      <p class="page-subtitle">엑셀 파일을 통해 다수의 직원을 등록하고 현장에 즉시 배치합니다.</p>
    </div>

    <div class="upload-card">
      <section class="config-section">
        <h3 class="section-title"><span class="step-num">1</span> 배치 현장 선택</h3>
        <div class="input-group">
          <label class="required-label">직원들이 소속될 현장을 선택하세요</label>
          <select v-model="selectedSite" class="modern-select">
            <option value="" disabled>현장을 선택해주세요</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
              {{ site.name }}
            </option>
          </select>
        </div>
      </section>

      <section class="upload-section" :class="{ 'disabled': !selectedSite }">
        <h3 class="section-title"><span class="step-num">2</span> 엑셀 파일 업로드</h3>
        <div class="file-drop-zone" :class="{ 'has-file': excelFile }">
          <input type="file" @change="onFileChange" accept=".xlsx, .xls" id="excel-input" :disabled="!selectedSite" />
          <label for="excel-input" class="file-label">
            <i class="mdi" :class="excelFile ? 'mdi-file-check' : 'mdi-cloud-upload'"></i>
            <span v-if="excelFile">{{ excelFile.name }}</span>
            <span v-else>파일을 드래그하거나 클릭하여 선택하세요</span>
          </label>
        </div>

        <div class="info-box mt-4">
          <i class="mdi mdi-information-outline"></i>
          <span>반드시 지정된 양식의 엑셀 파일을 사용해 주세요. (사번 중복 시 등록 제외)</span>
        </div>
      </section>

      <div class="action-footer">
        <button @click="router.back()" class="btn-secondary">취소</button>
        <button
            @click="handleUpload"
            class="btn-primary"
            :disabled="isUploading || !selectedSite || !excelFile"
        >
          <i class="mdi mdi-check"></i> {{ isUploading ? '등록 중...' : '일괄 등록 시작' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.excel-upload-page { max-width: 800px; margin: 0 auto; padding: 20px; }
.upload-card { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }

.section-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
.step-num { background: #667eea; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }

.modern-select { width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 16px; outline: none; transition: 0.2s; }
.modern-select:focus { border-color: #667eea; }

.file-drop-zone { border: 2px dashed #cbd5e1; border-radius: 12px; padding: 40px; text-align: center; transition: 0.3s; position: relative; cursor: pointer; }
.file-drop-zone:hover { background: #f8fafc; border-color: #667eea; }
.file-drop-zone.has-file { background: #f0fdf4; border-color: #22c55e; border-style: solid; }
.file-drop-zone input { position: absolute; width: 100%; height: 100%; top: 0; left: 0; opacity: 0; cursor: pointer; }

.file-label { display: flex; flex-direction: column; align-items: center; gap: 12px; color: #64748b; }
.file-label i { font-size: 48px; color: #667eea; }
.has-file i { color: #22c55e; }

.action-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9; }
.btn-primary { background: #667eea; color: white; border: none; padding: 12px 30px; border-radius: 10px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { background: #cbd5e1; cursor: not-allowed; }
</style>
