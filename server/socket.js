// 自習室のリアルタイム通信（Socket.IO）
// いまは「部屋に入る / 出る / いる人の一覧」だけ。座る・タイマー・スタンプはこのあと足す。
const db = require('./db');

// 部屋ごとにいる人（メモリ上）: roomId -> Map(socketId -> {userId, nickname})
const rooms = new Map();

module.exports = (io) => {
  io.on('connection', async (socket) => {
    const userId = socket.request.session?.userId;
    if (!userId) return socket.disconnect(true);
    const [rows] = await db.query('SELECT nickname FROM user_table WHERE user_id = ?', [userId]);
    const me = { userId, nickname: rows[0]?.nickname || '?' };
    let current = null;

    const members = (roomId) => [...(rooms.get(roomId)?.values() || [])];
    const leave = () => {
      if (current == null) return;
      rooms.get(current)?.delete(socket.id);
      socket.leave(`room:${current}`);
      io.to(`room:${current}`).emit('members', members(current));
      current = null;
    };

    socket.on('join', (roomId) => {
      leave();
      current = Number(roomId);
      if (!rooms.has(current)) rooms.set(current, new Map());
      rooms.get(current).set(socket.id, me);
      socket.join(`room:${current}`);
      io.to(`room:${current}`).emit('members', members(current));
    });
    socket.on('leave', leave);
    socket.on('disconnect', leave);
  });
};
