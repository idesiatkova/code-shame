import * as navigation from "./navigation.js";
import * as architecture from "./architecture.js";
import * as icons from "./icons.js";
import { createReportRenderer } from "./report.js";
import { createScanController } from "./scan-controller.js";
import { isDemoMode } from "./demo.js";

const elements = {
  architectureDetails: document.getElementById("architecture-details"),
  architectureFit: document.getElementById("architecture-fit"),
  architectureGraph: document.getElementById("architecture-graph"),
  architectureLegend: document.getElementById("architecture-legend"),
  architectureStats: document.getElementById("architecture-stats"),
  autoRefreshProgress: document.getElementById("auto-refresh-progress"),
  blockingCount: document.getElementById("blocking-count"),
  checkSections: document.getElementById("check-sections"),
  copyBlocking: document.getElementById("copy-blocking"),
  copyCoupling: document.getElementById("copy-coupling"),
  copyMaintainability: document.getElementById("copy-maintainability"),
  copyReport: document.getElementById("copy-report"),
  copyRefactoring: document.getElementById("copy-refactoring"),
  couplingCount: document.getElementById("coupling-count"),
  couplingFiles: document.getElementById("coupling-files"),
  errorBanner: document.getElementById("error-banner"),
  fileScores: document.getElementById("file-scores"),
  healthSummary: document.getElementById("health-summary"),
  maintainabilityCount: document.getElementById("maintainability-count"),
  maintainabilitySubhead: document.getElementById("maintainability-subhead"),
  overviewGrid: document.getElementById("overview-grid"),
  pageControl: document.getElementById("page-control"),
  pageMenu: document.getElementById("page-menu"),
  pageMenuLabel: document.getElementById("page-menu-label"),
  pageMenuOptions: Array.from(document.querySelectorAll(".page-menu-option")),
  pageMenuToggle: document.getElementById("page-menu-toggle"),
  refreshControl: document.getElementById("refresh-control"),
  refreshButton: document.getElementById("refresh-button"),
  refreshMenu: document.getElementById("refresh-menu"),
  refreshMenuOptions: Array.from(document.querySelectorAll(".refresh-menu-option")),
  refreshMenuToggle: document.getElementById("refresh-menu-toggle"),
  reportPage: document.getElementById("report-page"),
  targetCount: document.getElementById("target-count"),
  targetsList: document.getElementById("targets-list"),
  titleLogo: document.getElementById("title-logo"),
  architecturePage: document.getElementById("architecture-page")
};

const pageNavigation = navigation.createController({
  architecturePage: elements.architecturePage,
  control: elements.pageControl,
  document,
  label: elements.pageMenuLabel,
  location: window.location,
  menu: elements.pageMenu,
  options: elements.pageMenuOptions,
  reportPage: elements.reportPage,
  toggle: elements.pageMenuToggle
});
const architectureRenderer = architecture.createRenderer({
  container: elements.architectureGraph,
  details: elements.architectureDetails,
  fitButton: elements.architectureFit,
  legend: elements.architectureLegend,
  stats: elements.architectureStats
});

const isDemo = isDemoMode();
const report = createReportRenderer({ elements, architectureRenderer, isArchitecturePage: pageNavigation.isArchitecturePage, isDemo });
const scans = createScanController({ elements, renderPayload: report.renderPayload, showError: report.renderError });
const label = isDemo ? "Exit demo mode" : "Enter demo mode";
elements.titleLogo.classList.toggle("is-demo", isDemo);
elements.titleLogo.setAttribute("aria-label", label);
elements.titleLogo.title = label;
let lastTitleLogoTapAt = 0;
elements.titleLogo.addEventListener("pointerup", () => {
  const now = Date.now();
  if (now - lastTitleLogoTapAt <= 350) {
    lastTitleLogoTapAt = 0;
    const url = new URL(window.location.href);
    if (isDemo) url.searchParams.delete("demo-coupling");
    else url.searchParams.set("demo-coupling", "1");
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  } else {
    lastTitleLogoTapAt = now;
  }
});
icons.refresh();
scans.start();
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) scans.dispose();
});
