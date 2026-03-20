<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";

const router = useRouter();

// 상태 관리
const insuranceRates = ref({
  nationalPension: 4.5,
  healthInsurance: 3.545,
  longTermCare: 12.95,
  employmentInsurance: 0.9,
  industrialAccident: 0.7,
  appliedYear: new Date().getFullYear(),
  lastUpdated: '2024-01-01'
});

// 수정 모드 상태
const isEditMode = ref(false);
const tempRates = ref({ ...insuranceRates.value });

// 1. 기준 급여 (실제 계산에 쓰이는 순수 숫자형)
const sampleSalary = ref(3000000);

// 2. 화면 표시용 쉼표 포맷팅 (get, set 활용)
const formattedSalary = computed({
  get: () => {
    // 값이 0이거나 없을 때 빈칸 처리 원하면 '' 리턴, 아니면 toLocaleString()
    if (!sampleSalary.value) return '';
    return sampleSalary.value.toLocaleString();
  },
  set: (newValue) => {
    // 입력값에서 숫자만 추출해서 다시 sampleSalary에 저장 (쉼표, 문자 등 모두 제거)
    const numericString = newValue.replace(/[^\d]/g, '');
    sampleSalary.value = numericString ? Number(numericString) : 0;
  }
});

// 미리보기 계산
const previewCalculation = computed(() => {
  const rates = isEditMode.value ? tempRates.value : insuranceRates.value;

  const currentSalary = Number(sampleSalary.value) || 0;

  const pension = Math.floor(currentSalary * (rates.nationalPension / 100));
  const health = Math.floor(currentSalary * (rates.healthInsurance / 100));
  const longTerm = Math.floor(health * (rates.longTermCare / 100));
  const employment = Math.floor(currentSalary * (rates.employmentInsurance / 100));
  const employeeTotal = pension + health + longTerm + employment;
  const industrial = Math.floor(currentSalary * (rates.industrialAccident / 100));

  return {
    pension,
    health,
    longTerm,
    employment,
    employeeTotal,
    industrial
  };
});

// 이벤트 핸들러
const toggleEdit = () => {
  if (isEditMode.value) {
    tempRates.value = { ...insuranceRates.value };
  }
  isEditMode.value = !isEditMode.value;
};

