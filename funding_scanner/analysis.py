from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import pandas as pd
from rapidfuzz import fuzz


ProgressFn = Callable[[int, str], None]


def normalize_column(name: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9]+", "_", str(name).strip().lower())
    name = re.sub(r"_+", "_", name).strip("_")
    return name


def normalize_name(value: str | None) -> str:
    if value is None:
        return ""
    text = str(value).upper().strip()
    text = re.sub(r"\b(THE|SOCIETY|FOUNDATION|INCORPORATED|INC|LTD|LIMITED)\b", " ", text)
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_text(value) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    text = str(value).strip()
    return text or None


def parse_money(value) -> float:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = re.sub(r"[^0-9.\-]", "", str(value))
    try:
        return float(text) if text else 0.0
    except ValueError:
        return 0.0


def parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return False
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "y", "sole", "sole_source"}


def parse_directors(value) -> list[str]:
    text = clean_text(value)
    if not text:
        return []
    parts = re.split(r"[;|,/]+", text)
    cleaned = []
    for part in parts:
        director = re.sub(r"\s+", " ", part).strip()
        if director:
            cleaned.append(director.upper())
    return cleaned


def looks_contract_like(row: pd.Series) -> bool:
    description = normalize_name(row.get("description"))
    has_contract_ref = clean_text(row.get("contract_ref")) is not None
    return bool(
        row.get("sole_source")
        or has_contract_ref
        or any(keyword in description for keyword in ["CONTRACT", "PROCUREMENT", "PLATFORM", "SERVICES", "VENDOR"])
    )


def looks_inactive(status: str | None) -> bool:
    if not status:
        return False
    text = status.lower()
    return any(word in text for word in ["inactive", "dissolved", "revoked", "cancelled", "ceased", "closed"])


