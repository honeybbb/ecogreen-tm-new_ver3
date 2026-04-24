<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  employeeData: Object,
  siteOptions: Array,
  positionOptions: Array,
  wageItems: Array,
  employeeType: String,
  isEditing: Boolean,
  companyData: Object,
});

const emit = defineEmits(['close', 'save']);

// 내부 데이터
const contractData = ref({
  name: '',
  type: '',
  site: '',
  position: '',
  contractStartDt: '',
  contractEndDt: '',
  address: '',
  phone: '',
  wageInputs: {},
  workSchedule: null, // 통합 스케줄 필드
  // 비상연락망
  emergencyContact1: { name: '', relation: '', phone: '' },
  emergencyContact2: { name: '', relation: '', phone: '' }
});

// 요일 레이블 유틸리티
const dayLabels = {
  1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 0: '일'
};

watch(() => props.employeeData, (newData) => {
  if (newData) {
    contractData.value = {
      ...contractData.value,
      ...newData,
      contractStartDt: newData.contract?.contractStartDt || '',
      contractEndDt: newData.contract?.contractEndDt || ''
    };

    // 2. 임금(wageInputs) 동기화
    const incomingWages = newData.wageInputs || newData.contract?.contractData || {};
    contractData.value.wageInputs = { ...incomingWages };

    // 3. 근로시간 스케줄 동기화
    if (newData.workSchedule) {
      contractData.value.workSchedule = newData.workSchedule;
    }
  }
}, { immediate: true, deep: true });

const contractYear = computed(() => {
  if (contractData.value.contractStartDt) {
    return String(contractData.value.contractStartDt).slice(0, 4);
  }
  return String(new Date().getFullYear());
});

const todayDate = computed(() => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
});
/*
const totalWage = computed(() => {
  let sum = 0;
  for (const key in contractData.value.wageInputs) {
    sum += parseInt(contractData.value.wageInputs[key]) || 0;
  }
  return sum;
});
 */
// contractModal.vue
const totalWage = computed(() => {
  const includeCodes = ['04001001', '04001002','04001003','04001004','04001005','04001006']; // 합산할 코드만 명시
  return includeCodes.reduce((sum, code) => {
    return sum + (parseInt(contractData.value.wageInputs[code]) || 0);
  }, 0);
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
  if (type === '미화' || type === 'cleaning') return 'cleaning';
  if (type === '경비' || type === 'security') return 'security';
  return 'cleaning';
});

const isCleaning = computed(() => contractType.value === 'cleaning');
const isSecurity = computed(() => contractType.value === 'security');

// ─────────────────────────────────────────────
// PDF 저장
// ─────────────────────────────────────────────
const isExportingPdf = ref(false);

