// app/api/weather/route.ts

import { NextResponse } from "next/server";
import { judgeWx } from "@/app/lib/wx/wxJudge";

/**
 * Visibility parser
 * - ICAO: 9999 / 8000 etc (meters)
 * - US METAR: 10SM / 5SM / 1/2SM / 2 1/2SM (we support 1/2SM style without space)
 */
function parseVisibility(token: string): string | null {
  // ICAO style: 9999 / 8000 etc
  if (/^\d{4}$/.test(token)) return token;

  // US style: e.g. 10SM, 5SM, 1/2SM, 2SM
  const sm = token.match(/^(\d+)(SM)$/);
  if (sm) {
    const miles = Number(sm[1]);
    if (!Number.isFinite(miles)) return null;
    const meters = Math.round(miles * 1609.344);
    return String(meters);
  }

  // Fractional: 1/2SM
  const frac = token.match(/^(\d+)\/(\d+)SM$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    const miles = num / den;
    const meters = Math.round(miles * 1609.344);
    return String(meters);
  }

  // "P6SM" (>=6SM) sometimes appears
  const p = token.match(/^P(\d+)SM$/);
  if (p) {
    const miles = Number(p[1]);
    if (!Number.isFinite(miles)) return null;
    const meters = Math.round(miles * 1609.344);
    return String(meters);
  }

  return null;
}

/**
 * Altimeter / QNH parser
 * - ICAO: Q1013 -> "1013"
 * - FAA : A3020 -> convert inHg->hPa (rounded)
 */
function parseAltimeter(token: string): string | null {
  const q = token.match(/^Q(\d{4})$/);
  if (q) return q[1];

  const a = token.match(/^A(\d{4})$/);
  if (a) {
    const inHg = Number(a[1]) / 100;
    const hPa = Math.round(inHg * 33.8639);
    return String(hPa);
  }

  return null;
}

type AwMetar = {
  rawOb: string;
  icaoId?: string;
  wdir?: string;
  wspd?: string;
  clouds?: string[];
};

type AwTaf = {
  rawTAF?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const icao = searchParams.get("icao")?.trim();

  if (!icao) {
    return NextResponse.json({ error: "ICAO code is required" }, { status: 400 });
  }

  const upper = icao.toUpperCase();

  const metarURL = `https://aviationweather.gov/api/data/metar?ids=${upper}&format=json`;
  const tafURL = `https://aviationweather.gov/api/data/taf?ids=${upper}&format=json`;

  const [metarRes, tafRes] = await Promise.all([
    fetch(metarURL, { cache: "no-store" }),
    fetch(tafURL, { cache: "no-store" })
  ]);

  const metars = (await metarRes.json()) as AwMetar[];
  const tafs = (await tafRes.json()) as AwTaf[];

  const metar = metars?.[0];
  const taf = tafs?.[0];

  if (!metar?.rawOb) {
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
      wind: `${metar.wdir ?? "///"}${metar.wspd ?? "///"}KT`,
      visibility,
      altimeter,
      clouds: metar.clouds ?? [],
      raw_text: rawMetar
    },
    taf: taf?.rawTAF ?? null,
    wx_analysis: wx,
    time: new Date().toISOString()
  });
}
