"use client";

import React, { useEffect, useMemo, useState } from "react";

/* ===============================
   Types
================================ */

type WxLevel = "GREEN" | "AMBER" | "RED";

type WxResp = {
  status: "OK" | "NG";
  icao?: string;
  metar?: {
    raw?: string;
    wind?: string;
    visibility?: string;
    qnh?: string;
    clouds?: string[];
  };
  taf?: {
    raw?: string;
  };
  wx_analysis?: {
    level: WxLevel;
    reasons: string[];
  };
  time?: string;
  error?: string;
};

type WindParsed = {
  dirDeg: number | null;
  spdKt: number;
  gustKt?: number;
  isVrb?: boolean;
};

/* ===============================
   RWY MAG HDG DB
================================ */

const RWY_DB: Record<
  string,
  { name: string; runways: { id: string; mag: number }[] }
> = {
  RJCC: {
    name: "New Chitose",
    runways: [
      { id: "01L", mag: 013 },
      { id: "19R", mag: 193 },
      { id: "01R", mag: 013 },
      { id: "19L", mag: 193 },
    ],
  },
  RJNK: {
    name: "Komatsu",
    runways: [
      { id: "06", mag: 056 },
      { id: "24", mag: 236 },
    ],
  },
  RJTT: {
    name: "Tokyo Haneda",
    runways: [
      { id: "04", mag: 044 },
      { id: "22", mag: 224 },
      { id: "16L", mag: 164 },
      { id: "34R", mag: 344 },
    ],
  },
};

/* ===============================
   Utils
================================ */

function normIcao(s: string) {
  return s.trim().toUpperCase();
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/* ===============================
   WIND PARSER
================================ */

function parseWind(raw?: string): WindParsed | null {
  if (!raw) return null;
  const s = raw.toUpperCase();

  // VRB
  let m = s.match(/VRB(\d{2,3})(G(\d{2,3}))?KT/);
  if (m) {
    return {
      dirDeg: null,
      spdKt: Number(m[1]),
      gustKt: m[3] ? Number(m[3]) : undefined,
      isVrb: true,
    };
  }

  // dddssGggKT
  m = s.match(/(\d{3})(\d{2,3})(G(\d{2,3}))?KT/);
  if (!m) return null;

  return {
    dirDeg: Number(m[1]),
    spdKt: Number(m[2]),
    gustKt: m[4] ? Number(m[4]) : undefined,
  };
}

/* ===============================
   CEILING
================================ */

function getCeilingFt(clouds?: string[]) {
  if (!clouds) return null;

  const ceilings = clouds
    .filter((c) => c.startsWith("BKN") || c.startsWith("OVC"))
    .map((c) => Number(c.slice(3)) * 100)
    .filter(Boolean);

  if (ceilings.length === 0) return null;
  return Math.min(...ceilings);
}

/* ===============================
   CROSSWIND
================================ */

function computeCrosswind(
  wind: WindParsed,
  rwyMag: number
): { cross: number; head: number } {
  if (wind.dirDeg === null) {
    return { cross: wind.spdKt, head: 0 };
  }

  const diff = angleDiff(wind.dirDeg, rwyMag);
  const rad = (diff * Math.PI) / 180;

  return {
    cross: Math.abs(Math.sin(rad) * wind.spdKt),
    head: Math.cos(rad) * wind.spdKt,
  };
}

/* ===============================
   PAGE
================================ */

export default function Page() {
  const [icao, setIcao] = useState("RJCC");
  const [data, setData] = useState<WxResp | null>(null);
  const [loading, setLoading] = useState(false);

  async function getWeather() {
    try {
      setLoading(true);
      const key = normIcao(icao);
      const res = await fetch(`/api/weather?icao=${key}`);
      const json = (await res.json()) as WxResp;
      setData(json);
    } catch (e) {
      setData({ status: "NG", error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  const wind = useMemo(
    () => parseWind(data?.metar?.wind || data?.metar?.raw),
    [data]
  );

  const ceilingFt = useMemo(
    () => getCeilingFt(data?.metar?.clouds),
    [data]
  );

  const rwyList =
    RWY_DB[normIcao(icao)]?.runways ?? [];

  const crosswindResults = useMemo(() => {
    if (!wind) return [];

    return rwyList.map((rwy) => {
      const steady = computeCrosswind(wind, rwy.mag);
      const gust =
        wind.gustKt !== undefined
          ? computeCrosswind(
              { ...wind, spdKt: wind.gustKt },
              rwy.mag
            )
          : null;

      return {
        rwy: rwy.id,
        steady: steady.cross,
        gust: gust?.cross,
      };
    });
  }, [wind, rwyList]);

  /* ===============================
     LIMITS
  ============================== */

  const LIMIT_STEADY = 30;
  const LIMIT_GUST = 35;

  function rwyColor(v: number | undefined) {
    if (!v) return "#e5e7eb";
    if (v >= LIMIT_GUST) return "#fecaca";
    if (v >= LIMIT_STEADY) return "#fde68a";
    return "#bbf7d0";
  }

  return (
    <main style={{ padding: 28, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 28 }}>ARI UI Test</h1>

      <div style={{ marginTop: 16 }}>
        ICAO　
        <input
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          style={{ padding: 8, width: 120 }}
        />
        <button
          onClick={getWeather}
          style={{ marginLeft: 12, padding: "8px 16px" }}
        >
          {loading ? "Loading..." : "Get Weather"}
        </button>
      </div>

      {data && (
        <>
          <h3 style={{ marginTop: 24 }}>Key Summary</h3>

          <div>
            Wind: {data.metar?.wind ?? "—"}
            <br />
            Clouds: {data.metar?.clouds?.join(", ") ?? "—"}
            <br />
            Ceiling:{" "}
            {ceilingFt ? `${ceilingFt} ft` : "—"}
          </div>

          {ceilingFt !== null && ceilingFt < 3000 && (
            <div style={{ color: "orange", marginTop: 8 }}>
              ⚠ Ceiling present (&lt;3000ft)
            </div>
          )}

          <h3 style={{ marginTop: 28 }}>
            Crosswind (RWY)
          </h3>

          <div style={{ display: "flex", gap: 12 }}>
            {crosswindResults.map((r) => (
              <div
                key={r.rwy}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: rwyColor(r.gust),
                  minWidth: 140,
                }}
              >
                <b>RWY {r.rwy}</b>
                <br />
                Steady: {r.steady.toFixed(1)} kt
                <br />
                Gust:{" "}
                {r.gust !== undefined
                  ? `${r.gust.toFixed(1)} kt`
                  : "—"}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
