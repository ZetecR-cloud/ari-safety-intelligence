export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const icao = searchParams.get("icao");

  if (!icao) {
    return Response.json(
      { error: "ICAO code is required" },
      { status: 400 }
    );
  }

  const upper = icao.toUpperCase();

  const metarURL =
    `https://aviationweather.gov/api/data/metar?ids=${upper}&format=json`;

  const tafURL =
    `https://aviationweather.gov/api/data/taf?ids=${upper}&format=json`;

  const [metarRes, tafRes] = await Promise.all([
    fetch(metarURL, { cache: "no-store" }),
    fetch(tafURL, { cache: "no-store" })
  ]);

  const metar = await metarRes.json();
  const taf = await tafRes.json();

  const rawMetar = metar?.[0]?.rawOb || null;
  const rawTaf = taf?.[0]?.rawTAF || null;

  // ===== 基本解析 =====
  const wind =
    rawMetar?.match(/(\d{3}|VRB)(\d{2})(G\d{2})?KT/)?.[0] ?? null;

  const visibility =
    rawMetar?.match(/\s(\d{4}|9999)\s/)?.[1] ?? null;

  const qnh =
    rawMetar?.match(/Q(\d{4})/)?.[1] ?? null;

  const clouds =
    rawMetar?.match(/(FEW|SCT|BKN|OVC)\d{3}/g) ?? [];

  // ===== リスク評価 =====
  let level = "GREEN";
  const reasons: string[] = [];

  if (visibility && Number(visibility) < 3000) {
    level = "RED";
    reasons.push("Low visibility");
  }

  if (clouds.some(c => c.startsWith("BKN") || c.startsWith("OVC"))) {
    level = level === "RED" ? "RED" : "AMBER";
    reasons.push("Ceiling present");
  }

  if (wind && wind.includes("G")) {
    level = level === "GREEN" ? "AMBER" : level;
    reasons.push("Gusty wind");
  }

  return Response.json({
    status: "OK",
    icao: upper,
    sources: ["metar", "taf", "aviationweather.gov"],
    metar: {
      raw: rawMetar,
      wind,
      visibility,
      qnh,
      clouds
    },
    taf: rawTaf,
    wx_analysis: {
      level,
      reasons
    },
    time: new Date().toISOString()
  });
}
