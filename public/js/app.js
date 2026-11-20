// 画面の切りかえと、サーバーとのやりとり
const $ = (id) => document.getElementById(id);
const SCREENS = ['login', 'signup', 'lobby', 'room'];
const show = (id) => SCREENS.forEach((s) => ($('scr-' + s).hidden = s !== id));
let toastTimer;
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 2400); }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body) {
  const res = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'エラーが起きました');
  return data;
}

let me = null, socket = null, currentRoom = null;
let seatedAt = null, awayMs = 0, awaySince = null, timerId = null;

// ---------- ログイン・新規登録 ----------
$('to-signup').onclick = async (e) => {
  e.preventDefault(); show('signup');
  const areas = await api('/areas');
  $('su-area').innerHTML = '<option value="">住んでいる市町村</option>' +
    areas.map((a) => `<option value="${esc(a.area_code)}">${esc(a.area_name)}</option>`).join('');
};
$('to-login').onclick = (e) => { e.preventDefault(); show('login'); };
$('li-btn').onclick = async () => {
  try { await enter(await api('/login', { loginId: $('li-id').value, password: $('li-pw').value })); } catch (e) { toast(e.message); }
};
$('su-btn').onclick = async () => {
  try {
    await enter(await api('/signup', {
      loginId: $('su-id').value, password: $('su-pw').value, username: $('su-user').value,
      nickname: $('su-nick').value, areaCode: $('su-area').value,
      parentConsent: $('su-parent').checked, termsAgreed: $('su-terms').checked,
    }));
  } catch (e) { toast(e.message); }
};
$('logout').onclick = async () => { await api('/logout', {}); location.reload(); };

async function enter(user) {
  me = { userId: user.userId ?? user.user_id, nickname: user.nickname };
  $('me-name').textContent = me.nickname;
  connect();
  await openLobby();
}

// ---------- 部屋一覧 ----------
async function openLobby() {
  show('lobby');
  const [rooms, today] = await Promise.all([api('/rooms'), api('/me/today')]);
  $('today-min').textContent = today.minutes;
  $('today-tk').textContent = today.tickets;
  $('room-list').innerHTML = rooms.map((r) => `
    <li><button data-id="${r.room_id}" data-name="${esc(r.room_name)}" data-theme="${esc(r.theme || '')}" data-floor="${esc(r.floor_style || '')}">
      <span class="num">${r.here}人</span>
      <span class="cat">${esc(r.category)}</span><b>${esc(r.room_name)}</b>
      <span class="desc">${esc(r.description)}（勉強中 ${r.seated}/${r.capacity}席）</span>
    </button></li>`).join('');
  $('room-list').querySelectorAll('button').forEach((b) => (b.onclick = () => openRoom(Number(b.dataset.id), b.dataset.name, b.dataset.theme, b.dataset.floor)));
}

// ---------- 自習室 ----------
function connect() {
  if (socket) return;
  socket = io();
  socket.on('state', (s) => {
    if (s.roomId !== currentRoom) return;
    Room.setState(s.members, me.userId);
    const seated = s.members.filter((m) => m.seat != null).length;
    $('room-count').textContent = `${s.members.length}人 ・ 勉強中${seated}`;
  });
  socket.on('sat', () => { seatedAt = Date.now(); awayMs = 0; awaySince = null; setSeated(true); toast('着席しました。タイマーが動きはじめます'); });
  socket.on('result', (r) => {
    setSeated(false);
    $('res-min').textContent = r.minutes;
    $('res-tk').textContent = r.tickets > 0 ? `チケットを ${r.tickets}枚 もらいました` : '30分ごとにチケットがもらえます';
    $('result').hidden = false;
  });
  socket.on('error_msg', (t) => toast(t));
  socket.on('kicked', () => { toast('別の画面でこの部屋に入りました'); leaveRoom(); });
  socket.on('connect', () => { if (currentRoom != null) socket.emit('join', currentRoom); }); // つながり直したら入り直す
}

function openRoom(id, name, theme, floor) {
  currentRoom = id;
  $('room-title').textContent = name;
  show('room');
  setSeated(false);
  Room.start(theme, floor);
  socket.emit('join', id);
}
function leaveRoom() {
  if (currentRoom != null) socket.emit('leave');
  currentRoom = null;
  Room.stop();
  setSeated(false);
  openLobby();
}
$('back-lobby').onclick = leaveRoom;
$('stand-btn').onclick = () => socket.emit('stand');
$('res-ok').onclick = () => ($('result').hidden = true);

Room.init($('room-canvas'), {
  onSeatTap(seatNo, taken) {
    if (seatedAt) return toast('いまは勉強中です。立ち上がってから移動してね');
    if (taken) return toast('その席はほかの人が使っています');
    socket.emit('sit', seatNo);
  },
});

function setSeated(on) {
  $('timer-box').hidden = !on;
  $('hint').hidden = on;
  clearInterval(timerId);
  if (!on) { seatedAt = null; return; }
  tick(); timerId = setInterval(tick, 1000);
}
const pad = (n) => String(n).padStart(2, '0');
function tick() {
  if (!seatedAt) return;
  const now = Date.now();
  const sec = Math.floor((now - seatedAt - awayMs - (awaySince ? now - awaySince : 0)) / 1000);
  $('timer').textContent = `${Math.floor(sec / 3600)}:${pad(Math.floor(sec % 3600 / 60))}:${pad(sec % 60)}`;
  $('timer-sub').textContent = `次のチケットまで ${30 - Math.floor(sec / 60) % 30}分`;
}

// 画面を閉じている間はタイマーを止める（サーバーでも同じように止めています）
document.addEventListener('visibilitychange', () => {
  const visible = document.visibilityState === 'visible';
  if (socket && currentRoom != null) socket.emit('visibility', visible);
  if (!seatedAt) return;
  if (!visible && !awaySince) awaySince = Date.now();
  if (visible && awaySince) { awayMs += Date.now() - awaySince; awaySince = null; tick(); }
});

api('/me').then(enter).catch(() => show('login'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
