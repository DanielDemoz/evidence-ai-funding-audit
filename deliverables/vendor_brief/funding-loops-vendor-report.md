# Funding Loops Risk Scanner

## Vendor Brief

Generated: 2026-04-28T13:44:54.622Z

## Executive Summary

We identified a cluster of organizations that exchanged funding, shared connections, received public funds, and showed extra risk signals around activity and concentration. Cluster #141 links BOB RUMBALL CANADIAN CENTRE OF EXCELLENCE FOR THE DEAF, The Bob Rumball Camp of the Deaf in a 2-hop loop with $539,500 in circular flow and $89,257,445 in surrounding public-funding exposure. It scores 4/6 because entities are connected through shared directors; at least one organization is highly government-funded (max 80.3%).

- Flagged loops: 20
- High-risk loops: 5
- Organizations involved: 37
- Public-funding exposure across flagged loops: $6,959,822,099

## Top Five Clusters

| Rank | Cluster | Organizations | Total Funding | Score |
| --- | --- | --- | --- | --- |
| 1 | #141 | BOB RUMBALL CANADIAN CENTRE OF EXCELLENCE FOR THE DEAF -> The Bob Rumball Camp of the Deaf | $89,257,445 | 4/6 |
| 2 | #336 | MORE THAN A ROOF MENNONITE HOUSING SOCIETY -> WEST END MENNONITE HOUSING SOCIETY | $49,987,739 | 4/6 |
| 3 | #17 | COSMOPOLITAN INDUSTRIES LTD. -> THE STENSRUD FAMILY TOP OF THE ROCK FOUNDATION INC. | $43,467,018 | 4/6 |
| 4 | #436 | AKOMA HOLDINGS INCORPORATED -> AKOMA FAMILY CENTRE INCORPORATED | $13,447,411 | 4/6 |
| 5 | #231 | Prairie Theatre Exchange Inc -> PRAIRIE THEATRE EXCHANGE FOUNDATION TRUST | $8,978,314 | 4/6 |

## Vendor Positioning

This project demonstrates a ministry-ready workflow: ingest messy funding data, normalize entities, detect circular funding loops, score supporting risk signals, and explain why a cluster was flagged. The recommended product position is a Public Funding Risk Scanner delivered as an analyst-facing workflow on top of PostgreSQL or BigQuery with an optional Cloud Run deployment path.