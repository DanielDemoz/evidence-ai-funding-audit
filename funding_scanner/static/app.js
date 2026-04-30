const steps = [
  "Loading source data...",
  "Standardizing records...",
  "Matching organizations...",
  "Detecting funding loops...",
  "Enriching risk signals...",
  "Ranking risky clusters...",
  "Generating analyst report..."
];

const state = {
  files: [],
  currentJobId: null,
};

const fileInput = document.getElementById("fileInput");
const pickFiles = document.getElementById("pickFiles");
const runHackathonData = document.getElementById("runHackathonData");
const runDemo = document.getElementById("runDemo");
const importLink = document.getElementById("importLink");
const linkInput = document.getElementById("linkInput");
const dropzone = document.getElementById("dropzone");
const fileList = document.getElementById("fileList");
const progressList = document.getElementById("progressList");
const resultsBand = document.getElementById("resultsBand");
const dashboard = document.getElementById("dashboard");
const environmentAlert = document.getElementById("environmentAlert");

const API_BASE = window.location.protocol === "file:"
  ? "http://127.0.0.1:8050"
  : "";

function currency(value) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value || 0);
}

function showAlert(message) {
  environmentAlert.hidden = false;
  environmentAlert.innerHTML = message;
}

function clearAlert() {
  environmentAlert.hidden = true;
  environmentAlert.textContent = "";
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }
  if (!response.ok) {
    const detail = typeof payload === "object" && payload && payload.detail
      ? payload.detail
      : typeof payload === "string" && payload
        ? payload
        : `Request failed with status ${response.status}`;
    throw new Error(detail);
  }
  return payload;
}

function renderProgress(status = "idle", percent = 0, message = "Waiting for upload") {
  progressList.innerHTML = "";
  steps.forEach((label, index) => {
    const step = document.createElement("div");
    const threshold = Math.round(((index + 1) / steps.length) * 100);
    const done = percent >= threshold;
    const active = !done && percent > (index / steps.length) * 100;
    step.className = `step${done ? " done" : ""}${active ? " active" : ""}`;
    step.innerHTML = `
      <div class="badge">${done ? "✓" : index + 1}</div>
      <div><strong>${label}</strong><div class="muted">${active ? message : done ? "Complete" : "Pending"}</div></div>
      <div class="mono">${active || done ? `${Math.min(percent, 100)}%` : ""}</div>
    `;
    progressList.appendChild(step);
  });
  if (status === "failed") {
    const error = document.createElement("div");
    error.className = "step";
    error.innerHTML = `<div class="badge" style="background:#fee2e2;color:#b91c1c">!</div><div><strong>Analysis failed</strong><div class="muted">${message}</div></div><div></div>`;
    progressList.appendChild(error);
  }
}

function updateFileList() {
  if (!state.files.length) {
    fileList.textContent = "No files selected yet.";
    return;
  }
  fileList.innerHTML = state.files.map(file => `• ${file.name}`).join("<br>");
}

function setFiles(files) {
  state.files = Array.from(files);
  updateFileList();
  if (state.files.length) uploadFiles();
}

async function uploadFiles() {
  try {
    clearAlert();
    const formData = new FormData();
    state.files.forEach(file => formData.append("files", file));
    renderProgress("running", 5, "Uploading...");
    const payload = await apiFetch("/api/upload", { method: "POST", body: formData });
    state.currentJobId = payload.job_id;
    pollJob();
  } catch (error) {
    renderProgress("failed", 0, error.message);
    showAlert(`Upload failed. ${error.message}`);
  }
}

async function runDemoJob() {
  try {
    clearAlert();
    renderProgress("running", 5, "Loading demo data...");
    const payload = await apiFetch("/api/demo", { method: "POST" });
    state.currentJobId = payload.job_id;
    pollJob();
  } catch (error) {
    renderProgress("failed", 0, error.message);
    showAlert(`Demo run failed. ${error.message}`);
  }
}

async function runHackathonDatasetJob() {
  try {
    clearAlert();
    renderProgress("running", 5, "Loading Funding Loops from the hackathon dataset...");
    const payload = await apiFetch("/api/hackathon-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: false }),
    });
    state.currentJobId = payload.job_id;
    pollJob();
  } catch (error) {
    renderProgress("failed", 0, error.message);
    showAlert(`Hackathon dataset run failed. ${error.message}`);
  }
}

