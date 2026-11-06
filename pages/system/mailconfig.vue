<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import SunTextEditor from '@/components/SunEditor.vue';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const form = ref(getEmptyForm());
const original = ref(null);
const isLoading = ref(false);
const isSaving = ref(false);
const isTesting = ref(false);

const DEFAULT_SETTLE_SUBJECT  = '[{siteName}] {period} 정산서 송부';
const DEFAULT_SETTLE_BODY_HTML = '<p>안녕하세요.</p><p>{siteName} {period} 정산서를 송부드립니다. 첨부 파일 확인 부탁드립니다.</p><p>감사합니다.</p>';

function getEmptyForm() {
  return {
    fromEmail: '',
    fromName: '',
    replyTo: '',
    useFl: 'Y',
    smtpHost: 'smtp.naver.com',
    smtpPort: 465,
    smtpUser: '',
    smtpPass: '',           // 수정 시 공란이면 기존 암호 유지
    hasSmtpPass: false,     // 서버 보존 비밀번호 존재 여부
    settleSubject: DEFAULT_SETTLE_SUBJECT,
    settleBodyHtml: DEFAULT_SETTLE_BODY_HTML,
  };
}

const isNew = computed(() => original.value === null);

const fetchConfig = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get('/api/v1/mail/config');
    const data = res.data?.data;
    if (data) {
      original.value = { ...data };
      form.value = {
        fromEmail: data.fromEmail || '',
        fromName: data.fromName || '',
        replyTo: data.replyTo || '',
        useFl: data.useFl || 'Y',
        smtpHost: data.smtpHost || 'smtp.naver.com',
        smtpPort: Number(data.smtpPort) || 465,
        smtpUser: data.smtpUser || '',
        smtpPass: '',
        hasSmtpPass: !!data.hasSmtpPass,
        settleSubject: data.settleSubject || DEFAULT_SETTLE_SUBJECT,
        settleBodyHtml: data.settleBodyHtml || DEFAULT_SETTLE_BODY_HTML,
      };
    } else {
      original.value = null;
      form.value = getEmptyForm();
    }
  } catch (e) {
    console.error('메일 설정 로드 실패:', e);
  } finally {
    isLoading.value = false;
  }
};

const handleCancel = () => {
  if (original.value) {
    form.value = {
      fromEmail: original.value.fromEmail || '',
      fromName: original.value.fromName || '',
      replyTo: original.value.replyTo || '',
      useFl: original.value.useFl || 'Y',
      smtpHost: original.value.smtpHost || 'smtp.naver.com',
      smtpPort: Number(original.value.smtpPort) || 465,
      smtpUser: original.value.smtpUser || '',
      smtpPass: '',
      hasSmtpPass: !!original.value.hasSmtpPass,
      settleSubject: original.value.settleSubject || DEFAULT_SETTLE_SUBJECT,
      settleBodyHtml: original.value.settleBodyHtml || DEFAULT_SETTLE_BODY_HTML,
    };
  } else {
    form.value = getEmptyForm();
  }
};

const resetSettleTemplate = () => {
  form.value.settleSubject = DEFAULT_SETTLE_SUBJECT;
  form.value.settleBodyHtml = DEFAULT_SETTLE_BODY_HTML;
};

