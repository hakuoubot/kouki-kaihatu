// G01 ログイン / G14 新規登録 の API
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();
const TERMS_VERSION = '2026-11';
const MAX_FAIL = 5;       // 5回まちがえたら
const LOCK_MINUTES = 15;  // 15分ログインできない

// POST /api/signup  新規登録
router.post('/signup', async (req, res) => {
  const { loginId, password, username, nickname, areaCode, grade, parentConsent, termsAgreed } = req.body || {};
  if (!loginId || !password || !username || !nickname || !areaCode) {
    return res.status(400).json({ error: '入力されていない項目があります' });
  }
  if (!/^[A-Za-z0-9_]{4,15}$/.test(username)) {
    return res.status(400).json({ error: 'ユーザー名は半角英数字と_で4〜15文字です' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'パスワードは8文字以上です' });
  if (nickname.length > 8) return res.status(400).json({ error: 'なまえは8文字までです' });
  if (!parentConsent || !termsAgreed) {
    return res.status(400).json({ error: '保護者の同意と利用規約への同意が必要です' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      `INSERT INTO user_table (login_id, password_hash, username, nickname, grade, area_code,
         parent_consent, terms_version, terms_agreed_at)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, NOW())`,
      [loginId, hash, username, nickname, grade || null, areaCode, TERMS_VERSION]);
    req.session.userId = r.insertId;
    res.json({ userId: r.insertId, username, nickname });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'そのログインIDかユーザー名はもう使われています' });
    }
    console.error(e);
    res.status(500).json({ error: 'サーバーでエラーが起きました' });
  }
});

// POST /api/login  ログイン
router.post('/login', async (req, res) => {
  const { loginId, password } = req.body || {};
  const [rows] = await db.query(
    'SELECT * FROM user_table WHERE login_id = ? AND is_deleted = FALSE', [loginId || '']);
  const user = rows[0];
  const ng = () => res.status(401).json({ error: 'ログインIDかパスワードがちがいます' });
  if (!user) return ng();
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(423).json({ error: `${LOCK_MINUTES}分ほど待ってからもう一度ためしてください` });
  }
  if (!(await bcrypt.compare(password || '', user.password_hash))) {
    const fails = user.failed_login_count + 1;
    await db.query(
      `UPDATE user_table SET failed_login_count = ?,
         locked_until = IF(? >= ?, NOW() + INTERVAL ? MINUTE, NULL) WHERE user_id = ?`,
      [fails >= MAX_FAIL ? 0 : fails, fails, MAX_FAIL, LOCK_MINUTES, user.user_id]);
    return ng();
  }
  await db.query('UPDATE user_table SET failed_login_count = 0, locked_until = NULL WHERE user_id = ?', [user.user_id]);
  req.session.userId = user.user_id;
  res.json({ userId: user.user_id, username: user.username, nickname: user.nickname });
});

// POST /api/logout
router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

// GET /api/me  ログインしている自分
router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'ログインしていません' });
  const [rows] = await db.query(
    'SELECT user_id, username, nickname, grade, area_code FROM user_table WHERE user_id = ?', [req.session.userId]);
  res.json(rows[0] || null);
});

module.exports = router;
