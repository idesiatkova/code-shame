function createFileSearch(search, results, files, select, refreshDropdown) {
  const searchList = document.createElement("div");
  searchList.id = "architecture-file-results";
  searchList.className = "architecture-search-options";
  searchList.setAttribute("role", "listbox");
  searchList.hidden = true;
  results.after(searchList);
  let activeResult = -1;
  function setActiveResult(index) {
    activeResult = index;
    [...searchList.children].forEach((item, i) => {
      item.classList.toggle("is-active", i === index);
      item.setAttribute("aria-selected", String(i === index));
    });
    if (index < 0) search.removeAttribute("aria-activedescendant");
    else {
      search.setAttribute("aria-activedescendant", searchList.children[index].id);
      searchList.children[index].scrollIntoView?.({ block: "nearest" });
    }
  }
  function showResults(show) {
    searchList.hidden = !show;
    search.setAttribute("aria-expanded", String(show));
    if (!show) setActiveResult(-1);
  }
  function chooseResult(index) {
    const option = results.options[index];
    if (!option?.value) return;
    results.value = option.value;
    results.dispatchEvent(new Event("change", { bubbles: true }));
    showResults(false);
  }
  function refreshSearch() {
    const matches = files()
      .filter((path) => path.toLowerCase().includes(search.value.trim().toLowerCase()))
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({ path, canonicalId: path }));
    const matchCount = matches.length;
    results.replaceChildren(
      ...(matchCount
        ? matches.map((node) => new Option(node.path, node.canonicalId))
        : [new Option("No matching files", "")]),
    );
    results.value = "";
    searchList.replaceChildren(
      ...[...results.options].map((option, index) => {
        const item = document.createElement("div");
        item.id = `architecture-file-result-${index}`;
        item.className = "architecture-search-option";
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        if (!option.value) item.setAttribute("aria-disabled", "true");
        item.textContent = option.text;
        item.addEventListener("mousedown", (event) => event.preventDefault());
        item.addEventListener("click", () => chooseResult(index));
        return item;
      }),
    );
    setActiveResult(-1);
    refreshDropdown();
  }
  search.addEventListener("focus", () => showResults(true));
  search.addEventListener("input", () => {
    refreshSearch();
    showResults(true);
  });
  function moveSearchResult(key) {
    showResults(true);
    const count = results.options[0]?.value ? results.options.length : 0;
    if (!count) return;
    const step = key === "ArrowDown" ? 1 : -1;
    setActiveResult(
      activeResult < 0
        ? step === 1
          ? 0
          : count - 1
        : Math.max(0, Math.min(count - 1, activeResult + step)),
    );
  }
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!searchList.hidden) {
        event.preventDefault();
        showResults(false);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSearchResult(event.key);
      return;
    }
    if (event.key === "Enter") {
      const index = activeResult >= 0 ? activeResult : results.options.length === 1 ? 0 : -1;
      if (index >= 0 && results.options[index]?.value) {
        event.preventDefault();
        chooseResult(index);
      }
    }
  });
  search.addEventListener("blur", () => showResults(false));
  results.addEventListener("change", () => {
    if (results.value) select(results.value);
  });
  return { refreshSearch, showResults, clearResults: () => searchList.replaceChildren() };
}

export { createFileSearch };
