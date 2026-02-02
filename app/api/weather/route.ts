import { NextResponse } from "next/server";

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

    // ここではまだ外部APIや解析は一切しない
    // 「ルートが生きているか」「例外が見えるか」だけ確認する
    return NextResponse.json({
      ok: true,
      message: "weather route alive",
      icao: icao.toUpperCase(),
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
