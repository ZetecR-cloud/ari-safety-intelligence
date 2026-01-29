// app/api/weather/route.ts
export const runtime = "nodejs"; // 確実にサーバ側でfetch（Vercel OK）

type MetarJson = {
  rawOb?: string;
  obsTime?: string;
  temp?: number;
  dewp?: number;
  wdir?: number;
  wspd?: number;
  wgst?: number;
  visib?: number; // statute miles のことが多い
  altim?: number; // inHg のことが多い
  wxString?: string;
  cloudLayers?: Array<{ cover?: string; base?: number }>; // base: feet AGL
  sky_condition?: Array<{ sky_cover?: string; cloud_base_ft_agl?: number }>;
  remark?: string;
};

type TafJson = {
  rawTAF?: string;
  issueTime?: string;
  validTimeFrom?: string;
  validTimeTo?: string;
};

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

function inHgToHpa(inHg?: number) {
  if (typeof inHg !== "number") return null;
  return Math.round(inHg * 33.8639);
}

function milesToMeters(mi?: number) {
  if (typeof mi !== "number") return null;
  return Math.round(mi * 1609.344);
}

function getCeilingFt(metar: MetarJson) {
  // aviationweather のJSONは cloudLayers or sky_condition どっちかで来る
  const layers =
    metar.cloudLayers?.map((l) => ({ cover: l.cover, base: l.base })) ??
    metar.sky_condition?.map((l) => ({
      cover: l.sky_cover,
      base: l.cloud_base_ft_agl,
    })) ??
    [];

  // ceiling = BKN/OVC/VV の最下層
  const ceilingCovers = new Set(["BKN", "OVC", "VV"]);
  const ceilBases = layers
    .filter((l) => l.cover && ceilingCovers.has(String(l.cover).toUpperCase()))
    .map((l) => l.base)
    .filter((b): b is number => typeof b === "number")
    .sort((a, b) => a - b);

  return ceilBases.length ? ceilBases[0] : null;
}

function riskFromWx(params: {
  ceilingFt: number | null;
  visM: number | null;
  gustKt: number | null;
  windKt: number | null;
  wx: string | null;
}) {
  // ※ここは“運航判断”ではなく、あくまで汎用の注意喚起レベル（色分け）です
  let score = 0;
  const reasons: string[] = [];

  const { ceilingFt, visM, gustKt, windKt, wx } = params;

  if (ceilingFt !== null) {
    if (ceilingFt < 500) {
      score += 4;
      reasons.push(`Low ceiling: ${ceilingFt} ft`);
    } else if (ceilingFt < 1000) {
      score += 2;
      reasons.push(`Ceiling: ${ceilingFt} ft`);
    } else if (ceilingFt < 2000) {
      score += 1;
      reasons.push(`Ceiling: ${ceilingFt} ft`);
    }
  }

  if (visM !== null) {
    if (visM < 1600) {
      score += 4;
      reasons.push(`Low visibility: ${visM} m`);
    } else if (visM < 5000) {
      score += 2;
      reasons.push(`Visibility: ${visM} m`);
    } else if (visM < 8000) {
      score += 1;
      reasons.push(`Visibility: ${visM} m`);
    }
  }

  if (typeof gustKt === "number") {
    if (gustKt >= 35) {
      score += 3;
      reasons.push(`Strong gust: G${gustKt} kt`);
    } else if (gustKt >= 25) {
      score += 2;
      reasons.push(`Gust: G${gustKt} kt`);
    }
  }

  if (typeof windKt === "number") {
    if (windKt >= 30) {
      score += 2;
      reasons.push(`Strong wind: ${windKt} kt`);
    } else if (windKt >= 20) {
      score += 1;
      reasons.push(`Wind: ${windKt} kt`);
    }
  }

  if (wx) {
    const w = wx.toUpperCase();
    // ざっくり危険寄りワード
    const bad = ["TS", "SQ", "FZ", "GR", "GS", "+RA", "SN", "FG", "VA", "SS", "DS"];
    if (bad.some((k) => w.includes(k))) {
      score += 2;
      reasons.push(`Significant wx: ${wx}`);
    }
  }

  const level =
    score >= 7 ? "RED" : score >= 4 ? "AMBER" : score >= 1 ? "GREEN" : "GREEN";

  return { level, score, reasons };
}

async function fetchAviationWeatherJson<T>(url: string) {
  const { signal, done } = withTimeout(12000);
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        "User-Agent": "ari-safety-intelligence (vercel)",
        "Accept": "application/json",
      },
      // サーバ側キャッシュ（Vercel）
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`.slice(0, 300));
    }
    return (await res.json()) as T;
  } finally {
    done();
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const icaoRaw = searchParams.get("icao") || "";
    const icao = icaoRaw.trim().toUpperCase();

    if (!icao || icao.length !== 4) {
      return Response.json(
        { error: "ICAO code is required (4 letters).", example: "RJTT" },
        { status: 400 }
      );
    }

    // AviationWeather.gov (JSON)
    const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(
      icao
    )}&format=json`;
    const tafUrl = `https://aviationweather.gov/api/data/taf?ids=${encodeURIComponent(
      icao
    )}&format=json`;

    const [metarArr, tafArr] = await Promise.all([
      fetchAviationWeatherJson<MetarJson[]>(metarUrl).catch(() => [] as MetarJson[]),
      fetchAviationWeatherJson<TafJson[]>(tafUrl).catch(() => [] as TafJson[]),
    ]);

    const metar = metarArr[0] ?? null;
    const taf = tafArr[0] ?? null;

    if (!metar && !taf) {
      return Response.json(
        { icao, error: "No METAR/TAF returned for this station." },
        { status: 404 }
      );
    }

    const ceilingFt = metar ? getCeilingFt(metar) : null;
    const visM = metar ? milesToMeters(metar.visib) : null;
    const qnhHpa = metar ? inHgToHpa(metar.altim) : null;

    const analysis = riskFromWx({
      ceilingFt,
      visM,
      gustKt: metar?.wgst ?? null,
      windKt: metar?.wspd ?? null,
      wx: metar?.wxString ?? null,
    });

    return Response.json({
      status: "OK",
      icao,
      sources: {
        metar: "aviationweather.gov",
        taf: "aviationweather.gov",
      },
      metar: metar
        ? {
            raw: metar.rawOb ?? null,
            time: metar.obsTime ?? null,
            wind: {
              dir: metar.wdir ?? null,
              spd: metar.wspd ?? null,
              gst: metar.wgst ?? null,
            },
            visibility_m: visM,
            ceiling_ft: ceilingFt,
            temp_c: metar.temp ?? null,
            dewpoint_c: metar.dewp ?? null,
            qnh_hpa: qnhHpa,
            wx: metar.wxString ?? null,
            remarks: metar.remark ?? null,
          }
        : null,
      taf: taf
        ? {
            raw: (taf as any).rawTAF ?? null,
            issueTime: taf.issueTime ?? null,
            validFrom: taf.validTimeFrom ?? null,
            validTo: taf.validTimeTo ?? null,
          }
        : null,
      wx_analysis: analysis,
      time: new Date().toISOString(),
    });
  } catch (e: any) {
    return Response.json(
      { error: "fetch_failed", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

