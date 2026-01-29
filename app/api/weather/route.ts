export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "API is alive",
    time: new Date().toISOString()
  });
}
