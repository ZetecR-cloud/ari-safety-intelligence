import { NextResponse } from "next/server";
import { analyzeTafRisk } from "../../lib/wx/tafRisk";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const icao = (searchParams.get("icao") ?? "").trim();
    if (!icao) {
      return NextResponse.json(
        { ok: false, error: "ICAO code is required" },
        { status: 400 }
      );
    }

    const upper = icao.toUpperCase();

    const metarURL = `https://aviationweather.gov/api/data/metar?ids=${upper}&format=json`;
    const tafURL = `https://aviationweather.gov/api/data/taf?ids=${upper}&format=json`;

    const [metarRes, tafRes] = await Promise.all([
      fetch(metarURL, { cache: "no-store" }),
      fetch(tafURL, { cache: "no-store" }),
    ]);

    if (!metarRes.ok) {
      return NextResponse.json(
        { ok: false, error: "METAR fetch failed", status: metarRes.status },
        { status: 502 }
      );
    }
    if (!tafRes.ok) {
      return NextResponse.json(
        { ok: false, error: "TAF fetch failed", status: tafRes.status },
        { status: 502 }
      );
    }

    const metarJson: any = await metarRes.json();
    const tafJson: any = await tafRes.json();

    const metar0 = Array.isArray(metarJson) ? metarJson[0] : metarJson?.[0];
    const taf0 = Array.isArray(tafJson) ? tafJson[0] : tafJson?.[0];

    const metarRaw = metar0?.rawOb ?? "";
    const tafRaw = taf0?.rawTAF ?? "";

    // analyzeTafRisk の引数仕様が違っても落ちないように防御
    let tafRisk: any = null;
    try {
      tafRisk = analyzeTafRisk(tafRaw);
    } catch {
      tafRisk = null;
    }

    return NextResponse.json({
      ok: true,
      icao: upper,
      sources: ["aviationweather.gov"],
      metar: {
        raw: metarRaw,
        wdir: metar0?.wdir != null ? String(metar0.wdir) : undefined,
        wspd: metar0?.wspd != null ? String(metar0.wspd) : undefined,
        clouds: Array.isArray(metar0?.clouds) ? metar0.clouds : [],
      },
      taf: { raw: tafRaw },
      tafRisk,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

