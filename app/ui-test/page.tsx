"use client";

import { useMemo, useState } from "react";

type WxLevel = "GREEN" | "AMBER" | "RED" | "UNKNOWN";

type WxResponse = {
  status?: string;
  icao?: string;
  sources?: string[];
  metar?: {
    raw?: string;
    wind?: string;
    visibility?: string;
    qnh?: string;
    clouds?: string[];
    [k: string]: any;
  };
  taf?: string;
  wx_analysis?: {
    level?: WxLevel;
    reasons?: string[];
    [k: string]: any;
  };
  time?: string;
  [k: string]: any;
};

function safeUpper(s: string) {
  return (s ?? "").trim().toUpperCase();
}

function normalizeLevel(lv?: string): WxLevel {
  const x = (lv ?? "").toUpperCase();
  if (x === "GREEN" || x === "AMBER" || x === "RED") return x;
  return "UNKNOWN";
}

function levelCopy(level: WxLevel) {
  switch (level) {
    case "GREEN":
      return { label: "GREEN", desc: "通常運航可（監視継続）" };
    case "AMBER":
      return { label: "AMBER", desc: "注意（条件確認・要監視）" };
    case "RED":
      return { label: "RED", desc: "要判断（PIC/Dispatch Review）" };
    default:
      return { label: "UNKNOWN", desc: "判定情報が不足しています" };
  }
}

