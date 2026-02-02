import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const icao = (searchParams.get("icao") ?? "").trim().toUpperCase();

    if (!icao) {
      return NextResponse.json(
        { ok: false, error: "ICAO code is required" },
        { status: 400 }
      );
    }

    const metarURL =
      `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
    const tafURL =
      `https://aviationweather.gov/api/data/taf?ids=${icao}&format=json`;

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

    const metarData: any = await metarRes.json();
    const tafData: any = await tafRes.json();

    const metar0 = Array.isArray(metarData) ? metarData[0] : null;
    const taf0 = Array.isArray(tafData) ? tafData[0] : null;

    return NextResponse.json({
      ok: true,
      icao,
      metar: {
        raw: metar0?.rawOb ?? null,
      },
      taf: {
        raw: taf0?.rawTAF ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        where: "app/api/weather/route.ts",
        message: e?.message ?? String(e),
        name: e?.name,
        stack: e?.stack,
      },
      { status: 500 }
    );
  }
}
