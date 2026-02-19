import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const icao = (searchParams.get("icao") ?? "").trim().toUpperCase();

    if (!icao) {
      return NextResponse.json({ ok: false, error: "Missing icao" }, { status: 400 });
    }

    return NextResponse.json(
      { ok: true, icao },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Unknown error" }, { status: 500 });
  }
}
