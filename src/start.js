#!/usr/bin/env node

const path = require("node:path");
const { createServer } = require("./server");

function start() {
  const host = process.env.HOST || "127.0.0.1";
  const port = integerSetting("PORT", 5179, 0, 65535);
  const projectRoot = path.resolve(process.env.CODE_SCAN_ROOT || process.cwd());
  const server = createServer({
    projectRoot,
    maxFiles: integerSetting("ARCHITECTURE_MAX_FILES", 48, 1, 1000)
  });

  server.once("error", (error) => {
    console.error(error.code === "EADDRINUSE"
      ? `Code Shame could not start: http://${host}:${port} is already in use.`
      : error.message);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`Code Shame: http://${host}:${server.address().port}`);
    console.log(`Project: ${projectRoot}`);
  });

  const shutdown = () => {
    server.close();
    server.closeAllConnections();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  server.once("close", () => {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
  });
}

function integerSetting(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

try {
  start();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
