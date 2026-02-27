<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from "axios";

const router = useRouter();
const route = useRoute();
const {
  positionOptions,
  typeOptions,
  fetchPositionOptions,
  fetchTypeOptions
} = useApi();

// 1. [공통] 현장 기본 정보 (변하지 않는 전역 정보)
const site = ref({
  siteName: '',
  siteId: '',
  siteType: '',
  postalCode: '',
  addressMain: '',
  addressDetail: '',

  latitude: '',   // ✅ 위도
  longitude: '',  // ✅ 경도

  // 관리 면적 및 규모
  area: '',
  is_vat: false,//135㎡ 초과 여부 추가 (기본값 false)
  building_su: '',
  unit_su: '',

  // 담당자 정보 (현장 전체 총괄)
  managerName: '',      // 본사 담당자
  managerContact: '',
  director: '',         // 관리 소장
  directorContact: '',

  memo: '',
  status: '준비 중',
  payment_day: '',//급여일
});

// 2. [핵심] 다중 계약 관리 배열
// 구조: [{ category: '경비', contractStart: '...', totalCost: 100, staffList: [], ... }]
const contractGroups = ref([]);

// 3. 옵션 데이터
const siteTypeOptions = ref(['아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const statusOptions = ref(['준비 중', '운영 중', '계약 종료']);
// const categoryOptions = ref(['경비', '미화', /*'시설', '관리', '기타'*/]); // 계약 분야
// const positionOptions = ref([]); // 직책 리스트 (API 로드)

const bigoHistory = ref([]);

// 주소 포커싱용
const detailInput = ref(null);

// ==========================================
// 로직 1. 계약 그룹(카드) 추가/삭제
// ==========================================

const addContractGroup = (category) => {
  contractGroups.value.push({
    category: category.itemNm,        // 분야 (경비, 미화 등)
    type: category.itemCd,        // 분야 (경비, 미화 등)
    contractStart: '',         // 시작일
    contractEnd: '',           // 종료일
    totalCost: 0,              // 도급비
    workDays: '',              // 근무 일수
    workSchedule: '',          // 근무 형태
    breakTime: '',             // 휴게 시간
    staffList: [],             // 해당 계약의 투입 인원 리스트

    // [UI 제어용 임시 변수]
    tempJobCode: '',
    tempCount: 1
  });
};

const removeContractGroup = (index) => {
  if(confirm('해당 계약 정보를 삭제하시겠습니까?')) {
    contractGroups.value.splice(index, 1);
  }
};

// ==========================================
// 로직 2. 각 계약 내 인원 추가/삭제
// ==========================================

const addStaffToGroup = (groupIndex) => {
  const group = contractGroups.value[groupIndex];

  if (!group.tempJobCode) {
    alert('직책을 선택해주세요.');
    return;
  }
  if (group.tempCount < 1) {
    alert('1명 이상 입력해주세요.');
    return;
  }

  // 직책명 찾기
  const jobInfo = positionOptions.value.find(p => p.itemCd === group.tempJobCode);

  console.log(jobInfo, group.staffList, 'd')

  // 해당 그룹의 staffList에 추가
  group.staffList.push({
    code: jobInfo.itemCd,
    name: jobInfo.itemNm,
    count: Number(group.tempCount)
  });

  // 입력창 초기화
  group.tempJobCode = '';
  group.tempCount = 1;
};

const removeStaffFromGroup = (groupIndex, staffIndex) => {
  contractGroups.value[groupIndex].staffList.splice(staffIndex, 1);
};

// 그룹별 인원 합계 계산
const getGroupStaffTotal = (group) => {
  return group.staffList.reduce((sum, item) => sum + item.count, 0);
};

// ==========================================
// 로직 3. API 통신
// ==========================================
/*
const getPositionOptions = async () => {
  try {
    const groupCd = '01002';
    const res = await axios.get(`/api/v1/code/${groupCd}`);
    positionOptions.value = res.data.data;
  } catch (err) {
    console.error(err);
  }
};

 */

const handleSubmit = () => {
  // 계약 정보를 JSON 문자열로 변환
  const contractsJson = JSON.stringify(contractGroups.value);

  console.log('전송 데이터:', site.value, contractsJson);

  let params = {
    cIdx : 1,
    sIdx: route.query.idx || '',
    sType: site.value.siteType,
    // 기본 정보
    name: site.value.siteName,
    site_id: site.value.siteId,
    status: site.value.status,
    area: site.value.area,
    is_vat: site.value.is_vat ? 'Y':'N',
    building_su: site.value.building_su,
    unit_su: site.value.unit_su,
    address: site.value.addressMain,
    addressDetail: site.value.addressDetail,
    payment_day: site.value.payment_day,

    // 담당자 정보
    manager: site.value.managerName,
    phone: site.value.managerContact,
    director: site.value.director,
    directorContact: site.value.directorContact,
    bigo: site.value.bigo,

    // [핵심] 상세 계약 정보 (JSON String)
    contract_details: contractsJson
  }

  axios.post(`/api/v1/site/register`, params)
      .then(res => {
        alert(`${site.value.siteName} 현장이 등록되었습니다.`);
        //router.push('/site');
      })
      .catch(err => {
        console.error(err);
        alert('오류가 발생했습니다.');
      });
};

const getSiteData = async () => {
  const sIdx = route.query.idx;
  if (!sIdx) return;
  axios.get(`/api/v1/site/data/${sIdx}`)
      .then(res => {
        console.log(res.data.data)
        let result = res.data.data[0];
        if(result) {
          site.value.siteName = result.name;
          site.value.siteId = result.site_id;
          site.value.siteType = result.sType;
          site.value.status = result.status == 'Y'?'운영 중':'계약 종료';
          site.value.area = result.area;
          site.value.is_vat = result.is_vat;
          site.value.addressMain = result.address;
          site.value.addressDetail = result.address_detail;
          site.value.building_su = result.building_su;
          site.value.unit_su = result.unit_su;
          site.value.managerName = result.manager;
          site.value.managerContact = result.phone;
          site.value.director = result.director;
          site.value.directorContact = result.director_phone;
          site.value.payment_day = result.payment_day;

          //계약관련
          const contract = JSON.parse(result.contractList);
          const arr = [];
          contract.forEach((item) => {
            arr.push({
              category: item.category,
              type: item.type,
              contractStart: item.startDt,
              contractEnd: item.endDt,
              totalCost: 0,
              workDays: item.workDays,
              workSchedule: item.workSchedule,
              breakTime: item.breaktime,
              staffList: item.staffList,
              tempJobCode: "",
              tempCount: 1,
            })
          })
          contractGroups.value = arr;

          //비고관련
          if (result.bigoList) {
            try {
              // DB에서 가져온 JSON 문자열 파싱 -> 히스토리 배열에 저장
              bigoHistory.value = JSON.parse(result.bigoList);
              console.log(JSON.parse(result.bigoList));

              // 날짜(regDt) 기준 내림차순 정렬 (최신순)
              bigoHistory.value.sort((a, b) => new Date(b.regDt) - new Date(a.regDt));
            } catch (e) {
              bigoHistory.value = [];
            }
          }
          site.value.bigo = '';

        }
      })
}

// 주소 검색
const loadDaumPostcodeScript = () => {
  return new Promise((resolve) => {
    if (window.kakao && window.kakao.Postcode) {
      resolve(window.kakao.Postcode); return;
    }
    const script = document.createElement('script');
    script.src = '//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.onload = () => resolve(window.kakao.Postcode);
    document.head.appendChild(script);
  });
};
const searchAddress = async () => {
  await loadDaumPostcodeScript();
  new window.kakao.Postcode({
    oncomplete: (data) => {
      let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
      if (data.userSelectedType === 'R') {
        let extraAddr = '';
        if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) extraAddr += data.bname;
        if (data.buildingName !== '' && data.apartment === 'Y') extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName);
        if (extraAddr !== '') addr += ' (' + extraAddr + ')';
      }
      site.value.postalCode = data.zonecode;
      site.value.addressMain = addr;
      site.value.addressDetail = '';
      if (detailInput.value) detailInput.value.focus();
    }
  }).open();
};

