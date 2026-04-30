# Funding Loops Risk Scanner

## Vendor Brief

Generated: 2026-04-30T21:58:28.997Z

## Executive Summary

No loops in this snapshot are within the 5-hop cap (this bundle previously used longer experimental cycles). Regenerate from the database: `cd general && npm run analyze:funding-loops && cd .. && node deliverables/build_vendor_brief.js`.

- Flagged loops: 0
- High-risk loops: 0
- Organizations involved: 0
- Public-funding exposure across flagged loops: $0

## Top Five Clusters

| Rank | Cluster | Organizations | Total Funding | Score |
| --- | --- | --- | --- | --- |

## Vendor Positioning

This project demonstrates a ministry-ready workflow: ingest messy funding data, normalize entities, detect circular funding loops, score supporting risk signals, and explain why a cluster was flagged. The recommended product position is a Public Funding Risk Scanner delivered as an analyst-facing workflow on top of PostgreSQL or BigQuery with an optional Cloud Run deployment path.