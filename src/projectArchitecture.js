const path = require("node:path");
const { minimatch } = require("minimatch");

const DEFAULT_MAX_FILES = 48;
const LAYER_PALETTE = [
  "#5fb57d",
  "#b47cff",
  "#5aa7ff",
  "#e0a84f",
  "#df6d63",
  "#58c6c8",
  "#d27adf",
  "#8fb85b",
  "#d48b65",
  "#8794a8"
];

const DEFAULT_LAYER_DEFINITIONS = Object.freeze([
  layer("tests", "Tests", "tests", matchesTests),
  layer("styles", "Styles / Design System", "styles", matchesStyles),
  layer("state", "State / Stores", "state", pathMatcher(["state", "store", "stores", "redux", "zustand", "mobx", "recoil", "pinia"])),
  layer("routes", "Pages / Routes", "routes", pathMatcher(["pages", "routes", "router", "screens", "views"])),
  layer("api", "API / Data", "api", matchesApi),
  layer("ui", "UI / Components", "ui", matchesUi),
  layer("analysis", "Analysis / Graph Model", "analysis", matchesAnalysis),
  layer("domain", "Domain / Features", "domain", pathMatcher(["domain", "entities", "features", "models", "modules", "use-cases", "usecases"])),
  layer("shared", "Shared / Utilities", "shared", matchesShared),
  layer("server", "Server / Runtime", "server", matchesServer),
  layer("tooling", "Tooling / Configuration", "tooling", matchesTooling),
  layer("other", "Other", "other", () => true)
]);

class GraphModelBuilder {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }

  addNode(node) {
    if (!node || !node.id) throw new Error("Graph nodes require an id.");
    this.nodes.set(node.id, node);
  }

  addEdge(edge) {
    if (!edge || !edge.id || !edge.source || !edge.target) {
      throw new Error("Graph edges require id, source, and target.");
    }

    const existing = this.edges.get(edge.id);
    if (existing) {
      existing.weight = (Number(existing.weight) || 1) + (Number(edge.weight) || 1);
      return;
    }
    this.edges.set(edge.id, edge);
  }

  build(metadata = {}) {
    return {
      ...metadata,
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values())
    };
  }
}

function createArchitecturePlan({ listOutput, configOutput, fileScores = [], maxFiles = DEFAULT_MAX_FILES }) {
  const files = uniqueStrings(objectValue(listOutput).files).sort();
  const entryPoints = new Set(asArray(objectValue(listOutput).entry_points).map((entry) => stringValue(entry.path)).filter(Boolean));
  const classifier = createLayerClassifier(configOutput, files);
  const scoreByPath = new Map(asArray(fileScores).map((score) => [stringValue(score.path), normalizeScore(score)]));
  const assignments = files.map((filePath) => ({
    filePath,
    layer: classifier.classify(filePath),
    score: scoreByPath.get(filePath) || emptyScore(filePath),
    entryPoint: entryPoints.has(filePath)
  }));
  const visibleAssignments = selectVisibleAssignments(assignments, maxFiles);
  const visiblePaths = new Set(visibleAssignments.map((assignment) => assignment.filePath));
  const layers = classifier.definitions
    .map((definition) => layerSummary(definition, assignments, visiblePaths))
    .filter((summary) => summary.fileCount > 0);

  return {
    assignments,
    configOutput: objectValue(configOutput),
    entryPoints,
    files,
    layers,
    visibleAssignments,
    visiblePaths
  };
}

