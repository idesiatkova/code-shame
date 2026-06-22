const CHECK_SECTIONS = [
  ["unused_files", "Unused files"],
  ["unused_exports", "Unused exports"],
  ["unused_types", "Unused types"],
  ["unused_dependencies", "Unused dependencies"],
  ["unused_enum_members", "Unused enum members"],
  ["unused_class_members", "Unused class members"],
  ["unresolved_imports", "Unresolved imports"],
  ["unlisted_dependencies", "Unlisted dependencies"],
  ["duplicate_exports", "Duplicate exports"],
  ["circular_dependencies", "Circular dependencies"],
  ["re_export_cycles", "Re-export cycles"],
  ["boundary_violations", "Boundary violations"],
  ["stale_suppressions", "Stale suppressions"]
];

const SUMMARY_FIELDS = [
  ["filesAnalyzed", "files_analyzed"],
  ["filesScored", "files_scored"],
  ["functionsAnalyzed", "functions_analyzed"],
  ["functionsAboveThreshold", "functions_above_threshold"],
  ["averageMaintainability", "average_maintainability"],
  ["criticalCount", "severity_critical_count"],
  ["highCount", "severity_high_count"],
  ["moderateCount", "severity_moderate_count"]
];

const VITAL_SIGN_FIELDS = [
  ["averageCyclomatic", "avg_cyclomatic"],
  ["p90Cyclomatic", "p90_cyclomatic"],
  ["maintainabilityLowPercent", "maintainability_low_pct"],
  ["couplingHighPercent", "coupling_high_pct"],
  ["totalLoc", "total_loc"]
];

const FILE_SCORE_FIELDS = [
  ["maintainability", "maintainability_index"],
  ["cyclomatic", "total_cyclomatic"],
  ["cognitive", "total_cognitive"],
  ["fanIn", "fan_in"],
  ["fanOut", "fan_out"],
  ["lines", "lines"]
];

function normalizeFallowReport(report, meta = {}) {
  const parts = splitReport(report);
  const checkSections = buildCheckSections(parts.check);
  const counts = buildCounts(parts, checkSections);
  const check = buildCheckSummary(parts.check, checkSections);
  const duplication = buildDuplicationSummary(parts.dupes, parts.cloneGroups);
  const health = buildHealthSummary(parts);
  const hardFindings = buildHardFindings(check, duplication, health);

  return {
    generatedAt: stringOr(meta.generatedAt, new Date().toISOString()),
    durationMs: numberOr(meta.durationMs, numberOr(report.elapsed_ms, 0)),
    exitCode: numberOr(meta.exitCode, 0),
    command: stringOr(meta.command, "fallow --format json --quiet"),
    status: hardFindings.count === 0 ? "clear" : "attention",
    version: stringValue(report.version),
    overview: buildOverview(parts, counts, health),
    hardFindings,
    check,
    duplication,
    health
  };
}

function splitReport(report) {
  const health = objectValue(report.health || (isStandaloneHealthReport(report) ? report : null));
  return {
    check: objectValue(report.check),
    dupes: objectValue(report.dupes),
    health,
    cloneGroups: asArray(objectValue(report.dupes).clone_groups),
    healthFindings: asArray(health.findings),
    targets: asArray(health.targets)
  };
}

function buildCounts(parts, checkSections) {
  const checkIssueCount = totalCheckIssues(parts.check, checkSections);
  const duplicateCount = cloneGroupCount(parts.dupes, parts.cloneGroups);
  const hardFindingCount = checkIssueCount + duplicateCount + parts.healthFindings.length;

  return {
    checkIssueCount,
    duplicateCount,
    hardFindingCount
  };
}

function buildOverview(parts, counts, health) {
  const summary = normalizeNumberFields(parts.health.summary, SUMMARY_FIELDS);
  return [
    metric("blocking-findings", "Blocking Findings", counts.hardFindingCount, zeroTone(counts.hardFindingCount)),
    metric(
      "refactoring-suggestions",
      "Refactoring Suggestions",
      parts.targets.length,
      zeroTone(parts.targets.length, "neutral")
    ),
    metric("unusually-reused-files", "Unusually Reused Files", health.coupling.candidateCount, "neutral"),
    metric("maintainability", "Maintainability", summary.averageMaintainability, maintainabilityTone(summary), "%")
  ];
}

function metric(id, label, value, tone, suffix = "") {
  return {
    id,
    label,
    value,
    tone,
    suffix
  };
}

