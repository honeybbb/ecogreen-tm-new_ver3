<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();
const route = useRoute();

const {
  positionOptions,
  typeOptions,
  fetchPositionOptions,
  fetchTypeOptions
} = useApi();

// 현재 단계
const currentStep = ref(1);
const totalSteps = 4;

// 진행도
const progressPercentage = computed(() => {
  return (currentStep.value / totalSteps) * 100;
});

// 단계별 정보
const steps = [
  { number: 1, title: '기본 정보', icon: 'mdi-office-building' },
  { number: 2, title: '주소 정보', icon: 'mdi-map-marker' },
  { number: 3, title: '계약 정보', icon: 'mdi-file-document' },
  { number: 4, title: '담당자 정보', icon: 'mdi-account-tie' }
];

// 현장 기본 정보
const site = ref({
  siteName: '',
  siteId: '',
  siteType: '',
  postalCode: '',
  addressMain: '',
  addressDetail: '',
  latitude: '',
  longitude: '',
  area: '',
  is_vat: false,
  building_su: '',
  unit_su: '',
  managerName: '',
  managerContact: '',
  director: '',
  directorContact: '',
  memo: '',
  status: '준비 중',
  payment_day: '',
  bigo: ''
});

// 계약 그룹
const contractGroups = ref([]);

// 옵션 데이터
const siteTypeOptions = ref(['아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const statusOptions = ref(['준비 중', '운영 중', '계약 종료']);

// 비고 히스토리
const bigoHistory = ref([]);

// 주소 입력 ref
const detailInput = ref(null);

// 계약 그룹 추가
const addContractGroup = (category) => {
  contractGroups.value.push({
    category: category.itemNm,
    type: category.itemCd,
    contractStart: '',
    contractEnd: '',
    totalCost: 0,
    workDays: '',
    workSchedule: '',
    breakTime: '',
    staffList: [],
    tempJobCode: '',
    tempCount: 1
  });
};

// 계약 그룹 삭제
const removeContractGroup = (index) => {
  if(confirm('해당 계약 정보를 삭제하시겠습니까?')) {
    contractGroups.value.splice(index, 1);
  }
};

// 인원 추가
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

  const jobInfo = positionOptions.value.find(p => p.itemCd === group.tempJobCode);

  group.staffList.push({
    code: jobInfo.itemCd,
    name: jobInfo.itemNm,
    count: Number(group.tempCount)
  });

  group.tempJobCode = '';
  group.tempCount = 1;
};

// 인원 삭제
const removeStaffFromGroup = (groupIndex, staffIndex) => {
  contractGroups.value[groupIndex].staffList.splice(staffIndex, 1);
};

// 그룹별 인원 합계
const getGroupStaffTotal = (group) => {
  return group.staffList.reduce((sum, item) => sum + item.count, 0);
};

// 계약 기간 계산
const getContractDuration = (group) => {
  if (!group.contractStart || !group.contractEnd) return '';

  const start = new Date(group.contractStart);
  const end = new Date(group.contractEnd);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const months = Math.floor(diffDays / 30);
  const years = Math.floor(months / 12);

  if (years > 0) {
    const remainMonths = months % 12;
    return remainMonths > 0 ? `${years}년 ${remainMonths}개월` : `${years}년`;
  }
  return `${months}개월`;
};

// 폼 제출
const handleSubmit = () => {
  const contractsJson = JSON.stringify(contractGroups.value);

  let params = {
    cIdx: 1,
    sIdx: route.query.idx || '',
    sType: site.value.siteType,
    name: site.value.siteName,
    site_id: site.value.siteId,
    status: site.value.status,
    area: site.value.area,
    is_vat: site.value.is_vat ? 'Y' : 'N',
    building_su: site.value.building_su,
    unit_su: site.value.unit_su,
    address: site.value.addressMain,
    addressDetail: site.value.addressDetail,
    payment_day: site.value.payment_day,
    manager: site.value.managerName,
    phone: site.value.managerContact,
    director: site.value.director,
    directorContact: site.value.directorContact,
    bigo: site.value.bigo,
    contract_details: contractsJson
  };

  axios.post(`/api/v1/site/register`, params)
      .then(res => {
        alert(`${site.value.siteName} 현장이 등록되었습니다.`);
        router.push('/site/list');
      })
      .catch(err => {
        console.error(err);
        alert('오류가 발생했습니다.');
      });
};

// 데이터 로드
const getSiteData = async () => {
  const sIdx = route.query.idx;
  if (!sIdx) return;

  axios.get(`/api/v1/site/data/${sIdx}`)
      .then(res => {
        let result = res.data.data[0];
        if(result) {
          site.value.siteName = result.name;
          site.value.siteId = result.site_id;
          site.value.siteType = result.sType;
          site.value.status = result.status == 'Y' ? '운영 중' : '계약 종료';
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
            });
          });
          contractGroups.value = arr;

          if (result.bigoList) {
            try {
              bigoHistory.value = JSON.parse(result.bigoList);
              bigoHistory.value.sort((a, b) => new Date(b.regDt) - new Date(a.regDt));
            } catch (e) {
              bigoHistory.value = [];
            }
          }
          site.value.bigo = '';
        }
      });
};

