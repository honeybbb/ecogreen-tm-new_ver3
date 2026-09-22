<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
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
  serialNo: '', // 일련번호
  type: '',
  sIdx: '', // 투입단지
  totalQty: 1,
  supplyPrice: 0, // 공급가
  vat: 0,         // 부가세
  totalPrice: 0,  // 단가(합계)
  purchaseDate: new Date().toISOString().substring(0, 10), // 오늘 날짜 기본값
  note: ''
});

// 부가세 자동 계산 옵션
const isAutoVat = ref(true);

// =============================================
// 가격 계산 로직 (Watch)
// =============================================
watch(
    () => form.value.supplyPrice,
    (newVal) => {
      if (isAutoVat.value) {
        form.value.vat = Math.floor(newVal * 0.1);
      }
      form.value.totalPrice = newVal + form.value.vat;
    }
);

watch(
    () => form.value.vat,
    (newVal) => {
      form.value.totalPrice = form.value.supplyPrice + (newVal || 0);
    }
);

watch(isAutoVat, (newVal) => {
  if (newVal) {
    form.value.vat = Math.floor(form.value.supplyPrice * 0.1);
  }
});

// =============================================
// 장비 사진 업로드 관리 (미리보기형)
// =============================================
const fileInput = ref(null);
const selectedFiles = ref([]);

const triggerFileInput = () => {
  fileInput.value.click();
};

const handleFileChange = (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!file.type.startsWith('image/')) {
      alert(`${file.name}은(는) 이미지 파일이 아닙니다.`);
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert(`${file.name}의 크기가 5MB를 초과합니다.`);
      continue;
    }

    selectedFiles.value.push({
      file: file,
      previewUrl: URL.createObjectURL(file)
    });
  }
  if (fileInput.value) fileInput.value.value = '';
};

const removeImage = (index) => {
  const removedFile = selectedFiles.value.splice(index, 1)[0];
  URL.revokeObjectURL(removedFile.previewUrl);
};

// =============================================
// 증빙 서류 업로드 관리 (리스트형)
// =============================================
const docFileInput = ref(null);
const selectedDocs = ref([]);

const triggerDocFileInput = () => {
  docFileInput.value.click();
};

const handleDocFileChange = (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // 문서 및 이미지는 보통 용량을 넉넉히 설정 (예: 10MB 제한)
    if (file.size > 10 * 1024 * 1024) {
      alert(`${file.name}의 크기가 10MB를 초과합니다.`);
      continue;
    }

    selectedDocs.value.push({ file: file });
  }

  if (docFileInput.value) docFileInput.value.value = '';
};

const removeDocFile = (index) => {
  selectedDocs.value.splice(index, 1);
};


// =============================================
// 퀵 네비게이션(스크롤 이동) 로직
// =============================================
const activeSection = ref('sec-basic');
const navItems = [
  { id: 'sec-image', title: '장비 사진', icon: 'mdi-image-outline' },
  { id: 'sec-basic', title: '기본 정보', icon: 'mdi-text-box-outline' },
  { id: 'sec-document', title: '증빙 서류', icon: 'mdi-file-document-outline' }, // 메뉴 추가
];

const scrollToSection = (id) => {
  activeSection.value = id;
  const el = document.getElementById(id);
  const container = document.querySelector('.content-area');

  if (el && container) {
    const topPos = el.offsetTop - 24;
    container.scrollTo({ top: topPos, behavior: 'smooth' });
  }
};

let scrollHandler = null;

onMounted(() => {
  const container = document.querySelector('.content-area');
  if (container) {
    scrollHandler = () => {
      const sections = navItems.map(item => document.getElementById(item.id));
      let current = 'sec-basic';
      sections.forEach(section => {
        if (section && container.scrollTop >= (section.offsetTop - 150)) {
          current = section.getAttribute('id');
        }
      });
      activeSection.value = current;
    };
    container.addEventListener('scroll', scrollHandler);
  }
});

onBeforeUnmount(() => {
  const container = document.querySelector('.content-area');
  if (container && scrollHandler) {
    container.removeEventListener('scroll', scrollHandler);
  }
  selectedFiles.value.forEach(item => URL.revokeObjectURL(item.previewUrl));
});

