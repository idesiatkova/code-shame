import assert from "node:assert/strict";
import test from "node:test";
import { createProjectExplorer } from "../public/app/project-explorer.js";

class Element {
  constructor() {
    this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {};
    this.style = { setProperty() {} }; this.classList = { add: (name) => { this.className = name; } };
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  matches(selector) {
    if (selector.startsWith(".")) return this.className === selector.slice(1);
    if (selector === '[tabindex="0"]') return this.tabIndex === 0;
    return selector === '[role="treeitem"]' && this.attributes.role === "treeitem";
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  contains(child) { return this === child || this.children.some((item) => item.contains(child)); }
  querySelectorAll(selector) { return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  focus(options) {
    document.events?.push({ type: "focus", path: this.dataset.path, options });
    document.activeElement = this;
    for (let node = this; node; node = node.parentElement) node.listeners.focusin?.({ target: this });
  }
  scrollIntoView(options) { document.events?.push({ type: "scroll", path: this.dataset.path, options }); }
}

test("tree navigates, selects, reveals and collapses without losing selection", () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() };
  try {
    const host = new Element(), selections = [];
    const explorer = createProjectExplorer({ container: host, onSelect: (value) => selections.push(value) });
    const tree = host.children[0], options = { files: ["z.js", "src/nested/b.js", "src/a.js"], projectName: "Example" };
    const items = () => tree.querySelectorAll('[role="treeitem"]');
    const byPath = (path) => items().find((item) => item.dataset.path === path);
    const key = (name) => tree.listeners.keydown({ target: document.activeElement, key: name, preventDefault() {} });
    const click = (target) => tree.listeners.click({ target });
    explorer.update(options);
    assert.deepEqual(items().map((item) => item.dataset.path), [".", "src", "z.js"]);
    assert.equal(items().filter((item) => item.tabIndex === 0).length, 1);
    assert.equal(byPath(".").getAttribute("aria-level"), "1");
    byPath(".").focus();
    key("ArrowDown");
    assert.equal(document.activeElement.dataset.path, "src");
    key("ArrowRight");
    assert.equal(byPath("src").getAttribute("aria-expanded"), "true");
    key("ArrowRight");
    assert.equal(document.activeElement.dataset.path, "src/nested");
    key("ArrowRight");
    key("ArrowDown");
    assert.equal(document.activeElement.dataset.path, "src/nested/b.js");
    assert.equal(document.activeElement.getAttribute("aria-level"), "4");
    assert.equal(document.activeElement.getAttribute("aria-expanded"), null);
    key("Enter");
    assert.deepEqual(selections, [{ path: "src/nested/b.js", kind: "file" }]);
    explorer.update({ ...options, selectedPath: "src/nested/b.js", selectedKind: "file" });
    assert.equal(document.activeElement.dataset.path, "src/nested/b.js");
    explorer.toggleAll();
    assert.equal(document.activeElement.dataset.path, "src");
    assert.equal(selections.length, 1);
    explorer.reveal("src/nested/b.js");
    assert.equal(document.activeElement.dataset.path, "src/nested/b.js");
    assert.equal(document.activeElement.getAttribute("aria-selected"), "true");
    key("ArrowLeft");
    assert.equal(document.activeElement.dataset.path, "src/nested");
    key("Home");
    assert.equal(document.activeElement.dataset.path, ".");
    key("End");
    assert.equal(document.activeElement.dataset.path, "z.js");
    click(byPath("src").children[0].children[0]);
    assert.equal(selections.length, 1);
    click(byPath("src").children[0].children[2]);
    assert.deepEqual(selections.at(-1), { path: "src", kind: "directory" });
    explorer.clear();
    assert.equal(items().length, 0);
  } finally { globalThis.document = previous; }
});

test("reveal controls focus and scrolling independently", () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element(), events: [] };
  try {
    const host = new Element();
    const explorer = createProjectExplorer({ container: host, onSelect() {} });
    explorer.update({ files: ["src/nested/file.js", "other/a.js"] });
    explorer.reveal("src/nested", { focus: true, scroll: false });
    assert.deepEqual(document.events, [{ type: "focus", path: "src/nested", options: { preventScroll: true } }]);
    document.events.length = 0;
    explorer.reveal("other/a.js", { focus: false, scroll: true });
    assert.deepEqual(document.events, [
      { type: "focus", path: "src/nested", options: { preventScroll: true } },
      { type: "scroll", path: "other/a.js", options: { block: "nearest" } }
    ]);
    assert.equal(document.activeElement.dataset.path, "src/nested");
    document.events.length = 0;
    const outside = new Element();
    outside.focus();
    document.events.length = 0;
    explorer.reveal("src/nested/file.js", { focus: false, scroll: false });
    assert.deepEqual(document.events, []);
    assert.equal(document.activeElement, outside);
  } finally { globalThis.document = previous; }
});

