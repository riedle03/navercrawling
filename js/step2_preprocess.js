/**
 * step2_preprocess.js — 데이터 전처리
 * v2.0: 바른(Bareun) 형태소 분석 API 통합
 * 뉴스편 수정: App.state.items 사용 + 검색어 자동 불용어 처리
 *
 * 핵심 전략 (바른 API 모드):
 *   1. 정규식으로 어절 분리 → 고유 어절 수집
 *   2. 고유 어절을 배치(150개)로 묶어 바른 API 호출
 *   3. 형태소별 품사 태그로 내용어 추출 → surface→lemma 맵 구성
 *   4. 맵을 기사별 토큰에 적용
 *   → "먹었어"/"먹어"/"먹었다" 가 모두 "먹"으로 통합됨
 *
 * 검색어 자동 불용어 처리 (runPreprocess 진입 시):
 *   Phase A: 검색어 공백 분리 → 토큰별 불용어 추가
 *   Phase B: 바른 API 형태소 분석 → 내용어 추가 (키 있을 때)
 *   Phase C: 적용 내역 UI 반영 (불용어 태그 + 토스트)
 */
const Step2 = (() => {

  // ── 조사 목록 (정규식 방식 & API fallback용) ──────
  const PARTICLES = [
    '에서부터', '로부터', '한테서', '에게서',
    '이라도', '이라서', '이지만', '이어서', '에서는', '에게는', '로서는', '로써는',
    '까지는', '부터는', '에서도', '이라고', '이라며', '이니까',
    '에서', '에게', '한테', '까지', '부터', '처럼', '보다',
    '마다', '만큼', '이나', '이랑', '이고', '이며', '이라', '이야',
    '로서', '로써', '으로', '에는', '에도', '에만', '이다',
    '은', '는', '이', '가', '을', '를', '의', '와', '과',
  // '의': regex 모드·API fallback 시 조사 제거에 사용
  // bareun 모드 main path는 extractLemmas에서 POS 태그로 판단 (stripParticle 호출 안 함)
    '도', '로', '에', '나', '랑', '서', '야', '아', '들',
  ];

  // ── 바른 API 품사 태그 셋 ─────────────────────────
  const POS_SETS = {
    noun:      new Set(['NNG', 'NNP', 'NNB', 'XR']),
    noun_verb: new Set(['NNG', 'NNP', 'NNB', 'VV', 'VA', 'XR']),
    all:       new Set(['NNG', 'NNP', 'NNB', 'VV', 'VA', 'MAG', 'XR', 'SL']),
  };

  // ── 조사 태그 셋 (bareun_josa 모드용) ────────────
  // JKS:주격 JKC:보격 JKG:관형격(의) JKO:목적격 JKB:부사격
  // JKV:호격 JKQ:인용격 JX:보조사 JC:접속조사
  const JOSA_TAGS = new Set(['JKS','JKC','JKG','JKO','JKB','JKV','JKQ','JX','JC']);

  // ── 상태 변수 ────────────────────────────────────
  let userStopwords  = [];
  let userNormDict   = []; // [{canonical, variants:[]}]
  let currentTab     = 'before';
  let analysisMode   = 'bareun';   // 'regex' | 'bareun_josa' | 'bareun'
  let posFilter      = 'noun_verb'; // 'noun' | 'noun_verb' | 'all'
  let minLen         = 2;
  let normPlural     = true;       // 복수형 정규화: 친구들→친구
  let isCancelled    = false;

  // ── UI 렌더링 ─────────────────────────────────────
  function render() {
    const items = App.state.items;
    if (!items.length) {
      document.getElementById('step-container').innerHTML = `
        <div class="card mt-4">
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div class="empty-text">먼저 Step 1에서 뉴스 기사를 수집해주세요.</div>
            <div class="empty-sub">수집된 기사가 없습니다.</div>
          </div>
        </div>`;
      return;
    }

    if (!userStopwords.length) userStopwords = [...DEFAULT_STOPWORDS];
    if (!userNormDict.length)  userNormDict  = DEFAULT_NORMDICT.map(e => ({ canonical: e.canonical, variants: [...e.variants] }));
    const bareunKey = Settings.getBareunKey();

    document.getElementById('step-container').innerHTML = `

      <!-- 분석 방식 선택 -->
      <div class="card mt-4">
        <h2 class="card-title">🔬 분석 방식 선택</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">

          <label class="mode-card ${analysisMode === 'regex' ? 'mode-card-active' : ''}"
                 onclick="Step2.setMode('regex')">
            <input type="radio" name="analysis-mode" value="regex"
                   ${analysisMode === 'regex' ? 'checked' : ''} class="hidden" />
            <div class="flex items-start gap-3">
              <span class="text-2xl mt-0.5">✂️</span>
              <div>
                <p class="font-bold text-sm" style="color:var(--text-primary)">정규식 방식 (기본)</p>
                <p class="text-xs mt-1 leading-relaxed" style="color:var(--text-muted)">
                  조사만 제거. 바른 API 키 불필요.<br/>
                  동사·형용사 활용형은 별도로 집계됨.
                </p>
              </div>
            </div>
          </label>

          <label class="mode-card ${analysisMode === 'bareun_josa' ? 'mode-card-active' : ''}"
                 onclick="Step2.setMode('bareun_josa')">
            <input type="radio" name="analysis-mode" value="bareun_josa"
                   ${analysisMode === 'bareun_josa' ? 'checked' : ''} class="hidden" />
            <div class="flex items-start gap-3">
              <span class="text-2xl mt-0.5">✂️🧠</span>
              <div>
                <p class="font-bold text-sm" style="color:var(--text-primary)">조사 제거 (바른 API)</p>
                <p class="text-xs mt-1 leading-relaxed" style="color:var(--text-muted)">
                  조사만 분리·제거. 활용형 원형 유지.<br/>
                  "나의"→"나" · "자본주의" 보존.
                </p>
              </div>
            </div>
          </label>

          <label class="mode-card ${analysisMode === 'bareun' ? 'mode-card-active' : ''}"
                 onclick="Step2.setMode('bareun')">
            <input type="radio" name="analysis-mode" value="bareun"
                   ${analysisMode === 'bareun' ? 'checked' : ''} class="hidden" />
            <div class="flex items-start gap-3">
              <span class="text-2xl mt-0.5">🧠</span>
              <div>
                <p class="font-bold text-sm" style="color:var(--text-primary)">
                  형태소 분석 (바른 API)
                  <span class="badge badge-accent" style="font-size:10px;vertical-align:middle;margin-left:4px;">권장</span>
                </p>
                <p class="text-xs mt-1 leading-relaxed" style="color:var(--text-muted)">
                  명사·동사어간·형용사어간 추출.<br/>
                  "먹었어"+"먹어" → "먹"으로 통합.
                </p>
              </div>
            </div>
          </label>
        </div>

        <!-- 바른 API 전용 옵션 -->
        <div id="bareun-options" class="${(analysisMode === 'bareun' || analysisMode === 'bareun_josa') ? '' : 'hidden'} mt-4 space-y-3">
          <div class="p-3 rounded-xl text-sm flex items-center gap-2
            ${bareunKey ? '' : ''}"
            style="background:var(--glass-bg);border:1px solid ${bareunKey ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}">
            ${bareunKey
              ? `<span style="color:#34d399">✅</span><span style="color:#34d399;font-weight:600">바른 API 키 연결됨</span>`
              : `<span style="color:#fbbf24">⚠️</span>
                 <span style="color:#fbbf24">바른 API 키 없음 —
                   <button onclick="Settings.openModal()" class="underline font-bold">설정에서 입력</button>
                 </span>`
            }
          </div>

          <div id="pos-filter-section" class="${analysisMode === 'bareun' ? '' : 'hidden'}">
            <p class="text-sm font-semibold mb-2" style="color:var(--text-secondary)">추출할 품사</p>
            <div class="flex flex-wrap gap-2">
              ${posChip('noun',      '명사만',          'NNG·NNP')}
              ${posChip('noun_verb', '명사 + 용언 어간', '권장')}
              ${posChip('all',       '전체 내용어',      '부사 포함')}
            </div>
            <p class="text-xs mt-2" style="color:var(--text-muted)">
              💡 <strong>명사 + 용언 어간</strong> 권장:
              "좋았어"·"좋아요" → <strong>"좋"</strong> /
              "먹었다"·"먹어" → <strong>"먹"</strong>으로 통합
            </p>
          </div>
        </div>

        <!-- 정규식 전용 옵션 -->
        <div id="regex-options" class="${analysisMode === 'regex' ? '' : 'hidden'} mt-4">
          <div class="flex items-center justify-between p-3 rounded-xl"
               style="background:var(--glass-bg);border:1px solid var(--glass-border)">
            <div>
              <p class="font-semibold text-sm" style="color:var(--text-primary)">조사 제거</p>
              <p class="text-xs mt-0.5" style="color:var(--text-muted)">은/는/이/가/을/를 등 조사 패턴 제거</p>
            </div>
            <label class="toggle-wrap">
              <input type="checkbox" id="chk-particles" checked />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>
        </div>
      </div>

      <!-- 텍스트 정제 옵션 -->
      <div class="card mt-3">
        <h2 class="card-title">🧹 텍스트 정제 옵션</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          ${checkItem('clean-url',   '✅', 'URL 제거',   true)}
          ${checkItem('clean-emoji', '✅', '이모지 제거', true)}
          ${checkItem('clean-eng',   '🔤', '영어 제거',   false)}
          ${checkItem('clean-num',   '🔢', '숫자 제거',   false)}
        </div>
        <div class="flex items-center justify-between mt-3 pt-3"
             style="border-top:1px solid var(--glass-border)">
          <div>
            <p class="font-semibold text-sm" style="color:var(--text-primary)">최소 글자 수</p>
            <p class="text-xs mt-0.5" style="color:var(--text-muted)">이 글자 수 미만 토큰 제거</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="Step2.changeMinLen(-1)"
                    class="btn-ghost w-8 h-8 rounded-lg text-lg flex items-center justify-center font-bold">−</button>
            <span id="min-len-val" class="font-bold text-base text-white w-4 text-center">${minLen}</span>
            <button onclick="Step2.changeMinLen(1)"
                    class="btn-ghost w-8 h-8 rounded-lg text-lg flex items-center justify-center font-bold">+</button>
          </div>
        </div>

        <!-- 복수형 정규화 -->
        <div class="flex items-center justify-between mt-3 pt-3"
             style="border-top:1px solid var(--glass-border)">
          <div>
            <p class="font-semibold text-sm" style="color:var(--text-primary)">복수형 정규화</p>
            <p class="text-xs mt-0.5" style="color:var(--text-muted)">
              친구<strong>들</strong>→친구 &nbsp;·&nbsp; 사람<strong>들</strong>→사람 &nbsp;·&nbsp; 학생<strong>들</strong>→학생
            </p>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="chk-norm-plural" ${normPlural ? 'checked' : ''}
                   onchange="Step2.setNormPlural(this.checked)" />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
      </div>

      <!-- 불용어 관리 -->
      <div class="card mt-3">
        <div class="flex items-center justify-between mb-3">
          <h2 class="card-title mb-0">🚫 불용어 관리</h2>
          <button onclick="Step2.resetStopwords()"
                  class="btn-ghost px-3 py-1 rounded-lg text-xs font-bold">초기화</button>
        </div>
        <div class="flex gap-2 mb-1">
          <input id="stopword-input" type="text"
                 placeholder="단어 입력 (쉼표로 여러 개 가능: 진짜, 너무, 막)"
                 class="input-base flex-1" style="font-size:14px;padding:8px 12px;"
                 onkeydown="if(event.key==='Enter') Step2.addStopword()" />
          <button onclick="Step2.addStopword()"
                  class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold">추가</button>
        </div>
        <p class="text-xs mb-3" style="color:var(--text-muted)">
          쉼표(,)로 구분하면 여러 단어를 한 번에 추가할 수 있습니다.
        </p>
        <div id="stopword-tags" class="flex flex-wrap gap-2 max-h-32 overflow-y-auto"></div>
      </div>

      <!-- 단어 통합 사전 -->
      <div class="card mt-3">
        <div class="flex items-center justify-between mb-3">
          <h2 class="card-title mb-0">📖 단어 통합 사전</h2>
          <button onclick="Step2.resetNormDict()"
                  class="btn-ghost px-3 py-1 rounded-lg text-xs font-bold">초기화</button>
        </div>
        <p class="text-xs mb-3" style="color:var(--text-muted)">
          변형 단어를 표제어로 통합합니다. 전처리 실행 시 자동 적용됩니다.
        </p>
        <div class="flex gap-2 mb-3 flex-wrap">
          <input id="norm-canonical" type="text" placeholder="표제어 (예: 은둔)"
                 class="input-base" style="width:110px;font-size:14px;padding:8px 10px;" />
          <span class="flex items-center text-sm font-bold px-1" style="color:var(--text-muted)">←</span>
          <input id="norm-variants" type="text" placeholder="변형들 (쉼표 구분: 은둔형, 은둔자)"
                 class="input-base flex-1" style="min-width:160px;font-size:14px;padding:8px 12px;"
                 onkeydown="if(event.key==='Enter') Step2.addNormEntry()" />
          <button onclick="Step2.addNormEntry()"
                  class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold">추가</button>
        </div>
        <div id="normdict-list" class="space-y-2 max-h-48 overflow-y-auto"></div>
      </div>

      <!-- 바른 API 진행 상태 (분석 중에만 표시) -->
      <div id="bareun-progress" class="card mt-3 hidden">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="spinner"></span>
            <span class="font-semibold text-sm" style="color:var(--text-secondary)">형태소 분석 중...</span>
          </div>
          <button onclick="Step2.cancelBareun()" class="btn-danger px-3 py-1 rounded-lg text-sm">중단</button>
        </div>
        <div class="progress-bar-track">
          <div id="bareun-progress-fill" class="progress-bar-fill" style="width:0%"></div>
        </div>
        <p id="bareun-progress-text" class="text-xs mt-2" style="color:var(--text-muted)">준비 중...</p>
      </div>

      <!-- 실행 버튼 -->
      <div class="flex justify-center mt-4">
        <button id="btn-run-preprocess" onclick="Step2.runPreprocess()"
                class="btn-accent px-8 py-3 rounded-xl text-base font-bold flex items-center gap-2">
          <span>⚡</span> 전처리 실행
        </button>
      </div>

      <!-- 결과 영역 -->
      <div id="preprocess-result" class="hidden mt-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" id="stats-grid"></div>
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <div class="flex gap-1 p-1 rounded-xl"
                 style="background:var(--glass-bg);border:1px solid var(--glass-border)">
              <button id="tab-before" onclick="Step2.switchTab('before')"
                      class="tab-btn active px-4 py-1.5 rounded-lg text-sm font-bold transition">원본</button>
              <button id="tab-after"  onclick="Step2.switchTab('after')"
                      class="tab-btn px-4 py-1.5 rounded-lg text-sm font-bold transition">전처리 결과</button>
            </div>
            <div class="flex items-center gap-2">
              <span id="mode-badge" class="text-xs px-2 py-1 rounded-lg font-semibold"
                    style="background:rgba(99,102,241,0.15);color:var(--accent-light)"></span>
              <button onclick="Step2.downloadCSV()"
                      class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                <span>📥</span> CSV
              </button>
            </div>
          </div>
          <div id="view-before" class="overflow-y-auto" style="max-height:400px;">
            <div class="space-y-2" id="before-list"></div>
          </div>
          <div id="view-after" class="hidden overflow-y-auto" style="max-height:400px;">
            <div class="space-y-2" id="after-list"></div>
          </div>
        </div>
      </div>
    `;

    renderStopwordTags();
    renderNormDictTags();
  }

  // ── 품사 칩 HTML ─────────────────────────────────
  function posChip(value, label, sub) {
    const active = posFilter === value;
    const activeStyle = 'background:var(--accent);color:white;border-color:var(--accent);box-shadow:0 0 10px var(--accent-glow);';
    return `
      <label class="option-chip" onclick="Step2.setPosFilter('${value}')">
        <input type="radio" name="pos-filter" value="${value}" ${active ? 'checked' : ''} class="hidden" />
        <span style="${active ? activeStyle : ''}">
          ${label}
          <span style="opacity:0.6;font-size:11px;margin-left:2px;">${sub}</span>
        </span>
      </label>`;
  }

  // ── 모드 전환 ─────────────────────────────────────
  function setMode(mode) {
    analysisMode = mode;
    const isBareunMode = mode === 'bareun' || mode === 'bareun_josa';
    document.getElementById('bareun-options')?.classList.toggle('hidden', !isBareunMode);
    document.getElementById('pos-filter-section')?.classList.toggle('hidden', mode !== 'bareun');
    document.getElementById('regex-options')?.classList.toggle('hidden',  mode !== 'regex');
    document.querySelectorAll('.mode-card').forEach(card => {
      const val = card.querySelector('input[type="radio"]')?.value;
      card.classList.toggle('mode-card-active', val === mode);
    });
  }

  // ── 품사 필터 ─────────────────────────────────────
  function setPosFilter(filter) {
    posFilter = filter;
    const activeStyle = 'background:var(--accent);color:white;border-color:var(--accent);box-shadow:0 0 10px var(--accent-glow);';
    document.querySelectorAll('input[name="pos-filter"]').forEach(radio => {
      const span   = radio.nextElementSibling;
      const active = radio.value === filter;
      radio.checked = active;
      if (span) span.style.cssText = active ? activeStyle : '';
    });
  }

  // ── 체크 아이템 ───────────────────────────────────
  function checkItem(id, icon, label, checked) {
    return `
      <label class="check-item ${checked ? 'checked' : ''}" id="label-${id}"
             onclick="Step2.toggleCheck('${id}')">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} class="hidden" />
        <span class="text-lg">${icon}</span>
        <span class="text-sm font-semibold">${label}</span>
        <span class="check-dot ${checked ? 'on' : 'off'}"></span>
      </label>`;
  }

  function toggleCheck(id) {
    const cb    = document.getElementById(id);
    const label = document.getElementById(`label-${id}`);
    const dot   = label?.querySelector('.check-dot');
    cb.checked  = !cb.checked;
    label?.classList.toggle('checked', cb.checked);
    if (dot) dot.className = `check-dot ${cb.checked ? 'on' : 'off'}`;
  }

  // ── 복수형 정규화 토글 ────────────────────────────
  function setNormPlural(val) { normPlural = val; }

  // ── 최소 글자 수 ──────────────────────────────────
  function changeMinLen(delta) {
    minLen = Math.max(1, Math.min(5, minLen + delta));
    const el = document.getElementById('min-len-val');
    if (el) el.textContent = minLen;
  }

  // ── 불용어 관리 ───────────────────────────────────
  function addStopword() {
    const input = document.getElementById('stopword-input');
    const raw   = input.value.trim();
    if (!raw) return;
    const words   = raw.split(',').map(w => w.trim()).filter(Boolean);
    const added   = [];
    const skipped = [];
    words.forEach(w => (userStopwords.includes(w) ? skipped : added).push(w));
    added.forEach(w => userStopwords.push(w));
    renderStopwordTags();
    input.value = '';
    if (added.length > 0 && skipped.length === 0)
      App.showToast(added.length === 1 ? `"${added[0]}" 추가됨` : `${added.length}개 단어 추가됨`, 'success', 1800);
    else if (added.length > 0)
      App.showToast(`${added.length}개 추가, ${skipped.length}개는 이미 존재`, 'info', 2000);
    else
      App.showToast('모두 이미 목록에 있는 단어입니다.', 'info');
  }

  function removeStopword(word) {
    userStopwords = userStopwords.filter(w => w !== word);
    renderStopwordTags();
  }

  function resetStopwords() {
    userStopwords = [...DEFAULT_STOPWORDS];
    renderStopwordTags();
    App.showToast('불용어 목록을 초기화했습니다.', 'info');
  }

  function renderStopwordTags() {
    const c = document.getElementById('stopword-tags');
    if (!c) return;
    c.innerHTML = userStopwords.map(w => `
      <span class="tag">
        ${Utils.escapeHtml(w)}
        <span class="tag-remove" onclick="Step2.removeStopword('${Utils.escapeHtml(w)}')">&times;</span>
      </span>`).join('');
  }

  // ── 통합 사전 관리 ────────────────────────────────
  function addNormEntry() {
    const canonicalEl = document.getElementById('norm-canonical');
    const variantsEl  = document.getElementById('norm-variants');
    const canonical   = canonicalEl.value.trim();
    const variants    = variantsEl.value.split(',').map(v => v.trim()).filter(Boolean);

    if (!canonical) { App.showToast('표제어를 입력해주세요.', 'error'); return; }
    if (!variants.length) { App.showToast('변형 단어를 입력해주세요.', 'error'); return; }

    const existing = userNormDict.find(e => e.canonical === canonical);
    if (existing) {
      const added = variants.filter(v => !existing.variants.includes(v));
      existing.variants.push(...added);
      App.showToast(`"${canonical}"에 ${added.length}개 변형 추가됨`, 'success', 1800);
    } else {
      userNormDict.push({ canonical, variants });
      App.showToast(`"${canonical}" 항목 추가됨`, 'success', 1800);
    }

    canonicalEl.value = '';
    variantsEl.value  = '';
    renderNormDictTags();
  }

  function removeNormEntry(i) {
    userNormDict.splice(i, 1);
    renderNormDictTags();
  }

  function removeNormVariant(i, variant) {
    userNormDict[i].variants = userNormDict[i].variants.filter(v => v !== variant);
    if (!userNormDict[i].variants.length) userNormDict.splice(i, 1);
    renderNormDictTags();
  }

  function resetNormDict() {
    userNormDict = DEFAULT_NORMDICT.map(e => ({ canonical: e.canonical, variants: [...e.variants] }));
    renderNormDictTags();
    App.showToast('통합 사전을 초기화했습니다.', 'info');
  }

  function renderNormDictTags() {
    const c = document.getElementById('normdict-list');
    if (!c) return;
    if (!userNormDict.length) {
      c.innerHTML = `<p class="text-xs" style="color:var(--text-muted)">등록된 항목이 없습니다.</p>`;
      return;
    }
    c.innerHTML = userNormDict.map((entry, i) => `
      <div class="flex items-start gap-2 p-2 rounded-xl"
           style="background:var(--glass-bg);border:1px solid var(--glass-border)">
        <span class="font-bold text-sm flex-shrink-0" style="color:var(--accent-light);min-width:56px">
          ${Utils.escapeHtml(entry.canonical)}
        </span>
        <span class="text-xs flex-shrink-0 mt-0.5" style="color:var(--text-muted)">←</span>
        <div class="flex flex-wrap gap-1 flex-1">
          ${entry.variants.map(v => `
            <span class="tag" style="font-size:11px;padding:2px 6px;">
              ${Utils.escapeHtml(v)}
              <span class="tag-remove"
                onclick="Step2.removeNormVariant(${i}, '${Utils.escapeHtml(v)}')">&times;</span>
            </span>`).join('')}
        </div>
        <button onclick="Step2.removeNormEntry(${i})"
                class="text-slate-500 hover:text-red-400 text-xl leading-none flex-shrink-0 ml-1"
                title="항목 삭제">&times;</button>
      </div>`).join('');
  }

  // ── 통합 사전: flat map 생성 { 변형: 표제어 } ──────
  function buildNormMap() {
    const map = {};
    userNormDict.forEach(({ canonical, variants }) => {
      variants.forEach(v => { if (v) map[v] = canonical; });
    });
    return map;
  }

  // ── 검색어 자동 불용어 처리 (Phase A / B / C) ────
  // Phase A: 검색어 공백 분리 → 토큰별 불용어 등록
  // Phase B: 바른 API 형태소 분석 → 내용어 추가 (키 있을 때)
  // Phase C: UI 반영 (태그 + 토스트)
  async function applySearchTermStopwords() {
    if (!App.state.autoStopQuery) return [];
    const query = (App.state.searchQuery || '').trim();
    if (!query) return [];

    // Phase A
    const rawTokens = query.split(/\s+/).filter(w => w.length >= 1);
    const added = [];
    rawTokens.forEach(w => {
      if (!userStopwords.includes(w)) { userStopwords.push(w); added.push(w); }
    });

    // Phase B: 바른 API 형태소 분석
    if (Settings.getBareunKey()) {
      try {
        const data = await callBareunAPI(query);
        const allowed = POS_SETS.noun_verb;
        for (const sentence of (data.sentences || [])) {
          for (const token of (sentence.tokens || [])) {
            for (const m of (token.morphemes || [])) {
              const tag = m.tag || '';
              const raw = getText(m.text) || '';
              if (allowed.has(tag) && raw && raw.length >= 1 && !userStopwords.includes(raw)) {
                userStopwords.push(raw);
                added.push(raw);
              }
            }
          }
        }
      } catch (_) { /* Phase B 실패 시 Phase A 결과만 사용 */ }
    }

    return added; // Phase C: 호출자가 토스트 표시
  }

  // ── 전처리 진입점 ─────────────────────────────────
  async function runPreprocess() {
    // Phase A/B/C: 검색어 자동 불용어 처리
    const autoAdded = await applySearchTermStopwords();
    if (autoAdded.length > 0) {
      renderStopwordTags(); // Phase C: UI 반영
      const query = App.state.searchQuery || '';
      App.showToast(`검색어 "${query}" → 불용어 ${autoAdded.length}개 자동 적용`, 'info', 3000);
    }

    if (analysisMode === 'bareun' || analysisMode === 'bareun_josa') {
      if (!Settings.getBareunKey()) {
        App.showToast('바른 API 키를 설정에서 먼저 입력해주세요.', 'error');
        Settings.openModal();
        return;
      }
      isCancelled = false;
      const runner = analysisMode === 'bareun_josa' ? runPreprocessBareunJosa : runPreprocessBareun;
      runner().catch(err => {
        console.error('바른 API 오류:', err);
        const msg = err?.status === 401
          ? '바른 API 키가 유효하지 않습니다. 설정에서 키를 확인하세요.'
          : err?.name === 'TypeError'
          ? '네트워크 오류. 인터넷 연결 또는 CORS 설정을 확인하세요.'
          : `형태소 분석 오류 (${err?.status || '알 수 없음'})`;
        App.showToast(msg, 'error', 5000);
        hideBareunProgress();
      });
    } else {
      runPreprocessRegex();
    }
  }

  function cancelBareun() {
    isCancelled = true;
    App.showToast('분석을 중단합니다...', 'info');
  }

  // ── 공통: 텍스트 정제 + 어절 분리 ───────────────
  function cleanAndSplit(text, opts) {
    let t = text;
    if (opts.removeUrl)   t = t.replace(/https?:\/\/\S+/gi, ' ');
    if (opts.removeEmoji) t = t.replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{200D}\u{1F1E0}-\u{1F1FF}]/gu, ' '
    );
    if (opts.removeEng)   t = t.replace(/[a-zA-Z]+/g, ' ');
    if (opts.removeNum)   t = t.replace(/[0-9]+/g, ' ');
    t = t.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ');
    return t.split(/\s+/).filter(Boolean);
  }

  // ── 정규식 방식 전처리 ────────────────────────────
  function runPreprocessRegex() {
    const opts        = getCleanOpts();
    const stopwordSet = new Set(userStopwords);
    const normMap     = buildNormMap();
    const processed   = App.state.items.map(c => {
      const eojeols = cleanAndSplit(c.text, opts);
      const tokens  = eojeols
        .map(w => opts.particles ? stripParticle(w) : w)
        .map(w => normMap[w] || w)   // 표제어 치환
        .filter(w => w.length >= minLen && !stopwordSet.has(w) && !/^[0-9]+$/.test(w));
      return { original: c.text, tokens };
    });
    finalizeResult(processed, 'regex');
  }

  // ── 바른 API 방식 전처리 (async) ──────────────────
  async function runPreprocessBareun() {
    const comments = App.state.items;
    const opts     = getCleanOpts();
    const allowed  = POS_SETS[posFilter] || POS_SETS.noun_verb;

    // 1단계: 정제 + 어절 분리
    const rawPerComment = comments.map(c => ({
      original: c.text,
      eojeols:  cleanAndSplit(c.text, opts),
    }));

    // 2단계: 고유 어절 수집
    const uniqueEojeols = [...new Set(rawPerComment.flatMap(r => r.eojeols))];
    if (!uniqueEojeols.length) {
      App.showToast('전처리할 어절이 없습니다.', 'error');
      return;
    }

    // 3단계: 바른 API 배치 분석 → surface→lemma 맵
    showBareunProgress();
    updateBareunProgress(0, `고유 어절 ${uniqueEojeols.length}개 분석 시작...`);

    const lemmaMap = await buildLemmaMap(
      uniqueEojeols,
      morphemes => extractLemmas(morphemes, allowed),
      (pct, msg) => updateBareunProgress(pct, msg)
    );

    if (isCancelled) {
      hideBareunProgress();
      App.showToast('분석이 중단되었습니다.', 'info');
      return;
    }

    // 4단계: 댓글별 토큰 생성
    const stopwordSet = new Set(userStopwords);
    const normMap     = buildNormMap();
    const processed   = rawPerComment.map(r => ({
      original: r.original,
      tokens: r.eojeols
        .flatMap(eojeol => lemmaMap[eojeol] || [])
        .map(t => normMap[t] || t)   // 표제어 치환
        .filter(t => t.length >= minLen && !stopwordSet.has(t) && !/^[0-9]+$/.test(t)),
    }));

    hideBareunProgress();
    finalizeResult(processed, 'bareun');
  }

  // ── 바른 API 단일 호출 ────────────────────────────
  // localhost → 로컬 프록시(/api/bareun/tokenize) 사용, 그 외 → 직접 호출
  function getBareunEndpoint() {
    const h = location.hostname;
    return (h === 'localhost' || h === '127.0.0.1')
      ? '/api/bareun/tokenize'
      : 'https://api.bareun.ai/v1/tokenize';
  }

  async function callBareunAPI(phrase) {
    const res = await fetch(getBareunEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': Settings.getBareunKey(),
      },
      body: JSON.stringify({ phrase }),
    });
    if (!res.ok) throw { status: res.status, data: await res.json().catch(() => ({})) };
    return res.json();
  }

  // ── Lemma 맵 구성 ─────────────────────────────────
  // extractFn(morphemes) → string[] : 모드별 형태소 추출 함수를 주입받음
  async function buildLemmaMap(eojeols, extractFn, onProgress) {
    const map          = {};
    const BATCH        = 150;
    const totalBatches = Math.ceil(eojeols.length / BATCH);

    for (let b = 0; b < eojeols.length; b += BATCH) {
      if (isCancelled) break;

      const batch  = eojeols.slice(b, b + BATCH);
      const phrase = batch.join(' ');

      try {
        const data = await callBareunAPI(phrase);

        const tokenIndex = {};
        for (const sentence of (data.sentences || [])) {
          for (const token of (sentence.tokens || [])) {
            const text = getText(token.text);
            if (text && !tokenIndex[text]) tokenIndex[text] = token.morphemes || [];
          }
        }

        for (const eojeol of batch) {
          const morphemes = tokenIndex[eojeol];
          if (!morphemes) {
            const s = stripParticle(eojeol);
            map[eojeol] = s && s.length >= 1 ? [s] : [];
          } else {
            map[eojeol] = extractFn(morphemes);
          }
        }

      } catch (err) {
        if (err?.status === 401) throw err;
        for (const eojeol of batch) {
          const s = stripParticle(eojeol);
          map[eojeol] = s && s.length >= 1 ? [s] : [];
        }
        console.warn(`배치 ${Math.floor(b / BATCH) + 1} API 오류, 정규식 fallback:`, err);
      }

      const batchNum = Math.floor(b / BATCH) + 1;
      const done     = Math.min(b + BATCH, eojeols.length);
      onProgress(
        Math.round((batchNum / totalBatches) * 100),
        `배치 ${batchNum}/${totalBatches} 완료 (${done}/${eojeols.length}개 어절 처리)`
      );
    }

    return map;
  }

  // ── 형태소 목록에서 내용어 추출 (하이브리드) ────
  // 1단계: 바른 API POS 태그로 내용어 필터링
  //   예: [NNG:"학교", JKO:"를"] → "학교"
  //   예: [VV:"먹", EP:"었", EF:"어요"] → "먹"
  // 2단계: 정규식 조사 제거 추가 적용 (API 오분석 보완)
  //   예: API가 "친구들을" 전체를 NNG로 태깅한 경우 → "친구들을" → "친구들"
  function extractLemmas(morphemes, allowed) {
    const lemmas = [];
    for (const m of morphemes) {
      const tag = m.tag || '';
      const raw = getText(m.text) || '';
      if (!allowed.has(tag) || !raw) continue;
      // 바른 API POS 태그를 신뢰 — stripParticle 2차 적용 안 함
      // (자본주의(NNG) 등 어근에 '의'가 포함된 단어 보호)
      lemmas.push(raw);
    }
    return lemmas;
  }

  // ── 조사 제거 모드: 조사 태그 형태소를 걸러내고 나머지를 연결 ──
  // 예) "나의" → [{나,NP},{의,JKG}] → "나"
  //     "자본주의" → [{자본주의,NNG}]  → "자본주의" (보존)
  function extractWithoutJosa(morphemes) {
    const kept = morphemes
      .filter(m => !JOSA_TAGS.has(m.tag || ''))
      .map(m => getText(m.text))
      .filter(Boolean)
      .join('');
    return kept ? [kept] : [];
  }

  // ── 조사 제거 모드 전처리 (async) ─────────────────
  async function runPreprocessBareunJosa() {
    const comments = App.state.items;
    const opts     = getCleanOpts();

    const rawPerComment = comments.map(c => ({
      original: c.text,
      eojeols:  cleanAndSplit(c.text, opts),
    }));

    const uniqueEojeols = [...new Set(rawPerComment.flatMap(r => r.eojeols))];
    if (!uniqueEojeols.length) {
      App.showToast('전처리할 어절이 없습니다.', 'error');
      return;
    }

    showBareunProgress();
    updateBareunProgress(0, `고유 어절 ${uniqueEojeols.length}개 조사 분리 시작...`);

    const lemmaMap = await buildLemmaMap(
      uniqueEojeols,
      extractWithoutJosa,
      (pct, msg) => updateBareunProgress(pct, msg)
    );

    if (isCancelled) {
      hideBareunProgress();
      App.showToast('분석이 중단되었습니다.', 'info');
      return;
    }

    const stopwordSet = new Set(userStopwords);
    const normMap     = buildNormMap();
    const processed   = rawPerComment.map(r => ({
      original: r.original,
      tokens: r.eojeols
        .flatMap(eojeol => lemmaMap[eojeol] || [])
        .map(t => normMap[t] || t)
        .filter(t => t.length >= minLen && !stopwordSet.has(t) && !/^[0-9]+$/.test(t)),
    }));

    hideBareunProgress();
    finalizeResult(processed, 'bareun_josa');
  }

  // ── text 필드 헬퍼 (string 또는 {content:string}) ──
  function getText(val) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.content) return val.content;
    return '';
  }

  // ── 조사 제거 (정규식 방식 & fallback용) ─────────
  function stripParticle(word) {
    for (const p of PARTICLES) {
      if (word.endsWith(p) && word.length - p.length >= 1) {
        return word.slice(0, word.length - p.length);
      }
    }
    return word;
  }

  // ── 정제 옵션 수집 ────────────────────────────────
  function getCleanOpts() {
    return {
      removeUrl:   document.getElementById('clean-url')?.checked   ?? true,
      removeEmoji: document.getElementById('clean-emoji')?.checked  ?? true,
      removeEng:   document.getElementById('clean-eng')?.checked    ?? false,
      removeNum:   document.getElementById('clean-num')?.checked    ?? false,
      particles:   document.getElementById('chk-particles')?.checked ?? true,
    };
  }

  // ── 진행 상태 UI ──────────────────────────────────
  function showBareunProgress() {
    document.getElementById('bareun-progress')?.classList.remove('hidden');
    const btn = document.getElementById('btn-run-preprocess');
    if (btn) btn.disabled = true;
  }

  function hideBareunProgress() {
    document.getElementById('bareun-progress')?.classList.add('hidden');
    const btn = document.getElementById('btn-run-preprocess');
    if (btn) btn.disabled = false;
  }

  function updateBareunProgress(pct, msg) {
    const fill = document.getElementById('bareun-progress-fill');
    const text = document.getElementById('bareun-progress-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = msg;
  }

  // ── 복수형 정규화: 어말 "들" 제거 ───────────────
  // "친구들" → "친구", "사람들" → "사람"
  // 결과가 minLen 미만이면 원본 유지 (안전장치)
  function applyPluralNorm(tokens) {
    if (!normPlural) return tokens;
    return tokens
      .map(t => (t.endsWith('들') && t.length - 1 >= minLen) ? t.slice(0, -1) : t)
      .filter(t => t.length >= minLen);
  }

  // ── 결과 확정 (상태 저장 + 렌더링) ──────────────
  function finalizeResult(processed, mode) {
    // 복수형 정규화 후처리 → 정규화 후 불용어 재필터 (사람들→사람 이 불용어인 경우 대비)
    const stopwordSet = new Set(userStopwords);
    const normalized = processed.map(p => ({
      original: p.original,
      tokens:   applyPluralNorm(p.tokens).filter(t => !stopwordSet.has(t)),
    }));
    const flatTokens     = normalized.flatMap(p => p.tokens);
    App.state.tokens     = normalized;
    App.state.flatTokens = flatTokens;
    App.completeStep(1);
    renderResult(normalized, flatTokens, mode);
    App.showToast(`전처리 완료! 토큰 ${flatTokens.length.toLocaleString()}개 추출`, 'success');
  }

  // ── 결과 렌더링 ───────────────────────────────────
  function renderResult(processed, flatTokens, mode) {
    const resultArea = document.getElementById('preprocess-result');
    resultArea.classList.remove('hidden');
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const uniqueTokens = new Set(flatTokens).size;
    const commentsWith = processed.filter(p => p.tokens.length > 0).length;

    const badge = document.getElementById('mode-badge');
    if (badge) badge.textContent =
      mode === 'bareun'      ? '🧠 형태소 분석' :
      mode === 'bareun_josa' ? '✂️🧠 조사 제거' : '✂️ 정규식';

    document.getElementById('stats-grid').innerHTML = [
      { label: '원본 기사',    value: processed.length.toLocaleString(),  icon: '📰' },
      { label: '추출된 토큰',  value: flatTokens.length.toLocaleString(), icon: '🔤' },
      { label: '고유 단어 수', value: uniqueTokens.toLocaleString(),      icon: '✨' },
      { label: '유효 기사 수', value: commentsWith.toLocaleString(),      icon: '✅' },
    ].map(s => `
      <div class="card text-center" style="padding:16px;">
        <div class="text-2xl mb-1">${s.icon}</div>
        <div class="text-xl font-extrabold text-white">${s.value}</div>
        <div class="text-xs mt-1" style="color:var(--text-muted)">${s.label}</div>
      </div>`).join('');

    // Before 목록 (최대 50개)
    const beforeList = document.getElementById('before-list');
    beforeList.innerHTML = processed.slice(0, 50).map((p, i) => `
      <div class="p-3 rounded-xl text-sm leading-relaxed"
           style="background:var(--glass-bg);border:1px solid var(--glass-border)">
        <span class="text-xs font-bold mr-2 opacity-40">${i + 1}</span>
        <span style="color:var(--text-primary)">${Utils.escapeHtml(p.original)}</span>
      </div>`).join('');
    if (processed.length > 50)
      beforeList.insertAdjacentHTML('beforeend',
        `<p class="text-xs text-center mt-2" style="color:var(--text-muted)">... 외 ${processed.length - 50}개 (CSV에서 전체 확인)</p>`);

    // After 목록 (최대 50개)
    const afterList = document.getElementById('after-list');
    afterList.innerHTML = processed.slice(0, 50).map((p, i) => `
      <div class="p-3 rounded-xl" style="background:var(--glass-bg);border:1px solid var(--glass-border)">
        <div class="text-xs font-bold mb-1.5 opacity-40">${i + 1} · ${p.tokens.length}개 토큰</div>
        <div class="flex flex-wrap gap-1.5">
          ${p.tokens.length
            ? p.tokens.map(tk => `<span class="tag">${Utils.escapeHtml(tk)}</span>`).join('')
            : `<span class="text-xs" style="color:var(--text-muted)">유효한 토큰 없음</span>`}
        </div>
      </div>`).join('');
    if (processed.length > 50)
      afterList.insertAdjacentHTML('beforeend',
        `<p class="text-xs text-center mt-2" style="color:var(--text-muted)">... 외 ${processed.length - 50}개 (CSV에서 전체 확인)</p>`);

    switchTab('after');
  }

  // ── 탭 전환 ──────────────────────────────────────
  function switchTab(tab) {
    currentTab = tab;
    const isBefore = tab === 'before';
    document.getElementById('view-before')?.classList.toggle('hidden', !isBefore);
    document.getElementById('view-after')?.classList.toggle('hidden',  isBefore);
    document.getElementById('tab-before')?.classList.toggle('active',  isBefore);
    document.getElementById('tab-after')?.classList.toggle('active',   !isBefore);
  }

  // ── CSV 다운로드 ──────────────────────────────────
  function downloadCSV() {
    const tokens = App.state.tokens;
    if (!tokens.length) { App.showToast('전처리 결과가 없습니다.', 'error'); return; }
    const rows = [
      ['순번', '원본 기사', '토큰 수', '추출된 토큰'],
      ...tokens.map((p, i) => [i + 1, p.original, p.tokens.length, p.tokens.join(' | ')]),
    ];
    Utils.downloadCSV(rows, `preprocessed_${Utils.timestamp()}.csv`);
    App.showToast('CSV 파일을 저장했습니다.', 'success');
  }

  return {
    render,
    setMode,
    setPosFilter,
    setNormPlural,
    toggleCheck,
    changeMinLen,
    addStopword,
    removeStopword,
    resetStopwords,
    addNormEntry,
    removeNormEntry,
    removeNormVariant,
    resetNormDict,
    runPreprocess,
    cancelBareun,
    switchTab,
    downloadCSV,
  };

})();
