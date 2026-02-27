<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";
const {
  siteOptions,
  typeOptions,
  fetchSiteOptions,
  fetchTypeOptions,
} = useApi();

// 1. 상태 및 검색 조건
const currentYear = new Date().getFullYear();
const searchTerm = ref('');
const selectedSite = ref('전체');
const selectedType = ref('전체');
const items = ref([]);
const isLoading = ref(false);
const error = ref(null);

const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// 2. 동적 컬럼 분류
const payItems = computed(() => items.value.filter(i => i.groupNm === '지급항목'));
const deductionItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));
const checkedItems = computed(() => items.value.filter(i => i.groupNm === '공제항목'));

// 3. 데이터 리스트
const payrollList = ref([]);
const targetCodes = ref({
  pension: '',      // 국민연금
  health: '',       // 건강보험
  longTerm: '',     // 장기요양
  employment: ''    // 고용보험
});


// 4. [핵심] 데이터 변환 함수 (DB 문자열 -> UI 객체)
const transformPayrollList = (rows) => {
  return rows.map(row => {
    let parsedPayments = {};
    let parsedDeductions = {};
    let deductionFlags = {}; //공제 체크박스

    // DB의 payItems 파싱하고 payments(객체)로 변환
    try {
      if (row.payItems && typeof row.payItems === 'string') {
        parsedPayments = JSON.parse(row.payItems);
      } else if (typeof row.payItems === 'object') {
        parsedPayments = row.payItems || {}; // 이미 객체라면 그대로 사용
      }
    } catch (e) {
      console.warn(`지급항목 파싱 실패 (Idx: ${row.idx})`, e);
    }

    // DB의 deductionItems 파싱하고 deductions(객체)로 변환
    try {
      if (row.deductionItems && typeof row.deductionItems === 'string') {
        parsedDeductions = JSON.parse(row.deductionItems);
      } else if (typeof row.deductionItems === 'object') {
        parsedDeductions = row.deductionItems || {};
      }
    } catch (e) {
      console.warn(`공제항목 파싱 실패 (Idx: ${row.idx})`, e);
    }

    let hasSavedFlags = false; // 저장된 플래그가 있는지 여부 확인
    try {
      if (row.checkedItems) {
        deductionFlags = (typeof row.checkedItems === 'boolean')
            ? JSON.parse(row.checkedItems)
            : row.checkedItems;

        // 빈 객체가 아니면 저장된 데이터가 있다고 판단
        if (Object.keys(deductionFlags).length > 0) {
          hasSavedFlags = true;
        }
      }

    } catch (e) { console.warn(`체크항목 파싱 실패`, e); }

    // 4. 저장된 체크박스 정보가 없으면 -> 기본값으로 '모두 체크(true)' 설정
    if (!hasSavedFlags && deductionItems.value.length > 0) {
      deductionItems.value.forEach(item => {
        deductionFlags[item.itemCd] = true;
      });
    }

    return {
      ...row,
      payments: parsedPayments,     //지급 객체
      deductions: parsedDeductions,  //공제 객체
      deductionFlags: deductionFlags
    };
  });
};

// 5. 동적 계산 로직
const calculateRow = (row) => {
  let gross = 0;
  let ded = 0;

  // payments 객체가 있을 때만 계산
  if (row.payments) {
    payItems.value.forEach(item => {
      // 값이 없으면 0으로 처리
      gross += Number(row.payments[item.itemCd] || 0);
    });
  }

  // deductions 객체가 있을 때만 계산
  if (row.deductions) {
    deductionItems.value.forEach(item => {
      ded += Number(row.deductions[item.itemCd] || 0);
    });
  }

  return { gross, ded, net: gross - ded };
};

