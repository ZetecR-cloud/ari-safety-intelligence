import { NextResponse } from "next/server";
import { fetchJsonWithTimeout } from "@/app/lib/util/fetchJsonWithTimeout";
import { getWxProviderBaseUrl } from "@/app/lib/wx/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUILD_TAG = "ARI9_ROUTE_2666d27_v1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const icao = (searchParams.get("icao") ?? "").trim().toUpperCase();

    if (!icao) {
      return NextResponse.json(
        { ok: false, error: "Missing icao", buildTag: BUILD_TAG },
        { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const base = getWxProviderBaseUrl();

    if (!base) {
      return NextResponse.json(
        { ok: true, icao, note: "WX_PROVIDER_BASE_URL not set", buildTag: BUILD_TAG },
        { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const metarUrl = `${base}/metar?icao=${encodeURIComponent(icao)}`;
    const tafUrl = `${base}/taf?icao=${encodeURIComponent(icao)}`;

    const [metar, taf] = await Promise.all([
      fetchJsonWithTimeout(metarUrl, 12000),
      fetchJsonWithTimeout(tafUrl, 12000),
    ]);

    return NextResponse.json(
      {
        ok: true,
        icao,
        buildTag: BUILD_TAG,
        metar: metar.ok ? metar.data : { error: metar.error, status: metar.status },
        taf: taf.ok ? taf.data : { error: taf.error, status: taf.status },
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : "Unknown error";
    return NextResponse.json(
      { ok: false, error: msg, buildTag: BUILD_TAG },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
// deploy-stamp: 20260220_001243
