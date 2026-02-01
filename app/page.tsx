"use client";

import { useMemo, useState } from "react";
import TafTimeline from "./components/TafTimeline";

type WxJudgement = {
  level: "GREEN" | "AMBER" | "RED";
  reasons: string[];
  ceilingFt: number | null;
};

type WxMetar = {
  station_id: string;
  wind: string;
  visibility: string | null;
  altimeter: string | null;
  clouds: string[];
  raw_text: string;
};

type WxResponse =
  | {
      status: "OK";
      icao: string;
      metar: WxMetar;
      taf: string | null;
      wx_analysis: WxJudgement;
      time: string;
    }
  | {
      status?: "ERROR";
      error: string;
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
        cache: "no-store",
      });

      const json = (await res.json()) as WxResponse;
      setData(json);
    } catch {
      setData({ error: "Weather API error" });
    } finally {
      setLoading(false);
    }
  }

  const isOk = data && "status" in data && data.status === "OK";
  const reasons = useMemo(() => {
    if (!isOk) return [];
    return data.wx_analysis?.reasons ?? [];
  }, [isOk, data]);

  const level = useMemo(() => {
    if (!isOk) return "—";
    return data.wx_analysis?.level ?? "—";
  }, [isOk, data]);

  return (
    <main style={{ padding: 30, fontFamily: "sans-serif" }}>
      {/* ICAO INPUT */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div style={{ width: 70, fontWeight: 800 }}>ICAO</div>
        <input
          placeholder="RJTT / KJFK / ROAH"
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          style={{ padding: 10, width: 260 }}
        />
        <button
          onClick={getWeather}
          style={{ padding: "10px 14px", fontWeight: 700 }}
        >
          Get Weather
        </button>
      </div>

      {loading && <div>Loading…</div>}

      {!loading && !data && <div>—</div>}

      {!loading && data && !isOk && (
        <div style={{ color: "#b00" }}>
          Error: {"error" in data ? data.error : "Unknown error"}
        </div>
      )}

      {isOk && (
        <>
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
              <strong>Clouds:</strong>{" "}
              {(data.metar.clouds ?? []).join(", ") || "—"}
            </div>
          </div>

          <h2 style={{ marginTop: 30 }}>METAR / TAF</h2>

          <div style={{ display: "flex", gap: 20 }}>
            <pre
              style={{
                background: "#f6f6f6",
                padding: 12,
                width: "50%",
                whiteSpace: "pre-wrap",
              }}
            >
              {data.metar.raw_text}
            </pre>

            <pre
              style={{
                background: "#f6f6f6",
                padding: 12,
                width: "50%",
                whiteSpace: "pre-wrap",
              }}
            >
              {data.taf ?? "NO TAF"}
            </pre>
          </div>

          <h3 style={{ marginTop: 30 }}>
            判定理由（{level}）
          </h3>

          {reasons.length === 0 ? (
            <div>—</div>
          ) : (
            <ul>
              {reasons.map((r, i) => (
                <li key={`${i}-${r}`}>{r}</li>
              ))}
            </ul>
          )}

          <h2 style={{ marginTop: 40 }}>TAF Timeline</h2>
          <TafTimeline rawTaf={data.taf ?? ""} />
        </>
      )}
    </main>
  );
}
