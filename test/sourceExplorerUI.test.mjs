import assert from "node:assert/strict";
import test from "node:test";
import { createSourceExplorer } from "../public/app/source-explorer.js";

test("source explorer preserves keyboard context and ignores stale responses", async () => {
  const old = globalThis.document;
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {}; this.value = ""; this.classList = { add() {}, remove() {} }; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { for (const child of this.children) child.parent = null; this.children = []; this.append(...nodes); }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector(selector) { for (const child of this.children) { if (child.className === selector.slice(1)) return child; const match = child.querySelector(selector); if (match) return match; } return null; }
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; } }
    contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
    get isConnected() { return this === document.body || !!this.parent?.isConnected; }
    focus() { if (this.isConnected) document.activeElement = this; }
    scrollIntoView() { this.scrolled = (this.scrolled || 0) + 1; }
    click() { this.focus(); this.listeners.click(); }
  }
  globalThis.document = { createElement: () => new Element(), body: new Element() };
  try {
    const pending = [], panel = new Element(), trigger = new Element(), outside = new Element();
    document.body.append(trigger, panel, outside); trigger.focus();
    const explorer = createSourceExplorer(panel, (url, options) => new Promise((resolve) => pending.push({ url, options, resolve })));
    const response = (name) => ({ ok: true, json: async () => ({ file: name, source: "<script>\r\none\rtwo\nthree\u2028four\u2029five", symbols: [{ id: "f", name: "f", kind: "function", startLine: 1, endLine: 6, signature: "f()" }], calls: [{ name: "c".repeat(120), line: 2, ownerId: "f" }], diagnostics: [] }) });
    const first = explorer.open("first.js");
    assert.equal(document.activeElement, panel); assert.equal(panel.scrolled, 1);
    const second = explorer.open("second.js", trigger);
    assert.equal(pending[0].options.signal.aborted, true);
    outside.focus(); pending[1].resolve(response("second.js")); await second;
    pending[0].resolve(response("first.js")); await first;
    assert.equal(document.activeElement, outside); assert.equal(explorer.file, "second.js");
    assert.equal(panel.attributes["aria-label"], "Source explorer for second.js");
    const workspace = () => panel.children.find((node) => node.className === "source-explorer-workspace");
    let [search, list] = workspace().children[0].children;
    search.value = "f"; search.listeners.input(); list.children[0].click();
    const detail = workspace().children[1];
    assert.equal(document.activeElement, detail.children[0]);
    assert.equal(workspace().children[0].children[1].children[0].attributes["aria-pressed"], "true");
    const code = detail.children.find((node) => node.className === "source-explorer-code");
    assert.equal(code.tabIndex, 0); assert.equal(code.attributes.role, "region"); assert.equal(code.attributes["aria-label"], "Source code for f");
    assert.deepEqual(code.children.map((line) => line.children[1].textContent), ["<script>", "one", "two", "three", "four", "five"]);
    const unresolved = detail.children.find((node) => node.className === "source-explorer-calls").children[1];
    assert.equal(unresolved.children[0].textContent, "Unresolved calls (1)");
    assert.match(unresolved.children[1].children[0].textContent, /unresolved syntax/);
    assert.match(unresolved.children[1].children[0].textContent, /… · call at line 2/); assert.match(unresolved.children[1].children[0].title, /^c{120} · line 2/);
    panel.children[1].children[0].click();
    [search, list] = workspace().children[0].children;
    assert.equal(search.value, "f"); assert.equal(document.activeElement, list.children[0]);
    panel.children[0].children[1].click(); assert.equal(document.activeElement, trigger); assert.equal(panel.hidden, true);
    const third = explorer.open("third.js", trigger); outside.focus(); explorer.close();
    pending[3].resolve(response("third.js")); await third;
    assert.equal(document.activeElement, outside); assert.equal(panel.hidden, true); assert.equal(panel.children.length, 0);
    const restored = explorer.open("first.js", trigger, { file: "second.js", symbol: "f", query: "f" });
    assert.match(pending[4].url, /second.js/); outside.focus(); pending[4].resolve(response("second.js")); await restored;
    assert.equal(document.activeElement, outside);
    assert.equal(explorer.state.file, "second.js"); assert.equal(explorer.state.symbol, "f"); assert.equal(explorer.state.query, "f");
    assert.match(panel.children[0].children[2].textContent, /Architecture file: first.js.*Source file: second.js/);
    const stale = explorer.open("first.js", trigger, { file: "second.js", symbol: "missing" });
    pending[6].resolve(response("second.js")); await stale;
    assert.equal(explorer.state.symbol, ""); assert.match(panel.children.at(-1).textContent, /linked symbol is no longer available/);
    const delayed = explorer.open("first.js", trigger, { file: "second.js", symbol: "f", focus: "search" });
    panel.children[0].children[1].focus(); panel.listeners.focusin();
    pending.at(-1).resolve(response("second.js")); await delayed;
    assert.equal(document.activeElement, panel.children[0].children[1]);
  } finally { globalThis.document = old; }
});

