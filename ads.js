(() => {
    // --- Yandex Games SDK init ---
  let ysdk = null;
  let ysdkReady = false;

  function tryReady() {
  if (!ysdkReady || !ysdk) return;
  if (window.__ygReadySent) return;
  if (!window.__LEARNDLE_CORE_READY) return;
}

  if (typeof YaGames !== 'undefined') {
    YaGames.init()
      .then((sdk) => {
        ysdk = sdk;
        ysdkReady = true;
        window.ysdk = sdk;
        console.log('[YSDK] init success');
        tryReady();

        const lang = (sdk.environment?.i18n?.lang || 'ru').toLowerCase();
        window.__ygLang = lang;
        document.documentElement.lang = lang;
        console.log('[YSDK] detected lang:', lang);

        // говорим Яндексу, что игра загрузилась
        try {
          sdk.features?.LoadingAPI?.ready();
        } catch (e) {
          console.log('[YSDK] LoadingAPI not available', e);
        }
      })
      .catch((err) => {
        console.error('[YSDK] init error', err);
      });
  } else {
    console.log('[YSDK] YaGames is not defined (запуск не на Яндекс.Играх)');
  }

  window.addEventListener('LEARNDLE_CORE_READY', tryReady);

  // флаги и хранилища
  window.__gdReady = false;
  let __grant = null; // коллбэк награды за rewarded

  // Единая точка приёма событий от SDK (её зовёт onEvent из GD_OPTIONS)
  window.__gdOnEvent = function(e){
    console.log('[GD]', e?.name, e);

    if (!e) return;
    if (e.name === 'SDK_READY')            window.__gdReady = true;
    if (e.name === 'SDK_GAME_PAUSE')       {/* pause input/sfx если нужно */}
    if (e.name === 'SDK_GAME_START')       {/* resume */}
    if (e.name === 'SDK_REWARDED_WATCH_COMPLETE') {
      // выдаём награду только после полноценного просмотра
      try { __grant?.(); } finally { __grant = null; }
    }
  };

  // Используем флаг готовности при показе рекламы
  window.gdShowInterstitial = function(){
    if (!window.__gdReady || !window.gdsdk?.showInterstitial) return Promise.resolve(false);
    try { gdsdk.showInterstitial(); return Promise.resolve(true); } catch(_) { return Promise.resolve(false); }
  };

  window.gdShowRewarded = function(grant){
    if (!window.__gdReady || !window.gdsdk?.showRewarded) return Promise.resolve(false);
    __grant = grant; // сохранили, выдадим в __gdOnEvent при WATCH_COMPLETE
    try { gdsdk.showRewarded(); } catch(_) {}
    return Promise.resolve(true);
  };
})();

