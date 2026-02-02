import { NextResponse } from "next/server";
import { analyzeTafRisk } from "../../lib/wx/tafRisk";

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const icao = (searchParams.get("icao") ?? "").trim();
    if (!icao) {
      return NextResponse.json({ ok: false, error: "ICAO code is required" }, { status: 400 });
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
        { ok: false, error: `METAR fetch failed`, status: metarRes.status },
        { status: 502 }
      );
    }

    const metars = (await metarRes.json()) as AwMetar[];
    const tafs = tafRes.ok ? ((await tafRes.json()) as AwTaf[]) : [];

    const metar = metars?.[0];
    const taf = tafs?.[0];

    if (!metar?.rawOb) {
      return NextResponse.json({ ok: false, error: "METAR not available" }, { status: 404 });
    }

    const tafRisk = taf?.rawTAF ? analyzeTafRisk(taf.rawTAF) : null;

    return NextResponse.json({
      ok: true,
      icao: upper,
      metar,
      taf: taf?.rawTAF ?? null,
      tafRisk,
      time: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("API /weather crashed:", e);
    return NextResponse.json(
      { ok: false, message: e?.message ?? String(e), name: e?.name, stack: e?.stack },
      { status: 500 }
    );
  }
}