async function importLinkJob() {
  const url = (linkInput.value || "").trim();
  if (!url) {
    showAlert("Paste a direct CSV, Excel, or JSONL link first.");
    return;
  }
  try {
    clearAlert();
    renderProgress("running", 5, "Downloading linked file...");
    const payload = await apiFetch("/api/import-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    state.currentJobId = payload.job_id;
    pollJob();
  } catch (error) {
    renderProgress("failed", 0, error.message);
    showAlert(`Link import failed. ${error.message}`);
  }
}

async function pollJob() {
  if (!state.currentJobId) return;
  try {
    const job = await apiFetch(`/api/jobs/${state.currentJobId}`);
    renderProgress(job.status, job.progress || 0, job.message || "");
    if (job.status === "completed") {
      renderResults(job.result);
      return;
    }
    if (job.status === "failed") {
      showAlert(`Analysis failed. ${job.message || "Unknown error"}`);
      return;
    }
    setTimeout(pollJob, 1000);
  } catch (error) {
    renderProgress("failed", 0, error.message);
    showAlert(`Could not reach the analysis API. ${error.message}`);
  }
}

function riskPill(level) {
  const cls = level === "high risk" ? "status-high" : level === "flagged" ? "status-flagged" : "status-watch";
  return `<span class="status-pill ${cls}">${level}</span>`;
}

function renderResults(result) {
  resultsBand.hidden = false;
  dashboard.hidden = false;

  document.getElementById("summaryCards").innerHTML = `
    <div class="card"><strong>${result.summary.total_organizations}</strong>Total Organizations</div>
    <div class="card"><strong>${result.summary.loops_found}</strong>Loops Found</div>
    <div class="card"><strong>${result.summary.high_risk_loops}</strong>High Risk Loops</div>
    <div class="card"><strong>${result.summary.shared_director_conflicts}</strong>Shared Director Conflicts</div>
    <div class="card"><strong>${currency(result.summary.government_funding_exposure)}</strong>Government Funding Exposure</div>
    <div class="card"><strong>${result.summary.duplicate_matches}</strong>${result.summary.duplicate_matches_label || "Duplicate Matches"}</div>
  `;

  document.getElementById("summaryInsight").textContent = result.summary.insight;

  document.getElementById("riskTableBody").innerHTML = result.clusters.map(cluster => `
    <tr>
      <td class="mono">${cluster.cluster_id}</td>
      <td>${cluster.organizations.map(org => org.name).join(" → ")}</td>
      <td>${currency(cluster.total_funding)}</td>
      <td>${riskPill(cluster.risk_level)} ${cluster.risk_score}/6</td>
      <td>${cluster.main_reason}</td>
    </tr>
  `).join("");

  document.getElementById("topEntities").innerHTML = result.top_entities.length
    ? `<table><thead><tr><th>Organization</th><th>Risk</th><th>Clusters</th><th>Total Funding</th></tr></thead><tbody>${
      result.top_entities.map(entity => `
        <tr>
          <td>${entity.name}<div class="muted">${entity.top_reason}</div></td>
          <td>${entity.risk_score}/6</td>
          <td>${entity.clusters}</td>
          <td>${currency(entity.total_funding)}</td>
        </tr>
      `).join("")
    }</tbody></table>`
    : `<div class="empty">No flagged entities yet.</div>`;

  const duplicatePanel = document.getElementById("duplicateMatches");
  const duplicateTitle = document.querySelector("#duplicateMatches").closest(".band").querySelector(".panel-title");
  duplicateTitle.textContent = result.summary.duplicate_matches_label || "Duplicate Matches";
  duplicatePanel.innerHTML = result.duplicate_matches.length
    ? result.duplicate_matches[0].canonical_name !== undefined
      ? `<table><thead><tr><th>Canonical</th><th>Matched name</th><th>Score</th></tr></thead><tbody>${
          result.duplicate_matches.map(match => `
            <tr>
              <td>${match.canonical_name}</td>
              <td>${match.matched_name}</td>
              <td>${match.score}</td>
            </tr>
          `).join("")
        }</tbody></table>`
      : `<table><thead><tr><th>Organization</th><th>Signal</th><th>Detail</th></tr></thead><tbody>${
          result.duplicate_matches.map(match => `
            <tr>
              <td>${match.label}</td>
              <td>${match.value}</td>
              <td>${match.detail || ""}</td>
            </tr>
          `).join("")
        }</tbody></table>`
    : `<div class="empty">No duplicate organization matches or repeated funding signals were found for this run.</div>`;

  document.getElementById("clusterSignals").innerHTML = result.clusters.slice(0, 8).map(cluster => `
    <div class="card" style="margin-bottom:10px">
      <strong style="font-size:16px">${cluster.cluster_id}</strong>
      <div class="muted" style="margin:4px 0 8px">${cluster.organizations.map(org => org.name).join(" → ")}</div>
      <div>Loop: ${cluster.signals.in_loop ? "yes" : "no"} | Connected: ${cluster.signals.connected_entities ? "yes" : "no"} | Inactive after funding: ${cluster.signals.inactive_after_funding ? "yes" : "no"}</div>
      <div>High government funded: ${cluster.signals.highly_government_funded ? "yes" : "no"} | Repeated funding: ${cluster.signals.repeated_or_duplicate_funding ? "yes" : "no"} | Concentration: ${cluster.signals.contract_concentration ? "yes" : "no"}</div>
    </div>
  `).join("");

  renderNetwork(result.network);
}

function renderNetwork(clusters) {
  const width = 1080;
  const cellWidth = 340;
  const cellHeight = 240;
  const cols = 3;
  const height = Math.max(320, Math.ceil(clusters.length / cols) * cellHeight + 40);
  const parts = [`<svg viewBox="0 0 ${width} ${height}" style="min-width:${width}px">`];

  clusters.forEach((cluster, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 26 + col * cellWidth;
    const y = 42 + row * cellHeight;
    const cx = x + 145;
    const cy = y + 92;
    const riskFill = cluster.risk_level === "high risk" ? "#fee2e2" : "#fef3c7";
    parts.push(`<rect x="${x}" y="${y}" width="290" height="184" rx="10" fill="${riskFill}" stroke="#cbd5e1"></rect>`);
    parts.push(`<text x="${x + 12}" y="${y + 20}" font-size="15" font-weight="700" fill="#0f172a">${cluster.cluster_id}</text>`);
    parts.push(`<text x="${x + 210}" y="${y + 20}" font-size="13" fill="#334155">${cluster.risk_score}/6</text>`);

    const radius = 56;
    const nodes = cluster.organizations.map((org, nodeIndex) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * nodeIndex / cluster.organizations.length);
      return {
        ...org,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });
    const nodeMap = new Map(nodes.map(node => [node.entity_id, node]));

    cluster.edges.forEach(edge => {
      const src = nodeMap.get(edge.source);
      const dst = nodeMap.get(edge.target);
      if (!src || !dst) return;
      parts.push(`<line x1="${src.x}" y1="${src.y}" x2="${dst.x}" y2="${dst.y}" stroke="#64748b" stroke-width="2"></line>`);
      parts.push(`<text x="${(src.x + dst.x) / 2}" y="${(src.y + dst.y) / 2 - 4}" font-size="10" text-anchor="middle" fill="#475569">${currency(edge.amount)}</text>`);
    });

    nodes.forEach(node => {
      const fill = node.govt_dependency_pct >= 50 ? "#fdba74" : "#93c5fd";
      parts.push(`<circle cx="${node.x}" cy="${node.y}" r="20" fill="${fill}" stroke="#1e293b"></circle>`);
      parts.push(`<text x="${node.x}" y="${node.y - 26}" font-size="10" text-anchor="middle" fill="#0f172a">${node.name.slice(0, 28)}</text>`);
    });
    parts.push(`<text x="${x + 12}" y="${y + 168}" font-size="11" fill="#475569">Reason: ${cluster.main_reason}</text>`);
  });

  parts.push("</svg>");
  document.getElementById("networkWrap").innerHTML = parts.join("");
}

pickFiles.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", event => setFiles(event.target.files));
runHackathonData.addEventListener("click", runHackathonDatasetJob);
runDemo.addEventListener("click", runDemoJob);
importLink.addEventListener("click", importLinkJob);
linkInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    importLinkJob();
  }
});

dropzone.addEventListener("dragover", event => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", event => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  setFiles(event.dataTransfer.files);
});

updateFileList();
renderProgress();

if (window.location.protocol === "file:") {
  showAlert(`This page is open from <code>file://</code>. Uploads can still work if the local API is running, but the preferred URL is <a href="http://127.0.0.1:8050">http://127.0.0.1:8050</a>.`);
}
