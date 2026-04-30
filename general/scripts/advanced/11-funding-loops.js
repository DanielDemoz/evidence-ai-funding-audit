#!/usr/bin/env node
/**
 * Funding Loops report
 *
 * Focus:
 * - Start from materialized CRA cycles in cra.loops (this report caps at 5 hops; DB may hold longer cycles)
 * - Enrich them with government-funding dependency, director overlap, and
 *   cross-dataset public-money exposure from FED and Alberta sources
 * - Produce:
 *   1. A ranked loop table
 *   2. A single HTML network visualization
 *   3. A narrative insight for the highest-risk loop
 *
 * Usage:
 *   node scripts/advanced/11-funding-loops.js
 *   node scripts/advanced/11-funding-loops.js --top 25 --network 12
 */

const fs = require('fs');
const path = require('path');
const db = require('../../lib/db');

const REPORT_DIR = path.join(__dirname, '..', '..', 'data', 'reports');

/** Max hop length for this report (`cra.loops` reads and optional `--recompute-loops` DFS). */
const MAX_LOOP_HOPS = 5;
const MATERIALIZED_MAX_HOPS = MAX_LOOP_HOPS;

function parseArgs() {
  const args = {
    top: 25,
    network: 12,
    candidatePool: 250,
    maxHops: MAX_LOOP_HOPS,
    publicReport: false,
    recomputeLoops: false,
    maxComputedCycles: 4000,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const current = process.argv[i];
    const next = process.argv[i + 1];
    if (current === '--top' && next) {
      args.top = parseInt(next, 10) || args.top;
      i++;
    } else if (current === '--network' && next) {
      args.network = parseInt(next, 10) || args.network;
      i++;
    } else if (current === '--candidate-pool' && next) {
      args.candidatePool = parseInt(next, 10) || args.candidatePool;
      i++;
    } else if (current === '--max-hops' && next) {
      args.maxHops = parseInt(next, 10) || args.maxHops;
      i++;
    } else if (current === '--public-report') {
      args.publicReport = true;
    } else if (current === '--recompute-loops') {
      args.recomputeLoops = true;
    } else if (current === '--max-computed-cycles' && next) {
      args.maxComputedCycles = parseInt(next, 10) || args.maxComputedCycles;
      i++;
    }
  }

  const requestedMaxHops = args.maxHops;
  args.maxHops = Math.max(2, Math.min(MAX_LOOP_HOPS, args.maxHops));
  if (requestedMaxHops > MAX_LOOP_HOPS) {
    console.warn(
      `Funding loops: --max-hops ${requestedMaxHops} capped to ${MAX_LOOP_HOPS} for this report.`
    );
  }
  args.maxComputedCycles = Math.max(200, args.maxComputedCycles);
  return args;
}

