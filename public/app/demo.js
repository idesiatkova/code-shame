const COUPLING_DEMO_QUERY = "demo-coupling";
const DEMO_COUPLING_CANDIDATES = Object.freeze([
  { path: "src/demo/coupling-hub.js", fanIn: 121, fanOut: 1, lines: 196 },
  { path: "src/demo/request-context.js", fanIn: 18, fanOut: 9, lines: 58 },
  { path: "public/demo/scan-config.js", fanIn: 3, fanOut: 14, lines: 89 },
  { path: "src/demo/file-registry.js", fanIn: 8, fanOut: 6, lines: 143 },
  { path: "src/demo/report-helpers.js", fanIn: 4, fanOut: 2, lines: 72 }
]);
const DEMO_COUPLING_THRESHOLDS = Object.freeze({ fanIn: 3, fanOut: 5 });
const DEMO_METRIC_SERIES = Object.freeze({
  "blocking-findings": Object.freeze([12, 11, 10, 8]),
  "refactoring-suggestions": Object.freeze([5, 5, 4, 3]),
  "unusually-reused-files": Object.freeze([0, 3, 4, 5]),
  maintainability: Object.freeze([76.9, 77.2, 77.8, 78.4])
});
const DEMO_OVERVIEW = Object.freeze({
  "blocking-findings": Object.freeze({ value: 8, tone: "critical" }),
  "refactoring-suggestions": Object.freeze({ value: 3, tone: "warn" }),
  "unusually-reused-files": Object.freeze({ value: 5, tone: "neutral" }),
  maintainability: Object.freeze({ value: 78.4, tone: "warn" })
});
const DEMO_HARD_FINDINGS = Object.freeze({
  count: 8,
  sections: Object.freeze([
    Object.freeze({
      id: "unused_files",
      label: "Unused files",
      count: 3,
      records: Object.freeze([
        Object.freeze({ title: "src/demo/legacy-export.js", detail: "src/demo/legacy-export.js" }),
        Object.freeze({ title: "src/demo/old-format.js", detail: "src/demo/old-format.js" }),
        Object.freeze({ title: "src/demo/stale-config.js", detail: "src/demo/stale-config.js" })
      ])
    }),
    Object.freeze({
      id: "unresolved_imports",
      label: "Unresolved imports",
      count: 1,
      records: Object.freeze([
        Object.freeze({ title: "src/demo/request-context.js", detail: "src/demo/request-context.js:12" })
      ])
    }),
    Object.freeze({
      id: "complexity_findings",
      label: "Complexity findings",
      count: 4,
      records: Object.freeze([
        Object.freeze({ title: "src/demo/coupling-hub.js:48", detail: "Cyclomatic complexity 11, cognitive complexity 9" }),
        Object.freeze({ title: "src/demo/request-context.js:27", detail: "Cyclomatic complexity 8, cognitive complexity 7" }),
        Object.freeze({ title: "public/demo/scan-config.js:18", detail: "Cyclomatic complexity 7, cognitive complexity 6" }),
        Object.freeze({ title: "src/demo/file-registry.js:64", detail: "Cyclomatic complexity 6, cognitive complexity 5" })
      ])
    })
  ])
});
const DEMO_HEALTH = Object.freeze({
  summary: Object.freeze({
    filesAnalyzed: 48,
    filesScored: 48,
    functionsAnalyzed: 326,
    functionsAboveThreshold: 4,
    averageMaintainability: 78.4,
    criticalCount: 1,
    highCount: 3,
    moderateCount: 4
  }),
  vitalSigns: Object.freeze({
    averageCyclomatic: 3.7,
    p90Cyclomatic: 7,
    maintainabilityLowPercent: 18.8,
    couplingHighPercent: 10.4,
    totalLoc: 6482
  }),
  findings: Object.freeze([
    Object.freeze({ path: "src/demo/coupling-hub.js", line: 48, cyclomatic: 11, cognitive: 9 }),
    Object.freeze({ path: "src/demo/request-context.js", line: 27, cyclomatic: 8, cognitive: 7 }),
    Object.freeze({ path: "public/demo/scan-config.js", line: 18, cyclomatic: 7, cognitive: 6 }),
    Object.freeze({ path: "src/demo/file-registry.js", line: 64, cyclomatic: 6, cognitive: 5 })
  ]),
  fileScores: Object.freeze([
    Object.freeze({ path: "src/demo/coupling-hub.js", lines: 196, maintainability: 62.8 }),
    Object.freeze({ path: "src/demo/request-context.js", lines: 58, maintainability: 68.4 }),
    Object.freeze({ path: "public/demo/scan-config.js", lines: 89, maintainability: 74.2 }),
    Object.freeze({ path: "src/demo/file-registry.js", lines: 143, maintainability: 79.5 }),
    Object.freeze({ path: "src/demo/report-helpers.js", lines: 72, maintainability: 83.1 })
  ]),
  targets: Object.freeze([
    Object.freeze({
      path: "src/demo/coupling-hub.js",
      priority: 42.8,
      effort: "high",
      recommendation: "121 dependents amplify every change; split the module before adding new behavior"
    }),
    Object.freeze({
      path: "src/demo/request-context.js",
      priority: 32.6,
      effort: "medium",
      recommendation: "5 complex functions lack test coverage path, add tests before modifying"
    }),
    Object.freeze({
      path: "public/demo/scan-config.js",
      priority: 24.4,
      effort: "low",
      recommendation: "Reduce fan-out by extracting configuration loading from rendering"
    })
  ])
});

