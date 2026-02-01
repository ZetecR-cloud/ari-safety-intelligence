"use client";

import React, { useMemo, useState } from "react";

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
  taf?: { raw: string };
  wx_analysis?: { level: WxLevel; reasons: string[] };
  time?: string;
  error?: string;
};

/* =========================================================
   RUNWAY MAG HDG DATABASE
========================================================= */

const RWY_DB: Record<
  string,
  { name: string; runways: { id: string; magDeg: number }[] }
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
  RJCC: { name: "New Chitose", runways: [{ id: "01", magDeg: 13 }, { id: "19", magDeg: 193 }] },
  RJNK: { name: "Komatsu", runways: [{ id: "06", magDeg: 56 }, { id: "24", magDeg: 236 }] },
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

  // VRB03KT or VRB03G15KT
  const vrb = s.match(/VRB(\d{2,3})(G(\d{2,3}))?KT/);
  if (vrb) {
    return { dir: null as number | null, spd: Number(vrb[1]), gst: vrb[3] ? Number(vrb[3]) : undefined };
  }

  // 09003KT / 22010G20KT
  const m = s.match(/(\d{3})(\d{2,3})(G(\d{2,3}))?KT/);
  if (!m) return null;

  return { dir: Number(m[1]), spd: Number(m[2]), gst: m[4] ? Number(m[4]) : undefined };
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

function cardStyle(level: WxLevel): React.CSSProperties {
  // 軽い色付け（RWYごとの結果を見やすく）
  if (level === "RED") return { border: "1px solid #f5a3a3", background: "#fff5f5" };
  if (level === "AMBER") return { border: "1px solid #f3d19c", background: "#fffaf1" };
  return { border: "1px solid #b7e4c7", background: "#f3fff7" };
}

/* =========================================================
   PAGE
========================================================= */

export default function Page() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<WxResp | null>(null);
  const [loading, setLoading] = useState(false);

  // ✅ Crosswind limit（ユーザー入力）
  const [limitSteady, setLimitSteady] = useState<number>(30);
  const [limitGust, setLimitGust] = useState<number>(35);

  async function getWeather() {
    setLoading(true);
    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(normICAO(icao))}`);
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

  const rwyList = useMemo(() => RWY_DB[normICAO(icao)]?.runways ?? [], [icao]);

  const crossRows = useMemo(() => {
    if (!wind) return [];
    if (wind.dir === null) {
      // VRB → 成分計算はできないので “UNK”
      return rwyList.map((r) => ({
        rwy: r.id,
        mag: r.magDeg,
        steady: null as number | null,
        gust: null as number | null,
        level: "AMBER" as WxLevel,
        reason: "VRB wind (direction unknown)",
      }));
    }

    return rwyList.map((r) => {
      const steady = crosswind(wind.dir!, wind.spd, r.magDeg);
      const gust = wind.gst ? crosswind(wind.dir!, wind.gst, r.magDeg) : null;

      // ✅ 判定ルール（シンプル）
      // - gustがあって gustCross > gustLimit → RED
      // - steadyCross > steadyLimit → AMBER
      // - それ以外 → GREEN
      let level: WxLevel = "GREEN";
      const reasons: string[] = [];

      if (gust !== null && gust > limitGust) {
        level = "RED";
        reasons.push(`Gust crosswind ${gust}kt > limit ${limitGust}kt`);
      } else if (steady > limitSteady) {
        level = "AMBER";
        reasons.push(`Steady crosswind ${steady}kt > limit ${limitSteady}kt`);
      } else {
        reasons.push("Within limits");
      }

      return {
        rwy: r.id,
        mag: r.magDeg,
        steady,
        gust,
        level,
        reason: reasons.join(" / "),
      };
    });
  }, [wind, rwyList, limitSteady, limitGust]);

  return (
    <main style={{ padding: 28, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>ARI UI Test</h1>
      <p>ICAO → METAR / TAF → WX / Crosswind</p>

      <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>ICAO</div>
          <input
            value={icao}
            onChange={(e) => setIcao(e.target.value.toUpperCase())}
            style={{ padding: 10, fontSize: 16, width: 140 }}
          />
        </div>

        <button
          onClick={getWeather}
          style={{ padding: "10px 18px", fontSize: 16, cursor: "pointer" }}
        >
          {loading ? "Loading..." : "Get Weather"}
        </button>

        {/* ✅ Crosswind limits */}
        <div style={{ marginLeft: 10, display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Limit (steady kt)</div>
            <input
              type="number"
              value={limitSteady}
              onChange={(e) => setLimitSteady(Number(e.target.value || 0))}
              style={{ padding: 10, fontSize: 16, width: 120 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Limit (gust kt)</div>
            <input
              type="number"
              value={limitGust}
              onChange={(e) => setLimitGust(Number(e.target.value || 0))}
              style={{ padding: 10, fontSize: 16, width: 120 }}
            />
          </div>
        </div>
      </div>

      {data?.error && (
        <div style={{ marginTop: 12, color: "#b00020" }}>
          Error: {data.error}
        </div>
      )}

      {data?.metar && (
        <>
          <h2 style={{ marginTop: 28 }}>Key Summary</h2>

          <pre
            style={{
              background: "#111",
              color: "#0f0",
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
              overflowX: "auto",
            }}
          >
{`Station: ${normICAO(icao)}
Wind: ${data.metar.wind || "-"}
Visibility: ${data.metar.visibility || "-"}
QNH: ${data.metar.qnh || "-"}
Clouds: ${data.metar.clouds?.join(", ") || "-"}
WX: ${data.metar.wx || "-"}
Updated: ${data.time || "-"}`}
          </pre>

          <h2 style={{ marginTop: 28 }}>Crosswind (RWY)</h2>

          {!wind ? (
            <div>Wind not available</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              {crossRows.map((row) => (
                <div key={row.rwy} style={{ ...cardStyle(row.level), borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>RWY {row.rwy}</div>
                    <div style={{ fontWeight: 800 }}>{row.level}</div>
                  </div>

                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                    MAG {row.mag}°
                  </div>

                  <div style={{ marginTop: 10, fontSize: 14 }}>
                    <div>
                      Steady crosswind:{" "}
                      <b>{row.steady === null ? "—" : `${row.steady} kt`}</b>{" "}
                      <span style={{ opacity: 0.7 }}>(limit {limitSteady})</span>
                    </div>

                    <div>
                      Gust crosswind:{" "}
                      <b>{row.gust === null ? "—" : `${row.gust} kt`}</b>{" "}
                      <span style={{ opacity: 0.7 }}>(limit {limitGust})</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                    {row.reason}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 28 }}>RAW</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
            <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>METAR</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{data.metar.raw}</pre>
            </div>

            {data.taf && (
              <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>TAF</div>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{data.taf.raw}</pre>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
