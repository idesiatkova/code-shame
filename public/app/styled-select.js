let nextId = 0;

export function createStyledSelect(select) {
  const id = `architecture-select-${++nextId}`;
  const menu = document.createElement("div");
  menu.className = "architecture-select";
  const control = document.createElement("button");
  control.type = "button";
  control.className = "architecture-select-control";
  control.setAttribute("role", "combobox");
  control.setAttribute("aria-controls", `${id}-list`);
  control.setAttribute("aria-expanded", "false");
  const text = document.createElement("span");
  control.append(text);
  const list = document.createElement("div");
  list.id = `${id}-list`;
  list.className = "architecture-select-options";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  menu.append(control, list);
  select.hidden = true;
  select.after(menu);

  let options = [], active = -1, search = "", searchTime = 0;
  const enabled = (index) => options[index] && options[index].value !== "" && !options[index].disabled && !options[index].parentElement?.disabled;
  function setActive(index) {
    active = index;
    for (const [i, item] of [...list.children].entries()) {
      item.classList.toggle("is-active", i === index);
      item.setAttribute("aria-selected", String(enabled(i) && (list.hidden ? options[i].value === select.value : i === index)));
    }
    if (index < 0) control.removeAttribute("aria-activedescendant");
    else {
      control.setAttribute("aria-activedescendant", list.children[index].id);
      list.children[index].scrollIntoView?.({ block: "nearest" });
    }
  }
  function close(commit = false) {
    if (list.hidden) return;
    const option = options[active];
    list.hidden = true;
    control.setAttribute("aria-expanded", "false");
    setActive(-1);
    if (commit && option && enabled(options.indexOf(option)) && select.value !== option.value) {
      select.value = option.value;
      refresh();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  function open() {
    if (select.disabled) return;
    list.hidden = false;
    control.setAttribute("aria-expanded", "true");
    setActive(options.findIndex((option, index) => option.value === select.value && enabled(index)));
  }
  function refresh() {
    options = [...select.options];
    const selected = options.find((option) => option.value === select.value);
    text.textContent = selected?.text || options[0]?.text || "";
    control.title = text.textContent;
    const label = select.getAttribute("aria-label");
    if (label) control.setAttribute("aria-label", label);
    else control.removeAttribute("aria-label");
    const labelledby = select.getAttribute("aria-labelledby");
    if (labelledby) control.setAttribute("aria-labelledby", labelledby);
    else control.removeAttribute("aria-labelledby");
    control.disabled = select.disabled;
    list.replaceChildren(...options.map((option, index) => {
      const item = document.createElement("div");
      item.id = `${id}-option-${index}`;
      item.className = "architecture-select-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === select.value && enabled(index)));
      if (!enabled(index)) item.setAttribute("aria-disabled", "true");
      item.textContent = option.text;
      item.title = option.text;
      item.addEventListener("mousedown", (event) => event.preventDefault());
      item.addEventListener("click", () => {
        if (!enabled(index) || select.disabled) return;
        setActive(index);
        close(true);
        control.focus();
      });
      return item;
    }));
    if (select.disabled) close();
    else if (!list.hidden) setActive(options.findIndex((option, index) => option.value === select.value && enabled(index)));
    else setActive(-1);
  }
  control.addEventListener("click", () => { if (list.hidden) open(); else close(); });
  control.addEventListener("keydown", (event) => {
    if (select.disabled) return;
    const key = event.key;
    if (key === "Tab") { close(true); return; }
    if (key === "Escape") { if (!list.hidden) { event.preventDefault(); close(); } return; }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (list.hidden) open(); else close(true);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
      event.preventDefault();
      const wasHidden = list.hidden;
      if (wasHidden) open();
      const available = options.map((_, index) => index).filter(enabled);
      if (!available.length) return;
      if (key === "Home" || (wasHidden && key === "ArrowUp")) setActive(available[0]);
      else if (key === "End") setActive(available.at(-1));
      else if (!wasHidden) {
        const position = available.indexOf(active);
        setActive(available[Math.max(0, Math.min(available.length - 1, position + (key === "ArrowDown" ? 1 : -1)))]);
      }
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (list.hidden) open();
      const now = Date.now();
      search = now - searchTime < 500 ? search + key.toLowerCase() : key.toLowerCase();
      searchTime = now;
      const repeated = [...search].every((char) => char === search[0]);
      const prefix = repeated ? search[0] : search;
      const start = repeated ? active + 1 : 0;
      for (let n = 0; n < options.length; n++) {
        const index = (start + n) % options.length;
        if (enabled(index) && options[index].text.toLowerCase().startsWith(prefix)) { setActive(index); break; }
      }
    }
  });
  control.addEventListener("blur", () => close(true));
  document.addEventListener("click", (event) => { if (!menu.contains(event.target)) close(true); });
  refresh();
  return { refresh, focus: () => control.focus() };
}
