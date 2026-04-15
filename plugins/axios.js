// plugins/axios.js
import axios from 'axios'

export default defineNuxtPlugin((nuxtApp) => {

    // 요청 인터셉터 (기존 그대로)
    axios.interceptors.request.use((config) => {
        const token = useCookie('user_token').value;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    // 응답 인터셉터
    axios.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;

            // 401이고 아직 재시도 안 한 요청
            if (error.response?.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;

                const refreshToken = useCookie('refresh_token').value;

                // refresh token도 없으면 바로 로그아웃
                if (!refreshToken) {
                    return handleLogout();
                }

                try {
                    // access token 재발급 요청
                    //const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken });
                    const data = await $fetch('/api/v1/auth/refresh', {
                        method: 'POST',
                        body: { refreshToken }
                    });

                    if (data.result) {
                        // 새 access token 쿠키에 저장
                        useCookie('user_token').value = data.token;

                        // 실패했던 요청 새 토큰으로 재시도
                        originalRequest.headers.Authorization = `Bearer ${data.token}`;
                        return axios(originalRequest);
                    } else {
                        return handleLogout();
                    }
                } catch (e) {
                    return handleLogout();
                }
            }

            return Promise.reject(error);
        }
    );

    // 로그아웃 처리 공통 함수
    const handleLogout = async () => {
        useCookie('user_token').value = null;
        useCookie('refresh_token').value = null;

        const { useAuthStore } = await import('~/stores/auth');
        const authStore = useAuthStore();
        authStore.logout();

        return navigateTo('/login');
    };
});
