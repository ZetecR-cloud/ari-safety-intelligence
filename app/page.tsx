"use client";

import React, { useEffect, useMemo, useState } from "react";

/* =========================================================
   TYPES
========================================================= */

type WxLevel = "GREEN" | "AMBER" | "RED";

type WxResp = {
  status: "OK" | "NG";
  metar?: {
    raw: string;
    wind?: string;
    visibility?: string;
    qnh?: string;
    clouds?: string[];
    wx?: string;
  };
  taf?: {
    raw: string;
  };
  wx_analysis?: {
    level: WxLevel;
    reasons: string[];
  };
  time?: string;
  error?: string;
};

/* =========================================================
   RUNWAY MAG HDG DATABASE
========================================================= */

const RWY_DB: Record<
  string,
  {
    name: string;
    runways: { id: string; magDeg: number }[];
  }
> = {
  RJTT: {
    name: "Tokyo Haneda",
    runways: [
      { id: "04", magDeg: 44 },
      { id: "05", magDeg: 53 },
      { id: "16L", magDeg: 164 },
      { id: "16R", magDeg: 164 },
      { id: "22", magDeg: 224 },
      { id: "23", magDeg: 233 },
      { id: "34", magDeg: 344 },
    ],
  },

  RJCC: {
    name: "New Chitose",
    runways: [
      { id: "01", magDeg: 13 },
      { id: "19", magDeg: 193 },
    ],
  },

  RJNK: {
    name: "Komatsu",
    runways: [
      { id: "06", magDeg: 56 },
      { id: "24", magDeg: 236 },
    ],
  },

  PHNL: {
    name: "Honolulu",
    runways: [
      { id: "04L", magDeg: 40 },
      { id: "04R", magDeg: 40 },
      { id: "08L", magDeg: 80 },
      { id: "08R", magDeg: 80 },
      { id: "22L", magDeg: 220 },
      { id: "22R", magDeg: 220 },
      { id: "26L", magDeg: 260 },
      { id: "26R", magDeg: 260 },
    ],
  },
};

/* =========================================================
   UTILS
========================================================= */

function normICAO(s: string) {
  return (s || "").trim().toUpperCase();
}

function parseWind(raw?: string) {
  if (!raw) return null;
  const s = raw.toUpperCase();

  const vrb = s.match(/VRB(\d{2,3})(G(\d{2,3}))?KT/);
  if (vrb) {
    return {
      dir: null,
      spd: Number(vrb[1]),
      gst: vrb[3] ? Number(vrb[3]) : undefined,
    };
  }

  const m = s.match(/(\d{3})(\d{2,3})(G(\d{2,3}))?KT/);
  if (!m) return null;

  return {
    dir: Number(m[1]),
    spd: Number(m[2]),
    gst: m[4] ? Number(m[4]) : undefined,
  };
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function crosswind(windDir: number, windSpd: number, rwy: number) {
  const diff = angleDiff(windDir, rwy);
  const rad = (diff * Math.PI) / 180;
  return Math.round(Math.abs(Math.sin(rad) * windSpd));
}

/* =========================================================
   PAGE
========================================================= */

export default function Page() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<WxResp | null>(null);
  const [loading, setLoading] = useState(false);

  async function getWeather() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/weather?icao=${encodeURIComponent(normICAO(icao))}`
      );
      const json = (await res.json()) as WxResp;
      setData(json);
    } catch (e: any) {
      setData({ status: "NG", error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  const wind = useMemo(() => {
    if (!data?.metar) return null;
    return parseWind(data.metar.wind || data.metar.raw);
  }, [data]);

  const rwyList =
    RWY_DB[normICAO(icao)]?.runways ?? [];

  return (
    <main style={{ padding: 28, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        ARI UI Test
      </h1>

      <p>ICAO → METAR / TAF → WX / Crosswind</p>

      <div style={{ marginTop: 20 }}>
        <input
          value={icao}
          onChange={(e) =>
            setIcao(e.target.value.toUpperCase())
          }
          style={{
            padding: 10,
            fontSize: 16,
            width: 140,
            marginRight: 10,
          }}
        />
        <button
          onClick={getWeather}
          style={{
            padding: "10px 18px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          {loading ? "Loading..." : "Get Weather"}
        </button>
      </div>

      {data?.metar && (
        <>
          <h2 style={{ marginTop: 30 }}>
            Key Summary
          </h2>

          <pre
            style={{
              background: "#111",
              color: "#0f0",
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
{`Station: ${normICAO(icao)}
Wind: ${data.metar.wind || "-"}
Visibility: ${data.metar.visibility || "-"}
QNH: ${data.metar.qnh || "-"}
Clouds: ${data.metar.clouds?.join(", ") || "-"}
WX: ${data.metar.wx || "-"}`}
          </pre>

          <h2 style={{ marginTop: 30 }}>
            Crosswind
          </h2>

          {wind && wind.dir !== null ? (
            rwyList.map((r) => (
              <div key={r.id}>
                RWY {r.id} →{" "}
                {crosswind(
                  wind.dir!,
                  wind.spd,
                  r.magDeg
                )}
                kt crosswind
                {wind.gst && (
                  <> (gust {wind.gst}kt)</>
                )}
              </div>
            ))
          ) : (
            <div>Wind variable / calm</div>
          )}

          <h2 style={{ marginTop: 30 }}>
            RAW
          </h2>

          <pre>{data.metar.raw}</pre>

          {data.taf && (
            <>
              <h3>TAF</h3>
              <pre>{data.taf.raw}</pre>
            </>
          )}
        </>
      )}
    </main>
  );
}
