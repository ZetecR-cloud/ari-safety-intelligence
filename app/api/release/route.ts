import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const payload = await req.json();

  // payload例：airport, rwy, wind, comp, decision, reason, limits, tafBlocks...
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  let y = 800;
  const line = (s: string) => {
    page.drawText(s, { x: 40, y, size: 11, font });
    y -= 16;
  };

  line("DISPATCH RELEASE");
  line(`Airport: ${payload.airport}   RWY: ${payload.rwy} (MAG ${payload.rwyMag})`);
  line(`Surface: ${payload.surface}   Approach: ${payload.approachCat}   Autoland: ${payload.autoland}`);
  line(`Wind: ${payload.wind.dir}/${payload.wind.spd}${payload.wind.gust ? "G"+payload.wind.gust : ""}`);
  line(`Components: HW ${payload.comp.headSteady} / TW ${payload.comp.tailSteady} / XW ${payload.comp.crossSteady}`);
  if (payload.comp.crossPeak != null) line(`Peak: TW ${payload.comp.tailPeak} / XW ${payload.comp.crossPeak}`);
  line(`Limits: TW<=${payload.limits.maxTailwind}  XW<=${payload.limits.maxCrosswind}`);

  y -= 8;
  line(`DECISION: ${payload.decision}`);
  for (const r of payload.reason ?? []) line(`- ${r}`);

  y -= 8;
  line("TAF BLOCKS:");
  for (const b of payload.tafBlocks ?? []) {
    line(`[${b.type}] ${b.text}`);
  }

  const bytes = await pdf.save();

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="dispatch_release.pdf"`,
    },
  });
}
