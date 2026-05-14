const REQUIRED_REPORT_NAME = "report name scheduled patients list";
const STORAGE_KEY = "help360md.patientScheduleAssistant.v1";
const DOS_ALL_FILTER = "__all_dos__";
const DOS_EMPTY_LABEL = "No DOS Provided";
const OUTPUT_COLUMNS = [
  "patientid",
  "patient name",
  "appt ins pkg name",
  "appt policyidnumber",
  "patientdob",
  "appttype",
  "svc dprtmnt",
];

const HEADER_ALIASES = {
  patientid: ["patientid", "patient id"],
  "patient name": ["patient name", "patientname", "full name"],
  "appt ins pkg name": [
    "appt ins pkg name",
    "appointment insurance package name",
    "appt insurance package name",
    "insurance package name",
    "ins pkg name",
  ],
  "appt policyidnumber": [
    "appt policyidnumber",
    "appt policy id number",
    "appointment policy id number",
    "policy id number",
    "policyidnumber",
  ],
  patientdob: ["patientdob", "patient dob", "dob", "date of birth"],
  appttype: ["appttype", "appt type", "appointment type"],
  "svc dprtmnt": [
    "svc dprtmnt",
    "svc department",
    "service department",
    "service dprtmnt",
    "department",
  ],
};

const DOS_HEADER_ALIASES = [
  "dos",
  "date of service",
  "apptdate",
  "appt date",
  "appointment date",
  "appointmentdate",
  "scheduled date",
];

const STATUS_HEADER_ALIASES = [
  "appt status",
  "appointment status",
  "status",
  "apptstatus",
  "appointmentstatus",
  "appt state",
  "appointment state",
];

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeDisplay(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeDosValue(value) {
  return normalizeDisplay(value) || DOS_EMPTY_LABEL;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPE_MAP[character]);
}

function parseCsv(csvText) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;
  const text = String(csvText ?? "").replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        currentCell += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (character === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (character === "\r") {
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);

  return rows.filter((row) => row.some((cell) => normalizeDisplay(cell) !== ""));
}

function findHeaderIndex(headerLookup, candidates) {
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeHeader(candidate);
    if (headerLookup.has(normalizedCandidate)) {
      return headerLookup.get(normalizedCandidate);
    }
  }

  return -1;
}

function resolveDosIndex(headerLookup) {
  const directMatch = findHeaderIndex(headerLookup, DOS_HEADER_ALIASES);
  if (directMatch >= 0) {
    return directMatch;
  }

  for (const [headerName, index] of headerLookup.entries()) {
    const looksLikeDos =
      (headerName.includes("appt") || headerName.includes("appointment")) &&
      headerName.includes("date");

    if (looksLikeDos) {
      return index;
    }
  }

  return -1;
}

function resolveStatusIndex(headerLookup) {
  const directMatch = findHeaderIndex(headerLookup, STATUS_HEADER_ALIASES);
  if (directMatch >= 0) {
    return directMatch;
  }

  for (const [headerName, index] of headerLookup.entries()) {
    if (headerName.includes("status") && (headerName.includes("appt") || headerName.includes("appointment"))) {
      return index;
    }
  }

  return -1;
}

function resolveColumnIndexes(headerRow) {
  const headerLookup = new Map(
    headerRow.map((header, index) => [normalizeHeader(header), index]),
  );

  const indexes = {};
  const missingColumns = [];

  for (const outputColumn of OUTPUT_COLUMNS) {
    const headerIndex = findHeaderIndex(headerLookup, HEADER_ALIASES[outputColumn] ?? [outputColumn]);
    if (headerIndex === -1) {
      missingColumns.push(outputColumn);
      continue;
    }

    indexes[outputColumn] = headerIndex;
  }

  const dosIndex = resolveDosIndex(headerLookup);
  if (dosIndex === -1) {
    missingColumns.push("DOS / appointment date");
  }

  if (missingColumns.length > 0) {
    throw new Error(
      `The CSV is missing required column${missingColumns.length > 1 ? "s" : ""}: ${missingColumns.join(", ")}.`,
    );
  }

  return {
    indexes,
    dosIndex,
    statusIndex: resolveStatusIndex(headerLookup),
  };
}

function quoteCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function toCsv(rows) {
  const headerLine = OUTPUT_COLUMNS.join(",");
  const dataLines = rows.map((row) =>
    OUTPUT_COLUMNS.map((columnName) => quoteCsvValue(row[columnName] ?? "")).join(","),
  );

  return [headerLine, ...dataLines].join("\r\n");
}

function makeDeduplicationKey(row, dos) {
  const preferredPatientKey = normalizeDisplay(row.patientid) || [
    normalizeDisplay(row["patient name"]),
    normalizeDisplay(row.patientdob),
  ]
    .filter(Boolean)
    .join("|");

  if (!preferredPatientKey || !normalizeDisplay(dos)) {
    return "";
  }

  return `${preferredPatientKey.toLowerCase()}::${normalizeDisplay(dos).toLowerCase()}`;
}

function sortRowsByPatientName(rows) {
  return [...rows].sort((left, right) => {
    const nameCompare = normalizeDisplay(left["patient name"]).localeCompare(
      normalizeDisplay(right["patient name"]),
      undefined,
      { sensitivity: "base" },
    );

    if (nameCompare !== 0) {
      return nameCompare;
    }

    return normalizeDisplay(left.patientid).localeCompare(normalizeDisplay(right.patientid), undefined, {
      sensitivity: "base",
    });
  });
}

function parseDosTimestamp(value) {
  const label = normalizeDisplay(value);
  if (!label || label === DOS_EMPTY_LABEL) {
    return Number.POSITIVE_INFINITY;
  }

  const slashDateMatch = label.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+.*)?$/);
  if (slashDateMatch) {
    const month = Number(slashDateMatch[1]);
    const day = Number(slashDateMatch[2]);
    const year = Number(slashDateMatch[3].length === 2 ? `20${slashDateMatch[3]}` : slashDateMatch[3]);
    return new Date(year, month - 1, day).getTime();
  }

  const isoDateMatch = label.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+.*)?$/);
  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]);
    const month = Number(isoDateMatch[2]);
    const day = Number(isoDateMatch[3]);
    return new Date(year, month - 1, day).getTime();
  }

  const parsedTimestamp = Date.parse(label);
  return Number.isNaN(parsedTimestamp) ? Number.POSITIVE_INFINITY : parsedTimestamp;
}

function buildCounts(rows, columnName) {
  const counts = new Map();

  for (const row of rows) {
    const rawLabel = normalizeDisplay(row[columnName]) || "Not Provided";
    const normalizedKey = rawLabel.toLowerCase();
    const existing = counts.get(normalizedKey);

    if (existing) {
      existing.count += 1;
    } else {
      counts.set(normalizedKey, { label: rawLabel, count: 1 });
    }
  }

  return [...counts.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
  );
}

function buildDosCounts(rows) {
  const counts = new Map();

  for (const row of rows) {
    const label = normalizeDosValue(row.__dos);
    const normalizedKey = label.toLowerCase();
    const existing = counts.get(normalizedKey);

    if (existing) {
      existing.count += 1;
    } else {
      counts.set(normalizedKey, { label, count: 1 });
    }
  }

  return [...counts.values()].sort((left, right) => {
    const leftTime = parseDosTimestamp(left.label);
    const rightTime = parseDosTimestamp(right.label);

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  });
}

function looksCancelled(value) {
  const normalizedValue = normalizeHeader(value);
  return normalizedValue.includes("cancel");
}

function isSelfPayPlaceholder(row) {
  const insuranceLabel = normalizeHeader(row["appt ins pkg name"]);
  const missingPatientId = !normalizeDisplay(row.patientid);
  const missingPatientName = !normalizeDisplay(row["patient name"]);
  const missingPolicyId = !normalizeDisplay(row["appt policyidnumber"]);

  return insuranceLabel.includes("self pay") && missingPatientId && missingPatientName && missingPolicyId;
}

