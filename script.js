(() => {
  /*
   * Legacy answer bank removed.
   * All words are now loaded from the external JSON dictionaries (meta.json and words.json).
   * The old WORDS constant and associated theme logic have been dropped as unused code.
   */

    // рядом с объявлениями словарей
let META_MAP = new Map();

  // Per-letter scoring
  const SCORE = { A1:[10,20], A2:[20,30], B1:[50,60], B2:[60,70], C1:[110,120], C2:[120,130] };

  // ---------- State ----------
  // Core game state. Theme has been removed since it is no longer used.
  let state = { level:'A1', len:5, answer:'', row:0, col:0, grid:[], tries:6, mult:6, points:0 };

  // ---------- DOM ----------
  const $ = s => document.querySelector(s);
  const startScreen = $('#start-screen');
  const gameScreen  = $('#game-screen');
  const winScreen   = $('#win-screen');

  const levelSel  = $('#level-select');
  const lengthSel = $('#length-select');
  // theme selection is no longer used (the dropdown has been removed from the markup)
  const themeSel  = null;
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
  const totalScoreGame = document.querySelector('#total-score-game');

  // ---------- Persistence ----------
  const XP_KEY = 'ewg_xp_dom_v1';
  const getXP = () => +(localStorage.getItem(XP_KEY) || 0);
  const setXP = v => localStorage.setItem(XP_KEY, String(v));

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

    // Theme selection has been removed; no additional options are needed

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
  
  function show(elShow){
    [startScreen, gameScreen, winScreen].forEach(el => el.classList.add('hidden'));
    elShow.classList.remove('hidden');
  }

  // Выбор ответа: сперва словари, затем fallback к демо-банку
  /**
   * Choose a random answer from the loaded dictionary.  The function will
   * look up words by CEFR level and length using BY_LEVEL_LEN.  If there are
   * no words for the requested level/length, it falls back to any level with the
   * same length.  If nothing is available, it throws.
   *
   * @param {string} level - CEFR level (A1, A2, B1, B2, C1, C2)
   * @param {number} len   - desired word length
   * @returns {string} selected answer in lowercase
   */
  function chooseAnswer(level,len){
    // primary pool for the chosen level and length
    const dictPool = (BY_LEVEL_LEN[level] && BY_LEVEL_LEN[level][len]) || [];
    if(dictPool.length){
      return dictPool[Math.floor(Math.random()*dictPool.length)].toLowerCase();
    }
    // fallback: search across all levels for the requested length
    let alt = [];
    for(const lv of CEFR_LEVELS){
      const arr = (BY_LEVEL_LEN[lv] && BY_LEVEL_LEN[lv][len]) || [];
      alt = alt.concat(arr);
    }
    if(alt.length){
      return alt[Math.floor(Math.random()*alt.length)].toLowerCase();
    }
    // no words found
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
    if(k==='ENTER') return submit();
    if(k==='⌫'){
      if(state.col>0){
        state.col--;
        state.grid[state.row][state.col] = '';
        $('#r'+state.row+'c'+state.col).textContent = '';
      }
      return;
    }
    if(/^[A-Z]$/.test(k) && state.col < state.len){
      state.grid[state.row][state.col] = k;
      $('#r'+state.row+'c'+state.col).textContent = k;
      state.col++;
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
  hintPanel.innerHTML = '';

  const base = SCORE[state.level][0];
  // если у тебя уже есть META_MAP — подтягиваем тексты из meta:
  const meta = (typeof META_MAP !== 'undefined') ? (META_MAP.get(state.answer) || null) : null;
  const textSyn = meta?.['Synonym'];
  const textAnt = meta?.['Antonym'];

  const HINTS = [
    ['pos','Part of Speech',   1, meta?.['Part Of Speech']],
    ['ex', 'Example Sentence', 2, meta?.['Example sentence']],
    ['ant','Antonym',          3, textAnt],
    ['syn','Synonym',          4, textSyn],
    ['def','Definition',       5, meta?.['Definition']],
    ['scr','Scramble Letters', 6, null], // всегда доступна
  ];

  HINTS.forEach(([type,label,mult,text])=>{
    const cost = base * mult;
    const btn = document.createElement('button');
    btn.className = 'hint-btn';
    btn.dataset.hint = type;
    btn.dataset.cost = String(cost);
    btn.innerHTML = `${label}<span class="cost">(${cost} pts)</span>`;

    const has = (type === 'scr') ? true : (text !== '—');  // ← ключевая строка
    btn.dataset.has = has ? '1' : '0';
    btn.disabled = !has || btn.dataset.used === '1';

    // если нет данных в meta — кнопку блокируем сразу (кроме scramble)
    if (type !== 'scr' && !text) btn.disabled = true;

   btn.onclick = () => {
    if (type === 'scr') {
    // только для Scramble
    const out = '' + shuffleWord(state.answer);
    addHintItem(type, label, out);
    applyScrambleKeyboard(state.answer);   // ← вызов только здесь
    } else {
    // все остальные подсказки
    const out = text || '—';
    addHintItem(type, label, out);
    }

    if (btn.disabled || btn.dataset.used === '1') return;
    // списание очков + вывод
    btn.dataset.used = '1';
    btn.disabled = true;
    refreshHintAffordability && refreshHintAffordability();

  const cur = getXP(), cost = +btn.dataset.cost;
  if (cur < cost) { if (hintOutput) hintOutput.textContent = 'Not in word list'; return; }

  setXP(cur - cost);
  updateTotalPointsViews();

  const out = (type === 'scr')
    ? '' + shuffleWord(state.answer)
    : (text || '—');

  addHintItem && addHintItem(type, label, out); // если используешь список
  btn.dataset.used = '1';       // ← помечаем как купленную
  btn.disabled = true;          // ← и блокируем

  refreshHintAffordability && refreshHintAffordability();
};

    hintPanel.appendChild(btn);
  });

  refreshHintAffordability && refreshHintAffordability();
}

// useHint was part of an earlier hint implementation.  It is now unused and has been removed.

function refreshHintAffordability(){
  const xp = getXP();
  hintPanel.querySelectorAll('.hint-btn').forEach(btn=>{
    const cost = +btn.dataset.cost;
    const used = btn.dataset.used === '1';
    const has  = btn.dataset.has === '1';
    btn.disabled = used || !has || xp < cost;
  });
}

  // ---------- Submit ----------
function submit(){
  const rowArr = state.grid[state.row];
  const filled = rowArr.filter(ch => ch && /^[A-Z]$/.test(ch)).length;
  if (filled < state.len) { alert(`Enter a ${state.len}-letter word.`); return; }

  const guess = rowArr.join('').toLowerCase();
  if (/[^a-z]/.test(guess)) { alert('Use A–Z letters only.'); return; }

  if (typeof isValidGuess === 'function' && !isValidGuess(guess)) {
    alert('Not in word list');
    return; 
  }

  const res = scoreRow(guess);
  paint(guess, res);
  addPoints(res);

  if (guess === state.answer){
    const earned = state.points * state.mult;
    const total  = getXP() + earned;
    setXP(total);
    winMessage.textContent = `You guessed the word "${state.answer.toUpperCase()}"! You earned ${earned} points.`;
    winPoints.textContent  = total;
    show(winScreen);
    return;
  }

  // Переход на следующую строку — только после валидного слова
  state.row++; state.col = 0; state.tries--; state.mult = Math.max(1, state.mult - 1);
  setInfo();

  if (state.tries <= 0){
    alert(`No tries left. The word was "${state.answer.toUpperCase()}"`);
    updateTotalPointsViews();
    show(startScreen);
  }
}


  // ---------- Start / Next ----------
  startBtn.onclick = () => {
    state.level = levelSel.value;
    state.len   = +lengthSel.value;
    try{
      state.answer = chooseAnswer(state.level, state.len);
    }catch(e){
      alert('No words for this selection'); return;
    }
    // reset round
    state.row=0; state.col=0; state.tries=6; state.mult=6; state.points=0;
    buildBoard(state.len);
    resetHintsUI();
    buildHints();
    buildKeyboard();
    hintOutput.textContent = '';
    setInfo();
    show(gameScreen);
  };

  nextBtn.onclick = () => {
    updateTotalPointsViews();
    show(startScreen);
  };
})();
