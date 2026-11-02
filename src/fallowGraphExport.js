const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { MAX_GRAPH_BYTES } = require("./fallowCommand");

async function exportFallowGraph(client) {
  if (client.signal?.aborted) throw client.signal.reason;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "code-shame-graph-"));
  const output = path.join(directory, "graph.dot");
  try {
    await client.runJson(["viz", "--viz-format", "dot", "--no-open", "--out", output, "--quiet"], {
      output,
    });
    const file = await fs.open(output, "r");
    try {
      const stats = await file.stat();
      if (stats.size > MAX_GRAPH_BYTES) throw new Error("Fallow DOT exceeds the size limit.");
      const buffer = Buffer.alloc(stats.size + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > stats.size) throw new Error("Fallow DOT changed while being read.");
      client.signal?.throwIfAborted();
      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await file.close();
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { exportFallowGraph };