test("function graph navigates across files, restores history, and ignores stale navigation", async () => {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {}; this.value = ""; this.classList = { add() {}, remove() {} }; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes); }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector(selector) { for (const child of this.children) { if (child.className === selector.slice(1)) return child; const match = child.querySelector(selector); if (match) return match; } return null; }
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; } }
    contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
    get isConnected() { return this === document.body || !!this.parent?.isConnected; }
    focus() { if (this.isConnected) document.activeElement = this; }
    click() { this.focus(); this.listeners.click(); }
  }
  globalThis.document = { createElement: () => new Element(), body: new Element() };
  let options, destroyed = 0;
  let zoom = 0.3, centered;
  globalThis.window = { cytoscape(config) { options = config; return { on() {}, destroy() { destroyed++; }, zoom(value) { if (value != null) zoom = value; return zoom; }, getElementById(id) { return id; }, center(id) { centered = id; } }; } };
  try {
    const pending = [], panel = new Element(), trigger = new Element(); document.body.append(trigger, panel);
    let checkpoint;
    const explorer = createSourceExplorer(panel, (url, options) => new Promise((resolve) => pending.push({ url, options, resolve })), undefined, (replace) => { if (replace) checkpoint = explorer.state; });
    const source = (file, id, hash) => ({ ok: true, json: async () => ({ file, hash, source: "function f() {}", symbols: [{ id, name: id, kind: "function", startLine: 1, endLine: 1, signature: `${id}()` }], calls: [], diagnostics: [] }) });
    const a = { file: "a.js", id: "a", name: "a", startLine: 1, hash: "a-hash" }, b = { file: "b.js", id: "b", name: "b", startLine: 1, hash: "b-hash" };
    const open = explorer.open("a.js", trigger); pending[0].resolve(source("a.js", "a", "a-hash")); await open;
    const workspace = () => panel.children.find((node) => node.className === "source-explorer-workspace");
    let [search, list] = workspace().children[0].children; search.value = "a"; search.listeners.input(); list.children[0].click();
    search = workspace().children[0].children[0]; search.focus();
    pending[1].resolve({ ok: true, json: async () => ({ root: a, nodes: [a, b], edges: [{ source: a, target: b, file: "a.js", line: 1, column: 2 }], coverage: { files: ["a.js", "b.js"] }, unresolved: [] }) });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(workspace().children[0].children[0], search); assert.equal(document.activeElement, search);
    assert.equal(zoom, 0.9); assert.equal(centered, JSON.stringify(["a.js", "a"]));
    assert.equal(options.elements[2].data.source, JSON.stringify(["a.js", "a"]));
    assert.equal(options.elements[2].data.target, JSON.stringify(["b.js", "b"]));
    const section = workspace().children[1].children.find((node) => node.className === "function-graph");
    const outgoing = section.children.find((node) => node.children[0]?.textContent === "Outgoing"); outgoing.children[1].children[1].click();
    pending[2].resolve(source("b.js", "b", "b-hash")); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(explorer.file, "a.js"); assert.equal(explorer.currentFile, "b.js"); assert.ok(destroyed);
    assert.match(panel.children[0].children[2].textContent, /Architecture file: a.js.*Source file: b.js/);
    panel.children[1].children[0].click();
    assert.equal(explorer.currentFile, "a.js"); assert.equal(workspace().children[0].children[0].value, "a");
    assert.equal(document.activeElement, panel);
    assert.equal(explorer.state.focus, "edge:Outgoing:a.js:1:2:declaration");
    pending[4].resolve({ ok: true, json: async () => ({ root: a, nodes: [a, b], edges: [{ source: a, target: b, file: "a.js", line: 1, column: 2 }], coverage: { files: ["a.js"] } }) });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(document.activeElement.dataset.navigationFocus, "edge:Outgoing:a.js:1:2:declaration");
    assert.equal(checkpoint.focus, "edge:Outgoing:a.js:1:2:declaration");
    const code = workspace().children[1].children.find((node) => node.className === "source-explorer-code"); code.focus(); panel.listeners.focusin();
    assert.equal(workspace().children[1].children.find((node) => node.className === "source-explorer-code"), code); assert.equal(document.activeElement, code);
    const outgoingAgain = workspace().children[1].children.find((node) => node.className === "function-graph").children.find((node) => node.children[0]?.textContent === "Outgoing");
    outgoingAgain.children[1].children[1].click();
    panel.children[1].children[0].click();
    pending[5].resolve(source("b.js", "b", "b-hash")); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(explorer.currentFile, "a.js"); assert.equal(workspace().children[1].textContent, "Choose a symbol to inspect its source.");
    explorer.close(true); assert.equal(document.activeElement, trigger);
  } finally { globalThis.document = oldDocument; globalThis.window = oldWindow; }
});