// 주소 검색
const loadDaumPostcodeScript = () => {
  return new Promise((resolve) => {
    if (window.kakao && window.kakao.Postcode) {
      resolve(window.kakao.Postcode);
      return;
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
        if (data.buildingName !== '' && data.apartment === 'Y') {
          extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName);
        }
        if (extraAddr !== '') addr += ' (' + extraAddr + ')';
      }
      site.value.postalCode = data.zonecode;
      site.value.addressMain = addr;
      site.value.addressDetail = '';
      if (detailInput.value) detailInput.value.focus();
    }
  }).open();
};

// 취소
const handleCancel = () => {
  if (confirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) {
    router.push('/site/list');
  }
};

// 단계 이동
const nextStep = () => {
  if (currentStep.value < totalSteps) {
    currentStep.value++;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--;
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <!--button @click="handleCancel" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button-->
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-office-building-plus"></i>
            현장 등록
          </h1>
          <p class="page-subtitle">새로운 현장 정보를 등록합니다</p>
        </div>
      </div>
      <div class="header-actions">
        <button @click="handleCancel" class="btn-cancel">
          <i class="mdi mdi-close"></i>
          <span>취소</span>
        </button>
      </div>
    </div>

    <!-- 진행 단계 -->
    <div class="steps-container">
      <div class="steps-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
        </div>
      </div>

      <div class="steps-list">
        <div
            v-for="step in steps"
            :key="step.number"
            :class="['step-item', {
            active: currentStep === step.number,
            completed: currentStep > step.number
          }]"
        >
          <div class="step-circle">
            <i v-if="currentStep > step.number" class="mdi mdi-check"></i>
            <i v-else-if="currentStep === step.number" :class="['mdi', step.icon]"></i>
            <span v-else>{{ step.number }}</span>
          </div>
          <div class="step-info">
            <span class="step-number">STEP {{ step.number }}</span>
            <span class="step-title">{{ step.title }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 폼 컨테이너 -->
    <form @submit.prevent="handleSubmit">
      <div class="form-container">
        <!-- Step 1: 기본 정보 -->
        <div v-show="currentStep === 1" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-office-building"></i>
            <h2>현장 기본 정보</h2>
          </div>

          <div class="form-grid">
            <!-- 현장명 -->
            <div class="form-group full-width">
              <label class="form-label required">
                <i class="mdi mdi-office-building"></i>
                현장명
              </label>
              <input
                  type="text"
                  v-model="site.siteName"
                  required
                  class="form-input"
                  placeholder="예: LH 위례 6단지"
              />
            </div>

            <!-- 현장 코드 -->
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-barcode"></i>
                현장 코드
              </label>
              <input
                  type="text"
                  v-model="site.siteId"
                  class="form-input"
                  placeholder="선택사항"
              />
            </div>

            <!-- 현장 형태 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-tag"></i>
                현장 형태
              </label>
              <select v-model="site.siteType" required class="form-select">
                <option value="">선택하세요</option>
                <option v-for="type in siteTypeOptions" :key="type" :value="type">
                  {{ type }}
                </option>
              </select>
            </div>

            <!-- 현장 상태 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-flag"></i>
                현장 상태
              </label>
              <div class="radio-group">
                <label v-for="status in statusOptions" :key="status" class="radio-label">
                  <input type="radio" v-model="site.status" :value="status" />
                  <span class="radio-text">{{ status }}</span>
                </label>
              </div>
            </div>

            <!-- 관리면적 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-ruler-square"></i>
                관리면적 (㎡)
              </label>
              <div class="area-wrapper">
                <input
                    type="text"
                    v-model="site.area"
                    required
                    class="form-input"
                    placeholder="예: 150.5"
                />
                <label class="checkbox-inline">
                  <input type="checkbox" v-model="site.is_vat" />
                  <span>135㎡ 초과</span>
                </label>
              </div>
            </div>

            <!-- 건물 수 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-office-building-outline"></i>
                건물 수
              </label>
              <input
                  type="number"
                  v-model="site.building_su"
                  required
                  class="form-input"
                  placeholder="0"
              />
            </div>

            <!-- 세대 수 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-home-group"></i>
                세대 수
              </label>
              <input
                  type="number"
                  v-model="site.unit_su"
                  required
                  class="form-input"
                  placeholder="0"
              />
            </div>

            <!-- 급여지급일 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-calendar"></i>
                급여지급일
              </label>
              <select v-model="site.payment_day" required class="form-select">
                <option value="">선택</option>
                <option v-for="day in 31" :key="day" :value="day">
                  {{ day }}일
                </option>
              </select>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="nextStep" class="btn-next">
              다음 단계
              <i class="mdi mdi-arrow-right"></i>
            </button>
          </div>
        </div>

        <!-- Step 2: 주소 정보 -->
        <div v-show="currentStep === 2" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-map-marker"></i>
            <h2>주소 정보</h2>
          </div>

          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label required">
                <i class="mdi mdi-map-marker"></i>
                주소
              </label>
              <div class="address-search-group">
                <input
                    type="text"
                    v-model="site.postalCode"
                    placeholder="우편번호"
                    required
                    class="form-input postal-input"
                    readonly
                />
                <button type="button" @click="searchAddress" class="btn-search-address">
                  <i class="mdi mdi-magnify"></i>
                  주소 검색
                </button>
              </div>
            </div>

            <div class="form-group full-width">
              <input
                  type="text"
                  v-model="site.addressMain"
                  placeholder="기본 주소"
                  required
                  class="form-input"
                  readonly
              />
            </div>

            <!--div class="form-group full-width">
              <input
                  type="text"
                  v-model="site.addressDetail"
                  placeholder="상세 주소 (예: A동 101호)"
                  class="form-input"
                  ref="detailInput"
              />
            </div-->
          </div>

          <div class="form-actions">
            <button type="button" @click="prevStep" class="btn-prev">
              <i class="mdi mdi-arrow-left"></i>
              이전
            </button>
            <button type="button" @click="nextStep" class="btn-next">
              다음 단계
              <i class="mdi mdi-arrow-right"></i>
            </button>
          </div>
        </div>

        <!-- Step 3: 계약 정보 -->
        <div v-show="currentStep === 3" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-file-document"></i>
            <h2>계약 및 인원 정보</h2>
          </div>

          <div class="contract-header">
            <p class="contract-description">
              현장의 계약 정보를 추가합니다. 경비, 미화 등 구분별로 계약을 등록할 수 있습니다.
            </p>
            <div class="contract-actions">
              <button
                  v-for="cat in typeOptions"
                  :key="cat.itemCd"
                  type="button"
                  @click="addContractGroup(cat)"
                  class="btn-add-contract"
              >
                <i class="mdi mdi-plus"></i>
                {{ cat.itemNm }} 추가
              </button>
            </div>
          </div>

          <div v-if="contractGroups.length === 0" class="empty-contracts">
            <i class="mdi mdi-file-document-outline"></i>
            <p>등록된 계약이 없습니다</p>
            <span>상단 버튼을 눌러 계약 정보를 추가해주세요</span>
          </div>

          <div v-for="(group, idx) in contractGroups" :key="idx" class="contract-card">
            <div class="contract-card-header">
              <div class="contract-title">
                <span :class="['contract-badge', `badge-${group.category}`]">
                  <i class="mdi mdi-briefcase"></i>
                  {{ group.category }}
                </span>
                <span v-if="getContractDuration(group)" class="contract-duration">
                  <i class="mdi mdi-calendar-range"></i>
                  {{ getContractDuration(group) }}
                </span>
              </div>
              <button type="button" @click="removeContractGroup(idx)" class="btn-remove-contract">
                <i class="mdi mdi-delete"></i>
              </button>
            </div>

            <div class="contract-card-body">
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label required">
                    <i class="mdi mdi-calendar-start"></i>
                    계약 시작일
                  </label>
                  <input type="date" v-model="group.contractStart" required class="form-input" />
                </div>

                <div class="form-group">
                  <label class="form-label required">
                    <i class="mdi mdi-calendar-end"></i>
                    계약 종료일
                  </label>
                  <input type="date" v-model="group.contractEnd" required class="form-input" />
                </div>

                <div class="form-group">
                  <label class="form-label required">
                    <i class="mdi mdi-calendar-month"></i>
                    근무 일수 (월)
                  </label>
                  <input
                      type="number"
                      v-model="group.workDays"
                      placeholder="예: 25"
                      class="form-input"
                  />
                </div>

                <div class="form-group full-width">
                  <label class="form-label required">
                    <i class="mdi mdi-clock-outline"></i>
                    근무 시간 및 형태
                  </label>
                  <textarea
                      v-model="group.workSchedule"
                      rows="2"
                      class="form-textarea"
                      placeholder="예: 격일제 교대 근무 (09:00 ~ 익일 09:00)"
                  ></textarea>
                </div>

                <div class="form-group full-width">
                  <label class="form-label">
                    <i class="mdi mdi-coffee"></i>
                    휴게 시간
                  </label>
                  <input
                      type="text"
                      v-model="group.breakTime"
                      class="form-input"
                      placeholder="예: 주간 2시간, 야간 4시간"
                  />
                </div>
              </div>

              <!-- 인원 구성 -->
              <div class="staff-section">
                <label class="section-label">
                  <i class="mdi mdi-account-group"></i>
                  인원 구성
                </label>

                <div class="staff-input-group">
                  <select v-model="group.tempJobCode" class="form-select staff-position">
                    <option value="">직책 선택</option>
                    <option v-for="opt in positionOptions" :key="opt.itemCd" :value="opt.itemCd">
                      {{ opt.itemNm }}
                    </option>
                  </select>
                  <input
                      type="number"
                      v-model="group.tempCount"
                      min="1"
                      class="form-input staff-count"
                      placeholder="인원"
                  />
                  <button type="button" @click="addStaffToGroup(idx)" class="btn-add-staff">
                    <i class="mdi mdi-plus"></i>
                    추가
                  </button>
                </div>

                <div v-if="group.staffList && group.staffList.length > 0" class="staff-list">
                  <div v-for="(staff, sIdx) in group.staffList" :key="sIdx" class="staff-item">
                    <div class="staff-info">
                      <i class="mdi mdi-account"></i>
                      <span class="staff-position-name">{{ staff.name }}</span>
                      <span class="staff-count-badge">{{ staff.count }}명</span>
                    </div>
                    <button type="button" @click="removeStaffFromGroup(idx, sIdx)" class="btn-remove-staff">
                      <i class="mdi mdi-close"></i>
                    </button>
                  </div>
                  <div class="staff-total">
                    <i class="mdi mdi-sigma"></i>
                    <span>합계: <strong>{{ getGroupStaffTotal(group) }}명</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="prevStep" class="btn-prev">
              <i class="mdi mdi-arrow-left"></i>
              이전
            </button>
            <button type="button" @click="nextStep" class="btn-next">
              다음 단계
              <i class="mdi mdi-arrow-right"></i>
            </button>
          </div>
        </div>

        <!-- Step 4: 담당자 정보 -->
        <div v-show="currentStep === 4" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-account-tie"></i>
            <h2>담당자 및 기타 정보</h2>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-account"></i>
                본사 담당자 이름
              </label>
              <input
                  type="text"
                  v-model="site.managerName"
                  class="form-input"
                  placeholder="홍길동"
              />
            </div>

            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-phone"></i>
                본사 담당자 연락처
              </label>
              <input
                  type="tel"
                  v-model="site.managerContact"
                  class="form-input"
                  placeholder="010-0000-0000"
              />
            </div>

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-hard-hat"></i>
                관리 소장 이름
              </label>
              <input
                  type="text"
                  v-model="site.director"
                  required
                  class="form-input"
                  placeholder="김관리"
              />
            </div>

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-phone"></i>
                관리 소장 연락처
              </label>
              <input
                  type="tel"
                  v-model="site.directorContact"
                  required
                  class="form-input"
                  placeholder="010-0000-0000"
              />
            </div>

            <!-- 비고 히스토리 -->
            <div class="form-group full-width">
              <label class="section-label">
                <i class="mdi mdi-note-text"></i>
                특이사항 및 메모
              </label>

              <div v-if="bigoHistory.length > 0" class="memo-history">
                <div class="history-header">
                  <i class="mdi mdi-history"></i>
                  <span>히스토리 ({{ bigoHistory.length }}건)</span>
                </div>
                <div class="history-list">
                  <div v-for="(item, idx) in bigoHistory" :key="idx" class="history-item">
                    <span class="history-date">{{ item.regDt ? item.regDt.substring(0, 10) : '-' }}</span>
                    <p class="history-content">{{ item.bigo }}</p>
                  </div>
                </div>
              </div>

              <textarea
                  v-model="site.bigo"
                  class="form-textarea"
                  rows="4"
                  placeholder="추가할 특이사항을 입력하세요 (저장 시 히스토리에 추가됩니다)"
              ></textarea>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="prevStep" class="btn-prev">
              <i class="mdi mdi-arrow-left"></i>
              이전
            </button>
            <button type="submit" class="btn-submit">
              <i class="mdi mdi-check"></i>
              등록 완료
            </button>
          </div>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.btn-back {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-back:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-back i {
  font-size: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title i {
  font-size: 32px;
  color: #667eea;
}

.page-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  color: #64748b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-cancel:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
}

.btn-cancel i {
  font-size: 18px;
}

/* === 진행 단계 === */
.steps-container {
  background: white;
  border-radius: 16px;
  padding: 28px;
  margin-bottom: 28px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.steps-progress {
  margin-bottom: 24px;
}

.progress-bar {
  height: 8px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s ease;
}

.steps-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  transition: all 0.2s;
}

.step-item.active {
  background: #eff6ff;
}

.step-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  flex-shrink: 0;
  transition: all 0.3s;
}

.step-item.active .step-circle {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.step-item.completed .step-circle {
  background: #10b981;
  color: white;
}

.step-circle i {
  font-size: 24px;
}

.step-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-number {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
}

.step-title {
  font-size: 14px;
  color: #1e293b;
  font-weight: 600;
}

.step-item.active .step-number,
.step-item.active .step-title {
  color: #667eea;
}

/* === 폼 컨테이너 === */
.form-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.form-step {
  padding: 32px;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 20px;
  margin-bottom: 28px;
  border-bottom: 2px solid #f1f5f9;
}

.step-header i {
  font-size: 32px;
  color: #667eea;
}

.step-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

/* === 폼 그리드 === */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-label,
.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
}

.form-label i,
.section-label i {
  font-size: 16px;
  color: #667eea;
}

.form-label.required::after {
  content: '*';
  color: #ef4444;
  margin-left: 4px;
}

.form-input,
.form-select,
.form-textarea {
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  color: #334155;
  transition: all 0.2s;
  background: white;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-input::placeholder {
  color: #94a3b8;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
}

/* 라디오 그룹 */
.radio-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;
  background: white;
}

.radio-label:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.radio-label input[type="radio"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.radio-text {
  font-size: 14px;
  color: #64748b;
}

/* 면적 입력 */
.area-wrapper {
  display: flex;
  gap: 12px;
  align-items: center;
}

.area-wrapper .form-input {
  flex: 1;
}

.checkbox-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #ef4444;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.checkbox-inline input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* 주소 검색 */
.address-search-group {
  display: flex;
  gap: 12px;
}

.postal-input {
  width: 140px;
}

.btn-search-address {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.btn-search-address:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-search-address i {
  font-size: 18px;
}

/* === 계약 섹션 === */
.contract-header {
  margin-bottom: 24px;
}

.contract-description {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 16px 0;
}

.contract-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-add-contract {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: white;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  color: #667eea;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-contract:hover {
  background: #f8fafc;
  border-color: #667eea;
}

.btn-add-contract i {
  font-size: 16px;
}

.empty-contracts {
  text-align: center;
  padding: 60px 20px;
  background: #fafbfc;
  border-radius: 12px;
  border: 2px dashed #e2e8f0;
  color: #94a3b8;
}

.empty-contracts i {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-contracts p {
  font-size: 16px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 8px 0;
}

.empty-contracts span {
  font-size: 13px;
}

/* 계약 카드 */
.contract-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 20px;
  overflow: hidden;
}

.contract-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.contract-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.contract-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: white;
}

.contract-badge i {
  font-size: 16px;
}

.badge-경비 { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
.badge-미화 { background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); }
.badge-시설 { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }

.contract-duration {
  font-size: 13px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
}

.contract-duration i {
  font-size: 16px;
}

.btn-remove-contract {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #fef2f2;
  border: none;
  color: #dc2626;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-remove-contract:hover {
  background: #fee2e2;
}

.btn-remove-contract i {
  font-size: 18px;
}

.contract-card-body {
  padding: 24px;
}

/* 인원 섹션 */
.staff-section {
  margin-top: 24px;
  padding: 20px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.staff-input-group {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.staff-position {
  flex: 1;
}

.staff-count {
  width: 100px;
}

.btn-add-staff {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.btn-add-staff:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.btn-add-staff i {
  font-size: 16px;
}

.staff-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.staff-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.staff-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.staff-info i {
  font-size: 18px;
  color: #667eea;
}

.staff-position-name {
  font-size: 14px;
  color: #1e293b;
  font-weight: 500;
}

.staff-count-badge {
  padding: 4px 10px;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.btn-remove-staff {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #fef2f2;
  border: none;
  color: #dc2626;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-remove-staff:hover {
  background: #fee2e2;
}

.btn-remove-staff i {
  font-size: 16px;
}

.staff-total {
  margin-top: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #1e40af;
  font-weight: 600;
}

.staff-total i {
  font-size: 18px;
}

/* 메모 히스토리 */
.memo-history {
  margin-bottom: 16px;
  background: #fafbfc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.history-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.history-header i {
  font-size: 16px;
}

.history-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;
}

.history-item {
  padding: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 8px;
}

.history-item:last-child {
  margin-bottom: 0;
}

.history-date {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
  display: block;
  margin-bottom: 6px;
}

.history-content {
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  margin: 0;
}

/* === 폼 액션 === */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 24px;
  border-top: 1px solid #f1f5f9;
}

.btn-prev,
.btn-next,
.btn-submit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-prev {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-prev:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-next,
.btn-submit {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-next:hover,
.btn-submit:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.btn-prev i,
.btn-next i,
.btn-submit i {
  font-size: 18px;
}

/* === 반응형 === */
@media (max-width: 1024px) {
  .steps-list {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
  }

  .btn-cancel {
    width: 100%;
    justify-content: center;
  }

  .steps-list {
    grid-template-columns: 1fr;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .address-search-group {
    flex-direction: column;
  }

  .postal-input {
    width: 100%;
  }

  .btn-search-address {
    width: 100%;
    justify-content: center;
  }

  .area-wrapper {
    flex-direction: column;
    align-items: stretch;
  }

  .staff-input-group {
    flex-direction: column;
  }

  .staff-count {
    width: 100%;
  }

  .contract-actions {
    flex-direction: column;
  }

  .btn-add-contract {
    width: 100%;
    justify-content: center;
  }
}
</style>
