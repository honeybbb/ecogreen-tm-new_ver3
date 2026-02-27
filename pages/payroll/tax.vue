<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";

const router = useRouter();

// 1. 상태 관리
const insuranceRates = ref({
  nationalPension: 4.5,       // 국민연금 (근로자)
  healthInsurance: 3.545,     // 건강보험 (근로자)
  longTermCare: 12.95,        // 장기요양 (건강보험의 %)
  employmentInsurance: 0.9,   // 고용보험 (근로자)
  industrialAccident: 0.7,    // ✅ 산재보험 (전액 회사부담, 업종별 상이)
  appliedYear: new Date().getFullYear(),
  lastUpdated: '2024-01-01'
});

// 수정 모드 상태
const isEditMode = ref(false);
const tempRates = ref({ ...insuranceRates.value });

// 2. 미리보기 계산 (가상 급여 기준)
const sampleSalary = 3000000; // 계산하기 쉽게 300만원으로 예시 변경 (또는 기존 값 유지)

const previewCalculation = computed(() => {
  const rates = isEditMode.value ? tempRates.value : insuranceRates.value;

  // 근로자 부담분 계산
  const pension = Math.floor(sampleSalary * (rates.nationalPension / 100));
  const health = Math.floor(sampleSalary * (rates.healthInsurance / 100));
  const longTerm = Math.floor(health * (rates.longTermCare / 100)); // 건보료의 %
  const employment = Math.floor(sampleSalary * (rates.employmentInsurance / 100));

  // 근로자 공제 합계
  const employeeTotal = pension + health + longTerm + employment;

  // ✅ 회사 부담분 (산재보험) 계산
  // 산재보험은 과세소득(여기선 sampleSalary로 가정) * 요율
  const industrial = Math.floor(sampleSalary * (rates.industrialAccident / 100));

  return {
    pension,
    health,
    longTerm,
    employment,
    employeeTotal,
    industrial // ✅ 회사 부담금 별도 반환
  };
});

// 3. 이벤트 핸들러
const toggleEdit = () => {
  if (isEditMode.value) {
    tempRates.value = { ...insuranceRates.value }; // 취소 시 복구
  }
  isEditMode.value = !isEditMode.value;
};

const handleSave = () => {
  if (confirm('변경된 요율을 저장하시겠습니까?\n산재보험은 회사 부담금 계산에만 영향을 미칩니다.')) {

    const params = {
      applied_year: tempRates.value.appliedYear,
      pension_rate: tempRates.value.nationalPension,
      health_rate: tempRates.value.healthInsurance,
      long_term_care_rate: tempRates.value.longTermCare,
      employment_rate: tempRates.value.employmentInsurance,
      industrial_rate: tempRates.value.industrialAccident,
    };

    try {
      axios.post('/api/v1/config/tax/rate', params)
          .then(res => {
            console.log(res.data);
            // 저장 성공 시 실제 상태 업데이트 (새로고침 없이 반영 위함)
            insuranceRates.value = { ...tempRates.value };
            isEditMode.value = false;
            alert('설정이 저장되었습니다.');
          })
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    }
  }
};

const getTaxRate = async function () {
  const year = tempRates.value.appliedYear;
  axios.get(`/api/v1/config/tax/rate/${year}`)
      .then(res => {
        console.log(res.data);
        let result = res.data.data[0];
        if(result) {
          tempRates.value.nationalPension = result.pension_rate;
          tempRates.value.healthInsurance = result.health_rate;
          tempRates.value.longTermCare = result.long_term_care_rate;
          tempRates.value.employmentInsurance = result.employment_rate;
          tempRates.value.industrialAccident = result.industrial_rate || 0;

          // 조회된 값으로 원본 데이터도 동기화
          insuranceRates.value = { ...tempRates.value };
        } else {
          // 데이터 없을 경우 초기화
          tempRates.value.nationalPension = 0;
          tempRates.value.healthInsurance = 0;
          tempRates.value.longTermCare = 0;
          tempRates.value.employmentInsurance = 0;
          tempRates.value.industrialAccident = 0;
        }
      })
      .catch(err => {
        console.error(err);
      });
}

