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

    const res = await fetch(metarURL, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "METAR fetch failed", status: res.status },
        { status: 502 }
      );
    }

    const data: any = await res.json();
    const metar0 = Array.isArray(data) ? data[0] : null;

    return NextResponse.json({
      ok: true,
      icao,
      metar: {
        raw: metar0?.rawOb ?? null,
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

