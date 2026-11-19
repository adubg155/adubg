// "Cài đặt": daily limits, backup/restore, reset.
import { emptyState, normalizeState } from "../store.js";
import { app, getState, setState, showToast } from "../core.js";

const MAX_REVIEWS = 500;
const MAX_NEW = 100;

export function viewSettings() {
  const { settings } = getState();
  app.innerHTML = `
    <h1>⚙️ Cài đặt</h1>
    <section class="card">
      <label class="field">Số thẻ ôn tối đa mỗi ngày
        <input id="set-review" type="number" min="0" max="${MAX_REVIEWS}" value="${settings.reviewLimit}">
      </label>
      <label class="field">Số từ mới mỗi ngày
        <input id="set-new" type="number" min="0" max="${MAX_NEW}" value="${settings.newPerDay}">
      </label>
      <button class="primary" data-action="save-settings">Lưu cài đặt</button>
    </section>
    <section class="card">
      <h2>Sao lưu tiến độ</h2>
      <p class="muted small">Tiến độ lưu trên máy này. Xuất file để chuyển sang máy khác hoặc cất giữ.</p>
      <div class="actions row">
        <button data-action="export">Xuất file</button>
        <label class="file-btn">Nhập file<input id="import-file" type="file" accept="application/json"></label>
      </div>
    </section>
    <section class="card danger-zone">
      <button class="bad" data-action="reset">Xóa toàn bộ tiến độ</button>
    </section>`;
}

// Android's WebView ignores <a download> links, so inside the APK the backup is written to
// the app's cache with the Filesystem plugin and handed to the Android share sheet (Drive,
// Zalo, Files...). In a normal browser the file is downloaded directly.
async function exportProgress() {
  const json = JSON.stringify(getState());
  const fileName = `hsk-progress-${new Date().toISOString().slice(0, 10)}.json`;
  const plugins = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins : null;
  if (plugins?.Filesystem && plugins?.Share) {
    try {
      const { uri } = await plugins.Filesystem.writeFile({
        path: fileName, data: json, directory: "CACHE", encoding: "utf8",
      });
      await plugins.Share.share({ title: "Sao lưu tiến độ HSK", files: [uri], dialogTitle: "Lưu file sao lưu" });
    } catch (error) {
      // Closing the share sheet without choosing a target also lands here.
      if (!/cancel/i.test(String(error?.message))) {
        console.warn("Export failed", error);
        showToast("Không xuất được file.");
      }
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function handleImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed.cards !== "object") throw new Error("invalid");
      setState(normalizeState(parsed));
      showToast("Đã nhập tiến độ.");
      viewSettings();
    } catch (error) {
      console.warn("Import failed", error);
      showToast("File không hợp lệ.");
    }
  };
  reader.readAsText(file);
}

export const actions = {
  "save-settings": () => {
    const reviewLimit = Number(document.getElementById("set-review").value);
    const newPerDay = Number(document.getElementById("set-new").value);
    if (!Number.isFinite(reviewLimit) || !Number.isFinite(newPerDay) || reviewLimit < 0 || newPerDay < 0) {
      return showToast("Nhập số không âm.");
    }
    const state = getState();
    setState({
      ...state,
      settings: { ...state.settings, reviewLimit: Math.min(MAX_REVIEWS, Math.floor(reviewLimit)), newPerDay: Math.min(MAX_NEW, Math.floor(newPerDay)) },
    });
    showToast("Đã lưu cài đặt.");
  },
  export: () => exportProgress(),
  reset: () => {
    if (!window.confirm("Xóa toàn bộ tiến độ? Không thể hoàn tác.")) return;
    setState(emptyState());
    showToast("Đã xóa tiến độ.");
    viewSettings();
  },
};
