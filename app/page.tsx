"use client";

import { useState } from "react";
import TafTimeline from "./components/TafTimeline";

type WxResponse = {
  metar: {
    station_id: string;
    wind: string;
    visibility: string | null;
    altimeter: string | null;
    clouds: string[];
    raw_text: string;
  };
  taf: string | null;
  wx_analysis: {
    level: "GREEN" | "AMBER" | "RED";
    reasons: string[];
    ceilingFt: number | null;
  };
  time: string;
};

export default function Page() {
  const [icao, setIcao] = useState("");
  const [data, setData] = useState<WxResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function getWeather() {
    const code = icao.trim().toUpperCase();
    if (!code) return;

    setLoading(true);
    setData(null);

    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(code)}`, {
        cache: "no-store"
      });

      const json = await res.json();
      setData(json);
    } catch {
      alert("Weather API error");
    } finally {
      setLoading(false);
    }
  }

  const reasons = data?.wx_analysis?.reasons ?? [];

  return (
    <main style={{ padding: 30, fontFamily: "sans-serif" }}>
      {/* ICAO INPUT */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <div style={{ width: 60, fontWeight: 800 }}>ICAO</div>
        <input
          placeholder="RJTT / KJFK / ROAH"
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          style={{ padding: 10, width: 260 }}
        />
        <button onClick={getWeather} style={{ padding: "10px 14px", fontWeight: 700 }}>
          Get Weather
        </button>
      </div>

      {loading && <div>Loading…</div>}
      {!loading && !data && <div>—</div>}

      {data?.metar?.station_id && (
        <>
          {/* KEY SUMMARY */}
          <h2>Key Summary</h2>

          <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            <div>
              <strong>Station:</strong> {data.metar.station_id}
            </div>
            <div>
              <strong>Wind:</strong> {data.metar.wind}
            </div>
            <div>
              <strong>Visibility:</strong> {data.metar.visibility ?? "—"}
            </div>
            <div>
              <strong>QNH(hPa):</strong> {data.metar.altimeter ?? "—"}
            </div>
            <div>
              <strong>Clouds:</strong> {(data.metar.clouds ?? []).join(", ") || "—"}
            </div>
          </div>

          {/* RAW TEXT */}
          <h2 style={{ marginTop: 30 }}>METAR / TAF</h2>

          <div style={{ display: "flex", gap: 20 }}>
            <pre style={{ background: "#f6f6f6", padding: 12, width: "50%", whiteSpace: "pre-wrap" }}>
              {data.metar.raw_text}
            </pre>

            <pre style={{ background: "#f6f6f6", padding: 12, width: "50%", whiteSpace: "pre-wrap" }}>
              {data.taf ?? "NO TAF"}
            </pre>
          </div>

          {/* REASONS */}
          <h3 style={{ marginTop: 30 }}>
            判定理由（{data.wx_analysis?.level ?? "—"}）
          </h3>

          {reasons.length === 0 ? (
            <div>—</div>
          ) : (
            <ul>
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}

          {/* TAF TIMELINE */}
          <h2 style={{ marginTop: 40 }}>TAF Timeline</h2>
          <TafTimeline rawTaf={data.taf ?? ""} />
        </>
      )}
    </main>
  );
}
