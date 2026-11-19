import { review, newCard, sessionQueue } from './src/srs.js';
import { loadState, saveState, emptyState, validateState, MAX_MISTAKES } from './src/store.js';
import { buildMatchRound, buildListenQuestion, buildMeaningQuestion, shuffle } from './src/games.js';
import { canSpeak, speak, onVoicesChanged } from './src/audio.js';

const APP_VERSION = '1.1.0';

const TITLES = {
  review: 'Ôn tập', test: 'Kiểm tra xếp lớp', games: 'Trò chơi',
  mistakes: 'Nhật ký sai', stats: 'Thống kê', settings: 'Cài đặt',
};

const storage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

const app = document.getElementById('app');
const titleEl = document.getElementById('screen-title');
const levelChip = document.getElementById('level-chip');

let words = [];
let state = emptyState();
let tab = 'review';
let reviewSession = null; // { ids: [], index: 0, revealed: false }
let testRun = null;       // { level, items, index, score }
let gameRun = null;       // { match, listen }
let notice = '';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wordById = (id) => words.find((w) => w.id === id);
const persist = () => saveState(storage, state);

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

function setTab(next) {
  tab = next;
  reviewSession = null;
  testRun = null;
  gameRun = null;
  notice = '';
  render();
}

function render() {
  titleEl.textContent = TITLES[tab];
  document.querySelectorAll('.tabbar button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const views = { review: review_, test: test_, games: games_, mistakes: mistakes_, stats: stats_, settings: settings_ };
  app.innerHTML = (notice ? `<div class="notice">${esc(notice)}</div>` : '') + views[tab]();
  bind();
}

// ---------- Ôn tập (SRS) ----------
function review_() {
  if (!reviewSession) {
    const q = sessionQueue(words, state.cards, Date.now(), state.settings.newPerDay);
    reviewSession = { ids: [...q.review, ...q.new], index: 0, revealed: false, done: 0 };
  }
  const s = reviewSession;
  if (s.index >= s.ids.length) {
    return `<div class="card center"><div class="big">Xong bài hôm nay 🎉</div>
      <p class="muted">Đã ôn ${s.done} từ. Quay lại sau để ôn các từ đến hạn.</p>
      <button class="btn primary" data-act="restart-review">Làm lại danh sách</button></div>`;
  }
  const w = wordById(s.ids[s.index]);
  const total = s.ids.length;
  const pct = Math.round((s.index / total) * 100);
  const speakBtn = canSpeak() ? `<button class="speak" data-act="speak" data-text="${esc(w.hanzi)}" aria-label="Nghe">🔊</button>` : '';
  const back = s.revealed
    ? `<div class="center">
         <div class="pinyin">${esc(w.pinyin)} ${speakBtn}</div>
         <div class="big">${esc(w.vi)}</div>
         <div class="muted">${esc(w.en)}</div>
       </div>
       <div class="grade">
         <button class="btn" data-act="grade" data-q="1">Quên<small>1 ngày</small></button>
         <button class="btn" data-act="grade" data-q="3">Khó</button>
         <button class="btn" data-act="grade" data-q="4">Ổn</button>
         <button class="btn" data-act="grade" data-q="5">Dễ</button>
       </div>`
    : `<div class="center" style="margin-top:12px">
         <button class="btn primary block" data-act="reveal">Hiện nghĩa</button>
       </div>`;
  return `<div class="progress"><div style="width:${pct}%"></div></div>
    <p class="muted center">${s.index + 1} / ${total} · HSK ${w.level}</p>
    <div class="card"><div class="hanzi">${esc(w.hanzi)}</div>${back}</div>`;
}

function grade(q) {
  const s = reviewSession;
  const w = wordById(s.ids[s.index]);
  const prev = state.cards[w.id] || newCard(w.id);
  state.cards[w.id] = review(prev, q, Date.now());
  if (q < 3) {
    state.mistakes.push({ id: w.id, at: Date.now(), quality: q });
    state.mistakes = state.mistakes.slice(-MAX_MISTAKES);
  }
  persist();
  s.index += 1;
  s.done += 1;
  s.revealed = false;
  render();
}

// ---------- Kiểm tra xếp lớp ----------
function test_() {
  if (!testRun) {
    const levels = [1, 2, 3, 4];
    return `<div class="card"><p>Chọn cấp để kiểm tra 25 từ ngẫu nhiên (không ảnh hưởng lịch ôn).</p>
      <div class="options">${levels.map((l) => {
        const n = words.filter((w) => w.level === l).length;
        return `<button class="btn" data-act="start-test" data-level="${l}" ${n < 4 ? 'disabled' : ''}>HSK ${l} (${n} từ)</button>`;
      }).join('')}</div></div>${placementSummary()}`;
  }
  if (testRun.index >= testRun.items.length) {
    const pct = Math.round((testRun.score / testRun.items.length) * 100);
    return `<div class="card center"><div class="big">${testRun.score} / ${testRun.items.length} (${pct}%)</div>
      <p class="muted">HSK ${testRun.level}</p>
      <button class="btn primary" data-act="end-test">Xong</button></div>`;
  }
  const q = testRun.items[testRun.index];
  return `<p class="muted center">Câu ${testRun.index + 1} / ${testRun.items.length} · điểm ${testRun.score}</p>
    <div class="card"><div class="hanzi">${esc(q.target.hanzi)}</div>
      <div class="options">${q.options.map((o) => `<button class="btn" data-act="answer-test" data-id="${esc(o.id)}">${esc(o.vi)}</button>`).join('')}</div></div>`;
}

function placementSummary() {
  const p = state.placement;
  if (!p) return '';
  const rows = Object.entries(p).map(([k, v]) => `<li><span>${esc(k.toUpperCase())}</span><span>${v.score}/${v.of}</span></li>`).join('');
  return `<h2>Kết quả gần nhất</h2><ul class="list">${rows}</ul>`;
}

// ---------- Trò chơi ----------
function games_() {
  if (!gameRun) gameRun = { match: buildMatchRound(words, 4), matchSel: null, matched: [], listen: null, listenScore: 0, listenAnswered: null };
  const m = gameRun.match;
  const matchDone = gameRun.matched.length === m.words.length;
  const matchHtml = `<div class="card"><h2 style="margin-top:0">Ghép hán tự và nghĩa</h2>
    <div class="match-grid">
      ${m.hanziOrder.map((w) => `<button class="btn ${gameRun.matched.includes(w.id) ? 'matched' : ''} ${gameRun.matchSel === w.id ? 'selected' : ''}" data-act="pick-hanzi" data-id="${w.id}" ${gameRun.matched.includes(w.id) ? 'disabled' : ''}>${esc(w.hanzi)}</button>`).join('')}
      ${m.meaningOrder.map((w) => `<button class="btn ${gameRun.matched.includes(w.id) ? 'matched' : ''}" data-act="pick-meaning" data-id="${w.id}" ${gameRun.matched.includes(w.id) ? 'disabled' : ''}>${esc(w.vi)}</button>`).join('')}
    </div>
    ${matchDone ? '<div class="center" style="margin-top:12px"><button class="btn primary" data-act="new-match">Vòng mới</button></div>' : ''}
  </div>`;

  if (!gameRun.listen) gameRun.listen = buildListenQuestion(words[Math.floor(Math.random() * words.length)], words);
  const q = gameRun.listen;
  const audioOn = canSpeak();
  const prompt = audioOn
    ? `<div class="center"><button class="btn primary" data-act="speak" data-text="${esc(q.target.hanzi)}">🔊 Nghe</button></div>`
    : `<div class="center"><div class="hanzi" style="font-size:64px">${esc(q.target.hanzi)}</div>
         <p class="muted">Không có giọng đọc tiếng Trung trên máy này. Hiện chữ Hán thay thế.</p></div>`;
  const answered = gameRun.listenAnswered;
  const listenHtml = `<div class="card"><h2 style="margin-top:0">Nghe chọn pinyin · điểm ${gameRun.listenScore}</h2>
    ${prompt}
    <div class="options">${q.options.map((o) => {
      let cls = '';
      if (answered) {
        if (o.id === q.target.id) cls = 'correct';
        else if (o.id === answered) cls = 'wrong';
      }
      return `<button class="btn ${cls}" data-act="answer-listen" data-id="${esc(o.id)}" ${answered ? 'disabled' : ''}>${esc(o.pinyin)}</button>`;
    }).join('')}</div>
    ${answered ? '<div class="center" style="margin-top:12px"><button class="btn primary" data-act="next-listen">Câu tiếp</button></div>' : ''}
  </div>`;
  return matchHtml + listenHtml;
}

// ---------- Nhật ký sai ----------
function mistakes_() {
  if (!state.mistakes.length) return `<div class="card center muted">Chưa có lỗi nào được ghi lại.</div>`;
  const counts = new Map();
  for (const m of state.mistakes) {
    const cur = counts.get(m.id) || { n: 0, last: 0 };
    cur.n += 1;
    cur.last = Math.max(cur.last, m.at);
    counts.set(m.id, cur);
  }
  const rows = [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([id, c]) => {
      const w = wordById(id);
      if (!w) return '';
      return `<li><span><span class="big" style="margin:0">${esc(w.hanzi)}</span> <span class="muted">${esc(w.pinyin)} · ${esc(w.vi)}</span></span><span class="muted">${c.n} lần</span></li>`;
    }).join('');
  return `<ul class="list">${rows}</ul>
    <div class="center" style="margin-top:12px"><button class="btn" data-act="clear-mistakes">Xóa nhật ký</button></div>`;
}

// ---------- Thống kê ----------
function stats_() {
  const cards = Object.values(state.cards).filter((c) => c.seen);
  const now = Date.now();
  const due = cards.filter((c) => c.due <= now).length;
  const learned = cards.filter((c) => c.reps >= 2).length;
  const byLevel = [1, 2, 3, 4].map((l) => {
    const total = words.filter((w) => w.level === l).length;
    const seen = words.filter((w) => w.level === l && state.cards[w.id]?.seen).length;
    return `<li><span>HSK ${l}</span><span>${seen} / ${total} đã học</span></li>`;
  }).join('');
  return `<div class="stat-row">
      <div class="stat"><b>${cards.length}</b><span class="muted">từ đã học</span></div>
      <div class="stat"><b>${learned}</b><span class="muted">đã thuộc</span></div>
      <div class="stat"><b>${due}</b><span class="muted">đến hạn</span></div>
      <div class="stat"><b>${state.mistakes.length}</b><span class="muted">lượt sai</span></div>
    </div>
    <h2>Theo cấp</h2><ul class="list">${byLevel}</ul>`;
}

// ---------- Cài đặt ----------
function settings_() {
  const s = state.settings;
  const audio = canSpeak() ? 'Có giọng đọc tiếng Trung' : 'Không có giọng đọc tiếng Trung (ẩn nút 🔊)';
  return `<div class="card">
      <div class="field"><label for="theme">Giao diện</label>
        <select id="theme" data-act="theme">
          <option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>Theo hệ thống</option>
          <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Sáng</option>
          <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Tối</option>
        </select></div>
      <div class="field"><label for="newPerDay">Số từ mới mỗi ngày</label>
        <input id="newPerDay" type="number" min="1" max="100" value="${s.newPerDay}" data-act="newperday"></div>
      <p class="muted">Âm thanh: ${audio}</p>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Nguồn dữ liệu và bản quyền</h2>
      <p class="muted" style="font-size:14px">Phiên âm và nghĩa tiếng Anh: CC-CEDICT, giấy phép CC BY-SA 4.0. Danh sách từ theo cấp: HSK 2.0. Nghĩa tiếng Việt: biên soạn cho ứng dụng này.</p>
      <p class="muted" style="font-size:14px">Font chữ Hán: Noto Sans SC, giấy phép SIL OFL 1.1.</p>
      <p class="muted" style="font-size:14px">Phiên bản ${APP_VERSION}</p>
    </div>
    <div class="card">
      <button class="btn block" data-act="export">Xuất dữ liệu (JSON)</button>
      <label class="btn block" style="display:flex;align-items:center;justify-content:center;margin-top:10px;cursor:pointer">
        Nhập dữ liệu (JSON)<input type="file" accept="application/json" data-act="import" hidden>
      </label>
      <button class="btn block" style="margin-top:10px;color:var(--bad)" data-act="reset">Xóa toàn bộ tiến độ</button>
    </div>`;
}

// ---------- Event handling ----------
function bind() {
  app.querySelectorAll('[data-act]').forEach((el) => {
    const act = el.dataset.act;
    if (act === 'import') {
      el.addEventListener('change', () => importFile(el.files[0]));
    } else if (act === 'newperday') {
      el.addEventListener('change', () => {
        const n = Number(el.value);
        if (Number.isInteger(n) && n >= 1 && n <= 100) {
          state.settings.newPerDay = n;
          persist();
          notice = 'Đã lưu.';
        } else {
          notice = 'Nhập số từ 1 đến 100.';
          el.value = state.settings.newPerDay;
        }
        render();
      });
    } else if (act === 'theme') {
      // handled below
    } else {
      el.addEventListener('click', () => handle(act, el.dataset));
    }
  });
  const theme = app.querySelector('#theme');
  if (theme) theme.addEventListener('change', () => {
    state.settings.theme = theme.value;
    persist();
    applyTheme();
    notice = 'Đã lưu.';
    render();
  });
}

function handle(act, d) {
  switch (act) {
    case 'reveal': reviewSession.revealed = true; render(); break;
    case 'grade': grade(Number(d.q)); break;
    case 'restart-review': reviewSession = null; render(); break;
    case 'speak': speak(d.text); break;

    case 'start-test': {
      const level = Number(d.level);
      const pool = words.filter((w) => w.level === level);
      const picked = shuffle(pool).slice(0, Math.min(25, pool.length));
      testRun = {
        level,
        index: 0,
        score: 0,
        items: picked.map((w) => ({ ...buildMeaningQuestion(w, pool), target: w })),
      };
      render();
      break;
    }
    case 'answer-test': {
      const q = testRun.items[testRun.index];
      if (d.id === q.target.id) testRun.score += 1;
      testRun.index += 1;
      if (testRun.index >= testRun.items.length) {
        state.placement = {
          ...(state.placement || {}),
          [`hsk${testRun.level}`]: { score: testRun.score, of: testRun.items.length, at: Date.now() },
        };
        persist();
      }
      render();
      break;
    }
    case 'end-test': testRun = null; render(); break;

    case 'pick-hanzi': gameRun.matchSel = d.id; render(); break;
    case 'pick-meaning': {
      if (!gameRun.matchSel) break;
      if (gameRun.matchSel === d.id) gameRun.matched.push(d.id);
      gameRun.matchSel = null;
      render();
      break;
    }
    case 'new-match': gameRun.match = buildMatchRound(words, 4); gameRun.matched = []; gameRun.matchSel = null; render(); break;
    case 'answer-listen': {
      if (gameRun.listenAnswered) break;
      gameRun.listenAnswered = d.id;
      if (d.id === gameRun.listen.target.id) gameRun.listenScore += 1;
      render();
      break;
    }
    case 'next-listen': {
      gameRun.listen = buildListenQuestion(words[Math.floor(Math.random() * words.length)], words);
      gameRun.listenAnswered = null;
      render();
      break;
    }

    case 'clear-mistakes':
      if (confirm('Xóa toàn bộ nhật ký lỗi?')) { state.mistakes = []; persist(); render(); }
      break;

    case 'export': exportData(); break;
    case 'reset':
      if (confirm('Xóa toàn bộ tiến độ? Thao tác này không hoàn tác được.')) {
        const theme = state.settings.theme;
        state = emptyState();
        state.settings.theme = theme;
        persist();
        applyTheme();
        notice = 'Đã xóa tiến độ.';
        render();
      }
      break;
    default: break;
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hsk-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const incoming = validateState(JSON.parse(text));
    if (!incoming) {
      notice = 'File không đúng định dạng sao lưu.';
    } else if (confirm('Thay thế tiến độ hiện tại bằng file này?')) {
      state = incoming;
      persist();
      applyTheme();
      notice = 'Đã nhập dữ liệu.';
    }
  } catch {
    notice = 'Không đọc được file.';
  }
  render();
}

// ---------- Android hardware Back ----------
// Inside the APK: Back leaves the current tab for Ôn tập first, and exits from Ôn tập.
// In a browser this does nothing; the plugin only exists in the Capacitor shell.
function wireAndroidBack() {
  const App = window.Capacitor?.Plugins?.App;
  if (!App?.addListener) return;
  App.addListener('backButton', () => {
    if (tab !== 'review') setTab('review');
    else App.exitApp?.();
  });
}

// ---------- Boot ----------
async function boot() {
  const loaded = loadState(storage);
  state = loaded.state;
  if (loaded.recovered) notice = 'Dữ liệu cũ bị lỗi, đã sao lưu sang khóa hsk-state-backup và khởi tạo lại.';
  applyTheme();

  try {
    const res = await fetch('data/words.json');
    words = await res.json();
  } catch {
    app.innerHTML = '<div class="notice">Không tải được dữ liệu từ vựng.</div>';
    return;
  }

  levelChip.hidden = false;
  levelChip.textContent = `${words.length} từ`;

  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) setTab(b.dataset.tab);
  });

  onVoicesChanged(() => { if (tab === 'review' || tab === 'games' || tab === 'settings') render(); });
  wireAndroidBack();
  render();

  // Service worker is for the browser build only; Capacitor bundles files already.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
