/**
 * step4_barchart.js — 빈도수 기반 막대차트 (Chart.js)
 */
const Step4 = (() => {

  let chartInstance = null;
  let topN      = 20;
  let direction = 'vertical';   // 'vertical' | 'horizontal'
  let colorTheme = 'gradient';  // 'solid' | 'gradient' | 'rainbow'

  // ── 색상 팔레트 ────────────────────────────────────
  const RAINBOW = [
    '#6366f1','#8b5cf6','#ec4899','#f43f5e',
    '#f97316','#f59e0b','#22c55e','#14b8a6',
    '#3b82f6','#06b6d4','#a855f7','#84cc16',
  ];

  // ── UI 렌더링 ──────────────────────────────────────
  function render() {
    if (!App.state.frequency.length) {
      document.getElementById('step-container').innerHTML = `
        <div class="card mt-4">
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div class="empty-text">먼저 Step 3에서 빈도수 분석을 완료해주세요.</div>
          </div>
        </div>`;
      return;
    }

    document.getElementById('step-container').innerHTML = `
      <!-- 컨트롤 카드 -->
      <div class="card mt-4">
        <div class="flex flex-wrap gap-4 items-center justify-between">

          <!-- 상위 N 슬라이더 -->
          <div class="flex items-center gap-3 flex-1 min-w-48">
            <span class="text-sm font-semibold whitespace-nowrap" style="color:var(--text-secondary)">상위</span>
            <input
              type="range" id="slider-topn"
              min="5" max="50" value="${topN}" step="5"
              class="chart-slider flex-1"
              oninput="Step4.setTopN(+this.value)"
            />
            <span id="topn-label" class="font-extrabold text-white w-8 text-right">${topN}</span>
            <span class="text-sm" style="color:var(--text-muted)">개</span>
          </div>

          <!-- 방향 토글 -->
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold" style="color:var(--text-secondary)">방향</span>
            <div class="flex gap-1">
              <button class="chart-opt-btn ${direction==='vertical'?'active':''}"
                onclick="Step4.setDirection('vertical', this)">세로</button>
              <button class="chart-opt-btn ${direction==='horizontal'?'active':''}"
                onclick="Step4.setDirection('horizontal', this)">가로</button>
            </div>
          </div>

          <!-- 색상 테마 -->
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold" style="color:var(--text-secondary)">색상</span>
            <div class="flex gap-1">
              <button class="chart-opt-btn ${colorTheme==='solid'?'active':''}"
                onclick="Step4.setColor('solid', this)">단색</button>
              <button class="chart-opt-btn ${colorTheme==='gradient'?'active':''}"
                onclick="Step4.setColor('gradient', this)">그라디언트</button>
              <button class="chart-opt-btn ${colorTheme==='rainbow'?'active':''}"
                onclick="Step4.setColor('rainbow', this)">다채색</button>
            </div>
          </div>

          <!-- PNG 저장 -->
          <button onclick="Step4.downloadPNG()" class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
            <span>🖼</span> PNG
          </button>
        </div>
      </div>

      <!-- 차트 카드 -->
      <div class="card mt-3">
        <div id="chart-wrap" style="position:relative; width:100%; height:480px;">
          <canvas id="bar-chart"></canvas>
        </div>
      </div>
    `;

    // Chart.js 글로벌 폰트 설정
    Chart.defaults.font.family = 'Pretendard';
    Chart.defaults.color = '#94a3b8';

    drawChart();
    App.completeStep(3);
  }

  // ── 차트 그리기 ───────────────────────────────────
  function drawChart() {
    const data = App.state.frequency.slice(0, topN);
    if (!data.length) return;

    const labels = data.map(d => d.word);
    const counts = data.map(d => d.count);
    const total  = counts.reduce((s, c) => s + c, 0);

    const colors = getColors(counts.length);
    const isHorizontal = direction === 'horizontal';

    // 기존 차트 제거
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const ctx = document.getElementById('bar-chart').getContext('2d');

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '빈도수',
          data: counts,
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace('0.85', '1')),
          borderWidth: 1,
          borderRadius: isHorizontal ? 4 : 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: isHorizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,18,30,0.95)',
            borderColor: 'rgba(99,102,241,0.3)',
            borderWidth: 1,
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => {
                const cnt = item.raw;
                const pct = (cnt / App.state.flatTokens.length * 100).toFixed(2);
                return [`빈도수: ${cnt.toLocaleString()}회`, `비율: ${pct}%`];
              },
            },
          },
        },
        scales: {
          x: {
            grid:  { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: {
              color: '#64748b',
              font: { family: 'Pretendard', size: 12, weight: '600' },
              maxRotation: isHorizontal ? 0 : 40,
            },
          },
          y: {
            grid:  { color: 'rgba(255,255,255,0.05)', drawBorder: false },
            ticks: {
              color: '#64748b',
              font: { family: 'Pretendard', size: 12, weight: '600' },
              callback: (v) => isHorizontal ? v : v.toLocaleString(),
            },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // ── 색상 생성 ─────────────────────────────────────
  function getColors(n) {
    if (colorTheme === 'solid') {
      return Array(n).fill('rgba(99,102,241,0.85)');
    }
    if (colorTheme === 'gradient') {
      // 1위 = 진한 인디고, 끝 = 연한 퍼플
      return Array.from({ length: n }, (_, i) => {
        const t = i / Math.max(n - 1, 1);
        const r = Math.round(99  + (167 - 99)  * t);
        const g = Math.round(102 + (139 - 102) * t);
        const b = Math.round(241 + (250 - 241) * t);
        const a = 0.9 - t * 0.35;
        return `rgba(${r},${g},${b},${a})`;
      });
    }
    if (colorTheme === 'rainbow') {
      return Array.from({ length: n }, (_, i) =>
        hexToRgba(RAINBOW[i % RAINBOW.length], 0.85)
      );
    }
    return Array(n).fill('rgba(99,102,241,0.85)');
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ── 컨트롤 핸들러 ─────────────────────────────────
  function setTopN(n) {
    topN = n;
    document.getElementById('topn-label').textContent = n;
    drawChart();
  }

  function setDirection(dir, btn) {
    direction = dir;
    document.querySelectorAll('.chart-opt-btn').forEach(b => {
      if (b.onclick?.toString().includes('setDirection')) b.classList.remove('active');
    });
    btn.classList.add('active');
    drawChart();
  }

  function setColor(theme, btn) {
    colorTheme = theme;
    document.querySelectorAll('.chart-opt-btn').forEach(b => {
      if (b.onclick?.toString().includes('setColor')) b.classList.remove('active');
    });
    btn.classList.add('active');
    drawChart();
  }

  // ── PNG 다운로드 ──────────────────────────────────
  function downloadPNG() {
    const canvas = document.getElementById('bar-chart');
    if (!canvas) { App.showToast('차트가 없습니다.', 'error'); return; }
    Utils.downloadCanvasAsPNG(canvas, `barchart_${Utils.timestamp()}.png`);
    App.showToast('PNG 파일을 저장했습니다.', 'success');
  }

  return { render, setTopN, setDirection, setColor, downloadPNG };

})();