function buildProjectArchitecture(plan, inspections, options = {}) {
  const builder = new GraphModelBuilder();
  const context = {
    inspections: asArray(inspections),
    plan
  };
  const nodeContributors = options.nodeContributors || DEFAULT_NODE_CONTRIBUTORS;
  const relationshipProviders = options.relationshipProviders || DEFAULT_RELATIONSHIP_PROVIDERS;

  nodeContributors.forEach((contributor) => contributor(context, builder));
  relationshipProviders.forEach((provider) => provider(context, builder));

  const graph = builder.build({
    state: "ready",
    source: "fallow",
    totalFileCount: plan.files.length,
    visibleFileCount: plan.visibleAssignments.length,
    truncated: plan.visibleAssignments.length < plan.files.length,
    inspectionErrorCount: context.inspections.filter((inspection) => inspection.error).length
  });
  graph.layerCount = graph.nodes.filter((node) => node.type === "layer").length;
  graph.crossLayerEdgeCount = graph.edges.filter((edge) => edge.crossLayer).length;
  return graph;
}

function contributeLayerNodes({ plan }, builder) {
  plan.layers.forEach((summary) => {
    builder.addNode({
      id: layerNodeId(summary.id),
      type: "layer",
      layerId: summary.id,
      label: summary.label,
      color: summary.color,
      fileCount: summary.fileCount,
      hiddenFileCount: summary.hiddenFileCount,
      source: summary.source
    });
  });
}

function contributeFileNodes({ plan }, builder) {
  plan.visibleAssignments.forEach((assignment) => {
    builder.addNode({
      id: fileNodeId(assignment.filePath),
      type: "file",
      parent: layerNodeId(assignment.layer.id),
      layerId: assignment.layer.id,
      color: assignment.layer.color,
      label: path.basename(assignment.filePath),
      directory: path.dirname(assignment.filePath) === "." ? "" : path.dirname(assignment.filePath),
      path: assignment.filePath,
      entryPoint: assignment.entryPoint,
      metrics: assignment.score
    });
  });
}

function contributeOverflowNodes({ plan }, builder) {
  plan.layers.filter((summary) => summary.hiddenFileCount > 0).forEach((summary) => {
    builder.addNode({
      id: `summary:${summary.id}`,
      type: "summary",
      parent: layerNodeId(summary.id),
      layerId: summary.id,
      color: summary.color,
      label: `+${summary.hiddenFileCount} more`,
      hiddenFileCount: summary.hiddenFileCount
    });
  });
}

function contributeImportRelationships({ inspections, plan }, builder) {
  const layerByPath = new Map(plan.assignments.map((assignment) => [assignment.filePath, assignment.layer.id]));

  inspections.filter((inspection) => !inspection.error).forEach((inspection) => {
    const trace = objectValue(objectValue(objectValue(inspection.report).evidence).trace_file);
    const traceData = objectValue(trace.data);
    const inspectedPath = stringValue(traceData.file) || inspection.filePath;
    asArray(traceData.imports_from).forEach((dependencyPath) => {
      addImportEdge(builder, inspectedPath, stringValue(dependencyPath), plan.visiblePaths, layerByPath);
    });
    asArray(traceData.imported_by).forEach((importerPath) => {
      addImportEdge(builder, stringValue(importerPath), inspectedPath, plan.visiblePaths, layerByPath);
    });
  });
}

function addImportEdge(builder, sourcePath, targetPath, visiblePaths, layerByPath) {
  if (!sourcePath || !targetPath || sourcePath === targetPath) return;
  if (!visiblePaths.has(sourcePath) || !visiblePaths.has(targetPath)) return;

  const sourceLayer = layerByPath.get(sourcePath);
  const targetLayer = layerByPath.get(targetPath);
  builder.addEdge({
    id: `imports:${sourcePath}->${targetPath}`,
    type: "imports",
    source: fileNodeId(sourcePath),
    target: fileNodeId(targetPath),
    crossLayer: sourceLayer !== targetLayer,
    sourceLayer,
    targetLayer,
    weight: 1
  });
}

const DEFAULT_NODE_CONTRIBUTORS = Object.freeze([
  contributeLayerNodes,
  contributeFileNodes,
  contributeOverflowNodes
]);
const DEFAULT_RELATIONSHIP_PROVIDERS = Object.freeze([
  contributeImportRelationships
]);

