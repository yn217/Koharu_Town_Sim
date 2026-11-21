// 町のシミュレーション
(() => {
  const { N, BUILDINGS: B, ENTRANCE } = KT;
  const idx = (x, y) => y * N + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // 決まった乱数（マップ生成用）
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function newState() {
    const S = {
      tiles: [], money: 6000, day: 1, dayT: 0, happy: 60, goal: 0, goalShown: -1,
      unlocked: [...KT.START_UNLOCKED], flags: {}, weather: 'sun', weatherDays: 0,
      festivalDays: 0, lastNet: 0, lastIncome: 0, lastUpkeep: 0, history: [],
      townName: 'ひなた町',
    };
    const r = rng(20261121);
    for (let i = 0; i < N * N; i++) S.tiles.push({ g: 0, b: null, lv: 1, occ: 0, v: Math.floor(r() * 1000) });
    // 川：上から下へ蛇行
    let rx = 18;
    for (let y = 0; y < N; y++) {
      S.tiles[idx(rx, y)].g = 2;
      if (y % 3 === 1) { const nx = rx + (r() < 0.5 ? -1 : 1); if (nx > 15 && nx < 22) { S.tiles[idx(nx, y)].g = 2; rx = nx; } }
    }
    // 森
    const forests = [[4, 4, 3.2], [9, 21, 3.4], [22, 5, 3], [23, 21, 3], [13, 2, 2.4], [2, 22, 2.6]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = S.tiles[idx(x, y)];
      if (t.g) continue;
      for (const [fx, fy, fr] of forests) {
        const d = Math.hypot(x - fx, y - fy);
        if (d < fr && r() < 0.85 - d / fr * 0.4) t.g = 1;
      }
      if (!t.g && r() < 0.035) t.g = 1;
    }
    // 入口の道路
    for (let x = 0; x < 4; x++) { const t = S.tiles[idx(x, ENTRANCE.y)]; t.g = 0; t.b = 'road'; }
    return S;
  }

  // ---- 派生データ（建物が変わったら再計算） ----
  const D = { connected: new Uint8Array(N * N), active: new Uint8Array(N * N), des: new Float32Array(N * N), edu: new Uint8Array(N * N), health: new Uint8Array(N * N), dirty: true };

  function recompute(S) {
    const T = S.tiles;
    D.connected.fill(0); D.active.fill(0); D.des.fill(0); D.edu.fill(0); D.health.fill(0);
    // 入口から道路をたどる
    const q = [];
    const e = idx(ENTRANCE.x, ENTRANCE.y);
    if (T[e].b === 'road') { D.connected[e] = 1; q.push([ENTRANCE.x, ENTRANCE.y]); }
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of NB4) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const i = idx(nx, ny);
        if (!D.connected[i] && T[i].b === 'road') { D.connected[i] = 1; q.push([nx, ny]); }
      }
    }
    // 道路に面しているか
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = T[idx(x, y)];
      if (!t.b || t.b === 'road') continue;
      if (t.b === 'flower' || t.b === 'park') { D.active[idx(x, y)] = 1; continue; }
      for (const [dx, dy] of NB4) {
        const nx = x + dx, ny = y + dy;
        if (inb(nx, ny) && D.connected[idx(nx, ny)]) { D.active[idx(x, y)] = 1; break; }
      }
    }
    // 快適さ・サービス範囲
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = T[idx(x, y)];
      if (t.g === 1 || t.g === 2) {
        const v = t.g === 1 ? 1.5 : 2.5, r = t.g === 1 ? 1 : 2;
        spread(x, y, r, v);
      }
      if (!t.b) continue;
      const def = B[t.b];
      if (def.infl && D.active[idx(x, y)]) spread(x, y, def.infl.r, def.infl.v);
      if (def.service && D.active[idx(x, y)]) {
        const arr = def.service === 'edu' ? D.edu : D.health;
        for (let yy = y - def.radius; yy <= y + def.radius; yy++) for (let xx = x - def.radius; xx <= x + def.radius; xx++)
          if (inb(xx, yy) && Math.abs(xx - x) + Math.abs(yy - y) <= def.radius * 1.3) arr[idx(xx, yy)] = 1;
      }
    }
    D.dirty = false;
  }
  function spread(x, y, r, v) {
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (!inb(xx, yy) || (xx === x && yy === y)) continue;
      const d = Math.max(Math.abs(xx - x), Math.abs(yy - y));
      D.des[idx(xx, yy)] += v * (1 - (d - 1) / (r + 0.5));
    }
  }

  function nearType(S, x, y, r, types) {
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (!inb(xx, yy)) continue;
      const i = idx(xx, yy), b = S.tiles[i].b;
      if (b && types.includes(b) && D.active[i]) return true;
    }
    return false;
  }

  // ---- 集計 ----
  function summarize(S) {
    if (D.dirty) recompute(S);
    const T = S.tiles;
    let residents = 0, jobsTotal = 0, shopCap = 0, connectedRoads = 0, houseLv3 = 0, houses = 0, inactive = 0;
    let eduNeedHouses = 0, eduCovered = 0, healthCovered = 0, desSum = 0;
    const counts = {}, activeCounts = {};
    for (let i = 0; i < N * N; i++) {
      const t = T[i];
      if (!t.b) continue;
      counts[t.b] = (counts[t.b] || 0) + 1;
      if (t.b === 'road') { if (D.connected[i]) { connectedRoads++; activeCounts.road = (activeCounts.road || 0) + 1; } continue; }
      if (D.active[i]) activeCounts[t.b] = (activeCounts[t.b] || 0) + 1; else if (t.b !== 'flower' && t.b !== 'park') inactive++;
      const def = B[t.b];
      if (t.b === 'house') {
        houses++; residents += t.occ;
        if (t.lv >= 3) houseLv3++;
        if (t.occ > 0) { eduNeedHouses += t.occ; if (D.edu[i]) eduCovered += t.occ; if (D.health[i]) healthCovered += t.occ; desSum += D.des[i] * t.occ; }
      } else if (D.active[i]) {
        if (def.jobs) jobsTotal += def.jobs;
        if (def.shopCap) shopCap += def.shopCap;
      }
    }
    const workers = Math.floor(residents * 0.6);
    const employed = Math.min(workers, jobsTotal);
    const fill = jobsTotal ? employed / jobsTotal : 0;
    const startRoads = 4;
    return {
      residents, jobsTotal, workers, employed, fill, shopCap, connectedRoads, startRoads, houseLv3, houses, inactive,
      eduShare: residents ? eduCovered / residents : 1, healthShare: residents ? healthCovered / residents : 1,
      avgDes: residents ? desSum / residents : 0, happy: S.happy,
      count: (type, activeOnly) => (activeOnly ? activeCounts[type] : counts[type]) || 0,
      tourists: (activeCounts.plaza ? 25 : 0) * (S.happy / 100) * (S.festivalDays > 0 ? 3 : 1),
    };
  }

  function demand(S, st) {
    const free = st.jobsTotal - st.workers;
    const R = clamp(0.45 + clamp(free / (st.workers + 8), -1, 0.7) + (S.happy - 55) / 80, -1, 1);
    const C = clamp((st.residents + st.tourists - st.shopCap) / (st.residents + 25), -1, 1);
    const W = clamp((st.workers - st.jobsTotal) / (st.workers + 10), -1, 1);
    return { R, C, W };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- 1日進める ----
  function simDay(S, events) {
    if (D.dirty) recompute(S);
    const T = S.tiles;
    let st = summarize(S);

    // お金
    const custDemand = st.residents * (S.weather === 'rain' ? 0.85 : 1) + st.tourists;
    let income = st.employed * 5 + (st.residents - st.employed) * 2;
    let upkeep = 0;
    const capEff = st.shopCap * (0.35 + 0.65 * st.fill);
    const sales = Math.min(custDemand, capEff);
    for (let i = 0; i < N * N; i++) {
      const t = T[i];
      if (!t.b) continue;
      const def = B[t.b];
      upkeep += def.upkeep || 0;
      if (t.b === 'road' && T[i].g === 2) upkeep += 0.5;
      if (!D.active[i]) continue;
      if (def.shopCap && capEff > 0) {
        let r = def.rate;
        if (t.b === 'cafe' && S.weather === 'rain') r *= 1.3;
        income += sales * (def.shopCap * (0.35 + 0.65 * st.fill) / capEff) * r;
      }
      if (def.prod) income += def.jobs * st.fill * def.prod * (t.b === 'farm' && S.weather === 'rain' ? 1.2 : 1);
    }
    if (st.tourists) income += st.tourists * 2;
    income = Math.round(income); upkeep = Math.round(upkeep);
    S.money += income - upkeep;
    S.lastIncome = income; S.lastUpkeep = upkeep; S.lastNet = income - upkeep;

    // まんぞく度
    let target = 55 + clamp(st.avgDes, -20, 32);
    if (st.workers > 5) target -= (1 - st.employed / st.workers) * 22;
    if (st.residents > 12) target -= clamp((custDemand - capEff) / Math.max(1, custDemand), 0, 1) * 18;
    if (st.residents >= 50 && S.unlocked.includes('school')) target -= (1 - st.eduShare) * 14;
    if (st.residents >= 100 && S.unlocked.includes('clinic')) target -= (1 - st.healthShare) * 14;
    if (S.festivalDays > 0) target += 10;
    if (S.money < 0) target -= 8;
    target = clamp(target, 5, 100);
    if (st.residents === 0) target = 60;
    S.happy = clamp(S.happy + (target - S.happy) * 0.3, 0, 100);

    // 住民の増減とおうちの成長
    const dm = demand(S, st);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = idx(x, y), t = T[i];
      if (t.b !== 'house') continue;
      const cap = B.house.cap[t.lv - 1];
      if (!D.active[i]) { if (t.occ > 0 && Math.random() < 0.5) t.occ--; continue; }
      const local = dm.R + D.des[i] / 60;
      if (local > 0 && t.occ < cap) {
        if (Math.random() < Math.min(0.8, local * 0.7)) t.occ = Math.min(cap, t.occ + 1 + (local > 0.8 && t.lv > 1 ? 1 : 0));
      } else if (local < -0.15 && t.occ > 0 && Math.random() < -local * 0.5) t.occ--;
      // レベルアップ
      if (t.occ >= cap && t.lv < 3 && Math.random() < 0.18) {
        const shopNear = nearType(S, x, y, 6, ['konbini', 'shop', 'cafe']);
        const ok = t.lv === 1 ? (D.des[i] >= 6 && shopNear)
          : (D.des[i] >= 16 && shopNear && D.edu[i] && st.residents >= 60);
        if (ok) { t.lv++; events.push({ type: 'levelup', x, y, lv: t.lv }); }
      }
    }

    // 天気・イベント
    if (S.weatherDays > 0) { S.weatherDays--; if (!S.weatherDays) { S.weather = 'sun'; events.push({ type: 'weather', w: 'sun' }); } }
    else if (S.day > 6 && Math.random() < 0.06) { S.weather = 'rain'; S.weatherDays = 2 + Math.floor(Math.random() * 3); events.push({ type: 'weather', w: 'rain' }); }
    if (S.festivalDays > 0) S.festivalDays--;
    if (st.count('plaza', true) && S.day % 20 === 0) { S.festivalDays = 4; const bonus = Math.round(st.residents * 4 + 300); S.money += bonus; events.push({ type: 'festival', bonus }); }
    else if (S.day > 10 && st.residents > 30 && Math.random() < 0.04) { const bonus = Math.round(st.residents * 2 * S.happy / 100 + 100); S.money += bonus; events.push({ type: 'tourist', bonus }); }

    S.day++;
    st = summarize(S);
    S.history.push({ d: S.day, pop: st.residents, money: Math.round(S.money), happy: Math.round(S.happy) });
    if (S.history.length > 120) S.history.shift();
    return st;
  }

  // ---- 建設 ----
  function costAt(S, type, x, y) {
    const t = S.tiles[idx(x, y)];
    if (type === 'bulldoze') return t.b ? 0 : t.g === 1 ? 20 : 0;
    let c = B[type].cost;
    if (type === 'road' && t.g === 2) c = 100;
    if (t.g === 1) c += 20;
    return c;
  }
  function canPlace(S, type, x, y) {
    if (!inb(x, y)) return { ok: false, why: 'マップの外です' };
    const t = S.tiles[idx(x, y)];
    if (type === 'bulldoze') {
      if (x === ENTRANCE.x && y === ENTRANCE.y) return { ok: false, why: '町の入口はこわせません' };
      if (!t.b && t.g !== 1) return { ok: false, why: 'こわすものがありません' };
    } else {
      if (t.b) return { ok: false, why: 'もう建物があります' };
      if (t.g === 2 && type !== 'road') return { ok: false, why: '川の上には道路（橋）しか置けません' };
    }
    const c = costAt(S, type, x, y);
    if (S.money < c) return { ok: false, why: 'お金が足りません', cost: c };
    return { ok: true, cost: c };
  }
  function place(S, type, x, y) {
    const chk = canPlace(S, type, x, y);
    if (!chk.ok) return chk;
    const t = S.tiles[idx(x, y)];
    S.money -= chk.cost;
    if (type === 'bulldoze') {
      if (t.b) { t.b = null; t.lv = 1; t.occ = 0; } else t.g = 0;
    } else {
      if (t.g === 1) t.g = 0;
      t.b = type; t.lv = 1; t.occ = 0;
    }
    D.dirty = true;
    return chk;
  }

  KT.sim = { newState, summarize, demand, simDay, canPlace, place, costAt, recompute, D, idx, inb, NB4, markDirty: () => { D.dirty = true; } };
})();
