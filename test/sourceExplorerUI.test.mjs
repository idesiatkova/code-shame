import assert from "node:assert/strict";
import test from "node:test";
import { createSourceExplorer } from "../public/app/source-explorer.js";

test("source explorer preserves keyboard context and ignores stale responses", async () => {
  const old = globalThis.document;
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.attributes = {}; this.value = ""; this.classList = { add() {}, remove() {} }; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { for (const child of this.children) child.parent = null; this.children = []; this.append(...nodes); }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
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
    const response = (name) => ({ ok: true, json: async () => ({ file: name, source: "<script>\r\none\rtwo\nthree\u2028four\u2029five", symbols: [{ id: "f", name: "f", kind: "function", startLine: 1, endLine: 6, signature: "f()" }], calls: [{ name: "call", line: 2, ownerId: "f" }], diagnostics: [] }) });
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
    assert.match(detail.children.find((node) => node.className === "source-explorer-calls").children[1].textContent, /unresolved syntax/);
    panel.children[1].children[0].click();
    [search, list] = workspace().children[0].children;
    assert.equal(search.value, "f"); assert.equal(document.activeElement, list.children[0]);
    panel.children[0].children[1].click(); assert.equal(document.activeElement, trigger); assert.equal(panel.hidden, true);
    const third = explorer.open("third.js", trigger); outside.focus(); explorer.close();
    pending[2].resolve(response("third.js")); await third;
    assert.equal(document.activeElement, outside); assert.equal(panel.hidden, true); assert.equal(panel.children.length, 0);
  } finally { globalThis.document = old; }
});