function sumMatchingCounts(counts, matchers) {
  return counts.reduce((total, item) => {
    const label = item.label.toLowerCase();
    const matches = matchers.some((matcher) => matcher.test(label));
    return matches ? total + item.count : total;
  }, 0);
}

function buildSummary(cleanedRows, appointmentCounts, insuranceCounts, dosCounts) {
  return {
    totalAppointments: cleanedRows.length,
    newPatientCount: sumMatchingCounts(appointmentCounts, [/\bnew patient\b/, /\bnp\b/]),
    establishedPatientCount: sumMatchingCounts(appointmentCounts, [
      /\bestablished patient\b/,
      /\bestablish patient\b/,
      /\best patient\b/,
      /\best pt\b/,
      /\bep\b/,
    ]),
    wellnessExamCount: sumMatchingCounts(appointmentCounts, [/\bwellness\b/, /\bawv\b/]),
    appointmentTypeCount: appointmentCounts.length,
    dosCount: dosCounts.length,
    insurancePlanCount: insuranceCounts.length,
  };
}

function normalizeProcessedSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.cleanedRows)) {
    return null;
  }

  const normalizedRows = snapshot.cleanedRows.map((row) => ({
    ...row,
    __dos: normalizeDosValue(row.__dos),
  }));
  const appointmentCounts = Array.isArray(snapshot.appointmentCounts)
    ? snapshot.appointmentCounts
    : buildCounts(normalizedRows, "appttype");
  const insuranceCounts = Array.isArray(snapshot.insuranceCounts)
    ? snapshot.insuranceCounts
    : buildCounts(normalizedRows, "appt ins pkg name");
  const dosCounts = Array.isArray(snapshot.dosCounts)
    ? snapshot.dosCounts
    : buildDosCounts(normalizedRows);

  return {
    ...snapshot,
    sourceRowsRead: Number(snapshot.sourceRowsRead) || normalizedRows.length,
    duplicatesRemoved: Number(snapshot.duplicatesRemoved) || 0,
    cancelledRemoved: Number(snapshot.cancelledRemoved) || 0,
    selfPayRemoved: Number(snapshot.selfPayRemoved) || 0,
    cleanedRows: normalizedRows,
    appointmentCounts,
    insuranceCounts,
    dosCounts,
    summary: buildSummary(normalizedRows, appointmentCounts, insuranceCounts, dosCounts),
  };
}

function processScheduleCsv(csvText, fileName = "schedule.csv") {
  const rows = parseCsv(csvText);

  if (rows.length < 2) {
    throw new Error("This file does not have enough rows to contain the report name and headers.");
  }

  const reportCell = normalizeHeader(rows[0][0]);
  if (reportCell !== REQUIRED_REPORT_NAME) {
    throw new Error(
      'This file does not look like an Athena "Scheduled Patients List" export. Cell A1 must be "REPORT NAME : Scheduled Patients List".',
    );
  }

  const headerRow = rows[1];
  const { indexes, dosIndex, statusIndex } = resolveColumnIndexes(headerRow);
  const cleanedRows = [];
  const seenKeys = new Set();
  let duplicatesRemoved = 0;
  let cancelledRemoved = 0;
  let selfPayRemoved = 0;
  let sourceRowsRead = 0;

  for (const sourceRow of rows.slice(2)) {
    const hasContent = sourceRow.some((cell) => normalizeDisplay(cell) !== "");
    if (!hasContent) {
      continue;
    }

    sourceRowsRead += 1;

    const cleanedRow = {};
    for (const columnName of OUTPUT_COLUMNS) {
      cleanedRow[columnName] = normalizeDisplay(sourceRow[indexes[columnName]]);
    }

    if (isSelfPayPlaceholder(cleanedRow)) {
      selfPayRemoved += 1;
      continue;
    }

    const statusValue = statusIndex >= 0 ? normalizeDisplay(sourceRow[statusIndex]) : "";
    if (looksCancelled(statusValue) || looksCancelled(cleanedRow.appttype)) {
      cancelledRemoved += 1;
      continue;
    }

    const dosValue = normalizeDisplay(sourceRow[dosIndex]);
    cleanedRow.__dos = normalizeDosValue(dosValue);
    const dedupeKey = makeDeduplicationKey(cleanedRow, dosValue);

    if (dedupeKey && seenKeys.has(dedupeKey)) {
      duplicatesRemoved += 1;
      continue;
    }

    if (dedupeKey) {
      seenKeys.add(dedupeKey);
    }
    cleanedRows.push(cleanedRow);
  }

  const sortedRows = sortRowsByPatientName(cleanedRows);
  const appointmentCounts = buildCounts(sortedRows, "appttype");
  const insuranceCounts = buildCounts(sortedRows, "appt ins pkg name");
  const dosCounts = buildDosCounts(sortedRows);

  return {
    fileName,
    sourceRowsRead,
    duplicatesRemoved,
    cancelledRemoved,
    selfPayRemoved,
    cleanedRows: sortedRows,
    appointmentCounts,
    insuranceCounts,
    dosCounts,
    summary: buildSummary(sortedRows, appointmentCounts, insuranceCounts, dosCounts),
  };
}

