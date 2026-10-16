export const METRIC_HISTORY_LIMIT = 24;

export function metricNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function metricRenderState(items, sampleId, history) {
  const snapshot = Object.fromEntries(items.map((item) => [item.id, metricNumber(item.value)]));
  const newSample = Boolean(history.current && sampleId && history.sampleId !== sampleId);
  const sameValues = history.current && Object.keys(snapshot).every((id) => snapshot[id] === history.current[id]);
  const previous = !newSample && sameValues ? history.previous || {} : history.current || {};
  const series = Object.fromEntries(Object.entries(snapshot).map(([id, value]) => {
    const values = [...(history.series?.[id] || [])];
    if (value !== null && (values.length === 0 || values.at(-1) !== value || newSample)) values.push(value);
    return [id, values.slice(-METRIC_HISTORY_LIMIT)];
  }));
  return { snapshot, previous, series };
}

export function readMetricHistory(projectId, storage) {
  if (!projectId) return {};
  try {
    const value = (storage || globalThis.localStorage).getItem(`code-shame:metrics:${projectId}`);
    const history = JSON.parse(value);
    if (!history || typeof history !== "object" || Array.isArray(history)) return {};
    return {
      current: normalizeSnapshot(history.current),
      previous: normalizeSnapshot(history.previous),
      series: Object.fromEntries(Object.entries(history.series || {}).flatMap(([id, values]) => {
        if (!Array.isArray(values)) return [];
        return [[id, values.map(metricNumber).filter((value) => value !== null).slice(-METRIC_HISTORY_LIMIT)]];
      })),
      sampleId: typeof history.sampleId === "string" ? history.sampleId : null
    };
  } catch {
    return {};
  }
}

export function writeMetricHistory(projectId, state, sampleId, storage) {
  if (!projectId) return;
  try {
    const next = { current: state.snapshot, previous: state.previous, series: state.series, sampleId };
    (storage || globalThis.localStorage).setItem(`code-shame:metrics:${projectId}`, JSON.stringify(next));
  } catch {
    // A disabled or full browser store must not interrupt the report.
  }
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  return Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, metricNumber(value)]));
}
