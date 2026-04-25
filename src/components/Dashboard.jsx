import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import holcimLogo from "../../Logos/Holcim Transparent.png";

const CONTRACTS = [];

const TEMPLATE_FORMS = [{ id: "roller_daily", contractNo: "ROLLER", title: "Master Daily Checksheet - Roller" }];

const ADMIN_ITEMS = [
  { id: "a1", title: "User Access", detail: "Manage contract-level roles and permissions." },
  { id: "a2", title: "Form Templates", detail: "Create and maintain inspection templates." },
  { id: "a3", title: "Integrations", detail: "Configure handoff and webhook settings." },
];

const STATUS_OPTIONS = ["X", "Y", "N/A", "R"];
const AUTHORITY_OPTIONS = ["admin", "user"];
const MAINTENANCE_DEFECT_CATEGORIES = [
  "Health and Safety",
  "Environmental",
  "Quality",
  "Other",
];
const MAINTENANCE_PRIORITY_OPTIONS = [
  { value: 1, label: "1 - Dangerous", description: "Work must be STOPPED immediately", color: "#ff4d4d" },
  { value: 2, label: "2 - Major", description: "Repair needed same shift", color: "#ff944d" },
  { value: 3, label: "3 - Routine", description: "Repair within 2-3 days", color: "#ffd24d" },
  { value: 4, label: "4 - Minor", description: "Repair within 1-2 weeks", color: "#4da6ff" },
  { value: 5, label: "5 - Cosmetic", description: "Repair when convenient", color: "#d9d9d9" },
  {
    value: 6,
    label: "6 - Improvement / Preventative maintenance",
    description: "Improvement / preventative maintenance",
    color: "#3cb371",
  },
];
const DEFECT_PHOTO_MAX_FILES = 5;
const DEFECT_PHOTO_MAX_MB = 6;

const LEFT_LAYOUT = [
  { section: "Engine" },
  { label: "Engine Oil - Level Correct" },
  { label: "Engine - Free From Leaks, Excessive Noise" },
  { label: "Coolant Level (Antifreeze)" },
  { label: "Fan Belt Condition" },
  { label: "Exhaust Visual Inspection, Free from leaks" },
  { label: "Adblue Level" },
  { label: "Service Sticker" },
  { section: "Cabin & Body" },
  { label: "Hand Rails, Steps, Guards & Covers" },
  { label: "Floor Space, Mats & Rubbers" },
  { label: "360 Vision - Mirrors, Cameras, HFR Cameras & Screen" },
  { label: "Seats - Operates, Adjusts" },
  { label: "Seat Belt Operation" },
  { label: "Windscreen" },
  { label: "Washers & Wipers" },
  { label: "Main Drive Lever Forward & Reverse - Locks in Centre Position" },
  { label: "Fuel Tank - Security, Filler, Free From Leaks" },
  { label: "Cab/ROPS Hinges, Locks, Pins & Frame" },
  { label: "Air Conditioning/Heating" },
  { label: "Fire Extinguisher" },
  { label: "Emergency Hammer" },
  { label: "Body Panel Condition & Underneath Machine" },
  { label: "Reflectors/Chevrons - Side & Rear inc Reflective Tape & Decals" },
  { label: "Number Plate" },
  { label: "Dashboard Cover" },
  { label: "Operator Manual" },
  { section: "Electrical" },
  { label: "Batteries - Serviceable" },
  { label: "Isolator Switch" },
  { label: "Emergency Stops" },
  { label: "Reverse Alarm - Audible & Visual" },
];

const RIGHT_LAYOUT = [
  { section: "Electrical (continued)" },
  {
    label:
      "Lights - Brake, Side, Dipped, Indicator, Work, Beacons, Green Beacon, Exclusion Zone Lighting",
  },
  { label: "Dash Free From Fault Codes & Warning Symbols" },
  { label: "Horn" },
  { section: "Brakes" },
  { label: "Park Brake" },
  { label: "Seat Sensor Operation" },
  { section: "Hydraulics" },
  { label: "Hydraulic Oil - Level Correct" },
  { label: "Hydraulic Hoses" },
  { label: "Steering" },
  { label: "Rams - Free From Leaks" },
  { label: "All Hydraulic Functions" },
  { section: "Water System & Cutting Wheel" },
  { label: "Cutting Wheel Operation" },
  { label: "Drum Mats & Scraper" },
  { label: "Spray Bar, Jets, Water Tank & Filter" },
  { label: "Machine Greased" },
  { label: "Machine Cleanliness" },
  { label: "Other" },
  { section: "Wheels & Tyres - PTR Only" },
  { label: "Tyre/Wheel Condition" },
  { label: "Wheel Nuts & Indicators" },
  { section: "CBGM Joint Cutters Only" },
  { label: "Donkey Engine Oil - Level Correct" },
  { label: "Donkey Engine Pull Cord Condition" },
  { label: "Donkey Engine Pump & Clutch Condition" },
];

function buildRows() {
  const length = Math.max(LEFT_LAYOUT.length, RIGHT_LAYOUT.length);
  return Array.from({ length }).map((_, i) => ({
    left: LEFT_LAYOUT[i] || null,
    right: RIGHT_LAYOUT[i] || null,
  }));
}

const CHECK_ROWS = buildRows();

function flattenCheckLabels() {
  const labels = [];
  CHECK_ROWS.forEach((row) => {
    if (row.left?.label) labels.push(row.left.label);
    if (row.right?.label) labels.push(row.right.label);
  });
  return labels;
}

const CHECK_LABELS = flattenCheckLabels();

function buildInitialChecklist() {
  return CHECK_LABELS.reduce((acc, label) => {
    acc[label] = "";
    return acc;
  }, {});
}

function buildTodayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildNowLocalDateTimeValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function buildDateAndTimeParts(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { datePart: `${y}${m}${day}`, timePart: `${hh}${mm}` };
}

