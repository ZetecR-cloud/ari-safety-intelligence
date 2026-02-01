import { NextResponse } from "next/server";

export const runtime = "nodejs"; // 念のため（Edge回避）

export async function GET() {
  // いったん release(PDF生成) 機能は停止。ビルドを通すための安全スタブ。
  return NextResponse.json(
    {
      status: "disabled",
      message:
        "release endpoint is temporarily disabled to keep deployment stable. (pdf generation will be re-enabled later)",
    },
    { status: 501 }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      status: "disabled",
      message:
        "release endpoint is temporarily disabled to keep deployment stable. (pdf generation will be re-enabled later)",
    },
    { status: 501 }
  );
}
