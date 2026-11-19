// App entry: loads data, routes "#/area/arg/arg" to a view, and dispatches data-action clicks.
// Areas: home (Hôm nay), hsk (Giáo trình HSK), work (Công việc), practice, stats, settings.
import { initAudio } from "./audio.js";
import {
  app, initState, setRouter, go, rerender, showToast, speak, queueCard, setScope, getState, setState,
} from "./core.js";
import { data, loadData, parseScope, scopeLabel, applyCustomMeanings } from "./data.js";
import { esc, wordSheetHtml } from "./ui.js";
import { viewHome, actions as homeActions } from "./views/home.js";
import { viewHsk, actions as hskActions } from "./views/hsk.js";
import { viewChars, actions as charsActions } from "./views/chars.js";
import { viewWork } from "./views/work.js";
import { viewPractice, actions as practiceActions } from "./views/practice.js";
import { viewReview, viewPlacement, actions as reviewActions } from "./views/review.js";
import { viewStats, actions as statsActions } from "./views/stats.js";
import { viewSettings, handleImport, actions as settingsActions, applyEnglishSetting } from "./views/settings.js";

const sheet = document.getElementById("sheet");

const VIEWS = {
  home: viewHome,
  hsk: viewHsk,
  chars: viewChars,
  work: viewWork,
  practice: viewPractice,
  review: viewReview,
  placement: viewPlacement,
  stats: viewStats,
  settings: viewSettings,
};

// Which nav tab is highlighted for screens that are not tabs themselves.
const NAV_FOR = { review: "home", placement: "hsk" };

function pathParts() {
  return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
}

// The word sheet can open another word from its example sentences; "‹" goes back up the stack.
let sheetCurrent = null;
let sheetStack = [];

function closeSheet() {
  sheet.hidden = true;
  sheet.innerHTML = "";
  sheetCurrent = null;
  sheetStack = [];
}

function openSheet(word) {
  const html = wordSheetHtml(word, sheetStack.length);
  if (!html) return;
  sheetCurrent = word;
  sheet.innerHTML = html;
  sheet.hidden = false;
}

// ---------- press and hold: 2 s shows a small card, 5 s opens the meaning editor ----------
const PEEK_MS = 2000;
const EDIT_MS = 5000;
const MOVE_PX = 10;
let press = null;          // { x, y, hanzi, timers, fired }
let suppressClick = false; // the click that ends a long press must not trigger the tapped control

function hanziOf(el) {
  if (el.dataset.word) return el.dataset.word;
  if (el.dataset.id && data.byId.has(el.dataset.id)) return data.byId.get(el.dataset.id).hanzi;
  return null;
}

function clearPress() {
  if (press) clearTimeout(press.peekTimer), clearTimeout(press.editTimer);
  press = null;
}

function closePeek() {
  document.getElementById("peek")?.remove();
}

function showPeek(hanzi) {
  closePeek();
  const entry = data.lookup.get(hanzi);
  const card = document.createElement("div");
  card.id = "peek";
  card.className = "peek";
  card.innerHTML = `<div class="peek-hz">${esc(hanzi)}</div>
    <div class="pinyin">${esc(entry?.p || "")}</div>
    ${entry?.vi ? `<div class="meaning">${esc(entry.vi)}</div>` : `<div class="muted small">Chưa có nghĩa tiếng Việt</div>`}
    ${entry?.en ? `<div class="meaning-en">${esc(entry.en)}</div>` : ""}`;
  card.addEventListener("pointerdown", closePeek);
  document.body.appendChild(card);
  setTimeout(closePeek, 4000);
}

function openEditor(hanzi) {
  closePeek();
  document.getElementById("editor")?.remove();
  const current = getState().customMeanings[hanzi] ?? data.lookup.get(hanzi)?.vi ?? "";
  const box = document.createElement("div");
  box.id = "editor";
  box.className = "editor";
  box.innerHTML = `<div class="editor-card" role="dialog" aria-label="Nghĩa tiếng Việt">
    <h3>Nghĩa tiếng Việt của <span class="sheet-hz">${esc(hanzi)}</span></h3>
    <p class="small muted">Đối chiếu với hanzii.net nếu không chắc. Để trống rồi lưu để xóa nghĩa đã nhập.</p>
    <textarea id="editor-text" rows="2" maxlength="200">${esc(current)}</textarea>
    <div class="actions row">
      <button class="primary" id="editor-save">Lưu</button>
      <button id="editor-cancel">Hủy</button>
    </div>
  </div>`;
  document.body.appendChild(box);
  box.querySelector("#editor-cancel").addEventListener("click", () => box.remove());
  box.addEventListener("click", (event) => { if (event.target === box) box.remove(); });
  box.querySelector("#editor-save").addEventListener("click", () => {
    const value = box.querySelector("#editor-text").value.trim();
    const custom = { ...getState().customMeanings };
    if (value) custom[hanzi] = value;
    else delete custom[hanzi];
    setState({ ...getState(), customMeanings: custom });
    applyCustomMeanings(custom);
    box.remove();
    if (!sheet.hidden && sheetCurrent === hanzi) openSheet(hanzi);
    rerender();
    showToast(value ? "Đã lưu nghĩa." : "Đã xóa nghĩa.");
  });
  box.querySelector("#editor-text").focus();
}

