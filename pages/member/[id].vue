<template>
  <!-- max-w-6xl로 최대 너비를 확장하고, mx-auto로 중앙 정렬합니다. -->
  <div class="member-detail-page">

    <!-- 페이지 헤더 및 액션 버튼 -->
    <div class="page-header flex justify-between">
      <h2 class="page-title">직원 상세 정보</h2>

      <!-- 상태 메시지 (저장/취소 시 피드백) -->
      <div v-if="statusMessage"
           :class="['text-sm px-3 py-1 rounded-full font-medium', statusClass]"
           role="alert">
        {{ statusMessage }}
      </div>

      <!-- 편집/저장/취소 버튼 그룹 -->
      <div class="button-group-header">
        <button v-if="!isEditMode" @click="toggleEditMode(true)" class="btn btn-primary">
          정보 수정
        </button>
        <button v-if="isEditMode" @click="handleSave" class="btn btn-success">
          저장
        </button>
        <button v-if="isEditMode" @click="toggleEditMode(false)" class="btn btn-secondary">
          취소
        </button>
      </div>
    </div>

    <!-- 상세 정보 폼 -->
    <form @submit.prevent="handleSave" class="detail-form">

      <!-- 1. 기본 정보 섹션 -->
      <section class="form-section">
        <h3 class="section-title">기본 정보</h3>
        <div class="form-grid">
          <div class="input-field required">
            <label for="type">구분</label>
            <p class="data-display">{{ employee.type }}</p>
          </div>

          <!-- 이름 (수정 가능) -->
          <div class="input-field required">
            <label for="name">이름</label>
            <input v-if="isEditMode" id="name" type="text" v-model="employee.name" class="input-text" placeholder="예: 김철수" />
            <p v-else class="data-display">{{ employee.name }}</p>
          </div>

          <!-- 사번 (읽기 전용) -->
          <div class="input-field required">
            <label for="id">사번</label>
            <p class="data-display">{{ employee.id }}</p>
          </div>

          <!-- 연락처 (수정 가능) -->
          <div class="input-field">
            <label for="phone">연락처</label>
            <input v-if="isEditMode" id="phone" type="tel" v-model="employee.phone" class="input-text" placeholder="예: 010-1234-5678" />
            <p v-else class="data-display">{{ employee.phone || 'N/A' }}</p>
          </div>

          <!-- ✅ 성별 (추가) -->
          <div class="input-field required">
            <label>성별</label>
            <div v-if="isEditMode" class="radio-group">
              <label>
                <input type="radio" value="M" v-model="employee.gender" />
                남
              </label>
              <label>
                <input type="radio" value="F" v-model="employee.gender" />
                여
              </label>
            </div>
            <p v-else class="data-display">
              {{ employee.gender == 'M'? '남':'여' || 'N/A' }}
            </p>
          </div>

          <!-- 이메일 (수정 가능) -->
          <div class="input-field">
            <label for="email">이메일</label>
            <input v-if="isEditMode" id="email" type="email" v-model="employee.email" class="input-text" />
            <p v-else class="data-display">{{ employee.email || 'N/A' }}</p>
          </div>

          <!-- 생년월일 (수정 가능) -->
          <div class="input-field">
            <label for="birthDate">생년월일</label>
            <input v-if="isEditMode" id="birthDate" type="date" v-model="employee.birthDate" class="input-text" />
            <p v-else class="data-display">{{ employee.birthDate || 'N/A' }}</p>
          </div>

          <!-- 주소 (수정 가능) -->
          <div class="input-field full-width">
            <label for="address">주소</label>
            <input v-if="isEditMode" id="address" type="text" v-model="employee.address" class="input-text" />
            <p v-else class="data-display">{{ employee.address || 'N/A' }}</p>
          </div>

        </div>
      </section>

      <section class="form-section">
        <h3 class="section-title">특이 사항</h3>
        <div class="form-grid">
          <!-- 장애 여부 -->
          <div class="input-field required">
            <label>장애여부</label>
            <div v-if="isEditMode" class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.disability" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.disability" />
                X
              </label>
            </div>
            <p v-else class="data-display">
              {{ employee.disability || 'N/A' }}
            </p>
          </div>

          <!-- 장애등록일 / 등급 (O일 때만 표시) -->
          <div v-if="employee.disability === 'Y'">
            <!-- 장애등록일 -->
            <div class="input-field">
              <label>장애등록일</label>
              <input
                  class="input-text"
                  v-if="isEditMode"
                  type="date"
                  v-model="employee.disability_date"
              />
              <p v-else class="data-display">
                {{ employee.disability_date ? employee.disability_date.split('T')[0] : 'N/A' }}
              </p>
            </div>
          </div>

          <!-- 장애등급 -->
          <div v-if="employee.disability === 'Y'">
            <div class="input-field">
              <label>장애등급</label>
              <input
                  class="input-text"
                  v-if="isEditMode"
                  type="text"
                  v-model="employee.disability_grade"
                  placeholder="예: 1급 / 경증 / 중증"
              />
              <p v-else class="data-display">
                {{ employee.disability_grade || 'N/A' }}
              </p>
            </div>
          </div>

          <!-- 새터민 여부 -->
          <div class="input-field required">
            <label>새터민 여부</label>
            <div v-if="isEditMode" class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.defector" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.defector" />
                X
              </label>
            </div>
            <p v-else class="data-display">
              {{ employee.defector || 'N/A' }}
            </p>
          </div>

          <!-- 국가유공자 여부 -->
          <div class="input-field required">
            <label>국가유공자 여부</label>
            <div v-if="isEditMode" class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.patriot" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.patriot" />
                X
              </label>
            </div>
            <p v-else class="data-display">
              {{ employee.patriot || 'N/A' }}
            </p>
          </div>

          <!-- 청년인턴 여부 -->
          <div class="input-field required">
            <label>청년인턴 여부</label>
            <div v-if="isEditMode" class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.intern" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.intern" />
                X
              </label>
            </div>
            <p v-else class="data-display">
              {{ employee.intern || 'N/A' }}
            </p>
          </div>

          <!-- 기초수급자 여부 -->
          <div class="input-field required">
            <label>기초수급자 여부</label>
            <div v-if="isEditMode" class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.beneficiary" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.beneficiary" />
                X
              </label>
            </div>
            <p v-else class="data-display">
              {{ employee.beneficiary || 'N/A' }}
            </p>
          </div>

          <!-- 외국인 여부 -->
          <div class="input-field required">
            <label>외국인 여부</label>
            <div v-if="isEditMode" class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.foreigner" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.foreigner" />
                X
              </label>
            </div>
            <p v-else class="data-display">
              {{ employee.foreigner || 'N/A' }}
            </p>
          </div>

          <!-- 국적 / 코드 / 비자만료일 체크 (O일 때만 표시) -->
          <div v-if="employee.foreigner === 'Y'">
            <!-- 국적 -->
            <div class="input-field">
              <label>국적</label>
              <input
                  class="input-text"
                  v-if="isEditMode"
                  type="text"
                  v-model="employee.nationality"
                  placeholder="예: 베트남, 중국"
              />
              <p v-else class="data-display">
                {{ employee.nationality || 'N/A' }}
              </p>
            </div>
          </div>

          <div v-if="employee.foreigner === 'Y'">
            <!-- 코드 -->
            <div class="input-field">
              <label>비자 코드</label>
              <input
                  class="input-text"
                  v-if="isEditMode"
                  type="text"
                  v-model="employee.visa_code"
                  placeholder="예: KR, CN"
              />
              <p v-else class="data-display">
                {{ employee.visa_code || 'N/A' }}
              </p>
            </div>
          </div>

          <!-- 비자만료일 -->
          <div v-if="employee.foreigner === 'Y'">
            <div class="input-field">
              <label>비자만료일</label>
              <input
                  class="input-text"
                  v-if="isEditMode"
                  type="date"
                  v-model="employee.visa_date"
              />
              <p v-else class="data-display">
                {{ employee.visa_date || 'N/A' }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 근로계약서 섹션 -->
      <section class="form-section flex justify-end">
        <h3 class="section-title">근로 계약</h3>
        <button type="button" @click="showModal = true" class="btn btn-info">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 inline-block" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 4a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
          </svg>
          근로계약서 보기
        </button>

      </section>

      <!-- 2. 현장 및 직무 정보 섹션 (퇴사 정보 포함) -->
      <section class="form-section">
        <h3 class="section-title">현장 및 직무 정보</h3>
        <div class="form-grid">

          <!-- 근무 현장 (수정 가능) -->
          <div class="input-field required">
            <label for="site">근무 현장</label>
            <select v-if="isEditMode" id="site" v-model="employee.sIdx" required class="input-select">
              <option v-for="site in siteOptions" :key="site" :value="site.idx">{{ site.name }}</option>
            </select>
            <p v-else class="data-display">{{ employee.site }}</p>
          </div>

          <!-- 직위 (수정 가능) -->
          <div class="input-field required">
            <label for="position">직위</label>
            <select v-if="isEditMode" id="position" v-model="employee.positionCd" required class="input-select">
              <option v-for="pos in positionOptions" :key="pos" :value="pos.itemCd">{{ pos.itemNm }}</option>
            </select>
            <p v-else class="data-display">{{ employee.position }}</p>
          </div>

          <!-- 입사일 (읽기 전용) -->
          <div class="input-field required">
            <label for="joinDate">입사일</label>
            <input v-if="isEditMode" id="joinDate" type="date" v-model="employee.joinDate" class="input-text" />
            <p v-else class="data-display">{{ employee.joinDate }}</p>
          </div>

          <!-- 재직 상태 (수정 가능) -->
          <div class="input-field">
            <label>재직 상태</label>
            <div v-if="isEditMode" class="radio-group">
              <label><input type="radio" v-model="employee.status" value="0"> 재직</label>
              <label><input type="radio" v-model="employee.status" value="1"> 퇴사</label>
            </div>
            <p v-else
               :class="{
                'text-green-600 font-semibold': employee.status == '0',
                'text-red-600 font-semibold': employee.status == '1'}"
               class="data-display">
              {{ employee.status == 0 ? '재직':'퇴사' }}
            </p>
          </div>

          <!-- 퇴사일 (퇴사 상태이거나 수정 모드일 때만 표시) -->
          <template v-if="employee.status == 1 && isEditMode">
            <div class="input-field" :class="{ 'required': employee.status == '1' }">
              <label for="departureDate">퇴사일</label>
              <input v-if="isEditMode" id="departureDate" type="date"
                     v-model="employee.departureDate"
                     :required="employee.status == '1'"
                     class="input-text" />
              <p v-else class="data-display">{{ employee.departureDate || 'N/A' }}</p>
            </div>
          </template>

          <!-- 퇴사 사유 (퇴사 상태이거나 수정 모드일 때만 표시) -->
          <template v-if="employee.status == 1 && isEditMode">
            <div class="input-field" :class="{ 'required': employee.status == '1' }">
              <label for="departureReason">퇴사 사유</label>
              <input v-if="isEditMode" id="departureReason" type="text"
                     v-model="employee.departureReason"
                     :required="employee.status == '1'"
                     class="input-text" />
              <p v-else class="data-display">{{ employee.departureReason || 'N/A' }}</p>
            </div>
          </template>

        </div>
      </section>

      <!-- 3. 금융 및 기타 정보 섹션 -->
      <section class="form-section">
        <h3 class="section-title">금융 및 기타 정보</h3>
        <div class="form-grid">

          <!-- 은행 (수정 가능) -->
          <div class="input-field">
            <label for="bankName">은행</label>
            <input v-if="isEditMode" id="bankName" type="text" v-model="employee.bankName" class="input-text" />
            <p v-else class="data-display">{{ employee.bankName || 'N/A' }}</p>
          </div>

          <!-- 계좌번호 (수정 가능) -->
          <div class="input-field">
            <label for="accountNumber">계좌번호</label>
            <input v-if="isEditMode" id="accountNumber" type="text" v-model="employee.accountNumber" class="input-text" placeholder="숫자만 입력" />
            <p v-else class="data-display">{{ employee.accountNumber || 'N/A' }}</p>
          </div>

          <!-- 비고 (수정 가능) -->
          <div class="input-field full-width">
            <label for="bigo">비고</label>
            <textarea v-if="isEditMode" id="bigo" v-model="employee.bigo" class="input-text h-20"></textarea>
            <p v-else class="data-display whitespace-pre-wrap">{{ employee.bigo || 'N/A' }}</p>
          </div>

        </div>
      </section>

    </form>

    <!-- 근로계약서 모달 (인라인 구현) -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-content">

        <div class="modal-header">
          <h3 class="modal-title">근로계약서</h3>
          <button @click="showModal = false" class="close-btn">&times;</button>
        </div>

        <div class="modal-body custom-scrollbar">

          <div class="contract-document contract-page">
            <!-- 상단 로고 + 제목 -->
            <div class="contract-header">
              <div class="contract-logo">
                <!-- 회사 로고 자리 (이미지 경로 맞게 수정) -->
                <!--img src="/eco-img.png" alt="에코그린TM 로고" /-->
              </div>
              <div class="contract-title-wrap">
                <h1 class="contract-title">근 로 계 약 서 {{ contractYear }}년</h1>
              </div>
            </div>

            <!-- 작성일 -->
            <p class="text-right text-sm mb-4">작성일: {{ employee.joinDate || '______-__-__' }}</p>

            <!-- 제1조 계약기간 -->
            <p class="contract-paragraph">
              ㈜에코그린티엠 대표이사 백송이(이하 “갑”이라 칭함)과 근로자
              <span class="underline-field">{{ employee.name }}</span>
              (이하 “을”이라 칭함)간에 취업규칙을 성실히 준수할 것을 서약하고
              다음과 같이 근로계약을 체결한다.
            </p>

            <h4 class="section-sub-title">제 1조 (근로계약 기간)</h4>
            <p class="contract-paragraph">
              1. 근로계약 기간은
              <span class="underline-field">{{ employee.contract.startDt || '____년 __월 __일' }}</span>
              부터
              <span v-if="!isContractEditMode" class="underline-field">2025년 12월 31일</span>
              <input v-else type="date" v-model="employee.contract.endDt"> 까지로 한다.
            </p>
            <p class="contract-paragraph">
              2. “을”의 계속 근무 의사가 있고 “갑”의 계약 갱신 필요성 및 사업장 운영 상황에 따라
              상호 협의 후 계약을 갱신할 수 있다.
            </p>

            <!-- 제2조 근무 장소 및 업무 내용 -->
            <h4 class="section-sub-title">제 2조 (근무 장소 및 업무 내용)</h4>
            <p class="contract-paragraph">
              1. 근무 장소는
              <span v-if="!isContractEditMode" class="underline-field">{{ employee.site || '________________' }}</span>
              <input v-else type="text" v-model="employee.site">으로 한다.<br>
              2. 직무는
              <span v-if="!isContractEditMode" class="underline-field">{{ employee.position || '________________' }}</span>
              <input v-else type="text" v-model="employee.position"> 업무 일체로 한다.
            </p>

            <!-- 제3조 소정근로시간 -->
            <h4 class="section-sub-title">제 3조 (근로시간 및 휴게)</h4>
            <p class="contract-paragraph">
              1. 소정근로시간은 1일 8시간, 1주 40시간을 원칙으로 한다.<br>
              2. 휴게시간은 1일 1시간으로 하되, 구체적인 시간은 현장 운영 사정에 따라 조정할 수 있다.
            </p>

            <!-- 제4조 임금 (표 형식) -->
            <h4 class="section-sub-title">제 4조 (임금)</h4>
            <table class="wage-table">
              <thead>
              <tr>
                <th>기본급</th>
                <!--th>직책수당</th-->
                <th>야간수당</th>
                <!--th>기타수당</th-->
                <th>계</th>
              </tr>
              </thead>
              <tbody>
              <tr>
                <!--td>￦ <span v-if="!isContractEditMode">________</span><input v-else type="text" class="wage-input"></td>
                <td>￦ <span v-if="!isContractEditMode">________</span><input v-else type="text" class="wage-input"></td>
                <td>￦ <span v-if="!isContractEditMode">________</span><input v-else type="text" class="wage-input"></td>
                <td>￦ <span v-if="!isContractEditMode">________</span><input v-else type="text" class="wage-input"></td>
                <td>￦ <span v-if="!isContractEditMode">________</span><input v-else type="text" class="wage-input"></td-->
                <td v-for="(value, key) in employee.contract.contractData" :key="key">
                  <span v-if="!isContractEditMode">￦ {{ formatCurrency(value) }}</span>
                  <input v-else type="text" class="wage-input">
                </td>
                <td class="font-bold bg-gray-50">
                  ￦ {{ formatCurrency(wageTotal) }}
                </td>

              </tr>
              </tbody>
            </table>
            <p class="contract-paragraph">
              1. 위 임금은 매월 말일에 마감하여 익월 {{employee.payment_day}}일에 지급한다.<br>
              2. 임금의 구성 및 지급일, 지급방법 등 기타 사항은 회사의 취업규칙 및 임금규정에 따른다.
            </p>

            <!-- 제5조 휴일/휴가 -->
            <h4 class="section-sub-title">제 5조 (휴일 및 휴가)</h4>
            <p class="contract-paragraph">
              1. 휴일은 주휴일 1일을 포함하여 근로기준법 및 회사 규정에 따른다.<br>
              2. 연차유급휴가는 근로기준법 및 회사의 연차규정에 따라 부여한다.
            </p>

            <!-- 제6조 기타 조항 (간략 버전) -->
            <h4 class="section-sub-title">제 6조 (기타)</h4>
            <p class="contract-paragraph">
              1. 본 계약서에 명시되지 아니한 사항은 근로기준법, 기타 관계 법령과 회사 취업규칙을 따른다.<br>
              2. “갑”과 “을”은 상호 성실의 원칙에 따라 근로관계를 유지하며, 회사의 정당한 업무지시에 협조한다.
            </p>

            <!-- 서명란 -->
            <p class="mt-8 text-center leading-relaxed">
              위 근로계약 내용을 상호 확인하였으며, 이를 증명하기 위하여 본 계약서를 2부 작성하여
              갑과 을이 각각 1부씩 보관한다.
            </p>

            <div class="signature-box">
              <p>
                <strong v-if="!isContractEditMode">____년&nbsp;&nbsp;__ 월&nbsp;&nbsp;__ 일</strong>
                <input v-else type="date">
              </p>

              <div class="signature-row">
                <div>
                  <p><strong>“갑”</strong> ㈜에코그린티엠</p>
                  <p>주소: (회사 주소 기재)</p>
                  <p>대표이사: 백송이 (인)</p>
                </div>
                <div>
                  <p><strong>“을”</strong> 근로자</p>
                  <p>성명: {{ employee.name }} (인)</p>
                  <p>주소: {{ employee.address || '________________' }}</p>
                  <p>연락처: {{ employee.phone || '________________' }}</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        <div class="modal-footer">
          <button
              type="button"
              class="btn btn-primary btn-sm"
              @click="isContractEditMode = !isContractEditMode"
          >
            {{ isContractEditMode ? '저장' : '수정' }}
          </button>
          <button @click="showModal = false" class="btn btn-secondary">닫기</button>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="/assets/css/member.css"></style>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from "axios";
