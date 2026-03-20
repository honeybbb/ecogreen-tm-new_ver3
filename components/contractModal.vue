<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  employeeData: Object,
  siteOptions: Array,
  positionOptions: Array,
  wageItems: Array,
  employeeType: String
});

const emit = defineEmits(['close', 'save']);

// 내부 데이터
const contractData = ref({
  name: '',
  type: '',
  site: '',
  position: '',
  joinDate: '',
  endDate: '',
  address: '',
  phone: '',
  wageInputs: {},
  // 미화 근로시간
  cleaningSchedule: {
    monday: { start: '09:00', end: '18:00', break: '12:00-13:00' },
    tuesday: { start: '09:00', end: '18:00', break: '12:00-13:00' },
    wednesday: { start: '09:00', end: '18:00', break: '12:00-13:00' },
    thursday: { start: '09:00', end: '18:00', break: '12:00-13:00' },
    friday: { start: '09:00', end: '18:00', break: '12:00-13:00' },
    saturday: { start: '09:00', end: '12:00', break: '' }
  },
  // 경비 근로시간
  securitySchedule: {
    workType: '24시간 격일제',
    startTime: '06:30',
    endTime: '익일 06:30',
    breakTotal: 10
  },
  // 비상연락망
  emergencyContact1: { name: '', relation: '', phone: '' },
  emergencyContact2: { name: '', relation: '', phone: '' }
});

watch(() => props.employeeData, (newData) => {
  if (newData) {
    contractData.value = { ...contractData.value, ...newData };
  }
}, { immediate: true, deep: true });

const contractYear = computed(() => {
  if (contractData.value.joinDate) {
    return String(contractData.value.joinDate).slice(0, 4);
  }
  return String(new Date().getFullYear());
});

const todayDate = computed(() => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
});

const totalWage = computed(() => {
  let sum = 0;
  for (const key in contractData.value.wageInputs) {
    sum += parseInt(contractData.value.wageInputs[key]) || 0;
  }
  return sum;
});

const siteName = computed(() => {
  const site = props.siteOptions?.find(s => s.idx === contractData.value.site);
  return site ? site.name : '________________';
});

const positionName = computed(() => {
  const pos = props.positionOptions?.find(p => p.itemCd === contractData.value.position);
  return pos ? pos.itemNm : '________________';
});

const contractType = computed(() => {
  const type = props.employeeType || contractData.value.type;
  if (type === '01001' || type === 'cleaning') return 'cleaning';
  if (type === '01002' || type === 'security') return 'security';
  return 'cleaning';
});

const isCleaning = computed(() => contractType.value === 'cleaning');
const isSecurity = computed(() => contractType.value === 'security');

const handleSave = () => {
  emit('save', contractData.value);
  emit('close');
};

