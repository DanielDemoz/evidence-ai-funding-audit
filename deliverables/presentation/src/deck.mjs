import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Presentation,
  PresentationFile,
  row,
  column,
  grid,
  text,
  chart,
  rule,
  fill,
  hug,
  fixed,
  wrap,
  fr,
  auto,
} from "@oai/artifact-tool";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(MODULE_DIR, "..");
const SUMMARY_PATH = path.resolve(WORKSPACE, "..", "vendor_brief", "data-summary.json");
const OUTPUT_DIR = path.resolve(WORKSPACE, "output");
const SCRATCH_DIR = path.resolve(WORKSPACE, "scratch");

const palette = {
  navy: "#082F49",
  teal: "#0F766E",
  tealSoft: "#CCFBF1",
  blue: "#1D4ED8",
  amber: "#B45309",
  red: "#B91C1C",
  ink: "#0F172A",
  muted: "#475569",
  line: "#CBD5E1",
  bg: "#F8FAFC",
  white: "#FFFFFF",
};

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

function readSummary() {
  return JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8"));
}

function setBg(slide, color) {
  slide.background.fill = { type: "solid", color };
}

function titleBlock(title, subtitle, invert = false, span = 1) {
  return column(
    {
      name: `${title}-title-block`,
      width: fill,
      height: hug,
      gap: 12,
      columnSpan: span,
    },
    [
      text(title, {
        name: `${title}-title`,
        width: fill,
        height: hug,
        style: {
          fontSize: 52,
          bold: true,
          color: invert ? palette.white : palette.ink,
        },
      }),
      rule({
        name: `${title}-rule`,
        width: fixed(220),
        stroke: invert ? palette.tealSoft : palette.teal,
        weight: 4,
      }),
      text(subtitle, {
        name: `${title}-subtitle`,
        width: wrap(1360),
        height: hug,
        style: {
          fontSize: 24,
          color: invert ? "rgba(255,255,255,0.84)" : palette.muted,
        },
      }),
    ],
  );
}

function metricColumn(value, label, color = palette.ink) {
  return column(
    { name: `${label}-metric`, width: fill, height: hug, gap: 6 },
    [
      text(value, {
        name: `${label}-value`,
        width: fill,
        height: hug,
        style: { fontSize: 42, bold: true, color },
      }),
      text(label, {
        name: `${label}-label`,
        width: wrap(260),
        height: hug,
        style: { fontSize: 18, color: palette.muted },
      }),
    ],
  );
}

function bulletLine(textValue, accent = palette.teal) {
  return row(
    { name: `${textValue}-row`, width: fill, height: hug, gap: 14, alignItems: "start" },
    [
      text("•", {
        name: `${textValue}-dot`,
        width: fixed(16),
        height: hug,
        style: { fontSize: 28, color: accent, bold: true },
      }),
      text(textValue, {
        name: `${textValue}-copy`,
        width: fill,
        height: hug,
        style: { fontSize: 22, color: palette.ink },
      }),
    ],
  );
}

function workflowStep(number, label, detail, color) {
  return column(
    { name: `${label}-workflow`, width: fill, height: hug, gap: 8 },
    [
      text(number, {
        name: `${label}-number`,
        width: fill,
        height: hug,
        style: { fontSize: 34, bold: true, color },
      }),
      text(label, {
        name: `${label}-label`,
        width: fill,
        height: hug,
        style: { fontSize: 24, bold: true, color: palette.ink },
      }),
      text(detail, {
        name: `${label}-detail`,
        width: wrap(240),
        height: hug,
        style: { fontSize: 17, color: palette.muted },
      }),
    ],
  );
}

function phaseColumn(phase, title, lines, color) {
  return column(
    { name: `${phase}-phase`, width: fill, height: hug, gap: 14 },
    [
      text(phase, {
        name: `${phase}-eyebrow`,
        width: fill,
        height: hug,
        style: { fontSize: 18, bold: true, color },
      }),
      text(title, {
        name: `${phase}-title`,
        width: fill,
        height: hug,
        style: { fontSize: 28, bold: true, color: palette.ink },
      }),
      ...lines.map((line, index) =>
        text(line, {
          name: `${phase}-line-${index}`,
          width: wrap(380),
          height: hug,
          style: { fontSize: 18, color: palette.muted },
        }),
      ),
    ],
  );
}