def pick_first_column(columns: list[str], candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate in columns:
            return candidate
    return None


def detect_kind(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    payer = pick_first_column(cols, ["payer", "source", "funder", "donor", "from_org", "grantor", "payer_name"])
    recipient = pick_first_column(cols, ["recipient", "payee", "donee", "to_org", "recipient_name", "vendor"])
    amount = pick_first_column(cols, ["amount", "value", "grant_amount", "payment_amount", "agreement_value"])
    if payer and recipient and amount:
        return "transactions"
    return "organizations"


TRANSACTION_ALIASES = {
    "payer": ["payer", "source", "funder", "donor", "from_org", "grantor", "payer_name", "organization_from"],
    "recipient": ["recipient", "payee", "donee", "to_org", "recipient_name", "vendor", "organization_to"],
    "amount": ["amount", "value", "grant_amount", "payment_amount", "agreement_value", "total_funding"],
    "date": ["date", "payment_date", "transaction_date", "agreement_start_date", "funding_date"],
    "description": ["description", "agreement_title", "agreement_title_en", "program", "purpose", "contract_services", "service_description"],
    "ministry": ["ministry", "department", "owner_org_title", "government_body"],
    "sole_source": ["sole_source", "sole_source_flag", "non_competitive", "single_source"],
    "contract_ref": ["contract_id", "contract_number", "agreement_number", "ref_number", "reference_number"],
    "payer_directors": ["payer_directors", "from_directors", "source_directors"],
    "recipient_directors": ["recipient_directors", "to_directors", "board_members", "directors"],
    "payer_status": ["payer_status", "from_status", "source_status"],
    "recipient_status": ["recipient_status", "to_status", "status", "vendor_status"],
    "payer_revenue": ["payer_revenue", "source_revenue"],
    "recipient_revenue": ["recipient_revenue", "organization_revenue", "revenue"],
    "payer_government_funding": ["payer_government_funding", "source_government_funding"],
    "recipient_government_funding": ["recipient_government_funding", "government_funding", "public_funding"],
    "payer_govt_dependency_pct": ["payer_govt_dependency_pct", "source_govt_dependency_pct"],
    "recipient_govt_dependency_pct": ["recipient_govt_dependency_pct", "govt_dependency_pct", "government_funding_pct"],
}


ORG_ALIASES = {
    "org_name": ["organization", "org_name", "legal_name", "entity_name", "name"],
    "status": ["status", "org_status", "entity_status"],
    "directors": ["directors", "board_members", "shared_directors"],
    "revenue": ["revenue", "total_revenue"],
    "government_funding": ["government_funding", "public_funding"],
    "govt_dependency_pct": ["govt_dependency_pct", "government_funding_pct"],
}


@dataclass
class EntityProfile:
    entity_id: str
    canonical_name: str
    aliases: set[str] = field(default_factory=set)
    directors: set[str] = field(default_factory=set)
    statuses: set[str] = field(default_factory=set)
    revenues: list[float] = field(default_factory=list)
    government_funding: list[float] = field(default_factory=list)
    dependency_pcts: list[float] = field(default_factory=list)

    def add_record(self, name: str | None, status: str | None, directors: list[str], revenue: float, govt_funding: float, dependency_pct: float | None) -> None:
        if name:
            self.aliases.add(name)
        if status:
            self.statuses.add(status)
        self.directors.update(directors)
        if revenue > 0:
            self.revenues.append(revenue)
        if govt_funding > 0:
            self.government_funding.append(govt_funding)
        if dependency_pct is not None:
            self.dependency_pcts.append(dependency_pct)

    @property
    def revenue(self) -> float:
        return max(self.revenues) if self.revenues else 0.0

    @property
    def govt_funding(self) -> float:
        return max(self.government_funding) if self.government_funding else 0.0

    @property
    def dependency_pct(self) -> float | None:
        if self.dependency_pcts:
            return max(self.dependency_pcts)
        if self.revenue > 0 and self.govt_funding > 0:
            return round(self.govt_funding / self.revenue * 100, 1)
        return None

    @property
    def inactive(self) -> bool:
        return any(looks_inactive(status) for status in self.statuses)


def read_frame(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path)
    if suffix in {".jsonl", ".ndjson"}:
        return pd.read_json(path, lines=True)
    return pd.read_csv(path)


def normalize_frame(df: pd.DataFrame) -> pd.DataFrame:
    frame = df.copy()
    frame.columns = [normalize_column(col) for col in frame.columns]
    return frame


def standardize_transactions(frames: list[tuple[str, pd.DataFrame]]) -> pd.DataFrame:
    rows = []
    for source_name, frame in frames:
        cols = list(frame.columns)
        resolved = {key: pick_first_column(cols, aliases) for key, aliases in TRANSACTION_ALIASES.items()}
        for _, row in frame.iterrows():
            payer = clean_text(row.get(resolved["payer"])) if resolved["payer"] else None
            recipient = clean_text(row.get(resolved["recipient"])) if resolved["recipient"] else None
            if not payer or not recipient:
                continue
            amount = parse_money(row.get(resolved["amount"])) if resolved["amount"] else 0.0
            if amount <= 0:
                continue
            rows.append({
                "source_file": source_name,
                "payer_name": payer,
                "recipient_name": recipient,
                "amount": amount,
                "date": clean_text(row.get(resolved["date"])) if resolved["date"] else None,
                "description": clean_text(row.get(resolved["description"])) if resolved["description"] else None,
                "ministry": clean_text(row.get(resolved["ministry"])) if resolved["ministry"] else None,
                "sole_source": parse_bool(row.get(resolved["sole_source"])) if resolved["sole_source"] else False,
                "contract_ref": clean_text(row.get(resolved["contract_ref"])) if resolved["contract_ref"] else None,
                "payer_directors": parse_directors(row.get(resolved["payer_directors"])) if resolved["payer_directors"] else [],
                "recipient_directors": parse_directors(row.get(resolved["recipient_directors"])) if resolved["recipient_directors"] else [],
                "payer_status": clean_text(row.get(resolved["payer_status"])) if resolved["payer_status"] else None,
                "recipient_status": clean_text(row.get(resolved["recipient_status"])) if resolved["recipient_status"] else None,
                "payer_revenue": parse_money(row.get(resolved["payer_revenue"])) if resolved["payer_revenue"] else 0.0,
                "recipient_revenue": parse_money(row.get(resolved["recipient_revenue"])) if resolved["recipient_revenue"] else 0.0,
                "payer_government_funding": parse_money(row.get(resolved["payer_government_funding"])) if resolved["payer_government_funding"] else 0.0,
                "recipient_government_funding": parse_money(row.get(resolved["recipient_government_funding"])) if resolved["recipient_government_funding"] else 0.0,
                "payer_govt_dependency_pct": parse_money(row.get(resolved["payer_govt_dependency_pct"])) if resolved["payer_govt_dependency_pct"] else None,
                "recipient_govt_dependency_pct": parse_money(row.get(resolved["recipient_govt_dependency_pct"])) if resolved["recipient_govt_dependency_pct"] else None,
            })
    return pd.DataFrame(rows)


def standardize_org_records(frames: list[tuple[str, pd.DataFrame]], transactions: pd.DataFrame) -> list[dict]:
    records: list[dict] = []

    for _, frame in frames:
        cols = list(frame.columns)
        resolved = {key: pick_first_column(cols, aliases) for key, aliases in ORG_ALIASES.items()}
        if not resolved["org_name"]:
            continue
        for _, row in frame.iterrows():
            name = clean_text(row.get(resolved["org_name"]))
            if not name:
                continue
            revenue = parse_money(row.get(resolved["revenue"])) if resolved["revenue"] else 0.0
            govt_funding = parse_money(row.get(resolved["government_funding"])) if resolved["government_funding"] else 0.0
            dependency = parse_money(row.get(resolved["govt_dependency_pct"])) if resolved["govt_dependency_pct"] else None
            records.append({
                "name": name,
                "status": clean_text(row.get(resolved["status"])) if resolved["status"] else None,
                "directors": parse_directors(row.get(resolved["directors"])) if resolved["directors"] else [],
                "revenue": revenue,
                "government_funding": govt_funding,
                "govt_dependency_pct": dependency,
            })

    for _, row in transactions.iterrows():
        records.append({
            "name": row["payer_name"],
            "status": row["payer_status"],
            "directors": row["payer_directors"],
            "revenue": row["payer_revenue"],
            "government_funding": row["payer_government_funding"],
            "govt_dependency_pct": row["payer_govt_dependency_pct"],
        })
        records.append({
            "name": row["recipient_name"],
            "status": row["recipient_status"],
            "directors": row["recipient_directors"],
            "revenue": row["recipient_revenue"],
            "government_funding": row["recipient_government_funding"],
            "govt_dependency_pct": row["recipient_govt_dependency_pct"],
        })

    return records


def resolve_entities(names: list[str]) -> tuple[dict[str, str], list[dict], dict[str, str]]:
    mapping: dict[str, str] = {}
    duplicate_matches: list[dict] = []
    entity_names: dict[str, str] = {}
    ordered_names = sorted({name for name in names if clean_text(name)}, key=lambda item: (-len(item), item))

    counter = 1
    for name in ordered_names:
        if name in mapping:
            continue
        normalized = normalize_name(name)
        matched_entity = None
        best_score = 0
        for entity_id, canonical_name in entity_names.items():
            score = fuzz.token_set_ratio(normalized, normalize_name(canonical_name))
            if score > best_score:
                best_score = score
                matched_entity = entity_id
        if matched_entity and best_score >= 93:
            mapping[name] = matched_entity
            duplicate_matches.append({
                "canonical_name": entity_names[matched_entity],
                "matched_name": name,
                "score": round(best_score, 1),
            })
        else:
            entity_id = f"ORG-{counter:04d}"
            counter += 1
            mapping[name] = entity_id
            entity_names[entity_id] = name

    return mapping, duplicate_matches, entity_names


def build_profiles(org_records: list[dict], mapping: dict[str, str], entity_names: dict[str, str]) -> dict[str, EntityProfile]:
    profiles: dict[str, EntityProfile] = {
        entity_id: EntityProfile(entity_id=entity_id, canonical_name=name)
        for entity_id, name in entity_names.items()
    }
    for record in org_records:
        entity_id = mapping.get(record["name"])
        if not entity_id:
            continue
        profiles[entity_id].add_record(
            name=record["name"],
            status=record.get("status"),
            directors=record.get("directors", []),
            revenue=float(record.get("revenue", 0.0) or 0.0),
            govt_funding=float(record.get("government_funding", 0.0) or 0.0),
            dependency_pct=record.get("govt_dependency_pct"),
        )
    return profiles


def normalize_cycle(nodes: list[str]) -> tuple[str, ...]:
    seq = nodes[:]
    rotations = [tuple(seq[i:] + seq[:i]) for i in range(len(seq))]
    reversed_seq = list(reversed(seq))
    reverse_rotations = [tuple(reversed_seq[i:] + reversed_seq[:i]) for i in range(len(reversed_seq))]
    return min(rotations + reverse_rotations)


def detect_loops(edge_map: dict[tuple[str, str], dict], adjacency: dict[str, set[str]]) -> list[dict]:
    loops: list[dict] = []
    seen: set[tuple[str, ...]] = set()

    for a, neighbors in adjacency.items():
        for b in neighbors:
            if a == b:
                continue
            if a in adjacency.get(b, set()):
                cycle = normalize_cycle([a, b])
                if cycle not in seen:
                    seen.add(cycle)
                    loops.append({"members": [a, b], "hops": 2})

            for c in adjacency.get(b, set()):
                if len({a, b, c}) < 3:
                    continue
                if a in adjacency.get(c, set()):
                    cycle = normalize_cycle([a, b, c])
                    if cycle not in seen:
                        seen.add(cycle)
                        loops.append({"members": [a, b, c], "hops": 3})
    return loops


def build_edge_map(transactions: pd.DataFrame) -> tuple[dict[tuple[str, str], dict], dict[str, set[str]]]:
    edge_map: dict[tuple[str, str], dict] = {}
    adjacency: dict[str, set[str]] = defaultdict(set)
    for _, row in transactions.iterrows():
        key = (row["payer_id"], row["recipient_id"])
        if key not in edge_map:
            edge_map[key] = {
                "amount": 0.0,
                "count": 0,
                "descriptions": [],
                "ministries": [],
                "sole_source_count": 0,
            }
        edge_map[key]["amount"] += float(row["amount"])
        edge_map[key]["count"] += 1
        if row.get("description"):
            edge_map[key]["descriptions"].append(str(row["description"]))
        if row.get("ministry"):
            edge_map[key]["ministries"].append(str(row["ministry"]))
        if bool(row.get("sole_source")):
            edge_map[key]["sole_source_count"] += 1
        adjacency[row["payer_id"]].add(row["recipient_id"])
    return edge_map, adjacency


def summarize_loop(loop: dict, edge_map: dict, profiles: dict[str, EntityProfile], transactions: pd.DataFrame) -> dict:
    members = loop["members"]
    member_set = set(members)

    edges = []
    circular_flow = 0.0
    repeated_funding = False
    for index, src in enumerate(members):
        dst = members[(index + 1) % len(members)]
        edge = edge_map[(src, dst)]
        desc_counts = Counter(normalize_name(desc) for desc in edge["descriptions"] if clean_text(desc))
        if any(count >= 2 for count in desc_counts.values()):
            repeated_funding = True
        if edge["count"] >= 3:
            repeated_funding = True
        circular_flow += edge["amount"]
        edges.append({
            "source": src,
            "target": dst,
            "amount": round(edge["amount"], 2),
            "count": edge["count"],
        })

    cluster_transactions = transactions[
        transactions["payer_id"].isin(member_set) | transactions["recipient_id"].isin(member_set)
    ].copy()
    total_funding = round(float(cluster_transactions["amount"].sum()), 2)

    shared_directors = []
    for i, left in enumerate(members):
        for right in members[i + 1:]:
            overlap = profiles[left].directors & profiles[right].directors
            if overlap:
                shared_directors.extend(sorted(overlap))
    shared_directors = sorted(set(shared_directors))

    inactive_after_funding = any(profiles[entity_id].inactive for entity_id in members) and total_funding > 0
    dependency_values = [profiles[entity_id].dependency_pct for entity_id in members if profiles[entity_id].dependency_pct is not None]
    max_dependency = max(dependency_values) if dependency_values else None
    highly_government_funded = bool(max_dependency is not None and max_dependency >= 50)

    ministry_amounts: Counter[str] = Counter()
    sole_source_count = 0
    contract_like_rows = 0
    for _, row in cluster_transactions.iterrows():
        if looks_contract_like(row):
            contract_like_rows += 1
        if row.get("ministry") and looks_contract_like(row):
            ministry_amounts[str(row["ministry"])] += float(row["amount"])
        if bool(row.get("sole_source")):
            sole_source_count += 1
    contract_concentration = False
    if contract_like_rows >= 2 and total_funding > 0 and ministry_amounts:
        top_share = max(ministry_amounts.values()) / total_funding
        contract_concentration = top_share >= 0.8
    if sole_source_count > 0:
        contract_concentration = True

    signals = {
        "in_loop": True,
        "connected_entities": bool(shared_directors),
        "inactive_after_funding": inactive_after_funding,
        "highly_government_funded": highly_government_funded,
        "repeated_or_duplicate_funding": repeated_funding,
        "contract_concentration": contract_concentration,
    }
    risk_score = sum(1 for value in signals.values() if value)
    risk_level = "high risk" if risk_score >= 4 else "flagged" if risk_score >= 3 else "watch"

    reasons = []
    if signals["connected_entities"]:
        reasons.append("shared director connections")
    if signals["inactive_after_funding"]:
        reasons.append("inactive status after funding")
    if signals["highly_government_funded"]:
        reasons.append("high government-funding dependency")
    if signals["repeated_or_duplicate_funding"]:
        reasons.append("repeated funding descriptions")
    if signals["contract_concentration"]:
        reasons.append("contract or sole-source concentration")

    organizations = [{
        "entity_id": entity_id,
        "name": profiles[entity_id].canonical_name,
        "aliases": sorted(profiles[entity_id].aliases),
        "status": sorted(profiles[entity_id].statuses),
        "directors": sorted(profiles[entity_id].directors),
        "revenue": round(profiles[entity_id].revenue, 2),
        "government_funding": round(profiles[entity_id].govt_funding, 2),
        "govt_dependency_pct": profiles[entity_id].dependency_pct,
    } for entity_id in members]

    return {
        "cluster_id": f"CL-{len(members)}-{abs(hash(tuple(members))) % 10000:04d}",
        "hops": loop["hops"],
        "organization_ids": members,
        "organizations": organizations,
        "edges": edges,
        "circular_flow": round(circular_flow, 2),
        "total_funding": total_funding,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "signals": signals,
        "main_reason": reasons[0] if reasons else "circular funding loop",
        "reasons": reasons,
        "shared_directors": shared_directors,
        "max_govt_dependency_pct": max_dependency,
    }


def build_top_entities(clusters: list[dict]) -> list[dict]:
    summaries: dict[str, dict] = {}
    for cluster in clusters:
        for org in cluster["organizations"]:
            entity = summaries.setdefault(org["entity_id"], {
                "entity_id": org["entity_id"],
                "name": org["name"],
                "risk_score": 0,
                "clusters": 0,
                "total_funding": 0.0,
                "reasons": Counter(),
            })
            entity["risk_score"] = max(entity["risk_score"], cluster["risk_score"])
            entity["clusters"] += 1
            entity["total_funding"] += cluster["total_funding"]
            entity["reasons"].update(cluster["reasons"])

    rows = []
    for summary in summaries.values():
        rows.append({
            "entity_id": summary["entity_id"],
            "name": summary["name"],
            "risk_score": summary["risk_score"],
            "clusters": summary["clusters"],
            "total_funding": round(summary["total_funding"], 2),
            "top_reason": summary["reasons"].most_common(1)[0][0] if summary["reasons"] else "circular funding loop",
        })
    rows.sort(key=lambda row: (-row["risk_score"], -row["total_funding"], row["name"]))
    return rows[:10]


def build_overall_summary(clusters: list[dict], top_entities: list[dict], duplicates: list[dict]) -> dict:
    flagged = [cluster for cluster in clusters if cluster["risk_score"] >= 3]
    high_risk = [cluster for cluster in clusters if cluster["risk_score"] >= 4]
    shared_conflicts = sum(1 for cluster in clusters if cluster["signals"]["connected_entities"])
    funding_exposure = round(sum(cluster["total_funding"] for cluster in clusters), 2)
    insight = (
        f"We identified {len(flagged)} flagged funding clusters, including {len(high_risk)} high-risk loops. "
        f"The clearest pattern is money circulating between connected organizations while public-funding dependence, "
        f"duplicate funding descriptions, or weak activity signals stack on top of the loop itself."
    )
    return {
        "total_organizations": len({org["entity_id"] for cluster in clusters for org in cluster["organizations"]}),
        "loops_found": len(clusters),
        "high_risk_loops": len(high_risk),
        "shared_director_conflicts": shared_conflicts,
        "government_funding_exposure": funding_exposure,
        "duplicate_matches": len(duplicates),
        "insight": insight,
        "top_entity_headline": top_entities[0]["name"] if top_entities else None,
    }


def analyze_uploads(file_paths: list[Path], progress: ProgressFn) -> dict:
    progress(10, "Loading uploaded files...")
    frames: list[tuple[str, pd.DataFrame]] = []
    for path in file_paths:
        frame = normalize_frame(read_frame(path))
        frames.append((path.name, frame))

    progress(25, "Cleaning records and inferring dataset shapes...")
    transaction_frames = [(name, frame) for name, frame in frames if detect_kind(frame) == "transactions"]
    org_frames = [(name, frame) for name, frame in frames if detect_kind(frame) == "organizations"]
    transactions = standardize_transactions(transaction_frames)
    if transactions.empty:
        raise ValueError("No transaction-style rows were found. Upload a file with payer, recipient, and amount columns.")

    progress(40, "Matching organizations and consolidating duplicates...")
    org_records = standardize_org_records(org_frames, transactions)
    names = [record["name"] for record in org_records] + transactions["payer_name"].tolist() + transactions["recipient_name"].tolist()
    mapping, duplicate_matches, entity_names = resolve_entities(names)

    transactions["payer_id"] = transactions["payer_name"].map(mapping)
    transactions["recipient_id"] = transactions["recipient_name"].map(mapping)
    transactions = transactions[
        transactions["payer_id"].notna() &
        transactions["recipient_id"].notna() &
        (transactions["payer_id"] != transactions["recipient_id"])
    ].copy()

    profiles = build_profiles(org_records, mapping, entity_names)

    progress(58, "Detecting funding loops...")
    edge_map, adjacency = build_edge_map(transactions)
    loops = detect_loops(edge_map, adjacency)

    progress(72, "Calculating risk scores and supporting signals...")
    cluster_rows = [summarize_loop(loop, edge_map, profiles, transactions) for loop in loops]
    cluster_rows = [row for row in cluster_rows if row["risk_score"] >= 3]
    cluster_rows.sort(key=lambda row: (-row["risk_score"], -row["total_funding"], -row["circular_flow"]))

    progress(88, "Generating plain-language summary...")
    top_entities = build_top_entities(cluster_rows)
    summary = build_overall_summary(cluster_rows, top_entities, duplicate_matches)

    progress(100, "Analysis complete.")
    return {
        "summary": summary,
        "clusters": cluster_rows,
        "duplicate_matches": duplicate_matches[:25],
        "top_entities": top_entities,
        "network": cluster_rows[:12],
        "ingested_files": [path.name for path in file_paths],
        "row_count": int(len(transactions)),
    }