const handleClose = () => {
  emit('close');
};
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h3 class="modal-title">
          <i class="mdi mdi-file-document"></i>
          근로계약서 {{ contractYear }}년
        </h3>
        <button @click="handleClose" class="modal-close">
          <i class="mdi mdi-close"></i>
        </button>
      </div>

      <div class="modal-body">
        <div class="contract-document">
          <div class="contract-header">
            <h1 class="contract-title">근 로 계 약 서 {{ contractYear }}년</h1>
            <p class="company-info">
              서울시 강서구 공항대로 325 에이스빌딩 7층<br/>
              TEL. 02)355-3322 &nbsp; FAX. 02)355-3318
            </p>
          </div>

          <p class="contract-intro">
            ㈜에코그린티엠 대표이사 <strong>백송이</strong>(이하 "갑"이라 칭함)과
            근로자 <strong class="highlight-name">{{ contractData.name || '___________' }}</strong>
            (이하 "을"이라 칭함)간에 취업규칙을 성실히 준수할 것을 서약하고
            다음과 같이 근로계약을 체결한다.
          </p>

          <div class="contract-section">
            <h4 class="section-title">제1조 (계약기간)</h4>
            <div class="contract-content">
              <p>본 계약은</p>
              <div class="date-input-group">
                <input type="date" v-model="contractData.joinDate" class="date-input" />
                <span>~</span>
                <input type="date" v-model="contractData.endDate" class="date-input" />
                <span>까지로 한다.</span>
              </div>
              <p class="note-text">
                ※ 기간제 및 단시간근로자 보호에 관한 법률 제4조1항에 의해 근로계약기간 중이라도
                도급계약이 종료된 경우에는 본 근로계약은 종료된다.
              </p>
              <p class="note-text">
                ※ 상기 계약기간 종료 시 "을"은 계약기간 만료로 자동퇴직 처리되며
                "을"은 이를 충분히 숙지하고 계약 갱신 기대권을 주장할 수 없음을 동의 한다.
              </p>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제2조 (수습기간)</h4>
            <div class="contract-content">
              <p>
                "을"은 입사 후 최초 3개월간의 수습기간을 거쳐 직원으로 임용되면,
                이와 관련한 사항은 취업규칙에 따른다.
              </p>
              <p class="note-text">
                (취업규칙위반 및 배치단지의 민원 등으로 교체 요구시 부당해고 등의 사유로
                이의제기를 하지 않음에 동의함)
              </p>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제3조 (취업장소)</h4>
            <div class="contract-content">
              <p>
                "을"은 "갑"의
                <select v-model="contractData.site" class="inline-select">
                  <option value="">선택</option>
                  <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
                    {{ site.name }}
                  </option>
                </select>
                <span v-if="isSecurity" class="highlight-text">경비현장</span>
                소재에 취업해야 한다.
                단, 업무형평상 "을"의 취업장소를 변경할 수 있다.
              </p>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제4조 (취업직종)</h4>
            <div class="contract-content">
              <p>
                "을"의 직무는
                <span class="highlight-text">{{ isCleaning ? '미화직' : '경비직' }}</span>,
                직책(위)은
                <select v-model="contractData.position" class="inline-select">
                  <option value="">선택</option>
                  <option v-for="pos in positionOptions" :key="pos.itemCd" :value="pos.itemCd">
                    {{ pos.itemNm }}
                  </option>
                </select>
                이며, 업무진행상 부득이한 사정이 있을 때에는 "을"의 직무 및
                직책(위)을 변경 시킬 수 있다.
              </p>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제5조 (임금)</h4>
            <div class="contract-content">
              <p>"을"의 월 임급은 다음과 같이 적용한다.</p>

              <div class="wage-table-wrapper">
                <table class="wage-table">
                  <thead>
                  <tr>
                    <th v-for="wage in wageItems" :key="wage.itemCd">{{ wage.itemNm }}</th>
                    <th class="total-header">합계</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr>
                    <td v-for="wage in wageItems" :key="wage.itemCd">
                      <input
                          type="number"
                          class="wage-input"
                          v-model="contractData.wageInputs[wage.itemCd]"
                          :placeholder="wage.itemNm.includes('기본급') ? (isCleaning ? '1000000' : '2500000') :
                                       wage.itemNm.includes('직책') ? (isCleaning ? '50000' : '100000') : '0'"
                      />
                    </td>
                    <td class="total-cell">{{ totalWage.toLocaleString() }}원</td>
                  </tr>
                  </tbody>
                </table>
              </div>

              <div class="clauses">
                <p>
                  ① 위 임금은 상기 근로조건에 따른 기본급과 제 법정수당이 합산된 산정임금으로서
                  "을"은 어떠한 경우라도 노동관계법령을 근거로 이의를 제기치 않는다.
                  (상여금은 없음) 근로자가 연차를 사용시 수당은 미지급 된다.
                </p>
                <p>② 임금은 {{ contractYear }}년 최저시급(시간당 10,030원) 기준으로 지급된다.</p>
                <p v-if="isSecurity">③ 업무는 <strong>격일제 24시간 맞교대</strong>로 한다.</p>
                <p>{{ isSecurity ? '④' : '③' }} 매월 1일부터 해당월 말일까지 근무한 급여는 익월 5일 / 10일에 근로자의 지정 은행계좌로 지급한다.</p>
                <p>
                  {{ isSecurity ? '⑤' : '④' }} 퇴직금 정산은 계약 특성상 매월 지급 월급 기준으로 정산하되,
                  중간정산이 허용되지 않는다. (다만, 노동부장관이 인정하는 범위내에서는 근거서류 제출시 중간정산을 할 수 있다)
                </p>
                <p>
                  {{ isSecurity ? '⑥' : '⑤' }} 휴게시간은 업무에 지장을 주지 않는 범위 내에서 자유로이 이용할 수 있으며,
                  지정휴게장소에서 휴게를 취하며 본인 귀책사유에 의한 휴게시간 미사용은 청구할 수 없다.
                </p>
              </div>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제6조 (근로시간 및 휴일, 퇴직금)</h4>
            <div class="contract-content">
              <p>
                "을"은 시업. 종업. 휴게시간 명기된 사항 외에, 휴일 및 퇴직금 기타 등등 규정은
                취업규칙에 준한다.
              </p>

              <div v-if="isCleaning" class="schedule-section">
                <p>① 근로일 및 근로일별 근무시간</p>
                <table class="schedule-table">
                  <thead>
                  <tr>
                    <th>구분</th>
                    <th>월</th>
                    <th>화</th>
                    <th>수</th>
                    <th>목</th>
                    <th>금</th>
                    <th>토</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr>
                    <td class="label-cell">근무시간</td>
                    <td v-for="day in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']" :key="day">
                      <input
                          type="time"
                          v-model="contractData.cleaningSchedule[day].start"
                          class="time-input"
                      />
                      ~
                      <input
                          type="time"
                          v-model="contractData.cleaningSchedule[day].end"
                          class="time-input"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td class="label-cell">휴게시간</td>
                    <td v-for="day in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']" :key="day">
                      <input
                          type="text"
                          v-model="contractData.cleaningSchedule[day].break"
                          class="break-input"
                          placeholder="12:00-13:00"
                      />
                    </td>
                  </tr>
                  </tbody>
                </table>
                <p class="calc-formula">
                  <strong>급여계산:</strong> (일근로시간 7.5시간×6일+토요일3시간)÷7×365÷12 = 208.572시간 × 10,030원
                </p>
              </div>

              <div v-if="isSecurity" class="schedule-section">
                <p>① 격일제 근로자 24시간 근무시 익일 24시간 휴무를 부여한다.</p>
                <table class="schedule-table">
                  <thead>
                  <tr>
                    <th style="width: 40%;">근무형태</th>
                    <th style="width: 60%;">근무시간</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr>
                    <td>
                      <input
                          type="text"
                          v-model="contractData.securitySchedule.workType"
                          class="text-input"
                          placeholder="24시간 격일제"
                      />
                    </td>
                    <td>
                      <input
                          type="time"
                          v-model="contractData.securitySchedule.startTime"
                          class="time-input"
                      />
                      ~
                      <input
                          type="text"
                          v-model="contractData.securitySchedule.endTime"
                          class="text-input short"
                          placeholder="익일 06:30"
                      />
                    </td>
                  </tr>
                  </tbody>
                </table>
                <div class="calc-formula">
                  <p>
                    <strong>월근로시간:</strong> (24시간-<input type="number" v-model.number="contractData.securitySchedule.breakTotal" class="num-input" />시간)
                    × 365일 ÷ 12개월 ÷ 2(격일제) = 212.917시간 × 10,030원
                  </p>
                  <p>
                    <strong>야간수당:</strong> (8시간-6시간) × 365일 ÷ 12개월 ÷ 2(격일제) × 0.5 = 15.208시간 × 10,030원
                  </p>
                  <p class="note-text">※ 휴게시간은 총 시간을 유지하며, 시간대별로 일부 조정될 수 있다.</p>
                </div>
              </div>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제7조 (연차)</h4>
            <div class="contract-content">
              <p>
                "을"은 근로기준법에서 정하는 바에 따라 부여하고, 회사가 근무를 명한 경우에는 수당으로 지급한다.
                다만 회사가 연차를 사용토록 요구함에도 불구하고 사용하지 아니하고 익년 연차 소멸될 때 이의를 제기치 않는다.
              </p>
              <p class="note-text">
                근로기준법 62조 (유급휴가의 대체) 사용자는 근무자 대표와의 서면 합의에 따라
                제60조에 따라 연차 유급휴가일을 갈음하여 특정한 근로일에 근로자를 휴무시킬 수 있다.
              </p>
              <p class="note-text">
                (회사취업규칙) 제38조6항 (연차유급휴가) 관공서의 휴일에 관한 법률의 공휴일은 연차로 대체한다.
              </p>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제8조 (경조휴가)</h4>
            <div class="contract-content">
              <p>
                관공서 공휴일이 유급휴일로 편입됨에 따라 경조사 휴가는 부여하지 않기로 한다.
                [취업규칙 제 61조 ①항 및 ②항]
              </p>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제9조 (근로계약서 교부)</h4>
            <div class="contract-content">
              <p>
                "갑"은 근로계약서 체결과 동시에 본 계약서 사본을 "을"의 교부요구와 관계없이
                "을"에게 교부함. (근로기준법 제17조 이행)
              </p>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제10조 (준용)</h4>
            <div class="contract-content">
              <p>
                기타 근로조건은 근로기준법에 위배되지 않는 한 "갑"이 정한 취업규칙 및 제 규정에 따르기로하고,
                이외에 정함이 없는 사항에 대해서는 취업규칙 및 근로기준법에 따르기로 한다.
              </p>
            </div>
          </div>

          <div class="contract-section">
            <h4 class="section-title">제11조 (기타)</h4>
            <div class="contract-content">
              <p>이 계약에 정함이 없는 사항은 근로기준 법령에 의함.</p>
              <p>① 기간제로 고용된 사원은 별도의 통보가 없더라도 근로계약의 만료와 동시에 고용관계가 자동 종료된다.</p>
              <p>② 다만, 근무평정을 실시하여 60점이상인 경우에는 재 고용을 고려할 수 있다.</p>
              <p>③ 직계가족의 비상연락망을 공유하도록 한다.</p>

              <div class="emergency-contacts">
                <div class="contact-group">
                  <span>성명:</span>
                  <input type="text" v-model="contractData.emergencyContact1.name" placeholder="홍길동" />
                  <span>관계:</span>
                  <input type="text" v-model="contractData.emergencyContact1.relation" placeholder="부" />
                  <span>연락처:</span>
                  <input type="tel" v-model="contractData.emergencyContact1.phone" placeholder="010-0000-0000" />
                </div>
                <div class="contact-group">
                  <span>성명:</span>
                  <input type="text" v-model="contractData.emergencyContact2.name" placeholder="김영희" />
                  <span>관계:</span>
                  <input type="text" v-model="contractData.emergencyContact2.relation" placeholder="모" />
                  <span>연락처:</span>
                  <input type="tel" v-model="contractData.emergencyContact2.phone" placeholder="010-0000-0000" />
                </div>
              </div>
            </div>
          </div>

          <div class="signature-section">
            <p class="signature-date">{{ contractYear }}년  {{ todayDate.slice(5,7) }}월  {{ todayDate.slice(8,10) }}일</p>

            <div class="signature-parties">
              <div class="party employer">
                <p class="party-label">"갑" (사용자)</p>
                <p><strong>회사명:</strong> ㈜에코그린티엠</p>
                <p><strong>사업자번호:</strong> 219-87-00216</p>
                <p><strong>주소:</strong> 서울시 강서구 공항대로 325 에이스빌딩 7층</p>
                <p><strong>대표이사:</strong> 백송이 (인)</p>
              </div>

              <div class="party employee">
                <p class="party-label">"을" (근로자)</p>
                <p><strong>성명:</strong> {{ contractData.name || '___________' }} (인)</p>
                <p><strong>주민등록번호:</strong> ___________</p>
                <p><strong>주소:</strong> {{ contractData.address || '____________________________' }}</p>
                <p><strong>연락처:</strong> {{ contractData.phone || '____________________________' }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button @click="handleClose" class="btn-modal-cancel">
          <i class="mdi mdi-close"></i>
          닫기
        </button>
        <button @click="handleSave" class="btn-modal-save">
          <i class="mdi mdi-content-save"></i>
          저장
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 모달 기본 (공통 테마 변수 활용) */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px;
}

