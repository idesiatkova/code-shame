class AnalysisPipeline {
  constructor({ runPrimary, normalizePrimary, enrichers = [] }) {
    if (typeof runPrimary !== "function") throw new Error("AnalysisPipeline requires runPrimary.");
    if (typeof normalizePrimary !== "function") throw new Error("AnalysisPipeline requires normalizePrimary.");

    this.runPrimary = runPrimary;
    this.normalizePrimary = normalizePrimary;
    this.enrichers = enrichers;
  }

  async run(meta = {}) {
    const primary = await this.runPrimary();
    const report = this.normalizePrimary(primary.data, {
      ...meta,
      exitCode: primary.exitCode
    });
    const context = { meta, primary, rawReport: primary.data, report };

    for (const enricher of this.enrichers) {
      report[enricher.key] = await runEnricher(enricher, context);
    }

    return report;
  }
}

async function runEnricher(enricher, context) {
  try {
    return await enricher.analyze(context);
  } catch (error) {
    if (typeof enricher.fallback === "function") return enricher.fallback(error, context);
    return {
      state: "failed",
      error: error.message || String(error)
    };
  }
}

module.exports = {
  AnalysisPipeline
};
