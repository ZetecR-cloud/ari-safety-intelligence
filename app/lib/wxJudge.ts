// app/lib/wx/wxJudge.ts

export type WxJudgement = {
  level: "GREEN" | "AMBER" | "RED";
  reasons: string[];
  ceilingFt: number | null;
};

export function judgeWx(input: { clouds?: string[] }): WxJudgement {
  const reasons: string[] = [];
  const clouds: string[] = input?.clouds ?? [];

  // ICAO ceiling definition:
  // ceiling = lowest layer of BKN/OVC/VV
  // (common operational rule: ceiling present if < 3000 ft)
  let ceilingFt: number | null = null;

  for (const layer of clouds) {
    const m = layer.match(/^(BKN|OVC|VV)(\d{3})/);
    if (!m) continue;

    const ft = parseInt(m[2], 10) * 100;
    if (Number.isFinite(ft)) {
      if (ceilingFt === null || ft < ceilingFt) ceilingFt = ft;
    }
  }

  // Level logic (simple + robust)
  // GREEN default
  let level: WxJudgement["level"] = "GREEN";

  if (ceilingFt !== null && ceilingFt < 3000) {
    level = "AMBER";
    reasons.push(`Ceiling present (<3000ft): ${ceilingFt}ft`);
  }

  return { level, reasons, ceilingFt };
}
