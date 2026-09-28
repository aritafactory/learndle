(() => {
  const CREDITS_KEY = 'ewg_ad_credits';
  const LEVEL_INDEX = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  const MAX_LEN = { A1: 12, A2: 13, B1: 18, B2: 16, C1: 16, C2: 19 };

  let sdk = null;
  let loadingReadySent = false;
  let gameplayRunning = false;

  const coreReady = new Promise((resolve) => {
    if (window.__LEARNDLE_CORE_READY) resolve();
    else window.addEventListener('LEARNDLE_CORE_READY', resolve, { once: true });
  });

  const sdkReady = typeof window.YaGames === 'undefined'
    ? Promise.reject(new Error('Yandex Games SDK is unavailable'))
    : window.YaGames.init().then((initializedSdk) => {
        sdk = initializedSdk;
        return initializedSdk;
      });

  function setPaused(paused) {
    window.LearndleCore?.setPaused(paused);
  }

  function gameplayStart() {
    if (gameplayRunning || !sdk?.features?.GameplayAPI) return;
    try {
      sdk.features.GameplayAPI.start();
      gameplayRunning = true;
    } catch (error) {
      console.warn('[YSDK] GameplayAPI.start failed', error);
    }
  }

  function gameplayStop() {
    if (!gameplayRunning) return;
    try {
      sdk?.features?.GameplayAPI?.stop();
    } catch (error) {
      console.warn('[YSDK] GameplayAPI.stop failed', error);
    } finally {
      gameplayRunning = false;
    }
  }

  function resumeActiveRound() {
    setPaused(false);
    if (window.LearndleCore?.isRoundActive()) gameplayStart();
  }

  function subscribeSdkEvents() {
    if (typeof sdk?.on !== 'function') return;
    sdk.on('game_api_pause', () => {
      setPaused(true);
      gameplayRunning = false;
    });
    sdk.on('game_api_resume', () => {
      resumeActiveRound();
    });
  }

  Promise.all([sdkReady, coreReady])
    .then(async ([initializedSdk]) => {
      const detected = String(initializedSdk.environment?.i18n?.lang || 'en').toLowerCase().split('-')[0];
      window.LearndleCore.setLanguage(detected === 'ru' ? 'ru' : 'en');
      subscribeSdkEvents();
      if (window.LearndleCore.isRoundActive()) gameplayStart();
      if (!loadingReadySent && typeof initializedSdk.features?.LoadingAPI?.ready === 'function') {
        loadingReadySent = true;
        await initializedSdk.features.LoadingAPI.ready();
      }
    })
    .catch((error) => {
      console.info('[YSDK] Running without platform services:', error.message);
    });

  function getCredits() {
    return Number(localStorage.getItem(CREDITS_KEY) || 0);
  }

  function setCredits(value) {
    localStorage.setItem(CREDITS_KEY, String(Math.max(0, value)));
  }

  function addCredits(level, length) {
    const delta = ((LEVEL_INDEX[level] || 1) / 6) * (length / (MAX_LEN[level] || length));
    setCredits(getCredits() + delta);
  }

  function showFullscreenAd() {
    return new Promise((resolve) => {
      if (typeof sdk?.adv?.showFullscreenAdv !== 'function') {
        resolve({ wasShown: false, unavailable: true });
        return;
      }

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resumeActiveRound();
        resolve(result);
      };

      gameplayStop();
      setPaused(true);
      try {
        sdk.adv.showFullscreenAdv({
          callbacks: {
            onClose: (wasShown) => finish({ wasShown: Boolean(wasShown) }),
            onError: (error) => {
              console.warn('[YSDK] Fullscreen ad failed', error);
              finish({ wasShown: false, error });
            }
          }
        });
      } catch (error) {
        console.warn('[YSDK] Fullscreen ad failed', error);
        finish({ wasShown: false, error });
      }
    });
  }

  function showRewardedAd(button) {
    if (typeof sdk?.adv?.showRewardedVideo !== 'function') return;

    const normalText = window.LearndleCore.getText('adReward');
    let rewarded = false;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      button.disabled = false;
      button.textContent = normalText;
      resumeActiveRound();
    };

    button.disabled = true;
    button.textContent = window.LearndleCore.getText('adLoading');
    gameplayStop();
    setPaused(true);

    try {
      sdk.adv.showRewardedVideo({
        callbacks: {
          onRewarded: () => {
            if (rewarded) return;
            rewarded = true;
            window.LearndleCore.addPoints(1000);
          },
          onClose: restore,
          onError: (error) => {
            console.warn('[YSDK] Rewarded ad failed', error);
            restore();
          }
        }
      });
    } catch (error) {
      console.warn('[YSDK] Rewarded ad failed', error);
      restore();
    }
  }

  function showAdPrompt() {
    return new Promise((resolve) => {
      const text = (key) => window.LearndleCore.getText(key);
      const overlay = document.createElement('div');
      overlay.id = 'ad-prompt-overlay';
      overlay.innerHTML = `<div id="ad-prompt"><h4>${text('adPromptTitle')}</h4><p>${text('adPromptText')}</p><div class="buttons"><button class="primary">${text('watchAd')}</button><button class="secondary">${text('skipPoints')}</button></div></div>`;
      const watchButton = overlay.querySelector('.primary');
      const skipButton = overlay.querySelector('.secondary');
      skipButton.disabled = Number(localStorage.getItem('ewg_xp_dom_v1') || 0) < 1000;
      document.body.appendChild(overlay);

      watchButton.onclick = async () => {
        watchButton.disabled = true;
        skipButton.disabled = true;
        const result = await showFullscreenAd();
        overlay.remove();
        resolve({ watched: result.wasShown });
      };
      skipButton.onclick = () => {
        const xp = Number(localStorage.getItem('ewg_xp_dom_v1') || 0);
        if (xp < 1000) return;
        localStorage.setItem('ewg_xp_dom_v1', String(xp - 1000));
        window.LearndleCore.addPoints(0);
        overlay.remove();
        resolve({ skipped: true });
      };
    });
  }

  async function requestNextRound(continueTransition) {
    const credits = getCredits();
    if (credits >= 0.5) {
      const result = await showFullscreenAd();
      if (result.wasShown) setCredits(getCredits() - 0.5);
    } else if (credits >= 0.25) {
      const result = await showAdPrompt();
      if (result.watched || result.skipped) setCredits(getCredits() - 0.25);
    }
    continueTransition();
  }

  window.addEventListener('learndle:round-start', gameplayStart);
  window.addEventListener('learndle:round-end', (event) => {
    gameplayStop();
    addCredits(event.detail.level, event.detail.length);
  });
  window.addEventListener('learndle:menu', gameplayStop);

  document.querySelectorAll('.ad-btn').forEach((button) => {
    button.addEventListener('click', () => {
      if (!button.disabled) showRewardedAd(button);
    });
  });

  window.LearndlePlatform = Object.freeze({ requestNextRound });
})();
