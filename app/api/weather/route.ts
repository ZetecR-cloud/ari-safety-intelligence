// app/api/weather/route.ts

import { NextResponse } from "next/server";
import { judgeWx } from "@/app/lib/wx/wxJudge";

function parseVisibility(token: string): string | null {
  // 9999
  if (/^\d{4}$/.test(token)) return token;

  // 10SM / 5SM etc
  const sm = token.match(/^(\d+)?SM$/);
  if (sm) {
    const miles = Number(sm[1] ?? 10);
    const meters = Math.round(miles * 1609);
    return meters >= 9999 ? "9999" : String(meters);
  }

  return null;
}

function parseQnh(token: string): string | null {
  // Q1013
  const q = token.match(/^Q(\d{4})$/);
  if (q) return q[1];

  // A3020
  const a = token.match(/^A(\d{4})$/);
  if (a) {
    const inHg = Number(a[1]) / 100;
    const hpa = Math.round(inHg * 33.8639);
    return String(hpa);
  }

  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const icao = searchParams.get("icao");

  const res = await fetch(
    `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`
  );
  const metars = await res.json();
  const metar = metars[0];

  const tokens = metar.rawOb.split(" ");

  let visibility: string | null = null;
  let qnh: string | null = null;

  for (const t of tokens) {
    if (!visibility) visibility = parseVisibility(t);
    if (!qnh) qnh = parseQnh(t);
  }

  const wx = judgeWx({
    clouds: metar.clouds,
  });

  return NextResponse.json({
    metar: {
      station_id: metar.icaoId,
      wind: metar.wdir + metar.wspd + "KT",
      visibility,
      altimeter: qnh,
      clouds: metar.clouds,
      raw_text: metar.rawOb,
    },
    wx_analysis: wx,
    taf: metar.taf,
  });
}
