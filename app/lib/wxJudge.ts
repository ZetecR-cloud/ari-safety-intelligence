export function judgeWx(input: { clouds: string[] }) {
  const reasons: string[] = [];
  const clouds = input?.clouds ?? [];

  // ICAO ceiling definition:
  // ceiling = lowest layer of BKN/OVC/VV
  // AMBER if ceiling < 3000 ft
  let ceilingFt: number | null = null;

  for (const layer of clouds) {
    const m = layer.match(/^(BKN|OVC|VV)(\d{3})/);
    if (!m) continue;

    const ft = parseInt(m[2], 10) * 100;
    if (Number.isFinite(ft)) {
      if (ceilingFt === null || ft < ceilingFt) ceilingFt = ft;
    }
  }

  if (ceilingFt !== null && ceilingFt < 3000) {
    reasons.push(`Ceiling present (<3000ft): ${ceilingFt}ft`);
  }

  return {
    level: reasons.length ? "AMBER" : "GREEN",
    reasons,
    ceilingFt
  };
}