function addCover(slide, summary) {
  setBg(slide, palette.navy);
  slide.compose(
    grid(
      {
        name: "cover-root",
        width: fill,
        height: fill,
        columns: [fr(0.66), fr(0.34)],
        rows: [auto, fr(1), auto],
        columnGap: 44,
        rowGap: 28,
        padding: { x: 88, y: 76 },
      },
      [
        titleBlock(
          "Funding Loops Risk Scanner",
          "Vendor brief built on real CRA, FED, AB, and golden-record evidence from the GovAlta hackathon dataset.",
          true,
          2,
        ),
        column(
          { name: "cover-left", width: fill, height: hug, gap: 18 },
          [
            text("A ministry-ready workflow for surfacing circular funding ecosystems, ranking risk, and explaining why a loop deserves analyst review.", {
              name: "cover-thesis",
              width: wrap(920),
              height: hug,
              style: { fontSize: 34, color: palette.white, bold: true },
            }),
            text(summary.insight, {
              name: "cover-proof",
              width: wrap(980),
              height: hug,
              style: { fontSize: 21, color: "rgba(255,255,255,0.78)" },
            }),
          ],
        ),
        column(
          { name: "cover-right", width: fill, height: hug, gap: 12 },
          [
            text(String(summary.counts.flaggedLoops), {
              name: "cover-flagged",
              width: fill,
              height: hug,
              style: { fontSize: 136, bold: true, color: palette.tealSoft },
            }),
            text("flagged funding-loop clusters", {
              name: "cover-flagged-label",
              width: wrap(320),
              height: hug,
              style: { fontSize: 24, color: palette.white, bold: true },
            }),
            text(`${summary.counts.highRiskLoops} high risk | ${summary.counts.totalOrganizations} organizations | ${money(summary.counts.governmentFundingExposure)} exposure`, {
              name: "cover-metrics",
              width: wrap(340),
              height: hug,
              style: { fontSize: 18, color: "rgba(255,255,255,0.74)" },
            }),
          ],
        ),
        text("Prepared for vendor discussions | April 28, 2026", {
          name: "cover-footer",
          width: fill,
          height: hug,
          style: { fontSize: 14, color: "rgba(255,255,255,0.62)" },
          columnSpan: 2,
        }),
      ],
    ),
    {
      frame: { left: 0, top: 0, width: 1920, height: 1080 },
      baseUnit: 8,
    },
  );
}

