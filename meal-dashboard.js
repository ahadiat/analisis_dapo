/*
 * Meal Selection Dashboard
 *
 * 1. Set APPS_SCRIPT_URL to your deployed Apps Script /exec URL.
 * 2. Load your existing app.js before this file if it is on the same page.
 * 3. In app.js, expose submission UUIDs after submissions have loaded:
 *      window.getSubmissionUUIDs = () => submissions.map(row => row.UUID);
 */

const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwCm-WnBZJd4LHuQgDEMiF870N5NqZfluSF5EglIhH_2_Ud6OIgL2JWA792NMlwn3qnfQ/exec",
  
};

const DAYS = [
  { label: "Isnin", prefix: "Mon" },
  { label: "Selasa", prefix: "Tue" },
  { label: "Rabu", prefix: "Wed" },
  { label: "Khamis", prefix: "Thu" },
  { label: "Jumaat", prefix: "Fri" },
  { label: "Sabtu", prefix: "Sat" },
  { label: "Ahad", prefix: "Sun" }
];

const MEALS = [
  { label: "Pagi", suffix: "Pagi" },
  { label: "Tengahari", suffix: "Tengahari" },
  { label: "Malam", suffix: "Petang" } // Sheet's Petang column represents the third meal.
];

let mealRows = [];
let matchedGroups = [];

const $ = (id) => document.getElementById(id);

