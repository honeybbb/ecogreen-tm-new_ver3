// stores/auth.js
import { defineStore } from 'pinia';

const SESSION_DURATION = 60 * 60;      // 세션 총 시간: 60분 (초)
const WARN_BEFORE     = 5 * 60;        // 만료 몇 초 전에 경고 모달 표시: 5분 전

export const useAuthStore = defineStore('auth', () => {

    const token = useCookie('user_token', {
        maxAge: SESSION_DURATION,
        sameSite: 'lax',
        default: () => null
    });

    const userCookie = useCookie('user_info', {
        maxAge: SESSION_DURATION,
        default: () => null
    });

    const user = ref(userCookie.value ?? null);

    // =============================================
    // 세션 타이머 관련 상태
    // =============================================
    const remainingSeconds = ref(SESSION_DURATION);  // 남은 시간 (초)
    const showWarningModal = ref(false);              // 경고 모달 표시 여부
    const isExpired        = ref(false);              // 만료 여부

    let countdownInterval = null;  // setInterval 핸들
    let sessionStartedAt  = null;  // 세션 시작 시각 (Date.now())

    // =============================================
    // 타이머 시작
    // =============================================
    const startTimer = () => {
        clearTimer(); // 기존 타이머 제거
        sessionStartedAt  = Date.now();
        remainingSeconds.value = SESSION_DURATION;
        showWarningModal.value = false;
        isExpired.value        = false;

        countdownInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - sessionStartedAt) / 1000);
            const remaining = SESSION_DURATION - elapsed;

            if (remaining <= 0) {
                // 만료 처리
                remainingSeconds.value = 0;
                showWarningModal.value = false;
                isExpired.value        = true;
                clearTimer();
                logout();
                navigateTo('/login');
                return;
            }

            remainingSeconds.value = remaining;

            // 5분 전 → 경고 모달 표시
            if (remaining <= WARN_BEFORE && !showWarningModal.value) {
                showWarningModal.value = true;
            }
        }, 1000);
    };

    // =============================================
    // 타이머 정지
    // =============================================
    const clearTimer = () => {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    };

    // =============================================
    // 세션 연장 (쿠키 maxAge 갱신 + 타이머 리셋)
    // =============================================
    const extendSession = () => {
        if (!token.value) return;

        // 쿠키 maxAge를 갱신하려면 같은 값으로 재할당
        const currentToken = token.value;
        const currentUser  = userCookie.value;

        token.value      = currentToken;
        userCookie.value = currentUser;

        // 타이머 리셋
        startTimer();
    };

    // =============================================
    // 로그인
    // =============================================
    const setLogin = (authData) => {
        token.value      = authData.token;
        userCookie.value = authData.user;
        user.value       = authData.user;
        startTimer();
    };

    // =============================================
    // 로그아웃
    // =============================================
    const logout = () => {
        token.value      = null;
        userCookie.value = null;
        user.value       = null;
        showWarningModal.value = false;
        isExpired.value        = false;
        clearTimer();
    };

    // =============================================
    // 남은 시간을 MM:SS 형태로 포맷
    // =============================================
    const remainingFormatted = computed(() => {
        const m = Math.floor(remainingSeconds.value / 60);
        const s = remainingSeconds.value % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    });

    return {
        token, user,
        remainingSeconds, remainingFormatted,
        showWarningModal, isExpired,
        setLogin, logout,
        startTimer, clearTimer, extendSession,
    };
});
