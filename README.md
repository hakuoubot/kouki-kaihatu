# StudyNest（スタディネスト）

地域みんなの自習室。

地方に住み、夜に自習できる場所が近くにない高校生のための、アバターで集まるオンライン自習室アプリです。
（アーバンデータチャレンジ2026 応募作品）

## フォルダ

| フォルダ | 中身 |
| --- | --- |
| `mock/` | 画面イメージのモック（HTML 1ファイル） |
| `docs/` | 設計書（DB設計書 = データレイアウト、画面設計書。Excel と PDF） |
| `server/` | サーバー（Node.js + Express + Socket.IO） |
| `public/` | アプリの画面（HTML / CSS / JavaScript、PWA） |
| `db/` | `schema.sql`（DB設計書から自動で作るテーブル定義）と `seed.sql`（最初のデータ） |
| `tools/` | `make_schema.py`（DB設計書 → schema.sql）、`db_init.js`（テーブルを作りなおす） |

## モックの見かた

1. `mock/studynest_mock.html` を開く
2. 右上の「Download raw file」（↓のアイコン）でダウンロードする
3. ダウンロードしたファイルをダブルクリックすると、ブラウザで動きます

※ モックは見た目と操作感を確かめるためのものです。ほかの人やデータは仮のもので、サーバーにはつながっていません。

## アプリを自分のパソコンで動かす

必要なもの: Node.js 20 以上、MySQL 8（または MariaDB）

1. MySQL にデータベースとユーザーを作る
   ```sql
   CREATE DATABASE studynest CHARACTER SET utf8mb4;
   CREATE USER 'studynest'@'localhost' IDENTIFIED BY 'studynest';
   GRANT ALL ON studynest.* TO 'studynest'@'localhost';
   ```
2. `.env.example` をコピーして `.env` にし、MySQL のパスワードなどを書きかえる
3. 次を実行する
   ```
   npm install
   npm run db:init     # テーブルを作る（中のデータは消えます）
   npm start
   ```
4. ブラウザで http://localhost:3000 を開く

DB設計書（Excel）を直したら `npm run db:schema` で `db/schema.sql` を作りなおし、`npm run db:init` を実行します。

## いまできること

- 新規登録・ログイン・ログアウト（パスワードは bcrypt、5回まちがえると15分ロック）
- 部屋一覧（いまいる人数・勉強中の席数）と、今日の勉強時間・チケット
- 自習室（アイソメの部屋）: 光っているイスをタップ → 歩いて座る → タイマー開始 → 「立ち上がる」で記録を保存
  - 同じ席を2人が同時に押しても、座れるのは1人だけ（サーバーで判定）
  - 画面を閉じている間（別のアプリ・タブ）はタイマーが止まり、ほかの人には「離席中」と出る
  - 30分ごとにチケット1枚。1日に数えるのは12時間まで（仮）
  - 座ったままブラウザを閉じても、その時点までの記録が保存される
- 部屋ごとに内装（10種類）と床（9種類）を変えられる（room_table の theme / floor_style）
