import assert from "node:assert/strict";
import test from "node:test";
import { metricRenderState, readMetricHistory, writeMetricHistory } from "../public/app/metric-history.js";

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const metrics = (value) => [{ id: "blocking-findings", value }];

test("isolates metric history by project and deduplicates polling samples", () => {
  const store = storage();
  const state = metricRenderState(metrics(8), "scan-1", readMetricHistory("a", store));
  writeMetricHistory("a", state, "scan-1", store);
  assert.deepEqual(readMetricHistory("b", store), {});
  const repeated = metricRenderState(metrics(8), "scan-1", readMetricHistory("a", store));
  assert.deepEqual(repeated.series["blocking-findings"], [8]);
  writeMetricHistory("a", repeated, "scan-1", store);
  const next = metricRenderState(metrics(3), "scan-2", readMetricHistory("a", store));
  assert.equal(next.previous["blocking-findings"], 8);
  assert.deepEqual(next.series["blocking-findings"], [8, 3]);
  writeMetricHistory("a", next, "scan-2", store);
  assert.deepEqual(readMetricHistory("a", store).previous, { "blocking-findings": 8 });
});

test("caps history and tolerates corrupt or unavailable storage", () => {
  const store = storage();
  for (let index = 0; index < 30; index++) {
    const state = metricRenderState(metrics(index), String(index), readMetricHistory("a", store));
    writeMetricHistory("a", state, String(index), store);
  }
  assert.equal(readMetricHistory("a", store).series["blocking-findings"].length, 24);
  store.setItem("code-shame:metrics:a", "bad json");
  assert.deepEqual(readMetricHistory("a", store), {});
  const unavailable = { getItem() { throw Error("denied"); }, setItem() { throw Error("quota"); } };
  assert.deepEqual(readMetricHistory("a", unavailable), {});
  const state = metricRenderState(metrics(2), "scan", {});
  assert.doesNotThrow(() => writeMetricHistory("a", state, "scan", unavailable));
});