function buildCheckSummary(check, sections) {
  return {
    totalIssues: totalCheckIssues(check, sections),
    entryPointCount: numberOr(objectValue(check.entry_points).total, 0),
    sections
  };
}

function buildDuplicationSummary(dupes, cloneGroups) {
  const stats = objectValue(dupes.stats);
  return {
    cloneGroupCount: cloneGroupCount(dupes, cloneGroups),
    cloneInstanceCount: numberOr(stats.clone_instances, 0),
    duplicatedLineCount: numberOr(stats.duplicated_lines, 0),
    duplicatedPercent: numberOr(stats.duplication_percentage, 0),
    groups: cloneGroups.map(normalizeCloneGroup)
  };
}

function buildHealthSummary(parts) {
  const summary = normalizeNumberFields(parts.health.summary, SUMMARY_FIELDS);
  const vitalSigns = normalizeNumberFields(parts.health.vital_signs, VITAL_SIGN_FIELDS);
  const fileScores = asArray(parts.health.file_scores).map(normalizeFileScore);

  return {
    findingCount: parts.healthFindings.length,
    summary,
    vitalSigns,
    coupling: buildCouplingSummary(parts.health, summary, vitalSigns, fileScores),
    findings: parts.healthFindings.map(normalizeHealthFinding),
    fileScores: fileScores.slice(0, 8),
    targets: parts.targets.map(normalizeTarget)
  };
}

function buildCouplingSummary(health, summary, vitalSigns, fileScores) {
  const rawVitalSigns = objectValue(health.vital_signs);
  const rawCounts = objectValue(rawVitalSigns.counts);
  const scoredFileCount = numberOr(firstNumber([summary.filesScored, rawCounts.files_scored, fileScores.length]), 0);
  const highPercent = vitalSigns.couplingHighPercent;
  const estimatedHighFileCount = estimateFileCount(highPercent, scoredFileCount);
  const fanInThreshold = optionalNumberField(rawVitalSigns, "p95_fan_in");
  const fanOutThreshold = optionalNumberField(rawVitalSigns, "p95_fan_out");
  const candidates = highCouplingCandidates(fileScores, fanInThreshold, fanOutThreshold);

  return {
    highPercent,
    scoredFileCount,
    estimatedHighFileCount,
    candidateCount: candidates.length,
    fanInThreshold,
    fanOutThreshold,
    candidates
  };
}

function estimateFileCount(percent, total) {
  if (percent <= 0 || total <= 0) return 0;
  return Math.round((percent / 100) * total);
}

function highCouplingCandidates(fileScores, fanInThreshold, fanOutThreshold) {
  return fileScores
    .filter((score) => isHighCouplingCandidate(score, fanInThreshold, fanOutThreshold))
    .sort((left, right) => {
      return right.fanIn - left.fanIn || right.fanOut - left.fanOut || right.lines - left.lines;
    })
    .map((score) => ({
      path: score.path,
      fanIn: score.fanIn,
      fanOut: score.fanOut,
      lines: score.lines
    }));
}

function isHighCouplingCandidate(score, fanInThreshold, fanOutThreshold) {
  const fanInHit = fanInThreshold !== null && score.fanIn > fanInThreshold;
  const fanOutHit = fanOutThreshold !== null && score.fanOut > fanOutThreshold;
  return fanInHit || fanOutHit;
}

function buildCheckSections(check) {
  const summary = objectValue(check.summary);

  return CHECK_SECTIONS.map(([id, label]) => checkSection(check, summary, id, label)).filter(hasFindings);
}

function checkSection(check, summary, id, label) {
  const records = asArray(check[id]);
  return {
    id,
    label,
    count: numberOr(summary[id], records.length),
    records: records.map((record) => normalizeCheckRecord(id, record))
  };
}

function buildHardFindings(check, duplication, health) {
  const sections = [
    ...check.sections,
    duplicationSection(duplication),
    complexitySection(health)
  ].filter(hasFindings);

  return {
    count: sections.reduce((sum, section) => sum + section.count, 0),
    sections
  };
}

function duplicationSection(duplication) {
  return {
    id: "duplicated_code",
    label: "Duplicated code groups",
    count: duplication.cloneGroupCount,
    records: duplication.groups.map((group) => ({
      title: `${group.lineCount} duplicated lines`,
      detail: group.instances.join(" | ")
    }))
  };
}

