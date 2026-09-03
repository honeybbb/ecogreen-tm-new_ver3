// composables/useTableResize.js
import { onBeforeUnmount } from 'vue';

export const useTableResize = () => {

    const startResize = (e) => {
        const th = e.target.closest('th');
        if (!th) return;

        // Find corresponding col
        const tr = th.closest('tr');
        const thIndex = Array.from(tr.children).indexOf(th);
        const table = th.closest('table');
        const col = table.querySelectorAll('col')[thIndex];

        const startX     = e.clientX;
        const startWidth = th.offsetWidth;
        let hasMoved = false;

        document.body.classList.add('is-resizing');

        const onMove = (moveEvent) => {
            if (Math.abs(moveEvent.clientX - startX) > 2) {
                hasMoved = true;
            }
            // Math.max 최솟값을 1px로 낮춰 거의 무제한 축소 허용
            const newWidth = Math.max(16, startWidth + (moveEvent.clientX - startX));
            th.style.width    = newWidth + 'px';
            th.style.minWidth = newWidth + 'px';
            th.style.maxWidth = newWidth + 'px';
            if (col) {
                col.style.width = newWidth + 'px';
                col.width = newWidth;
            }
        };

        const onUp = () => {
            document.body.classList.remove('is-resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);

            if (hasMoved) {
                const preventClick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    window.removeEventListener('click', preventClick, true);
                };
                window.addEventListener('click', preventClick, true);
                setTimeout(() => {
                    window.removeEventListener('click', preventClick, true);
                }, 50);
            }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    };

    onBeforeUnmount(() => {
        document.body.classList.remove('is-resizing');
    });

    return { startResize };
};
