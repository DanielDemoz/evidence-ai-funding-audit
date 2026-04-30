# Funding Loops Risk Scanner

## Vendor Brief

Generated: 2026-04-28T13:44:54.622Z

## Executive Summary

We identified a cluster of organizations that exchanged funding, shared connections, received public funds, and showed extra risk signals around activity and concentration. Cluster #141 links deaf org 001, deaf org 002 in a 2-hop loop with $539,500 in circular flow and $89,257,445.15 in surrounding public-funding exposure. It scores 4/6 because entities are connected through shared directors; at least one organization is highly government-funded (max 80.3%). Organization labels are anonymized for public viewing. These are screening indicators for human review, not determinations of wrongdoing.

- Flagged loops: 20
- High-risk loops: 5
- Organizations involved: 37
- Public-funding exposure across flagged loops: $6,959,822,099

## Top Five Clusters

| Rank | Cluster | Organizations | Total Funding | Score |
| --- | --- | --- | --- | --- |
| 1 | #141 | deaf org 001 -> deaf org 002 | $89,257,445 | 4/6 |
| 2 | #336 | faith org 001 -> faith org 002 | $49,987,739 | 4/6 |
| 3 | #17 | corporate org 001 -> foundation 001 | $43,467,018 | 4/6 |
| 4 | #436 | corporate org 002 -> corporate org 003 | $13,447,411 | 4/6 |
| 5 | #231 | arts org 001 -> foundation 002 | $8,978,314 | 4/6 |

## Vendor Positioning

This project demonstrates a ministry-ready workflow: ingest messy funding data, normalize entities, detect circular funding loops, score supporting risk signals, and explain why a cluster was flagged. The recommended product position is a Public Funding Risk Scanner delivered as an analyst-facing workflow on top of PostgreSQL or BigQuery with an optional Cloud Run deployment path.