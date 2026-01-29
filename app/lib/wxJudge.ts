import { LIMITS, RwySurface, ApproachCat, WindLimits } from "./limits";
import { windComponents, Wind } from "./wind";
import { analyzeTafRisk, TafRisk } from "./wx/tafRisk";

export type Decision = "GREEN" | "AMBER" | "RED";

export function selectLimits(args: {
  surface: RwySurface;
  approachCat: ApproachCat;
  autoland: boolean;
}): WindLimits {
  const { surface, approachCat, autoland } = args;

  if (autoland && (approachCat === "CATII" || approachCat === "CATIII")) {
    return LIMITS.autoland[approachCat][surface];
  }
  return LIMITS.normal[surface];
}

export function judgeDispatch(args: {
  wind: Wind;
  rwyMag: number;
  surface: RwySurface;
  approachCat: ApproachCat;
  autoland: boolean;
  tafText: string | null;
}) {
  const limits = selectLimits({
    surface: args.surface,
    approachCat: args.approachCat,
    autoland: args.autoland,
  });

  const comp = windComponents(args.wind, args.rwyMag);

  // --- TAFリスク（TS/CB etc） ---
  const tafRisk: TafRisk | null = args.tafText ? analyzeTafRisk(args.tafText) : null;
  if (tafRisk?.hardRed) {
    return { decision: "RED" as Decision, reason: tafRisk.reasons, comp, limits, tafRisk };
  }

  const crossUse = comp.crossPeak ?? comp.crossSteady;
  const tailUse  = comp.tailPeak  ?? comp.tailSteady;

  if (tailUse > limits.maxTailwind) {
    return { decision: "RED" as Decision, reason: [`Tailwind ${tailUse} > ${limits.maxTailwind}`], comp, limits, tafRisk };
  }
  if (crossUse > limits.maxCrosswind) {
    return { decision: "RED" as Decision, reason: [`Crosswind ${crossUse} > ${limits.maxCrosswind}`], comp, limits, tafRisk };
  }

  // AMBER条件（例：上限の80%超え）
  const amber = (x: number, lim: number) => x >= Math.round(lim * 0.8);
  const reasons: string[] = [];
  if (amber(tailUse, limits.maxTailwind)) reasons.push(`Tailwind high (${tailUse}/${limits.maxTailwind})`);
  if (amber(crossUse, limits.maxCrosswind)) reasons.push(`Crosswind high (${crossUse}/${limits.maxCrosswind})`);
  if (tafRisk?.softAmber) reasons.push(...tafRisk.reasons);

  return {
    decision: reasons.length ? ("AMBER" as Decision) : ("GREEN" as Decision),
    reason: reasons.length ? reasons : ["Within limits"],
    comp, limits, tafRisk
  };
}
