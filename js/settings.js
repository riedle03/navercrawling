/**
 * settings.js
 * 네이버 API (Client ID + Secret) + 바른(Bareun) API 키 관리 (localStorage)
 */
const Settings = (() => {
  const NAVER_ID     = 'naver_client_id';
  const NAVER_SECRET = 'naver_client_secret';
  const BAREUN_KEY   = 'bareun_api_key';

  function getNaverClientId()     { return localStorage.getItem(NAVER_ID)     || ''; }
  function getNaverClientSecret() { return localStorage.getItem(NAVER_SECRET) || ''; }
  function getBareunKey()         { return localStorage.getItem(BAREUN_KEY)   || ''; }

  function openModal() {
    const modal = document.getElementById('settings-modal');

    // 네이버 Client ID
    const idInput    = document.getElementById('input-naver-id');
    const idStatus   = document.getElementById('naver-id-status');
    const savedId    = getNaverClientId();
    if (idInput) { idInput.value = savedId; idInput.type = 'password'; }
    const idToggle = document.getElementById('btn-toggle-naver-id');
    if (idToggle) idToggle.textContent = '👁';
    if (idStatus) {
      idStatus.innerHTML = savedId
        ? `<span class="text-emerald-400">✅ 저장됨 (${maskKey(savedId)})</span>`
        : `<span style="color:var(--warning)">⚠️ Client ID가 없습니다.</span>`;
    }

    // 네이버 Client Secret
    const secretInput  = document.getElementById('input-naver-secret');
    const secretStatus = document.getElementById('naver-secret-status');
    const savedSecret  = getNaverClientSecret();
    if (secretInput) { secretInput.value = savedSecret; secretInput.type = 'password'; }
    const secretToggle = document.getElementById('btn-toggle-naver-secret');
    if (secretToggle) secretToggle.textContent = '👁';
    if (secretStatus) {
      secretStatus.innerHTML = savedSecret
        ? `<span class="text-emerald-400">✅ 저장됨 (${maskKey(savedSecret)})</span>`
        : `<span style="color:var(--warning)">⚠️ Client Secret이 없습니다.</span>`;
    }

    // 연결 테스트 결과 초기화
    const testResult = document.getElementById('naver-test-result');
    if (testResult) testResult.innerHTML = '';

    // 바른 API 키
    const bareunInput  = document.getElementById('input-bareun-key');
    const bareunStatus = document.getElementById('bareun-key-status');
    const savedBareun  = getBareunKey();
    if (bareunInput) { bareunInput.value = savedBareun; bareunInput.type = 'password'; }
    const bareunToggle = document.getElementById('btn-toggle-bareun');
    if (bareunToggle) bareunToggle.textContent = '👁';
    if (bareunStatus) {
      bareunStatus.innerHTML = savedBareun
        ? `<span class="text-emerald-400">✅ 저장됨 (${maskKey(savedBareun)})</span>`
        : `<span style="color:var(--text-muted)">미입력 (선택 사항)</span>`;
    }

    modal.classList.remove('hidden');
    setTimeout(() => { if (idInput) idInput.focus(); }, 100);
  }

  function closeModal() {
    document.getElementById('settings-modal').classList.add('hidden');
  }

  async function saveKey() {
    const clientId     = document.getElementById('input-naver-id')?.value.trim()     || '';
    const clientSecret = document.getElementById('input-naver-secret')?.value.trim() || '';
    const bareunKey    = document.getElementById('input-bareun-key')?.value.trim()   || '';
    const testResult   = document.getElementById('naver-test-result');

    if (!clientId || !clientSecret) {
      App.showToast('Client ID와 Client Secret을 모두 입력해주세요.', 'error');
      return;
    }

    // 저장
    localStorage.setItem(NAVER_ID,     clientId);
    localStorage.setItem(NAVER_SECRET, clientSecret);
    if (bareunKey) localStorage.setItem(BAREUN_KEY, bareunKey);
    else           localStorage.removeItem(BAREUN_KEY);

    // 연결 테스트
    if (testResult) testResult.innerHTML = `<span style="color:var(--text-muted)">🔄 연결 확인 중...</span>`;

    const ok = await testNaverConnection(clientId, clientSecret);

    if (ok) {
      if (testResult) testResult.innerHTML = `<span class="text-emerald-400">✅ 연결 확인됨</span>`;
      App.showToast('설정이 저장되었습니다.', 'success');
      App.updateHeaderKeyStatus();
      App.renderCurrentStep();
      setTimeout(closeModal, 1200);
    } else {
      if (testResult) testResult.innerHTML = `<span style="color:var(--danger, #f87171)">❌ Client ID 또는 Secret을 다시 확인해주세요</span>`;
      App.showToast('API 키 인증에 실패했습니다. 키를 다시 확인해주세요.', 'error');
      // 저장은 유지 (사용자가 직접 재입력 가능하도록)
    }
  }

  async function testNaverConnection(clientId, clientSecret) {
    try {
      const apiBase = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : '';
      const res = await fetch(`${apiBase}/api/naver?query=${encodeURIComponent('뉴스')}&display=1&start=1`, {
        headers: {
          'X-Naver-Client-Id':     clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Array.isArray(data.items);
    } catch (_) {
      return false;
    }
  }

  function toggleVisibility(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn   = document.getElementById(btnId);
    if (!input || !btn) return;
    if (input.type === 'password') { input.type = 'text';     btn.textContent = '🙈'; }
    else                           { input.type = 'password'; btn.textContent = '👁';  }
  }

  function toggleNaverIdVisibility()     { toggleVisibility('input-naver-id',     'btn-toggle-naver-id');     }
  function toggleNaverSecretVisibility() { toggleVisibility('input-naver-secret', 'btn-toggle-naver-secret'); }
  function toggleBareunKeyVisibility()   { toggleVisibility('input-bareun-key',   'btn-toggle-bareun');       }

  function maskKey(key) {
    if (!key || key.length < 8) return '****';
    return key.slice(0, 4) + '...' + key.slice(-4);
  }

  // ESC / 모달 외부 클릭으로 닫기
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.getElementById('settings-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('settings-modal')) closeModal();
  });

  return {
    getNaverClientId,
    getNaverClientSecret,
    getBareunKey,
    openModal,
    closeModal,
    saveKey,
    toggleNaverIdVisibility,
    toggleNaverSecretVisibility,
    toggleBareunKeyVisibility,
  };
})();
