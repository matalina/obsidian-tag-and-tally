import {
    getBases,
    getAspects,
    getTypes,
    getEffectScopes,
    totalPoints,
    pointsToLevel,
    finalLevel
} from "./spell-calc";

/**
 * Generate a random spell sentence using the new spell creation process:
 * Base + Aspect(s) + Type(s) + optional axis cost → Spell Level; + PM → Final Spell Level.
 * Sentence: **Name** is a [descriptor] [base] spell that [effect].
 */
export function generateSpellSentence(): string {
    const bases = getBases();
    const aspects = getAspects();
    const types = getTypes();
    const scopes = getEffectScopes();

    const base = bases[Math.floor(Math.random() * bases.length)];
    const aspect = aspects[Math.floor(Math.random() * aspects.length)];
    const type = types[Math.floor(Math.random() * types.length)];

    // Optional: occasional multi-axis (Chaos only)
    let aspectsList = [aspect];
    let typesList = [type];
    if (base === "Chaos" && Math.random() > 0.7) {
        const extraAspect = aspects[Math.floor(Math.random() * aspects.length)];
        if (extraAspect !== aspect) aspectsList.push(extraAspect);
        if (Math.random() > 0.5) {
            const extraType = types[Math.floor(Math.random() * types.length)];
            if (extraType !== type) typesList.push(extraType);
        }
        if (aspectsList.length + typesList.length > 5) {
            aspectsList = [aspect];
            typesList = [type];
        }
    }

    const { total: totalPts, axisCost } = totalPoints(base, aspectsList, typesList);
    const spellLevel = pointsToLevel(totalPts);
    const scope = scopes[Math.floor(Math.random() * scopes.length)];
    const pm = scope.pm;
    const effectiveLevel = finalLevel(spellLevel, pm);
    const displayFinalLevel = Math.min(10, effectiveLevel);
    const overpowered = effectiveLevel > 10
        ? (effectiveLevel >= 13 ? { label: "World Overpowered", hindrance: 2 } : { label: "Overpowered", hindrance: 1 })
        : null;

    // Sentence: **Name** is a [descriptor] [base] spell that [effect].
    const baseTag = `[${base}]`;
    const parts = [
        "**\\[Name]**",
        "is a",
        "[descriptor]",
        baseTag,
        "spell",
        "that",
        "\\[effect]"
    ];
    let sentence = parts.join(" ") + ".";

    sentence = sentence.replace(/\\\[Name\]/g, "[Name]");
    sentence = sentence.replace(/\\\[effect\]/g, "[effect]");

    let calculationStr =
        axisCost > 0
            ? `Total: ${totalPts} (incl. axis cost ${axisCost}) → Level ${spellLevel}; PM ${pm} → Final: ${displayFinalLevel}`
            : `Total: ${totalPts} → Level ${spellLevel}; PM ${pm} → Final: ${displayFinalLevel}`;
    if (overpowered) {
        calculationStr += ` (**${overpowered.label}**)`;
    }

    return `${sentence}  ${calculationStr}`;
}
