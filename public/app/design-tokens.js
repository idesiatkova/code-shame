const names = [
  "font-sans", "text-2xs", "text-xs", "text-small", "text-normal", "weight-600", "weight-bold",
  "ink", "muted", "control-surface", "coupling",
  ...["tests", "styles", "state", "routes", "api", "ui", "analysis", "domain", "shared", "server", "tooling", "other", "unknown"].map((id) => `layer-${id}`),
  "graph-directory-surface", "graph-directory-border", "graph-entry-surface", "graph-edge",
  "graph-function-node", "graph-function-root", "graph-function-root-border",
  "graph-function-edge", "graph-function-selected", "graph-function-ink"
];

function readDesignTokens() {
  const root = globalThis.document?.documentElement;
  const styles = root && globalThis.window?.getComputedStyle?.(root);
  return Object.fromEntries(names.map((name) => [name, styles?.getPropertyValue(`--${name}`).trim() || ""]));
}

function presentStyles(rules) {
  return rules.map(({ selector, style }) => ({
    selector,
    style: Object.fromEntries(Object.entries(style).filter(([, value]) => value !== "" && value !== undefined))
  }));
}

export { readDesignTokens, presentStyles };
