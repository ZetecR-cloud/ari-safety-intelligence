import { NextResponse } from "next/server";
import ... from "@/lib/wx/wxJudge";


type AwMetar = {
  rawOb: string;
  icaoId?: string;
  wdir?: string;
  wspd?: string;
  clouds?: string[];
};

type AwTaf = {
  rawTAF: string;
};

function parseVisibility(token: string): string | null {
  // ICAO 9999 / 8000 etc
  if (/^\d{4}$/.test(token)) return token;
  return null;
}

function parseAltimeter(token: string): string | null {
  // ICAO: Q1013
  const q = token.match(/^Q(\d{4})$/);
  if (q) return q[1];

  // FAA: A3020 -> inHg*100 to hPa
  const a = token.match(/^A(\d{4})$/);
  if (a) {
    const inHg = Number(a[1]) / 100;
    const hPa = Math.round(inHg * 33.8639);
    return String(hPa);
  }

  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const icao = (searchParams.get("icao") ?? "").trim();
  if (!icao) {
    return NextResponse.json({ error: "ICAO code is required" }, { status: 400 });
  }

  const upper = icao.toUpperCase();

  const metarURL = `https://aviationweather.gov/api/data/metar?ids=${upper}&format=json`;
  const tafURL = `https://aviationweather.gov/api/data/taf?ids=${upper}&format=json`;

  const [metarRes, tafRes] = await Promise.all([
    fetch(metarURL, { cache: "no-store" }),
    fetch(tafURL, { cache: "no-store" }),
  ]);

  const metars = (await metarRes.json()) as AwMetar[];
  const tafs = (await tafRes.json()) as AwTaf[];

  const metar = metars?.[0];
  const taf = tafs?.[0];

  if (!metar || !metar.rawOb) {
    return NextResponse.json({ error: "METAR not available" }, { status: 404 });
  }

  const rawMetar = metar.rawOb;
  const tokens = rawMetar.split(/\s+/);

  let visibility: string | null = null;
  let altimeter: string | null = null;

  for (const t of tokens) {
    if (!visibility) visibility = parseVisibility(t);
    if (!altimeter) altimeter = parseAltimeter(t);
  }

  const wx = judgeWx({ clouds: metar.clouds ?? [] });

  return NextResponse.json({
    status: "OK",
    icao: upper,
    metar: {
      station_id: metar.icaoId ?? upper,
      wind: `${metar.wdir ?? "///"}${metar.wspd ?? "//"}KT`,
      visibility,
      altimeter,
      clouds: metar.clouds ?? [],
      raw_text: rawMetar,
    },
    taf: taf?.rawTAF ?? null,
    wx_analysis: wx,
    time: new Date().toISOString(),
  });
}