/** Standardizes matric values: " fis-00122 " -> "FIS00122". */
function normalizeMatrik(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** UUID comparison ignores accidental spaces and letter casing. */
function normalizeUUID(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isTrue(value) {
  return value === true || String(value).trim().toLowerCase() === "true" || value === 1 || value === "1";
}


//llll
function normalizeMatrik(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

////

function getAllowedMatrikNumbers() {
  try {
    const params = new URLSearchParams(window.location.search);
    const matriks = JSON.parse(
      params.get("matriks") || "[]"
    );

    return new Set(
      matriks.map(normalizeMatrik).filter(Boolean)
    );

  } catch (error) {
    console.error("Unable to retrieve Matrik Numbers:", error);
    return new Set();
  }
}


/** JSONP avoids browser CORS restrictions with a Google Apps Script web app. */
const API_URL = "https://script.google.com/macros/s/AKfycbwCm-WnBZJd4LHuQgDEMiF870N5NqZfluSF5EglIhH_2_Ud6OIgL2JWA792NMlwn3qnfQ/exec";

async function fetchMealSelections() {
  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch data");
    }

    return result.data.Sheet2 || [];

  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
}
/**
 * Keep only rows whose UUID exists in app.js, then group by normalized matric.
 * Multiple submissions are merged using OR for each meal/day.
 */
function buildMatchedGroups(rows) {
  const allowedMatriks = getAllowedMatrikNumbers();
  const groups = new Map();

  rows.forEach(row => {
    const matricKey = normalizeMatrik(row["Matrik Number"]);

    if (!matricKey || !allowedMatriks.has(matricKey)) return;

    if (!groups.has(matricKey)) {
      groups.set(matricKey, {
        matricKey,
        matricDisplay: row["Matrik Number"],
        records: [],
        meals: {}
      });
    }

    const group = groups.get(matricKey);
    group.records.push(row);

    DAYS.forEach(day => {
      MEALS.forEach(meal => {
        const field = day.prefix + meal.suffix;

        group.meals[field] =
          Boolean(group.meals[field]) || isTrue(row[field]);
      });
    });
  });

  return [...groups.values()];
}

function createCell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function createMealCell(selected) {
  const td = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = "meal-pill " + (selected ? "yes" : "no");
  pill.textContent = selected ? "✓" : "—";
  pill.setAttribute("aria-label", selected ? "Selected" : "Not selected");
  td.appendChild(pill);
  return td;
}


function renderTable() {
  const tbody = $("mealTable");
  const search = normalizeMatrik($("searchInput").value);

  tbody.innerHTML = "";

  const filteredGroups = matchedGroups.filter(group =>
    normalizeMatrik(group.matricDisplay).includes(search)
  );

  let selectedMealCount = 0;
  

  // Store totals for each day and meal session
  const mealTotals = {};

  DAYS.forEach(day => {
    MEALS.forEach(meal => {
      mealTotals[day.prefix + meal.suffix] = 0;
    });
  });

  filteredGroups.forEach(group => {
    const tr = document.createElement("tr");

    // Matrik Number at the far left
    tr.appendChild(
      createCell(group.matricDisplay, "matrik-cell")
    );

    // Seven days × three meal sessions
    DAYS.forEach(day => {
      MEALS.forEach(meal => {
        const key = day.prefix + meal.suffix;

        const selected = Boolean(group.meals[key]);

        if (selected) {
          selectedMealCount++;
          mealTotals[key]++;
        }

        tr.appendChild(createMealCell(selected));
      });
    });

    tbody.appendChild(tr);
  });

  const submissionRecordCount = filteredGroups.reduce(
    (sum, group) => sum + group.records.length,
    0
  );

  $("studentCount").textContent =
    filteredGroups.length.toLocaleString();

  $("recordCount").textContent =
    submissionRecordCount.toLocaleString();

  $("mealCount").textContent =
    selectedMealCount.toLocaleString();

  $("resultInfo").textContent =
    `Showing ${filteredGroups.length} students · ${submissionRecordCount} matched submission records`;

  $("emptyState").classList.toggle(
    "hidden",
    filteredGroups.length > 0
  );

  // Render summary table
  renderMealSummary(mealTotals);
}


async function loadDashboard() {
  const refreshBtn = $("refreshBtn");
  const status = $("statusMessage");

  refreshBtn.disabled = true;
  status.className = "status-message";
  status.textContent = "Loading meal selections…";

  try {
    const allowedMatriks = getAllowedMatrikNumbers();

    if (allowedMatriks.size === 0) {
      throw new Error(
        "No matric numbers found. Please check the matriks URL parameter."
      );
    }

    mealRows = await fetchMealSelections();

    matchedGroups = buildMatchedGroups(mealRows);

    renderTable();

    status.textContent =
      `Connected · ${mealRows.length} sheet rows fetched · ${allowedMatriks.size} matric numbers checked`;

  } catch (error) {
    console.error(error);

    status.className = "status-message error";
    status.textContent = error.message;

    $("mealTable").innerHTML = "";
    $("emptyState").classList.add("hidden");
    $("studentCount").textContent = "—";
    $("recordCount").textContent = "—";
    $("mealCount").textContent = "—";
    $("resultInfo").textContent = "Unable to load records";

  } finally {
    refreshBtn.disabled = false;
  }
}



function renderMealSummary(mealTotals) {
  const tbody = $("mealSummaryTable");
  tbody.innerHTML = "";

  const sessions = [
    { label: "Pagi", suffix: "Pagi" },
    { label: "Tengahari", suffix: "Tengahari" },
    { label: "Petang", suffix: "Petang" }
  ];

  // Three meal session rows
  sessions.forEach(session => {
    const tr = document.createElement("tr");

    tr.appendChild(
      createCell(session.label, "matrik-cell")
    );

    let rowTotal = 0;

    DAYS.forEach(day => {
      const count =
        mealTotals[day.prefix + session.suffix] || 0;

      rowTotal += count;

      tr.appendChild(
        createCell(count.toLocaleString())
      );
    });

    tr.appendChild(
      createCell(rowTotal.toLocaleString(), "matrik-cell")
    );

    tbody.appendChild(tr);
  });

  // Total meals for each day
  const dailyRow = document.createElement("tr");
  dailyRow.className = "daily-total-row";

  dailyRow.appendChild(
    createCell("Jumlah Harian", "matrik-cell")
  );

  let grandTotal = 0;

  DAYS.forEach(day => {
    const dailyTotal = sessions.reduce(
      (sum, session) =>
        sum + (mealTotals[day.prefix + session.suffix] || 0),
      0
    );

    grandTotal += dailyTotal;

    dailyRow.appendChild(
      createCell(dailyTotal.toLocaleString(), "matrik-cell")
    );
  });

  dailyRow.appendChild(
    createCell(grandTotal.toLocaleString(), "matrik-cell")
  );

  tbody.appendChild(dailyRow);
}


document.addEventListener("DOMContentLoaded", () => {
  $("refreshBtn").addEventListener("click", loadDashboard);
  $("searchInput").addEventListener("input", renderTable);
  loadDashboard();
});