(() => {
  // Simple telemetry collector. In a real integration this would
  // feed into your analytics pipeline. Here we log to the console.
  function track(event) {
    try {
      console.log('[telemetry]', event);
    } catch (_) {}
  }

  // Persistent credit storage
  const CREDITS_KEY = 'ewg_ad_credits';
  // Key used by the main game to store accumulated experience points. We replicate
  // the get/set logic here since getXP/setXP are scoped within the core script.
  const XP_KEY = 'ewg_xp_dom_v1';
  const LEVEL_INDEX = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  const MAX_LEN = { A1: 12, A2: 13, B1: 18, B2: 16, C1: 16, C2: 19 };

  function getCredits() {
    return +(localStorage.getItem(CREDITS_KEY) || 0);
  }
  function setCredits(v) {
    localStorage.setItem(CREDITS_KEY, String(v));
  }
  function addCredits(level, len) {
    const li = LEVEL_INDEX[level] || 1;
    const ml = MAX_LEN[level] || len;
    const delta = (li / 6) * (len / ml);
    const cur = getCredits();
    setCredits(cur + delta);
  }

  // assign GD SDK event handler shim; the real callback is defined below
  window.__gd_on_event = function(event) {
    switch (event.name) {
      case 'SDK_GAME_PAUSE':
        pauseGame(true);
        track('game_paused');
        break;
      case 'SDK_GAME_START':
        pauseGame(false);
        track('game_resumed');
        break;
      case 'SDK_REWARDED_WATCH_COMPLETE':
        if (typeof window.__gd_reward_grant === 'function') {
          const fn = window.__gd_reward_grant;
          window.__gd_reward_grant = null;
          fn();
        }
        track('rw_complete');
        break;
    }
  };

  // Pause/resume helper
  function pauseGame(flag) {
    window.__game_paused__ = !!flag;
  }

  // Keydown interception when paused
  document.addEventListener(
    'keydown',
    (e) => {
      if (window.__game_paused__) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true
  );

  // Reward animation near button
  function animateReward(btn, amount) {
    try {
      const anim = document.createElement('div');
      anim.textContent = '+' + amount;
      anim.style.position = 'absolute';
      const rect = btn.getBoundingClientRect();
      anim.style.left = rect.left + 'px';
      anim.style.top = rect.top - 30 + 'px';
      anim.style.color = '#ffd700';
      anim.style.fontWeight = 'bold';
      anim.style.opacity = '1';
      anim.style.transition = 'opacity 1s ease, transform 1s ease';
      document.body.appendChild(anim);
      requestAnimationFrame(() => {
        anim.style.transform = 'translateY(-40px)';
        anim.style.opacity = '0';
      });
      setTimeout(() => {
        anim.remove();
      }, 1000);
    } catch (_) {}
  }

  // XP reward helper
  function grantRewardPoints(pts) {
    try {
      // Update total XP stored in localStorage
      const cur = parseInt(localStorage.getItem(XP_KEY) || '0', 10);
      const next = cur + pts;
      localStorage.setItem(XP_KEY, String(next));
      // Update visible counters on the page
      updateXPViews();
    } catch (_) {}
  }

  // Update XP displays on all screens. This duplicates updateTotalPointsViews from the
  // core game. It will safely do nothing if elements are missing.
  function updateXPViews() {
    const xp = parseInt(localStorage.getItem(XP_KEY) || '0', 10);
    const el1 = document.getElementById('total-score-display');
    const el2 = document.getElementById('total-score-game');
    const el3 = document.getElementById('win-points');
    if (el1) el1.textContent = `Всего очков: ${xp}`;
    if (el2) el2.textContent = `Всего очков: ${xp}`;
    if (el3) el3.textContent = xp;
  }

  // Show mandatory ad and handle result
  function showMandatoryAd(onSuccess, onFail) {
    track('mandatory_shown');
    const result = gdShowInterstitial();
    if (result) {
      // We cannot reliably detect the end of an interstitial; proceed immediately
      setTimeout(onSuccess, 0);
    } else {
      track('mandatory_fail');
      onFail();
    }
  }

  // Create and display ad prompt overlay
  function showAdPrompt(opts) {
    track('prompt_shown');
    let overlay = document.getElementById('ad-prompt-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ad-prompt-overlay';
      const inner = document.createElement('div');
      inner.id = 'ad-prompt';
      inner.innerHTML =
        '<h4>Support the game</h4>' +
        '<p>You can watch a short ad for free or skip for a small fee.</p>' +
        '<div class="buttons">' +
        '<button class="primary">Watch Ad (Free)</button>' +
        '<button class="secondary">Skip −1000 pts</button>' +
        '</div>';
      overlay.appendChild(inner);
      document.body.appendChild(overlay);
    }
    const watchBtn = overlay.querySelector('.primary');
    const skipBtn = overlay.querySelector('.secondary');
    // Disable skip if not enough XP
    try {
      const xp = parseInt(localStorage.getItem(XP_KEY) || '0', 10);
      skipBtn.disabled = xp < 1000;
    } catch (_) {}
    function cleanup() {
      watchBtn.onclick = null;
      skipBtn.onclick = null;
      overlay.remove();
    }
    watchBtn.onclick = () => {
      track('prompt_watch');
      cleanup();
      const success = gdShowInterstitial();
      // Regardless of ad success, proceed to onWatch. No credits deduction is made here.
      opts.onWatch();
    };
    skipBtn.onclick = () => {
      track('prompt_skip_paid');
      cleanup();
      opts.onSkip();
    };
  }

  // Check credits and display ads if needed before starting next round
  function checkAndShowAds(callback) {
    const credits = getCredits();
    if (credits >= 0.5) {
      showMandatoryAd(
        () => {
          setCredits(credits - 0.5);
          callback();
        },
        () => {
          callback();
        }
      );
    } else if (credits >= 0.25) {
      showAdPrompt({
        onWatch: () => {
          setCredits(getCredits() - 0.25);
          callback();
        },
        onSkip: () => {
          // Deduct credits for skipping
          setCredits(getCredits() - 0.25);
          // Deduct 1000 XP if the user has enough
          try {
            const xp = parseInt(localStorage.getItem(XP_KEY) || '0', 10);
            if (xp >= 1000) localStorage.setItem(XP_KEY, String(xp - 1000));
            updateXPViews();
          } catch (_) {}
          callback();
        }
      });
    } else {
      callback();
    }
  }

    // Показ полноэкранной рекламы через Яндекс.Игры
  function gdShowInterstitial() {
    try {
      if (!ysdkReady || !ysdk || !ysdk.adv || typeof ysdk.adv.showFullscreenAdv !== 'function') {
        return false; // нет SDK — считаем, что рекламы нет
      }

      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: function () {
            // тут ничего не делаем — showMandatoryAd и так сразу продолжает игру
          },
          onError: function (err) {
            console.error('[YSDK interstitial error]', err);
          }
        }
      });

      return true;
    } catch (err) {
      console.error('[YSDK interstitial error]', err);
      return false;
    }
  }

    // Rewarded-видео через Яндекс.Игры (+1000 очков за просмотр)
  function gdShowRewarded(grant) {
    // Если SDK не готов, сразу выдаём награду, чтобы не ломать UX
    if (!ysdkReady || !ysdk || !ysdk.adv || typeof ysdk.adv.showRewardedVideo !== 'function') {
      if (typeof grant === 'function') {
        setTimeout(grant, 0);
      }
      return false;
    }

    try {
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: function () {
            // можно запаузить звук/игру, если захочешь
          },
          onRewarded: function () {
            // игрок досмотрел — выдаём награду
            if (typeof grant === 'function') grant();
          },
          onClose: function () {
            // если нужно что-то при закрытии — можно дописать
          },
          onError: function (err) {
            console.error('[YSDK rewarded error]', err);
            // на всякий случай тоже выдаём награду, чтобы не было ощущения «кинуло»
            if (typeof grant === 'function') grant();
          }
        }
      });

      return true;
    } catch (err) {
      console.error('[YSDK rewarded error]', err);
      if (typeof grant === 'function') grant();
      return false;
    }
  }


  // Attach functionality after DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Reward button hooking
    document.querySelectorAll('.ad-btn').forEach((btn) => {
      if (btn.__gd_reward_hooked) return;
      btn.__gd_reward_hooked = true;
      btn.addEventListener('click', () => {
        // Debounce multiple clicks
        if (btn.disabled) return;
        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = '...';
        track('rw_btn_click');
        gdShowRewarded(() => {
          grantRewardPoints(1000);
          animateReward(btn, 1000);
          btn.disabled = false;
          btn.textContent = originalLabel;
        });
      });
    });

    // Override start and next buttons to insert ad logic and credit accumulation
    const startBtn = document.getElementById('start-btn');
    if (startBtn && !startBtn.__gd_hooked) {
      startBtn.__gd_hooked = true;
      const origStart = startBtn.onclick;
      startBtn.onclick = () => {
        // Add credits based on the previous round's state if available
        try {
          const { state } = window;
          if (state && state.level && state.len) addCredits(state.level, state.len);
        } catch (_) {}
        checkAndShowAds(() => {
          origStart.call(startBtn);
        });
      };
    }
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn && !nextBtn.__gd_hooked) {
      nextBtn.__gd_hooked = true;
      const origNext = nextBtn.onclick;
      nextBtn.onclick = () => {
        try {
          const { state } = window;
          if (state && state.level && state.len) addCredits(state.level, state.len);
        } catch (_) {}
        checkAndShowAds(() => {
          origNext.call(nextBtn);
        });
      };
    }
    // Home buttons: just accumulate credits on click
    document.querySelectorAll('.home-btn').forEach((btn) => {
      if (btn.__gd_hooked) return;
      btn.__gd_hooked = true;
      btn.addEventListener('click', () => {
        try {
          const { state } = window;
          if (state && state.level && state.len) addCredits(state.level, state.len);
        } catch (_) {}
      });
    });

    // Listen for GD SDK ready to mount banners
    function readyFn() {
      mountBanners();
    }
  });

  // Expose helpers globally for potential debugging or reuse
  window.gdShowInterstitial = gdShowInterstitial;
  window.gdShowRewarded = gdShowRewarded;
  window.checkAndShowAds = checkAndShowAds;
  window.addCredits = addCredits;
})();