// =============================================
// 액션 핸들러
// =============================================
const goBack = () => {
  if (confirm('작성 중인 내용이 초기화됩니다. 목록으로 돌아가시겠습니까?')) {
    router.push('/equipment/list');
  }
};

const saveEquipment = async () => {
  if (!form.value.name) {
    alert('장비명을 입력해주세요.');
    scrollToSection('sec-basic');
    return;
  }
  if (!form.value.type) {
    alert('장비 분류를 선택해주세요.');
    scrollToSection('sec-basic');
    return;
  }
  if (!form.value.sIdx) {
    alert('투입 단지를 선택해주세요.');
    scrollToSection('sec-basic');
    return;
  }
  if (form.value.totalQty < 1) {
    alert('총 구매 수량은 1개 이상이어야 합니다.');
    scrollToSection('sec-basic');
    return;
  }

  const formData = new FormData();
  formData.append('name', form.value.name);
  formData.append('type', form.value.type);
  formData.append('sIdx', form.value.sIdx);
  formData.append('model', form.value.model);
  formData.append('serialNo', form.value.serialNo);
  formData.append('totalQty', form.value.totalQty);
  formData.append('supplyPrice', form.value.supplyPrice);
  formData.append('vat', form.value.vat);
  formData.append('totalPrice', form.value.totalPrice);
  formData.append('purchaseDt', form.value.purchaseDate);
  formData.append('note', form.value.note);

  // 1. 장비 사진 파일
  if (selectedFiles.value.length > 0) {
    selectedFiles.value.forEach(item => {
      formData.append('imgPath', item.file); // 사진 데이터
    });
  }

  // 2. 증빙 서류 파일 (영수증, 계약서 등)
  if (selectedDocs.value.length > 0) {
    selectedDocs.value.forEach(item => {
      formData.append('receiptFiles', item.file); // 백엔드 DTO 명칭에 맞게 수정 필요
    });
  }

  if (!confirm('신규 장비를 등록하시겠습니까?')) return;

  try {
    await axios.post('/api/v1/equipment/register', formData);
    alert('장비 등록이 완료되었습니다.');
    await router.push('/equipment/list');
  } catch (e) {
    console.error(e);
    alert('등록 중 문제가 발생했습니다.');
  }
};
</script>

