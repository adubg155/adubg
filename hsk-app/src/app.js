// App entry: loads data, routes "#/area/arg/arg" to a view, and dispatches data-action clicks.
// Areas: home (Hôm nay), hsk (Giáo trình HSK), work (Công việc), practice, stats, settings.
import { initAudio } from "./audio.js";
import {
  app, initState, setRouter, go, rerender, showToast, speak, queueCard, setScope,
} from "./core.js";
import { loadData, parseScope, scopeLabel } from "./data.js";
import { esc, wordSheetHtml } from "./ui.js";
import { viewHome, actions as homeActions } from "./views/home.js";
import { viewHsk, actions as hskActions } from "./views/hsk.js";
import { viewChars, actions as charsActions } from "./views/chars.js";
import { viewWork } from "./views/work.js";
import { viewPractice, actions as practiceActions } from "./views/practice.js";
import { viewReview, viewPlacement, actions as reviewActions } from "./views/review.js";
import { viewStats, actions as statsActions } from "./views/stats.js";
import { viewSettings, handleImport, actions as settingsActions } from "./views/settings.js";

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

function closeSheet() {
  sheet.hidden = true;
  sheet.innerHTML = "";
}

function openSheet(word) {
  const html = wordSheetHtml(word);
  if (!html) return;
  sheet.innerHTML = html;
  sheet.hidden = false;
}

function route() {
  const [name, ...args] = pathParts();
  const view = VIEWS[name] ? name : "home";
  // Each area gets its own accent colour (header and bottom bar), see styles.css [data-area].
  document.body.dataset.area = NAV_FOR[view] || view;
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
  lookup: ({ word }) => openSheet(word),
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
  setRouter(route);
  bindEvents();
  setupAndroidBackButton();
  await initAudio();
  route();
}

boot().catch((error) => {
  app.innerHTML = `<p class="bad">Không tải được dữ liệu: ${esc(error.message)}</p>`;
});