const filteredPayrollList = computed(() => {
  /*
  return payrollList.value.filter(p => {
    const siteMatch = selectedSite.value === '전체' || p.sIdx == selectedSite.value;
    const searchMatch = p.staff.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch = selectedType.value === '전체' || p.type === selectedType.value;

    return siteMatch && searchMatch && typeMatch;
  });

   */
  const filtered = payrollList.value.filter(p => {
    const siteMatch = selectedSite.value === '전체' || p.sIdx == selectedSite.value;
    const searchMatch = p.staff.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch = selectedType.value === '전체' || p.type === selectedType.value;

    return siteMatch && searchMatch && typeMatch;
  });

  // 2. 정렬 로직 추가 (내림차순 정렬)
  return filtered.sort((a, b) => {
    // 1순위: sIdx 내림차순
    if (Number(b.sIdx) !== Number(a.sIdx)) {
      return Number(a.sIdx) - Number(b.sIdx);
    }
    // 2순위: idx(mIdx) 내림차순
    return Number(a.idx) - Number(b.idx);
  });
});

const totalSummary = computed(() => {
  const summary = { gross: 0, ded: 0, net: 0 };
  //payrollList.value.forEach(p => {
  filteredPayrollList.value.forEach(p => {
    const calc = calculateRow(p);
    summary.gross += calc.gross;
    summary.ded += calc.ded;
    summary.net += calc.net;
  });
  return summary;
});

const handleSearch = () => {
  // 검색 버튼 클릭 시 다시 API를 호출할 수도 있고,
  // 현재는 computed가 실시간으로 반응하므로 fetchMembers()를 호출하여 데이터를 갱신합니다.
  fetchMembers();
};

const formatCurrency = (amount) => new Intl.NumberFormat('ko-KR').format(amount);

// 6. API 호출
const getWageCode = async function () {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    console.log(res.data.data, 'dd')
    items.value = res.data.data || [];

  } catch (err) {
    console.error("항목 로드 실패", err);
  }
}

/*
const getTaxRate = async function () {
  const year = new Date().getFullYear()
  axios.get(`/api/v1/config/tax/rate/${year}`)
      .then((response) => {
        let tax = response.data.data;
        console.log(response.data.data, 'taxRate')
        if(tax.length > 0) {
          targetCodes.employment = tax[0].employment_rate
          targetCodes.health = tax[0].health_rate
          targetCodes.longTerm = tax[0].long_term_care_rate
          targetCodes.pension = tax[0].pension_rate
        }
      })
}

 */
const getTaxRate = async function () {
  const year = new Date().getFullYear(); // 2026
  try {
    const response = await axios.get(`/api/v1/config/tax/rate/${year}`);
    const taxList = response.data.data;

    if (taxList && taxList.length > 0) {
      // API가 리스트를 반환한다면, 현재 연도(2026)와 일치하는 데이터를 찾습니다.
      const matchedTax = taxList.find(t => Number(t.applied_year) === year) || taxList[0];

      //console.log('적용된 요율:', matchedTax);

      targetCodes.value = {
        pension: matchedTax.pension_rate,          // 국민연금 (예: 4.5)
        health: matchedTax.health_rate,            // 건강보험 (예: 3.545)
        longTerm: matchedTax.long_term_care_rate,  // 장기요양 (예: 12.95 -> 건강보험료의 12.95%)
        employment: matchedTax.employment_rate     // 고용보험 (예: 0.9)
      };
    }
  } catch (e) {
    console.error('세율 정보 로드 실패', e);
  }
}

