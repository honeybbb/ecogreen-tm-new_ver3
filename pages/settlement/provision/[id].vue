<script setup>
/**
 * 연차·퇴직금 추계 상세 페이지  (현장별)
 * - URL: /accrual/:siteIdx
 * - 미화/경비 직종 탭
 * - 연차추계 / 퇴직금추계 섹션 탭
 * - 직원 추가 / 수정 / 삭제
 * - 엑셀 출력 (현장 단독 or 전체 현장)
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();
const route  = useRoute();

// ─── UI 상태 ───────────────────────────────────
const activeType    = ref('미화');   // 미화 | 경비
const activeSection = ref('annual'); // annual | retire
const isLoading     = ref(false);
const isExporting   = ref(false);
const isModalOpen   = ref(false);
const editingRow    = ref(null);
const modalMode     = ref('annual');

// ─── 현장 목록 (상단 전환용) ────────────────────
const siteList    = ref([]);
const currentSite = ref({ idx: null, siteName: '', siteType: '', status: '' });

// ─── 기준 정보 ─────────────────────────────────
const baseInfo = ref({
  baseDate: '2025.12.31', writeDate: '', workhourMonth: 169.5, workhourDay: 6,
});

// ─── 추계 데이터 ────────────────────────────────
const annualRows = ref({ 미화: [], 경비: [] });
const retireRows = ref({ 미화: [], 경비: [] });

// ─── 샘플/목업 데이터 ────────────────────────────
const SAMPLE = {
  미화: {
    annual: [
      { no:1,  name:'송정숙', position:'반장',     joinDate:'2019-01-14', midSettleDate:'22.11.28', calcPeriod:'22.11.29~25.11.28', basis:'2,232,560/221.07*8*45개', amount:3625270, note:'4,5,6년차/50개 중 5개사용', basicWage:2232560, allowance:0, usedCount:5,  usedDates:'2024-04/05,06/11,12,13,14' },
      { no:2,  name:'이정순', position:'미화',     joinDate:'2020-05-18', midSettleDate:'23.05.17', calcPeriod:'23.05.18~25.05.17', basis:'1,709,290/169.5*6*32개', amount:1936190, note:'4,5년차/33개 중 1개사용', basicWage:1709290, allowance:0, usedCount:1,  usedDates:'2024-08-23' },
      { no:3,  name:'강태길', position:'미화',     joinDate:'2023-12-01', midSettleDate:'',         calcPeriod:'23.12.01~25.11.31', basis:'1,709,290/169.5*6*37개', amount:2238720, note:'1,2년차/41개 중 4개사용', basicWage:1709290, allowance:0, usedCount:4,  usedDates:'2024-01/05,05/23,09/03,10/16' },
      { no:4,  name:'이재호', position:'미화',     joinDate:'2021-08-11', midSettleDate:'23.08.10', calcPeriod:'23.08.11~25.08.09', basis:'1,709,290/169.5*6*32개', amount:1936190, note:'3,4년차/32개 중 0개사용', basicWage:1709290, allowance:0, usedCount:0,  usedDates:'' },
      { no:5,  name:'윤남이', position:'미화',     joinDate:'2022-01-13', midSettleDate:'23.01.12', calcPeriod:'23.01.13~25.01.12', basis:'1,709,290/169.5*6*30개', amount:1815180, note:'2,3년차/31개 중 1개사용', basicWage:1709290, allowance:0, usedCount:1,  usedDates:'2024-06-07' },
      { no:6,  name:'김만옥', position:'미화',     joinDate:'2022-07-02', midSettleDate:'23.07.01', calcPeriod:'23.07.02~25.07.01', basis:'1,709,290/169.5*6*31개', amount:1875690, note:'2,3년차/31개 중 0개사용', basicWage:1709290, allowance:0, usedCount:0,  usedDates:'' },
      { no:7,  name:'박귀이', position:'미화',     joinDate:'2023-06-02', midSettleDate:'',         calcPeriod:'23.06.02~25.06.01', basis:'1,709,290/169.5*6*32개', amount:1936190, note:'1,2년차/41개 중 9개사용', basicWage:1709290, allowance:0, usedCount:9,  usedDates:'2023-07/21,10/26,11/29 / 2024-02/28' },
      { no:8,  name:'안동순', position:'미화',     joinDate:'2024-06-24', midSettleDate:'',         calcPeriod:'24.06.24~25.06.23', basis:'1,709,290/169.5*6*24개', amount:1452150, note:'1년차/26개 중 2개사용',   basicWage:1709290, allowance:0, usedCount:2,  usedDates:'2024-08/13,10/17' },
      { no:9,  name:'정경자', position:'미화',     joinDate:'2024-08-26', midSettleDate:'',         calcPeriod:'24.08.26~25.08.25', basis:'1,709,290/169.5*6*25개', amount:1512650, note:'1년차/26개 중 1개사용',   basicWage:1709290, allowance:0, usedCount:1,  usedDates:'2024-10-18' },
      { no:10, name:'이종임', position:'미화',     joinDate:'2024-08-01', midSettleDate:'',         calcPeriod:'24.08.01~25.07.31', basis:'1,709,290/169.5*6*26개', amount:1573160, note:'1년차/26개 중 0개사용',   basicWage:1709290, allowance:0, usedCount:0,  usedDates:'' },
      { no:11, name:'송호섭', position:'외곽',     joinDate:'2023-01-11', midSettleDate:'',         calcPeriod:'23.01.11~25.01.10', basis:'1,709,290/169.5*6*28개', amount:1694170, note:'1,2년차/41개 중 13개사용',basicWage:1709290, allowance:0, usedCount:13, usedDates:'2023-03/21,05/30... / 2024-03/07' },
      { no:12, name:'한동수', position:'외곽',     joinDate:'2023-04-12', midSettleDate:'',         calcPeriod:'23.04.12~25.04.11', basis:'1,709,290/169.5*6*30개', amount:1815180, note:'1,2년차/41개 중 11개사용',basicWage:1709290, allowance:0, usedCount:11, usedDates:'2023-06/30,08/10... / 2024-01/12' },
      { no:13, name:'임종선', position:'외곽',     joinDate:'2022-07-11', midSettleDate:'23.07.10', calcPeriod:'23.07.11~25.07.10', basis:'1,709,290/169.5*6*31개', amount:1875690, note:'2,3년차/31개 중 0개사용', basicWage:1709290, allowance:0, usedCount:0,  usedDates:'' },
      { no:14, name:'김현호', position:'주차장',   joinDate:'2023-01-17', midSettleDate:'',         calcPeriod:'23.01.17~25.01.18', basis:'1,709,290/169.5*6*28개', amount:1694170, note:'1,2년차/41개 중 13개사용',basicWage:1709290, allowance:0, usedCount:13, usedDates:'2023-04/25...' },
      { no:15, name:'이영식', position:'커뮤니티', joinDate:'2023-05-09', midSettleDate:'',         calcPeriod:'23.05.09~25.05.08', basis:'1,709,290/169.5*6*39개', amount:2359730, note:'1,2년차/41개 중 2개사용',  basicWage:1709290, allowance:0, usedCount:2,  usedDates:'2024-01/09, 05/30' },
    ],
    retire: [
      { no:1,  name:'송정숙', position:'반장',     joinDate:'2019-01-14', midSettleDate:'', calcPeriod:'19.01.14~25.12.31', basis:'(2,232,560/221.07*8)*30*days/365', amount:19500000, note:'평균임금', basicWage:2232560, allowance:0, total:2232560 },
      { no:2,  name:'이정순', position:'미화',     joinDate:'2020-05-18', midSettleDate:'', calcPeriod:'20.05.18~25.12.31', basis:'(1,709,290/169.5*6)*30*days/365',  amount:14200000, note:'', basicWage:1709290, allowance:0, total:1709290 },
      { no:3,  name:'강태길', position:'미화',     joinDate:'2023-12-01', midSettleDate:'', calcPeriod:'23.12.01~25.12.31', basis:'(1,709,290/169.5*6)*30*days/365',  amount:3800000,  note:'', basicWage:1709290, allowance:0, total:1709290 },
      { no:4,  name:'이재호', position:'미화',     joinDate:'2021-08-11', midSettleDate:'', calcPeriod:'21.08.11~25.12.31', basis:'(1,709,290/169.5*6)*30*days/365',  amount:9200000,  note:'', basicWage:1709290, allowance:0, total:1709290 },
      { no:5,  name:'윤남이', position:'미화',     joinDate:'2022-01-13', midSettleDate:'', calcPeriod:'22.01.13~25.12.31', basis:'(1,709,290/169.5*6)*30*days/365',  amount:8600000,  note:'', basicWage:1709290, allowance:0, total:1709290 },
    ],
  },
  경비: {
    annual: [
      { no:1, name:'차정환', position:'일근팀장', joinDate:'2021-05-06', midSettleDate:'23.05.05', calcPeriod:'23.05.06~25.05.05', basis:'2,915,740/250.938*8.25*32개', amount:3067520, note:'3,4년차/32개 중 0개사용', basicWage:2815740, allowance:100000, workersDayAllowance:0,    totalWage:2915740, usedCount:0, usedDates:'' },
      { no:2, name:'최낙현', position:'A반장',    joinDate:'2021-05-06', midSettleDate:'23.05.05', calcPeriod:'23.05.06~25.05.05', basis:'2,822,720/250.938*8.25*30개', amount:2784050, note:'3,4년차/32개 중 2개사용', basicWage:2815740, allowance:0,       workersDayAllowance:6980, totalWage:2822720, usedCount:2, usedDates:'2024-09/04,05' },
      { no:3, name:'정운하', position:'B반장',    joinDate:'2021-05-06', midSettleDate:'23.05.05', calcPeriod:'23.05.06~25.05.05', basis:'2,822,720/250.938*8.25*30개', amount:2784050, note:'3,4년차/32개 중 2개사용', basicWage:2815740, allowance:0,       workersDayAllowance:6980, totalWage:2822720, usedCount:2, usedDates:'2024-10/21,22' },
      { no:4, name:'문정훈', position:'B',        joinDate:'2021-05-06', midSettleDate:'23.05.05', calcPeriod:'23.05.06~25.05.05', basis:'2,822,720/250.938*8.25*32개', amount:2969660, note:'3,4년차/32개 중 0개사용', basicWage:2815740, allowance:0,       workersDayAllowance:6980, totalWage:2822720, usedCount:0, usedDates:'' },
      { no:5, name:'윤기서', position:'B',        joinDate:'2021-05-06', midSettleDate:'23.05.05', calcPeriod:'23.05.06~25.05.05', basis:'2,822,720/250.938*8.25*32개', amount:2969660, note:'3,4년차/32개 중 0개사용', basicWage:2815740, allowance:0,       workersDayAllowance:6980, totalWage:2822720, usedCount:0, usedDates:'' },
      { no:6, name:'정기섭', position:'A',        joinDate:'2022-01-12', midSettleDate:'23.01.11', calcPeriod:'23.01.12~25.01.11', basis:'2,822,720/250.938*8.25*31개', amount:2876850, note:'2,3년차/31개 중 0개사용', basicWage:2815740, allowance:0,       workersDayAllowance:6980, totalWage:2822720, usedCount:0, usedDates:'' },
      { no:7, name:'홍진기', position:'A',        joinDate:'2022-09-03', midSettleDate:'23.09.02', calcPeriod:'23.09.03~25.09.03', basis:'2,822,720/250.938*8.25*31개', amount:2876850, note:'2,3년차/31개 중 0개사용', basicWage:2815740, allowance:0,       workersDayAllowance:6980, totalWage:2822720, usedCount:0, usedDates:'' },
    ],
    retire: [
      { no:1, name:'차정환', position:'일근팀장', joinDate:'2021-05-06', midSettleDate:'', calcPeriod:'21.05.06~25.12.31', basis:'(2,915,740/250.938*8.25)*30*1701/365', amount:13401990, note:'통상임금', basicWage:2815740, posAllowance:100000, nightAllowance:0,      workersDayAllowance:0,    total:2915740 },
      { no:2, name:'최낙현', position:'A반장',    joinDate:'2021-05-06', midSettleDate:'', calcPeriod:'21.05.06~25.12.31', basis:'(3,092,730/250.938*8.25)*30*1701/365', amount:14215510, note:'평균임금', basicWage:2815740, posAllowance:0,       nightAllowance:270010, workersDayAllowance:6980, total:3092730 },
      { no:3, name:'정운하', position:'B반장',    joinDate:'2021-05-06', midSettleDate:'', calcPeriod:'21.05.06~25.12.31', basis:'(3,092,730/250.938*8.25)*30*1701/365', amount:14215510, note:'평균임금', basicWage:2815740, posAllowance:0,       nightAllowance:270010, workersDayAllowance:6980, total:3092730 },
      { no:4, name:'문정훈', position:'B',        joinDate:'2021-05-06', midSettleDate:'', calcPeriod:'21.05.06~25.12.31', basis:'(3,092,730/250.938*8.25)*30*1701/365', amount:14215510, note:'평균임금', basicWage:2815740, posAllowance:0,       nightAllowance:270010, workersDayAllowance:6980, total:3092730 },
      { no:5, name:'윤기서', position:'B',        joinDate:'2021-05-06', midSettleDate:'', calcPeriod:'21.05.06~25.12.31', basis:'(3,092,730/250.938*8.25)*30*1701/365', amount:14215510, note:'평균임금', basicWage:2815740, posAllowance:0,       nightAllowance:270010, workersDayAllowance:6980, total:3092730 },
      { no:6, name:'정기섭', position:'A',        joinDate:'2022-01-12', midSettleDate:'', calcPeriod:'22.01.12~25.12.31', basis:'(3,092,730/250.938*8.25)*30*1450/365', amount:12117860, note:'평균임금', basicWage:2815740, posAllowance:0,       nightAllowance:270010, workersDayAllowance:6980, total:3092730 },
      { no:7, name:'홍진기', position:'A',        joinDate:'2022-09-03', midSettleDate:'', calcPeriod:'22.09.03~25.12.31', basis:'(3,092,730/250.938*8.25)*30*1216/365', amount:10162290, note:'평균임금', basicWage:2815740, posAllowance:0,       nightAllowance:270010, workersDayAllowance:6980, total:3092730 },
    ],
  },
};

// ─── 로드 ──────────────────────────────────────
const loadData = async () => {
  isLoading.value = true;
  const sIdx = route.params.siteIdx;
  try {
    const [siteRes, listRes] = await Promise.all([
      axios.get(`/api/v1/accrual/sites/${sIdx}`),
      axios.get('/api/v1/accrual/sites'),
    ]);
    const d = siteRes.data.data;
    currentSite.value = d.site;
    baseInfo.value     = d.baseInfo || baseInfo.value;
    annualRows.value   = d.annualRows;
    retireRows.value   = d.retireRows;
    siteList.value     = listRes.data.data || [];
  } catch {
    currentSite.value = { idx: Number(sIdx) || 1, siteName: '한강롯데캐슬22단지', siteType: '아파트', status: '운영 중' };
    siteList.value    = [
      { idx: 1, siteName: '한강롯데캐슬22단지' },
      { idx: 2, siteName: '마포래미안아파트' },
      { idx: 3, siteName: '은평뉴타운힐스테이트' },
    ];
    annualRows.value = { 미화: [...SAMPLE.미화.annual], 경비: [...SAMPLE.경비.annual] };
    retireRows.value = { 미화: [...SAMPLE.미화.retire], 경비: [...SAMPLE.경비.retire] };
  } finally {
    isLoading.value = false;
  }
};

// ─── computed ──────────────────────────────────
const isKyeongbi = computed(() => activeType.value === '경비');
const currentAnnual = computed(() => annualRows.value[activeType.value] || []);
const currentRetire = computed(() => retireRows.value[activeType.value] || []);

const annualTotal    = computed(() => currentAnnual.value.reduce((s,r) => s+(r.amount||0),0));
const retireTotal    = computed(() => currentRetire.value.reduce((s,r) => s+(r.amount||0),0));
const annualTotalBasic = computed(() => currentAnnual.value.reduce((s,r) => s+(r.basicWage||0),0));
const retireTotalBasic = computed(() => currentRetire.value.reduce((s,r) => s+(r.basicWage||0),0));
const usedTotal      = computed(() => currentAnnual.value.reduce((s,r) => s+(r.usedCount||0),0));

const typeSummary = computed(() => {
  const calc = (type) => ({
    annual: (annualRows.value[type]||[]).reduce((s,r)=>s+(r.amount||0),0),
    retire: (retireRows.value[type]||[]).reduce((s,r)=>s+(r.amount||0),0),
    count:  (annualRows.value[type]||[]).length,
  });
  return { 미화: calc('미화'), 경비: calc('경비') };
});

const grandTotal = computed(() =>
    typeSummary.value['미화'].annual + typeSummary.value['미화'].retire +
    typeSummary.value['경비'].annual + typeSummary.value['경비'].retire
);

// ─── 모달 ──────────────────────────────────────
const defAnnual = () => ({ no:0, name:'', position:'', joinDate:'', midSettleDate:'', calcPeriod:'', basis:'', amount:0, note:'', basicWage:0, allowance:0, usedCount:0, usedDates:'', workersDayAllowance:0, totalWage:0 });
const defRetire = () => ({ no:0, name:'', position:'', joinDate:'', midSettleDate:'', calcPeriod:'', basis:'', amount:0, note:'', basicWage:0, allowance:0, total:0, posAllowance:0, nightAllowance:0, workersDayAllowance:0 });
const form = ref(defAnnual());

const openAdd = (section) => {
  modalMode.value  = section;
  editingRow.value = null;
  form.value = section === 'annual' ? defAnnual() : defRetire();
  const rows = section === 'annual' ? currentAnnual.value : currentRetire.value;
  form.value.no = rows.length ? Math.max(...rows.map(r=>r.no)) + 1 : 1;
  isModalOpen.value = true;
};

const openEdit = (row, section) => {
  modalMode.value  = section;
  editingRow.value = row;
  form.value = { ...row };
  isModalOpen.value = true;
};

const saveModal = async () => {
  if (!form.value.name.trim()) { alert('이름을 입력해주세요.'); return; }
  const target = modalMode.value === 'annual'
      ? annualRows.value[activeType.value]
      : retireRows.value[activeType.value];

  if (editingRow.value) {
    const idx = target.findIndex(r => r.no === editingRow.value.no);
    if (idx !== -1) target[idx] = { ...form.value };
  } else {
    target.push({ ...form.value });
  }

  // API 저장 시도
  try {
    await axios.put(`/api/v1/accrual/sites/${currentSite.value.idx}`, {
      type: activeType.value, section: modalMode.value,
      rows: modalMode.value === 'annual' ? annualRows.value[activeType.value] : retireRows.value[activeType.value],
    });
  } catch { /* 목업 */ }
  isModalOpen.value = false;
};