function buildInitialContractDraft() {
  return {
    name: "",
    contractNumber: "",
    client: "",
    address: "",
    postcodeW3W: "",
    descriptionOfWorks: "",
    division: "",
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read file: ${file?.name || "unknown"}`));
    reader.readAsDataURL(file);
  });
}

async function formatFunctionInvokeError(error) {
  if (!error) return "Unknown function error.";

  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (payload?.error) return String(payload.error);
      return JSON.stringify(payload);
    } catch {
      try {
        const text = await error.context.text();
        if (text) return text;
      } catch {
        // Ignore secondary parsing failures.
      }
      return `Function HTTP error (${error.context?.status || "unknown status"}).`;
    }
  }

  if (error instanceof FunctionsRelayError) {
    return `Function relay error: ${error.message}`;
  }

  if (error instanceof FunctionsFetchError) {
    return `Function fetch error: ${error.message}`;
  }

  return error.message || "Unknown function error.";
}

async function buildFunctionDebug(functionName, error, data, detailOverride = "") {
  if (error) {
    const detail = detailOverride || (await formatFunctionInvokeError(error));
    const kind =
      error instanceof FunctionsHttpError
        ? "http"
        : error instanceof FunctionsRelayError
          ? "relay"
          : error instanceof FunctionsFetchError
            ? "fetch"
            : "unknown";

    return {
      functionName,
      ok: false,
      kind,
      detail,
      at: new Date().toISOString(),
    };
  }

  return {
    functionName,
    ok: true,
    kind: "ok",
    detail: typeof data === "string" ? data : JSON.stringify(data || {}),
    at: new Date().toISOString(),
  };
}

function mapMaintenanceRoleToAppRole(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "manager") return "manager";
  if (normalized === "inspector") return "inspector";
  return "viewer";
}

function mapContractRowToUi(row) {
  return {
    id: row.id,
    name: row.name || row.contract_name || "",
    contractNumber: row.contract_number,
    client: row.client,
    address: row.address || row.location || "",
    postcodeW3W: row.postcode_w3w || "",
    descriptionOfWorks: row.description_of_works || "",
    division: row.division || "",
    status: row.status || "active",
  };
}

function normalizeRegion(value) {
  return String(value || "").trim();
}

function normalizeAssetIdentifier(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseDefectNotesByChecklistItem(notesText) {
  const map = {};
  String(notesText || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^Defect\s*-\s*(.*?):\s*(.*)$/i);
      if (!match) return;
      const item = String(match[1] || "").trim();
      const detail = String(match[2] || "").trim();
      if (item) {
        map[item] = detail;
      }
    });
  return map;
}

function resolveDisplayNameFromUser(user, profile) {
  return (
    String(profile?.full_name || "").trim() ||
    String(user?.user_metadata?.display_name || "").trim() ||
    String(user?.user_metadata?.full_name || "").trim() ||
    String(user?.email || "").trim()
  );
}

function resolveJobTitleFromUser(user, profile) {
  return (
    String(profile?.job_role || "").trim() ||
    String(user?.user_metadata?.job_role || "").trim() ||
    ""
  );
}

function collectDraftRegions(draft) {
  const selected = Array.isArray(draft?.regionsSelected)
    ? draft.regionsSelected.map(normalizeRegion).filter(Boolean)
    : [];
  const other = draft?.otherRegionEnabled ? normalizeRegion(draft?.otherRegionText) : "";
  const combined = other ? [...selected, other] : selected;

  const unique = [];
  const seen = new Set();
  combined.forEach((r) => {
    const key = r.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  });

  return unique;
}

let cachedHeaderLogoDataUrl = "";

async function getHeaderLogoDataUrl() {
  if (cachedHeaderLogoDataUrl) return cachedHeaderLogoDataUrl;

  try {
    const response = await fetch(holcimLogo);
    if (!response.ok) return "";
    const blob = await response.blob();

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    cachedHeaderLogoDataUrl = dataUrl;
    return dataUrl;
  } catch {
    return "";
  }
}

function drawCell(doc, x, y, w, h, text, options = {}) {
  const { bold = false, align = "left", fill = false, fontSize = 7, verticalOffset = 3.2 } = options;
  if (fill) {
    doc.setFillColor(242, 242, 242);
    doc.rect(x, y, w, h, "FD");
  } else {
    doc.rect(x, y, w, h);
  }
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  const tx = align === "center" ? x + w / 2 : x + 1.8;
  const content = Array.isArray(text) ? text : String(text || "");
  doc.text(content, tx, y + verticalOffset, {
    align,
    maxWidth: w - 3,
  });
}

function renderChecklistTable(doc, checklist, startY, pageSettings) {
  const { margin, pageWidth, pageHeight } = pageSettings;
  const statusW = 11;
  const labelW = (pageWidth - 2 * margin - 2 * statusW) / 2;
  const baseRowH = 5;
  const lineH = 3.2;
  let y = startY;

  const drawLegendHeader = () => {
    drawCell(doc, margin, y, pageWidth - 2 * margin, baseRowH, "Defect/Requires Attention X | Checked/Defect Free Y | Not Applicable N/A | Replaced R", { bold: true, align: "center", fill: true, fontSize: 7 });
    y += baseRowH;
  };

  drawLegendHeader();

  CHECK_ROWS.forEach((row) => {
    const leftItem = row.left;
    const rightItem = row.right;

    if (leftItem?.section || rightItem?.section) {
      if (y + baseRowH > pageHeight - margin) {
        doc.addPage("a4", "portrait");
        y = margin;
        drawLegendHeader();
      }
      drawCell(doc, margin, y, labelW + statusW, baseRowH, leftItem?.section || "", { bold: true, fill: true, fontSize: 7 });
      drawCell(doc, margin + labelW + statusW, y, labelW + statusW, baseRowH, rightItem?.section || "", { bold: true, fill: true, fontSize: 7 });
      y += baseRowH;
      return;
    }

    const leftLabel = leftItem?.label || "";
    const rightLabel = rightItem?.label || "";
    const leftStatus = leftLabel ? checklist[leftLabel] || "" : "";
    const rightStatus = rightLabel ? checklist[rightLabel] || "" : "";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.7);
    const leftLines = leftLabel ? doc.splitTextToSize(leftLabel, labelW - 3) : [""];
    const rightLines = rightLabel ? doc.splitTextToSize(rightLabel, labelW - 3) : [""];
    const maxLines = Math.max(leftLines.length, rightLines.length, 1);
    const rowH = Math.max(baseRowH, 1.8 + maxLines * lineH);

    if (y + rowH > pageHeight - margin) {
      doc.addPage("a4", "portrait");
      y = margin;
      drawLegendHeader();
    }

    drawCell(doc, margin, y, labelW, rowH, leftLines, { fontSize: 6.7 });
    drawCell(doc, margin + labelW, y, statusW, rowH, leftStatus, {
      align: "center",
      fontSize: 7,
      verticalOffset: rowH / 2 + 1,
    });
    drawCell(doc, margin + labelW + statusW, y, labelW, rowH, rightLines, { fontSize: 6.7 });
    drawCell(doc, margin + 2 * labelW + statusW, y, statusW, rowH, rightStatus, {
      align: "center",
      fontSize: 7,
      verticalOffset: rowH / 2 + 1,
    });
    y += rowH;
  });

  return y;
}

async function generateA4Pdf(data, options = {}) {
  const { preview = false } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 8;
  let y = margin;

  const titleH = 24;
  const rightW = 70;
  const leftW = pageWidth - 2 * margin - rightW;

  drawCell(doc, margin, y, leftW, titleH, "", {
    bold: true,
    align: "center",
    fontSize: 11,
    verticalOffset: 7,
  });

  const logoDataUrl = await getHeaderLogoDataUrl();
  if (logoDataUrl) {
    const logoW = 44;
    const logoH = 10;
    const logoX = margin + leftW / 2 - logoW / 2;
    const logoY = y + 3;
    doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoW, logoH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Daily Checksheet - Roller", margin + leftW / 2, y + 18, { align: "center" });
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("HOLCIM", margin + leftW / 2, y + 9, { align: "center" });
    doc.text("Daily Checksheet - Roller", margin + leftW / 2, y + 18, { align: "center" });
  }

  const rightX = margin + leftW;
  const metaH = titleH / 4;
  const metaLabels = ["Version", "Completed By", "Job Title", "Date"];
  const metaValues = [
    data.sheet_version || "1",
    data.completed_by_name || "",
    data.job_title || "",
    data.check_date || "",
  ];

  for (let i = 0; i < 4; i += 1) {
    const ry = y + i * metaH;
    drawCell(doc, rightX, ry, rightW * 0.6, metaH, metaLabels[i], { bold: true, align: "center", fontSize: 7 });
    drawCell(doc, rightX + rightW * 0.6, ry, rightW * 0.4, metaH, metaValues[i], { align: "center", fontSize: 7 });
  }

  y += titleH + 5;

  const topCols = ["Machine Reg", "Asset ID", "Serial No"];
  const topVals = [data.machine_reg || "", data.asset_no || "", data.serial_no || ""];
  const botCols = ["Machine Hours", "Machine Type", "Location"];
  const botVals = [String(data.machine_hours ?? ""), data.machine_type || "", data.location || ""];
  const colW = (pageWidth - 2 * margin) / 3;
  const rowH = 6;

  for (let i = 0; i < 3; i += 1) {
    drawCell(doc, margin + i * colW, y, colW, rowH, topCols[i], { bold: true, align: "center", fill: true, fontSize: 7 });
    drawCell(doc, margin + i * colW, y + rowH, colW, rowH, topVals[i], { align: "center", fontSize: 7 });
    drawCell(doc, margin + i * colW, y + 2 * rowH, colW, rowH, botCols[i], { bold: true, align: "center", fill: true, fontSize: 7 });
    drawCell(doc, margin + i * colW, y + 3 * rowH, colW, rowH, botVals[i], { align: "center", fontSize: 7 });
  }

  y += rowH * 4 + 4;

  y = renderChecklistTable(doc, data.checklist || {}, y, {
    margin,
    pageWidth,
    pageHeight,
  });

  if (y + 26 > pageHeight - margin) {
    doc.addPage("a4", "portrait");
    y = margin;
  }

  drawCell(doc, margin, y + 2, pageWidth - 2 * margin, 16, `Notes: ${data.notes || ""}`, {
    fontSize: 7,
    verticalOffset: 4,
  });

  drawCell(doc, margin, y + 18, pageWidth - 2 * margin, 7, `Defect Found: ${data.has_defects ? "Yes" : "No"}`, {
    bold: true,
    fontSize: 7.5,
    verticalOffset: 4.5,
  });

  const fileDate = (data.check_date || buildTodayIsoDate()).replace(/-/g, "");
  const completedAt = data.created_at || new Date().toISOString();
  const { datePart, timePart } = buildDateAndTimeParts(completedAt);
  const plantName = (data.machine_type || "Roller").replace(/\s+/g, "_");
  const fileName = `${plantName}_${datePart}_${timePart}.pdf`;

  if (preview && typeof window !== "undefined") {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    return;
  }

  doc.save(fileName);
}

function formatYesNo(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "-";
}

function displaySignatureValue(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.startsWith("data:image/")) return "Captured signature";
  return text;
}

async function generateSelfCertA4Pdf(data, options = {}) {
  const { preview = false } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const bottomMargin = 16;
  const contentWidth = pageWidth - margin * 2;
  const labelW = 62;
  const valueW = contentWidth - labelW;
  const yesNoPromptW = 104;
  const yesW = 35;
  const noW = contentWidth - yesNoPromptW - yesW;
  let y = 15;

  const formatDate = (value) => {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const ensureSpace = (requiredHeight) => {
    if (y + requiredHeight <= pageHeight - bottomMargin) return;
    doc.addPage("a4", "portrait");
    y = margin;
  };

  const drawWrappedText = (text, x, topY, width, lineHeight = 3.8, fontSize = 8.5) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(String(text || ""), width);
    doc.text(lines, x, topY);
    return lines.length * lineHeight;
  };

  const drawLabeledRow = (label, value, rowHeight = 8) => {
    ensureSpace(rowHeight + 1);
    doc.rect(margin, y, labelW, rowHeight);
    doc.rect(margin + labelW, y, valueW, rowHeight);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(label, margin + 2, y + 5.2);

    const valueLines = doc.splitTextToSize(String(value || "-"), valueW - 4);
    doc.text(valueLines, margin + labelW + 2, y + 5.2);
    y += rowHeight;
  };

  const drawYesNoRow = (question, value) => {
    const rowH = 8;
    ensureSpace(rowH + 1);
    doc.rect(margin, y, yesNoPromptW, rowH);
    doc.rect(margin + yesNoPromptW, y, yesW, rowH);
    doc.rect(margin + yesNoPromptW + yesW, y, noW, rowH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(question, margin + 2, y + 5.2);

    const selected = formatYesNo(value);
    if (selected === "Yes") {
      doc.setFont("helvetica", "bold");
      doc.text("Yes", margin + yesNoPromptW + yesW / 2, y + 5.2, { align: "center" });
    } else if (selected === "No") {
      doc.setFont("helvetica", "bold");
      doc.text("No", margin + yesNoPromptW + yesW + noW / 2, y + 5.2, { align: "center" });
    }

    y += rowH;
  };

  const drawSignatureInCell = (signature, x, topY, width, height) => {
    const sig = String(signature || "").trim();
    if (!sig) return;

    try {
      if (sig.startsWith("data:image/")) {
        doc.addImage(sig, "PNG", x + 2, topY + 2, width - 4, height - 4);
        return;
      }
    } catch {
      // Fall through and render text fallback.
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(displaySignatureValue(sig), x + 2, topY + 5.5);
  };

  const logoDataUrl = await getHeaderLogoDataUrl();
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", pageWidth - margin - 38, y - 2, 38, 9);
  }

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 32, 96);
  doc.setFontSize(22);
  doc.text("Part 1 - Sickness Self-Certification", margin, y + 4);
  doc.setTextColor(0, 0, 0);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  y += drawWrappedText(
    "To be completed by Employee for illnesses of 7 days or fewer (including weekends)",
    margin,
    y,
    contentWidth,
    4.5,
    11
  ) + 1;

  doc.setTextColor(200, 0, 0);
  y += drawWrappedText(
    "For longer term absences, this form will cover a maximum of 7 calendar days before the start date of a doctor's note.",
    margin,
    y,
    contentWidth,
    4.5,
    11
  ) + 1;
  doc.setTextColor(0, 0, 0);

  y += drawWrappedText(
    "Please read the rules and procedures set out in the Company's Sickness Absence policy before completing this form.",
    margin,
    y,
    contentWidth,
    4.5,
    11
  ) + 3;

  drawLabeledRow("Name:", data.employee_name);
  drawLabeledRow("Department:", data.department);
  drawLabeledRow("Employee Number:", data.employee_number);
  drawLabeledRow("First day of absence:", formatDate(data.first_day_absence));
  drawLabeledRow("Working days lost:", data.working_days_lost ?? "-");
  drawLabeledRow("Notification of absence made to:", data.notification_made_to);

  const reasonText = String(data.reason_and_symptoms || "-");
  const reasonLines = doc.splitTextToSize(reasonText, valueW - 4);
  const reasonHeight = Math.max(24, reasonLines.length * 4 + 7);
  ensureSpace(reasonHeight + 1);
  doc.rect(margin, y, labelW, reasonHeight);
  doc.rect(margin + labelW, y, valueW, reasonHeight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Reason for absence and symptoms:", margin + 2, y + 5.2);
  doc.text(reasonLines, margin + labelW + 2, y + 5.2);
  y += reasonHeight;

  const injuryHowText =
    String(data.injury_details || "").trim() || (data.injury_occurred === false ? "No injury reported" : "-");
  const injuryHowLines = doc.splitTextToSize(injuryHowText, valueW - 6);
  const injuryHeight = Math.max(42, injuryHowLines.length * 4 + 24);
  ensureSpace(injuryHeight + 1);
  doc.rect(margin, y, labelW, injuryHeight);
  doc.rect(margin + labelW, y, valueW, injuryHeight);
  const injurySplitY = y + injuryHeight / 2;
  doc.line(margin + labelW, injurySplitY, margin + labelW + valueW, injurySplitY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const injuryLeftWidth = labelW - 4;
  const leftLineHeight = 3.6;
  const injuryPromptLines = doc.splitTextToSize(
    "If an injury, specify how it occurred, eg. motor accident:",
    injuryLeftWidth
  );
  let leftY = y + 5.2;
  doc.text(injuryPromptLines, margin + 2, leftY);
  leftY += injuryPromptLines.length * leftLineHeight + 1;

  const accidentQuestionLines = doc.splitTextToSize("Did it happen at work?", injuryLeftWidth);
  leftY = Math.max(leftY, injurySplitY + 4.6);
  doc.text(accidentQuestionLines, margin + 2, leftY);
  leftY += accidentQuestionLines.length * leftLineHeight + 1;

  const injuryDetailPromptLines = doc.splitTextToSize("If Yes, please provide full details", injuryLeftWidth);
  doc.text(injuryDetailPromptLines, margin + 2, leftY);

  doc.text(injuryHowLines, margin + labelW + 2, y + 5.2);
  doc.setFont("helvetica", "bold");
  doc.text(formatYesNo(data.injury_occurred), margin + labelW + 2, injurySplitY + 5.2);
  y += injuryHeight;

  drawYesNoRow("Did you seek medical advice?", data.sought_medical_advice);
  drawYesNoRow("Did you consult your doctor?", data.consulted_doctor_again);
  drawYesNoRow("Did you visit a hospital or clinic?", data.visited_hospital_or_clinic);

  y += 4;
  y += drawWrappedText(
    "I understand that if I provide inaccurate or false information about my absence it may be treated as gross misconduct, which would result in my summary dismissal from the Company.",
    margin,
    y,
    contentWidth,
    3.8,
    8.5
  ) + 3;

  const sigLabelW = 48;
  const sigValueW = contentWidth - sigLabelW;
  const sigRowH = 13;
  ensureSpace(sigRowH * 3 + 4);

  doc.rect(margin, y, sigLabelW, sigRowH);
  doc.rect(margin + sigLabelW, y, sigValueW, sigRowH);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Employee's Signature:", margin + 2, y + 5.2);
  drawSignatureInCell(data.employee_signature, margin + sigLabelW, y, sigValueW, sigRowH);
  y += sigRowH;

  doc.rect(margin, y, sigLabelW, sigRowH);
  doc.rect(margin + sigLabelW, y, sigValueW, sigRowH);
  doc.text("Manager's Signature:", margin + 2, y + 5.2);
  drawSignatureInCell(data.manager_signature, margin + sigLabelW, y, sigValueW, sigRowH);
  y += sigRowH;

  doc.rect(margin, y, sigLabelW, sigRowH);
  doc.rect(margin + sigLabelW, y, sigValueW, sigRowH);
  doc.text("Date:", margin + 2, y + 5.2);
  doc.text(
    formatDate(data.manager_signed_at || data.employee_signed_at || data.created_at),
    margin + sigLabelW + 2,
    y + 5.2
  );
  y += sigRowH + 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  y += drawWrappedText(
    "Once completed please forward Part 1 (HR01/F01) to the Payroll Department payroll@holcim.co.uk and proceed to complete Part 2 (HR01/F02).",
    margin,
    y,
    contentWidth,
    4,
    9
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    "HR01/F01/Part 1 - Sickness Self-Certification/v1.3/08.04.2025",
    margin,
    pageHeight - 6
  );

  const completedAt = data.created_at || new Date().toISOString();
  const { datePart, timePart } = buildDateAndTimeParts(completedAt);
  const personName = String(data.employee_name || "SelfCert").trim().replace(/\s+/g, "_");
  const fileName = `SelfCert_${personName}_${datePart}_${timePart}.pdf`;

  if (preview && typeof window !== "undefined") {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    return;
  }

  doc.save(fileName);
}

export default function Dashboard({ user, onSignOut }) {
  const signatureCanvasRef = useRef(null);
  const signatureDrawStateRef = useRef({ drawing: false, lastX: 0, lastY: 0 });
  const managerSignatureCanvasRef = useRef(null);
  const managerSignatureDrawStateRef = useRef({ drawing: false, lastX: 0, lastY: 0 });
  const [activeTab, setActiveTab] = useState("contracts");
  const [contracts, setContracts] = useState(CONTRACTS);
  const [isAddingContract, setIsAddingContract] = useState(false);
  const [contractDraft, setContractDraft] = useState(buildInitialContractDraft());
  const [selectedContract, setSelectedContract] = useState(null);
  const [activeContractTab, setActiveContractTab] = useState("team");
  const [contractsMessage, setContractsMessage] = useState("");
  const [contractsLoading, setContractsLoading] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState(TEMPLATE_FORMS[0]?.id || "");
  const [formsView, setFormsView] = useState("assigned");
  const [completedByName, setCompletedByName] = useState(
    resolveDisplayNameFromUser(user, null)
  );
  const [sheetVersion, setSheetVersion] = useState("1");
  const [jobTitle, setJobTitle] = useState(resolveJobTitleFromUser(user, null));
  const [checkDate, setCheckDate] = useState(buildTodayIsoDate());
  const [machineReg, setMachineReg] = useState("");
  const [assetNo, setAssetNo] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [machineHours, setMachineHours] = useState("");
  const [machineType, setMachineType] = useState("Roller");
  const [assetDirectory, setAssetDirectory] = useState([]);
  const [assetLookupStatus, setAssetLookupStatus] = useState({ source: "none", count: 0, error: "" });
  const [assetLookupTrace, setAssetLookupTrace] = useState("");
  const [defectCaptureModalOpen, setDefectCaptureModalOpen] = useState(false);
  const [defectCaptureRows, setDefectCaptureRows] = useState([]);
  const [defectCaptureSubmitting, setDefectCaptureSubmitting] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [checklist, setChecklist] = useState(buildInitialChecklist());
  const [notes, setNotes] = useState("");
  const [lastSubmission, setLastSubmission] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [completedForms, setCompletedForms] = useState([]);
  const [loadingCompletedForms, setLoadingCompletedForms] = useState(false);
  const [completedFormsError, setCompletedFormsError] = useState("");
  const [filterPlantType, setFilterPlantType] = useState("all");
  const [filterContract, setFilterContract] = useState("all");
  const [filterDefect, setFilterDefect] = useState("all");
  const [contractCompletedForms, setContractCompletedForms] = useState([]);
  const [contractFormsLoading, setContractFormsLoading] = useState(false);
  const [contractFormsError, setContractFormsError] = useState("");
  const [selectedCompletedForm, setSelectedCompletedForm] = useState(null);
  const [mySelfCertForms, setMySelfCertForms] = useState([]);
  const [loadingMySelfCertForms, setLoadingMySelfCertForms] = useState(false);
  const [mySelfCertFormsError, setMySelfCertFormsError] = useState("");
  const [expandedMySelfCertFormId, setExpandedMySelfCertFormId] = useState(null);
  const [nearMissModalOpen, setNearMissModalOpen] = useState(false);
  const [nearMissSubmitting, setNearMissSubmitting] = useState(false);
  const [nearMissReporterName, setNearMissReporterName] = useState("");
  const [nearMissReportedAt, setNearMissReportedAt] = useState(buildNowLocalDateTimeValue());
  const [nearMissSite, setNearMissSite] = useState("");
  const [nearMissDetails, setNearMissDetails] = useState("");
  const [nearMissActionsTaken, setNearMissActionsTaken] = useState("");
  const [selfCertModalOpen, setSelfCertModalOpen] = useState(false);
  const [selfCertSubmitting, setSelfCertSubmitting] = useState(false);
  const [selfCertName, setSelfCertName] = useState("");
  const [selfCertDepartment, setSelfCertDepartment] = useState("");
  const [selfCertEmployeeNumber, setSelfCertEmployeeNumber] = useState("");
  const [selfCertFirstDayAbsence, setSelfCertFirstDayAbsence] = useState(buildTodayIsoDate());
  const [selfCertWorkingDaysLost, setSelfCertWorkingDaysLost] = useState("");
  const [selfCertNotificationTo, setSelfCertNotificationTo] = useState("");
  const [selfCertReasonSymptoms, setSelfCertReasonSymptoms] = useState("");
  const [selfCertHadInjury, setSelfCertHadInjury] = useState(null);
  const [selfCertInjuryDetails, setSelfCertInjuryDetails] = useState("");
  const [selfCertInjuryOccurred, setSelfCertInjuryOccurred] = useState(null);
  const [selfCertSoughtMedicalAdvice, setSelfCertSoughtMedicalAdvice] = useState(null);
  const [selfCertConsultedDoctorAgain, setSelfCertConsultedDoctorAgain] = useState(null);
  const [selfCertVisitedHospital, setSelfCertVisitedHospital] = useState(null);
  const [selfCertEmployeeSignature, setSelfCertEmployeeSignature] = useState("");
  const [selfCertSignatureModalOpen, setSelfCertSignatureModalOpen] = useState(false);
  const [selfCertSignatureHasStroke, setSelfCertSignatureHasStroke] = useState(false);
  const [pendingSelfCertApprovals, setPendingSelfCertApprovals] = useState([]);
  const [loadingPendingSelfCertApprovals, setLoadingPendingSelfCertApprovals] = useState(false);
  const [selfCertApprovalsModalOpen, setSelfCertApprovalsModalOpen] = useState(false);
  const [selectedPendingSelfCert, setSelectedPendingSelfCert] = useState(null);
  const [managerApprovalSignature, setManagerApprovalSignature] = useState("");
  const [managerSignatureModalOpen, setManagerSignatureModalOpen] = useState(false);
  const [managerSignatureHasStroke, setManagerSignatureHasStroke] = useState(false);
  const [approvingPendingSelfCert, setApprovingPendingSelfCert] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [currentAppRole, setCurrentAppRole] = useState("viewer");
  const [currentUserContractIds, setCurrentUserContractIds] = useState([]);
  const [contractTeamRows, setContractTeamRows] = useState([]);
  const [teamSelection, setTeamSelection] = useState([]);
  const [teamSaving, setTeamSaving] = useState(false);
  const [contractAssignedForms, setContractAssignedForms] = useState([]);
  const [locationAssignedForms, setLocationAssignedForms] = useState([]);
  const [contractFormsModalOpen, setContractFormsModalOpen] = useState(false);
  const [contractFormsSelection, setContractFormsSelection] = useState([]);
  const [contractFormsSaving, setContractFormsSaving] = useState(false);
  const [invitingPersonKey, setInvitingPersonKey] = useState("");
  const [adminTab, setAdminTab] = useState("user_access");
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMessage, setUsersMessage] = useState("");
  const [usersDebug, setUsersDebug] = useState(null);
  const [maintenanceUsers, setMaintenanceUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newUserDraft, setNewUserDraft] = useState({
    userId: "",
    authority: "user",
    displayName: "",
    email: "",
    phone: "",
    jobRole: "",
    employeeNumber: "",
    lineManagerUserId: "",
    hasDirectReports: false,
    regionsSelected: [],
    otherRegionEnabled: false,
    otherRegionText: "",
  });
  const [isAddRegionsExpanded, setIsAddRegionsExpanded] = useState(false);

  const selectedLocationContract = useMemo(
    () => contracts.find((contract) => contract.id === selectedContractId) || null,
    [contracts, selectedContractId]
  );

  const defectFound = useMemo(
    () => Object.values(checklist).some((value) => value === "X"),
    [checklist]
  );

  const selectedAccessUser = useMemo(
    () => maintenanceUsers.find((u) => u.person_key === selectedUserId) || null,
    [maintenanceUsers, selectedUserId]
  );

  const lineManagerOptions = useMemo(
    () =>
      maintenanceUsers
        .filter((u) => !!u.portal_user_id)
        .map((u) => ({
          userId: u.portal_user_id,
          label: u.full_name || u.email || u.portal_user_id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [maintenanceUsers]
  );

  const teamCandidateContacts = useMemo(() => {
    if (!selectedContract) return [];

    const division = normalizeRegion(selectedContract.division).toLowerCase();
    if (!division) return maintenanceUsers;

    const regionMatched = maintenanceUsers.filter((u) =>
      (Array.isArray(u.divisions) ? u.divisions : []).some(
        (region) => normalizeRegion(region).toLowerCase() === division
      )
    );

    // If no region-matched contacts exist, fall back to showing all contacts.
    return regionMatched.length > 0 ? regionMatched : maintenanceUsers;
  }, [maintenanceUsers, selectedContract]);

  const visibleContracts = useMemo(() => {
    if (["admin", "manager"].includes(currentAppRole)) return contracts;
    const allowed = new Set(currentUserContractIds);
    return contracts.filter((contract) => allowed.has(contract.id));
  }, [contracts, currentAppRole, currentUserContractIds]);

  const allMarkedChecked = useMemo(
    () => CHECK_LABELS.every((label) => checklist[label] === "Y"),
    [checklist]
  );

  const plantTypeOptions = useMemo(() => {
    const set = new Set();
    completedForms.forEach((form) => {
      if (form.machine_type) set.add(form.machine_type);
    });
    return Array.from(set);
  }, [completedForms]);

  const contractOptions = useMemo(() => {
    const set = new Set();
    completedForms.forEach((form) => {
      const label = form.contract_name || form.location;
      if (label) set.add(label);
    });
    return Array.from(set);
  }, [completedForms]);

  const regionOptions = useMemo(() => {
    const set = new Set();

    contracts.forEach((contract) => {
      const value = normalizeRegion(contract.division);
      if (value) set.add(value);
    });

    maintenanceUsers.forEach((u) => {
      (Array.isArray(u.divisions) ? u.divisions : []).forEach((region) => {
        const value = normalizeRegion(region);
        if (value) set.add(value);
      });
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contracts, maintenanceUsers]);

  const filteredCompletedForms = useMemo(
    () =>
      completedForms.filter((form) => {
        if (filterPlantType !== "all" && form.machine_type !== filterPlantType) return false;
        if (filterContract !== "all" && (form.contract_name || form.location) !== filterContract) return false;
        if (filterDefect === "yes" && !form.has_defects) return false;
        if (filterDefect === "no" && form.has_defects) return false;
        return true;
      }),
    [completedForms, filterPlantType, filterContract, filterDefect]
  );

  const defaultCompletedByName = useMemo(
    () => resolveDisplayNameFromUser(user, currentUserProfile),
    [user, currentUserProfile]
  );

  const defaultJobTitle = useMemo(
    () => resolveJobTitleFromUser(user, currentUserProfile),
    [user, currentUserProfile]
  );

  const resolvedAssetDirectory = useMemo(() => {
    const merged = [];
    const seen = new Set();

    const addRow = (raw) => {
      const row = {
        machine_reg: String(raw?.machine_reg || "").trim(),
        asset_no: String(raw?.asset_no || "").trim(),
        serial_no: String(raw?.serial_no || "").trim(),
      };

      if (!row.machine_reg && !row.asset_no && !row.serial_no) {
        return;
      }

      const dedupeKey = [
        normalizeAssetIdentifier(row.machine_reg),
        normalizeAssetIdentifier(row.asset_no),
        normalizeAssetIdentifier(row.serial_no),
      ].join("|");

      if (seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);
      merged.push(row);
    };

    (assetDirectory || []).forEach(addRow);
    (completedForms || []).forEach(addRow);

    return merged;
  }, [assetDirectory, completedForms]);

  const assetDirectoryLookup = useMemo(() => {
    const byMachineReg = new Map();
    const byAssetNo = new Map();
    const bySerialNo = new Map();

    const push = (map, key, row) => {
      if (!key) return;
      const existing = map.get(key) || [];
      existing.push(row);
      map.set(key, existing);
    };

    resolvedAssetDirectory.forEach((row) => {
      push(byMachineReg, normalizeAssetIdentifier(row.machine_reg), row);
      push(byAssetNo, normalizeAssetIdentifier(row.asset_no), row);
      push(bySerialNo, normalizeAssetIdentifier(row.serial_no), row);
    });

    return { byMachineReg, byAssetNo, bySerialNo };
  }, [resolvedAssetDirectory]);

  function rankAssetMatch(row, field) {
    const values = [row?.machine_reg, row?.asset_no, row?.serial_no].map((v) => String(v || "").trim());
    const totalFilled = values.filter(Boolean).length;

    const otherFilled =
      field === "machine_reg"
        ? [row?.asset_no, row?.serial_no]
        : field === "asset_no"
          ? [row?.machine_reg, row?.serial_no]
          : [row?.machine_reg, row?.asset_no];

    const otherCount = otherFilled.map((v) => String(v || "").trim()).filter(Boolean).length;
    return otherCount * 10 + totalFilled;
  }

  function findBestAssetMatch(field, rawValue) {
    const key = normalizeAssetIdentifier(rawValue);
    if (!key) return null;

    const source =
      field === "machine_reg"
        ? assetDirectoryLookup.byMachineReg
        : field === "asset_no"
          ? assetDirectoryLookup.byAssetNo
          : assetDirectoryLookup.bySerialNo;

    const matches = source.get(key) || [];
    if (matches.length === 0) return null;

    const ranked = [...matches].sort((a, b) => rankAssetMatch(b, field) - rankAssetMatch(a, field));
    return ranked[0] || null;
  }

  function findAssetMatchCount(field, rawValue) {
    const key = normalizeAssetIdentifier(rawValue);
    if (!key) return 0;

    const source =
      field === "machine_reg"
        ? assetDirectoryLookup.byMachineReg
        : field === "asset_no"
          ? assetDirectoryLookup.byAssetNo
          : assetDirectoryLookup.bySerialNo;

    return (source.get(key) || []).length;
  }

  function handleMachineRegInput(value) {
    setMachineReg(value);
    if (!String(value || "").trim()) {
      setAssetLookupTrace("");
      return;
    }

    const matchCount = findAssetMatchCount("machine_reg", value);
    const match = findBestAssetMatch("machine_reg", value);
    if (!match) {
      setAssetLookupTrace(`No match for Machine Reg "${value}". Directory entries: ${assetLookupStatus.count}.`);
      return;
    }

    setAssetLookupTrace(`Machine Reg matched ${matchCount} record(s). Auto-filled Asset ID and Serial No.`);
    // Keep the user's typed value in the edited field and only auto-fill the other fields.
    setAssetNo(match.asset_no || "");
    setSerialNo(match.serial_no || "");
  }

  function handleAssetNoInput(value) {
    setAssetNo(value);
    if (!String(value || "").trim()) {
      setAssetLookupTrace("");
      return;
    }

    const matchCount = findAssetMatchCount("asset_no", value);
    const match = findBestAssetMatch("asset_no", value);
    if (!match) {
      setAssetLookupTrace(`No match for Asset ID "${value}". Directory entries: ${assetLookupStatus.count}.`);
      return;
    }

    setAssetLookupTrace(`Asset ID matched ${matchCount} record(s). Auto-filled Machine Reg and Serial No.`);
    setMachineReg(match.machine_reg || "");
    setSerialNo(match.serial_no || "");
  }

  function handleSerialNoInput(value) {
    setSerialNo(value);
    if (!String(value || "").trim()) {
      setAssetLookupTrace("");
      return;
    }

    const matchCount = findAssetMatchCount("serial_no", value);
    const match = findBestAssetMatch("serial_no", value);
    if (!match) {
      setAssetLookupTrace(`No match for Serial No "${value}". Directory entries: ${assetLookupStatus.count}.`);
      return;
    }

    setAssetLookupTrace(`Serial No matched ${matchCount} record(s). Auto-filled Machine Reg and Asset ID.`);
    setMachineReg(match.machine_reg || "");
    setAssetNo(match.asset_no || "");
  }

  async function fetchAssetDirectory() {
    const { data: functionData, error: functionError } = await supabase.functions.invoke(
      "list-maintenance-plant-assets"
    );

    if (!functionError && functionData?.success && Array.isArray(functionData.assets)) {
      const mapped = functionData.assets.map((row) => ({
          asset_no: row.asset_no || "",
          serial_no: row.serial_no || "",
          machine_reg: row.machine_reg || "",
        }));
      setAssetDirectory(mapped);
      setAssetLookupStatus({ source: "maintenance-function", count: mapped.length, error: "" });
      return;
    }

    const { data, error } = await supabase
      .from("plant_assets")
      .select("asset_code, serial_number, machine_reg, is_active")
      .eq("is_active", true)
      .order("asset_code", { ascending: true });

    if (error) {
      // Keep checklist usable even if asset registry isn't available in this environment.
      console.warn(
        "Could not load plant asset directory:",
        functionError?.message || functionData?.error || error.message
      );
      const fallback = await supabase
        .from("roller_daily_checks")
        .select("machine_reg, asset_no, serial_no")
        .order("created_at", { ascending: false })
        .limit(500);

      if (fallback.error) {
        setAssetDirectory([]);
        setAssetLookupStatus({
          source: "none",
          count: 0,
          error: functionError?.message || functionData?.error || error.message || fallback.error.message,
        });
        return;
      }

      const mappedFallback = (fallback.data || []).map((row) => ({
          machine_reg: row.machine_reg || "",
          asset_no: row.asset_no || "",
          serial_no: row.serial_no || "",
        }));
      setAssetDirectory(mappedFallback);
      setAssetLookupStatus({
        source: "completed-forms-fallback",
        count: mappedFallback.length,
        error: functionError?.message || functionData?.error || error.message,
      });
      return;
    }

    const mapped = (data || []).map((row) => ({
      asset_no: row.asset_code || "",
      serial_no: row.serial_number || "",
      machine_reg: row.machine_reg || "",
    }));

    setAssetDirectory(mapped);
    setAssetLookupStatus({ source: "local-plant-assets", count: mapped.length, error: "" });
  }

  async function fetchCurrentUserProfile() {
    if (!user?.id) {
      setCurrentUserProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("full_name, job_role, employee_number")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("Could not load current user profile:", error.message);
      setCurrentUserProfile(null);
      return;
    }

    setCurrentUserProfile(data || null);
  }

  useEffect(() => {
    // If user enters an identifier before directory load finishes, auto-fill once directory arrives.
    if (assetLookupStatus.count <= 0) return;

    if (machineReg && (!assetNo || !serialNo)) {
      const match = findBestAssetMatch("machine_reg", machineReg);
      if (match) {
        if (!assetNo && match.asset_no) setAssetNo(match.asset_no);
        if (!serialNo && match.serial_no) setSerialNo(match.serial_no);
      }
    }

    if (assetNo && (!machineReg || !serialNo)) {
      const match = findBestAssetMatch("asset_no", assetNo);
      if (match) {
        if (!machineReg && match.machine_reg) setMachineReg(match.machine_reg);
        if (!serialNo && match.serial_no) setSerialNo(match.serial_no);
      }
    }

    if (serialNo && (!machineReg || !assetNo)) {
      const match = findBestAssetMatch("serial_no", serialNo);
      if (match) {
        if (!machineReg && match.machine_reg) setMachineReg(match.machine_reg);
        if (!assetNo && match.asset_no) setAssetNo(match.asset_no);
      }
    }
  }, [assetLookupStatus.count, machineReg, assetNo, serialNo, assetDirectoryLookup]);

  useEffect(() => {
    if (!selfCertSignatureModalOpen) return;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setSelfCertSignatureHasStroke(false);
  }, [selfCertSignatureModalOpen]);

  useEffect(() => {
    if (!managerSignatureModalOpen) return;

    const canvas = managerSignatureCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setManagerSignatureHasStroke(false);
  }, [managerSignatureModalOpen]);

  async function fetchContracts() {
    setContractsLoading(true);
    setContractsMessage("");

    const [contractsRes, roleRes, myAssignmentsRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("id, name, contract_name, contract_number, client, address, location, postcode_w3w, description_of_works, division, status")
        .order("created_at", { ascending: false }),
      user?.id
        ? supabase.from("app_user_roles").select("role").eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      user?.id
        ? supabase.from("contract_team_roles").select("contract_id").eq("user_id", user.id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (contractsRes.error || roleRes.error || myAssignmentsRes.error) {
      setContractsMessage(`Could not load contracts: ${contractsRes.error?.message || roleRes.error?.message || myAssignmentsRes.error?.message}`);
      setContracts([]);
      setContractsLoading(false);
      return;
    }

    const resolvedRole = String(roleRes.data?.role || "viewer").toLowerCase();
    setCurrentAppRole(resolvedRole);

    const assignedIds = Array.from(
      new Set((myAssignmentsRes.data || []).map((row) => row.contract_id).filter(Boolean))
    );
    setCurrentUserContractIds(assignedIds);

    const mappedContracts = (contractsRes.data || []).map(mapContractRowToUi);
    setContracts(mappedContracts);

    if (selectedContractId && !mappedContracts.some((c) => c.id === selectedContractId)) {
      setSelectedContractId("");
    }

    setContractsLoading(false);
  }

  async function fetchContractTeam(contractId) {
    if (!contractId) {
      setContractTeamRows([]);
      setTeamSelection([]);
      return;
    }

    const { data, error } = await supabase
      .from("contract_team_roles")
      .select("id, user_id, role_name")
      .eq("contract_id", contractId);

    if (error) {
      setContractsMessage(`Could not load team: ${error.message}`);
      setContractTeamRows([]);
      setTeamSelection([]);
      return;
    }

    setContractTeamRows(data || []);
    setTeamSelection(Array.from(new Set((data || []).map((row) => row.user_id).filter(Boolean))));
  }

  async function handleSaveContractTeam() {
    if (!selectedContract?.id) return;

    setTeamSaving(true);
    setContractsMessage("");

    const currentUserIds = Array.from(new Set(contractTeamRows.map((row) => row.user_id).filter(Boolean)));
    const targetUserIds = Array.from(new Set(teamSelection.filter(Boolean)));

    const toAdd = targetUserIds.filter((userId) => !currentUserIds.includes(userId));
    const toRemove = currentUserIds.filter((userId) => !targetUserIds.includes(userId));

    if (toAdd.length > 0) {
      const payload = toAdd.map((userId) => ({
        contract_id: selectedContract.id,
        user_id: userId,
        role_name: "inspector",
      }));

      const { error } = await supabase.from("contract_team_roles").insert(payload);
      if (error) {
        setContractsMessage(`Team save failed: ${error.message}`);
        setTeamSaving(false);
        return;
      }
    }

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("contract_team_roles")
        .delete()
        .eq("contract_id", selectedContract.id)
        .in("user_id", toRemove);

      if (error) {
        setContractsMessage(`Team save failed: ${error.message}`);
        setTeamSaving(false);
        return;
      }
    }

    setContractsMessage("Team assignments saved.");
    await Promise.all([fetchContractTeam(selectedContract.id), fetchContracts(), fetchMaintenanceUsers()]);
    setTeamSaving(false);
  }

  async function fetchCompletedForms() {
    setLoadingCompletedForms(true);
    setCompletedFormsError("");

    const restricted = !["admin", "manager"].includes(currentAppRole);
    const accessibleContracts = restricted
      ? contracts.filter((contract) => currentUserContractIds.includes(contract.id))
      : [];

    if (restricted && accessibleContracts.length === 0) {
      setCompletedForms([]);
      setLoadingCompletedForms(false);
      return;
    }

    let query = supabase
      .from("roller_daily_checks")
      .select(
        "id, created_at, check_date, machine_type, machine_reg, asset_no, serial_no, machine_hours, sheet_version, job_title, checklist, notes, contract_id, contract_name, contract_number, location, completed_by_name, has_defects"
      )
      .order("created_at", { ascending: false });

    if (restricted) {
      const idFilters = accessibleContracts
        .map((contract) => String(contract.id || "").trim())
        .filter(Boolean)
        .map((id) => `contract_id.eq.${id}`);

      const numberFilters = accessibleContracts
        .map((contract) => String(contract.contractNumber || "").trim())
        .filter(Boolean)
        .map((number) => `contract_number.eq.${number}`);

      const orFilters = [...idFilters, ...numberFilters].join(",");
      if (orFilters) {
        query = query.or(orFilters);
      }
    }

    const { data, error } = await query;

    if (error) {
      setCompletedFormsError(error.message);
      setCompletedForms([]);
      setLoadingCompletedForms(false);
      return;
    }

    setCompletedForms(data || []);
    setLoadingCompletedForms(false);
  }

  async function fetchMySelfCertForms() {
    if (!user?.id) {
      setMySelfCertForms([]);
      setExpandedMySelfCertFormId(null);
      return;
    }

    setLoadingMySelfCertForms(true);
    setMySelfCertFormsError("");

    const { data, error } = await supabase
      .from("self_cert_forms")
      .select(
        "id, created_at, status, user_id, line_manager_user_id, employee_name, department, employee_number, first_day_absence, working_days_lost, notification_made_to, reason_and_symptoms, injury_occurred, injury_details, sought_medical_advice, consulted_doctor_again, visited_hospital_or_clinic, employee_signature, employee_signed_at, manager_signature, manager_signed_at"
      )
      .or(`user_id.eq.${user.id},line_manager_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      setMySelfCertFormsError(error.message || "Failed to load self cert forms.");
      setMySelfCertForms([]);
      setLoadingMySelfCertForms(false);
      return;
    }

    const rows = data || [];
    setMySelfCertForms(rows);
    if (!rows.some((f) => f.id === expandedMySelfCertFormId)) {
      setExpandedMySelfCertFormId(null);
    }
    setLoadingMySelfCertForms(false);
  }

  async function fetchPendingSelfCertApprovals() {
    if (!user?.id) {
      setPendingSelfCertApprovals([]);
      return;
    }

    setLoadingPendingSelfCertApprovals(true);
    const { data, error } = await supabase
      .from("self_cert_forms")
      .select(
        "id, employee_name, department, employee_number, first_day_absence, working_days_lost, notification_made_to, reason_and_symptoms, injury_occurred, injury_details, sought_medical_advice, consulted_doctor_again, visited_hospital_or_clinic, employee_signature, employee_signed_at, created_at, status"
      )
      .eq("line_manager_user_id", user.id)
      .eq("status", "pending_manager_approval")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Could not load pending self cert approvals:", error.message);
      setPendingSelfCertApprovals([]);
      setLoadingPendingSelfCertApprovals(false);
      return;
    }

    setPendingSelfCertApprovals(data || []);
    setLoadingPendingSelfCertApprovals(false);
  }

  function openSelfCertApprovalsModal() {
    setSelfCertApprovalsModalOpen(true);
    fetchPendingSelfCertApprovals();
  }

  function getManagerSignaturePoint(event) {
    const source = event?.touches?.[0] || event?.changedTouches?.[0] || event;
    return {
      clientX: Number(source?.clientX || 0),
      clientY: Number(source?.clientY || 0),
    };
  }

  function startManagerSignatureStroke(event) {
    const canvas = managerSignatureCanvasRef.current;
    if (!canvas) return;
    if (event?.cancelable) event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const { clientX, clientY } = getManagerSignaturePoint(event);
    managerSignatureDrawStateRef.current = {
      drawing: true,
      lastX: clientX - rect.left,
      lastY: clientY - rect.top,
    };
  }

  function moveManagerSignatureStroke(event) {
    const canvas = managerSignatureCanvasRef.current;
    if (!canvas || !managerSignatureDrawStateRef.current.drawing) return;
    if (event?.cancelable) event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const { clientX, clientY } = getManagerSignaturePoint(event);
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(managerSignatureDrawStateRef.current.lastX, managerSignatureDrawStateRef.current.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    managerSignatureDrawStateRef.current.lastX = x;
    managerSignatureDrawStateRef.current.lastY = y;
    setManagerSignatureHasStroke(true);
  }

  function endManagerSignatureStroke() {
    managerSignatureDrawStateRef.current.drawing = false;
  }

  function clearManagerSignaturePad() {
    const canvas = managerSignatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setManagerSignatureHasStroke(false);
  }

  function saveManagerSignaturePad() {
    const canvas = managerSignatureCanvasRef.current;
    if (!canvas || !managerSignatureHasStroke) {
      window.alert("Please sign before saving.");
      return;
    }
    setManagerApprovalSignature(canvas.toDataURL("image/png"));
    setManagerSignatureModalOpen(false);
  }

  async function approvePendingSelfCert() {
    if (!selectedPendingSelfCert?.id) {
      window.alert("Select a form requiring approval.");
      return;
    }
    if (!managerApprovalSignature) {
      window.alert("Please capture manager signature.");
      return;
    }

    setApprovingPendingSelfCert(true);
    try {
      const { data, error } = await supabase.functions.invoke("approve-self-cert", {
        body: {
          formId: selectedPendingSelfCert.id,
          managerSignature: managerApprovalSignature,
        },
      });

      if (error || data?.success === false) {
        throw new Error(error?.message || data?.error || "Could not approve self cert form.");
      }

      setManagerApprovalSignature("");
      setSelectedPendingSelfCert(null);
      await Promise.all([fetchPendingSelfCertApprovals(), fetchMySelfCertForms()]);
      setMessage("Self cert approved from portal.");
    } catch (error) {
      window.alert(`Approval failed: ${error?.message || "Unknown error"}`);
    } finally {
      setApprovingPendingSelfCert(false);
    }
  }

  function openNearMissModal() {
    setNearMissReporterName(defaultCompletedByName || "");
    setNearMissReportedAt(buildNowLocalDateTimeValue());
    setNearMissSite(selectedLocationContract?.name || "");
    setNearMissDetails("");
    setNearMissActionsTaken("");
    setNearMissModalOpen(true);
  }

  async function submitNearMissFromPortal(e) {
    e.preventDefault();
    if (!nearMissReporterName.trim()) {
      window.alert("Please enter the name of the person reporting.");
      return;
    }
    if (!nearMissSite.trim()) {
      window.alert("Please enter the site.");
      return;
    }
    if (!nearMissDetails.trim()) {
      window.alert("Please add near miss details.");
      return;
    }
    if (!nearMissActionsTaken.trim()) {
      window.alert("Please describe what has been done about it.");
      return;
    }

    setNearMissSubmitting(true);
    try {
      const reportedAtIso = nearMissReportedAt ? new Date(nearMissReportedAt).toISOString() : new Date().toISOString();
      const payload = {
        reportedAt: reportedAtIso,
        reporterName: nearMissReporterName.trim(),
        site: nearMissSite.trim(),
        nearMissDetails: nearMissDetails.trim(),
        actionsTaken: nearMissActionsTaken.trim(),
        source: "contracts-portal",
      };

      const { data, error } = await supabase.functions.invoke("report-near-miss", {
        body: payload,
      });

      if (error || data?.success === false) {
        throw new Error(error?.message || data?.error || "Could not submit near miss report.");
      }

      setNearMissModalOpen(false);
      setMessage("Near miss submitted from portal.");
    } catch (error) {
      window.alert(`Near miss submission failed: ${error?.message || "Unknown error"}`);
    } finally {
      setNearMissSubmitting(false);
    }
  }

  async function openSelfCertModal() {
    setSelfCertName(defaultCompletedByName || "");
    setSelfCertDepartment(selectedLocationContract?.division || "");
    setSelfCertEmployeeNumber(String(currentUserProfile?.employee_number || ""));
    setSelfCertFirstDayAbsence(buildTodayIsoDate());
    setSelfCertWorkingDaysLost("");
    setSelfCertNotificationTo("");
    setSelfCertReasonSymptoms("");
    setSelfCertHadInjury(null);
    setSelfCertInjuryDetails("");
    setSelfCertInjuryOccurred(null);
    setSelfCertSoughtMedicalAdvice(null);
    setSelfCertConsultedDoctorAgain(null);
    setSelfCertVisitedHospital(null);
    setSelfCertEmployeeSignature("");
    setSelfCertSignatureHasStroke(false);
    setSelfCertModalOpen(true);

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser?.id) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("line_manager_user_id")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!profile?.line_manager_user_id) return;

      const [{ data: managerProfile }, { data: managerDirectory }] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("full_name")
          .eq("user_id", profile.line_manager_user_id)
          .maybeSingle(),
        supabase
          .from("people_directory")
          .select("full_name")
          .eq("portal_user_id", profile.line_manager_user_id)
          .maybeSingle(),
      ]);

      const managerName = String(managerProfile?.full_name || managerDirectory?.full_name || "").trim();
      if (managerName) {
        setSelfCertNotificationTo(managerName);
      }
    } catch (error) {
      console.warn("Could not prefill line manager for self cert:", error?.message || error);
    }
  }

  function getSignaturePoint(event) {
    const source = event?.touches?.[0] || event?.changedTouches?.[0] || event;
    return {
      clientX: Number(source?.clientX || 0),
      clientY: Number(source?.clientY || 0),
    };
  }

  function startSignatureStroke(event) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    if (event?.cancelable) event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const { clientX, clientY } = getSignaturePoint(event);
    signatureDrawStateRef.current = {
      drawing: true,
      lastX: clientX - rect.left,
      lastY: clientY - rect.top,
    };
  }

  function moveSignatureStroke(event) {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !signatureDrawStateRef.current.drawing) return;
    if (event?.cancelable) event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const { clientX, clientY } = getSignaturePoint(event);
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(signatureDrawStateRef.current.lastX, signatureDrawStateRef.current.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    signatureDrawStateRef.current.lastX = x;
    signatureDrawStateRef.current.lastY = y;
    setSelfCertSignatureHasStroke(true);
  }

  function endSignatureStroke() {
    signatureDrawStateRef.current.drawing = false;
  }

  function clearSignaturePad() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setSelfCertSignatureHasStroke(false);
  }

  function saveSignaturePad() {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !selfCertSignatureHasStroke) {
      window.alert("Please sign before saving.");
      return;
    }
    setSelfCertEmployeeSignature(canvas.toDataURL("image/png"));
    setSelfCertSignatureModalOpen(false);
  }

  async function submitSelfCertFromPortal(e) {
    e.preventDefault();
    if (!selfCertName.trim()) {
      window.alert("Please enter your name.");
      return;
    }
    if (!selfCertWorkingDaysLost.trim()) {
      window.alert("Please enter working days lost.");
      return;
    }
    if (!selfCertReasonSymptoms.trim()) {
      window.alert("Please add reason and symptoms.");
      return;
    }
    if (selfCertHadInjury === true && !selfCertInjuryDetails.trim()) {
      window.alert("Please explain how the injury occurred.");
      return;
    }
    if (selfCertHadInjury === true && selfCertInjuryOccurred === null) {
      window.alert("Please confirm whether it happened at work.");
      return;
    }
    if (!selfCertEmployeeSignature) {
      window.alert("Please capture employee signature.");
      return;
    }

    setSelfCertSubmitting(true);
    try {
      const payload = {
        name: selfCertName.trim(),
        department: selfCertDepartment.trim(),
        employeeNumber: selfCertEmployeeNumber.trim(),
        firstDayOfAbsence: selfCertFirstDayAbsence,
        workingDaysLost: Number(selfCertWorkingDaysLost),
        notificationOfAbsenceMadeTo: selfCertNotificationTo.trim(),
        reasonAndSymptoms: selfCertReasonSymptoms.trim(),
        injuryOccurred: selfCertHadInjury === true ? selfCertInjuryOccurred === true : false,
        injuryDetails: selfCertHadInjury === true ? selfCertInjuryDetails.trim() : "No injury reported",
        soughtMedicalAdvice: selfCertSoughtMedicalAdvice === true,
        consultedDoctorAgain: selfCertConsultedDoctorAgain === true,
        visitedHospitalOrClinic: selfCertVisitedHospital === true,
        employeeSignature: selfCertEmployeeSignature,
      };

      const { data, error } = await supabase.functions.invoke("submit-self-cert", {
        body: payload,
      });

      if (error || data?.success === false) {
        throw new Error(error?.message || data?.error || "Could not submit self cert form.");
      }

      setSelfCertModalOpen(false);
      setFormsView("my_forms");
      await fetchMySelfCertForms();
      setMessage("Self cert submitted from portal.");
    } catch (error) {
      window.alert(`Self cert submission failed: ${error?.message || "Unknown error"}`);
    } finally {
      setSelfCertSubmitting(false);
    }
  }

  async function fetchContractCompletedForms(contract) {
    if (!contract) return;

    setContractFormsLoading(true);
    setContractFormsError("");

    const idFilter = contract.id ? `contract_id.eq.${contract.id}` : "";
    const numFilter = contract.contractNumber ? `contract_number.eq.${contract.contractNumber}` : "";
    const nameFilter = contract.name ? `contract_name.eq.${contract.name}` : "";
    const orFilters = [idFilter, numFilter, nameFilter].filter(Boolean).join(",");

    const query = supabase
      .from("roller_daily_checks")
      .select(
        "id, created_at, check_date, machine_type, machine_reg, asset_no, serial_no, machine_hours, sheet_version, job_title, checklist, notes, contract_id, contract_name, contract_number, location, completed_by_name, has_defects"
      )
      .order("created_at", { ascending: false });

    const { data, error } = orFilters ? await query.or(orFilters) : await query.eq("contract_name", contract.name);

    if (error) {
      setContractFormsError(error.message);
      setContractCompletedForms([]);
      setContractFormsLoading(false);
      return;
    }

    setContractCompletedForms(data || []);
    setContractFormsLoading(false);
  }

  async function fetchAssignedFormsForContract(contractId, target = "modal") {
    if (!contractId) {
      if (target === "modal") setContractAssignedForms([]);
      if (target === "forms") setLocationAssignedForms([]);
      return [];
    }

    const { data, error } = await supabase
      .from("contract_required_forms")
      .select("id, form_template_id, is_active, form_templates(template_code, title)")
      .eq("contract_id", contractId)
      .eq("is_active", true);

    if (error) {
      setContractsMessage(`Could not load assigned forms: ${error.message}`);
      if (target === "modal") setContractAssignedForms([]);
      if (target === "forms") setLocationAssignedForms([]);
      return [];
    }

    const byCode = new Map(TEMPLATE_FORMS.map((f) => [f.id, f]));
    const mapped = (data || []).map((row) => {
      const code = row.form_templates?.template_code || "";
      const match = byCode.get(code);
      return {
        id: code || row.form_template_id,
        title: row.form_templates?.title || match?.title || "Assigned Form",
        contractNo: match?.contractNo || "FORM",
      };
    });

    if (target === "modal") setContractAssignedForms(mapped);
    if (target === "forms") setLocationAssignedForms(mapped);
    return mapped;
  }

  function openContractFormsModal() {
    const selectedIds = contractAssignedForms.map((f) => f.id);
    setContractFormsSelection(selectedIds);
    setContractFormsModalOpen(true);
  }

  function closeContractFormsModal() {
    if (contractFormsSaving) return;
    setContractFormsModalOpen(false);
  }

  async function handleSaveContractForms() {
    if (!selectedContract?.id) return;

    setContractFormsSaving(true);
    setContractsMessage("");

    try {
      const selectedDefs = TEMPLATE_FORMS.filter((f) => contractFormsSelection.includes(f.id));
      const selectedCodes = selectedDefs.map((f) => f.id);

      if (selectedDefs.length > 0) {
        const upsertTemplates = selectedDefs.map((form) => ({
          template_code: form.id,
          title: form.title,
          description: `${form.title} template`,
          frequency: "daily",
          checklist: [],
          is_active: true,
        }));

        const { error: templateUpsertError } = await supabase
          .from("form_templates")
          .upsert(upsertTemplates, { onConflict: "template_code" });

        if (templateUpsertError) {
          setContractsMessage(`Save forms failed: ${templateUpsertError.message}`);
          setContractFormsSaving(false);
          return;
        }
      }

      const { data: templateRows, error: templateSelectError } = selectedCodes.length
        ? await supabase
            .from("form_templates")
            .select("id, template_code")
            .in("template_code", selectedCodes)
        : { data: [], error: null };

      if (templateSelectError) {
        setContractsMessage(`Save forms failed: ${templateSelectError.message}`);
        setContractFormsSaving(false);
        return;
      }

      const selectedTemplateIds = Array.from(new Set((templateRows || []).map((r) => r.id).filter(Boolean)));

      if (selectedTemplateIds.length > 0) {
        const upsertRows = selectedTemplateIds.map((templateId) => ({
          contract_id: selectedContract.id,
          form_template_id: templateId,
          is_active: true,
        }));

        const { error: requiredUpsertError } = await supabase
          .from("contract_required_forms")
          .upsert(upsertRows, { onConflict: "contract_id,form_template_id" });

        if (requiredUpsertError) {
          setContractsMessage(`Save forms failed: ${requiredUpsertError.message}`);
          setContractFormsSaving(false);
          return;
        }
      }

      const { data: existingRows, error: existingError } = await supabase
        .from("contract_required_forms")
        .select("id, form_template_id")
        .eq("contract_id", selectedContract.id);

      if (existingError) {
        setContractsMessage(`Save forms failed: ${existingError.message}`);
        setContractFormsSaving(false);
        return;
      }

      const deactivateIds = (existingRows || [])
        .filter((row) => !selectedTemplateIds.includes(row.form_template_id))
        .map((row) => row.id);

      if (deactivateIds.length > 0) {
        const { error: deactivateError } = await supabase
          .from("contract_required_forms")
          .update({ is_active: false })
          .in("id", deactivateIds);

        if (deactivateError) {
          setContractsMessage(`Save forms failed: ${deactivateError.message}`);
          setContractFormsSaving(false);
          return;
        }
      }

      setContractsMessage(`Forms assigned to ${selectedContract.name}.`);
      await fetchAssignedFormsForContract(selectedContract.id, "modal");
      if (selectedContractId === selectedContract.id) {
        await fetchAssignedFormsForContract(selectedContract.id, "forms");
      }
      setContractFormsModalOpen(false);
    } finally {
      setContractFormsSaving(false);
    }
  }

  function resetChecklistFormToNew(contractId, formId) {
    setSelectedFormId(formId);
    setSelectedContractId(contractId || "");
    setSheetVersion("1");
    setCompletedByName(defaultCompletedByName);
    setJobTitle(defaultJobTitle);
    setCheckDate(buildTodayIsoDate());
    setMachineReg("");
    setAssetNo("");
    setSerialNo("");
    setMachineHours("");
    setMachineType("Roller");
    setChecklist(buildInitialChecklist());
    setNotes("");
    setLastSubmission(null);
    setMessage("");
  }

  async function handleStartContractForm(formId, mode) {
    if (!selectedContract?.id) return;

    setActiveTab("forms");
    setFormsView("assigned");

    if (mode === "new") {
      resetChecklistFormToNew(selectedContract.id, formId);
      closeContractModal();
      return;
    }

    const { data, error } = await supabase
      .from("roller_daily_checks")
      .select(
        "id, created_at, check_date, machine_type, machine_reg, asset_no, serial_no, machine_hours, sheet_version, job_title, checklist, notes, contract_id, contract_name, contract_number, location, completed_by_name, has_defects"
      )
      .eq("contract_id", selectedContract.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setMessage(`Copy failed: ${error.message}`);
      closeContractModal();
      return;
    }

    if (!data) {
      setMessage("No previous completed form found for this contract. Starting a new form instead.");
      resetChecklistFormToNew(selectedContract.id, formId);
      closeContractModal();
      return;
    }

    setSelectedFormId(formId);
    setSelectedContractId(selectedContract.id);
    setSheetVersion(String(data.sheet_version || "1"));
    // Identity fields must always reflect the currently signed-in user.
    setCompletedByName(defaultCompletedByName);
    setJobTitle(defaultJobTitle);
    setCheckDate(buildTodayIsoDate());
    setMachineReg(data.machine_reg || "");
    setAssetNo(data.asset_no || "");
    setSerialNo(data.serial_no || "");
    setMachineHours(data.machine_hours != null ? String(data.machine_hours) : "");
    setMachineType(data.machine_type || "Roller");
    setChecklist({ ...buildInitialChecklist(), ...(data.checklist || {}) });
    setNotes(data.notes || "");
    setLastSubmission(null);
    setMessage("Copied from latest completed checklist for this contract. Date has been set to today.");

    closeContractModal();
  }

  async function fetchMaintenanceUsers() {
    setUsersLoading(true);
    setUsersMessage("");

    const { data, error } = await supabase
      .from("people_directory")
      .select("person_key, portal_user_id, full_name, email, phone, job_role, authority, regions, source_projects")
      .order("updated_at", { ascending: false });

    if (error) {
      setUsersMessage(`Failed to load users: ${error.message}`);
      setMaintenanceUsers([]);
      setUsersLoading(false);
      return;
    }

    const merged = (data || []).map((row) => ({
      person_key: row.person_key,
      portal_user_id: row.portal_user_id || null,
      maintenance_role: "-",
      source_project: Array.isArray(row.source_projects) && row.source_projects.length
        ? row.source_projects.join(", ")
        : "portal",
      authority: row.authority || "user",
      full_name: row.full_name || "",
      email: row.email || "",
      phone: row.phone || "",
      job_role: row.job_role || "",
      employee_number: "",
      line_manager_user_id: "",
      has_direct_reports: false,
      divisions: row.regions || [],
      regionsText: (row.regions || []).join(", "),
      assignedContracts: [],
    }));

    const linkedUserIds = merged.map((u) => u.portal_user_id).filter(Boolean);
    if (linkedUserIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("user_profiles")
        .select("user_id, employee_number, line_manager_user_id, has_direct_reports")
        .in("user_id", linkedUserIds);

      if (!profileError) {
        const profileByUserId = new Map((profileRows || []).map((row) => [row.user_id, row]));
        merged.forEach((u) => {
          if (!u.portal_user_id) return;
          const profile = profileByUserId.get(u.portal_user_id);
          if (!profile) return;
          u.employee_number = profile.employee_number || "";
          u.line_manager_user_id = profile.line_manager_user_id || "";
          u.has_direct_reports = profile.has_direct_reports === true;
        });
      }

      const { data: assignments, error: assignmentsError } = await supabase
        .from("contract_team_roles")
        .select("user_id, contracts(name, contract_number)")
        .in("user_id", linkedUserIds);

      if (!assignmentsError) {
        const byUser = new Map();
        (assignments || []).forEach((row) => {
          const userId = row.user_id;
          if (!userId) return;
          const label = row.contracts?.name
            ? `${row.contracts.name} (${row.contracts.contract_number || "-"})`
            : "Contract";
          const existing = byUser.get(userId) || [];
          if (!existing.includes(label)) existing.push(label);
          byUser.set(userId, existing);
        });

        merged.forEach((u) => {
          u.assignedContracts = u.portal_user_id ? (byUser.get(u.portal_user_id) || []) : [];
        });
      }
    }

    merged.sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));
    setMaintenanceUsers(merged);

    // Keep rows collapsed by default; expand only when user is explicitly clicked.
    if (selectedUserId && !merged.some((u) => u.person_key === selectedUserId)) {
      setSelectedUserId("");
    }

    setUsersLoading(false);
  }

  function handleUserFieldChange(personKey, field, value) {
    setMaintenanceUsers((prev) =>
      prev.map((u) => (u.person_key === personKey ? { ...u, [field]: value } : u))
    );
  }

  async function handleImportMaintenanceUsers() {
    await invokeExternalImport("maintenance-admin");
  }

  async function invokeExternalImport(sourceProject) {
    setUsersMessage("");
    setUsersDebug(null);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setUsersMessage(`Import failed: ${sessionError?.message || "No active session token."}`);
      return;
    }

    const { data, error } = await supabase.functions.invoke("import-external-users", {
      body: { sourceProject },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      const detail = await formatFunctionInvokeError(error);
      setUsersDebug(await buildFunctionDebug("import-external-users", error, data, detail));
      setUsersMessage(`Import failed: ${detail}`);
      return;
    }

    if (data?.error) {
      setUsersDebug({
        functionName: "import-external-users",
        ok: false,
        kind: "payload-error",
        detail: String(data.error),
        at: new Date().toISOString(),
      });
      setUsersMessage(`Import failed: ${data.error}`);
      return;
    }

    setUsersDebug(await buildFunctionDebug("import-external-users", null, data));
    const warnings = Array.isArray(data?.warnings) && data.warnings.length
      ? ` Warnings: ${data.warnings.join(" | ")}`
      : "";
    setUsersMessage(
      `Imported ${data?.importedCount ?? 0} contacts from ${data?.sourceProject || "external"}. ` +
      `Linked ${data?.linkedCount ?? 0} to contracts auth.${warnings}`
    );
    fetchMaintenanceUsers();
  }

  async function handleImportSitebatchUsers() {
    await invokeExternalImport("sitebatch-inspections");
  }

  async function handleInviteContact(contact) {
    if (!contact?.email) {
      setUsersMessage("Invite failed: contact has no email address.");
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setUsersMessage(`Invite failed: ${sessionError?.message || "No active session token."}`);
      return;
    }

    setInvitingPersonKey(contact.person_key);
    const { data, error } = await supabase.functions.invoke("invite-portal-user", {
      body: {
        personKey: contact.person_key,
        email: contact.email,
        displayName: contact.full_name,
        phone: contact.phone,
        jobRole: contact.job_role,
        regions: contact.divisions || [],
        authority: contact.authority || "user",
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      const detail = await formatFunctionInvokeError(error);
      setUsersMessage(`Invite failed: ${detail}`);
      setInvitingPersonKey("");
      return;
    }

    if (data?.error) {
      setUsersMessage(`Invite failed: ${data.error}`);
      setInvitingPersonKey("");
      return;
    }

    setUsersMessage(
      data?.alreadyLinked
        ? `Contact already linked to contracts auth: ${contact.email}`
        : `Invite sent and contact linked: ${contact.email}`
    );

    await Promise.all([fetchMaintenanceUsers(), selectedContract?.id ? fetchContractTeam(selectedContract.id) : Promise.resolve()]);
    setInvitingPersonKey("");
  }

  async function handleSaveUser(userRow) {
    setUsersMessage("");

    const parsedRegions = (userRow.regionsText || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const { error: directoryError } = await supabase.from("people_directory").upsert(
      {
        person_key: userRow.person_key,
        portal_user_id: userRow.portal_user_id || null,
        full_name: userRow.full_name || null,
        email: userRow.email || null,
        phone: userRow.phone || null,
        job_role: userRow.job_role || null,
        authority: userRow.authority || "user",
        regions: parsedRegions,
      },
      { onConflict: "person_key" }
    );

    if (directoryError) {
      setUsersMessage(`Save failed: ${directoryError.message}`);
      return;
    }

    if (!userRow.portal_user_id) {
      setUsersMessage("Contact updated (not linked to contracts auth yet).");
      setSelectedUserId("");
      fetchMaintenanceUsers();
      return;
    }

    const rolePayload = {
      user_id: userRow.portal_user_id,
      role: userRow.authority === "admin" ? "admin" : "viewer",
    };
    const profilePayload = {
      user_id: userRow.portal_user_id,
      full_name: userRow.full_name || null,
      email: userRow.email || null,
      phone: userRow.phone || null,
      job_role: userRow.job_role || null,
      authority: userRow.authority || "user",
      regions: parsedRegions,
      employee_number: String(userRow.employee_number || "").trim() || null,
      line_manager_user_id: String(userRow.line_manager_user_id || "").trim() || null,
      has_direct_reports: userRow.has_direct_reports === true,
    };

    const [roleRes, profileRes] = await Promise.all([
      supabase.from("app_user_roles").upsert(rolePayload, { onConflict: "user_id" }),
      supabase.from("user_profiles").upsert(profilePayload, { onConflict: "user_id" }),
    ]);

    if (roleRes.error || profileRes.error) {
      setUsersMessage(`Save failed: ${roleRes.error?.message || profileRes.error?.message}`);
      return;
    }

    setUsersMessage("User updated.");
    setSelectedUserId("");
    fetchMaintenanceUsers();
  }

  async function handleAddUser(e) {
    e.preventDefault();
    setUsersMessage("");
    setUsersDebug(null);

    const selectedRegions = collectDraftRegions(newUserDraft);

    const userId = newUserDraft.userId.trim();
    if (!newUserDraft.email.trim()) {
      setUsersMessage("Email Address is required.");
      return;
    }

    if (!newUserDraft.displayName.trim()) {
      setUsersMessage("Display Name is required.");
      return;
    }

    // If no UUID is provided, create the auth user first via secure edge function.
    if (!userId) {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setUsersMessage(`Add user failed: ${sessionError?.message || "No active session token."}`);
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-portal-user", {
        body: {
          email: newUserDraft.email.trim(),
          displayName: newUserDraft.displayName.trim(),
          phone: newUserDraft.phone.trim() || null,
          jobRole: newUserDraft.jobRole.trim() || null,
          employeeNumber: newUserDraft.employeeNumber.trim() || null,
          lineManagerUserId: newUserDraft.lineManagerUserId.trim() || null,
          hasDirectReports: newUserDraft.hasDirectReports === true,
          regions: selectedRegions,
          authority: newUserDraft.authority,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        const detail = await formatFunctionInvokeError(error);
        setUsersDebug(await buildFunctionDebug("create-portal-user", error, data, detail));
        setUsersMessage(`Add user failed: ${detail}`);
        return;
      }

      if (data?.error) {
        setUsersDebug({
          functionName: "create-portal-user",
          ok: false,
          kind: "payload-error",
          detail: String(data.error),
          at: new Date().toISOString(),
        });
        setUsersMessage(`Add user failed: ${data.error}`);
        return;
      }

      setUsersDebug(await buildFunctionDebug("create-portal-user", null, data));
      setNewUserDraft({
        userId: "",
        authority: "user",
        displayName: "",
        email: "",
        phone: "",
        jobRole: "",
        employeeNumber: "",
        lineManagerUserId: "",
        hasDirectReports: false,
        regionsSelected: [],
        otherRegionEnabled: false,
        otherRegionText: "",
      });
      setIsAddRegionsExpanded(false);
      setUsersMessage(`User created: ${data?.email || newUserDraft.email}`);
      fetchMaintenanceUsers();
      return;
    }

    const personKey = newUserDraft.email.trim()
      ? `email:${newUserDraft.email.trim().toLowerCase()}`
      : newUserDraft.phone.trim()
        ? `phone:${newUserDraft.phone.trim()}`
        : `portal:${userId}`;

    const [roleRes, profileRes, directoryRes] = await Promise.all([
      supabase.from("app_user_roles").upsert(
        {
          user_id: userId,
          role: newUserDraft.authority === "admin" ? "admin" : "viewer",
        },
        { onConflict: "user_id" }
      ),
      supabase.from("user_profiles").upsert(
        {
          user_id: userId,
          full_name: newUserDraft.displayName || null,
          email: newUserDraft.email || null,
          phone: newUserDraft.phone || null,
          job_role: newUserDraft.jobRole || null,
          authority: newUserDraft.authority || "user",
          regions: selectedRegions,
          employee_number: String(newUserDraft.employeeNumber || "").trim() || null,
          line_manager_user_id: String(newUserDraft.lineManagerUserId || "").trim() || null,
          has_direct_reports: newUserDraft.hasDirectReports === true,
        },
        { onConflict: "user_id" }
      ),
      supabase.from("people_directory").upsert(
        {
          person_key: personKey,
          portal_user_id: userId,
          full_name: newUserDraft.displayName || null,
          email: newUserDraft.email || null,
          phone: newUserDraft.phone || null,
          job_role: newUserDraft.jobRole || null,
          authority: newUserDraft.authority || "user",
          regions: selectedRegions,
          source_projects: ["portal"],
        },
        { onConflict: "person_key" }
      ),
    ]);

    if (roleRes.error || profileRes.error || directoryRes.error) {
      setUsersDebug({
        functionName: "direct-db-upsert",
        ok: false,
        kind: "db",
        detail: String(roleRes.error?.message || profileRes.error?.message || directoryRes.error?.message || "Unknown DB error"),
        at: new Date().toISOString(),
      });
      setUsersMessage(`Add user failed: ${roleRes.error?.message || profileRes.error?.message || directoryRes.error?.message}`);
      return;
    }

    setUsersDebug({
      functionName: "direct-db-upsert",
      ok: true,
      kind: "ok",
      detail: "Direct add succeeded.",
      at: new Date().toISOString(),
    });
    setNewUserDraft({
      userId: "",
      authority: "user",
      displayName: "",
      email: "",
      phone: "",
      jobRole: "",
      employeeNumber: "",
      lineManagerUserId: "",
      hasDirectReports: false,
      regionsSelected: [],
      otherRegionEnabled: false,
      otherRegionText: "",
    });
    setIsAddRegionsExpanded(false);
    setUsersMessage("User added.");
    fetchMaintenanceUsers();
  }

  useEffect(() => {
    fetchContracts();
  }, []);

  useEffect(() => {
    fetchCurrentUserProfile();
  }, [user?.id]);

  useEffect(() => {
    fetchAssetDirectory();
  }, []);

  useEffect(() => {
    if (!defaultCompletedByName) return;

    setCompletedByName((prev) => {
      const current = String(prev || "").trim();
      const emailFallback = String(user?.email || "").trim();
      if (!current || current === emailFallback) {
        return defaultCompletedByName;
      }
      return prev;
    });

    setJobTitle((prev) => {
      const current = String(prev || "").trim();
      if (!current && defaultJobTitle) {
        return defaultJobTitle;
      }
      return prev;
    });
  }, [defaultCompletedByName, defaultJobTitle, user?.email]);

  useEffect(() => {
    if (activeTab === "forms" && formsView === "completed") {
      fetchCompletedForms();
    }
  }, [activeTab, formsView, currentAppRole, currentUserContractIds]);

  useEffect(() => {
    if (activeTab === "forms" && formsView === "my_forms") {
      fetchMySelfCertForms();
    }
  }, [activeTab, formsView, user?.id]);

  useEffect(() => {
    fetchPendingSelfCertApprovals();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const timer = window.setInterval(() => {
      fetchPendingSelfCertApprovals();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  useEffect(() => {
    if (!selectedCompletedForm) return;
    const freshMatch = completedForms.find((f) => f.id === selectedCompletedForm.id) || null;
    setSelectedCompletedForm(freshMatch);
  }, [completedForms]);

  useEffect(() => {
    if (selectedContract && activeContractTab === "completed_forms") {
      fetchContractCompletedForms(selectedContract);
    }
  }, [selectedContract, activeContractTab]);

  useEffect(() => {
    if (selectedContract && activeContractTab === "forms") {
      fetchAssignedFormsForContract(selectedContract.id, "modal");
    }
  }, [selectedContract, activeContractTab]);

  useEffect(() => {
    if (selectedContractId) {
      fetchAssignedFormsForContract(selectedContractId, "forms");
      return;
    }
    setLocationAssignedForms([]);
  }, [selectedContractId]);

  useEffect(() => {
    if (!selectedContractId) return;
    const assignedIds = locationAssignedForms.map((f) => f.id);
    if (assignedIds.length === 0) {
      setSelectedFormId("");
      return;
    }
    if (!assignedIds.includes(selectedFormId)) {
      setSelectedFormId(assignedIds[0]);
    }
  }, [selectedContractId, locationAssignedForms, selectedFormId]);

  useEffect(() => {
    if (activeTab === "admin" && adminTab === "user_access") {
      fetchMaintenanceUsers();
    }
  }, [activeTab, adminTab]);

  async function signOut() {
    await supabase.auth.signOut();
    onSignOut();
  }

  function buildChecklistDefectDrafts() {
    const notesByItem = parseDefectNotesByChecklistItem(notes);
    const selectedAsset = String(assetNo || machineReg || machineType || "").trim();
    const selectedContract = selectedLocationContract || null;
    const currentCheckDate = checkDate || null;
    const currentMachineReg = machineReg || null;
    const currentAssetNo = assetNo || null;
    const currentSerialNo = serialNo || null;
    const currentSubmittedBy = completedByName || user?.email || "Contracts Portal";

    const defectItems = CHECK_LABELS.filter((item) => checklist[item] === "X");
    return defectItems.map((item, idx) => {
      const noteDetail = String(notesByItem[item] || "").trim();
      return {
        id: `${idx}-${item}`,
        checklist_item: item,
        should_record: true,
        title: item,
        description: noteDetail || `Defect identified in checklist item: ${item}`,
        category: "",
        other_category_text: "",
        priority: 3,
        asset: selectedAsset,
        submitted_by: currentSubmittedBy,
        contract_id: selectedContract?.id || null,
        contract_name: selectedContract?.name || null,
        contract_number: selectedContract?.contractNumber || null,
        machine_reg: currentMachineReg,
        asset_no: currentAssetNo,
        serial_no: currentSerialNo,
        check_date: currentCheckDate,
        photo_uploads: [],
      };
    });
  }

  function setDefectCaptureRowField(id, field, value) {
    setDefectCaptureRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }

  function resolveDefectCategory(row) {
    const category = String(row?.category || "").trim();
    if (category !== "Other") return category;
    const other = String(row?.other_category_text || "").trim();
    return other ? `Other: ${other}` : "Other";
  }

  async function handleDefectPhotoSelection(id, fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    let selected = files.slice(0, DEFECT_PHOTO_MAX_FILES);
    if (files.length > DEFECT_PHOTO_MAX_FILES) {
      setMessage(`Photo limit is ${DEFECT_PHOTO_MAX_FILES} per defect. Extra files were ignored.`);
    }

    selected = selected.filter((file) => {
      const sizeMb = Number(file.size || 0) / (1024 * 1024);
      return sizeMb <= DEFECT_PHOTO_MAX_MB;
    });

    if (selected.length === 0) {
      setMessage(`Photos too large. Each file must be ${DEFECT_PHOTO_MAX_MB}MB or less.`);
      return;
    }

    try {
      const prepared = await Promise.all(
        selected.map(async (file) => ({
          name: file.name,
          type: file.type || "image/jpeg",
          dataUrl: await readFileAsDataUrl(file),
        }))
      );

      setDefectCaptureRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const merged = [...(Array.isArray(row.photo_uploads) ? row.photo_uploads : []), ...prepared].slice(
            0,
            DEFECT_PHOTO_MAX_FILES
          );
          return { ...row, photo_uploads: merged };
        })
      );
    } catch (error) {
      setMessage(`Could not process selected image(s): ${error?.message || "Unknown error"}`);
    }
  }

  function removeDefectPhoto(rowId, photoIndex) {
    setDefectCaptureRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const next = [...(Array.isArray(row.photo_uploads) ? row.photo_uploads : [])];
        next.splice(photoIndex, 1);
        return { ...row, photo_uploads: next };
      })
    );
  }

  function closeDefectCaptureModal() {
    if (defectCaptureSubmitting) return;
    setDefectCaptureModalOpen(false);
  }

  async function submitChecklistDefectsToMaintenance() {
    const selectedRows = defectCaptureRows.filter((row) => row.should_record);
    if (selectedRows.length === 0) {
      setDefectCaptureModalOpen(false);
      setMessage("Checklist saved. No defects were sent to Maintenance Defect System.");
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setMessage(`Defect handoff failed: ${sessionError?.message || "No active session token."}`);
      return;
    }

    for (const row of selectedRows) {
      const category = String(row.category || "").trim();
      if (!category) {
        setMessage(`Defect handoff failed: choose a category for \"${row.checklist_item}\".`);
        return;
      }

      if (!MAINTENANCE_DEFECT_CATEGORIES.includes(category)) {
        setMessage(`Defect handoff failed: choose a valid category for \"${row.checklist_item}\".`);
        return;
      }

      if (category === "Other" && !String(row.other_category_text || "").trim()) {
        setMessage(`Defect handoff failed: enter Other category details for \"${row.checklist_item}\".`);
        return;
      }

      const priority = Number(row.priority);
      if (!MAINTENANCE_PRIORITY_OPTIONS.some((opt) => opt.value === priority)) {
        setMessage(`Defect handoff failed: choose priority 1-6 for \"${row.checklist_item}\".`);
        return;
      }
    }

    setDefectCaptureSubmitting(true);

    try {
      const defectsPayload = selectedRows.map((row) => ({
        asset: row.asset,
        title: row.title,
        description: row.description,
        category: resolveDefectCategory(row),
        priority: Number(row.priority) || 3,
        submitted_by: row.submitted_by,
        status: "Reported",
        contract_id: row.contract_id,
        contract_name: row.contract_name,
        contract_number: row.contract_number,
        checklist_item: row.checklist_item,
        machine_reg: row.machine_reg,
        asset_no: row.asset_no,
        serial_no: row.serial_no,
        check_date: row.check_date,
        photos: Array.isArray(row.photo_uploads)
          ? row.photo_uploads.map((photo) => ({
              name: photo.name,
              type: photo.type,
              dataUrl: photo.dataUrl,
            }))
          : [],
      }));

      const { data, error } = await supabase.functions.invoke("raise-maintenance-defects", {
        body: { defects: defectsPayload },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        setMessage(`Defect handoff failed: ${error.message}`);
        return;
      }

      if (!data?.success) {
        setMessage(`Defect handoff failed: ${data?.error || "Unknown error"}`);
        return;
      }

      setDefectCaptureModalOpen(false);
      const photoWarnings = Array.isArray(data?.photoWarnings) && data.photoWarnings.length > 0
        ? ` Photo upload notes: ${data.photoWarnings.join(" | ")}`
        : "";
      setMessage(
        `Checklist saved. ${data.createdCount || 0} defect(s) sent to Maintenance Defect System and email alerts triggered.${photoWarnings}`
      );
    } finally {
      setDefectCaptureSubmitting(false);
    }
  }

  async function submitForm(e) {
    e.preventDefault();
    setMessage("");

    if (!selectedFormId) {
      setMessage("Select an assigned form before submitting.");
      return;
    }

    if (!selectedLocationContract) {
      setMessage("Select a contract/location before submitting the form.");
      return;
    }

    if (!locationAssignedForms.some((f) => f.id === selectedFormId)) {
      setMessage("Selected form is not assigned to this contract.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        created_by: user?.id,
        sheet_version: sheetVersion,
        completed_by_name: completedByName,
        job_title: jobTitle,
        check_date: checkDate,
        machine_reg: machineReg,
        asset_no: assetNo,
        serial_no: serialNo,
        machine_hours: machineHours ? Number(machineHours) : null,
        machine_type: machineType,
        contract_id: selectedLocationContract?.id || null,
        contract_name: selectedLocationContract?.name || null,
        contract_number: selectedLocationContract?.contractNumber || null,
        location: selectedLocationContract?.name || "",
        checklist,
        notes,
        has_defects: defectFound,
      };

      const { data, error } = await supabase
        .from("roller_daily_checks")
        .insert(payload)
        .select()
        .single();

      if (error) {
        setMessage(`Save failed: ${error.message}. If this is first run, create table roller_daily_checks.`);
        return;
      }

      setLastSubmission(data);
      if (defectFound) {
        const drafts = buildChecklistDefectDrafts();
        if (drafts.length > 0) {
          setDefectCaptureRows(drafts);
          setDefectCaptureModalOpen(true);
          setMessage("Roller form saved with defects flagged. Review each defect below and choose what to record in Maintenance Defect System.");
        } else {
          setMessage("Roller form saved with defects flagged.");
        }
      } else {
        setMessage("Roller form saved successfully.");
      }
      if (formsView === "completed") {
        fetchCompletedForms();
      }
      if (selectedContract && activeContractTab === "completed_forms") {
        fetchContractCompletedForms(selectedContract);
      }
    } catch (err) {
      setMessage(`Save failed unexpectedly: ${err?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  function handleStatusChange(item, status) {
    if (status === "X" && checklist[item] !== "X") {
      const defectDetail = window.prompt(`Defect details for: ${item}`);

      if (defectDetail === null) {
        return;
      }

      const trimmedDetail = defectDetail.trim();
      if (!trimmedDetail) {
        window.alert("Please enter defect details before marking as defect.");
        return;
      }

      setNotes((prev) => {
        const prefix = prev && prev.trim() ? `${prev.trim()}\n` : "";
        return `${prefix}Defect - ${item}: ${trimmedDetail}`;
      });
    }

    setChecklist((prev) => ({ ...prev, [item]: status }));
  }

  function handleCheckAllComplete() {
    const confirmed = window.confirm(
      "Are you sure you have checked all components and happy to proceed."
    );

    if (!confirmed) return;

    const nextChecklist = CHECK_LABELS.reduce((acc, label) => {
      acc[label] = "Y";
      return acc;
    }, {});

    setChecklist(nextChecklist);
  }

  function handleCheckAllToggle(e) {
    const nextChecked = e.target.checked;

    if (nextChecked) {
      handleCheckAllComplete();
      return;
    }

    const clearedChecklist = CHECK_LABELS.reduce((acc, label) => {
      acc[label] = "";
      return acc;
    }, {});

    setChecklist(clearedChecklist);
  }

  async function handleDownloadPdf() {
    const data =
      lastSubmission || {
        sheet_version: sheetVersion,
        completed_by_name: completedByName,
        job_title: jobTitle,
        check_date: checkDate,
        machine_reg: machineReg,
        asset_no: assetNo,
        serial_no: serialNo,
        machine_hours: machineHours ? Number(machineHours) : null,
        machine_type: machineType,
        contract_id: selectedLocationContract?.id || null,
        contract_name: selectedLocationContract?.name || null,
        contract_number: selectedLocationContract?.contractNumber || null,
        location: selectedLocationContract?.name || "",
        checklist,
        notes,
        has_defects: defectFound,
      };
    await generateA4Pdf(data);
  }

  async function handlePreviewPdf() {
    const data =
      lastSubmission || {
        sheet_version: sheetVersion,
        completed_by_name: completedByName,
        job_title: jobTitle,
        check_date: checkDate,
        machine_reg: machineReg,
        asset_no: assetNo,
        serial_no: serialNo,
        machine_hours: machineHours ? Number(machineHours) : null,
        machine_type: machineType,
        contract_id: selectedLocationContract?.id || null,
        contract_name: selectedLocationContract?.name || null,
        contract_number: selectedLocationContract?.contractNumber || null,
        location: selectedLocationContract?.name || "",
        checklist,
        notes,
        has_defects: defectFound,
      };
    await generateA4Pdf(data, { preview: true });
  }

  async function handleViewPdfFromRecord(form) {
    await generateA4Pdf(form, { preview: true });
  }

  async function handleDownloadPdfFromRecord(form) {
    await generateA4Pdf(form);
  }

  async function handleDeleteCompletedForm(formId) {
    const confirmed = window.confirm("Delete this completed form?");
    if (!confirmed) return;

    const { error } = await supabase.from("roller_daily_checks").delete().eq("id", formId);
    if (error) {
      window.alert(`Delete failed: ${error.message}`);
      return;
    }

    if (selectedCompletedForm?.id === formId) {
      setSelectedCompletedForm(null);
    }

    fetchCompletedForms();
    if (selectedContract && activeContractTab === "completed_forms") {
      fetchContractCompletedForms(selectedContract);
    }
  }

  function handleContractDraftChange(field, value) {
    setContractDraft((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreateContract(e) {
    e.preventDefault();
    setContractsMessage("");

    const payload = {
      created_by: user?.id,
      name: contractDraft.name,
      contract_name: contractDraft.name,
      contract_number: contractDraft.contractNumber,
      client: contractDraft.client,
      address: contractDraft.address,
      location: contractDraft.address,
      postcode_w3w: contractDraft.postcodeW3W,
      description_of_works: contractDraft.descriptionOfWorks,
      division: contractDraft.division,
      status: "active",
    };

    const { data, error } = await supabase
      .from("contracts")
      .insert(payload)
      .select("id, name, contract_name, contract_number, client, address, location, postcode_w3w, description_of_works, division, status")
      .single();

    if (error) {
      setContractsMessage(`Contract save failed: ${error.message}`);
      return;
    }

    if (user?.id && data?.id) {
      await supabase.from("contract_team_roles").upsert(
        {
          contract_id: data.id,
          user_id: user.id,
          role_name: "manager",
        },
        { onConflict: "contract_id,user_id" }
      );
    }

    setContracts((prev) => [mapContractRowToUi(data), ...prev]);
    setContractDraft(buildInitialContractDraft());
    setIsAddingContract(false);
    setContractsMessage("Contract created successfully.");
  }

  function openContractModal(contract) {
    setSelectedContract(contract);
    setActiveContractTab("team");
    fetchMaintenanceUsers();
    fetchContractTeam(contract.id);
    fetchAssignedFormsForContract(contract.id, "modal");
  }

  function closeContractModal() {
    setSelectedContract(null);
    setContractFormsModalOpen(false);
  }

  function renderContractModal() {
    if (!selectedContract) return null;

    return (
      <div className="contract-modal-backdrop" onClick={closeContractModal}>
        <section className="contract-modal" onClick={(e) => e.stopPropagation()}>
          <header className="contract-modal-header">
            <div>
              <h2>{selectedContract.name}</h2>
              <p className="sub">{selectedContract.contractNumber} | {selectedContract.client}</p>
            </div>
            <button className="secondary" onClick={closeContractModal}>Close</button>
          </header>

          <div className="contract-details-grid">
            <div className="contract-detail"><strong>Name</strong><p>{selectedContract.name}</p></div>
            <div className="contract-detail"><strong>Contract Number</strong><p>{selectedContract.contractNumber}</p></div>
            <div className="contract-detail"><strong>Client</strong><p>{selectedContract.client}</p></div>
            <div className="contract-detail"><strong>Division</strong><p>{selectedContract.division}</p></div>
            <div className="contract-detail"><strong>Address</strong><p>{selectedContract.address}</p></div>
            <div className="contract-detail"><strong>Postcode / W3W</strong><p>{selectedContract.postcodeW3W}</p></div>
            <div className="contract-detail full-width"><strong>Description of Works</strong><p>{selectedContract.descriptionOfWorks}</p></div>
          </div>

          <div className="contract-modal-tabs">
            <button
              className={`contract-tab-btn ${activeContractTab === "team" ? "active" : ""}`}
              onClick={() => setActiveContractTab("team")}
            >
              Team
            </button>
            <button
              className={`contract-tab-btn ${activeContractTab === "forms" ? "active" : ""}`}
              onClick={() => setActiveContractTab("forms")}
            >
              Forms
            </button>
            <button
              className={`contract-tab-btn ${activeContractTab === "completed_forms" ? "active" : ""}`}
              onClick={() => setActiveContractTab("completed_forms")}
            >
              Completed Forms
            </button>
          </div>

          <section className="contract-tab-panel">
            {activeContractTab === "team" && (
              <div>
                <h3>Team</h3>
                <p className="sub">Select users who can access this contract and its data.</p>

                <div className="region-checkbox-list">
                  {usersLoading && (
                    <p className="sub">Loading contacts...</p>
                  )}
                  {teamCandidateContacts.length === 0 && (
                    <p className="sub">No contacts available yet. Import users first.</p>
                  )}
                  {teamCandidateContacts.map((contact) => {
                    const isLinked = !!contact.portal_user_id;
                    return (
                    <label key={contact.person_key} className="region-checkbox-item">
                      <input
                        type="checkbox"
                        disabled={!isLinked}
                        checked={isLinked && teamSelection.includes(contact.portal_user_id)}
                        onChange={(e) => {
                          if (!isLinked) return;
                          const checked = e.target.checked;
                          const targetId = contact.portal_user_id;
                          if (!targetId) return;
                          setTeamSelection((prev) =>
                            checked ? Array.from(new Set([...prev, targetId])) : prev.filter((id) => id !== targetId)
                          );
                        }}
                      />
                      <span>{contact.full_name || contact.email || contact.person_key}</span>
                      {!isLinked && (
                        <>
                          <span className="sub">(Not linked to contracts auth)</span>
                          <button
                            type="button"
                            className="secondary mini"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleInviteContact(contact);
                            }}
                            disabled={invitingPersonKey === contact.person_key}
                          >
                            {invitingPersonKey === contact.person_key ? "Inviting..." : "Invite to Contracts"}
                          </button>
                        </>
                      )}
                    </label>
                  );
                  })}
                </div>

                <div className="actions-row" style={{ marginTop: 10 }}>
                  <button type="button" onClick={handleSaveContractTeam} disabled={teamSaving}>
                    {teamSaving ? "Saving..." : "Save Team"}
                  </button>
                </div>
              </div>
            )}

            {activeContractTab === "completed_forms" && (
              <div>
                <h3>Completed Forms</h3>
                {contractFormsLoading && <p className="sub">Loading completed forms...</p>}
                {contractFormsError && <p className="msg">Failed to load forms: {contractFormsError}</p>}

                {!contractFormsLoading && !contractFormsError && (
                  <div className="completed-forms-table-wrap">
                    <table className="completed-forms-table">
                      <thead>
                        <tr>
                          <th>Completed</th>
                          <th>Form</th>
                          <th>Contract</th>
                          <th>Plant Type</th>
                          <th>Machine Reg</th>
                          <th>Defects</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contractCompletedForms.length === 0 && (
                          <tr>
                            <td colSpan={7}>No completed forms recorded for this contract yet.</td>
                          </tr>
                        )}
                        {contractCompletedForms.map((form) => (
                          <tr key={form.id}>
                            <td>{new Date(form.created_at).toLocaleString()}</td>
                            <td>Roller Daily Checksheet</td>
                            <td>{form.contract_name || form.location || "-"}</td>
                            <td>{form.machine_type || "-"}</td>
                            <td>{form.machine_reg || "-"}</td>
                            <td>{form.has_defects ? "Yes" : "No"}</td>
                            <td>
                              <div className="row-actions">
                                <button type="button" className="secondary mini" onClick={() => handleDownloadPdfFromRecord(form)}>
                                  Download
                                </button>
                                <button type="button" className="secondary mini" onClick={() => handleViewPdfFromRecord(form)}>
                                  View
                                </button>
                                <button type="button" className="danger-x" onClick={() => handleDeleteCompletedForm(form.id)}>
                                  X
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeContractTab === "forms" && (
              <div>
                <div className="contracts-head">
                  <h3>Forms</h3>
                  <button
                    type="button"
                    onClick={openContractFormsModal}
                    disabled={!selectedContract || !["admin", "manager"].includes(currentAppRole)}
                  >
                    Add Forms
                  </button>
                </div>
                <p className="sub">Assign forms to this contract and launch New or Copy from here.</p>

                <div className="contract-assigned-forms-grid">
                  {contractAssignedForms.length === 0 && (
                    <p className="sub">No forms assigned to this contract yet.</p>
                  )}
                  {contractAssignedForms.map((form) => (
                    <article key={form.id} className="contract-assigned-form-card">
                      <div>
                        <span>{form.contractNo}</span>
                        <strong>{form.title}</strong>
                      </div>
                      <div className="row-actions">
                        <button type="button" onClick={() => handleStartContractForm(form.id, "new")}>New</button>
                        <button type="button" className="secondary" onClick={() => handleStartContractForm(form.id, "copy")}>Copy</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>

          {contractFormsModalOpen && (
            <div className="mini-modal-backdrop" onClick={closeContractFormsModal}>
              <section className="mini-modal" onClick={(e) => e.stopPropagation()}>
                <header className="mini-modal-header">
                  <h3>Assign Forms</h3>
                  <button type="button" className="secondary mini" onClick={closeContractFormsModal} disabled={contractFormsSaving}>
                    Close
                  </button>
                </header>

                <label className="region-checkbox-item" style={{ marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={contractFormsSelection.length === TEMPLATE_FORMS.length && TEMPLATE_FORMS.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setContractFormsSelection(TEMPLATE_FORMS.map((f) => f.id));
                      } else {
                        setContractFormsSelection([]);
                      }
                    }}
                  />
                  Select All
                </label>

                <div className="region-checkbox-list">
                  {TEMPLATE_FORMS.map((form) => (
                    <label key={form.id} className="region-checkbox-item">
                      <input
                        type="checkbox"
                        checked={contractFormsSelection.includes(form.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setContractFormsSelection((prev) =>
                            checked ? Array.from(new Set([...prev, form.id])) : prev.filter((id) => id !== form.id)
                          );
                        }}
                      />
                      <span>{form.title}</span>
                    </label>
                  ))}
                </div>

                <div className="actions-row" style={{ marginTop: 12 }}>
                  <button type="button" onClick={handleSaveContractForms} disabled={contractFormsSaving}>
                    {contractFormsSaving ? "Saving..." : `Add Forms to ${selectedContract.name}`}
                  </button>
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderContractsTab() {
    return (
      <section className="card tab-card">
        <div className="contracts-head">
          <h2>Contracts</h2>
          <button type="button" onClick={() => setIsAddingContract((prev) => !prev)}>
            {isAddingContract ? "Cancel" : "Add Contract"}
          </button>
        </div>
        <p className="sub">Overview of current contract records.</p>

        {isAddingContract && (
          <form className="contract-form" onSubmit={handleCreateContract}>
            <div className="contract-form-grid">
              <div>
                <label>Name</label>
                <input value={contractDraft.name} onChange={(e) => handleContractDraftChange("name", e.target.value)} required />
              </div>
              <div>
                <label>Contract Number</label>
                <input value={contractDraft.contractNumber} onChange={(e) => handleContractDraftChange("contractNumber", e.target.value)} required />
              </div>
              <div>
                <label>Client</label>
                <input value={contractDraft.client} onChange={(e) => handleContractDraftChange("client", e.target.value)} required />
              </div>
              <div>
                <label>Division</label>
                <input value={contractDraft.division} onChange={(e) => handleContractDraftChange("division", e.target.value)} required />
              </div>
              <div>
                <label>Address</label>
                <input value={contractDraft.address} onChange={(e) => handleContractDraftChange("address", e.target.value)} required />
              </div>
              <div>
                <label>Postcode / W3W</label>
                <input value={contractDraft.postcodeW3W} onChange={(e) => handleContractDraftChange("postcodeW3W", e.target.value)} required />
              </div>
              <div className="full-width">
                <label>Description of Works</label>
                <textarea
                  value={contractDraft.descriptionOfWorks}
                  onChange={(e) => handleContractDraftChange("descriptionOfWorks", e.target.value)}
                  rows={3}
                  required
                />
              </div>
            </div>
            <div className="actions-row">
              <button type="submit">Create Contract</button>
            </div>
          </form>
        )}

        {contractsMessage && <p className="msg">{contractsMessage}</p>}

        {contractsLoading && <p className="sub">Loading contracts...</p>}

        <div className="list">
          {visibleContracts.length === 0 && <p className="sub">No accessible contracts yet.</p>}
          {visibleContracts.map((contract) => (
            <button
              key={contract.id}
              className="contract-item contract-card"
              type="button"
              onClick={() => openContractModal(contract)}
            >
              <div>
                <strong>{contract.name}</strong>
                <span>Contract No: {contract.contractNumber}</span>
                <span>Client: {contract.client}</span>
              </div>
              <span className={`badge ${contract.status.toLowerCase()}`}>{contract.status}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function renderFormsTab() {
    const showAssigned = formsView === "assigned";
    const showCompleted = formsView === "completed";
    const showMyForms = formsView === "my_forms";

    return (
      <div>
        <div className="forms-subtabs">
          <button
            className={`forms-subtab-btn ${formsView === "assigned" ? "active" : ""}`}
            onClick={() => setFormsView("assigned")}
          >
            Assigned Forms
          </button>
          <button
            className={`forms-subtab-btn ${formsView === "completed" ? "active" : ""}`}
            onClick={() => setFormsView("completed")}
          >
            Completed Forms
          </button>
          <button
            className={`forms-subtab-btn ${formsView === "my_forms" ? "active" : ""}`}
            onClick={() => setFormsView("my_forms")}
          >
            My Forms
          </button>
        </div>

        {showAssigned && (
          <div className="grid">
            <section className="card tab-card">
              <h2>Assigned Forms</h2>
              <p className="sub">Select a contract below to view forms assigned to that contract.</p>

              <div className="portal-form-launch">
                <button type="button" className="secondary" onClick={openNearMissModal}>
                  Complete Near Miss (Portal)
                </button>
                <button type="button" className="secondary" onClick={openSelfCertModal}>
                  Complete Self Cert (Portal)
                </button>
              </div>

              <label>Location</label>
              <select
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
                required
                disabled={visibleContracts.length === 0}
              >
                <option value="">Select Contract</option>
                {visibleContracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.name} ({contract.contractNumber})
                  </option>
                ))}
              </select>
              {visibleContracts.length === 0 && (
                <p className="sub">You do not have access to any contracts yet.</p>
              )}

              <div className="list">
                {selectedContractId && locationAssignedForms.length === 0 && (
                  <p className="sub">No forms assigned to this contract yet. Assign forms from Contracts &gt; open contract &gt; Forms.</p>
                )}
                {!selectedContractId && (
                  <p className="sub">Select a contract to see assigned forms.</p>
                )}
                {locationAssignedForms.map((form) => (
                  <button
                    key={form.id}
                    className={`form-item ${selectedFormId === form.id ? "active" : ""}`}
                    onClick={() => setSelectedFormId(form.id)}
                  >
                    <span>{form.contractNo}</span>
                    <strong>{form.title}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="card tab-card">
              <h2>Roller Daily Checksheet</h2>
              <form onSubmit={submitForm}>
                <label>Version</label>
                <input value={sheetVersion} onChange={(e) => setSheetVersion(e.target.value)} required />

                <label>Completed By</label>
                <input value={completedByName} onChange={(e) => setCompletedByName(e.target.value)} required />

                <label>Job Title</label>
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required />

                <label>Date</label>
                <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} required />

                <label>Machine Reg</label>
                <input value={machineReg} onChange={(e) => handleMachineRegInput(e.target.value)} required />

                <label>Asset ID</label>
                <input value={assetNo} onChange={(e) => handleAssetNoInput(e.target.value)} required />

                <label>Serial No</label>
                <input value={serialNo} onChange={(e) => handleSerialNoInput(e.target.value)} />

                <div style={{ marginTop: 6, marginBottom: 8, fontSize: 12, color: "#64748b" }}>
                  Lookup source: {assetLookupStatus.source} | entries: {assetLookupStatus.count}
                  {assetLookupStatus.error ? ` | source warning: ${assetLookupStatus.error}` : ""}
                </div>
                {assetLookupTrace && (
                  <div style={{ marginBottom: 8, fontSize: 12, color: "#334155" }}>{assetLookupTrace}</div>
                )}

                <label>Machine Hours</label>
                <input type="number" step="0.1" value={machineHours} onChange={(e) => setMachineHours(e.target.value)} />

                <label>Machine Type</label>
                <input value={machineType} onChange={(e) => setMachineType(e.target.value)} required />

                <div className="checklist-header-row">
                  <label>Checklist Status</label>
                  <label className="check-all-inline">
                    <input type="checkbox" checked={allMarkedChecked} onChange={handleCheckAllToggle} />
                    Mark all as checked
                  </label>
                </div>
                <div className="legend">X Defect | Y Checked | N/A Not Applicable | R Replaced</div>
                <div className="checksheet-grid">
                  {CHECK_ROWS.map((row, idx) => (
                    <div key={`row_${idx}`} className="checksheet-row">
                      <div className="checksheet-cell label-cell">
                        {row.left?.section ? (
                          <span className="section-title">{row.left.section}</span>
                        ) : (
                          <span>{row.left?.label || ""}</span>
                        )}
                      </div>
                      <div className="checksheet-cell status-cell">
                        {row.left?.label && (
                          <div className="status-options compact">
                            {STATUS_OPTIONS.map((status) => (
                              <label key={`l_${idx}_${status}`} className="status-option">
                                <input
                                  type="radio"
                                  name={`status_left_${idx}`}
                                  checked={checklist[row.left.label] === status}
                                  onChange={() => handleStatusChange(row.left.label, status)}
                                />
                                {status}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="checksheet-cell label-cell">
                        {row.right?.section ? (
                          <span className="section-title">{row.right.section}</span>
                        ) : (
                          <span>{row.right?.label || ""}</span>
                        )}
                      </div>
                      <div className="checksheet-cell status-cell">
                        {row.right?.label && (
                          <div className="status-options compact">
                            {STATUS_OPTIONS.map((status) => (
                              <label key={`r_${idx}_${status}`} className="status-option">
                                <input
                                  type="radio"
                                  name={`status_right_${idx}`}
                                  checked={checklist[row.right.label] === status}
                                  onChange={() => handleStatusChange(row.right.label, status)}
                                />
                                {status}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <label>Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />

                <div className="defect-flag">Defect Found: {defectFound ? "Yes" : "No"}</div>

                <div className="actions-row">
                  <button type="submit" disabled={!selectedFormId || saving}>
                    {saving ? "Saving..." : "Submit Form"}
                  </button>
                  <button type="button" className="secondary" onClick={handlePreviewPdf}>
                    Preview PDF (A4)
                  </button>
                  <button type="button" className="secondary" onClick={handleDownloadPdf}>
                    Download PDF (A4)
                  </button>
                </div>
              </form>
              {message && <p className="msg">{message}</p>}
            </section>
          </div>
        )}

        {showCompleted && (
          <section className="card tab-card">
            <h2>Completed Forms</h2>
            <p className="sub">View all saved forms and filter by plant type, contract, and defect status.</p>

            {selectedCompletedForm && (
              <section className="readonly-form-panel">
                <div className="readonly-form-head">
                  <h3>Roller Daily Checksheet</h3>
                  <span className="lock-pill">LOCKED</span>
                </div>
                <p className="sub">Completed {new Date(selectedCompletedForm.created_at).toLocaleString()} by {selectedCompletedForm.completed_by_name || "-"}</p>

                <div className="readonly-meta-grid">
                  <div><strong>Contract</strong><p>{selectedCompletedForm.contract_name || selectedCompletedForm.location || "-"}</p></div>
                  <div><strong>Machine Type</strong><p>{selectedCompletedForm.machine_type || "-"}</p></div>
                  <div><strong>Machine Reg</strong><p>{selectedCompletedForm.machine_reg || "-"}</p></div>
                  <div><strong>Asset ID</strong><p>{selectedCompletedForm.asset_no || "-"}</p></div>
                </div>

                <div className="checksheet-grid readonly-grid">
                  {CHECK_ROWS.map((row, idx) => (
                    <div key={`ro_row_${idx}`} className="checksheet-row">
                      <div className="checksheet-cell label-cell">
                        {row.left?.section ? (
                          <span className="section-title">{row.left.section}</span>
                        ) : (
                          <span>{row.left?.label || ""}</span>
                        )}
                      </div>
                      <div className="checksheet-cell status-cell readonly-status">
                        {row.left?.label ? selectedCompletedForm?.checklist?.[row.left.label] || "-" : ""}
                      </div>
                      <div className="checksheet-cell label-cell">
                        {row.right?.section ? (
                          <span className="section-title">{row.right.section}</span>
                        ) : (
                          <span>{row.right?.label || ""}</span>
                        )}
                      </div>
                      <div className="checksheet-cell status-cell readonly-status">
                        {row.right?.label ? selectedCompletedForm?.checklist?.[row.right.label] || "-" : ""}
                      </div>
                    </div>
                  ))}
                </div>

                <label>Notes</label>
                <textarea value={selectedCompletedForm.notes || ""} readOnly rows={4} />
              </section>
            )}

            <div className="completed-filters">
              <label>
                Plant Type
                <select value={filterPlantType} onChange={(e) => setFilterPlantType(e.target.value)}>
                  <option value="all">All</option>
                  {plantTypeOptions.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>

              <label>
                Contract
                <select value={filterContract} onChange={(e) => setFilterContract(e.target.value)}>
                  <option value="all">All</option>
                  {contractOptions.map((contract) => (
                    <option key={contract} value={contract}>{contract}</option>
                  ))}
                </select>
              </label>

              <label>
                Defects
                <select value={filterDefect} onChange={(e) => setFilterDefect(e.target.value)}>
                  <option value="all">All</option>
                  <option value="yes">Defects Only</option>
                  <option value="no">No Defects</option>
                </select>
              </label>
            </div>

            {loadingCompletedForms && <p className="sub">Loading completed forms...</p>}
            {completedFormsError && <p className="msg">Failed to load forms: {completedFormsError}</p>}

            {!loadingCompletedForms && !completedFormsError && (
              <div className="completed-forms-table-wrap">
                <table className="completed-forms-table">
                  <thead>
                    <tr>
                      <th>Completed</th>
                      <th>Form</th>
                      <th>Contract</th>
                      <th>Plant Type</th>
                      <th>Machine Reg</th>
                      <th>Defects</th>
                      <th>Completed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompletedForms.length === 0 && (
                      <tr>
                        <td colSpan={7}>No forms found for the selected filters.</td>
                      </tr>
                    )}
                    {filteredCompletedForms.map((form) => (
                      <tr
                        key={form.id}
                        className={`clickable-row ${selectedCompletedForm?.id === form.id ? "active" : ""}`}
                        onClick={() => setSelectedCompletedForm(form)}
                      >
                        <td>{new Date(form.created_at).toLocaleString()}</td>
                        <td>Roller Daily Checksheet</td>
                        <td>{form.contract_name || form.location || "-"}</td>
                        <td>{form.machine_type || "-"}</td>
                        <td>{form.machine_reg || "-"}</td>
                        <td>{form.has_defects ? "Yes" : "No"}</td>
                        <td>{form.completed_by_name || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {showMyForms && (
          <section className="card tab-card">
            <h2>My Forms</h2>

            {loadingMySelfCertForms && <p className="sub">Loading self cert forms...</p>}
            {mySelfCertFormsError && <p className="msg">Failed to load self cert forms: {mySelfCertFormsError}</p>}

            {!loadingMySelfCertForms && !mySelfCertFormsError && (
              <div>
                {mySelfCertForms.length === 0 && <p className="sub">No self cert forms found.</p>}

                {mySelfCertForms.map((form) => {
                  const isExpanded = expandedMySelfCertFormId === form.id;
                  return (
                    <section key={form.id} className="readonly-form-panel" style={{ marginBottom: 12 }}>
                      <button
                        type="button"
                        className="readonly-form-head"
                        style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
                        onClick={() =>
                          setExpandedMySelfCertFormId((prev) => (prev === form.id ? null : form.id))
                        }
                      >
                        <div className="readonly-form-head-left">
                          <span className="form-type-pill">Self Certification Form</span>
                          <h3>Self Certification Form</h3>
                        </div>
                        <span className="lock-pill">{isExpanded ? "LOCKED | Collapse" : "LOCKED | Expand"}</span>
                      </button>

                      <p className="sub">
                        Submitted {form.created_at ? new Date(form.created_at).toLocaleString() : "-"}
                        {" "}
                        | Status: {form.status || "-"}
                        {" "}
                        | Employee: {form.employee_name || "-"}
                      </p>

                      {isExpanded && (
                        <>
                          <div className="readonly-meta-grid">
                            <div><strong>Employee Name</strong><p>{form.employee_name || "-"}</p></div>
                            <div><strong>Department</strong><p>{form.department || "-"}</p></div>
                            <div><strong>Employee Number</strong><p>{form.employee_number || "-"}</p></div>
                            <div><strong>First Day of Absence</strong><p>{form.first_day_absence || "-"}</p></div>
                            <div><strong>Working Days Lost</strong><p>{form.working_days_lost ?? "-"}</p></div>
                            <div><strong>Notification Made To</strong><p>{form.notification_made_to || "-"}</p></div>
                          </div>

                          <label>Reason and Symptoms</label>
                          <textarea value={form.reason_and_symptoms || ""} readOnly rows={4} />

                          <div className="readonly-meta-grid">
                            <div><strong>Happened At Work</strong><p>{formatYesNo(form.injury_occurred)}</p></div>
                            <div><strong>Sought Medical Advice</strong><p>{formatYesNo(form.sought_medical_advice)}</p></div>
                            <div><strong>Consulted Doctor Again</strong><p>{formatYesNo(form.consulted_doctor_again)}</p></div>
                            <div><strong>Visited Hospital/Clinic</strong><p>{formatYesNo(form.visited_hospital_or_clinic)}</p></div>
                          </div>

                          <label>Injury Details</label>
                          <textarea value={form.injury_details || ""} readOnly rows={3} />

                          <div className="readonly-meta-grid">
                            <div><strong>Employee Signature</strong><p>{displaySignatureValue(form.employee_signature)}</p></div>
                            <div><strong>Employee Signed At</strong><p>{form.employee_signed_at ? new Date(form.employee_signed_at).toLocaleString() : "-"}</p></div>
                            <div><strong>Manager Signature</strong><p>{displaySignatureValue(form.manager_signature)}</p></div>
                            <div><strong>Manager Signed At</strong><p>{form.manager_signed_at ? new Date(form.manager_signed_at).toLocaleString() : "-"}</p></div>
                          </div>

                          <div className="actions-row">
                            <button type="button" className="secondary" onClick={() => generateSelfCertA4Pdf(form, { preview: true })}>
                              Preview PDF (A4)
                            </button>
                            <button type="button" className="secondary" onClick={() => generateSelfCertA4Pdf(form)}>
                              Download PDF (A4)
                            </button>
                          </div>
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  function renderAdminTab() {
    return (
      <section className="card tab-card">
        <h2>Admin</h2>
        <p className="sub">Administration shortcuts and setup actions.</p>

        <div className="forms-subtabs">
          <button
            className={`forms-subtab-btn ${adminTab === "user_access" ? "active" : ""}`}
            onClick={() => setAdminTab("user_access")}
          >
            User Access
          </button>
          <button
            className={`forms-subtab-btn ${adminTab === "other" ? "active" : ""}`}
            onClick={() => setAdminTab("other")}
          >
            Other
          </button>
        </div>

        {adminTab === "user_access" && (
          <div className="user-access-grid">
            <section className="admin-panel">
              <div className="contracts-head">
                <h3>Maintenance Users</h3>
                <div className="actions-row">
                  <button type="button" className="secondary" onClick={handleImportMaintenanceUsers}>
                    Import Maintenance Users
                  </button>
                  <button type="button" className="secondary" onClick={handleImportSitebatchUsers}>
                    Import Sitebatch Users
                  </button>
                </div>
              </div>

              <p className="sub">
                Imports users from external projects into portal access tables.
              </p>

              {usersMessage && <p className="msg">{usersMessage}</p>}
              {usersLoading && <p className="sub">Loading users...</p>}

              <div className="user-access-list">
                {maintenanceUsers.map((u) => (
                  <div
                    key={u.person_key}
                    className={`user-row ${selectedUserId === u.person_key ? "active" : ""}`}
                    onClick={() => setSelectedUserId((prev) => (prev === u.person_key ? "" : u.person_key))}
                  >
                    <div className="user-row-summary">
                      <strong>{u.full_name || u.email || "Unnamed User"}</strong>
                      <span>{u.email || "-"}</span>
                      <span>{u.phone || "-"}</span>
                      <span>{u.job_role || "-"}</span>
                      <span>{u.divisions.length ? u.divisions.join(", ") : "-"}</span>
                    </div>

                    {selectedUserId === u.person_key && (
                      <div className="user-row-expanded" onClick={(e) => e.stopPropagation()}>
                        <div className="user-row-meta">
                          <span>Email: {u.email || "-"}</span>
                          <span>Directory Key: {u.person_key}</span>
                          <span>Linked Auth ID: {u.portal_user_id || "Not linked"}</span>
                          <span>Source Role: {u.maintenance_role || "-"}</span>
                          <span>Source: {u.source_project || "portal"}</span>
                          <span>Assigned Contracts: {u.assignedContracts.length ? u.assignedContracts.join(" | ") : "None"}</span>
                        </div>

                        <div className="user-row-fields">
                          <label>
                            Authority
                            <select
                              value={u.authority}
                              onChange={(e) => handleUserFieldChange(u.person_key, "authority", e.target.value)}
                            >
                              {AUTHORITY_OPTIONS.map((role) => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Display Name
                            <input
                              value={u.full_name}
                              onChange={(e) => handleUserFieldChange(u.person_key, "full_name", e.target.value)}
                            />
                          </label>

                          <label>
                            Email Address
                            <input
                              value={u.email}
                              onChange={(e) => handleUserFieldChange(u.person_key, "email", e.target.value)}
                            />
                          </label>

                          <label>
                            Phone Number
                            <input
                              value={u.phone}
                              onChange={(e) => handleUserFieldChange(u.person_key, "phone", e.target.value)}
                            />
                          </label>

                          <label>
                            Job Role
                            <input
                              value={u.job_role}
                              onChange={(e) => handleUserFieldChange(u.person_key, "job_role", e.target.value)}
                            />
                          </label>

                          <label>
                            Employee Number
                            <input
                              value={u.employee_number || ""}
                              onChange={(e) => handleUserFieldChange(u.person_key, "employee_number", e.target.value)}
                            />
                          </label>

                          <label>
                            Line Manager
                            <select
                              value={u.line_manager_user_id || ""}
                              onChange={(e) => handleUserFieldChange(u.person_key, "line_manager_user_id", e.target.value)}
                            >
                              <option value="">None</option>
                              {lineManagerOptions.map((manager) => (
                                <option key={manager.userId} value={manager.userId}>
                                  {manager.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Has Direct Reports
                            <select
                              value={u.has_direct_reports ? "yes" : "no"}
                              onChange={(e) => handleUserFieldChange(u.person_key, "has_direct_reports", e.target.value === "yes")}
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          </label>

                          <label>
                            Regions (comma separated)
                            <input
                              value={u.regionsText}
                              onChange={(e) => handleUserFieldChange(u.person_key, "regionsText", e.target.value)}
                            />
                          </label>

                          <button type="button" className="secondary" onClick={() => handleSaveUser(u)}>
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <h3>Add User</h3>
              <form className="contract-form" onSubmit={handleAddUser}>
                <label>User ID (auth.users.id) - optional for existing users</label>
                <input
                  value={newUserDraft.userId}
                  onChange={(e) => setNewUserDraft((prev) => ({ ...prev, userId: e.target.value }))}
                />

                <label>Display Name</label>
                <input
                  value={newUserDraft.displayName}
                  onChange={(e) => setNewUserDraft((prev) => ({ ...prev, displayName: e.target.value }))}
                />

                <label>Email Address</label>
                <input
                  value={newUserDraft.email}
                  onChange={(e) => setNewUserDraft((prev) => ({ ...prev, email: e.target.value }))}
                  type="email"
                />

                <label>Phone Number</label>
                <input
                  value={newUserDraft.phone}
                  onChange={(e) => setNewUserDraft((prev) => ({ ...prev, phone: e.target.value }))}
                />

                <label>Job Role</label>
                <input
                  value={newUserDraft.jobRole}
                  onChange={(e) => setNewUserDraft((prev) => ({ ...prev, jobRole: e.target.value }))}
                />

                <label>Employee Number</label>
                <input
                  value={newUserDraft.employeeNumber}
                  onChange={(e) => setNewUserDraft((prev) => ({ ...prev, employeeNumber: e.target.value }))}
                />

                <label>Line Manager</label>
                <select
                  value={newUserDraft.lineManagerUserId}
                  onChange={(e) => setNewUserDraft((prev) => ({ ...prev, lineManagerUserId: e.target.value }))}
                >
                  <option value="">None</option>
                  {lineManagerOptions.map((manager) => (
                    <option key={manager.userId} value={manager.userId}>
                      {manager.label}
                    </option>
                  ))}
                </select>

                <label>Has Direct Reports</label>
                <select
                  value={newUserDraft.hasDirectReports ? "yes" : "no"}
                  onChange={(e) => setNewUserDraft((prev) => ({ ...prev, hasDirectReports: e.target.value === "yes" }))}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>

                <label>Regions</label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsAddRegionsExpanded((prev) => !prev)}
                >
                  {isAddRegionsExpanded ? "Hide Regions" : "Select Regions"}
                </button>

                {isAddRegionsExpanded && (
                  <>
                    <div className="region-checkbox-list">
                      {regionOptions.length === 0 && <span className="sub">No existing regions yet.</span>}
                      {regionOptions.map((region) => (
                        <label key={region} className="region-checkbox-item">
                          <input
                            type="checkbox"
                            checked={newUserDraft.regionsSelected.includes(region)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setNewUserDraft((prev) => {
                                const current = prev.regionsSelected || [];
                                const next = checked
                                  ? Array.from(new Set([...current, region]))
                                  : current.filter((r) => r !== region);
                                return { ...prev, regionsSelected: next };
                              });
                            }}
                          />
                          {region}
                        </label>
                      ))}
                    </div>

                    <label className="region-checkbox-item">
                      <input
                        type="checkbox"
                        checked={!!newUserDraft.otherRegionEnabled}
                        onChange={(e) =>
                          setNewUserDraft((prev) => ({
                            ...prev,
                            otherRegionEnabled: e.target.checked,
                            otherRegionText: e.target.checked ? prev.otherRegionText : "",
                          }))
                        }
                      />
                      Other
                    </label>

                    {newUserDraft.otherRegionEnabled && (
                      <input
                        placeholder="Add new region"
                        value={newUserDraft.otherRegionText}
                        onChange={(e) => setNewUserDraft((prev) => ({ ...prev, otherRegionText: e.target.value }))}
                      />
                    )}
                  </>
                )}

                <label>Authority</label>
                <select
                  value={newUserDraft.authority}
                  onChange={(e) => setNewUserDraft((prev) => ({ ...prev, authority: e.target.value }))}
                >
                  {AUTHORITY_OPTIONS.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>

                <div className="actions-row">
                  <button type="submit">Add User</button>
                </div>
              </form>

              {usersDebug ? (
                <pre className="user-access-debug">
                  {`function: ${usersDebug.functionName}\nstatus: ${usersDebug.ok ? "ok" : "failed"}\nkind: ${usersDebug.kind}\ntime: ${usersDebug.at}\ndetail: ${usersDebug.detail}`}
                </pre>
              ) : null}
            </section>
          </div>
        )}

        {adminTab === "other" && (
          <div className="list">
            {ADMIN_ITEMS.filter((item) => item.id !== "a1").map((item) => (
              <div key={item.id} className="admin-item">
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderNearMissModal() {
    if (!nearMissModalOpen) return null;

    return (
      <div className="mini-modal-backdrop" onClick={() => !nearMissSubmitting && setNearMissModalOpen(false)}>
        <section className="mini-modal portal-form-modal" onClick={(e) => e.stopPropagation()}>
          <header className="mini-modal-header">
            <h3>Near Miss</h3>
            <button
              type="button"
              className="secondary mini"
              onClick={() => setNearMissModalOpen(false)}
              disabled={nearMissSubmitting}
            >
              Close
            </button>
          </header>

          <form onSubmit={submitNearMissFromPortal}>
            <label>Time / Date</label>
            <input
              type="datetime-local"
              value={nearMissReportedAt}
              onChange={(e) => setNearMissReportedAt(e.target.value)}
              required
            />

            <label>Name of person reporting</label>
            <input
              value={nearMissReporterName}
              onChange={(e) => setNearMissReporterName(e.target.value)}
              placeholder="Enter name"
              required
            />

            <label>Site</label>
            <input
              value={nearMissSite}
              onChange={(e) => setNearMissSite(e.target.value)}
              placeholder="Enter site"
              list="near-miss-site-options"
              required
            />
            <datalist id="near-miss-site-options">
              {visibleContracts.map((contract) => (
                <option key={contract.id} value={contract.name} />
              ))}
            </datalist>

            <label>Near Miss Details (Don't Use People's Names)</label>
            <textarea
              rows={4}
              value={nearMissDetails}
              onChange={(e) => setNearMissDetails(e.target.value)}
              placeholder="Describe what the near miss was"
              required
            />

            <label>What has been done about it</label>
            <textarea
              rows={4}
              value={nearMissActionsTaken}
              onChange={(e) => setNearMissActionsTaken(e.target.value)}
              placeholder="Describe actions taken"
              required
            />

            <div className="actions-row" style={{ marginTop: 12 }}>
              <button type="button" className="secondary" onClick={() => setNearMissModalOpen(false)} disabled={nearMissSubmitting}>
                Cancel
              </button>
              <button type="submit" disabled={nearMissSubmitting}>
                {nearMissSubmitting ? "Submitting..." : "Submit Near Miss"}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  function renderSelfCertModal() {
    if (!selfCertModalOpen) return null;

    return (
      <div className="mini-modal-backdrop" onClick={() => !selfCertSubmitting && setSelfCertModalOpen(false)}>
        <section className="mini-modal portal-form-modal" onClick={(e) => e.stopPropagation()}>
          <header className="mini-modal-header">
            <h3>Self Cert</h3>
            <button
              type="button"
              className="secondary mini"
              onClick={() => setSelfCertModalOpen(false)}
              disabled={selfCertSubmitting}
            >
              Close
            </button>
          </header>

          <form onSubmit={submitSelfCertFromPortal}>
            <label>Name</label>
            <input value={selfCertName} onChange={(e) => setSelfCertName(e.target.value)} required />

            <label>Department</label>
            <input value={selfCertDepartment} onChange={(e) => setSelfCertDepartment(e.target.value)} />

            <label>Employee Number</label>
            <input value={selfCertEmployeeNumber} onChange={(e) => setSelfCertEmployeeNumber(e.target.value)} />

            <label>First day of absence</label>
            <input type="date" value={selfCertFirstDayAbsence} onChange={(e) => setSelfCertFirstDayAbsence(e.target.value)} required />

            <label>Working days lost</label>
            <input
              type="number"
              min="0"
              value={selfCertWorkingDaysLost}
              onChange={(e) => setSelfCertWorkingDaysLost(e.target.value)}
              required
            />

            <label>Notification of absence made to</label>
            <input value={selfCertNotificationTo} onChange={(e) => setSelfCertNotificationTo(e.target.value)} />

            <label>Reason for absence and symptoms</label>
            <textarea
              rows={4}
              value={selfCertReasonSymptoms}
              onChange={(e) => setSelfCertReasonSymptoms(e.target.value)}
              required
            />

            <label>Was there an injury?</label>
            <div className="portal-yes-no-row">
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertHadInjury === true ? "active" : ""}`}
                onClick={() => setSelfCertHadInjury(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertHadInjury === false ? "active" : ""}`}
                onClick={() => {
                  setSelfCertHadInjury(false);
                  setSelfCertInjuryOccurred(false);
                  setSelfCertInjuryDetails("");
                }}
              >
                No
              </button>
            </div>

            {selfCertHadInjury === true && (
              <>
                <label>If an injury, specify how it occurred</label>
                <textarea
                  rows={3}
                  value={selfCertInjuryDetails}
                  onChange={(e) => setSelfCertInjuryDetails(e.target.value)}
                />
              </>
            )}

            <label>Did it happen at work?</label>
            <div className="portal-yes-no-row">
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertInjuryOccurred === true ? "active" : ""}`}
                onClick={() => setSelfCertInjuryOccurred(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertInjuryOccurred === false ? "active" : ""}`}
                onClick={() => setSelfCertInjuryOccurred(false)}
              >
                No
              </button>
            </div>

            <label>Did you seek medical advice?</label>
            <div className="portal-yes-no-row">
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertSoughtMedicalAdvice === true ? "active" : ""}`}
                onClick={() => setSelfCertSoughtMedicalAdvice(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertSoughtMedicalAdvice === false ? "active" : ""}`}
                onClick={() => setSelfCertSoughtMedicalAdvice(false)}
              >
                No
              </button>
            </div>

            <label>Did you consult your doctor again?</label>
            <div className="portal-yes-no-row">
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertConsultedDoctorAgain === true ? "active" : ""}`}
                onClick={() => setSelfCertConsultedDoctorAgain(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertConsultedDoctorAgain === false ? "active" : ""}`}
                onClick={() => setSelfCertConsultedDoctorAgain(false)}
              >
                No
              </button>
            </div>

            <label>Did you visit a hospital or clinic?</label>
            <div className="portal-yes-no-row">
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertVisitedHospital === true ? "active" : ""}`}
                onClick={() => setSelfCertVisitedHospital(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`portal-yes-no-btn ${selfCertVisitedHospital === false ? "active" : ""}`}
                onClick={() => setSelfCertVisitedHospital(false)}
              >
                No
              </button>
            </div>

            <label>Employee Signature</label>
            <button type="button" className="secondary" onClick={() => setSelfCertSignatureModalOpen(true)}>
              {selfCertEmployeeSignature ? "Signature captured (click to re-sign)" : "Tap/click to sign with mouse"}
            </button>

            <div className="actions-row" style={{ marginTop: 12 }}>
              <button type="button" className="secondary" onClick={() => setSelfCertModalOpen(false)} disabled={selfCertSubmitting}>
                Cancel
              </button>
              <button type="submit" disabled={selfCertSubmitting}>
                {selfCertSubmitting ? "Submitting..." : "Submit Self Cert"}
              </button>
            </div>
          </form>

          {selfCertSignatureModalOpen && (
            <div className="mini-modal-backdrop" onClick={() => setSelfCertSignatureModalOpen(false)}>
              <section className="mini-modal signature-capture-modal" onClick={(e) => e.stopPropagation()}>
                <header className="mini-modal-header">
                  <h3>Sign Below</h3>
                  <button type="button" className="secondary mini" onClick={() => setSelfCertSignatureModalOpen(false)}>
                    Close
                  </button>
                </header>

                <canvas
                  ref={signatureCanvasRef}
                  className="signature-canvas"
                  onMouseDown={startSignatureStroke}
                  onMouseMove={moveSignatureStroke}
                  onMouseUp={endSignatureStroke}
                  onMouseLeave={endSignatureStroke}
                  onTouchStart={startSignatureStroke}
                  onTouchMove={moveSignatureStroke}
                  onTouchEnd={endSignatureStroke}
                />

                <div className="actions-row" style={{ marginTop: 10 }}>
                  <button type="button" className="secondary" onClick={clearSignaturePad}>Clear</button>
                  <button type="button" onClick={saveSignaturePad}>Save Signature</button>
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderSelfCertApprovalsModal() {
    if (!selfCertApprovalsModalOpen) return null;

    return (
      <div className="mini-modal-backdrop" onClick={() => setSelfCertApprovalsModalOpen(false)}>
        <section className="mini-modal portal-form-modal" onClick={(e) => e.stopPropagation()}>
          <header className="mini-modal-header">
            <h3>Self Cert Approvals</h3>
            <button type="button" className="secondary mini" onClick={() => setSelfCertApprovalsModalOpen(false)}>
              Close
            </button>
          </header>

          {loadingPendingSelfCertApprovals && <p className="sub">Loading pending approvals...</p>}

          {!loadingPendingSelfCertApprovals && pendingSelfCertApprovals.length === 0 && (
            <p className="sub">No forms requiring review right now.</p>
          )}

          <div className="list" style={{ marginBottom: 12 }}>
            {pendingSelfCertApprovals.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`contract-item contract-card ${selectedPendingSelfCert?.id === item.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedPendingSelfCert(item);
                  setManagerApprovalSignature("");
                  setManagerSignatureModalOpen(false);
                  setManagerSignatureHasStroke(false);
                }}
              >
                <div>
                  <strong>{item.employee_name || "Employee"}</strong>
                  <span>{item.department || "-"}</span>
                  <span>First day: {item.first_day_absence || "-"}</span>
                  <span>Days lost: {item.working_days_lost ?? "-"}</span>
                </div>
                <span className="lock-pill">Pending</span>
              </button>
            ))}
          </div>

          {selectedPendingSelfCert && (
            <section className="readonly-form-panel">
              <div className="readonly-form-head">
                <h3>Approve Self Cert</h3>
                <span className="lock-pill">REVIEW</span>
              </div>

              <h4 style={{ marginBottom: 6 }}>Employee Details</h4>
              <div className="readonly-meta-grid">
                <div><strong>Employee Name</strong><p>{selectedPendingSelfCert.employee_name || "-"}</p></div>
                <div><strong>Department</strong><p>{selectedPendingSelfCert.department || "-"}</p></div>
                <div><strong>Employee Number</strong><p>{selectedPendingSelfCert.employee_number || "-"}</p></div>
                <div><strong>Submitted</strong><p>{selectedPendingSelfCert.created_at ? new Date(selectedPendingSelfCert.created_at).toLocaleString() : "-"}</p></div>
              </div>

              <h4 style={{ marginBottom: 6, marginTop: 12 }}>Absence Details</h4>
              <div className="readonly-meta-grid">
                <div><strong>First Day of Absence</strong><p>{selectedPendingSelfCert.first_day_absence || "-"}</p></div>
                <div><strong>Working Days Lost</strong><p>{selectedPendingSelfCert.working_days_lost ?? "-"}</p></div>
                <div><strong>Notification Made To</strong><p>{selectedPendingSelfCert.notification_made_to || "-"}</p></div>
                <div><strong>Status</strong><p>{selectedPendingSelfCert.status || "-"}</p></div>
              </div>

              <label>Reason and Symptoms</label>
              <textarea value={selectedPendingSelfCert.reason_and_symptoms || ""} readOnly rows={3} />

              <h4 style={{ marginBottom: 6, marginTop: 12 }}>Medical / Injury</h4>
              <div className="readonly-meta-grid">
                <div><strong>Happened At Work</strong><p>{formatYesNo(selectedPendingSelfCert.injury_occurred)}</p></div>
                <div><strong>Sought Medical Advice</strong><p>{formatYesNo(selectedPendingSelfCert.sought_medical_advice)}</p></div>
                <div><strong>Consulted Doctor Again</strong><p>{formatYesNo(selectedPendingSelfCert.consulted_doctor_again)}</p></div>
                <div><strong>Visited Hospital/Clinic</strong><p>{formatYesNo(selectedPendingSelfCert.visited_hospital_or_clinic)}</p></div>
              </div>

              <label>Injury Details</label>
              <textarea value={selectedPendingSelfCert.injury_details || ""} readOnly rows={3} />

              <h4 style={{ marginBottom: 6, marginTop: 12 }}>Employee Signature</h4>
              <div className="readonly-meta-grid">
                <div><strong>Employee Signature</strong><p>{displaySignatureValue(selectedPendingSelfCert.employee_signature)}</p></div>
                <div><strong>Employee Signed At</strong><p>{selectedPendingSelfCert.employee_signed_at ? new Date(selectedPendingSelfCert.employee_signed_at).toLocaleString() : "-"}</p></div>
              </div>

              <label>Manager Signature</label>
              <button type="button" className="secondary" onClick={() => setManagerSignatureModalOpen(true)}>
                {managerApprovalSignature ? "Signature captured (click to re-sign)" : "Tap/click to sign with mouse"}
              </button>

              <div className="actions-row" style={{ marginTop: 12 }}>
                <button type="button" className="secondary" onClick={() => setSelectedPendingSelfCert(null)} disabled={approvingPendingSelfCert}>
                  Cancel
                </button>
                <button type="button" onClick={approvePendingSelfCert} disabled={approvingPendingSelfCert}>
                  {approvingPendingSelfCert ? "Approving..." : "Approve"}
                </button>
              </div>
            </section>
          )}

          {managerSignatureModalOpen && (
            <div className="mini-modal-backdrop" onClick={() => setManagerSignatureModalOpen(false)}>
              <section className="mini-modal signature-capture-modal" onClick={(e) => e.stopPropagation()}>
                <header className="mini-modal-header">
                  <h3>Manager Signature</h3>
                  <button type="button" className="secondary mini" onClick={() => setManagerSignatureModalOpen(false)}>
                    Close
                  </button>
                </header>

                <canvas
                  ref={managerSignatureCanvasRef}
                  className="signature-canvas"
                  onMouseDown={startManagerSignatureStroke}
                  onMouseMove={moveManagerSignatureStroke}
                  onMouseUp={endManagerSignatureStroke}
                  onMouseLeave={endManagerSignatureStroke}
                  onTouchStart={startManagerSignatureStroke}
                  onTouchMove={moveManagerSignatureStroke}
                  onTouchEnd={endManagerSignatureStroke}
                />

                <div className="actions-row" style={{ marginTop: 10 }}>
                  <button type="button" className="secondary" onClick={clearManagerSignaturePad}>Clear</button>
                  <button type="button" onClick={saveManagerSignaturePad}>Save Signature</button>
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderDefectCaptureModal() {
    if (!defectCaptureModalOpen) return null;

    return (
      <div className="mini-modal-backdrop" onClick={closeDefectCaptureModal}>
        <section className="mini-modal defect-capture-modal" onClick={(e) => e.stopPropagation()}>
          <header className="mini-modal-header">
            <h3>Record Checklist Defects</h3>
            <button type="button" className="secondary mini" onClick={closeDefectCaptureModal} disabled={defectCaptureSubmitting}>
              Close
            </button>
          </header>
          <p className="sub">Select which defects should be raised into the Maintenance Defect System.</p>

          <div className="defect-capture-list">
            {defectCaptureRows.map((row) => (
              <div key={row.id} className="defect-capture-card">
                <label className="region-checkbox-item">
                  <input
                    type="checkbox"
                    checked={row.should_record}
                    onChange={(e) => setDefectCaptureRowField(row.id, "should_record", e.target.checked)}
                  />
                  <strong>{row.checklist_item}</strong>
                </label>

                <label>
                  Title
                  <input
                    value={row.title}
                    onChange={(e) => setDefectCaptureRowField(row.id, "title", e.target.value)}
                    disabled={!row.should_record}
                  />
                </label>

                <label>
                  Description
                  <textarea
                    rows={3}
                    value={row.description}
                    onChange={(e) => setDefectCaptureRowField(row.id, "description", e.target.value)}
                    disabled={!row.should_record}
                  />
                </label>

                <div>
                  <label>Photos (Upload)</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={!row.should_record || defectCaptureSubmitting}
                    onChange={(e) => {
                      const files = e.target.files;
                      handleDefectPhotoSelection(row.id, files);
                      e.target.value = "";
                    }}
                  />
                  <div className="sub" style={{ marginTop: 6 }}>
                    Up to {DEFECT_PHOTO_MAX_FILES} photos, max {DEFECT_PHOTO_MAX_MB}MB each.
                  </div>
                  {Array.isArray(row.photo_uploads) && row.photo_uploads.length > 0 && (
                    <div className="defect-photo-list">
                      {row.photo_uploads.map((photo, index) => (
                        <div key={`${row.id}-photo-${index}`} className="defect-photo-chip">
                          <span title={photo.name}>{photo.name || `Photo ${index + 1}`}</span>
                          <button
                            type="button"
                            className="secondary mini"
                            onClick={() => removeDefectPhoto(row.id, index)}
                            disabled={defectCaptureSubmitting}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="defect-capture-grid">
                  <div className="defect-category-row">
                    <label className="defect-category-main">
                      Category
                      <select
                        value={row.category}
                        onChange={(e) => setDefectCaptureRowField(row.id, "category", e.target.value)}
                        disabled={!row.should_record}
                      >
                        <option value="">-- Select Category --</option>
                        {MAINTENANCE_DEFECT_CATEGORIES.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>

                    {row.category === "Other" && (
                      <div className="defect-category-other">
                        <span className="defect-category-other-label">Other Category Detail</span>
                        <div className="defect-category-other-inline">
                          <span className="defect-other-chip">Other</span>
                          <input
                            value={row.other_category_text || ""}
                            onChange={(e) => setDefectCaptureRowField(row.id, "other_category_text", e.target.value)}
                            disabled={!row.should_record}
                            placeholder="Type category detail"
                            aria-label="Other category detail"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    Priority
                    <div className="defect-priority-list">
                      {MAINTENANCE_PRIORITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`defect-priority-card ${Number(row.priority) === option.value ? "selected" : ""}`}
                          onClick={() => setDefectCaptureRowField(row.id, "priority", option.value)}
                          disabled={!row.should_record}
                        >
                          <span className="defect-priority-title" style={{ color: option.color }}>
                            {option.label}
                          </span>
                          <span className="defect-priority-desc">{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="actions-row" style={{ marginTop: 12 }}>
            <button type="button" className="secondary" onClick={closeDefectCaptureModal} disabled={defectCaptureSubmitting}>
              Decide Later
            </button>
            <button type="button" onClick={submitChecklistDefectsToMaintenance} disabled={defectCaptureSubmitting}>
              {defectCaptureSubmitting ? "Sending..." : "Send Selected Defects"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <div className="page page-dashboard">
        <header className="topbar">
          <div>
            <h1>Home</h1>
            <p>{user?.email}</p>
          </div>
          <div className="topbar-actions">
            <button type="button" className="secondary topbar-bell" onClick={openSelfCertApprovalsModal}>
              <span aria-hidden="true">🔔</span>
              <span>Approvals</span>
              {pendingSelfCertApprovals.length > 0 && (
                <span className="topbar-badge">{pendingSelfCertApprovals.length > 99 ? "99+" : pendingSelfCertApprovals.length}</span>
              )}
            </button>
            <button className="secondary" onClick={signOut}>Sign Out</button>
          </div>
        </header>

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === "contracts" ? "active" : ""}`}
            onClick={() => setActiveTab("contracts")}
          >
            Contracts
          </button>
          <button
            className={`tab-btn ${activeTab === "forms" ? "active" : ""}`}
            onClick={() => setActiveTab("forms")}
          >
            Forms
          </button>
          <button
            className={`tab-btn ${activeTab === "admin" ? "active" : ""}`}
            onClick={() => setActiveTab("admin")}
          >
            Admin
          </button>
        </div>

        {activeTab === "contracts" && renderContractsTab()}
        {activeTab === "forms" && renderFormsTab()}
        {activeTab === "admin" && renderAdminTab()}
      </div>

      {renderContractModal()}
      {renderSelfCertApprovalsModal()}
      {renderNearMissModal()}
      {renderSelfCertModal()}
      {renderDefectCaptureModal()}
    </>
  );
}
