import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    // ここに元の処理があるはず（fetchしてMETAR/TAF取るやつ）
    // まずは元のコードをこの try の中に全部入れてください
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("API /weather crashed:", e);
    return NextResponse.json(
      {
        ok: false,
        message: e?.message ?? String(e),
        name: e?.name,
        stack: e?.stack,
      },
      { status: 500 }
    );
  }
}
