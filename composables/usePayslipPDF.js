import { ref, nextTick } from 'vue';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * 급여 명세서 PDF 생성(현장별, 1페이지 2명)
 *
 * 렌더 영역은 페이지가 직접 템플릿을 두며(payslipRender ref 참조), 이 composable은
 * - payslipRender 상태
 * - pair/site 반복 + PDF 변환 + 다운로드
 * 를 담당한다.
 */
export function usePayslipPDF({ payItemsRef, deductionItemsRef, calculateRowSummary, REG_PAY_SLOTS, REG_DED_SLOTS }) {
    const depRows = [
        '배 우 자', '부양가족 2 0', '부양가족 6 0', '경 로 자',
        '장 애 인', '6 세 자 녀', '부 녀 자', '7 세 자 녀',
    ];
    const spaceOut = (s) => String(s || '').split('').join(' ');

    const isPayslipModalOpen = ref(false);
    const isPayslipCancelled = ref(false);
    const payslipTotal = ref(0);
    const payslipProgress = ref(0);
    const currentPayslipSiteName = ref('');
    const payslipRender = ref({ year: '', month: '', companyNm: '', emps: [] });

    const cancelPayslipExport = () => { isPayslipCancelled.value = true; };

    const buildPayslipData = (row) => {
        const norm = (s) => String(s || '').replace(/[\s()]/g, '');
        const cdOf = (list, nm) => (list.find(i => norm(i.itemNm) === norm(nm)) || {}).itemCd || null;
        const paySlots = REG_PAY_SLOTS.map(s => ({ ...s, cd: cdOf(payItemsRef.value, s.nm) }));
        const dedSlots = REG_DED_SLOTS.map(s => ({ ...s, cd: cdOf(deductionItemsRef.value, s.nm) }));
        const mappedPay = new Set(paySlots.map(s => s.cd).filter(Boolean));
        const mappedDed = new Set(dedSlots.map(s => s.cd).filter(Boolean));

        let etcPayExtra = 0, etcDedExtra = 0;
        payItemsRef.value.forEach(i => { if (!mappedPay.has(i.itemCd)) etcPayExtra += Number(row.payItems?.[i.itemCd] || 0); });
        deductionItemsRef.value.forEach(i => { if (!mappedDed.has(i.itemCd)) etcDedExtra += Number(row.deductionItems?.[i.itemCd] || 0); });

        const pays = paySlots.map(s => {
            let amt = Number(row.payItems?.[s.cd] || 0);
            if (s.etc) amt += etcPayExtra;
            return { nm: s.nm, amt };
        });
        const dedsAll = dedSlots.map(s => {
            let amt = Number(row.deductionItems?.[s.cd] || 0);
            if (s.etc) amt += etcDedExtra;
            return { nm: s.nm, amt };
        });

        const incomeTax = dedsAll.find(d => d.nm === '소득세')?.amt || 0;
        const localTax  = dedsAll.find(d => d.nm === '지방소득세')?.amt || 0;
        const deds = dedsAll.filter(d => d.nm !== '소득세' && d.nm !== '지방소득세');

        const sum = calculateRowSummary(row);
        return {
            siteName: row.siteName || '', id: row.id || '', role: row.role || '', staff: row.staff || '',
            pays, deds, incomeTax, localTax,
            grossTotal: sum.gross, dedTotal: sum.ded, netPay: sum.net,
        };
    };

    const exportPayslipPDF = async ({ selectedRows, year, month, companyNm }) => {
        if (!selectedRows || selectedRows.length === 0) { alert('급여 명세서를 출력할 직원을 체크해주세요.'); return; }
        if (!year || !month) { alert('급여 연월을 선택해주세요.'); return; }

        const siteMap = new Map();
        selectedRows.forEach(e => {
            const key = e.sIdx ?? e.siteName ?? '-';
            if (!siteMap.has(key)) siteMap.set(key, { siteName: e.siteName || '소속없음', emps: [] });
            siteMap.get(key).emps.push(e);
        });
        const sites = [...siteMap.values()];

        isPayslipCancelled.value = false;
        payslipTotal.value = sites.length;
        payslipProgress.value = 0;
        currentPayslipSiteName.value = '';
        isPayslipModalOpen.value = true;

        alert("급여 명세서 PDF 다운로드를 시작합니다.\n※ 현장별로 파일이 분리되므로 브라우저의 '다중 파일 다운로드 허용'을 선택해주세요.");

        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        for (let i = 0; i < sites.length; i++) {
            if (isPayslipCancelled.value) break;
            const site = sites[i];
            currentPayslipSiteName.value = site.siteName;
            await delay(200);
            if (isPayslipCancelled.value) break;

            try {
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const pdfW = 210, pdfH = 297, margin = 5;

                for (let j = 0; j < site.emps.length; j += 2) {
                    const pair = site.emps.slice(j, j + 2).map(buildPayslipData);
                    payslipRender.value = { year, month, companyNm, emps: pair };
                    await nextTick();
                    await delay(100);

                    const node = document.getElementById('payslip-render-root');
                    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
                    const img = canvas.toDataURL('image/png');
                    const imgW = pdfW - margin * 2;
                    const imgH = pdfH - margin * 2;

                    if (j > 0) pdf.addPage();
                    pdf.addImage(img, 'PNG', margin, margin, imgW, imgH);
                }

                const safeName = site.siteName.replace(/[\\/?*\[\]]/g, '_');
                pdf.save(`급여명세서_${year}년${month}월_${safeName}.pdf`);
                payslipProgress.value = i + 1;
            } catch (err) {
                console.error(`${site.siteName} PDF 생성 중 오류:`, err);
            }
        }

        payslipRender.value = { year: '', month: '', companyNm: '', emps: [] };

        if (!isPayslipCancelled.value) {
            currentPayslipSiteName.value = '모든 PDF 출력 완료!';
            setTimeout(() => { isPayslipModalOpen.value = false; }, 1500);
        }
    };

    return {
        depRows,
        spaceOut,
        isPayslipModalOpen,
        isPayslipCancelled,
        payslipTotal,
        payslipProgress,
        currentPayslipSiteName,
        payslipRender,
        cancelPayslipExport,
        exportPayslipPDF,
    };
}
