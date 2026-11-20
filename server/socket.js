// 自習室のリアルタイム通信（Socket.IO）
//  client -> server : join(roomId) / leave / sit(seatNo) / stand / visibility(true|false)
//                     chat(text) / stamp({to, type}) / block(userId) / report({to, reason, detail, alsoBlock})
//  server -> client : state({roomId, capacity, members}) / sat / result({minutes, tickets}) / error_msg(文)
//                     chat({userId, nickname, body, at}) / chat_log([...]) / stamp({from, to, type, fromName})
//                     survey({questionNo, text, options})  ← 座ったとき、今日まだ答えていなければ
//  client -> server : survey_answer({questionNo, answerNo}) / survey_skip
// ブロックした人・された人は、おたがいの画面に出ない（人もチャットもスタンプも）
const db = require('./db');
const live = require('./live');
const { mask } = require('./filter');
const { QUESTIONS, pickQuestion } = require('./survey');

const CHAT_MAX = 40;              // チャット1回の文字数
const CHAT_GAP_MS = 2000;         // 2秒に1回まで
const CHAT_PER_MIN = 10;          // 1分に10回まで
const STAMP_GAP_MS = 30 * 1000;   // 同じ人へのスタンプは30秒に1回まで
const STAMP_TYPES = { 1: 'がんばれ', 2: 'おつかれ', 3: 'いっしょにがんばろう' };
const REPORT_REASONS = [1, 2, 3, 4, 5, 9];

const TICKET_MIN = 30;           // 30分ごとにチケット1枚
const DAILY_CAP_MIN = 12 * 60;   // 1日に数える上限（仮: 12時間）

// 全国(anonymous)の部屋では、自分以外の名前は「名無しさん」にする
function shownName(m, viewerId, anonymous) { return anonymous && m.userId !== viewerId ? '名無しさん' : m.nickname; }
function publicMember(m, viewerId, anonymous) {
  return { userId: m.userId, nickname: shownName(m, viewerId, anonymous), seat: m.seat, away: m.seat != null && !m.visibleSince,
    seatedAt: m.seatedAt || null };
}
// a と b のどちらかがブロックしているか
const blocked = (a, b) => a.blocks.has(b.userId) || b.blocks.has(a.userId);