import { useRoute } from 'nuxt/app'
import {formatCurrency} from "~/utils/formatter.js";
const route = useRoute()
const {
  siteOptions,
  typeOptions,
  positionOptions,
  fetchSiteOptions,
  fetchTypeOptions,
  fetchPositionOptions
} = useApi();

const isEditMode = ref(false);
const showModal = ref(false); // 모달 상태 관리 변수
const statusMessage = ref('');
const statusClass = ref('');
let originalEmployeeData = {}; // 취소 시 되돌릴 원본 데이터

// 1. 폼 데이터 모델
const employee = ref({
  type: '',
  name: '김철수',
  id: 'EMP001',
  phone: '010-1234-5678',
  email: 'chulsoo.kim@company.com',
  birthDate: '1990-03-15',
  address: '서울시 강남구 테헤란로 123',
  site: 'LH 위례 6단지',
  position: '관리자',
  joinDate: '2018-09-01',
  status: '0', // 재직, 퇴사
  gender: '',
  disability: '', //장애여부
  disability_date: '', //장애인등록일
  disability_grade: '', //장애등급
  defector: '',//새터민 여부
  patriot: '',//국가유공자 여부
  intern: '', //청년 인턴 여부
  beneficiary: '',  //기초수급자여부
  foreigner: '',  //외국인여부
  nationality: '',  //국적
  visa_code: '', //비자코드
  visa_date: '',  //비자만료일
  // 요청으로 추가된 필드
  bankName: '국민은행',
  accountNumber: '123-45-67890-123',
  // bigo: '주간 근무만 가능하며, 매주 월요일 오전에만 현장 미팅에 참여할 수 있습니다.',
  bigo: '',
  departureDate: '',
  departureReason: '',

  contract: {
    contractData: [], //임금
    startDt: '',
    endDt: '',
    total: '',
  }
});

