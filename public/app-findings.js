function renderSection(section, escapeHtml) {
  const node = document.createElement("details");
  node.className = "finding-group-static";
  node.open = true;
  node.innerHTML = `
    <summary>
      <i class="finding-chevron chevron-open" data-lucide="chevron-down" aria-hidden="true"></i>
      <i class="finding-chevron chevron-closed" data-lucide="chevron-right" aria-hidden="true"></i>
      <i class="finding-type-icon" data-lucide="${typeIcon(section.id)}" aria-hidden="true"></i>
      <h3>${escapeHtml(section.label)}</h3>
    </summary>
    <ul>${recordsHtml(section.records, escapeHtml)}</ul>
  `;
  return node;
}

function recordsHtml(records, escapeHtml) {
  const html = records.map((record) => `
    <li class="finding-record">
      <div>
        <span class="item-title">${escapeHtml(record.title)}</span>
        <span class="item-detail">${escapeHtml(record.detail)}</span>
      </div>
    </li>
  `).join("");
  return html || "<li><span>No samples included.</span></li>";
}

function typeIcon(sectionId) {
  const icons = {
    boundary_violations: "shield-alert",
    circular_dependencies: "refresh-ccw",
    complexity_findings: "gauge",
    duplicate_exports: "copy-x",
    duplicated_code: "files",
    re_export_cycles: "repeat-2",
    stale_suppressions: "message-square-warning",
    unlisted_dependencies: "package-plus",
    unresolved_imports: "import",
    unused_class_members: "square-minus",
    unused_dependencies: "package-minus",
    unused_enum_members: "list-minus",
    unused_exports: "package-x",
    unused_files: "file-x-2",
    unused_types: "braces"
  };
  return icons[sectionId] || "circle-x";
}

export { renderSection };