function bindPressAndHold() {
  document.addEventListener("pointerdown", (event) => {
    const el = event.target.closest("[data-word],[data-id]");
    const hanzi = el && hanziOf(el);
    clearPress();
    closePeek();
    suppressClick = false;
    if (!hanzi) return;
    press = { x: event.clientX, y: event.clientY, hanzi, fired: false };
    press.peekTimer = setTimeout(() => {
      if (!press) return;
      press.fired = true;
      suppressClick = true;
      showPeek(press.hanzi);
    }, PEEK_MS);
    press.editTimer = setTimeout(() => {
      if (!press) return;
      press.fired = true;
      suppressClick = true;
      const { hanzi: target } = press;
      clearPress();
      openEditor(target);
    }, EDIT_MS);
  });
  document.addEventListener("pointermove", (event) => {
    if (!press || press.fired) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_PX) clearPress();
  });
  const release = () => {
    if (!press) return;
    suppressClick = press.fired;
    clearPress();
  };
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  // The click after a long press must not also open the sheet or run the control.
  document.addEventListener("click", (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

function route() {
  const [name, ...args] = pathParts();
  const view = VIEWS[name] ? name : "home";
  // Each area gets its own accent colour (header and bottom bar), see styles.css [data-area].
  document.body.dataset.area = NAV_FOR[view] || view;
  applyEnglishSetting();
  document.querySelectorAll("nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === (NAV_FOR[view] || view));
  });
  closeSheet();
  VIEWS[view](args);
}

const ACTIONS = {
  ...homeActions,
  ...hskActions,
  ...charsActions,
  ...practiceActions,
  ...reviewActions,
  ...statsActions,
  ...settingsActions,
  nav: ({ target }) => go(target),
  speak: ({ text }) => speak(text),
  lookup: ({ word }) => {
    sheetStack = [];
    openSheet(word);
  },
  "lookup-in-sheet": ({ word }) => {
    if (sheetCurrent) sheetStack.push(sheetCurrent);
    openSheet(word);
  },
  "sheet-back": () => {
    const previous = sheetStack.pop();
    if (previous) openSheet(previous);
  },
  "close-sheet": () => closeSheet(),
  "queue-word": ({ id }) => {
    queueCard(id);
    showToast("Đã thêm vào ôn. Thẻ sẽ xuất hiện ở lần ôn tới.");
    closeSheet();
    rerender();
  },
  "set-scope": ({ scope }) => {
    const parsed = parseScope(scope);
    setScope(parsed);
    showToast(`Đang học: ${scopeLabel(parsed)}`);
    rerender();
  },
};

function bindEvents() {
  document.addEventListener("click", (event) => {
    if (event.target === sheet) return closeSheet();
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const handler = ACTIONS[el.dataset.action];
    if (!handler) return;
    if (el.tagName === "A" && el.dataset.action === "close-sheet") {
      closeSheet();
      return;
    }
    event.preventDefault();
    handler(el.dataset);
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "import-file" && target.files[0]) handleImport(target.files[0]);
    const handler = target.dataset && ACTIONS[target.dataset.change];
    if (handler) handler({ value: target.value });
  });
  window.addEventListener("hashchange", () => {
    window.scrollTo(0, 0);
    route();
  });
}

// Android hardware Back: close the word sheet, else go one level up, else exit from Home.
function setupAndroidBackButton() {
  const AppPlugin = window.Capacitor?.Plugins?.App;
  if (!AppPlugin) return;
  AppPlugin.addListener("backButton", () => {
    if (!sheet.hidden && sheetStack.length) {
      const previous = sheetStack.pop();
      return openSheet(previous);
    }
    if (!sheet.hidden) return closeSheet();
    const parts = pathParts();
    if (parts.length === 0 || (parts.length === 1 && parts[0] === "home")) return AppPlugin.exitApp();
    if (parts.length > 1 && parts[0] !== "practice") return go(parts.slice(0, -1).join("/"));
    return go("home");
  });
}

async function boot() {
  initState();
  await loadData((path) => fetch(path).then((res) => {
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }));
  applyCustomMeanings(getState().customMeanings);
  setRouter(route);
  bindEvents();
  bindPressAndHold();
  setupAndroidBackButton();
  await initAudio();
  route();
}

boot().catch((error) => {
  app.innerHTML = `<p class="bad">Không tải được dữ liệu: ${esc(error.message)}</p>`;
});
