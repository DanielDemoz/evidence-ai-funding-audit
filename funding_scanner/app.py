from __future__ import annotations

import json
import os
import subprocess
import shutil
import urllib.parse
import urllib.request
import uuid
from collections import Counter
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from analysis import analyze_uploads


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
SAMPLE_DIR = BASE_DIR / "sample_data"
JOB_DIR = BASE_DIR / "_job_files"
GENERAL_DIR = BASE_DIR.parent / "general"
REAL_REPORT_PATH = GENERAL_DIR / "data" / "reports" / "funding-loops-report.json"
REAL_DB_CONNECTION_STRING = os.getenv("FUNDING_LOOPS_DB_URL") or os.getenv("DB_CONNECTION_STRING")
JOB_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Public Funding Risk Scanner")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

JOBS: dict[str, dict] = {}


class LinkImportRequest(BaseModel):
    url: str


class HackathonDatasetRequest(BaseModel):
    refresh: bool = False


def update_job(job_id: str, **updates) -> None:
    if job_id not in JOBS:
        return
    JOBS[job_id].update(updates)


def create_job_workspace(prefix: str) -> Path:
    folder = JOB_DIR / f"{prefix}-{uuid.uuid4()}"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def normalize_remote_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http and https links are supported")

    if parsed.netloc == "github.com":
        parts = parsed.path.strip("/").split("/")
        if len(parts) >= 5 and parts[2] == "blob":
            owner, repo, _, branch = parts[:4]
            remainder = "/".join(parts[4:])
            return f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{remainder}"
    return url


def infer_suffix_from_url(url: str) -> str:
    path = urllib.parse.urlparse(url).path.lower()
    for suffix in [".csv", ".xlsx", ".xls", ".jsonl", ".ndjson"]:
        if path.endswith(suffix):
            return suffix
    raise HTTPException(status_code=400, detail="Link must point to a CSV, Excel, or JSONL file")


