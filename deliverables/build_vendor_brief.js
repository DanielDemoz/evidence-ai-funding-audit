const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REPORT_JSON = path.join(ROOT, "general", "data", "reports", "funding-loops-report.json");
const OUT_DIR = path.join(__dirname, "vendor_brief");

function money(value) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return `${Number(value).toFixed(1)}%`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadReport() {
  return JSON.parse(fs.readFileSync(REPORT_JSON, "utf8"));
}

function summarize(report) {
  const loops = report.loops || [];
  const totalOrganizations = new Set();
  const signalCounts = {
    connectedEntities: 0,
    inactiveAfterFunding: 0,
    highlyGovernmentFunded: 0,
    repeatedFunding: 0,
    contractConcentration: 0,
  };

  for (const loop of loops) {
    for (const participant of loop.participants || []) {
      totalOrganizations.add(participant.bn_root || participant.entity_id || participant.bn);
    }
    if (loop.signals?.connected_entities) signalCounts.connectedEntities += 1;
    if (loop.signals?.inactive_after_funding) signalCounts.inactiveAfterFunding += 1;
    if (loop.signals?.highly_government_funded) signalCounts.highlyGovernmentFunded += 1;
    if (loop.signals?.repeated_or_duplicate_funding) signalCounts.repeatedFunding += 1;
    if (loop.signals?.contract_concentration) signalCounts.contractConcentration += 1;
  }

  const highRisk = loops.filter((loop) => loop.risk_score >= 4);
  const sameYear = loops.filter((loop) => loop.same_year);
  const twoHop = loops.filter((loop) => loop.hops === 2);
  const threeHop = loops.filter((loop) => loop.hops === 3);
  const top5 = loops.slice(0, 5);
  const top10 = loops.slice(0, 10);
  const exposure = loops.reduce((sum, loop) => sum + Number(loop.cluster_total_funding || 0), 0);

  return {
    generatedAt: report.generated_at,
    topic: report.topic,
    insight: report.insight,
    methodology: report.methodology,
    counts: {
      flaggedLoops: loops.length,
      highRiskLoops: highRisk.length,
      totalOrganizations: totalOrganizations.size,
      sameYearLoops: sameYear.length,
      twoHopLoops: twoHop.length,
      threeHopLoops: threeHop.length,
      governmentFundingExposure: exposure,
    },
    signalCounts,
    top5,
    top10,
    loops,
  };
}

