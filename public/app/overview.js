import * as format from "./format.js";
import * as icons from "./icons.js";
import { escapeHtml } from "./html.js";
import { METRIC_HISTORY_LIMIT, metricNumber, metricRenderState, readMetricHistory, writeMetricHistory } from "./metric-history.js";
import { demoMetricRenderState } from "./demo.js";

const METRIC_HISTOGRAM_MAX_HEIGHT = 78;

export function renderOverview(container, items, sampleId, projectId, isDemo) {
  const state = isDemo
    ? demoMetricRenderState(items)
    : metricRenderState(items, sampleId, readMetricHistory(projectId));
  container.replaceChildren(...items.map((item) => renderMetric(item, state.previous[item.id], state.series[item.id])));
  if (!isDemo) writeMetricHistory(projectId, state, sampleId);
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
    <div class="metric-shame-text metric-shame-text-${escapeHtml(item.tone)}">${escapeHtml(format.shameLabel(item.tone))}</div>
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
  if (!hasMetricDelta(delta)) return "";
  return metricDeltaMarkup(item, delta);
}

function hasMetricDelta(delta) {
  return delta !== null && delta !== 0;
}

function metricDeltaMarkup(item, delta) {
  const change = metricDeltaChange(delta);
  const value = formatDelta(delta, item.suffix);
  return `
    <div class="metric-delta" aria-label="${escapeHtml(`${change.label} by ${value} since last scan`)}">
      <span>${escapeHtml(value)}</span>
      <i class="metric-delta-icon" data-lucide="${change.icon}" aria-hidden="true"></i>
    </div>
  `;
}

function metricDeltaChange(delta) {
  return delta > 0
    ? { icon: "arrow-up-right", label: "Increased" }
    : { icon: "arrow-down-right", label: "Decreased" };
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
  if (points.length === 2) return straightMetricHistogramPath(points);
  return smoothMetricHistogramPath(points);
}

function straightMetricHistogramPath(points) {
  return `M ${metricHistogramCoordinate(points[0])} L ${metricHistogramCoordinate(points[1])}`;
}

function smoothMetricHistogramPath(points) {
  let path = `M ${metricHistogramCoordinate(points[0])}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    path += metricHistogramCurveSegment(points, index);
  }
  return path;
}

function metricHistogramCurveSegment(points, index) {
  const start = points[index];
  const end = points[index + 1];
  const controls = metricHistogramCurveControls(points, index, start, end);
  return ` C ${metricHistogramCoordinate(controls.first)} ${metricHistogramCoordinate(controls.second)} ${metricHistogramCoordinate(end)}`;
}

function metricHistogramCurveControls(points, index, start, end) {
  const before = points[Math.max(index - 1, 0)];
  const after = points[Math.min(index + 2, points.length - 1)];
  return {
    first: {
      x: start.x + (end.x - before.x) / 6,
      y: start.y + (end.y - before.y) / 6
    },
    second: {
      x: end.x - (after.x - start.x) / 6,
      y: end.y - (after.y - start.y) / 6
    }
  };
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


function metricHref(id) {
  const targets = {
    "blocking-findings": "#blocking-findings",
    maintainability: "#lowest-maintainability",
    "refactoring-suggestions": "#refactoring-suggestions",
    "unusually-reused-files": "#unusually-reused-files"
  };
  return targets[id] || "#";
}
