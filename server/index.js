// StudyNest サーバーの入口
require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 },
});
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', require('./routes/auth'));

// 地区の一覧（新規登録の「住んでいる市町村」で使う）
app.get('/api/areas', async (req, res) => {
  const [rows] = await db.query('SELECT area_code, area_name FROM area_table ORDER BY area_code');
  res.json(rows);
});

// Socket.IO でもログイン情報を使えるようにする
io.engine.use(sessionMiddleware);
require('./socket')(io);

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`StudyNest: http://localhost:${port}`));
