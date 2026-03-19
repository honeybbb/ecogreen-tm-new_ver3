<script setup>
import { ref } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();

// =============================================
// 상태 및 옵션 관리
// =============================================
const EQUIP_CATEGORIES = ['청소기계 (탑승/보행)', '일반 청소용구', '경비/통신장비', '안전/제설장비', '기타'];

const form = ref({
  name: '',
  model: '',
  category: '',
  totalQty: 1,
  price: 0,
  purchaseDate: new Date().toISOString().substring(0, 10), // 오늘 날짜 기본값
  note: ''
});

// =============================================
// 이미지 업로드 관리
// =============================================
const fileInput = ref(null);
const imagePreview = ref(null);
const selectedFile = ref(null);

// 파일 선택 창 띄우기
const triggerFileInput = () => {
  fileInput.value.click();
};

// 파일 첨부 시 미리보기 생성
const handleFileChange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 업로드 가능합니다.');
    return;
  }

  // 5MB 용량 제한 예시
  if (file.size > 5 * 1024 * 1024) {
    alert('이미지 크기는 5MB를 초과할 수 없습니다.');
    return;
  }

  selectedFile.value = file;
  imagePreview.value = URL.createObjectURL(file);
};

// 첨부된 이미지 삭제
const removeImage = () => {
  selectedFile.value = null;
  imagePreview.value = null;
  if (fileInput.value) fileInput.value.value = ''; // input 초기화
};

// =============================================
// 액션 핸들러
// =============================================
const goBack = () => {
  if (confirm('작성 중인 내용이 초기화됩니다. 목록으로 돌아가시겠습니까?')) {
    router.push('/equipment/list');
  }
};

const saveEquipment = async () => {
  // 1. 유효성 검사
  if (!form.value.name) { alert('장비명을 입력해주세요.'); return; }
  if (!form.value.category) { alert('장비 분류를 선택해주세요.'); return; }
  if (form.value.totalQty < 1) { alert('총 구매 수량은 1개 이상이어야 합니다.'); return; }

  // 2. FormData 객체 생성 (이미지 파일 전송을 위해 필수)
  const formData = new FormData();
  formData.append('name', form.value.name);
  formData.append('model', form.value.model);
  formData.append('category', form.value.category);
  formData.append('totalQty', form.value.totalQty);
  formData.append('price', form.value.price);
  formData.append('purchaseDate', form.value.purchaseDate);
  formData.append('note', form.value.note);

  if (selectedFile.value) {
    formData.append('equipImage', selectedFile.value); // 서버에서 받을 필드명
  }

  if (!confirm('신규 장비를 등록하시겠습니까?')) return;

  try {
    // [백엔드 API 호출]
    // Content-Type: multipart/form-data 설정 생략 가능 (axios가 FormData 인식 시 자동 처리)
    await axios.post('/api/v1/equipment/register', formData);

    alert('장비 등록이 완료되었습니다.');
    router.push('/equipment/list');
  } catch (e) {
    console.error(e);
    // API 미구현 시 임시 알림 및 라우팅
    alert('[목업] 등록 성공 처리되었습니다.');
    router.push('/equipment/list');
  }
};
</script>

<template>
  <div class="equip-register-page">

    <div class="page-header">
      <div class="header-left">
        <button @click="goBack" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-plus-box-multiple-outline"></i> 신규 마스터 장비 등록
          </h1>
          <p class="page-subtitle">본사 자산으로 귀속될 신규 장비를 등록하고 현장에 분배할 수 있습니다.</p>
        </div>
      </div>
      <div class="header-actions">
        <button @click="goBack" class="btn-cancel"><i class="mdi mdi-close"></i> 취소</button>
        <button @click="saveEquipment" class="btn-save"><i class="mdi mdi-check"></i> 장비 등록</button>
      </div>
    </div>

    <div class="register-content">

      <div class="image-section">
        <div class="section-title">
          <i class="mdi mdi-image-outline"></i> 장비 사진
        </div>

        <div class="image-upload-container">
          <input
              type="file"
              ref="fileInput"
              @change="handleFileChange"
              accept="image/png, image/jpeg, image/jpg"
              hidden
          />

          <div v-if="imagePreview" class="image-preview-box">
            <img :src="imagePreview" alt="장비 미리보기" />
            <div class="image-overlay">
              <button @click="triggerFileInput" class="btn-img-action"><i class="mdi mdi-camera-retake"></i> 변경</button>
              <button @click="removeImage" class="btn-img-action btn-danger"><i class="mdi mdi-trash-can-outline"></i> 삭제</button>
            </div>
          </div>

          <div v-else class="image-empty-box" @click="triggerFileInput">
            <i class="mdi mdi-cloud-upload-outline"></i>
            <p>클릭하여 장비 사진을 업로드하세요</p>
            <span>JPG, PNG 지원 (최대 5MB)</span>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="section-title">
          <i class="mdi mdi-text-box-outline"></i> 기본 정보 입력
        </div>

        <div class="form-grid">

          <div class="form-item full-width">
            <label class="required">장비명</label>
            <input type="text" v-model="form.name" class="info-input" placeholder="예: 탑승식 습식 바닥세정기" />
          </div>

          <div class="form-item">
            <label>모델명</label>
            <input type="text" v-model="form.model" class="info-input" placeholder="예: T-1000 PRO" />
          </div>

          <div class="form-item required">
            <label class="required">장비 분류</label>
            <select v-model="form.category" class="info-select">
              <option value="">선택하세요</option>
              <option v-for="cat in EQUIP_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>

          <div class="form-item">
            <label class="required">총 구매 수량 (대)</label>
            <input type="number" v-model.number="form.totalQty" min="1" class="info-input text-right" />
          </div>

          <div class="form-item">
            <label>도입(구매)일</label>
            <input type="date" v-model="form.purchaseDate" class="info-input" />
          </div>

          <div class="form-item full-width">
            <label>개당 구매 단가 (원)</label>
            <div class="input-with-unit">
              <input type="number" v-model.number="form.price" min="0" step="10000" class="info-input text-right" />
              <span class="unit">원</span>
            </div>
            <span class="help-text">자산 가치 평가를 위해 입력합니다. (총액: {{ (form.price * form.totalQty).toLocaleString() }}원)</span>
          </div>

          <div class="form-item full-width">
            <label>비고 및 특이사항</label>
            <textarea v-model="form.note" class="info-textarea" rows="4" placeholder="구매처, 기본 사양, 보증(A/S) 기간 등 필요한 메모를 남겨주세요."></textarea>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* =========================================
   Layout & Header
