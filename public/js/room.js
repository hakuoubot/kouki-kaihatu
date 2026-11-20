// 自習室の描画（Canvas 2D のアイソメ図）。モック mock/studynest_mock.html の部屋がもとです。
// 使い方: Room.init(canvas, { onSeatTap(seatNo, taken) })
//         Room.start(theme, floor) → Room.setState(members, myUserId) → Room.stop()
// 内装(theme)と床(floor)は見た目だけを変えます。マス目・席の位置はどの内装でも同じです。
//   theme: classic / aizu / washitsu / library / cafe / attic / school / train / rooftop / spring
//   floor: null(内装のまま) / planks / parquet / stone / hex / checker / carpet / rug / concrete / grass
window.Room = (function () {
  const TW = 64, TH = 32, W = 12, H = 10, WALLH = 128;
  const SEAT_X = [2, 3, 4, 7, 8, 9], SEAT_Y = [2, 6];
  const seats = [];
  SEAT_Y.forEach((cy) => SEAT_X.forEach((cx) => seats.push({ idx: seats.length, x: cx, y: cy })));
  let props = seats.map((s) => ({ x: s.x, y: s.y + 1, kind: 'desk', tint: s.idx }));
  props.push({ x: 0, y: 2, kind: 'shelf' }, { x: 0, y: 3, kind: 'shelf' }, { x: 0, y: 0, kind: 'plant' },
    { x: 11, y: 0, kind: 'plant' }, { x: 0, y: 8, kind: 'water' }, { x: 11, y: 4, kind: 'plant' });
  let blocked = new Set(props.map((p) => p.x + ',' + p.y));
  const chairTile = new Set(seats.map((s) => s.x + ',' + s.y));
  const DOOR = { x: 5, y: 9 };
  // 座っていない人が立つ場所（通路）
  const STAND = [[5, 8], [6, 8], [5, 5], [6, 5], [5, 1], [6, 1], [5, 4], [6, 4], [5, 7], [6, 7], [10, 8], [1, 5]];
  const BODY = ['#4F6FD0', '#46C2A6', '#E8B27E', '#A08CE0', '#F0675A', '#3E6E9C', '#FF9FC0', '#F5C85C'];
  const HAIR = ['#4A3426', '#2E2A2A', '#7A4A2A', '#2B2547', '#5A3A28', '#9B6B43'];
  const SKIN = ['#FFE0C7', '#F6D0B1', '#EBC09A', '#D9A57E'];

  let canvas, ctx, opts = {}, running = false, vw = 0, vh = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
  let avatars = new Map(); // userId -> {px, py, path, seat, nickname, away, me}
  let myId = null;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const P = (x, y, z) => [(x - y) * TW / 2, (x + y) * TH / 2 - (z || 0)];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = canvas.clientWidth; vh = canvas.clientHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    // 部屋全体（横 -320〜384、縦 -128〜366）が画面に入るように
    // 上のボタン(56px)と下のタイマー(150px)をよけて、部屋全体が入るように
    const top = 56, bottom = 150, avail = Math.max(200, vh - top - bottom);
    scale = Math.min(vw / 740, avail / 510, 1.4);
    ox = vw / 2 - 32 * scale;
    oy = top + (avail - 494 * scale) / 2 + 128 * scale;
  }

  function poly(pts, fill) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function isoBox(x0, y0, x1, y1, z0, z1, top, left, right) {
    poly([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], left);
    poly([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], right);
    poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top);
  }
  function onRightWall(x, z, draw) { const p = P(x, 0, z); ctx.save(); ctx.translate(p[0], p[1]); ctx.transform(1, 0.5, 0, 1, 0, 0); draw(); ctx.restore(); }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  function seatTaken(i) { for (const a of avatars.values()) if (a.seat === i) return true; return false; }

  // ===== 内装テーマ =====
  function onLeftWall(y, z, draw) { const p = P(0, y, z); ctx.save(); ctx.translate(p[0], p[1]); ctx.transform(1, -0.5, 0, 1, 0, 0); draw(); ctx.restore(); }
  const FONT = '"M PLUS Rounded 1c", sans-serif';
  let snowF = [];
  for (let i = 0; i < 40; i++) snowF.push({ x: Math.random(), y: Math.random(), v: 0.05 + Math.random() * 0.08, r: 0.6 + Math.random() * 1.2 });

  // 窓（右の壁）。sky: 'evening' | 'night' | 'snow'
  function windowOn(x0, x1, z, sky, t, frame) {
    onRightWall(x0, z, () => {
      const ww = (x1 - x0) * TW / 2, wh = 60;
      ctx.fillStyle = frame || '#FFFFFF'; ctx.fillRect(-4, -4, ww + 8, wh + 8);
      const g = ctx.createLinearGradient(0, 0, 0, wh);
      if (sky === 'evening') { g.addColorStop(0, '#8EC5F2'); g.addColorStop(1, '#FFD7B0'); }
      else { g.addColorStop(0, '#18204A'); g.addColorStop(1, '#4C5E9A'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, ww, wh);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, ww, wh); ctx.clip();
      if (sky === 'evening') {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(ww * 0.25, wh * 0.45, 9, 0, 7); ctx.arc(ww * 0.25 + 12, wh * 0.4, 12, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = '#FFF4C2'; ctx.beginPath(); ctx.arc(ww * 0.8, wh * 0.25, 6, 0, 7); ctx.fill();
        if (sky === 'snow') {
          // 雪山（磐梯山をイメージ）と、お城のシルエット、町の灯り
          ctx.fillStyle = '#7C8DBF'; ctx.beginPath(); ctx.moveTo(0, wh * 0.8); ctx.lineTo(ww * 0.3, wh * 0.38); ctx.lineTo(ww * 0.42, wh * 0.5); ctx.lineTo(ww * 0.55, wh * 0.42); ctx.lineTo(ww, wh * 0.75); ctx.lineTo(ww, wh); ctx.lineTo(0, wh); ctx.fill();
          ctx.fillStyle = '#EEF2FF'; ctx.beginPath(); ctx.moveTo(ww * 0.22, wh * 0.48); ctx.lineTo(ww * 0.3, wh * 0.38); ctx.lineTo(ww * 0.38, wh * 0.47); ctx.fill();
          if (x0 > 6) { // お城
            const cx = ww * 0.35, by = wh * 0.86; ctx.fillStyle = '#2A3361';
            ctx.fillRect(cx - 12, by - 8, 24, 8); ctx.fillRect(cx - 8, by - 15, 16, 7); ctx.fillRect(cx - 5, by - 21, 10, 6);
            ctx.beginPath(); ctx.moveTo(cx - 15, by - 8); ctx.lineTo(cx + 15, by - 8); ctx.lineTo(cx + 10, by - 11); ctx.lineTo(cx - 10, by - 11); ctx.fill();
            ctx.beginPath(); ctx.moveTo(cx - 8, by - 21); ctx.lineTo(cx + 8, by - 21); ctx.lineTo(cx, by - 26); ctx.fill();
            ctx.fillStyle = '#FFD36B'; ctx.fillRect(cx - 6, by - 5, 2, 2); ctx.fillRect(cx + 3, by - 5, 2, 2); ctx.fillRect(cx - 2, by - 13, 2, 2);
          }
          ctx.fillStyle = '#2A3361'; for (let i = 0; i < 8; i++) ctx.fillRect(i * ww / 8, wh * 0.9 - (i * 37 % 5), ww / 8 - 2, 12);
          ctx.fillStyle = '#FFD36B'; for (let i = 0; i < 10; i++) ctx.fillRect((i * 61) % 100 / 100 * ww, wh * 0.92, 2, 2);
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          snowF.forEach((f) => { ctx.beginPath(); ctx.arc(((f.x + x0 * 0.13) % 1) * ww, f.y * wh, f.r, 0, 7); ctx.fill(); });
        } else {
          ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 10; i++) ctx.fillRect((i * 37) % 100 / 100 * ww, (i * 53) % 60 / 100 * wh, 1.5, 1.5);
        }
      }
      ctx.restore();
      ctx.fillStyle = frame || '#FFFFFF'; ctx.fillRect(ww / 2 - 2, 0, 4, wh); ctx.fillRect(0, wh / 2 - 2, ww, 4);
    });
  }
  function signOn(x, z, w, bg, fg, lines) {
    onRightWall(x, z, () => {
      rr(0, 0, w, 26, 6); ctx.fillStyle = bg; ctx.fill();
      ctx.fillStyle = fg; ctx.font = `800 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((l, i) => ctx.fillText(l, w / 2, lines.length === 1 ? 13 : 8 + i * 11));
    });
  }
  function glow(x, y, z, r, col) {
    const c = P(x, y, z), g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 7); ctx.fill();
  }

  const THEMES = {
    // 1. いまのモックの部屋（夕方）
    classic: {
      bg: '#FDF6EC', sitZ: 14,
      floor: (x, y) => (x === 5 || x === 6) ? ((x + y) % 2 ? '#F7C6D3' : '#F9D3DE') : ((x + y) % 2 ? '#F4E3C6' : '#F9ECD5'),
      edge: ['#D9B98F', '#C9A77B'], wallL: '#DDF0F6', wallR: '#C8E6EF', base: ['#B9D3DC', '#A9C8D2'],
      extra: [{ x: 0, y: 2, kind: 'shelf' }, { x: 0, y: 3, kind: 'shelf' }, { x: 0, y: 0, kind: 'plant' }, { x: 11, y: 0, kind: 'plant' }, { x: 0, y: 8, kind: 'water' }, { x: 11, y: 4, kind: 'plant' }],
      decor(t) { windowOn(1.4, 4.4, 104, 'evening', t); windowOn(7.6, 10.6, 104, 'evening', t); signOn(5.1, 112, 58, '#FF7FA8', '#fff', ['しずかに', '勉強中']); },
      desk: ['#F6DCB2', '#D9A86C', '#C89058'], lamp: false,
      chair(s) { const { x, y } = s; isoBox(x + 0.28, y + 0.3, x + 0.72, y + 0.72, 0, 12, '#FFB3C8', '#F08AA8', '#E27798'); isoBox(x + 0.28, y + 0.2, x + 0.72, y + 0.3, 0, 34, '#FFB3C8', '#F08AA8', '#E27798'); },
    },
    // 2. 会津の雪の夜（窓から雪山とお城、机にスタンド）
    aizu: {
      bg: '#1E2236', sitZ: 14,
      floor: (x, y) => (x + y) % 2 ? '#8A6446' : '#94704F',
      edge: ['#5E4230', '#4E3626'], wallL: '#E9DCC6', wallR: '#DCCDB4', base: ['#7A5A40', '#6A4C34'],
      extra: [{ x: 0, y: 2, kind: 'shelf' }, { x: 0, y: 3, kind: 'shelf' }, { x: 0, y: 8, kind: 'stove' }, { x: 11, y: 0, kind: 'plant' }, { x: 0, y: 0, kind: 'akabeko' }],
      decor(t) {
        windowOn(1.2, 4.6, 106, 'snow', t, '#6A4C34'); windowOn(7.4, 10.8, 106, 'snow', t, '#6A4C34');
        signOn(5.0, 116, 62, '#00A86B', '#fff', ['21時', 'みんなで勉強']);
        onLeftWall(5.2, 98, () => { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 54, 40); ctx.fillStyle = '#C0392B'; ctx.fillRect(0, 0, 54, 10);
          ctx.fillStyle = '#333'; ctx.font = `800 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const d = new Date(); ctx.fillText(`${d.getMonth() + 1}月`, 27, 5); ctx.font = `800 16px ${FONT}`; ctx.fillText(String(d.getDate()), 27, 26); });
      },
      desk: ['#C79A6B', '#9C6C3E', '#8A5C32'], lamp: '#FFE7A0',
      chair(s) { const { x, y } = s; isoBox(x + 0.28, y + 0.3, x + 0.72, y + 0.72, 0, 12, '#B5503C', '#8F3A2A', '#7E3122'); isoBox(x + 0.28, y + 0.2, x + 0.72, y + 0.3, 0, 34, '#B5503C', '#8F3A2A', '#7E3122'); },
      night: true,
    },
    // 3. 和室（たたみ・ちゃぶ台・ざぶとん）
    washitsu: {
      bg: '#F4EEDD', sitZ: 4,
      floor: (x, y) => ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? '#C9D39A' : '#BFCB8E'),
      edge: ['#8E7A55', '#7E6A47'], wallL: '#F6EFE0', wallR: '#EFE6D2', base: ['#8E7A55', '#7E6A47'],
      extra: [{ x: 0, y: 0, kind: 'akabeko' }, { x: 0, y: 4, kind: 'tansu' }, { x: 11, y: 0, kind: 'plant' }, { x: 0, y: 8, kind: 'tea' }],
      decor(t) {
        // しょうじ
        [[1.2, 4.6], [7.4, 10.8]].forEach(([a, b]) => onRightWall(a, 108, () => {
          const ww = (b - a) * TW / 2; ctx.fillStyle = '#FFFDF5'; ctx.fillRect(0, 0, ww, 72); ctx.strokeStyle = '#A3845A'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, ww, 72);
          ctx.lineWidth = 1; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(ww * i / 6, 0); ctx.lineTo(ww * i / 6, 72); ctx.stroke(); } for (let j = 1; j < 4; j++) { ctx.beginPath(); ctx.moveTo(0, 72 * j / 4); ctx.lineTo(ww, 72 * j / 4); ctx.stroke(); }
        }));
        // かけじく
        onRightWall(5.3, 118, () => { ctx.fillStyle = '#7E6A47'; ctx.fillRect(0, 0, 40, 4); ctx.fillStyle = '#FFFBEF'; ctx.fillRect(4, 4, 32, 64); ctx.fillStyle = '#7E6A47'; ctx.fillRect(0, 68, 40, 4);
          ctx.fillStyle = '#222'; ctx.font = `800 14px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('合', 20, 22); ctx.fillText('格', 20, 44); });
      },
      desk: ['#7A4A2A', '#5C3820', '#4E2E1A'], low: true, lamp: false,
      chair(s) { const { x, y } = s; isoBox(x + 0.18, y + 0.2, x + 0.82, y + 0.8, 0, 6, '#5B6FD0', '#4558B8', '#3C4EA8'); },
    },
    // 4. 図書館（本棚・緑のスタンド・じゅうたん）
    library: {
      bg: '#F3ECE0', sitZ: 14,
      floor: (x, y) => (x === 5 || x === 6) ? ((x + y) % 2 ? '#9C3B3B' : '#A64444') : (((x + y) % 2) ? '#C99A66' : '#D4A774'),
      edge: ['#8A6446', '#7A5638'], wallL: '#F1E6CF', wallR: '#E8DBC0', base: ['#8A6446', '#7A5638'],
      extra: [{ x: 0, y: 1, kind: 'shelf' }, { x: 0, y: 2, kind: 'shelf' }, { x: 0, y: 3, kind: 'shelf' }, { x: 0, y: 6, kind: 'shelf' }, { x: 0, y: 7, kind: 'shelf' }, { x: 0, y: 8, kind: 'shelf' }, { x: 11, y: 4, kind: 'plant' }],
      decor(t) {
        // 右の壁いっぱいの本棚
        onRightWall(0.4, 118, () => {
          const ww = 11.2 * TW / 2; ctx.fillStyle = '#7A5638'; ctx.fillRect(0, 0, ww, 108);
          const cols = ['#5B8DEF', '#F0675A', '#46C2A6', '#FFC94D', '#A08CE0', '#E8E2D0', '#3E6E9C'];
          for (let r = 0; r < 4; r++) for (let i = 0; i < 60; i++) { if ((i + r * 7) % 13 === 0) continue; ctx.fillStyle = cols[(i * 3 + r) % 7]; const bw = ww / 60; ctx.fillRect(i * bw + 1, r * 27 + 4 + ((i * 5) % 4), bw - 1.5, 21 - ((i * 5) % 4)); }
          ctx.fillStyle = '#5E4230'; for (let r = 0; r <= 4; r++) ctx.fillRect(0, r * 27, ww, 3);
        });
        signOn(5.0, 128, 60, '#2E5E4E', '#F6E7B0', ['しずかに']);
      },
      desk: ['#B07B48', '#8A5C32', '#7A4E28'], lamp: '#2E8B57',
      chair(s) { const { x, y } = s; isoBox(x + 0.28, y + 0.3, x + 0.72, y + 0.72, 0, 12, '#9C6C3E', '#7A5232', '#6A4428'); isoBox(x + 0.28, y + 0.2, x + 0.72, y + 0.3, 0, 34, '#9C6C3E', '#7A5232', '#6A4428'); },
    },
    // 5. カフェ（黒板・ペンダントライト・植物）
    cafe: {
      bg: '#2B2420', sitZ: 18,
      floor: (x, y) => (x + y) % 2 ? '#6B4A36' : '#75523C',
      edge: ['#4A3226', '#3E2A20'], wallL: '#E7D2BC', wallR: '#C9654B', base: ['#4A3226', '#3E2A20'],
      extra: [{ x: 0, y: 0, kind: 'plant' }, { x: 0, y: 3, kind: 'plant' }, { x: 11, y: 0, kind: 'plant' }, { x: 0, y: 8, kind: 'counter' }, { x: 0, y: 7, kind: 'counter' }, { x: 11, y: 4, kind: 'plant' }],
      decor(t) {
        // レンガ
        onRightWall(0, 128, () => { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; const ww = W * TW / 2;
          for (let r = 0; r < 12; r++) { ctx.beginPath(); ctx.moveTo(0, r * 11); ctx.lineTo(ww, r * 11); ctx.stroke(); for (let i = 0; i < 40; i++) { const bx = i * 22 + (r % 2) * 11; ctx.beginPath(); ctx.moveTo(bx, r * 11); ctx.lineTo(bx, r * 11 + 11); ctx.stroke(); } } });
        // 黒板
        onRightWall(1.4, 108, () => { ctx.fillStyle = '#8A6446'; ctx.fillRect(-4, -4, 120, 68); ctx.fillStyle = '#2F3B34'; ctx.fillRect(0, 0, 112, 60);
          ctx.fillStyle = '#F5F0E0'; ctx.font = `800 10px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('きょうの目標', 8, 6); ctx.font = `500 9px ${FONT}`; ctx.fillText('・英単語 50こ', 8, 22); ctx.fillText('・数学 プリント', 8, 34); ctx.fillStyle = '#FFC94D'; ctx.fillText('みんなで 120時間！', 8, 46); });
        windowOn(7.6, 10.6, 104, 'night', t, '#3E2A20');
        // ペンダントライト
        [[3, 3.2], [8, 3.2], [3, 7.2], [8, 7.2]].forEach(([x, y]) => { const top = P(x + 0.5, y, 200), b = P(x + 0.5, y, 120); ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          ctx.fillStyle = '#E3A92A'; ctx.beginPath(); ctx.moveTo(b[0] - 10, b[1] + 10); ctx.lineTo(b[0] + 10, b[1] + 10); ctx.lineTo(b[0] + 4, b[1]); ctx.lineTo(b[0] - 4, b[1]); ctx.fill();
          glow(x + 0.5, y, 105, 60, 'rgba(255,215,140,.35)'); });
      },
      desk: ['#3E2A20', '#2E1E16', '#26180F'], lamp: false, round: true,
      chair(s) { const { x, y } = s; isoBox(x + 0.36, y + 0.38, x + 0.64, y + 0.64, 0, 20, '#C9A77B', '#A8855C', '#957450'); isoBox(x + 0.26, y + 0.28, x + 0.74, y + 0.74, 20, 24, '#E5683F', '#C8502A', '#B54422'); },
    },
  };
