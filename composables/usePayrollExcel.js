import { ref } from 'vue';
import XLSX from 'xlsx-js-style';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * 급여 지급대장 엑셀 생성/다운로드 로직.
 *
 * @param {Object} opts
 * @param {Ref} opts.payItemsRef       - 지급항목 computed Ref
 * @param {Ref} opts.deductionItemsRef - 공제항목 computed Ref
 * @param {(row:any) => {gross:number, ded:number, net:number}} opts.calculateRowSummary
 */
export function usePayrollExcel({ payItemsRef, deductionItemsRef, calculateRowSummary }) {
    // ─────────────────────────────── 상수/설정
    const REGISTER = {
        company: '주식회사이지종합관리',
        contact: 'Tel.031-906-2002 Fax.031-906-2211',
        notice: `${new Date().getFullYear()}년 직장인건강검진 받으시기 바랍니다.`,
        blocksPerPage: 6,
        pageHeightPt: 594,
    };

    const REG_PAY_SLOTS = [
        { r: 0, c: 6,  nm: '기본급' },       { r: 0, c: 7,  nm: '직책수당' }, { r: 0, c: 10, nm: '연차수당' },
        { r: 0, c: 11, nm: '야간수당' },     { r: 0, c: 12, nm: '기타수당', etc: true },
        { r: 1, c: 6,  nm: '식대' },         { r: 1, c: 7,  nm: '대근비' },   { r: 1, c: 10, nm: '휴가비' },
        { r: 1, c: 11, nm: '근로자의날수당' }, { r: 1, c: 12, nm: '복지수당' },
    ];
    const REG_DED_SLOTS = [
        { r: 0, c: 13, nm: '건강보험' },   { r: 0, c: 14, nm: '장기요양보험' }, { r: 0, c: 16, nm: '국민연금' },
        { r: 1, c: 13, nm: '고용보험' },   { r: 1, c: 14, nm: '기타공제', etc: true }, { r: 1, c: 16, nm: '환급소득세' },
        { r: 2, c: 13, nm: '환급주민세' }, { r: 2, c: 14, nm: '기타보험료' },
        { r: 2, c: 16, nm: '피복비공제료', label: '피복비 공제료' },
        { r: 4, c: 13, nm: '소득세' },     { r: 4, c: 14, nm: '지방소득세' },
    ];

    const REG_VB = {
        1: ['medium', 'thin'], 2: ['thin', 'thin'], 3: ['thin', 'thin'], 4: ['thin', 'thin'], 5: ['thin', 'double'],
        6: ['double', 'thin'], 7: ['thin', 'thin'], 8: [null, null], 9: [null, 'thin'],
        10: ['thin', 'thin'], 11: ['thin', 'thin'], 12: ['thin', 'double'],
        13: ['double', 'thin'], 14: ['thin', 'thin'], 15: [null, 'thin'], 16: ['thin', 'double'],
        17: ['double', 'thin'], 18: [null, null], 19: [null, 'thin'], 20: ['thin', null], 21: [null, 'medium'],
    };
    const REG_COL_W = [9.25, 9.625, 3.375, 3.375, 3.375, 3.375, 12.25, 6.75, 3.25, 2.625, 12.375, 12.25,
        12.625, 12.625, 1, 11.25, 12.625, 6.625, 4.875, 1.75, 2.25, 6.25, 0.25, 6.25];
    const REG_NCOL = 24;
    const REG_RH = { pad: 51, title: 22.5, pay: 6, comp: 9, gap1: 7.5, gap2: 2.25, grp: 12.75, note: 13.5, tel: 13.5, brk: 10.5 };
    const REG_BLOCK_H = [12, 12, 13.5, 12.75, 12.75];

    const F  = (sz, bold) => ({ name: '나눔고딕', sz, bold: !!bold });
    const F9 = F(9), F9B = F(9, true);
    const FILL_H = { patternType: 'solid', fgColor: { rgb: 'E6E6FA' } };
    const AC = { horizontal: 'center', vertical: 'center' };
    const AR = { horizontal: 'right',  vertical: 'center' };
    const AL = { horizontal: 'left',   vertical: 'top'    };
    const AD = { horizontal: 'distributed', vertical: 'center' };

    // ─────────────────────────────── 코어: 시트 데이터 빌드
    const generateExcelSheetData = (siteGroupsArray, year, month, payDateLabel) => {
        const norm = (s) => String(s || '').replace(/[\s()]/g, '');
        const cdOf = (list, nm) => (list.find(i => norm(i.itemNm) === norm(nm)) || {}).itemCd || null;
        const paySlots = REG_PAY_SLOTS.map(s => ({ ...s, cd: cdOf(payItemsRef.value, s.nm) }));
        const dedSlots = REG_DED_SLOTS.map(s => ({ ...s, cd: cdOf(deductionItemsRef.value, s.nm) }));
        const mappedPay = new Set(paySlots.map(s => s.cd).filter(Boolean));
        const mappedDed = new Set(dedSlots.map(s => s.cd).filter(Boolean));
        const etcPayKey = (() => { const s = paySlots.find(x => x.etc); return s ? `${s.r}_${s.c}` : null; })();
        const etcDedKey = (() => { const s = dedSlots.find(x => x.etc); return s ? `${s.r}_${s.c}` : null; })();

        const toGrid = (payMap, dedMap) => {
            const g = {};
            paySlots.forEach(s => { g[`${s.r}_${s.c}`] = Number(payMap?.[s.cd] || 0); });
            dedSlots.forEach(s => { g[`${s.r}_${s.c}`] = Number(dedMap?.[s.cd] || 0); });
            let restP = 0, restD = 0;
            payItemsRef.value.forEach(i => { if (!mappedPay.has(i.itemCd)) restP += Number(payMap?.[i.itemCd] || 0); });
            deductionItemsRef.value.forEach(i => { if (!mappedDed.has(i.itemCd)) restD += Number(dedMap?.[i.itemCd] || 0); });
            if (etcPayKey) g[etcPayKey] = Number(g[etcPayKey] || 0) + restP;
            if (etcDedKey) g[etcDedKey] = Number(g[etcDedKey] || 0) + restD;
            return g;
        };

        const BPP = REGISTER.blocksPerPage;
        const pages = [];

        siteGroupsArray.forEach((g, gi) => {
            const blocks = g.emps.map(e => ({ kind: 'emp', emp: e }));
            blocks.push({ kind: 'sum', label: g.isTotal ? '합계' : '부서계', emps: g.emps, siteName: g.siteName });
            if (!g.isTotal && siteGroupsArray.length > 1 && gi === siteGroupsArray.length - 1) {
                const allEmps = siteGroupsArray.flatMap(sg => sg.emps);
                blocks.push({ kind: 'sum', label: '합계', emps: allEmps, siteName: '' });
            }
            for (let i = 0; i < blocks.length; i += BPP) pages.push(blocks.slice(i, i + BPP));
        });

        const wsData = []; const merges = []; const rowH = [];
        const pushH = (h) => rowH.push({ hpt: h });
        let R = 0;

        const line = (top, bottom, fill) => {
            const row = new Array(REG_NCOL).fill(null);
            for (let c = 1; c <= 21; c++) {
                const [l, r] = REG_VB[c];
                row[c] = { v: '', t: 's', s: { font: F9, fill: fill ? FILL_H : { patternType: 'none' }, alignment: AC, border: { top: top ? { style: top } : undefined, bottom: bottom ? { style: bottom } : undefined, left: l ? { style: l } : undefined, right: r ? { style: r } : undefined } } };
            }
            return row;
        };
        const blank = () => new Array(REG_NCOL).fill(null).map(() => ({ v: '', t: 's', s: { font: F9 } }));
        const seam = (row, a, b) => { for (let c = a; c <= b; c++) { if (!row[c]) continue; if (c > a) row[c].s.border.left = undefined; if (c < b) row[c].s.border.right = undefined; } };
        const hmerge = (row, r, a, b) => { seam(row, a, b); merges.push({ s: { r, c: a }, e: { r, c: b } }); };
        const vmerge = (r1, c1, r2, c2) => merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

        const put = (row, c, v, opt = {}) => {
            if (!row[c]) return;
            const isNum = typeof v === 'number';
            row[c].v = v === null || v === undefined ? '' : v;
            row[c].t = isNum ? 'n' : 's';
            if (isNum) row[c].z = opt.z || '#,##0_ ';
            if (opt.font) row[c].s.font = opt.font;
            row[c].s.alignment = opt.align || (isNum ? AR : AC);
        };
        const money = (row, c, v) => { if (Number(v || 0) !== 0) put(row, c, Number(v || 0)); };

        const pushHeader = () => {
            const g = line('medium', 'thin', true);
            put(g, 6, '지\u00a0\u00a0급\u00a0\u00a0내\u00a0\u00a0역', { font: F9B });
            put(g, 13, '공\u00a0\u00a0\u00a0제\u00a0\u00a0\u00a0내\u00a0\u00a0\u00a0역', { font: F9B });
            put(g, 17, '합계'); put(g, 20, '영수인');
            hmerge(g, R, 2, 5); hmerge(g, R, 6, 12); hmerge(g, R, 13, 16); seam(g, 17, 19); seam(g, 20, 21); vmerge(R, 17, R + 2, 19); vmerge(R, 20, R + 5, 21);
            wsData.push(g); R++;
            const H = [0, 1, 2, 3, 4].map(() => line('thin', 'thin', true));
            const L = ['사 원 번 호', '직위', '성명', '근로일수', '근로시간수'];
            L.forEach((t, i) => put(H[i], 1, t, { font: i === 4 ? F(8.6) : F9, align: i === 0 ? AC : AD }));
            put(H[0], 2, '입 사 일 자'); hmerge(H[0], R, 2, 5);
            put(H[1], 2, '경'); put(H[1], 3, '부'); put(H[1], 4, '7');
            put(H[2], 2, '배'); put(H[2], 3, '20\u00a0'); put(H[2], 4, '60\u00a0'); put(H[2], 5, '장');
            put(H[3], 2, '연장', { align: AD }); hmerge(H[3], R + 3, 2, 3); put(H[3], 4, '야간', { align: AD }); hmerge(H[3], R + 3, 4, 5);
            put(H[4], 2, '휴일', { align: AD }); hmerge(H[4], R + 4, 2, 3); hmerge(H[4], R + 4, 4, 5);
            [...paySlots, ...dedSlots].forEach(s => put(H[s.r], s.c, s.label || s.nm, { font: F9B, align: AD }));
            ['지급합계', '공제합계', '차인지급액'].forEach((t, i) => put(H[i + 2], 17, t, { align: AD }));
            H.forEach((row, i) => { hmerge(row, R + i, 7, 9); hmerge(row, R + i, 14, 15); });
            [2, 3, 4].forEach(i => hmerge(H[i], R + i, 17, 19));
            H.forEach(row => { wsData.push(row); R++; });
        };

        const pushBlock = (blk) => {
            const rows = [line('medium', 'thin'), line('thin', 'thin'), line('thin', 'thin'), line('thin', 'thin'), line('thin', 'medium')];
            const R0 = R; let grid, sum;
            if (blk.kind === 'emp') {
                const e = blk.emp; grid = toGrid(e.payItems || {}, e.deductionItems || {});
                sum = calculateRowSummary(e);
                put(rows[0], 1, e.id || ''); put(rows[0], 2, e.inDate || '');
                put(rows[1], 1, e.role || ''); put(rows[1], 2, '0'); put(rows[1], 3, '0'); put(rows[1], 4, '0');
                put(rows[2], 1, e.staff || ''); put(rows[2], 3, '0'); put(rows[2], 4, '0'); put(rows[2], 5, '0');
                put(rows[3], 1, String(Number(e.workedDays || 0))); put(rows[3], 2, '0.00'); put(rows[3], 4, '0.00');
                put(rows[4], 1, 209, { z: '#,##0.00_ ', align: AC }); put(rows[4], 2, '0.00');
            } else {
                const pt = {}, dt = {};
                blk.emps.forEach(e => { Object.entries(e.payItems || {}).forEach(([k, v]) => { pt[k] = Number(pt[k] || 0) + Number(v || 0); }); Object.entries(e.deductionItems || {}).forEach(([k, v]) => { dt[k] = Number(dt[k] || 0) + Number(v || 0); }); });
                grid = toGrid(pt, dt);
                sum = blk.emps.reduce((a, e) => { const s = calculateRowSummary(e); return { gross: a.gross + s.gross, ded: a.ded + s.ded, net: a.net + s.net }; }, { gross: 0, ded: 0, net: 0 });
                put(rows[0], 1, blk.label, { font: F9B });
                if (blk.siteName) put(rows[0], 2, blk.siteName);
                put(rows[4], 2, `${blk.emps.length}명`, { font: F9B });
            }
            [...paySlots, ...dedSlots].forEach(s => money(rows[s.r], s.c, grid[`${s.r}_${s.c}`]));
            put(rows[2], 17, Number(sum.gross || 0)); put(rows[3], 17, Number(sum.ded || 0)); put(rows[4], 17, Number(sum.net || 0));

            rows.forEach((row, i) => {
                const rr = R0 + i;
                if (i === 0 || (blk.kind === 'sum' && (i === 3 || i === 4))) hmerge(row, rr, 2, 5);
                if (blk.kind === 'emp' && (i === 3 || i === 4)) { hmerge(row, rr, 2, 3); hmerge(row, rr, 4, 5); }
                hmerge(row, rr, 7, 9); hmerge(row, rr, 14, 15); hmerge(row, rr, 17, 19); seam(row, 20, 21);
                if (i > 0) { row[20].s.border.top = undefined; row[21].s.border.top = undefined; }
                if (i < 4) { row[20].s.border.bottom = undefined; row[21].s.border.bottom = undefined; }
                wsData.push(row); R++;
            });
            vmerge(R0, 20, R0 + 4, 21);
        };

        pages.forEach((blocks, pi) => {
            wsData.push(blank()); R++; pushH(REG_RH.pad);
            const t = blank(); t[9] = { v: `${year}년 ${month}월 급여 지급대장`, t: 's', s: { font: F(16), alignment: AC } };
            wsData.push(t); merges.push({ s: { r: R, c: 9 }, e: { r: R, c: 14 } }); R++; pushH(REG_RH.title);
            const p = blank(); p[9] = { v: payDateLabel, t: 's', s: { font: F(10), alignment: AC } };
            wsData.push(p); merges.push({ s: { r: R, c: 9 }, e: { r: R + 1, c: 14 } }); R++; pushH(REG_RH.pay);
            const cp = blank(); cp[1] = { v: REGISTER.company, t: 's', s: { font: F(10), alignment: AL } };
            wsData.push(cp); merges.push({ s: { r: R, c: 1 }, e: { r: R + 1, c: 7 } }); R++; pushH(REG_RH.comp);
            wsData.push(blank()); R++; pushH(REG_RH.gap1); wsData.push(blank()); R++; pushH(REG_RH.gap2);

            pushHeader(); pushH(REG_RH.grp); REG_BLOCK_H.forEach(pushH);
            blocks.forEach(b => { pushBlock(b); REG_BLOCK_H.forEach(pushH); });

            const fixed = REG_RH.pad + REG_RH.title + REG_RH.pay + REG_RH.comp + REG_RH.gap1 + REG_RH.gap2 + REG_RH.grp + REG_BLOCK_H.reduce((a, b) => a + b, 0) + REG_RH.note + REG_RH.tel + REG_RH.brk;
            const filler = Math.max(3, REGISTER.pageHeightPt - fixed - blocks.length * 63);
            wsData.push(blank()); R++; pushH(filler);

            const nt = blank(); nt[1] = { v: REGISTER.notice, t: 's', s: { font: F(8), alignment: AL } };
            wsData.push(nt); merges.push({ s: { r: R, c: 1 }, e: { r: R, c: 18 } }); R++; pushH(REG_RH.note);

            const ft = blank(); ft[1] = { v: REGISTER.contact, t: 's', s: { font: F(8), alignment: AL } };
            ft[19] = { v: `${pi + 1}/${pages.length}`, t: 's', s: { font: F(10), alignment: { horizontal: 'left', vertical: 'center' } } };
            wsData.push(ft); merges.push({ s: { r: R, c: 1 }, e: { r: R, c: 18 } }); merges.push({ s: { r: R, c: 19 }, e: { r: R, c: 21 } }); R++; pushH(REG_RH.tel);

            const brk = blank(); brk[23] = { v: ' ', t: 's', s: { font: F9 } };
            wsData.push(brk); R++; pushH(REG_RH.brk);
        });

        return { wsData, merges, rowH };
    };

    // xlsx-js-style은 pageSetup XML을 기록하지 않아 인쇄 시 가로 폭이 잘림.
    // 생성된 xlsx를 열어 각 시트에 '가로방향 + 가로 1장 맞춤' 설정을 주입한다.
    const writeXLSXWithPrintSetup = async (wb, filename) => {
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const zip = await JSZip.loadAsync(buf);
        const sheetPaths = Object.keys(zip.files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));

        for (const path of sheetPaths) {
            let xml = await zip.file(path).async('string');

            const fitToPageTag = '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
            if (/<sheetPr\s*\/>/.test(xml)) {
                xml = xml.replace(/<sheetPr\s*\/>/, fitToPageTag);
            } else if (/<sheetPr[^>]*>[\s\S]*?<\/sheetPr>/.test(xml)) {
                xml = xml.replace(/<sheetPr([^>]*)>([\s\S]*?)<\/sheetPr>/, (_m, attrs, inner) => {
                    const innerClean = inner.replace(/<pageSetUpPr[^>]*\/>/g, '');
                    return `<sheetPr${attrs}>${innerClean}<pageSetUpPr fitToPage="1"/></sheetPr>`;
                });
            } else {
                xml = xml.replace(/(<worksheet[^>]*>)/, `$1${fitToPageTag}`);
            }

            const pageSetupTag = '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
            if (/<pageSetup[^>]*\/>/.test(xml)) {
                xml = xml.replace(/<pageSetup[^>]*\/>/, pageSetupTag);
            } else if (/<pageMargins[^>]*\/>/.test(xml)) {
                xml = xml.replace(/(<pageMargins[^>]*\/>)/, `$1${pageSetupTag}`);
            } else {
                xml = xml.replace(/<\/worksheet>/, `${pageSetupTag}</worksheet>`);
            }

            zip.file(path, xml);
        }

        const blob = await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        saveAs(blob, filename);
    };

    const buildPayDateLabel = (year, month, selectedPaymentDay) => {
        if (selectedPaymentDay) {
            const [y, m, d] = String(selectedPaymentDay).split('-');
            return `지급일자 : ${y}년${m}월${d}일`;
        }
        const dt = new Date(Number(year), Number(month), 10);
        return `지급일자 : ${dt.getFullYear()}년${String(dt.getMonth() + 1).padStart(2, '0')}월10일`;
    };

    const groupBySite = (rows, { isTotal = false } = {}) => {
        const siteMap = new Map();
        rows.forEach(e => {
            const key = e.sIdx ?? e.siteName ?? '-';
            if (!siteMap.has(key)) siteMap.set(key, { siteName: e.siteName || '소속없음', emps: [], isTotal });
            siteMap.get(key).emps.push(e);
        });
        return [...siteMap.values()];
    };

    const buildSheet = (siteGroups, year, month, payDateLabel) => {
        const { wsData, merges, rowH } = generateExcelSheetData(siteGroups, year, month, payDateLabel);
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!merges'] = merges;
        ws['!cols'] = REG_COL_W.map(w => ({ wch: w }));
        ws['!rows'] = rowH;
        ws['!margins'] = { left: 0, right: 0, top: 0, bottom: 0, header: 0, footer: 0 };
        return ws;
    };

    // ─────────────────────────────── 1) 전체 통합 대장
    const exportPayrollExcel = async ({ rows, year, month, selectedPaymentDay }) => {
        if (!rows || rows.length === 0) { alert('출력할 데이터가 없습니다.'); return; }
        const payDateLabel = buildPayDateLabel(year, month, selectedPaymentDay);
        const sites = groupBySite(rows, { isTotal: false });
        const ws = buildSheet(sites, year, month, payDateLabel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `pays_${year}m${month}`);
        await writeXLSXWithPrintSetup(wb, `지급대장_${year}년${month}월.xlsx`);
    };

    // ─────────────────────────────── 2) 단지별 개별 출력 (진행률 모달 연동)
    const isExportModalOpen = ref(false);
    const isExportCancelled = ref(false);
    const exportTotal = ref(0);
    const exportProgress = ref(0);
    const currentExportSiteName = ref('');

    const cancelSiteExport = () => { isExportCancelled.value = true; };

    const exportPayrollExcelBySite = async ({ rows, year, month, selectedPaymentDay }) => {
        if (!rows || rows.length === 0) { alert('출력할 데이터가 없습니다.'); return; }
        const payDateLabel = buildPayDateLabel(year, month, selectedPaymentDay);
        const sites = groupBySite(rows, { isTotal: true });

        isExportCancelled.value = false;
        exportTotal.value = sites.length;
        exportProgress.value = 0;
        isExportModalOpen.value = true;

        alert("다운로드가 시작됩니다.\n※ 여러 개의 파일이 다운로드 되므로 브라우저 상단의 '다중 파일 다운로드 허용'을 꼭 선택해주세요.");

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        for (let i = 0; i < sites.length; i++) {
            if (isExportCancelled.value) break;
            const siteData = sites[i];
            currentExportSiteName.value = siteData.siteName;
            await delay(500);
            if (isExportCancelled.value) break;

            try {
                const ws = buildSheet([siteData], year, month, payDateLabel);
                const wb = XLSX.utils.book_new();
                const safeSiteName = siteData.siteName.replace(/[\\/?*\[\]]/g, '_');
                XLSX.utils.book_append_sheet(wb, ws, `지급대장`);
                await writeXLSXWithPrintSetup(wb, `지급대장_${year}년${month}월_${safeSiteName}.xlsx`);
                exportProgress.value = i + 1;
            } catch (err) {
                console.error(`${siteData.siteName} 엑셀 생성 중 오류:`, err);
            }
        }

        if (!isExportCancelled.value) {
            currentExportSiteName.value = '모든 파일 출력 완료!';
            setTimeout(() => { isExportModalOpen.value = false; }, 1500);
        }
    };

    return {
        // 1) 전체 대장
        exportPayrollExcel,
        // 2) 단지별
        exportPayrollExcelBySite,
        isExportModalOpen,
        isExportCancelled,
        exportTotal,
        exportProgress,
        currentExportSiteName,
        cancelSiteExport,
        // 헬퍼 (명세서 PDF 등에서 공유)
        REG_PAY_SLOTS,
        REG_DED_SLOTS,
    };
}
