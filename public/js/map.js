// 地区の陣取りマップ（SVG）。位置は地図ではなく、だいたいの並びの模式図です。
window.JinMap = (function () {
  // area_code -> [列, 行]
  const LAYOUT = {
    '07208': [2, 0], '07402': [3, 0],
    '07405': [0, 1], '07421': [1, 1], '07422': [2, 1], '07407': [3, 1], '07408': [4, 1],
    '07444': [0, 2], '07423': [1, 2], '07447': [2, 2], '07202': [3, 2],
    '07367': [0, 3], '07445': [1, 3], '07446': [2, 3], '07362': [3, 3],
    '07364': [1, 4], '07368': [2, 4],
  };
  const NS = 'http://www.w3.org/2000/svg';
  let data = null, sel = null, svg, info;
  const c0 = [191, 233, 218], c1 = [30, 156, 126];
  function color(a, max) {
    if (!a.open) return '#E6DCEB';
    const t = max > 0 ? Math.sqrt(a.minutes / max) : 0;
    return `rgb(${c0.map((v, i) => Math.round(v + (c1[i] - v) * t)).join(',')})`;
  }
  const hoursText = (m) => (m >= 600 ? Math.round(m / 60) : Math.round(m / 6) / 10) + '時間';
  function el(name, attrs, text) { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function render() {
    svg.textContent = '';
    const max = Math.max(0, ...data.areas.filter((a) => a.open).map((a) => a.minutes));
    data.areas.forEach((a) => {
      const pos = LAYOUT[a.code]; if (!pos) return;
      const x = 4 + pos[0] * 64, y = 4 + pos[1] * 52, mine = a.code === data.myArea, on = a.code === sel;
      const dark = a.open && max > 0 && a.minutes / max > 0.35;
      const g = el('g', { class: 'tile', tabindex: '0', role: 'button', 'aria-label': a.name });
      g.append(el('rect', { x, y, width: 60, height: 48, rx: 10, fill: color(a, max), stroke: on ? '#FF6B35' : (mine ? '#333' : '#fff'), 'stroke-width': on || mine ? 3 : 2 }));
      g.append(el('text', { x: x + 30, y: y + 22, 'text-anchor': 'middle', 'font-size': a.name.length > 4 ? 10 : 11, 'font-weight': 800, fill: dark ? '#fff' : '#333' }, a.name));
      g.append(el('text', { x: x + 30, y: y + 38, 'text-anchor': 'middle', 'font-size': 10, fill: dark ? '#fff' : '#666' }, a.open ? hoursText(a.minutes) : '−'));
      const pick = () => { sel = a.code; render(); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      svg.append(g);
    });
    const a = data.areas.find((x) => x.code === sel);
    info.textContent = '';
    if (!a) return;
    const b = document.createElement('b'); b.textContent = a.name + (a.code === data.myArea ? '（あなたの町）' : ''); info.append(b, document.createElement('br'));
    if (!a.open) info.append(`参加者が${data.minPeople}人未満なので、数字は出していません。`);
    else info.append(`今週 ${hoursText(a.minutes)} ・ 参加 ${a.people}人` + (a.topHour != null ? ` ・ いちばん多い時間 ${a.topHour}時台` : ''));
    if (a.code === data.myArea && data.myMinutes > 0) { info.append(document.createElement('br'), `あなたは今週 ${hoursText(data.myMinutes)} ぬりました`); }
  }
  return {
    init(svgEl, infoEl) { svg = svgEl; info = infoEl; },
    show(d) { data = d; if (!sel || !d.areas.some((a) => a.code === sel)) sel = d.myArea || d.areas[0]?.code; render(); },
  };
})();
