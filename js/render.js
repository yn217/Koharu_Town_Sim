// アイソメトリック描画
(() => {
  const { N } = KT;
  const { idx, inb, D } = KT.sim;
  const R = {};
  let ctx, W = 0, H = 0, TW = 64, TH = 32;
  const cam = { x: 0, y: 0, zoom: 1 };
  R.cam = cam;

  R.init = canvas => { R.canvas = canvas; ctx = canvas.getContext('2d'); };
  R.resize = () => {
    const c = R.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = c.clientWidth; H = c.clientHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  R.size = () => ({ W, H });
  R.fit = () => {
    cam.zoom = Math.max(0.55, Math.min(1.4, Math.min(W / (N * 64) * 1.25, H / (N * 32) * 1.2)));
    cam.x = 0; cam.y = 0;
    center(N / 2, N / 2);
  };
  function center(tx, ty) {
    TW = 64 * cam.zoom; TH = TW / 2;
    const p = isoRaw(tx, ty);
    cam.x += W / 2 - p.x; cam.y += H / 2 + 20 - p.y;
  }
  R.centerOn = center;
  function isoRaw(x, y) { return { x: W / 2 + cam.x + (x - y) * TW / 2, y: cam.y + (x + y) * TH / 2 }; }
  const iso = isoRaw;
  R.iso = iso;
  R.zoomAt = (f, px, py) => {
    const nz = Math.max(0.45, Math.min(2.4, cam.zoom * f));
    const k = nz / cam.zoom;
    // ズームの中心を固定
    cam.x = (cam.x + W / 2 - px) * k + px - W / 2;
    cam.y = (cam.y - py) * k + py;
    cam.zoom = nz;
  };
  R.pick = (px, py) => {
    TW = 64 * cam.zoom; TH = TW / 2;
    const a = (px - W / 2 - cam.x) / (TW / 2), b = (py - cam.y) / (TH / 2);
    const x = Math.floor((a + b) / 2), y = Math.floor((b - a) / 2);
    return inb(x, y) ? { x, y } : null;
  };

  // ---------- 基本図形 ----------
  let CX = 0, CY = 0; // 描画中タイルの中心
  const P = (u, v, h) => [CX + (u - v) * TW / 2, CY + (u + v) * TH / 2 - h * TW];
  function poly(pts, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(0.5, TW / 90); ctx.stroke(); }
  }
  function box(u0, v0, u1, v1, h0, h1, top, left, right) {
    poly([P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)], left);
    poly([P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)], right);
    if (top) poly([P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)], top);
  }
  function gable(u0, v0, u1, v1, h, r, front, back, end) {
    const vm = (v0 + v1) / 2, o = 0.04;
    poly([P(u0 - o, v0 - o, h), P(u1 + o, v0 - o, h), P(u1 + o, vm, h + r), P(u0 - o, vm, h + r)], back);
    poly([P(u1, v0, h), P(u1, v1, h), P(u1, vm, h + r)], end);
    poly([P(u0 - o, v1 + o, h), P(u1 + o, v1 + o, h), P(u1 + o, vm, h + r), P(u0 - o, vm, h + r)], front);
    poly([P(u1 + o, v1 + o, h), P(u1 + o, vm, h + r), P(u1 + o, v0 - o, h)], null, shade(back, -0.15));
  }
  // 左面（v = v1）の窓
  const winL = (u, v1, h0, w, hh, c) => poly([P(u, v1 + .001, h0), P(u + w, v1 + .001, h0), P(u + w, v1 + .001, h0 + hh), P(u, v1 + .001, h0 + hh)], c);
  // 右面（u = u1）の窓
  const winR = (u1, v, h0, w, hh, c) => poly([P(u1 + .001, v, h0), P(u1 + .001, v + w, h0), P(u1 + .001, v + w, h0 + hh), P(u1 + .001, v, h0 + hh)], c);
  function shadow(rx, ry) {
    ctx.fillStyle = 'rgba(60,80,50,.18)';
    ctx.beginPath(); ctx.ellipse(CX + TW * 0.04, CY + TH * 0.06, TW * rx, TH * ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, a = Math.abs(amt);
    r = Math.round(r + (f - r) * a); g = Math.round(g + (f - g) * a); b = Math.round(b + (f - b) * a);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  R.shade = shade;

  // ---------- 色 ----------
  const SEASON = [
    { grass: ['#b5d39a', '#aecd94', '#bad79f'], tree: ['#f2b8c6', '#e9a3b6', '#8dbb7c'], sky: ['#dff0f4', '#cde7d4'] },
    { grass: ['#9fcb84', '#97c47c', '#a5cf8a'], tree: ['#5f9e5c', '#6aa865', '#4f8e57'], sky: ['#d3ecf7', '#c2e2c8'] },
    { grass: ['#c9c98a', '#c3c283', '#cfcf92'], tree: ['#e08a4a', '#d2a446', '#c86b45'], sky: ['#f3e6d2', '#e6dbbd'] },
    { grass: ['#e6ece9', '#dfe7e4', '#eaf0ee'], tree: ['#5f7f6c', '#6b8a76', '#567563'], sky: ['#e6edf3', '#d9e3e3'] },
  ];
  const ROOFS = ['#d9806c', '#6f9cc6', '#e0a659', '#7fae7c', '#b68bc4', '#d27d93'];
  const WALLS = ['#fff4e4', '#f7ebdc', '#fffaf0', '#f3e6d6'];

  // ---------- 地面 ----------
  function diamond(x, y, fill, stroke) {
    const p = iso(x, y);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + TW / 2, p.y + TH / 2); ctx.lineTo(p.x, p.y + TH); ctx.lineTo(p.x - TW / 2, p.y + TH / 2); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function drawGround(S, x, y, pal, time) {
    const t = S.tiles[idx(x, y)];
    if (t.g === 2) {
      diamond(x, y, '#8cc5d8');
      const p = iso(x, y);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1, TW / 50);
      const ph = (time * 0.6 + x * 0.7 + y * 0.3) % 1;
      ctx.beginPath(); ctx.moveTo(p.x - TW * 0.18 + ph * TW * 0.1, p.y + TH * (0.4 + ph * 0.2)); ctx.lineTo(p.x + TW * 0.02 + ph * TW * 0.1, p.y + TH * (0.4 + ph * 0.2)); ctx.stroke();
    } else {
      diamond(x, y, pal.grass[(x * 7 + y * 13 + (t.v % 3)) % 3]);
    }
    if (t.b === 'road') drawRoad(S, x, y, t.g === 2);
    else if (t.b && t.b !== 'flower' && t.b !== 'farm') {
      // 建物の敷地
      CX = iso(x + .5, y + .5).x; CY = iso(x + .5, y + .5).y;
      poly([P(-.47, -.47, 0), P(.47, -.47, 0), P(.47, .47, 0), P(-.47, .47, 0)], t.b === 'park' || t.b === 'plaza' ? null : 'rgba(255,250,235,.55)');
    }
  }
  function drawRoad(S, x, y, bridge) {
    const c = iso(x + .5, y + .5); CX = c.x; CY = c.y;
    const conn = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return (inb(nx, ny) && S.tiles[idx(nx, ny)].b === 'road') || (x === 0 && dx === -1 && y === KT.ENTRANCE.y);
    });
    const col = bridge ? '#c49a6c' : '#d8d2c4', edge = bridge ? '#9c7550' : '#c3bba8';
    const w = .3;
    poly([P(-w, -w, 0), P(w, -w, 0), P(w, w, 0), P(-w, w, 0)], col);
    const arms = [[w, -w, .5, w], [-.5, -w, -w, w], [-w, w, w, .5], [-w, -.5, w, -w]];
    conn.forEach((on, k) => { if (on) { const [u0, v0, u1, v1] = arms[k]; poly([P(u0, v0, 0), P(u1, v0, 0), P(u1, v1, 0), P(u0, v1, 0)], col); } });
    if (!conn.some(Boolean)) poly([P(-w, -w, 0), P(w, -w, 0), P(w, w, 0), P(-w, w, 0)], col, edge);
    // 中央線
    ctx.strokeStyle = bridge ? '#e7cfa8' : '#f7f3e8'; ctx.lineWidth = Math.max(1, TW / 45); ctx.setLineDash([TW / 14, TW / 14]);
    const ends = [[.5, 0], [-.5, 0], [0, .5], [0, -.5]];
    conn.forEach((on, k) => { if (on) { const a = P(0, 0, 0), b = P(ends[k][0], ends[k][1], 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } });
    ctx.setLineDash([]);
    if (!D.connected[idx(x, y)] && !bridge) poly([P(-w, -w, 0), P(w, -w, 0), P(w, w, 0), P(-w, w, 0)], 'rgba(220,120,100,.25)');
  }

  // ---------- 木 ----------
  function tree(u, v, s, col, season, sway) {
    const [bx, by] = P(u, v, 0);
    const k = TW / 64 * s;
    ctx.fillStyle = 'rgba(60,80,50,.18)'; ctx.beginPath(); ctx.ellipse(bx, by, 9 * k, 4 * k, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8f7356'; ctx.fillRect(bx - 1.6 * k, by - 12 * k, 3.2 * k, 12 * k);
    const ox = sway * k;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(bx + ox, by - 20 * k, 9 * k, 0, 7); ctx.arc(bx - 6 * k + ox, by - 15 * k, 6.5 * k, 0, 7); ctx.arc(bx + 6 * k + ox, by - 15 * k, 6.5 * k, 0, 7); ctx.fill();
    ctx.fillStyle = season === 3 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.arc(bx - 2 * k + ox, by - 24 * k, season === 3 ? 6 * k : 3 * k, 0, 7); ctx.fill();
  }
  function drawTrees(t, x, y, pal, season, time) {
    const n = 1 + (t.v % 3);
    const spots = [[-.18, -.12], [.16, .1], [-.05, .22]];
    for (let i = 0; i < n; i++) {
      const [u, v] = spots[(i + t.v) % 3];
      const col = pal.tree[(t.v + i) % 3];
      tree(u, v, 0.8 + ((t.v >> 2) % 4) * 0.08, col, season, Math.sin(time * 1.5 + x + y + i) * 0.6);
    }
  }

  // ---------- 建物 ----------
  function drawBuilding(S, t, x, y, time, ghost) {
    const c = centerOverride || iso(x + .5, y + .5); CX = c.x; CY = c.y;
    const roof = ROOFS[t.v % ROOFS.length], wall = WALLS[t.v % WALLS.length];
    const win = '#9fc6d6', winD = '#7fa8ba';
    const lit = S && S.flags.night;
    switch (t.b) {
      case 'house': {
        if (t.lv === 1) {
          shadow(.33, .3);
          box(-.27, -.22, .27, .24, 0, .26, null, shade(wall, -.04), shade(wall, -.12));
          winL(-.17, .24, .08, .12, .1, win); winR(.27, -.12, .08, .12, .1, win);
          poly([P(.02, .241, 0), P(.12, .241, 0), P(.12, .241, .17), P(.02, .241, .17)], '#a07a5c');
          gable(-.31, -.27, .31, .29, .26, .2, roof, shade(roof, -.15), shade(wall, -.12));
          box(.12, -.18, .2, -.1, .4, .52, '#b7a596', '#a48f80', '#937e70');
        } else if (t.lv === 2) {
          shadow(.4, .36);
          box(-.33, -.3, .33, .3, 0, .48, null, shade(wall, -.04), shade(wall, -.12));
          for (const h of [.08, .28]) { winL(-.24, .3, h, .12, .1, win); winL(.06, .3, h, .12, .1, win); winR(.33, -.2, h, .12, .1, win); winR(.33, .06, h, .12, .1, win); }
          poly([P(-.06, .301, 0), P(.03, .301, 0), P(.03, .301, .17), P(-.06, .301, .17)], '#a07a5c');
          box(-.36, .3, .36, .38, .2, .22, '#efe6d8', '#d9cfbf', '#cfc4b4');
          gable(-.37, -.35, .37, .35, .48, .22, roof, shade(roof, -.15), shade(wall, -.12));
        } else {
          shadow(.45, .42);
          const wl = '#f1ece4';
          box(-.38, -.36, .38, .36, 0, .95, shade(wl, -.06), shade(wl, -.02), shade(wl, -.1));
          for (let f = 0; f < 4; f++) { const h = .07 + f * .22; for (const u of [-.3, -.08, .14]) winL(u, .36, h, .12, .12, lit ? '#ffe6a3' : win); for (const v of [-.28, -.06, .16]) winR(.38, v, h, .12, .12, lit ? '#ffe6a3' : winD); box(-.38, .36, .38, .4, h - .02, h - .01, null, '#d6cfc4', '#c9c1b5'); }
          box(-.4, -.38, .4, .38, .95, 1.0, roof, shade(roof, -.1), shade(roof, -.2));
          box(-.12, -.12, .08, .08, 1.0, 1.08, '#cfc8bd', '#bdb5a9', '#aaa296');
        }
        break;
      }
      case 'konbini': {
        shadow(.42, .36);
        box(-.38, -.3, .38, .32, 0, .34, null, '#fbfaf6', '#e9e7e0');
        poly([P(-.3, .321, .03), P(.2, .321, .03), P(.2, .321, .22), P(-.3, .321, .22)], '#bfe0ea');
        poly([P(.22, .321, 0), P(.33, .321, 0), P(.33, .321, .22), P(.22, .321, .22)], '#a5cfdc');
        box(-.39, -.31, .39, .33, .24, .3, null, '#ea8fa6', '#d77890');
        box(-.39, -.31, .39, .33, .3, .33, null, '#8cc7a7', '#78b393');
        box(-.4, -.32, .4, .34, .34, .37, '#e9e6de', '#dcd8cf', '#cfcbc2');
        // 看板
        box(.3, .26, .36, .32, 0, .45, null, '#d77890', '#c26880');
        poly([P(.3, .33, .45), P(.36, .33, .45), P(.36, .33, .55), P(.3, .33, .55)], '#fff');
        break;
      }
      case 'shop': {
        shadow(.4, .36);
        box(-.34, -.3, .34, .3, 0, .5, null, '#f4e3c8', '#e5d0b0');
        poly([P(-.28, .301, .03), P(.18, .301, .03), P(.18, .301, .2), P(-.28, .301, .2)], '#bfdde6');
        poly([P(.2, .301, 0), P(.3, .301, 0), P(.3, .301, .2), P(.2, .301, .2)], '#a07a5c');
        // しましまの日よけ
        for (let k = 0; k < 6; k++) { const u0 = -.34 + k * .68 / 6; poly([P(u0, .3, .26), P(u0 + .68 / 6, .3, .26), P(u0 + .68 / 6, .44, .18), P(u0, .44, .18)], k % 2 ? '#fff6ea' : ROOFS[(t.v + 1) % 6]); }
        winL(-.24, .3, .32, .12, .1, win); winL(.06, .3, .32, .12, .1, win); winR(.34, -.2, .3, .12, .12, win); winR(.34, .05, .3, .12, .12, win);
        box(-.35, -.31, .35, .31, .5, .55, '#c9b394', '#b9a283', '#a99273');
        break;
      }
      case 'cafe': {
        shadow(.42, .38);
        box(-.3, -.32, .3, .16, 0, .36, null, '#a8805f', '#946d4f');
        poly([P(-.22, .161, .04), P(.14, .161, .04), P(.14, .161, .22), P(-.22, .161, .22)], '#ffe3b3');
        winR(.3, -.22, .08, .16, .16, '#ffe3b3');
        for (let k = 0; k < 5; k++) { const u0 = -.3 + k * .12; poly([P(u0, .16, .3), P(u0 + .12, .16, .3), P(u0 + .12, .28, .23), P(u0, .28, .23)], k % 2 ? '#fff8ee' : '#4f8a6b'); }
        gable(-.34, -.36, .34, .2, .36, .16, '#7c5a44', '#684a37', '#946d4f');
        // テラス席
        for (const u of [-.18, .14]) {
          const [px, py] = P(u, .36, 0); const k = TW / 64;
          ctx.fillStyle = '#7b5a44'; ctx.fillRect(px - .6 * k, py - 9 * k, 1.2 * k, 9 * k);
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(px, py - 9 * k, 6 * k, 2.4 * k, 0, 0, 7); ctx.fill();
          ctx.fillStyle = u < 0 ? '#e58f8f' : '#f2c46d'; ctx.beginPath(); ctx.moveTo(px - 9 * k, py - 15 * k); ctx.quadraticCurveTo(px, py - 24 * k, px + 9 * k, py - 15 * k); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#7b5a44'; ctx.fillRect(px - .4 * k, py - 16 * k, .8 * k, 7 * k);
        }
        break;
      }
      case 'farm': {
        const rows = 5;
        for (let k = 0; k < rows; k++) {
          const v0 = -.42 + k * .84 / rows;
          poly([P(-.42, v0, 0), P(.42, v0, 0), P(.42, v0 + .1, 0), P(-.42, v0 + .1, 0)], '#a8845f');
          const season = S ? KT.season(S) : 1;
          const crop = season === 3 ? '#d9d2c4' : season === 2 ? '#e0b851' : '#79b25f';
          for (let j = 0; j < 6; j++) { const [px, py] = P(-.36 + j * .14, v0 + .05, 0); ctx.fillStyle = crop; ctx.beginPath(); ctx.arc(px, py - TW * .02, TW * .028, 0, 7); ctx.fill(); }
        }
        box(.2, -.42, .42, -.22, 0, .18, null, '#c76b55', '#b05a46');
        gable(.18, -.44, .44, -.2, .18, .1, '#8d6a4d', '#7a5a40', '#b05a46');
        break;
      }
      case 'workshop': {
        shadow(.44, .4);
        box(-.38, -.34, .38, .34, 0, .4, null, '#c98a6d', '#b4765a');
        for (const u of [-.28, -.04, .2]) winL(u, .34, .12, .12, .16, '#f0d9a4');
        winR(.38, -.2, .12, .14, .16, '#e4c98f'); winR(.38, .08, .12, .14, .16, '#e4c98f');
        // のこぎり屋根
        for (let k = 0; k < 3; k++) { const u0 = -.38 + k * .76 / 3, u1 = u0 + .76 / 3; poly([P(u0, -.34, .4), P(u0, .34, .4), P(u1, .34, .58), P(u1, -.34, .58)], k % 2 ? '#8f9aa3' : '#a3adb5'); poly([P(u1, -.34, .4), P(u1, .34, .4), P(u1, .34, .58), P(u1, -.34, .58)], '#e8edf0'); }
        box(.18, -.3, .28, -.2, .4, .85, '#8f6a58', '#a0705c', '#8a5d4a');
        // けむり
        const [sx, sy] = P(.23, -.25, .9);
        for (let k = 0; k < 3; k++) { const ph = (time * 0.35 + k / 3) % 1; ctx.fillStyle = `rgba(235,235,235,${0.55 * (1 - ph)})`; ctx.beginPath(); ctx.arc(sx + ph * TW * .25, sy - ph * TW * .45, TW * (.05 + ph * .07), 0, 7); ctx.fill(); }
        break;
      }
      case 'flower': {
        poly([P(-.3, -.3, 0), P(.3, -.3, 0), P(.3, .3, 0), P(-.3, .3, 0)], '#a7865f');
        box(-.32, -.32, .32, .32, 0, .04, '#8c6c4c', '#c7b39a', '#b8a389');
        const cols = ['#f28ca5', '#f7d264', '#ffffff', '#c792e0', '#ff9f7a'];
        for (let k = 0; k < 14; k++) {
          const u = -.24 + ((k * 37 + t.v) % 48) / 100, v = -.24 + ((k * 53 + t.v * 3) % 48) / 100;
          const [px, py] = P(u, v, .05);
          ctx.fillStyle = '#5f9c55'; ctx.fillRect(px - .5, py - TW * .04, 1, TW * .04);
          ctx.fillStyle = cols[(k + t.v) % cols.length]; ctx.beginPath(); ctx.arc(px, py - TW * .045, TW * .025, 0, 7); ctx.fill();
        }
        break;
      }
      case 'park': {
        poly([P(-.48, -.48, 0), P(.48, -.48, 0), P(.48, .48, 0), P(-.48, .48, 0)], '#8fc27a');
        ctx.fillStyle = '#efe3c4'; { const [px, py] = P(0, 0, 0); ctx.beginPath(); ctx.ellipse(px, py, TW * .22, TH * .22, 0, 0, 7); ctx.fill(); }
        // 噴水
        box(-.1, -.1, .1, .1, 0, .05, '#9fd3e3', '#b9c3c8', '#a7b1b6');
        { const [px, py] = P(0, 0, .05); const k = TW / 64; for (let j = 0; j < 3; j++) { const ph = (time * 0.8 + j / 3) % 1; ctx.fillStyle = `rgba(200,235,250,${0.9 - ph * 0.6})`; ctx.beginPath(); ctx.arc(px, py - (6 + ph * 6) * k, (1.5 + ph * 1.5) * k, 0, 7); ctx.fill(); } }
        const pal = SEASON[S ? KT.season(S) : 1];
        tree(-.3, -.28, .85, pal.tree[0], S ? KT.season(S) : 1, Math.sin(time * 1.4 + x) * .5);
        tree(.28, -.3, .75, pal.tree[2], S ? KT.season(S) : 1, Math.sin(time * 1.4 + y) * .5);
        // ベンチ
        box(-.32, .22, -.12, .28, .06, .08, '#b98d61', '#a57a50', '#946b44');
        box(.2, .2, .26, .36, .06, .08, '#b98d61', '#a57a50', '#946b44');
        break;
      }
      case 'school': {
        shadow(.48, .44);
        box(-.44, -.3, .44, .3, 0, .58, null, '#fbf3e3', '#ece0cb');
        for (const h of [.08, .32]) { for (const u of [-.36, -.18, .08, .26]) winL(u, .3, h, .12, .14, win); winR(.44, -.2, h, .14, .14, win); winR(.44, .04, h, .14, .14, win); }
        poly([P(-.05, .301, 0), P(.05, .301, 0), P(.05, .301, .22), P(-.05, .301, .22)], '#8bb7c9');
        box(-.45, -.31, .45, .31, .58, .63, '#d8cbb3', '#c9bba2', '#b9ab92');
        // 時計塔
        box(-.1, -.1, .1, .1, .63, .92, null, '#fbf3e3', '#ece0cb');
        { const [px, py] = P(0, .1, .8); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, TW * .045, 0, 7); ctx.fill(); ctx.strokeStyle = '#6d6d6d'; ctx.lineWidth = Math.max(1, TW / 80); ctx.stroke(); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - TW * .03); ctx.moveTo(px, py); ctx.lineTo(px + TW * .02, py); ctx.stroke(); }
        gable(-.12, -.12, .12, .12, .92, .1, '#5f8fb5', '#4f7ea3', '#ece0cb');
        break;
      }
      case 'clinic': {
        shadow(.42, .38);
        box(-.36, -.3, .36, .3, 0, .46, null, '#ffffff', '#eef0f0');
        for (const h of [.06, .27]) { winL(-.28, .3, h, .12, .12, win); winL(.14, .3, h, .12, .12, win); winR(.36, -.22, h, .12, .12, win); winR(.36, .08, h, .12, .12, win); }
        poly([P(-.08, .301, 0), P(.06, .301, 0), P(.06, .301, .2), P(-.08, .301, .2)], '#a9d3c9');
        box(-.37, -.31, .37, .31, .46, .5, '#d4e4e0', '#c3d6d1', '#b3c8c2');
        // 十字
        const [px, py] = P(.0, .31, .38); const k = TW / 64;
        ctx.fillStyle = '#5fb08f'; ctx.fillRect(px - 5 * k, py - 1.6 * k, 10 * k, 3.2 * k); ctx.fillRect(px - 1.6 * k, py - 5 * k, 3.2 * k, 10 * k);
        break;
      }
      case 'plaza': {
        poly([P(-.48, -.48, 0), P(.48, -.48, 0), P(.48, .48, 0), P(-.48, .48, 0)], '#e9dfcb');
        for (let k = -2; k <= 2; k++) { poly([P(k * .19 - .01, -.48, 0), P(k * .19 + .01, -.48, 0), P(k * .19 + .01, .48, 0), P(k * .19 - .01, .48, 0)], '#d9ccb2'); }
        // やぐら
        box(-.16, -.16, .16, .16, 0, .32, null, '#c0563f', '#a6472f');
        box(-.2, -.2, .2, .2, .32, .36, '#e8d3a8', '#d9c294', '#c9b183');
        gable(-.2, -.2, .2, .2, .5, .14, '#5d4a3e', '#4b3b31', '#c0563f');
        for (const [u, v] of [[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]]) box(u - .015, v - .015, u + .015, v + .015, .36, .5, null, '#7b5a44', '#6a4b37');
        // ちょうちん
        const lc = ['#ff7a6b', '#ffd36b', '#ff7a6b', '#ffd36b'];
        [[-.45, .45], [.45, .45], [.45, -.45], [-.45, -.45]].forEach(([u, v], k) => {
          const [a, b] = P(u, v, 0), [c2, d2] = P(0, 0, .55);
          ctx.strokeStyle = '#7b5a44'; ctx.lineWidth = Math.max(.6, TW / 120); ctx.beginPath(); ctx.moveTo(a, b - TW * .35); ctx.lineTo(c2, d2); ctx.stroke();
          box(u - .01, v - .01, u + .01, v + .01, 0, .35, null, '#7b5a44', '#6a4b37');
          for (let j = 1; j <= 2; j++) { const f = j / 3; const lx = a + (c2 - a) * f, ly = (b - TW * .35) + (d2 - (b - TW * .35)) * f + TW * .03; const glow = S && S.festivalDays > 0 ? 1 : .8; ctx.fillStyle = lc[(k + j) % 4]; ctx.globalAlpha = glow; ctx.beginPath(); ctx.ellipse(lx, ly, TW * .022, TW * .03, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
        });
        break;
      }
    }
    // 道路につながっていない
    if (!ghost && S && t.b !== 'road' && t.b !== 'flower' && t.b !== 'park' && !D.active[idx(x, y)]) {
      const [px, py] = P(0, 0, t.b === 'house' && t.lv === 3 ? 1.25 : .8);
      const bob = Math.sin(time * 4) * TW * .02;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e0705e'; ctx.lineWidth = Math.max(1.5, TW / 40);
      ctx.beginPath(); ctx.arc(px, py + bob, TW * .1, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e0705e'; ctx.font = `800 ${Math.round(TW * .14)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', px, py + bob + 1);
    }
  }
  R.drawBuildingIcon = (type, canvas) => {
    // パレット用の小さな絵
    const c2 = canvas.getContext('2d'), dpr = 2;
    canvas.width = 52 * dpr; canvas.height = 46 * dpr;
    const save = ctx, sTW = TW, sTH = TH;
    ctx = c2; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    TW = type === 'school' || type === 'house' ? 40 : 42; TH = TW / 2;
    CX = 26; CY = type === 'house' ? 30 : 28;
    if (type === 'road') { drawRoadIcon(); }
    else if (type === 'bulldoze') { ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🧹', 26, 24); }
    else drawBuildingAt(type);
    ctx = save; TW = sTW; TH = sTH;
  };
  function drawRoadIcon() {
    poly([P(-.5, -.5, 0), P(.5, -.5, 0), P(.5, .5, 0), P(-.5, .5, 0)], '#b5d39a');
    poly([P(-.5, -.2, 0), P(.5, -.2, 0), P(.5, .2, 0), P(-.5, .2, 0)], '#d8d2c4');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); const a = P(-.5, 0, 0), b = P(.5, 0, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
  }
  let centerOverride = null;
  function drawBuildingAt(type) {
    centerOverride = { x: CX, y: CY };
    drawBuilding(null, { b: type, lv: 1, v: 0, occ: 0 }, 0, 0, 0, true);
    centerOverride = null;
  }

  // ---------- 歩く人 ----------
  function drawWalker(w) {
    const c = iso(w.x + .5, w.y + .5);
    const k = TW / 64;
    const ox = w.lane * TW * .08, oy = w.lane * TH * .04;
    const bob = Math.abs(Math.sin(w.phase)) * 1.2 * k;
    const px = c.x + ox, py = c.y + oy;
    ctx.fillStyle = 'rgba(60,70,50,.25)'; ctx.beginPath(); ctx.ellipse(px, py, 2.6 * k, 1.2 * k, 0, 0, 7); ctx.fill();
    ctx.fillStyle = w.color; ctx.beginPath(); ctx.ellipse(px, py - 4 * k - bob, 2.2 * k, 3.4 * k, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f6dcc6'; ctx.beginPath(); ctx.arc(px, py - 9 * k - bob, 2 * k, 0, 7); ctx.fill();
    ctx.fillStyle = w.hair; ctx.beginPath(); ctx.arc(px, py - 9.6 * k - bob, 2 * k, Math.PI, 0); ctx.fill();
  }

  // ---------- メイン描画 ----------
  R.draw = (S, view) => {
    TW = 64 * cam.zoom; TH = TW / 2;
    const time = view.time, season = KT.season(S), pal = SEASON[season];
    // 空
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.sky[0]); g.addColorStop(1, pal.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 雲
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let k = 0; k < 5; k++) {
      const cx = ((k * 340 + time * (8 + k * 2)) % (W + 300)) - 150, cy = 60 + k * 47 % 160;
      ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.arc(cx + 24, cy + 6, 19, 0, 7); ctx.arc(cx - 24, cy + 8, 17, 0, 7); ctx.fill();
    }
    // 地面の厚み（島の側面）
    const a = iso(0, N), b = iso(N, N), c = iso(N, 0);
    const dep = TW * .35;
    ctx.fillStyle = '#9b7c5c'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y + dep); ctx.lineTo(a.x, a.y + dep); ctx.fill();
    ctx.fillStyle = '#86694c'; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x, c.y + dep); ctx.lineTo(b.x, b.y + dep); ctx.fill();

    // 見えている範囲だけ
    const vis = (x, y) => { const p = iso(x, y); return p.x > -TW && p.x < W + TW && p.y > -TW * 2 && p.y < H + TW; };
    for (let s = 0; s < N * 2 - 1; s++) for (let x = 0; x < N; x++) { const y = s - x; if (y < 0 || y >= N || !vis(x, y)) continue; drawGround(S, x, y, pal, time); }

    // オーバーレイ（快適さ）
    if (view.overlay) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d = D.des[idx(x, y)];
        if (Math.abs(d) < 1) continue;
        const al = Math.min(.6, Math.abs(d) / 40 + .08);
        diamond(x, y, d > 0 ? `rgba(80,190,120,${al})` : `rgba(230,90,80,${al})`);
      }
    }

    // ホバー・プレビュー
    const hv = view.preview;
    if (hv) for (const p of hv.tiles) diamond(p.x, p.y, p.ok ? 'rgba(255,255,255,.45)' : 'rgba(240,110,100,.45)', p.ok ? '#ffffff' : '#e06a5a');
    if (view.range) {
      const { x: rx, y: ry, r } = view.range;
      for (let y = ry - r; y <= ry + r; y++) for (let x = rx - r; x <= rx + r; x++) if (inb(x, y) && Math.abs(x - rx) + Math.abs(y - ry) <= r * 1.3) diamond(x, y, 'rgba(120,170,230,.14)');
    }
    if (view.selected) { const p = view.selected; diamond(p.x, p.y, 'rgba(255,240,150,.35)', '#f2c94c'); }

    // 立体物（奥から手前へ）
    const walkersAt = new Map();
    for (const w of view.walkers) { const k = Math.round(w.x) + ',' + Math.round(w.y); if (!walkersAt.has(k)) walkersAt.set(k, []); walkersAt.get(k).push(w); }
    for (let s = 0; s < N * 2 - 1; s++) for (let x = 0; x < N; x++) {
      const y = s - x; if (y < 0 || y >= N || !vis(x, y)) continue;
      const t = S.tiles[idx(x, y)];
      if (t.g === 1 && !t.b) { const c = iso(x + .5, y + .5); CX = c.x; CY = c.y; drawTrees(t, x, y, pal, season, time); }
      if (t.b && t.b !== 'road') drawBuilding(S, t, x, y, time, false);
      if (hv && hv.ghost && hv.ghost.x === x && hv.ghost.y === y) { ctx.globalAlpha = .6; drawBuilding(S, { b: hv.ghost.type, lv: 1, v: 3 }, x, y, time, true); ctx.globalAlpha = 1; }
      const ws = walkersAt.get(x + ',' + y); if (ws) ws.forEach(drawWalker);
    }

    // 町の入口の目印
    {
      const e = KT.ENTRANCE, p = iso(e.x + .2, e.y + .5);
      const fs = Math.round(Math.max(11, TW * .2));
      ctx.font = `800 ${fs}px "M PLUS Rounded 1c", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = '町の入口', w = ctx.measureText(label).width + fs, y = p.y - TW * .45;
      ctx.fillStyle = 'rgba(255,253,247,.95)'; ctx.strokeStyle = '#e28a9e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(p.x - w / 2, y - fs * .8, w, fs * 1.6, fs * .5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 4, y + fs * .8); ctx.lineTo(p.x, y + fs * .8 + 6); ctx.lineTo(p.x + 4, y + fs * .8); ctx.fill();
      ctx.fillStyle = '#c8667e'; ctx.fillText(label, p.x, y + 1);
    }

    // エフェクト
    for (const f of view.fx) {
      const p = iso(f.x + .5, f.y + .5), age = f.age / f.life;
      ctx.globalAlpha = 1 - age;
      if (f.kind === 'text') {
        ctx.font = `800 ${Math.round(Math.max(12, TW * .22))}px "M PLUS Rounded 1c", sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(f.text, p.x, p.y - TW * .5 - age * TW * .5);
        ctx.fillStyle = f.color || '#4f7a55'; ctx.fillText(f.text, p.x, p.y - TW * .5 - age * TW * .5);
      } else {
        for (let k = 0; k < 8; k++) { const an = k / 8 * Math.PI * 2 + age; const rr = TW * (.15 + age * .5); ctx.fillStyle = k % 2 ? '#ffd56b' : '#ff9fb5'; ctx.beginPath(); ctx.arc(p.x + Math.cos(an) * rr, p.y - TW * .4 + Math.sin(an) * rr * .6, TW * .03 * (1 - age) + 1, 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }

    // 雨
    if (S.weather === 'rain') {
      ctx.fillStyle = 'rgba(70,90,120,.12)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 140; k++) { const rx = (k * 97.3 + time * 60) % W, ry = (k * 53.1 + time * 520) % H; ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 12); }
      ctx.stroke();
    }
    if (S.festivalDays > 0) { ctx.fillStyle = 'rgba(255,170,90,.07)'; ctx.fillRect(0, 0, W, H); }
  };

  KT.render = R;
})();
