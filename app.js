const REQUIRED_REPORT_NAME = "report name scheduled patients list";
const STORAGE_KEY = "help360md.patientScheduleAssistant.v1";
const DOS_ALL_FILTER = "__all_dos__";
const DOS_EMPTY_LABEL = "No DOS Provided";
const ADD_ON_FILTER_ALL = "__all_appointments__";
const ADD_ON_FILTER_ONLY = "__add_ons_only__";
const ADD_ON_FILTER_REGULAR = "__non_add_ons__";
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
  patientid: ["patientid", "patient id", "pt id", "chart id", "chart number"],
  "patient name": ["patient name", "patientname", "full name", "name", "pt name"],
  "appt ins pkg name": [
    "appt ins pkg name",
    "appointment insurance package name",
    "appt insurance package name",
    "insurance package name",
    "ins pkg name",
    "insurance name",
    "payer name",
  ],
  "appt policyidnumber": [
    "appt policyidnumber",
    "appt policy id number",
    "appointment policy id number",
    "policy id number",
    "policyidnumber",
    "member id",
    "subscriber id",
  ],
  patientdob: ["patientdob", "patient dob", "dob", "date of birth", "birth date"],
  appttype: ["appttype", "appt type", "appointment type", "visit type", "appt reason"],
  "svc dprtmnt": [
    "svc dprtmnt",
    "svc department",
    "service department",
    "service dprtmnt",
    "department",
    "dept",
    "location",
    "location department",
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
  "service date",
];

const STATUS_HEADER_ALIASES = [
  "appt status",
  "appointment status",
  "status",
  "apptstatus",
  "appointmentstatus",
  "appt state",
  "appointment state",
  "visit status",
];

const MAPPING_FIELD_DEFINITIONS = [
  {
    key: "patientid",
    label: "patientid",
    selector: "#map-patientid",
    aliases: HEADER_ALIASES.patientid,
    kind: "output",
  },
  {
    key: "patient name",
    label: "patient name",
    selector: "#map-patient-name",
    aliases: HEADER_ALIASES["patient name"],
    kind: "output",
  },
  {
    key: "appt ins pkg name",
    label: "appt ins pkg name",
    selector: "#map-appt-ins-pkg-name",
    aliases: HEADER_ALIASES["appt ins pkg name"],
    kind: "output",
  },
  {
    key: "appt policyidnumber",
    label: "appt policyidnumber",
    selector: "#map-appt-policyidnumber",
    aliases: HEADER_ALIASES["appt policyidnumber"],
    kind: "output",
  },
  {
    key: "patientdob",
    label: "patientdob",
    selector: "#map-patientdob",
    aliases: HEADER_ALIASES.patientdob,
    kind: "output",
  },
  {
    key: "appttype",
    label: "appttype",
    selector: "#map-appttype",
    aliases: HEADER_ALIASES.appttype,
    kind: "output",
  },
  {
    key: "svc dprtmnt",
    label: "svc dprtmnt",
    selector: "#map-svc-dprtmnt",
    aliases: HEADER_ALIASES["svc dprtmnt"],
    kind: "output",
  },
  {
    key: "dos",
    label: "DOS / appointment date",
    selector: "#map-dos",
    aliases: DOS_HEADER_ALIASES,
    kind: "meta",
  },
  {
    key: "status",
    label: "Appointment status",
    selector: "#map-status",
    aliases: STATUS_HEADER_ALIASES,
    kind: "meta",
  },
];

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HEADER_KEYWORDS = new Set(
  [...OUTPUT_COLUMNS, ...DOS_HEADER_ALIASES, ...STATUS_HEADER_ALIASES]
    .flatMap((value) => (HEADER_ALIASES[value] ? HEADER_ALIASES[value] : [value]))
    .map((value) => normalizeHeader(value)),
);

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

function normalizeColumnIndexChoice(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue >= 0 ? numericValue : null;
}

function normalizeMappingIndexes(mappingLike = {}) {
  const normalized = {};

  for (const field of MAPPING_FIELD_DEFINITIONS) {
    normalized[field.key] = normalizeColumnIndexChoice(mappingLike[field.key]);
  }

  return normalized;
}

