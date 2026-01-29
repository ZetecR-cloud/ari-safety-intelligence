// app/page.tsx
"use client";

import { useMemo, useState } from "react";
import { AIRPORTS, type Airport } from "./airports";

type ApiResp = any;

export default function Home() {
  const [q, setQ] = useState("RJTT");
  const [picked, setPicked] = useState<Airport | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const query = q.trim().toUpperCase();

  const suggestions = useMemo(() => {
    if (!query) return [];
    const s = AIRPORTS.filter((a) => {
      const hay = `${a.icao} ${a.iata ?? ""} ${a.name} ${a.city}`.toUpperCase();
      return hay.includes(query);
    }).slice(0, 10);
    return s;
  }, [query]);

  function pick(a: Airport) {
    setPicked(a);
    setQ(a.icao);
    setData(null);
    setErr(null);
  }

  async function run() {
    setLoading(true);
    setErr(null);
    setData(null);

    const icao = (picked?.icao ?? query).toUpperCase();

    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(icao)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.detail || `HTTP ${res.status}`);
      setData(json);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const level = data?.wx_analysis?.level as string | undefined;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ margin: 0 }}>ARI Safety Intelligence</h1>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        ICAO入力 → METAR/TAF取得 → WX解析（注意喚起レベル）
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
        <div style={{ position: "relative", width: 360, maxWidth: "90vw" }}>
          <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>ICAO / IATA / Name</label>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPicked(null);
            }}
            placeholder="e.g. RJTT, RJAA, HND, NRT"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 16,
              borderRadius: 10,
              border: "1px solid #333",
              background: "#111",
              color: "#fff",
              outline: "none",
            }}
          />

          {suggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: 68,
                left: 0,
                right: 0,
                border: "1px solid #333",
                borderRadius: 10,
                background: "#0b0b0b",
                overflow: "hidden",
                zIndex: 10,
              }}
            >
              {suggestions.map((a) => (
                <button
                  key={a.icao}
                  onClick={() => pick(a)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    background: "transparent",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    borderBottom: "1px solid #222",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {a.icao} {a.iata ? `(${a.iata})` : ""} — {a.name}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{a.city}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={run}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: loading ? "#222" : "#1a1a1a",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            height: 44,
            marginTop: 18,
          }}
        >
          {loading ? "Fetching..." : "Get Weather"}
        </button>
      </div>

      {picked && (
        <p style={{ marginTop: 10, opacity: 0.9 }}>
          Selected: <b>{picked.icao}</b> {picked.iata ? `(${picked.iata})` : ""} — {picked.name}
        </p>
      )}

      {err && (
        <div style={{ marginTop: 18, padding: 14, border: "1px solid #661", borderRadius: 12 }}>
          <b style={{ color: "#ffcc66" }}>Error:</b> {err}
        </div>
      )}

      {data && (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid #333",
              background: "#0f0f0f",
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>ICAO</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.icao}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>WX Level</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {level ?? "N/A"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Reasons</div>
                <div style={{ fontSize: 14 }}>
                  {(data?.wx_analysis?.reasons ?? []).length
                    ? (data.wx_analysis.reasons as string[]).join(" / ")
                    : "—"}
                </div>
              </div>
            </div>
          </div>

          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              padding: 14,
              borderRadius: 12,
              border: "1px solid #333",
              background: "#0b0b0b",
              color: "#d6ffd6",
              fontSize: 13,
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}

      <p style={{ marginTop: 18, opacity: 0.6, fontSize: 12 }}>
        ※ “WX Level” は汎用の注意喚起（デモ）。運航可否判断そのものではありません。
      </p>
    </main>
  );
}