async function handleExportPdf() {
  isExportingPdf.value = true;
  try {
    const cd = contractData.value;
    const year = contractYear.value;
    const today = todayDate.value;
    const comp = props.companyData || {};

    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const dayKr = ['월', '화', '수', '목', '금', '토', '일'];
    const sched = cd.workSchedule || {};

    // ── 임금 테이블 헤더/행 생성 ──
    const wageHeaders = (props.wageItems || []).map(w => `<th>${w.itemNm}</th>`).join('') + '<th>합계</th>';
    const wageCells = (props.wageItems || []).map(w => {
      const v = parseInt(cd.wageInputs[w.itemCd]) || 0;
      return `<td>${v ? v.toLocaleString() : ''}</td>`;
    }).join('') + `<td class="total-cell">${totalWage.value.toLocaleString()}원</td>`;

    const headerHtml = dayKr.map(d => `<th>${d}</th>`).join('');
    const workRow = dayOrder.map(n => {
      const item = sched[n];
      return item?.isActive
          ? `<td>${item.startTime}<br>~ ${item.endTime}</td>`
          : `<td style="color:#94a3b8">휴무</td>`;
    }).join('');
    const breakRow = dayOrder.map(n => {
      const item = sched[n];
      return item?.isActive ? `<td>${item.breakTime}분</td>` : `<td>-</td>`;
    }).join('');

    const scheduleHtml = `
      <p>① 근로일 및 근로일별 근무시간</p>
      <table class="schedule-table">
        <thead><tr><th>구분</th>${headerHtml}</tr></thead>
        <tbody>
          <tr><td class="label-cell">근무시간</td>${workRow}</tr>
          <tr><td class="label-cell">휴게시간</td>${breakRow}</tr>
        </tbody>
      </table>
    `;

    const ec1 = cd.emergencyContact1;
    const ec2 = cd.emergencyContact2;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>근로계약서_${cd.name || '이름없음'}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif; font-size:10.5pt; line-height:1.75; color:#1e293b; background:#fff; }
  .doc-header { text-align:center; padding-bottom:14px; border-bottom:2.5px solid #2563eb; margin-bottom:18px; }
  .doc-title { font-size:22pt; font-weight:800; letter-spacing:8px; color:#1e293b; }
  .doc-addr { font-size:8.5pt; color:#64748b; margin-top:6px; line-height:1.5; }
  .intro { padding:12px 14px; border-left:4px solid #2563eb; background:#f8faff; border-radius:4px; margin-bottom:16px; line-height:1.9; }
  .intro strong { color:#2563eb; font-size:11.5pt; text-decoration:underline; }
  .section { margin-bottom:14px; padding:13px 14px; background:#f8faff; border-radius:6px; page-break-inside:avoid; }
  .section-title { font-size:11pt; font-weight:700; color:#1e293b; padding-bottom:7px; border-bottom:1px solid #cbd5e1; margin-bottom:10px; }
  .section-title::before { content:'▣ '; color:#2563eb; }
  p { margin:6px 0; line-height:1.75; }
  .note { font-size:9pt; color:#64748b; padding-left:10px; border-left:2px solid #93c5fd; margin:5px 0; }
  .highlight { color:#2563eb; font-weight:700; background:#dbeafe; padding:1px 5px; border-radius:3px; }
  .date-line { display:flex; align-items:center; gap:8px; margin:8px 0; font-size:10.5pt; }
  .date-box { border:1px solid #cbd5e1; border-radius:4px; padding:3px 8px; background:#fff; min-width:100px; }
  .wage-table { width:100%; border-collapse:collapse; margin:12px 0; font-size:9.5pt; }
  .wage-table thead { background:#2563eb; color:#fff; }
  .wage-table th, .wage-table td { padding:8px 6px; text-align:center; border:1px solid #cbd5e1; }
  .total-cell { font-weight:700; color:#2563eb; background:#dbeafe; font-size:10.5pt; }
  .clauses { margin-top:12px; padding:10px 12px; border-left:4px solid #f59e0b; background:#fffbeb; border-radius:4px; }
  .clauses p { font-size:9.5pt; margin:5px 0; }
  .schedule-box { margin:12px 0; padding:12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; page-break-inside:avoid; }
  .schedule-table { width:100%; border-collapse:collapse; margin:8px 0; font-size:8.5pt; }
  .schedule-table th, .schedule-table td { padding:7px 5px; border:1px solid #cbd5e1; text-align:center; }
  .schedule-table thead { background:#f1f5f9; }
  .label-cell { background:#f1f5f9; font-weight:600; }
  .emergency-box { margin-top:10px; padding:10px 12px; background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; }
  .emergency-row { display:flex; gap:16px; margin:5px 0; font-size:9.5pt; }
  .emergency-row span.lbl { font-weight:700; color:#d97706; min-width:28px; }
  .emergency-row span.val { border-bottom:1px solid #94a3b8; min-width:80px; }
  .sig-section { margin-top:24px; padding-top:16px; border-top:2.5px double #94a3b8; page-break-inside:avoid; }
  .sig-date { text-align:center; font-size:12pt; font-weight:700; margin-bottom:20px; }
  .sig-parties { display:flex; gap:16px; }
  .party { flex:1; padding:14px; border-radius:8px; border:2px solid #cbd5e1; }
  .party.employer { border-color:#2563eb; background:#eff6ff; }
  .party.employee { border-color:#f59e0b; background:#fffbeb; }
  .party-label { font-size:11pt; font-weight:700; padding-bottom:8px; border-bottom:1.5px solid #cbd5e1; margin-bottom:10px; }
  .party p { font-size:9.5pt; margin:5px 0; }
</style>
</head>
<body>
<div class="doc-header">
  <div class="doc-title">근 로 계 약 서 ${year}년</div>
  <div class="doc-addr">${comp.addr || ''}<br>TEL. ${comp.contact || ''} &nbsp; FAX. ${comp.fax || ''}</div>
</div>
<div class="intro">
  ${comp.companyNm || ''} 대표이사 <strong>${comp.ceoNm || ''}</strong>(이하 "갑"이라 칭함)과
  근로자 <strong>${cd.name || '___________'}</strong>(이하 "을"이라 칭함)간에
  취업규칙을 성실히 준수할 것을 서약하고 다음과 같이 근로계약을 체결한다.
</div>
<div class="section">
  <div class="section-title">제1조 (계약기간)</div>
  <p>본 계약은</p>
  <div class="date-line">
    <span class="date-box">${cd.contractStartDt || '　　　　　　'}</span>
    <span>~</span>
    <span class="date-box">${cd.contractEndDt || '　　　　　　'}</span>
    <span>까지로 한다.</span>
  </div>
  <p class="note">※ 기간제 및 단시간근로자 보호에 관한 법률 제4조1항에 의해 근로계약기간 중이라도 도급계약이 종료된 경우에는 본 근로계약은 종료된다.</p>
  <p class="note">※ 상기 계약기간 종료 시 "을"은 계약기간 만료로 자동퇴직 처리되며 "을"은 이를 충분히 숙지하고 계약 갱신 기대권을 주장할 수 없음을 동의 한다.</p>
</div>
<div class="section">
  <div class="section-title">제2조 (수습기간)</div>
  <p>"을"은 입사 후 최초 3개월간의 수습기간을 거쳐 직원으로 임용되면, 이와 관련한 사항은 취업규칙에 따른다.</p>
  <p class="note">(취업규칙위반 및 배치단지의 민원 등으로 교체 요구시 부당해고 등의 사유로 이의제기를 하지 않음에 동의함)</p>
</div>
<div class="section">
  <div class="section-title">제3조 (취업장소)</div>
  <p>"을"은 "갑"의 <span class="highlight">${siteName.value}</span> 소재에 취업해야 한다. 단, 업무형평상 "을"의 취업장소를 변경할 수 있다.</p>
</div>
<div class="section">
  <div class="section-title">제4조 (취업직종)</div>
  <p>"을"의 직무는 <span class="highlight">${isCleaning.value ? '미화직' : '경비직'}</span>, 직책(위)은 <span class="highlight">${positionName.value}</span>이며, 업무진행상 부득이한 사정이 있을 때에는 "을"의 직무 및 직책(위)을 변경 시킬 수 있다.</p>
</div>
<div class="section">
  <div class="section-title">제5조 (임금)</div>
  <p>"을"의 월 임금은 다음과 같이 적용한다.</p>
  <table class="wage-table"><thead><tr>${wageHeaders}</tr></thead><tbody><tr>${wageCells}</tr></tbody></table>
  <div class="clauses">
    <p>① 위 임금은 상기 근로조건에 따른 기본급과 제 법정수당이 합산된 산정임금으로서 "을"은 어떠한 경우라도 노동관계법령을 근거로 이의를 제기치 않는다. (상여금은 없음) 근로자가 연차를 사용시 수당은 미지급 된다.</p>
    <p>② 임금은 ${year}년 최저시급(시간당 10,030원) 기준으로 지급된다.</p>
    ${isSecurity.value ? '<p>③ 업무는 <strong>격일제 24시간 맞교대</strong>로 한다.</p>' : ''}
    <p>${isSecurity.value ? '④' : '③'} 매월 1일부터 해당월 말일까지 근무한 급여는 익월 5일 / 10일에 근로자의 지정 은행계좌로 지급한다.</p>
    <p>${isSecurity.value ? '⑤' : '④'} 퇴직금 정산은 계약 특성상 매월 지급 월급 기준으로 정산하되, 중간정산이 허용되지 않는다. (다만, 노동부장관이 인정하는 범위내에서는 근거서류 제출시 중간정산을 할 수 있다)</p>
    <p>${isSecurity.value ? '⑥' : '⑤'} 휴게시간은 업무에 지장을 주지 않는 범위 내에서 자유로이 이용할 수 있으며, 지정휴게장소에서 휴게를 취하며 본인 귀책사유에 의한 휴게시간 미사용은 청구할 수 없다.</p>
  </div>
</div>
<div class="section">
  <div class="section-title">제6조 (근로시간 및 휴일, 퇴직금)</div>
  <p>"을"은 시업. 종업. 휴게시간 명기된 사항 외에, 휴일 및 퇴직금 기타 등등 규정은 취업규칙에 준한다.</p>
  <div class="schedule-box">${scheduleHtml}</div>
</div>
<div class="section">
  <div class="section-title">제7조 (연차)</div>
  <p>"을"은 근로기준법에서 정하는 바에 따라 부여하고, 회사가 근무를 명한 경우에는 수당으로 지급한다. 다만 회사가 연차를 사용토록 요구함에도 불구하고 사용하지 아니하고 익년 연차 소멸될 때 이의를 제기치 않는다.</p>
  <p class="note">근로기준법 62조 (유급휴가의 대체) 사용자는 근무자 대표와의 서면 합의에 따라 제60조에 따라 연차 유급휴가일을 갈음하여 특정한 근로일에 근로자를 휴무시킬 수 있다.</p>
  <p class="note">(회사취업규칙) 제38조6항 (연차유급휴가) 관공서의 휴일에 관한 법률의 공휴일은 연차로 대체한다.</p>
</div>
<div class="section">
  <div class="section-title">제8조 (경조휴가)</div>
  <p>관공서 공휴일이 유급휴일로 편입됨에 따라 경조사 휴가는 부여하지 않기로 한다. [취업규칙 제 61조 ①항 및 ②항]</p>
</div>
<div class="section">
  <div class="section-title">제9조 (근로계약서 교부)</div>
  <p>"갑"은 근로계약서 체결과 동시에 본 계약서 사본을 "을"의 교부요구와 관계없이 "을"에게 교부함. (근로기준법 제17조 이행)</p>
</div>
<div class="section">
  <div class="section-title">제10조 (준용)</div>
  <p>기타 근로조건은 근로기준법에 위배되지 않는 한 "갑"이 정한 취업규칙 및 제 규정에 따르기로하고, 이외에 정함이 없는 사항에 대해서는 취업규칙 및 근로기준법에 따르기로 한다.</p>
</div>
<div class="section">
  <div class="section-title">제11조 (기타)</div>
  <p>이 계약에 정함이 없는 사항은 근로기준 법령에 의함.</p>
  <p>① 기간제로 고용된 사원은 별도의 통보가 없더라도 근로계약의 만료와 동시에 고용관계가 자동 종료된다.</p>
  <p>② 다만, 근무평정을 실시하여 60점이상인 경우에는 재 고용을 고려할 수 있다.</p>
  <p>③ 직계가족의 비상연락망을 공유하도록 한다.</p>
  <div class="emergency-box">
    <div class="emergency-row">
      <span class="lbl">성명:</span><span class="val">${ec1.name || ''}</span>
      <span class="lbl">관계:</span><span class="val">${ec1.relation || ''}</span>
      <span class="lbl">연락처:</span><span class="val">${ec1.phone || ''}</span>
    </div>
    <div class="emergency-row">
      <span class="lbl">성명:</span><span class="val">${ec2.name || ''}</span>
      <span class="lbl">관계:</span><span class="val">${ec2.relation || ''}</span>
      <span class="lbl">연락처:</span><span class="val">${ec2.phone || ''}</span>
    </div>
  </div>
</div>
<div class="sig-section">
  <div class="sig-date">${year}년 &nbsp; ${today.slice(5,7)}월 &nbsp; ${today.slice(8,10)}일</div>
  <div class="sig-parties">
    <div class="party employer">
      <div class="party-label">"갑" (사용자)</div>
      <p><strong>회사명:</strong> ${comp.companyNm || ''}</p>
      <p><strong>사업자번호:</strong> ${comp.businessNo || ''}</p>
      <p><strong>주소:</strong> ${comp.addr || ''}</p>
      <p><strong>대표이사:</strong> ${comp.ceoNm || ''} (인)</p>
    </div>
    <div class="party employee">
      <div class="party-label">"을" (근로자)</div>
      <p><strong>성명:</strong> ${cd.name || '___________'} (인)</p>
      <p><strong>주민등록번호:</strong> ___________</p>
      <p><strong>주소:</strong> ${cd.address || '____________________________'}</p>
      <p><strong>연락처:</strong> ${cd.phone || '____________________________'}</p>
    </div>
  </div>
</div>
<script>
  window.onload = function() {
    document.title = '근로계약서_${cd.name || '이름없음'}';
    setTimeout(function() { window.print(); }, 400);
  };
<\/script>
</body></html>`;

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      alert('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해 주세요.');
      return;
    }
    printWin.document.write(html);
    printWin.document.close();
  } catch (e) {
    console.error(e);
    alert('PDF 저장 중 오류가 발생했습니다.');
  } finally {
    isExportingPdf.value = false;
  }
}

const handleSave = () => {
  const extractedContractData = {
    wageInputs: contractData.value.wageInputs,
    contractStartDt: contractData.value.contractStartDt,
    contractEndDt: contractData.value.contractEndDt,
    workSchedule: contractData.value.workSchedule
  };
  emit('save', extractedContractData);
  emit('close');
};

const handleClose = () => emit('close');
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">

      <!-- ── 모달 헤더 ── -->
      <div class="modal-header">
        <h3 class="modal-title">
          <i class="mdi mdi-file-document"></i>
          근로계약서 {{ contractYear }}년
        </h3>
        <button @click="handleClose" class="modal-close">
          <i class="mdi mdi-close"></i>
        </button>
      </div>

      <!-- ── 모달 바디 ── -->
      <div class="modal-body">
        <div class="contract-document">

          <!-- 문서 헤더 -->
          <div class="contract-header">
            <h1 class="contract-title">근 로 계 약 서 {{ contractYear }}년</h1>
            <p class="company-info">
              {{ companyData?.addr }}<br/>
              TEL. {{ companyData?.contact }} &nbsp; FAX. {{ companyData?.fax }}
            </p>
          </div>

          <!-- 도입부 -->
          <p class="contract-intro">
            {{ companyData?.companyNm }} 대표이사 <strong>{{ companyData?.ceoNm }}</strong>(이하 "갑"이라 칭함)과
            근로자 <strong class="highlight-name">{{ contractData.name || '___________' }}</strong>
            (이하 "을"이라 칭함)간에 취업규칙을 성실히 준수할 것을 서약하고
            다음과 같이 근로계약을 체결한다.
          </p>

          <!-- 제1조 계약기간 -->
          <div class="contract-section">
            <h4 class="section-title">제1조 (계약기간)</h4>
            <div class="contract-content">
              <p>본 계약은</p>
              <div class="date-input-group">
                <input type="date" v-model="contractData.contractStartDt" class="date-input" />
                <span>~</span>
                <input type="date" v-model="contractData.contractEndDt" class="date-input" />
                <span>까지로 한다.</span>
              </div>
              <p class="note-text">※ 기간제 및 단시간근로자 보호에 관한 법률 제4조1항에 의해 근로계약기간 중이라도 도급계약이 종료된 경우에는 본 근로계약은 종료된다.</p>
              <p class="note-text">※ 상기 계약기간 종료 시 "을"은 계약기간 만료로 자동퇴직 처리되며 "을"은 이를 충분히 숙지하고 계약 갱신 기대권을 주장할 수 없음을 동의 한다.</p>
            </div>
          </div>

          <!-- 제2조 수습기간 -->
          <div class="contract-section">
            <h4 class="section-title">제2조 (수습기간)</h4>
            <div class="contract-content">
              <p>"을"은 입사 후 최초 3개월간의 수습기간을 거쳐 직원으로 임용되면, 이와 관련한 사항은 취업규칙에 따른다.</p>
              <p class="note-text">(취업규칙위반 및 배치단지의 민원 등으로 교체 요구시 부당해고 등의 사유로 이의제기를 하지 않음에 동의함)</p>
            </div>
          </div>

          <!-- 제3조 취업장소 -->
          <div class="contract-section">
            <h4 class="section-title">제3조 (취업장소)</h4>
            <div class="contract-content">
              <p>
                "을"은 "갑"의
                <select v-model="contractData.sIdx" class="inline-select" disabled>
                  <option value="">선택</option>
                  <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
                </select>
                <span v-if="isSecurity" class="highlight-text">경비현장</span>
                소재에 취업해야 한다. 단, 업무형평상 "을"의 취업장소를 변경할 수 있다.
              </p>
            </div>
          </div>

          <!-- 제4조 취업직종 -->
          <div class="contract-section">
            <h4 class="section-title">제4조 (취업직종)</h4>
            <div class="contract-content">
              <p>
                "을"의 직무는
                <span class="highlight-text">{{ isCleaning ? '미화직' : '경비직' }}</span>,
                직책(위)은
                <select v-model="contractData.position" class="inline-select" disabled>
                  <option value="">선택</option>
                  <option v-for="pos in positionOptions" :key="pos.itemCd" :value="pos.itemCd">{{ pos.itemNm }}</option>
                </select>
                이며, 업무진행상 부득이한 사정이 있을 때에는 "을"의 직무 및 직책(위)을 변경 시킬 수 있다.
              </p>
            </div>
          </div>

          <!-- 제5조 임금 -->
          <div class="contract-section">
            <h4 class="section-title">제5조 (임금)</h4>
            <div class="contract-content">
              <p>"을"의 월 임금은 다음과 같이 적용한다.</p>
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
                      <input type="number" class="wage-input" v-model="contractData.wageInputs[wage.itemCd]" />
                    </td>
                    <td class="total-cell">{{ totalWage.toLocaleString() }}원</td>
                  </tr>
                  </tbody>
                </table>
              </div>
              <div class="clauses">
                <p>① 위 임금은 상기 근로조건에 따른 기본급과 제 법정수당이 합산된 산정임금으로서 "을"은 어떠한 경우라도 노동관계법령을 근거로 이의를 제기치 않는다. (상여금은 없음) 근로자가 연차를 사용시 수당은 미지급 된다.</p>
                <p>② 임금은 {{ contractYear }}년 최저시급(시간당 10,030원) 기준으로 지급된다.</p>
                <p v-if="isSecurity">③ 업무는 <strong>격일제 24시간 맞교대</strong>로 한다.</p>
                <p>{{ isSecurity ? '④' : '③' }} 매월 1일부터 해당월 말일까지 근무한 급여는 익월 5일 / 10일에 근로자의 지정 은행계좌로 지급한다.</p>
                <p>{{ isSecurity ? '⑤' : '④' }} 퇴직금 정산은 계약 특성상 매월 지급 월급 기준으로 정산하되, 중간정산이 허용되지 않는다. (다만, 노동부장관이 인정하는 범위내에서는 근거서류 제출시 중간정산을 할 수 있다)</p>
                <p>{{ isSecurity ? '⑥' : '⑤' }} 휴게시간은 업무에 지장을 주지 않는 범위 내에서 자유로이 이용할 수 있으며, 지정휴게장소에서 휴게를 취하며 본인 귀책사유에 의한 휴게시간 미사용은 청구할 수 없다.</p>
              </div>
            </div>
          </div>

          <!-- 제6조 근로시간 -->
          <div class="contract-section">
            <h4 class="section-title">제6조 (근로시간 및 휴일, 퇴직금)</h4>
            <div class="contract-content">
              <p>"을"은 시업, 종업, 휴게시간 명기된 사항 외에 규정은 취업규칙에 준한다.</p>
              <div class="schedule-section">
                <p>① 근로일 및 근로일별 근무시간</p>
                <table class="schedule-table">
                  <thead>
                  <tr>
                    <th>구분</th>
                    <th v-for="n in [1,2,3,4,5,6,0]" :key="n">{{ dayLabels[n] }}</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr v-if="contractData.workSchedule">
                    <td class="label-cell">근무시간</td>
                    <td v-for="n in [1,2,3,4,5,6,0]" :key="n">
                      <template v-if="contractData.workSchedule[n]?.isActive">
                        <div class="time-display">
                          {{ contractData.workSchedule[n].startTime }}<br>~<br>{{ contractData.workSchedule[n].endTime }}
                        </div>
                      </template>
                      <template v-else><span class="off-day">휴무</span></template>
                    </td>
                  </tr>
                  <tr v-if="contractData.workSchedule">
                    <td class="label-cell">휴게시간</td>
                    <td v-for="n in [1,2,3,4,5,6,0]" :key="n">
                      <template v-if="contractData.workSchedule[n]?.isActive">
                        {{ contractData.workSchedule[n].breakTime }}분
                      </template>
                      <template v-else>-</template>
                    </td>
                  </tr>
                  <tr v-else>
                    <td colspan="8" class="empty-schedule">직책을 선택하면 스케줄이 자동으로 표시됩니다.</td>
                  </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 제7조 연차 -->
          <div class="contract-section">
            <h4 class="section-title">제7조 (연차)</h4>
            <div class="contract-content">
              <p>"을"은 근로기준법에서 정하는 바에 따라 부여하고, 회사가 근무를 명한 경우에는 수당으로 지급한다. 다만 회사가 연차를 사용토록 요구함에도 불구하고 사용하지 아니하고 익년 연차 소멸될 때 이의를 제기치 않는다.</p>
              <p class="note-text">근로기준법 62조 (유급휴가의 대체) 사용자는 근무자 대표와의 서면 합의에 따라 제60조에 따라 연차 유급휴가일을 갈음하여 특정한 근로일에 근로자를 휴무시킬 수 있다.</p>
              <p class="note-text">(회사취업규칙) 제38조6항 (연차유급휴가) 관공서의 휴일에 관한 법률의 공휴일은 연차로 대체한다.</p>
            </div>
          </div>

          <!-- 제8조 경조휴가 -->
          <div class="contract-section">
            <h4 class="section-title">제8조 (경조휴가)</h4>
            <div class="contract-content">
              <p>관공서 공휴일이 유급휴일로 편입됨에 따라 경조사 휴가는 부여하지 않기로 한다. [취업규칙 제 61조 ①항 및 ②항]</p>
            </div>
          </div>

          <!-- 제9조 근로계약서 교부 -->
          <div class="contract-section">
            <h4 class="section-title">제9조 (근로계약서 교부)</h4>
            <div class="contract-content">
              <p>"갑"은 근로계약서 체결과 동시에 본 계약서 사본을 "을"의 교부요구와 관계없이 "을"에게 교부함. (근로기준법 제17조 이행)</p>
            </div>
          </div>

          <!-- 제10조 준용 -->
          <div class="contract-section">
            <h4 class="section-title">제10조 (준용)</h4>
            <div class="contract-content">
              <p>기타 근로조건은 근로기준법에 위배되지 않는 한 "갑"이 정한 취업규칙 및 제 규정에 따르기로하고, 이외에 정함이 없는 사항에 대해서는 취업규칙 및 근로기준법에 따르기로 한다.</p>
            </div>
          </div>

          <!-- 제11조 기타 -->
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
                  <input type="text" v-model="contractData.emergencyContact1.name" />
                  <span>관계:</span>
                  <input type="text" v-model="contractData.emergencyContact1.relation" />
                  <span>연락처:</span>
                  <input type="tel" v-model="contractData.emergencyContact1.phone" />
                </div>
                <div class="contact-group">
                  <span>성명:</span>
                  <input type="text" v-model="contractData.emergencyContact2.name" />
                  <span>관계:</span>
                  <input type="text" v-model="contractData.emergencyContact2.relation" />
                  <span>연락처:</span>
                  <input type="tel" v-model="contractData.emergencyContact2.phone" />
                </div>
              </div>
            </div>
          </div>

          <!-- 서명란 -->
          <div class="signature-section">
            <p class="signature-date">{{ contractYear }}년 &nbsp; {{ todayDate.slice(5,7) }}월 &nbsp; {{ todayDate.slice(8,10) }}일</p>
            <div class="signature-parties">
              <div class="party employer">
                <p class="party-label">"갑" (사용자)</p>
                <p><strong>회사명:</strong> {{ companyData?.companyNm }}</p>
                <p><strong>사업자번호:</strong> {{ companyData?.businessNo }}</p>
                <p><strong>주소:</strong> {{ companyData?.addr }}</p>
                <p><strong>대표이사:</strong> {{ companyData?.ceoNm }} (인)</p>
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

      <!-- ── 모달 푸터 ── -->
      <div class="modal-footer">
        <div class="export-group">
          <button @click="handleExportPdf" class="btn-export btn-pdf" :disabled="isExportingPdf">
            <i class="mdi" :class="isExportingPdf ? 'mdi-loading mdi-spin' : 'mdi-file-pdf-box'"></i>
            {{ isExportingPdf ? 'PDF 준비 중...' : 'PDF 저장' }}
          </button>
        </div>
        <div class="action-group">
          <button @click="handleClose" class="btn-modal-cancel">
            <i class="mdi mdi-close"></i> 닫기
          </button>
          <button v-if="isEditing" @click="handleSave" class="btn-modal-save">
            <i class="mdi mdi-content-save"></i> 저장
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   모달 오버레이 & 컨테이너
══════════════════════════════════════════ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
}

.modal-container {
  background: var(--bg-surface);
  border-radius: 16px;
  width: 100%;
  max-width: 1100px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

/* ══════════════════════════════════════════
   헤더
══════════════════════════════════════════ */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
  border-radius: 16px 16px 0 0;
  flex-shrink: 0;
}
.modal-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.modal-title i { color: var(--primary); }

.modal-close {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--bg-canvas);
  border: none;
  color: var(--text-sub);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-close:hover { background: var(--border-color); color: var(--text-main); }
.modal-close i { font-size: 20px; }

/* ══════════════════════════════════════════
   바디 (스크롤)
══════════════════════════════════════════ */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-canvas);
}
.modal-body::-webkit-scrollbar { width: 6px; }
.modal-body::-webkit-scrollbar-track { background: transparent; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

/* ══════════════════════════════════════════
   계약서 문서 본문
══════════════════════════════════════════ */
.contract-document {
  background: var(--bg-surface);
  padding: 36px 40px;
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-main);
  border: 1px solid var(--border-color);
}

.contract-header {
  text-align: center;
  margin-bottom: 28px;
  padding-bottom: 18px;
  border-bottom: 2px solid var(--primary);
}
.contract-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 10px 0;
  letter-spacing: 6px;
}
.company-info { font-size: 11px; color: var(--text-sub); margin: 0; line-height: 1.6; }

.contract-intro {
  margin-bottom: 24px;
  padding: 14px 16px;
  background: var(--bg-canvas);
  border-left: 4px solid var(--primary);
  border-radius: 6px;
  line-height: 2;
}
.highlight-name { color: var(--primary); font-size: 15px; text-decoration: underline; font-weight: 700; }

/* ── 섹션 ── */
.contract-section {
  margin-bottom: 20px;
  padding: 14px 16px;
  background: var(--bg-canvas);
  border-radius: 8px;
}
.section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 10px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}
.section-title::before { content: '▣ '; color: var(--primary); }
.contract-content p { margin: 8px 0; line-height: 1.8; }
.note-text {
  font-size: 11.5px;
  color: var(--text-sub);
  padding-left: 10px;
  border-left: 2px solid var(--border-focus);
  margin: 6px 0 !important;
  line-height: 1.7;
}
.highlight-text {
  color: var(--primary);
  font-weight: 700;
  padding: 2px 6px;
  background: var(--primary-soft);
  border-radius: 4px;
}

/* ── 날짜 입력 ── */
.date-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
  flex-wrap: wrap;
}
.date-input,
.inline-select {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  transition: all 0.2s;
  background: var(--bg-surface);
  color: var(--text-main);
}
.date-input:focus,
.inline-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
.inline-select { min-width: 110px; }

/* ── 임금 테이블 ── */
.wage-table-wrapper {
  overflow-x: auto;
  margin: 14px 0;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.wage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: var(--bg-surface);
}
.wage-table thead { background: var(--primary); color: var(--text-inverse); }
.wage-table th,
.wage-table td { padding: 10px 8px; text-align: center; border: 1px solid var(--border-color); }
.total-header { background: var(--primary-hover) !important; }
.wage-input {
  width: 100%;
  max-width: 110px;
  padding: 5px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  text-align: right;
  font-size: 12px;
  background: var(--bg-surface);
  color: var(--text-main);
}
.total-cell { font-weight: 700; color: var(--primary); font-size: 13px; background: var(--primary-soft); }

/* ── 조항 문구 (clauses) ── */
.clauses {
  margin-top: 14px;
  padding: 12px 14px;
  background: rgba(245, 158, 11, 0.05);
  border-left: 4px solid var(--warning);
  border-radius: 6px;
  color: var(--text-main);
}
.clauses p { margin: 7px 0; font-size: 12px; line-height: 1.7; }

/* ── 근무시간 스케줄 ── */
.schedule-section {
  margin: 14px 0;
  padding: 14px;
  background: var(--bg-surface);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow-x: auto;
}
.schedule-table {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 12px;
  min-width: 420px;
}
.schedule-table th,
.schedule-table td { padding: 9px 6px; border: 1px solid var(--border-color); text-align: center; }
.schedule-table thead { background: var(--bg-canvas); color: var(--text-main); font-weight: 600; }
.label-cell { background: var(--bg-canvas); font-weight: 600; color: var(--text-main); white-space: nowrap; }
.time-display { font-size: 11px; line-height: 1.3; padding: 2px 0; }
.off-day { color: #94a3b8; font-size: 11px; }
.empty-schedule { padding: 20px; color: #999; text-align: center; font-size: 12px; }

/* ── 비상연락망 ── */
.emergency-contacts {
  margin-top: 12px;
  padding: 12px;
  background: rgba(245, 158, 11, 0.05);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid rgba(245, 158, 11, 0.2);
}
.contact-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.contact-group span {
  font-weight: 600;
  font-size: 12px;
  color: var(--warning);
  white-space: nowrap;
}
.contact-group input {
  padding: 5px 8px;
  border: 1px solid var(--border-focus);
  border-radius: 4px;
  font-size: 12px;
  flex: 1;
  min-width: 90px;
  background: var(--bg-surface);
  color: var(--text-main);
}

/* ── 서명란 ── */
.signature-section {
  margin-top: 36px;
  padding-top: 20px;
  border-top: 3px double var(--border-focus);
}
.signature-date {
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 28px;
}
.signature-parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.party {
  padding: 18px;
  border-radius: 10px;
  border: 2px solid var(--border-color);
  background: var(--bg-canvas);
}
.party.employer { border-color: var(--primary); background: var(--primary-soft); }
.party.employee { border-color: var(--warning); background: rgba(245, 158, 11, 0.05); }
.party-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 10px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--border-color);
}
.party p { margin: 7px 0; font-size: 12.5px; color: var(--text-main); }

/* ══════════════════════════════════════════
   푸터
══════════════════════════════════════════ */
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface);
  border-radius: 0 0 16px 16px;
  flex-shrink: 0;
}
.export-group { display: flex; gap: 8px; }
.action-group { display: flex; gap: 10px; }

.btn-export {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s;
}
.btn-export:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-pdf {
  background: #dc2626;
  color: #fff;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.25);
}
.btn-pdf:not(:disabled):hover {
  background: #b91c1c;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(220, 38, 38, 0.35);
}

.btn-modal-cancel,
.btn-modal-save {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-modal-cancel {
  background: var(--bg-canvas);
  border: 1px solid var(--border-color);
  color: var(--text-sub);
}
.btn-modal-cancel:hover { background: var(--border-color); color: var(--text-main); }
.btn-modal-save {
  background: var(--success);
  color: var(--text-inverse);
  box-shadow: var(--shadow-sm);
}
.btn-modal-save:hover { background: var(--success-hover); transform: translateY(-1px); }

/* ══════════════════════════════════════════
   반응형
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-container {
    max-height: 96vh;
    border-radius: 16px 16px 0 0;
    max-width: 100%;
  }

  .contract-document { padding: 20px 16px; font-size: 12px; }
  .contract-title { font-size: 18px; letter-spacing: 3px; }

  .date-input-group { flex-direction: column; align-items: flex-start; gap: 6px; }
  .date-input { width: 100%; }

  .wage-table-wrapper { font-size: 11px; }
  .wage-input { max-width: 80px; font-size: 11px; }

  .signature-parties { grid-template-columns: 1fr; gap: 12px; }

  .contact-group { flex-direction: column; align-items: flex-start; }
  .contact-group input { width: 100%; min-width: unset; }

  .modal-footer {
    flex-direction: column;
    align-items: stretch;
    padding: 12px 16px;
    gap: 8px;
  }
  .export-group,
  .action-group { justify-content: stretch; }
  .btn-export,
  .btn-modal-cancel,
  .btn-modal-save { justify-content: center; width: 100%; }
}

@media (max-width: 480px) {
  .modal-header { padding: 14px 16px; }
  .modal-title { font-size: 15px; }
  .modal-body { padding: 12px; }
  .contract-section { padding: 10px 12px; }
  .section-title { font-size: 13px; }
  .clauses p { font-size: 11px; }
  .note-text { font-size: 11px; }
  .schedule-table { font-size: 11px; }
}
</style>
