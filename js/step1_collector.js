/**
 * step1_collector.js — 뉴스 기사 수집 (Step 1)
 * 네이버 뉴스 검색 API + 3단계 중복 제거 파이프라인
 */
const Step1 = (() => {

  // ── 상태 변수 ────────────────────────────────────
  let rawItems      = [];   // API 응답 → 정제된 원본
  let dedupResult   = null; // { unique, rejected, groups, total }
  let mediaChart    = null;
  let currentTab    = 'all';
  let isCancelled   = false;

  let collectCount  = 100;
  let sortMode      = 'sim';
  let textRange     = 'both';
  let dateFrom      = '';
  let dateTo        = '';
  let domainQuota   = 5;
  let jaccardThresh = 0.3;
  let miningTarget        = 'unique';
  let relevFilterEnabled  = true;
  let filteredItems       = [];   // 날짜 + 관련성 필터 통과 후

  // ── 언론사 도메인 → 이름 매핑 ─────────────────────
  const DOMAIN_MAP = {
    'chosun.com':       '조선일보',  'donga.com':        '동아일보',
    'joongang.co.kr':   '중앙일보',  'joins.com':        '중앙일보',
    'hani.co.kr':       '한겨레',    'khan.co.kr':       '경향신문',
    'ohmynews.com':     '오마이뉴스','pressian.com':     '프레시안',
    'yna.co.kr':        '연합뉴스',  'yonhap.co.kr':     '연합뉴스',
    'newsis.com':       '뉴시스',    'news1.kr':         '뉴스1',
    'ytn.co.kr':        'YTN',       'mbc.co.kr':        'MBC',
    'sbs.co.kr':        'SBS',       'kbs.co.kr':        'KBS',
    'jtbc.joins.com':   'JTBC',      'jtbc.co.kr':       'JTBC',
    'tvchosun.com':     'TV조선',    'ichannela.com':    '채널A',
    'mbn.co.kr':        'MBN',       'mt.co.kr':         '머니투데이',
    'edaily.co.kr':     '이데일리',  'hankyung.com':     '한국경제',
    'mk.co.kr':         '매일경제',  'etnews.com':       '전자신문',
    'zdnet.co.kr':      'ZDNet Korea','bloter.net':      '블로터',
    'munhwa.com':       '문화일보',  'segye.com':        '세계일보',
    'kmib.co.kr':       '국민일보',  'seoul.co.kr':      '서울신문',
    'hankookilbo.com':  '한국일보',  'imaeil.com':       '매일신문',
    'busan.com':        '부산일보',
  };

  function getDomainName(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      for (const [key, name] of Object.entries(DOMAIN_MAP)) {
        if (host.endsWith(key)) return name;
      }
      return host;
    } catch (_) { return '기타'; }
  }

  // ── HTML 정제 ─────────────────────────────────────
  // DOMParser를 사용해 모든 HTML 엔티티(named · decimal · hex)를 올바르게 디코딩하고
  // <b> 등 검색어 강조 태그도 제거. 수동 regex보다 안전하고 완전함.
  function cleanHtml(str) {
    if (!str) return '';
    try {
      const doc = new DOMParser().parseFromString(str, 'text/html');
      return (doc.body.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (_) {
      // DOMParser 불가 시 폴백
      return str
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g,   '<').replace(/&gt;/g,   '>')
        .replace(/&amp;/g,  '&').replace(/&quot;/g, '"')
        .replace(/&#39;/g,  "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g,   (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // ── pubDate 파싱 (YYYY-MM-DD) ─────────────────────
  function parseDate(pubDate) {
    if (!pubDate) return '';
    try {
      const d = new Date(pubDate);
      if (isNaN(d)) return '';
      return d.toISOString().slice(0, 10);
    } catch (_) { return ''; }
  }

  // ── 네이버 API 응답 → items 변환 ──────────────────
  function processNaverItems(naverItems) {
    return naverItems.map(item => {
      const title = cleanHtml(item.title || '');
      const desc  = cleanHtml(item.description || '');
      const link  = item.originallink || item.link || '';
      const source = getDomainName(link);
      const date   = parseDate(item.pubDate);
      let text;
      if (textRange === 'title')     text = title;
      else if (textRange === 'desc') text = desc;
      else                           text = (title + ' ' + desc).trim();
      return { title, description: desc, text, source, date, link };
    });
  }

  // ── API 호출 (페이지네이션) ────────────────────────
  async function fetchAll(query, total, sort) {
    const clientId     = Settings.getNaverClientId();
    const clientSecret = Settings.getNaverClientSecret();
    const apiBase = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3000' : '';

    const display = 100;
    const calls   = Math.ceil(total / display);
    const all     = [];

    for (let i = 0; i < calls; i++) {
      if (isCancelled) break;
      const start = i * display + 1;
      updateProgress(
        Math.round((i / calls) * 100),
        `${i + 1}/${calls} 배치 수집 중... (현재 ${all.length}건)`
      );

      const url = `${apiBase}/api/naver?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=${sort}`;
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id':     clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw { status: res.status, data: errData };
      }

      const data = await res.json();
      if (!data.items || data.items.length === 0) break;
      all.push(...data.items);
    }

    return all;
  }

  // ── 날짜 필터 ─────────────────────────────────────
  function applyDateFilter(items) {
    if (!dateFrom && !dateTo) return items;
    return items.filter(item => {
      if (!item.date) return true;
      if (dateFrom && item.date < dateFrom) return false;
      if (dateTo   && item.date > dateTo)   return false;
      return true;
    });
  }

  // ── 관련성 필터 (제목·발췌에 검색어 토큰 포함 여부) ─
  function applyRelevanceFilter(items, query) {
    if (!relevFilterEnabled) return items;
    const tokens = query
      .split(/[\s,]+/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length >= 2);
    if (!tokens.length) return items;
    return items.filter(item =>
      tokens.some(t =>
        item.title.toLowerCase().includes(t) ||
        item.description.toLowerCase().includes(t)
      )
    );
  }

  // ── 3단계 중복 제거 파이프라인 ────────────────────
  function jaccard(setA, setB) {
    let inter = 0;
    for (const w of setA) { if (setB.has(w)) inter++; }
    const union = setA.size + setB.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  // 뉴스 텍스트 토큰화 (공백 + 한국어 구분자 분리)
  function tokenize(str) {
    return new Set(
      str.split(/[\s·ㆍ\-\/,.\[\]()'"''""「」『』【】<>!?:;…]+/)
         .map(w => w.replace(/^[^\uAC00-\uD7A3a-zA-Z0-9]+|[^\uAC00-\uD7A3a-zA-Z0-9]+$/g, ''))
         .filter(w => w.length >= 2)
    );
  }

  function runDedup(items) {
    const TITLE_THRESHOLD = 0.33; // 제목 Jaccard 임계값 (같은 사안 다수 언론 보도 탐지)
    const titleSeen  = new Set();
    const domainCnt  = {};
    const accepted   = [];
    const rejected   = [];
    const wordSets   = [];      // 전체텍스트 토큰셋
    const titleSets  = [];      // 제목 토큰셋
    const groups     = [];
    const groupMap   = new Map();

    for (const item of items) {
      const normTitle = item.title.toLowerCase().trim();

      // 1단계: 완전 동일 제목
      if (titleSeen.has(normTitle)) {
        rejected.push({ ...item, _dupReason: 'title' });
        continue;
      }
      titleSeen.add(normTitle);

      // 2단계: 도메인 쿼터
      domainCnt[item.source] = (domainCnt[item.source] || 0);
      if (domainCnt[item.source] >= domainQuota) {
        rejected.push({ ...item, _dupReason: 'quota' });
        continue;
      }
      domainCnt[item.source]++;

      // 3단계: 제목 Jaccard OR 전체텍스트 Jaccard
      // 보도자료 배포 기사: 제목이 유사 → 제목 Jaccard로 탐지
      // 유사 내용 기사: 발췌문 유사 → 텍스트 Jaccard로 탐지
      const titleWords = tokenize(item.title);
      const textWords  = tokenize(item.text);
      let isDup = false;

      for (let i = 0; i < accepted.length; i++) {
        const titleSim = jaccard(titleWords, titleSets[i]);
        const textSim  = jaccard(textWords,  wordSets[i]);

        if (titleSim >= TITLE_THRESHOLD || textSim >= jaccardThresh) {
          rejected.push({ ...item, _dupReason: 'jaccard' });
          if (!groupMap.has(i)) {
            groupMap.set(i, groups.length);
            groups.push({ representative: accepted[i], similar: [] });
          }
          groups[groupMap.get(i)].similar.push(item);
          isDup = true;
          break;
        }
      }
      if (!isDup) {
        accepted.push(item);
        wordSets.push(textWords);
        titleSets.push(titleWords);
      }
    }

    return { unique: accepted, rejected, groups, total: items.length };
  }

  // ── Step 1 UI 렌더링 ──────────────────────────────
  function render() {
    const hasKey = !!(Settings.getNaverClientId() && Settings.getNaverClientSecret());

    document.getElementById('step-container').innerHTML = `
      <!-- 데이터 한계 고지 배너 -->
      <div class="mt-4 p-3 rounded-xl text-sm flex items-start gap-3"
           style="background:rgba(3,199,90,0.08);border:1px solid rgba(3,199,90,0.25)">
        <span style="font-size:18px;flex-shrink:0">📌</span>
        <span style="color:var(--text-secondary);line-height:1.6">
          이 분석은 기사 <strong class="text-white">전문이 아닌 제목(약 30자)과 요약 발췌문(약 150~250자)</strong>을
          기반으로 합니다. 같은 검색어라도 수집 시점에 따라 결과가 달라질 수 있습니다.
        </span>
      </div>

      ${!hasKey ? `
      <div class="card mt-3 text-center" style="border-color:rgba(251,191,36,0.4)">
        <p style="color:#fbbf24;font-weight:600">⚠️ 네이버 API 키가 없습니다.</p>
        <p class="text-sm mt-1" style="color:var(--text-muted)">
          <button onclick="Settings.openModal()" class="underline font-bold" style="color:var(--accent)">설정</button>에서 Client ID와 Secret을 입력해주세요.
        </p>
      </div>` : ''}

      <!-- 검색 설정 카드 -->
      <div class="card mt-3">
        <h2 class="card-title">🔍 검색 설정</h2>
        <div class="flex gap-2 mb-4">
          <input id="input-query" type="text" placeholder="검색어를 입력하세요 (예: 기후변화)"
                 class="input-base flex-1" style="font-size:15px;padding:10px 14px;"
                 onkeydown="if(event.key==='Enter') Step1.startCollect()" />
          <button onclick="Step1.startCollect()"
                  class="btn-accent px-6 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
            <span id="collect-btn-icon">🔎</span>
            <span id="collect-btn-text">수집 시작</span>
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <p class="text-xs font-semibold mb-2" style="color:var(--text-secondary)">수집 개수</p>
            <div class="flex flex-wrap gap-1.5">
              ${countChip(100,  '100건')}
              ${countChip(300,  '300건')}
              ${countChip(500,  '500건')}
              ${countChip(1000, '최대 1000건')}
            </div>
          </div>
          <div>
            <p class="text-xs font-semibold mb-2" style="color:var(--text-secondary)">정렬</p>
            <div class="flex gap-1.5">
              ${sortChip('sim',  '관련도순')}
              ${sortChip('date', '최신순')}
            </div>
          </div>
          <div>
            <p class="text-xs font-semibold mb-2" style="color:var(--text-secondary)">텍스트 범위</p>
            <div class="flex flex-wrap gap-1.5">
              ${rangeChip('both',  '제목+설명')}
              ${rangeChip('title', '제목만')}
              ${rangeChip('desc',  '설명만')}
            </div>
          </div>
        </div>
        <!-- 검색어 자동 불용어 -->
        <div class="flex items-center justify-between mt-4 pt-3"
             style="border-top:1px solid var(--glass-border)">
          <div>
            <p class="font-semibold text-sm" style="color:var(--text-primary)">검색어 자동 불용어 처리</p>
            <p class="text-xs mt-0.5" style="color:var(--text-muted)">
              Step 2 전처리 시 검색어를 자동으로 불용어에 추가 (예: "기후변화" → "기후", "변화")
            </p>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="chk-auto-stop" checked
                   onchange="Step1.setAutoStop(this.checked)" />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
        <!-- 관련성 필터 -->
        <div class="flex items-center justify-between mt-3 pt-3"
             style="border-top:1px solid var(--glass-border)">
          <div>
            <p class="font-semibold text-sm" style="color:var(--text-primary)">관련성 필터</p>
            <p class="text-xs mt-0.5" style="color:var(--text-muted)">
              제목·발췌에 검색어가 없는 무관 기사 자동 제거
            </p>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="chk-relev-filter" checked
                   onchange="Step1.setRelevanceFilter(this.checked)" />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
      </div>

      <!-- 날짜 필터 카드 -->
      <div class="card mt-3">
        <h2 class="card-title">📅 날짜 필터 <span class="text-xs font-normal" style="color:var(--text-muted)">(수집 후 클라이언트 필터링)</span></h2>
        <div class="flex flex-wrap gap-3 items-center">
          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold" style="color:var(--text-secondary)">시작일</label>
            <input type="date" id="date-from"
                   class="input-base" style="padding:6px 10px;font-size:13px;"
                   onchange="Step1.setDateFrom(this.value)" />
          </div>
          <span style="color:var(--text-muted)">~</span>
          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold" style="color:var(--text-secondary)">종료일</label>
            <input type="date" id="date-to"
                   class="input-base" style="padding:6px 10px;font-size:13px;"
                   onchange="Step1.setDateTo(this.value)" />
          </div>
          <button onclick="Step1.clearDateFilter()"
                  class="btn-ghost px-3 py-1 rounded-lg text-xs font-bold">초기화</button>
        </div>
      </div>

      <!-- 중복 제거 설정 카드 -->
      <div class="card mt-3">
        <button onclick="Step1.toggleDedupSettings()"
                class="flex items-center justify-between w-full">
          <h2 class="card-title mb-0">⚙️ 중복 제거 설정</h2>
          <span id="dedup-toggle-icon" class="text-xl" style="color:var(--text-muted)">▸</span>
        </button>
        <div id="dedup-settings-body" class="hidden mt-4 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold text-sm" style="color:var(--text-primary)">도메인 쿼터 (2단계)</p>
              <p class="text-xs mt-0.5" style="color:var(--text-muted)">동일 도메인에서 최대 N건만 허용</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="Step1.changeDomainQuota(-1)"
                      class="btn-ghost w-8 h-8 rounded-lg text-lg flex items-center justify-center font-bold">−</button>
              <span id="domain-quota-val" class="font-bold text-base text-white w-6 text-center">${domainQuota}</span>
              <button onclick="Step1.changeDomainQuota(1)"
                      class="btn-ghost w-8 h-8 rounded-lg text-lg flex items-center justify-center font-bold">+</button>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold text-sm" style="color:var(--text-primary)">Jaccard 임계값 (3단계)</p>
              <p class="text-xs mt-0.5" style="color:var(--text-muted)">이 이상 유사하면 중복으로 처리</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="Step1.changeJaccard(-0.1)"
                      class="btn-ghost w-8 h-8 rounded-lg text-lg flex items-center justify-center font-bold">−</button>
              <span id="jaccard-val" class="font-bold text-base text-white w-10 text-center">${jaccardThresh.toFixed(1)}</span>
              <button onclick="Step1.changeJaccard(0.1)"
                      class="btn-ghost w-8 h-8 rounded-lg text-lg flex items-center justify-center font-bold">+</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 진행 상태 -->
      <div id="collect-progress" class="card mt-3 hidden">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="spinner"></span>
            <span class="font-semibold text-sm" style="color:var(--text-secondary)">수집 중...</span>
          </div>
          <button onclick="Step1.cancelCollect()" class="btn-danger px-3 py-1 rounded-lg text-sm">중단</button>
        </div>
        <div class="progress-bar-track">
          <div id="collect-progress-fill" class="progress-bar-fill" style="width:0%"></div>
        </div>
        <p id="collect-progress-text" class="text-xs mt-2" style="color:var(--text-muted)">준비 중...</p>
      </div>

      <!-- 결과 영역 -->
      <div id="collect-result" class="hidden mt-4"></div>
    `;
  }

  // ── 수집 시작 ──────────────────────────────────────
  async function startCollect() {
    const query = document.getElementById('input-query')?.value.trim();
    if (!query) { App.showToast('검색어를 입력해주세요.', 'error'); return; }
    if (!Settings.getNaverClientId() || !Settings.getNaverClientSecret()) {
      App.showToast('네이버 API 키를 먼저 설정해주세요.', 'error');
      Settings.openModal();
      return;
    }

    isCancelled = false;
    App.state.searchQuery  = query;
    App.state.autoStopQuery = document.getElementById('chk-auto-stop')?.checked ?? true;

    setBtnState(true);
    showProgress();
    document.getElementById('collect-result').innerHTML = '';
    document.getElementById('collect-result').classList.add('hidden');

    try {
      updateProgress(0, '수집 준비 중...');
      const naverItems = await fetchAll(query, collectCount, sortMode);

      if (isCancelled) {
        App.showToast('수집이 중단되었습니다.', 'info');
        hideProgress();
        setBtnState(false);
        return;
      }

      updateProgress(95, 'HTML 정제 및 중복 제거 중...');

      // 정제
      rawItems = processNaverItems(naverItems);

      // 날짜 필터
      const dateFiltered = applyDateFilter(rawItems);

      // 관련성 필터 (제목·발췌에 검색어 없는 기사 제거)
      filteredItems = applyRelevanceFilter(dateFiltered, query);

      // 3단계 중복 제거
      dedupResult = runDedup(filteredItems);

      updateProgress(100, `완료! ${dedupResult.total}건 수집`);

      // 기본 mining target 설정 및 Step 완료
      commitMiningTarget(miningTarget, dedupResult);

      renderResults(rawItems, dateFiltered, filteredItems, dedupResult, query);

    } catch (err) {
      console.error('수집 오류:', err);
      const msg = err?.status === 401
        ? 'API 키 인증 실패. Client ID/Secret을 확인해주세요.'
        : err?.status === 429
        ? 'API 호출 한도 초과. 잠시 후 다시 시도해주세요.'
        : err?.data?.errorMessage
        ? `네이버 API 오류: ${err.data.errorMessage}`
        : `수집 오류 (${err?.status || '네트워크 오류'})`;
      App.showToast(msg, 'error', 5000);
    } finally {
      hideProgress();
      setBtnState(false);
    }
  }

  function cancelCollect() {
    isCancelled = true;
    App.showToast('수집을 중단합니다...', 'info');
  }

  // ── mining target 확정 → App.state.items 설정 ─────
  function commitMiningTarget(target, dedup) {
    miningTarget = target;
    const selected = target === 'unique' ? dedup.unique : [...dedup.unique, ...dedup.rejected];
    // _dupReason 필드 제거
    App.state.items = selected.map(({ _dupReason, ...item }) => item);
    App.completeStep(0);
    App.updateStatusBar();
  }

  // ── 결과 렌더링 ───────────────────────────────────
  function renderResults(all, dateFiltered, relevFiltered, dedup, query) {
    const result = document.getElementById('collect-result');
    result.classList.remove('hidden');
    const dupSet = new Set(dedup.rejected.map(r => r.title));

    result.innerHTML = `
      <!-- 요약 통계 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        ${statCard('전체 수집', all.length, '📰')}
        ${statCard('날짜 필터 후', dateFiltered.length, '📅')}
        ${statCard('관련성 필터 후', relevFiltered.length, '🎯')}
        ${statCard('고유 기사', dedup.unique.length, '✨')}
      </div>

      <!-- 언론사 분포 차트 -->
      <div class="card mb-4">
        <h3 class="card-title">📊 언론사 분포</h3>
        <div style="max-width:420px;margin:0 auto;">
          <canvas id="media-chart" height="220"></canvas>
        </div>
        <p class="text-xs text-center mt-2" style="color:var(--text-muted)">
          💡 어떤 언론사의 기사가 분석에 포함됐는지 확인해보세요. (미디어 편향 논의 활용)
        </p>
      </div>

      <!-- 텍스트마이닝 대상 선택 -->
      <div class="card mb-4">
        <h3 class="card-title">🎯 다음 단계에 사용할 기사</h3>
        <div class="space-y-2">
          <label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                 id="label-mine-unique"
                 style="background:rgba(3,199,90,0.12);border:1.5px solid var(--accent)"
                 onclick="Step1.selectMiningTarget('unique')">
            <input type="radio" name="mining-target" value="unique" checked class="accent-green-500" />
            <div>
              <p class="font-bold text-sm" style="color:var(--accent)">
                고유 기사만 분석 <span style="color:var(--accent-light)">(${dedup.unique.length}건)</span>
                &nbsp;<span class="text-xs font-normal px-1.5 py-0.5 rounded" style="background:rgba(3,199,90,0.2)">권장</span>
              </p>
              <p class="text-xs mt-0.5" style="color:var(--text-muted)">중복 제거 후 고유 기사만 분석 — 더 깨끗한 결과</p>
            </div>
          </label>
          <label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                 id="label-mine-all"
                 style="background:var(--glass-bg);border:1px solid var(--glass-border)"
                 onclick="Step1.selectMiningTarget('all')">
            <input type="radio" name="mining-target" value="all" class="accent-green-500" />
            <div>
              <p class="font-bold text-sm" style="color:var(--text-primary)">
                전체 기사로 분석 <span style="color:var(--text-muted)">(${dateFiltered.length}건)</span>
              </p>
              <p class="text-xs mt-0.5" style="color:var(--text-muted)">중복 포함 전체 — 언론사 쏠림 현상 파악 목적</p>
            </div>
          </label>
        </div>
      </div>

      <!-- 기사 목록 탭 -->
      <div class="card">
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div class="flex gap-1 p-1 rounded-xl"
               style="background:var(--glass-bg);border:1px solid var(--glass-border)">
            <button id="tab-all" onclick="Step1.switchTab('all')"
                    class="tab-btn active px-4 py-1.5 rounded-lg text-sm font-bold">
              전체 보기 (${relevFiltered.length})
            </button>
            <button id="tab-groups" onclick="Step1.switchTab('groups')"
                    class="tab-btn px-4 py-1.5 rounded-lg text-sm font-bold">
              중복 묶음 (${dedup.groups.length}그룹)
            </button>
          </div>
          <div class="flex gap-2">
            <input id="table-search" type="text" placeholder="기사 검색..."
                   class="input-base" style="padding:6px 12px;font-size:13px;width:160px;"
                   oninput="Step1.filterTable(this.value)" />
            <button onclick="Step1.downloadCSV()"
                    class="btn-ghost px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
              <span>📥</span> CSV
            </button>
          </div>
        </div>

        <div id="tab-view-all">
          ${renderAllTable(relevFiltered, dupSet)}
        </div>
        <div id="tab-view-groups" class="hidden">
          ${renderGroupsView(dedup.groups)}
        </div>
      </div>
    `;

    // 차트 렌더링
    renderMediaChart(dedup.unique);
  }

  function statCard(label, value, icon) {
    return `
      <div class="card text-center" style="padding:16px;">
        <div class="text-2xl mb-1">${icon}</div>
        <div class="text-xl font-extrabold text-white">${value.toLocaleString()}</div>
        <div class="text-xs mt-1" style="color:var(--text-muted)">${label}</div>
      </div>`;
  }

  // ── 전체 목록 테이블 ──────────────────────────────
  function renderAllTable(items, dupSet) {
    if (!items.length) return `<p class="text-sm text-center py-6" style="color:var(--text-muted)">수집된 기사가 없습니다.</p>`;
    return `
      <div class="overflow-y-auto" style="max-height:480px;">
        <table class="w-full text-sm" id="articles-table">
          <thead>
            <tr class="text-left" style="color:var(--text-muted);font-size:11px;">
              <th class="pb-2 pr-2">#</th>
              <th class="pb-2 pr-2">제목</th>
              <th class="pb-2 pr-2">언론사</th>
              <th class="pb-2 pr-2">날짜</th>
              <th class="pb-2">상태</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, i) => {
              const isDup = dupSet.has(item.title);
              return `
              <tr class="article-row border-t" style="border-color:var(--glass-border)${isDup ? ';opacity:0.65' : ''}">
                <td class="py-2 pr-2 font-mono text-xs" style="color:var(--text-muted)">${i + 1}</td>
                <td class="py-2 pr-2" style="max-width:320px;">
                  <a href="${Utils.escapeHtml(item.link)}" target="_blank" rel="noopener"
                     class="hover:underline leading-tight block"
                     style="color:var(--text-primary)">${Utils.escapeHtml(item.title)}</a>
                  <p class="text-xs mt-0.5 line-clamp-1" style="color:var(--text-muted)">${Utils.escapeHtml(item.description.slice(0, 80))}…</p>
                </td>
                <td class="py-2 pr-2 text-xs font-semibold whitespace-nowrap" style="color:var(--accent-light)">${Utils.escapeHtml(item.source)}</td>
                <td class="py-2 pr-2 text-xs whitespace-nowrap" style="color:var(--text-muted)">${item.date || '-'}</td>
                <td class="py-2 text-xs whitespace-nowrap">
                  ${isDup ? `<span class="px-1.5 py-0.5 rounded text-xs font-semibold" style="background:rgba(251,191,36,0.15);color:#fbbf24">중복</span>`
                          : `<span class="px-1.5 py-0.5 rounded text-xs font-semibold" style="background:rgba(3,199,90,0.15);color:var(--accent)">고유</span>`}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── 중복 묶음 탭 ──────────────────────────────────
  function renderGroupsView(groups) {
    if (!groups.length) return `<p class="text-sm text-center py-6" style="color:var(--text-muted)">유사 중복 그룹이 없습니다.</p>`;
    return `
      <div class="space-y-3 overflow-y-auto" style="max-height:480px;" id="groups-list">
        ${groups.map((g, gi) => `
          <div class="group-item p-3 rounded-xl" style="background:var(--glass-bg);border:1px solid var(--glass-border)">
            <div class="flex items-start gap-2 cursor-pointer" onclick="Step1.toggleGroup(${gi})">
              <span id="group-icon-${gi}" class="text-sm mt-0.5" style="color:var(--text-muted)">▸</span>
              <div class="flex-1">
                <p class="text-sm font-semibold" style="color:var(--text-primary)">
                  ${Utils.escapeHtml(g.representative.title)}
                </p>
                <p class="text-xs mt-0.5" style="color:var(--accent-light)">
                  ${Utils.escapeHtml(g.representative.source)} · ${g.representative.date || '-'}
                  <span class="ml-2 px-1.5 py-0.5 rounded font-bold"
                        style="background:rgba(251,191,36,0.15);color:#fbbf24">
                    유사 기사 ${g.similar.length}건 ▸
                  </span>
                </p>
              </div>
            </div>
            <div id="group-body-${gi}" class="hidden mt-3 pl-4 space-y-2 border-l-2" style="border-color:rgba(251,191,36,0.3)">
              ${g.similar.map(s => `
                <div>
                  <a href="${Utils.escapeHtml(s.link)}" target="_blank" rel="noopener"
                     class="text-sm hover:underline" style="color:var(--text-secondary)">
                    ${Utils.escapeHtml(s.title)}
                  </a>
                  <p class="text-xs" style="color:var(--text-muted)">${Utils.escapeHtml(s.source)} · ${s.date || '-'}</p>
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>`;
  }

  // ── 언론사 도넛 차트 ──────────────────────────────
  function renderMediaChart(items) {
    const cnt = {};
    items.forEach(item => { cnt[item.source] = (cnt[item.source] || 0) + 1; });
    const sorted = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    const TOP = 10;
    const top   = sorted.slice(0, TOP);
    const other = sorted.slice(TOP).reduce((s, [, v]) => s + v, 0);
    if (other > 0) top.push(['기타', other]);

    const labels = top.map(([k]) => k);
    const data   = top.map(([, v]) => v);
    const colors = [
      '#03C75A','#34d399','#6ee7b7','#02A64B','#059669',
      '#10b981','#047857','#065f46','#fbbf24','#f87171','#9ca3af',
    ];

    if (mediaChart) { mediaChart.destroy(); mediaChart = null; }

    const ctx = document.getElementById('media-chart');
    if (!ctx) return;
    mediaChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderColor: '#0d1117', borderWidth: 2 }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#94a3b8', font: { size: 11 }, padding: 10, boxWidth: 12 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw}건 (${((ctx.raw / items.length) * 100).toFixed(1)}%)`,
            },
          },
        },
      },
    });
  }

  // ── 탭 전환 ──────────────────────────────────────
  function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-view-all')?.classList.toggle('hidden', tab !== 'all');
    document.getElementById('tab-view-groups')?.classList.toggle('hidden', tab !== 'groups');
    document.getElementById('tab-all')?.classList.toggle('active',   tab === 'all');
    document.getElementById('tab-groups')?.classList.toggle('active', tab === 'groups');
  }

  // ── 그룹 펼침/접기 ────────────────────────────────
  function toggleGroup(idx) {
    const body = document.getElementById(`group-body-${idx}`);
    const icon = document.getElementById(`group-icon-${idx}`);
    const open = body?.classList.toggle('hidden');
    if (icon) icon.textContent = open ? '▸' : '▾';
  }

  // ── 테이블 필터 (전체보기 + 중복 묶음 공통) ────────
  function filterTable(keyword) {
    const kw = keyword.toLowerCase();
    // 전체보기 탭
    document.querySelectorAll('.article-row').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(kw) ? '' : 'none';
    });
    // 중복 묶음 탭
    document.querySelectorAll('.group-item').forEach(group => {
      group.style.display = group.textContent.toLowerCase().includes(kw) ? '' : 'none';
    });
  }

  // ── 텍스트마이닝 대상 선택 ────────────────────────
  function selectMiningTarget(target) {
    miningTarget = target;
    const isUnique = target === 'unique';
    const labelUnique = document.getElementById('label-mine-unique');
    const labelAll    = document.getElementById('label-mine-all');
    if (labelUnique) {
      labelUnique.style.background = isUnique ? 'rgba(3,199,90,0.12)' : 'var(--glass-bg)';
      labelUnique.style.border     = isUnique ? '1.5px solid var(--accent)' : '1px solid var(--glass-border)';
    }
    if (labelAll) {
      labelAll.style.background = !isUnique ? 'rgba(3,199,90,0.08)' : 'var(--glass-bg)';
      labelAll.style.border     = !isUnique ? '1.5px solid var(--accent)' : '1px solid var(--glass-border)';
    }
    if (dedupResult) {
      commitMiningTarget(target, dedupResult);
      // 차트 업데이트
      const chartItems = isUnique ? dedupResult.unique : [...dedupResult.unique, ...dedupResult.rejected];
      renderMediaChart(chartItems);
      App.showToast(
        isUnique
          ? `고유 기사 ${dedupResult.unique.length}건으로 분석합니다.`
          : `전체 기사 ${App.state.items.length}건으로 분석합니다.`,
        'info'
      );
    }
  }

  // ── CSV 다운로드 ──────────────────────────────────
  async function downloadCSV() {
    if (!filteredItems.length) { App.showToast('수집된 기사가 없습니다.', 'error'); return; }
    const dupSet = dedupResult ? new Set(dedupResult.rejected.map(r => r.title)) : new Set();
    const rows = [
      ['번호', '제목', '발췌', '언론사', '날짜', 'URL', '중복여부'],
      ...filteredItems.map((item, i) => [
        i + 1,
        item.title,
        item.description,
        item.source,
        item.date,
        item.link,
        dupSet.has(item.title) ? '중복' : '고유',
      ]),
    ];
    await Utils.downloadCSV(rows, `naver_news_${Utils.timestamp()}.csv`);
    App.showToast('CSV 파일을 저장했습니다.', 'success');
  }

  // ── 설정 변경 함수들 ──────────────────────────────
  function setCount(n) {
    collectCount = n;
    document.querySelectorAll('.count-chip').forEach(el => {
      const active = parseInt(el.dataset.val) === n;
      el.classList.toggle('chip-active', active);
      el.style.cssText = chipStyle(active);
    });
  }

  function setSort(s) {
    sortMode = s;
    document.querySelectorAll('.sort-chip').forEach(el => {
      const active = el.dataset.val === s;
      el.classList.toggle('chip-active', active);
      el.style.cssText = chipStyle(active);
    });
  }

  function setRange(r) {
    textRange = r;
    document.querySelectorAll('.range-chip').forEach(el => {
      const active = el.dataset.val === r;
      el.classList.toggle('chip-active', active);
      el.style.cssText = chipStyle(active);
    });
  }

  function setDateFrom(v) { dateFrom = v; }
  function setDateTo(v)   { dateTo   = v; }
  function clearDateFilter() {
    dateFrom = dateTo = '';
    const f = document.getElementById('date-from');
    const t = document.getElementById('date-to');
    if (f) f.value = '';
    if (t) t.value = '';
  }

  function setAutoStop(val) { App.state.autoStopQuery = val; }

  function setRelevanceFilter(val) { relevFilterEnabled = val; }

  function changeDomainQuota(delta) {
    domainQuota = Math.max(1, Math.min(20, domainQuota + delta));
    const el = document.getElementById('domain-quota-val');
    if (el) el.textContent = domainQuota;
  }

  function changeJaccard(delta) {
    jaccardThresh = Math.round(Math.max(0.3, Math.min(0.9, jaccardThresh + delta)) * 10) / 10;
    const el = document.getElementById('jaccard-val');
    if (el) el.textContent = jaccardThresh.toFixed(1);
  }

  function toggleDedupSettings() {
    const body = document.getElementById('dedup-settings-body');
    const icon = document.getElementById('dedup-toggle-icon');
    const open = body?.classList.toggle('hidden');
    if (icon) icon.textContent = open ? '▸' : '▾';
  }

  // ── 진행 상태 UI ──────────────────────────────────
  function showProgress() {
    document.getElementById('collect-progress')?.classList.remove('hidden');
  }
  function hideProgress() {
    document.getElementById('collect-progress')?.classList.add('hidden');
  }
  function updateProgress(pct, msg) {
    const fill = document.getElementById('collect-progress-fill');
    const text = document.getElementById('collect-progress-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = msg;
  }
  function setBtnState(loading) {
    const icon = document.getElementById('collect-btn-icon');
    const text = document.getElementById('collect-btn-text');
    const btn  = document.querySelector('[onclick="Step1.startCollect()"]');
    if (icon) icon.textContent = loading ? '' : '🔎';
    if (text) text.textContent = loading ? '수집 중...' : '수집 시작';
    if (btn)  btn.disabled = loading;
    if (loading && icon) {
      icon.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>';
    }
  }

  // ── 칩 HTML 헬퍼 ──────────────────────────────────
  const chipBase = 'px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition chip-active-check';
  const chipStyle = (active) => active
    ? 'background:var(--accent);color:white;'
    : 'background:var(--glass-bg);color:var(--text-secondary);border:1px solid var(--glass-border);';

  function countChip(val, label) {
    const active = collectCount === val;
    return `<button class="count-chip px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${active ? 'chip-active' : ''}"
              data-val="${val}" onclick="Step1.setCount(${val})"
              style="${chipStyle(active)}">${label}</button>`;
  }

  function sortChip(val, label) {
    const active = sortMode === val;
    return `<button class="sort-chip px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${active ? 'chip-active' : ''}"
              data-val="${val}" onclick="Step1.setSort('${val}')"
              style="${chipStyle(active)}">${label}</button>`;
  }

  function rangeChip(val, label) {
    const active = textRange === val;
    return `<button class="range-chip px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${active ? 'chip-active' : ''}"
              data-val="${val}" onclick="Step1.setRange('${val}')"
              style="${chipStyle(active)}">${label}</button>`;
  }

  // ── 공개 API ─────────────────────────────────────
  return {
    render,
    startCollect,
    cancelCollect,
    setCount,
    setSort,
    setRange,
    setDateFrom,
    setDateTo,
    clearDateFilter,
    setAutoStop,
    setRelevanceFilter,
    changeDomainQuota,
    changeJaccard,
    toggleDedupSettings,
    toggleGroup,
    switchTab,
    filterTable,
    selectMiningTarget,
    downloadCSV,
  };

})();