// [수정] 4대보험 자동 계산 함수
const calculateInsurances = (row, sourceItem) => {

  // 1. 과세 대상 급여(Taxable Pay) 계산
  // ★ 식대(비과세)는 제외하고 합산해야 공제액이 정확하게 계산됩니다.
  let taxablePay = 0;

  if (row.payments) {
    payItems.value.forEach(item => {
      const amount = Number(row.payments[item.itemCd] || 0);

      // [핵심 수정] 항목명에 '식대'가 포함되어 있으면 합산에서 제외 (비과세 처리)
      if (item.itemNm.includes('식대')) {
        return; // 건너뜀
      }

      taxablePay += amount;
    });
  }

  const rates = targetCodes.value;

  // ============================================================
  // [방어 로직] sourceItem이 없는 경우 (초기 로딩 등) -> 전체 재계산
  // ============================================================
  if (!sourceItem) {
    deductionItems.value.forEach(dedItem => {
      // 체크된 항목만 계산
      if (row.deductionFlags && row.deductionFlags[dedItem.itemCd]) {
        // ★ 식대가 제외된 taxablePay를 기준으로 계산
        applyDeductionLogic(row, dedItem, taxablePay, rates);
      } else {
        // 체크 해제된 경우 0원 처리
        if (!row.deductions) row.deductions = {};
        row.deductions[dedItem.itemCd] = 0;
      }
    });
    return;
  }

  // ============================================================
  // sourceItem이 있는 경우 (사용자 입력 시)
  // ============================================================
  const isPaymentItem = payItems.value.some(p => p.itemCd === sourceItem.itemCd);

  // [Case A] '지급 항목'이 변경됨 -> 모든 공제 재계산
  if (isPaymentItem) {
    deductionItems.value.forEach(dedItem => {
      if (row.deductionFlags[dedItem.itemCd]) {
        // ★ 식대가 제외된 taxablePay 전달
        applyDeductionLogic(row, dedItem, taxablePay, rates);
      }
    });
  }
  // [Case B] '공제 체크박스' 변경 -> 해당 항목만 처리
  else {
    if (!row.deductionFlags[sourceItem.itemCd]) {
      row.deductions[sourceItem.itemCd] = 0;
    } else {
      applyDeductionLogic(row, sourceItem, taxablePay, rates);
    }

    // 건강보험 변경 시 장기요양 연동
    if (sourceItem.itemNm.includes('건강보험')) {
      const longTermItem = deductionItems.value.find(i => i.itemNm.includes('장기요양'));
      if (longTermItem && row.deductionFlags[longTermItem.itemCd]) {
        applyDeductionLogic(row, longTermItem, taxablePay, rates);
      }
    }
  }
};

// [보조 함수] 실제 계산 공식은 여기서 한 번만 정의 (중복 제거)
const applyDeductionLogic = (row, item, calcBaseAmount, rates) => {
  let amount = 0;

  if (item.itemNm.includes('국민연금')) {
    amount = calcBaseAmount * (rates.pension / 100);
  }
  else if (item.itemNm.includes('건강보험')) {
    amount = calcBaseAmount * (rates.health / 100);
  }
  else if (item.itemNm.includes('장기요양')) {
    // 장기요양은 건강보험료 기준
    const healthItem = deductionItems.value.find(i => i.itemNm.includes('건강보험'));
    const healthAmt = row.deductions[healthItem.itemCd] || 0;
    amount = healthAmt * (rates.longTerm / 100);
  }
  else if (item.itemNm.includes('고용보험')) {
    amount = calcBaseAmount * (rates.employment / 100);
  } else {
    // 자동계산 항목 아니면 종료
    return;
  }

  // 10원 단위 절사
  row.deductions[item.itemCd] = Math.floor(amount / 10) * 10;
};

const savePayroll = async function () {
  if (!confirm('작성된 급여 정보를 저장하시겠습니까?')) return;

  try {
    const requests = payrollList.value.map(row => {
      const calc = calculateRow(row);

      const params = {
        mIdx: row.idx,       // 혹은 row.mIdx (DB 컬럼 확인 필요)
        sIdx: row.sIdx,
        year: new Date().getFullYear(),
        grossPay: calc.gross,
        deductions: calc.ded,
        netPay: calc.net,
        // 저장할 때는 다시 문자열(JSON String)로 변환
        payItems: JSON.stringify(row.payments || {}),
        deductionItems: JSON.stringify(row.deductions || {}),
        checkedItems: JSON.stringify(row.deductionFlags || {}), //공제항목 체크여부
        total: 0
      };

      console.log(params)
      //return;

      // idx가 있으면 update, 없으면 insert 일 수도 있으나 여기선 idx 기준으로 요청
      return axios.post(`/api/v1/member/base/salary/${row.idx}`, params);
    });

    await Promise.all(requests);
    alert('모든 데이터가 성공적으로 저장되었습니다.');
    await fetchMembers(); // 저장 후 목록 새로고침

  } catch (err) {
    console.error("저장 중 오류 발생", err);
    alert('저장 중 오류가 발생했습니다.');
  }
}