const handleSave = async () => {
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
      await axios.post('/api/v1/config/tax/rate', params);
      insuranceRates.value = { ...tempRates.value };
      isEditMode.value = false;
      alert('설정이 저장되었습니다.');
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
        let result = res.data.data[0];
        if (result) {
          tempRates.value.nationalPension = result.pension_rate;
          tempRates.value.healthInsurance = result.health_rate;
          tempRates.value.longTermCare = result.long_term_care_rate;
          tempRates.value.employmentInsurance = result.employment_rate;
          tempRates.value.industrialAccident = result.industrial_rate || 0;
          tempRates.value.lastUpdated = result.regDt;
          insuranceRates.value = { ...tempRates.value };
        } else {
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
      <div class="header-left">
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-shield-account-outline"></i>
            보험별 요율 설정
          </h1>
          <p class="page-subtitle">근로자 공제 및 회사 부담금 계산의 기준이 되는 요율을 관리합니다</p>
        </div>
      </div>
      <div class="header-actions">
        <template v-if="!isEditMode">
          <button @click="toggleEdit" class="btn-edit">
            <i class="mdi mdi-pencil-outline"></i>
            <span>수정하기</span>
          </button>
        </template>
        <template v-else>
          <button @click="toggleEdit" class="btn-cancel">
            <i class="mdi mdi-close"></i>
            <span>취소</span>
          </button>
          <button @click="handleSave" class="btn-save">
            <i class="mdi mdi-check"></i>
            <span>저장하기</span>
          </button>
        </template>
      </div>
    </div>

    <div class="year-selector-card">
      <div class="year-selector-content">
        <div class="year-icon">
          <i class="mdi mdi-calendar-month-outline"></i>
        </div>
        <div class="year-info">
          <span class="year-label">적용 연도</span>
          <div class="year-select-wrapper">
            <select v-model="tempRates.appliedYear" @change="getTaxRate" class="year-select">
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
            <i class="mdi mdi-chevron-down"></i>
          </div>
        </div>
      </div>
      <div class="year-last-updated">
        <i class="mdi mdi-clock-outline"></i>
        최종 업데이트: {{ insuranceRates.lastUpdated }}
      </div>
    </div>

    <div class="content-grid">
      <div class="rates-section">
        <div class="rates-grid">
          <div class="rate-card">
            <div class="rate-card-header">
              <div class="rate-icon pension">
                <i class="mdi mdi-shield-account-outline"></i>
              </div>
              <div class="rate-title-group">
                <h3 class="rate-title">국민연금</h3>
                <p class="rate-description">근로자 부담분 (전체 9.0% 중 4.5%)</p>
              </div>
            </div>
            <div class="rate-input-group">
              <input
                  type="number"
                  v-model="tempRates.nationalPension"
                  :disabled="!isEditMode"
                  step="0.001"
                  class="rate-input"
              />
              <span class="rate-unit">%</span>
            </div>
            <div class="rate-preview">
              <span class="preview-label">예상 공제액</span>
              <span class="preview-value">{{ previewCalculation.pension.toLocaleString() }}원</span>
            </div>
          </div>

          <div class="rate-card">
            <div class="rate-card-header">
              <div class="rate-icon health">
                <i class="mdi mdi-medical-bag"></i>
              </div>
              <div class="rate-title-group">
                <h3 class="rate-title">건강보험</h3>
                <p class="rate-description">근로자 부담분 (2024년 기준 3.545%)</p>
              </div>
            </div>
            <div class="rate-input-group">
              <input
                  type="number"
                  v-model="tempRates.healthInsurance"
                  :disabled="!isEditMode"
                  step="0.001"
                  class="rate-input"
              />
              <span class="rate-unit">%</span>
            </div>
            <div class="rate-preview">
              <span class="preview-label">예상 공제액</span>
              <span class="preview-value">{{ previewCalculation.health.toLocaleString() }}원</span>
            </div>
          </div>

          <div class="rate-card">
            <div class="rate-card-header">
              <div class="rate-icon longterm">
                <i class="mdi mdi-hospital-building"></i>
              </div>
              <div class="rate-title-group">
                <h3 class="rate-title">장기요양보험</h3>
                <p class="rate-description">건강보험료 대비 비율 (2024년 12.95%)</p>
              </div>
            </div>
            <div class="rate-input-group">
              <input
                  type="number"
                  v-model="tempRates.longTermCare"
                  :disabled="!isEditMode"
                  step="0.01"
                  class="rate-input"
              />
              <span class="rate-unit">%</span>
            </div>
            <div class="rate-preview">
              <span class="preview-label">예상 공제액</span>
              <span class="preview-value">{{ previewCalculation.longTerm.toLocaleString() }}원</span>
            </div>
          </div>

          <div class="rate-card">
            <div class="rate-card-header">
              <div class="rate-icon employment">
                <i class="mdi mdi-briefcase-outline"></i>
              </div>
              <div class="rate-title-group">
                <h3 class="rate-title">고용보험</h3>
                <p class="rate-description">근로자 실업급여 부담분 (0.9%)</p>
              </div>
            </div>
            <div class="rate-input-group">
              <input
                  type="number"
                  v-model="tempRates.employmentInsurance"
                  :disabled="!isEditMode"
                  step="0.01"
                  class="rate-input"
              />
              <span class="rate-unit">%</span>
            </div>
            <div class="rate-preview">
              <span class="preview-label">예상 공제액</span>
              <span class="preview-value">{{ previewCalculation.employment.toLocaleString() }}원</span>
            </div>
          </div>

          <div class="rate-card full-width company-card">
            <div class="rate-card-header">
              <div class="rate-icon industrial">
                <i class="mdi mdi-hard-hat"></i>
              </div>
              <div class="rate-title-group">
                <div class="title-with-badge">
                  <h3 class="rate-title">산재보험</h3>
                  <span class="company-badge">
                    <i class="mdi mdi-domain"></i>
                    전액 회사부담
                  </span>
                </div>
                <p class="rate-description company-description">업종별 요율 상이 (급여명세서 공제 안 됨)</p>
              </div>
            </div>
            <div class="rate-input-group">
              <input
                  type="number"
                  v-model="tempRates.industrialAccident"
                  :disabled="!isEditMode"
                  step="0.01"
                  class="rate-input"
              />
              <span class="rate-unit">%</span>
            </div>
            <div class="rate-preview company-preview">
              <span class="preview-label">회사 부담금</span>
              <span class="preview-value company-value">{{ previewCalculation.industrial.toLocaleString() }}원</span>
            </div>
          </div>
        </div>
      </div>

      <div class="simulation-section">
        <div class="simulation-card">
          <div class="simulation-header">
            <div class="simulation-icon">
              <i class="mdi mdi-calculator-variant-outline"></i>
            </div>
            <div>
              <h2 class="simulation-title">급여 시뮬레이션</h2>
              <p class="simulation-subtitle">예상 공제액 및 실수령액 계산기</p>
            </div>
          </div>

          <div class="simulation-input-section">
            <label class="input-label">
              <i class="mdi mdi-cash-multiple"></i>
              월 급여액 (과세대상금액)
            </label>
            <div class="salary-input-wrapper">
              <input
                  type="text"
                  v-model="formattedSalary"
                  class="salary-input"
                  placeholder="급여액을 입력하세요"
              />
              <span class="salary-unit">원</span>
            </div>
          </div>

          <div class="simulation-section-card employee">
            <div class="simulation-section-header">
              <i class="mdi mdi-account-outline"></i>
              <h3>근로자 공제 예상액</h3>
            </div>
            <div class="simulation-items">
              <div class="simulation-item">
                <div class="item-info">
                  <div class="item-icon pension"><i class="mdi mdi-shield-account-outline"></i></div>
                  <span class="item-name">국민연금</span>
                </div>
                <span class="item-amount">{{ previewCalculation.pension.toLocaleString() }}원</span>
              </div>
              <div class="simulation-item">
                <div class="item-info">
                  <div class="item-icon health"><i class="mdi mdi-medical-bag"></i></div>
                  <span class="item-name">건강보험</span>
                </div>
                <span class="item-amount">{{ previewCalculation.health.toLocaleString() }}원</span>
              </div>
              <div class="simulation-item">
                <div class="item-info">
                  <div class="item-icon longterm"><i class="mdi mdi-hospital-building"></i></div>
                  <span class="item-name">장기요양</span>
                </div>
                <span class="item-amount">{{ previewCalculation.longTerm.toLocaleString() }}원</span>
              </div>
              <div class="simulation-item">
                <div class="item-info">
                  <div class="item-icon employment"><i class="mdi mdi-briefcase-outline"></i></div>
                  <span class="item-name">고용보험</span>
                </div>
                <span class="item-amount">{{ previewCalculation.employment.toLocaleString() }}원</span>
              </div>
            </div>
            <div class="simulation-total">
              <span class="total-label">총 공제액</span>
              <span class="total-amount">{{ previewCalculation.employeeTotal.toLocaleString() }}원</span>
            </div>
          </div>

          <div class="simulation-section-card company">
            <div class="simulation-section-header">
              <i class="mdi mdi-domain"></i>
              <h3>회사 부담금 (참고)</h3>
            </div>
            <div class="simulation-items">
              <div class="simulation-item">
                <div class="item-info">
                  <div class="item-icon industrial"><i class="mdi mdi-hard-hat"></i></div>
                  <span class="item-name">산재보험료</span>
                </div>
                <span class="item-amount company">{{ previewCalculation.industrial.toLocaleString() }}원</span>
              </div>
            </div>
            <div class="simulation-note">
              <i class="mdi mdi-information-outline"></i>
              <span>산재보험은 전액 회사가 납부합니다</span>
            </div>
          </div>

          <div class="net-pay-card">
            <div class="net-pay-content">
              <span class="net-pay-label">예상 실수령액</span>
              <span class="net-pay-amount">
                {{ (Number(sampleSalary) - previewCalculation.employeeTotal).toLocaleString() }}원
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-cancel {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-sub);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.btn-cancel:hover {
  background: var(--bg-hover);
  color: var(--text-main);
  border-color: var(--border-focus);
}
.btn-cancel i { font-size: 16px; }

.btn-edit {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px; height: 42px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-main);
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  box-shadow: var(--shadow-sm); white-space: nowrap;
  box-sizing: border-box;
}
.btn-edit:hover {
  background-color: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
}
.btn-edit i { font-size: 16px; }

/* === 상단 연도 선택 카드 === */
.year-selector-card {
  background: var(--bg-surface); border-radius: 12px; padding: 20px 24px;
  border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);
  margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;
}
.year-selector-content { display: flex; align-items: center; gap: 16px; }
.year-icon {
  width: 48px; height: 48px; border-radius: 10px;
  background-color: var(--primary-soft); display: flex; align-items: center; justify-content: center;
}
.year-icon i { font-size: 24px; color: var(--primary); }
.year-info { display: flex; flex-direction: column; gap: 4px; }
.year-label { font-size: 13px; color: var(--text-sub); font-weight: 600; }
.year-select-wrapper { position: relative; display: inline-block; }
.year-select {
  appearance: none; background: transparent; border: none; font-size: 20px; font-weight: 700;
  color: var(--primary); cursor: pointer; padding-right: 28px; outline: none;
}
.year-select-wrapper i {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%);
  font-size: 24px; color: var(--primary); pointer-events: none;
}
.year-last-updated { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); }
.year-last-updated i { font-size: 16px; }

