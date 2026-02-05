import { NextResponse } from "next/server";

// NOTE:
// - This route is intentionally minimal and BOM/garbage-character safe.
// - If you want to call analyzeTafRisk later, we can add it back cleanly.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const icao = (searchParams.get("icao") ?? "").trim().toUpperCase();

  if (!icao) {
    return NextResponse.json(
      { status: "NG", message: "Missing icao" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    status: "OK",
    icao,
    message: "weather route OK (placeholder)"
  });
}
