// middleware/auth.js
export default defineNuxtRouteMiddleware((to, from) => {
    const token = useCookie('user_token');

    // 토큰이 없으면 무조건 로그인 페이지로 보냄
    if (!token.value) {
        return navigateTo('/login');
    }

    // 토큰이 있으면 가려던 페이지로 보내줌
});
