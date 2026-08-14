<template>
  <footer class="eg-footer">
    <div class="eg-footer-content">
      <span>&copy; {{ new Date().getFullYear() }} EcoGreen TM. All rights reserved.</span>
      <div class="eg-footer-links">
        <a href="#">이용약관</a>
        <span class="eg-separator">|</span>
        <a href="#">개인정보처리방침</a>
        <span class="eg-separator">|</span>
        <a href="#">문의하기</a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
* { box-sizing: border-box; outline: none; }
.eg-footer {
  padding: 16px 24px; background: var(--bg-surface);
  border-top: 1px solid var(--border-color); color: var(--text-sub); font-size: 13px;
}
.eg-footer-content { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.eg-footer-links { display: flex; gap: 16px; }
.eg-footer-links a { color: var(--text-sub); text-decoration: none; transition: color 0.2s; }
.eg-footer-links a:hover { color: var(--primary); text-decoration: underline; }
.eg-separator { color: var(--border-color); }

@media (max-width: 768px) {
  .eg-footer-content { flex-direction: column; text-align: center; gap: 8px; }
  .eg-footer-links { justify-content: center; }
}
</style>
