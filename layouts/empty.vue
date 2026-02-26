<template>
  <div class="empty-layout">
    <slot />
  </div>
</template>

<style scoped>
.empty-layout {
  min-height: 100vh;
  background-color: #f1f5f9; /* 로그인 페이지 배경색과 맞추거나 흰색으로 설정 */
}
</style>