const handleSubmit = async () => {
  const fromEmail = (form.value.fromEmail || '').trim();
  if (!fromEmail || !EMAIL_RE.test(fromEmail)) {
    return alert('발신 이메일 형식이 올바르지 않습니다.');
  }
  const replyTo = (form.value.replyTo || '').trim();
  if (replyTo && !EMAIL_RE.test(replyTo)) {
    return alert('회신 이메일 형식이 올바르지 않습니다.');
  }

  const smtpHost = (form.value.smtpHost || '').trim();
  const smtpUser = (form.value.smtpUser || '').trim();
  const smtpPort = Number(form.value.smtpPort) || 465;
  const smtpPass = form.value.smtpPass || '';

  if (!smtpHost) return alert('SMTP 호스트를 입력해주세요.');
  if (!smtpUser || !EMAIL_RE.test(smtpUser)) {
    return alert('SMTP 계정(이메일) 형식이 올바르지 않습니다.');
  }
  // 최초 등록 시에는 비밀번호 필수. 수정 시 공란이면 기존 암호 유지
  if (!form.value.hasSmtpPass && !smtpPass) {
    return alert('SMTP 비밀번호(네이버 애플리케이션 비밀번호)를 입력해주세요.');
  }

  isSaving.value = true;
  try {
    await axios.put('/api/v1/mail/config', {
      fromEmail,
      fromName: (form.value.fromName || '').trim(),
      replyTo: replyTo || null,
      useFl: form.value.useFl === 'N' ? 'N' : 'Y',
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,   // 공란이면 서버가 기존 암호 보존
      settleSubject: (form.value.settleSubject || '').trim() || null,
      settleBodyHtml: form.value.settleBodyHtml || null,
    });
    alert(isNew.value ? '발신 설정이 등록되었습니다.' : '발신 설정이 수정되었습니다.');
    await fetchConfig();
  } catch (e) {
    const msg = e?.response?.data?.msg || '저장에 실패했습니다.';
    alert(msg);
  } finally {
    isSaving.value = false;
  }
};

const sendTestMail = async () => {
  if (isNew.value) return alert('먼저 발신 설정을 저장해주세요.');
  if (form.value.useFl !== 'Y') return alert('발신 설정이 비활성화 상태입니다.');

  const toEmail = (window.prompt('테스트 메일을 받을 이메일 주소를 입력하세요.', '') || '').trim();
  if (!toEmail) return;
  if (!EMAIL_RE.test(toEmail)) return alert('이메일 형식이 올바르지 않습니다.');

  isTesting.value = true;
  try {
    await axios.post('/api/v1/mail/send/test', {
      toEmail,
      subject: '발신 설정 확인 메일',
      bodyHtml: '<p>본 메일은 발신 설정 확인용 테스트 메일입니다.</p>',
    });
    alert(`${toEmail} 으로 테스트 메일을 발송했습니다. (잠시 후 수신함을 확인해주세요)`);
  } catch (e) {
    const msg = e?.response?.data?.msg || '테스트 발송에 실패했습니다.';
    alert(msg);
  } finally {
    isTesting.value = false;
  }
};

onMounted(fetchConfig);
</script>

