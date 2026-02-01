import { NextResponse } from "next/server";
import { judgeWx } from "@/app/lib/wx/wxJudge";

/* =====================================================
   Visibility parser
   - 9999
   - 10SM / 5SM (US METAR)
===================================================== */
function parseVisibility(token: string): string | null {
  // ICAO style
  if (/^\d{4}$/.test(token)) return token;

  // US style: 10SM
  const sm = token.match(/^(\d+)?SM$/);
  if (sm) {
    const miles = Number(sm[1] ?? 10);
    const meters = Math.round(miles * 1609);
    return meters >= 9999 ? "9999" : String(meters);
  }

  return null;
}

/* =====================================================
   QNH parser
   - Q1013
   - A3020 (inHg → hPa)
===================================================== */
function parseQnh(token: string): string | null {
  // ICAO
  const q = token.match(/^Q(\d{4})$/);
  if (q) return q[1];

  // FAA
  const a = token.match(/^A(\d{4})$/);
  if (a) {
    const inHg = Number(a[1]) / 100;
    const hpa = Math.round(inHg * 33.8639);
    return String(hpa);
  }

  return null;
}

/* =====================================================
   API
===================================================== */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const icao = searchParams.get("icao");

  if (!icao) {
    return NextResponse.json(
      { error: "ICAO code is required" },
      { status: 400 }
    );
  }

  const upper = icao.toUpperCase();

  /* -----------------------------
     fetch METAR / TAF
  ----------------------------- */
  const metarURL = `https://aviationweather.gov/api/data/metar?ids=${upper}&format=json`;
  const tafURL = `https://aviationweather.gov/api/data/taf?ids=${upper}&format=json`;

  const [metarRes, tafRes] = await Promise.all([
    fetch(metarURL, { cache: "no-store" }),
    fetch(tafURL, { cache: "no-store" }),
  ]);

  const metarJson = await metarRes.json();
  const tafJson = await tafRes.json();

  const metar = metarJson?.[0];
  const taf = tafJson?.[0];

  if (!metar) {
    return NextResponse.json(
      { error: "METAR not available" },
      { status: 404 }
    );
  }

  const rawMetar: string = metar.rawOb;
  const tokens = rawMetar.split(" ");

  /* -----------------------------
     visibility / qnh
  ----------------------------- */
  let visibility: string | null = null;
  let qnh: string | null = null;

  for (const t of tokens) {
    if (!visibility) visibility = parseVisibility(t);
    if (!qnh) qnh = parseQnh(t);
  }

  /* -----------------------------
     ICAO weather judgement
     (唯一の ceiling 判定元)
  ----------------------------- */
  const wx = judgeWx({
    clouds: metar.clouds,
  });

  /* -----------------------------
     response
  ----------------------------- */
  return NextResponse.json({
    status: "OK",
    icao: upper,

    metar: {
      station_id: metar.icaoId,
      wind: metar.wdir + metar.wspd + "KT",
      visibility,
      altimeter: qnh,
      clouds: metar.clouds,
      raw_text: rawMetar,
    },

    taf: taf?.rawTAF ?? null,

    wx_analysis: wx,

    time: new Date().toISOString(),
  });
}
