#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { PID_FILE_PATH } = require("./paths");

const SERVER_PATH = path.join(__dirname, "server.js");
const STOP_TIMEOUT_MS = 3000;
const STOP_POLL_MS = 50;

async function start() {
  await stopPreviousServer();
  startServer();
}

async function stopPreviousServer() {
  const pid = readPreviousPid();
  if (!pid || pid === process.pid || !isProcessRunning(pid)) {
    removePidFile();
    return;
  }

  stopProcess(pid);
  await waitForExit(pid);
  removePidFile();
}

function stopProcess(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error.code === "EPERM") {
      throw new Error(`Cannot stop previous Code Shame process ${pid}. Stop it once, then rerun npx code-shame.`);
    }
    throw error;
  }
}

function readPreviousPid() {
  return parsePid(readPidFileContent());
}

function readPidFileContent() {
  try {
    return fs.readFileSync(PID_FILE_PATH, "utf8").trim();
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function parsePid(content) {
  const pid = Number(content);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function waitForExit(pid) {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (isProcessRunning(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS));
  }

  if (isProcessRunning(pid)) {
    throw new Error(`Could not stop previous Code Shame process ${pid}.`);
  }
}

function removePidFile() {
  try {
    fs.unlinkSync(PID_FILE_PATH);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function startServer() {
  require(SERVER_PATH);
}

function fail(error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}

start().catch(fail);
