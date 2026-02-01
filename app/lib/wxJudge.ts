// app/lib/wx/wxJudge.ts

export function judgeWx(metar: any) {
  const reasons: string[] = [];

  const clouds: string[] = metar?.clouds ?? [];

  let ceilingFt: number | null = null;

  for (const layer of clouds) {
    const m = layer.match(/^(BKN|OVC|VV)(\d{3})/);
    if (!m) continue;

    const ft = parseInt(m[2], 10) * 100;
    if (ceilingFt === null || ft < ceilingFt) {
      ceilingFt = ft;
    }
  }

  // ✅ ICAO OFFICIAL CEILING RULE
  if (ceilingFt !== null && ceilingFt < 3000) {
    reasons.push(`Ceiling present (<3000ft): ${ceilingFt}ft`);
  }

  return {
    reasons,
    ceilingFt,
  };
}

