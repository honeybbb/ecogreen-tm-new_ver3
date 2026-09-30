// composables/useTableResize.js
import { onBeforeUnmount } from 'vue';

export const useTableResize = () => {

    const startResize = (e) => {
        const th = e.target.closest('th');
        if (!th) return;

        // Find corresponding col
        const tr = th.closest('tr');
        const table = th.closest('table');
        // colspan/rowspan이 있는 헤더의 경우 th의 tr 내 index로는 col 매칭이 안 되므로
        // th에 data-col-index가 지정돼 있으면 그것을 우선 사용
        const colIndex = th.dataset.colIndex !== undefined
            ? Number(th.dataset.colIndex)
            : Array.from(tr.children).indexOf(th);
        const col = table.querySelectorAll('col')[colIndex];

        const startX     = e.clientX;
        const startWidth = th.offsetWidth;
        let hasMoved = false;

        document.body.classList.add('is-resizing');

        const onMove = (moveEvent) => {
            if (Math.abs(moveEvent.clientX - startX) > 2) {
                hasMoved = true;
            }
            // 엑셀처럼 자유롭게 좁힐 수 있도록 하한을 매우 낮게 (2px)
            const newWidth = Math.max(2, startWidth + (moveEvent.clientX - startX));
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