test("call sites validate owner, position and hash across same and different files", async () => {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.dataset = {}; this.attributes = {}; this.classList = { add() {}, remove() {} }; }
    append(...nodes) { nodes.forEach((node) => { node.parent = this; this.children.push(node); }); }
    replaceChildren(...nodes) { this.children.forEach((node) => { node.parent = null; }); this.children = []; this.append(...nodes); }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector(selector) { return this.children.find((child) => child.className === selector.slice(1)) || this.children.map((child) => child.querySelector(selector)).find(Boolean); }
    remove() { this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; }
    contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
    get isConnected() { return this === document.body || !!this.parent?.isConnected; }
    focus() { if (this.isConnected) document.activeElement = this; }
    scrollIntoView() { this.scrolled = true; }
    click() { this.focus(); this.listeners.click(); }
  }
  globalThis.document = { createElement: () => new Element(), body: new Element() }; globalThis.window = {};
  try {
    const pending = [], panel = new Element(), outside = new Element(); document.body.append(panel, outside);
    const explorer = createSourceExplorer(panel, (url, options) => new Promise((resolve) => pending.push({ url, options, resolve })));
    const hashA = "a".repeat(64), hashB = "b".repeat(64);
    const a = { file: "a.js", id: "a", name: "a", startLine: 1, hash: hashA }, b = { file: "b.js", id: "b", name: "b", startLine: 1, hash: hashB };
    const source = (node, calls = []) => ({ ok: true, json: async () => ({ file: node.file, hash: node.hash, source: "function x() {\n call();\n}", symbols: [{ ...node, kind: "function", endLine: 3, signature: "function x()" }], calls, diagnostics: [] }) });
    const callA = { name: "b", ownerId: "a", line: 2, column: 2, status: "resolved", target: b };
    const callB = { name: "a", ownerId: "b", line: 2, column: 2, status: "resolved", target: a };
    const opened = explorer.open("a.js"); pending[0].resolve(source(a, [callA])); await opened;
    const workspace = () => panel.children.find((node) => node.className === "source-explorer-workspace");
    workspace().children[0].children[1].children[0].click();
    const calls = () => workspace().children[1].children.find((node) => node.className === "source-explorer-calls");
    calls().children[1].children[0].click(); pending[2].resolve(source(a, [callA])); await new Promise(setImmediate);
    assert.deepEqual(explorer.state.location, { line: 2, column: 2, hash: hashA });
    assert.equal(workspace().children[1].children.find((node) => node.className === "source-explorer-code").children[1].scrolled, true);
    pending[3].resolve({ ok: true, json: async () => ({ root: a, nodes: [a, b], edges: [{ source: b, target: a, file: "b.js", line: 2, column: 2 }], coverage: { files: ["a.js", "b.js"] } }) }); await new Promise(setImmediate);
    const incoming = () => workspace().children[1].children.find((node) => node.className === "function-graph").children.find((node) => node.children[0]?.textContent === "Incoming");
    const search = workspace().children[0].children[0]; search.value = "a"; search.listeners.input();
    const code = workspace().children[1].children.find((node) => node.className === "source-explorer-code"); code.scrollTop = 33; code.scrollLeft = 44;
    workspace().children[0].children[1].scrollTop = 55;
    incoming().children[1].children[0].click(); pending[4].resolve(source({ ...b, hash: "changed" }, [callB])); await new Promise(setImmediate);
    assert.equal(explorer.currentFile, "a.js"); assert.match(panel.children.find((node) => node.attributes.role === "status").textContent, /changed/);
    assert.equal(explorer.state.query, "a"); assert.equal(explorer.state.location.line, 2); assert.equal(explorer.state.scroll, 33); assert.equal(explorer.state.scrollLeft, 44); assert.equal(explorer.state.listScroll, 55);
    incoming().children[1].children[0].click(); outside.focus(); pending[5].resolve(source(b, [callB])); await new Promise(setImmediate);
    assert.equal(document.activeElement, outside);
    assert.equal(explorer.currentFile, "b.js"); assert.equal(explorer.state.symbol, "b"); assert.equal(explorer.state.location.line, 2);
    panel.children[1].children[0].click(); assert.equal(explorer.currentFile, "a.js");
    const staleLink = explorer.open("a.js", null, { file: "a.js", symbol: "a", location: { line: 2, column: 2, hash: hashA } });
    pending.at(-1).resolve(source(a, [{ ...callA, ownerId: "other" }])); await staleLink;
    assert.equal(explorer.state.location, null); assert.match(panel.children.at(-1).textContent, /linked call site is no longer available/);
    const restored = explorer.open("a.js", null, { file: "a.js", symbol: "a", unresolvedOpen: true, focus: "call:2:2", pageX: 0, pageY: 0 });
    pending.at(-1).resolve(source(a, [{ ...callA, status: "unresolved", target: null }])); await restored;
    const disclosure = calls().children[1];
    assert.equal(disclosure.open, true); assert.equal(document.activeElement, disclosure.children[1].children[0]);
  } finally { globalThis.document = oldDocument; globalThis.window = oldWindow; }
});
