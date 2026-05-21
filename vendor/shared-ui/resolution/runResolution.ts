import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import { keywords } from "./keywords";
import resolutionData from "../data/resolution.json";
import { RESOLUTION_TYPES } from "./types";

const NO_MASTERY_TYPES = new Set(["oracle", "insights", "secrets", "yes no"]);
const LIKELIHOOD_TYPES = new Set(["oracle", "insights", "secrets"]);
export const BINARY_TYPES = new Set(["yes no"]);

function getRandomKeywords(): string[] {
  const selected: string[] = [];
  const available = [...keywords.list];
  for (let i = 0; i < 3 && available.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * available.length);
    selected.push(available[randomIndex]);
    available.splice(randomIndex, 1);
  }
  return selected;
}

function getResolutionTableEntry(
  resolutionType: string,
  rollResult: number,
  dc: number,
): string | null {
  if (resolutionType === "oracle" || resolutionType === "task") return null;
  const tableName = `resolution-${resolutionType.toLowerCase().replace(/\s+/g, "-")}`;
  const tableEntry = (
    resolutionData as {
      name: string;
      table?: { min: number | string; max: number | string; value: string }[];
    }[]
  ).find((entry) => entry.name === tableName);
  if (!tableEntry?.table) return null;
  for (const entry of tableEntry.table) {
    const min = entry.min;
    const max = entry.max;
    let minValue: number;
    let maxValue: number;
    if (typeof min === "number") minValue = min;
    else if (typeof min === "string") {
      const parsedMin = parseInt(min);
      if (!isNaN(parsedMin) && min === parsedMin.toString())
        minValue = parsedMin;
      else if (min === "DC") minValue = dc;
      else if (min.startsWith("DC")) {
        const dcPart = min.replace("DC", "").trim();
        if (dcPart === "") minValue = dc;
        else if (dcPart.startsWith("-"))
          minValue = dc - parseInt(dcPart.substring(1));
        else if (dcPart.startsWith("+"))
          minValue = dc + parseInt(dcPart.substring(1));
        else continue;
      } else continue;
    } else continue;
    if (typeof max === "number") maxValue = max;
    else if (typeof max === "string") {
      const parsedMax = parseInt(max);
      if (!isNaN(parsedMax) && max === parsedMax.toString())
        maxValue = parsedMax;
      else if (max === "DC-6") maxValue = dc - 6;
      else if (max === "DC-1") maxValue = dc - 1;
      else if (max === "DC+4") maxValue = dc + 4;
      else if (max.endsWith("+")) maxValue = Infinity;
      else if (max.startsWith("DC")) {
        const dcPart = max.replace("DC", "").trim();
        if (dcPart === "") maxValue = dc;
        else if (dcPart.startsWith("-"))
          maxValue = dc - parseInt(dcPart.substring(1));
        else if (dcPart.startsWith("+"))
          maxValue = dc + parseInt(dcPart.substring(1));
        else continue;
      } else continue;
    } else continue;
    if (rollResult >= minValue && rollResult <= maxValue) {
      const value = entry.value;
      const lines = value.split("\n");
      if (lines.length > 1) return lines.slice(1).join("\n");
      return value;
    }
  }
  return null;
}

export interface ResolutionResult {
  kind: "dc" | "binary";
  capitalizedType: string;
  questionOrAction: string;
  dc: number;
  rollResult: number;
  rollNotation: string;
  resolutionResult: string;
  thirdLine: string;
  isCritical: boolean;
}

/** Same shape as ResolutionTab `resolutionCopyText` (bold type, optional question, DC line, third line, Add Mastery). */
export function formatResolveOutput(r: ResolutionResult): string {
  let text = `**${r.capitalizedType}**`;
  if (r.questionOrAction) text += `\n${r.questionOrAction}`;
  if (r.kind === "binary") {
    text += `\nRoll: ${r.rollResult} (1d6) » ${r.resolutionResult}`;
    return text + `\n\n`;
  }
  text += `\nDC ${r.dc} → ${r.rollResult} » ${r.resolutionResult}`;
  if (r.thirdLine) text += `\n${r.thirdLine}`;
  if (r.isCritical) text += `\n**Add Mastery**`;
  return text + `\n\n`;
}

export type ParseResolveInlineResult =
  | { resolutionType: string; level: number; likelihoodMod: number }
  | { error: string };

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
}

function findResolutionType(slug: string): string | null {
  const n = normalizeSlug(slug);
  const sorted = [...RESOLUTION_TYPES].sort((a, b) => b.length - a.length);
  for (const t of sorted) {
    if (t === n) return t;
  }
  return null;
}

/**
 * Parse body after `resolve:` (hyphenated slugs, e.g. `combat-opening 7`).
 * `+` / `-` trailing tokens set likelihood for oracle, insights, secrets only (+ = more likely → mod -3).
 */
