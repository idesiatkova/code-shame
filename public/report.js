import * as format from "./app-format.js";
import * as copy from "./app-copy.js";
import * as findings from "./app-findings.js";
import * as icons from "./app-icons.js";
import { escapeHtml } from "./html.js";
import { renderOverview } from "./overview.js";
import { reportForDisplay } from "./demo.js";

export function createReportRenderer({ elements, architectureRenderer, isArchitecturePage, isDemo }) {
  let latestReport = null;
  elements.copyReport.addEventListener("click", () => {
    copyReport().catch((error) => renderError(error.message));
  });

  elements.copyBlocking.addEventListener("click", () => {
    copySection(elements.copyBlocking, format.formatBlockingFindingsText).catch((error) => renderError(error.message));
  });

  elements.copyRefactoring.addEventListener("click", () => {
    copySection(elements.copyRefactoring, format.formatRefactoringSuggestionsText).catch((error) => renderError(error.message));
  });

  elements.copyCoupling.addEventListener("click", () => {
    copySection(elements.copyCoupling, format.formatCouplingText).catch((error) => renderError(error.message));
  });

  elements.copyMaintainability.addEventListener("click", () => {
    copySection(elements.copyMaintainability, format.formatLowestMaintainabilityText).catch((error) => renderError(error.message));
  });
  function renderPayload(payload) {
    renderError(payload.error);
    if (!payload.report) return renderEmptyReport();

    const report = isDemo ? reportForDisplay(payload.report) : payload.report;
    latestReport = report;
    setCopyButtonsDisabled(false);
    renderOverview(elements.overviewGrid, report.overview, report.generatedAt, payload.projectId, isDemo);
    renderHardFindings(report.hardFindings);
    renderHealth(report.health);
    renderTargets(report.health.targets);
    if (isArchitecturePage) architectureRenderer.render(report.architecture);
    icons.refresh();
  }

  function renderError(message) {
    elements.errorBanner.hidden = !message;
    elements.errorBanner.textContent = message || "";
  }

  function renderEmptyReport() {
    latestReport = null;
    setCopyButtonsDisabled(true);
    architectureRenderer.clear();
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
      copySection(button, format.formatRiskSignalsText).catch((error) => renderError(error.message));
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
    const candidates = couplingCandidates(coupling);
    elements.couplingCount.textContent = format.formatNumber(candidates.length);
    renderCouplingCopyText();
    if (candidates.length === 0) {
      elements.couplingFiles.replaceChildren(emptyState("No high-coupling files."));
      return;
    }

    elements.couplingFiles.replaceChildren(...candidates.map((candidate) => renderCouplingFile(candidate, coupling)));
  }

  function couplingCandidates(coupling) {
    if (!coupling) return [];
    return Array.isArray(coupling.candidates) ? coupling.candidates : [];
  }

  function renderCouplingCopyText() {
    if (!latestReport) return;
    elements.copyCoupling.dataset.copyText = format.formatCouplingText(latestReport);
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
    const isAboveThreshold = format.isAboveCouplingThreshold(count, threshold);
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

  return { renderPayload, renderError };
}