// 2. 드롭다운 옵션
const isContractEditMode = ref(false); // 근로계약서 수정 모드

// 3. 상태 메시지 표시 함수
const showStatusMessage = (message, type = 'info') => {
  statusMessage.value = message;

  if (type === 'success') {
    statusClass.value = 'bg-green-100 text-green-800';
  } else if (type === 'error') {
    statusClass.value = 'bg-red-100 text-red-800';
  } else { // info / warning
    statusClass.value = 'bg-yellow-100 text-yellow-800';
  }

  setTimeout(() => {
    statusMessage.value = '';
  }, 3000);
};


// 4. 편집 모드 전환 함수
const toggleEditMode = (enable) => {
  isEditMode.value = enable;

  if (enable) {
    // 편집 모드 진입 시, 원본 데이터 백업
    originalEmployeeData = { ...employee.value };
    //showStatusMessage("수정 모드가 활성화되었습니다. 필요한 정보를 변경하세요.", 'info');
  } else {
    // 취소 시, 원본 데이터로 되돌리기
    employee.value = { ...originalEmployeeData };
    //showStatusMessage("수정이 취소되었습니다. 변경 사항이 반영되지 않았습니다.", 'error');
  }
};


// 5. 변경 사항 저장 핸들러
const handleSave = async () => {
  // 간단한 유효성 검사 (필수 필드 확인)
  if (!employee.value.site || !employee.value.position) {
    showStatusMessage('근무 현장과 직위는 필수 입력 항목입니다.', 'error');
    return;
  }

  // 퇴사 상태일 경우 퇴사일과 사유 필수 검사
  if (employee.value.status == '1') {
    if (!employee.value.departureDate) {
      showStatusMessage('퇴사 상태일 경우, 퇴사일은 필수 입력 항목입니다.', 'error');
      return;
    }
    if (!employee.value.departureReason) {
      showStatusMessage('퇴사 상태일 경우, 퇴사 사유는 필수 입력 항목입니다.', 'error');
      return;
    }
  }

  // 실제 API 호출 로직은 여기에 구현됩니다.
  console.log('직원 정보 수정 데이터:', employee.value);

  // 저장 성공 후
  isEditMode.value = false;
  originalEmployeeData = { ...employee.value }; // 원본 데이터 업데이트
  let payload = {
    type: employee.value.type,
    name: employee.value.name,
    phone: employee.value.phone,
    gender: employee.value.gender,
    email: employee.value.email,
    birthDate: employee.value.birthDate,
    address: employee.value.address,
    bankName: employee.value.bankName,
    accountNumber: employee.value.accountNumber,
    joinDate: employee.value.joinDate,
    endDate: employee.value.departureDate,
    endReason: employee.value.departureReason,
    bigo: employee.value.bigo,
    disability: employee.value.disability,
    disability_date: employee.value.disability_date,
    disability_grade: employee.value.disability_grade,
    defector: employee.value.defector,
    patriot: employee.value.patriot,
    intern: employee.value.intern,
    beneficiary: employee.value.beneficiary,
    foreigner: employee.value.foreigner,
    nationality: employee.value.nationality,
    visa_code: employee.value.visa_code,
    visa_date: employee.value.visa_date,

  }
  const res = await axios.post('/api/v1/member/register', payload)
  showStatusMessage('직원 정보가 성공적으로 저장되었습니다.', 'success');

};

