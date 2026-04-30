# Public Funding Risk Scanner

MVP web app for upload-driven Funding Loops analysis.

## What it does

- Upload CSV, Excel, or JSONL files
- Import a direct GitHub or raw file link
- Load the real hackathon Funding Loops report built from CRA + FED + AB + general
- Clean and normalize columns
- Match duplicate organizations
- Detect 2-hop and 3-hop funding loops
- Score each loop with a simple 1-6 risk model
- Show a dashboard with:
  - summary cards
  - funding graph
  - ranked risk table
  - duplicate matches
  - top flagged organizations
  - plain-language summary

## Run locally

```bash
cd funding_scanner
python -m uvicorn app:app --reload --port 8050
```

Open [http://127.0.0.1:8050](http://127.0.0.1:8050)

## Expected upload shape

The app works best when a transaction file includes at least:

- `payer`
- `recipient`
- `amount`

Accepted file types:

- `.csv`
- `.xlsx`
- `.xls`
- `.jsonl`
- `.ndjson`

Direct-link import accepts:

- raw file URLs ending in one of the supported extensions
- GitHub `blob` links, which the app rewrites to `raw.githubusercontent.com`

## Real dataset mode

The dashboard also has a `Use hackathon dataset` action. It loads the Funding Loops report generated from the real unified PostgreSQL dataset in `general/data/reports/funding-loops-report.json`.

If you want to refresh that report from the live database instead of using the cached copy, set one of these environment variables before starting the FastAPI app:

- `FUNDING_LOOPS_DB_URL`
- `DB_CONNECTION_STRING`

The refresh path runs the existing repo script in `general/scripts/advanced/11-funding-loops.js`.

Optional enrichment columns:

- `description`
- `date`
- `ministry` or `department`
- `sole_source`
- `payer_directors`, `recipient_directors`
- `payer_status`, `recipient_status`
- `payer_revenue`, `recipient_revenue`
- `payer_government_funding`, `recipient_government_funding`
- `payer_govt_dependency_pct`, `recipient_govt_dependency_pct`

Organization metadata files can also be uploaded separately with columns like:

- `org_name`
- `status`
- `directors`
- `revenue`
- `government_funding`
- `govt_dependency_pct`
