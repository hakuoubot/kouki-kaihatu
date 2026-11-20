// 画面の動き（いまはログイン・新規登録だけ）
const $ = (id) => document.getElementById(id);
const show = (id) => ['login', 'signup', 'home'].forEach((s) => ($(s).hidden = s !== id));
const msg = (t) => ($('msg').textContent = t || '');

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

function enterHome(me) {
  $('me-name').textContent = me.nickname;
  show('home');
  const socket = io();
  socket.emit('join', 1); // 仮: 会津地域の部屋に入る
  socket.on('members', (list) => ($('members').textContent = list.map((m) => m.nickname).join('、')));
}

$('to-signup').onclick = async (e) => {
  e.preventDefault(); msg(); show('signup');
  const areas = await api('/areas');
  $('su-area').innerHTML = '<option value="">住んでいる市町村</option>' +
    areas.map((a) => `<option value="${a.area_code}">${a.area_name}</option>`).join('');
};
$('to-login').onclick = (e) => { e.preventDefault(); msg(); show('login'); };

$('li-btn').onclick = async () => {
  try { enterHome(await api('/login', { loginId: $('li-id').value, password: $('li-pw').value })); msg(); }
  catch (e) { msg(e.message); }
};
$('su-btn').onclick = async () => {
  try {
    enterHome(await api('/signup', {
      loginId: $('su-id').value, password: $('su-pw').value, username: $('su-user').value,
      nickname: $('su-nick').value, areaCode: $('su-area').value,
      parentConsent: $('su-parent').checked, termsAgreed: $('su-terms').checked,
    }));
    msg();
  } catch (e) { msg(e.message); }
};
$('logout').onclick = async () => { await api('/logout', {}); location.reload(); };

api('/me').then(enterHome).catch(() => show('login'));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