function createLayerClassifier(configOutput, files) {
  const configured = configuredLayerDefinitions(configOutput, files);
  const definitions = [...configured, ...DEFAULT_LAYER_DEFINITIONS].map((definition, index) => ({
    ...definition,
    color: definition.color || LAYER_PALETTE[index % LAYER_PALETTE.length]
  }));

  return {
    definitions,
    classify(filePath) {
      return definitions.find((definition) => definition.matches(filePath)) || definitions[definitions.length - 1];
    }
  };
}

function configuredLayerDefinitions(configOutput, files) {
  const zones = asArray(objectValue(objectValue(configOutput).boundaries).zones);
  const definitions = [];
  const usedIds = new Set();

  zones.forEach((zone, zoneIndex) => {
    const name = stringValue(zone.name);
    const patterns = rootedPatterns(zone);
    if (name && patterns.length > 0) {
      definitions.push(configuredLayer(name, patterns, usedIds, zoneIndex));
    }

    asArray(zone.autoDiscover).forEach((directory) => {
      discoveredZoneChildren(stringValue(directory), files).forEach((child) => {
        const discoveredName = name ? `${name}: ${humanize(child)}` : humanize(child);
        definitions.push(configuredLayer(discoveredName, [`${trimGlobDirectory(directory)}/${child}/**`], usedIds, zoneIndex));
      });
    });
  });

  return definitions;
}

function configuredLayer(name, patterns, usedIds, paletteIndex) {
  const id = uniqueLayerId(slugify(name) || "zone", usedIds);
  return {
    id,
    label: name,
    kind: "configured",
    source: "fallow-boundary",
    color: LAYER_PALETTE[paletteIndex % LAYER_PALETTE.length],
    matches(filePath) {
      return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
    }
  };
}

function rootedPatterns(zone) {
  const root = stringValue(zone.root).replace(/\/$/, "");
  const patterns = asArray(zone.patterns).map(stringValue).filter(Boolean);
  if (patterns.length === 0 && root) return [`${root}/**`];
  return patterns.map((pattern) => root ? `${root}/${pattern}` : pattern);
}

function discoveredZoneChildren(directory, files) {
  const prefix = `${trimGlobDirectory(directory)}/`;
  return Array.from(new Set(files
    .filter((filePath) => filePath.startsWith(prefix))
    .map((filePath) => filePath.slice(prefix.length).split("/")[0])
    .filter(Boolean)));
}

function trimGlobDirectory(directory) {
  return String(directory || "").replace(/\/(?:\*\*?|\{.*\})\/?$/, "").replace(/\/$/, "");
}

function selectVisibleAssignments(assignments, maxFiles) {
  const limit = Math.max(1, Number(maxFiles) || DEFAULT_MAX_FILES);
  if (assignments.length <= limit) return assignments;

  const queues = Array.from(groupBy(assignments, (assignment) => assignment.layer.id).values())
    .map((items) => items.sort(compareAssignmentPriority));
  const selected = [];
  while (selected.length < limit && queues.some((queue) => queue.length > 0)) {
    queues.forEach((queue) => {
      if (selected.length < limit && queue.length > 0) selected.push(queue.shift());
    });
  }
  return selected;
}

function compareAssignmentPriority(left, right) {
  return Number(right.entryPoint) - Number(left.entryPoint)
    || architecturePriority(right.score) - architecturePriority(left.score)
    || left.filePath.localeCompare(right.filePath);
}

function architecturePriority(score) {
  return score.fanIn * 20 + score.fanOut * 4 + score.lines / 100 + Math.max(0, 100 - score.maintainability);
}

function layerSummary(definition, assignments, visiblePaths) {
  const layerAssignments = assignments.filter((assignment) => assignment.layer.id === definition.id);
  const visibleCount = layerAssignments.filter((assignment) => visiblePaths.has(assignment.filePath)).length;
  return {
    id: definition.id,
    label: definition.label,
    color: definition.color,
    source: definition.source || "automatic",
    fileCount: layerAssignments.length,
    hiddenFileCount: layerAssignments.length - visibleCount
  };
}

