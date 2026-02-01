// app/lib/wx/wxJudge.ts

export type WxJudgement = {
  level: "GREEN" | "AMBER" | "RED";
  reasons: string[];
  ceilingFt: number | null;
};

export function judgeWx(input: { clouds?: string[] }): WxJudgement {
  const reasons: string[] = [];
  const clouds: string[] = input?.clouds ?? [];

  // ICAO ceiling definition (operational simplification):
  // ceiling = lowest layer of BKN/OVC/VV
  let ceilingFt: number | null = null;

  for (const layer of clouds) {
    const m = layer.match(/^(BKN|OVC|VV)(\d{3})/);
    if (!m) continue;

    const ft = parseInt(m[2], 10) * 100;
    if (Number.isFinite(ft)) {
      if (ceilingFt === null || ft < ceilingFt) ceilingFt = ft;
    }
  }

  // Example policy:
  // - AMBER if ceiling < 3000ft (you can tighten to RED by your company rule)
  if (ceilingFt !== null && ceilingFt < 3000) {
    reasons.push(`Ceiling present (<3000ft): ${ceilingFt}ft`);
  }

  const level: WxJudgement["level"] = reasons.length ? "AMBER" : "GREEN";

  return { level, reasons, ceilingFt };
}
