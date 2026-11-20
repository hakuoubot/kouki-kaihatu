-- このファイルは tools/make_schema.py が DB設計書 から自動で作ります。直接編集しないでください。
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `user_table`;
CREATE TABLE `user_table` (
  `user_id` INT NOT NULL AUTO_INCREMENT COMMENT 'ユーザーID：自動採番',
  `login_id` VARCHAR(50) NOT NULL UNIQUE COMMENT 'ログインID：重複不可。ログインにだけ使い、ほかの人には見せない',
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'パスワード：bcrypt でハッシュ化して保存する',
  `username` VARCHAR(15) NOT NULL UNIQUE COMMENT 'ユーザー名：【追加】友だち申請に使う公開ID。半角英数字と_で4〜15文字、重複不可',
  `nickname` VARCHAR(8) NOT NULL COMMENT 'なまえ：部屋で頭の上に出る名前。本名は登録しない',
  `grade` TINYINT COMMENT '学年：1=高1 2=高2 3=高3 4=中学生 9=その他',
  `area_code` VARCHAR(11) NOT NULL COMMENT '地区コード：area_table.area_code を参照。住所そのものは持たない',
  `show_town` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '市町村を表示：【追加】地域の部屋で名前のあとに市町村を出すか。初期値 TRUE',
  `bio` VARCHAR(30) COMMENT 'ひとこと：【追加】連絡先・NGワードは保存前にチェック',
  `share_timeline` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'タイムライン公開：【追加】自分の記録を友だち・同じ目標の人に出すか。初期値 TRUE',
  `parent_consent` BOOLEAN NOT NULL COMMENT '保護者同意：保護者の同意を得たか',
  `failed_login_count` TINYINT NOT NULL DEFAULT 0 COMMENT 'ログイン失敗回数：【追加】続けてまちがえた回数。成功で0に戻す。初期値 0',
  `locked_until` DATETIME COMMENT 'ロック解除日時：【追加】5回まちがえたら今から15分後を入れ、それまでログインさせない',
  `terms_version` VARCHAR(10) NOT NULL COMMENT '同意した規約の版：【追加】例 2026-11。規約を変えたら再同意してもらう',
  `terms_agreed_at` DATETIME NOT NULL COMMENT '規約同意日時：【追加】利用規約・プライバシーポリシーに同意した日時',
  `notify_friend` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '友だち申請の通知：【追加】設定画面のお知らせ。初期値 TRUE',
  `notify_cheer` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'がんばれの通知：【追加】初期値 TRUE',
  `notify_event` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '勉強タイムの通知：【追加】21時のみんなで勉強タイム。初期値 TRUE',
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '退会フラグ：初期値 FALSE。TRUE のあとはログイン不可',
  `deleted_at` DATETIME COMMENT '退会日時：【追加】退会した日時',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登録日時',
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
  PRIMARY KEY (`user_id`),
  INDEX `idx_login_id` (`login_id`),
  INDEX `idx_username` (`username`),
  INDEX `idx_area_code` (`area_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ユーザー登録テーブル';

DROP TABLE IF EXISTS `avatar_table`;
CREATE TABLE `avatar_table` (
  `avatar_id` INT NOT NULL AUTO_INCREMENT COMMENT 'アバターID：自動採番',
  `user_id` INT NOT NULL COMMENT 'ユーザーID：user_table.user_id を参照。1人1件',
  `hair_style` TINYINT NOT NULL COMMENT '髪型：1〜8',
  `hair_color` TINYINT NOT NULL COMMENT '髪色：1〜10',
  `eyes` TINYINT NOT NULL COMMENT '目：1〜8',
  `brows` TINYINT NOT NULL COMMENT '眉：1〜6',
  `mouth` TINYINT NOT NULL COMMENT '口：1〜7',
  `skin_color` TINYINT NOT NULL COMMENT '肌の色：1〜4',
  `cheeks` TINYINT NOT NULL COMMENT 'ほっぺ：1〜4',
  `glasses` TINYINT NOT NULL COMMENT 'メガネ：0〜3(0=なし)',
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
  PRIMARY KEY (`avatar_id`),
  INDEX `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='アバターテーブル';

DROP TABLE IF EXISTS `goal_table`;
CREATE TABLE `goal_table` (
  `goal_id` INT NOT NULL AUTO_INCREMENT COMMENT '目標ID：自動採番',
  `goal_group` VARCHAR(20) NOT NULL COMMENT 'グループ：受験 / 試験勉強 / 資格・検定 / 就職・公務員 / 習慣・苦手克服',
  `goal_name` VARCHAR(30) NOT NULL COMMENT '目標名：例: 看護・医療系の受験、定期テスト、英検',
  `sort_order` SMALLINT NOT NULL COMMENT '表示順',
  `is_active` BOOLEAN NOT NULL COMMENT '公開フラグ：プロフィールの選択肢に出すか',
  PRIMARY KEY (`goal_id`),
  INDEX `idx_goal_group` (`goal_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='目標マスタテーブル';

DROP TABLE IF EXISTS `user_goal_table`;
CREATE TABLE `user_goal_table` (
  `user_id` INT NOT NULL COMMENT 'ユーザーID：user_table.user_id を参照',
  `goal_id` INT NOT NULL COMMENT '目標ID：goal_table.goal_id を参照。1人でいくつでも選べる(複合主キー)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登録日時',
  PRIMARY KEY (`user_id`, `goal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ユーザー目標テーブル';

DROP TABLE IF EXISTS `friend_table`;
CREATE TABLE `friend_table` (
  `request_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '申請ID：自動採番',
  `from_user_id` INT NOT NULL COMMENT '申請した人：user_table.user_id を参照',
  `to_user_id` INT NOT NULL COMMENT '申請された人：user_table.user_id を参照。ユーザー名の完全一致で探す',
  `status` TINYINT NOT NULL COMMENT '状態：1=申請中 2=友だち 3=削除・解除',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申請日時',
  `responded_at` DATETIME COMMENT '承認日時：承認・削除した日時',
  PRIMARY KEY (`request_id`),
  INDEX `idx_from_user_id` (`from_user_id`),
  INDEX `idx_to_user_id` (`to_user_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='友だちテーブル';

DROP TABLE IF EXISTS `room_table`;
CREATE TABLE `room_table` (
  `room_id` INT NOT NULL AUTO_INCREMENT COMMENT '部屋ID：自動採番',
  `room_name` VARCHAR(16) NOT NULL COMMENT '部屋名：ユーザーが作る部屋は NGワード・連絡先をチェック',
  `room_type` VARCHAR(10) NOT NULL COMMENT '部屋の種類：area(地域の部屋) / anonymous(全国) / friend(なかよし) / user(ユーザーが作った部屋)',
  `category` VARCHAR(20) COMMENT 'カテゴリ：【追加】地域 / 受験 / テスト前 / 資格 / 進路 / 生活 / クラス・部活',
  `visibility` VARCHAR(10) NOT NULL COMMENT '公開範囲：【追加】public(みんな) / friends(友だちだけ) / code(ルームコードを知っている人だけ)',
  `room_code` CHAR(6) UNIQUE COMMENT 'ルームコード：【変更】公開範囲が code のとき。英大文字と数字6桁、重複不可',
  `description` VARCHAR(40) COMMENT '説明：【追加】一覧に出す一言',
  `area_code` VARCHAR(11) COMMENT '地区コード：地域の部屋のときだけ入れる',
  `capacity` TINYINT NOT NULL COMMENT '定員：座席数',
  `owner_user_id` INT COMMENT '作成者ID：ユーザーが作った部屋の作成者',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
  `theme` VARCHAR(20) COMMENT '内装：【追加】部屋の見た目。classic / aizu / washitsu / library / cafe / attic / school / train / rooftop / spring。空なら classic',
  `floor_style` VARCHAR(20) COMMENT '床：【追加】床の柄。planks / parquet / stone / hex / checker / carpet / rug / concrete / grass。空なら内装のまま',
  PRIMARY KEY (`room_id`),
  INDEX `idx_room_type` (`room_type`),
  INDEX `idx_category` (`category`),
  INDEX `idx_visibility` (`visibility`),
  INDEX `idx_room_code` (`room_code`),
  INDEX `idx_area_code` (`area_code`),
  INDEX `idx_owner_user_id` (`owner_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自習室テーブル';

DROP TABLE IF EXISTS `room_member_table`;
CREATE TABLE `room_member_table` (
  `room_id` INT NOT NULL COMMENT '部屋ID：room_table.room_id を参照',
  `user_id` INT NOT NULL COMMENT 'ユーザーID：user_table.user_id を参照(複合主キー)',
  `joined_at` DATETIME NOT NULL COMMENT '参加日時：「参加中の部屋」に出す。初めて入ったときに登録',
  PRIMARY KEY (`room_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='参加中の部屋テーブル';

DROP TABLE IF EXISTS `study_session_table`;
CREATE TABLE `study_session_table` (
  `session_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '記録ID：自動採番',
  `user_id` INT NOT NULL COMMENT 'ユーザーID：user_table.user_id を参照',
  `room_id` INT COMMENT '部屋ID：オンラインの部屋で勉強したとき',
  `seat_no` TINYINT COMMENT '座席番号：座った席(部屋の中の番号)',
  `started_at` DATETIME NOT NULL COMMENT '開始日時：席に座った時刻',
  `ended_at` DATETIME COMMENT '終了日時：勉強中は NULL',
  `study_minutes` SMALLINT COMMENT '勉強時間(分)：座っていて、画面を開いていた時間だけを数える。1日の上限あり',
  `subject` VARCHAR(20) COMMENT '教科：タイムラインに出す',
  `is_shared` BOOLEAN NOT NULL COMMENT 'タイムライン公開：【追加】記録した時点の user_table.share_timeline をコピー',
  `tickets_earned` TINYINT COMMENT '獲得チケット数：30分ごとに1枚',
  PRIMARY KEY (`session_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_room_id` (`room_id`),
  INDEX `idx_started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='勉強記録テーブル';

DROP TABLE IF EXISTS `cheer_table`;
CREATE TABLE `cheer_table` (
  `cheer_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'がんばれID：自動採番',
  `from_user_id` INT NOT NULL COMMENT '送った人：user_table.user_id を参照',
  `session_id` BIGINT NOT NULL COMMENT '勉強記録ID：study_session_table.session_id を参照。同じ記録には1人1回(取り消しで削除)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '送信日時',
  PRIMARY KEY (`cheer_id`),
  INDEX `idx_from_user_id` (`from_user_id`),
  INDEX `idx_session_id` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='タイムラインがんばれテーブル';

DROP TABLE IF EXISTS `stamp_table`;
CREATE TABLE `stamp_table` (
  `stamp_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'スタンプID：自動採番',
  `from_user_id` INT NOT NULL COMMENT '送信者ID：user_table.user_id を参照',
  `to_user_id` INT NOT NULL COMMENT '受信者ID：user_table.user_id を参照',
  `room_id` INT NOT NULL COMMENT '部屋ID：送った部屋',
  `stamp_type` TINYINT NOT NULL COMMENT 'スタンプの種類：1=がんばれ 2=おつかれ 3=いっしょにがんばろう',
  `sent_at` DATETIME NOT NULL COMMENT '送信日時',
  PRIMARY KEY (`stamp_id`),
  INDEX `idx_from_user_id` (`from_user_id`),
  INDEX `idx_to_user_id` (`to_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='スタンプテーブル';

DROP TABLE IF EXISTS `chat_message_table`;
CREATE TABLE `chat_message_table` (
  `message_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'メッセージID：自動採番',
  `room_id` INT NOT NULL COMMENT '部屋ID：room_table.room_id を参照',
  `user_id` INT NOT NULL COMMENT '送信者ID：user_table.user_id を参照',
  `body` VARCHAR(40) NOT NULL COMMENT '本文：電話番号・SNSのID・NGワードは ＊＊＊ に置きかえてから保存',
  `sent_at` DATETIME NOT NULL COMMENT '送信日時：通報の確認のため一定期間だけ残す',
  PRIMARY KEY (`message_id`),
  INDEX `idx_room_id` (`room_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_sent_at` (`sent_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='チャットテーブル';

DROP TABLE IF EXISTS `block_table`;
CREATE TABLE `block_table` (
  `block_id` INT NOT NULL AUTO_INCREMENT COMMENT 'ブロックID：自動採番',
  `blocker_user_id` INT NOT NULL COMMENT 'ブロックした人：user_table.user_id を参照',
  `blocked_user_id` INT NOT NULL COMMENT 'ブロックされた人：スタンプや同じ部屋での表示を止める',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登録日時',
  PRIMARY KEY (`block_id`),
  INDEX `idx_blocker_user_id` (`blocker_user_id`),
  INDEX `idx_blocked_user_id` (`blocked_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ブロックテーブル';

DROP TABLE IF EXISTS `report_table`;
CREATE TABLE `report_table` (
  `report_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '通報ID：自動採番',
  `reporter_user_id` INT NOT NULL COMMENT '通報した人：user_table.user_id を参照。相手には知らせない',
  `target_user_id` INT NOT NULL COMMENT '通報された人：user_table.user_id を参照',
  `room_id` INT COMMENT '部屋ID：起きた部屋',
  `reason` TINYINT NOT NULL COMMENT '理由：【変更】1=悪口・いやがらせ 2=連絡先・SNS 3=会おうと言われた 4=名前・アバター 5=なりすまし 9=その他',
  `detail` VARCHAR(100) COMMENT 'くわしく：【追加】書かなくてもよい',
  `also_blocked` BOOLEAN NOT NULL COMMENT 'ブロックもした：【追加】TRUE なら同時に block_table にも登録した',
  `status` TINYINT NOT NULL COMMENT '対応状況：1=未対応 2=対応中 3=対応済み',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '通報日時',
  `handled_at` DATETIME COMMENT '対応日時',
  PRIMARY KEY (`report_id`),
  INDEX `idx_reporter_user_id` (`reporter_user_id`),
  INDEX `idx_target_user_id` (`target_user_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通報テーブル';

DROP TABLE IF EXISTS `skin_table`;
CREATE TABLE `skin_table` (
  `skin_id` INT NOT NULL AUTO_INCREMENT COMMENT 'きせかえID：自動採番',
  `skin_name` VARCHAR(50) NOT NULL COMMENT 'きせかえ名：例: 図書館の魔法使い',
  `category` VARCHAR(20) NOT NULL COMMENT '種類：服 / 帽子 / アクセサリー',
  `rarity` TINYINT NOT NULL COMMENT 'レア度：【変更】1=N 2=R 3=SR 4=SSR',
  `is_study_limited` BOOLEAN NOT NULL COMMENT '勉強限定：【追加】TRUE ならチケットで引いたときだけ出る',
  `image_path` VARCHAR(255) NOT NULL COMMENT '画像パス',
  `is_active` BOOLEAN NOT NULL COMMENT '公開フラグ：ガチャのラインナップに出すか',
  PRIMARY KEY (`skin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='きせかえマスタテーブル';

DROP TABLE IF EXISTS `user_skin_table`;
CREATE TABLE `user_skin_table` (
  `user_skin_id` INT NOT NULL AUTO_INCREMENT COMMENT '所持ID：自動採番',
  `user_id` INT NOT NULL COMMENT 'ユーザーID：user_table.user_id を参照',
  `skin_id` INT NOT NULL COMMENT 'きせかえID：skin_table.skin_id を参照',
  `is_equipped` BOOLEAN NOT NULL COMMENT '着用中フラグ：自習室のアバターに表示する',
  `obtained_at` DATETIME NOT NULL COMMENT '入手日時',
  PRIMARY KEY (`user_skin_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_skin_id` (`skin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='所持きせかえテーブル';

DROP TABLE IF EXISTS `wallet_table`;
CREATE TABLE `wallet_table` (
  `user_id` INT NOT NULL COMMENT 'ユーザーID：user_table.user_id を参照。1人1件',
  `ticket_count` INT NOT NULL DEFAULT 0 COMMENT 'チケット数：勉強した時間でたまる。初期値 0',
  `gem_count` INT NOT NULL DEFAULT 0 COMMENT 'ジェム数：課金で買う。初期値 0',
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時：【変更】今月の課金額(monthly_spent)は削除。purchase_table のその月の合計で計算する',
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ウォレットテーブル';

DROP TABLE IF EXISTS `purchase_table`;
CREATE TABLE `purchase_table` (
  `purchase_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '購入ID：自動採番',
  `user_id` INT NOT NULL COMMENT 'ユーザーID：user_table.user_id を参照',
  `gem_amount` INT NOT NULL COMMENT '買ったジェム数：100 / 250 / 500',
  `price_yen` INT NOT NULL COMMENT '金額(円)：月の上限(18歳未満は500円)はこの列のその月の合計で確認する',
  `store` VARCHAR(10) NOT NULL COMMENT 'ストア：apple / google / web',
  `transaction_id` VARCHAR(100) NOT NULL UNIQUE COMMENT '取引ID：ストアが発行するID。重複不可(同じ購入で2回ジェムをふやさない)',
  `status` TINYINT NOT NULL COMMENT '状態：1=支払い済み 2=返金',
  `purchased_at` DATETIME NOT NULL COMMENT '購入日時：その月の合計を出すのに使う',
  PRIMARY KEY (`purchase_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_transaction_id` (`transaction_id`),
  INDEX `idx_purchased_at` (`purchased_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ジェム購入テーブル';

DROP TABLE IF EXISTS `pickup_table`;
CREATE TABLE `pickup_table` (
  `pickup_id` INT NOT NULL AUTO_INCREMENT COMMENT 'ピックアップID：自動採番',
  `title` VARCHAR(30) NOT NULL COMMENT 'タイトル：例: 図書館の夜',
  `start_at` DATETIME NOT NULL COMMENT '開始日時：入れかえの時刻。予告は「開始まで」を表示',
  `end_at` DATETIME NOT NULL COMMENT '終了日時：いまの時刻が開始〜終了のものを抽選に使う',
  PRIMARY KEY (`pickup_id`),
  INDEX `idx_start_at` (`start_at`),
  INDEX `idx_end_at` (`end_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ピックアップテーブル';

DROP TABLE IF EXISTS `pickup_item_table`;
CREATE TABLE `pickup_item_table` (
  `pickup_id` INT NOT NULL COMMENT 'ピックアップID：pickup_table.pickup_id を参照',
  `skin_id` INT NOT NULL COMMENT 'きせかえID：skin_table.skin_id を参照(複合主キー)',
  `item_type` TINYINT NOT NULL COMMENT '区分：1=目玉 2=当たり',
  `rate_multiplier` DECIMAL(3,1) NOT NULL COMMENT '出やすさ倍率：目玉 3.0 / 当たり 2.0',
  PRIMARY KEY (`pickup_id`, `skin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ピックアップ対象テーブル';

DROP TABLE IF EXISTS `gacha_log_table`;
CREATE TABLE `gacha_log_table` (
  `log_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '履歴ID：自動採番',
  `user_id` INT NOT NULL COMMENT 'ユーザーID：user_table.user_id を参照',
  `pickup_id` INT COMMENT 'ピックアップID：引いたときに開催中だったもの',
  `pay_type` VARCHAR(6) NOT NULL COMMENT '支払い：ticket / gem',
  `skin_id` INT NOT NULL COMMENT '出たきせかえ：skin_table.skin_id を参照',
  `is_duplicate` BOOLEAN NOT NULL COMMENT 'ダブり：TRUE ならジェム20に変換',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '日時：確率どおりか確認するためにも使う',
  PRIMARY KEY (`log_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ガチャ履歴テーブル';

DROP TABLE IF EXISTS `survey_answer_table`;
CREATE TABLE `survey_answer_table` (
  `answer_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '回答ID：自動採番',
  `user_id` INT NOT NULL COMMENT 'ユーザーID：user_table.user_id を参照(集計にだけ使い、公開しない)',
  `area_code` VARCHAR(11) NOT NULL COMMENT '地区コード：回答時点の area_table.area_code。地区ごとの集計に使う',
  `question_no` TINYINT NOT NULL COMMENT '質問番号：1=なぜ家で勉強 2=図書館まで何で何分 3=開いていたら行きたい場所',
  `answer_no` TINYINT NOT NULL COMMENT '選んだ答え：選択肢の番号(自由入力はなし)',
  `session_id` BIGINT COMMENT '勉強記録ID：study_session_table を参照。座ったときに答えた記録',
  `answered_at` DATETIME NOT NULL COMMENT '回答日時：1日1問まで',
  PRIMARY KEY (`answer_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_area_code` (`area_code`),
  INDEX `idx_question_no` (`question_no`),
  INDEX `idx_answered_at` (`answered_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='調査回答テーブル';

DROP TABLE IF EXISTS `facility_table`;
CREATE TABLE `facility_table` (
  `facility_id` INT NOT NULL AUTO_INCREMENT COMMENT '施設ID：自動採番',
  `facility_name` VARCHAR(50) NOT NULL COMMENT '施設名：例: 會津稽古堂(会津図書館)',
  `facility_type` VARCHAR(20) NOT NULL COMMENT '種類：図書館 / 公民館 / 学習室',
  `address` VARCHAR(100) COMMENT '住所',
  `latitude` DECIMAL(9,6) NOT NULL COMMENT '緯度',
  `longitude` DECIMAL(9,6) NOT NULL COMMENT '経度',
  `open_time` TIME COMMENT '開館時刻',
  `close_time` TIME COMMENT '閉館時刻',
  `seat_count` SMALLINT COMMENT '自習席数',
  `city_code` CHAR(6) NOT NULL COMMENT '市町村コード：全国地方公共団体コード(例: 072028 会津若松市)',
  `source` VARCHAR(100) NOT NULL COMMENT '出典：例: DATA for CITIZEN 公共施設一覧、国土数値情報',
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時：オープンデータを取り込んだ日時',
  PRIMARY KEY (`facility_id`),
  INDEX `idx_city_code` (`city_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自習施設テーブル';

DROP TABLE IF EXISTS `area_table`;
CREATE TABLE `area_table` (
  `area_code` VARCHAR(11) NOT NULL COMMENT '地区コード：e-Stat の小地域コード',
  `area_name` VARCHAR(50) NOT NULL COMMENT '地区名：例: 会津坂下町○○',
  `city_code` CHAR(6) NOT NULL COMMENT '市町村コード：全国地方公共団体コード',
  `student_count` SMALLINT COMMENT '高校生の人数：e-Stat 国勢調査(15〜17歳人口)から集計。利用率の計算に使う',
  `latitude` DECIMAL(9,6) NOT NULL COMMENT '代表点の緯度：地区の中心',
  `longitude` DECIMAL(9,6) NOT NULL COMMENT '代表点の経度：地区の中心',
  `nearest_facility_id` INT COMMENT '最寄り施設ID：facility_table.facility_id を参照',
  `travel_minutes` SMALLINT COMMENT '片道の所要時間(分)：バスの GTFS と道路から計算。節約時間と課題の分析に使う',
  `is_target_area` BOOLEAN NOT NULL COMMENT '対象地区フラグ：片道30分以上なら TRUE(ターゲットの線。30分は仮)',
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
  PRIMARY KEY (`area_code`),
  INDEX `idx_city_code` (`city_code`),
  INDEX `idx_nearest_facility_id` (`nearest_facility_id`),
  INDEX `idx_is_target_area` (`is_target_area`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='地域マスタテーブル';

DROP TABLE IF EXISTS `area_stat_table`;
CREATE TABLE `area_stat_table` (
  `stat_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '集計ID：自動採番',
  `area_code` VARCHAR(11) NOT NULL COMMENT '地区コード：area_table.area_code を参照',
  `stat_date` DATE NOT NULL COMMENT '集計日',
  `hour` TINYINT NOT NULL COMMENT '時間帯：0〜23',
  `user_count` SMALLINT NOT NULL COMMENT '人数：その時間帯に勉強した人数',
  `total_minutes` INT NOT NULL COMMENT '合計勉強時間(分)',
  `after_close_minutes` INT NOT NULL COMMENT '閉館後の勉強時間(分)：【変更】その地区の自習場所が閉まったあとに勉強した時間の合計(市町に返すデータ)',
  `answer_count` SMALLINT NOT NULL COMMENT '回答数：その日・その地区のワンタップ調査の回答数(理由ごとの内訳は survey_answer_table から集計)',
  `is_public` BOOLEAN NOT NULL COMMENT '公開フラグ：人数が5人未満なら FALSE(公開しない)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時：1日1回、study_session_table から作る',
  PRIMARY KEY (`stat_id`),
  INDEX `idx_area_code` (`area_code`),
  INDEX `idx_stat_date` (`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='地域集計テーブル';

SET FOREIGN_KEY_CHECKS = 1;