function complexitySection(health) {
  return {
    id: "complexity_findings",
    label: "Complexity findings",
    count: health.findingCount,
    records: health.findings.map((finding) => ({
      title: pathWithLine(finding.path, finding.line) || finding.title,
      detail: `Cyclomatic complexity ${finding.cyclomatic}, cognitive complexity ${finding.cognitive}`
    }))
  };
}

function normalizeCheckRecord(sectionId, record) {
  if (sectionId === "duplicate_exports") return duplicateExportRecord(record);
  return genericCheckRecord(record, sectionId);
}

function isStandaloneHealthReport(report) {
  return objectValue(report).kind === "health" || Boolean(report.vital_signs || report.file_scores);
}

function duplicateExportRecord(record) {
  return {
    title: stringOr(record.export_name, "Duplicate export"),
    detail: asArray(record.locations).map(formatLocation).filter(Boolean).join(" | ")
  };
}

function genericCheckRecord(record, sectionId) {
  return {
    title: firstString([record.path, record.file, record.dependency, record.export_name, sectionId]),
    detail: stringOr(formatLocation(record), firstString([record.reason, record.message]))
  };
}

function normalizeCloneGroup(group) {
  return {
    title: firstString([group.fingerprint, group.id, "Clone group"]),
    lineCount: numberOr(firstNumber([group.line_count, group.lines]), 0),
    tokenCount: numberOr(firstNumber([group.token_count, group.tokens]), 0),
    instances: asArray(group.instances).map(formatLocation).filter(Boolean)
  };
}

function normalizeHealthFinding(finding) {
  return {
    title: firstString([finding.function_name, finding.symbol, finding.path, "Health finding"]),
    path: stringValue(finding.path),
    line: numberOr(finding.line, 0),
    severity: stringOr(finding.severity, "moderate"),
    cyclomatic: numberOr(finding.cyclomatic, 0),
    cognitive: numberOr(finding.cognitive, 0)
  };
}

function normalizeFileScore(score) {
  return {
    path: stringValue(score.path),
    ...normalizeNumberFields(score, FILE_SCORE_FIELDS)
  };
}

function normalizeTarget(target) {
  return {
    path: stringValue(target.path),
    priority: numberOr(target.priority, 0),
    efficiency: numberOr(target.efficiency, 0),
    category: stringValue(target.category),
    effort: stringValue(target.effort),
    confidence: stringValue(target.confidence),
    recommendation: stringValue(target.recommendation)
  };
}

function normalizeNumberFields(source, fields) {
  const sourceObject = objectValue(source);
  return Object.fromEntries(fields.map(([targetKey, sourceKey]) => [targetKey, numberOr(sourceObject[sourceKey], 0)]));
}

function optionalNumberField(source, key) {
  if (!Object.hasOwn(objectValue(source), key)) return null;
  return finiteNumber(objectValue(source)[key]);
}

function cloneGroupCount(dupes, cloneGroups) {
  return numberOr(objectValue(dupes.stats).clone_groups, cloneGroups.length);
}

function totalCheckIssues(check, sections) {
  const total = finiteNumber(check.total_issues);
  if (total !== null) return total;
  return sections.reduce((sum, section) => sum + section.count, 0);
}

function formatLocation(location) {
  const locationObject = objectValue(location);
  const path = firstString([locationObject.path, locationObject.file]);
  const line = firstNumber([locationObject.line, locationObject.start_line]);
  return pathWithLine(path, line);
}

function pathWithLine(path, line) {
  if (!path) return "";
  if (line === null) return path;
  return `${path}:${line}`;
}

function zeroTone(value, clearTone = "good") {
  return value === 0 ? clearTone : "warn";
}

function maintainabilityTone(summary) {
  if (summary.averageMaintainability >= 80) return "good";
  if (summary.averageMaintainability >= 60) return "warn";
  return "critical";
}

function hasFindings(section) {
  return section.count > 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === "object" ? value : {};
}

function firstNumber(values) {
  const found = values.map(finiteNumber).find((value) => value !== null);
  return found === undefined ? null : found;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOr(value, fallback) {
  const number = finiteNumber(value);
  return number === null ? fallback : number;
}

function firstString(values) {
  return values.map(stringValue).find(Boolean) || "";
}

function stringOr(value, fallback) {
  return stringValue(value) || fallback;
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

module.exports = {
  normalizeFallowReport
};
