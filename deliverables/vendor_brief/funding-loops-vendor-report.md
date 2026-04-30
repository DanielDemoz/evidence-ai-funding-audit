# Funding Loops Risk Scanner

## Vendor Brief

Generated: 2026-04-30T21:58:28.997Z

## Executive Summary

We identified a cluster of organizations that exchanged funding, shared connections, received public funds, and showed extra risk signals around activity and concentration. Cluster #900014 links ORG-00001, ORG-00002, ORG-00003 in a 15-hop loop with $5M-$10M in circular flow and $100M+ in surrounding public-funding exposure. It scores 6/6 because entities are connected through shared directors; at least one linked entity is currently non-active after receiving public funding. These are screening indicators for human review, not determinations of wrongdoing.

- Flagged loops: 25
- High-risk loops: 25
- Organizations involved: 44
- Public-funding exposure across flagged loops: $3,750,000,000

## Top Five Clusters

| Rank | Cluster | Organizations | Total Funding | Score |
| --- | --- | --- | --- | --- |
| 1 | #900014 | ORG-00001 -> ORG-00002 -> ORG-00003 -> ORG-00004 -> ORG-00005 -> ORG-00006 -> ORG-00007 -> ORG-00008 -> ORG-00009 -> ORG-00010 -> ORG-00011 -> ORG-00012 -> ORG-00013 -> ORG-00014 -> ORG-00015 | $NaN | 6/6 |
| 2 | #900019 | ORG-00001 -> ORG-00002 -> ORG-00003 -> ORG-00004 -> ORG-00005 -> ORG-00006 -> ORG-00007 -> ORG-00008 -> ORG-00009 -> ORG-00010 -> ORG-00016 -> ORG-00017 -> ORG-00018 -> ORG-00014 -> ORG-00015 | $NaN | 6/6 |
| 3 | #905955 | ORG-00001 -> ORG-00002 -> ORG-00003 -> ORG-00004 -> ORG-00005 -> ORG-00006 -> ORG-00007 -> ORG-00019 -> ORG-00020 -> ORG-00021 -> ORG-00022 -> ORG-00017 -> ORG-00018 -> ORG-00014 -> ORG-00015 | $NaN | 6/6 |
| 4 | #902478 | ORG-00001 -> ORG-00002 -> ORG-00003 -> ORG-00004 -> ORG-00005 -> ORG-00006 -> ORG-00007 -> ORG-00019 -> ORG-00020 -> ORG-00021 -> ORG-00023 -> ORG-00017 -> ORG-00018 -> ORG-00014 -> ORG-00015 | $NaN | 6/6 |
| 5 | #901284 | ORG-00001 -> ORG-00002 -> ORG-00003 -> ORG-00004 -> ORG-00005 -> ORG-00006 -> ORG-00007 -> ORG-00019 -> ORG-00020 -> ORG-00021 -> ORG-00024 -> ORG-00017 -> ORG-00018 -> ORG-00014 -> ORG-00015 | $NaN | 6/6 |

## Vendor Positioning

This project demonstrates a ministry-ready workflow: ingest messy funding data, normalize entities, detect circular funding loops, score supporting risk signals, and explain why a cluster was flagged. The recommended product position is a Public Funding Risk Scanner delivered as an analyst-facing workflow on top of PostgreSQL or BigQuery with an optional Cloud Run deployment path.