export function parseResolveInline(inner: string): ParseResolveInlineResult {
  const trimmed = inner.trim();
  if (!trimmed) return { error: "Empty resolve command" };

  const tokens = trimmed.split(/\s+/);
  const last = tokens[tokens.length - 1];
  const withoutLast = tokens.slice(0, -1);

  if (last === "+" || last === "-") {
    const typeSlug = withoutLast.join(" ");
    if (!typeSlug) return { error: "Missing resolution type before +/-" };
    const resolved = findResolutionType(typeSlug);
    if (!resolved) return { error: `Unknown resolution type: ${typeSlug}` };
    if (BINARY_TYPES.has(resolved)) {
      return { error: `${resolved} takes no arguments` };
    }
    if (!LIKELIHOOD_TYPES.has(resolved)) {
      return {
        error: "Trailing +/- is only valid for oracle, insights, and secrets",
      };
    }
    const likelihoodMod = last === "+" ? -3 : 3;
    return { resolutionType: resolved, level: 5, likelihoodMod };
  }

  if (/^\d+$/.test(last)) {
    const lev = parseInt(last, 10);
    if (lev < 0 || lev > 10) return { error: `Level must be 0–10, got ${lev}` };
    const typeSlug = withoutLast.join(" ");
    if (!typeSlug) return { error: "Missing resolution type before level" };
    const resolved = findResolutionType(typeSlug);
    if (!resolved) return { error: `Unknown resolution type: ${typeSlug}` };
    if (BINARY_TYPES.has(resolved)) {
      return { error: `${resolved} takes no arguments` };
    }
    if (LIKELIHOOD_TYPES.has(resolved)) {
      return {
        error: `Do not use numeric level for ${resolved}; use +/- for likelihood or omit both`,
      };
    }
    return { resolutionType: resolved, level: lev, likelihoodMod: 0 };
  }

  const typeSlug = tokens.join(" ");
  const resolved = findResolutionType(typeSlug);
  if (!resolved) return { error: `Unknown resolution type: ${typeSlug}` };
  if (BINARY_TYPES.has(resolved)) {
    return { resolutionType: resolved, level: 0, likelihoodMod: 0 };
  }
  if (!LIKELIHOOD_TYPES.has(resolved)) {
    return { error: `Level required (0–10) for ${resolved}` };
  }
  return { resolutionType: resolved, level: 5, likelihoodMod: 0 };
}

export function runResolution(params: {
  resolutionType: string;
  level: number;
  likelihoodMod: number;
  questionOrAction: string;
}): ResolutionResult {
  const { resolutionType, level, likelihoodMod, questionOrAction } = params;
  if (BINARY_TYPES.has(resolutionType)) {
    const roll = new DiceRoll("1d6");
    const rollResult = roll.total;
    const resolutionResult = rollResult % 2 === 0 ? "Yes" : "No";
    return {
      kind: "binary",
      capitalizedType: "Yes/No",
      questionOrAction: questionOrAction.trim(),
      dc: 0,
      rollResult,
      rollNotation: roll.output,
      resolutionResult,
      thirdLine: "",
      isCritical: false,
    };
  }
  const effectiveLevel =
    resolutionType === "oracle" ||
    resolutionType === "insights" ||
    resolutionType === "secrets"
      ? 5
      : level;
  let dc = effectiveLevel * 3;
  if (
    resolutionType === "oracle" ||
    resolutionType === "insights" ||
    resolutionType === "secrets"
  )
    dc += likelihoodMod;
  const roll = new DiceRoll("1d20");
  const rollResult = roll.total;
  const rollNotation = roll.output;
  const isOracle = resolutionType === "oracle";
  let resolutionResult = "";
  if (rollResult === 1) resolutionResult = isOracle ? "No, and" : "Fail, and";
  else if (rollResult >= 2 && rollResult <= dc - 6)
    resolutionResult = isOracle ? "No, but" : "Fail, but";
  else if (rollResult >= dc - 5 && rollResult <= dc - 1)
    resolutionResult = isOracle ? "Yes, but" : "Success, but";
  else if (rollResult >= dc && rollResult <= dc + 4)
    resolutionResult = isOracle ? "Yes" : "Success";
  else if (rollResult >= dc + 5)
    resolutionResult = isOracle ? "Yes, and" : "Success, and";
  const capitalizedType =
    resolutionType.charAt(0).toUpperCase() + resolutionType.slice(1);
  let thirdLine = "";
  const tableDetails = getResolutionTableEntry(resolutionType, rollResult, dc);
  if (tableDetails && tableDetails !== "--") thirdLine = tableDetails;
  else if (
    (resolutionType === "oracle" || resolutionType === "task") &&
    (resolutionResult.includes("and") || resolutionResult.includes("but"))
  )
    thirdLine = getRandomKeywords().join(", ");
  const isCritical =
    (rollResult === 1 || rollResult === 20) &&
    !NO_MASTERY_TYPES.has(resolutionType);
  return {
    kind: "dc",
    capitalizedType,
    questionOrAction: questionOrAction.trim(),
    dc,
    rollResult,
    rollNotation,
    resolutionResult,
    thirdLine,
    isCritical,
  };
}
