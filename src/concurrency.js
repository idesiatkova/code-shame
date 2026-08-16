async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, values.length || 1));

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

module.exports = {
  mapConcurrent
};