/* === 메인 그리드 === */
.content-grid { display: grid; grid-template-columns: 1fr 380px; gap: 24px; }
.rates-section { display: flex; flex-direction: column; gap: 20px; }

/* 요율 카드 */
.rates-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.rate-card {
  background: var(--bg-surface); border-radius: 12px; padding: 20px; border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm); transition: all 0.2s;
}
.rate-card:hover { border-color: var(--border-focus); }
.rate-card.full-width { grid-column: 1 / -1; }
.rate-card.company-card { background-color: rgba(245, 158, 11, 0.02); border-color: rgba(245, 158, 11, 0.3); }

.rate-card-header { display: flex; gap: 12px; margin-bottom: 16px; align-items: flex-start;}
.rate-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.rate-icon i { font-size: 20px; color: var(--text-inverse); }

/* 각 보험별 플랫 컬러 */
.rate-icon.pension { background-color: #3b82f6; }
.rate-icon.health { background-color: var(--success); }
.rate-icon.longterm { background-color: #8b5cf6; }
.rate-icon.employment { background-color: var(--warning); }
.rate-icon.industrial { background-color: var(--danger); }

.rate-title-group { display: flex; flex-direction: column; gap: 4px;}
.title-with-badge { display: flex; align-items: center; gap: 8px; }
.rate-title { font-size: 15px; font-weight: 700; color: var(--text-main); margin: 0; }
.rate-description { font-size: 12px; color: var(--text-sub); margin: 0; }
.rate-description.company-description { color: var(--warning); }

.company-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
  background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px;
  font-size: 11px; font-weight: 600; color: var(--warning);
}
.company-badge i { font-size: 12px; }

/* 입력창 (플랫, 포커스 개선) */
.rate-input-group { position: relative; margin-bottom: 16px; }
.rate-input {
  width: 100%; padding: 10px 36px 10px 14px; border: 1px solid var(--border-focus); border-radius: 8px;
  font-size: 16px; font-weight: 700; text-align: right; color: var(--text-main);
  transition: all 0.2s; box-sizing: border-box; background: var(--bg-surface);
}
.rate-input:disabled { background-color: var(--bg-canvas); color: var(--text-muted); border-color: var(--border-color);}
.rate-input:not(:disabled):hover { border-color: var(--text-sub); }
.rate-input:not(:disabled):focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.rate-unit { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 14px; font-weight: 600; color: var(--text-sub); pointer-events: none;}

/* 프리뷰 영역 */
.rate-preview {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background-color: var(--bg-hover); border-radius: 8px; border: 1px solid var(--bg-canvas);
}
.rate-preview.company-preview { background-color: rgba(245, 158, 11, 0.05); border-color: rgba(245, 158, 11, 0.1);}
.preview-label { font-size: 12px; color: var(--text-sub); font-weight: 600; }
.preview-value { font-size: 14px; font-weight: 700; color: var(--text-main); }
.preview-value.company-value { color: var(--warning); }

/* === 우측 시뮬레이션 === */
.simulation-section { position: sticky; top: 20px; }
.simulation-card {
  background: var(--bg-surface); border-radius: 12px; box-shadow: var(--shadow-md);
  overflow: hidden; border: 1px solid var(--border-color);
}
.simulation-header {
  padding: 24px; background-color: var(--header-bg); /* 다크 네이비 적용 */
  color: var(--text-inverse); display: flex; gap: 16px; align-items: center;
}
.simulation-icon {
  width: 48px; height: 48px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.15); display: flex; align-items: center; justify-content: center;
}
.simulation-icon i { font-size: 24px; }
.simulation-title { font-size: 18px; font-weight: 700; margin: 0 0 4px 0; letter-spacing: -0.5px;}
.simulation-subtitle { font-size: 13px; opacity: 0.8; margin: 0; }

