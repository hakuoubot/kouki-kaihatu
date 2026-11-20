// いま部屋にいる人の状態（サーバーのメモリ上）。サーバーを止めると消えます。
// rooms: roomId -> { members: Map(userId -> member), capacity }
// member: { userId, nickname, socketId, seat(null|番号), sessionId, visibleMs, visibleSince(null=画面を閉じている) }
const rooms = new Map();

function room(roomId, capacity = 12) {
  if (!rooms.has(roomId)) rooms.set(roomId, { members: new Map(), capacity });
  return rooms.get(roomId);
}
function count(roomId) {
  const r = rooms.get(roomId);
  if (!r) return { here: 0, seated: 0 };
  const ms = [...r.members.values()];
  return { here: ms.length, seated: ms.filter((m) => m.seat != null).length };
}
// 画面を開いていた時間（ミリ秒）
function studiedMs(m, now = Date.now()) {
  return m.visibleMs + (m.visibleSince ? now - m.visibleSince : 0);
}
module.exports = { rooms, room, count, studiedMs };
