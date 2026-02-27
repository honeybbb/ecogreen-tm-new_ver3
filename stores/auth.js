// stores/auth.js
import { defineStore } from 'pinia';

export const useAuthStore = defineStore('auth', () => {
    // 60초 * 60분 = 3600초 (정확히 60분 뒤에 쿠키 자동 삭제)
    const token = useCookie('user_token', {
        maxAge: 60 * 60,
        sameSite: 'lax',
    });

    // 유저 정보도 60분 뒤에 같이 파기되도록 동일하게 설정
    const user = useCookie('user_info', {
        maxAge: 60 * 60,
        default: () => null
    });

    const setLogin = (authData) => {
        token.value = authData.token;
        user.value = authData.user;
    };

    const logout = () => {
        token.value = null;
        user.value = null;
    };

    return { token, user, setLogin, logout };
});
