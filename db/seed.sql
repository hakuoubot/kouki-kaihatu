-- 動作確認用の最初のデータ（地区と部屋）。本番の地区データは e-Stat から作りなおします。
INSERT INTO area_table (area_code, area_name, city_code, latitude, longitude, is_target_area) VALUES
 ('07202', '会津若松市', '072028', 37.494800, 139.929800, FALSE),
 ('07421', '会津坂下町', '074217', 37.561300, 139.821500, TRUE),
 ('07368', '南会津町', '073687', 37.200500, 139.773300, TRUE),
 ('07423', '柳津町', '074233', 37.528600, 139.725300, TRUE);
INSERT INTO room_table (room_name, room_type, category, visibility, description, area_code, capacity, owner_user_id, theme, floor_style) VALUES
 ('会津地域の部屋', 'area', '地域', 'public', '会津に住んでいる人の部屋', '07202', 12, 0, 'aizu', NULL),
 ('全国の部屋', 'anonymous', '受験', 'public', '名前を出さずに、だれでも', NULL, 12, 0, 'classic', NULL),
 ('テスト前の部屋', 'user', 'テスト前', 'public', '定期テストまでいっしょに', NULL, 12, 0, 'library', 'carpet');