<template>
  <div class="mail-config-page">
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-email-outline"></i> 메일 발신 설정
        </h1>
        <p class="page-subtitle">
          회사별 발신자 정보를 등록합니다. 미설정 시 서버 기본 SMTP 계정으로 발송됩니다.
        </p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn-refresh"
                :disabled="isNew || isTesting"
                @click="sendTestMail">
          <i class="mdi mdi-send-check-outline"></i>
          {{ isTesting ? '발송 중...' : '테스트 메일 발송' }}
        </button>
        <button type="button" class="btn-cancel" @click="handleCancel">
          <i class="mdi mdi-restore"></i> 되돌리기
        </button>
        <button type="button" class="btn-submit"
                :disabled="isSaving"
                @click="handleSubmit">
          <i class="mdi mdi-check"></i>
          {{ isSaving ? '저장 중...' : (isNew ? '등록' : '저장') }}
        </button>
      </div>
    </div>

    <!-- 로딩 -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>불러오는 중...</p>
    </div>

    <!-- 폼 카드 -->
    <template v-else>
      <section class="category-card">
        <div class="card-header">
          <i :class="isNew ? 'mdi mdi-email-plus-outline text-blue' : 'mdi mdi-email-edit-outline text-blue'"></i>
          <h2>{{ isNew ? '발신 설정 등록' : '발신 설정' }}</h2>
          <span class="status-badge" :class="form.useFl === 'Y' ? 'on' : 'off'">
            <i :class="form.useFl === 'Y' ? 'mdi mdi-check-circle' : 'mdi mdi-close-circle'"></i>
            {{ form.useFl === 'Y' ? '사용' : '사용 안 함' }}
          </span>
        </div>

        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label required">발신 이메일</label>
              <input v-model="form.fromEmail" type="email" class="form-input"
                     placeholder="예: company@naver.com" />
              <small class="help-text">
                <i class="mdi mdi-information-outline"></i>
                수신자에게 보일 발신 주소입니다. 보통 SMTP 계정과 동일하게 설정합니다.
              </small>
            </div>

            <div class="form-group">
              <label class="form-label">발신자 이름</label>
              <input v-model="form.fromName" type="text" class="form-input"
                     placeholder="예: 회사명 또는 담당자명" />
            </div>

            <div class="form-group">
              <label class="form-label">회신 이메일 (Reply-To)</label>
              <input v-model="form.replyTo" type="email" class="form-input"
                     placeholder="수신자가 '회신' 눌렀을 때 받을 이메일" />
            </div>

            <div class="form-group">
              <label class="form-label">사용 여부</label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="Y" v-model="form.useFl" />
                  <span>사용</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="form.useFl" />
                  <span>사용 안 함</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- SMTP 자격증명 -->
      <section class="category-card">
        <div class="card-header">
          <i class="mdi mdi-server-network text-blue"></i>
          <h2>SMTP 자격증명 (네이버)</h2>
          <span v-if="form.hasSmtpPass" class="status-badge on">
            <i class="mdi mdi-lock-check-outline"></i>
            비밀번호 저장됨
          </span>
          <span v-else class="status-badge off">
            <i class="mdi mdi-lock-off-outline"></i>
            비밀번호 미설정
          </span>
        </div>

        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label required">SMTP 호스트</label>
              <input v-model="form.smtpHost" type="text" class="form-input"
                     placeholder="smtp.naver.com" />
            </div>

            <div class="form-group">
              <label class="form-label required">포트</label>
              <input v-model.number="form.smtpPort" type="number" class="form-input"
                     placeholder="465" min="1" max="65535" />
              <small class="help-text">
                <i class="mdi mdi-information-outline"></i>
                465 (SSL) 권장. 587 사용 시 STARTTLS로 자동 전환됩니다.
              </small>
            </div>

            <div class="form-group">
              <label class="form-label required">SMTP 계정 (이메일)</label>
              <input v-model="form.smtpUser" type="email" class="form-input"
                     placeholder="예: company@naver.com" autocomplete="username" />
            </div>

            <div class="form-group">
              <label class="form-label" :class="{ required: !form.hasSmtpPass }">
                애플리케이션 비밀번호
              </label>
              <input v-model="form.smtpPass" type="password" class="form-input"
                     :placeholder="form.hasSmtpPass ? '변경 시에만 입력' : '네이버 앱 비밀번호 입력'"
                     autocomplete="new-password" />
              <small class="help-text">
                <i class="mdi mdi-information-outline"></i>
                네이버 계정 → 2단계 인증 → 애플리케이션 비밀번호에서 발급.
                공란 저장 시 기존 비밀번호가 유지됩니다.
              </small>
            </div>
          </div>
        </div>
      </section>

      <!-- 정산서 송부 메일 템플릿 -->
      <section class="category-card">
        <div class="card-header">
          <i class="mdi mdi-file-document-edit-outline text-blue"></i>
          <h2>정산서 송부 메일 템플릿</h2>
          <button type="button" class="tmpl-reset" @click="resetSettleTemplate" title="기본 템플릿으로 되돌리기">
            <i class="mdi mdi-restore"></i>
            기본값으로
          </button>
        </div>

        <div class="card-body">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label">제목</label>
            <input v-model="form.settleSubject" type="text" class="form-input"
                   :placeholder="DEFAULT_SETTLE_SUBJECT" />
          </div>

          <div class="form-group">
            <label class="form-label">본문</label>
            <ClientOnly>
              <SunTextEditor v-model="form.settleBodyHtml" />
            </ClientOnly>
          </div>

          <div class="placeholder-hint">
            <i class="mdi mdi-code-tags"></i>
            <span>사용 가능한 치환자:</span>
            <code>{siteName}</code> → 현장명
            <code>{period}</code> → 정산 연월 (YYYY-MM)
          </div>
        </div>
      </section>

      <!-- 안내 박스 -->
      <div class="info-box">
        <i class="mdi mdi-information-outline"></i>
        <div>
          <strong>발신 설정 안내</strong>
          <ul>
            <li><strong>SMTP 계정:</strong> 회사별 네이버 메일 계정을 등록합니다. 비밀번호는 서버에서 암호화되어 저장되며 조회 응답에 노출되지 않습니다.</li>
            <li><strong>애플리케이션 비밀번호:</strong> 네이버 로그인 비밀번호가 아닌, 2단계 인증 후 발급받은 앱 비밀번호를 입력해야 SMTP 로그인이 성공합니다.</li>
            <li><strong>사용 안 함:</strong> 명시적으로 비활성화 시 이 회사에서는 메일이 발송되지 않습니다.</li>
            <li><strong>테스트 발송:</strong> 저장 후 상단 "테스트 메일 발송" 버튼으로 본인 계정에 테스트 메일을 보낼 수 있습니다.</li>
            <li><strong>메일 템플릿:</strong> 제목·본문의 <code>{siteName}</code>, <code>{period}</code> 는 발송 시점에 각각 현장명과 정산 연월(YYYY-MM)로 자동 치환됩니다.</li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mail-config-page { padding: 0; }

