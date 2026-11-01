function renderWorkspaceOverview({ overviewPanel, selected, directory, allFiles, structure, analysis, fileButton, openProjectMap }) {
  overviewPanel.replaceChildren();
  if (selected) return renderFileRelations(overviewPanel, selected, analysis, fileButton);
  if (directory !== ".") return renderDirectory(overviewPanel, directory, allFiles, fileButton);
  const intro = document.createElement("p");
  intro.textContent = "Explore the project map, choose an entry point, or expand folders in Explorer.";
  const mapButton = document.createElement("button");
  mapButton.type = "button"; mapButton.className = "secondary-button"; mapButton.textContent = "Open project map";
  mapButton.addEventListener("click", openProjectMap);
  overviewPanel.append(intro, mapButton);
  renderEntryPoints(overviewPanel, structure.entryPoints, fileButton);
}

function renderFileRelations(panel, selected, analysis, fileButton) {
  const data = analysis?.data;
  const note = document.createElement("p");
  note.textContent = data?.files.has(selected)
    ? `Direct relationships${data.graph.complete ? "" : " · partial dependency graph"}`
    : "This listed file is not present in the dependency graph.";
  panel.append(note);
  if (!data?.files.has(selected)) return;
  for (const [title, paths] of [["Imported by", analysis.incoming.get(selected)], ["Imports", analysis.outgoing.get(selected)]]) {
    const group = document.createElement("div");
    group.className = "architecture-file-relations";
    const heading = document.createElement("h3");
    heading.textContent = `${title} (${paths.length})`;
    group.append(heading);
    if (!paths.length) {
      const empty = document.createElement("p");
      empty.textContent = "None reported.";
      group.append(empty);
    }
    const more = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `Show ${Math.max(0, paths.length - 20)} more`;
    more.append(summary);
    paths.forEach((path, index) => (index < 20 ? group : more).append(fileButton(path)));
    if (paths.length > 20) group.append(more);
    panel.append(group);
  }
}

function renderDirectory(panel, directory, allFiles, fileButton) {
  const files = allFiles.filter((path) => path.startsWith(`${directory}/`));
  const note = document.createElement("p");
  note.textContent = `${new Intl.NumberFormat().format(files.length)} listed files in ${directory}/`;
  panel.append(note);
  const list = document.createElement("div");
  list.className = "architecture-directory-files";
  for (const path of files) list.append(fileButton(path));
  panel.append(list);
}

function renderEntryPoints(panel, entryPoints, fileButton) {
  const entries = document.createElement("div");
  entries.className = "architecture-entries";
  const title = document.createElement("h3");
  title.textContent = "Start exploring · Entry points";
  entries.append(title);
  if (!entryPoints.length) {
    const empty = document.createElement("p");
    empty.textContent = "No entry points reported.";
    entries.append(empty);
  }
  const list = document.createElement("div");
  list.className = "architecture-entry-list";
  entries.append(list);
  const testEntries = entryPoints.filter((entry) => /(^|\/)(?:test|tests|__tests__)(\/|$)|\.(?:test|spec)\.[^/]+$/i.test(entry.path));
  const tests = document.createElement("details");
  if (testEntries.length) {
    const summary = document.createElement("summary");
    summary.textContent = `Test entry points (${testEntries.length})`;
    const note = document.createElement("p");
    note.textContent = "Grouped by test directory or filename.";
    tests.append(summary, note);
  }
  for (const entry of entryPoints) {
    const row = document.createElement("div");
    row.className = "architecture-entry";
    const evidence = document.createElement("small");
    evidence.textContent = entry.evidence;
    row.append(fileButton(entry.path), evidence);
    (testEntries.includes(entry) ? tests : list).append(row);
  }
  if (testEntries.length) list.append(tests);
  panel.append(entries);
}

export { renderWorkspaceOverview };
