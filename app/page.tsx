"use client";

import { useState } from "react";
import TafTimeline from "./components/TafTimeline";
import { airports } from "./airports";

export default function Home() {
  const [icao, setIcao] = useState("RJTT");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  async function fetchWeather() {
    setLoading(true);
    setData(null);

    try {
      const res = await fetch(`/api/weather?icao=${icao}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      alert("WX fetch failed");
    }

    setLoading(false);
  }

  const airport =
    airports.find(
      (a) =>
        a.icao.toUpperCase() === icao.toUpperCase() ||
        a.iata?.toUpperCase() === icao.toUpperCase()
    ) ?? null;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700 }}>
        ARI Safety Intelligence
      </h1>

      <p style={{ opacity: 0.7, marginBottom: 24 }}>
        ICAO入力 → METAR / TAF → WX安全解析（参考情報）
      </p>

      {/* INPUT */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <input
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          placeholder="RJTT / HND"
          style={{
            padding: 12,
            fontSize: 18,
            width: 260,
            borderRadius: 8,
            border: "1px solid #444",
            background: "#000",
            color: "#fff",
          }}
        />

        <button
          onClick={fetchWeather}
          disabled={loading}
          style={{
            padding: "12px 20px",
            fontSize: 16,
            borderRadius: 8,
            background: "#111",
            color: "#fff",
            border: "1px solid #444",
            cursor: "pointer",
          }}
        >
          {loading ? "Loading..." : "Get Weather"}
        </button>
      </div>

      {/* AIRPORT */}
      {airport && (
        <div
          style={{
            background: "#111",
            borderRadius: 10,
            padding: 14,
            marginBottom: 20,
            border: "1px solid #333",
          }}
        >
          <strong>
            {airport.icao} ({airport.iata}) — {airport.name}
          </strong>
          <div style={{ opacity: 0.7 }}>{airport.city}</div>
        </div>
      )}

      {/* RESULT */}
      {data && (
        <>
          {/* WX LEVEL */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              marginBottom: 20,
              background:
                data.wx_analysis?.wx_level === "RED"
                  ? "#3a0000"
                  : data.wx_analysis?.wx_level === "AMBER"
                  ? "#3a2a00"
                  : "#002a14",
              border: "1px solid #444",
            }}
          >
            <strong>WX LEVEL：</strong>{" "}
            {data.wx_analysis?.wx_level ?? "N/A"}
          </div>

          {/* TAF TIMELINE */}
          <h2 style={{ marginTop: 30, marginBottom: 12 }}>
            TAF Timeline（UTC）
          </h2>

          <TafTimeline
            blocks={data.wx_analysis?.tafRisk?.blocks ?? []}
            nowZ={data.time}
          />

          {/* RAW */}
          <details style={{ marginTop: 30 }}>
            <summary style={{ cursor: "pointer" }}>
              Raw JSON（debug）
            </summary>
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                background: "#000",
                color: "#0f0",
                fontSize: 12,
                overflowX: "auto",
              }}
            >
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
