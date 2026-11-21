// UI・入力・ゲームループ
(() => {
  const { N, BUILDINGS: B, GOALS, sim, render: R } = KT;
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('ja-JP');
  const canvas = $('#world');
  R.init(canvas);

  // ---------- 画像 ----------
  const EXPR = ['normal', 'happy', 'surprised', 'worried', 'thinking', 'wink'];
  const faces = {};
  EXPR.forEach(e => { const im = new Image(); im.src = `assets/koharu/${e}.png`; faces[e] = im; });
  const CGS = [
    { id: 'cg_title', title: 'ひなた町へようこそ' },
    { id: 'cg_growth', title: 'にぎやかになってきた！' },
    { id: 'cg_festival', title: 'ひなた町 夏祭り' },
    { id: 'cg_evening', title: 'ひなた町の夕暮れ' },
  ];

  // ---------- 状態 ----------
  let S = null, st = null;
  let speed = 1, running = false, tool = null, overlay = false;
  const view = { time: 0, walkers: [], fx: [], preview: null, selected: null, range: null, overlay: false };

  // ---------- サウンド ----------
  let ac = null, soundOn = true;
  try { soundOn = localStorage.getItem('koharu-town-sound') !== 'off'; } catch { }
  function sfx(kind) {
    if (!soundOn) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const notes = { place: [[660, 0, .06], [880, .06, .08]], coin: [[988, 0, .06], [1319, .07, .12]], error: [[220, 0, .12], [196, .1, .14]], level: [[523, 0, .08], [659, .08, .08], [784, .16, .08], [1047, .24, .16]], goal: [[523, 0, .1], [659, .1, .1], [784, .2, .1], [1047, .3, .3]], blip: [[740, 0, .03]], remove: [[400, 0, .06], [300, .05, .08]] }[kind];
      const t0 = ac.currentTime;
      for (const [f, d, len] of notes) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = kind === 'error' ? 'square' : 'triangle'; o.frequency.value = f;
        const vol = kind === 'blip' ? .025 : kind === 'error' ? .04 : .08;
        g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(vol, t0 + d + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + d + len);
        o.connect(g).connect(ac.destination); o.start(t0 + d); o.stop(t0 + d + len + .02);
      }
    } catch { }
  }

  // ---------- トースト ----------
  let toastTimer;
  function toast(text, bad) {
    const el = $('#toast'); el.textContent = text; el.classList.toggle('bad', !!bad); el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---------- こはるの会話 ----------
  const talk = { queue: [], line: null, shown: 0, acc: 0, minimized: false };
  function say(lines, low) {
    if (low && (talk.queue.length || (talk.line && talk.shown < talk.line[1].length))) return;
    talk.queue.push(...lines);
    if (!talk.line || talk.shown >= talk.line[1].length) nextLine();
    updateBadge();
  }
  function nextLine() {
    const l = talk.queue.shift();
    if (!l) { $('#talkNext').hidden = true; updateBadge(); return; }
    talk.line = l; talk.shown = 0; talk.acc = 0;
    setFace(l[0]);
    $('#talkNext').hidden = true;
    updateBadge();
  }
  function setFace(e) {
    const img = $('#talkFace');
    const src = faces[e] ? faces[e].src : faces.normal.src;
    if (img.src !== src) { img.src = src; img.classList.remove('pop'); void img.offsetWidth; img.classList.add('pop'); }
  }
  function tickTalk(dt) {
    if (!talk.line) return;
    const full = talk.line[1];
    // 読み終わってしばらくしたら自動で次へ
    if (talk.shown >= full.length && talk.queue.length && $('#cgOverlay').hidden) {
      talk.wait = (talk.wait || 0) + dt;
      if (talk.wait > Math.max(3.2, full.length * 0.075)) { talk.wait = 0; nextLine(); }
      return;
    }
    talk.wait = 0;
    if (talk.shown < full.length) {
      talk.acc += dt * 38;
      const n = Math.floor(talk.acc);
      if (n > 0) { talk.acc -= n; const before = talk.shown; talk.shown = Math.min(full.length, talk.shown + n); if (Math.floor(before / 4) !== Math.floor(talk.shown / 4) && !talk.minimized) sfx('blip'); }
      $('#talkText').textContent = full.slice(0, talk.shown);
      if (talk.shown >= full.length) $('#talkNext').hidden = !talk.queue.length;
    }
  }
  function advanceTalk() {
    if (talk.line && talk.shown < talk.line[1].length) { talk.shown = talk.line[1].length; $('#talkText').textContent = talk.line[1]; $('#talkNext').hidden = !talk.queue.length; return; }
    if (talk.queue.length) nextLine();
  }
  function updateBadge() { $('.face-wrap').dataset.badge = talk.minimized && talk.queue.length ? String(talk.queue.length) : ''; }
  $('#talkBox').addEventListener('click', e => { if (e.target.closest('button')) return; advanceTalk(); });
  $('#talkHide').addEventListener('click', () => { talk.minimized = true; $('#talk').classList.add('min'); updateBadge(); });
  $('.face-wrap').addEventListener('click', () => {
    if (talk.minimized) { talk.minimized = false; $('#talk').classList.remove('min'); updateBadge(); }
    else advanceTalk();
  });

  // ---------- パレット ----------
  const toolEls = {};
  function buildPalette() {
    const pal = $('#palette'); pal.innerHTML = '';
    for (const type of KT.PALETTE) {
      const def = B[type];
      const btn = document.createElement('button');
      btn.className = 'tool'; btn.dataset.type = type;
      btn.title = `${def.name}：${def.desc}`;
      const cv = document.createElement('canvas');
      R.drawBuildingIcon(type, cv);
      btn.append(cv);
      btn.insertAdjacentHTML('beforeend', `<b>${def.name}</b><small>${type === 'bulldoze' ? '無料' : '¥' + fmt(def.cost)}</small>`);
      btn.addEventListener('click', () => selectTool(tool === type ? null : type));
      pal.append(btn); toolEls[type] = btn;
    }
    refreshPalette();
  }
  function refreshPalette() {
    for (const [type, el] of Object.entries(toolEls)) {
      const locked = !S.unlocked.includes(type);
      el.classList.toggle('locked', locked);
      el.classList.toggle('on', tool === type);
      el.classList.toggle('poor', !locked && B[type].cost > S.money);
      el.classList.toggle('new', !!(S.flags.newTools && S.flags.newTools.includes(type)));
    }
  }
  function selectTool(type) {
    if (type && !S.unlocked.includes(type)) { toast('まだ建てられません。目標を進めるとふえていきます', true); sfx('error'); return; }
    tool = type;
    if (type && S.flags.newTools) S.flags.newTools = S.flags.newTools.filter(t => t !== type);
    view.selected = null; $('#infoCard').hidden = true;
    canvas.style.cursor = type ? 'crosshair' : 'grab';
    refreshPalette();
    if (type) toast(`${B[type].name}：${B[type].desc}`);
  }

  // ---------- 入力 ----------
  const pointers = new Map();
  let drag = null, pinch = null, hover = null;
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function linePath(a, b) {
    const out = [];
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    const xFirst = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    let x = a.x, y = a.y; out.push({ x, y });
    if (xFirst) { while (x !== b.x) { x += dx; out.push({ x, y }); } while (y !== b.y) { y += dy; out.push({ x, y }); } }
    else { while (y !== b.y) { y += dy; out.push({ x, y }); } while (x !== b.x) { x += dx; out.push({ x, y }); } }
    return out;
  }
  function makePreview(tiles) {
    let money = S.money;
    const res = tiles.map(p => {
      const c = sim.canPlace({ ...S, money }, tool, p.x, p.y);
      if (c.ok) money -= c.cost;
      return { x: p.x, y: p.y, ok: c.ok || (tool === 'road' && S.tiles[sim.idx(p.x, p.y)].b === 'road') };
    });
    const total = S.money - money;
    const one = tiles.length === 1 ? tiles[0] : null;
    return { tiles: res, ghost: one && tool !== 'road' && tool !== 'bulldoze' && res[0].ok ? { ...one, type: tool } : null, total };
  }
  function updateHover(p) {
    hover = p;
    view.range = null;
    if (!tool || !p) { view.preview = null; return; }
    if (drag && drag.paint) view.preview = makePreview(linePath(drag.start, p));
    else view.preview = makePreview([p]);
    const def = B[tool];
    if (def.service) view.range = { x: p.x, y: p.y, r: def.radius };
    else if (def.infl) view.range = { x: p.x, y: p.y, r: def.infl.r };
  }

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (!running) return;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null; view.preview = null; return;
    }
    const tile = R.pick(p.x, p.y);
    const panBtn = e.button === 1 || e.button === 2;
    drag = { sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, pan: panBtn || !tool, start: tile, paint: !panBtn && (tool === 'road' || tool === 'bulldoze') && !!tile };
    if (drag.paint) updateHover(tile);
    if (drag.pan) canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    const p = pos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      R.zoomAt(d / pinch.d, cx, cy);
      R.cam.x += cx - pinch.cx; R.cam.y += cy - pinch.cy;
      pinch = { d, cx, cy };
      return;
    }
    if (drag) {
      if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moved = true;
      if (drag.pan || (drag.moved && !drag.paint && tool)) {
        drag.pan = true;
        R.cam.x += p.x - drag.lx; R.cam.y += p.y - drag.ly;
        canvas.style.cursor = 'grabbing';
      }
      drag.lx = p.x; drag.ly = p.y;
    }
    const tile = R.pick(p.x, p.y);
    if (!drag || drag.paint || !drag.pan) updateHover(tile && running ? tile : null);
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    if (!drag) return;
    const d = drag; drag = null;
    canvas.style.cursor = tool ? 'crosshair' : 'grab';
    const p = pos(e), tile = R.pick(p.x, p.y);
    if (e.type === 'pointercancel') { view.preview = null; return; }
    if (d.paint && d.start) {
      const path = linePath(d.start, tile || hover || d.start);
      buildMany(path);
    } else if (!d.moved) {
      if (tool && tile && e.button === 0) buildMany([tile]);
      else if (!tool && tile) inspect(tile);
      else if (tool && e.button === 2) selectTool(null);
    }
    updateHover(tile);
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { if (!drag) { hover = null; view.preview = null; view.range = null; } });
  canvas.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); R.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y); }, { passive: false });

  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (!$('#cgOverlay').hidden && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { closeCG(); e.preventDefault(); return; }
    if (!$('#menuOverlay').hidden && e.key === 'Escape') { closeMenu(); return; }
    if (!running) return;
    keys.add(e.key.toLowerCase());
    if (e.key === 'Escape') { selectTool(null); view.selected = null; $('#infoCard').hidden = true; }
    else if (e.key === 'p' || e.key === 'P' || e.code === 'Space') { setSpeed(speed ? 0 : (S.flags.lastSpeed || 1)); e.preventDefault(); }
    else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(2); else if (e.key === '3') setSpeed(4);
    else if (e.key === 'm' || e.key === 'M') toggleOverlay();
    else if (e.key === 'Enter') advanceTalk();
    else if (e.key === 'b' || e.key === 'B') selectTool('bulldoze');
    else if (e.key === 'r' || e.key === 'R') selectTool('road');
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // ---------- 建設 ----------
  function buildMany(tiles) {
    let built = 0, spent = 0, lastFail = null;
    for (const p of tiles) {
      if (tool === 'road' && S.tiles[sim.idx(p.x, p.y)].b === 'road') continue;
      const r = sim.place(S, tool, p.x, p.y);
      if (r.ok) { built++; spent += r.cost; }
      else lastFail = r;
    }
    if (spent) { const e = tiles[tiles.length - 1]; view.fx.push({ kind: 'text', x: e.x, y: e.y, text: `-¥${fmt(spent)}`, color: '#c0675a', age: 0, life: 1.2 }); }
    if (built) {
      sfx(tool === 'bulldoze' ? 'remove' : 'place');
      if (tool !== 'road' && tool !== 'bulldoze') {
        view.fx.push({ kind: 'spark', x: tiles[0].x, y: tiles[0].y, age: 0, life: .8 });
        const first = !(S.flags.built || []).includes(tool);
        S.flags.built = [...new Set([...(S.flags.built || []), tool])];
        const lines = KT.BUILD_LINES[tool];
        if (lines && (first || Math.random() < .25)) say([[first ? 'happy' : 'normal', lines[Math.floor(Math.random() * lines.length)]]], !first);
        const t = tiles[0];
        sim.recompute(S);
        if (!sim.D.active[sim.idx(t.x, t.y)] && tool !== 'flower' && tool !== 'park') toast('道路に面していないので、まだ使えません（赤い「！」）', true);
      }
      afterChange();
    } else if (lastFail) { toast(lastFail.why, true); sfx('error'); }
  }
  function afterChange() {
    st = sim.summarize(S);
    respawnRoadList();
    checkGoals();
    refreshPalette();
    updateHUD(true);
    if (view.selected) inspect(view.selected);
  }

  // ---------- 情報パネル ----------
  function inspect(p) {
    view.selected = p;
    const t = S.tiles[sim.idx(p.x, p.y)], i = sim.idx(p.x, p.y), D = sim.D;
    const card = $('#infoCard'); card.hidden = false;
    const des = D.des[i];
    const desLabel = des >= 20 ? 'とても快適' : des >= 8 ? '快適' : des > -3 ? 'ふつう' : 'にぎやか（騒がしい）';
    let html = '', title = '', kind = '';
    const row = (a, b) => `<div class="info-row"><span>${a}</span><b>${b}</b></div>`;
    if (!t.b) {
      kind = 'LAND'; title = t.g === 2 ? '川' : t.g === 1 ? '林' : '空き地';
      html += row('快適さ', `${desLabel}（${des.toFixed(0)}）`);
      html += row('教育 / 医療', `${D.edu[i] ? '○' : '－'} / ${D.health[i] ? '○' : '－'}`);
      if (t.g === 1) html += `<div class="info-note">木を切って建てると +¥20 かかります。</div>`;
      if (t.g === 2) html += `<div class="info-note">道路を置くと橋になります（¥100）。</div>`;
    } else {
      const def = B[t.b];
      kind = def.cat.toUpperCase(); title = def.icon + ' ' + def.name;
      if (t.b === 'road') {
        html += row('つながり', D.connected[i] ? '町の入口とつながっています' : 'つながっていません');
      } else {
        const active = D.active[i];
        if (t.b === 'house') {
          const cap = B.house.cap[t.lv - 1];
          title = `🏠 ${['おうち', '二階建てのおうち', 'マンション'][t.lv - 1]}`;
          html += row('住民', `${t.occ} / ${cap} 人`);
          html += row('レベル', '★'.repeat(t.lv) + '☆'.repeat(3 - t.lv));
          html += row('快適さ', `${desLabel}（${des.toFixed(0)}）`);
          html += row('教育 / 医療', `${D.edu[i] ? '○' : '－'} / ${D.health[i] ? '○' : '－'}`);
          if (t.lv < 3) {
            const need = [];
            if (t.occ < cap) need.push('満員になる');
            if (t.lv === 1 && des < 6) need.push('快適さ 6 以上');
            if (t.lv === 2 && des < 16) need.push('快適さ 16 以上');
            if (!nearShop(p.x, p.y)) need.push('6マス以内にお店');
            if (t.lv === 2 && !D.edu[i]) need.push('学校の範囲内');
            if (t.lv === 2 && st.residents < 60) need.push('町の住民60人以上');
            html += `<div class="info-note ${need.length ? '' : 'good'}">${need.length ? 'レベルアップには：' + need.join('・') : 'もうすぐレベルアップしそう！'}</div>`;
          }
        } else {
          if (def.jobs) html += row('働く人', `${Math.round(def.jobs * (st.fill || 0))} / ${def.jobs} 人`);
          if (def.shopCap) html += row('お客さんの受け入れ', `${def.shopCap} 人/日`);
          if (def.service) html += row('サービス範囲', `${def.radius} マス`);
          if (def.infl) html += row('まわりの快適さ', `${def.infl.v > 0 ? '+' : ''}${def.infl.v}（${def.infl.r}マス）`);
          html += row('維持費', `¥${def.upkeep}/日`);
        }
        if (!active && t.b !== 'flower' && t.b !== 'park') html += `<div class="info-note bad">道路に面していません。となりに町とつながった道路を引こう。</div>`;
      }
    }
    $('#infoKind').textContent = kind; $('#infoTitle').textContent = title; $('#infoBody').innerHTML = html;
  }
  function nearShop(x, y) {
    for (let yy = y - 6; yy <= y + 6; yy++) for (let xx = x - 6; xx <= x + 6; xx++) {
      if (!sim.inb(xx, yy)) continue; const i = sim.idx(xx, yy), b = S.tiles[i].b;
      if ((b === 'konbini' || b === 'shop' || b === 'cafe') && sim.D.active[i]) return true;
    }
    return false;
  }
  $('#infoClose').addEventListener('click', () => { $('#infoCard').hidden = true; view.selected = null; });

  // ---------- HUD ----------
  let lastMoney = null;
  function updateHUD(force) {
    if (!st) st = sim.summarize(S);
    $('#townName').textContent = S.townName;
    $('#dateLabel').textContent = KT.dateLabel(S) + (S.weather === 'rain' ? ' ☂' : ' ☀');
    $('#money').textContent = fmt(S.money);
    const md = $('#moneyDelta'); md.textContent = `${S.lastNet >= 0 ? '+' : ''}${fmt(S.lastNet)}/日`; md.className = S.lastNet > 0 ? 'up' : S.lastNet < 0 ? 'down' : '';
    if (lastMoney !== null && Math.round(S.money) !== lastMoney && force) { const c = $('.chip.money'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
    lastMoney = Math.round(S.money);
    $('#pop').textContent = fmt(st.residents);
    $('#happy').textContent = Math.round(S.happy);
    $('#jobs').textContent = `${st.employed}/${st.jobsTotal}`;
    const dm = sim.demand(S, st);
    [['#rciR', dm.R], ['#rciC', dm.C], ['#rciW', dm.W]].forEach(([id, v]) => { const el = $(id); el.style.height = `${Math.abs(v) * 50}%`; el.classList.toggle('neg', v < 0); el.style.opacity = v < 0 ? .45 : 1; });
    document.querySelectorAll('.hud-speed button').forEach(b => b.classList.toggle('on', Number(b.dataset.speed) === speed));
    updateGoalUI();
    refreshPalette();
  }
  function setSpeed(v) { speed = v; if (v) S.flags.lastSpeed = v; updateHUD(); }
  document.querySelectorAll('.hud-speed button').forEach(b => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
  function toggleOverlay() { view.overlay = !view.overlay; $('#btnOverlay').classList.toggle('on', view.overlay); if (view.overlay) toast('快適さマップ：緑は快適、赤はにぎやか（騒がしい）'); }
  $('#btnOverlay').addEventListener('click', toggleOverlay);
  $('#btnSound').addEventListener('click', () => { soundOn = !soundOn; $('#btnSound').textContent = soundOn ? '🔊' : '🔈'; try { localStorage.setItem('koharu-town-sound', soundOn ? 'on' : 'off'); } catch { } if (soundOn) sfx('coin'); });
  $('#btnSound').textContent = soundOn ? '🔊' : '🔈';

  // ---------- 目標 ----------
  function goalStatus() {
    const g = GOALS[S.goal]; if (!g) return null;
    const r = g.check(st);
    return { g, r, done: r.ok !== undefined ? r.ok : r.cur >= r.max };
  }
  function updateGoalUI() {
    const gs = goalStatus();
    $('#goalMax').textContent = GOALS.length;
    if (!gs) {
      $('#goalNum').textContent = GOALS.length; $('#goalTitle').textContent = '自由に町を育てよう';
      $('#goalDesc').textContent = 'すべての目標を達成しました！ ひなた町をもっと大きく、すてきに。'; $('#goalReward').textContent = '★ CLEAR';
      $('#goalBar').style.width = '100%'; $('#goalProg').textContent = `住民 ${fmt(st.residents)} 人`;
      return;
    }
    const { g, r } = gs;
    $('#goalNum').textContent = S.goal + 1; $('#goalTitle').textContent = g.title; $('#goalDesc').textContent = g.desc;
    $('#goalReward').textContent = '¥' + fmt(g.reward);
    $('#goalBar').style.width = `${Math.min(100, r.cur / r.max * 100)}%`;
    $('#goalProg').textContent = `${fmt(Math.min(r.cur, r.max))} / ${fmt(r.max)}` + (S.goal === GOALS.length - 1 ? `・まんぞく度 ${Math.round(S.happy)}/70%` : '');
  }
  function showGoalIntro() {
    const g = GOALS[S.goal];
    if (g && S.goalShown < S.goal) { S.goalShown = S.goal; say(g.intro.map(l => [l[0], l[1], 'g' + S.goal])); }
  }
  function checkGoals() {
    st = sim.summarize(S);
    let guard = 0;
    while (guard++ < 3) {
      const gs = goalStatus();
      if (!gs || !gs.done) break;
      const { g } = gs;
      S.money += g.reward;
      // 達成済みの目標の説明は飛ばす（最初の目標のあいさつは残す）
      if (S.goal > 0) talk.queue = talk.queue.filter(l => l[2] !== 'g' + S.goal);
      say(g.done);
      if (g.unlock) {
        S.unlocked = [...new Set([...S.unlocked, ...g.unlock])];
        S.flags.newTools = [...new Set([...(S.flags.newTools || []), ...g.unlock])];
        toast(`目標達成！ +¥${fmt(g.reward)}・${g.unlock.map(u => B[u].name).join('・')}が建てられるように！`);
      } else toast(`目標達成！ ごほうび +¥${fmt(g.reward)}`);
      sfx('goal');
      const card = $('#goalCard'); card.classList.remove('done'); void card.offsetWidth; card.classList.add('done');
      S.goal++;
      if (g.cg) showCG(g.cg, g.cgTitle, g.cgText);
      showGoalIntro();
      save();
    }
    updateGoalUI();
  }

  // ---------- CG ----------
  let speedBeforeCG = 1;
  function showCG(id, title, text) {
    S.flags[id] = true;
    $('#cgImg').src = `assets/cg/${id}.jpg`; $('#cgTitle').textContent = title; $('#cgText').textContent = text || '';
    $('#cgOverlay').hidden = false;
    if (running) { speedBeforeCG = speed; speed = 0; }
    sfx('level');
  }
  function closeCG() { $('#cgOverlay').hidden = true; if (running && $('#menuOverlay').hidden) { speed = speedBeforeCG; updateHUD(); } }
  $('#cgOverlay').addEventListener('click', closeCG);

  // ---------- 歩く人 ----------
  let roadList = [];
  function respawnRoadList() {
    if (sim.D.dirty) sim.recompute(S);
    roadList = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (sim.D.connected[sim.idx(x, y)]) roadList.push({ x, y });
    view.walkers = view.walkers.filter(w => sim.D.connected[sim.idx(w.tx, w.ty)] && sim.D.connected[sim.idx(Math.round(w.x), Math.round(w.y))]);
  }
  const CLOTH = ['#e88fa3', '#7fb2d9', '#f0c060', '#8dc48f', '#b49ad6', '#f29b72', '#ffffff', '#6f8fb0'];
  const HAIR = ['#4a3b33', '#2f2a28', '#8a6248', '#c9c3c6', '#d9a45b'];
  function updateWalkers(dt) {
    if (!st) return;
    const want = roadList.length > 3 ? Math.min(80, Math.floor(st.residents / 4) + (st.tourists > 0 ? 8 : 0)) : 0;
    while (view.walkers.length < want) {
      const r = roadList[Math.floor(Math.random() * roadList.length)];
      view.walkers.push({ x: r.x, y: r.y, tx: r.x, ty: r.y, px: r.x, py: r.y, lane: (Math.random() - .5) * 1.4, phase: Math.random() * 6, color: CLOTH[Math.floor(Math.random() * CLOTH.length)], hair: HAIR[Math.floor(Math.random() * HAIR.length)], sp: .7 + Math.random() * .5 });
    }
    if (view.walkers.length > want) view.walkers.length = want;
    const mult = speed ? Math.min(2.2, .8 + speed * .35) : 0;
    for (const w of view.walkers) {
      const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      const step = w.sp * dt * mult;
      if (d <= step) {
        w.x = w.tx; w.y = w.ty;
        const opts = sim.NB4.map(([ax, ay]) => ({ x: w.tx + ax, y: w.ty + ay })).filter(p => sim.inb(p.x, p.y) && sim.D.connected[sim.idx(p.x, p.y)]);
        const fwd = opts.filter(p => p.x !== w.px || p.y !== w.py);
        const pick = (fwd.length ? fwd : opts)[Math.floor(Math.random() * (fwd.length || opts.length || 1))];
        w.px = w.tx; w.py = w.ty;
        if (pick) { w.tx = pick.x; w.ty = pick.y; }
      } else { w.x += dx / d * step; w.y += dy / d * step; w.phase += step * 18; }
    }
  }

  // ---------- 1日の処理 ----------
  function onDay() {
    const events = [];
    st = sim.simDay(S, events);
    for (const ev of events) {
      if (ev.type === 'levelup') {
        view.fx.push({ kind: 'spark', x: ev.x, y: ev.y, age: 0, life: 1.2 });
        view.fx.push({ kind: 'text', x: ev.x, y: ev.y, text: 'LEVEL UP!', color: '#d0779a', age: 0, life: 1.6 });
        sfx('level');
        const key = 'lv' + ev.lv;
        if (!S.flags[key]) { S.flags[key] = true; say([[ev.lv === 3 ? 'surprised' : 'happy', ev.lv === 2 ? 'おうちが二階建てになりました！ 快適でお店が近いと、おうちは育つんです。' : 'マンションに育ちました！ たくさんの人が暮らせますね。']]); }
      } else if (ev.type === 'weather' && ev.w === 'rain') { say([['thinking', '雨が降ってきましたね……。こんな日はカフェが混みそうです。']], true); }
      else if (ev.type === 'festival') { toast(`🏮 お祭り開催！ +¥${fmt(ev.bonus)}`); sfx('coin'); say([['wink', 'お祭りの日です！ 観光客さんもいっぱい来てますよ♪']], true); }
      else if (ev.type === 'tourist') { toast(`🚌 観光バスが来ました！ +¥${fmt(ev.bonus)}`); sfx('coin'); }
    }
    if (S.money < 0 && !S.flags.warnedDebt) { S.flags.warnedDebt = true; say([['worried', 'た、たいへんです！ 予算がマイナスになっちゃいました……。お店や工房で収入を増やすか、維持費を見直しましょう。']]); }
    if (S.money > 500) S.flags.warnedDebt = false;
    if (st.inactive > 0 && S.day - (S.flags.warnInactiveDay || 0) > 12) { S.flags.warnInactiveDay = S.day; say([['worried', `道路につながっていない建物が ${st.inactive} 件あります。赤い「！」のとなりに道路を引いてあげてください。`]], true); }
    checkGoals();
    respawnRoadList();
    updateHUD(true);
    if (view.selected && !$('#infoCard').hidden) inspect(view.selected);
    if (S.day % 5 === 0) save();
  }

  // ---------- アドバイス ----------
  $('#btnAdvice').addEventListener('click', e => {
    e.stopPropagation();
    st = sim.summarize(S);
    const dm = sim.demand(S, st);
    const tips = [];
    if (st.inactive > 0) tips.push(['worried', `道路につながっていない建物が ${st.inactive} 件あります。赤い「！」の建物のとなりに、町の入口とつながった道路を引きましょう。`]);
    if (S.money < 400 && S.lastNet <= 0) tips.push(['worried', 'お金がピンチです……。いったん時間を進めて貯めるか、使っていない道路や施設をこわして維持費を減らしましょう。']);
    if (st.workers - st.jobsTotal > 6) tips.push(['thinking', `働きたい人が ${st.workers - st.jobsTotal} 人ほど余っています。畑や工房を建てて、仕事をつくりましょう。`]);
    if (dm.C > .25 && st.residents > 12) tips.push(['thinking', 'お買い物する場所が足りないみたいです。コンビニや商店を増やすと、まんぞく度も収入も上がりますよ。']);
    if (st.residents >= 45 && st.eduShare < .8 && S.unlocked.includes('school')) tips.push(['thinking', '学校の範囲に入っていないおうちがあります。教育が届かないと、まんぞく度が下がっちゃいます。']);
    if (st.residents >= 90 && st.healthShare < .8 && S.unlocked.includes('clinic')) tips.push(['thinking', '診療所の範囲外のおうちが多いです。住民100人を超えると医療も大事になりますよ。']);
    if (dm.R < 0 && st.jobsTotal < st.workers) tips.push(['normal', '新しい住民さんは、仕事がある町に来たがります。右上の「工」のバーが高いときは仕事不足のサインです。']);
    if (st.jobsTotal - st.workers > 12) tips.push(['normal', '仕事が余っていますね。おうちを増やすと、働き手が来てくれます。']);
    if (S.happy < 50 && st.residents > 10) tips.push(['worried', 'まんぞく度が低めです……。公園や花だん、カフェをおうちの近くに置いてみましょう。工房はおうちから少しはなして。']);
    if (!tips.length) tips.push(...[
      ['wink', '「🗺」の快適さマップで、緑の濃いところにおうちを建てると育ちやすいですよ。'],
      ['normal', 'おうちは「満員」「快適」「お店が近い」がそろうと二階建てに育ちます。'],
      ['thinking', '川の近くや林のそばは、ちょっとだけ快適さが上がるんです。自然って大事ですね。'],
      ['happy', 'いい感じに育ってます！ この調子でいきましょう♪'],
      ['normal', 'ドラッグで道路をまとめて引けます。Rキーで道路、Bキーでこわすツールです。'],
    ].sort(() => Math.random() - .5).slice(0, 1));
    talk.queue = [];
    say([tips[0]]);
    if (talk.minimized) { talk.minimized = false; $('#talk').classList.remove('min'); }
  });

  // ---------- メニュー・レポート ----------
  let speedBeforeMenu = 1;
  function openMenu() {
    st = sim.summarize(S);
    speedBeforeMenu = speed; speed = 0; updateHUD();
    $('#reportTitle').textContent = `${S.townName}のレポート・${KT.dateLabel(S)}`;
    const lv = [0, 0, 0]; S.tiles.forEach(t => { if (t.b === 'house') lv[t.lv - 1]++; });
    const cells = [
      ['住民', `${fmt(st.residents)} 人`], ['まんぞく度', `${Math.round(S.happy)} %`], ['予算', `¥${fmt(S.money)}`],
      ['収入 / 日', `¥${fmt(S.lastIncome)}`], ['維持費 / 日', `¥${fmt(S.lastUpkeep)}`], ['仕事', `${st.employed} / ${st.jobsTotal}`],
      ['おうち（★/★★/★★★）', `${lv[0]} / ${lv[1]} / ${lv[2]}`], ['教育の範囲', `${Math.round(st.eduShare * 100)} %`], ['医療の範囲', `${Math.round(st.healthShare * 100)} %`],
    ];
    $('#reportGrid').innerHTML = cells.map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('');
    drawChart();
    $('#gallery').hidden = true;
    $('#menuOverlay').hidden = false;
  }
  function closeMenu() { $('#menuOverlay').hidden = true; speed = speedBeforeMenu; updateHUD(); }
  function drawChart() {
    const c = $('#reportChart'), x = c.getContext('2d'), w = c.width, h = c.height;
    x.clearRect(0, 0, w, h);
    const hs = S.history;
    x.font = '12px sans-serif'; x.fillStyle = '#999';
    if (hs.length < 2) { x.fillText('日にちを進めると、グラフが表示されます', 16, h / 2); return; }
    const maxP = Math.max(10, ...hs.map(p => p.pop));
    const line = (key, max, col) => { x.strokeStyle = col; x.lineWidth = 2.5; x.beginPath(); hs.forEach((p, i) => { const px = 12 + i / (hs.length - 1) * (w - 24), py = h - 18 - p[key] / max * (h - 40); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); };
    line('happy', 100, '#e28a9e'); line('pop', maxP, '#6f9a73');
    x.fillStyle = '#6f9a73'; x.fillText(`● 住民（最大 ${fmt(maxP)}）`, 14, 16); x.fillStyle = '#e28a9e'; x.fillText('● まんぞく度', 170, 16);
  }
  $('#btnMenu').addEventListener('click', openMenu);
  $('#menuClose').addEventListener('click', closeMenu);
  $('#menuOverlay').addEventListener('click', e => { if (e.target.id === 'menuOverlay') closeMenu(); });
  $('#btnSave').addEventListener('click', () => { save(); toast('セーブしました'); sfx('coin'); });
  $('#btnGallery').addEventListener('click', () => {
    const g = $('#gallery'); g.hidden = !g.hidden;
    g.innerHTML = CGS.map(c => (c.id === 'cg_title' || S.flags[c.id]) ? `<figure data-id="${c.id}" title="${c.title}"><img src="assets/cg/${c.id}.jpg" alt="${c.title}"></figure>` : `<figure class="lock">？？？</figure>`).join('');
    g.querySelectorAll('figure[data-id]').forEach(f => f.addEventListener('click', () => { const c = CGS.find(c => c.id === f.dataset.id); $('#menuOverlay').hidden = true; showCG(c.id, c.title, ''); speedBeforeCG = speedBeforeMenu; }));
  });
  $('#btnTitle').addEventListener('click', () => { save(); $('#menuOverlay').hidden = true; running = false; showTitle(); });

  // ---------- セーブ ----------
  function save() {
    if (!S) return;
    try { localStorage.setItem(KT.SAVE_KEY, JSON.stringify(S)); } catch { }
  }
  function load() {
    try {
      const raw = localStorage.getItem(KT.SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!Array.isArray(d.tiles) || d.tiles.length !== N * N) return null;
      const base = sim.newState();
      return Object.assign(base, d, { flags: d.flags || {}, history: d.history || [] });
    } catch { return null; }
  }
  window.addEventListener('beforeunload', () => { if (running) save(); });

  // ---------- タイトル ----------
  function showTitle() {
    $('#title').hidden = false;
    $('#btnContinue').hidden = !load();
  }
  function start(state, isNew) {
    S = state; sim.markDirty(); st = sim.summarize(S);
    $('#title').hidden = true;
    view.walkers = []; view.fx = []; view.selected = null; tool = null;
    talk.queue = []; talk.line = null;
    R.resize(); R.fit();
    buildPalette(); respawnRoadList();
    speed = 1; running = true;
    if (isNew) { S.goalShown = -1; showGoalIntro(); }
    else { say([['happy', `おかえりなさい、町長さん！ ${KT.dateLabel(S)}、今日もがんばりましょう♪`]]); S.goalShown = Math.max(S.goalShown, S.goal); }
    updateHUD();
    selectTool(null);
    syncHud();
    checkGoals();
  }
  $('#btnNew').addEventListener('click', () => {
    if (load() && !confirm('いまのセーブデータは消えてしまいます。はじめからにしますか？')) return;
    sfx('coin'); start(sim.newState(), true); save();
  });
  $('#btnContinue').addEventListener('click', () => { const d = load(); if (d) { sfx('coin'); start(d, false); } });

  // ---------- ループ ----------
  let last = performance.now(), hudAcc = 0;
  function frame(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    view.time += dt;
    if (running && S) {
      if (speed > 0) {
        S.dayT += dt * speed / KT.DAY_SEC;
        while (S.dayT >= 1) { S.dayT -= 1; onDay(); }
      }
      // キーでスクロール
      const pan = 520 * dt;
      if (keys.has('w') || keys.has('arrowup')) R.cam.y += pan;
      if (keys.has('s') || keys.has('arrowdown')) R.cam.y -= pan;
      if (keys.has('a') || keys.has('arrowleft')) R.cam.x += pan;
      if (keys.has('d') || keys.has('arrowright')) R.cam.x -= pan;
      updateWalkers(dt);
      view.fx = view.fx.filter(f => (f.age += dt) < f.life);
      tickTalk(dt);
      R.draw(S, view);
      $('#dayBar').style.width = `${S.dayT * 100}%`;
      hudAcc += dt; if (hudAcc > .5) { hudAcc = 0; updateGoalUI(); }
    }
    requestAnimationFrame(frame);
  }
  const syncHud = () => document.documentElement.style.setProperty('--hud-h', $('.hud').offsetHeight + 'px');
  window.addEventListener('resize', () => {
    syncHud();
    if (S) { const { H } = R.size(); R.resize(); R.cam.y += (R.size().H - H) / 2; }
  });
  syncHud();
  requestAnimationFrame(frame);
  showTitle();

  // デバッグ用
  KT.debug = { get S() { return S; }, get st() { return st; }, onDay, setSpeed, checkGoals, inspect };
})();