const deleteRow = async (row, section) => {
  if (!confirm(`'${row.name}' 항목을 삭제하시겠습니까?`)) return;
  const target = section === 'annual'
      ? annualRows.value[activeType.value]
      : retireRows.value[activeType.value];
  const idx = target.findIndex(r => r.no === row.no);
  if (idx !== -1) target.splice(idx, 1);
  // 번호 재정렬
  target.forEach((r, i) => { r.no = i + 1; });

  try {
    await axios.put(`/api/v1/accrual/sites/${currentSite.value.idx}`, {
      type: activeType.value, section,
      rows: target,
    });
  } catch { /* 목업 */ }
};

// ─── 현장 전환 ─────────────────────────────────
const switchSite = (idx) => router.push(`/accrual/${idx}`);
const goList     = () => router.push('/settlement/provision');

// ─── 엑셀 출력 ─────────────────────────────────
const exportExcel = async (mode = 'single') => {
  isExporting.value = true;
  try {
    const payload = {
      baseDate:      baseInfo.value.baseDate,
      writeDate:     baseInfo.value.writeDate,
      workhourMonth: baseInfo.value.workhourMonth,
      workhourDay:   baseInfo.value.workhourDay,
      singleMode:    mode === 'single',
      sites: mode === 'single'
          ? [{ siteName: currentSite.value.siteName, annualRows: annualRows.value, retireRows: retireRows.value }]
          : await fetchAllSitesData(),
    };

    const res = await axios.post('/api/v1/accrual/export', payload, { responseType: 'blob' });
    const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a    = document.createElement('a');
    a.href     = url;
    a.download = mode === 'single'
        ? `${currentSite.value.siteName}_연차퇴직금추계_${baseInfo.value.baseDate.replace(/\./g,'')}.xlsx`
        : `전체현장_연차퇴직금추계_${baseInfo.value.baseDate.replace(/\./g,'')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert('엑셀 출력 기능은 서버 API 연동 후 사용 가능합니다.\n(gen_excel.py를 서버에 배포하세요)');
  } finally {
    isExporting.value = false;
  }
};

const fetchAllSitesData = async () => {
  try {
    const res = await axios.get('/api/v1/accrual/all');
    return res.data.data;
  } catch {
    return [{ siteName: currentSite.value.siteName, annualRows: annualRows.value, retireRows: retireRows.value }];
  }
};

const isExportMenuOpen = ref(false);

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

onMounted(loadData);
</script>

<template>
  <div class="accrual-detail-page">

    <!-- ── 페이지 헤더 ── -->
    <div class="page-header">
      <div class="header-left">
        <button @click="goList" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-calculator-variant-outline"></i>
            연차 · 퇴직금 추계
          </h1>
          <p class="page-subtitle">기준일 <strong>{{ baseInfo.baseDate }}</strong></p>
        </div>
      </div>
      <div class="header-actions">
        <!-- 엑셀 출력 드롭다운 -->
        <div class="export-dropdown" v-click-outside="() => isExportMenuOpen = false">
          <button class="btn-excel" @click="isExportMenuOpen = !isExportMenuOpen" :disabled="isExporting">
            <i :class="isExporting ? 'mdi mdi-loading mdi-spin' : 'mdi mdi-file-excel-outline'"></i>
            {{ isExporting ? '생성 중...' : '엑셀 출력' }}
            <i class="mdi mdi-chevron-down"></i>
          </button>
          <div v-if="isExportMenuOpen" class="export-menu">
            <button class="em-item" @click="exportExcel('single'); isExportMenuOpen=false">
              <i class="mdi mdi-office-building-outline"></i>
              <div>
                <span class="em-title">현재 현장만 출력</span>
                <span class="em-sub">{{ currentSite.siteName }}</span>
              </div>
            </button>
            <div class="em-divider"></div>
            <button class="em-item" @click="exportExcel('all'); isExportMenuOpen=false">
              <i class="mdi mdi-domain"></i>
              <div>
                <span class="em-title">전체 현장 출력</span>
                <span class="em-sub">요약 시트 + 현장별 시트</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 현장 전환 셀렉터 ── -->
    <div class="site-selector-bar">
      <div class="ssb-label"><i class="mdi mdi-map-marker-outline"></i> 현장</div>
      <div class="ssb-tabs">
        <button
            v-for="s in siteList" :key="s.idx"
            :class="['ssb-tab', { active: s.idx === currentSite.idx }]"
            @click="switchSite(s.idx)"
        >
          {{ s.siteName }}
        </button>
      </div>
    </div>

    <!-- ── 요약 스트립 ── -->
    <div class="summary-strip">
      <div class="ss-card">
        <div class="ssc-icon si-blue"><i class="mdi mdi-calendar-check-outline"></i></div>
        <div class="ssc-body">
          <span class="ssc-label">미화 연차 추계</span>
          <span class="ssc-val">{{ fmt(typeSummary['미화'].annual) }}원</span>
          <span class="ssc-sub">{{ typeSummary['미화'].count }}명</span>
        </div>
      </div>
      <div class="ss-card">
        <div class="ssc-icon si-indigo"><i class="mdi mdi-piggy-bank-outline"></i></div>
        <div class="ssc-body">
          <span class="ssc-label">미화 퇴직금 추계</span>
          <span class="ssc-val">{{ fmt(typeSummary['미화'].retire) }}원</span>
        </div>
      </div>
      <div class="ss-card">
        <div class="ssc-icon si-teal"><i class="mdi mdi-shield-account-outline"></i></div>
        <div class="ssc-body">
          <span class="ssc-label">경비 연차 추계</span>
          <span class="ssc-val">{{ fmt(typeSummary['경비'].annual) }}원</span>
          <span class="ssc-sub">{{ typeSummary['경비'].count }}명</span>
        </div>
      </div>
      <div class="ss-card">
        <div class="ssc-icon si-purple"><i class="mdi mdi-bank-outline"></i></div>
        <div class="ssc-body">
          <span class="ssc-label">경비 퇴직금 추계</span>
          <span class="ssc-val">{{ fmt(typeSummary['경비'].retire) }}원</span>
        </div>
      </div>
      <div class="ss-card grand">
        <div class="ssc-icon si-orange"><i class="mdi mdi-sigma"></i></div>
        <div class="ssc-body">
          <span class="ssc-label">전체 합계</span>
          <span class="ssc-val grand-v">{{ fmt(grandTotal) }}원</span>
        </div>
      </div>
    </div>

    <!-- ── 기준 정보 바 ── -->
    <div class="base-info-bar">
      <div class="bib-item">
        <i class="mdi mdi-calendar-range-outline"></i>
        <span class="bib-label">기준일</span>
        <input v-model="baseInfo.baseDate" class="bib-input" placeholder="2025.12.31" />
      </div>
      <div class="bib-div"></div>
      <div class="bib-item">
        <i class="mdi mdi-pencil-box-outline"></i>
        <span class="bib-label">작성일</span>
        <input v-model="baseInfo.writeDate" type="date" class="bib-input bib-date" />
      </div>
      <div class="bib-div"></div>
      <div class="bib-item">
        <i class="mdi mdi-clock-time-eight-outline"></i>
        <span class="bib-label">월 근로시간</span>
        <input v-model.number="baseInfo.workhourMonth" type="number" class="bib-input bib-num" />
        <span class="bib-unit">h</span>
      </div>
      <div class="bib-div"></div>
      <div class="bib-item">
        <i class="mdi mdi-sun-clock-outline"></i>
        <span class="bib-label">일 근로시간</span>
        <input v-model.number="baseInfo.workhourDay" type="number" class="bib-input bib-num" />
        <span class="bib-unit">h</span>
      </div>
    </div>

    <!-- ── 직종 탭 ── -->
    <div class="type-tabs">
      <button v-for="t in ['미화','경비']" :key="t"
              :class="['type-tab', { active: activeType === t }]"
              @click="activeType = t">
        <i :class="['mdi', t==='미화' ? 'mdi-broom' : 'mdi-shield-account-outline']"></i>
        {{ t }}
        <span class="tc-count">{{ typeSummary[t].count }}명</span>
      </button>
    </div>

    <!-- ── 섹션 탭 + 추가 버튼 ── -->
    <div class="section-row">
      <div class="sec-tabs">
        <button :class="['sec-tab', { active: activeSection==='annual' }]" @click="activeSection='annual'">
          <i class="mdi mdi-calendar-check-outline"></i> 연차 추계
          <span class="sec-badge sec-blue">{{ fmt(annualTotal) }}원</span>
        </button>
        <button :class="['sec-tab', { active: activeSection==='retire' }]" @click="activeSection='retire'">
          <i class="mdi mdi-piggy-bank-outline"></i> 퇴직금 추계
          <span class="sec-badge sec-purple">{{ fmt(retireTotal) }}원</span>
        </button>
      </div>
      <button class="btn-add-row" @click="openAdd(activeSection)">
        <i class="mdi mdi-plus"></i> 직원 추가
      </button>
    </div>

    <!-- ══ 연차 추계 테이블 ══ -->
    <div v-show="activeSection==='annual'" class="table-section">
      <div class="subtotal-bar">
        <div class="st-item"><i class="mdi mdi-account-group-outline"></i><span>인원 <strong>{{ currentAnnual.length }}명</strong></span></div>
        <div class="st-item"><i class="mdi mdi-calendar-remove-outline"></i><span>연차 사용 <strong>{{ usedTotal }}개</strong></span></div>
        <div class="st-item hl-blue"><i class="mdi mdi-currency-krw"></i><span>연차 추계 합계 <strong>{{ fmt(annualTotal) }}원</strong></span></div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
          <tr>
            <th class="tc w-no">No</th>
            <th class="w-name">이름</th>
            <th>직책</th>
            <th>입사일</th>
            <th>중간정산일</th>
            <th>정산(재직)기간</th>
            <th>산출근거</th>
            <th class="tr">기본급</th>
            <template v-if="isKyeongbi">
              <th class="tr">직책수당</th>
              <th class="tr">근로자의날</th>
              <th class="tr">계</th>
            </template>
            <th class="tr amount-col">추계 금액</th>
            <th>비고</th>
            <th class="tc">사용수</th>
            <th>사용일</th>
            <th class="tc w-act">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="row in currentAnnual" :key="row.no" :class="{ 'row-used': row.usedCount > 0 }">
            <td class="tc text-muted">{{ row.no }}</td>
            <td class="fw-bold">{{ row.name }}</td>
            <td><span class="pos-chip">{{ row.position }}</span></td>
            <td class="text-muted fs11">{{ row.joinDate }}</td>
            <td class="text-muted fs11">{{ row.midSettleDate || '-' }}</td>
            <td class="period fs11">{{ row.calcPeriod }}</td>
            <td class="basis-cell text-muted fs11">{{ row.basis }}</td>
            <td class="tr fs11">{{ fmt(row.basicWage) }}</td>
            <template v-if="isKyeongbi">
              <td class="tr fs11">{{ row.allowance ? fmt(row.allowance) : '-' }}</td>
              <td class="tr fs11">{{ row.workersDayAllowance ? fmt(row.workersDayAllowance) : '-' }}</td>
              <td class="tr fs11 fw-bold">{{ fmt(row.totalWage) }}</td>
            </template>
            <td class="tr amount-col">
              <span class="amount-badge blue">{{ fmt(row.amount) }}</span>
            </td>
            <td class="note-cell text-muted fs11">{{ row.note }}</td>
            <td class="tc">
              <span v-if="row.usedCount > 0" class="used-badge">{{ row.usedCount }}개</span>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="dates-cell text-muted fs11">{{ row.usedDates || '-' }}</td>
            <td class="tc">
              <div class="act-btns">
                <button class="btn-edit-row" @click="openEdit(row, 'annual')"><i class="mdi mdi-pencil-outline"></i></button>
                <button class="btn-del-row"  @click="deleteRow(row, 'annual')"><i class="mdi mdi-trash-can-outline"></i></button>
              </div>
            </td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="tfoot-row">
            <td :colspan="isKyeongbi ? 7 : 7" class="tc fw-bold text-sub">합  계</td>
            <td class="tr fw-bold">{{ fmt(annualTotalBasic) }}</td>
            <template v-if="isKyeongbi"><td></td><td></td><td></td></template>
            <td class="tr amount-col"><span class="total-badge blue">{{ fmt(annualTotal) }}원</span></td>
            <td></td>
            <td class="tc fw-bold">{{ usedTotal }}개</td>
            <td></td><td></td>
          </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- ══ 퇴직금 추계 테이블 ══ -->
    <div v-show="activeSection==='retire'" class="table-section">
      <div class="subtotal-bar">
        <div class="st-item"><i class="mdi mdi-account-group-outline"></i><span>인원 <strong>{{ currentRetire.length }}명</strong></span></div>
        <div class="st-item hl-purple"><i class="mdi mdi-currency-krw"></i><span>퇴직금 추계 합계 <strong>{{ fmt(retireTotal) }}원</strong></span></div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
          <tr>
            <th class="tc w-no">No</th>
            <th class="w-name">이름</th>
            <th>직책</th>
            <th>입사일</th>
            <th>중간정산일</th>
            <th>정산기간</th>
            <th>산출근거</th>
            <th class="tr">기본급</th>
            <template v-if="isKyeongbi">
              <th class="tr">직책수당</th>
              <th class="tr">야간수당</th>
              <th class="tr">근로자의날</th>
              <th class="tr">계</th>
            </template>
            <th class="tr amount-col">추계 금액</th>
            <th>비고</th>
            <th class="tc w-act">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="row in currentRetire" :key="row.no">
            <td class="tc text-muted">{{ row.no }}</td>
            <td class="fw-bold">{{ row.name }}</td>
            <td><span class="pos-chip">{{ row.position }}</span></td>
            <td class="text-muted fs11">{{ row.joinDate }}</td>
            <td class="text-muted fs11">{{ row.midSettleDate || '-' }}</td>
            <td class="period fs11">{{ row.calcPeriod }}</td>
            <td class="basis-cell text-muted fs11">{{ row.basis }}</td>
            <td class="tr fs11">{{ fmt(row.basicWage) }}</td>
            <template v-if="isKyeongbi">
              <td class="tr fs11">{{ row.posAllowance ? fmt(row.posAllowance) : '-' }}</td>
              <td class="tr fs11">{{ row.nightAllowance ? fmt(row.nightAllowance) : '-' }}</td>
              <td class="tr fs11">{{ row.workersDayAllowance ? fmt(row.workersDayAllowance) : '-' }}</td>
              <td class="tr fs11 fw-bold">{{ fmt(row.total) }}</td>
            </template>
            <td class="tr amount-col">
              <span class="amount-badge purple">{{ fmt(row.amount) }}</span>
            </td>
            <td class="note-cell text-muted fs11">{{ row.note }}</td>
            <td class="tc">
              <div class="act-btns">
                <button class="btn-edit-row" @click="openEdit(row,'retire')"><i class="mdi mdi-pencil-outline"></i></button>
                <button class="btn-del-row"  @click="deleteRow(row,'retire')"><i class="mdi mdi-trash-can-outline"></i></button>
              </div>
            </td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="tfoot-row">
            <td :colspan="isKyeongbi ? 7 : 7" class="tc fw-bold text-sub">합  계</td>
            <td class="tr fw-bold">{{ fmt(retireTotalBasic) }}</td>
            <template v-if="isKyeongbi"><td></td><td></td><td></td><td></td></template>
            <td class="tr amount-col"><span class="total-badge purple">{{ fmt(retireTotal) }}원</span></td>
            <td></td><td></td>
          </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- ══ 입력/수정 모달 ══ -->
    <div v-if="isModalOpen" class="modal-overlay" @click.self="isModalOpen=false">
      <div class="modal-box">
        <div class="modal-header">
          <h3>
            <i :class="['mdi', modalMode==='annual' ? 'mdi-calendar-check-outline' : 'mdi-piggy-bank-outline']"></i>
            {{ editingRow ? '수정' : '추가' }} — {{ modalMode==='annual' ? '연차 추계' : '퇴직금 추계' }}
            <span class="mtype-chip">{{ activeType }}</span>
          </h3>
          <button class="modal-close" @click="isModalOpen=false"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">

          <!-- 기본 정보 -->
          <div class="msec">
            <p class="msec-label">기본 정보</p>
            <div class="mgrid">
              <div class="mi"><label>이름 *</label><input v-model="form.name" class="info-input" placeholder="홍길동" /></div>
              <div class="mi"><label>직책</label><input v-model="form.position" class="info-input" placeholder="미화, 반장, 팀장 등" /></div>
              <div class="mi"><label>입사일</label><input v-model="form.joinDate" type="date" class="info-input" /></div>
              <div class="mi"><label>중간 정산일</label><input v-model="form.midSettleDate" class="info-input" placeholder="예: 23.05.05" /></div>
              <div class="mi full"><label>정산(재직)기간</label><input v-model="form.calcPeriod" class="info-input" placeholder="예: 23.05.06~25.05.05" /></div>
              <div class="mi full"><label>산출근거</label><input v-model="form.basis" class="info-input" placeholder="예: 1,709,290/169.5*6*32개" /></div>
            </div>
          </div>

          <!-- 급여 구성 -->
          <div class="msec">
            <p class="msec-label">급여 구성</p>
            <div class="mgrid">
              <div class="mi"><label>기본급</label><input v-model.number="form.basicWage" type="number" class="info-input tr" /></div>
              <div class="mi"><label>수당</label><input v-model.number="form.allowance" type="number" class="info-input tr" /></div>
              <template v-if="isKyeongbi && modalMode==='annual'">
                <div class="mi"><label>근로자의날수당</label><input v-model.number="form.workersDayAllowance" type="number" class="info-input tr" /></div>
                <div class="mi"><label>계</label><input v-model.number="form.totalWage" type="number" class="info-input tr" /></div>
              </template>
              <template v-if="isKyeongbi && modalMode==='retire'">
                <div class="mi"><label>직책수당</label><input v-model.number="form.posAllowance" type="number" class="info-input tr" /></div>
                <div class="mi"><label>야간수당</label><input v-model.number="form.nightAllowance" type="number" class="info-input tr" /></div>
                <div class="mi"><label>근로자의날수당</label><input v-model.number="form.workersDayAllowance" type="number" class="info-input tr" /></div>
                <div class="mi"><label>계</label><input v-model.number="form.total" type="number" class="info-input tr" /></div>
              </template>
            </div>
          </div>

          <!-- 추계 결과 -->
          <div class="msec">
            <p class="msec-label">추계 결과</p>
            <div class="mgrid">
              <div class="mi"><label>추계 금액 *</label><input v-model.number="form.amount" type="number" class="info-input tr amount-inp" /></div>
              <div class="mi"><label>비고</label><input v-model="form.note" class="info-input" placeholder="예: 3,4년차/32개 중 0개사용" /></div>
              <template v-if="modalMode==='annual'">
                <div class="mi"><label>연차 사용 수</label><input v-model.number="form.usedCount" type="number" class="info-input" /></div>
                <div class="mi full"><label>연차 사용일</label><input v-model="form.usedDates" class="info-input" placeholder="예: 2024-04/05,06/11,12" /></div>
              </template>
            </div>
          </div>

        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="isModalOpen=false"><i class="mdi mdi-close"></i> 취소</button>
          <button class="btn-primary" @click="saveModal"><i class="mdi mdi-check"></i> 저장</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ─── 공통 레이아웃 ─── */
.accrual-detail-page { display: flex; flex-direction: column; gap: 20px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.header-left { display: flex; align-items: flex-start; gap: 16px; }

.btn-back { width: 42px; height: 42px; border-radius: 10px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; }
.btn-back:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-back i { font-size: 20px; }

.page-title { font-size: 22px; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px; }
.page-title i { font-size: 24px; color: var(--primary); }
.page-subtitle { font-size: 13px; color: var(--text-sub); margin: 4px 0 0; }
.page-subtitle strong { color: var(--text-main); }

.header-actions { display: flex; gap: 10px; align-items: center; }

/* 버튼 공통 */
.btn-primary, .btn-cancel, .btn-add-row {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-primary { background: var(--primary); border: 1px solid var(--primary); color: var(--text-inverse); }
.btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
.btn-cancel { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-add-row { background: var(--bg-surface); border: 1px dashed var(--primary); color: var(--primary); padding: 8px 14px; }
.btn-add-row:hover { background: var(--primary-soft); }

/* 엑셀 버튼 */
.export-dropdown { position: relative; }
.btn-excel {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
  background: #16a34a; border: 1px solid #16a34a; color: #fff; cursor: pointer; transition: all .2s;
}
.btn-excel:hover:not(:disabled) { background: #15803d; transform: translateY(-1px); }
.btn-excel:disabled { opacity: .6; cursor: not-allowed; }

.export-menu {
  position: absolute; right: 0; top: calc(100% + 6px);
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
  padding: 6px; min-width: 220px; z-index: 200;
}
.em-item {
  display: flex; align-items: center; gap: 12px;
  width: 100%; padding: 10px 12px; border: none; background: transparent;
  border-radius: 7px; cursor: pointer; text-align: left; transition: background .15s;
}
.em-item:hover { background: var(--bg-hover); }
.em-item i { font-size: 20px; color: var(--primary); flex-shrink: 0; }
.em-title { display: block; font-size: 13px; font-weight: 600; color: var(--text-main); }
.em-sub   { display: block; font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.em-divider { height: 1px; background: var(--border-color); margin: 4px 6px; }

/* ─── 현장 전환 셀렉터 ─── */
.site-selector-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; background: var(--bg-canvas);
  border: 1px solid var(--border-color); border-radius: 10px;
  overflow-x: auto;
}
.ssb-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text-sub); white-space: nowrap; }
.ssb-label i { color: var(--primary); font-size: 14px; }
.ssb-tabs { display: flex; gap: 6px; flex-wrap: nowrap; }
.ssb-tab {
  padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  color: var(--text-sub); cursor: pointer; white-space: nowrap; transition: all .2s;
}
.ssb-tab:hover { border-color: var(--border-focus); color: var(--text-main); }
.ssb-tab.active { background: var(--primary); border-color: var(--primary); color: #fff; }

/* ─── 요약 스트립 ─── */
.summary-strip { display: grid; grid-template-columns: repeat(4, 1fr) 1.3fr; gap: 12px; }
.ss-card { display: flex; gap: 12px; align-items: center; padding: 16px 18px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--bg-surface); }
.ss-card.grand { border-color: var(--primary); background: var(--primary-soft); }
.ssc-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.si-blue   { background: rgba(59,130,246,.1); color: #3b82f6; }
.si-indigo { background: rgba(99,102,241,.1); color: #6366f1; }
.si-teal   { background: rgba(20,184,166,.1); color: #14b8a6; }
.si-purple { background: rgba(168,85,247,.1); color: #a855f7; }
.si-orange { background: rgba(249,115,22,.1); color: #f97316; }
.grand .ssc-icon { background: rgba(99,102,241,.15); color: var(--primary); }
.ssc-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ssc-label { font-size: 11px; font-weight: 600; color: var(--text-sub); }
.ssc-val { font-size: 13px; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ssc-sub { font-size: 11px; color: var(--text-muted); }
.grand-v { color: var(--primary); font-size: 14px; }

/* ─── 기준 정보 바 ─── */
.base-info-bar { display: flex; align-items: center; gap: 0; padding: 12px 18px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 10px; flex-wrap: wrap; }
.bib-item { display: flex; align-items: center; gap: 8px; padding: 0 16px; }
.bib-item i { font-size: 14px; color: var(--primary); }
.bib-label { font-size: 12px; font-weight: 600; color: var(--text-sub); white-space: nowrap; }
.bib-input { padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-main); background: var(--bg-surface); }
.bib-input:focus { outline: none; border-color: var(--primary); }
.bib-num  { width: 65px; text-align: right; }
.bib-date { width: 130px; }
.bib-unit { font-size: 12px; color: var(--text-muted); margin-left: -4px; }
.bib-div  { width: 1px; height: 18px; background: var(--border-color); }

/* ─── 직종 탭 ─── */
.type-tabs { display: flex; gap: 8px; }
.type-tab { display: flex; align-items: center; gap: 8px; padding: 12px 22px; border-radius: 10px; background: var(--bg-canvas); border: 1px solid var(--border-color); font-size: 14px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: all .2s; }
.type-tab i { font-size: 16px; }
.type-tab:hover { border-color: var(--border-focus); color: var(--text-main); }
.type-tab.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.tc-count { padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,.2); }
.type-tab:not(.active) .tc-count { background: var(--bg-hover); color: var(--text-sub); }

/* ─── 섹션 탭 ─── */
.section-row { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); }
.sec-tabs { display: flex; }
.sec-tab { display: flex; align-items: center; gap: 8px; padding: 14px 18px; background: transparent; border: none; font-size: 14px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: all .2s; position: relative; margin-bottom: -1px; }
.sec-tab.active { color: var(--primary); background: var(--bg-surface); border: 1px solid var(--border-color); border-bottom-color: var(--bg-surface); border-radius: 8px 8px 0 0; }
.sec-badge { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.sec-blue   { background: rgba(59,130,246,.1); color: #3b82f6; }
.sec-purple { background: rgba(168,85,247,.1); color: #a855f7; }

/* ─── 소계 바 ─── */
.subtotal-bar { display: flex; align-items: center; gap: 20px; padding: 11px 18px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-bottom: none; border-radius: 10px 10px 0 0; flex-wrap: wrap; }
.st-item { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-sub); }
.st-item i { font-size: 14px; color: var(--text-muted); }
.st-item strong { color: var(--text-main); font-weight: 700; }
.hl-blue { margin-left: auto; }
.hl-blue i { color: var(--primary) !important; }
.hl-blue strong { color: var(--primary); font-size: 14px; }
.hl-purple { margin-left: auto; }
.hl-purple i { color: #a855f7 !important; }
.hl-purple strong { color: #a855f7; font-size: 14px; }

/* ─── 테이블 ─── */
.table-section { display: flex; flex-direction: column; }
.table-scroll { overflow-x: auto; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; color: var(--text-main); background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 0 0 10px 10px; overflow: hidden; }
.data-table th { padding: 10px 12px; background: var(--bg-hover); border-bottom: 2px solid var(--border-color); font-size: 11px; font-weight: 700; color: var(--text-sub); white-space: nowrap; text-align: left; }
.data-table td { padding: 9px 12px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover td { background: var(--bg-canvas); }
.data-table tbody tr.row-used td { background: rgba(59,130,246,.025); }

.tc  { text-align: center; }
.tr  { text-align: right; }
.fw-bold { font-weight: 700; }
.text-muted { color: var(--text-muted); }
.text-sub   { color: var(--text-sub); }
.fs11 { font-size: 11px; }
.w-no  { width: 40px; }
.w-name { min-width: 78px; }
.w-act { width: 68px; }
.amount-col { min-width: 120px; }
.period { white-space: nowrap; }
.basis-cell { max-width: 180px; word-break: break-all; line-height: 1.4; }
.note-cell  { max-width: 160px; }
.dates-cell { max-width: 150px; word-break: break-all; line-height: 1.4; }

.pos-chip { display: inline-flex; padding: 2px 8px; border-radius: 6px; background: var(--bg-canvas); border: 1px solid var(--border-color); font-size: 11px; font-weight: 600; color: var(--text-sub); white-space: nowrap; }

.amount-badge { display: inline-flex; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; white-space: nowrap; }
.amount-badge.blue   { background: rgba(59,130,246,.1);  color: #3b82f6; }
.amount-badge.purple { background: rgba(168,85,247,.1); color: #a855f7; }

.used-badge { display: inline-flex; padding: 2px 8px; border-radius: 20px; background: rgba(249,115,22,.1); color: #f97316; font-size: 11px; font-weight: 700; }

.tfoot-row td { padding: 11px 12px; background: var(--bg-canvas); font-size: 12px; border-top: 2px solid var(--border-focus); }
.total-badge { display: inline-flex; padding: 5px 12px; border-radius: 7px; font-weight: 800; font-size: 13px; white-space: nowrap; }
.total-badge.blue   { background: rgba(59,130,246,.12); color: #3b82f6; }
.total-badge.purple { background: rgba(168,85,247,.12); color: #a855f7; }

.act-btns { display: flex; gap: 4px; justify-content: center; }
.btn-edit-row, .btn-del-row { width: 28px; height: 28px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; transition: all .2s; }
.btn-edit-row { background: var(--primary-soft); color: var(--primary); }
.btn-edit-row:hover { background: var(--primary); color: #fff; }
.btn-del-row  { background: rgba(239,68,68,.1); color: var(--danger); }
.btn-del-row:hover  { background: var(--danger); color: #fff; }

/* ─── 모달 ─── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-box { background: var(--bg-surface); border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.2); width: 100%; max-width: 640px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border-color); }
.modal-header h3 { font-size: 15px; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 8px; }
.modal-header h3 i { font-size: 18px; color: var(--primary); }
.mtype-chip { padding: 2px 8px; border-radius: 6px; background: var(--primary-soft); color: var(--primary); font-size: 11px; font-weight: 700; }
.modal-close { width: 32px; height: 32px; border-radius: 8px; background: var(--bg-canvas); border: 1px solid var(--border-color); color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.modal-body { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px; }

.msec { display: flex; flex-direction: column; gap: 12px; }
.msec-label { font-size: 12px; font-weight: 700; color: var(--text-sub); padding-bottom: 6px; border-bottom: 1px dashed var(--border-color); margin: 0; }
.mgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mi { display: flex; flex-direction: column; gap: 5px; }
.mi.full { grid-column: 1/-1; }
.mi label { font-size: 12px; font-weight: 600; color: var(--text-sub); }

.info-input { padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); transition: all .2s; box-sizing: border-box; width: 100%; }
.info-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.info-input.tr { text-align: right; }
.info-input.amount-inp { font-weight: 700; font-size: 15px; color: var(--primary); }

/* ─── 반응형 ─── */
@media (max-width: 1200px) {
  .summary-strip { grid-template-columns: repeat(3, 1fr); }
  .ss-card.grand { grid-column: span 3; }
}
@media (max-width: 768px) {
  .summary-strip { grid-template-columns: 1fr 1fr; }
  .ss-card.grand { grid-column: span 2; }
  .base-info-bar { flex-direction: column; align-items: flex-start; gap: 10px; }
  .bib-div { display: none; }
  .mgrid { grid-template-columns: 1fr; }
  .section-row { flex-direction: column; align-items: flex-start; gap: 8px; }
}
</style>
