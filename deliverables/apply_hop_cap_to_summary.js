#!/usr/bin/env node
/**
 * Re-filter deliverables/vendor_brief/data-summary.json to max N hops and
 * rebuild markdown/html without a live DB (uses existing snapshot loops).
 */
const fs = require("fs");
const path = require("path");
const { summarize, buildMarkdown, buildHtml } = require("./build_vendor_brief.js");

const MAX_HOPS = 5;
const OUT_DIR = path.join(__dirname, "vendor_brief");
const DATA_PATH = path.join(OUT_DIR, "data-summary.json");

function shortInsight(loop) {
  const orgs = (loop.participants || []).map((p) => p.org_name).slice(0, 3).join(", ");
  return `We identified a funding loop cluster for screening (not a finding of wrongdoing). Cluster #${loop.loop_id} links ${orgs} in a ${loop.hops}-hop cycle. Review primary sources before any public or policy conclusions.`;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const loops = (raw.loops || []).filter((l) => Number(l.hops) <= MAX_HOPS);

  const methodology = {
    ...(raw.methodology || {}),
    base_signal: `CRA charity-to-charity loops (2-hop through ${MAX_HOPS}-hop)`,
    loop_source: "cra.loops",
  };

  let insight;
  if (!loops.length) {
    insight =
      "No loops in this snapshot are within the " +
      MAX_HOPS +
      "-hop cap (this bundle previously used longer experimental cycles). Regenerate from the database: " +
      "`cd general && npm run analyze:funding-loops && cd .. && node deliverables/build_vendor_brief.js`.";
  } else {
    insight = shortInsight(loops[0]);
  }

  const report = {
    generated_at: raw.generatedAt || new Date().toISOString(),
    topic: raw.topic || "Funding Loops",
    insight,
    methodology,
    loops,
  };

  const summary = summarize(report);
  fs.writeFileSync(DATA_PATH, JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "funding-loops-vendor-report.md"), buildMarkdown(summary));
  fs.writeFileSync(path.join(OUT_DIR, "funding-loops-vendor-report.html"), buildHtml(summary));
  console.log(`Rebuilt vendor brief with hop cap ${MAX_HOPS}: ${loops.length} loop(s).`);
}

main();
