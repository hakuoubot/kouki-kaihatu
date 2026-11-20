// 自習室のリアルタイム通信（Socket.IO）
//  client -> server : join(roomId) / leave / sit(seatNo) / stand / visibility(true|false)
//  server -> client : state({roomId, capacity, members}) / sat / result({minutes, tickets}) / error_msg(文)
const db = require('./db');
const live = require('./live');

const TICKET_MIN = 30;           // 30分ごとにチケット1枚
const DAILY_CAP_MIN = 12 * 60;   // 1日に数える上限（仮: 12時間）

function publicMember(m) {
  return { userId: m.userId, nickname: m.nickname, seat: m.seat, away: m.seat != null && !m.visibleSince,
    seatedAt: m.seatedAt || null };
}

module.exports = (io) => {
  // 前回サーバーが止まったときに終わっていない記録を閉じる（時間は数えない）
  db.query(`UPDATE study_session_table SET ended_at = NOW(), study_minutes = COALESCE(study_minutes, 0)
             WHERE ended_at IS NULL`).catch((e) => console.error(e.message));

  const broadcast = (roomId) => {
    const r = live.rooms.get(roomId);
    if (!r) return;
    io.to(`room:${roomId}`).emit('state', {
      roomId, capacity: r.capacity, members: [...r.members.values()].map(publicMember),
    });
  };

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
      const [[room]] = await db.query('SELECT room_id, capacity, visibility FROM room_table WHERE room_id = ?', [Number(id)]);
      if (!room || room.visibility !== 'public') return socket.emit('error_msg', 'その部屋には入れません');
      roomId = room.room_id;
      const r = live.room(roomId, room.capacity);
      // 同じ人が別のタブで入っていたら、前のタブを追い出す
      const old = r.members.get(userId);
      if (old) {
        const res = await stand(roomId, old);
        const oldSock = io.sockets.sockets.get(old.socketId);
        if (oldSock) { if (res) oldSock.emit('result', res); oldSock.emit('kicked'); oldSock.leave(`room:${roomId}`); }
      }
      r.members.set(userId, { userId, nickname: u.nickname, socketId: socket.id, seat: null,
        sessionId: null, visibleMs: 0, visibleSince: null });
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
      if ([...r.members.values()].some((o) => o.seat === seatNo)) return socket.emit('error_msg', '先に座られちゃいました');
      m.seat = seatNo; // 先に席を取ってから DB に書く（2人同時に押しても1人だけになる）
      m.seatedAt = Date.now(); m.visibleMs = 0; m.visibleSince = Date.now();
      const [ins] = await db.query(
        `INSERT INTO study_session_table (user_id, room_id, seat_no, started_at, is_shared) VALUES (?, ?, ?, NOW(), ?)`,
        [userId, roomId, seatNo, u.share_timeline ? 1 : 0]);
      m.sessionId = ins.insertId;
      socket.emit('sat', { seat: seatNo });
      broadcast(roomId);
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

    socket.on('leave', safe(leave));
    socket.on('disconnect', safe(leave));
  });
};