def download_remote_file(url: str, workspace: Path) -> Path:
    normalized = normalize_remote_url(url)
    suffix = infer_suffix_from_url(normalized)
    target = workspace / f"{uuid.uuid4()}{suffix}"
    req = urllib.request.Request(normalized, headers={"User-Agent": "FundingScanner/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response, target.open("wb") as handle:
            shutil.copyfileobj(response, handle)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not download file link: {exc}") from exc
    return target


def run_analysis_job(job_id: str, file_paths: list[Path]) -> None:
    try:
        update_job(job_id, status="running", progress=5, message="Uploading...")

        def progress(percent: int, message: str) -> None:
            update_job(job_id, status="running", progress=percent, message=message)

        result = analyze_uploads(file_paths, progress)
        update_job(job_id, status="completed", progress=100, message="Done", result=result)
    except Exception as exc:
        update_job(job_id, status="failed", message=str(exc))
    finally:
        for path in file_paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass


def build_real_top_entities(loops: list[dict]) -> list[dict]:
    entities: dict[str, dict] = {}
    for loop in loops:
        total_funding = float(loop.get("cluster_total_funding", 0) or 0)
        main_reason = loop.get("main_reason") or "circular funding loop"
        for participant in loop.get("participants", []):
            key = str(participant.get("entity_id") or participant.get("bn_root") or participant.get("bn"))
            if not key:
                continue
            row = entities.setdefault(key, {
                "entity_id": key,
                "name": participant.get("org_name") or participant.get("legal_name") or key,
                "risk_score": 0,
                "clusters": 0,
                "total_funding": 0.0,
                "reasons": Counter(),
            })
            row["risk_score"] = max(row["risk_score"], int(loop.get("risk_score", 0) or 0))
            row["clusters"] += 1
            row["total_funding"] += total_funding
            row["reasons"][main_reason] += 1

    top_entities = [{
        "entity_id": row["entity_id"],
        "name": row["name"],
        "risk_score": row["risk_score"],
        "clusters": row["clusters"],
        "total_funding": round(row["total_funding"], 2),
        "top_reason": row["reasons"].most_common(1)[0][0] if row["reasons"] else "circular funding loop",
    } for row in entities.values()]
    top_entities.sort(key=lambda row: (-row["risk_score"], -row["total_funding"], row["name"]))
    return top_entities[:10]


def build_real_repetition_rows(loops: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for loop in loops:
        for participant in loop.get("participants", []):
            duplicate_groups = int(participant.get("duplicate_funding_groups", 0) or 0) + int(participant.get("duplicate_program_groups", 0) or 0)
            if duplicate_groups <= 0:
                continue
            rows.append({
                "label": participant.get("org_name") or participant.get("legal_name") or participant.get("bn_root"),
                "value": duplicate_groups,
                "detail": f"Cluster #{loop.get('loop_id')} repeated funding/program groups",
            })
    rows.sort(key=lambda row: (-row["value"], row["label"]))
    return rows[:25]


def convert_real_report(report: dict) -> dict:
    loops = report.get("loops", [])
    total_organizations = len({
        str(participant.get("entity_id") or participant.get("bn_root") or participant.get("bn"))
        for loop in loops
        for participant in loop.get("participants", [])
        if participant.get("entity_id") or participant.get("bn_root") or participant.get("bn")
    })
    government_funding_exposure = round(sum(float(loop.get("cluster_total_funding", 0) or 0) for loop in loops), 2)
    clusters = []

    for loop in loops:
        organizations = []
        bn_to_org_id: dict[str, str] = {}
        for participant in loop.get("participants", []):
            org_id = str(participant.get("bn_root") or participant.get("entity_id") or participant.get("bn"))
            if participant.get("bn"):
                bn_to_org_id[str(participant["bn"])] = org_id
            organizations.append({
                "entity_id": org_id,
                "name": participant.get("org_name") or participant.get("legal_name") or org_id,
                "aliases": [],
                "status": [participant.get("registry_statuses")] if participant.get("registry_statuses") else [],
                "directors": [item.get("director_name") for item in loop.get("shared_directors", []) if org_id in item.get("bn_roots", [])],
                "revenue": round(float(participant.get("revenue", 0) or 0), 2),
                "government_funding": round(float(participant.get("govt_funding", 0) or 0), 2),
                "govt_dependency_pct": participant.get("govt_dependency_pct"),
            })

        edges = []
        for edge in loop.get("edges", []):
            source_id = bn_to_org_id.get(str(edge.get("src")), str(edge.get("src", ""))[:9])
            target_id = bn_to_org_id.get(str(edge.get("dst")), str(edge.get("dst", ""))[:9])
            edges.append({
                "source": source_id,
                "target": target_id,
                "amount": round(float(edge.get("year_flow", 0) or 0), 2),
                "count": int(edge.get("gift_count", 0) or 0),
            })

        clusters.append({
            "cluster_id": f"#{loop.get('loop_id')}",
            "hops": int(loop.get("hops", 0) or 0),
            "organization_ids": [org["entity_id"] for org in organizations],
            "organizations": organizations,
            "edges": edges,
            "circular_flow": round(float(loop.get("total_edge_flow", loop.get("total_flow_amt", 0)) or 0), 2),
            "total_funding": round(float(loop.get("cluster_total_funding", 0) or 0), 2),
            "risk_score": int(loop.get("risk_score", 0) or 0),
            "risk_level": loop.get("risk_label") or "watch",
            "signals": loop.get("signals") or {},
            "main_reason": loop.get("main_reason") or "circular funding loop",
            "reasons": [loop.get("main_reason")] if loop.get("main_reason") else [],
            "shared_directors": [item.get("director_name") for item in loop.get("shared_directors", [])],
            "max_govt_dependency_pct": loop.get("max_govt_dependency_pct"),
        })

    top_entities = build_real_top_entities(loops)
    repetition_rows = build_real_repetition_rows(loops)

    return {
        "summary": {
            "total_organizations": total_organizations,
            "loops_found": len(loops),
            "high_risk_loops": sum(1 for loop in loops if int(loop.get("risk_score", 0) or 0) >= 4),
            "shared_director_conflicts": sum(1 for loop in loops if loop.get("signals", {}).get("connected_entities")),
            "government_funding_exposure": government_funding_exposure,
            "duplicate_matches": len(repetition_rows),
            "duplicate_matches_label": "Repeated Funding Signals",
            "insight": report.get("insight") or "Funding loops report loaded from the hackathon dataset.",
            "top_entity_headline": top_entities[0]["name"] if top_entities else None,
            "source_label": "Live hackathon dataset (CRA + FED + AB + general)",
        },
        "clusters": clusters,
        "duplicate_matches": repetition_rows,
        "top_entities": top_entities,
        "network": clusters[:12],
        "ingested_files": ["hackathon_postgres_dataset"],
        "row_count": len(loops),
    }


def load_real_report() -> dict:
    if not REAL_REPORT_PATH.exists():
        raise FileNotFoundError(f"Real-data report not found at {REAL_REPORT_PATH}")
    with REAL_REPORT_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def refresh_real_report() -> None:
    command = [
        "node",
        "scripts/advanced/11-funding-loops.js",
        "--top",
        "25",
        "--network",
        "12",
        "--max-hops",
        "3",
    ]
    env = os.environ.copy()
    if REAL_DB_CONNECTION_STRING:
        env["DB_CONNECTION_STRING"] = REAL_DB_CONNECTION_STRING
    elif not (GENERAL_DIR / ".env.public").exists() and not (GENERAL_DIR / ".env").exists():
        raise RuntimeError(
            "No hackathon database connection is configured. Set FUNDING_LOOPS_DB_URL or DB_CONNECTION_STRING to refresh."
        )

    completed = subprocess.run(
        command,
        cwd=GENERAL_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=300,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip() or completed.stdout.strip() or "Unknown failure"
        raise RuntimeError(f"Funding Loops refresh failed: {stderr}")


def run_hackathon_dataset_job(job_id: str, refresh: bool = False) -> None:
    try:
        update_job(job_id, status="running", progress=5, message="Loading hackathon dataset...")
        if refresh or not REAL_REPORT_PATH.exists():
            update_job(job_id, status="running", progress=28, message="Refreshing Funding Loops from the live PostgreSQL dataset...")
            refresh_real_report()

        update_job(job_id, status="running", progress=72, message="Transforming CRA, FED, AB, and golden-record loop results...")
        result = convert_real_report(load_real_report())
        update_job(job_id, status="completed", progress=100, message="Done", result=result)
    except Exception as exc:
        update_job(job_id, status="failed", message=str(exc))


@app.get("/")
def root() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/api/upload")
async def upload_files(background_tasks: BackgroundTasks, files: list[UploadFile] = File(...)) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    job_id = str(uuid.uuid4())
    temp_dir = create_job_workspace("upload")
    file_paths: list[Path] = []
    for uploaded in files:
        suffix = Path(uploaded.filename or "upload.csv").suffix or ".csv"
        target = temp_dir / f"{uuid.uuid4()}{suffix}"
        with target.open("wb") as handle:
            shutil.copyfileobj(uploaded.file, handle)
        file_paths.append(target)

    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "message": "Queued",
        "result": None,
    }
    background_tasks.add_task(run_analysis_job, job_id, file_paths)
    return {"job_id": job_id}


@app.post("/api/demo")
def run_demo(background_tasks: BackgroundTasks) -> dict:
    demo_files = list(SAMPLE_DIR.glob("*"))
    if not demo_files:
        raise HTTPException(status_code=500, detail="Demo data is missing")
    job_id = str(uuid.uuid4())
    temp_dir = create_job_workspace("demo")
    copied_paths = []
    for source in demo_files:
        target = temp_dir / source.name
        shutil.copy2(source, target)
        copied_paths.append(target)
    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "message": "Queued",
        "result": None,
    }
    background_tasks.add_task(run_analysis_job, job_id, copied_paths)
    return {"job_id": job_id}


@app.post("/api/import-link")
def import_link(request: LinkImportRequest, background_tasks: BackgroundTasks) -> dict:
    if not request.url.strip():
        raise HTTPException(status_code=400, detail="A file URL is required")
    job_id = str(uuid.uuid4())
    temp_dir = create_job_workspace("link")
    downloaded = download_remote_file(request.url.strip(), temp_dir)
    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "message": "Queued",
        "result": None,
    }
    background_tasks.add_task(run_analysis_job, job_id, [downloaded])
    return {"job_id": job_id}


@app.post("/api/hackathon-data")
def hackathon_data(request: HackathonDatasetRequest, background_tasks: BackgroundTasks) -> dict:
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "message": "Queued",
        "result": None,
    }
    background_tasks.add_task(run_hackathon_dataset_job, job_id, request.refresh)
    return {"job_id": job_id}
