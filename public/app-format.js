{
  const MISSING_COUPLING_THRESHOLDS = new Set([null, undefined, ""]);

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
      `90th percentile function complexity: ${formatNumber(health.vitalSigns.p90Cyclomatic)}`
    ];
    return `${lines.join("\n")}\n`;
  }

  function formatCouplingSummary(health) {
    const coupling = health.coupling || {};
    const summary = couplingSummary(health, coupling);
    const details = couplingSummaryDetails(health, coupling);
    return details.length > 0 ? `${summary} (${details.join("; ")})` : summary;
  }

  function couplingSummary(health, coupling) {
    const highPercent = couplingHighPercent(health, coupling);
    const scoredFileCount = numberOr(coupling.scoredFileCount, health.summary.filesScored);
    if (scoredFileCount > 0) return scoredCouplingSummary(coupling, scoredFileCount);
    return highPercent > 0 ? `${highPercent}% of files have high coupling` : "No high-coupling files";
  }

  function scoredCouplingSummary(coupling, scoredFileCount) {
    const thresholdText = couplingThresholdText(coupling);
    const displayCount = couplingDisplayCount(coupling, Boolean(thresholdText));
    if (displayCount === 0) return `No high-coupling files among ${formatNumber(scoredFileCount)} files`;
    return `${formatNumber(displayCount)} ${pluralize("file", displayCount)} with high coupling among ${formatNumber(scoredFileCount)} files`;
  }

  function couplingSummaryDetails(health, coupling) {
    const highPercent = couplingHighPercent(health, coupling);
    const thresholdText = couplingThresholdText(coupling);
    return [
      highPercent > 0 ? `${highPercent}%` : "",
      thresholdText ? `high coupling means ${thresholdText}` : ""
    ].filter(Boolean);
  }

  function couplingHighPercent(health, coupling) {
    return numberOr(coupling.highPercent, health.vitalSigns.couplingHighPercent);
  }

  function couplingDisplayCount(coupling, hasThreshold) {
    if (hasThreshold && coupling && Array.isArray(coupling.candidates)) {
      return numberOr(coupling.candidateCount, coupling.candidates.length);
    }
    return numberOr(coupling.estimatedHighFileCount, 0);
  }

  function couplingThresholdText(coupling) {
    if (!coupling) return "";
    return [
      couplingThreshold(coupling.fanInThreshold, (value) => `more than ${formatNumber(value)} other files depend on it`),
      couplingThreshold(coupling.fanOutThreshold, (value) => `it depends on more than ${formatNumber(value)} other files`)
    ].filter(Boolean).join(" or ");
  }

  function couplingThreshold(value, format) {
    const number = couplingThresholdValue(value);
    return number === null ? "" : format(number);
  }

  function couplingThresholdValue(value) {
    if (MISSING_COUPLING_THRESHOLDS.has(value)) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function isAboveCouplingThreshold(value, threshold) {
    const thresholdValue = couplingThresholdValue(threshold);
    return thresholdValue !== null && Number(value) > thresholdValue;
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

  function formatCouplingText(report) {
    const coupling = report.health.coupling || {};
    const candidates = Array.isArray(coupling.candidates) ? coupling.candidates : [];
    const lines = ["Coupling"];

    if (candidates.length === 0) {
      lines.push("- None");
      return `${lines.join("\n")}\n`;
    }

    candidates.forEach((candidate) => {
      const fanIn = formatNumber(candidate.fanIn);
      const fanOut = formatNumber(candidate.fanOut);
      lines.push(`- ${candidate.path}: ${formatNumber(candidate.lines)} lines of code; used by ${fanIn} ${pluralize("file", candidate.fanIn)}; uses ${fanOut} ${pluralize("file", candidate.fanOut)}`);
    });
    return `${lines.join("\n")}\n`;
  }

  function formatLowestMaintainabilityText(report) {
    const health = report.health;
    const fileScores = Array.isArray(health.fileScores) ? health.fileScores : [];
    const findingsByPath = health.findings.reduce((counts, finding) => {
      counts.set(finding.path, (counts.get(finding.path) || 0) + 1);
      return counts;
    }, new Map());
    const lines = ["Lowest maintainability"];

    if (fileScores.length === 0) {
      lines.push("- None");
      return `${lines.join("\n")}\n`;
    }

    fileScores.forEach((score) => {
      const findingCount = findingsByPath.get(score.path) || 0;
      const details = [
        `${formatNumber(score.lines)} lines of code`,
        `maintainability ${Number(score.maintainability).toFixed(1)}`
      ];
      if (findingCount > 0) details.push(`${formatNumber(findingCount)} complexity ${findingCount === 1 ? "finding" : "findings"}`);
      lines.push(`- ${score.path}: ${details.join("; ")}`);
    });
    return `${lines.join("\n")}\n`;
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
    formatLowestMaintainabilityText,
    formatRecommendation,
    formatRefactoringSuggestionsText,
    formatRiskSignalsText,
    formatReportText,
    formatCouplingText,
    isAboveCouplingThreshold,
    thresholdTone
  };
}
