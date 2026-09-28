(() => {
  // ---------- Small answer bank (demo) ----------
  const WORDS = {
    A1:{General:{3:['sun','cat','bus','sea'],4:['home','book','blue','good'],5:['apple','chair','smile','drink'],6:['orange','little']},
         Travel:{3:['map','bus','taxi'],4:['visa','trip','tour'],5:['hotel','train','beach'],6:['ticket','plane']},
         Business:{5:['money','email'],6:['office','market']},
         Daily:{4:['milk','cook'],5:['bread','water'],6:['laundry']}},
    A2:{General:{5:['music','green','sleep'],6:['animal','street']},Travel:{5:['river','route'],6:['planet','travel']},Business:{5:['sales','order'],6:['budget','report']},Daily:{5:['clean','plant'],6:['dinner','vacuum'].map(s=>s.slice(0,6))}},
    B1:{General:{5:['proud','think','tough'],6:['chance','choice']},Travel:{5:['guide','pilot'],6:['border','luggage']},Business:{5:['quota','merge'],6:['profit','client']},Daily:{5:['habit','garden'],6:['guitar','repair']}},
    B2:{General:{5:['irony','novel'],6:['spirit','memory']},Travel:{5:['cruis','valet']},Business:{6:['equity','retain']},Daily:{5:['recipe','vacuu'],6:['device','vacuum']}},
    C1:{General:{5:['opaqu','metap'],6:['metaphor','nuance']},Travel:{6:['itiner']},Business:{6:['levera','synerg']},Daily:{6:['austere']}},
    C2:{General:{6:['threno','obdura']},Travel:{6:['peregr']},Business:{6:['fiduci']},Daily:{6:['persni']}}
  };

    // рядом с объявлениями словарей
let META_MAP = new Map();

  // Per-letter scoring
  const SCORE = { A1:[10,20], A2:[20,30], B1:[50,60], B2:[60,70], C1:[110,120], C2:[120,130] };

  // ---------- State ----------
  let state = { level:'A1', len:5, theme:'General', answer:'', row:0, col:0, grid:[], tries:6, mult:6, points:0 };

  // Reveal hint configuration and state
  const REVEAL_BASE_COST = { A1:40, A2:80, B1:200, B2:240, C1:440, C2:480 };
  // Indices of letters that have been revealed (locked) in the current round
  let lockedPositions = new Set();
  // Number of times the reveal hint has been used in the current round
  let revealCount = 0;

  // ---------- DOM ----------
  const $ = s => document.querySelector(s);
  const startScreen = $('#start-screen');
  const gameScreen  = $('#game-screen');
  const winScreen   = $('#win-screen');

  const levelSel  = $('#level-select');
  const lengthSel = $('#length-select');
  const themeSel  = $('#theme-select'); // может быть null (Theme удалён)
  const startBtn  = $('#start-btn');
  const totalScoreDisplay = $('#total-score-display');

  const gameSettings = $('#game-settings');
  const scoreDisplay = $('#score-display');
  const boardWrap    = $('#board-container');
  const hintPanel    = $('#hint-panel');
  const hintOutput   = $('#hint-output');
  const kbWrap       = $('#keyboard-container');

  const winMessage = $('#win-message');
  const winPoints  = $('#win-points');
  const nextBtn    = $('#next-btn');
  const homeBtn    = $('#home-btn');
  const totalScoreGame = document.querySelector('#total-score-game');

  // ----- Modal & help DOM elements -----
  const modalOverlay   = $('#modal-overlay');
  const modalTitle     = $('#modal-title');
  const howtoScreen    = $('#howto-screen');
  const alertScreen    = $('#alert-screen');
  const wordScreen     = $('#word-screen');
  const alertMessage   = $('#alert-message');
  const wordContent    = $('#word-content');
  const modalClose     = $('#modal-close');
  const alertPrimary   = $('#alert-primary');
  const alertSecondary = $('#alert-secondary');
  const howtoOkBtn     = $('#howto-ok');
  const wordNextBtn    = $('#word-next');

  // ---------- Persistence ----------
  const XP_KEY = 'ewg_xp_dom_v1';
  const getXP = () => +(localStorage.getItem(XP_KEY) || 0);
  const setXP = v => localStorage.setItem(XP_KEY, String(v));

  // On first load give initial XP of 1000 if not already stored
  (function initXP(){
    if(!localStorage.getItem(XP_KEY)){
      setXP(1000);
    }
  })();

// revealed hints
const revealedHints = new Set();

function resetHintsUI() {
  revealedHints.clear();
  if (hintOutput) hintOutput.innerHTML = ''; // очищаем список подсказок на старт раунда
}

function addHintItem(type, label, text) {
  if (!hintOutput || revealedHints.has(type)) return;
  const row = document.createElement('div');
  row.className = 'hint-row';
  row.dataset.hint = type;
  row.innerHTML = `<strong>${label}:</strong> ${String(text || '—')}`;
  hintOutput.appendChild(row);
  revealedHints.add(type);
}

function shuffleWord(w) {
  const arr = w.toUpperCase().split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const s = arr.join('');
  return (s === w.toUpperCase()) ? shuffleWord(w) : s; // гарантируем, что отличается
}

  function updateTotalPointsViews() {
    const xp = getXP();
    if (totalScoreDisplay) totalScoreDisplay.textContent = `Total Points: ${xp}`;
    if (totalScoreGame)    totalScoreGame.textContent    = `Total Points: ${xp}`;
    if (winPoints)         winPoints.textContent         = xp;
  }

  // ---------- Dictionaries (NEW) ----------
  const CEFR_LEVELS = ['A1','A2','B1','B2','C1','C2'];
  let META=[], WORDS_ALL=[], META_WORDSET=new Set();
  let BY_LEVEL_LEN = {}; // {A1:{3:[...],4:[...]}, ...}

  async function loadDictionaries(){
    try{
      const [mRes, wRes] = await Promise.all([
        fetch('meta.json'), fetch('words.json')
      ]);
      if(!mRes.ok || !wRes.ok) throw new Error('Failed to load dictionaries');

      META = await mRes.json();
      WORDS_ALL = await wRes.json();

      META_WORDSET = new Set(
        META.map(e => (e.Word||'').trim().toLowerCase()).filter(Boolean)
      );

      BY_LEVEL_LEN = {}; CEFR_LEVELS.forEach(l=>BY_LEVEL_LEN[l]={});

      for(const row of WORDS_ALL){
        const w = (row.headword||'').trim().toLowerCase();
        const lvl = row.CEFR;
        if(!w || !lvl) continue;
        if(!META_WORDSET.has(w)) continue; // только слова, у которых есть meta
        const L = w.length;
        if(!BY_LEVEL_LEN[lvl][L]) BY_LEVEL_LEN[lvl][L] = [];
        BY_LEVEL_LEN[lvl][L].push(w);
      }
    }catch(e){
      console.error(e);
    }
    META_MAP.clear();
  for (const e of META) {
  const w = (e.Word || '').trim().toLowerCase();
  if (w) META_MAP.set(w, e);
}
  }

  function populateLengthsForLevel(lvl){
    if(!lengthSel) return;
    const lengths = Object.keys(BY_LEVEL_LEN[lvl] || {}).map(n=>+n).sort((a,b)=>a-b);
    if(!lengths.length) return;
    const prev = +lengthSel.value || 0;
    lengthSel.innerHTML = '';
    lengths.forEach(n=>{
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      lengthSel.appendChild(o);
    });
    if(lengths.includes(prev))       lengthSel.value = String(prev);
    else if(lengths.includes(5))     lengthSel.value = '5';
    else                             lengthSel.value = String(lengths[0]);
  }

  // ---------- Init dropdowns ----------
  (function initMenus(){
    updateTotalPointsViews();

    // Плейсхолдер длины до загрузки словаря
    if (lengthSel && !lengthSel.children.length){
      [3,4,5,6,7,8].forEach(n => {
        const o = document.createElement('option'); o.value = n; o.textContent = n;
        if(n===5) o.selected = true; lengthSel.appendChild(o);
      });
    }

    // Theme больше не трогаем, но если элемент есть — наполним
    if (themeSel && !themeSel.children.length){
      ['General','Travel','Business','Daily'].forEach(t => {
        const o = document.createElement('option'); o.value=t; o.textContent=t;
        themeSel.appendChild(o);
      });
    }

    // Загружаем словари и связываем Level ↔ Length
    loadDictionaries().then(()=>{
      populateLengthsForLevel(levelSel.value);
    });

    levelSel.addEventListener('change', ()=>{
      populateLengthsForLevel(levelSel.value);
    });
  })();

  // ---------- Helpers ----------
function isValidGuess(guess){
  // принимаем любое слово нужной длины, если оно есть в meta.json
  return guess.length === state.len && META_WORDSET.has(guess.toLowerCase());
}

  // ----- Modal helpers -----
 function hideModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.add('hidden');
  howtoScreen?.classList.add('hidden');
  alertScreen?.classList.add('hidden');
  wordScreen?.classList.add('hidden');
}

// Handle clicks outside modal content to close
modalOverlay?.addEventListener('click', (e) => {
  // Close only if clicking the overlay itself, not modal content
  if (e.target === modalOverlay) {
    hideModal();
  }
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Only handle if modal is visible
  if (!modalOverlay?.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      hideModal();
    } else if (e.key === 'Enter') {
      // Find and click the primary action button if present
      const primaryBtn = document.querySelector('#modal-ok, #howto-ok, #alert-primary, #word-next');
      primaryBtn?.click();
    }
  }
});


  /**
   * Show a modal dialog. `type` can be 'howto', 'alert', or 'word'.
   * For 'howto', no options are needed. For 'alert', provide
   *   { title, message, primaryText, onPrimary, secondaryText, onSecondary }.
   * For 'word', provide { word, title, nextText, onNext }.
   */
 function showModal(type, opts = {}) {
  if (!modalOverlay) return;

  // показать оверлей
  modalOverlay.classList.remove('hidden');

  // скрыть все экраны
  howtoScreen?.classList.add('hidden');
  alertScreen?.classList.add('hidden');
  wordScreen?.classList.add('hidden');

  // общий заголовок и текст
  if (modalTitle) modalTitle.textContent = opts.title || '';
  if (alertMessage) alertMessage.textContent = opts.message || '';

  // универсальная кнопка
  const modalOkBtn = document.getElementById('modal-ok');
  if (modalOkBtn) {
    modalOkBtn.textContent = opts.okText || 'Got it!';
    modalOkBtn.onclick = () => {
      hideModal();
      if (typeof opts.onOk === 'function') opts.onOk();
    };
  }

  // показать нужный экран
  switch (type) {
    case 'howto':
      if (modalTitle) modalTitle.textContent = 'How to play';
      howtoScreen?.classList.remove('hidden');
      break;

    case 'alert':
      alertScreen?.classList.remove('hidden');
      break;

    case 'word':
      wordScreen?.classList.remove('hidden');
      if (modalTitle) modalTitle.textContent = 'Word Info';
      buildWordInfo((opts.word || '').toLowerCase());
      break;
  }
}
  // Build word information in word info modal
  function buildWordInfo(word){
    if(!wordContent) return;
    const meta = META_MAP.get(word);
    let html = '';
    html += `<h4 style="margin-top:0;">${word.toUpperCase()}</h4>`;
    if(meta){
      const pos = meta['Part Of Speech'] || meta['Part of speech'] || '—';
      const def = meta['Definition'] || '—';
      const ex  = meta['Example sentence'] || meta['Example Sentence'] || '—';
      const syn = meta['Synonym'] || '—';
      const ant = meta['Antonym'] || '—';
      html += `<p><strong>Part of Speech:</strong> ${pos || '—'}</p>`;
      html += `<p><strong>Definition:</strong> ${def || '—'}</p>`;
      html += `<p><strong>Example:</strong> ${ex || '—'}</p>`;
      html += `<p><strong>Synonym:</strong> ${syn || '—'}</p>`;
      html += `<p><strong>Antonym:</strong> ${ant || '—'}</p>`;
    } else {
      html += `<p>No data available.</p>`;
    }
    wordContent.innerHTML = html;
    // НЕ обязательный вариант
    const p = wordContent.querySelector('p:nth-of-type(3)');
    if (p) p.innerHTML = p.innerHTML.replace(/_{3,}/g, (state.answer || word || '').toLowerCase());
  }

  // Fill any locked positions in the specified row and adjust the cursor
  function fillLockedPositions(row){
    lockedPositions.forEach(idx => {
      const letter = state.answer[idx].toUpperCase();
      state.grid[row][idx] = letter;
      const cell = document.getElementById('r'+row+'c'+idx);
      if(cell) cell.textContent = letter;
    });
    // set col to next free index
    let c = 0;
    while(c < state.len && lockedPositions.has(c)) c++;
    state.col = c;
  }

  // Update the reveal button's cost and disabled state based on current revealCount and locked positions
  function updateRevealButton(){
    const btn = hintPanel ? hintPanel.querySelector('.hint-btn[data-hint="rev"]') : null;
    if(!btn) return;
    const base = REVEAL_BASE_COST[state.level] || 0;
    const cost = base * (revealCount + 1);
    btn.dataset.cost = String(cost);
    const costSpan = btn.querySelector('.cost');
    if(costSpan) costSpan.textContent = `(${cost} pts)`;
    if(lockedPositions.size >= state.len){
      btn.dataset.has = '0';
      btn.disabled = true;
    } else {
      btn.dataset.has = '1';
      // Do not change disabled here; refreshHintAffordability will handle based on XP
    }
  }

  // Reveal a random letter as a hint. Deduct points and update state.
  function revealLetter(){
    const base = REVEAL_BASE_COST[state.level] || 0;
    const cost = base * (revealCount + 1);
    const xp = getXP();
    if(xp < cost) return;
    
    // find unrevealed positions
    const avail = [];
    for(let i=0; i<state.len; i++){
      if(!lockedPositions.has(i)) avail.push(i);
    }
    if(avail.length === 0) return;
    
    // deduct XP and update
    setXP(xp - cost);
    updateTotalPointsViews();
    revealCount++;
    
    // reveal random letter
    const idx = avail[Math.floor(Math.random() * avail.length)];
    lockedPositions.add(idx);
    const letter = state.answer[idx].toUpperCase();
    state.grid[state.row][idx] = letter;
    
    // update cell with correct styling
    const cell = document.getElementById('r'+state.row+'c'+idx);
    if(cell) {
      cell.textContent = letter;
      cell.classList.add('correct'); // Add green highlight
    }
    
    // update keyboard with correct styling
    const key = kbWrap.querySelector(`.key[data-key="${letter}"]`);
    if(key) {
      key.dataset.state = 'correct';
      key.classList.remove('present', 'absent');
      key.classList.add('correct');
    }
    
    // NOTE: Do NOT output revealed letter to hint panel
    // addHintItem('rev', 'Reveal', letter);  <-- removed

    updateRevealButton();
    refreshHintAffordability();
    
    // if all letters revealed, end round
    if(lockedPositions.size >= state.len){
      revealWin();
    }
  }

  // When all letters are revealed, end the round and show win screen
  function revealWin(){
    const total = getXP();
    setXP(total);
    if(winMessage) winMessage.innerHTML = `All letters revealed! The word was <span class="icon-btn">${state.answer.toUpperCase()}</span>`;
    if(winPoints) winPoints.textContent = total;
    show(winScreen);
    // attach click to show word info
    const span = winMessage ? winMessage.querySelector('.icon-btn') : null;
    if(span){
      span.style.cursor = 'pointer';
      span.onclick = () => showModal('word', { word: state.answer, nextText: 'Next', onNext: startSameLevelRound });
    }
  }
  
  function show(elShow){
    [startScreen, gameScreen, winScreen].forEach(el => el.classList.add('hidden'));
    elShow.classList.remove('hidden');
  }

  /**
   * Start a new round using the current level and length. Resets the round state,
   * selects a new answer, rebuilds the board, hints and keyboard, and shows the
   * game screen. Used for the win-screen "Next" button and the word info modal.
   */
  function startSameLevelRound(){
    const level = state.level;
    const len   = state.len;
    try{
      state.answer = chooseAnswer(level, len);
    }catch(e){
      showModal('alert', { title: 'No words', message: 'Try another level or word length.' });
      return;
    }
    // Reset round variables
    state.row = 0;
    state.col = 0;
    state.tries = 6;
    state.mult = 6;
    state.points = 0;
    lockedPositions.clear();
    revealCount = 0;
    // Rebuild UI elements
    buildBoard(len);
    resetHintsUI();
    buildHints();
    buildKeyboard();
    if(hintOutput) hintOutput.textContent = '';
    setInfo();
    // Fill any locked positions (none at start)
    fillLockedPositions(0);
    show(gameScreen);
  }

  // Выбор ответа: сперва словари, затем fallback к демо-банку
  function chooseAnswer(level,len,theme){
    const dictPool = (BY_LEVEL_LEN[level] && BY_LEVEL_LEN[level][len]) || [];
    if(dictPool.length) return dictPool[Math.floor(Math.random()*dictPool.length)].toLowerCase();

    const pool = (WORDS[level] && WORDS[level][theme] && WORDS[level][theme][len]) || [];
    if(pool.length) return pool[Math.floor(Math.random()*pool.length)].toLowerCase();

    // fallback: любое слово нужной длины из всех уровней словаря
    let alt=[]; for(const lv of CEFR_LEVELS) alt = alt.concat((BY_LEVEL_LEN[lv] && BY_LEVEL_LEN[lv][len]) || []);
    if(alt.length) return alt[Math.floor(Math.random()*alt.length)].toLowerCase();

    // последний fallback: любые темы старого банка
    for(const t in (WORDS[level]||{})){
      const arr = WORDS[level][t][len] || [];
      if(arr.length) return arr[Math.floor(Math.random()*arr.length)].toLowerCase();
    }
    throw new Error('No words for this selection');
  }

  function buildBoard(len){
    boardWrap.innerHTML = '';
    state.grid = Array.from({length:6}, ()=>Array.from({length:len}, ()=>''));
    for(let r=0;r<6;r++){
      const row = document.createElement('div'); row.className = 'row';
      for(let c=0;c<len;c++){
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `r${r}c${c}`;
        row.appendChild(cell);
      }
      boardWrap.appendChild(row);
    }
  }

  function applyScrambleKeyboard(answer){
  const S = new Set(answer.toUpperCase().split(''));
  kbWrap.querySelectorAll('.key[data-key]').forEach(btn=>{
    const k = (btn.dataset.key || '').toUpperCase();
    if (k.length !== 1 || k < 'A' || k > 'Z') return; // игнор ENTER/⌫
    const cur = btn.dataset.state || 'unknown';
    let next = cur;

    if (S.has(k)) {
      // unknown -> present; absent/present/correct остаются как есть
      if (cur === '' || cur === 'unknown') next = 'present';
    } else {
      // unknown -> absent; present/correct/absent остаются как есть
      if (cur === '' || cur === 'unknown') next = 'absent';
    }

    if (next !== cur){
      btn.dataset.state = next;
      btn.classList.remove('correct','present','absent');
      if (next !== 'unknown') btn.classList.add(next);
    }
  });
}

  function setInfo(){
  gameSettings.textContent = `${state.level} • ${state.len} letters`;
  scoreDisplay.textContent = `Current Game: ${state.points} points (x${state.mult})`;
  }


  // ---------- Keyboard ----------
  function buildKeyboard(){
    kbWrap.innerHTML = '';
    const rows = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['ENTER','Z','X','C','V','B','N','M','⌫']
    ];
    rows.forEach(chars=>{
      const line = document.createElement('div'); line.className='keyboard-row';
      chars.forEach(ch=>{
        const key = document.createElement('button');
        key.className='key'; key.type='button'; key.dataset.key = ch;
        key.textContent = (ch==='⌫') ? '⌫' : ch;
        if(ch==='ENTER' || ch==='⌫') key.classList.add('meta');
        key.onclick = () => onKey(ch);
        line.appendChild(key);
      });
      kbWrap.appendChild(line);
    });
    document.onkeydown = (e)=>{
      if(gameScreen.classList.contains('hidden')) return;
      if(e.key==='Enter') onKey('ENTER');
      else if(e.key==='Backspace') onKey('⌫');
      else if(/^[a-z]$/i.test(e.key)) onKey(e.key.toUpperCase());
    };
  }

  function onKey(k){
    if(k === 'ENTER') { submit(); return; }
    if(k === '⌫'){
      // remove previous non-locked letter
      let c = state.col;
      while(c > 0){
        c--;
        if(!lockedPositions.has(c)){
          state.grid[state.row][c] = '';
          const cell = document.getElementById('r'+state.row+'c'+c);
          if(cell) cell.textContent = '';
          state.col = c;
          break;
        }
      }
      return;
    }
    if(/^[A-Z]$/.test(k)){
      // find next free column (not locked)
      let c = state.col;
      while(c < state.len && lockedPositions.has(c)) c++;
      if(c < state.len){
        state.grid[state.row][c] = k;
        const cell = document.getElementById('r'+state.row+'c'+c);
        if(cell) cell.textContent = k;
        c++;
        // skip subsequent locked positions
        while(c < state.len && lockedPositions.has(c)) c++;
        state.col = c;
      }
    }
  }

  // ---------- Scoring & painting ----------
  function scoreRow(guess){
    const a = state.answer, len = state.len, res = Array(len).fill('absent'), cnt={};
    for(let i=0;i<len;i++) cnt[a[i]] = (cnt[a[i]]||0)+1;
    for(let i=0;i<len;i++) if(guess[i]===a[i]){ res[i]='correct'; cnt[a[i]]--; }
    for(let i=0;i<len;i++) if(res[i]==='absent' && cnt[guess[i]]>0){ res[i]='present'; cnt[guess[i]]--; }
    return res;
  }

  function paint(guess,res){
    for(let i=0;i<state.len;i++){
      const cell = $('#r'+state.row+'c'+i);
      cell.classList.remove('correct','present','absent');
      cell.classList.add(res[i]);
    }

    const pri = {correct:3, present:2, absent:1};
    [...kbWrap.querySelectorAll('.key')].forEach(k=>{ if(!k.dataset.state) k.dataset.state=''; });
    for(let i=0;i<guess.length;i++){
      const ch = guess[i].toUpperCase();
      const key = kbWrap.querySelector(`.key[data-key="${ch}"]`);
      if(!key) continue;
      const cur = key.dataset.state || '';
      if( (pri[res[i]]||0) > (pri[cur]||0) ){
        key.dataset.state = res[i];
        key.classList.remove('correct','present','absent');
        key.classList.add(res[i]);
      }
    }
  }

  function addPoints(res){
    const [pc,pp] = SCORE[state.level];
    let sum=0;
    for(const s of res){ if(s==='correct') sum+=pp; else if(s==='present') sum+=pc; }
    state.points += sum;
    setInfo();
  }

  // ---------- Hints (без изменений твоей логики) ----------
  function buildHints(){
    if(!hintPanel) return;
    hintPanel.innerHTML = '';
    // Determine meta values for the current answer
    const meta = META_MAP.get(state.answer) || {};
    const pos = meta['Part Of Speech'] || meta['Part of speech'] || null;
    const ex  = meta['Example sentence'] || meta['Example Sentence'] || null;
    const def = meta['Definition'] || null;
    const syn = meta['Synonym'] || null;
    const ant = meta['Antonym'] || null;
    const hasSyn = syn && syn !== '—';
    const hasAnt = ant && ant !== '—';
    // base cost for non-reveal hints (first value of SCORE)
    const base = SCORE[state.level] ? SCORE[state.level][0] : 0;
    // Compose list of hint definitions
    const list = [];
    list.push({type:'pos', label:'Part of Speech', text: pos, cost: base * 1});
    list.push({type:'ex',  label:'Example Sentence', text: ex, cost: base * 2});
   // стало: объединяем в одну кнопку
    if (hasAnt || hasSyn) {
      const both  = hasAnt && hasSyn;
      const label = both ? 'Antonym/Synonym' : (hasAnt ? 'Antonym' : 'Synonym');
      const text  = both ? `${ant} / ${syn}` : (hasAnt ? ant : syn);
      list.push({ type: 'rel', label, text, cost: base * 3 });
    }
    // Reveal letter: include if either synonym or antonym missing
    list.push({type: 'rev', label: 'Reveal Letter', cost: base * 4});
    // Definition always
    list.push({type:'def', label:'Definition', text: def, cost: base * 5});
    // Scramble always
    list.push({type:'scr', label:'Scramble Letters', text: null, cost: base * 6});

    // Build buttons for each hint
    list.forEach(h => {
      const btn = document.createElement('button');
      btn.className = 'hint-btn';
      btn.dataset.hint = h.type;
      btn.dataset.cost = String(h.cost);
      // Determine if hint is available (for pos,ex,def: text exists; for scr/rev: always)
      const has = (h.type === 'scr' || h.type === 'rev') ? true : !!(h.text);
      btn.dataset.has = has ? '1' : '0';
      // Compose inner HTML with label and cost
      btn.innerHTML = `${h.label}<span class="cost">(${h.cost} pts)</span>`;
      // Initially no hint is used except reveal (which can be reused)
      btn.dataset.used = '0';
      // Disabled state: if not available or XP insufficient (handled in refreshHintAffordability)
      btn.disabled = !has;
      // Click handler for hint button
      btn.onclick = () => {
        // If disabled or lacking cost, do nothing
        if(btn.disabled) return;
        const xp = getXP();
        const cost = +btn.dataset.cost;
        // If not enough points, just return (button already disabled by refresh)
        if(xp < cost) return;
        // Handle hint types
        if(h.type === 'scr'){
          // Scramble: shuffle answer but different from original
          const scrambled = shuffleWord(state.answer);

          // NOTE: Do NOT output scramble into hint panel
          // addHintItem('scr', 'Scramble', scrambled);  <-- removed

          applyScrambleKeyboard(state.answer);
          setXP(xp - cost);
          updateTotalPointsViews();
          // Mark as used and disable
          btn.dataset.used = '1';
          btn.disabled = true;
        } else if(h.type === 'rev'){
          // Reveal letter: call revealLetter which handles deduction and state
          revealLetter();
          // After reveal, update cost for next use and refresh affordability
          updateRevealButton();
        } else {
          // Other hints: pos, ex, def, syn, ant
          const outText = h.text || '—';
          addHintItem(h.type, h.label, outText);
          // Deduct cost and disable button
          setXP(xp - cost);
          updateTotalPointsViews();
          btn.dataset.used = '1';
          btn.disabled = true;
        }
        refreshHintAffordability();
      };
      hintPanel.appendChild(btn);
    });
    // After building hints, update reveal button cost and apply disabled states
    updateRevealButton();
    refreshHintAffordability();
  }