function addProblem(slide) {
  setBg(slide, palette.white);
  slide.compose(
    grid(
      {
        name: "problem-root",
        width: fill,
        height: fill,
        columns: [fr(1), fr(1), fr(1)],
        rows: [auto, fr(1), auto],
        columnGap: 30,
        rowGap: 26,
        padding: { x: 84, y: 70 },
      },
      [
        titleBlock(
          "Why ministries need this",
          "Most integrity workflows review one payment, one entity, or one dataset at a time. Funding Loops reframes the problem around connected funding ecosystems.",
          false,
          3,
        ),
        column(
          { name: "problem-1", width: fill, height: hug, gap: 10 },
          [
            text("Blind spots across datasets", {
              name: "problem-1-title",
              width: fill,
              height: hug,
              style: { fontSize: 28, bold: true, color: palette.ink },
            }),
            text("The same organization can appear differently across CRA, federal, and provincial systems, making connected money flows hard to see.", {
              name: "problem-1-copy",
              width: wrap(500),
              height: hug,
              style: { fontSize: 20, color: palette.muted },
            }),
          ],
        ),
        column(
          { name: "problem-2", width: fill, height: hug, gap: 10 },
          [
            text("Manual review bottlenecks", {
              name: "problem-2-title",
              width: fill,
              height: hug,
              style: { fontSize: 28, bold: true, color: palette.ink },
            }),
            text("Analysts spend time cleaning names, tracing relationships, and building narratives instead of evaluating the actual risk signal.", {
              name: "problem-2-copy",
              width: wrap(500),
              height: hug,
              style: { fontSize: 20, color: palette.muted },
            }),
          ],
        ),
        column(
          { name: "problem-3", width: fill, height: hug, gap: 10 },
          [
            text("Weak escalation explainability", {
              name: "problem-3-title",
              width: fill,
              height: hug,
              style: { fontSize: 28, bold: true, color: palette.ink },
            }),
            text("Buyers need a clear reason for each escalation. A loop alone is not enough; the supporting context must be visible in one view.", {
              name: "problem-3-copy",
              width: wrap(500),
              height: hug,
              style: { fontSize: 20, color: palette.muted },
            }),
          ],
        ),
        text("Positioning message: We are not just finding anomalies. We are showing hidden funding ecosystems where money circulates between connected organizations.", {
          name: "problem-footer",
          width: wrap(1500),
          height: hug,
          style: { fontSize: 22, color: palette.teal, bold: true },
          columnSpan: 3,
        }),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function addEvidence(slide, summary) {
  setBg(slide, palette.bg);
  slide.compose(
    grid(
      {
        name: "evidence-root",
        width: fill,
        height: fill,
        columns: [fr(1), fr(1), fr(1), fr(1)],
        rows: [auto, auto, fr(1)],
        columnGap: 24,
        rowGap: 30,
        padding: { x: 84, y: 70 },
      },
      [
        titleBlock(
          "Real-data proof",
          "The current Funding Loops run was executed against the provided hackathon PostgreSQL dataset, not a mock sample.",
          false,
          4,
        ),
        metricColumn(String(summary.counts.flaggedLoops), "Flagged loops", palette.teal),
        metricColumn(String(summary.counts.highRiskLoops), "High-risk loops", palette.red),
        metricColumn(String(summary.counts.totalOrganizations), "Organizations involved", palette.blue),
        metricColumn(money(summary.counts.governmentFundingExposure), "Public-funding exposure", palette.ink),
        column(
          { name: "evidence-proof", width: fill, height: hug, gap: 14, columnSpan: 4 },
          [
            text(summary.insight, {
              name: "evidence-insight",
              width: wrap(1600),
              height: hug,
              style: { fontSize: 26, color: palette.ink, bold: true },
            }),
            row(
              { name: "evidence-secondary", width: fill, height: hug, gap: 32 },
              [
                metricColumn(String(summary.counts.twoHopLoops), "2-hop loops", palette.ink),
                metricColumn(String(summary.counts.threeHopLoops), "3-hop loops", palette.ink),
                metricColumn(String(summary.counts.sameYearLoops), "Same-year loops", palette.ink),
                metricColumn(String(summary.signalCounts.connectedEntities), "Loops with shared-director links", palette.ink),
              ],
            ),
          ],
        ),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function addChartSlide(slide, summary) {
  setBg(slide, palette.white);
  const categories = summary.top5.map((loop) => `#${loop.loop_id}`);
  const values = summary.top5.map((loop) => Math.round(Number(loop.cluster_total_funding || 0) / 1000000));

  slide.compose(
    grid(
      {
        name: "chart-root",
        width: fill,
        height: fill,
        columns: [fr(0.42), fr(0.58)],
        rows: [auto, fr(1)],
        columnGap: 38,
        rowGap: 28,
        padding: { x: 84, y: 70 },
      },
      [
        titleBlock(
          "Where the biggest clusters sit",
          "A few loops dominate surrounding public-funding exposure. The product value is not just detection, but fast prioritization.",
          false,
          2,
        ),
        column(
          { name: "chart-left-copy", width: fill, height: hug, gap: 18 },
          [
            bulletLine("Cluster #141 ties a direct 2-hop loop to shared directors and 80.3% government-funding dependency.", palette.red),
            bulletLine("The top five clusters all score 4/6 and are driven by connected entities plus additional public-funding signals.", palette.teal),
            bulletLine("This creates a credible analyst queue for ministries, inspectors, and grants-assurance teams.", palette.blue),
          ],
        ),
        chart({
          name: "top-clusters-chart",
          width: fill,
          height: fill,
          chartType: "bar",
          config: {
            title: "Top 5 flagged clusters by total funding exposure (CAD millions)",
            categories,
            series: [{ name: "Funding exposure", values }],
          },
        }),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function addScoringSlide(slide, summary) {
  setBg(slide, palette.bg);
  const top = summary.top5[0];
  slide.compose(
    grid(
      {
        name: "scoring-root",
        width: fill,
        height: fill,
        columns: [fr(0.52), fr(0.48)],
        rows: [auto, fr(1)],
        columnGap: 36,
        rowGap: 26,
        padding: { x: 84, y: 70 },
      },
      [
        titleBlock(
          "What makes a loop risky",
          "The model stays deliberately simple: detect the loop first, then stack 3 to 4 supporting signals that analysts can understand and defend.",
          false,
          2,
        ),
        column(
          { name: "score-model", width: fill, height: hug, gap: 14 },
          [
            bulletLine("+1 loop detected"),
            bulletLine("+1 connected entities via shared directors or related structure"),
            bulletLine("+1 inactive after funding"),
            bulletLine("+1 highly government-funded"),
            bulletLine("+1 repeated or duplicate funding patterns"),
            bulletLine("+1 contract concentration or sole-source signal"),
            text("Thresholds: 3+ = flagged | 4+ = high risk", {
              name: "score-thresholds",
              width: wrap(760),
              height: hug,
              style: { fontSize: 24, bold: true, color: palette.teal },
            }),
          ],
        ),
        column(
          { name: "score-example", width: fill, height: hug, gap: 14 },
          [
            text(`Example: Cluster #${top.loop_id}`, {
              name: "score-example-title",
              width: fill,
              height: hug,
              style: { fontSize: 30, bold: true, color: palette.ink },
            }),
            text(top.participants.map((p) => p.org_name).join(" -> "), {
              name: "score-example-orgs",
              width: wrap(760),
              height: hug,
              style: { fontSize: 22, color: palette.muted },
            }),
            bulletLine(`${money(top.total_edge_flow)} in circular flow and ${money(top.cluster_total_funding)} in surrounding public-funding exposure`, palette.ink),
            bulletLine(`${top.shared_director_count} shared directors and max government dependency of ${pct(top.max_govt_dependency_pct)}`, palette.ink),
            bulletLine(`Flagged because ${top.explanation}`, palette.ink),
          ],
        ),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function addWorkflowSlide(slide) {
  setBg(slide, palette.white);
  slide.compose(
    grid(
      {
        name: "workflow-root",
        width: fill,
        height: fill,
        columns: [fr(1), fr(1), fr(1), fr(1)],
        rows: [auto, fr(1), auto],
        columnGap: 24,
        rowGap: 26,
        padding: { x: 84, y: 70 },
      },
      [
        titleBlock(
          "Analyst workflow",
          "The product experience should feel operational, not academic: ingest data, resolve entities, detect loops, score clusters, and explain the escalation path.",
          false,
          4,
        ),
        workflowStep("01", "Ingest", "Upload CSV, Excel, JSONL, or direct file links.", palette.teal),
        workflowStep("02", "Resolve", "Normalize columns and match duplicate organizations.", palette.blue),
        workflowStep("03", "Detect", "Surface A -> B -> A and A -> B -> C -> A loops.", palette.amber),
        workflowStep("04", "Explain", "Rank risky clusters and generate analyst-ready reasoning.", palette.red),
        text("This keeps the main topic narrow: Funding Loops first, supporting signals second, AI explanation third.", {
          name: "workflow-footer",
          width: wrap(1480),
          height: hug,
          style: { fontSize: 22, bold: true, color: palette.ink },
          columnSpan: 4,
        }),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function addArchitectureSlide(slide) {
  setBg(slide, palette.bg);
  slide.compose(
    grid(
      {
        name: "arch-root",
        width: fill,
        height: fill,
        columns: [fr(1), fr(1)],
        rows: [auto, fr(1)],
        columnGap: 40,
        rowGap: 28,
        padding: { x: 84, y: 70 },
      },
      [
        titleBlock(
          "Delivery architecture",
          "The current MVP proves the workflow. The production path is straightforward and cloud-native.",
          false,
          2,
        ),
        column(
          { name: "arch-left", width: fill, height: hug, gap: 16 },
          [
            text("Current working stack", {
              name: "arch-left-title",
              width: fill,
              height: hug,
              style: { fontSize: 30, bold: true, color: palette.ink },
            }),
            bulletLine("FastAPI API and static dashboard"),
            bulletLine("Python entity-matching and loop analysis helpers"),
            bulletLine("Real hackathon data routed from PostgreSQL reports"),
            bulletLine("Upload paths for CSV, Excel, JSONL, and GitHub file links"),
          ],
        ),
        column(
          { name: "arch-right", width: fill, height: hug, gap: 16 },
          [
            text("Production target", {
              name: "arch-right-title",
              width: fill,
              height: hug,
              style: { fontSize: 30, bold: true, color: palette.ink },
            }),
            bulletLine("Cloud Run for API and job execution"),
            bulletLine("Cloud Storage for uploads and result artifacts"),
            bulletLine("BigQuery for scalable joins and enrichment"),
            bulletLine("Optional Vertex AI for plain-language explanations"),
          ],
        ),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function addRoadmapSlide(slide) {
  setBg(slide, palette.white);
  slide.compose(
    grid(
      {
        name: "roadmap-root",
        width: fill,
        height: fill,
        columns: [fr(1), fr(1), fr(1)],
        rows: [auto, fr(1)],
        columnGap: 34,
        rowGap: 30,
        padding: { x: 84, y: 70 },
      },
      [
        titleBlock(
          "90-day implementation path",
          "A vendor can land this in controlled phases: working pilot first, shared cloud delivery second, enterprise workflow third.",
          false,
          3,
        ),
        phaseColumn("Phase 1", "Analyst pilot", [
          "Load real source data",
          "Run loop detection and scoring",
          "Validate output with domain reviewers",
        ], palette.teal),
        phaseColumn("Phase 2", "Shared cloud deployment", [
          "Move uploads and jobs to managed services",
          "Set up BigQuery staging and refresh logic",
          "Harden audit trails and export paths",
        ], palette.blue),
        phaseColumn("Phase 3", "Operational rollout", [
          "Analyst notes and case management",
          "Search, filters, and scheduled monitoring",
          "Optional AI narrative and PDF brief export",
        ], palette.red),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function addValueSlide(slide) {
  setBg(slide, palette.bg);
  slide.compose(
    grid(
      {
        name: "value-root",
        width: fill,
        height: fill,
        columns: [fr(0.54), fr(0.46)],
        rows: [auto, fr(1)],
        columnGap: 36,
        rowGap: 28,
        padding: { x: 84, y: 70 },
      },
      [
        titleBlock(
          "Why this is a credible vendor offer",
          "The commercial angle is not a vague fraud platform. It is a narrowly scoped public-funding risk workflow backed by real evidence and a clear buyer story.",
          false,
          2,
        ),
        column(
          { name: "value-left", width: fill, height: hug, gap: 16 },
          [
            bulletLine("Clear buyer pain: cross-dataset blind spots and manual review effort", palette.teal),
            bulletLine("Clear evidence base: real loop results across roughly 23 million public records", palette.blue),
            bulletLine("Clear implementation path: MVP already working, cloud migration already mapped", palette.red),
            bulletLine("Clear product message: hidden funding ecosystems, not just anomalies", palette.amber),
          ],
        ),
        column(
          { name: "value-right", width: fill, height: hug, gap: 12 },
          [
            text("Recommended offer", {
              name: "offer-title",
              width: fill,
              height: hug,
              style: { fontSize: 30, bold: true, color: palette.ink },
            }),
            text("A ministry-ready Public Funding Risk Scanner that turns messy uploads into a ranked loop-risk brief with evidence, explanation, and network context.", {
              name: "offer-copy",
              width: wrap(700),
              height: hug,
              style: { fontSize: 24, color: palette.ink, bold: true },
            }),
            text("Best first customer motion: pilot with a grants, integrity, or assurance team using one high-value workflow and one known dataset bundle.", {
              name: "offer-pilot",
              width: wrap(700),
              height: hug,
              style: { fontSize: 19, color: palette.muted },
            }),
          ],
        ),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

function addClose(slide) {
  setBg(slide, palette.navy);
  slide.compose(
    grid(
      {
        name: "close-root",
        width: fill,
        height: fill,
        columns: [fr(1)],
        rows: [auto, fr(1), auto],
        rowGap: 26,
        padding: { x: 88, y: 82 },
      },
      [
        titleBlock(
          "Next step",
          "Package this as a 6 to 10 week ministry pilot: one dataset lane, one analyst team, one ranked report workflow, and one clear success measure.",
          true,
        ),
        text("The product story is ready: a focused Funding Loops scanner that reveals hidden funding ecosystems and gives reviewers a faster, more defensible path to escalation.", {
          name: "close-statement",
          width: wrap(1420),
          height: hug,
          style: { fontSize: 34, color: palette.white, bold: true },
        }),
        text("Deliverables included with this brief: vendor report, editable deck, working MVP app, and real-data Funding Loops results.", {
          name: "close-footer",
          width: wrap(1280),
          height: hug,
          style: { fontSize: 20, color: "rgba(255,255,255,0.76)" },
        }),
      ],
    ),
    { frame: { left: 0, top: 0, width: 1920, height: 1080 }, baseUnit: 8 },
  );
}

async function main() {
  const summary = readSummary();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  const presentation = Presentation.create({
    slideSize: { width: 1920, height: 1080 },
  });

  addCover(presentation.slides.add(), summary);
  addProblem(presentation.slides.add());
  addEvidence(presentation.slides.add(), summary);
  addChartSlide(presentation.slides.add(), summary);
  addScoringSlide(presentation.slides.add(), summary);
  addWorkflowSlide(presentation.slides.add());
  addArchitectureSlide(presentation.slides.add());
  addRoadmapSlide(presentation.slides.add());
  addValueSlide(presentation.slides.add());
  addClose(presentation.slides.add());

  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(path.join(OUTPUT_DIR, "output.pptx"));

  const inspection = await presentation.inspect("slide");
  fs.writeFileSync(path.join(SCRATCH_DIR, "deck-inspect.ndjson"), `${inspection.ndjson}\n`, "utf8");

  for (let i = 0; i < presentation.slides.count; i += 1) {
    const slide = presentation.slides.getItem(i);
    const png = await slide.export({ format: "png" });
    fs.writeFileSync(
      path.join(SCRATCH_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`),
      Buffer.from(await png.arrayBuffer()),
    );
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
