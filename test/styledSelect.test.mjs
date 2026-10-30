import assert from "node:assert/strict";
import test from "node:test";
import { createStyledSelect } from "../public/app/styled-select.js";

class Element {
  constructor() { this.children = []; this.attributes = {}; this.listeners = {}; this.classList = { toggle() {} }; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  after(element) { this.afterElement = element; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  dispatchEvent(event) { this.listeners[event.type]?.(event); }
  focus() { document.activeElement = this; }
  contains(element) { return this === element || this.children.some((child) => child.contains(element)); }
  fire(type, key) { const event = { key, preventDefault() { this.prevented = true; } }; this.listeners[type]?.(event); return event; }
}

test("select-only combobox preserves selection, handles keyboard and disables status options", () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new Element(), addEventListener() {} };
  try {
    const select = new Element();
    select.options = [{ text: "No matching files", value: "" }, { text: "src/one.js", value: "one" }, { text: "src/disabled.js", value: "disabled", disabled: true }, { text: "src/two.js", value: "two" }];
    select.value = "one";
    select.setAttribute("aria-label", "Matching files");
    let changes = 0;
    select.addEventListener("change", () => changes++);
    const dropdown = createStyledSelect(select);
    const [control, list] = select.afterElement.children;
    control.focus();
    assert.equal(control.getAttribute("role"), "combobox");
    assert.equal(control.getAttribute("aria-label"), "Matching files");
    assert.equal(list.children[0].getAttribute("aria-disabled"), "true");
    control.fire("keydown", "ArrowDown");
    control.fire("keydown", "ArrowDown");
    assert.equal(document.activeElement, control);
    assert.equal(control.getAttribute("aria-activedescendant"), list.children[3].id);
    assert.equal(select.value, "one");
    assert.equal(list.children[1].getAttribute("aria-selected"), "false");
    assert.equal(list.children[3].getAttribute("aria-selected"), "true");
    control.fire("keydown", "Escape");
    assert.equal(select.value, "one");
    assert.equal(list.children[1].getAttribute("aria-selected"), "true");
    assert.equal(list.children[3].getAttribute("aria-selected"), "false");
    control.fire("keydown", "End");
    control.fire("keydown", "Enter");
    assert.equal(select.value, "two");
    assert.equal(changes, 1);
    assert.equal(list.children[3].getAttribute("aria-selected"), "true");
    control.fire("click");
    list.children[0].fire("click");
    assert.equal(select.value, "two");
    assert.equal(changes, 1);
    select.options = [select.options[0], select.options[3]];
    dropdown.refresh();
    assert.equal(control.children[0].textContent, "src/two.js");
    control.fire("keydown", "Home");
    control.fire("keydown", "Tab");
    assert.equal(select.value, "two");
    select.disabled = true;
    dropdown.refresh();
    assert.equal(control.disabled, true);
    assert.equal(list.hidden, true);
  } finally { globalThis.document = previous; }
});
