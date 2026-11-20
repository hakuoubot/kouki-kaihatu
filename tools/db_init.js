// db/schema.sql と db/seed.sql を流して、テーブルを作りなおす（中のデータは消えます）
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, multipleStatements: true,
  });
  for (const f of ['schema.sql', 'seed.sql']) {
    await conn.query(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8'));
    console.log(`${f} を流しました`);
  }
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
