// MySQL への接続（ほかのファイルは require('./db') で使う）
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  timezone: '+09:00',
  connectionLimit: 10,
});

// NOW() や CURDATE()（「今日」の集計）を日本時間にする
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+09:00'"));

module.exports = pool;