const handleCancel = () => {
  if (confirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) {
    router.push('/site');
  }
};

onMounted(() => {
  fetchPositionOptions();
  fetchTypeOptions();
  getSiteData();
});
</script>

<template>
  <div class="site-register-page">
    <div class="page-header">
      <h2 class="page-title">현장 등록</h2>
    </div>

    <form @submit.prevent="handleSubmit" class="register-form">

      <section class="form-section">
        <h3 class="section-title">현장 기본 정보</h3>
        <div class="form-grid">
          <div class="input-field required">
            <label for="siteName">현장명</label>
            <input id="siteName" type="text" v-model="site.siteName" required class="input-text" />
          </div>
          <div class="input-field">
            <label for="siteId">현장 코드 (선택)</label>
            <input id="siteId" type="text" v-model="site.siteId" class="input-text" />
          </div>
          <div class="input-field required">
            <label for="siteType">현장 형태</label>
            <select id="siteType" v-model="site.siteType" required class="input-select">
              <option value="" disabled>선택하세요</option>
              <option v-for="type in siteTypeOptions" :key="type" :value="type">{{ type }}</option>
            </select>
          </div>
          <div class="input-field required">
            <label>현장 상태</label>
            <div class="radio-group">
              <label v-for="status in statusOptions" :key="status">
                <input type="radio" v-model="site.status" :value="status" :checked="site.status === status"> {{ status }}
              </label>
            </div>
          </div>
        </div>

        <div class="form-grid mt-4">
          <div class="input-field required">
            <label>관리면적 (㎡)</label>
            <div class="area-input-wrapper">
              <input type="text" v-model="site.area" required class="input-text" placeholder="예: 150.5" />
              <label class="checkbox-label">
                <input type="checkbox" v-model="site.is_vat" />
                <span>135㎡ 초과</span>
              </label>
            </div>
          </div>
          <div class="input-field required">
            <label>건물 수</label>
            <input type="text" v-model="site.building_su" required class="input-text" />
          </div>
          <div class="input-field required">
            <label>세대 수</label>
            <input type="text" v-model="site.unit_su" required class="input-text" />
          </div>
          <div class="input-field required">
            <label>급여지급일</label>
            <select v-model="site.payment_day" required class="input-text">
              <option value="" disabled>선택</option>
              <option v-for="day in 31" :key="day" :value="day">
                {{ day }}일
              </option>
            </select>
          </div>
        </div>
      </section>

      <section class="form-section">
        <h3 class="section-title">주소 정보</h3>
        <div class="input-field required full-width">
          <label for="postalCode">주소</label>
          <div class="address-input-group">
            <input id="postalCode" type="text" v-model="site.postalCode" placeholder="우편번호" required class="input-text postal-code-input" readonly />
            <button type="button" @click="searchAddress" class="btn btn-secondary address-search-btn">주소 검색</button>
          </div>
          <input type="text" v-model="site.addressMain" placeholder="기본 주소" required class="input-text mt-2" readonly />
          <input type="text" v-model="site.addressDetail" placeholder="상세 주소 (예: A동 101호)" class="input-text mt-2" ref="detailInput" />
        </div>
      </section>

      <section class="form-section bg-gray-50">
        <div class="section-header-row">
          <h3 class="section-title mb-0">계약 및 인원 상세 정보</h3>
          <div class="add-contract-group">
            <button
                v-for="cat in typeOptions" :key="cat.itemCd"
                type="button"
                @click="addContractGroup(cat)"
                class="btn btn-xs btn-outline-primary ml-1"
            >
              + {{ cat.itemNm }} 추가
            </button>
          </div>
        </div>

        <div class="info-text" v-if="contractGroups.length === 0">
          우측 상단의 버튼을 눌러 계약(경비, 미화 등) 정보를 추가해주세요.
        </div>
        <div v-for="(group, idx) in contractGroups" :key="idx" class="contract-card">
          <div class="card-header">
            <h4 class="card-title">
              <span class="badge" :class="group.category">{{ group.category }}</span>
              계약 상세
            </h4>
            <button type="button" @click="removeContractGroup(idx)" class="btn-text-red">삭제</button>
          </div>

          <div class="card-body">
            <div class="form-grid">
              <div class="input-field required">
                <label>계약 시작일</label>
                <input type="date" v-model="group.contractStart" required class="input-text" />
              </div>
              <div class="input-field required">
                <label>계약 종료일</label>
                <input type="date" v-model="group.contractEnd" required class="input-text" />
              </div>
              <!--div class="input-field required">
                <label>월 도급비 (원)</label>
                <input type="text" v-model="group.totalCost" required class="input-text" />
              </div-->
              <div class="input-field required">
                <label>근무 일수 (월)</label>
                <input type="number" v-model="group.workDays" placeholder="예: 25" class="input-text" />
              </div>
            </div>

            <div class="form-grid mt-4">
              <div class="input-field full-width required">
                <label>근무 시간 및 형태</label>
                <textarea v-model="group.workSchedule" rows="2" class="input-text" placeholder="예: 격일제 교대 근무 (09:00 ~ 익일 09:00)"></textarea>
              </div>
              <div class="input-field full-width">
                <label>휴게 시간</label>
                <input type="text" v-model="group.breakTime" class="input-text" placeholder="예: 주간 2시간, 야간 4시간" />
              </div>
            </div>

            <div class="staff-section mt-4">
              <label class="sub-label">인원 구성</label>

              <div class="staff-input-row">
                <select v-model="group.tempJobCode" class="input-select staff-select">
                  <option value="" disabled>직책 선택</option>
                  <option v-for="opt in positionOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
                </select>
                <input type="number" v-model="group.tempCount" min="1" class="input-text staff-count" placeholder="명" />
                <button type="button" @click="addStaffToGroup(idx)" class="btn btn-primary btn-sm">추가</button>
              </div>

              <div class="staff-tags" v-if="group.staffList && group.staffList.length > 0">
                <span v-for="(staff, sIdx) in group.staffList" :key="sIdx" class="staff-tag">
                  {{ staff.name }} <strong>{{ staff.count }}명</strong>
                  <i @click="removeStaffFromGroup(idx, sIdx)" class="close-icon">×</i>
                </span>
                <span class="total-badge">합계: {{ getGroupStaffTotal(group) }}명</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="form-section">
        <h3 class="section-title">담당자 및 기타 정보</h3>
        <div class="form-grid">
          <div class="input-field">
            <label for="managerName">본사 담당자 이름</label>
            <input id="managerName" type="text" v-model="site.managerName" class="input-text" />
          </div>
          <div class="input-field">
            <label for="managerContact">본사 담당자 연락처</label>
            <input id="managerContact" type="tel" v-model="site.managerContact" class="input-text" placeholder="010-XXXX-XXXX" />
          </div>
          <div class="input-field required">
            <label for="director">관리 소장 이름</label>
            <input id="director" type="text" v-model="site.director" required class="input-text" />
          </div>
          <div class="input-field required">
            <label for="directorContact">관리 소장 연락처</label>
            <input id="directorContact" type="tel" v-model="site.directorContact" required class="input-text" placeholder="010-XXXX-XXXX" />
          </div>
          <!--div class="input-field full-width">
            <label for="memo">특이사항 및 메모</label>
            <textarea id="memo" v-model="site.bigo" class="input-text" rows="3"></textarea>
          </div-->
        </div>
      </section>

      <section class="form-section">
        <h3 class="section-title">특이사항 및 메모</h3>

        <div class="history-container" v-if="bigoHistory.length > 0">
          <label class="sub-label">📝 히스토리 ({{ bigoHistory.length }}건)</label>
          <ul class="history-list">
            <li v-for="(item, idx) in bigoHistory" :key="idx" class="history-item">
              <div class="history-meta">
                <span class="history-date">{{ item.regDt ? item.regDt.substring(0, 10) : '날짜 없음' }}</span>
              </div>
              <p class="history-content">{{ item.bigo }}</p>
            </li>
          </ul>
        </div>
        <div v-else class="empty-history">
          등록된 특이사항 내역이 없습니다.
        </div>

        <div class="input-field full-width mt-4">
          <label for="memo">새로운 메모 추가</label>
          <textarea
              id="memo"
              v-model="site.bigo"
              class="input-text"
              rows="3"
              placeholder="추가할 특이사항을 입력하세요. (저장 시 히스토리에 추가됩니다)"
          ></textarea>
        </div>
      </section>

      <div class="button-group">
        <button type="button" @click="handleCancel" class="btn btn-secondary">취소</button>
        <button type="submit" class="btn btn-primary">현장 등록</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
