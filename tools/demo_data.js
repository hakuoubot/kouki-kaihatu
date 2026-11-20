// 発表・動作確認用のデモデータを入れる（地区ごとの人数と今週の勉強記録）
//   npm run db:demo
// デモのユーザーはログインできません（login_id が demo_ で始まる）。消すときは npm run db:init で作りなおす。
require('dotenv').config();
const mysql = require('mysql2/promise');

// 地区ごとの人数（5人未満の町は、マップで数字が出ないことを確かめるため）
const PEOPLE = { '07202': 60, '07208': 25, '07421': 14, '07447': 12, '07408': 9, '07368': 8, '07362': 6, '07405': 5, '07423': 5,
  '07367': 3, '07402': 2, '07422': 2, '07407': 3, '07444': 1, '07445': 1, '07446': 1, '07364': 1 };
const NAMES = ['ゆず', 'しずく', 'たろう', 'kei', 'もち', 'そら', 'りん', 'なな', 'はる', 'みお', 'ゆう', 'ひな', 'そうた', 'あおい', 'こはる'];

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  await db.query("SET time_zone = '+09:00'");
  await db.query("DELETE s FROM study_session_table s JOIN user_table u USING (user_id) WHERE u.login_id LIKE 'demo\\_%'");
  await db.query("DELETE FROM user_table WHERE login_id LIKE 'demo\\_%'");
  let n = 0, sessions = 0;
  // 日本時間で考える（パソコンの時計がどの国の設定でも同じになるように）
  const JST = 9 * 3600000, now = Date.now(), jst = new Date(now + JST);
  const dow = (jst.getUTCDay() + 6) % 7; // 月曜=0
  const fmt = (t) => new Date(t + JST).toISOString().slice(0, 19).replace('T', ' ');
  const midnight = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST; // 今日の0時（日本時間）
  for (const [area, count] of Object.entries(PEOPLE)) {
    for (let i = 0; i < count; i++) {
      n++;
      const [r] = await db.query(
        `INSERT INTO user_table (login_id, password_hash, username, nickname, grade, area_code, parent_consent, terms_version, terms_agreed_at)
         VALUES (?, '!', ?, ?, ?, ?, TRUE, '2026-11', NOW())`,
        [`demo_${n}`, `demo_${n}`, NAMES[n % NAMES.length], 1 + (n % 3), area]);
      // 今週の月曜〜今日まで、夜(19〜23時)に何回か勉強したことにする
      for (let d = 0; d <= dow; d++) {
        if (Math.random() < 0.4) continue;
        const h = 19 + Math.floor(Math.random() * 4) + (area === '07202' ? 0 : 1);
        const start = midnight - (dow - d) * 86400000 + (Math.min(h, 23) * 60 + Math.floor(Math.random() * 60)) * 60000;
        if (start > now) continue;
        const min = 20 + Math.floor(Math.random() * 100);
        await db.query(
          `INSERT INTO study_session_table (user_id, room_id, seat_no, started_at, ended_at, study_minutes, is_shared, tickets_earned)
           VALUES (?, 1, NULL, ?, ?, ?, TRUE, ?)`, [r.insertId, fmt(start), fmt(start + min * 60000), min, Math.floor(min / 30)]);
        sessions++;
      }
    }
  }
  console.log(`デモのユーザー ${n}人・勉強記録 ${sessions}件 を入れました`);
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
