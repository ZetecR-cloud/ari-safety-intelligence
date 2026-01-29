export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const icao = searchParams.get("icao");

  if (!icao) {
    return Response.json(
      { error: "ICAO code is required" },
      { status: 400 }
    );
  }

  return Response.json({
    status: "OK",
    icao: icao.toUpperCase(),
    message: "ICAO received successfully",
    time: new Date().toISOString()
  });
}