const fetchMembers = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await axios.get('/api/v1/member/payroll');
    if (response.data.data.length > 0) {
      console.log(response.data.data, 'getPayrolls');

      payrollList.value = transformPayrollList(response.data.data);

    } else {
      payrollList.value = [];
    }
  } catch (e) {
    console.error("데이터 로드 실패:", e);
    payrollList.value = [];
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  getTaxRate();
  getWageCode();
  fetchSiteOptions();
  fetchTypeOptions();
  fetchMembers();
});
</script>
<style scoped src="/assets/css/member.css"></style>
<template>
  <div class="payroll-staff-list-page">
    <div class="page-header">
      <h2 class="page-title">직원 급여 정보</h2>
    </div>

    <div class="search-panel">
      <div class="input-group">
        <label class="input-label">근무 현장 :</label>
        <select v-model="selectedSite" class="input-select" style="min-width: 150px;">
          <option value="전체">전체</option>
          <!--option v-for="site in ['LH 위례 6단지', '강서 대명 강동']" :key="site" :value="site">{{ site }}</option-->
          <option v-for="site in siteOptions" :key="site" :value="site.idx">{{ site.name }}</option>
        </select>
      </div>

      <div class="input-group">
        <label class="input-label">구분 :</label>
        <select v-model="selectedType" class="input-select" style="min-width: 150px;">
          <option value="전체">전체</option>
          <option v-for="opt in typeOptions" :key="opt" :value="opt.itemCd">{{ opt.itemNm }}</option>
        </select>
      </div>


      <div class="input-group search-term-group">
        <input
            type="text"
            v-model="searchTerm"
            placeholder="이름으로 검색..."
            class="input-text"
            @keyup.enter="handleSearch"
        >
        <button @click="handleSearch" class="btn btn-primary">검색</button>
      </div>

      <div class="spacer"></div>
      <button @click="fetchMembers" class="btn btn-primary">항목 새로고침</button>
      <button @click="savePayroll" class="btn btn-success">저장하기</button>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
        <tr>
          <th rowspan="2" class="text-center" style="width: 20px;"></th>
          <th rowspan="2" class="text-center" style="width: 50px;">No.</th>
          <th rowspan="2" class="text-center" style="width: 120px;">현장명</th>
          <th rowspan="2" class="text-center" style="width: 80px;">직책</th>
          <th rowspan="2" class="text-center" style="width: 80px;">사번</th>
          <th rowspan="2" class="text-center" style="width: 100px;">성명</th>
          <th colspan="2" class="text-center group-header-summary">합계</th>
          <th :colspan="payItems.length" class="text-center group-header-pay">지급 항목</th>
          <th :colspan="deductionItems.length * 2" class="text-center group-header-deduction">공제 항목</th>
        </tr>
        <tr>
          <th class="text-right">지급합계</th>
          <th class="text-right">공제합계</th>

          <th v-for="item in payItems" :key="item.itemCd" class="text-right bg-pay-sub">
            {{ item.itemNm }}
          </th>
          <th v-for="item in deductionItems" :key="item.itemCd" class="text-right bg-ded-sub">
            {{ item.itemNm }}
          </th>

          <th v-for="item in deductionItems" :key="'h-ded-chk-'+item.itemCd" class="text-center bg-ded-sub" style="width: 50px; font-size: 0.8rem;">
            {{ item.itemNm }}<br>(적용)
          </th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="(p, index) in filteredPayrollList" :key="p.id">
          <td class="text-center"><input type="checkbox" name="salary-box"></td>
          <td class="text-center">{{ index+1 }}</td>
          <td class="text-center">{{ p.siteName }}</td>
          <td class="text-center">{{ p.role }}</td>
          <td class="text-center">{{ p.id }}</td>
          <td class="text-center fw-bold">{{ p.staff }}</td>

          <td class="text-right bg-light-gray amount-cell">{{ formatCurrency(calculateRow(p).gross) }}</td>
          <td class="text-right bg-light-gray amount-cell text-red">{{ formatCurrency(calculateRow(p).ded) }}</td>

          <td v-for="item in payItems" :key="item.itemCd">
            <template v-if="p.payments">
              <input
                  type="number"
                  v-model.number="p.payments[item.itemCd]"
                  @input="calculateInsurances(p, item)"
                  class="inline-input"
              />
            </template>
          </td>

          <td v-for="item in deductionItems" :key="item.itemCd">
            <template v-if="p.deductions">
              <input
                  type="number"
                  v-model.number="p.deductions[item.itemCd]"
                  class="inline-input"
              />
            </template>

          </td>

          <td v-for="item in checkedItems" :key="'ded-chk-'+item.itemCd" class="text-center" style="background-color: #fffdfd; border-left: 1px dashed #ddd;">
            <input
                type="checkbox"
                v-model="p.deductionFlags[item.itemCd]"
                @change="calculateInsurances(p, item)"
                style="cursor: pointer; width: 16px; height: 16px; margin-top: 4px;"
                :title="item.itemNm + ' 적용 여부'"
            >
          </td>

        </tr>
        </tbody>
        <tfoot>
        <tr class="table-footer">
          <td colspan="6" class="text-center">전체 합계</td>
          <td class="text-right">{{ formatCurrency(totalSummary.gross) }}</td>
          <td class="text-right text-red">{{ formatCurrency(totalSummary.ded) }}</td>

          <td :colspan="payItems.length" class="bg-light-gray"></td>
          <td :colspan="deductionItems.length * 2" class="bg-light-gray text-center fw-bold">
            실 지급액 합계: <span class="text-blue">{{ formatCurrency(totalSummary.net) }}</span> 원
          </td>
        </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* 기존에 제공해드린 가로 스크롤 및 테이블 디자인 CSS 유지 */