.simulation-input-section { padding: 24px; background: var(--bg-canvas); border-bottom: 1px solid var(--border-color); }
.input-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-sub); margin-bottom: 10px; }
.input-label i { font-size: 16px; color: var(--primary); }
.salary-input-wrapper { position: relative; display: flex; align-items: center; }
.salary-input {
  width: 100%; padding: 12px 36px 12px 16px; border: 1px solid var(--border-focus); border-radius: 8px;
  font-size: 18px; font-weight: 700; color: var(--text-main); text-align: right;
  transition: all 0.2s; background: var(--bg-surface);
}
.salary-input:hover { border-color: var(--text-sub); }
.salary-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.salary-unit { position: absolute; right: 14px; font-size: 15px; font-weight: 600; color: var(--text-sub); pointer-events: none; }

.simulation-section-card { padding: 24px; border-bottom: 1px solid var(--border-color); }
.simulation-section-card:last-child { border-bottom: none; }
.simulation-section-card.employee { background: var(--bg-surface); }
.simulation-section-card.company { background: rgba(245, 158, 11, 0.02); }

.simulation-section-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 20px;
}
.simulation-section-header i { font-size: 18px; color: var(--primary); }
.simulation-section-header h3 { font-size: 14px; font-weight: 700; color: var(--text-main); margin: 0; }