function normalizeScore(score) {
  return {
    path: stringValue(score.path),
    fanIn: numberOr(score.fan_in, 0),
    fanOut: numberOr(score.fan_out, 0),
    lines: numberOr(score.lines, 0),
    maintainability: numberOr(score.maintainability_index, 0)
  };
}

function emptyScore(filePath) {
  return { path: filePath, fanIn: 0, fanOut: 0, lines: 0, maintainability: 0 };
}

function layer(id, label, kind, matches) {
  return { id, label, kind, source: "automatic", matches };
}

function matchesTests(filePath) {
  return /(^|\/)(__tests__|e2e|fixtures|mocks|specs?|tests?)(\/|$)/i.test(filePath)
    || /\.(spec|test)\.[^/]+$/i.test(filePath);
}

function matchesStyles(filePath) {
  return /\.(css|less|sass|scss|styl)$/i.test(filePath)
    || pathMatcher(["design-system", "styles", "theme", "themes", "tokens", "ui-kit"])(filePath);
}

function matchesUi(filePath) {
  return pathMatcher(["components", "layouts", "public", "templates", "ui", "widgets"])(filePath)
    || /\.(html|vue|svelte)$/i.test(filePath);
}

function matchesApi(filePath) {
  return pathMatcher(["api", "client", "clients", "data", "graphql", "http", "network", "repositories", "services"])(filePath)
    || /(^|\/)[^/]*(api|client|gateway|repository)[^/]*\.[^/]+$/i.test(filePath);
}

function matchesAnalysis(filePath) {
  return pathMatcher(["analysis", "analyzers", "architecture", "graph", "reports"])(filePath)
    || /(^|\/)[^/]*(analysis|analyzer|architecture|graph|report)[^/]*\.[^/]+$/i.test(filePath);
}

function matchesShared(filePath) {
  return pathMatcher(["constants", "helpers", "hooks", "lib", "shared", "types", "utils"])(filePath)
    || /(^|\/)(constants?|helpers?|paths?|types?|utils?)\.[^/]+$/i.test(filePath);
}

function matchesTooling(filePath) {
  return pathMatcher(["build", "config", "configs", "scripts", "tools"])(filePath)
    || /(^|\/)(vite|webpack|rollup|eslint|prettier|babel|postcss)\.config\./i.test(filePath)
    || /(^|\/)[^/]*(bootstrap|binary|cli|setup|start)[^/]*\.[^/]+$/i.test(filePath);
}

function matchesServer(filePath) {
  return pathMatcher(["server", "runtime", "workers", "jobs", "controllers", "middleware"])(filePath)
    || /(^|\/)(server|worker|middleware)\.[^/]+$/i.test(filePath);
}

function pathMatcher(segments) {
  const segmentSet = new Set(segments.map((segment) => segment.toLowerCase()));
  return (filePath) => String(filePath).toLowerCase().split("/").some((segment) => segmentSet.has(segment));
}

function fileNodeId(filePath) {
  return `file:${filePath}`;
}

function layerNodeId(layerId) {
  return `layer:${layerId}`;
}

function uniqueLayerId(base, usedIds) {
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) candidate = `${base}-${suffix++}`;
  usedIds.add(candidate);
  return candidate;
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function humanize(value) {
  return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function groupBy(values, keyFor) {
  return values.reduce((groups, value) => {
    const key = keyFor(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
    return groups;
  }, new Map());
}

function uniqueStrings(values) {
  return Array.from(new Set(asArray(values).map(stringValue).filter(Boolean)));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === "object" ? value : {};
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

module.exports = {
  DEFAULT_MAX_FILES,
  DEFAULT_NODE_CONTRIBUTORS,
  DEFAULT_RELATIONSHIP_PROVIDERS,
  GraphModelBuilder,
  buildProjectArchitecture,
  createArchitecturePlan
};
