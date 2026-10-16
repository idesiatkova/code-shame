const REPORT_PAGE = "report";
const ARCHITECTURE_PAGE = "architecture";
const PAGE_QUERY = "page";
const PAGE_LABELS = Object.freeze({
  [ARCHITECTURE_PAGE]: "Project structure",
  [REPORT_PAGE]: "Fallow report"
});

function pageFromHref(href) {
  const url = new URL(href, "http://localhost");
  return url.searchParams.get(PAGE_QUERY) === ARCHITECTURE_PAGE
    ? ARCHITECTURE_PAGE
    : REPORT_PAGE;
}

function pageHref(href, page) {
  const url = new URL(href, "http://localhost");
  if (page === ARCHITECTURE_PAGE) {
    url.searchParams.set(PAGE_QUERY, ARCHITECTURE_PAGE);
  } else {
    url.searchParams.delete(PAGE_QUERY);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function createController({
  architecturePage,
  control,
  document,
  label,
  location,
  menu,
  options,
  reportPage,
  toggle
}) {
  const page = pageFromHref(location.href);
  reportPage.hidden = page !== REPORT_PAGE;
  architecturePage.hidden = page !== ARCHITECTURE_PAGE;
  label.textContent = PAGE_LABELS[page];

  options.forEach((option) => {
    const isSelected = option.dataset.page === page;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));

    option.addEventListener("click", () => {
      setOpen(false);
      if (option.dataset.page !== page) {
        location.assign(pageHref(location.href, option.dataset.page));
      }
    });
  });

  toggle.addEventListener("click", () => setOpen(menu.hidden));

  document.addEventListener("pointerdown", (event) => {
    if (!control.contains(event.target)) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || menu.hidden) return;
    setOpen(false);
    toggle.focus();
  });

  function setOpen(isOpen) {
    menu.hidden = !isOpen;
    control.classList.toggle("is-menu-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
  }

  return Object.freeze({
    isArchitecturePage: page === ARCHITECTURE_PAGE,
    page
  });
}

export { createController, pageFromHref, pageHref };
