"use client";

import { useState } from "react";

export default function Page() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function fetchWx() {
    setLoading(true);
    try {
      const res = await fetch(`/api/weather?icao=${icao}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        ARI Safety Intelligence
      </h1>

      <p>ICAO → METAR / TAF → WX Analysis</p>

      <div style={{ marginTop: 20 }}>
        <input
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          style={{
            padding: 10,
            fontSize: 16,
            width: 140,
            marginRight: 10,
          }}
        />

        <button
          onClick={fetchWx}
          style={{
            padding: "10px 16px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          {loading ? "Loading..." : "Get Weather"}
        </button>
      </div>

      {data && (
        <pre
          style={{
            marginTop: 20,
            background: "#111",
            color: "#0f0",
            padding: 16,
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </main>
  );
}
