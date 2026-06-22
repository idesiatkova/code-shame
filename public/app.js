{
  const AUTO_REFRESH_MS = 120000;
  const AUTO_REFRESH_TICK_MS = 250;
  const AUTO_REFRESH_COOKIE = "code_scan_auto_refresh";
  const AUTO_REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
  const METRIC_HISTORY_LIMIT = 24;
  const METRIC_HISTOGRAM_MAX_HEIGHT = 78;
  const POLL_WHILE_RUNNING_MS = 1500;
  const PREVIOUS_METRICS_COOKIE = "code_scan_previous_metrics";
  const PREVIOUS_METRICS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
  const COUPLING_DEMO_QUERY = "demo-coupling";
  const TITLE_LOGO_DOUBLE_TAP_MS = 350;
  const DEMO_COUPLING_CANDIDATES = Object.freeze([
    { path: "src/demo/coupling-hub.js", fanIn: 121, fanOut: 1, lines: 196 },
    { path: "src/demo/request-context.js", fanIn: 18, fanOut: 9, lines: 58 },
    { path: "public/demo/scan-config.js", fanIn: 3, fanOut: 14, lines: 89 },
    { path: "src/demo/file-registry.js", fanIn: 8, fanOut: 6, lines: 143 },
    { path: "src/demo/report-helpers.js", fanIn: 4, fanOut: 2, lines: 72 }
  ]);
  const DEMO_COUPLING_THRESHOLDS = Object.freeze({ fanIn: 3, fanOut: 5 });
  const DEMO_METRIC_SERIES = Object.freeze({
    "unusually-reused-files": Object.freeze([0, 5])
  });
  const elements = {
    autoRefresh: document.getElementById("auto-refresh"),
    autoRefreshControl: document.getElementById("auto-refresh-control"),
    autoRefreshProgress: document.getElementById("auto-refresh-progress"),
    blockingCount: document.getElementById("blocking-count"),
    checkSections: document.getElementById("check-sections"),
    copyBlocking: document.getElementById("copy-blocking"),
    copyCoupling: document.getElementById("copy-coupling"),
    copyMaintainability: document.getElementById("copy-maintainability"),
    copyReport: document.getElementById("copy-report"),
    copyRefactoring: document.getElementById("copy-refactoring"),
    couplingCount: document.getElementById("coupling-count"),
    couplingFiles: document.getElementById("coupling-files"),
    errorBanner: document.getElementById("error-banner"),
    fileScores: document.getElementById("file-scores"),
    healthSummary: document.getElementById("health-summary"),
    maintainabilityCount: document.getElementById("maintainability-count"),
    maintainabilitySubhead: document.getElementById("maintainability-subhead"),
    overviewGrid: document.getElementById("overview-grid"),
    refreshButton: document.getElementById("refresh-button"),
    targetCount: document.getElementById("target-count"),
    targetsList: document.getElementById("targets-list"),
    titleLogo: document.getElementById("title-logo")
  };
  const format = window.codeScanFormat;
  const copy = window.codeScanCopy;
  const findings = window.codeScanFindings;
  const icons = window.codeScanIcons;
  let autoRefreshTickId = null;
  let autoRefreshTimeoutId = null;
  let latestReport = null;
  let nextAutoRefreshAt = 0;
  let runningPollId = null;
  let lastTitleLogoTapAt = 0;

  elements.autoRefresh.checked = readAutoRefreshPreference();
  renderAutoRefreshProgress(0);
  syncTitleLogo();

  elements.refreshButton.addEventListener("click", () => {
    requestScan().catch(showError);
  });

  elements.autoRefresh.addEventListener("change", () => {
    configureAutoRefresh();
  });

  elements.titleLogo.addEventListener("pointerup", () => {
    const now = Date.now();
    if (now - lastTitleLogoTapAt <= TITLE_LOGO_DOUBLE_TAP_MS) {
      lastTitleLogoTapAt = 0;
      toggleDemoMode();
      return;
    }
    lastTitleLogoTapAt = now;
  });

  elements.copyReport.addEventListener("click", () => {
    copyReport().catch(showError);
  });

  elements.copyBlocking.addEventListener("click", () => {
    copySection(elements.copyBlocking, format.formatBlockingFindingsText).catch(showError);
  });

  elements.copyRefactoring.addEventListener("click", () => {
    copySection(elements.copyRefactoring, format.formatRefactoringSuggestionsText).catch(showError);
  });

  elements.copyCoupling.addEventListener("click", () => {
    copySection(elements.copyCoupling, format.formatUnusuallyReusedFilesText).catch(showError);
  });

  elements.copyMaintainability.addEventListener("click", () => {
    copySection(elements.copyMaintainability, format.formatLowestMaintainabilityText).catch(showError);
  });

  icons.refresh();
  loadReport().then((payload) => {
    if (payload.state === "idle") return requestScan();
    return payload;
  }).catch(showError);

  async function requestScan() {
    resetAutoRefreshSchedule();
    setButtonBusy(true);
    const response = await fetch("/api/scan", { method: "POST" });
    const payload = await readJsonResponse(response);
    renderPayload(payload);
    scheduleRunningPoll(payload);
    return payload;
  }

  async function loadReport() {
    const response = await fetch("/api/report");
    const payload = await readJsonResponse(response);
    renderPayload(payload);
    scheduleRunningPoll(payload);
    return payload;
  }

  async function readJsonResponse(response) {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Code scan request failed");
    return payload;
  }

  function configureAutoRefresh() {
    writeAutoRefreshPreference(elements.autoRefresh.checked);
    clearAutoRefreshSchedule();

    if (elements.autoRefresh.checked) {
      scheduleNextAutoRefresh();
    } else {
      renderAutoRefreshProgress(0);
    }
  }

  function scheduleNextAutoRefresh() {
    clearAutoRefreshSchedule();
    nextAutoRefreshAt = Date.now() + AUTO_REFRESH_MS;
    renderAutoRefreshProgress(0);
    autoRefreshTimeoutId = window.setTimeout(() => {
      requestScan().catch(showError);
    }, AUTO_REFRESH_MS);
    autoRefreshTickId = window.setInterval(updateAutoRefreshProgress, AUTO_REFRESH_TICK_MS);
  }

  function clearAutoRefreshSchedule() {
    if (autoRefreshTimeoutId) window.clearTimeout(autoRefreshTimeoutId);
    if (autoRefreshTickId) window.clearInterval(autoRefreshTickId);
    autoRefreshTimeoutId = null;
    autoRefreshTickId = null;
    nextAutoRefreshAt = 0;
  }

  function resetAutoRefreshSchedule() {
    if (!elements.autoRefresh.checked) return;
    clearAutoRefreshSchedule();
    renderAutoRefreshProgress(1);
  }

  function updateAutoRefreshProgress() {
    const remainingMs = Math.max(0, nextAutoRefreshAt - Date.now());
    const progress = 1 - remainingMs / AUTO_REFRESH_MS;
    renderAutoRefreshProgress(progress);
  }

  function renderAutoRefreshProgress(progress) {
    const clampedProgress = Math.max(0, Math.min(1, Number(progress) || 0));
    elements.autoRefreshControl.classList.toggle("auto-refresh-on", elements.autoRefresh.checked);
    elements.autoRefreshProgress.style.setProperty("--auto-refresh-progress", `${Math.round(clampedProgress * 100)}%`);
  }

  function readAutoRefreshPreference() {
    const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${AUTO_REFRESH_COOKIE}=`));
    return cookie === `${AUTO_REFRESH_COOKIE}=true`;
  }

  function writeAutoRefreshPreference(isEnabled) {
    document.cookie = [
      `${AUTO_REFRESH_COOKIE}=${isEnabled}`,
      `max-age=${AUTO_REFRESH_COOKIE_MAX_AGE_SECONDS}`,
      "path=/",
      "samesite=strict"
    ].join("; ");
  }

  function scheduleRunningPoll(payload) {
    if (runningPollId) window.clearTimeout(runningPollId);
    runningPollId = null;

    if (payload.running) {
      runningPollId = window.setTimeout(() => {
        loadReport().catch(showError);
      }, POLL_WHILE_RUNNING_MS);
    } else {
      setButtonBusy(false);
      if (elements.autoRefresh.checked && !autoRefreshTimeoutId) scheduleNextAutoRefresh();
    }
  }

  function renderPayload(payload) {
    renderStatus(payload);
    if (!payload.report) return renderEmptyReport();

    const report = reportForDisplay(payload.report);
    latestReport = report;
    setCopyButtonsDisabled(false);
    renderOverview(report.overview, report.generatedAt);
    renderHardFindings(report.hardFindings);
    renderHealth(report.health);
    renderTargets(report.health.targets);
    icons.refresh();
  }

  function reportForDisplay(report) {
    if (!shouldShowCouplingDemo()) return report;

    const coupling = {
      ...report.health.coupling,
      candidateCount: DEMO_COUPLING_CANDIDATES.length,
      candidates: DEMO_COUPLING_CANDIDATES,
      fanInThreshold: DEMO_COUPLING_THRESHOLDS.fanIn,
      fanOutThreshold: DEMO_COUPLING_THRESHOLDS.fanOut
    };

    return {
      ...report,
      overview: report.overview.map((item) => {
        if (item.id !== "unusually-reused-files") return item;
        return { ...item, value: coupling.candidateCount };
      }),
      health: { ...report.health, coupling }
    };
  }

  function shouldShowCouplingDemo() {
    const localHosts = ["127.0.0.1", "localhost", "::1"];
    return localHosts.includes(window.location.hostname)
      && new URLSearchParams(window.location.search).has(COUPLING_DEMO_QUERY);
  }

  function syncTitleLogo() {
    const isDemo = shouldShowCouplingDemo();
    const label = isDemo ? "Exit demo mode" : "Enter demo mode";
    elements.titleLogo.classList.toggle("is-demo", isDemo);
    elements.titleLogo.setAttribute("aria-label", label);
    elements.titleLogo.title = label;
  }

  function toggleDemoMode() {
    const nextUrl = new URL(window.location.href);
    if (nextUrl.searchParams.has(COUPLING_DEMO_QUERY)) {
      nextUrl.searchParams.delete(COUPLING_DEMO_QUERY);
    } else {
      nextUrl.searchParams.set(COUPLING_DEMO_QUERY, "1");
    }
    window.location.assign(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }

  function renderStatus(payload) {
    renderError(payload.error);
  }

  function renderError(message) {
    elements.errorBanner.hidden = !message;
    elements.errorBanner.textContent = message || "";
  }

  function renderEmptyReport() {
    latestReport = null;
    setCopyButtonsDisabled(true);
    elements.overviewGrid.replaceChildren();
    elements.checkSections.replaceChildren(emptyState("No scan results yet."));
    elements.healthSummary.replaceChildren();
    elements.fileScores.replaceChildren(emptyState("No health results yet."));
    elements.couplingCount.textContent = "0";
    elements.couplingFiles.replaceChildren(emptyState("No coupling results yet."));
    elements.maintainabilityCount.textContent = "0%";
    setSectionWarning(elements.maintainabilitySubhead, false);
    elements.targetsList.replaceChildren(emptyState("No refactoring suggestions yet."));
  }

  function renderOverview(items, sampleId) {
    const history = readMetricHistory();
    const snapshot = metricSnapshot(items);
    const previousMetrics = previousMetricsForSnapshot(history, snapshot, sampleId);
    const metricSeries = metricSeriesForSnapshot(history, snapshot, sampleId);
    elements.overviewGrid.replaceChildren(...items.map((item) => {
      return renderMetric(item, previousMetrics[item.id], metricSeries[item.id]);
    }));
    if (!shouldShowCouplingDemo()) writeMetricHistory(snapshot, history, metricSeries, sampleId);
  }

  function renderMetric(item, previousValue, series) {
    const node = document.createElement("a");
    node.className = `metric metric-${item.id} metric-${item.tone}`;
    node.href = metricHref(item.id);
    const histogram = metricHistogramHtml(item, series);
    node.innerHTML = `
      ${histogram}
      <div class="metric-header">
        <div class="metric-label">${escapeHtml(item.label)}</div>
        ${icons.metricIconHtml(item.id)}
      </div>
      <div class="metric-value-row">
        ${metricValueHtml(item)}
        ${metricDeltaHtml(item, previousValue)}
      </div>
    `;

    if (histogram) {
      node.classList.add("metric-has-change");
    }

    return node;
  }

  function metricValueHtml(item) {
    return `<div class="metric-value">${escapeHtml(`${item.value}${item.suffix || ""}`)}</div>`;
  }

  function metricDeltaHtml(item, previousValue) {
    const delta = metricDelta(item, previousValue);
    if (delta === null || delta === 0) return "";
    const icon = delta > 0 ? "arrow-up-right" : "arrow-down-right";
    const label = delta > 0 ? "Increased" : "Decreased";
    const value = formatDelta(delta, item.suffix);
    return `
      <div class="metric-delta" aria-label="${escapeHtml(`${label} by ${value} since last scan`)}">
        <span>${escapeHtml(value)}</span>
        <i class="metric-delta-icon" data-lucide="${icon}" aria-hidden="true"></i>
      </div>
    `;
  }

  function metricHistogramHtml(item, series) {
    const points = metricHistogramPoints(item, series);
    if (!points) return "";
    const curvePath = metricHistogramCurvePath(points);
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const areaPath = `${curvePath} L ${lastPoint.x} 100 L ${firstPoint.x} 100 Z`;
    return `
      <svg class="metric-histogram" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path class="metric-histogram-fill" d="${areaPath}"></path>
      </svg>
    `;
  }

  function metricHistogramPoints(item, series) {
    const values = metricHistogramValues(series);
    if (!values) return null;
    const scale = item.suffix === "%"
      ? 100
      : Math.max(5, ...values.map((value) => Math.abs(value)));
    return values.map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = metricHistogramY(metricHistogramHeight(value, scale));
      return { x: Number(x.toFixed(1)), y };
    });
  }

  function metricHistogramValues(series) {
    if (!Array.isArray(series)) return null;
    const values = series.map(metricNumber).filter((value) => value !== null).slice(-METRIC_HISTORY_LIMIT);
    return values.length >= 2 ? values : null;
  }

  function metricHistogramCurvePath(points) {
    if (points.length === 2) {
      return `M ${metricHistogramCoordinate(points[0])} L ${metricHistogramCoordinate(points[1])}`;
    }

    let path = `M ${metricHistogramCoordinate(points[0])}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const before = points[index - 1] || points[index];
      const start = points[index];
      const end = points[index + 1];
      const after = points[index + 2] || end;
      const controlOne = {
        x: start.x + (end.x - before.x) / 6,
        y: start.y + (end.y - before.y) / 6
      };
      const controlTwo = {
        x: end.x - (after.x - start.x) / 6,
        y: end.y - (after.y - start.y) / 6
      };
      path += ` C ${metricHistogramCoordinate(controlOne)} ${metricHistogramCoordinate(controlTwo)} ${metricHistogramCoordinate(end)}`;
    }
    return path;
  }

  function metricHistogramCoordinate(point) {
    return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }

  function metricHistogramHeight(value, scale) {
    if (value === 0) return 0;
    const proportionalHeight = (Math.abs(value) / scale) * METRIC_HISTOGRAM_MAX_HEIGHT;
    return Math.min(METRIC_HISTOGRAM_MAX_HEIGHT, Math.max(22, proportionalHeight));
  }

  function metricHistogramY(height) {
    return Number((100 - height).toFixed(1));
  }

  function metricDelta(item, previousValue) {
    const current = metricNumber(item.value);
    const previous = metricNumber(previousValue);
    if (current === null || previous === null) return null;
    const delta = Number((current - previous).toFixed(1));
    return Math.abs(delta) < 0.1 ? 0 : delta;
  }

  function formatDelta(delta, suffix = "") {
    const value = Math.abs(delta);
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}${suffix || ""}`;
  }

  function metricNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function metricHref(id) {
    const targets = {
      "blocking-findings": "#blocking-findings",
      maintainability: "#lowest-maintainability",
      "refactoring-suggestions": "#refactoring-suggestions",
      "unusually-reused-files": "#unusually-reused-files"
    };
    return targets[id] || "#";
  }

  function metricSnapshot(items) {
    return Object.fromEntries(items.map((item) => [item.id, metricNumber(item.value)]));
  }

  function previousMetricsForSnapshot(history, snapshot, sampleId) {
    if (history.current && sameMetricSnapshot(history.current, snapshot)) {
      return isNewMetricSample(history, sampleId) ? history.current : history.previous || {};
    }
    return history.current || {};
  }

  function metricSeriesForSnapshot(history, snapshot, sampleId) {
    const isNewSample = isNewMetricSample(history, sampleId);
    return Object.fromEntries(Object.entries(snapshot).map(([id, value]) => {
      const demoSeries = shouldShowCouplingDemo() ? DEMO_METRIC_SERIES[id] : null;
      if (demoSeries) return [id, [...demoSeries]];

      const stored = Array.isArray(history.series && history.series[id])
        ? [...history.series[id]]
        : legacyMetricSeries(history, id);
      const currentValue = metricNumber(value);
      if (currentValue !== null && (stored.length === 0 || stored[stored.length - 1] !== currentValue || isNewSample)) {
        stored.push(currentValue);
      }
      return [id, stored.slice(-METRIC_HISTORY_LIMIT)];
    }));
  }

  function isNewMetricSample(history, sampleId) {
    return Boolean(history.current && sampleId && history.sampleId !== sampleId);
  }

  function legacyMetricSeries(history, id) {
    const values = [metricNumber(history.previous && history.previous[id]), metricNumber(history.current && history.current[id])]
      .filter((value) => value !== null);
    return values.length === 2 && values[0] === values[1] ? [values[1]] : values;
  }

  function readMetricHistory() {
    const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${PREVIOUS_METRICS_COOKIE}=`));
    if (!cookie) return {};

    try {
      const value = decodeURIComponent(cookie.slice(PREVIOUS_METRICS_COOKIE.length + 1));
      const parsed = JSON.parse(value);
      return normalizeMetricHistory(parsed);
    } catch {
      return {};
    }
  }

  function normalizeMetricHistory(parsed) {
    if (!parsed || typeof parsed !== "object") return {};
    if ("current" in parsed || "previous" in parsed) {
      return {
        current: normalizeMetricSnapshot(parsed.current),
        previous: normalizeMetricSnapshot(parsed.previous),
        series: normalizeMetricSeries(parsed.series),
        sampleId: typeof parsed.sampleId === "string" ? parsed.sampleId : null
      };
    }
    return { current: normalizeMetricSnapshot(parsed), series: {}, sampleId: null };
  }

  function normalizeMetricSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return null;
    return Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, metricNumber(value)]));
  }

  function normalizeMetricSeries(series) {
    if (!series || typeof series !== "object") return {};
    return Object.fromEntries(Object.entries(series).flatMap(([id, values]) => {
      if (!Array.isArray(values)) return [];
      const normalized = values.map(metricNumber).filter((value) => value !== null).slice(-METRIC_HISTORY_LIMIT);
      return normalized.length > 0 ? [[id, normalized]] : [];
    }));
  }

  function writeMetricHistory(snapshot, history, series, sampleId) {
    const previous = history.current && (isNewMetricSample(history, sampleId) || !sameMetricSnapshot(history.current, snapshot))
      ? history.current
      : history.previous;
    const nextHistory = {
      current: snapshot,
      previous: previous || null,
      series: normalizeMetricSeries(series),
      sampleId: typeof sampleId === "string" ? sampleId : null
    };
    document.cookie = [
      `${PREVIOUS_METRICS_COOKIE}=${encodeURIComponent(JSON.stringify(nextHistory))}`,
      `max-age=${PREVIOUS_METRICS_MAX_AGE_SECONDS}`,
      "path=/",
      "samesite=strict"
    ].join("; ");
  }

  function sameMetricSnapshot(left, right) {
    if (!left || !right) return false;
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return Array.from(keys).every((key) => metricNumber(left[key]) === metricNumber(right[key]));
  }

  function renderHardFindings(hardFindings) {
    elements.blockingCount.textContent = String(hardFindings.count);
    if (latestReport) {
      elements.copyBlocking.dataset.copyText = format.formatBlockingFindingsText(latestReport);
    }

    if (hardFindings.sections.length === 0) {
      elements.checkSections.replaceChildren(emptyState("No blocking findings."));
      return;
    }

    const nodes = hardFindings.sections.map((section) => findings.renderSection(section, escapeHtml));
    elements.checkSections.replaceChildren(...nodes);
  }

  function renderHealth(health) {
    const findingsByPath = countFindingsByPath(health.findings);
    elements.maintainabilityCount.textContent = `${format.formatNumber(health.summary.averageMaintainability)}%`;
    setSectionWarning(elements.maintainabilitySubhead, health.findings.length > 0);
    if (latestReport) {
      elements.copyMaintainability.dataset.copyText = format.formatLowestMaintainabilityText(latestReport);
    }
    elements.healthSummary.replaceChildren(
      healthSection("Scan Scope", [
        ["Analyzed files", format.formatNumber(health.summary.filesAnalyzed)],
        ["Analyzed functions", format.formatNumber(health.summary.functionsAnalyzed)],
        ["Source lines", format.formatNumber(health.vitalSigns.totalLoc)]
      ]),
      riskSignalsSection([
        riskSignalRow(
          "Functions over complexity limit",
          format.formatNumber(health.summary.functionsAboveThreshold),
          format.thresholdTone(health.summary.functionsAboveThreshold, 0, 10)
        ),
        riskSignalRow(
          "90th percentile function complexity",
          format.formatNumber(health.vitalSigns.p90Cyclomatic),
          format.thresholdTone(health.vitalSigns.p90Cyclomatic, 5, 10)
        )
      ])
    );

    if (health.fileScores.length === 0) {
      elements.fileScores.replaceChildren(emptyState("No file scores."));
    } else {
      elements.fileScores.replaceChildren(...health.fileScores.map((score) => {
        return renderFileScore(score, findingsByPath.get(score.path) || 0);
      }));
    }

    renderCouplingFiles(health.coupling);
  }

  function healthSection(title, rows) {
    const node = document.createElement("section");
    node.className = "health-section";
    node.innerHTML = `
      <div class="health-section-header">
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="health-rows">
        ${rows.map(([label, value]) => healthRowHtml(label, value)).join("")}
      </div>
    `;
    return node;
  }

  function riskSignalsSection(rows) {
    const node = healthSection("Risk Signals", rows.map((row) => [row.label, row.value]));
    node.querySelector(".health-rows").innerHTML = rows.map(riskSignalRowHtml).join("");
    node.querySelector(".health-section-header").appendChild(createRiskCopyButton());
    return node;
  }

  function createRiskCopyButton() {
    const button = document.createElement("button");
    button.id = "copy-risk";
    button.className = "copy-section icon-button";
    button.type = "button";
    button.innerHTML = '<i data-lucide="copy" aria-hidden="true"></i><span class="button-label">Copy</span>';
    button.dataset.copyText = latestReport ? format.formatRiskSignalsText(latestReport) : "";
    button.addEventListener("click", () => {
      copySection(button, format.formatRiskSignalsText).catch(showError);
    });
    return button;
  }

  function healthRowHtml(label, value) {
    return healthRowMarkup(label, value, "neutral");
  }

  function riskSignalRow(label, value, tone) {
    return {
      label,
      tone,
      value
    };
  }

  function riskSignalRowHtml(row) {
    return healthRowMarkup(row.label, row.value, row.tone);
  }

  function healthRowMarkup(label, value, tone) {
    return `
      <div class="health-row health-row-${escapeHtml(tone)}">
        <span>${escapeHtml(label)}</span>
        <span>${escapeHtml(value)}</span>
      </div>
    `;
  }

  function countFindingsByPath(findings) {
    return findings.reduce((counts, finding) => {
      counts.set(finding.path, (counts.get(finding.path) || 0) + 1);
      return counts;
    }, new Map());
  }

  function renderFileScore(score, complexityCount) {
    const node = document.createElement("article");
    node.className = `file-score ${complexityCount > 0 ? "file-score-warn" : ""}`;
    node.innerHTML = `
      <div>
        <span class="item-title">${escapeHtml(score.path)}</span>
        <span class="item-detail">
          ${escapeHtml(format.formatNumber(score.lines))} lines of code
        </span>
      </div>
      <div class="file-score-side">
        ${complexityBadgeHtml(complexityCount)}
        <div class="score-value">${escapeHtml(score.maintainability.toFixed(1))}</div>
      </div>
    `;
    return node;
  }

  function renderCouplingFiles(coupling) {
    const candidates = Array.isArray(coupling && coupling.candidates) ? coupling.candidates : [];
    elements.couplingCount.textContent = format.formatNumber(candidates.length);
    if (latestReport) {
      elements.copyCoupling.dataset.copyText = format.formatUnusuallyReusedFilesText(latestReport);
    }
    if (candidates.length === 0) {
      elements.couplingFiles.replaceChildren(emptyState("No unusually reused files."));
      return;
    }

    elements.couplingFiles.replaceChildren(...candidates.map((candidate) => renderCouplingFile(candidate, coupling)));
  }

  function renderCouplingFile(candidate, coupling) {
    const node = document.createElement("article");
    node.className = "target-card coupling-card";
    node.innerHTML = `
      <h3>${escapeHtml(candidate.path)}</h3>
      <p class="coupling-size">${escapeHtml(format.formatNumber(candidate.lines))} lines of code</p>
      <div class="coupling-badges">
        ${couplingMetricHtml("Used by", candidate.fanIn, coupling.fanInThreshold)}
        ${couplingMetricHtml("Uses", candidate.fanOut, coupling.fanOutThreshold)}
      </div>
    `;
    return node;
  }

  function setSectionWarning(element, isWarning) {
    element.classList.toggle("section-title-warn", isWarning);
  }

  function couplingMetricHtml(label, value, threshold) {
    const count = Number(value) || 0;
    const isAboveThreshold = Number.isFinite(Number(threshold)) && count > Number(threshold);
    return `
      <span class="complexity-badge coupling-badge ${isAboveThreshold ? "coupling-badge-high" : "coupling-badge-neutral"}">
        ${escapeHtml(`${label} ${format.formatNumber(count)} ${pluralize("file", count)}`)}
      </span>
    `;
  }

  function complexityBadgeHtml(count) {
    if (count === 0) return "";
    const label = count === 1 ? "complexity finding" : "complexity findings";
    return `<div class="complexity-badge">${escapeHtml(count)} ${label}</div>`;
  }

  function pluralize(word, count) {
    return count === 1 ? word : `${word}s`;
  }

  function renderTargets(targets) {
    elements.targetCount.textContent = format.formatNumber(targets.length);
    if (latestReport) {
      elements.copyRefactoring.dataset.copyText = format.formatRefactoringSuggestionsText(latestReport);
    }

    if (targets.length === 0) {
      elements.targetsList.replaceChildren(emptyState("No refactoring suggestions."));
      return;
    }

    elements.targetsList.replaceChildren(...targets.map(renderTarget));
  }

  function renderTarget(target) {
    const node = document.createElement("article");
    node.className = `target-card target-${format.effortTone(target.effort)}`;
    node.innerHTML = `
      <h3>${escapeHtml(target.path)}</h3>
      <p>${escapeHtml(format.formatRecommendation(target.recommendation))}</p>
      <div class="complexity-badge target-score">Priority ${escapeHtml(target.priority.toFixed(1))}</div>
    `;
    return node;
  }

  function emptyState(message) {
    const node = document.createElement("div");
    node.className = "empty-state";
    node.textContent = message;
    return node;
  }

  function setButtonBusy(isBusy) {
    elements.refreshButton.disabled = isBusy;
    icons.setButtonLabel(elements.refreshButton, isBusy ? "Scanning" : "Refresh");
    elements.refreshButton.classList.toggle("is-spinning", isBusy);
  }

  async function copyReport() {
    if (!latestReport) return;
    const reportText = format.formatReportText(latestReport);
    await copyText(elements.copyReport, reportText);
  }

  async function copySection(button, formatter) {
    if (!latestReport) return;
    await copyText(button, button.dataset.copyText || formatter(latestReport));
  }

  async function copyText(button, text) {
    await copy.writeText(text);
    const previousLabel = button.querySelector(".button-label").textContent;
    icons.setButtonLabel(button, "Copied");
    window.setTimeout(() => {
      icons.setButtonLabel(button, previousLabel);
    }, 1400);
  }

  function setCopyButtonsDisabled(isDisabled) {
    elements.copyReport.disabled = isDisabled;
    elements.copyBlocking.disabled = isDisabled;
    elements.copyCoupling.disabled = isDisabled;
    elements.copyMaintainability.disabled = isDisabled;
    elements.copyRefactoring.disabled = isDisabled;
    const copyRisk = document.getElementById("copy-risk");
    if (copyRisk) copyRisk.disabled = isDisabled;
  }

  function showError(error) {
    setButtonBusy(false);
    if (elements.autoRefresh.checked && !autoRefreshTimeoutId) scheduleNextAutoRefresh();
    renderError(error.message || String(error));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