// --- Hints re-evaluation on XP changes (non-invasive) ---
(function () {
  // Локальная переоценка доступности подсказок, логика совпадает с core
  function refreshHintsAfterXPChange() {
    try {
      const xp = parseInt(localStorage.getItem('ewg_xp_dom_v1') || '0', 10);
      document.querySelectorAll('#hint-panel .hint-btn').forEach((btn) => {
        const cost = +btn.dataset.cost;
        const used = btn.dataset.used === '1';
        const has  = btn.dataset.has === '1';
        if (btn.dataset.hint === 'rev') {
          // Reveal Letter можно переиспользовать, но только если хватает очков и есть что открывать
          btn.disabled = !has || xp < cost;
        } else {
          // Остальные остаются заблокированы, если уже были использованы
          btn.disabled = used || !has || xp < cost;
        }
      });
    } catch (_) {}
  }

  // Подписываемся на изменения счётчиков очков (они обновляются и в core, и в ads)
  function mountXPObservers() {
    ['total-score-display','total-score-game','win-points'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new MutationObserver(() => refreshHintsAfterXPChange());
      obs.observe(el, { childList: true, subtree: true, characterData: true });
    });
    // Первичная попытка (на случай, если уже открыта панель подсказок)
    refreshHintsAfterXPChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountXPObservers);
  } else {
    mountXPObservers();
  }
})();