module.exports = (io) => {
  // 前回サーバーが止まったときに終わっていない記録を閉じる（時間は数えない）
  db.query(`UPDATE study_session_table SET ended_at = NOW(), study_minutes = COALESCE(study_minutes, 0)
             WHERE ended_at IS NULL`).catch((e) => console.error(e.message));

  // 部屋の様子を、1人ずつ「見えてよい人だけ」にしぼって送る
  const broadcast = (roomId) => {
    const r = live.rooms.get(roomId);
    if (!r) return;
    const all = [...r.members.values()];
    for (const viewer of all) {
      io.to(viewer.socketId).emit('state', {
        roomId, capacity: r.capacity,
        members: all.filter((m) => m === viewer || !blocked(viewer, m)).map((m) => publicMember(m, viewer.userId, r.anonymous)),
        // ブロックの相手が座っている席も「使用中」として知らせる（その席には座れないので）
        hiddenSeats: all.filter((m) => m !== viewer && blocked(viewer, m) && m.seat != null).map((m) => m.seat),
      });
    }
  };
  // 部屋の中で、from を見てよい人にだけ送る
  const sendVisible = (roomId, from, event, makePayload) => {
    const r = live.rooms.get(roomId);
    if (!r) return;
    for (const m of r.members.values()) if (m === from || !blocked(m, from)) io.to(m.socketId).emit(event, makePayload(m));
  };
  async function loadBlocks(userId) {
    const [rows] = await db.query(
      'SELECT blocker_user_id AS a, blocked_user_id AS b FROM block_table WHERE blocker_user_id = ? OR blocked_user_id = ?', [userId, userId]);
    return new Set(rows.map((x) => (x.a === userId ? x.b : x.a)));
  }

  // 立ち上がる: 記録を閉じて、時間とチケットを保存する
  async function stand(roomId, m) {
    if (m.seat == null) return null;
    const ms = live.studiedMs(m);
    m.seat = null; m.seatedAt = null; m.visibleSince = null;
    const sessionId = m.sessionId; m.sessionId = null;
    const [[today]] = await db.query(
      `SELECT COALESCE(SUM(study_minutes), 0) AS done FROM study_session_table
        WHERE user_id = ? AND started_at >= CURDATE() AND session_id <> ?`, [m.userId, sessionId]);
    const minutes = Math.max(0, Math.min(Math.floor(ms / 60000), DAILY_CAP_MIN - Number(today.done)));
    const tickets = Math.floor(minutes / TICKET_MIN);
    await db.query(
      'UPDATE study_session_table SET ended_at = NOW(), study_minutes = ?, tickets_earned = ? WHERE session_id = ?',
      [minutes, tickets, sessionId]);
    if (tickets > 0) {
      await db.query(
        `INSERT INTO wallet_table (user_id, ticket_count) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE ticket_count = ticket_count + VALUES(ticket_count)`, [m.userId, tickets]);
    }
    return { minutes, tickets };
  }

  io.on('connection', async (socket) => {
    const userId = socket.request.session?.userId;
    if (!userId) return socket.disconnect(true);
    const [[u]] = await db.query('SELECT nickname, share_timeline FROM user_table WHERE user_id = ?', [userId]);
    if (!u) return socket.disconnect(true);
    let roomId = null;

    const me = () => live.rooms.get(roomId)?.members.get(userId);
    // つかまえたエラーは画面に出して、サーバーは止めない
    const safe = (fn) => async (...args) => {
      try { await fn(...args); } catch (e) { console.error(e); socket.emit('error_msg', 'サーバーでエラーが起きました'); }
    };

    const leave = async () => {
      if (roomId == null) return;
      const r = live.rooms.get(roomId);
      const m = r?.members.get(userId);
      if (m && m.socketId === socket.id) {
        const res = await stand(roomId, m);
        if (res) socket.emit('result', res);
        r.members.delete(userId);
      }
      socket.leave(`room:${roomId}`);
      broadcast(roomId);
      roomId = null;
    };

    socket.on('join', safe(async (id) => {
      await leave();
      const [[room]] = await db.query('SELECT room_id, capacity, visibility, room_type FROM room_table WHERE room_id = ?', [Number(id)]);
      if (!room || room.visibility !== 'public') return socket.emit('error_msg', 'その部屋には入れません');
      roomId = room.room_id;
      const r = live.room(roomId, room.capacity);
      r.anonymous = room.room_type === 'anonymous';
      // 同じ人が別のタブで入っていたら、前のタブを追い出す
      const old = r.members.get(userId);
      if (old) {
        const res = await stand(roomId, old);
        const oldSock = io.sockets.sockets.get(old.socketId);
        if (oldSock) { if (res) oldSock.emit('result', res); oldSock.emit('kicked'); oldSock.leave(`room:${roomId}`); }
      }
      const me0 = { userId, nickname: u.nickname, socketId: socket.id, seat: null,
        sessionId: null, visibleMs: 0, visibleSince: null, blocks: await loadBlocks(userId), chatTimes: [], stampAt: new Map() };
      r.members.set(userId, me0);
      // 最近1時間のチャット（ブロックの相手のものはのぞく）
      const [log] = await db.query(
        `SELECT c.user_id AS userId, u.nickname, c.body, c.sent_at AS at FROM chat_message_table c JOIN user_table u USING (user_id)
          WHERE c.room_id = ? AND c.sent_at >= NOW() - INTERVAL 1 HOUR ORDER BY c.message_id DESC LIMIT 20`, [roomId]);
      socket.emit('chat_log', log.reverse().filter((c) => !me0.blocks.has(c.userId))
        .map((c) => ({ ...c, nickname: r.anonymous && c.userId !== userId ? '名無しさん' : c.nickname })));
      await db.query('INSERT IGNORE INTO room_member_table (room_id, user_id, joined_at) VALUES (?, ?, NOW())', [roomId, userId]);
      socket.join(`room:${roomId}`);
      broadcast(roomId);
    }));

    socket.on('sit', safe(async (seatNo) => {
      const m = me();
      const r = live.rooms.get(roomId);
      seatNo = Number(seatNo);
      if (!m || !Number.isInteger(seatNo) || seatNo < 0 || seatNo >= r.capacity) return;
      if (m.seat != null) return socket.emit('error_msg', 'もう座っています');
      if ([...r.members.values()].some((o) => o.seat === seatNo)) return socket.emit('error_msg', 'その席は使われています');
      m.seat = seatNo; // 先に席を取ってから DB に書く（2人同時に押しても1人だけになる）
      m.seatedAt = Date.now(); m.visibleMs = 0; m.visibleSince = Date.now();
      const [ins] = await db.query(
        `INSERT INTO study_session_table (user_id, room_id, seat_no, started_at, is_shared) VALUES (?, ?, ?, NOW(), ?)`,
        [userId, roomId, seatNo, u.share_timeline ? 1 : 0]);
      m.sessionId = ins.insertId;
      socket.emit('sat', { seat: seatNo });
      broadcast(roomId);
      if (!m.surveySkipped) { const q = await pickQuestion(db, userId); if (q) socket.emit('survey', q); }
    }));

    socket.on('stand', safe(async () => {
      const m = me();
      if (!m) return;
      const res = await stand(roomId, m);
      if (res) socket.emit('result', res);
      broadcast(roomId);
    }));

    // 画面を閉じた・別のアプリに行ったら時間を止める（Page Visibility API）
    socket.on('visibility', (visible) => {
      const m = me();
      if (!m || m.seat == null) return;
      if (visible && !m.visibleSince) m.visibleSince = Date.now();
      if (!visible && m.visibleSince) { m.visibleMs += Date.now() - m.visibleSince; m.visibleSince = null; }
      broadcast(roomId);
    });

    // チャット（連絡先・NGワードは ＊＊＊ にしてから保存・送信）
    socket.on('chat', safe(async (text) => {
      const m = me();
      if (!m) return;
      text = String(text || '').slice(0, CHAT_MAX).trim();
      if (!text) return;
      const now = Date.now();
      m.chatTimes = m.chatTimes.filter((t) => now - t < 60000);
      if (m.chatTimes.length && now - m.chatTimes[m.chatTimes.length - 1] < CHAT_GAP_MS) return socket.emit('error_msg', '少し待ってから送ってね');
      if (m.chatTimes.length >= CHAT_PER_MIN) return socket.emit('error_msg', '送りすぎです。1分ほど待ってね');
      m.chatTimes.push(now);
      const body = mask(text);
      await db.query('INSERT INTO chat_message_table (room_id, user_id, body, sent_at) VALUES (?, ?, ?, NOW())', [roomId, userId, body]);
      const r = live.rooms.get(roomId);
      sendVisible(roomId, m, 'chat', (viewer) => ({ userId, nickname: shownName(m, viewer.userId, r.anonymous), body, at: new Date() }));
    }));

    // がんばれスタンプ
    socket.on('stamp', safe(async ({ to, type } = {}) => {
      const m = me();
      const r = live.rooms.get(roomId);
      const target = r?.members.get(Number(to));
      type = Number(type);
      if (!m || !target || target === m || !STAMP_TYPES[type] || blocked(m, target)) return;
      const last = m.stampAt.get(target.userId) || 0;
      if (Date.now() - last < STAMP_GAP_MS) return socket.emit('error_msg', '同じ人へのスタンプは30秒に1回までです');
      m.stampAt.set(target.userId, Date.now());
      await db.query('INSERT INTO stamp_table (from_user_id, to_user_id, room_id, stamp_type, sent_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, target.userId, roomId, type]);
      // 送った人・受けた人の両方が見える人にだけ、きらきらを見せる
      for (const v of r.members.values()) {
        if ((v !== m && blocked(v, m)) || (v !== target && blocked(v, target))) continue;
        io.to(v.socketId).emit('stamp', { from: userId, to: target.userId, type, label: STAMP_TYPES[type], fromName: shownName(m, v.userId, r.anonymous) });
      }
    }));

    // ブロック（相手には知らせない）
    async function doBlock(targetId) {
      targetId = Number(targetId);
      if (!targetId || targetId === userId) return;
      const [[exists]] = await db.query('SELECT block_id FROM block_table WHERE blocker_user_id = ? AND blocked_user_id = ?', [userId, targetId]);
      if (!exists) await db.query('INSERT INTO block_table (blocker_user_id, blocked_user_id) VALUES (?, ?)', [userId, targetId]);
      const r = live.rooms.get(roomId);
      const m = me();
      if (m) m.blocks.add(targetId);
      const t = r?.members.get(targetId);
      if (t) t.blocks.add(userId);
      if (roomId != null) broadcast(roomId);
    }
    socket.on('block', safe(async (targetId) => { await doBlock(targetId); socket.emit('done_msg', 'ブロックしました。おたがいに見えなくなります'); }));

    // 通報（相手には知らせない）
    socket.on('report', safe(async ({ to, reason, detail, alsoBlock } = {}) => {
      to = Number(to); reason = Number(reason);
      if (!to || to === userId || !REPORT_REASONS.includes(reason)) return socket.emit('error_msg', '理由をえらんでください');
      await db.query(
        `INSERT INTO report_table (reporter_user_id, target_user_id, room_id, reason, detail, also_blocked, status)
         VALUES (?, ?, ?, ?, ?, ?, 1)`, [userId, to, roomId, reason, String(detail || '').slice(0, 100) || null, alsoBlock ? 1 : 0]);
      if (alsoBlock) await doBlock(to);
      socket.emit('done_msg', '通報しました。運営が確認します');
    }));

    // ワンタップ調査の答え（1日1問。答えたらチケット+1）
    socket.on('survey_answer', safe(async ({ questionNo, answerNo } = {}) => {
      questionNo = Number(questionNo); answerNo = Number(answerNo);
      const q = QUESTIONS[questionNo];
      if (!q || !Number.isInteger(answerNo) || answerNo < 1 || answerNo > q.options.length) return;
      const [[today]] = await db.query(
        'SELECT COUNT(*) AS n FROM survey_answer_table WHERE user_id = ? AND answered_at >= CURDATE()', [userId]);
      if (today.n > 0) return socket.emit('error_msg', '今日の質問はもう答えています');
      const [[user]] = await db.query('SELECT area_code FROM user_table WHERE user_id = ?', [userId]);
      await db.query(
        `INSERT INTO survey_answer_table (user_id, area_code, question_no, answer_no, session_id, answered_at) VALUES (?, ?, ?, ?, ?, NOW())`,
        [userId, user.area_code, questionNo, answerNo, me()?.sessionId || null]);
      await db.query(
        `INSERT INTO wallet_table (user_id, ticket_count) VALUES (?, 1) ON DUPLICATE KEY UPDATE ticket_count = ticket_count + 1`, [userId]);
      socket.emit('done_msg', '回答ありがとう！チケット+1');
    }));
    socket.on('survey_skip', () => { const m = me(); if (m) m.surveySkipped = true; }); // 今回の入室中はもう聞かない

    socket.on('leave', safe(leave));
    socket.on('disconnect', safe(leave));
  });
};