function reportForDisplay(report) {
  const coupling = {
    candidateCount: DEMO_COUPLING_CANDIDATES.length,
    candidates: DEMO_COUPLING_CANDIDATES,
    fanInThreshold: DEMO_COUPLING_THRESHOLDS.fanIn,
    fanOutThreshold: DEMO_COUPLING_THRESHOLDS.fanOut,
    highPercent: DEMO_HEALTH.vitalSigns.couplingHighPercent,
    scoredFileCount: DEMO_HEALTH.summary.filesScored,
    estimatedHighFileCount: DEMO_COUPLING_CANDIDATES.length
  };

  return {
    ...report,
    status: "attention",
    overview: report.overview.map((item) => ({ ...item, ...DEMO_OVERVIEW[item.id] })),
    hardFindings: DEMO_HARD_FINDINGS,
    health: { ...report.health, ...DEMO_HEALTH, coupling },
    architecture: createDemoModel()
  };
}

function isDemoMode(location = globalThis.location) {
  const localHosts = ["127.0.0.1", "localhost", "::1"];
  return localHosts.includes(location.hostname)
    && new URLSearchParams(location.search).has(COUPLING_DEMO_QUERY);
}

function demoMetricRenderState(items) {
  const series = Object.fromEntries(items.map((item) => [
    item.id,
    DEMO_METRIC_SERIES[item.id] || [item.value]
  ]));
  const previous = Object.fromEntries(items.map((item) => [
    item.id,
    demoPreviousMetricValue(series[item.id], item.value)
  ]));
  return { previous, series };
}

function demoPreviousMetricValue(series, fallback) {
  return series.length > 1 ? series[series.length - 2] : fallback;
}

function createDemoModel() {
  const layers = [
    demoLayer("styles", "Styles / Design System", "#5fb57d", 2),
    demoLayer("state", "State / Zustand", "#b47cff", 2),
    demoLayer("ui", "UI / Components", "#5aa7ff", 3),
    demoLayer("api", "API / Data", "#e0a84f", 2),
    demoLayer("domain", "Domain / Features", "#df6d63", 2),
    demoLayer("tests", "Tests", "#58c6c8", 2)
  ];
  const files = [
    demoFile("styles", "tokens.css"), demoFile("styles", "theme.css"),
    demoFile("state", "session-store.ts"), demoFile("state", "cart-store.ts"),
    demoFile("ui", "AppShell.tsx", true), demoFile("ui", "ProductCard.tsx"), demoFile("ui", "Checkout.tsx"),
    demoFile("api", "products-api.ts"), demoFile("api", "checkout-api.ts"),
    demoFile("domain", "product.ts"), demoFile("domain", "checkout.ts"),
    demoFile("tests", "checkout.test.ts"), demoFile("tests", "store.test.ts")
  ];
  const edges = [
    demoEdge("ui/AppShell.tsx", "state/session-store.ts"),
    demoEdge("ui/ProductCard.tsx", "domain/product.ts"),
    demoEdge("ui/Checkout.tsx", "state/cart-store.ts"),
    demoEdge("ui/Checkout.tsx", "domain/checkout.ts"),
    demoEdge("domain/product.ts", "api/products-api.ts"),
    demoEdge("domain/checkout.ts", "api/checkout-api.ts"),
    demoEdge("tests/checkout.test.ts", "domain/checkout.ts"),
    demoEdge("tests/store.test.ts", "state/cart-store.ts")
  ];
  return {
    state: "ready",
    source: "demo",
    totalFileCount: files.length,
    visibleFileCount: files.length,
    layerCount: layers.length,
    crossLayerEdgeCount: edges.length,
    truncated: false,
    inspectionErrorCount: 0,
    nodes: [...layers, ...files],
    edges
  };
}

function demoLayer(id, label, color, fileCount) {
  return { id: `layer:${id}`, type: "layer", layerId: id, label, color, fileCount, hiddenFileCount: 0, source: "demo" };
}

function demoFile(layerId, label, entryPoint = false) {
  const filePath = `${layerId}/${label}`;
  return {
    id: `file:${filePath}`,
    type: "file",
    parent: `layer:${layerId}`,
    layerId,
    color: demoColor(layerId),
    label,
    directory: layerId,
    path: filePath,
    entryPoint,
    metrics: { fanIn: entryPoint ? 7 : 2, fanOut: 2, lines: 84, maintainability: 82.4 }
  };
}

function demoEdge(source, target) {
  const sourceLayer = source.split("/")[0];
  const targetLayer = target.split("/")[0];
  return {
    id: `imports:${source}->${target}`,
    type: "imports",
    source: `file:${source}`,
    target: `file:${target}`,
    sourceLayer,
    targetLayer,
    crossLayer: sourceLayer !== targetLayer,
    weight: 1
  };
}

function demoColor(layerId) {
  return {
    styles: "#5fb57d", state: "#b47cff", ui: "#5aa7ff", api: "#e0a84f", domain: "#df6d63", tests: "#58c6c8"
  }[layerId] || "#8794a8";
}
export { isDemoMode, reportForDisplay, demoMetricRenderState, createDemoModel };
