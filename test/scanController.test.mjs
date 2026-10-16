import assert from "node:assert/strict";
import test from "node:test";
import { createScanController } from "../public/app/scan-controller.js";

function setup(responses) {
  const pending = new Map();
  let timerId = 0;
  const timers = {
    setTimeout(callback, delay) { pending.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { pending.delete(id); },
    setInterval(callback, delay) { pending.set(++timerId, { callback, delay }); return timerId; },
    clearInterval(id) { pending.delete(id); }
  };
  const element = () => ({
    disabled: false, hidden: true, dataset: {},
    addEventListener() {}, setAttribute() {},
    classList: { toggle() {} }, style: { setProperty() {} },
    querySelector: () => ({ textContent: "" })
  });
  const elements = {
    refreshButton: element(), refreshControl: element(), refreshMenu: element(),
    refreshMenuToggle: element(), refreshMenuOptions: []
  };
  const calls = [];
  const payloads = [];
  const errors = [];
  const controller = createScanController({ elements, timers,
    document: { cookie: "", addEventListener() {} },
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      const value = responses.shift();
      if (value instanceof Error) throw value;
      return { ok: true, json: async () => value };
    },
    renderPayload: (payload) => payloads.push(payload),
    showError: (error) => errors.push(error)
  });
  return { controller, elements, calls, payloads, errors, pending };
}

test("starts an idle scan, coalesces requests, and polls until completion", async () => {
  const { controller, elements, calls, pending, payloads } = setup([
    { state: "idle", running: false }, { state: "running", running: true }, { state: "ready", running: false }
  ]);
  await controller.start();
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST"]);
  assert.equal(elements.refreshButton.disabled, true);
  const poll = [...pending.values()].find((timer) => timer.delay === 1500);
  await poll.callback();
  assert.equal(payloads.at(-1).state, "ready");
  assert.equal(elements.refreshButton.disabled, false);
  const first = controller.refresh();
  assert.equal(controller.refresh(), first);
  await first;
  controller.dispose();
  assert.equal(pending.size, 0);
});

test("retries a failed poll and cancels requests and timers on disposal", async () => {
  const { controller, pending, errors, calls } = setup([
    { state: "ready", running: true }, new Error("offline")
  ]);
  await controller.start();
  await [...pending.values()].find((timer) => timer.delay === 1500).callback();
  assert.deepEqual(errors, ["offline"]);
  assert.ok([...pending.values()].some((timer) => timer.delay === 1500));
  controller.dispose();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(pending.size, 0);
  await controller.refresh();
  assert.equal(calls.length, 2);
});