export default function UiTest() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<WxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const level: WxLevel = useMemo(
    () => normalizeLevel(data?.wx_analysis?.level),
    [data]
  );
  const lv = levelCopy(level);

  const metarRaw = data?.metar?.raw ?? "—";
  const tafRaw = data?.taf ?? "—";

  const station = data?.icao ?? "—";
  const wind = data?.metar?.wind ?? "—";
  const vis = data?.metar?.visibility ?? "—";
  const qnh = data?.metar?.qnh ?? "—";
  const clouds = data?.metar?.clouds?.length ? data.metar.clouds.join(", ") : "—";
  const updated = data?.time ?? "—";
  const reasons = data?.wx_analysis?.reasons ?? [];

  async function go() {
    const q = safeUpper(icao);
    if (!q) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as WxResponse;
      setData(json);
    } catch (e: any) {
      setErr(e?.message ?? "Fetch failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f6f7f8;
          color: #111;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
            Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        }
        .wrap {
          max-width: 1080px;
          margin: 0 auto;
          padding: 20px 16px 40px;
        }
        .header {
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 14px;
          padding: 18px 16px;
        }
        .title {
          font-size: 28px;
          font-weight: 800;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .subtitle {
          margin-top: 6px;
          font-size: 13px;
          color: #555;
        }
        .toprow {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 800;
          border: 1px solid #e6e6e6;
        }
        .badge small {
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }
        .green {
          background: #0f5132;
          color: #d1e7dd;
          border-color: #b7dfc6;
        }
        .amber {
          background: #b45309;
          color: #fffbeb;
          border-color: #f5d090;
        }
        .red {
          background: #991b1b;
          color: #fee2e2;
          border-color: #fecaca;
        }
        .unknown {
          background: #3f3f46;
          color: #f4f4f5;
          border-color: #d4d4d8;
        }

        .controls {
          margin-top: 14px;
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 14px;
          padding: 14px;
        }
        .row {
          display: flex;
          gap: 10px;
          align-items: end;
          flex-wrap: wrap;
        }
        label {
          font-size: 12px;
          font-weight: 700;
          color: #444;
          display: block;
        }
        input {
          margin-top: 6px;
          border: 1px solid #d4d4d8;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 16px;
          width: 220px;
          outline: none;
          background: #fff;
        }
        input:focus {
          border-color: #a1a1aa;
          box-shadow: 0 0 0 4px rgba(161, 161, 170, 0.2);
        }
        .hint {
          margin-top: 6px;
          font-size: 12px;
          color: #666;
        }
        .btn {
          border: 1px solid #e6e6e6;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 800;
          cursor: pointer;
          background: #111;
          color: #fff;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn2 {
          border: 1px solid #e6e6e6;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 800;
          cursor: pointer;
          background: #fff;
          color: #111;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-top: 14px;
        }
        @media (min-width: 900px) {
          .grid {
            grid-template-columns: 360px 1fr;
          }
        }

        .card {
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 14px;
          padding: 14px;
        }
        .card h2 {
          margin: 0;
          font-size: 14px;
          font-weight: 900;
        }
        .small {
          font-size: 12px;
          color: #666;
        }

        .kgrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        .k {
          background: #f8fafc;
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          padding: 10px;
        }
        .k .lab {
          font-size: 11px;
          color: #666;
          font-weight: 800;
        }
        .k .val {
          margin-top: 4px;
          font-size: 16px;
          font-weight: 900;
        }

        .twocol {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        @media (min-width: 900px) {
          .twocol {
            grid-template-columns: 1fr 1fr;
          }
        }
        pre {
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
          font-size: 12px;
          line-height: 1.45;
        }
        .prebox {
          background: #f8fafc;
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          padding: 10px;
        }

        .rawjson {
          margin-top: 10px;
          background: #0b1220;
          color: #6ef08f;
          border: 1px solid #1f2937;
          border-radius: 12px;
          padding: 10px;
          max-height: 420px;
          overflow: auto;
        }

        .error {
          margin-top: 12px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #7f1d1d;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 700;
        }
        .footer {
          margin-top: 14px;
          font-size: 12px;
          color: #666;
        }
      `}</style>

      <div className="wrap">
        {/* Header */}
        <div className="header">
          <h1 className="title">ARI UI Test</h1>
          <div className="subtitle">ICAO入力 → METAR/TAF取得 → WX注意喚起（UI先行）</div>

          <div className="toprow">
            <div
              className={
                "badge " +
                (level === "GREEN"
                  ? "green"
                  : level === "AMBER"
                  ? "amber"
                  : level === "RED"
                  ? "red"
                  : "unknown")
              }
              aria-label={`WX LEVEL ${lv.label}`}
            >
              WX LEVEL: {lv.label} <small>{lv.desc}</small>
            </div>

            <div className="small">
              Sources: {(data?.sources ?? []).join(", ") || "—"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="controls">
          <div className="row">
            <div>
              <label>ICAO</label>
              <input
                value={icao}
                onChange={(e) => setIcao(e.target.value.toUpperCase())}
                placeholder="RJTT"
              />
              <div className="hint">例: RJTT / RJAA / KJFK</div>
            </div>

            <button className="btn" onClick={go} disabled={loading}>
              {loading ? "Fetching..." : "Get Weather"}
            </button>

            <button className="btn2" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide Raw" : "Show Raw"}
            </button>
          </div>

          {err && <div className="error">Error: {err}</div>}
        </div>

        {/* Main Grid */}
        <div className="grid">
          {/* Key Summary */}
          <div className="card">
            <h2>Key Summary</h2>

            <div className="kgrid">
              <div className="k">
                <div className="lab">Station</div>
                <div className="val">{station}</div>
              </div>
              <div className="k">
                <div className="lab">Wind</div>
                <div className="val">{wind}</div>
              </div>
              <div className="k">
                <div className="lab">Visibility</div>
                <div className="val">{vis}</div>
              </div>
              <div className="k">
                <div className="lab">QNH</div>
                <div className="val">{qnh}</div>
              </div>
              <div className="k" style={{ gridColumn: "1 / -1" }}>
                <div className="lab">Clouds</div>
                <div className="val">{clouds}</div>
              </div>
            </div>

            <div className="footer">Updated (UTC): {updated}</div>
          </div>

          {/* METAR / TAF */}
          <div className="card">
            <h2>METAR / TAF</h2>
            <div className="small">原文はカード表示（折返し対応）</div>

            <div className="twocol">
              <div className="prebox">
                <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>
                  METAR RAW
                </div>
                <pre>{metarRaw}</pre>
              </div>

              <div className="prebox">
                <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>
                  TAF RAW
                </div>
                <pre>{tafRaw}</pre>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ fontWeight: 900 }}>
                判定理由（reasons） / {lv.label}
              </div>

              {reasons.length === 0 ? (
                <div className="small" style={{ marginTop: 6 }}>
                  まだ理由がありません（解析ロジックは次フェーズで追加します）。
                </div>
              ) : (
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  {reasons.map((r, i) => (
                    <li key={i} className="small" style={{ marginBottom: 6 }}>
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {showRaw && (
              <pre className="rawjson">{JSON.stringify(data ?? {}, null, 2)}</pre>
            )}
          </div>
        </div>

        <div className="footer">
          ※ 次フェーズで「TAF時系列」「Crosswind」「TS/CB即RED」「Alternate minima」を追加します。
        </div>
      </div>
    </div>
  );
}
