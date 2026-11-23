// Uses the same Apps Script endpoint as the supplied dashboard.
const API_URL = "https://script.google.com/macros/s/AKfycbwCm-WnBZJd4LHuQgDEMiF870N5NqZfluSF5EglIhH_2_Ud6OIgL2JWA792NMlwn3qnfQ/exec";

let submissions = [];
let matrikGroups = new Map();

const normalize = value => String(value ?? "").trim().toLowerCase();
const normalizeMatrik = value => String(value ?? "").replace(/\s+/g, "").toUpperCase().trim();
const isCompleted = row => normalize(row.Stage) === "completed";
const isVerified = row => normalize(row.Status) === "verified";

function timestampValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  // Handles normal date strings and numeric spreadsheet timestamps.
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function latestFirst(a, b) {
  return timestampValue(b.Timestamp) - timestampValue(a.Timestamp);
}

async function fetchSubmissions() {
  const loading = document.getElementById("loading");
  const error = document.getElementById("error");
  const refreshBtn = document.getElementById("refreshBtn");
  loading.classList.remove("hidden");
  error.classList.add("hidden");
  refreshBtn.disabled = true;

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.message || "Failed to fetch data.");

    submissions = result.data?.Sheet1 || [];
    buildGroups();
    updateStatistics();
    displayTable();
    localStorage.setItem(
  "qualifiedMatrikNumbers",
  JSON.stringify(getQualifiedMatrikNumbers())
);
  } catch (err) {
    console.error(err);
    error.textContent = `Unable to load data: ${err.message}`;
    error.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden");
    refreshBtn.disabled = false;
  }
}



/////

function openMealSelection() {
  const matriks = getQualifiedMatrikNumbers();

  if (!matriks.length) {
    alert("No qualified students found.");
    return;
  }

const url = new URL("./hantar.html", window.location.href);
  url.searchParams.set("matriks", JSON.stringify(matriks));

  window.open(url.toString(), "_blank");
}
// Normalize Matrik numbers so "BIF 00235" and "BIF00235" are grouped together.
function buildGroups() {
  matrikGroups = new Map();
  submissions.forEach(row => {
    const key = normalizeMatrik(row["Matrik Submission"]);
    if (!key) return;
    if (!matrikGroups.has(key)) matrikGroups.set(key, []);
    matrikGroups.get(key).push({ ...row, originalMatrik: row["Matrik Submission"] });
  });
  for (const rows of matrikGroups.values()) rows.sort(latestFirst);
}

function getQualifiedGroups() {
  // OR logic: include the Matrik group if ANY submission is COMPLETED
  // or ANY submission is VERIFIED (they do not have to be on the same row).
  return [...matrikGroups.entries()]
    .map(([matrik, records]) => ({ matrik, records, latest: records[0] }))
    .filter(group => group.records.some(row => isCompleted(row) || isVerified(row)));
}

function getQualifiedMatrikNumbers() {
  return [
    ...new Set(
      getQualifiedGroups()
        .map(({ matrik }) => normalize(matrik))
        .filter(Boolean)
    )
  ];
}

function updateStatistics() {
  document.getElementById("totalCount").textContent = submissions.length;
  document.getElementById("matrikCount").textContent = matrikGroups.size;
  document.getElementById("matchedCount").textContent = getQualifiedGroups().length;
  document.getElementById("completedCount").textContent = submissions.filter(isCompleted).length;
  document.getElementById("verifiedCount").textContent = submissions.filter(isVerified).length;
}

function stageSummary(records) {
  const count = records.filter(isCompleted).length;
  return count ? `COMPLETED (${count}/${records.length})` : (records[0]?.Stage || "-");
}

function statusSummary(records) {
  const count = records.filter(isVerified).length;
  return count ? `VERIFIED (${count}/${records.length})` : (records[0]?.Status || "-");
}

function displayTable() {
  const search = normalize(document.getElementById("searchInput").value);
  const tbody = document.getElementById("submissionTable");
  tbody.innerHTML = "";

  const filtered = getQualifiedGroups().filter(({ matrik, records, latest }) => {
    const searchable = [
      matrik, latest.Timestamp, latest.UUID, latest["Invoice Number"],
      latest.Stage, latest.Status, latest.Message, latest.Phone,
      ...records.map(r => `${r.Stage} ${r.Status} ${r.UUID} ${r["Invoice Number"]}`)
    ].map(normalize).join(" ");
    return searchable.includes(search);
  });

  document.getElementById("resultInfo").textContent =
    `Showing ${filtered.length} qualified Matrik numbers from ${submissions.length} submissions`;
  document.getElementById("emptyState").classList.toggle("hidden", filtered.length > 0);

  filtered.forEach(({ matrik, records, latest }, index) => {
    const tr = document.createElement("tr");
    addCell(tr, index + 1);
    addCell(tr, latest.Timestamp);
    addCell(tr, latest.originalMatrik || matrik);
    addCell(tr, latest.UUID);
    addCell(tr, latest["Invoice Number"]);

    const countCell = document.createElement("td");
    const countBadge = document.createElement("span");
    countBadge.className = "count-badge";
    countBadge.textContent = records.length;
    countCell.appendChild(countBadge);
    tr.appendChild(countCell);

    addSummaryCell(tr, stageSummary(records), records.some(isCompleted));
    addSummaryCell(tr, statusSummary(records), records.some(isVerified));
    addCell(tr, latest.Message);
    addCell(tr, latest.Phone);

    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.className = "view-btn";
    button.textContent = "View submissions";
    button.addEventListener("click", () => showMatrikDetails(matrik, records));
    actionCell.appendChild(button);
    tr.appendChild(actionCell);

    tbody.appendChild(tr);
  });
}

function addCell(row, value) {
  const td = document.createElement("td");
  td.textContent = value !== null && value !== undefined && value !== "" ? value : "-";
  row.appendChild(td);
}

function addSummaryCell(row, value, matched) {
  const td = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = `pill ${matched ? "pill-good" : "pill-neutral"}`;
  pill.textContent = value || "-";
  td.appendChild(pill);
  row.appendChild(td);
}

function showMatrikDetails(matrik, records) {
  const section = document.getElementById("groupDetail");
  const tbody = document.getElementById("groupDetailTable");
  document.getElementById("detailMatrik").textContent = matrik;
  document.getElementById("detailCount").textContent = `${records.length} submissions found (newest first)`;
  tbody.innerHTML = "";

  records.forEach((item, index) => {
    const tr = document.createElement("tr");
    [
      index + 1, item.Timestamp, item.originalMatrik, item.UUID,
      item["Invoice Number"], item.Stage, item.Status, item.Message, item.Phone
    ].forEach(value => addCell(tr, value));
    tbody.appendChild(tr);
  });

  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("refreshBtn").addEventListener("click", fetchSubmissions);
document.getElementById("searchInput").addEventListener("input", displayTable);
document.getElementById("closeDetailBtn").addEventListener("click", () => {
  document.getElementById("groupDetail").classList.add("hidden");
});

fetchSubmissions();