const args = parseArgs();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function round(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function toNumber(value) {
  if (value == null || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function money(value) {
  if (typeof value === 'string' && value.includes('$')) return value;
  return `$${Math.round(toNumber(value)).toLocaleString('en-CA')}`;
}

function moneyRange(value) {
  const amount = toNumber(value);
  if (amount <= 0) return '$0';
  if (amount <= 100000) return '$0-$100k';
  if (amount <= 250000) return '$100k-$250k';
  if (amount <= 500000) return '$250k-$500k';
  if (amount <= 1000000) return '$500k-$1M';
  if (amount <= 5000000) return '$1M-$5M';
  if (amount <= 10000000) return '$5M-$10M';
  if (amount <= 50000000) return '$10M-$50M';
  if (amount <= 100000000) return '$50M-$100M';
  return '$100M+';
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return 'n/a';
  return `${round(value, 1)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function queryOneValue(client, sql, params = []) {
  const res = await client.query(sql, params);
  return res.rows[0];
}

async function fetchCandidateLoops(client, maxHopsLimit = args.maxHops) {
  const usesLoopFinancials = await queryOneValue(client, `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'cra' AND table_name = 'loop_financials'
    ) AS ok
  `);

  const sql = usesLoopFinancials.ok ? `
    SELECT
      l.id AS loop_id,
      l.hops,
      l.path_bns,
      l.path_display,
      COALESCE(lf.bottleneck_window, l.bottleneck_amt, 0) AS bottleneck_amt,
      COALESCE(lf.total_flow_window, l.total_flow, 0) AS total_flow_amt,
      l.min_year,
      l.max_year,
      COALESCE(lf.same_year, l.min_year = l.max_year) AS same_year
    FROM cra.loops l
    LEFT JOIN cra.loop_financials lf
      ON lf.loop_id = l.id
    WHERE l.hops BETWEEN 2 AND $1
    ORDER BY COALESCE(lf.bottleneck_window, l.bottleneck_amt, 0) DESC NULLS LAST,
             COALESCE(lf.total_flow_window, l.total_flow, 0) DESC NULLS LAST,
             l.id
    LIMIT $2
  ` : `
    SELECT
      l.id AS loop_id,
      l.hops,
      l.path_bns,
      l.path_display,
      COALESCE(l.bottleneck_amt, 0) AS bottleneck_amt,
      COALESCE(l.total_flow, 0) AS total_flow_amt,
      l.min_year,
      l.max_year,
      (l.min_year = l.max_year) AS same_year
    FROM cra.loops l
    WHERE l.hops BETWEEN 2 AND $1
    ORDER BY COALESCE(l.bottleneck_amt, 0) DESC NULLS LAST,
             COALESCE(l.total_flow, 0) DESC NULLS LAST,
             l.id
    LIMIT $2
  `;

  const res = await client.query(sql, [maxHopsLimit, args.candidatePool]);
  return res.rows.map((row) => ({ ...row, source: 'materialized' }));
}

function normalizeCycle(nodes) {
  const forward = nodes.slice();
  const backward = nodes.slice().reverse();
  const rotations = [];
  for (let i = 0; i < forward.length; i++) {
    rotations.push(forward.slice(i).concat(forward.slice(0, i)).join('>'));
    rotations.push(backward.slice(i).concat(backward.slice(0, i)).join('>'));
  }
  rotations.sort();
  return rotations[0];
}

async function fetchComputedLoops(client) {
  const edgeRes = await client.query(`
    SELECT src, dst, COALESCE(total_amt, 0) AS total_amt, COALESCE(edge_count, 0) AS edge_count
    FROM cra.loop_edges
    WHERE src IS NOT NULL
      AND dst IS NOT NULL
      AND COALESCE(total_amt, 0) > 0
  `);

  const adjacency = new Map();
  for (const row of edgeRes.rows) {
    if (!adjacency.has(row.src)) adjacency.set(row.src, []);
    adjacency.get(row.src).push({
      src: row.src,
      dst: row.dst,
      total_amt: toNumber(row.total_amt),
      edge_count: toNumber(row.edge_count),
    });
  }

  const roots = Array.from(adjacency.keys()).sort();
  const cycles = [];
  const seen = new Set();
  const maxCycles = Math.max(args.candidatePool * 8, args.maxComputedCycles);

  function dfs(start, current, stackNodes, stackEdges, visited) {
    if (cycles.length >= maxCycles) return;
    const neighbors = adjacency.get(current) || [];
    for (const edge of neighbors) {
      if (edge.dst === start && stackNodes.length >= 2) {
        const cycleNodes = stackNodes.slice();
        if (cycleNodes.length <= args.maxHops) {
          const key = normalizeCycle(cycleNodes);
          if (!seen.has(key)) {
            seen.add(key);
            const loopEdges = stackEdges.concat([edge]).map((e, idx) => ({
              hop_idx: idx + 1,
              src: e.src,
              dst: e.dst,
              year_flow: e.total_amt,
              gift_count: e.edge_count,
            }));
            cycles.push({
              loop_id: 900000 + cycles.length + 1,
              hops: cycleNodes.length,
              path_bns: cycleNodes,
              path_display: `${cycleNodes.join('→')}→${cycleNodes[0]}`,
              bottleneck_amt: loopEdges.reduce((min, item) => Math.min(min, toNumber(item.year_flow)), Number.POSITIVE_INFINITY),
              total_flow_amt: loopEdges.reduce((sum, item) => sum + toNumber(item.year_flow), 0),
              min_year: null,
              max_year: null,
              same_year: false,
              source: 'computed',
              precomputedEdges: loopEdges,
            });
          }
        }
        continue;
      }

      if (visited.has(edge.dst) || stackNodes.length >= args.maxHops) continue;
      visited.add(edge.dst);
      stackNodes.push(edge.dst);
      stackEdges.push(edge);
      dfs(start, edge.dst, stackNodes, stackEdges, visited);
      stackNodes.pop();
      stackEdges.pop();
      visited.delete(edge.dst);
    }
  }

  for (const root of roots) {
    if (cycles.length >= maxCycles) break;
    const visited = new Set([root]);
    dfs(root, root, [root], [], visited);
  }

  return cycles
    .sort((a, b) => toNumber(b.bottleneck_amt) - toNumber(a.bottleneck_amt) || toNumber(b.total_flow_amt) - toNumber(a.total_flow_amt))
    .slice(0, args.candidatePool);
}

async function fetchParticipantProfiles(client, bnRoots) {
  if (!bnRoots.length) return [];
  const res = await client.query(`
    WITH latest_identification AS (
      SELECT DISTINCT ON (LEFT(bn, 9))
        LEFT(bn, 9) AS bn_root,
        bn,
        legal_name,
        designation,
        category,
        fiscal_year
      FROM cra.cra_identification
      ORDER BY LEFT(bn, 9), fiscal_year DESC NULLS LAST, bn
    ),
    charity_financials AS (
      SELECT
        LEFT(fd.bn, 9) AS bn_root,
        SUM(COALESCE(fd.field_4700, 0)) AS revenue,
        SUM(
          COALESCE(fd.field_4540, 0) +
          COALESCE(fd.field_4550, 0) +
          COALESCE(fd.field_4560, 0) +
          COALESCE(fd.field_4570, 0)
        ) AS govt_funding,
        SUM(COALESCE(fd.field_5100, 0)) AS expenditures
      FROM cra.cra_financial_details fd
      GROUP BY LEFT(fd.bn, 9)
    ),
    latest_golden AS (
      SELECT DISTINCT ON (gr.bn_root)
        gr.id,
        gr.bn_root,
        gr.canonical_name,
        gr.dataset_sources
      FROM general.entity_golden_records gr
      WHERE gr.status = 'active' AND gr.bn_root IS NOT NULL
      ORDER BY gr.bn_root, gr.updated_at DESC, gr.id DESC
    ),
    ab_registry AS (
      SELECT
        esl.entity_id,
        BOOL_OR(COALESCE(np.status, '') !~* 'active') AS has_inactive_status,
        STRING_AGG(DISTINCT np.status, '; ' ORDER BY np.status)
          FILTER (WHERE np.status IS NOT NULL AND np.status <> '') AS registry_statuses
      FROM general.entity_source_links esl
      JOIN ab.ab_non_profit np
        ON np.id = (esl.source_pk ->> 'id')::uuid
      WHERE esl.source_schema = 'ab'
        AND esl.source_table = 'ab_non_profit'
      GROUP BY esl.entity_id
    )
    SELECT
      roots.bn_root,
      COALESCE(gr.canonical_name, li.legal_name, roots.bn_root) AS org_name,
      li.legal_name,
      li.designation,
      li.category,
      gr.id AS entity_id,
      gr.dataset_sources,
      cf.revenue,
      cf.govt_funding,
      cf.expenditures,
      CASE
        WHEN COALESCE(cf.revenue, 0) > 0
        THEN ROUND(cf.govt_funding / cf.revenue * 100, 1)
        ELSE NULL
      END AS govt_dependency_pct,
      ar.has_inactive_status,
      ar.registry_statuses
    FROM UNNEST($1::text[]) AS roots(bn_root)
    LEFT JOIN latest_identification li
      ON li.bn_root = roots.bn_root
    LEFT JOIN latest_golden gr
      ON gr.bn_root = roots.bn_root
    LEFT JOIN charity_financials cf
      ON cf.bn_root = roots.bn_root
    LEFT JOIN ab_registry ar
      ON ar.entity_id = gr.id
    ORDER BY roots.bn_root
  `, [bnRoots]);
  return res.rows;
}

async function fetchEntitySignals(client, entityIds) {
  if (!entityIds.length) return [];

  const res = await client.query(`
    WITH fed_current AS (
      SELECT
        esl.entity_id,
        gc.agreement_value,
        UPPER(TRIM(COALESCE(
          NULLIF(gc.agreement_title_en, ''),
          NULLIF(gc.prog_name_en, ''),
          NULLIF(gc.description_en, ''),
          ''
        ))) AS funding_desc_key
      FROM general.entity_source_links esl
      JOIN fed.grants_contributions gc
        ON gc._id = (esl.source_pk ->> '_id')::int
      WHERE esl.entity_id = ANY($1::int[])
        AND esl.source_schema = 'fed'
        AND esl.source_table = 'grants_contributions'
        AND gc.is_amendment = false
        AND gc.agreement_value > 0
    ),
    fed_totals AS (
      SELECT
        entity_id,
        SUM(CASE WHEN agreement_value > 0 THEN agreement_value ELSE 0 END) AS fed_total_grants
      FROM fed_current
      GROUP BY entity_id
    ),
    fed_dupes AS (
      SELECT entity_id, COUNT(*)::int AS duplicate_funding_groups
      FROM (
        SELECT entity_id, funding_desc_key
        FROM fed_current
        WHERE funding_desc_key <> ''
        GROUP BY entity_id, funding_desc_key
        HAVING COUNT(*) >= 2
      ) d
      GROUP BY entity_id
    ),
    ab_grants AS (
      SELECT
        esl.entity_id,
        g.amount,
        UPPER(TRIM(COALESCE(g.program, ''))) AS program_key
      FROM general.entity_source_links esl
      JOIN ab.ab_grants g
        ON g.id = (esl.source_pk ->> 'id')::int
      WHERE esl.entity_id = ANY($1::int[])
        AND esl.source_schema = 'ab'
        AND esl.source_table = 'ab_grants'
    ),
    ab_grant_totals AS (
      SELECT entity_id, SUM(amount) AS ab_total_grants
      FROM ab_grants
      GROUP BY entity_id
    ),
    ab_program_dupes AS (
      SELECT entity_id, COUNT(*)::int AS duplicate_program_groups
      FROM (
        SELECT entity_id, program_key
        FROM ab_grants
        WHERE program_key <> ''
        GROUP BY entity_id, program_key
        HAVING COUNT(*) >= 2
      ) d
      GROUP BY entity_id
    ),
    ab_contract_rows AS (
      SELECT
        esl.entity_id,
        COALESCE(c.amount, 0) AS amount,
        COALESCE(c.ministry, 'UNKNOWN') AS ministry,
        'contract'::text AS source_type
      FROM general.entity_source_links esl
      JOIN ab.ab_contracts c
        ON c.id = (esl.source_pk ->> 'id')::uuid
      WHERE esl.entity_id = ANY($1::int[])
        AND esl.source_schema = 'ab'
        AND esl.source_table = 'ab_contracts'
      UNION ALL
      SELECT
        esl.entity_id,
        COALESCE(ss.amount, 0) AS amount,
        COALESCE(ss.ministry, 'UNKNOWN') AS ministry,
        'sole_source'::text AS source_type
      FROM general.entity_source_links esl
      JOIN ab.ab_sole_source ss
        ON ss.id = (esl.source_pk ->> 'id')::uuid
      WHERE esl.entity_id = ANY($1::int[])
        AND esl.source_schema = 'ab'
        AND esl.source_table = 'ab_sole_source'
    ),
    ab_contract_totals AS (
      SELECT
        entity_id,
        SUM(amount) FILTER (WHERE source_type = 'contract') AS ab_total_contracts,
        SUM(amount) FILTER (WHERE source_type = 'sole_source') AS ab_total_sole_source,
        COUNT(*) FILTER (WHERE source_type = 'sole_source')::int AS sole_source_count,
        SUM(amount) AS contract_like_total
      FROM ab_contract_rows
      GROUP BY entity_id
    ),
    ab_ministry_rollup AS (
      SELECT entity_id, ministry, SUM(amount) AS ministry_total
      FROM ab_contract_rows
      GROUP BY entity_id, ministry
    ),
    ab_concentration AS (
      SELECT
        mr.entity_id,
        MAX(mr.ministry_total) AS top_ministry_total
      FROM ab_ministry_rollup mr
      GROUP BY mr.entity_id
    )
    SELECT
      e.entity_id,
      COALESCE(ft.fed_total_grants, 0) AS fed_total_grants,
      COALESCE(agt.ab_total_grants, 0) AS ab_total_grants,
      COALESCE(act.ab_total_contracts, 0) AS ab_total_contracts,
      COALESCE(act.ab_total_sole_source, 0) AS ab_total_sole_source,
      COALESCE(fd.duplicate_funding_groups, 0) AS duplicate_funding_groups,
      COALESCE(apd.duplicate_program_groups, 0) AS duplicate_program_groups,
      COALESCE(act.sole_source_count, 0) AS sole_source_count,
      CASE
        WHEN COALESCE(act.contract_like_total, 0) > 0
        THEN ROUND(COALESCE(ac.top_ministry_total, 0) / act.contract_like_total * 100, 1)
        ELSE NULL
      END AS contract_top_ministry_share_pct
    FROM UNNEST($1::int[]) AS e(entity_id)
    LEFT JOIN fed_totals ft
      ON ft.entity_id = e.entity_id
    LEFT JOIN fed_dupes fd
      ON fd.entity_id = e.entity_id
    LEFT JOIN ab_grant_totals agt
      ON agt.entity_id = e.entity_id
    LEFT JOIN ab_program_dupes apd
      ON apd.entity_id = e.entity_id
    LEFT JOIN ab_contract_totals act
      ON act.entity_id = e.entity_id
    LEFT JOIN ab_concentration ac
      ON ac.entity_id = e.entity_id
  `, [entityIds]);

  return res.rows;
}

async function fetchDirectors(client, bnRoots) {
  const res = await client.query(`
    WITH latest_fpe AS (
      SELECT
        LEFT(bn, 9) AS bn_root,
        MAX(fpe) AS latest_fpe
      FROM cra.cra_directors
      WHERE LEFT(bn, 9) = ANY($1::text[])
      GROUP BY LEFT(bn, 9)
    )
    SELECT
      LEFT(d.bn, 9) AS bn_root,
      TRIM(CONCAT_WS(' ', COALESCE(d.first_name, ''), COALESCE(d.initials, ''), COALESCE(d.last_name, ''))) AS director_name,
      UPPER(
        REGEXP_REPLACE(
          TRIM(CONCAT_WS(' ', COALESCE(d.first_name, ''), COALESCE(d.initials, ''), COALESCE(d.last_name, ''))),
          '\\s+',
          ' ',
          'g'
        )
      ) AS director_key,
      d.position,
      d.at_arms_length
    FROM cra.cra_directors d
    JOIN latest_fpe lf
      ON lf.bn_root = LEFT(d.bn, 9)
     AND lf.latest_fpe = d.fpe
    WHERE LEFT(d.bn, 9) = ANY($1::text[])
      AND TRIM(CONCAT_WS(' ', COALESCE(d.first_name, ''), COALESCE(d.initials, ''), COALESCE(d.last_name, ''))) <> ''
  `, [bnRoots]);
  return res.rows;
}

async function fetchEdgeFlows(client, loopIds) {
  const hasYearFlows = await queryOneValue(client, `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'cra' AND table_name = 'loop_edge_year_flows'
    ) AS ok
  `);

  if (hasYearFlows.ok) {
    const res = await client.query(`
      SELECT loop_id, hop_idx, src, dst, year_flow, gift_count
      FROM cra.loop_edge_year_flows
      WHERE loop_id = ANY($1::int[])
      ORDER BY loop_id, hop_idx
    `, [loopIds]);
    return res.rows;
  }

  const res = await client.query(`
    WITH expanded AS (
      SELECT
        l.id AS loop_id,
        i AS hop_idx,
        l.path_bns[i] AS src,
        l.path_bns[CASE WHEN i = l.hops THEN 1 ELSE i + 1 END] AS dst
      FROM cra.loops l,
           GENERATE_SERIES(1, l.hops) AS i
      WHERE l.id = ANY($1::int[])
    )
    SELECT
      e.loop_id,
      e.hop_idx,
      e.src,
      e.dst,
      le.total_amt AS year_flow,
      le.edge_count AS gift_count
    FROM expanded e
    LEFT JOIN cra.loop_edges le
      ON le.src = e.src
     AND le.dst = e.dst
    ORDER BY e.loop_id, e.hop_idx
  `, [loopIds]);
  return res.rows;
}

function buildLookup(rows, keyField) {
  const map = new Map();
  for (const row of rows) {
    const key = row[keyField];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function computeSharedDirectorSignals(loopParticipants, directorsByRoot) {
  const directorOwners = new Map();

  for (const participant of loopParticipants) {
    const directors = directorsByRoot.get(participant.bn_root) || [];
    for (const director of directors) {
      if (!director.director_key) continue;
      if (!directorOwners.has(director.director_key)) {
        directorOwners.set(director.director_key, {
          director_name: director.director_name,
          bn_roots: new Set(),
        });
      }
      directorOwners.get(director.director_key).bn_roots.add(participant.bn_root);
    }
  }

  const overlaps = [];
  for (const value of directorOwners.values()) {
    if (value.bn_roots.size > 1) {
      overlaps.push({
        director_name: value.director_name,
        bn_roots: Array.from(value.bn_roots),
      });
    }
  }

  const overlapPairs = new Set();
  for (const overlap of overlaps) {
    const ordered = overlap.bn_roots.slice().sort();
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        overlapPairs.add(`${ordered[i]}::${ordered[j]}`);
      }
    }
  }

  return {
    sharedDirectors: overlaps,
    sharedDirectorCount: overlaps.length,
    sharedDirectorPairCount: overlapPairs.size,
  };
}

function scoreLoop(loop, participants, edges, directorSignal) {
  const govtDependencies = participants
    .map((p) => p.govt_dependency_pct)
    .filter((value) => value != null)
    .map((value) => Number(value));

  const maxGovtDependency = govtDependencies.length ? Math.max(...govtDependencies) : 0;
  const publicFundingChannels = new Set();
  let clusterGovtFunding = 0;
  let clusterFed = 0;
  let clusterAbGrants = 0;
  let clusterAbContracts = 0;
  let clusterAbSoleSource = 0;

  const signalBooleans = {
    in_loop: true,
    connected_entities: directorSignal.sharedDirectorPairCount > 0,
    inactive_after_funding: false,
    highly_government_funded: maxGovtDependency >= 50,
    repeated_or_duplicate_funding: false,
    contract_concentration: false,
  };

  for (const participant of participants) {
    if (toNumber(participant.govt_funding) > 0) publicFundingChannels.add('CRA government funding');
    if (toNumber(participant.fed_total_grants) > 0) publicFundingChannels.add('Federal grants');
    if (toNumber(participant.ab_total_grants) > 0) publicFundingChannels.add('Alberta grants');
    if (toNumber(participant.ab_total_contracts) > 0) publicFundingChannels.add('Alberta contracts');
    if (toNumber(participant.ab_total_sole_source) > 0) publicFundingChannels.add('Alberta sole-source');

    clusterGovtFunding += toNumber(participant.govt_funding);
    clusterFed += toNumber(participant.fed_total_grants);
    clusterAbGrants += toNumber(participant.ab_total_grants);
    clusterAbContracts += toNumber(participant.ab_total_contracts);
    clusterAbSoleSource += toNumber(participant.ab_total_sole_source);

    const hasPublicFunding = (
      toNumber(participant.govt_funding) > 0 ||
      toNumber(participant.fed_total_grants) > 0 ||
      toNumber(participant.ab_total_grants) > 0 ||
      toNumber(participant.ab_total_contracts) > 0 ||
      toNumber(participant.ab_total_sole_source) > 0
    );

    if (participant.has_inactive_status && hasPublicFunding) {
      signalBooleans.inactive_after_funding = true;
    }

    if (toNumber(participant.duplicate_funding_groups) > 0 || toNumber(participant.duplicate_program_groups) > 0) {
      signalBooleans.repeated_or_duplicate_funding = true;
    }

    const topShare = Number(participant.contract_top_ministry_share_pct || 0);
    if (toNumber(participant.sole_source_count) >= 2 || topShare >= 80) {
      signalBooleans.contract_concentration = true;
    }
  }

  const riskScore = Object.values(signalBooleans).filter(Boolean).length;
  const totalEdgeFlow = edges.reduce((sum, edge) => sum + toNumber(edge.year_flow), 0);
  const totalGiftCount = edges.reduce((sum, edge) => sum + toNumber(edge.gift_count), 0);
  const clusterTotalFunding = clusterGovtFunding + clusterFed + clusterAbGrants + clusterAbContracts + clusterAbSoleSource;

  const triggeredReasons = [];
  if (signalBooleans.connected_entities) triggeredReasons.push('entities are connected through shared directors');
  if (signalBooleans.inactive_after_funding) triggeredReasons.push('at least one linked entity is currently non-active after receiving public funding');
  if (signalBooleans.highly_government_funded) triggeredReasons.push(`at least one organization is highly government-funded (max ${pct(maxGovtDependency)})`);
  if (signalBooleans.repeated_or_duplicate_funding) triggeredReasons.push('repeated funding descriptions or duplicate program patterns appear');
  if (signalBooleans.contract_concentration) triggeredReasons.push('contract or sole-source concentration appears in linked Alberta procurement');

  const mainReason = triggeredReasons[0] || 'part of a circular funding loop';
  const explanation = triggeredReasons.length
    ? triggeredReasons.slice(0, 2).join('; ')
    : 'part of a circular funding loop';

  return {
    risk_score: riskScore,
    risk_label: riskScore >= 4 ? 'high risk' : riskScore >= 3 ? 'flagged' : 'watch',
    max_govt_dependency_pct: round(maxGovtDependency, 1),
    public_funding_channels: Array.from(publicFundingChannels),
    shared_director_count: directorSignal.sharedDirectorCount,
    shared_director_pair_count: directorSignal.sharedDirectorPairCount,
    shared_directors: directorSignal.sharedDirectors,
    fed_total_grants: round(clusterFed, 2),
    ab_total_grants: round(clusterAbGrants, 2),
    ab_total_contracts: round(clusterAbContracts, 2),
    ab_total_sole_source: round(clusterAbSoleSource, 2),
    cluster_govt_funding: round(clusterGovtFunding, 2),
    cluster_total_funding: round(clusterTotalFunding, 2),
    total_edge_gift_count: totalGiftCount,
    total_edge_flow: round(totalEdgeFlow, 2),
    signals: signalBooleans,
    main_reason: mainReason,
    explanation,
  };
}

function buildLoopObjects(loops, participantsByLoop, directorsByRoot, edgesByLoop) {
  return loops.map((loop) => {
    const participants = (participantsByLoop.get(loop.loop_id) || []).map((row) => ({
      ...row,
      dataset_sources: row.dataset_sources || [],
    }));
    const edges = (loop.precomputedEdges || edgesByLoop.get(loop.loop_id) || []).map((row) => ({ ...row }));
    const directorSignal = computeSharedDirectorSignals(participants, directorsByRoot);
    const score = scoreLoop(loop, participants, edges, directorSignal);

    return {
      loop_id: loop.loop_id,
      hops: loop.hops,
      min_year: loop.min_year,
      max_year: loop.max_year,
      same_year: loop.same_year,
      path_bns: loop.path_bns,
      path_display: loop.path_display,
      bottleneck_amt: round(loop.bottleneck_amt, 2),
      total_flow_amt: round(loop.total_flow_amt, 2),
      participants: participants.map((participant) => ({
        bn: participant.bn,
        bn_root: participant.bn_root,
        org_name: participant.org_name,
        legal_name: participant.legal_name,
        designation: participant.designation,
        category: participant.category,
        entity_id: participant.entity_id,
        dataset_sources: participant.dataset_sources,
        revenue: round(participant.revenue, 2),
        govt_funding: round(participant.govt_funding, 2),
        govt_dependency_pct: participant.govt_dependency_pct != null ? round(participant.govt_dependency_pct, 1) : null,
        fed_total_grants: round(participant.fed_total_grants, 2),
        ab_total_grants: round(participant.ab_total_grants, 2),
        ab_total_contracts: round(participant.ab_total_contracts, 2),
        ab_total_sole_source: round(participant.ab_total_sole_source, 2),
        duplicate_funding_groups: toNumber(participant.duplicate_funding_groups),
        duplicate_program_groups: toNumber(participant.duplicate_program_groups),
        sole_source_count: toNumber(participant.sole_source_count),
        contract_top_ministry_share_pct: participant.contract_top_ministry_share_pct != null ? round(participant.contract_top_ministry_share_pct, 1) : null,
        has_inactive_status: Boolean(participant.has_inactive_status),
        registry_statuses: participant.registry_statuses || null,
      })),
      edges: edges.map((edge) => ({
        hop_idx: edge.hop_idx,
        src: edge.src,
        dst: edge.dst,
        year_flow: round(edge.year_flow, 2),
        gift_count: toNumber(edge.gift_count),
      })),
      ...score,
    };
  });
}

function isTrueMultiOrgLoop(loop) {
  const roots = loop.participants
    .map((participant) => participant.bn_root)
    .filter(Boolean);
  if (!roots.length) return false;
  return new Set(roots).size === loop.hops;
}

function buildNarrativeInsight(loop) {
  const orgs = loop.participants.map((participant) => participant.org_name).slice(0, 3);
  return `We identified a cluster of organizations that exchanged funding, shared connections, received public funds, and showed extra risk signals around activity and concentration. Cluster #${loop.loop_id} links ${orgs.join(', ')} in a ${loop.hops}-hop loop with ${money(loop.total_edge_flow)} in circular flow and ${money(loop.cluster_total_funding)} in surrounding public-funding exposure. It scores ${loop.risk_score}/6 because ${loop.explanation}. These are screening indicators for human review, not determinations of wrongdoing.`;
}

function anonymizeLoopsForPublic(loops) {
  const aliasMap = new Map();
  let aliasCounter = 1;

  const toAlias = (key) => {
    if (!aliasMap.has(key)) {
      aliasMap.set(key, `ORG-${String(aliasCounter).padStart(5, '0')}`);
      aliasCounter += 1;
    }
    return aliasMap.get(key);
  };

  return loops.map((loop) => {
    const bnToAlias = new Map();
    const participants = loop.participants.map((participant) => {
      const stableKey = String(participant.entity_id || participant.bn_root || participant.bn || participant.org_name);
      const alias = toAlias(stableKey);
      bnToAlias.set(participant.bn, alias);
      return {
        ...participant,
        org_name: alias,
        legal_name: null,
        bn: null,
        bn_root: alias,
        registry_statuses: participant.registry_statuses ? 'redacted' : null,
      };
    });

    return {
      ...loop,
      participants,
      path_bns: participants.map((participant) => participant.org_name),
      path_display: participants.map((participant) => participant.org_name).join('→'),
      shared_directors: [],
      edges: loop.edges.map((edge) => ({
        ...edge,
        src: bnToAlias.get(edge.src) || 'ORG-UNKNOWN',
        dst: bnToAlias.get(edge.dst) || 'ORG-UNKNOWN',
        year_flow: moneyRange(edge.year_flow),
      })),
      total_edge_flow: moneyRange(loop.total_edge_flow),
      cluster_total_funding: moneyRange(loop.cluster_total_funding),
      cluster_govt_funding: moneyRange(loop.cluster_govt_funding),
      fed_total_grants: moneyRange(loop.fed_total_grants),
      ab_total_grants: moneyRange(loop.ab_total_grants),
      ab_total_contracts: moneyRange(loop.ab_total_contracts),
      ab_total_sole_source: moneyRange(loop.ab_total_sole_source),
    };
  });
}

function buildMarkdownReport(loops, insight) {
  const lines = [];
  lines.push('# Funding Loops');
  lines.push('');
  lines.push('## Core Insight');
  lines.push('');
  lines.push(insight);
  lines.push('');
  lines.push('## Ranked Clusters');
  lines.push('');
  lines.push('| Rank | Cluster ID | Organizations Involved | Total Funding | Risk Score | Status | Main Reason Flagged |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');

  loops.forEach((loop, index) => {
    lines.push([
      `| ${index + 1}`,
      `#${loop.loop_id}`,
      `${loop.participants.map((participant) => participant.org_name).join(' -> ')}`,
      `${money(loop.cluster_total_funding)}`,
      `${loop.risk_score}/6`,
      `${loop.risk_label}`,
      `${loop.main_reason} |`,
    ].join(' | '));
  });

  lines.push('');
  lines.push('## Cluster Detail');
  lines.push('');
  loops.slice(0, 10).forEach((loop) => {
    lines.push(`### Cluster #${loop.loop_id}`);
    lines.push('');
    lines.push(`- Organizations: ${loop.participants.map((participant) => participant.org_name).join(' -> ')}`);
    lines.push(`- Cluster type: ${loop.hops}-hop funding loop during ${loop.min_year ?? 'n/a'} to ${loop.max_year ?? 'n/a'}`);
    lines.push(`- Circular flow: ${money(loop.total_edge_flow)}; total surrounding funding: ${money(loop.cluster_total_funding)}`);
    lines.push(`- Risk score: ${loop.risk_score}/6 (${loop.risk_label})`);
    lines.push(`- Signals: loop=${loop.signals.in_loop ? 'yes' : 'no'}, connected=${loop.signals.connected_entities ? 'yes' : 'no'}, inactive-after-funding=${loop.signals.inactive_after_funding ? 'yes' : 'no'}, high-govt=${loop.signals.highly_government_funded ? 'yes' : 'no'}, repeated=${loop.signals.repeated_or_duplicate_funding ? 'yes' : 'no'}, concentration=${loop.signals.contract_concentration ? 'yes' : 'no'}`);
    lines.push(`- Main reason flagged: ${loop.main_reason}`);
    lines.push('');
  });

  return lines.join('\n');
}

function buildTableRows(loops) {
  return loops.map((loop, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>#${loop.loop_id}</td>
      <td>${escapeHtml(loop.participants.map((participant) => participant.org_name).join(' -> '))}</td>
      <td>${money(loop.cluster_total_funding)}</td>
      <td><strong>${loop.risk_score}/6</strong></td>
      <td>${escapeHtml(loop.risk_label)}</td>
      <td>${escapeHtml(loop.main_reason)}</td>
    </tr>
  `).join('');
}

function buildVisualizationData(loops) {
  const cells = [];
  const columns = 3;
  const cellWidth = 340;
  const cellHeight = 260;
  const radius = 68;

  loops.forEach((loop, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = 40 + col * cellWidth;
    const cellY = 60 + row * cellHeight;
    const centerX = cellX + 150;
    const centerY = cellY + 110;

    const nodes = loop.participants.map((participant, participantIndex) => {
      const angle = (-Math.PI / 2) + (2 * Math.PI * participantIndex / loop.participants.length);
      return {
        ...participant,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });

    const nodeByBn = new Map(nodes.map((node) => [node.bn, node]));
    const edges = loop.edges.map((edge) => ({
      ...edge,
      srcNode: nodeByBn.get(edge.src),
      dstNode: nodeByBn.get(edge.dst),
    })).filter((edge) => edge.srcNode && edge.dstNode);

    cells.push({
      loop,
      x: cellX,
      y: cellY,
      centerX,
      centerY,
      nodes,
      edges,
    });
  });

  return {
    width: 1140,
    height: Math.max(420, Math.ceil(loops.length / 3) * 260 + 40),
    cells,
  };
}

function renderNetworkSvg(loops) {
  const viz = buildVisualizationData(loops);
  const parts = [];

  parts.push(`<svg viewBox="0 0 ${viz.width} ${viz.height}" role="img" aria-label="Funding loops network">`);
  parts.push('<defs>');
  parts.push('<marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">');
  parts.push('<path d="M0,0 L10,3 L0,6 z" fill="#64748b"></path>');
  parts.push('</marker>');
  parts.push('</defs>');

  viz.cells.forEach((cell) => {
    const riskFill = cell.loop.risk_score >= 4 ? '#fee2e2' : cell.loop.risk_score >= 3 ? '#fef3c7' : '#dbeafe';
    parts.push(`<g transform="translate(0,0)">`);
    parts.push(`<rect x="${cell.x - 18}" y="${cell.y - 28}" width="300" height="210" rx="10" fill="${riskFill}" stroke="#cbd5e1"></rect>`);
    parts.push(`<text x="${cell.x}" y="${cell.y - 6}" font-size="15" font-weight="700" fill="#0f172a">Cluster #${cell.loop.loop_id}</text>`);
    parts.push(`<text x="${cell.x + 118}" y="${cell.y - 6}" font-size="13" fill="#334155">${cell.loop.risk_score}/6</text>`);

    cell.edges.forEach((edge) => {
      parts.push(`<line x1="${edge.srcNode.x}" y1="${edge.srcNode.y}" x2="${edge.dstNode.x}" y2="${edge.dstNode.y}" stroke="#64748b" stroke-width="2.5" marker-end="url(#arrow)"></line>`);
      const labelX = round((edge.srcNode.x + edge.dstNode.x) / 2, 0);
      const labelY = round((edge.srcNode.y + edge.dstNode.y) / 2, 0) - 6;
      parts.push(`<text x="${labelX}" y="${labelY}" font-size="11" text-anchor="middle" fill="#475569">${escapeHtml(money(edge.year_flow))}</text>`);
    });

    cell.nodes.forEach((node) => {
      const govHeavy = node.govt_dependency_pct != null && node.govt_dependency_pct >= 50;
      const soleSource = toNumber(node.sole_source_count) >= 2 || toNumber(node.ab_total_sole_source) > 0;
      const fill = soleSource ? '#fca5a5' : govHeavy ? '#fdba74' : '#93c5fd';
      parts.push(`<circle cx="${node.x}" cy="${node.y}" r="25" fill="${fill}" stroke="#1e293b" stroke-width="1.5"></circle>`);
      parts.push(`<text x="${node.x}" y="${node.y - 32}" text-anchor="middle" font-size="11" fill="#0f172a">${escapeHtml(node.org_name.slice(0, 30))}</text>`);
      parts.push(`<text x="${node.x}" y="${node.y + 4}" text-anchor="middle" font-size="10" fill="#0f172a">${escapeHtml(node.bn_root)}</text>`);
      parts.push(`<text x="${node.x}" y="${node.y + 17}" text-anchor="middle" font-size="9" fill="#334155">${escapeHtml(pct(node.govt_dependency_pct))}</text>`);
    });

    parts.push(`<text x="${cell.x}" y="${cell.y + 168}" font-size="11" fill="#475569">Why flagged: ${escapeHtml(cell.loop.main_reason)}</text>`);
    parts.push('</g>');
  });

  parts.push('</svg>');
  return parts.join('');
}

function buildHtmlReport(loops, insight) {
  const networkLoops = loops.slice(0, args.network);
  const tableRows = buildTableRows(loops);
  const networkSvg = renderNetworkSvg(networkLoops);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Funding Loops Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --surface: #ffffff;
      --ink: #0f172a;
      --muted: #475569;
      --line: #cbd5e1;
      --accent: #0f766e;
      --accent-soft: #ccfbf1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, #e0f2fe 0, transparent 30%),
        radial-gradient(circle at top right, #fef3c7 0, transparent 28%),
        var(--bg);
    }
    main {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 24px 48px;
    }
    h1, h2, p { margin-top: 0; }
    .band {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .kpi {
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: linear-gradient(180deg, #fff, #f8fafc);
    }
    .kpi strong {
      display: block;
      font-size: 28px;
      line-height: 1.1;
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
      border-top: 1px solid var(--line);
    }
    th {
      background: #f8fafc;
      border-top: 0;
      font-size: 12px;
      letter-spacing: 0;
      color: var(--muted);
    }
    .note {
      color: var(--muted);
      max-width: 90ch;
    }
    .insight {
      padding: 16px 18px;
      border-radius: 8px;
      background: var(--accent-soft);
      border-left: 4px solid var(--accent);
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
  </style>
</head>
<body>
  <main>
    <section class="band">
      <h1>Funding Loops</h1>
      <p class="note">One focused pipeline: detect simple CRA funding loops first, then enrich each cluster with connection, inactivity, government-dependency, repetition, and contract-concentration signals.</p>
      <div class="kpis">
        <div class="kpi"><strong>${loops.length}</strong>flagged clusters</div>
        <div class="kpi"><strong>${loops.filter((loop) => loop.hops === 2).length}</strong>2-hop loops</div>
        <div class="kpi"><strong>${loops.filter((loop) => loop.risk_score >= 4).length}</strong>high-risk clusters</div>
        <div class="kpi"><strong>${loops.filter((loop) => loop.signals.connected_entities).length}</strong>clusters with connected entities</div>
      </div>
    </section>

    <section class="band">
      <h2>Summary Insight</h2>
      <div class="insight">${escapeHtml(insight)}</div>
    </section>

    <section class="band">
      <h2>Network Visualization</h2>
      <p class="note">Nodes are organizations. Arrows are CRA charity-to-charity funding flows. Orange nodes are highly government-funded, red nodes show concentrated procurement or sole-source exposure, and pale red cluster cards are high risk.</p>
      ${networkSvg}
    </section>

    <section class="band">
      <h2>Ranked Table</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Cluster ID</th>
            <th>Organizations Involved</th>
            <th>Total Funding</th>
            <th>Risk Score</th>
            <th>Status</th>
            <th>Main Reason Flagged</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  ensureDir(REPORT_DIR);

  const client = await db.getClient();
  try {
    const useRecomputed = args.recomputeLoops;
    const materializedHopCap = Math.min(args.maxHops, MATERIALIZED_MAX_HOPS);
    const loops = useRecomputed
      ? await fetchComputedLoops(client)
      : await fetchCandidateLoops(client, materializedHopCap);
    if (!loops.length) {
      throw new Error('No loop records found in cra.loops. Run the CRA loop analysis first.');
    }

    const loopIds = loops.map((row) => row.loop_id);
    const bnRoots = [...new Set(
      loops.flatMap((loop) => (loop.path_bns || []).map((bn) => String(bn).slice(0, 9))).filter(Boolean)
    )];
    const participantProfiles = await fetchParticipantProfiles(client, bnRoots);
    const profileByRoot = new Map(participantProfiles.map((row) => [row.bn_root, row]));
    const participants = [];
    for (const loop of loops) {
      for (let index = 0; index < (loop.path_bns || []).length; index++) {
        const bn = String(loop.path_bns[index]);
        const bn_root = bn.slice(0, 9);
        const profile = profileByRoot.get(bn_root) || {};
        participants.push({
          loop_id: loop.loop_id,
          position_in_loop: index + 1,
          bn,
          bn_root,
          org_name: profile.org_name || bn_root,
          legal_name: profile.legal_name || null,
          designation: profile.designation || null,
          category: profile.category || null,
          entity_id: profile.entity_id || null,
          dataset_sources: profile.dataset_sources || [],
          revenue: profile.revenue || 0,
          govt_funding: profile.govt_funding || 0,
          expenditures: profile.expenditures || 0,
          govt_dependency_pct: profile.govt_dependency_pct || null,
          has_inactive_status: profile.has_inactive_status || false,
          registry_statuses: profile.registry_statuses || null,
        });
      }
    }
    const directors = bnRoots.length ? await fetchDirectors(client, bnRoots) : [];
    const edges = useRecomputed ? [] : await fetchEdgeFlows(client, loopIds);

    const participantsByLoop = buildLookup(participants, 'loop_id');
    const directorsByRoot = buildLookup(directors, 'bn_root');
    const edgesByLoop = buildLookup(edges, 'loop_id');
    const entityIds = [...new Set(participants.map((row) => row.entity_id).filter(Boolean))];
    const entitySignals = await fetchEntitySignals(client, entityIds);
    const entitySignalsById = new Map(entitySignals.map((row) => [row.entity_id, row]));

    for (const participant of participants) {
      const signalRow = participant.entity_id ? entitySignalsById.get(participant.entity_id) : null;
      participant.fed_total_grants = signalRow ? signalRow.fed_total_grants : 0;
      participant.ab_total_grants = signalRow ? signalRow.ab_total_grants : 0;
      participant.ab_total_contracts = signalRow ? signalRow.ab_total_contracts : 0;
      participant.ab_total_sole_source = signalRow ? signalRow.ab_total_sole_source : 0;
      participant.duplicate_funding_groups = signalRow ? signalRow.duplicate_funding_groups : 0;
      participant.duplicate_program_groups = signalRow ? signalRow.duplicate_program_groups : 0;
      participant.sole_source_count = signalRow ? signalRow.sole_source_count : 0;
      participant.contract_top_ministry_share_pct = signalRow ? signalRow.contract_top_ministry_share_pct : null;
    }

    const rankedLoops = buildLoopObjects(loops, participantsByLoop, directorsByRoot, edgesByLoop)
      .filter(isTrueMultiOrgLoop)
      .filter((loop) => loop.risk_score >= 3)
      .sort((a, b) => (
        b.risk_score - a.risk_score ||
        toNumber(b.cluster_total_funding) - toNumber(a.cluster_total_funding) ||
        toNumber(b.total_edge_flow) - toNumber(a.total_edge_flow) ||
        a.hops - b.hops ||
        a.loop_id - b.loop_id
      ))
      .slice(0, args.top);

    if (!rankedLoops.length) {
      throw new Error('Loop ranking returned no rows after enrichment.');
    }

    const finalLoops = args.publicReport ? anonymizeLoopsForPublic(rankedLoops) : rankedLoops;
    const insight = buildNarrativeInsight(finalLoops[0]);
    const methodologyMaxHops = useRecomputed ? args.maxHops : materializedHopCap;
    const payload = {
      generated_at: new Date().toISOString(),
      topic: 'Funding Loops',
      methodology: {
        base_signal: `CRA charity-to-charity loops (2-hop through ${methodologyMaxHops}-hop)`,
        supporting_signals: [
          'CRA government-funding dependency',
          'CRA shared directors',
          'general golden-record linkage',
          'FED grants',
          'AB grants, contracts, and sole-source',
          'AB non-profit registry status',
        ],
        public_report_mode: args.publicReport,
        loop_source: useRecomputed ? 'computed-from-cra.loop_edges' : 'cra.loops',
      },
      insight,
      loops: finalLoops,
    };

    const jsonPath = path.join(REPORT_DIR, 'funding-loops-report.json');
    const mdPath = path.join(REPORT_DIR, 'funding-loops-report.md');
    const htmlPath = path.join(REPORT_DIR, 'funding-loops-network.html');

    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    fs.writeFileSync(mdPath, buildMarkdownReport(finalLoops, insight));
    fs.writeFileSync(htmlPath, buildHtmlReport(finalLoops, insight));

    console.log(`Funding Loops report written:`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Markdown: ${mdPath}`);
    console.log(`  HTML: ${htmlPath}`);
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error(`Funding Loops analysis failed: ${error.message}`);
  process.exit(1);
});
