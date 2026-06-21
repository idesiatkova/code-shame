{
  const AUTO_REFRESH_MS = 120000;
  const POLL_WHILE_RUNNING_MS = 1500;
  const elements = {
    autoRefresh: document.getElementById("auto-refresh"),
    blockingCount: document.getElementById("blocking-count"),
    checkSections: document.getElementById("check-sections"),
    copyBlocking: document.getElementById("copy-blocking"),
    copyReport: document.getElementById("copy-report"),
    copyRefactoring: document.getElementById("copy-refactoring"),
    couplingFiles: document.getElementById("coupling-files"),
    errorBanner: document.getElementById("error-banner"),
    fileScores: document.getElementById("file-scores"),
    healthSummary: document.getElementById("health-summary"),
    couplingSubhead: document.getElementById("coupling-subhead"),
    maintainabilitySubhead: document.getElementById("maintainability-subhead"),
    overviewGrid: document.getElementById("overview-grid"),
    refreshButton: document.getElementById("refresh-button"),
    runSummary: document.getElementById("run-summary"),
    statusPill: document.getElementById("status-pill"),
    targetCount: document.getElementById("target-count"),
    targetsList: document.getElementById("targets-list")
  };
  const format = window.codeScanFormat;
  const copy = window.codeScanCopy;
  const findings = window.codeScanFindings;
  const icons = window.codeScanIcons;
  let autoRefreshId = null;
  let latestReport = null;
  let runningPollId = null;

  elements.refreshButton.addEventListener("click", () => {
    requestScan().catch(showError);
  });

  elements.autoRefresh.addEventListener("change", () => {
    configureAutoRefresh();
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

  icons.refresh();
  loadReport().then((payload) => {
    if (payload.state === "idle") return requestScan();
    return payload;
  }).catch(showError);

  async function requestScan() {
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
    if (autoRefreshId) window.clearInterval(autoRefreshId);
    autoRefreshId = null;

    if (elements.autoRefresh.checked) {
      autoRefreshId = window.setInterval(() => {
        requestScan().catch(showError);
      }, AUTO_REFRESH_MS);
    }
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
    }
  }

  function renderPayload(payload) {
    renderStatus(payload);
    if (!payload.report) return renderEmptyReport();

    latestReport = payload.report;
    setCopyButtonsDisabled(false);
    renderOverview(payload.report.overview);
    renderHardFindings(payload.report.hardFindings);
    renderHealth(payload.report.health);
    renderTargets(payload.report.health.targets);
    icons.refresh();
  }

  function renderStatus(payload) {
    elements.statusPill.className = `status-pill status-${payload.state}`;
    elements.statusPill.textContent = format.statusText(payload);
    elements.runSummary.innerHTML = format.runSummaryHtml(payload);
    icons.refresh(elements.runSummary);
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
    elements.couplingFiles.replaceChildren(emptyState("No coupling results yet."));
    setSubheadWarning(elements.maintainabilitySubhead, false);
    setSubheadWarning(elements.couplingSubhead, false);
    elements.targetsList.replaceChildren(emptyState("No refactoring suggestions yet."));
  }

  function renderOverview(items) {
    elements.overviewGrid.replaceChildren(...items.map((item) => {
      const node = document.createElement("article");
      node.className = `metric metric-${item.id} metric-${item.tone}`;
      node.innerHTML = `
        <div class="metric-header">
          <div class="metric-label">${escapeHtml(item.label)}</div>
          ${icons.metricIconHtml(item.id)}
        </div>
        ${metricValueHtml(item)}
      `;
      return node;
    }));
  }

  function metricValueHtml(item) {
    const value = `<div class="metric-value">${escapeHtml(`${item.value}${item.suffix || ""}`)}</div>`;
    if (item.id !== "maintainability") return value;
    return `<div class="metric-score-row">${value}${metricProgressHtml(item)}</div>`;
  }

  function metricProgressHtml(item) {
    if (item.id !== "maintainability") return "";
    const value = Math.max(0, Math.min(100, Number(item.value) || 0));
    return `
      <progress
        class="metric-progress"
        aria-label="Maintainability score"
        max="100"
        value="${escapeHtml(value)}"
      ></progress>
    `;
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
    setSubheadWarning(elements.maintainabilitySubhead, health.findings.length > 0);
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
        ),
        riskSignalRow(
          "Unusually reused files",
          format.formatCouplingSummary(health),
          format.thresholdTone(health.vitalSigns.couplingHighPercent, 0, 5)
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
    setSubheadWarning(elements.couplingSubhead, candidates.length > 0);
    if (candidates.length === 0) {
      elements.couplingFiles.replaceChildren(emptyState("No unusually reused files."));
      return;
    }

    elements.couplingFiles.replaceChildren(...candidates.map(renderCouplingFile));
  }

  function renderCouplingFile(candidate) {
    const node = document.createElement("article");
    node.className = "file-score coupling-file";
    node.innerHTML = `
      <div>
        <span class="item-title">${escapeHtml(candidate.path)}</span>
        <span class="item-detail">${escapeHtml(couplingFileDetail(candidate))}</span>
      </div>
    `;
    return node;
  }

  function setSubheadWarning(element, isWarning) {
    element.classList.toggle("section-subhead-warn", isWarning);
  }

  function couplingFileDetail(candidate) {
    const dependents = Number(candidate.fanIn) || 0;
    const dependencies = Number(candidate.fanOut) || 0;
    return [
      filesDependOnItText(dependents),
      `depends on ${format.formatNumber(dependencies)} ${pluralize("file", dependencies)}`,
      `${format.formatNumber(candidate.lines)} lines of code`
    ].join(" · ");
  }

  function filesDependOnItText(count) {
    if (count === 1) return "1 file depends on it";
    return `${format.formatNumber(count)} files depend on it`;
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
      <div class="target-score">Priority ${escapeHtml(target.priority.toFixed(1))}</div>
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
    elements.copyRefactoring.disabled = isDisabled;
    const copyRisk = document.getElementById("copy-risk");
    if (copyRisk) copyRisk.disabled = isDisabled;
  }

  function showError(error) {
    setButtonBusy(false);
    elements.statusPill.className = "status-pill status-failed";
    elements.statusPill.textContent = "Failed";
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