/* === 공통 레이아웃 === */
.register-form {
  background-color: #ffffff;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.form-section {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 20px;
  margin-bottom: 30px;
}
.section-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: #1f2937;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 10px;
  margin-bottom: 15px;
}

/* === 그리드 시스템 === */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}
.input-field {
  display: flex;
  flex-direction: column;
}
.input-field label, .sub-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #4b5563;
  margin-bottom: 5px;
}
.input-field.required label:after {
  content: '*';
  color: #ef4444;
  margin-left: 4px;
}
.input-text, .input-select {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.9rem;
  transition: border-color 0.2s;
  background-color: #ffffff;
}
.input-text:focus, .input-select:focus {
  border-color: #3b82f6;
  outline: none;
}
.full-width {
  grid-column: 1 / -1;
}
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.ml-1 { margin-left: 4px; }
.mb-0 { margin-bottom: 0; }

/* === 주소 및 라디오 === */
.address-input-group {
  display: flex;
  gap: 8px;
  align-items: center;
}
.postal-code-input {
  flex-grow: 0;
  width: 120px;
  background-color: #f9fafb;
}
.address-search-btn {
  padding: 10px 15px;
  height: 42px;
}
.radio-group {
  display: flex;
  gap: 15px;
  padding-top: 5px;
}
.radio-group label {
  display: inline-flex;
  align-items: center;
  font-weight: 400;
  cursor: pointer;
}
.radio-group input { margin-right: 5px; }

