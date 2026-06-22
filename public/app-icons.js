{
  function metricIconHtml(id) {
	    const icons = {
	      "blocking-findings": "circle-x",
	      maintainability: "bar-chart-3",
	      "refactoring-suggestions": "scissors",
	      "unusually-reused-files": "git-branch"
	    };
    const icon = icons[id];
    return icon
      ? `<i class="metric-icon" data-lucide="${icon}" aria-hidden="true"></i>`
      : "";
  }

  function refresh(root = document) {
    if (!window.lucide) return;
    window.lucide.createIcons({
      attrs: { "stroke-width": 2 },
      icons: window.lucide.icons,
      root
    });
  }

  function setButtonLabel(button, label) {
    button.querySelector(".button-label").textContent = label;
  }

  window.codeScanIcons = {
    metricIconHtml,
    refresh,
    setButtonLabel
  };
}
