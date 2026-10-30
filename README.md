# AI-Powered Public Funding & Charity Network Analytics

Multi-dataset platform for Canadian government transparency research, built for the AI For Accountability Hackathon (April 29, 2026).

## Problem

Canadian accountability research spans CRA charity filings, federal grants, and Alberta contracts, but the same organization appears under dozens of name variants across datasets, blocking cross-source funding analysis.

## Approach

Unified four PostgreSQL schemas (`cra`, `fed`, `ab`, `general`) covering ~22M rows from CRA T3010, federal grants (~1.275M rows), and Alberta open data (~2.61M rows). Ran a seven-stage entity resolution pipeline combining deterministic BN/name matching, Splink probabilistic linkage, and LLM verdicts (SAME/RELATED/DIFFERENT) to produce ~851K golden records. Published an anonymized GitHub Pages dashboard and vendor brief deliverables.

## Results

- ~851K canonical organization golden records with ~5.2M source links
- CRA module: circular-gifting detection, 0–30 risk scoring, charity lookup
- FED module: 7-dimension risk scoring (0–35), recipient concentration (HHI)
- AB module: sole-source analysis, grant/contract ratios, non-profit lifecycle scoring
- Public dashboard with anonymized organization labels for safe sharing

## Tech stack

Node.js 18+, Python 3.10+ (Splink), PostgreSQL 14+, Splink, Anthropic Claude, HTML/JS dashboard

## How to run

```bash
git clone <repo-url> && cd evidence-ai-funding-audit
for dir in CRA FED AB general; do (cd $dir && npm install); done
cd CRA && npm run verify    # read-only against shared DB with .env.public from hackathon info pack
```

For local Postgres: see `.local-db/README.md`. Entity pipeline: `cd general && npm run entities:dashboard` (port 3800) and `npm run entities:dossier` (port 3801).

## Live demo

**Public site:** https://danieldemoz.github.io/evidence-ai-funding-audit/ (tabbed docs browser with the embedded interactive dashboard from `deliverables/vendor_brief/interactive-dashboard.html`). You can also open `index.html` locally.

## Responsible AI, following the Reliable AI Adoption Framework

1. **Business problem:** help accountability researchers find funding loops and concentration across datasets that do not share a common organization ID. Success means every flag can be traced back to source records.
2. **Data readiness:** public CRA, federal and Alberta open data. Every proven defect is listed with a reproducible query in [KNOWN-DATA-ISSUES.md](KNOWN-DATA-ISSUES.md).
3. **Governance and risk:** risk scores are screening indicators for human review, not findings of wrongdoing. Organization names are anonymized in the public dashboard and vendor brief.
4. **Technology:** rules, trigram similarity, Splink and keyword overlap generate candidate pairs. An LLM then labels each pair SAME, RELATED or DIFFERENT, and every verdict is stored in `entity_merge_candidates` so it can be audited. SAME verdicts are merged automatically, so a wrong merge could join two organizations' funding. Check the entity dossier view before reporting any finding.
5. **People and adoption:** findings are written for analysts and journalists who will check them against source filings before acting.
6. **Outcomes and monitoring:** data-quality counts are re-run against the live database, and issue IDs stay stable so external references do not break.

Third-party tools and data are credited in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

Contributors: Daniel Demoz, Kenneth Preston, Matthew Rocky, Ayesha Khalil, University of Ottawa.
