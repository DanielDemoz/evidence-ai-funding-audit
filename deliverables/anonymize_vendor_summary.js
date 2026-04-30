#!/usr/bin/env node
/**
 * Replace real organization and person names in deliverables/vendor_brief/data-summary.json
 * with category-style aliases (e.g. deaf org 001, university 002). Redacts BN fields.
 * Rebuilds funding-loops-vendor-report.md/html via build_vendor_brief.
 */
const fs = require("fs");
const path = require("path");
const { buildMarkdown, buildHtml } = require("./build_vendor_brief.js");

const OUT_DIR = path.join(__dirname, "vendor_brief");
const DATA_PATH = path.join(OUT_DIR, "data-summary.json");

function categoryLabel(orgName, legalName) {
  const s = `${orgName || ""} ${legalName || ""}`.toLowerCase();
  if (/deaf|blind|hard of hearing|hearing impaired/.test(s)) return "deaf org";
  if (/university|college|\bu of\b|université|polytechnic/.test(s)) return "university";
  if (/hospital|health centre|health center|healthcare|medical centre|medical center|clinic\b/.test(s))
    return "hospital org";
  if (/\bfoundation\b|\bfund\b/.test(s) && !/refund/.test(s)) return "foundation";
  if (/church|parish|synagogue|mosque|temple|ministry|faith|christian|gospel|diocese|baptist|anglican|catholic|lutheran|mennonite/.test(s))
    return "faith org";
  if (/housing|shelter|homeless|roof\b/.test(s)) return "housing org";
  if (/theatre|theater|arts\b|cultural|museum|heritage|exchange inc/.test(s)) return "arts org";
  if (/\bcamp\b|camping\b|summer camp/.test(s)) return "camp org";
  if (/children|kids|youth|school|education|student|learning/.test(s)) return "education org";
  if (/sport|recreation|athletic|hockey|arena|fitness/.test(s)) return "sport org";
  if (/holdings| incorporated|, inc\.|\bltd\.|corp\.|corporation/.test(s)) return "corporate org";
  return "organization";
}

function buildAliasFactory() {
  const counters = new Map();
  return function aliasForCategory(cat) {
    const n = (counters.get(cat) || 0) + 1;
    counters.set(cat, n);
    return `${cat} ${String(n).padStart(3, "0")}`;
  };
}

function collectBnMap(loopsArrays) {
  const nextAlias = buildAliasFactory();
  const bnToAlias = new Map();
  const keyOrder = [];

  for (const loops of loopsArrays) {
    if (!Array.isArray(loops)) continue;
    for (const loop of loops) {
      for (const p of loop.participants || []) {
        const bn = p.bn;
        if (!bn || bnToAlias.has(bn)) continue;
        const cat = categoryLabel(p.org_name, p.legal_name);
        bnToAlias.set(bn, nextAlias(cat));
        keyOrder.push(bn);
      }
    }
  }
  return { bnToAlias, keyOrder };
}

function redactDirectors(sharedDirectors) {
  if (!Array.isArray(sharedDirectors) || !sharedDirectors.length) return [];
  return sharedDirectors.map((row, i) => ({
    ...row,
    director_name: `Director ${String(i + 1).padStart(3, "0")}`,
  }));
}

function transformLoop(loop, bnToAlias) {
  const participants = (loop.participants || []).map((p) => {
    const bn = p.bn;
    const label = (bn && bnToAlias.get(bn)) || "organization 000";
    return {
      ...p,
      org_name: label,
      legal_name: null,
      bn: null,
      bn_root: null,
      entity_id: null,
    };
  });

  const rawPath = loop.path_bns || [];
  const path_bns = rawPath.map((x) => (bnToAlias.has(x) ? bnToAlias.get(x) : x));
  let path_display = loop.path_display;
  if (path_bns.length >= 2) {
    path_display = [...path_bns, path_bns[0]].join("→");
  } else if (path_bns.length === 1) {
    path_display = `${path_bns[0]}→${path_bns[0]}`;
  }

  const edges = (loop.edges || []).map((e) => ({
    ...e,
    src: bnToAlias.get(e.src) || e.src,
    dst: bnToAlias.get(e.dst) || e.dst,
  }));

  return {
    ...loop,
    participants,
    path_bns,
    path_display,
    edges,
    shared_directors: redactDirectors(loop.shared_directors),
  };
}

function buildInsightFromLoop(loop) {
  const orgs = (loop.participants || []).map((p) => p.org_name).filter(Boolean);
  const orgPhrase = orgs.length <= 3 ? orgs.join(", ") : `${orgs.slice(0, 2).join(", ")} and others`;
  return (
    `We identified a cluster of organizations that exchanged funding, shared connections, received public funds, and showed extra risk signals around activity and concentration. ` +
    `Cluster #${loop.loop_id} links ${orgPhrase} in a ${loop.hops}-hop loop with $${Number(loop.total_flow_amt || 0).toLocaleString("en-CA")} in circular flow and ` +
    `$${Number(loop.cluster_total_funding || 0).toLocaleString("en-CA")} in surrounding public-funding exposure. ` +
    `It scores ${loop.risk_score}/6 because ${loop.explanation || loop.main_reason || "multiple screening signals fired"}. ` +
    `Organization labels are anonymized for public viewing. These are screening indicators for human review, not determinations of wrongdoing.`
  );
}

function main() {
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  // Assign aliases in order of first appearance in the full loop list only (stable IDs).
  const { bnToAlias } = collectBnMap([raw.loops || []]);

  const transformArrays = (arr) =>
    Array.isArray(arr) ? arr.map((loop) => transformLoop(loop, bnToAlias)) : arr;

  raw.loops = transformArrays(raw.loops);
  raw.top5 = transformArrays(raw.top5);
  raw.top10 = transformArrays(raw.top10);

  raw.methodology = {
    ...(raw.methodology || {}),
    public_anonymized: true,
    anonymization: "Category-style labels (e.g. university 001, deaf org 002); BNs and director names redacted.",
  };

  const first = raw.loops && raw.loops[0];
  if (first) {
    raw.insight = buildInsightFromLoop(first);
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(raw, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "funding-loops-vendor-report.md"), buildMarkdown(raw));
  fs.writeFileSync(path.join(OUT_DIR, "funding-loops-vendor-report.html"), buildHtml(raw));
  console.log(`Anonymized ${bnToAlias.size} organizations in ${DATA_PATH}; vendor reports rebuilt.`);
}

main();
