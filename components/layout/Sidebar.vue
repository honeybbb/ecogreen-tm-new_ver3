<script setup>
import { ref, watch } from 'vue';
import { useRoute } from '#app';

const props = defineProps({
  items: { type: Array, default: () => [] },
  systemItems: { type: Array, default: () => [] },
  miniVariant: Boolean,
  mobileMenuOpen: Boolean,
  title: String
});

const emit = defineEmits(['toggleSidebar']);

const route = useRoute();
const activeGroup = ref(null);

const isActive = (item) => {
  const path = route.path || '';
  const to = item?.to || '';
  if (to === '/') return path === '/';
  return path.startsWith(to.replace(/\/+$/, ''));
};

const toggleGroup = (itemId) => {
  activeGroup.value = activeGroup.value === itemId ? null : itemId;
};

watch(() => route.path, () => {
  const allGroups = [...props.items, ...props.systemItems].filter(item => item.group);
  const foundGroup = allGroups.find(group =>
      group.child.some(child => isActive(child))
  );
  if (foundGroup) {
    activeGroup.value = foundGroup.id;
  }
}, { immediate: true });
</script>

<template>
  <nav :class="['eg-leftnav', { 'eg-mini': miniVariant, 'eg-mobile-open': mobileMenuOpen }]">
    <div class="eg-brand">
      <div class="eg-logo-wrapper">
        <div class="eg-logo-icon">
          <span class="eg-logo-text">EG</span>
        </div>
        <transition name="fade">
          <span v-show="!miniVariant || mobileMenuOpen" class="eg-brand-text">{{ title }}</span>
        </transition>
      </div>
    </div>

    <div class="eg-scroll-area">
      <ul class="eg-menu-list">
        <li v-for="item in items" :key="item.id">
          <NuxtLink v-if="!item.group" :to="item.to" :class="['eg-menu-item', { 'eg-active': isActive(item) }]">
            <span class="eg-icon"><i :class="['mdi', item.icon]"></i></span>
            <transition name="fade">
              <span v-show="!miniVariant || mobileMenuOpen" class="eg-title">{{ item.title }}</span>
            </transition>
          </NuxtLink>

          <div v-else>
            <div
                :class="['eg-menu-item eg-group-item', { 'eg-active-group': activeGroup === item.id || item.child.some(isActive) }]"
                @click="toggleGroup(item.id)"
            >
              <span class="eg-icon"><i :class="['mdi', item.icon]"></i></span>
              <transition name="fade">
                <span v-show="!miniVariant || mobileMenuOpen" class="eg-title">{{ item.title }}</span>
              </transition>
              <transition name="fade">
                <span v-show="!miniVariant || mobileMenuOpen" class="eg-arrow" :class="{ 'eg-arrow-up': activeGroup === item.id }">
                  <i class="mdi mdi-chevron-down"></i>
                </span>
              </transition>
            </div>

            <transition name="slide-down">
              <ul v-if="(!miniVariant || mobileMenuOpen) && activeGroup === item.id" class="eg-submenu-list">
                <li v-for="child in item.child" :key="child.to">
                  <NuxtLink :to="child.to" :class="['eg-submenu-item', { 'eg-active-child': isActive(child) }]">
                    <span class="eg-child-title">{{ child.title }}</span>
                  </NuxtLink>
                </li>
              </ul>
            </transition>
          </div>
        </li>
      </ul>

      <div v-if="systemItems.length > 0" class="eg-divider"></div>

      <ul class="eg-menu-list" v-if="systemItems.length > 0">
        <li v-for="item in systemItems" :key="item.id">
          <div v-if="item.group">
            <div
                :class="['eg-menu-item eg-group-item', { 'eg-active-group': activeGroup === item.id || item.child.some(isActive) }]"
                @click="toggleGroup(item.id)"
            >
              <span class="eg-icon"><i :class="['mdi', item.icon]"></i></span>
              <transition name="fade">
                <span v-show="!miniVariant || mobileMenuOpen" class="eg-title">{{ item.title }}</span>
              </transition>
              <transition name="fade">
                <span v-show="!miniVariant || mobileMenuOpen" class="eg-arrow" :class="{ 'eg-arrow-up': activeGroup === item.id }">
                  <i class="mdi mdi-chevron-down"></i>
                </span>
              </transition>
            </div>

            <transition name="slide-down">
              <ul v-if="(!miniVariant || mobileMenuOpen) && activeGroup === item.id" class="eg-submenu-list">
                <li v-for="child in item.child" :key="child.to">
                  <NuxtLink :to="child.to" :class="['eg-submenu-item', { 'eg-active-child': isActive(child) }]">
                    <span class="eg-child-title">{{ child.title }}</span>
                  </NuxtLink>
                </li>
              </ul>
            </transition>
          </div>
        </li>
      </ul>
    </div>

    <div class="eg-nav-footer desktop-only">
      <button @click="emit('toggleSidebar')" class="eg-toggle-btn">
        <i :class="['mdi', miniVariant ? 'mdi-chevron-right' : 'mdi-chevron-left']"></i>
      </button>
    </div>
  </nav>
</template>

<style scoped>
* { box-sizing: border-box; outline: none; }
/* === 사이드바 === */
.eg-leftnav {
  position: fixed;
  top: 0; left: 0;
  height: 100vh;
  width: 260px;
  background-color: var(--nav-bg);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease, background-color 0.3s;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--nav-border);
}

