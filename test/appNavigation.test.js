const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app-navigation.js"), "utf8");
const context = { URL, window: {} };
vm.runInNewContext(source, context);
const navigation = context.window.codeShameNavigation;

test("uses the report as the default page and preserves unrelated URL state", () => {
  assert.equal(navigation.pageFromHref("http://localhost:5179/?demo-coupling=1"), "report");
  assert.equal(
    navigation.pageHref("http://localhost:5179/?demo-coupling=1#results", "architecture"),
    "/?demo-coupling=1&page=architecture#results"
  );
});

test("shows only the selected page and navigates from the dropdown", () => {
  let assignedHref = null;
  const control = fakeElement();
  const toggle = fakeElement();
  const menu = fakeElement();
  const label = fakeElement();
  const reportOption = fakeElement({ page: "report" });
  const architectureOption = fakeElement({ page: "architecture" });
  const reportPage = { hidden: false };
  const architecturePage = { hidden: true };
  const document = fakeElement();
  const location = {
    assign(href) { assignedHref = href; },
    href: "http://localhost:5179/?page=architecture"
  };

  const controller = navigation.createController({
    architecturePage,
    control,
    document,
    label,
    location,
    menu,
    options: [reportOption, architectureOption],
    reportPage,
    toggle
  });
  assert.equal(controller.isArchitecturePage, true);
  assert.equal(reportPage.hidden, true);
  assert.equal(architecturePage.hidden, false);
  assert.equal(label.textContent, "Project structure");
  assert.equal(architectureOption.classes.has("is-selected"), true);

  toggle.emit("click");
  assert.equal(menu.hidden, false);
  reportOption.emit("click");
  assert.equal(assignedHref, "/");
  assert.equal(menu.hidden, true);
});

function fakeElement(dataset = {}) {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map();
  return {
    classes,
    dataset,
    hidden: true,
    textContent: "",
    addEventListener(event, listener) { listeners.set(event, listener); },
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    },
    contains(target) { return target === this; },
    emit(event, payload = {}) { listeners.get(event)({ target: this, ...payload }); },
    focus() {},
    setAttribute(name, value) { attributes.set(name, value); }
  };
}
