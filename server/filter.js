// チャット・名前に入った「連絡先」と「NGワード」を ＊＊＊ にかえる
// ・電話番号（全角数字・漢数字まじり・ハイフン/空白入りも）
// ・@ID、URL、メールアドレス、「LINE」「インスタ」などのあとのID
// ・NGワード（server/ng_words.txt に1行1語。ひらがな/カタカナ/大文字小文字のちがいも見る）
const fs = require('fs');
const path = require('path');

const MASK = '＊＊＊';
const NG = fs.readFileSync(path.join(__dirname, 'ng_words.txt'), 'utf8')
  .split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));

// 全角英数→半角、カタカナ→ひらがな、小文字に
function normalize(s) {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
const KANJI_NUM = { '〇': '0', '零': '0', '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9' };

function mask(text) {
  let t = String(text || '').normalize('NFKC').replace(/[\r\n\t]/g, ' ').trim();
  t = t.replace(/https?:\/\/\S+|www\.\S+/gi, MASK);
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, MASK);
  t = t.replace(/@[A-Za-z0-9_.]{2,}/g, MASK);
  t = t.replace(/(?<![A-Za-z])(line|ライン|insta|インスタ|instagram|tiktok|ティックトック|x|twitter|ツイッター|discord|ディスコ)\s*(id)?\s*[:：は]?\s*[A-Za-z0-9_.-]{3,}/gi, MASK);
  // 数字（漢数字・空白・ハイフンまじり）が合計8けた以上つづいたら連絡先とみなす
  t = t.replace(/[0-9〇零一二三四五六七八九][0-9〇零一二三四五六七八九\s\-ー−()（）]{6,}[0-9〇零一二三四五六七八九]/g, (m) => {
    const digits = [...m].map((c) => KANJI_NUM[c] || c).join('').replace(/\D/g, '');
    return digits.length >= 8 ? MASK : m;
  });
  // NGワード: ひらがな化した文の中で見つけて、元の文の同じ位置をかくす（文字数が同じになるよう NFKC 済み）
  const n = normalize(t);
  const hit = new Array(t.length).fill(false);
  for (const w of NG) {
    const nw = normalize(w);
    let i = n.indexOf(nw);
    while (i >= 0) { for (let k = i; k < i + nw.length; k++) hit[k] = true; i = n.indexOf(nw, i + 1); }
  }
  if (hit.some(Boolean)) t = [...t].map((c, i) => (hit[i] ? '＊' : c)).join('');
  return t;
}
function hasProblem(text) { return mask(text) !== String(text || '').normalize('NFKC').trim(); }

module.exports = { mask, hasProblem };
