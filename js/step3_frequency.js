/**
 * step3_frequency.js — 빈도수 분석
 */
const Step3 = (() => {

  // ── 내부 상태 ──────────────────────────────────────
  let allFreq    = [];   // [{word, count, ratio, cumRatio}]
  let displayTop = 50;
  let sortMode   = 'freq-desc';
  let searchQuery = '';
  let excludedWords = new Set();

  // ── UI 렌더링 ──────────────────────────────────────
  function render() {
    if (!App.state.flatTokens.length) {
      document.getElementById('step-container').innerHTML = `
        <div class="card mt-4">
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div class="empty-text">먼저 Step 2에서 전처리를 완료해주세요.</div>
            <div class="empty-sub">전처리된 토큰이 없습니다.</div>
          </div>
        </div>`;
      return;
    }

    document.getElementById('step-container').innerHTML = `
      <!-- 컨트롤 카드 -->
      <div class="card mt-4">
        <div class="flex flex-wrap gap-3 items-center justify-between">

          <!-- 표시 개수 -->
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold" style="color:var(--text-secondary)">표시</span>
            <div class="flex gap-1">
              ${[10, 30, 50, 100, '전체'].map(v => `
                <button
                  class="top-n-btn px-3 py-1 rounded-lg text-sm font-bold transition ${v == displayTop ? 'active' : ''}"
                  onclick="Step3.setTopN(${v === '전체' ? 999999 : v}, this)"
                >${v}${v !== '전체' ? '개' : ''}</button>
              `).join('')}
            </div>
          </div>

          <!-- 정렬 -->
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold" style="color:var(--text-secondary)">정렬</span>
            <div class="flex gap-1">
              ${[
                {val:'freq-desc', label:'빈도↓'},
                {val:'freq-asc',  label:'빈도↑'},
                {val:'alpha',     label:'가나다'},
              ].map(s => `
                <button
                  class="sort-btn px-3 py-1 rounded-lg text-sm font-bold transition ${sortMode === s.val ? 'active' : ''}"
                  onclick="Step3.setSort('${s.val}', this)"
                >${s.label}</button>
              `).join('')}
            </div>
          </div>

          <!-- 검색 -->
          <div class="flex items-center gap-2 flex-1 min-w-36">
            <input
              id="freq-search"
              type="text"
              placeholder="단어 검색..."
              class="input-base w-full"
              style="padding:8px 12px;font-size:14px;"
              oninput="Step3.setSearch(this.value)"
            />
          </div>

          <!-- CSV 저장 -->
          <button onclick="Step3.downloadCSV()" class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 whitespace-nowrap">
            <span>📥</span> CSV
          </button>
        </div>
      </div>

      <!-- 통계 요약 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3" id="freq-stats"></div>

      <!-- 빈도 테이블 -->
      <div class="card mt-3">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:50px">순위</th>
                <th>단어</th>
                <th style="width:90px;text-align:right">빈도수</th>
                <th style="width:80px;text-align:right">비율</th>
                <th style="width:100px;text-align:right">누적 비율</th>
                <th style="width:80px;text-align:center">제외</th>
              </tr>
            </thead>
            <tbody id="freq-tbody"></tbody>
          </table>
        </div>
        <p id="freq-count" class="text-xs mt-2" style="color:var(--text-muted)"></p>
      </div>
    `;

    // 빈도 계산 후 렌더
    calcFrequency();
    renderStats();
    renderTable();
  }

  // ── 빈도 계산 ─────────────────────────────────────
  function calcFrequency() {
    const tokens = App.state.flatTokens.filter(w => !excludedWords.has(w));
    const total  = tokens.length;
    const map    = {};

    for (const w of tokens) map[w] = (map[w] || 0) + 1;

    let sorted = Object.entries(map)
      .map(([word, count]) => ({ word, count, ratio: count / total * 100 }))
      .sort((a, b) => b.count - a.count);

    // 누적 비율
    let cum = 0;
    sorted = sorted.map(item => {
      cum += item.ratio;
      return { ...item, cumRatio: cum };
    });

    allFreq = sorted;

    // 전역 상태 저장
    App.state.frequency = sorted;
    if (sorted.length) App.completeStep(2);
  }

  // ── 통계 요약 렌더링 ──────────────────────────────
  function renderStats() {
    const total  = App.state.flatTokens.filter(w => !excludedWords.has(w)).length;
    const unique = allFreq.length;
    const top1   = allFreq[0];
    const top5   = allFreq.slice(0, 5).reduce((s, i) => s + i.count, 0);
    const top5pct = total ? (top5 / total * 100).toFixed(1) : 0;

    document.getElementById('freq-stats').innerHTML = [
      { icon: '🔤', label: '총 토큰 수',   value: total.toLocaleString() },
      { icon: '✨', label: '고유 단어 수', value: unique.toLocaleString() },
      { icon: '🏆', label: '1위 단어',     value: top1 ? `${top1.word} (${top1.count})` : '-' },
      { icon: '📊', label: '상위 5개 비율', value: `${top5pct}%` },
    ].map(s => `
      <div class="card text-center" style="padding:14px;">
        <div class="text-xl mb-1">${s.icon}</div>
        <div class="font-extrabold text-white" style="font-size:${s.label==='1위 단어'?'15px':'18px'}">${s.value}</div>
        <div class="text-xs mt-1" style="color:var(--text-muted)">${s.label}</div>
      </div>`).join('');
  }

  // ── 테이블 렌더링 ─────────────────────────────────
  function renderTable() {
    const tbody   = document.getElementById('freq-tbody');
    const countEl = document.getElementById('freq-count');
    if (!tbody) return;

    // 정렬 적용
    let data = [...allFreq];
    if (sortMode === 'alpha')     data.sort((a, b) => a.word.localeCompare(b.word, 'ko'));
    else if (sortMode === 'freq-asc') data.sort((a, b) => a.count - b.count);
    // freq-desc: allFreq는 이미 내림차순

    // 검색 필터
    if (searchQuery) {
      data = data.filter(d => d.word.includes(searchQuery));
    }

    // 상위 N 제한
    const total = data.length;
    const shown = data.slice(0, displayTop);

    if (!shown.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8" style="color:var(--text-muted)">
        ${searchQuery ? `"${Utils.escapeHtml(searchQuery)}" 검색 결과 없음` : '데이터 없음'}
      </td></tr>`;
      countEl.textContent = '';
      return;
    }

    // 전체 합계 (누적 비율 기준용)
    const totalTokens = App.state.flatTokens.filter(w => !excludedWords.has(w)).length;

    tbody.innerHTML = shown.map((item, idx) => {
      const rank  = sortMode === 'freq-desc' ? idx + 1 : (allFreq.findIndex(f => f.word === item.word) + 1);
      const barW  = allFreq[0] ? (item.count / allFreq[0].count * 100).toFixed(1) : 0;

      return `
        <tr>
          <td>
            <span class="rank-badge ${rank <= 3 ? 'rank-top' : ''}">${rank}</span>
          </td>
          <td>
            <div class="flex items-center gap-2">
              <span class="font-bold text-base" style="color:var(--text-primary)">${Utils.escapeHtml(item.word)}</span>
              <div class="freq-bar-bg flex-1">
                <div class="freq-bar-fill" style="width:${barW}%"></div>
              </div>
            </div>
          </td>
          <td class="text-right font-bold text-base" style="color:var(--accent-light)">${item.count.toLocaleString()}</td>
          <td class="text-right text-sm" style="color:var(--text-secondary)">${item.ratio.toFixed(2)}%</td>
          <td class="text-right text-sm" style="color:var(--text-muted)">${item.cumRatio.toFixed(1)}%</td>
          <td class="text-center">
            <button
              onclick="Step3.excludeWord('${Utils.escapeHtml(item.word)}')"
              class="exclude-btn text-xs px-2 py-1 rounded-lg font-bold transition"
              title="${item.word} 제외"
            >제외</button>
          </td>
        </tr>`;
    }).join('');

    // 표시 건수
    const msg = searchQuery
      ? `"${searchQuery}" 검색 결과 ${total.toLocaleString()}개 중 ${shown.length.toLocaleString()}개 표시`
      : `전체 ${total.toLocaleString()}개 중 ${shown.length.toLocaleString()}개 표시`;
    countEl.textContent = msg;
  }

  // ── 컨트롤 핸들러 ─────────────────────────────────
  function setTopN(n, btn) {
    displayTop = n;
    document.querySelectorAll('.top-n-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTable();
  }

  function setSort(mode, btn) {
    sortMode = mode;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTable();
  }

  function setSearch(q) {
    searchQuery = q.trim();
    renderTable();
  }

  // ── 단어 제외 ─────────────────────────────────────
  function excludeWord(word) {
    excludedWords.add(word);
    // Step2 불용어 목록에도 추가 (재전처리 시 반영)
    if (typeof Step2 !== 'undefined' && Step2.addStopword) {
      // Step2의 userStopwords에 직접 push (내부 상태)
    }
    // flatTokens에서 해당 단어 제거 후 재계산
    App.state.flatTokens = App.state.flatTokens.filter(w => w !== word);
    App.state.tokens = App.state.tokens.map(t => ({
      ...t, tokens: t.tokens.filter(w => w !== word)
    }));
    calcFrequency();
    renderStats();
    renderTable();
    App.showToast(`"${word}" 제외됨`, 'info', 1500);
  }

  // ── CSV 다운로드 ──────────────────────────────────
  function downloadCSV() {
    if (!allFreq.length) { App.showToast('분석 결과가 없습니다.', 'error'); return; }

    const rows = [
      ['순위', '단어', '빈도수', '비율(%)', '누적 비율(%)'],
      ...allFreq.map((item, i) => [
        i + 1,
        item.word,
        item.count,
        item.ratio.toFixed(2),
        item.cumRatio.toFixed(2),
      ]),
    ];
    Utils.downloadCSV(rows, `frequency_${Utils.timestamp()}.csv`);
    App.showToast('CSV 파일을 저장했습니다.', 'success');
  }

  return {
    render,
    setTopN,
    setSort,
    setSearch,
    excludeWord,
    downloadCSV,
  };

})();