function normalizeProcessingMeta(meta, rows = []) {
  const hasKnownDosValues = rows.some((row) => normalizeDosValue(row.__dos) !== DOS_EMPTY_LABEL);

  return {
    headerRowIndex: Number.isInteger(meta?.headerRowIndex) ? meta.headerRowIndex : 1,
    hasDosMapping: typeof meta?.hasDosMapping === "boolean" ? meta.hasDosMapping : hasKnownDosValues,
    hasStatusMapping: Boolean(meta?.hasStatusMapping),
    removeDuplicates: meta?.removeDuplicates !== false,
    removeCancelled: meta?.removeCancelled !== false,
    removeSelfPay: meta?.removeSelfPay !== false,
    mapping: normalizeMappingIndexes(meta?.mapping),
    detectedColumns: Array.isArray(meta?.detectedColumns)
      ? meta.detectedColumns.map((header) => normalizeDisplay(header))
      : [],
  };
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

function resolveDosIndex(headerLookup, columns = []) {
  const directMatch = findHeaderIndex(headerLookup, DOS_HEADER_ALIASES);
  if (directMatch >= 0) {
    return directMatch;
  }

  for (const column of columns) {
    const headerName = column.normalizedHeader;
    const looksLikeDos =
      headerName.includes("date") &&
      (headerName.includes("service") || headerName.includes("appt") || headerName.includes("appointment"));

    if (looksLikeDos) {
      return column.index;
    }
  }

  return -1;
}

function resolveStatusIndex(headerLookup, columns = []) {
  const directMatch = findHeaderIndex(headerLookup, STATUS_HEADER_ALIASES);
  if (directMatch >= 0) {
    return directMatch;
  }

  for (const column of columns) {
    const headerName = column.normalizedHeader;
    if (headerName.includes("status") && (headerName.includes("appt") || headerName.includes("appointment"))) {
      return column.index;
    }
  }

  return -1;
}

function buildHeaderLookup(columns) {
  const headerLookup = new Map();

  for (const column of columns) {
    if (!headerLookup.has(column.normalizedHeader)) {
      headerLookup.set(column.normalizedHeader, column.index);
    }

    const uniqueNormalizedHeader = normalizeHeader(column.header);
    if (!headerLookup.has(uniqueNormalizedHeader)) {
      headerLookup.set(uniqueNormalizedHeader, column.index);
    }
  }

  return headerLookup;
}

function makeUniqueLabel(baseLabel, usedLabels) {
  const normalizedBase = normalizeHeader(baseLabel) || baseLabel.toLowerCase();
  const usedCount = usedLabels.get(normalizedBase) || 0;
  usedLabels.set(normalizedBase, usedCount + 1);
  return usedCount === 0 ? baseLabel : `${baseLabel} (${usedCount + 1})`;
}

function previewRow(row) {
  const visibleCells = row.map((cell) => normalizeDisplay(cell)).filter(Boolean).slice(0, 5);
  if (!visibleCells.length) {
    return "(blank row)";
  }

  const preview = visibleCells.join(" | ");
  return preview.length > 96 ? `${preview.slice(0, 93)}...` : preview;
}

function buildHeaderRowChoices(rawRows) {
  const choiceLimit = Math.min(rawRows.length, 30);

  return Array.from({ length: choiceLimit }, (_, index) => ({
    index,
    label: `Row ${index + 1}: ${previewRow(rawRows[index] ?? [])}`,
  }));
}

function guessHeaderRowIndex(rawRows) {
  if (!rawRows.length) {
    return 0;
  }

  if (normalizeHeader(rawRows[0]?.[0]) === REQUIRED_REPORT_NAME && rawRows.length > 1) {
    return 1;
  }

  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  const searchLimit = Math.min(rawRows.length, 16);

  for (let index = 0; index < searchLimit; index += 1) {
    const row = rawRows[index] ?? [];
    const normalizedCells = row.map((cell) => normalizeHeader(cell)).filter(Boolean);
    const nonEmptyCount = normalizedCells.length;

    if (!nonEmptyCount) {
      continue;
    }

    const exactMatches = normalizedCells.filter((cell) => HEADER_KEYWORDS.has(cell)).length;
    const fuzzyMatches = normalizedCells.filter((cell) =>
      cell.includes("patient") ||
      cell.includes("appt") ||
      cell.includes("appointment") ||
      cell.includes("policy") ||
      cell.includes("insurance") ||
      cell.includes("department") ||
      cell.includes("status") ||
      cell.includes("dob") ||
      cell.includes("date"),
    ).length;

    let score = exactMatches * 12 + fuzzyMatches * 3 + Math.min(nonEmptyCount, 12) - index * 0.25;

    if (nonEmptyCount === 1) {
      score -= 8;
    }

    if (normalizedCells.some((cell) => cell.includes("report name"))) {
      score -= 12;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function buildCsvModelFromRows(rawRows, requestedHeaderRowIndex = 0) {
  if (!rawRows.length) {
    throw new Error("This file does not contain any readable rows.");
  }

  const boundedHeaderRowIndex = Math.max(0, Math.min(rawRows.length - 1, Number(requestedHeaderRowIndex) || 0));
  const maxColumns = rawRows.reduce((largest, row) => Math.max(largest, row.length), 0);
  const headerSourceRow = rawRows[boundedHeaderRowIndex] ?? [];
  const usedLabels = new Map();
  const columns = [];

  for (let index = 0; index < maxColumns; index += 1) {
    const rawHeader = normalizeDisplay(headerSourceRow[index]);
    const baseLabel = rawHeader || `Column ${index + 1}`;

    columns.push({
      index,
      rawHeader,
      header: makeUniqueLabel(baseLabel, usedLabels),
      normalizedHeader: normalizeHeader(rawHeader || `Column ${index + 1}`),
    });
  }

  return {
    rawRows,
    headerRowIndex: boundedHeaderRowIndex,
    headerRowChoices: buildHeaderRowChoices(rawRows),
    columns,
    dataRows: rawRows.slice(boundedHeaderRowIndex + 1),
  };
}

function buildCsvModel(csvText, requestedHeaderRowIndex = null) {
  const rawRows = parseCsv(csvText);
  if (!rawRows.length) {
    throw new Error("This file does not contain any readable rows.");
  }

  const defaultHeaderRowIndex =
    requestedHeaderRowIndex === null || typeof requestedHeaderRowIndex === "undefined"
      ? guessHeaderRowIndex(rawRows)
      : requestedHeaderRowIndex;

  return buildCsvModelFromRows(rawRows, defaultHeaderRowIndex);
}

function buildAutoMapping(model) {
  const headerLookup = buildHeaderLookup(model.columns);
  const mapping = {};

  for (const field of MAPPING_FIELD_DEFINITIONS) {
    if (field.key === "dos") {
      const dosIndex = resolveDosIndex(headerLookup, model.columns);
      mapping[field.key] = dosIndex >= 0 ? dosIndex : null;
      continue;
    }

    if (field.key === "status") {
      const statusIndex = resolveStatusIndex(headerLookup, model.columns);
      mapping[field.key] = statusIndex >= 0 ? statusIndex : null;
      continue;
    }

    const matchIndex = findHeaderIndex(headerLookup, field.aliases);
    mapping[field.key] = matchIndex >= 0 ? matchIndex : null;
  }

  return normalizeMappingIndexes(mapping);
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

function getCellValue(sourceRow, columnIndex) {
  if (!Number.isInteger(columnIndex) || columnIndex < 0) {
    return "";
  }

  return normalizeDisplay(sourceRow[columnIndex]);
}

function isMeaningfulSourceRow(sourceRow, relevantIndexes) {
  if (!relevantIndexes.length) {
    return sourceRow.some((cell) => normalizeDisplay(cell) !== "");
  }

  return relevantIndexes.some((index) => getCellValue(sourceRow, index) !== "");
}

function makePatientIdentityKey(row) {
  const patientId = normalizeDisplay(row.patientid);
  if (patientId) {
    return patientId.toLowerCase();
  }

  const nameAndDob = [normalizeDisplay(row["patient name"]), normalizeDisplay(row.patientdob)]
    .filter(Boolean)
    .join("|");
  if (nameAndDob) {
    return nameAndDob.toLowerCase();
  }

  const fallbackIdentity = [
    normalizeDisplay(row["patient name"]),
    normalizeDisplay(row["appt policyidnumber"]),
    normalizeDisplay(row["appt ins pkg name"]),
    normalizeDisplay(row.appttype),
    normalizeDisplay(row["svc dprtmnt"]),
  ]
    .filter(Boolean)
    .join("|");

  return fallbackIdentity.toLowerCase();
}

function makeDeduplicationKey(row, dos, options = {}) {
  const patientKey = makePatientIdentityKey(row);
  if (!patientKey) {
    return "";
  }

  if (options.includeDos !== false && normalizeDisplay(dos)) {
    return `${patientKey}::${normalizeDisplay(dos).toLowerCase()}`;
  }

  return patientKey;
}

function sortRowsByPatientName(rows) {
  return [...rows].sort((left, right) => {
    const leftName = normalizeDisplay(left["patient name"]);
    const rightName = normalizeDisplay(right["patient name"]);
    const primaryCompare = (leftName || normalizeDisplay(left.patientid)).localeCompare(
      rightName || normalizeDisplay(right.patientid),
      undefined,
      { sensitivity: "base" },
    );

    if (primaryCompare !== 0) {
      return primaryCompare;
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

function makeAppointmentComparisonKey(row) {
  const normalizedDos = normalizeDosValue(row.__dos);
  return makeDeduplicationKey(row, normalizedDos === DOS_EMPTY_LABEL ? "" : normalizedDos);
}

function buildAddOnInsight(rows, comparisonBase = null, meta = {}) {
  const normalizedMeta = normalizeProcessingMeta(meta, rows);
  const addOnRows = rows.filter((row) => row.__isAddOn);
  const comparisonRows = Array.isArray(comparisonBase?.cleanedRows) ? comparisonBase.cleanedRows : [];

  return {
    available: Array.isArray(comparisonBase?.cleanedRows),
    baselineFileName: comparisonBase?.fileName || "",
    baselineSavedAt: comparisonBase?.savedAt || "",
    baselineCount: comparisonRows.length,
    addOnCount: addOnRows.length,
    regularCount: Math.max(0, rows.length - addOnRows.length),
    addOnDosCounts: normalizedMeta.hasDosMapping ? buildDosCounts(addOnRows) : [],
  };
}

function looksCancelled(value) {
  return normalizeHeader(value).includes("cancel");
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

function buildSummary(cleanedRows, appointmentCounts, insuranceCounts, dosCounts, addOnInsight, meta = {}) {
  const normalizedMeta = normalizeProcessingMeta(meta, cleanedRows);

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
    addOnCount: addOnInsight.addOnCount,
    appointmentTypeCount: appointmentCounts.length,
    dosCount: normalizedMeta.hasDosMapping ? dosCounts.length : 0,
    insurancePlanCount: insuranceCounts.length,
  };
}

function buildProcessedSnapshot(processedData, comparisonBase = null) {
  const normalizedMeta = normalizeProcessingMeta(processedData.meta, processedData.cleanedRows);
  const appointmentCounts = buildCounts(processedData.cleanedRows, "appttype");
  const insuranceCounts = buildCounts(processedData.cleanedRows, "appt ins pkg name");
  const dosCounts = normalizedMeta.hasDosMapping ? buildDosCounts(processedData.cleanedRows) : [];
  const addOnInsight = buildAddOnInsight(processedData.cleanedRows, comparisonBase, normalizedMeta);

  return {
    ...processedData,
    meta: normalizedMeta,
    appointmentCounts,
    insuranceCounts,
    dosCounts,
    addOnInsight,
    summary: buildSummary(processedData.cleanedRows, appointmentCounts, insuranceCounts, dosCounts, addOnInsight, normalizedMeta),
  };
}

function normalizeProcessedSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.cleanedRows)) {
    return null;
  }

  const normalizedRows = snapshot.cleanedRows.map((row) => ({
    ...row,
    __dos: normalizeDosValue(row.__dos),
    __isAddOn: Boolean(row.__isAddOn),
  }));
  const normalizedMeta = normalizeProcessingMeta(snapshot.meta, normalizedRows);
  const baseSnapshot = buildProcessedSnapshot(
    {
      ...snapshot,
      sourceRowsRead: Number(snapshot.sourceRowsRead) || normalizedRows.length,
      duplicatesRemoved: Number(snapshot.duplicatesRemoved) || 0,
      cancelledRemoved: Number(snapshot.cancelledRemoved) || 0,
      selfPayRemoved: Number(snapshot.selfPayRemoved) || 0,
      cleanedRows: normalizedRows,
      meta: normalizedMeta,
    },
  );
  const restoredAddOnInsight = snapshot.addOnInsight && typeof snapshot.addOnInsight === "object"
    ? {
      ...baseSnapshot.addOnInsight,
      available: Boolean(snapshot.addOnInsight.available),
      baselineFileName: normalizeDisplay(snapshot.addOnInsight.baselineFileName),
      baselineSavedAt: snapshot.addOnInsight.baselineSavedAt || "",
      baselineCount: Number(snapshot.addOnInsight.baselineCount) || 0,
      addOnDosCounts: normalizedMeta.hasDosMapping
        ? Array.isArray(snapshot.addOnInsight.addOnDosCounts)
          ? snapshot.addOnInsight.addOnDosCounts
          : baseSnapshot.addOnInsight.addOnDosCounts
        : [],
    }
    : baseSnapshot.addOnInsight;

  return {
    ...baseSnapshot,
    addOnInsight: restoredAddOnInsight,
    summary: buildSummary(
      baseSnapshot.cleanedRows,
      baseSnapshot.appointmentCounts,
      baseSnapshot.insuranceCounts,
      baseSnapshot.dosCounts,
      restoredAddOnInsight,
      normalizedMeta,
    ),
  };
}

function countMappedOutputs(mapping) {
  return OUTPUT_COLUMNS.filter((columnName) => Number.isInteger(mapping[columnName])).length;
}

function hasIdentityMapping(mapping) {
  return Boolean(
    Number.isInteger(mapping.patientid) ||
      Number.isInteger(mapping["patient name"]) ||
      Number.isInteger(mapping.patientdob) ||
      Number.isInteger(mapping["appt policyidnumber"]),
  );
}

function validateMappingConfig(config) {
  const mappedOutputCount = countMappedOutputs(config.mapping);

  if (!mappedOutputCount) {
    return {
      valid: false,
      message: "Map at least one output column before processing this report.",
    };
  }

  return {
    valid: true,
    message: "",
  };
}

function processCsvModel(model, config, fileName = "schedule.csv") {
  const normalizedMapping = normalizeMappingIndexes(config.mapping);
  const options = {
    removeDuplicates: config.options?.removeDuplicates !== false,
    removeCancelled: config.options?.removeCancelled !== false,
    removeSelfPay: config.options?.removeSelfPay !== false,
  };
  const validation = validateMappingConfig({ mapping: normalizedMapping, options });

  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const relevantIndexes = [...new Set(
    MAPPING_FIELD_DEFINITIONS
      .map((field) => normalizedMapping[field.key])
      .filter((index) => Number.isInteger(index)),
  )];
  const hasDosMapping = Number.isInteger(normalizedMapping.dos);
  const cleanedRows = [];
  const seenKeys = new Set();
  let duplicatesRemoved = 0;
  let cancelledRemoved = 0;
  let selfPayRemoved = 0;
  let sourceRowsRead = 0;

  for (const sourceRow of model.dataRows) {
    if (!isMeaningfulSourceRow(sourceRow, relevantIndexes)) {
      continue;
    }

    sourceRowsRead += 1;

    const cleanedRow = {};
    for (const columnName of OUTPUT_COLUMNS) {
      cleanedRow[columnName] = getCellValue(sourceRow, normalizedMapping[columnName]);
    }

    if (options.removeSelfPay && isSelfPayPlaceholder(cleanedRow)) {
      selfPayRemoved += 1;
      continue;
    }

    const statusValue = getCellValue(sourceRow, normalizedMapping.status);
    if (options.removeCancelled && (looksCancelled(statusValue) || looksCancelled(cleanedRow.appttype))) {
      cancelledRemoved += 1;
      continue;
    }

    const rawDosValue = getCellValue(sourceRow, normalizedMapping.dos);
    cleanedRow.__dos = hasDosMapping ? normalizeDosValue(rawDosValue) : DOS_EMPTY_LABEL;
    cleanedRow.__isAddOn = false;

    if (options.removeDuplicates) {
      const dedupeKey = makeDeduplicationKey(cleanedRow, hasDosMapping ? rawDosValue : "", {
        includeDos: hasDosMapping,
      });

      if (dedupeKey && seenKeys.has(dedupeKey)) {
        duplicatesRemoved += 1;
        continue;
      }

      if (dedupeKey) {
        seenKeys.add(dedupeKey);
      }
    }

    cleanedRows.push(cleanedRow);
  }

  const sortedRows = sortRowsByPatientName(cleanedRows);

  return buildProcessedSnapshot({
    fileName,
    sourceRowsRead,
    duplicatesRemoved,
    cancelledRemoved,
    selfPayRemoved,
    cleanedRows: sortedRows,
    meta: {
      headerRowIndex: model.headerRowIndex,
      hasDosMapping,
      hasStatusMapping: Number.isInteger(normalizedMapping.status),
      removeDuplicates: options.removeDuplicates,
      removeCancelled: options.removeCancelled,
      removeSelfPay: options.removeSelfPay,
      mapping: normalizedMapping,
      detectedColumns: model.columns.map((column) => column.header),
    },
  });
}

function processScheduleCsv(csvText, fileName = "schedule.csv") {
  const rawRows = parseCsv(csvText);

  if (rawRows.length < 2) {
    throw new Error("This file does not have enough rows to detect headers and patient rows.");
  }

  if (normalizeHeader(rawRows[0]?.[0]) === REQUIRED_REPORT_NAME) {
    const athenaModel = buildCsvModelFromRows(rawRows, 1);
    return processCsvModel(
      athenaModel,
      {
        mapping: buildAutoMapping(athenaModel),
        options: {
          removeDuplicates: true,
          removeCancelled: true,
          removeSelfPay: true,
        },
      },
      fileName,
    );
  }

  const genericModel = buildCsvModelFromRows(rawRows, guessHeaderRowIndex(rawRows));
  return processCsvModel(
    genericModel,
    {
      mapping: buildAutoMapping(genericModel),
      options: {
        removeDuplicates: true,
        removeCancelled: true,
        removeSelfPay: true,
      },
    },
    fileName,
  );
}

function applyAddOnComparison(processedData, comparisonBase = null) {
  const hasComparisonBase = Array.isArray(comparisonBase?.cleanedRows);
  const comparisonKeys = new Set(
    hasComparisonBase
      ? comparisonBase.cleanedRows
        .map((row) =>
          makeAppointmentComparisonKey({
            ...row,
            __dos: normalizeDosValue(row.__dos),
          }),
        )
        .filter(Boolean)
      : [],
  );

  const comparedRows = processedData.cleanedRows.map((row) => {
    if (!hasComparisonBase) {
      return {
        ...row,
        __isAddOn: false,
      };
    }

    const comparisonKey = makeAppointmentComparisonKey(row);
    return {
      ...row,
      __isAddOn: comparisonKey ? !comparisonKeys.has(comparisonKey) : false,
    };
  });

  return buildProcessedSnapshot(
    {
      ...processedData,
      cleanedRows: comparedRows,
    },
    comparisonBase,
  );
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

function renderDosFilters(container, dosCounts, selectedDos, meta = {}) {
  const normalizedMeta = normalizeProcessingMeta(meta);

  if (!normalizedMeta.hasDosMapping) {
    container.innerHTML = '<div class="empty-state-card">Map a DOS or appointment date column to filter the schedule by date.</div>';
    return;
  }

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

function renderAddOnFilters(container, addOnInsight, selectedAddOnFilter) {
  if (!addOnInsight.available) {
    container.innerHTML = '<div class="empty-state-card">Process a later version of this sheet to compare and find add-ons since the last upload.</div>';
    return;
  }

  const filters = [
    {
      value: ADD_ON_FILTER_ALL,
      label: "All Appointments",
      count: addOnInsight.addOnCount + addOnInsight.regularCount,
    },
    {
      value: ADD_ON_FILTER_ONLY,
      label: "New Add-Ons",
      count: addOnInsight.addOnCount,
    },
    {
      value: ADD_ON_FILTER_REGULAR,
      label: "Previously Seen",
      count: addOnInsight.regularCount,
    },
  ];

  container.innerHTML = filters
    .map(
      (item) => `
        <button
          class="dos-filter-button${selectedAddOnFilter === item.value ? " is-active" : ""}"
          type="button"
          data-add-on-filter="${escapeHtml(item.value)}"
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

function filterRowsByAddOn(rows, selectedAddOnFilter) {
  if (!selectedAddOnFilter || selectedAddOnFilter === ADD_ON_FILTER_ALL) {
    return rows;
  }

  if (selectedAddOnFilter === ADD_ON_FILTER_ONLY) {
    return rows.filter((row) => row.__isAddOn);
  }

  if (selectedAddOnFilter === ADD_ON_FILTER_REGULAR) {
    return rows.filter((row) => !row.__isAddOn);
  }

  return rows;
}

function renderTable(body, rows, options = {}) {
  const emptyMessage = options.emptyMessage || "No patient rows were found after processing this file.";
  const showDosBadge = options.showDosBadge !== false;
  const showAddOnBadge = options.showAddOnBadge !== false;

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
                    ${showDosBadge ? `<span class="dos-badge">DOS: ${escapeHtml(normalizeDosValue(row.__dos))}</span>` : ""}
                    ${showAddOnBadge && row.__isAddOn ? '<span class="dos-badge">New Since Last Upload</span>' : ""}
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

function renderAddOnStatus(statusElement, processedData) {
  const { addOnInsight, cleanedRows } = processedData;

  if (!addOnInsight.available) {
    setStatus(
      statusElement,
      "This is your first saved upload in the comparison cycle. Upload the same sheet again later and the tool will flag newly added patients as add-ons.",
      "info",
    );
    return;
  }

  const tone = addOnInsight.addOnCount > 0 ? "success" : "info";
  const baselineTime = formatTimestamp(addOnInsight.baselineSavedAt);
  setStatus(
    statusElement,
    `${addOnInsight.addOnCount} add-ons found by comparing this upload against ${addOnInsight.baselineFileName || "the last saved upload"}${baselineTime ? ` from ${baselineTime}` : ""}. ${cleanedRows.length} current appointments were checked against ${addOnInsight.baselineCount} appointments in that earlier upload.`,
    tone,
  );
}

function renderAddOnDosCounts(container, processedData) {
  if (!processedData.meta.hasDosMapping) {
    container.innerHTML = '<div class="empty-state-card">Map a DOS column to see add-on counts by date.</div>';
    return;
  }

  if (!processedData.addOnInsight.available) {
    container.innerHTML = '<div class="empty-state-card">Add-on counts by DOS will appear here after a later upload is compared.</div>';
    return;
  }

  if (!processedData.addOnInsight.addOnDosCounts.length) {
    container.innerHTML = '<div class="empty-state-card">No new add-ons were found in this upload.</div>';
    return;
  }

  renderCounts(container, processedData.addOnInsight.addOnDosCounts);
}

function updateOverview(summaryElements, processedData) {
  summaryElements.totalAppointments.textContent = String(processedData.summary.totalAppointments);
  summaryElements.duplicatesRemoved.textContent = String(processedData.duplicatesRemoved);
  summaryElements.cancelledRemoved.textContent = String(processedData.cancelledRemoved);
  summaryElements.selfPayRemoved.textContent = String(processedData.selfPayRemoved);
  summaryElements.addOnCount.textContent = String(processedData.summary.addOnCount);
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

function populateHeaderRowSelect(selectElement, choices, selectedIndex) {
  selectElement.innerHTML = choices
    .map(
      (choice) => `
        <option value="${choice.index}"${choice.index === selectedIndex ? " selected" : ""}>
          ${escapeHtml(choice.label)}
        </option>
      `,
    )
    .join("");
}

function populateMappingSelect(selectElement, columns, selectedIndex, optionalLabel = "Ignore this field") {
  const options = [
    `<option value="">${escapeHtml(optionalLabel)}</option>`,
    ...columns.map(
      (column) => `
        <option value="${column.index}"${column.index === selectedIndex ? " selected" : ""}>
          ${escapeHtml(`Column ${column.index + 1} - ${column.header}`)}
        </option>
      `,
    ),
  ];

  selectElement.innerHTML = options.join("");
}

function setMappingControlsEnabled(elements, isEnabled) {
  elements.headerRowSelect.disabled = !isEnabled;

  for (const field of MAPPING_FIELD_DEFINITIONS) {
    elements.mappingSelects[field.key].disabled = !isEnabled;
  }

  elements.removeDuplicatesOption.disabled = !isEnabled;
  elements.removeCancelledOption.disabled = !isEnabled;
  elements.removeSelfPayOption.disabled = !isEnabled;
}

function renderDetectedColumns(container, model) {
  if (!model) {
    container.innerHTML = "Upload a file to review the detected columns and mapping options.";
    return;
  }

  const summary = `
    <p class="detected-columns-summary">
      ${model.columns.length} columns detected using row ${model.headerRowIndex + 1} as the header row.
      ${model.dataRows.length} patient/data row${model.dataRows.length === 1 ? "" : "s"} are available below it.
    </p>
  `;
  const pills = `
    <div class="detected-columns-list">
      ${model.columns
        .map(
          (column) => `
            <span class="detected-column-pill">
              <span class="detected-column-index">C${column.index + 1}</span>
              <span>${escapeHtml(column.header)}</span>
            </span>
          `,
        )
        .join("")}
    </div>
  `;

  container.innerHTML = `${summary}${pills}`;
}

function readMappingConfig(elements) {
  const mapping = {};

  for (const field of MAPPING_FIELD_DEFINITIONS) {
    mapping[field.key] = normalizeColumnIndexChoice(elements.mappingSelects[field.key].value);
  }

  return {
    mapping: normalizeMappingIndexes(mapping),
    options: {
      removeDuplicates: elements.removeDuplicatesOption.checked,
      removeCancelled: elements.removeCancelledOption.checked,
      removeSelfPay: elements.removeSelfPayOption.checked,
    },
  };
}

function buildMappingMessage(config) {
  const validation = validateMappingConfig(config);
  if (!validation.valid) {
    return {
      tone: "error",
      message: validation.message,
    };
  }

  const details = [];

  if (!Number.isInteger(config.mapping.dos)) {
    details.push("DOS filters and DOS-only downloads will stay hidden until you map a date column.");
  }

  if (config.options.removeCancelled &&
    !Number.isInteger(config.mapping.status) &&
    !Number.isInteger(config.mapping.appttype)
  ) {
    details.push("Cancelled appointment removal may be limited because no status or appointment type column is mapped.");
  }

  if (config.options.removeDuplicates && !hasIdentityMapping(config.mapping)) {
    details.push("Duplicate removal will use the available mapped output fields because patient ID and patient name are not mapped.");
  }

  return {
    tone: "info",
    message: `Mapping ready. ${countMappedOutputs(config.mapping)} output column${countMappedOutputs(config.mapping) === 1 ? "" : "s"} mapped. Click Process to apply this setup.${details.length ? ` ${details.join(" ")}` : ""}`,
  };
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
    headerRowSelect: document.querySelector("#headerRowSelect"),
    detectedColumns: document.querySelector("#detectedColumns"),
    removeDuplicatesOption: document.querySelector("#removeDuplicatesOption"),
    removeCancelledOption: document.querySelector("#removeCancelledOption"),
    removeSelfPayOption: document.querySelector("#removeSelfPayOption"),
    dosFilters: document.querySelector("#dosFilters"),
    addOnStatus: document.querySelector("#addOnStatus"),
    addOnFilters: document.querySelector("#addOnFilters"),
    dosCounts: document.querySelector("#dosCounts"),
    addOnDosCounts: document.querySelector("#addOnDosCounts"),
    dosSelectionSummary: document.querySelector("#dosSelectionSummary"),
    appointmentCounts: document.querySelector("#appointmentCounts"),
    insuranceCounts: document.querySelector("#insuranceCounts"),
    insuranceCountsWrap: document.querySelector("#insuranceCountsWrap"),
    insuranceToggleButton: document.querySelector("#insuranceToggleButton"),
    resultsBody: document.querySelector("#resultsBody"),
    tableSummary: document.querySelector("#tableSummary"),
  };

  elements.mappingSelects = Object.fromEntries(
    MAPPING_FIELD_DEFINITIONS.map((field) => [field.key, document.querySelector(field.selector)]),
  );

  const summaryElements = {
    totalAppointments: document.querySelector("#totalAppointments"),
    duplicatesRemoved: document.querySelector("#duplicatesRemoved"),
    cancelledRemoved: document.querySelector("#cancelledRemoved"),
    selfPayRemoved: document.querySelector("#selfPayRemoved"),
    addOnCount: document.querySelector("#addOnCount"),
    newPatientCount: document.querySelector("#newPatientCount"),
    establishedPatientCount: document.querySelector("#establishedPatientCount"),
    wellnessExamCount: document.querySelector("#wellnessExamCount"),
    appointmentTypeCount: document.querySelector("#appointmentTypeCount"),
    dosCount: document.querySelector("#dosCount"),
    insurancePlanCount: document.querySelector("#insurancePlanCount"),
  };

  const state = {
    selectedFile: null,
    csvModel: null,
    rawRows: [],
    processedData: null,
    selectedDos: DOS_ALL_FILTER,
    selectedAddOnFilter: ADD_ON_FILTER_ALL,
    pendingReadId: 0,
  };

  function getCurrentVisibleRows() {
    if (!state.processedData) {
      return [];
    }

    return filterRowsByAddOn(
      filterRowsByDos(state.processedData.cleanedRows, state.selectedDos),
      state.selectedAddOnFilter,
    );
  }

  function syncButtons() {
    const mappingConfig = readMappingConfig(elements);
    const mappingValid = state.csvModel ? validateMappingConfig(mappingConfig).valid : false;

    elements.processButton.disabled = !state.selectedFile || !state.csvModel || !mappingValid;
    elements.downloadButton.disabled = !state.processedData;
    elements.downloadDosButton.disabled =
      !state.processedData ||
      !state.processedData.meta.hasDosMapping ||
      state.selectedDos === DOS_ALL_FILTER ||
      getCurrentVisibleRows().length === 0;
    elements.clearMemoryButton.disabled = !loadState();
  }

  function updateInsuranceToggle(isOpen) {
    elements.insuranceCountsWrap.hidden = !isOpen;
    elements.insuranceToggleButton.setAttribute("aria-expanded", String(isOpen));
    elements.insuranceToggleButton.textContent = isOpen ? "Hide" : "Show";
  }

  function updateDosDownloadButton() {
    const hasSpecificDos = Boolean(state.processedData) &&
      state.processedData.meta.hasDosMapping &&
      state.selectedDos !== DOS_ALL_FILTER;

    elements.downloadDosButton.disabled = !hasSpecificDos;
    if (!hasSpecificDos) {
      elements.downloadDosButton.textContent = "Download Selected DOS";
      return;
    }

    const suffix =
      state.selectedAddOnFilter === ADD_ON_FILTER_ONLY
        ? " New Add-Ons"
        : state.selectedAddOnFilter === ADD_ON_FILTER_REGULAR
          ? " Previously Seen"
          : "";
    elements.downloadDosButton.textContent = `Download ${state.selectedDos}${suffix}`;
  }

  function renderFilteredTableView() {
    if (!state.processedData) {
      renderTable(elements.resultsBody, [], { emptyMessage: "No processed data yet." });
      elements.tableSummary.textContent = "No processed data yet.";
      elements.dosSelectionSummary.textContent = "Select a DOS filter to review that day and download only that DOS.";
      updateDosDownloadButton();
      return;
    }

    const filteredRows = getCurrentVisibleRows();
    const hasDosMapping = state.processedData.meta.hasDosMapping;

    renderTable(elements.resultsBody, filteredRows, {
      emptyMessage:
        state.selectedDos === DOS_ALL_FILTER
          ? state.selectedAddOnFilter === ADD_ON_FILTER_ONLY
            ? "No new add-ons were found after comparing this upload."
            : state.selectedAddOnFilter === ADD_ON_FILTER_REGULAR
              ? "No previously seen appointments were found after comparing this upload."
              : "No patient rows were found after processing this file."
          : `No patient rows match the current filters for DOS ${state.selectedDos}.`,
      showDosBadge: hasDosMapping,
    });

    const dosSummary = !hasDosMapping
      ? "No DOS column is mapped for this upload."
      : state.selectedDos === DOS_ALL_FILTER
        ? `Showing all ${state.processedData.summary.dosCount} DOS values.`
        : `Showing patients for DOS ${state.selectedDos}.`;
    const addOnSummary =
      state.selectedAddOnFilter === ADD_ON_FILTER_ONLY
        ? "Add-on filter: New appointments only."
        : state.selectedAddOnFilter === ADD_ON_FILTER_REGULAR
          ? "Add-on filter: Previously seen appointments only."
          : "Add-on filter: All appointments.";

    elements.tableSummary.textContent =
      `${filteredRows.length} appointments visible from ${state.processedData.cleanedRows.length} cleaned appointments. Removed ${state.processedData.duplicatesRemoved} duplicates, ${state.processedData.cancelledRemoved} cancelled appointments, and ${state.processedData.selfPayRemoved} self-pay placeholders. ${dosSummary} ${addOnSummary}`;

    elements.dosSelectionSummary.textContent = !hasDosMapping
      ? "A DOS column was not mapped for this file, so DOS filters and DOS-only downloads are unavailable."
      : !state.processedData.addOnInsight.available
        ? `Select a DOS filter to download only that date. ${state.processedData.summary.dosCount} unique DOS values are available.`
        : state.selectedDos === DOS_ALL_FILTER
          ? `${state.processedData.addOnInsight.addOnCount} add-ons were found across ${state.processedData.summary.dosCount} DOS values. Select a DOS to download that date.`
          : `${filteredRows.length} appointments are currently visible for DOS ${state.selectedDos}.`;

    updateDosDownloadButton();
    syncButtons();
  }

  function renderProcessedData(processedData, options = {}) {
    const normalizedData = normalizeProcessedSnapshot(processedData);
    state.processedData = normalizedData;
    state.selectedDos = options.keepSelectedDos &&
      normalizedData.meta.hasDosMapping &&
      normalizedData.dosCounts.some((item) => item.label === state.selectedDos)
      ? state.selectedDos
      : DOS_ALL_FILTER;
    state.selectedAddOnFilter = options.keepSelectedAddOn && normalizedData.addOnInsight.available
      ? state.selectedAddOnFilter
      : ADD_ON_FILTER_ALL;

    renderDosFilters(elements.dosFilters, normalizedData.dosCounts, state.selectedDos, normalizedData.meta);
    renderAddOnStatus(elements.addOnStatus, normalizedData);
    renderAddOnFilters(elements.addOnFilters, normalizedData.addOnInsight, state.selectedAddOnFilter);
    if (normalizedData.meta.hasDosMapping) {
      renderCounts(elements.dosCounts, normalizedData.dosCounts);
    } else {
      elements.dosCounts.innerHTML = '<div class="empty-state-card">Map a DOS column to see appointment counts by date.</div>';
    }
    renderAddOnDosCounts(elements.addOnDosCounts, normalizedData);
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

  function resetMappingUi() {
    elements.headerRowSelect.innerHTML = '<option value="">Upload a file first</option>';

    for (const field of MAPPING_FIELD_DEFINITIONS) {
      populateMappingSelect(elements.mappingSelects[field.key], [], null);
    }

    renderDetectedColumns(elements.detectedColumns, null);
    setMappingControlsEnabled(elements, false);
  }

  function applyModelToUi(model, mapping = buildAutoMapping(model)) {
    state.csvModel = model;
    state.rawRows = model.rawRows;
    populateHeaderRowSelect(elements.headerRowSelect, model.headerRowChoices, model.headerRowIndex);

    for (const field of MAPPING_FIELD_DEFINITIONS) {
      populateMappingSelect(elements.mappingSelects[field.key], model.columns, mapping[field.key]);
    }

    renderDetectedColumns(elements.detectedColumns, model);
    setMappingControlsEnabled(elements, true);
  }

  function refreshMappingStatus(messageOverride = "") {
    if (!state.selectedFile || !state.csvModel) {
      syncButtons();
      return;
    }

    if (messageOverride) {
      setStatus(elements.statusMessage, messageOverride, "info");
      syncButtons();
      return;
    }

    const mappingMessage = buildMappingMessage(readMappingConfig(elements));
    setStatus(elements.statusMessage, mappingMessage.message, mappingMessage.tone);
    syncButtons();
  }

  elements.uploadButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.csvFileInput.click();
    }
  });

  elements.csvFileInput.addEventListener("change", async () => {
    const fileList = elements.csvFileInput.files || [];
    const selectedFile = fileList[0];
    state.selectedFile = selectedFile ?? null;
    state.csvModel = null;
    state.rawRows = [];
    elements.memoryBadge.classList.add("hidden");

    if (!selectedFile) {
      elements.fileMeta.textContent = "No file selected yet.";
      setStatus(elements.statusMessage, "Choose a CSV file to get started.", "info");
      resetMappingUi();
      syncButtons();
      return;
    }

    const currentReadId = state.pendingReadId + 1;
    state.pendingReadId = currentReadId;
    const fileSizeKb = `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`;
    elements.fileMeta.textContent = `${selectedFile.name} selected (${fileSizeKb}).`;
    setStatus(elements.statusMessage, "Reading your file and detecting columns...", "info");
    resetMappingUi();
    syncButtons();

    try {
      const fileText = await readFileText(selectedFile);
      if (state.pendingReadId !== currentReadId) {
        return;
      }

      const csvModel = buildCsvModel(fileText);
      applyModelToUi(csvModel);
      elements.fileMeta.textContent = `${selectedFile.name} selected (${fileSizeKb}). ${csvModel.columns.length} columns detected.`;
      refreshMappingStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "This file could not be prepared for processing.";
      setStatus(elements.statusMessage, message, "error");
      resetMappingUi();
      syncButtons();
    }
  });

  elements.headerRowSelect.addEventListener("change", () => {
    if (!state.rawRows.length) {
      return;
    }

    const selectedHeaderRowIndex = normalizeColumnIndexChoice(elements.headerRowSelect.value) ?? 0;
    const updatedModel = buildCsvModelFromRows(state.rawRows, selectedHeaderRowIndex);
    applyModelToUi(updatedModel);
    refreshMappingStatus("Header row updated. Review the detected columns and click Process when the mapping looks right.");
  });

  for (const field of MAPPING_FIELD_DEFINITIONS) {
    elements.mappingSelects[field.key].addEventListener("change", () => {
      refreshMappingStatus("Mapping updated. Click Process to apply this setup to the uploaded report.");
    });
  }

  [elements.removeDuplicatesOption, elements.removeCancelledOption, elements.removeSelfPayOption].forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      refreshMappingStatus("Processing options updated. Click Process to apply the new settings.");
    });
  });

  elements.dosFilters.addEventListener("click", (event) => {
    const filterButton = event.target.closest("[data-dos-filter]");
    if (!filterButton || !state.processedData || !state.processedData.meta.hasDosMapping) {
      return;
    }

    state.selectedDos = filterButton.getAttribute("data-dos-filter") || DOS_ALL_FILTER;
    renderDosFilters(elements.dosFilters, state.processedData.dosCounts, state.selectedDos, state.processedData.meta);
    renderFilteredTableView();
  });

  elements.addOnFilters.addEventListener("click", (event) => {
    const filterButton = event.target.closest("[data-add-on-filter]");
    if (!filterButton || !state.processedData || !state.processedData.addOnInsight.available) {
      return;
    }

    state.selectedAddOnFilter = filterButton.getAttribute("data-add-on-filter") || ADD_ON_FILTER_ALL;
    renderAddOnFilters(elements.addOnFilters, state.processedData.addOnInsight, state.selectedAddOnFilter);
    renderFilteredTableView();
  });

  elements.processButton.addEventListener("click", () => {
    if (!state.selectedFile || !state.csvModel) {
      setStatus(elements.statusMessage, "Please choose a CSV file before processing.", "error");
      return;
    }

    try {
      const mappingConfig = readMappingConfig(elements);
      const validation = validateMappingConfig(mappingConfig);

      if (!validation.valid) {
        setStatus(elements.statusMessage, validation.message, "error");
        return;
      }

      setStatus(elements.statusMessage, "Processing your CSV now...", "info");
      const comparisonBase = loadState();
      const processedData = applyAddOnComparison(
        processCsvModel(state.csvModel, mappingConfig, state.selectedFile.name),
        comparisonBase,
      );
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
        `Success. ${processedData.cleanedRows.length} appointments are ready after removing ${processedData.duplicatesRemoved} duplicates, ${processedData.cancelledRemoved} cancelled rows, and ${processedData.selfPayRemoved} self-pay placeholders.${processedData.addOnInsight.available ? ` ${processedData.addOnInsight.addOnCount} add-ons were found compared with the last saved upload.` : " This upload is now saved as your comparison baseline for the next sheet."}`,
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
    if (!state.processedData || !state.processedData.meta.hasDosMapping || state.selectedDos === DOS_ALL_FILTER) {
      setStatus(elements.statusMessage, "Select a specific DOS before downloading that day's CSV.", "error");
      return;
    }

    const selectedRows = getCurrentVisibleRows();
    if (!selectedRows.length) {
      setStatus(elements.statusMessage, "No appointments are available for the current DOS and add-on filters.", "error");
      return;
    }

    const suffix =
      state.selectedAddOnFilter === ADD_ON_FILTER_ONLY
        ? `dos-${state.selectedDos}-add-ons`
        : state.selectedAddOnFilter === ADD_ON_FILTER_REGULAR
          ? `dos-${state.selectedDos}-previously-seen`
          : `dos-${state.selectedDos}`;
    downloadRowsCsv(selectedRows, state.processedData.fileName, suffix);
    setStatus(elements.statusMessage, "Your CSV download for the current DOS view has started.", "success");
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

  resetMappingUi();
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
  ADD_ON_FILTER_ALL,
  ADD_ON_FILTER_ONLY,
  ADD_ON_FILTER_REGULAR,
  DOS_ALL_FILTER,
  DOS_EMPTY_LABEL,
  OUTPUT_COLUMNS,
  applyAddOnComparison,
  buildAutoMapping,
  buildCounts,
  buildAddOnInsight,
  buildCsvModel,
  buildDosCounts,
  filterRowsByAddOn,
  filterRowsByDos,
  guessHeaderRowIndex,
  isSelfPayPlaceholder,
  normalizeHeader,
  normalizeProcessedSnapshot,
  parseCsv,
  processCsvModel,
  processScheduleCsv,
  toCsv,
  validateMappingConfig,
};
