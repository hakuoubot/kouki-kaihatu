// 地区の陣取りマップの API
// 今週（月曜0時から）の勉強時間を、住んでいる地区ごとに合計する。
// 参加者が5人未満の地区は、だれか分かってしまわないように数字を出さない。
const express = require('express');
const db = require('../db');

const router = express.Router();
const MIN_PEOPLE = 5;

router.get('/map', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'ログインしていません' });
  const weekStart = `DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`;
  const [areas] = await db.query(
    `SELECT a.area_code, a.area_name,
            COUNT(DISTINCT s.user_id) AS people, COALESCE(SUM(s.study_minutes), 0) AS minutes
       FROM area_table a
       LEFT JOIN user_table u ON u.area_code = a.area_code
       LEFT JOIN study_session_table s ON s.user_id = u.user_id AND s.started_at >= ${weekStart} AND s.study_minutes > 0
      GROUP BY a.area_code, a.area_name ORDER BY a.area_code`);
  // いちばん勉強されている時間帯（開始時刻の「時」で数える）
  const [hours] = await db.query(
    `SELECT u.area_code, HOUR(s.started_at) AS h, SUM(s.study_minutes) AS m
       FROM study_session_table s JOIN user_table u USING (user_id)
      WHERE s.started_at >= ${weekStart} AND s.study_minutes > 0
      GROUP BY u.area_code, h ORDER BY m DESC`);
  const topHour = {};
  hours.forEach((r) => { if (topHour[r.area_code] == null) topHour[r.area_code] = r.h; });
  const [[me]] = await db.query('SELECT area_code FROM user_table WHERE user_id = ?', [req.session.userId]);
  const [[mine]] = await db.query(
    `SELECT COALESCE(SUM(study_minutes), 0) AS m FROM study_session_table WHERE user_id = ? AND started_at >= ${weekStart}`, [req.session.userId]);
  res.json({
    myArea: me?.area_code || null,
    myMinutes: Number(mine.m),
    minPeople: MIN_PEOPLE,
    areas: areas.map((a) => {
      const open = a.people >= MIN_PEOPLE;
      return { code: a.area_code, name: a.area_name, open,
        people: open ? a.people : null, minutes: open ? Number(a.minutes) : null, topHour: open ? topHour[a.area_code] ?? null : null };
    }),
  });
});

module.exports = router;