// themes2
  // ===== 追加の内装 =====
  function chairStd(s, c) { const { x, y } = s; isoBox(x + 0.28, y + 0.3, x + 0.72, y + 0.72, 0, 12, c[0], c[1], c[2]); isoBox(x + 0.28, y + 0.2, x + 0.72, y + 0.3, 0, 34, c[0], c[1], c[2]); }
  function stars(w, h, n, seed) { ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < n; i++) { const tw = reduceMotion ? 1 : 0.6 + 0.4 * Math.sin(performance.now() / 600 + i); ctx.globalAlpha = tw; ctx.fillRect(((i * 97 + seed) % 1000) / 1000 * w, ((i * 53 + seed) % 1000) / 1000 * h, 1.6, 1.6); } ctx.globalAlpha = 1; }
  Object.assign(THEMES, {
    // 6. 屋根裏の秘密基地（ななめの天井・ガーランド・天窓）
    attic: {
      bg: '#2A2238', sitZ: 4,
      floor: (x, y) => (y % 2 ? '#B98C5E' : '#C49868'),
      edge: ['#7A5638', '#6A4A30'], wallL: '#E8D2B0', wallR: '#DEC6A0', base: ['#7A5638', '#6A4A30'],
      extra: [{ x: 0, y: 0, kind: 'plant' }, { x: 0, y: 3, kind: 'beanbag' }, { x: 0, y: 8, kind: 'shelf' }, { x: 11, y: 0, kind: 'beanbag' }],
      decor(t) {
        // はり
        for (let i = 1; i < W; i += 3) onRightWall(i, 128, () => { ctx.fillStyle = '#8A6446'; ctx.fillRect(0, 0, 8, 128); });
        // 天窓（星）
        onRightWall(4.6, 116, () => { ctx.fillStyle = '#6A4A30'; ctx.fillRect(-4, -4, 100, 58); const g = ctx.createLinearGradient(0, 0, 0, 50); g.addColorStop(0, '#120E2A'); g.addColorStop(1, '#3A2E6A'); ctx.fillStyle = g; ctx.fillRect(0, 0, 92, 50); stars(92, 50, 20, 7); ctx.fillStyle = '#6A4A30'; ctx.fillRect(44, 0, 4, 50); });
        // ガーランドの電球
        [[0, 0, W, 0, 'R'], [0, 0, 0, H, 'L']].forEach(([x0, y0, x1, y1]) => {
          for (let i = 0; i <= 22; i++) { const f = i / 22, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f, z = 112 - Math.sin(f * Math.PI * 4) * 8 * Math.sign(Math.sin(f * Math.PI * 4)) ; const p = P(x, y, z);
            ctx.fillStyle = ['#FFD36B', '#FF9FC0', '#9BE3C8', '#B9C8FF'][i % 4]; ctx.globalAlpha = reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * 3 + i); ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill(); ctx.globalAlpha = 1; } });
        // ポスター
        onLeftWall(5.2, 104, () => { ctx.fillStyle = '#FF7FA8'; ctx.fillRect(0, 0, 44, 56); ctx.fillStyle = '#fff'; ctx.font = `800 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ひみつ', 22, 20); ctx.fillText('きち', 22, 34); });
      },
      desk: ['#9C6C3E', '#7A5232', '#6A4428'], low: true, lamp: '#FFC94D', night: true,
      chair(s) { const { x, y } = s; isoBox(x + 0.18, y + 0.2, x + 0.82, y + 0.8, 0, 8, '#46C2A6', '#36A88E', '#2E9A80'); },
    },
    // 7. 夜の教室（黒板・時間割・ロッカー）
    school: {
      bg: '#1C2A33', sitZ: 14,
      floor: (x, y) => (x + y) % 2 ? '#C7A67E' : '#D1B189',
      edge: ['#8A6446', '#7A5638'], wallL: '#EDEBE2', wallR: '#E3E0D4', base: ['#7A8C86', '#6A7C76'],
      extra: [{ x: 0, y: 0, kind: 'locker' }, { x: 0, y: 1, kind: 'locker' }, { x: 0, y: 2, kind: 'locker' }, { x: 0, y: 8, kind: 'podium' }, { x: 11, y: 4, kind: 'plant' }],
      decor(t) {
        onRightWall(0.8, 110, () => { ctx.fillStyle = '#7A5638'; ctx.fillRect(-4, -4, 168, 76); ctx.fillStyle = '#2F5A46'; ctx.fillRect(0, 0, 160, 68);
          ctx.fillStyle = '#F5F0E0'; ctx.font = `800 11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; const d = new Date(); ctx.fillText(`${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）　日直 みんな`, 8, 8);
          ctx.font = `500 10px ${FONT}`; ctx.fillText('テストまで あと 7日', 8, 28); ctx.fillStyle = '#FFC94D'; ctx.fillText('夜の自習室 21:00〜', 8, 46);
          ctx.fillStyle = '#fff'; ctx.fillRect(130, 60, 14, 4); });
        windowOn(7.8, 10.8, 104, 'night', t, '#B8C2C0');
        onLeftWall(5.0, 108, () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 60, 52); ctx.strokeStyle = '#999'; ctx.lineWidth = 1; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0, i * 10.4); ctx.lineTo(60, i * 10.4); ctx.stroke(); }
          ctx.fillStyle = '#333'; ctx.font = `700 7px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ['時間割', '国 数 英', '理 社 体', '英 数 国', '自習 自習'].forEach((s, i) => ctx.fillText(s, 30, 5 + i * 10.4)); });
        // 時計
        onLeftWall(8.4, 110, () => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(14, 14, 14, 0, 7); ctx.fill(); ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(14, 4); ctx.moveTo(14, 14); ctx.lineTo(21, 14); ctx.stroke(); });
      },
      desk: ['#E2C79E', '#9AA3A0', '#8A9390'], lamp: false,
      chair(s) { chairStd(s, ['#C8A070', '#9AA3A0', '#8A9390']); },
    },
    // 8. 只見線の車内（両側の窓の外を景色が流れる）
    train: {
      bg: '#DCEFF5', sitZ: 16,
      floor: (x, y) => (x === 5 || x === 6) ? '#9AA3A0' : ((x + y) % 2 ? '#A9B3AF' : '#B3BCB8'),
      edge: ['#3E6E5C', '#2E5E4C'], wallL: '#F2F0E6', wallR: '#EAE7DA', base: ['#3E6E5C', '#2E5E4C'],
      extra: [{ x: 0, y: 0, kind: 'plant' }],
      decor(t) {
        const run = reduceMotion ? 0 : t * 40;
        const scenery = (ww, wh, off) => { const g = ctx.createLinearGradient(0, 0, 0, wh); g.addColorStop(0, '#9FD3F2'); g.addColorStop(1, '#E6F4FA'); ctx.fillStyle = g; ctx.fillRect(0, 0, ww, wh);
          ctx.fillStyle = '#7FB08A'; ctx.beginPath(); ctx.moveTo(0, wh * 0.7); for (let i = 0; i <= 10; i++) ctx.lineTo(ww * i / 10, wh * (0.45 + 0.15 * Math.sin((i * 40 + off * 0.3) / 50))); ctx.lineTo(ww, wh); ctx.lineTo(0, wh); ctx.fill();
          ctx.fillStyle = '#5E9AB8'; ctx.fillRect(0, wh * 0.82, ww, wh * 0.18);
          ctx.fillStyle = '#3F7F4F'; for (let i = 0; i < 6; i++) { const tx = ((i * 37 - off) % ww + ww) % ww; ctx.beginPath(); ctx.moveTo(tx, wh * 0.78); ctx.lineTo(tx + 6, wh * 0.55); ctx.lineTo(tx + 12, wh * 0.78); ctx.fill(); }
          // 鉄橋
          const bx = ((140 - off * 1.5) % (ww * 3) + ww * 3) % (ww * 3) - ww; ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 2; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(bx + k * 16, wh * 0.82); ctx.lineTo(bx + k * 16 + 8, wh * 0.68); ctx.lineTo(bx + k * 16 + 16, wh * 0.82); ctx.stroke(); } };
        [1, 4.2, 7.4].forEach((x0, i) => onRightWall(x0, 104, () => { const ww = 2.6 * TW / 2, wh = 58; ctx.fillStyle = '#3E6E5C'; ctx.fillRect(-4, -4, ww + 8, wh + 8); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, ww, wh); ctx.clip(); scenery(ww, wh, run + i * ww); ctx.restore(); }));
        [1.4, 5.4].forEach((y0, i) => onLeftWall(y0, 104, () => { const ww = 3 * TW / 2, wh = 58; ctx.fillStyle = '#3E6E5C'; ctx.fillRect(-4, -4, ww + 8, wh + 8); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, ww, wh); ctx.clip(); scenery(ww, wh, -run + i * 70 + 200); ctx.restore(); }));
        // つり革
        for (let i = 1; i < 11; i += 1.5) { const a = P(5.5, i, 120), b = P(5.5, i, 96); ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.strokeStyle = '#FFC94D'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b[0], b[1] + 4, 4, 0, 7); ctx.stroke(); }
        signOn(10.9, 124, 26, '#3E6E5C', '#fff', ['只見線']);
      },
      desk: ['#D6CFBF', '#B8B0A0', '#A8A090'], lamp: false, low: false,
      chair(s) { const { x, y } = s; isoBox(x + 0.1, y + 0.2, x + 0.9, y + 0.8, 0, 14, '#3E7FA8', '#2E6A90', '#285E80'); isoBox(x + 0.1, y + 0.1, x + 0.9, y + 0.22, 0, 44, '#3E7FA8', '#2E6A90', '#285E80'); },
    },
    // 9. 屋上の星空（壁なし・フェンス・流れ星）
    rooftop: {
      bg: '#0E1430', sitZ: 14, noWalls: true,
      floor: (x, y) => (x + y) % 2 ? '#5A6478' : '#636E83',
      edge: ['#3A4256', '#30384A'], wallL: '#000', wallR: '#000', base: ['#000', '#000'],
      extra: [{ x: 0, y: 0, kind: 'plant' }, { x: 11, y: 0, kind: 'plant' }, { x: 0, y: 8, kind: 'telescope' }],
      backdrop(t) {
        // 空と星（部屋のうしろ）
        const sky = (draw) => { const a = P(0, H, 220), b = P(W, 0, 220); ctx.save(); ctx.translate(a[0], b[1] - 60); draw(b[0] - a[0], 260); ctx.restore(); };
        sky((w, h) => { stars(w, h, 70, 3); ctx.fillStyle = '#FFF4C2'; ctx.beginPath(); ctx.arc(w * 0.8, 40, 14, 0, 7); ctx.fill(); ctx.fillStyle = '#0E1430'; ctx.beginPath(); ctx.arc(w * 0.8 + 6, 36, 12, 0, 7); ctx.fill();
          if (!reduceMotion) { const k = (t % 6) / 1.2; if (k < 1) { ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.2 + k * 120, 30 + k * 50); ctx.lineTo(w * 0.2 + k * 120 - 30, 30 + k * 50 - 12); ctx.stroke(); } }
          ctx.fillStyle = '#1A2148'; ctx.beginPath(); ctx.moveTo(0, h); for (let i = 0; i <= 12; i++) ctx.lineTo(w * i / 12, h - 50 - 20 * Math.sin(i * 1.3)); ctx.lineTo(w, h); ctx.fill(); });
      },
      decor(t) {
        // フェンス
        const fence = (x0, y0, x1, y1) => { for (let i = 0; i <= 24; i++) { const f = i / 24, p0 = P(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 0), p1 = P(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 48); ctx.strokeStyle = 'rgba(200,210,230,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
          [0, 24, 48].forEach((z) => { const a = P(x0, y0, z), b = P(x1, y1, z); ctx.strokeStyle = '#AEB8CC'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }); };
        fence(0, 0, W, 0); fence(0, 0, 0, H);
        // 星座のライト
        [[2, 0.2], [9, 0.2]].forEach(([x, y]) => glow(x, y, 50, 40, 'rgba(255,230,150,.25)'));
      },
      desk: ['#E8E2D0', '#B8B2A0', '#A8A290'], lamp: '#FFC94D', night: true,
      chair(s) { chairStd(s, ['#7FA8D8', '#5E88B8', '#4E78A8']); },
    },
    // 10. 春の桜（窓の外に満開の桜、花びらが舞う）
    spring: {
      bg: '#FFF4F6', sitZ: 14,
      floor: (x, y) => (x === 5 || x === 6) ? ((x + y) % 2 ? '#CFE8D2' : '#D8EEDA') : ((x + y) % 2 ? '#F6E9D6' : '#FBF1E2'),
      edge: ['#D9B98F', '#C9A77B'], wallL: '#FFF7F2', wallR: '#FBECE6', base: ['#E8C9C0', '#DDBCB2'],
      extra: [{ x: 0, y: 0, kind: 'plant' }, { x: 0, y: 3, kind: 'shelf' }, { x: 11, y: 0, kind: 'plant' }, { x: 0, y: 8, kind: 'water' }],
      decor(t) {
        [[1.2, 4.6], [7.4, 10.8]].forEach(([a, b], k) => onRightWall(a, 108, () => { const ww = (b - a) * TW / 2, wh = 66; ctx.fillStyle = '#fff'; ctx.fillRect(-4, -4, ww + 8, wh + 8);
          const g = ctx.createLinearGradient(0, 0, 0, wh); g.addColorStop(0, '#BFE3FA'); g.addColorStop(1, '#EAF6FD'); ctx.fillStyle = g; ctx.fillRect(0, 0, ww, wh);
          ctx.fillStyle = '#7A5638'; ctx.fillRect(ww * 0.3, wh * 0.55, 6, wh * 0.45); ctx.fillRect(ww * 0.75, wh * 0.6, 5, wh * 0.4);
          ctx.fillStyle = '#FFC1D3'; [[0.3, 0.45, 22], [0.18, 0.55, 14], [0.42, 0.55, 16], [0.75, 0.52, 18], [0.88, 0.62, 12]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(ww * x, wh * y, r, 0, 7); ctx.fill(); });
          ctx.fillStyle = '#FFD9E4'; [[0.26, 0.38, 10], [0.7, 0.45, 9]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(ww * x, wh * y, r, 0, 7); ctx.fill(); });
          ctx.fillStyle = '#fff'; ctx.fillRect(ww / 2 - 2, 0, 4, wh); }));
        signOn(5.1, 116, 58, '#FF7FA8', '#fff', ['新学期', 'がんばろう']);
        // 花びら
        ctx.fillStyle = '#FFB3C8';
        for (let i = 0; i < 18; i++) { const f = ((t * 0.08 + i * 0.137) % 1), x = (i * 0.61) % W, y = f * H, p = P(x, y, 120 - f * 110); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(t + i); ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 2, 0, 0, 7); ctx.fill(); ctx.restore(); }
      },
      desk: ['#F6DCB2', '#D9A86C', '#C89058'], lamp: false,
      chair(s) { chairStd(s, ['#B8E0C2', '#93C9A2', '#80BA90']); },
    },
  });
  const drawProp0 = drawProp;
  drawProp = function (p) {
    const { x, y } = p;
    if (p.kind === 'beanbag') { const c = P(x + 0.5, y + 0.5, 10); ctx.fillStyle = '#F0675A'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 24, 14, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(c[0] - 6, c[1] - 5, 9, 4, -0.3, 0, 7); ctx.fill(); }
    else if (p.kind === 'locker') { isoBox(x + 0.05, y + 0.05, x + 0.6, y + 0.95, 0, 72, '#9AB0BC', '#7E96A3', '#B4C6D0'); isoBox(x + 0.6, y + 0.15, x + 0.62, y + 0.85, 10, 64, '#8AA0AC', '#8AA0AC', '#8AA0AC'); }
    else if (p.kind === 'podium') isoBox(x + 0.15, y + 0.15, x + 0.85, y + 0.85, 0, 36, '#B07B48', '#8A5C32', '#7A4E28');
    else if (p.kind === 'telescope') { const b = P(x + 0.5, y + 0.5, 0), tp = P(x + 0.5, y + 0.5, 40); ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b[0] - 8, b[1]); ctx.lineTo(tp[0], tp[1]); ctx.lineTo(b[0] + 8, b[1]); ctx.stroke(); ctx.save(); ctx.translate(tp[0], tp[1]); ctx.rotate(-0.6); ctx.fillStyle = '#E8E2D0'; ctx.fillRect(-14, -4, 28, 8); ctx.restore(); }
    else drawProp0(p);
  };

  // ===== 床の柄（マス目はそのまま、見た目だけ変える） =====
  // 床の上の座標（1マス=1）で描けるように変形してから描く
  function onFloor(draw) {
    ctx.save(); ctx.transform(TW / 2, TH / 2, -TW / 2, TH / 2, 0, 0);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    draw(); ctx.restore();
  }
  const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  function seam(c, w) { ctx.strokeStyle = c; ctx.lineWidth = w || 0.03; }
  const FLOORS = {
    // フローリング（横に長い板をずらして並べる）
    planks() { onFloor(() => {
      const cols = ['#C99A66', '#C2915C', '#D1A470', '#BE8D58', '#CC9E69'];
      for (let r = 0; r < H * 2; r++) { let x = -rnd(r) * 2, k = 0;
        while (x < W) { const len = 2 + rnd(r * 13 + k) * 2.5; ctx.fillStyle = cols[Math.floor(rnd(r * 7 + k * 3) * 5)]; ctx.fillRect(x, r * 0.5, len, 0.5);
          ctx.fillStyle = 'rgba(90,60,30,.12)'; ctx.fillRect(x + 0.2, r * 0.5 + 0.18, len * 0.6, 0.02);
          seam('rgba(90,60,30,.45)', 0.025); ctx.strokeRect(x, r * 0.5, len, 0.5); x += len; k++; } }
    }); },
    // 寄木（2本ずつ向きを変えた市松）
    parquet() { onFloor(() => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = (x + y) % 2;
        for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#B8834F', '#C69462', '#AD7A48'][(i + x * 2 + y) % 3];
          if (v) ctx.fillRect(x, y + i / 3, 1, 1 / 3); else ctx.fillRect(x + i / 3, y, 1 / 3, 1); }
        seam('rgba(80,50,25,.4)', 0.02);
        for (let i = 0; i <= 3; i++) { ctx.beginPath(); if (v) { ctx.moveTo(x, y + i / 3); ctx.lineTo(x + 1, y + i / 3); } else { ctx.moveTo(x + i / 3, y); ctx.lineTo(x + i / 3, y + 1); } ctx.stroke(); } }
    }); },
    // 大きい石のタイル（2×2マスで1枚、うすい模様）
    stone() { onFloor(() => {
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const k = x * 31 + y;
        ctx.fillStyle = ['#ECE7DF', '#E4DED4', '#F1ECE5'][Math.floor(rnd(k) * 3)]; ctx.fillRect(x, y, 2, 2);
        ctx.strokeStyle = 'rgba(150,140,130,.25)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(x + rnd(k + 1) * 2, y); ctx.bezierCurveTo(x + 0.6, y + 0.8, x + 1.4, y + 0.9, x + 2, y + rnd(k + 2) * 2); ctx.stroke(); }
      seam('#C9C1B5', 0.05); for (let i = 0; i <= W; i += 2) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); } for (let j = 0; j <= H; j += 2) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(W, j); ctx.stroke(); }
    }); },
    // 六角タイル（カフェ・洗面所風）
    hex() { onFloor(() => {
      ctx.fillStyle = '#F4F1EA'; ctx.fillRect(0, 0, W, H);
      const r = 0.42, hw = Math.sqrt(3) * r;
      for (let row = -1; row < H / (1.5 * r) + 1; row++) for (let col = -1; col < W / hw + 1; col++) {
        const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * 1.5 * r, k = row * 57 + col;
        ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94); } ctx.closePath();
        ctx.fillStyle = rnd(k) < 0.12 ? '#7FC4B0' : (rnd(k + 9) < 0.5 ? '#FFFFFF' : '#F7F4EE'); ctx.fill();
      }
    }); },
    // じゅうたん（ふちどり＋もよう）
    carpet() { onFloor(() => {
      ctx.fillStyle = '#5E7FA8'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#4E6E96'; ctx.fillRect(0.4, 0.4, W - 0.8, H - 0.8);
      ctx.fillStyle = '#6F8FB8'; ctx.fillRect(0.6, 0.6, W - 1.2, H - 1.2);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      for (let y = 1.5; y < H - 1; y += 1.5) for (let x = 1.5; x < W - 1; x += 1.5) { ctx.beginPath(); ctx.moveTo(x, y - 0.3); ctx.lineTo(x + 0.3, y); ctx.lineTo(x, y + 0.3); ctx.lineTo(x - 0.3, y); ctx.fill(); }
      ctx.strokeStyle = '#E8C46A'; ctx.lineWidth = 0.06; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    }); },
    // コンクリート（つなぎ目＋点々）
    concrete() { onFloor(() => {
      ctx.fillStyle = '#B9BCBE'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 400; i++) { ctx.fillStyle = rnd(i) < 0.5 ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.08)'; ctx.fillRect(rnd(i + 1) * W, rnd(i + 2) * H, 0.05, 0.05); }
      for (let i = 0; i < 6; i++) { const x = rnd(i + 50) * W, y = rnd(i + 60) * H; const g = ctx.createRadialGradient(x, y, 0, x, y, 1.5); g.addColorStop(0, 'rgba(0,0,0,.06)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
      seam('rgba(90,95,100,.35)', 0.03); for (let i = 0; i <= W; i += 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); } for (let j = 0; j <= H; j += 5) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(W, j); ctx.stroke(); }
    }); },
    // 白黒の市松（大きめ）
    checker() { onFloor(() => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { ctx.fillStyle = (x + y) % 2 ? '#3A3A44' : '#F2EFEA'; ctx.fillRect(x, y, 1, 1); }
    }); },
    // ラグ（木の床の中央に丸いラグ）
    rug() { FLOORS.planks(); onFloor(() => {
      ctx.fillStyle = '#E9A6A0'; ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W * 0.42, H * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#F3C3BC'; ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W * 0.34, H * 0.32, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 0.06; ctx.setLineDash([0.2, 0.2]); ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W * 0.38, H * 0.36, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }); },
    // 芝生（屋外・屋上向け）
    grass() { onFloor(() => {
      ctx.fillStyle = '#8CC47A'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 900; i++) { ctx.fillStyle = rnd(i) < 0.5 ? '#7AB86A' : '#9FD08A'; ctx.fillRect(rnd(i + 3) * W, rnd(i + 7) * H, 0.06, 0.12); }
      ctx.fillStyle = '#D9C9A0'; ctx.fillRect(5, 0, 2, H);
      for (let j = 0; j < H; j += 1) { ctx.fillStyle = '#CDBB8E'; ctx.fillRect(5.1, j + 0.1, 0.85, 0.8); ctx.fillRect(6.05, j + 0.1, 0.85, 0.8); }
    }); },
  };
  let floorStyle = null;

  let T = THEMES.classic;
  function setTheme(name) {
    T = THEMES[name];
    props = seats.map((s) => ({ x: s.x, y: s.y + 1, kind: 'desk', tint: s.idx })).concat(T.extra);
    blocked = new Set(props.map((p) => p.x + ',' + p.y));
  }

  function drawRoom(t) {
    if (T.backdrop) T.backdrop(t);
    if (floorStyle) FLOORS[floorStyle]();
    else for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) poly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], T.floor(x, y));
    if (T === THEMES.washitsu && !floorStyle) { ctx.strokeStyle = 'rgba(80,70,40,.35)'; ctx.lineWidth = 1.5; for (let i = 0; i <= W; i += 2) { const a = P(i, 0), b = P(i, H); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } for (let j = 0; j <= H; j += 2) { const a = P(0, j), b = P(W, j); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
    poly([P(0, H), P(W, H), P(W, H, -14), P(0, H, -14)], T.edge[0]);
    poly([P(W, 0), P(W, H), P(W, H, -14), P(W, 0, -14)], T.edge[1]);
    if (!T.noWalls) {
    poly([P(0, 0), P(0, H), P(0, H, WALLH), P(0, 0, WALLH)], T.wallL);
    poly([P(0, 0), P(W, 0), P(W, 0, WALLH), P(0, 0, WALLH)], T.wallR);
    poly([P(0, 0), P(0, H), P(0, H, 10), P(0, 0, 10)], T.base[0]);
    poly([P(0, 0), P(W, 0), P(W, 0, 10), P(0, 0, 10)], T.base[1]);
    }
    T.decor(t);
    const meSeated = avatars.get(myId)?.seat != null;
    if (!meSeated) seats.forEach((s) => {
      if (seatTaken(s.idx)) return;
      const a = reduceMotion ? 0.55 : 0.4 + Math.sin(t * 4) * 0.25;
      poly([P(s.x + 0.08, s.y + 0.08), P(s.x + 0.92, s.y + 0.08), P(s.x + 0.92, s.y + 0.92), P(s.x + 0.08, s.y + 0.92)], `rgba(70,194,166,${a})`);
    });
  }

  const BOOK = ['#5B8DEF', '#F0675A', '#46C2A6', '#A08CE0'];
  function drawProp(p) {
    const { x, y } = p;
    if (p.kind === 'desk') {
      const [tp, l, r] = T.desk, h = T.low ? 14 : 26;
      if (T.round) { // 丸テーブル
        isoBox(x + 0.45, y + 0.4, x + 0.55, y + 0.6, 0, h, l, l, r);
        const c = P(x + 0.5, y + 0.5, h); ctx.fillStyle = r; ctx.beginPath(); ctx.ellipse(c[0], c[1] + 3, 26, 13, 0, 0, 7); ctx.fill(); ctx.fillStyle = tp; ctx.beginPath(); ctx.ellipse(c[0], c[1], 26, 13, 0, 0, 7); ctx.fill();
        const cup = P(x + 0.7, y + 0.35, h); ctx.fillStyle = '#fff'; ctx.fillRect(cup[0] - 3, cup[1] - 7, 6, 7); ctx.fillStyle = '#8A5C32'; ctx.fillRect(cup[0] - 3, cup[1] - 7, 6, 2);
      } else isoBox(x + 0.04, y + 0.12, x + 0.96, y + 0.9, 0, h, tp, l, r);
      isoBox(x + 0.2, y + 0.3, x + 0.55, y + 0.6, h, h + 3, BOOK[p.tint % 4], '#3A2E3F', '#3A2E3F');
      isoBox(x + 0.22, y + 0.32, x + 0.53, y + 0.58, h + 3, h + 5, '#FFFFFF', '#E6DCEB', '#E6DCEB');
      if (T.lamp) { // 机のスタンド
        isoBox(x + 0.74, y + 0.22, x + 0.78, y + 0.26, h, h + 22, '#333', '#222', '#222');
        isoBox(x + 0.64, y + 0.14, x + 0.88, y + 0.36, h + 20, h + 26, T.lamp, T.lamp, T.lamp);
        glow(x + 0.6, y + 0.45, h, 34, T.night ? 'rgba(255,225,150,.55)' : 'rgba(255,240,190,.4)');
      } else if (!T.low && !T.round) {
        isoBox(x + 0.72, y + 0.2, x + 0.8, y + 0.28, h, h + 20, '#FFC94D', '#E3A92A', '#E3A92A');
        isoBox(x + 0.64, y + 0.14, x + 0.86, y + 0.36, h + 20, h + 26, '#FFE28A', '#FFC94D', '#E3A92A');
      }
    } else if (p.kind === 'shelf') {
      isoBox(x + 0.05, y + 0.05, x + 0.6, y + 0.95, 0, 78, '#C89058', '#B07B48', '#D9A86C');
      ['#5B8DEF', '#F0675A', '#46C2A6', '#FFC94D', '#A08CE0'].forEach((c, i) => {
        isoBox(x + 0.6, y + 0.1 + i * 0.16, x + 0.62, y + 0.24 + i * 0.16, 44, 62, c, c, c);
        isoBox(x + 0.6, y + 0.12 + i * 0.16, x + 0.62, y + 0.24 + i * 0.16, 12, 30, c, c, c);
      });
    } else if (p.kind === 'plant') {
      isoBox(x + 0.3, y + 0.3, x + 0.7, y + 0.7, 0, 18, '#E59A6E', '#C9774A', '#B5653B');
      const c = P(x + 0.5, y + 0.5, 40);
      ctx.fillStyle = '#5DBB7A'; ctx.beginPath(); ctx.arc(c[0], c[1], 16, 0, 7); ctx.fill();
      ctx.fillStyle = '#7ED494'; ctx.beginPath(); ctx.arc(c[0] - 7, c[1] - 6, 9, 0, 7); ctx.arc(c[0] + 8, c[1] - 2, 8, 0, 7); ctx.fill();
    } else if (p.kind === 'water') {
      isoBox(x + 0.25, y + 0.25, x + 0.75, y + 0.75, 0, 40, '#FFFFFF', '#E6DCEB', '#D8CCE0');
      isoBox(x + 0.32, y + 0.32, x + 0.68, y + 0.68, 40, 62, '#BDE6F7', '#9BD3EE', '#8CC7E4');
    } else if (p.kind === 'akabeko') { // 赤べこ
      isoBox(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 0, 22, '#7A5638', '#5E4230', '#4E3626');
      const c = P(x + 0.5, y + 0.5, 34), bob = reduceMotion ? 0 : Math.sin(performance.now() / 300) * 2;
      ctx.fillStyle = '#D23B2E'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 14, 9, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(c[0] + 13, c[1] - 6 + bob, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(c[0] - 4, c[1] - 2, 8, 2); ctx.fillStyle = '#FFD36B'; ctx.beginPath(); ctx.arc(c[0] - 4, c[1] + 2, 1.6, 0, 7); ctx.arc(c[0] + 3, c[1] + 3, 1.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c[0] + 15, c[1] - 8 + bob, 1.6, 0, 7); ctx.fill();
    } else if (p.kind === 'stove') { // 石油ストーブ
      isoBox(x + 0.25, y + 0.25, x + 0.75, y + 0.75, 0, 34, '#E6E6E6', '#BDBDBD', '#A8A8A8');
      glow(x + 0.75, y + 0.5, 18, 26, 'rgba(255,120,60,.55)');
      const k = P(x + 0.5, y + 0.5, 40); ctx.fillStyle = '#C0C0C0'; ctx.beginPath(); ctx.ellipse(k[0], k[1], 8, 4, 0, 0, 7); ctx.fill();
      if (!reduceMotion) { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; const s = performance.now() / 500; ctx.beginPath(); ctx.moveTo(k[0], k[1] - 4); ctx.quadraticCurveTo(k[0] + 5 * Math.sin(s), k[1] - 12, k[0], k[1] - 20); ctx.stroke(); }
    } else if (p.kind === 'tansu') {
      isoBox(x + 0.05, y + 0.05, x + 0.6, y + 1.9, 0, 56, '#8A5C32', '#6E4826', '#9C6C3E');
      for (let i = 0; i < 3; i++) isoBox(x + 0.6, y + 0.2, x + 0.62, y + 1.75, 8 + i * 16, 20 + i * 16, '#7A5232', '#7A5232', '#7A5232');
    } else if (p.kind === 'tea') {
      isoBox(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 0, 12, '#7A4A2A', '#5C3820', '#4E2E1A');
      const c = P(x + 0.5, y + 0.5, 12); ctx.fillStyle = '#3E6E5C'; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 6, 9, 8, 0, 0, 7); ctx.fill();
    } else if (p.kind === 'counter') {
      isoBox(x + 0.05, y + 0.05, x + 0.8, y + 0.95, 0, 40, '#8A6446', '#5E4230', '#4E3626');
      const c = P(x + 0.4, y + 0.5, 40); ctx.fillStyle = '#ddd'; ctx.fillRect(c[0] - 6, c[1] - 14, 12, 14);
    }
  }
  function drawChair(s) { T.chair(s); }

  // 2頭身のアバター（キャラ作成ができたら avatar_table の値で描く。いまは userId から色を決める）
  function drawAvatar(a, t) {
    const id = a.userId;
    const body = BODY[id % BODY.length], hair = HAIR[(id * 7) % HAIR.length], skin = SKIN[(id * 3) % SKIN.length];
    const seated = a.seat != null && a.path.length === 0;
    const walking = a.path.length > 0;
    const c = P(a.px, a.py, 0);
    const X = c[0], base = c[1] - (seated ? T.sitZ : 0) - (walking && !reduceMotion ? Math.abs(Math.sin(t * 12)) * 3 : 0);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 16, 7, 0, 0, 7); ctx.fill();
    if (!seated) { ctx.fillStyle = '#4B3A2C'; ctx.fillRect(X - 8, base - 8, 6, 8); ctx.fillRect(X + 2, base - 8, 6, 8); }
    rr(X - 13, base - 30, 26, 24, 9); ctx.fillStyle = body; ctx.fill();
    const hy = base - 52;
    ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(X, hy - 2, 25, 0, 7); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(X, hy + 4, 21, 19, 0, 0, 7); ctx.fill();
    ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(X, hy - 12, 22, 11, 0, Math.PI, 0); ctx.fill();
    const blink = !reduceMotion && Math.sin(t * 1.3 + id) > 0.985;
    ctx.fillStyle = '#3A2E3F';
    if (seated) { // 勉強中は下を向いている
      ctx.fillRect(X - 9, hy + 8, 6, 2); ctx.fillRect(X + 3, hy + 8, 6, 2);
    } else if (blink) {
      ctx.fillRect(X - 9, hy + 4, 6, 2); ctx.fillRect(X + 3, hy + 4, 6, 2);
    } else {
      ctx.beginPath(); ctx.ellipse(X - 7, hy + 4, 2.6, 3.6, 0, 0, 7); ctx.ellipse(X + 7, hy + 4, 2.6, 3.6, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,120,140,.35)'; ctx.beginPath(); ctx.arc(X - 13, hy + 11, 3.5, 0, 7); ctx.arc(X + 13, hy + 11, 3.5, 0, 7); ctx.fill();
    // なまえ
    const label = a.nickname + (a.away ? '（離席中）' : '');
    ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 14;
    rr(X - w / 2, hy - 46, w, 20, 10); ctx.fillStyle = a.me ? '#00A86B' : 'rgba(255,255,255,.95)'; ctx.fill();
    ctx.fillStyle = a.me ? '#fff' : (a.away ? '#999' : '#333'); ctx.fillText(label, X, hy - 36);
  }

  // マス目の上の道さがし（机・棚などは通れない。イスは目的地のときだけ通れる）
  function bfs(sx, sy, gx, gy) {
    const key = (x, y) => x + ',' + y, prev = new Map([[key(sx, sy), null]]), q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === gx && y === gy) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(k) || blocked.has(k)) continue;
        if (chairTile.has(k) && !(nx === gx && ny === gy)) continue;
        prev.set(k, [x, y]); q.push([nx, ny]);
      }
    }
    const path = []; let cur = [gx, gy];
    if (!prev.has(key(gx, gy))) return [[gx + 0.5, gy + 0.5]];
    while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift([cur[0] + 0.5, cur[1] + 0.5]); cur = prev.get(key(cur[0], cur[1])); }
    return path;
  }
  function walkTo(a, tx, ty) {
    const sx = Math.floor(a.px), sy = Math.floor(a.py);
    if (sx === tx && sy === ty) { a.path = [[tx + 0.5, ty + 0.5]]; return; }
    a.path = bfs(sx, sy, tx, ty);
  }

  // サーバーから届いた「いまの部屋の様子」を反映する
  function setState(members, meId) {
    myId = meId;
    const next = new Map();
    let standIdx = 0;
    members.forEach((m) => {
      let a = avatars.get(m.userId);
      if (!a) a = { userId: m.userId, px: DOOR.x + 0.5, py: DOOR.y + 0.5, path: [], seat: undefined, target: null };
      a.nickname = m.nickname; a.away = m.away; a.me = m.userId === meId;
      const target = m.seat != null ? [seats[m.seat].x, seats[m.seat].y] : STAND[standIdx++ % STAND.length];
      if (!a.target || a.target[0] !== target[0] || a.target[1] !== target[1]) { a.target = target; walkTo(a, target[0], target[1]); }
      a.seat = m.seat;
      next.set(m.userId, a);
    });
    avatars = next;
  }

  function update(dt) {
    for (const a of avatars.values()) {
      if (!a.path.length) continue;
      const [tx, ty] = a.path[0], dx = tx - a.px, dy = ty - a.py, d = Math.hypot(dx, dy), step = 4 * dt;
      if (d <= step) { a.px = tx; a.py = ty; a.path.shift(); } else { a.px += dx / d * step; a.py += dy / d * step; }
    }
  }

  function render(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    drawRoom(t);
    const list = [];
    props.forEach((p) => list.push({ d: p.x + p.y + 1, f: () => drawProp(p) }));
    seats.forEach((s) => list.push({ d: s.x + s.y + 0.9, f: () => drawChair(s) }));
    for (const a of avatars.values()) list.push({ d: a.px + a.py + (a.seat != null ? 0.05 : 0), f: () => drawAvatar(a, t) });
    list.sort((a, b) => a.d - b.d).forEach((o) => o.f());
  }

  let last = 0;
  function frame(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (!reduceMotion) snowF.forEach((f) => { f.y += f.v * dt; if (f.y > 1) { f.y = 0; f.x = Math.random(); } });
    update(dt); render(ts / 1000);
    requestAnimationFrame(frame);
  }

  function onTap(e) {
    const r = canvas.getBoundingClientRect();
    const wx = (e.clientX - r.left - ox) / scale, wy = (e.clientY - r.top - oy) / scale;
    let best = null, bd = 40;
    seats.forEach((s) => {
      const c = P(s.x + 0.5, s.y + 0.5, 16), d = Math.hypot(wx - c[0], (wy - c[1]) * 1.4);
      if (d < bd) { bd = d; best = s; }
    });
    if (best && opts.onSeatTap) opts.onSeatTap(best.idx, seatTaken(best.idx));
  }

  return {
    init(cv, o) {
      canvas = cv; ctx = cv.getContext('2d'); opts = o || {};
      window.addEventListener('resize', () => running && resize());
      this._resize = resize;
      canvas.addEventListener('pointerup', onTap);
    },
    setState,
    start(theme, floor) {
      setTheme(THEMES[theme] ? theme : 'classic'); floorStyle = FLOORS[floor] ? floor : null;
      canvas.parentElement.style.background = T.bg;
      avatars = new Map(); running = true; resize(); requestAnimationFrame(frame);
    },
    stop() { running = false; },
    SEAT_COUNT: seats.length,
    setTheme(n) { setTheme(n); },
    setFloor(f) { floorStyle = f || null; },
    bg(n) { return THEMES[n].bg; },
  };
})();
