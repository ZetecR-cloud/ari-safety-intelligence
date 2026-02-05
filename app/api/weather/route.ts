import { NextResponse } from "next/server";
import { analyzeTafRisk } from "../../../lib/wx/tafRisk";
・ｿimport { NextResponse } from "next/server";
import { analyzeTafRisk } from "../../lib/wx/tafRisk";

/** ===== Minimal Wx Judge (no imports) =====
 * - RED: TS/CB in TAF (any block) OR FZFG/VV001 in TEMPO
 * - AMBER: TEMPO vis <= 2000m OR ceiling <= 500ft (BKN/OVC/VV) in TEMPO
 * - GREEN: otherwise
 *
 * Notes:
 * - This is "譛遏ｭ縺ｧ蜍輔°縺・迚医ょｾ後〒莨夂､ｾ繝昴Μ繧ｷ繝ｼ(EVA)縺ｫ蜷医ｏ縺帙※隱ｿ謨ｴ蜿ｯ縲・
 */

type WxLevel = "GREEN" | "AMBER" | "RED";

function parseVisM(text: string): number | null {
  // e.g. "9999", "8000", "2000"
  const m = text.match(/\b(\d{4})\b/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function parseCeilingFt(text: string): number | null {
  // Look for BKN/OVC/VVxxx (hundreds of feet)
  // e.g. BKN003 => 300ft, OVC010 => 1000ft, VV001 => 100ft
  const m = text.match(/\b(BKN|OVC|VV)(\d{3})\b/);
  if (!m) return null;
  const hh = Number(m[2]);
  if (!Number.isFinite(hh)) return null;
  return hh * 100;
}

function hasTSorCB(text: string): boolean {
  return /\bTS\b/.test(text) || /\bTSRA\b/.test(text) || /\bCB\b/.test(text);
}

function judgeWxFromTafRisk(tafRisk: any): { level: WxLevel; reasons: string[] } {
  const reasons: string[] = [];
  const blocks: Array<{ type: string; text: string }> = Array.isArray(tafRisk?.blocks) ? tafRisk.blocks : [];

  // RED triggers
  for (const b of blocks) {
    const t = b.text ?? "";
    if (hasTSorCB(t)) {
      reasons.push("TS/CB in TAF");
      return { level: "RED", reasons };
    }
    if (b.type === "TEMPO") {
      if (/\bFZFG\b/.test(t) || /\bVV001\b/.test(t)) {
        reasons.push("FZFG/VV001 in TEMPO");
        return { level: "RED", reasons };
      }
    }
  }

  // AMBER triggers
  for (const b of blocks) {
    if (b.type !== "TEMPO") continue;
    const t = b.text ?? "";

    const vis = parseVisM(t);
    if (vis !== null && vis <= 2000) reasons.push(`TEMPO vis <= 2000m (${vis})`);

    const ceil = parseCeilingFt(t);
    if (ceil !== null && ceil <= 500) reasons.push(`TEMPO ceiling <= 500ft (${ceil}ft)`);
  }

  if (reasons.length) return { level: "AMBER", reasons };
  return { level: "GREEN", reasons: ["No significant hazards detected"] };
}

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
    const metarURL = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
    const tafURL   = `https://aviationweather.gov/api/data/taf?ids=${icao}&format=json`;

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
    let tafRisk = null;
    try {
      tafRisk = analyzeTafRisk(taf0?.rawTAF ?? "");
    const metar = { raw: metar0?.rawOb ?? null };
    const taf   = { raw: taf0?.rawTAF ?? null };

    let tafRisk: any = null;
    try {
      tafRisk = taf.raw ? analyzeTafRisk(taf.raw) : null;
    } catch {
      tafRisk = null;
    }
    return NextResponse.json({
      ok: true,
      icao,
      metar: { raw: metar0?.rawOb ?? null },
      taf:   { raw: taf0?.rawTAF ?? null },
      tafRisk,
    const wx_analysis = tafRisk ? judgeWxFromTafRisk(tafRisk) : { level: "AMBER" as WxLevel, reasons: ["TAF missing"] };

    return NextResponse.json({
      ok: true,
      icao,
      metar,
      taf,
      tafRisk,
      wx_analysis,
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