.modal-container {
  background: var(--bg-surface); border-radius: 16px; width: 100%; max-width: 1100px;
  max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

/* 헤더 */
.modal-header {
  display: flex; justify-content: space-between; align-items: center; padding: 20px 28px;
  border-bottom: 1px solid var(--border-color); background: var(--bg-surface); border-radius: 16px 16px 0 0;
}
.modal-title { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px; }
.modal-title i { color: var(--primary); }

.modal-close {
  width: 36px; height: 36px; border-radius: 8px; background: var(--bg-canvas); border: none;
  color: var(--text-sub); cursor: pointer; transition: all 0.2s;
}
.modal-close:hover { background: var(--border-color); color: var(--text-main); }
.modal-close i { font-size: 20px; }

/* 바디 */
.modal-body { flex: 1; overflow-y: auto; padding: 24px; background: var(--bg-canvas); }
.modal-body::-webkit-scrollbar { width: 8px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

/* 계약서 문서 본문 */
.contract-document {
  background: var(--bg-surface); padding: 40px; border-radius: 12px;
  box-shadow: var(--shadow-sm); font-size: 13px; line-height: 1.8; color: var(--text-main);
  border: 1px solid var(--border-color);
}

.contract-header {
  text-align: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid var(--primary);
}
.contract-title { font-size: 28px; font-weight: 700; color: var(--text-main); margin: 0 0 12px 0; letter-spacing: 6px; }
.company-info { font-size: 11px; color: var(--text-sub); margin: 0; line-height: 1.6; }

.contract-intro {
  margin-bottom: 28px; padding: 16px; background: var(--bg-canvas);
  border-left: 4px solid var(--primary); border-radius: 6px; line-height: 2;
}
.highlight-name { color: var(--primary); font-size: 16px; text-decoration: underline; }

/* 섹션 */
.contract-section { margin-bottom: 24px; padding: 16px; background: var(--bg-canvas); border-radius: 8px; }
.section-title { font-size: 15px; font-weight: 700; color: var(--text-main); margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
.section-title::before { content: '▣'; color: var(--primary); margin-right: 6px; }
.contract-content p { margin: 10px 0; line-height: 1.8; }
.note-text { font-size: 12px; color: var(--text-sub); padding-left: 12px; border-left: 2px solid var(--border-focus); margin: 8px 0 !important; }
.highlight-text { color: var(--primary); font-weight: 700; padding: 2px 6px; background: var(--primary-soft); border-radius: 4px; }

/* 입력 필드 */
.date-input-group { display: flex; align-items: center; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.date-input, .inline-select, .time-input, .text-input, .break-input, .num-input {
  padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 13px; transition: all 0.2s; background: var(--bg-surface); color: var(--text-main);
}
.date-input:focus, .inline-select:focus, .time-input:focus, .text-input:focus, .break-input:focus, .num-input:focus {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft);
}
.inline-select { min-width: 120px; }

/* 급여 테이블 */
.wage-table-wrapper { overflow-x: auto; margin: 16px 0; border-radius: 8px; border: 1px solid var(--border-color); }
.wage-table { width: 100%; border-collapse: collapse; font-size: 12px; background: var(--bg-surface); }
.wage-table thead { background: var(--primary); color: var(--text-inverse); }
.wage-table th, .wage-table td { padding: 12px 10px; text-align: center; border: 1px solid var(--border-color); }
.total-header { background: var(--primary-hover) !important; }

.wage-input {
  width: 100%; max-width: 100px; padding: 6px; border: 1px solid var(--border-color);
  border-radius: 4px; text-align: right; font-size: 12px; background: var(--bg-surface); color: var(--text-main);
}
.total-cell { font-weight: 700; color: var(--primary); font-size: 14px; background: var(--primary-soft); }

.clauses {
  margin-top: 16px; padding: 12px; background: rgba(245, 158, 11, 0.05);
  border-left: 4px solid var(--warning); border-radius: 6px; color: var(--text-main);
}
.clauses p { margin: 8px 0; font-size: 12px; }

/* 근무시간표 */
.schedule-section { margin: 16px 0; padding: 16px; background: var(--bg-surface); border-radius: 8px; border: 1px solid var(--border-color); }
.schedule-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
.schedule-table th, .schedule-table td { padding: 10px 8px; border: 1px solid var(--border-color); text-align: center; }
.schedule-table thead { background: var(--bg-canvas); color: var(--text-main); }
.label-cell { background: var(--bg-canvas); font-weight: 600; color: var(--text-main); }

.time-input { width: 70px; padding: 4px; font-size: 11px; }
.break-input { width: 90%; padding: 4px; font-size: 11px; }
.text-input { width: 90%; padding: 6px; }
.text-input.short { width: 100px; }
.num-input { width: 50px; padding: 4px 6px; text-align: center; }

.calc-formula {
  margin-top: 12px; padding: 10px; background: rgba(16, 185, 129, 0.05);
  border-left: 3px solid var(--success); border-radius: 6px; font-size: 12px; color: var(--success-hover);
}
.calc-formula p { margin: 6px 0; }

/* 비상연락망 */
.emergency-contacts {
  margin-top: 12px; padding: 12px; background: rgba(245, 158, 11, 0.05);
  border-radius: 6px; display: flex; flex-direction: column; gap: 10px; border: 1px solid rgba(245, 158, 11, 0.2);
}
.contact-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.contact-group span { font-weight: 600; font-size: 12px; color: var(--warning); }
.contact-group input { padding: 4px 8px; border: 1px solid var(--border-focus); border-radius: 4px; font-size: 12px; flex: 1; min-width: 100px; background: var(--bg-surface); color: var(--text-main); }

/* 서명란 */
.signature-section { margin-top: 40px; padding-top: 24px; border-top: 3px double var(--border-focus); }
.signature-date { text-align: center; font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 32px; }
.signature-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

.party { padding: 20px; border-radius: 10px; border: 2px solid var(--border-color); background: var(--bg-canvas); }
.party.employer { border-color: var(--primary); background: var(--primary-soft); }
.party.employee { border-color: var(--warning); background: rgba(245, 158, 11, 0.05); }
.party-label { font-size: 15px; font-weight: 700; color: var(--text-main); margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid var(--border-color); }
.party p { margin: 8px 0; font-size: 13px; color: var(--text-main); }

/* 푸터 */
.modal-footer {
  display: flex; justify-content: flex-end; gap: 12px; padding: 16px 28px;
  border-top: 1px solid var(--border-color); background: var(--bg-surface); border-radius: 0 0 16px 16px;
}
.btn-modal-cancel, .btn-modal-save {
  display: flex; align-items: center; gap: 8px; padding: 10px 20px; border: none;
  border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s;
}
.btn-modal-cancel { background: var(--bg-canvas); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-modal-cancel:hover { background: var(--border-color); color: var(--text-main); }
.btn-modal-save { background: var(--success); color: var(--text-inverse); box-shadow: var(--shadow-sm); }
.btn-modal-save:hover { transform: translateY(-2px); background: var(--success-hover); box-shadow: var(--shadow-md); }

/* 반응형 */
@media (max-width: 768px) {
  .contract-document { padding: 24px; }
  .signature-parties { grid-template-columns: 1fr; }
  .schedule-table { font-size: 10px; }
  .time-input { width: 60px; }
}
</style>