/* .payroll-staff-list-page { padding: 20px; } */
.payroll-staff-list-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
}
.search-panel {
  display: flex; align-items: center; gap: 15px; background-color: #ffffff;
  padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px;
}
.input-group {
  display: flex;
  align-items: center;
}
.input-label {
  margin-right: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #4b5563;
  white-space: nowrap;
}
.input-text,
.input-select {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.9rem;
  transition: border-color 0.2s;
}
.input-select:focus {
  border-color: #3b82f6;
  outline: none;
}
.search-term-group{gap: 8px;}
.btn { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: background-color 0.2s; white-space: nowrap; }
.btn-primary { background-color: #3b82f6; color: white; }
.btn-success { background-color: #10b981; color: white; }

.data-table th, .data-table td {
  padding: 10px; border: 1px solid #e5e7eb; font-size: 0.85rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.data-table th { background-color: #f9fafb; color: #374151; font-weight: 600; }

.group-header-pay { background-color: #eff6ff !important; color: #2563eb; }
.group-header-deduction { background-color: #fef2f2 !important; color: #ef4444; }
.group-header-summary { background-color: #f3f4f6 !important; }

.inline-input {
  width: 100%; border: 1px solid transparent; padding: 4px; text-align: right;
  font-size: 0.85rem; border-radius: 4px; transition: all 0.2s; background: transparent;
}
.inline-input:hover { border-color: #d1d5db; background-color: #f8fafc; }
.inline-input:focus { outline: none; border-color: #3b82f6; background-color: #fff; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }

.table-footer { background-color: #f8fafc; font-weight: bold; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-red { color: #ef4444; }
.text-blue { color: #2563eb; }
.amount-cell { font-weight: 600; }
.bg-light-gray { background-color: #f8fafc; }

input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
</style>
