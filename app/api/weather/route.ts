// app/api/weather/route.ts
import { NextResponse } from "next/server";
import { judgeWx } from "@/app/lib/wx/wxJudge";

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
  // ICAO style: 9999 / 8000 / 3000 etc
  if (/^\d{4}$/.test(token)) return token;

  // FAA style: 10SM / 5SM / 1SM etc
  // (no fractions handled here; keep robust)
  const sm = token.match(/^(\d+)\s*SM$/i);
  if (sm) {
    const miles = Number(sm[1]);
    if (Number.isFinite(miles)) {
      const meters = Math.round(miles * 1609.344);
      // cap like ICAO "9999" meaning >=10km
      return meters >= 9999 ? "9999" : String(meters);
    }
  }

  return null;
}

function parseAltimeter(token: string): string | null {
  // ICAO QNH: Q1013
  const q = token.match(/^Q(\d{4})$/);
  if (q) return q[1]; // hPa

  // FAA altimeter: A3020 (inHg*100)
  const a = token.match(/^A(\d{4})$/);
  if (a) {
    const inHg = Number(a[1]) / 100;
    if (!Number.isFinite(inHg)) return null;
    const hPa = Math.round(inHg * 33.8639);
    return String(hPa);
  }

  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const icaoRaw = (searchParams.get("icao") ?? "").trim();

  if (!icaoRaw) {
    return NextResponse.json({ error: "ICAO code is required" }, { status: 400 });
  }

  const upper = icaoRaw.toUpperCase();

  const metarURL = `https://aviationweather.gov/api/data/metar?ids=${upper}&format=json`;
  const tafURL = `https://aviationweather.gov/api/data/taf?ids=${upper}&format=json`;

  const [metarRes, tafRes] = await Promise.all([
    fetch(metarURL, { cache: "no-store" }),
    fetch(tafURL, { cache: "no-store" })
  ]);

  const metars = (await metarRes.json()) as AwMetar[];
  const tafs = (await tafRes.json()) as AwTaf[];

  const metar = metars?.[0];

  if (!metar?.rawOb) {
    return NextResponse.json({ error: "METAR not available" }, { status: 404 });
  }

  const rawMetar = metar.rawOb;
  const tokens = rawMetar.split(/\s+/);

  let visibility: string | null = null;
  let altimeter: string | null = null;

  for (const t of tokens) {
    if (!visibility) {
      const v = parseVisibility(t);
      if (v) visibility = v;
    }
    if (!altimeter) {
      const a = parseAltimeter(t);
      if (a) altimeter = a;
    }
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
    taf: tafs?.[0]?.rawTAF ?? null,
    wx_analysis: wx,
    time: new Date().toISOString()
  });
}
