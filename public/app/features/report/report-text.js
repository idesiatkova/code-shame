import { formatNumber } from "../../shared/utils/format.js";

function formatRecommendation(recommendation) {
  return String(recommendation || "")
    .replace(/\((\d+) LOC\)/g, "($1 lines of code)")
    .replace(/(\d+) dependents amplify every change/g, "$1 files depend on it")
    .replace(/fan-in/g, "incoming references")
    .replace(/fan-out/g, "outgoing dependencies");
}

function formatReportText(report) {
  const lines = [
    "Fallow report",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Blocking findings: ${report.hardFindings.count}`,
    `Refactoring suggestions: ${report.health.targets.length}`,
    "",
    "Blocking findings",
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
  ];
  return `${lines.join("\n")}\n`;
}

function pluralize(word, count) {
  return count === 1 ? word : `${word}s`;
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
    lines.push(
      `- ${candidate.path}: ${formatNumber(candidate.lines)} lines of code; used by ${fanIn} ${pluralize("file", candidate.fanIn)}; uses ${fanOut} ${pluralize("file", candidate.fanOut)}`,
    );
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
      `maintainability ${Number(score.maintainability).toFixed(1)}`,
    ];
    if (findingCount > 0)
      details.push(
        `${formatNumber(findingCount)} complexity ${findingCount === 1 ? "finding" : "findings"}`,
      );
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

export {
  formatRecommendation,
  formatReportText,
  formatBlockingFindingsText,
  formatRiskSignalsText,
  formatRefactoringSuggestionsText,
  formatCouplingText,
  formatLowestMaintainabilityText,
};