========================================= */
.equip-register-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.btn-back {
  width: 42px; height: 42px; border-radius: 10px; background: var(--bg-surface);
  border: 1px solid var(--border-color); color: var(--text-sub); cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.btn-back:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-back i { font-size: 20px; }

.page-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
.page-title i { color: var(--primary); font-size: 26px; }
.page-subtitle { margin: 4px 0 0 0; color: var(--text-sub); font-size: 13px; }

.header-actions { display: flex; gap: 10px; }
.btn-cancel, .btn-save {
  display: flex; align-items: center; gap: 6px; padding: 10px 20px; height: 42px;
  border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-sizing: border-box;
}
.btn-cancel { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-save { background: var(--primary); border: none; color: white; box-shadow: var(--shadow-sm); }
.btn-save:hover { background: var(--primary-hover); transform: translateY(-1px); }

/* =========================================
   Content Layout (좌우 분할)
========================================= */
.register-content {
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.image-section {
  width: 350px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
}

.form-section {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 32px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-title i { color: var(--primary); font-size: 20px; }

/* =========================================
   Image Upload UI
========================================= */
.image-upload-container {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-canvas);
}

.image-empty-box {
  width: 100%;
  height: 100%;
  border: 2px dashed var(--border-focus);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-sub);
}
.image-empty-box:hover {
  background: rgba(99, 102, 241, 0.03);
  border-color: var(--primary);
  color: var(--primary);
}
.image-empty-box i { font-size: 48px; margin-bottom: 12px; opacity: 0.8; }
.image-empty-box p { font-size: 14px; font-weight: 600; margin: 0 0 6px 0; }
.image-empty-box span { font-size: 12px; opacity: 0.7; }

.image-preview-box {
  width: 100%;
  height: 100%;
  position: relative;
}
.image-preview-box img {
  width: 100%;
  height: 100%;
  object-fit: cover; /* 이미지가 박스를 꽉 채우도록 */
}

/* 마우스 올렸을 때 액션 버튼 보이기 */
.image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}
.image-preview-box:hover .image-overlay {
  opacity: 1;
}

.btn-img-action {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-img-action:hover { background: white; }
.btn-danger { color: var(--danger); }

/* =========================================
   Form Elements
========================================= */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-item.full-width { grid-column: 1 / -1; }

.form-item label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sub);
}
.form-item label.required::after {
  content: '*';
  color: var(--danger);
  margin-left: 4px;
}

.info-input, .info-select, .info-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-main);
  background: var(--bg-canvas);
  transition: all 0.2s;
  box-sizing: border-box;
}
.info-input:focus, .info-select:focus, .info-textarea:focus {
  outline: none;
  border-color: var(--primary);
  background: var(--bg-surface);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.info-textarea { resize: vertical; }

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}
.input-with-unit .info-input { flex: 1; }
.unit { font-size: 14px; font-weight: 600; color: var(--text-sub); }

.help-text {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.text-right { text-align: right; }

/* =========================================
   Responsive Breakpoints
========================================= */
@media (max-width: 1024px) {
  /* 태블릿 이하는 세로 배치 */
  .register-content {
    flex-direction: column;
  }
  .image-section {
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
  }
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .form-section {
    padding: 20px;
  }
}
</style>
