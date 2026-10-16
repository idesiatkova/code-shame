import { setButtonLabel } from "./app-icons.js";

const INTERVALS = new Set([0, 10000, 30000, 60000, 300000]);
const INTERVAL_COOKIE = "code_shame_auto_refresh_interval";

export function createScanController({
  elements, renderPayload, showError,
  fetch = globalThis.fetch, timers = globalThis, document = globalThis.document
}) {
  const abortController = new AbortController();
  let interval = readInterval(document.cookie);
  let autoTimeout = null;
  let progressTick = null;
  let pollTimeout = null;
  let nextRefreshAt = 0;
  let inFlight = null;
  let disposed = false;
  let running = false;

  function clearAutoRefresh() {
    timers.clearTimeout(autoTimeout);
    timers.clearInterval(progressTick);
    autoTimeout = progressTick = null;
  }

  function renderProgress(progress) {
    elements.refreshControl.classList.toggle("auto-refresh-on", interval > 0);
    elements.refreshControl.style.setProperty("--auto-refresh-progress", Math.max(0, Math.min(1, progress)));
  }

  function scheduleAutoRefresh() {
    clearAutoRefresh();
    if (!interval || disposed || running) return;
    nextRefreshAt = Date.now() + interval;
    renderProgress(0);
    autoTimeout = timers.setTimeout(() => request(true), interval);
    progressTick = timers.setInterval(() => renderProgress(1 - (nextRefreshAt - Date.now()) / interval), 250);
  }

  function renderInterval() {
    for (const option of elements.refreshMenuOptions) {
      const selected = Number(option.dataset.intervalMs) === interval;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-checked", String(selected));
    }
    renderProgress(0);
  }

  function setMenuOpen(open) {
    elements.refreshMenu.hidden = !open;
    elements.refreshControl.classList.toggle("is-menu-open", open);
    elements.refreshMenuToggle.setAttribute("aria-expanded", String(open));
  }

  function setBusy(busy) {
    elements.refreshButton.disabled = busy;
    elements.refreshButton.classList.toggle("is-spinning", busy);
    setButtonLabel(elements.refreshButton, "Refresh");
  }

  function schedulePoll() {
    timers.clearTimeout(pollTimeout);
    pollTimeout = timers.setTimeout(() => request(false), 1500);
  }

  function request(scan) {
    if (disposed) return Promise.resolve();
    if (inFlight) return inFlight;
    clearAutoRefresh();
    timers.clearTimeout(pollTimeout);
    setBusy(true);
    inFlight = Promise.resolve().then(async () => {
      const response = await fetch(scan ? "/api/scan" : "/api/report", {
        method: scan ? "POST" : "GET",
        signal: abortController.signal
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Code scan request failed");
      if (disposed) return;
      running = Boolean(payload.running);
      renderPayload(payload);
      setBusy(running);
      if (running) schedulePoll();
      else scheduleAutoRefresh();
      return payload;
    }).catch((error) => {
      if (disposed) return;
      setBusy(false);
      showError(error.message || String(error));
      // A transient HTTP error must not stop polling an active scan.
      if (running) schedulePoll();
      else scheduleAutoRefresh();
    }).finally(() => { inFlight = null; });
    return inFlight;
  }

  const listenerOptions = { signal: abortController.signal };
  elements.refreshButton.addEventListener("click", () => {
    setMenuOpen(false);
    request(true);
  }, listenerOptions);
  elements.refreshMenuToggle.addEventListener("click", () => setMenuOpen(elements.refreshMenu.hidden), listenerOptions);
  for (const option of elements.refreshMenuOptions) {
    option.addEventListener("click", () => {
      const value = Number(option.dataset.intervalMs);
      interval = INTERVALS.has(value) ? value : 0;
      document.cookie = `${INTERVAL_COOKIE}=${interval}; max-age=2592000; path=/; samesite=strict`;
      setMenuOpen(false);
      renderInterval();
      scheduleAutoRefresh();
    }, listenerOptions);
  }
  document.addEventListener("pointerdown", (event) => {
    if (!elements.refreshControl.contains(event.target)) setMenuOpen(false);
  }, listenerOptions);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || elements.refreshMenu.hidden) return;
    setMenuOpen(false);
    elements.refreshMenuToggle.focus();
  }, listenerOptions);
  renderInterval();

  return {
    async start() {
      const payload = await request(false);
      if (payload?.state === "idle") return request(true);
      return payload;
    },
    refresh: () => request(true),
    dispose() {
      disposed = true;
      abortController.abort();
      clearAutoRefresh();
      timers.clearTimeout(pollTimeout);
    }
  };
}

function readInterval(cookie) {
  const cookies = new Map(cookie.split("; ").map((entry) => entry.split("=")));
  if (cookies.has(INTERVAL_COOKIE)) {
    const value = Number(cookies.get(INTERVAL_COOKIE));
    return INTERVALS.has(value) ? value : 0;
  }
  return cookies.get("code_scan_auto_refresh") === "true" ? 300000 : 0;
}
