"use client";

import React, { useMemo, useState } from "react";

type WeatherResponse = {
  status?: string;
  icao?: string;
  sources?: string[];
  metar?: any;
  taf?: any;
  wx_analysis?: { level?: string; reasons?: string[] };
  wxAnalysis?: { level?: string; reasons?: string[] };
  time?: string;
  [k: string]: any;
};

const DEFAULT_ICAO = "RJTT";

// まずは最小の内蔵候補（あとで airports.ts 連携に拡張できます）
const AIRPORT_PRESETS: Array<{ code: string; name: string; city?: string }> = [
  { code: "RJTT", name: "Tokyo Haneda", city: "Tokyo" },
  { code: "RJAA", name: "Narita", city: "Chiba" },
  { code: "RJBB", name: "Kansai", city: "Osaka" },
  { code: "RJCC", name: "New Chitose", city: "Sapporo" },
  { code: "ROAH", name: "Naha", city: "Okinawa" },
  { code: "RCTP", name: "Taoyuan", city: "Taipei" },
  { code: "RJNK", name: "Komatsu", city: "Ishikawa" },
  { code: "RJNT", name: "Toyama", city: "Toyama" },
];

function normalizeIcao(input: string) {
  return (input || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getWxLevel(data: WeatherResponse | null) {
  const lvl =
    data?.wx_analysis?.level ??
    data?.wxAnalysis?.level ??
    (typeof data?.["wxLevel"] === "string" ? data["wxLevel"] : undefined);
  return (lvl || "—").toString().toUpperCase();
}

function levelBadgeClass(level: string) {
  // Tailwind無しでも見栄えするように最低限の class（そのままでも動きます）
  // Tailwindが入ってるなら効きます。入ってなくても崩れません。
  if (level === "GREEN") return "bg-green-600";
  if (level === "AMBER" || level === "YELLOW") return "bg-yellow-500";
  if (level === "RED") return "bg-red-600";
  return "bg-gray-600";
}

export default function Page() {
  const [icaoInput, setIcaoInput] = useState<string>(DEFAULT_ICAO);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [data, setData] = useState<WeatherResponse | null>(null);

  const icao = useMemo(() => normalizeIcao(icaoInput), [icaoInput]);

  const suggestions = useMemo(() => {
    const q = normalizeIcao(icaoInput);
    if (!q) return AIRPORT_PRESETS.slice(0, 6);
    return AIRPORT_PRESETS.filter(
      (a) =>
        a.code.includes(q) ||
        a.name.toLowerCase().includes(q.toLowerCase()) ||
        (a.city || "").toLowerCase().includes(q.toLowerCase())
    ).slice(0, 8);
  }, [icaoInput]);

  async function fetchWeather() {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(icao)}`, {
        cache: "no-store",
      });

      const json = (await res.json()) as WeatherResponse;

      if (!res.ok) {
        setData(json);
        setErrorMsg(
          json?.message ||
            `API error: ${res.status} ${res.statusText}` ||
            "API error"
        );
        return;
      }

      setData(json);
    } catch (e: any) {
      setErrorMsg(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  const wxLevel = getWxLevel(data);

  return (
    <main style={{ maxWidth: 1100, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 44, fontWeight: 800, margin: "8px 0 4px" }}>
        ARI Safety Intelligence
      </h1>
      <div style={{ color: "#444", marginBottom: 18 }}>
        ICAO入力 → METAR/TAF取得 → WX解析（注意喚起レベル）
      </div>

      <section
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 360, flex: "1 1 360px" }}>
          <div style={{ fontSize: 12, color: "#444", marginBottom: 6 }}>
            ICAO / IATA / Name
          </div>

          <input
            value={icaoInput}
            onChange={(e) => setIcaoInput(e.target.value)}
            placeholder="RJTT"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #222",
              background: "#111",
              color: "#fff",
              outline: "none",
              fontSize: 16,
            }}
          />

          {/* Suggestion box */}
          <div
            style={{
              marginTop: 10,
              borderRadius: 14,
              border: "1px solid #222",
              background: "#111",
              color: "#fff",
              overflow: "hidden",
              maxWidth: 520,
            }}
          >
            {suggestions.map((a) => (
              <button
                key={a.code}
                onClick={() => setIcaoInput(a.code)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "transparent",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {a.code} — {a.name}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>{a.city || ""}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={fetchWeather}
          disabled={loading || !icao}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #222",
            background: loading ? "#333" : "#111",
            color: "#fff",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            height: 46,
          }}
        >
          {loading ? "Loading..." : "Get Weather"}
        </button>
      </section>

      {/* Header row */}
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          borderRadius: 14,
          border: "1px solid #222",
          background: "#111",
          color: "#fff",
          padding: "14px 16px",
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 800 }}>
          {(data?.icao || icao || "----") +
            (data?.metar?.raw ? ` — ${data?.metar?.raw?.slice(0, 0)}` : "")}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}>WX Level</div>
          <div
            className={levelBadgeClass(wxLevel)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              color: "#fff",
              fontWeight: 900,
              border: "1px solid #222",
              background:
                wxLevel === "GREEN"
                  ? "#16a34a"
                  : wxLevel === "AMBER" || wxLevel === "YELLOW"
                  ? "#eab308"
                  : wxLevel === "RED"
                  ? "#dc2626"
                  : "#6b7280",
            }}
          >
            {wxLevel}
          </div>
        </div>
      </section>

      {/* Result box */}
      <section
        style={{
          borderRadius: 14,
          border: "1px solid #222",
          background: "#111",
          color: "#9ef2a6",
          padding: 16,
          marginBottom: 14,
          overflowX: "auto",
        }}
      >
        {errorMsg ? (
          <div style={{ color: "#ff6b6b", fontWeight: 800, marginBottom: 10 }}>
            {errorMsg}
          </div>
        ) : null}

        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(data ?? { status: "idle" }, null, 2)}
        </pre>
      </section>

      <div style={{ fontSize: 12, color: "#666" }}>
        ※ “WX Level” は汎用の注意喚起（デモ）。運航可否判断そのものではありません。
      </div>
    </main>
  );
}