/* === [NEW] 계약 카드 스타일 === */
.bg-gray-50 { background-color: #f9fafb; }
.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 10px;
  margin-bottom: 15px;
}
.contract-card {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  margin-bottom: 20px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.card-header {
  background: #f3f4f6;
  padding: 10px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
}
.card-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-body { padding: 20px; }

/* 뱃지 */
.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #fff;
  background: #6b7280;
}
.badge.경비 { background: #2563eb; }
.badge.미화 { background: #db2777; }
.badge.시설 { background: #059669; }

/* 인원 추가 영역 */
.staff-section {
  background: #f9fafb;
  padding: 15px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}
.staff-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.staff-select { width: 140px; }
.staff-count { width: 80px; }
.staff-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.staff-tag {
  background: #fff;
  border: 1px solid #d1d5db;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 6px;
}
.staff-tag strong { color: #2563eb; }
.close-icon {
  cursor: pointer;
  color: #9ca3af;
  font-weight: bold;
  line-height: 1;
}
.close-icon:hover { color: #ef4444; }
.total-badge {
  font-size: 0.85rem;
  font-weight: 700;
  color: #4b5563;
  margin-left: auto;
}

/* === 버튼 그룹 === */
.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
}
.btn-primary { background-color: #3b82f6; color: white; }
.btn-primary:hover { background-color: #2563eb; }
.btn-secondary { background-color: #f3f4f6; color: #4b5563; border: 1px solid #d1d5db; }
.btn-secondary:hover { background-color: #e5e7eb; }
.btn-sm { padding: 8px 16px; height: 42px; }
.btn-xs { padding: 4px 10px; font-size: 0.8rem; }
.btn-outline-primary {
  background: #fff;
  border: 1px solid #3b82f6;
  color: #3b82f6;
}
.btn-outline-primary:hover { background: #eff6ff; }
.btn-text-red {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
}
.info-text {
  text-align: center;
  color: #9ca3af;
  padding: 20px;
  font-size: 0.9rem;
}

/* === 비고 히스토리 스타일 === */
.history-container {
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 15px;
  max-height: 250px; /* 높이 제한 후 스크롤 */
  overflow-y: auto;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.history-item {
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 8px;
}
.history-item:last-child {
  margin-bottom: 0;
}

.history-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.history-date {
  font-size: 0.8rem;
  color: #9ca3af;
  font-weight: 500;
}

.history-content {
  font-size: 0.9rem;
  color: #374151;
  white-space: pre-wrap; /* 줄바꿈 유지 */
  margin: 0;
  line-height: 1.4;
}

.empty-history {
  text-align: center;
  padding: 20px;
  color: #9ca3af;
  background-color: #f9fafb;
  border-radius: 6px;
  font-size: 0.9rem;
  border: 1px dashed #d1d5db;
}

.sub-label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 8px;
}

/* 스크롤바 커스텀 (선택사항) */
.history-container::-webkit-scrollbar {
  width: 6px;
}
.history-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}
.history-container::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}
.history-container::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

.area-input-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.area-input-wrapper .input-text {
  flex: 1;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #ef4444; /* 강조하고 싶을 경우 빨간색 계열 사용 */
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
</style>