/* === 카드 (member/register.vue 패턴과 동일) === */
.category-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  margin-bottom: 20px;
}

.card-header {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  gap: 12px;
}
.card-header i { font-size: 22px; }
.card-header h2 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
  flex: 1;
}

.card-body { padding: 24px; }

/* === 폼 그리드 === */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px 20px;
}
.form-group { display: flex; flex-direction: column; gap: 6px; }

.form-label { font-size: 13px; font-weight: 700; color: var(--text-sub); }
.form-label.required::after {
  content: '*';
  color: var(--danger);
  margin-left: 4px;
}

.form-input {
  padding: 10px 12px;
  border: 1px solid var(--border-focus);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
  width: 100%;
  box-sizing: border-box;
  transition: 0.2s;
}
.form-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
  outline: none;
}

.help-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-sub);
  margin-top: 2px;
}
.help-text i { font-size: 14px; }

/* === 라디오 그룹 (register.vue 패턴) === */
.radio-group { display: flex; gap: 8px; }
.radio-label {
  flex: 1;
  text-align: center;
  padding: 10px;
  border: 1px solid var(--border-focus);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-sub);
  transition: 0.2s;
}
.radio-label input { display: none; }
.radio-label:has(input:checked) {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
}

/* === 상태 배지 === */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}
.status-badge i { font-size: 13px; }
.status-badge.on {
  background: rgba(5, 150, 105, 0.1);
  color: var(--success);
}
.status-badge.off {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
}

/* === 안내 박스 (settings.vue info-box 톤) === */
.info-box {
  display: flex;
  gap: 14px;
  padding: 18px 20px;
  background: var(--primary-soft);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}
.info-box > i { font-size: 24px; color: var(--primary); flex-shrink: 0; }
.info-box strong {
  color: var(--text-main);
  font-size: 14px;
  margin-bottom: 6px;
  display: block;
}
.info-box ul {
  padding-left: 20px;
  margin: 0;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.7;
}

/* === 로딩 === */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-sub);
}
.spinner {
  width: 36px; height: 36px;
  border-radius: 50%;
  border: 3px solid var(--bg-canvas);
  border-top-color: var(--primary);
  animation: spin 1s linear infinite;
  margin-bottom: 14px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* === 템플릿 섹션 === */
.tmpl-reset {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--bg-surface);
  color: var(--text-sub);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 12px; font-size: 12px; cursor: pointer;
  transition: 0.15s;
}
.tmpl-reset:hover {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
}
.tmpl-reset i { font-size: 14px; }

.placeholder-hint {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--bg-canvas);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-sub);
}
.placeholder-hint i { color: var(--primary); font-size: 14px; }
.placeholder-hint code {
  padding: 2px 6px;
  background: var(--primary-soft);
  color: var(--primary);
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Monaco', 'Courier New', monospace;
}
.info-box code {
  padding: 1px 5px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Monaco', 'Courier New', monospace;
  color: var(--primary);
}

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
