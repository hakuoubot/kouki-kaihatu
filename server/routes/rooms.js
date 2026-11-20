// 部屋一覧・自分の記録の API
const express = require('express');
const db = require('../db');
const live = require('../live');

const router = express.Router();
router.use((req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'ログインしていません' });
  next();
});

// GET /api/rooms  入れる部屋の一覧（いまいる人数つき）
// いまは「みんな(public)」の部屋だけ。友だちだけ・ルームコードの部屋は部屋を作る機能と一緒に足す。
router.get('/rooms', async (req, res) => {
  const [rows] = await db.query(
    `SELECT room_id, room_name, room_type, category, description, capacity, theme, floor_style
       FROM room_table WHERE visibility = 'public' ORDER BY room_id`);
  res.json(rows.map((r) => ({ ...r, ...live.count(r.room_id) })));
});

// GET /api/me/today  今日の勉強時間とチケット
router.get('/me/today', async (req, res) => {
  const [[s]] = await db.query(
    `SELECT COALESCE(SUM(study_minutes), 0) AS minutes FROM study_session_table
      WHERE user_id = ? AND started_at >= CURDATE()`, [req.session.userId]);
  const [[w]] = await db.query('SELECT ticket_count FROM wallet_table WHERE user_id = ?', [req.session.userId]);
  res.json({ minutes: Number(s.minutes), tickets: w ? w.ticket_count : 0 });
});

module.exports = router;