function saveState(snapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function loadState() {
  const rawValue = localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return normalizeProcessedSnapshot(parsed);
  } catch {
    return null;
  }
}

function clearSavedState() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatTimestamp(isoString) {
  if (!isoString) {
    return "";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result ?? ""));
    };

    reader.onerror = () => {
      reject(new Error("The selected file could not be read. Please try again."));
    };

    reader.readAsText(file);
  });
}

function renderCounts(container, items) {
  if (!items.length) {
    container.innerHTML = '<div class="empty-state-card">No countable values were found in this section.</div>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <article class="count-card">
          <div class="count-card-label">${escapeHtml(item.label)}</div>
          <div class="count-card-value">${item.count}</div>
        </article>
      `,
    )
    .join("");
}

function renderDosFilters(container, dosCounts, selectedDos) {
  if (!dosCounts.length) {
    container.innerHTML = '<div class="empty-state-card">No DOS values were found in this file.</div>';
    return;
  }

  const buttons = [
    {
      value: DOS_ALL_FILTER,
      label: "All DOS",
      count: dosCounts.reduce((total, item) => total + item.count, 0),
    },
    ...dosCounts.map((item) => ({
      value: item.label,
      label: item.label,
      count: item.count,
    })),
  ];

  container.innerHTML = buttons
    .map(
      (item) => `
        <button
          class="dos-filter-button${selectedDos === item.value ? " is-active" : ""}"
          type="button"
          data-dos-filter="${escapeHtml(item.value)}"
        >
          ${escapeHtml(item.label)}
          <span class="dos-filter-meta">(${item.count})</span>
        </button>
      `,
    )
    .join("");
}

function filterRowsByDos(rows, selectedDos) {
  if (!selectedDos || selectedDos === DOS_ALL_FILTER) {
    return rows;
  }

  return rows.filter((row) => normalizeDosValue(row.__dos) === selectedDos);
}

function renderTable(body, rows, emptyMessage = "No patient rows were found after processing this file.") {
  if (!rows.length) {
    body.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">${escapeHtml(emptyMessage)}</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => `
        <tr>
          ${OUTPUT_COLUMNS.map((columnName) => {
            if (columnName === "patient name") {
              return `
                <td>
                  <div class="patient-cell">
                    <span>${escapeHtml(row[columnName] ?? "")}</span>
                    <span class="dos-badge">DOS: ${escapeHtml(normalizeDosValue(row.__dos))}</span>
                  </div>
                </td>
              `;
            }

            return `<td>${escapeHtml(row[columnName] ?? "")}</td>`;
          }).join("")}
        </tr>
      `,
    )
    .join("");
}

function setStatus(statusElement, message, tone = "info") {
  statusElement.textContent = message;
  statusElement.className = `status-banner status-${tone}`;
}

function updateOverview(summaryElements, processedData) {
  summaryElements.totalAppointments.textContent = String(processedData.summary.totalAppointments);
  summaryElements.duplicatesRemoved.textContent = String(processedData.duplicatesRemoved);
  summaryElements.cancelledRemoved.textContent = String(processedData.cancelledRemoved);
  summaryElements.selfPayRemoved.textContent = String(processedData.selfPayRemoved);
  summaryElements.newPatientCount.textContent = String(processedData.summary.newPatientCount);
  summaryElements.establishedPatientCount.textContent = String(processedData.summary.establishedPatientCount);
  summaryElements.wellnessExamCount.textContent = String(processedData.summary.wellnessExamCount);
  summaryElements.appointmentTypeCount.textContent = String(processedData.summary.appointmentTypeCount);
  summaryElements.dosCount.textContent = String(processedData.summary.dosCount);
  summaryElements.insurancePlanCount.textContent = String(processedData.summary.insurancePlanCount);
}

function downloadCleanedCsv(processedData) {
  downloadRowsCsv(processedData.cleanedRows, processedData.fileName, "cleaned");
}

function buildCsvFileName(fileName, suffix) {
  const baseName = fileName.replace(/\.[^.]+$/, "") || "scheduled-patients";
  const safeSuffix = String(suffix ?? "cleaned")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return `${baseName}-${safeSuffix || "cleaned"}.csv`;
}

function downloadRowsCsv(rows, fileName, suffix) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = buildCsvFileName(fileName, suffix);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function initApp() {
  const elements = {
    csvFileInput: document.querySelector("#csvFileInput"),
    uploadButton: document.querySelector("#uploadButton"),
    processButton: document.querySelector("#processButton"),
    downloadButton: document.querySelector("#downloadButton"),
    downloadDosButton: document.querySelector("#downloadDosButton"),
    clearMemoryButton: document.querySelector("#clearMemoryButton"),
    fileMeta: document.querySelector("#fileMeta"),
    statusMessage: document.querySelector("#statusMessage"),
    memoryBadge: document.querySelector("#memoryBadge"),
    dosFilters: document.querySelector("#dosFilters"),
    dosCounts: document.querySelector("#dosCounts"),
    dosSelectionSummary: document.querySelector("#dosSelectionSummary"),
    appointmentCounts: document.querySelector("#appointmentCounts"),
    insuranceCounts: document.querySelector("#insuranceCounts"),
    insuranceCountsWrap: document.querySelector("#insuranceCountsWrap"),
    insuranceToggleButton: document.querySelector("#insuranceToggleButton"),
    resultsBody: document.querySelector("#resultsBody"),
    tableSummary: document.querySelector("#tableSummary"),
  };

  const summaryElements = {
    totalAppointments: document.querySelector("#totalAppointments"),
    duplicatesRemoved: document.querySelector("#duplicatesRemoved"),
    cancelledRemoved: document.querySelector("#cancelledRemoved"),
    selfPayRemoved: document.querySelector("#selfPayRemoved"),
    newPatientCount: document.querySelector("#newPatientCount"),
    establishedPatientCount: document.querySelector("#establishedPatientCount"),
    wellnessExamCount: document.querySelector("#wellnessExamCount"),
    appointmentTypeCount: document.querySelector("#appointmentTypeCount"),
    dosCount: document.querySelector("#dosCount"),
    insurancePlanCount: document.querySelector("#insurancePlanCount"),
  };

  const state = {
    selectedFile: null,
    processedData: null,
    selectedDos: DOS_ALL_FILTER,
  };

  function syncButtons() {
    elements.processButton.disabled = !state.selectedFile;
    elements.downloadButton.disabled = !state.processedData;
    elements.downloadDosButton.disabled = !state.processedData || state.selectedDos === DOS_ALL_FILTER;
    elements.clearMemoryButton.disabled = !loadState();
  }

  function updateInsuranceToggle(isOpen) {
    elements.insuranceCountsWrap.hidden = !isOpen;
    elements.insuranceToggleButton.setAttribute("aria-expanded", String(isOpen));
    elements.insuranceToggleButton.textContent = isOpen ? "Hide" : "Show";
  }

  function updateDosDownloadButton() {
    const hasSpecificDos = Boolean(state.processedData) && state.selectedDos !== DOS_ALL_FILTER;
    elements.downloadDosButton.disabled = !hasSpecificDos;
    elements.downloadDosButton.textContent = hasSpecificDos
      ? `Download ${state.selectedDos} CSV`
      : "Download Selected DOS";
  }

  function renderFilteredTableView() {
    if (!state.processedData) {
      renderTable(elements.resultsBody, [], "No processed data yet.");
      elements.tableSummary.textContent = "No processed data yet.";
      elements.dosSelectionSummary.textContent = "Select a DOS filter to review that day and download only that DOS.";
      updateDosDownloadButton();
      return;
    }

    const filteredRows = filterRowsByDos(state.processedData.cleanedRows, state.selectedDos);
    renderTable(
      elements.resultsBody,
      filteredRows,
      state.selectedDos === DOS_ALL_FILTER
        ? "No patient rows were found after processing this file."
        : `No patient rows match DOS ${state.selectedDos}.`,
    );

    const dosSummary =
      state.selectedDos === DOS_ALL_FILTER
        ? `Showing all ${state.processedData.summary.dosCount} DOS values.`
        : `Showing patients for DOS ${state.selectedDos}.`;

    elements.tableSummary.textContent =
      `${filteredRows.length} appointments visible from ${state.processedData.cleanedRows.length} cleaned appointments. Removed ${state.processedData.duplicatesRemoved} duplicates, ${state.processedData.cancelledRemoved} cancelled appointments, and ${state.processedData.selfPayRemoved} self-pay placeholders. ${dosSummary}`;

    elements.dosSelectionSummary.textContent =
      state.selectedDos === DOS_ALL_FILTER
        ? `Select a DOS filter to download only that date. ${state.processedData.summary.dosCount} unique DOS values are available.`
        : `${filteredRows.length} appointments are currently visible for DOS ${state.selectedDos}.`;

    updateDosDownloadButton();
    syncButtons();
  }

  function renderProcessedData(processedData, options = {}) {
    const normalizedData = normalizeProcessedSnapshot(processedData);
    state.processedData = normalizedData;
    state.selectedDos = options.keepSelectedDos &&
      normalizedData.dosCounts.some((item) => item.label === state.selectedDos)
      ? state.selectedDos
      : DOS_ALL_FILTER;

    renderDosFilters(elements.dosFilters, normalizedData.dosCounts, state.selectedDos);
    renderCounts(elements.dosCounts, normalizedData.dosCounts);
    renderCounts(elements.appointmentCounts, normalizedData.appointmentCounts);
    renderCounts(elements.insuranceCounts, normalizedData.insuranceCounts);
    updateOverview(summaryElements, normalizedData);
    renderFilteredTableView();

    if (options.restoredAt) {
      elements.tableSummary.textContent += ` Restored from memory on ${options.restoredAt}.`;
    }

    elements.downloadButton.disabled = false;
    elements.clearMemoryButton.disabled = false;
  }

  elements.uploadButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.csvFileInput.click();
    }
  });

  elements.csvFileInput.addEventListener("change", () => {
    const fileList = elements.csvFileInput.files || [];
    const selectedFile = fileList[0];
    state.selectedFile = selectedFile ?? null;
    elements.memoryBadge.classList.add("hidden");

    if (!selectedFile) {
      elements.fileMeta.textContent = "No file selected yet.";
      setStatus(elements.statusMessage, "Choose a CSV file to get started.", "info");
      syncButtons();
      return;
    }

    const fileSizeKb = `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`;
    elements.fileMeta.textContent = `${selectedFile.name} selected (${fileSizeKb}).`;
    setStatus(elements.statusMessage, "File selected. Click Process to clean the schedule.", "info");
    syncButtons();
  });

  elements.dosFilters.addEventListener("click", (event) => {
    const filterButton = event.target.closest("[data-dos-filter]");
    if (!filterButton || !state.processedData) {
      return;
    }

    state.selectedDos = filterButton.getAttribute("data-dos-filter") || DOS_ALL_FILTER;
    renderDosFilters(elements.dosFilters, state.processedData.dosCounts, state.selectedDos);
    renderFilteredTableView();
  });

  elements.processButton.addEventListener("click", async () => {
    if (!state.selectedFile) {
      setStatus(elements.statusMessage, "Please choose a CSV file before processing.", "error");
      return;
    }

    try {
      setStatus(elements.statusMessage, "Processing your CSV now...", "info");
      const fileText = await readFileText(state.selectedFile);
      const processedData = processScheduleCsv(fileText, state.selectedFile.name);
      const snapshot = {
        ...processedData,
        savedAt: new Date().toISOString(),
      };

      renderProcessedData(snapshot);

      try {
        saveState(snapshot);
      } catch {
        setStatus(
          elements.statusMessage,
          "The file was processed successfully, but browser storage could not save this session.",
          "success",
        );
        syncButtons();
        return;
      }

      setStatus(
        elements.statusMessage,
        `Success. ${processedData.cleanedRows.length} appointments are ready after removing ${processedData.duplicatesRemoved} duplicates, ${processedData.cancelledRemoved} cancelled rows, and ${processedData.selfPayRemoved} self-pay placeholders.`,
        "success",
      );
      syncButtons();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while processing the CSV.";
      setStatus(elements.statusMessage, message, "error");
    }
  });

  elements.insuranceToggleButton.addEventListener("click", () => {
    const isCurrentlyOpen = elements.insuranceToggleButton.getAttribute("aria-expanded") === "true";
    updateInsuranceToggle(!isCurrentlyOpen);
  });

  elements.downloadButton.addEventListener("click", () => {
    if (!state.processedData) {
      setStatus(elements.statusMessage, "Process a file before downloading the cleaned CSV.", "error");
      return;
    }

    downloadCleanedCsv(state.processedData);
    setStatus(elements.statusMessage, "Your cleaned CSV download has started.", "success");
  });

  elements.downloadDosButton.addEventListener("click", () => {
    if (!state.processedData || state.selectedDos === DOS_ALL_FILTER) {
      setStatus(elements.statusMessage, "Select a specific DOS before downloading that day's CSV.", "error");
      return;
    }

    const selectedRows = filterRowsByDos(state.processedData.cleanedRows, state.selectedDos);
    if (!selectedRows.length) {
      setStatus(elements.statusMessage, `No appointments are available for DOS ${state.selectedDos}.`, "error");
      return;
    }

    downloadRowsCsv(selectedRows, state.processedData.fileName, `dos-${state.selectedDos}`);
    setStatus(elements.statusMessage, `Your CSV download for DOS ${state.selectedDos} has started.`, "success");
  });

  elements.clearMemoryButton.addEventListener("click", () => {
    clearSavedState();
    elements.memoryBadge.classList.add("hidden");
    elements.clearMemoryButton.disabled = true;
    setStatus(elements.statusMessage, "Saved browser memory has been cleared.", "info");
  });

  const savedState = loadState();
  if (savedState) {
    renderProcessedData(savedState, { restoredAt: formatTimestamp(savedState.savedAt) });
    elements.memoryBadge.classList.remove("hidden");
    elements.fileMeta.textContent = `Restored ${savedState.fileName} from browser memory.`;
    setStatus(
      elements.statusMessage,
      `Saved data restored from ${formatTimestamp(savedState.savedAt) || "a previous session"}.`,
      "success",
    );
  }

  updateInsuranceToggle(true);
  syncButtons();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
}

globalThis.PatientScheduleAssistant = {
  DOS_ALL_FILTER,
  DOS_EMPTY_LABEL,
  OUTPUT_COLUMNS,
  buildCounts,
  buildDosCounts,
  filterRowsByDos,
  isSelfPayPlaceholder,
  normalizeHeader,
  normalizeProcessedSnapshot,
  parseCsv,
  processScheduleCsv,
  toCsv,
};