function barChartSvg(topLoops) {
  const width = 1120;
  const height = 520;
  const margin = { top: 40, right: 30, bottom: 120, left: 180 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...topLoops.map((loop) => Number(loop.cluster_total_funding || 0)));
  const barGap = 14;
  const barHeight = Math.floor((plotHeight - barGap * (topLoops.length - 1)) / topLoops.length);

  const rows = topLoops.map((loop, index) => {
    const y = margin.top + index * (barHeight + barGap);
    const value = Number(loop.cluster_total_funding || 0);
    const barWidth = Math.max(6, Math.round((value / maxValue) * plotWidth));
    const fill = loop.risk_score >= 4 ? "#b91c1c" : "#0f766e";
    const label = `${loop.loop_id}  ${loop.participants.map((p) => p.org_name).join(" -> ")}`;
    return `
      <text x="${margin.left - 16}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="13" fill="#1f2937">${escapeHtml(label.slice(0, 72))}</text>
      <rect x="${margin.left}" y="${y}" width="${barWidth}" height="${barHeight}" rx="8" fill="${fill}"></rect>
      <text x="${margin.left + barWidth + 10}" y="${y + barHeight / 2 + 4}" font-size="13" fill="#0f172a">${escapeHtml(money(value))}</text>
    `;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Top funding loop clusters by total funding">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      <text x="${margin.left}" y="24" font-size="20" font-weight="700" fill="#0f172a">Top flagged clusters by surrounding public-funding exposure</text>
      <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="#cbd5e1"></line>
      ${rows}
    </svg>
  `;
}

function signalChartSvg(signalCounts, loopCount) {
  const items = [
    ["Connected entities", signalCounts.connectedEntities, "#0f766e"],
    ["Inactive after funding", signalCounts.inactiveAfterFunding, "#b45309"],
    ["High govt dependency", signalCounts.highlyGovernmentFunded, "#7c3aed"],
    ["Repeated funding", signalCounts.repeatedFunding, "#1d4ed8"],
    ["Contract concentration", signalCounts.contractConcentration, "#b91c1c"],
  ];
  const width = 1000;
  const height = 320;
  const margin = { top: 50, right: 40, bottom: 70, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...items.map((item) => item[1]), 1);
  const barWidth = Math.floor(plotWidth / items.length) - 28;

  const bars = items.map((item, index) => {
    const [label, value, color] = item;
    const x = margin.left + index * ((plotWidth / items.length));
    const h = Math.max(10, Math.round((value / maxValue) * plotHeight));
    const y = margin.top + plotHeight - h;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="10" fill="${color}"></rect>
      <text x="${x + barWidth / 2}" y="${y - 10}" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">${value}</text>
      <text x="${x + barWidth / 2}" y="${height - 22}" text-anchor="middle" font-size="12" fill="#475569">${escapeHtml(label)}</text>
    `;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Frequency of risk signals across flagged loops">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      <text x="${margin.left}" y="24" font-size="20" font-weight="700" fill="#0f172a">How often each risk signal appears across ${loopCount} flagged loops</text>
      <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="#cbd5e1"></line>
      ${bars}
    </svg>
  `;
}

function topLoopNetworkSvg(loop) {
  const width = 760;
  const height = 320;
  const centerX = width / 2;
  const centerY = 170;
  const radius = 88;
  const participants = loop.participants || [];
  const nodes = participants.map((participant, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index / participants.length);
    return {
      ...participant,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
  const byBn = new Map(nodes.map((node) => [node.bn, node]));

  const lines = (loop.edges || []).map((edge) => {
    const src = byBn.get(edge.src);
    const dst = byBn.get(edge.dst);
    if (!src || !dst) return "";
    return `
      <line x1="${src.x}" y1="${src.y}" x2="${dst.x}" y2="${dst.y}" stroke="#64748b" stroke-width="3" marker-end="url(#arrow)"></line>
      <text x="${(src.x + dst.x) / 2}" y="${(src.y + dst.y) / 2 - 6}" text-anchor="middle" font-size="12" fill="#475569">${escapeHtml(money(edge.year_flow))}</text>
    `;
  }).join("");

  const circles = nodes.map((node) => {
    const fill = Number(node.govt_dependency_pct || 0) >= 50 ? "#fdba74" : "#93c5fd";
    return `
      <circle cx="${node.x}" cy="${node.y}" r="28" fill="${fill}" stroke="#0f172a" stroke-width="1.5"></circle>
      <text x="${node.x}" y="${node.y - 42}" text-anchor="middle" font-size="13" fill="#0f172a">${escapeHtml(node.org_name.slice(0, 34))}</text>
      <text x="${node.x}" y="${node.y + 5}" text-anchor="middle" font-size="11" fill="#0f172a">${escapeHtml(node.bn_root)}</text>
      <text x="${node.x}" y="${node.y + 20}" text-anchor="middle" font-size="10" fill="#475569">${escapeHtml(pct(node.govt_dependency_pct))}</text>
    `;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Top funding loop network">
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L10,3 L0,6 z" fill="#64748b"></path>
        </marker>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      <text x="38" y="28" font-size="20" font-weight="700" fill="#0f172a">Representative high-risk loop: Cluster #${loop.loop_id}</text>
      ${lines}
      ${circles}
    </svg>
  `;
}

function buildMarkdown(summary) {
  const lines = [];
  lines.push("# Funding Loops Risk Scanner");
  lines.push("");
  lines.push("## Vendor Brief");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(summary.insight);
  lines.push("");
  lines.push(`- Flagged loops: ${summary.counts.flaggedLoops}`);
  lines.push(`- High-risk loops: ${summary.counts.highRiskLoops}`);
  lines.push(`- Organizations involved: ${summary.counts.totalOrganizations}`);
  lines.push(`- Public-funding exposure across flagged loops: ${money(summary.counts.governmentFundingExposure)}`);
  lines.push("");
  lines.push("## Top Five Clusters");
  lines.push("");
  lines.push("| Rank | Cluster | Organizations | Total Funding | Score |");
  lines.push("| --- | --- | --- | --- | --- |");
  summary.top5.forEach((loop, index) => {
    lines.push(`| ${index + 1} | #${loop.loop_id} | ${loop.participants.map((p) => p.org_name).join(" -> ")} | ${money(loop.cluster_total_funding)} | ${loop.risk_score}/6 |`);
  });
  lines.push("");
  lines.push("## Vendor Positioning");
  lines.push("");
  lines.push("This project demonstrates a ministry-ready workflow: ingest messy funding data, normalize entities, detect circular funding loops, score supporting risk signals, and explain why a cluster was flagged. The recommended product position is a Public Funding Risk Scanner delivered as an analyst-facing workflow on top of PostgreSQL or BigQuery with an optional Cloud Run deployment path.");
  return lines.join("\n");
}

function buildHtml(summary) {
  const barSvg = barChartSvg(summary.top10);
  const signalSvg = signalChartSvg(summary.signalCounts, summary.counts.flaggedLoops);
  const networkSvg = topLoopNetworkSvg(summary.top5[0]);

  const topRows = summary.top10.map((loop, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>#${loop.loop_id}</td>
      <td>${escapeHtml(loop.participants.map((p) => p.org_name).join(" -> "))}</td>
      <td>${money(loop.total_edge_flow)}</td>
      <td>${money(loop.cluster_total_funding)}</td>
      <td>${loop.risk_score}/6</td>
      <td>${escapeHtml(loop.main_reason)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Funding Loops Risk Scanner - Vendor Brief</title>
  <style>
    :root {
      --bg: #eef4fb;
      --ink: #0f172a;
      --muted: #475569;
      --line: #d9e3ef;
      --surface: #ffffff;
      --accent: #0f766e;
      --accent-soft: #ccfbf1;
      --warn: #92400e;
      --danger: #b91c1c;
      --navy: #082f49;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 28%),
        radial-gradient(circle at top right, rgba(16, 185, 129, 0.15), transparent 24%),
        var(--bg);
    }
    main { max-width: 1240px; margin: 0 auto; padding: 28px 24px 60px; }
    section { margin-bottom: 18px; }
    .hero {
      background: linear-gradient(135deg, #082f49, #0f766e);
      color: white;
      border-radius: 10px;
      padding: 34px 34px 30px;
      box-shadow: 0 20px 48px rgba(8, 47, 73, 0.18);
    }
    .eyebrow {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.76);
      margin-bottom: 14px;
    }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: 44px; line-height: 1.02; margin-bottom: 12px; max-width: 14ch; }
    h2 { font-size: 26px; margin-bottom: 12px; }
    h3 { font-size: 18px; margin-bottom: 8px; }
    .hero p { max-width: 74ch; color: rgba(255,255,255,0.9); }
    .band {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 22px;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 16px;
      background: linear-gradient(180deg, #ffffff, #f8fafc);
    }
    .stat strong {
      display: block;
      font-size: 30px;
      line-height: 1.05;
      margin-bottom: 4px;
    }
    .two-up {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 18px;
    }
    .callout {
      background: var(--accent-soft);
      border-left: 4px solid var(--accent);
      padding: 16px 18px;
      border-radius: 10px;
      color: #134e4a;
    }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .pill {
      border: 1px solid var(--line);
      padding: 8px 10px;
      border-radius: 999px;
      font-size: 13px;
      color: var(--muted);
      background: #fff;
    }
    .pill strong { color: var(--ink); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td {
      padding: 10px 8px;
      text-align: left;
      border-top: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-size: 12px;
      color: var(--muted);
      background: #f8fafc;
      border-top: 0;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .mini {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 16px;
      background: #fff;
    }
    .caption {
      color: var(--muted);
      font-size: 13px;
      margin-top: 8px;
    }
    .footer-note {
      font-size: 12px;
      color: var(--muted);
    }
    .list {
      margin: 0;
      padding-left: 18px;
      line-height: 1.6;
    }
    @media print {
      body { background: white; }
      main { max-width: none; padding: 0; }
      .hero, .band { box-shadow: none; }
    }
    @media (max-width: 1000px) {
      .summary-grid, .two-up, .grid-3 { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">Vendor Brief | Funding Loops</div>
      <h1>Public Funding Risk Scanner</h1>
      <p>A vendor-ready concept for detecting circular funding ecosystems in public-interest organizations. This brief packages real evidence from the hackathon dataset and shows how the workflow can become a ministry-facing product.</p>
      <p class="footer-note">Evidence base: unified CRA, FED, AB, and golden-record PostgreSQL dataset with approximately 23 million rows. Report generated ${escapeHtml(summary.generatedAt)}.</p>
    </section>

    <section class="band">
      <h2>Executive Summary</h2>
      <div class="callout">${escapeHtml(summary.insight)}</div>
      <div class="summary-grid" style="margin-top:14px">
        <div class="stat"><strong>${summary.counts.flaggedLoops}</strong>Flagged loops</div>
        <div class="stat"><strong>${summary.counts.highRiskLoops}</strong>High-risk loops</div>
        <div class="stat"><strong>${summary.counts.totalOrganizations}</strong>Organizations involved</div>
        <div class="stat"><strong>${money(summary.counts.governmentFundingExposure)}</strong>Public-funding exposure</div>
      </div>
    </section>

    <section class="two-up">
      <div class="band">
        <h2>Why this matters</h2>
        <p>Most public-funding assurance workflows stop at one transaction or one dataset. Funding Loops changes the frame: it surfaces hidden ecosystems where money circulates between related entities and combines those loops with dependency, governance, repetition, and activity signals.</p>
        <div class="pills">
          <span class="pill"><strong>${summary.counts.twoHopLoops}</strong> 2-hop loops</span>
          <span class="pill"><strong>${summary.counts.threeHopLoops}</strong> 3-hop loops</span>
          <span class="pill"><strong>${summary.counts.sameYearLoops}</strong> same-year loops</span>
          <span class="pill"><strong>${summary.signalCounts.connectedEntities}</strong> with shared-director links</span>
          <span class="pill"><strong>${summary.signalCounts.inactiveAfterFunding}</strong> with inactive-after-funding signal</span>
        </div>
        <p class="caption">Important note: these are screening signals for analyst review, not final determinations of misconduct.</p>
      </div>
      <div class="band">
        <h2>What the product does</h2>
        <ul class="list">
          <li>Ingests messy CSV, Excel, JSONL, or linked files.</li>
          <li>Normalizes columns and resolves duplicate organizations.</li>
          <li>Detects A → B → A and A → B → C → A circular flows.</li>
          <li>Enriches each loop with shared directors, inactivity, government dependency, repetition, and concentration signals.</li>
          <li>Ranks risky clusters and explains them in plain language for analysts.</li>
        </ul>
      </div>
    </section>

    <section class="band">
      <h2>Real-data evidence</h2>
      ${barSvg}
      <div class="caption">Ranking is based on the current Funding Loops pipeline: loop participation plus supporting signals from CRA, FED, AB, and the entity-matching layer.</div>
    </section>

    <section class="two-up">
      <div class="band">
        <h2>Signal prevalence</h2>
        ${signalSvg}
      </div>
      <div class="band">
        <h2>Representative high-risk loop</h2>
        ${networkSvg}
        <p class="caption">This example illustrates the product story: detect the loop first, then show why it deserves attention.</p>
      </div>
    </section>

    <section class="band">
      <h2>Top clusters for analyst review</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Cluster</th>
            <th>Organizations involved</th>
            <th>Circular flow</th>
            <th>Total funding</th>
            <th>Risk</th>
            <th>Main reason flagged</th>
          </tr>
        </thead>
        <tbody>${topRows}</tbody>
      </table>
    </section>

    <section class="grid-3">
      <div class="band">
        <h2>Delivery architecture</h2>
        <p>Current MVP: FastAPI, pandas, rapidfuzz, NetworkX, and a web dashboard. Production path: Cloud Run, Cloud Storage, BigQuery, and optional Vertex AI explanations.</p>
      </div>
      <div class="band">
        <h2>Implementation path</h2>
        <p>Phase 1: analyst MVP. Phase 2: shared cloud ingestion and scheduled refresh. Phase 3: enterprise workflow, exports, notes, and governance controls.</p>
      </div>
      <div class="band">
        <h2>Vendor angle</h2>
        <p>This is a strong fit for vendors serving audit, grants management, public-sector analytics, and integrity screening. The evidence base shows both real signal and a clear workflow for buyers.</p>
      </div>
    </section>

    <section class="band">
      <h2>Recommended buyer message</h2>
      <p>We are not just finding anomalies. We are showing hidden funding ecosystems where money circulates between connected organizations, then giving analysts a fast way to understand which loops warrant review.</p>
      <p class="footer-note">Source tables: CRA T3010 loop outputs and financials, CRA directors, FED grants and contributions, AB grants/contracts/sole-source/non-profit registry, and general golden records. Prepared for vendor-facing discussions on April 28, 2026.</p>
    </section>
  </main>
</body>
</html>`;
}

function main() {
  ensureDir(OUT_DIR);
  const summary = summarize(loadReport());

  fs.writeFileSync(path.join(OUT_DIR, "data-summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "funding-loops-vendor-report.md"), buildMarkdown(summary));
  fs.writeFileSync(path.join(OUT_DIR, "funding-loops-vendor-report.html"), buildHtml(summary));

  console.log(`Vendor brief written to ${OUT_DIR}`);
}

main();
