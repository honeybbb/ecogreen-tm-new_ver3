// composables/useTableResize.js
import { onBeforeUnmount } from 'vue';

export const useTableResize = () => {

    const startResize = (e) => {
        const th = e.target.closest('th');
        if (!th) return;

        const startX     = e.clientX;
        const startWidth = th.offsetWidth;

        document.body.classList.add('is-resizing');

        const onMove = (moveEvent) => {
            // ✅ Math.max 최솟값을 1px로 낮춰 거의 무제한 축소 허용
            const newWidth = Math.max(1, startWidth + (moveEvent.clientX - startX));
            th.style.width    = newWidth + 'px';
            th.style.minWidth = newWidth + 'px'; // ✅ minWidth도 같이 덮어써야 CSS min-width를 이김
        };

        const onUp = () => {
            document.body.classList.remove('is-resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    };

    onBeforeUnmount(() => {
        document.body.classList.remove('is-resizing');
    });

    return { startResize };
};