.eg-leftnav.eg-mini { width: 72px; }

.eg-brand {
  height: 70px;
  display: flex; align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--nav-border);
}
.eg-logo-wrapper { display: flex; align-items: center; gap: 12px; text-decoration: none; cursor: pointer; }
.eg-logo-icon {
  width: 36px; height: 36px;
  background-color: var(--primary);
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.eg-logo-text { color: #ffffff; font-weight: 800; font-size: 16px; letter-spacing: -0.5px; }
.eg-brand-text { color: var(--nav-brand-text); font-weight: 700; font-size: 17px; white-space: nowrap; letter-spacing: -0.3px; }

.eg-scroll-area { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px 0; }
.eg-scroll-area::-webkit-scrollbar { width: 4px; }
.eg-scroll-area::-webkit-scrollbar-thumb { background: var(--nav-border); border-radius: 2px; }

.eg-menu-list { list-style: none; padding: 0 12px; margin: 0; }
.eg-menu-item {
  display: flex; align-items: center; padding: 12px 16px; margin: 2px 0;
  color: var(--nav-text); text-decoration: none; border-radius: 8px;
  transition: all 0.2s ease; cursor: pointer; position: relative;
  font-size: 14px; font-weight: 500;
}
.eg-menu-item:hover { background-color: var(--nav-item-hover); color: var(--nav-text-hover); }
.eg-active {
  background-color: var(--nav-active-bg) !important;
  color: var(--primary) !important;
  font-weight: 600;
}
.eg-active::before {
  content: ''; position: absolute; left: 0; top: 10px; bottom: 10px;
  width: 4px; background-color: var(--primary); border-radius: 0 4px 4px 0;
}
.eg-active-group { color: var(--nav-text-hover); }
.eg-icon {
  font-size: 20px; width: 24px; text-align: center; flex-shrink: 0; margin-right: 12px;
  display: flex; align-items: center; justify-content: center;
  opacity: var(--nav-icon-opacity);
}
.eg-menu-item:hover .eg-icon,
.eg-active .eg-icon,
.eg-active-group .eg-icon { opacity: 1; color: var(--primary); }
.eg-mini .eg-icon { margin-right: 0; }
.eg-title { white-space: nowrap; }
.eg-arrow { margin-left: auto; transition: transform 0.3s; font-size: 18px; opacity: 0.7; }
.eg-arrow-up { transform: rotate(180deg); opacity: 1; }

.eg-submenu-list { list-style: none; padding: 0; margin: 4px 0; border-left: 1px solid var(--nav-border); margin-left: 28px; }
.eg-mini .eg-submenu-list { display: none; }
.eg-submenu-item {
  display: flex; align-items: center; padding: 9px 16px 9px 20px;
  color: var(--nav-text); text-decoration: none; font-size: 13px; border-radius: 6px; margin: 1px 0;
  transition: all 0.2s;
}
.eg-submenu-item:hover { color: var(--nav-text-hover); background-color: var(--nav-item-hover); }
.eg-active-child { color: var(--primary); font-weight: 600; background-color: var(--primary-soft); }

.eg-divider { height: 1px; background: var(--nav-border); margin: 16px 12px; }
.eg-nav-footer { padding: 12px; border-top: 1px solid var(--nav-border); margin-top: auto; }
.eg-toggle-btn {
  width: 100%; padding: 10px; background: transparent; border: none;
  border-radius: 8px; color: var(--nav-text); cursor: pointer; transition: all 0.2s; font-size: 20px;
  display: flex; align-items: center; justify-content: center;
}
.eg-toggle-btn:hover { background-color: var(--nav-item-hover); color: var(--nav-text-hover); }

/* === 애니메이션 === */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-down-enter-active { animation: slideDown 0.25s ease-out; overflow: hidden; }
.slide-down-leave-active { animation: slideDown 0.2s ease-in reverse; overflow: hidden; }
@keyframes slideDown { from { max-height: 0; opacity: 0; } to { max-height: 400px; opacity: 1; } }

/* === 반응형 === */
@media (min-width: 769px) { .desktop-only { display: block !important; } }
@media (max-width: 768px) { .desktop-only { display: none !important; } }

@media (max-width: 1024px) {
  .eg-leftnav { width: 72px; }
  .eg-brand-text, .eg-title, .eg-arrow { display: none !important; }
  .eg-icon { margin-right: 0; }
  .eg-brand { padding: 0; justify-content: center; }
  .eg-logo-wrapper { gap: 0; }
}

@media (max-width: 768px) {
  .eg-leftnav {
    transform: translateX(-100%);
    width: 260px !important;
    box-shadow: 10px 0 30px rgba(0,0,0,0.2);
  }
  .eg-leftnav.eg-mobile-open { transform: translateX(0); }
  .eg-leftnav.eg-mobile-open .eg-brand-text,
  .eg-leftnav.eg-mobile-open .eg-title,
  .eg-leftnav.eg-mobile-open .eg-arrow,
  .eg-leftnav.eg-mobile-open .eg-submenu-list { display: block !important; }
  .eg-leftnav.eg-mobile-open .eg-icon { margin-right: 12px; }
  .eg-leftnav.eg-mobile-open .eg-brand { padding: 0 20px; justify-content: flex-start; }
  .eg-leftnav.eg-mobile-open .eg-logo-wrapper { gap: 12px; }
}
</style>