function useHint(type, cost, text=''){
  const cur = getXP();
  if (cur < cost) { if (hintOutput) hintOutput.textContent = 'Not enough points.'; return; }
  setXP(cur - cost);
  updateTotalPointsViews();

  // For 'scr' and 'rev' we intentionally do not write any output to the hint panel.
  if (type === 'scr' || type === 'rev') {
    // no visual output
  } else {
    hintOutput.textContent = text || '—';
  }
  refreshHintAffordability();
}

function refreshHintAffordability(){
  const xp = getXP();
  hintPanel.querySelectorAll('.hint-btn').forEach(btn=>{
    const cost = +btn.dataset.cost;
    const used = btn.dataset.used === '1';
    const has  = btn.dataset.has === '1';
    // For reveal letter we do not consider 'used' flag (can reuse)
    if(btn.dataset.hint === 'rev'){
      btn.disabled = !has || xp < cost;
    } else {
      btn.disabled = used || !has || xp < cost;
    }
  });
}

  // ---------- Submit ----------
function submit(){
  const rowArr = state.grid[state.row];
  const filled = rowArr.filter(ch => ch && /^[A-Z]$/.test(ch)).length;
  if (filled < state.len) {
    showModal('alert', {
      title: 'Incomplete guess',
      message: `Enter a ${state.len}-letter word.`
    });
    return;
  }

  const guess = rowArr.join('').toLowerCase();
  if (/[^a-z]/.test(guess)) {
    showModal('alert', {
      title: 'Invalid input',
      message: 'Use A–Z letters only.'
    });
    return;
  }

  if (typeof isValidGuess === 'function' && !isValidGuess(guess)) {
    showModal('alert', {
      title: 'Not in word list',
      message: 'This word is not in the dictionary.'
    });
    return;
  }

  const res = scoreRow(guess);
  paint(guess, res);
  addPoints(res);

  if (guess === state.answer){
    const earned = state.points * state.mult;
    const total  = getXP() + earned;
    setXP(total);
    // Build message with clickable word
    if(winMessage){
      winMessage.innerHTML = `You guessed the word \<span class="icon-btn">${state.answer.toUpperCase()}</span>\ You earned ${earned} points.`;
    }
    if(winPoints) winPoints.textContent  = total;
    show(winScreen);
    // attach click handler to answer word to show info
    const span = winMessage ? winMessage.querySelector('.icon-btn') : null;
    if(span){
      span.style.cursor = 'pointer';
      span.onclick = () => showModal('word', { word: state.answer, nextText: 'Next', onNext: startSameLevelRound });
    }
    return;
  }

  // Переход на следующую строку — только после валидного слова
  state.row++;
  state.col = 0;
  state.tries--;
  state.mult = Math.max(1, state.mult - 1);
  setInfo();
  // Fill locked positions in the new row
  if(state.row < 6){
    fillLockedPositions(state.row);
  }
  if (state.tries <= 0){
    showModal('alert', {
      title: 'No tries left',
      message: `The word was "${state.answer.toUpperCase()}"`,
      onOk: () => {
        updateTotalPointsViews();
        show(startScreen);
      }
    });
  }
}


  // ---------- Start / Next ----------
  startBtn.onclick = () => {
    state.level = levelSel.value;
    state.len   = +lengthSel.value;
    try{
      state.answer = chooseAnswer(state.level, state.len);
    }catch(e){
      showModal('alert', { title: 'No words', message: 'Try another level or word length.' });
      return;
    }
    // reset round
    state.row=0;
    state.col=0;
    state.tries=6;
    state.mult=6;
    state.points=0;
    // reset reveal state
    lockedPositions.clear();
    revealCount = 0;
    buildBoard(state.len);
    resetHintsUI();
    buildHints();
    buildKeyboard();
    hintOutput.textContent = '';
    setInfo();
    // Fill locked positions for first row (in case reveal used previously)
    fillLockedPositions(0);
    show(gameScreen);
  };

  nextBtn.onclick = () => {
    // Start a new round with current settings
    startSameLevelRound();
  };

  // Home button: return to start screen
  document.querySelectorAll('#home-btn, .home-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    updateTotalPointsViews();
    show(startScreen);
  });
});

  // Attach help button listeners (open How to play)
  document.querySelectorAll('.help-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showModal('howto');
    });
  });

  // Ensure the modal "Got it" button hides the overlay
  (function attachModalHandlers(){
    const modalOkBtn = document.getElementById('modal-ok') || $('#modal-ok');
    if(modalOkBtn) modalOkBtn.addEventListener('click', hideModal);
    if(modalClose) modalClose.addEventListener('click', hideModal);
  })();
})();


// UI scale = 1 / DPR
(function setupUiScale(){
  const root = document.documentElement;
  function apply() {
    const dpr = window.devicePixelRatio || 1;
    root.style.setProperty('--ui-scale', String(1 / dpr));
  }
  apply();
  // Пересчитать при изменении окна/экрана
  window.addEventListener('resize', apply);
  // DPR может меняться — слушаем через matchMedia
  try {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener?.('change', apply);
  } catch(e) {}
})();


