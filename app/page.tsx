"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [alive, setAlive] = useState("BOOTING");
  const [icao, setIcao] = useState("RJTT");
  const [dataText, setDataText] = useState<string>("");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    setAlive("ALIVE");
  }, []);

  const run = async () => {
    try {
      setErr("");
      setDataText("");
      const url = `/api/weather?icao=${encodeURIComponent(icao)}&_=${Date.now()}`;
      const r = await fetch(url, {
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });
      const t = await r.text();
      setDataText(`HTTP ${r.status}\n\n${t}`);
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : "unknown error");
    }
  };

  return (
    <main style={{ padding: 30, fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 10, fontWeight: 800 }}>
        Client: {alive}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <div style={{ width: 60, fontWeight: 800 }}>ICAO</div>
        <input
          value={icao}
          onChange={(e) => setIcao(e.target.value)}
          style={{ padding: 10, width: 260 }}
        />
        <button onClick={run} style={{ padding: "10px 14px", fontWeight: 800 }}>
          Get Weather
        </button>
      </div>

      {err ? (
        <pre style={{ color: "rgb(187,0,0)", whiteSpace: "pre-wrap" }}>Error: {err}</pre>
      ) : null}

      {dataText ? (
        <pre style={{ whiteSpace: "pre-wrap" }}>{dataText}</pre>
      ) : (
        <div>—</div>
      )}
    </main>
  );
}
