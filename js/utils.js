/**
 * utils.js
 * 공통 유틸리티 함수
 */
const Utils = (() => {

  // ── CSV 내보내기 ───────────────────────────────────
  async function downloadCSV(rows, filename) {
    // BOM 추가 (Excel 한글 깨짐 방지)
    const BOM = '\uFEFF';
    const csv = BOM + rows.map(row =>
      row.map(cell => {
        const str = String(cell ?? '');
        // 쉼표·개행·쌍따옴표 포함 시 따옴표로 감싸기
        return /[,\n\r"]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    await triggerDownload(blob, filename);
  }

  // ── Canvas → PNG 저장 ──────────────────────────────
  function downloadCanvasAsPNG(canvasEl, filename) {
    canvasEl.toBlob((blob) => {
      triggerDownload(blob, filename);
    }, 'image/png');
  }

  // ── SVG → PNG 저장 (D3 SNA용) ────────────────────
  function downloadSVGAsPNG(svgEl, filename, width, height) {
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      downloadCanvasAsPNG(canvas, filename);
    };
    img.src = url;
  }

  // ── 다운로드 트리거 ────────────────────────────────
  async function triggerDownload(blob, filename) {
    // 1순위: File System Access API — 네이티브 저장 대화상자 (Chrome 86+)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'CSV 파일', accept: { 'text/csv': ['.csv'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // 사용자가 취소
        // 실패 시 아래 방식으로 폴백
      }
    }
    // 2순위: Blob URL + anchor click
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── YouTube Video ID 추출 ─────────────────────────
  function extractVideoId(input) {
    const str = input.trim();

    // 이미 순수 ID 형태 (11자 영숫자+_-)
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;

    // URL에서 추출
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /embed\/([a-zA-Z0-9_-]{11})/,
      /shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
      const match = str.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // ── 숫자 포맷 ─────────────────────────────────────
  function formatNumber(n) {
    return n.toLocaleString('ko-KR');
  }

  // ── 날짜 포맷 ─────────────────────────────────────
  function formatDate(isoStr) {
    if (!isoStr) return '';
    return isoStr.slice(0, 10);
  }

  // ── HTML 이스케이프 ────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 현재 파일명용 타임스탬프 ──────────────────────
  function timestamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  }

  return {
    downloadCSV,
    downloadCanvasAsPNG,
    downloadSVGAsPNG,
    extractVideoId,
    formatNumber,
    formatDate,
    escapeHtml,
    timestamp,
  };

})();
