{
  const STATUS_LABELS = {
    failed: "Failed",
    idle: "Idle",
    ready: "Ready",
    running: "Scanning"
  };

  function effortTone(effort) {
    if (effort === "high") return "critical";
    if (effort === "medium") return "warn";
    if (effort === "low") return "good";
    return "neutral";
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(Number(value) || 0);
  }

  function formatRecommendation(recommendation) {
    return String(recommendation || "")
      .replace(/\((\d+) LOC\)/g, "($1 lines of code)")
      .replace(/(\d+) dependents amplify every change/g, "$1 files depend on it")
      .replace(/fan-in/g, "incoming references")
      .replace(/fan-out/g, "outgoing dependencies");
  }

  function thresholdTone(value, goodMax, warnMax) {
    const number = Number(value);
    if (number <= goodMax) return "good";
    if (number <= warnMax) return "warn";
    return "critical";
  }

  function formatReportText(report) {
    const lines = [
      "Code Scan",
      `Generated: ${report.generatedAt}`,
      `Status: ${report.status}`,
      `Blocking findings: ${report.hardFindings.count}`,
      `Refactoring suggestions: ${report.health.targets.length}`,
      "",
      "Blocking findings"
    ];

    appendCheckSections(lines, report.hardFindings.sections);
    appendTargets(lines, report.health.targets, true);
    return `${lines.join("\n")}\n`;
  }

  function formatBlockingFindingsText(report) {
    const lines = ["Blocking findings"];
    appendCheckSections(lines, report.hardFindings.sections);
    return `${lines.join("\n")}\n`;
  }

  function formatRiskSignalsText(report) {
    const health = report.health;
    const lines = [
      "Risk signals",
      `Functions over complexity limit: ${formatNumber(health.summary.functionsAboveThreshold)}`,
      `90th percentile function complexity: ${formatNumber(health.vitalSigns.p90Cyclomatic)}`,
      `Unusually reused files: ${formatCouplingSummary(health)}`
    ];
    return `${lines.join("\n")}\n`;
  }

  function formatCouplingSummary(health) {
    const coupling = health.coupling || {};
    const highPercent = numberOr(coupling.highPercent, health.vitalSigns.couplingHighPercent);
    const scoredFileCount = numberOr(coupling.scoredFileCount, health.summary.filesScored);
    const thresholdText = couplingThresholdText(coupling);
    const displayCount = couplingDisplayCount(coupling, Boolean(thresholdText));
    const details = [];

    if (highPercent > 0) details.push(`${highPercent}%`);
    if (thresholdText) details.push(`unusual means ${thresholdText}`);
    if (scoredFileCount > 0) {
      const summary = displayCount === 0
        ? `No unusually reused files among ${formatNumber(scoredFileCount)} files`
        : `${formatNumber(displayCount)} ${pluralize("file", displayCount)} unusually reused among ${formatNumber(scoredFileCount)} files`;
      return details.length > 0 ? `${summary} (${details.join("; ")})` : summary;
    }
    return highPercent > 0 ? `${highPercent}% of files are unusually reused` : "No unusually reused files";
  }

  function couplingDisplayCount(coupling, hasThreshold) {
    if (hasThreshold && coupling && Array.isArray(coupling.candidates)) {
      return numberOr(coupling.candidateCount, coupling.candidates.length);
    }
    return numberOr(coupling.estimatedHighFileCount, 0);
  }

  function couplingThresholdText(coupling) {
    if (!coupling) return "";
    const thresholds = [];
    if (coupling.fanInThreshold !== null && coupling.fanInThreshold !== undefined && Number.isFinite(Number(coupling.fanInThreshold))) {
      thresholds.push(`more than ${formatNumber(coupling.fanInThreshold)} other files depend on it`);
    }
    if (coupling.fanOutThreshold !== null && coupling.fanOutThreshold !== undefined && Number.isFinite(Number(coupling.fanOutThreshold))) {
      thresholds.push(`it depends on more than ${formatNumber(coupling.fanOutThreshold)} other files`);
    }
    return thresholds.join(" or ");
  }

  function pluralize(word, count) {
    return count === 1 ? word : `${word}s`;
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatRefactoringSuggestionsText(report) {
    const lines = ["Refactoring suggestions"];
    appendTargets(lines, report.health.targets, false);
    return `${lines.join("\n")}\n`;
  }

  function statusText(payload) {
    if (payload.running) return "Scanning";
    return statusLabel(payload.state);
  }

  function runSummaryText(payload) {
    if (!payload.report) return "No scan has run yet.";
    const generatedAt = formatDate(payload.report.generatedAt || payload.finishedAt);
    const seconds = Math.max(0.1, payload.report.durationMs / 1000).toFixed(1);
    return `${generatedAt} · ${seconds} seconds · Fallow ${payload.report.version || "unknown"}`;
  }

  function runSummaryHtml(payload) {
    if (!payload.report) return "No scan has run yet.";
    const generatedAt = formatDate(payload.report.generatedAt || payload.finishedAt);
    const seconds = Math.max(0.1, payload.report.durationMs / 1000).toFixed(1);
    const version = payload.report.version || "unknown";
    return `
      <span class="run-summary-item"><i data-lucide="clock"></i>${generatedAt} · ${seconds} seconds</span>
      <span class="run-summary-item"><i data-lucide="git-commit"></i>Fallow ${version}</span>
    `;
  }

  function statusLabel(state) {
    return STATUS_LABELS[state] || STATUS_LABELS.idle;
  }

  function formatDate(value) {
    if (!value) return "No timestamp";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium"
    }).format(new Date(value));
  }

  function appendCheckSections(lines, sections) {
    if (sections.length === 0) {
      lines.push("- None");
      return;
    }

    sections.forEach((section) => {
      lines.push(`- ${section.label}: ${section.count}`);
      section.records.forEach((record) => {
        lines.push(`  - ${record.title}${record.detail ? ` (${record.detail})` : ""}`);
      });
    });
  }

  function appendTargets(lines, targets, includeHeading) {
    if (includeHeading) lines.push("", "Refactoring suggestions");
    if (targets.length === 0) {
      lines.push("- None");
      return;
    }

    targets.forEach((target) => {
      lines.push(`- ${target.path}: ${formatRecommendation(target.recommendation)}`);
    });
  }

  window.codeScanFormat = {
    effortTone,
    formatBlockingFindingsText,
    formatNumber,
    formatCouplingSummary,
    formatRecommendation,
    formatRefactoringSuggestionsText,
    formatRiskSignalsText,
    formatReportText,
    runSummaryHtml,
    runSummaryText,
    statusText,
    thresholdTone
  };
}
