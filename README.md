# AI-Powered Public Funding & Charity Network Analytics

Multi-dataset platform for Canadian government transparency research, built for the AI For Accountability Hackathon (April 29, 2026).

## Problem

Canadian accountability research spans CRA charity filings, federal grants, and Alberta contracts—but the same organization appears under dozens of name variants across datasets, blocking cross-source funding analysis.

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

## Screenshot / demo

**Public site:** open `index.html` locally or via GitHub Pages — tabbed docs browser with embedded interactive dashboard from `deliverables/vendor_brief/interactive-dashboard.html`.

Contributors: Daniel Demoz, Kenneth Preston, Matthew Rocky, Ayesha Khalil — University of Ottawa.
