/**
 * step6_sna.js — 소셜네트워크 분석 (D3.js force simulation)
 */
const Step6 = (() => {

  let simulation = null;
  let topN     = 50;
  let minCoOcc = 2;   // 기본값 3→2: 짧은 댓글 위주의 유튜브 데이터에서 3은 너무 엄격
  let selectedWord = null;

  // ── UI 렌더링 ──────────────────────────────────────
  function render() {
    if (!App.state.tokens?.length) {
      document.getElementById('step-container').innerHTML = `
        <div class="card mt-4">
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div class="empty-text">먼저 Step 2에서 전처리를 완료해주세요.</div>
          </div>
        </div>`;
      return;
    }

    document.getElementById('step-container').innerHTML = `
      <!-- 컨트롤 카드 -->
      <div class="card mt-4">
        <div class="flex flex-wrap gap-4 items-center justify-between">

          <!-- 상위 단어 수 -->
          <div class="flex items-center gap-3 flex-1 min-w-44">
            <span class="text-sm font-semibold whitespace-nowrap" style="color:var(--text-secondary)">상위</span>
            <input type="range" id="slider-topn-sna"
              min="10" max="100" value="${topN}" step="10"
              class="chart-slider flex-1"
              oninput="Step6.setTopN(+this.value)" />
            <span id="sna-topn-label" class="font-extrabold text-white w-8 text-right">${topN}</span>
            <span class="text-sm" style="color:var(--text-muted)">개</span>
          </div>

          <!-- 최소 공기 빈도 -->
          <div class="flex items-center gap-3 flex-1 min-w-44">
            <span class="text-sm font-semibold whitespace-nowrap" style="color:var(--text-secondary)">최소 공기</span>
            <input type="range" id="slider-minocc"
              min="1" max="10" value="${minCoOcc}" step="1"
              class="chart-slider flex-1"
              oninput="Step6.setMinCoOcc(+this.value)" />
            <span id="sna-minocc-label" class="font-extrabold text-white w-4 text-right">${minCoOcc}</span>
            <span class="text-sm" style="color:var(--text-muted)">회</span>
          </div>

          <div class="flex gap-2">
            <button onclick="Step6.resetGraph()" class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold">🔄 재배치</button>
            <button onclick="Step6.downloadPNG()" class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold">🖼 PNG</button>
            <button onclick="Step6.downloadCSV()" class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold">📥 CSV</button>
          </div>
        </div>
      </div>

      <!-- 범례 -->
      <div class="flex gap-4 mt-3 px-1 flex-wrap">
        <div class="flex items-center gap-2 text-xs" style="color:var(--text-muted)">
          <span class="legend-circle" style="width:16px;height:16px;background:rgba(99,102,241,0.7)"></span> 노드 크기 = 단어 빈도
        </div>
        <div class="flex items-center gap-2 text-xs" style="color:var(--text-muted)">
          <span class="legend-line"></span> 엣지 굵기 = 공기 빈도
        </div>
        <div class="flex items-center gap-2 text-xs" style="color:var(--text-muted)">
          🖱️ 드래그·스크롤·클릭 인터랙션 가능
        </div>
      </div>

      <!-- 그래프 카드 -->
      <div class="card mt-2" style="padding:0;overflow:hidden;border-radius:16px;">
        <div id="sna-graph-wrap" style="width:100%;height:520px;position:relative;background:#080c14;">
          <svg id="sna-svg" width="100%" height="100%"></svg>
          <div id="sna-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;">
            <div class="text-center px-6" style="color:var(--text-muted)">
              <div style="font-size:40px;margin-bottom:10px">🕸</div>
              <div class="font-bold mb-1">연결된 단어 쌍이 없습니다.</div>
              <div id="sna-empty-msg" class="text-sm leading-relaxed" style="max-width:340px"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 클릭한 노드의 관련 댓글 -->
      <div id="node-detail" class="card mt-3 hidden">
        <div class="flex items-center justify-between mb-3">
          <h3 id="node-detail-title" class="font-bold text-base" style="color:var(--text-primary)"></h3>
          <button onclick="document.getElementById('node-detail').classList.add('hidden')"
            class="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>
        <div id="node-detail-list" class="space-y-2 overflow-y-auto" style="max-height:200px;"></div>
      </div>

      <!-- 중심성 테이블 -->
      <div class="card mt-3">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-base" style="color:var(--text-primary)">📐 중심성 지표</h3>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:50px">순위</th>
                <th>단어</th>
                <th style="width:110px;text-align:right">연결 중심성</th>
                <th style="width:120px;text-align:right">가중 연결 중심성</th>
                <th>주요 공기어</th>
              </tr>
            </thead>
            <tbody id="centrality-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    buildGraph();
    App.completeStep(5);
  }

  // ── 공기어 행렬 계산 ──────────────────────────────
  function calcCoOccurrence() {
    const topWords = new Set(App.state.frequency.slice(0, topN).map(f => f.word));

    const coOcc = {}; // { 'word1__word2': count }
    const wordCount = {};

    let docsProcessed  = 0;
    let docsWithPairs  = 0; // 상위 단어 2개 이상 포함 댓글 수

    for (const { tokens } of App.state.tokens) {
      // 해당 댓글에서 상위 단어만 필터 (댓글 내 중복 제거)
      const filtered = [...new Set(tokens.filter(t => topWords.has(t)))];
      filtered.forEach(w => wordCount[w] = (wordCount[w] || 0) + 1);
      docsProcessed++;
      if (filtered.length >= 2) docsWithPairs++;

      // 모든 단어 쌍에 대해 공기 +1
      for (let i = 0; i < filtered.length; i++) {
        for (let j = i + 1; j < filtered.length; j++) {
          const key = [filtered[i], filtered[j]].sort().join('__');
          coOcc[key] = (coOcc[key] || 0) + 1;
        }
      }
    }

    const totalPairs      = Object.keys(coOcc).length;
    const afterThreshold  = Object.values(coOcc).filter(v => v >= minCoOcc).length;

    console.log(
      `[SNA] 댓글: ${docsProcessed}개 | 상위 단어: ${topWords.size}개 | ` +
      `2개 이상 포함 댓글: ${docsWithPairs}개`
    );
    console.log(
      `[SNA] 공기 쌍 (임계값 전): ${totalPairs}개 | ` +
      `임계값 ${minCoOcc}회 적용 후: ${afterThreshold}개`
    );

    return {
      coOcc, wordCount,
      _debug: { docsProcessed, docsWithPairs, totalPairs, afterThreshold },
    };
  }

  // ── 그래프 데이터 구성 ────────────────────────────
  function buildGraphData() {
    const { coOcc, wordCount, _debug } = calcCoOccurrence();

    // 링크 (최소 공기 빈도 필터)
    const links = Object.entries(coOcc)
      .filter(([, v]) => v >= minCoOcc)
      .map(([key, value]) => {
        const [source, target] = key.split('__');
        return { source, target, value };
      });

    // 링크에 등장한 단어만 노드로
    const nodeSet = new Set();
    links.forEach(l => { nodeSet.add(l.source); nodeSet.add(l.target); });

    const freqMap = {};
    App.state.frequency.forEach(f => freqMap[f.word] = f.count);

    const nodes = [...nodeSet].map(id => ({
      id,
      count: freqMap[id] || 1,
    }));

    console.log(`[SNA] 최종 노드: ${nodes.length}개 | 최종 엣지: ${links.length}개`);

    return { nodes, links, _debug };
  }

  // ── 중심성 계산 ───────────────────────────────────
  function calcCentrality(nodes, links) {
    const degree   = {};   // 연결된 이웃 수
    const weighted = {};   // 연결 가중치 합

    nodes.forEach(n => { degree[n.id] = 0; weighted[n.id] = 0; });

    links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      degree[s]   = (degree[s]   || 0) + 1;
      degree[t]   = (degree[t]   || 0) + 1;
      weighted[s] = (weighted[s] || 0) + l.value;
      weighted[t] = (weighted[t] || 0) + l.value;
    });

    const maxDeg = Math.max(...Object.values(degree), 1);

    // 이웃 단어 목록
    const neighbors = {};
    links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (!neighbors[s]) neighbors[s] = [];
      if (!neighbors[t]) neighbors[t] = [];
      neighbors[s].push({ word: t, value: l.value });
      neighbors[t].push({ word: s, value: l.value });
    });

    return nodes.map(n => ({
      id: n.id,
      degreeCentrality: degree[n.id] / maxDeg,
      weightedDegree: weighted[n.id],
      neighbors: (neighbors[n.id] || []).sort((a, b) => b.value - a.value).slice(0, 5),
    })).sort((a, b) => b.weightedDegree - a.weightedDegree);
  }

  // ── D3 그래프 그리기 ──────────────────────────────
  function buildGraph() {
    const { nodes, links, _debug } = buildGraphData();

    const wrap = document.getElementById('sna-graph-wrap');
    const svg  = d3.select('#sna-svg');
    svg.selectAll('*').remove();
    if (simulation) { simulation.stop(); simulation = null; }

    if (!nodes.length || !links.length) {
      const emptyEl = document.getElementById('sna-empty');
      emptyEl.style.display = 'flex';

      // 진단 정보를 포함한 구체적 안내 메시지
      const msgEl = document.getElementById('sna-empty-msg');
      if (msgEl && _debug) {
        const hint =
          _debug.totalPairs === 0
            ? `상위 ${topN}개 단어를 2개 이상 함께 포함한 댓글이 <b>${_debug.docsWithPairs}개</b>로 공기 쌍이 생성되지 않았습니다.<br>상위 단어 수를 늘려보세요.`
            : `공기 쌍 <b>${_debug.totalPairs}개</b> 발견 → 최소 ${minCoOcc}회 필터 후 <b>${_debug.afterThreshold}개</b> 남음.<br>` +
              (minCoOcc > 1 ? `최소 공기 빈도를 <b>${minCoOcc - 1}회</b>로 낮춰보세요.` : '상위 단어 수를 늘려보세요.');
        msgEl.innerHTML =
          `분석 댓글 <b>${_debug.docsProcessed}</b>개 · ` +
          `상위 단어 <b>${topN}</b>개 · 최소 공기 <b>${minCoOcc}</b>회<br>` +
          `2개 이상 단어 포함 댓글: <b>${_debug.docsWithPairs}</b>개<br><br>` +
          hint;
      }

      renderCentralityTable([], []);
      return;
    }
    document.getElementById('sna-empty').style.display = 'none';

    const W = wrap.clientWidth;
    const H = wrap.clientHeight;

    // 줌 설정
    const zoomG = svg.append('g');
    svg.call(d3.zoom()
      .scaleExtent([0.15, 5])
      .on('zoom', e => zoomG.attr('transform', e.transform))
    );

    // 스케일
    const freqMax = d3.max(nodes, n => n.count) || 1;
    const rScale  = d3.scaleSqrt().domain([1, freqMax]).range([6, 28]);
    const lScale  = d3.scaleLinear().domain([minCoOcc, d3.max(links, l => l.value) || minCoOcc]).range([1, 7]);

    // 중심성 (색상용)
    const centrality = calcCentrality(nodes, links);
    const centMap    = {};
    centrality.forEach(c => centMap[c.id] = c.degreeCentrality);
    const colorScale = d3.scaleLinear()
      .domain([0, 1])
      .range(['#4338ca', '#a5b4fc']);

    // 엣지
    const link = zoomG.append('g').selectAll('line')
      .data(links).join('line')
      .attr('stroke', 'rgba(148,163,184,0.25)')
      .attr('stroke-width', d => lScale(d.value))
      .attr('stroke-linecap', 'round');

    // 노드 그룹
    const node = zoomG.append('g').selectAll('g')
      .data(nodes).join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', dragStart)
        .on('drag',  dragged)
        .on('end',   dragEnd)
      )
      .on('click', (event, d) => showNodeDetail(d, centrality, links));

    // 원
    node.append('circle')
      .attr('r', d => rScale(d.count))
      .attr('fill', d => colorScale(centMap[d.id] || 0))
      .attr('fill-opacity', 0.85)
      .attr('stroke', d => colorScale(centMap[d.id] || 0))
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.4);

    // 글로우 효과 (중심성 높은 노드)
    node.filter(d => (centMap[d.id] || 0) > 0.5)
      .append('circle')
      .attr('r', d => rScale(d.count) + 4)
      .attr('fill', 'none')
      .attr('stroke', '#818cf8')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.3);

    // 레이블
    node.append('text')
      .text(d => d.id)
      .attr('text-anchor', 'middle')
      .attr('dy', d => rScale(d.count) + 13)
      .attr('font-family', 'Pretendard, sans-serif')
      .attr('font-size', d => Math.max(10, Math.min(rScale(d.count) * 0.7, 14)))
      .attr('font-weight', '700')
      .attr('fill', '#e2e8f0')
      .attr('pointer-events', 'none');

    // 시뮬레이션
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => 80 + rScale(d.source.count || 1) + rScale(d.target.count || 1)))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(d => rScale(d.count) + 8))
      .on('tick', () => {
        link
          .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        node.attr('transform', d => `translate(${d.x},${d.y})`);
      });

    renderCentralityTable(centrality, links);
  }

  // ── 드래그 핸들러 ─────────────────────────────────
  function dragStart(event, d) {
    if (!event.active) simulation?.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d)  { d.fx = event.x; d.fy = event.y; }
  function dragEnd(event, d)  {
    if (!event.active) simulation?.alphaTarget(0);
    d.fx = null; d.fy = null;
  }

  // ── 노드 클릭 → 관련 댓글 표시 ───────────────────
  function showNodeDetail(d, centrality, links) {
    selectedWord = d.id;
    const panel  = document.getElementById('node-detail');
    const title  = document.getElementById('node-detail-title');
    const list   = document.getElementById('node-detail-list');

    const cent = centrality.find(c => c.id === d.id);
    title.innerHTML = `
      <span class="tag mr-2">${d.id}</span>
      빈도: ${d.count}회 · 연결 중심성: ${cent ? (cent.degreeCentrality * 100).toFixed(1) : 0}%
    `;

    // 해당 단어 포함 댓글 최대 10개
    const matched = App.state.tokens
      .filter(t => t.tokens.includes(d.id))
      .slice(0, 10);

    if (!matched.length) {
      list.innerHTML = `<p class="text-sm" style="color:var(--text-muted)">관련 댓글이 없습니다.</p>`;
    } else {
      list.innerHTML = matched.map(t => `
        <div class="p-3 rounded-xl text-sm leading-relaxed" style="background:var(--glass-bg);border:1px solid var(--glass-border)">
          ${Utils.escapeHtml(t.original)}
        </div>`).join('');
    }

    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── 중심성 테이블 렌더링 ──────────────────────────
  function renderCentralityTable(centrality, links) {
    const tbody = document.getElementById('centrality-tbody');
    if (!tbody) return;

    if (!centrality.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6" style="color:var(--text-muted)">
        연결된 노드가 없습니다. 필터를 조정해보세요.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = centrality.slice(0, 30).map((c, i) => `
      <tr>
        <td><span class="rank-badge ${i < 3 ? 'rank-top' : ''}">${i + 1}</span></td>
        <td><span class="font-bold text-base" style="color:var(--text-primary)">${Utils.escapeHtml(c.id)}</span></td>
        <td class="text-right font-bold" style="color:var(--accent-light)">${(c.degreeCentrality * 100).toFixed(1)}%</td>
        <td class="text-right" style="color:var(--text-secondary)">${c.weightedDegree}</td>
        <td>
          <div class="flex flex-wrap gap-1">
            ${c.neighbors.slice(0, 4).map(n =>
              `<span class="tag" style="font-size:11px;padding:2px 8px;">${Utils.escapeHtml(n.word)}<span class="text-xs opacity-50 ml-1">${n.value}</span></span>`
            ).join('')}
          </div>
        </td>
      </tr>`).join('');
  }

  // ── 컨트롤 핸들러 ─────────────────────────────────
  function setTopN(n) {
    topN = n;
    document.getElementById('sna-topn-label').textContent = n;
    buildGraph();
  }

  function setMinCoOcc(n) {
    minCoOcc = n;
    document.getElementById('sna-minocc-label').textContent = n;
    buildGraph();
  }

  function resetGraph() {
    if (simulation) {
      simulation.alpha(1).restart();
      App.showToast('그래프를 재배치했습니다.', 'info', 1500);
    }
  }

  // ── PNG 저장 ──────────────────────────────────────
  function downloadPNG() {
    const svgEl = document.getElementById('sna-svg');
    const wrap  = document.getElementById('sna-graph-wrap');
    if (!svgEl) { App.showToast('그래프가 없습니다.', 'error'); return; }

    // SVG에 배경 추가 후 저장
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#080c14');
    clone.insertBefore(bg, clone.firstChild);

    Utils.downloadSVGAsPNG(clone, `sna_${Utils.timestamp()}.png`, wrap.clientWidth, wrap.clientHeight);
    App.showToast('PNG 파일을 저장했습니다.', 'success');
  }

  // ── CSV 저장 ──────────────────────────────────────
  function downloadCSV() {
    const { nodes, links } = buildGraphData();
    const centrality = calcCentrality(nodes, links);
    if (!centrality.length) { App.showToast('분석 결과가 없습니다.', 'error'); return; }

    const rows = [
      ['순위', '단어', '연결 중심성(%)', '가중 연결 중심성', '주요 공기어'],
      ...centrality.map((c, i) => [
        i + 1, c.id,
        (c.degreeCentrality * 100).toFixed(2),
        c.weightedDegree,
        c.neighbors.map(n => `${n.word}(${n.value})`).join(', '),
      ]),
    ];
    Utils.downloadCSV(rows, `sna_centrality_${Utils.timestamp()}.csv`);
    App.showToast('CSV 파일을 저장했습니다.', 'success');
  }

  return { render, setTopN, setMinCoOcc, resetGraph, downloadPNG, downloadCSV };

})();