const getMemberData = async () => {
  const mIdx = route.params.id;
  const response = await axios.get(`/api/v1/member/data/${mIdx}`)
  console.log(response.data.data, employee.value, 'd')

  // 기본정보
  employee.value.type = response.data.data[0].type
  employee.value.name = response.data.data[0].name
  employee.value.id = response.data.data[0].id
  employee.value.phone = response.data.data[0].phone
  employee.value.gender = response.data.data[0].gender
  employee.value.email = response.data.data[0].email
  employee.value.birthDate = response.data.data[0].birthDt;
  employee.value.address = response.data.data[0].addr
  employee.value.bankName = response.data.data[0].bank
  employee.value.accountNumber = response.data.data[0].accountNo


  //장애여부
  employee.value.disability = response.data.data[0].disability
  employee.value.disability_date  = response.data.data[0].disability_date
  employee.value.disability_grade = response.data.data[0].disability_grade

  employee.value.defector = response.data.data[0].defector;//새터민여부
  employee.value.patriot = response.data.data[0].patriot; //국가유공자여부
  employee.value.beneficiary = response.data.data[0].beneficiary//기초수급자여부
  employee.value.intern = response.data.data[0].intern; //청년인턴여부

  //외국인여부
  employee.value.foreigner = response.data.data[0].foreigner;
  employee.value.nationality = response.data.data[0].nationality;
  employee.value.visa_code = response.data.data[0].visa_code;
  employee.value.visa_date = response.data.data[0].visa_date;

  // 현장 배치 정보
  employee.value.site = JSON.parse(response.data.data[0].sites)[0].name
  employee.value.sIdx = response.data.data[0].sIdx
  employee.value.position = response.data.data[0].position
  employee.value.positionCd = response.data.data[0].positionCd
  employee.value.joinDate = response.data.data[0].inDate;
  employee.value.status = response.data.data[0].status;
  employee.value.payment_day = response.data.data[0].payment_day;

  // 계약 정보
  employee.value.contract.startDt = JSON.parse(response.data.data[0].contract)[0].startDt;
  employee.value.contract.endDt = JSON.parse(response.data.data[0].contract)[0].endDt;
  employee.value.contract.contractData = JSON.parse(response.data.data[0].contract)[0].contractData;
  employee.value.contract.total = wageTotal(JSON.parse(response.data.data[0].contract)[0].contractData)

  // 금용정보
  employee.value.bankName = response.data.data[0].bank
  employee.value.accountNumber = response.data.data[0].accountNo
  employee.value.bigo = response.data.data[0].bigo
}

const wageTotal = computed(() => {
  const data = employee.value.contract.contractData;
  if (!data) return 0;

  // 객체인 경우 (항목: 금액) 모든 값을 더함
  if (typeof data === 'object' && !Array.isArray(data)) {
    return Object.values(data).reduce((acc, cur) => acc + (Number(cur) || 0), 0);
  }

  // 배열인 경우 (금액만 들어있는 경우)
  if (Array.isArray(data)) {
    return data.reduce((acc, cur) => acc + (Number(cur) || 0), 0);
  }

  return 0;
});

const contractYear = computed(() => {
  if (employee.value.joinDate) {
    return String(employee.value.joinDate).slice(0, 4)
  }
  return String(new Date().getFullYear())
});


onMounted(() => {
  // 컴포넌트가 로드되면 초기 목록을 가져옵니다.
  fetchSiteOptions();
  fetchPositionOptions();
  getMemberData();
});
</script>
