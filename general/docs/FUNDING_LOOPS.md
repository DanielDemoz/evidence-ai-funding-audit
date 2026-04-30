# Funding Loops

This workflow keeps the analysis centered on one question: where does money appear to circulate between connected organizations, and which loops deserve a closer look?

## What it uses

- `cra.loops`, `cra.loop_participants`, and `cra.loop_edge_year_flows` as the default core circular-flow signal
- `cra.loop_edges` only when you pass `--recompute-loops` (experimental DFS on aggregated edges). Normal runs use **`cra.loops` only**. **This report caps all loop lengths at 3 hops** (2-hop and 3-hop cycles only; longer materialized paths in the DB are not used here).
- `cra.cra_financial_details` for revenue, total government funding, and dependency ratios
- `cra.cra_directors` for shared-board overlap
- `general.entity_golden_records` plus `general.vw_entity_funding` to carry CRA loop participants into FED and Alberta funding context
- `general.entity_source_links` + `ab.ab_non_profit` for Alberta non-profit status checks

## What it outputs

Running `npm run analyze:funding-loops` from `general/` writes three files under `general/data/reports/`:

- `funding-loops-report.json`: machine-readable ranked loop output
- `funding-loops-report.md`: concise analyst-facing writeup and top loop table
- `funding-loops-network.html`: one visual page with a loop network and ranked table

## Ranking logic

The ranking is intentionally simple and hackathon-friendly:

- After enrichment, sort primarily by **risk score**, then public funding and circular flow; **shorter loops break ties** (2-hop before 3-hop when other signals match), matching “favour short loops first”
- Increase risk when loop participants depend heavily on government funding
- Increase risk when two or more loop participants share board members
- Increase risk when the same loop participants also show FED or Alberta funding exposure
- Increase risk for tight timing, repeated gift edges, Alberta sole-source exposure, or non-active Alberta registry status

This is a prioritization tool, not a fraud detector. A flagged loop is a candidate for human review, not proof of wrongdoing.

## Usage

```bash
cd general
npm run analyze:funding-loops
```

Optional flags:

```bash
node scripts/advanced/11-funding-loops.js --top 25 --network 12 --candidate-pool 250 --max-hops 3
```

`--max-hops` is **clamped to 3**. Values above 3 are capped with a console warning. To use the DFS path on `cra.loop_edges` instead of `cra.loops` (same 3-hop cap):

```bash
node scripts/advanced/11-funding-loops.js --recompute-loops --candidate-pool 500 --max-computed-cycles 6000
```

Generate a privacy-safe public report:

```bash
node scripts/advanced/11-funding-loops.js --public-report
```

Public report mode replaces organization names with pseudonyms (`ORG-00001` style), redacts direct identifiers, and buckets monetary values into ranges. Keep full-detail reports restricted to authorized analysts.

## Refreshing the vendor dashboard pack

After generating `funding-loops-report.json`, rebuild the static dashboard and `data-summary.json`:

```bash
node deliverables/build_vendor_brief.js
```

To re-filter an **existing** `deliverables/vendor_brief/data-summary.json` to the hop cap (no DB), use:

```bash
node deliverables/apply_hop_cap_to_summary.js
```

For **public-facing** snapshots, replace legal organization names with category labels (e.g. `university 001`, `deaf org 002`), redact business numbers and director names, and rebuild the vendor HTML/MD:

```bash
node deliverables/anonymize_vendor_summary.js
```

Run this on a copy with real names only in trusted environments; commit anonymized output for GitHub Pages if required.

## Practical note

The repo does not ship the shared `.env.public` credentials or the `.local-db/data/` bundle. The script is ready to run once either of these is available:

- the hackathon read-only database credentials in `general/.env.public`, or
- a local Postgres loaded from `.local-db/`
