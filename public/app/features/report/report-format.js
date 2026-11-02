const MISSING_COUPLING_THRESHOLDS = new Set([null, undefined, ""]);

function effortTone(effort) {
  if (effort === "high") return "critical";
  if (effort === "medium") return "warn";
  if (effort === "low") return "good";
  return "neutral";
}

function thresholdTone(value, goodMax, warnMax) {
  const number = Number(value);
  if (number <= goodMax) return "good";
  if (number <= warnMax) return "warn";
  return "critical";
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

export { effortTone, thresholdTone, isAboveCouplingThreshold };
