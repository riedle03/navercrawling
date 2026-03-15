/**
 * app.js
 * 전역 상태 관리 & 스텝 라우팅
 */
const App = (() => {

  // ── 전역 상태 ──────────────────────────────────────
  const state = {
    items: [],           // Step 1: 수집된 뉴스 기사 배열 [{title, description, link, pubDate, source, text}]
    searchQuery: '',     // Step 1: 검색어 (Step 2 자동 불용어 처리에 사용)
    autoStopQuery: true, // Step 1: 검색어 자동 불용어 처리 여부
    tokens: [],          // Step 2: 전처리 후 토큰 배열 (기사별)
    flatTokens: [],      // Step 2: 전체 토큰 1차원 배열
    frequency: [],       // Step 3: [{word, count, ratio}] 정렬된 배열
    currentStep: 1,
    stepCompleted: [false, false, false, false, false, false],
  };

  // ── 스텝 정의 ──────────────────────────────────────
  const STEPS = [
    { id: 1, label: '뉴스 수집',    icon: '①', module: () => Step1.render() },
    { id: 2, label: '전처리',       icon: '②', module: () => Step2.render() },
    { id: 3, label: '빈도 분석',    icon: '③', module: () => Step3.render() },
    { id: 4, label: '막대차트',     icon: '④', module: () => Step4.render() },
    { id: 5, label: '워드클라우드', icon: '⑤', module: () => Step5.render() },
    { id: 6, label: 'SNA',          icon: '⑥', module: () => Step6.render() },
  ];

  // ── 스텝 네비게이터 렌더링 ─────────────────────────
  function renderNavigator() {
    const nav = document.getElementById('step-navigator');
    nav.innerHTML = '';

    STEPS.forEach((step, idx) => {
      // 화살표 (첫 스텝 제외)
      if (idx > 0) {
        const arrow = document.createElement('li');
        arrow.className = 'step-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '›';
        nav.appendChild(arrow);
      }

      // 스텝 아이템
      const li = document.createElement('li');
      const isActive    = state.currentStep === step.id;
      const isCompleted = state.stepCompleted[idx];

      li.className = `step-item ${isActive ? 'active' : isCompleted ? 'completed' : 'pending'}`;
      li.setAttribute('aria-current', isActive ? 'step' : 'false');
      li.innerHTML = `
        <span class="step-circle">${isCompleted && !isActive ? '✓' : step.icon}</span>
        <span class="step-label">${step.label}</span>
      `;

      // 완료된 스텝 클릭 → 해당 스텝으로 이동
      if (isCompleted || isActive) {
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => goToStep(step.id));
      }

      nav.appendChild(li);
    });
  }

  // ── 이전/다음 버튼 상태 업데이트 ──────────────────
  function updateNavButtons() {
    const isFirst = state.currentStep === 1;
    const isLast  = state.currentStep === STEPS.length;
    const canNext = state.stepCompleted[state.currentStep - 1];

    // 하단 푸터 버튼
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    if (btnPrev) btnPrev.disabled = isFirst;
    if (btnNext) btnNext.disabled = !canNext;

    // 상단 네비게이터 버튼
    const navPrev = document.getElementById('nav-btn-prev');
    const navNext = document.getElementById('nav-btn-next');
    if (navPrev) navPrev.disabled = isFirst;
    if (navNext) navNext.disabled = !canNext || isLast;

    // FAB 표시/숨김
    updateFAB(canNext && !isLast);
  }

  // ── FAB 표시 제어 ─────────────────────────────────
  function updateFAB(show) {
    const fab = document.getElementById('fab-next');
    if (!fab) return;
    if (show) {
      fab.classList.remove('hidden');
      fab.classList.add('fab-visible');
    } else {
      fab.classList.remove('fab-visible');
      fab.classList.add('hidden');
    }
  }

  // ── Intersection Observer: 푸터 보이면 FAB 숨김 ──
  function initFABObserver() {
    const footer = document.querySelector('footer');
    if (!footer || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const fab = document.getElementById('fab-next');
        if (!fab || fab.classList.contains('hidden')) return;
        fab.style.opacity = entry.isIntersecting ? '0' : '1';
        fab.style.pointerEvents = entry.isIntersecting ? 'none' : 'auto';
      },
      { threshold: 0.5 }
    );
    observer.observe(footer);
  }

  // ── 상태바 업데이트 ────────────────────────────────
  function updateStatusBar() {
    const itemEl = document.getElementById('status-comments');
    if (itemEl) {
      itemEl.innerHTML = `기사: <strong>${state.items.length.toLocaleString()}</strong>개`;
    }

    const tokenEl = document.getElementById('status-tokens');
    if (tokenEl) {
      if (state.flatTokens.length > 0) {
        tokenEl.classList.remove('hidden');
        tokenEl.innerHTML = `토큰: <strong>${state.flatTokens.length.toLocaleString()}</strong>개`;
      } else {
        tokenEl.classList.add('hidden');
      }
    }
  }

  // ── 헤더 API 키 상태 표시 ──────────────────────────
  function updateHeaderKeyStatus() {
    const hasKey = !!(Settings.getNaverClientId() && Settings.getNaverClientSecret());
    const btn = document.getElementById('btn-settings');
    if (!btn) return;
    if (hasKey) {
      btn.classList.remove('text-gray-600');
      btn.classList.add('text-green-600');
    } else {
      btn.classList.remove('text-green-600');
      btn.classList.add('text-gray-600');
    }
  }

  // ── 스텝 이동 ──────────────────────────────────────
  function goToStep(stepId) {
    state.currentStep = stepId;
    renderNavigator();
    updateNavButtons();
    renderCurrentStep();
  }

  function nextStep() {
    if (state.currentStep < STEPS.length && state.stepCompleted[state.currentStep - 1]) {
      goToStep(state.currentStep + 1);
    }
  }

  function prevStep() {
    if (state.currentStep > 1) {
      goToStep(state.currentStep - 1);
    }
  }

  // ── 현재 스텝 콘텐츠 렌더링 ───────────────────────
  function renderCurrentStep() {
    const container = document.getElementById('step-container');
    container.innerHTML = '';

    const step = STEPS[state.currentStep - 1];
    try {
      step.module();
    } catch (e) {
      container.innerHTML = `
        <div class="card mt-4">
          <div class="empty-state">
            <div class="empty-icon">🚧</div>
            <div class="empty-text">이 기능은 준비 중입니다.</div>
            <div class="empty-sub">Step ${step.id}: ${step.label}</div>
          </div>
        </div>`;
    }

    updateStatusBar();
  }

  // ── 스텝 완료 처리 ─────────────────────────────────
  function completeStep(stepIndex) {
    state.stepCompleted[stepIndex] = true;
    renderNavigator();
    updateNavButtons();
    updateStatusBar();
  }

  // ── 토스트 알림 ────────────────────────────────────
  let toastTimer = null;
  function showToast(message, type = 'info', duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  // ── 초기화 ─────────────────────────────────────────
  function init() {
    updateHeaderKeyStatus();
    renderNavigator();
    updateNavButtons();
    renderCurrentStep();
    initFABObserver();

    // API 키 없으면 설정 모달 자동 열기
    if (!Settings.getNaverClientId()) {
      setTimeout(() => Settings.openModal(), 400);
    }
  }

  // DOM 준비 후 초기화
  document.addEventListener('DOMContentLoaded', init);

  // ── 공개 API ───────────────────────────────────────
  return {
    state,
    nextStep,
    prevStep,
    goToStep,
    completeStep,
    showToast,
    updateStatusBar,
    updateHeaderKeyStatus,
    renderCurrentStep,
  };

})();