<template>
  <div class="equip-register-page">

    <div class="page-header sticky-header">
      <div class="header-left">
        <button type="button" @click="goBack" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title"><i class="mdi mdi-plus-box-multiple-outline text-primary"></i> 신규 장비 등록</h1>
          <p class="page-subtitle">본사 자산으로 귀속될 신규 장비를 등록합니다.</p>
        </div>
      </div>
      <div class="header-right">
        <button type="button" @click="goBack" class="btn-cancel">취소</button>
        <button type="button" @click="saveEquipment" class="btn-submit">
          <i class="mdi mdi-check"></i> 장비 등록
        </button>
      </div>
    </div>

    <div class="register-layout">
      <!-- 좌측 퀵 네비게이션 -->
      <aside class="quick-nav-sidebar">
        <div class="nav-wrapper">
          <h3 class="nav-title">입력 항목</h3>
          <ul class="nav-list">
            <li v-for="nav in navItems" :key="nav.id"
                :class="['nav-item', { active: activeSection === nav.id }]"
                @click="scrollToSection(nav.id)">
              <i :class="['mdi', nav.icon]"></i>
              <span>{{ nav.title }}</span>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 우측 메인 폼 영역 (스크롤) -->
      <main class="content-area">
        <form @submit.prevent="saveEquipment" id="registerForm">

          <!-- 카드 1: 장비 사진 -->
          <section id="sec-image" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-image-outline text-primary"></i>
              <h2>장비 사진</h2>
            </div>
            <div class="card-body">
              <input type="file" ref="fileInput" @change="handleFileChange" accept="image/png, image/jpeg, image/jpg" multiple hidden />
              <div class="image-gallery-grid">
                <div v-for="(img, index) in selectedFiles" :key="index" class="image-preview-box">
                  <img :src="img.previewUrl" alt="장비 미리보기" />
                  <div class="image-overlay">
                    <button type="button" @click="removeImage(index)" class="btn-img-action btn-danger">
                      <i class="mdi mdi-trash-can-outline"></i> 삭제
                    </button>
                  </div>
                </div>
                <div class="image-empty-box" @click="triggerFileInput">
                  <i class="mdi mdi-plus-box-outline"></i>
                  <p>사진 추가</p>
                  <span>(최대 5MB)</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 카드 2: 기본 정보 -->
          <section id="sec-basic" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-text-box-outline text-primary"></i>
              <h2>기본 정보 입력</h2>
            </div>
            <div class="card-body">
              <div class="form-grid">

                <div class="form-group">
                  <label class="form-label required">장비 분류</label>
                  <select v-model="form.type" required class="form-select">
                    <option value="">선택하세요</option>
                    <option v-for="cat in EQUIP_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label required">투입 단지</label>
                  <SiteSelect v-model="form.sIdx" required></SiteSelect>
                </div>

                <div class="form-group">
                  <label class="form-label required">장비명</label>
                  <input type="text" v-model="form.name" required class="form-input" placeholder="예: 탑승식 습식 바닥세정기" />
                </div>

                <div class="form-group">
                  <label class="form-label">모델명</label>
                  <input type="text" v-model="form.model" class="form-input" placeholder="예: T-1000 PRO" />
                </div>

                <div class="form-group">
                  <label class="form-label">일련번호</label>
                  <input type="text" v-model="form.serialNo" class="form-input" placeholder="ASA23180" />
                </div>

                <div class="form-group">
                  <label class="form-label required">총 수량</label>
                  <input type="number" v-model.number="form.totalQty" min="1" required class="form-input text-right" />
                </div>

                <div class="form-group">
                  <label class="form-label">도입(구매)일</label>
                  <input type="date" v-model="form.purchaseDate" class="form-input" />
                </div>

                <!-- 단가/공급가/부가세 영역 -->
                <div class="form-group full-width price-group-container">
                  <label class="form-label">단가 정보 (원)</label>
                  <div class="price-inputs-wrapper">
                    <!-- 공급가 -->
                    <div class="price-box">
                      <label class="sub-label">공급가</label>
                      <div class="input-with-unit">
                        <input type="number" v-model.number="form.supplyPrice" min="0" step="1000" class="form-input text-right" />
                        <span class="unit">원</span>
                      </div>
                    </div>
                    <div class="math-sign"><i class="mdi mdi-plus"></i></div>
                    <!-- 부가세 -->
                    <div class="price-box">
                      <div class="sub-label-wrap">
                        <label class="sub-label">부가세</label>
                        <label class="checkbox-label">
                          <input type="checkbox" v-model="isAutoVat" /> 자동 (10%)
                        </label>
                      </div>
                      <div class="input-with-unit">
                        <input type="number" v-model.number="form.vat" min="0" step="10" :readonly="isAutoVat" :class="['form-input text-right', { 'bg-readonly': isAutoVat }]" />
                        <span class="unit">원</span>
                      </div>
                    </div>
                    <div class="math-sign"><i class="mdi mdi-equal"></i></div>
                    <!-- 단가(합계) -->
                    <div class="price-box total-box">
                      <label class="sub-label">단가(합계)</label>
                      <div class="input-with-unit">
                        <input type="number" :value="form.totalPrice" readonly class="form-input text-right bg-readonly text-primary-bold" />
                        <span class="unit">원</span>
                      </div>
                    </div>
                  </div>
                  <p class="helper-text-sm text-right mt-2">
                    <i class="mdi mdi-calculator"></i> 장비 총액 (단가 × 수량) :
                    <strong>{{ (form.totalPrice * form.totalQty).toLocaleString() }}원</strong>
                  </p>
                </div>

                <div class="form-group full-width">
                  <label class="form-label">비고 및 특이사항</label>
                  <textarea v-model="form.note" class="form-textarea" rows="4" placeholder="구매처, 기본 사양, 보증(A/S) 기간 등 필요한 메모를 남겨주세요."></textarea>
                </div>

              </div>
            </div>
          </section>

          <!-- 카드 3: 증빙 서류 -->
          <section id="sec-document" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-file-document-outline text-primary"></i>
              <h2>증빙 서류 <span style="font-size:14px; font-weight:normal; color:#64748b; margin-left:6px;">(계약서, 물품 인수증, 영수증 등)</span></h2>
            </div>
            <div class="card-body">
              <input
                  type="file"
                  ref="docFileInput"
                  @change="handleDocFileChange"
                  accept=".pdf, .jpg, .jpeg, .png, .zip, .hwp, .docx"
                  multiple
                  hidden
              />

              <button type="button" class="btn-upload-doc" @click="triggerDocFileInput">
                <i class="mdi mdi-upload"></i> 파일 첨부하기
              </button>
              <p class="helper-text-sm mt-2">※ PDF, JPG, PNG, HWP, DOCX, ZIP 형식 지원 (최대 10MB)</p>

              <!-- 첨부된 문서 목록 -->
              <ul v-if="selectedDocs.length > 0" class="doc-list mt-3">
                <li v-for="(doc, index) in selectedDocs" :key="index" class="doc-item">
                  <div class="doc-info">
                    <i class="mdi mdi-file-outline"></i>
                    <span class="doc-name">{{ doc.file.name }}</span>
                    <span class="doc-size">({{ (doc.file.size / 1024 / 1024).toFixed(2) }} MB)</span>
                  </div>
                  <button type="button" @click="removeDocFile(index)" class="btn-delete-doc" title="삭제">
                    <i class="mdi mdi-close"></i>
                  </button>
                </li>
              </ul>
            </div>
          </section>

          <div style="height: 100px;"></div>
        </form>
      </main>

    </div>
  </div>
