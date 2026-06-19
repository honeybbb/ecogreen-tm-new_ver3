// plugins/axios.js
import axios from 'axios'

export default defineNuxtPlugin((nuxtApp) => {

    // 요청 인터셉터
    axios.interceptors.request.use((config) => {
        // Context 소실을 막기 위해 runWithContext 사용 (선택 사항이나 비동기 환경 대비)
        const token = nuxtApp.runWithContext(() => useCookie('user_token').value);
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

                const refreshToken = nuxtApp.runWithContext(() => useCookie('refresh_token').value);

                // refresh token이 없으면 즉시 로그아웃 처리
                if (!refreshToken) {
                    return handleLogout();
                }

                try {
                    // 비동기 fetch 호출 시 Nuxt Context 유지
                    const data = await nuxtApp.runWithContext(() =>
                        $fetch('/api/v1/auth/refresh', {
                            method: 'POST',
                            body: { refreshToken }
                        })
                    );

                    if (data.result && data.token) {
                        // 새 토큰 쿠키 저장
                        nuxtApp.runWithContext(() => {
                            useCookie('user_token').value = data.token;

                            // [중요] 만약 리프레시 API에서 새 user_info도 함께 내려준다면 여기서 갱신해야 합니다.
                            // if (data.userInfo) useCookie('user_info').value = data.userInfo;
                        });

                        // 실패했던 원래 요청에 새 토큰을 얹어서 재시도
                        originalRequest.headers.Authorization = `Bearer ${data.token}`;
                        return axios(originalRequest);
                    } else {
                        // 결과가 없거나 실패한 경우
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
        // Context 내부에서 쿠키 날리기
        await nuxtApp.runWithContext(async () => {
            useCookie('user_token').value = null;
            useCookie('refresh_token').value = null;
            useCookie('user_info').value = null; // 요청하신 user_info 삭제 추가

            try {
                const { useAuthStore } = await import('~/stores/auth');
                const authStore = useAuthStore();
                authStore.logout(); // store 내부의 상태도 초기화
            } catch (err) {
                console.error('스토어 로그아웃 처리 중 에러:', err);
            }

            // 클라이언트(브라우저) 환경에서는 window.location.href로 강제 이동시키는 것이
            // 인터셉터 내부에서의 리다이렉트 실패를 막는 가장 확실한 방법입니다.
            if (process.client) {
                window.location.href = '/login';
            } else {
                return navigateTo('/login');
            }
        });
    };
});
