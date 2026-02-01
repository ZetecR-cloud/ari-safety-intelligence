"use client";

import { useState } from "react";
import TafTimeline from "./components/TafTimeline";

/* ===============================
   ICAO CEILING RULE
================================ */

function extractCeilingFt(clouds?: string[]) {
  if (!clouds || clouds.length === 0) return null;

  let ceiling: number | null = null;

  for (const c of clouds) {
    const m = c.match(/^(BKN|OVC|VV)(\d{3})/);
    if (!m) continue;

    const ft = parseInt(m[2], 10) * 100;
    if (ceiling === null || ft < ceiling) ceiling = ft;
  }

  return ceiling;
}

export default function Page() {
  const [icao, setIcao] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function getWeather() {
    if (!icao || loading) return;

    setLoading(true);

    const res = await fetch(`/api/weather?icao=${icao}`);
    const json = await res.json();

    // 🔥 サーバ由来 reasons を完全無効化
    if (json?.wx_analysis?.reasons) {
      json.wx_analysis.reasons = [];
    }

    setData(json);
    setLoading(false);
  }

  /* ===============================
     DERIVED
  ================================ */

  const clouds = data?.metar?.clouds ?? [];
  const ceilingFt = extractCeilingFt(clouds);

  const reasons: string[] = [];

  if (ceilingFt !== null && ceilingFt < 3000) {
    reasons.push(`Ceiling present (<3000ft): ${ceilingFt}ft`);
  }

  /* ===============================
     UI
  ================================ */

  return (
    <main style={{ padding: 30, fontFamily: "sans-serif" }}>
      <h1>ARI5 Weather</h1>

      <div style={{ marginBottom: 20 }}>
        <input
          placeholder="ICAO"
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          style={{ padding: 8 }}
        />

        <button
          onClick={getWeather}
          style={{ marginLeft: 10, padding: "8px 16px" }}
        >
          {loading ? "Loading..." : "Get Weather"}
        </button>
      </div>

      {data && (
        <>
          <h3>METAR</h3>
          <div>Station: {data.metar.station_id}</div>
          <div>Clouds: {clouds.join(", ")}</div>

          <h3 style={{ marginTop: 20 }}>判定理由（AMBER）</h3>

          {reasons.length === 0 ? (
            <div>—</div>
          ) : (
            <ul>
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}

          <h2 style={{ marginTop: 30 }}>TAF Timeline</h2>

          <TafTimeline rawTaf={data?.taf?.raw_text ?? ""} />
        </>
      )}
    </main>
  );
}
