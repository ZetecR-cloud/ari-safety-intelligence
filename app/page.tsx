"use client";

import { useState } from "react";

console.log("CLIENT JS ALIVE");

export default function Home() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const run = async () => {
    try {
      setErr(null);
      setData(null);
      const r = await fetch("/api/weather?icao=" + icao, { cache: "no-store" });
      const j = await r.json();
      setData(j);
    } catch (e) {
      setErr("unknown error");
    }
  };

  return (
    <main style={{ padding: 30, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={icao}
          onChange={(e) => setIcao(e.target.value)}
          style={{ padding: 10, width: 200 }}
        />
        <button onClick={run} style={{ padding: "10px 14px" }}>
          Get Weather
        </button>
      </div>

      {err && <pre style={{ color: "red" }}>{err}</pre>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </main>
  );
}
