function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

export { formatNumber };