.simulation-items { display: flex; flex-direction: column; gap: 14px; }
.simulation-item { display: flex; justify-content: space-between; align-items: center; }
.item-info { display: flex; align-items: center; gap: 12px; }
.item-icon {
  width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
}
.item-icon i { font-size: 14px; color: var(--text-inverse); }
.item-icon.pension { background-color: #3b82f6; }
.item-icon.health { background-color: var(--success); }
.item-icon.longterm { background-color: #8b5cf6; }
.item-icon.employment { background-color: var(--warning); }
.item-icon.industrial { background-color: var(--danger); }

.item-name { font-size: 13px; color: var(--text-sub); font-weight: 500; }
.item-amount { font-size: 14px; font-weight: 600; color: var(--text-main); }
.item-amount.company { color: var(--warning); }

.simulation-total {
  margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--border-focus);
  display: flex; justify-content: space-between; align-items: center;
}
.total-label { font-size: 14px; font-weight: 700; color: var(--text-sub); }
.total-amount { font-size: 18px; font-weight: 800; color: var(--primary); }

.simulation-note {
  margin-top: 16px; padding: 12px; background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--warning); font-weight: 500;
}
.simulation-note i { font-size: 16px; }

.net-pay-card { background-color: var(--primary-soft); border-top: 1px solid var(--border-color); padding: 24px; text-align: center;}
.net-pay-content { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.net-pay-label { font-size: 13px; color: var(--primary); font-weight: 700; }
.net-pay-amount { font-size: 28px; font-weight: 800; color: var(--primary);  letter-spacing: -0.5px;}

/* === 반응형 === */
@media (max-width: 1200px) {
  .content-grid { grid-template-columns: 1fr; }
  .simulation-section { position: static; }
}
@media (max-width: 768px) {
  .year-selector-card { flex-direction: column; align-items: flex-start; gap: 16px; }
  .rates-grid { grid-template-columns: 1fr; }
}
</style>
