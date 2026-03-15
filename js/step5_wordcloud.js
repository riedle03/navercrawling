/**
 * step5_wordcloud.js — 워드클라우드 (wordcloud2.js)
 */
const Step5 = (() => {

  // ── 내부 상태 ──────────────────────────────────────
  let maxWords = 100;
  let palette  = 'indigo';
  let bgColor  = '#0f172a';

  // 렌더링 레이어 내부 상태 (외부에 노출 안 함)
  let _drawnListener = null; // wordclouddrawn 리스너 누적 방지
  let _generating    = false; // 중복 실행 방지

  // ── 색상 팔레트 정의 ──────────────────────────────
  const PALETTES = {
    indigo:  ['#c7d2fe','#a5b4fc','#818cf8','#6366f1','#4f46e5','#4338ca'],
    ocean:   ['#7dd3fc','#38bdf8','#0ea5e9','#0284c7','#06b6d4','#0891b2'],
    sunset:  ['#fda4af','#fb7185','#f43f5e','#f97316','#fb923c','#f59e0b'],
    forest:  ['#bbf7d0','#86efac','#4ade80','#22c55e','#34d399','#14b8a6'],
    pastel:  ['#fbcfe8','#c4b5fd','#93c5fd','#86efac','#fde68a','#fca5a5'],
  };

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

          <!-- 최대 단어 수 슬라이더 -->
          <div class="flex items-center gap-3 flex-1 min-w-48">
            <span class="text-sm font-semibold whitespace-nowrap" style="color:var(--text-secondary)">단어 수</span>
            <input
              type="range" id="slider-maxwords"
              min="20" max="200" value="${maxWords}" step="10"
              class="chart-slider flex-1"
              oninput="Step5.setMaxWords(+this.value)"
            />
            <span id="maxwords-label" class="font-extrabold text-white w-8 text-right">${maxWords}</span>
          </div>

          <!-- 색상 팔레트 -->
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold" style="color:var(--text-secondary)">색상</span>
            ${Object.entries({
              indigo: '인디고', ocean: '오션', sunset: '선셋', forest: '포레스트', pastel: '파스텔'
            }).map(([key, label]) => `
              <button
                class="palette-btn ${palette===key?'active':''}"
                onclick="Step5.setPalette('${key}', this)"
                title="${label}"
              >
                <span class="palette-dots">
                  ${PALETTES[key].slice(0,3).map(c=>`<span style="background:${c}"></span>`).join('')}
                </span>
                <span>${label}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="flex flex-wrap gap-4 items-center mt-3">
          <!-- 배경색 -->
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold" style="color:var(--text-secondary)">배경</span>
            ${[
              {val:'#0f172a', label:'다크'},
              {val:'#3730a3', label:'인디고'},
              {val:'#ffffff', label:'화이트'},
            ].map(b => `
              <button
                class="bg-btn ${bgColor===b.val?'active':''}"
                onclick="Step5.setBg('${b.val}', this)"
                style="background:${b.val}; border-color:${bgColor===b.val?'var(--accent)':'var(--glass-border)'}"
              >${b.label}</button>`).join('')}
          </div>

          <!-- 액션 버튼 -->
          <div class="flex gap-2 ml-auto">
            <button onclick="Step5.generate()" class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
              🔄 재생성
            </button>
            <button onclick="Step5.downloadPNG()" class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
              🖼 PNG
            </button>
          </div>
        </div>
      </div>

      <!-- 로딩 표시 -->
      <div id="wc-loading" class="card mt-3 hidden">
        <div class="flex items-center justify-center gap-3 py-8">
          <span class="spinner"></span>
          <span class="font-semibold" style="color:var(--text-secondary)">워드클라우드 생성 중...</span>
        </div>
      </div>

      <!-- 워드클라우드 캔버스 -->
      <div class="card mt-3" id="wc-card" style="padding:12px;">
        <div id="wc-wrap" style="width:100%;border-radius:10px;overflow:hidden;">
          <canvas id="wc-canvas"></canvas>
        </div>
        <p id="wc-info" class="text-xs mt-2 text-center" style="color:var(--text-muted)"></p>
      </div>
    `;

    requestAnimationFrame(() => {
      generate();
      App.completeStep(4);
    });
  }

  // ── 폰트 크기 계산 (log-normalise → power contrast) ───────────
  //
  //  전략: log(count+1) 정규화 후 power=1.8 대비 강화
  //  - log: 빈도 극단값 완화 → 중위권 단어도 적정 크기 확보
  //  - power 1.8: 상위/하위 크기 격차를 명확히 벌림
  //  - rank-floor: 상위 5위 최솟값 절대 보장
  //  - 적응형 면적 스케일: 추정 총면적이 캔버스 50% 초과 시 균등 축소
  //
  //  scaleFactor: 재시도 루프에서 주입하는 전역 배율 (기본 1.0)
  //
  function buildList(freq, W, H, scaleFactor = 1.0) {
    const n = freq.length;
    if (!n) return [];

    const FONT_MAX   = Math.min(Math.round(W * 0.13 * scaleFactor), 110);
    const FONT_MIN   = Math.max(10, Math.round(12 * scaleFactor));
    const RANK_FLOOR = [1.00, 0.80, 0.64, 0.51, 0.41]; // 상위 5위 보장 비율

    const maxCount = freq[0].count;
    const minCount = freq[n - 1].count;
    const logMax   = Math.log(maxCount + 1);
    const logMin   = Math.log(minCount + 1);
    const logRange = logMax - logMin || 1;

    const raw = freq
      .filter(({ word }) => word && typeof word === 'string' && word.trim().length > 0)
      .map(({ word, count }, rank) => {
        const logNorm = (Math.log(count + 1) - logMin) / logRange; // 0..1
        const powered = Math.pow(logNorm, 1.8);                     // 대비 강화
        let size = Math.round(FONT_MIN + powered * (FONT_MAX - FONT_MIN));

        if (rank < RANK_FLOOR.length) {
          size = Math.max(size, Math.round(RANK_FLOOR[rank] * FONT_MAX));
        }
        return [word.trim(), size];
      })
      .filter(([, sz]) => Number.isFinite(sz) && sz >= FONT_MIN);

    // ── 적응형 면적 스케일 ─────────────────────────────────────
    // 한국어 글자: 너비 ≈ fontSize × charCount × 0.62 (정방형에 가까움)
    const canvasArea   = W * H;
    const TARGET_FILL  = 0.50;
    const totalEstArea = raw.reduce((s, [w, sz]) => s + sz * sz * w.length * 0.62, 0);
    const targetArea   = canvasArea * TARGET_FILL;

    let finalList = raw;
    if (totalEstArea > targetArea) {
      const areaScale = Math.sqrt(targetArea / totalEstArea);
      finalList = raw.map(([w, sz]) => [w, Math.max(FONT_MIN, Math.round(sz * areaScale))]);
    }

    const sizes = finalList.map(([, s]) => s);
    console.log(
      `[WC] buildList | 후보: ${finalList.length}개 | ` +
      `크기: ${Math.min(...sizes)}~${Math.max(...sizes)}px | ` +
      `scaleFactor: ×${scaleFactor.toFixed(2)}`
    );

    return finalList;
  }

  // ── 워드클라우드 생성 (adaptive retry loop) ──────────────────
  //
  //  변경 사항 (렌더링 레이어만):
  //  - wordclouddrawn 리스너 누적 버그 수정 (_drawnListener 추적)
  //  - shape: 'square' → 코너까지 배치, 중앙 집중 완화
  //  - gridSize: 2 → 최대 배치 해상도
  //  - 재시도 최대 3회: 배치율 < 50% 이면 scaleFactor × 0.82 후 재시도
  //  - 캔버스 clearRect → 잔상 방지
  //
  async function generate() {
    const freq = App.state.frequency.slice(0, maxWords);
    if (!freq.length) return;

    // 중복 실행 방지
    if (_generating) return;
    _generating = true;

    const wcWrap  = document.getElementById('wc-wrap');
    const loading = document.getElementById('wc-loading');
    if (!wcWrap) { _generating = false; return; }

    loading?.classList.remove('hidden');

    const W = Math.min(wcWrap.clientWidth || 800, 1000);
    const H = Math.round(W * 0.62);

    const canvas = document.getElementById('wc-canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.width  = '100%';
    canvas.style.height = 'auto';
    wcWrap.style.background = bgColor;

    if (typeof WordCloud === 'undefined') {
      loading?.classList.add('hidden');
      App.showToast('wordcloud2 라이브러리를 불러오지 못했습니다. node server.js 로 실행해주세요.', 'error', 6000);
      _generating = false;
      return;
    }

    const colors        = PALETTES[palette] || PALETTES.indigo;
    const MAX_RETRIES   = 3;
    const SCALE_DECAY   = 0.82;   // 매 재시도마다 18% 축소
    const MIN_FIT_RATIO = 0.50;   // 목표: 요청 단어의 50% 이상 배치

    console.log(`[WC] 요청: ${freq.length}개 | 캔버스: ${W}×${H}`);

    // 한 번의 wordcloud2 실행을 Promise로 래핑
    const runPass = (scaleFactor) => new Promise((resolve) => {
      // 이전 리스너 정리 (누적 방지)
      if (_drawnListener) {
        canvas.removeEventListener('wordclouddrawn', _drawnListener);
        _drawnListener = null;
      }

      let placed = 0;
      _drawnListener = () => { placed++; };
      canvas.addEventListener('wordclouddrawn', _drawnListener);

      canvas.addEventListener('wordcloudstop', () => {
        if (_drawnListener) {
          canvas.removeEventListener('wordclouddrawn', _drawnListener);
          _drawnListener = null;
        }
        resolve(placed);
      }, { once: true });

      const list = buildList(freq, W, H, scaleFactor);

      // 잔상 방지: 캔버스 초기화
      canvas.getContext('2d').clearRect(0, 0, W, H);

      if (!list.length) { resolve(0); return; }

      try {
        WordCloud(canvas, {
          list,
          fontFamily:      'Pretendard, sans-serif',
          fontWeight:      'bold',
          color:           () => colors[Math.floor(Math.random() * colors.length)],
          rotateRatio:     0.20,  // 20% 90° 회전 허용 → 틈새 활용
          rotationSteps:   2,     // 0° 또는 90°
          backgroundColor: bgColor,
          gridSize:        2,     // 최대 배치 해상도 (이전: 4)
          minSize:         10,
          drawOutOfBound:  false,
          shape:           'square', // 코너 활용 (이전: 'circle')
          wait:            0,
        });
      } catch (e) {
        console.error('[WC] WordCloud 오류:', e);
        if (_drawnListener) {
          canvas.removeEventListener('wordclouddrawn', _drawnListener);
          _drawnListener = null;
        }
        resolve(0);
      }
    });

    // ── 적응형 재시도 루프 ─────────────────────────────────────
    let bestPlaced  = 0;
    let finalScale  = 1.0;
    let retryCount  = 0;
    let scaleFactor = 1.0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const placed   = await runPass(scaleFactor);
      const fitRatio = placed / freq.length;

      console.log(
        `[WC] 시도 ${attempt + 1}/${MAX_RETRIES + 1} | ` +
        `scale: ×${scaleFactor.toFixed(2)} | ` +
        `배치: ${placed}/${freq.length} (${(fitRatio * 100).toFixed(0)}%) | ` +
        `미배치: ${freq.length - placed}개`
      );

      if (placed > bestPlaced) {
        bestPlaced = placed;
        finalScale = scaleFactor;
      }

      if (fitRatio >= MIN_FIT_RATIO || attempt === MAX_RETRIES) {
        retryCount = attempt;
        break;
      }

      scaleFactor *= SCALE_DECAY;
      retryCount   = attempt + 1;
    }

    loading?.classList.add('hidden');

    const infoEl = document.getElementById('wc-info');
    if (infoEl) {
      const pct = Math.round((bestPlaced / freq.length) * 100);
      infoEl.textContent =
        `${bestPlaced}개 표시 (요청 ${freq.length}개 · ${pct}% 달성` +
        (retryCount > 0 ? ` · 재시도 ${retryCount}회 · 최종 배율 ×${finalScale.toFixed(2)}` : '') +
        `)`;
    }

    console.log(
      `[WC] 완료 | 최종 배치: ${bestPlaced}/${freq.length} | ` +
      `재시도: ${retryCount}회 | 최종 scale: ×${finalScale.toFixed(2)}`
    );

    _generating = false;
  }

  // ── 컨트롤 핸들러 ─────────────────────────────────
  function setMaxWords(n) {
    maxWords = n;
    document.getElementById('maxwords-label').textContent = n;
  }

  function setPalette(key, btn) {
    palette = key;
    document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    generate();
  }

  function setBg(color, btn) {
    bgColor = color;
    document.querySelectorAll('.bg-btn').forEach(b => {
      b.classList.remove('active');
      b.style.borderColor = 'var(--glass-border)';
    });
    btn.classList.add('active');
    btn.style.borderColor = 'var(--accent)';
    generate();
  }

  // ── PNG 저장 ──────────────────────────────────────
  function downloadPNG() {
    const canvas = document.getElementById('wc-canvas');
    if (!canvas) { App.showToast('워드클라우드가 없습니다.', 'error'); return; }
    Utils.downloadCanvasAsPNG(canvas, `wordcloud_${Utils.timestamp()}.png`);
    App.showToast('PNG 파일을 저장했습니다.', 'success');
  }

  return { render, generate, setMaxWords, setPalette, setBg, downloadPNG };

})();
