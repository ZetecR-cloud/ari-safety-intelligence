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

  if (typeof gustKt === "number"