onMounted(() => {
  getTaxRate();
})
</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <h2 class="page-title">급여 및 4대보험 요율 설정</h2>
      <p class="page-subtitle">근로자 공제 및 회사 부담금 계산의 기준이 되는 요율을 관리합니다.</p>
    </div>

    <div class="settings-container">
      <div class="settings-card">
        <div class="card-header">
          <h3 class="card-title">
            보험별 요율 설정
            <span class="year-select-wrapper">
              (
              <select v-model="tempRates.appliedYear" @change="getTaxRate" class="year-select">
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
              년 기준 )
            </span>
          </h3>
          <button v-if="!isEditMode" @click="toggleEdit" class="btn btn-primary">수정하기</button>
          <div v-else class="btn-group">
            <button @click="toggleEdit" class="btn btn-outline">취소</button>
            <button @click="handleSave" class="btn btn-success">저장하기</button>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">국민연금 요율 (%)</label>
            <div class="input-wrapper">
              <input type="number" v-model="tempRates.nationalPension" :disabled="!isEditMode" step="0.001" class="form-input">
              <span class="unit">%</span>
            </div>
            <p class="helper-text">근로자 부담분 (전체 9.0% 중 4.5%)</p>
          </div>

          <div class="form-group">
            <label class="form-label">건강보험 요율 (%)</label>
            <div class="input-wrapper">
              <input type="number" v-model="tempRates.healthInsurance" :disabled="!isEditMode" step="0.001" class="form-input">
              <span class="unit">%</span>
            </div>
            <p class="helper-text">근로자 부담분 (2024년 기준 3.545%)</p>
          </div>

          <div class="form-group">
            <label class="form-label">장기요양보험 요율 (%)</label>
            <div class="input-wrapper">
              <input type="number" v-model="tempRates.longTermCare" :disabled="!isEditMode" step="0.01" class="form-input">
              <span class="unit">%</span>
            </div>
            <p class="helper-text">건강보험료 대비 비율 (2024년 12.95%)</p>
          </div>

          <div class="form-group">
            <label class="form-label">고용보험 요율 (%)</label>
            <div class="input-wrapper">
              <input type="number" v-model="tempRates.employmentInsurance" :disabled="!isEditMode" step="0.01" class="form-input">
              <span class="unit">%</span>
            </div>
            <p class="helper-text">근로자 실업급여 부담분 (0.9%)</p>
          </div>

          <div class="form-group full-width-group">
            <label class="form-label badge-label">
              산재보험 요율 (%)
              <span class="badge company-only">전액 회사부담</span>
            </label>
            <div class="input-wrapper">
              <input type="number" v-model="tempRates.industrialAccident" :disabled="!isEditMode" step="0.01" class="form-input">
              <span class="unit">%</span>
            </div>
            <p class="helper-text text-company">
              업종별 요율 상이 (급여명세서 공제 안 됨)
            </p>
          </div>
        </div>

        <div class="last-updated">
          최종 업데이트: {{ insuranceRates.lastUpdated }}
        </div>
      </div>

      <div class="preview-card">
        <h3 class="card-title">시뮬레이션 (월 {{ (sampleSalary/10000).toLocaleString() }}만원 기준)</h3>

        <div class="preview-section">
          <p class="section-title emp">근로자 공제 예상액</p>
          <div class="preview-list">
            <div class="preview-item">
              <span>국민연금</span>
              <span class="amount">{{ previewCalculation.pension.toLocaleString() }}원</span>
            </div>
            <div class="preview-item">
              <span>건강보험</span>
              <span class="amount">{{ previewCalculation.health.toLocaleString() }}원</span>
            </div>
            <div class="preview-item">
              <span>장기요양</span>
              <span class="amount">{{ previewCalculation.longTerm.toLocaleString() }}원</span>
            </div>
            <div class="preview-item">
              <span>고용보험</span>
              <span class="amount">{{ previewCalculation.employment.toLocaleString() }}원</span>
            </div>
            <hr class="divider">
            <div class="preview-item total">
              <span>공제 계</span>
              <span class="amount">{{ previewCalculation.employeeTotal.toLocaleString() }}원</span>
            </div>
          </div>
        </div>

        <div class="preview-section company-section">
          <p class="section-title com">회사 부담금 예상액 (참고)</p>
          <div class="preview-list">
            <div class="preview-item">
              <span>산재보험료</span>
              <span class="amount company-cost">{{ previewCalculation.industrial.toLocaleString() }}원</span>
            </div>
            <p class="info-text-xs">* 산재보험은 전액 회사가 납부합니다.</p>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.page-subtitle { color: #6b7280; margin-top: 5px; }

.settings-container { display: grid; grid-template-columns: 1fr 350px; gap: 25px; }

/* 카드 공통 */
.settings-card, .preview-card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
.card-title { font-size: 1.1rem; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 5px;}

/* 년도 선택 */
.year-select-wrapper { font-weight: 400; font-size: 0.95rem; margin-left: 5px; color: #4b5563;}
.year-select { border: none; font-weight: 700; color: #3b82f6; cursor: pointer; background: transparent; font-size: 1rem;}

/* 폼 그리드 */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.form-group { display: flex; flex-direction: column; }
.full-width-group { grid-column: 1 / -1; } /* 산재보험 한 줄 차지 */

.form-label { font-size: 0.9rem; font-weight: 600; margin-bottom: 8px; color: #374151; display: flex; justify-content: space-between; align-items: center;}
.input-wrapper { position: relative; display: flex; align-items: center; }
.form-input { width: 100%; padding: 10px 40px 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 1rem; text-align: right; }
.form-input:disabled { background-color: #f9fafb; color: #6b7280; }
.unit { position: absolute; right: 15px; color: #9ca3af; font-weight: 500; }
.helper-text { font-size: 0.75rem; color: #9ca3af; margin-top: 5px; }
.text-company { color: #d97706; } /* 산재보험 헬퍼 텍스트 색상 */

/* 뱃지 스타일 */
.badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-weight: 500; }
.company-only { background-color: #fef3c7; color: #d97706; border: 1px solid #fcd34d; }

.last-updated { margin-top: 30px; font-size: 0.8rem; color: #9ca3af; text-align: right; }

/* 버튼 */
.btn { padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; transition: 0.2s; }
.btn-group { display: flex; gap: 8px; }
.btn-primary { background-color: #3b82f6; color: white; }
.btn-success { background-color: #10b981; color: white; }
.btn-outline { background-color: white; border: 1px solid #d1d5db; color: #374151; }
.btn:hover { opacity: 0.9; }

/* 미리보기 카드 */
.preview-card { height: fit-content; background-color: #f8fafc; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 20px;}
.preview-section { background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; }
.section-title { font-size: 0.85rem; font-weight: 700; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;}
.section-title.emp { color: #3b82f6; }
.section-title.com { color: #d97706; }

.preview-list { display: flex; flex-direction: column; gap: 10px; }
.preview-item { display: flex; justify-content: space-between; font-size: 0.9rem; color: #475569; }
.amount { font-weight: 600; color: #1e293b; }
.total { font-size: 1rem; font-weight: 700; color: #3b82f6; }
.company-cost { color: #d97706; }
.divider { border: 0; border-top: 1px solid #e2e8f0; margin: 5px 0; }
.info-text-xs { font-size: 0.7rem; color: #94a3b8; margin-top: 5px; text-align: right;}

@media (max-width: 900px) {
  .settings-container { grid-template-columns: 1fr; }
}
</style>
