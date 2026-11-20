// ワンタップ調査の質問（1日1問、座ったときに出す）
// 答えは地区ごとに集計して、市や町に返す（だれが答えたかは出さない）
const QUESTIONS = {
  1: { text: '今日はなぜ家で勉強？', options: ['雪・天気', 'バスがない', '遠い', '施設が閉まってる', '家のほうが楽', 'その他'] },
  2: { text: 'ふだん図書館まで、何で何分？', options: ['徒歩・自転車 〜15分', 'バス 15〜30分', 'バス 30分以上', '家族の送迎', '行ったことがない', 'その他'] },
  3: { text: '開いていたら行きたい場所は？', options: ['近くの公民館', '学校の教室', '図書館（夜まで）', '駅やバス停の近く', '行かない', 'その他'] },
};

// 今日だす質問を決める。今日もう答えた（またはスキップした）なら null。
// 2と3はふだん変わらないので、まだ答えていなければ先に聞く。そのあとは毎日1を聞く。
async function pickQuestion(db, userId) {
  const [[today]] = await db.query(
    'SELECT COUNT(*) AS n FROM survey_answer_table WHERE user_id = ? AND answered_at >= CURDATE()', [userId]);
  if (today.n > 0) return null;
  const [done] = await db.query('SELECT DISTINCT question_no AS q FROM survey_answer_table WHERE user_id = ?', [userId]);
  const answered = new Set(done.map((r) => r.q));
  const no = !answered.has(1) ? 1 : !answered.has(2) ? 2 : !answered.has(3) ? 3 : 1;
  return { questionNo: no, ...QUESTIONS[no] };
}

module.exports = { QUESTIONS, pickQuestion };
