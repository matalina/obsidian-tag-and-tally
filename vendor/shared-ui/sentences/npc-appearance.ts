import type { ITableStore } from "../table-store";

// Keys must match character-distinguishing-feature-type table values exactly
const DISTINGUISHING_TO_SUB_TABLE: Record<string, string> = {
  "Extreme Deformity/Scarring": "character-deformity",
  "Heavy Body Art": "character-body-art",
  "Notable Skin Condition": "character-skin-condition",
  "Minor Flaw": "character-minor-flaw",
  "Distinctive Grooming": "character-distinguished-grooming",
  "Clean/Striking Feature": "character-clean-striking-feature",
  "Wealth/Status": "character-status-feature",
  "Legendary Presence": "character-legendary-presence",
};

const NOTHING_OF_NOTE = "Nothing of Note";

function roll(store: ITableStore, tableName: string): { result: string; total?: number } {
  try {
    const tr = store.random(tableName);
    const total =
      tr.roll && typeof (tr.roll as { total?: number }).total === "number"
        ? (tr.roll as { total: number }).total
        : undefined;
    return { result: tr.result, total };
  } catch {
    return { result: `[Table missing: ${tableName}]` };
  }
}

/**
 * Generate NPC appearance block (pronoun, age, height, build, hair, eyes, skin, clothing, voice, distinguishing feature).
 * Uses character-* tables from the table store. Included in display and copy when sentence type is NPC/Character.
 */
export function generateNPCAppearance(store: ITableStore): string {
  if (!store.hasTable("character-build-height")) {
    return "[Appearance tables missing]";
  }

  const lines: string[] = [];

  const pronounTr = roll(store, "character-pronoun");
  lines.push(`Pronoun: ${pronounTr.result}`);

  const ageTr = roll(store, "character-age");
  lines.push(`Age: ${ageTr.result}`);

  const buildTr = roll(store, "character-build-height");
  const buildResult = buildTr.result;
  const heightTotal = buildTr.total;
  if (typeof heightTotal === "number") {
    const heightInches = (54 + heightTotal * 1.25);
    const totalInchesRounded = Math.round(heightInches);
    const feet = Math.floor(totalInchesRounded / 12);
    const inches = totalInchesRounded % 12;
    lines.push(`Height: ${feet}'${inches}"`);
  } else {
    lines.push("Height: —");
  }
  lines.push(`Build: ${buildResult}`);

  const hairTexture = roll(store, "character-hair-texture").result;
  const hairStyle = roll(store, "character-hair-style").result;
  const hairColor = roll(store, "character-hair-color").result;
  lines.push(`Hair: ${hairTexture}, ${hairStyle}, ${hairColor}`);

  const eyesTr = roll(store, "character-eye-color");
  lines.push(`Eyes: ${eyesTr.result}`);

  const skinTone = roll(store, "character-skin-tone").result;
  const skinComplexion = roll(store, "character-skin-complexion").result;
  lines.push(`Skin: ${skinTone}, ${skinComplexion}`);

  const clothingTr = roll(store, "character-clothing");
  lines.push(`Clothing: ${clothingTr.result}`);

  const voiceTr = roll(store, "character-voice");
  lines.push(`Voice: ${voiceTr.result}`);

  const distinguishingTr = roll(store, "character-distinguishing-feature-type");
  const distinguishingResult = distinguishingTr.result;
  let distinguishingLine = `Distinguishing: ${distinguishingResult}`;
  if (distinguishingResult !== NOTHING_OF_NOTE) {
    const subTable = DISTINGUISHING_TO_SUB_TABLE[distinguishingResult];
    if (subTable && store.hasTable(subTable)) {
      const subTr = roll(store, subTable);
      if (!subTr.result.startsWith("[") || !subTr.result.includes("missing")) {
        distinguishingLine += ` — ${subTr.result}`;
      }
    }
  }
  lines.push(distinguishingLine);

  return lines.join("\n");
}