</template>

<style>
body, #__nuxt, #__layout, .v-application { overflow: visible !important; }
</style>

<style scoped>
.equip-register-page { background-color: var(--bg-canvas, #f1f5f9); margin: -24px; height: calc(100vh - 60px); display: flex; flex-direction: column; overflow: hidden; }
.sticky-header { flex-shrink: 0; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(8px); padding: 16px 32px; border-bottom: 1px solid var(--border-color, #e2e8f0); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); display: flex; justify-content: space-between; align-items: center; z-index: 50; margin: 0; }
.header-left { display: flex; align-items: center; gap: 16px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.page-title { font-size: 20px; font-weight: 800; color: var(--text-main, #1e293b); margin: 0; display:flex; align-items:center; gap:8px; }
.page-subtitle { font-size: 13px; color: var(--text-sub, #475569); margin: 4px 0 0 0; }

.btn-back { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: #fff; cursor: pointer; transition: 0.2s; display:flex; align-items:center; justify-content:center; }
.btn-back:hover { background: var(--bg-hover, #f8fafc); }
.btn-back i { font-size: 20px; color: var(--text-sub); }
.btn-cancel { padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: #fff; font-weight: 600; cursor: pointer; color: var(--text-sub); transition: 0.2s; }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-submit { padding: 10px 20px; border-radius: 8px; border: none; background: var(--primary, #3b82f6); color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2); transition: 0.2s; display:flex; align-items:center; gap:6px; }
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(59, 130, 246, 0.3); }

/* 퀵 네비게이션 & 메인 레이아웃 */
.register-layout { display: flex; flex: 1; max-width: 1400px; width: 100%; margin: 0 auto; padding-top: 24px; overflow: hidden; }
.quick-nav-sidebar { width: 220px; flex-shrink: 0; height: 100%; overflow-y: auto; padding: 0 16px; }
.nav-title { font-size: 12px; font-weight: 800; color: var(--text-muted, #94a3b8); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 12px; }
.nav-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--text-sub, #475569); cursor: pointer; transition: all 0.2s; background: transparent; }
.nav-item i { font-size: 18px; opacity: 0.6; }
.nav-item:hover { background: rgba(0,0,0,0.04); color: var(--text-main, #1e293b); }
.nav-item.active { background: #fff; color: var(--primary, #3b82f6); box-shadow: 0 2px 8px rgba(0,0,0,0.05); font-weight: 700; }
.nav-item.active i { opacity: 1; }

.content-area { flex: 1; height: 100%; overflow-y: auto; position: relative; padding: 0 24px 80px 24px; scroll-behavior: smooth;}

/* 카드 UI */
.category-card { background: #ffffff; border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); overflow: visible; margin-bottom: 24px; }
.card-header { padding: 20px 24px; border-bottom: 1px solid var(--border-color, #e2e8f0); background: #fff; display: flex; align-items: center; gap: 12px; border-top-left-radius: 12px; border-top-right-radius: 12px; }
.card-header i { font-size: 24px; }
.card-header h2 { font-size: 18px; font-weight: 800; color: var(--text-main, #1e293b); margin: 0; }
.card-body { padding: 24px; }

/* 폼 요소 */
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 20px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.full-width { grid-column: 1 / -1; }
.form-label { font-size: 13px; font-weight: 700; color: var(--text-sub, #475569); }
.form-label.required::after { content: '*'; color: var(--danger, #ef4444); margin-left: 4px; }
.form-input, .form-select, .form-textarea { padding: 10px 12px; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 6px; font-size: 13px; background: #fff; width: 100%; box-sizing: border-box; transition: 0.2s; color: var(--text-main); }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); outline: none; }
.form-textarea { resize: vertical; min-height: 80px; }
.bg-readonly { background-color: var(--bg-canvas, #f1f5f9) !important; color: var(--text-sub) !important; pointer-events: none; }
.text-primary-bold { color: var(--primary, #3b82f6) !important; font-weight: 800; }

.input-with-unit { display: flex; align-items: center; border: 1px solid var(--border-focus); border-radius: 6px; background: #fff; overflow: hidden; }
.input-with-unit:focus-within { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.input-with-unit .form-input { border: none; box-shadow: none; flex: 1; border-radius: 0; }
.input-with-unit .form-input:focus { box-shadow: none; }
.input-with-unit .unit { padding: 0 12px; font-size: 13px; color: var(--text-sub); border-left: 1px solid var(--border-focus); display:flex; align-items:center; }

.helper-text-sm { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 12px; }

/* 금액 3분할 UI */
.price-group-container { background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); }
.price-inputs-wrapper { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 4px;}
.price-box { flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 6px;}
.math-sign { display: flex; align-items: center; justify-content: center; height: 40px; font-size: 20px; color: #94a3b8; font-weight: bold; }
.sub-label-wrap { display: flex; justify-content: space-between; align-items: center; }
.sub-label { font-size: 12px; font-weight: 600; color: var(--text-sub); }
.checkbox-label { font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer; color: var(--text-main); font-weight: 600;}
.checkbox-label input { cursor: pointer; accent-color: var(--primary); }

/* 다중 이미지 갤러리 UI */
.image-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; width: 100%; }
.image-preview-box, .image-empty-box { width: 100%; aspect-ratio: 1 / 1; border-radius: 12px; overflow: hidden; position: relative; }
.image-empty-box { border: 2px dashed var(--border-focus); background: var(--bg-canvas); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; color: var(--text-sub); }
.image-empty-box:hover { background: rgba(59, 130, 246, 0.05); border-color: var(--primary); color: var(--primary); }
.image-empty-box i { font-size: 32px; margin-bottom: 8px; opacity: 0.8; }
.image-empty-box p { font-size: 13px; font-weight: 600; margin: 0 0 4px 0; }
.image-empty-box span { font-size: 11px; opacity: 0.7; }
.image-preview-box img { width: 100%; height: 100%; object-fit: cover; border: 1px solid var(--border-color); }
.image-overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
.image-preview-box:hover .image-overlay { opacity: 1; }
.btn-img-action { padding: 8px 12px; background: rgba(255, 255, 255, 0.95); border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.btn-img-action:hover { background: white; }
.btn-danger { color: var(--danger); }

/* 증빙 서류 업로드 UI */
.btn-upload-doc { padding: 10px 16px; border-radius: 6px; border: 1px dashed var(--primary); background: rgba(59, 130, 246, 0.05); color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; }
.btn-upload-doc:hover { background: rgba(59, 130, 246, 0.1); }
.btn-upload-doc i { font-size: 18px; }
.doc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.doc-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 6px; }
.doc-info { display: flex; align-items: center; gap: 8px; }
.doc-info i { font-size: 20px; color: #94a3b8; }
.doc-name { font-size: 13px; font-weight: 600; color: var(--text-main); }
.doc-size { font-size: 12px; color: var(--text-muted); }
.btn-delete-doc { background: none; border: none; cursor: pointer; color: #94a3b8; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: 0.2s;}
.btn-delete-doc:hover { background: #fee2e2; color: #ef4444; }
.btn-delete-doc i { font-size: 18px; }
</style>