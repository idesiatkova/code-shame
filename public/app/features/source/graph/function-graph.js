import { readDesignTokens, presentStyles } from "../../../shared/design/tokens.js";

function functionGraphStyle(tokens = readDesignTokens()) {
  return presentStyles([
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-wrap": "wrap",
        "text-max-width": 150,
        "text-valign": "center",
        "text-halign": "center",
        color: tokens["graph-function-ink"],
        "font-family": tokens["font-sans"],
        "font-size": tokens["text-xs"],
        width: 170,
        height: 54,
        shape: "round-rectangle",
        "background-color": tokens["graph-function-node"],
      },
    },
    {
      selector: "node.root",
      style: {
        "background-color": tokens["graph-function-root"],
        "border-width": 3,
        "border-color": tokens["graph-function-root-border"],
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": tokens["graph-function-edge"],
        "target-arrow-color": tokens["graph-function-edge"],
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    {
      selector: "edge.selected-call",
      style: {
        width: 4,
        "line-color": tokens["graph-function-selected"],
        "target-arrow-color": tokens["graph-function-selected"],
      },
    },
  ]);
}

export { functionGraphStyle };