test("folder labels, chevrons and global toggle keep selection and expansion separate", () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() };
  try {
    const host = new Element(), selections = [], expansionStates = [];
    const explorer = createProjectExplorer({ container: host, onSelect: (value) => selections.push(value), onExpansionChange: (...value) => expansionStates.push(value) });
    const tree = host.children[0];
    const byPath = (path) => tree.querySelectorAll('[role="treeitem"]').find((item) => item.dataset.path === path);
    const click = (path, index) => tree.listeners.click({ target: byPath(path).children[0].children[index] });
    explorer.update({ files: ["src/nested/file.js", "other/a.js"] });
    assert.deepEqual(expansionStates.at(-1), [false, true]);
    click("src", 2);
    assert.equal(byPath("src").getAttribute("aria-selected"), "true");
    assert.equal(byPath("src").getAttribute("aria-expanded"), "false");
    click("src", 2);
    assert.equal(byPath("src").getAttribute("aria-expanded"), "true");
    assert.deepEqual(expansionStates.at(-1), [true, true]);
    click("other", 0);
    assert.equal(byPath("other").getAttribute("aria-expanded"), "true");
    assert.equal(byPath("src").getAttribute("aria-selected"), "true");
    assert.equal(selections.length, 2);
    byPath("src").focus();
    explorer.toggleAll();
    assert.deepEqual(expansionStates.at(-1), [false, true]);
    assert.equal(document.activeElement.dataset.path, "src");
    assert.equal(byPath("src").getAttribute("aria-selected"), "true");
    assert.equal(byPath("src").getAttribute("aria-expanded"), "false");
    explorer.toggleAll();
    assert.deepEqual(expansionStates.at(-1), [true, true]);
    assert.equal(document.activeElement.dataset.path, "src");
    assert.equal(byPath("src/nested").getAttribute("aria-expanded"), "true");
    assert.equal(byPath("other").getAttribute("aria-expanded"), "true");
    assert.equal(selections.length, 2);
    explorer.toggleAll();
    explorer.update({ files: ["src/nested/file.js", "other/a.js"], selectedPath: "src/nested", selectedKind: "directory" });
    explorer.reveal("src/nested", { expand: true });
    assert.equal(document.activeElement.dataset.path, "src/nested");
    assert.equal(byPath("src/nested").getAttribute("aria-selected"), "true");
    assert.equal(byPath("src/nested").getAttribute("aria-expanded"), "true");
    assert.ok(byPath("src/nested/file.js"));
    assert.equal(selections.length, 2);
    explorer.toggleAll();
    const outside = new Element();
    outside.focus();
    explorer.update({ files: ["src/nested/file.js", "other/a.js"], selectedPath: "src/nested", selectedKind: "directory" });
    explorer.reveal("src/nested", { expand: true, focus: false });
    assert.equal(document.activeElement, outside);
    assert.equal(byPath("src/nested").getAttribute("aria-selected"), "true");
    assert.equal(byPath("src/nested").getAttribute("aria-expanded"), "true");
    assert.deepEqual(expansionStates.at(-1), [true, true]);
    assert.equal(selections.length, 2);
    explorer.update({ files: ["root.js"] });
    assert.deepEqual(expansionStates.at(-1), [false, false]);
  } finally { globalThis.document = previous; }
});
