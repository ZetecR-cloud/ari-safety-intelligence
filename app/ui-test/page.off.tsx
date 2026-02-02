"use client";

import React, { useMemo, useState } from "react";
import TafTimeline from "../components/TafTimeline";

type WxAnalysis = {
  level?: string;
  reasons?: string[];
};

type MetarObj = {
  raw?: string;
  wind?: string;
  visibility?: string;
  qnh?: string;
  clouds?: string[];
};

type ApiResponse = {
  status?: string;
  icao?: string;
  sources?: string[];
  metar?: MetarObj;
  taf?: string;
  wx_analysis?: WxAnalysis;
  time?: string;
};

function safeUpper(s: any) {
  return String(s ?? "").toUpperCase().trim();
}

function joinClouds(clouds?: string[]) {
  if (!clouds || !Array.isArray(clouds) || clouds.length === 0) return "—";
  return clouds.join(", ");
}

/**
 * METARから「現象コード」だけ抽出（RA / SN / -SNRA / TS / SHRA など）
 */
function parseMetarWxTokens(metarRaw: string): string[] {
  const raw = (metarRaw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!raw || raw === "—") return [];

  const tokens = raw.split(" ");

  // intensity/proximity: -, +, VC
  // descriptor: MI PR BC DR BL SH TS FZ
  // phenomena: DZ RA SN SG IC PL GR GS UP BR FG FU VA DU SA HZ PO SQ FC SS DS
  const wxRe =
    /^(?:\+|-|VC)?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS){1,3}$/;

  const result: string[] = [];
  for (const t of tokens) {
    if (t === "RMK") break;

    // よくある非現象グループを除外
    if (t === "METAR" || t === "SPECI") continue;
    if (/^[A-Z]{4}$/.test(t)) continue; // ICAO
    if (/^\d{6}Z$/.test(t)) continue; // time
    if (/^\d{3}(?:\d{2,3})G?\d{2,3}KT$/.test(t)) continue; // wind
    if (/^(?:CAVOK|\d{4}|9999)$/.test(t)) continue; // vis
    if (/^(?:M?\d{2})\/(?:M?\d{2})$/.test(t)) continue; // temp/dew
    if (/^(?:Q|A)\d{4}$/.test(t)) continue; // QNH/Alt
    if (/^(?:FEW|SCT|BKN|OVC|VV)\d{3}/.test(t)) continue; // clouds

    if (wxRe.test(t)) result.push(t);
  }

  return Array.from(new Set(result)); // 重複除去（順序保持）
}

function levelUi(levelRaw?: string) {
  const lv = safeUpper(levelRaw || "UNK");
  if (lv === "GREEN") return { label: "WX LEVEL: GREEN", sub: "通常運航可（監視継続）", tone: "green" as const };
  if (lv === "AMBER") return { label: "WX LEVEL: AMBER", sub: "注意（条件確認・要監視）", tone: "amber" as const };
  if (lv === "RED") return { label: "WX LEVEL: RED", sub: "運航要再検討（代替/遅延/回避）", tone: "red" as const };
  return { label: "WX LEVEL: UNK", sub: "判定未確定", tone: "unk" as const };
}

export default function UiTestPage() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const metarRaw = useMemo(() => safeUpper(data?.metar?.raw || "—"), [data]);
  const tafRaw = useMemo(() => safeUpper(data?.taf || "—"), [data]);

  const station = useMemo(() => safeUpper(data?.icao || icao || "—"), [data, icao]);
  const wind = useMemo(() => safeUpper(data?.metar?.wind || "—"), [data]);
  const vis = useMemo(() => safeUpper(data?.metar?.visibility || "—"), [data]);
  const qnh = useMemo(() => safeUpper(data?.metar?.qnh || "—"), [data]);
  const clouds = useMemo(() => joinClouds(data?.metar?.clouds), [data]);

  // ★ Cloudsの下に出す「現象」
  const wxTokens = useMemo(() => parseMetarWxTokens(metarRaw), [metarRaw]);
  const wxText = useMemo(() => (wxTokens.length ? wxTokens.join(", ") : "—"), [wxTokens]);

  const updatedUtc = useMemo(() => (data?.time ? String(data.time) : "—"), [data]);

  const level = data?.wx_analysis?.level;
  const reasons = data?.wx_analysis?.reasons ?? [];
  const badge = levelUi(level);

  async function getWeather() {
    const code = safeUpper(icao);
    if (!code) return;

    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(code)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="wrap">
        <div className="card hero">
          <div className="heroTop">
            <div>
              <div className="title">ARI UI Test</div>
              <div className="subtitle">ICAO入力 → METAR/TAF取得 → WX注意喚起（UI先行）</div>
            </div>

            <div className="sources">
              Sources: {(data?.sources || ["metar", "taf", "aviationweather.gov"]).join(", ")}
            </div>
          </div>

          <div className={`badge ${badge.tone}`}>
            <div className="badgeMain">{badge.label}</div>
            <div className="badgeSub">{badge.sub}</div>
          </div>
        </div>

        <div className="card">
          <div className="row">
            <div className="field">
              <div className="lab">ICAO</div>
              <input
                value={icao}
                onChange={(e) => setIcao(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") getWeather();
                }}
                placeholder="RJTT"
              />
              <div className="hint">例: RJTT / RJAA / KJFK</div>
            </div>

            <button className="btn primary" onClick={getWeather} disabled={loading}>
              {loading ? "Loading..." : "Get Weather"}
            </button>

            <button className="btn" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide Raw" : "Show Raw"}
            </button>
          </div>

          {err ? <div className="error">Error: {err}</div> : null}
        </div>

        <div className="grid">
          <div className="card">
            <div className="h2">Key Summary</div>

            <div className="kgrid">
              <div className="k">
                <div className="lab2">Station</div>
                <div className="val">{station}</div>
              </div>

              <div className="k">
                <div className="lab2">Wind</div>
                <div className="val">{wind}</div>
              </div>

              <div className="k">
                <div className="lab2">Visibility</div>
                <div className="val">{vis}</div>
              </div>

              <div className="k">
                <div className="lab2">QNH</div>
                <div className="val">{qnh}</div>
              </div>

              <div className="k wide">
                <div className="lab2">Clouds</div>
                <div className="val">{clouds}</div>
              </div>

              {/* ★追加：現象（RA/SN/TS等） */}
              <div className="k wide">
                <div className="lab2">WX (METAR)</div>
                <div className="val">{wxText}</div>
              </div>

              <div className="updated">Updated (UTC): {updatedUtc}</div>
            </div>
          </div>

          <div className="card">
            <div className="h2">METAR / TAF</div>
            <div className="small">原文はカード表示（折返し対応）</div>

            <div className="two">
              <div className="box">
                <div className="boxTitle">METAR RAW</div>
                <div className="mono">{metarRaw}</div>
              </div>

              <div className="box">
                <div className="boxTitle">TAF RAW</div>
                <div className="mono">{tafRaw}</div>
              </div>
            </div>

            <div className="reasonRow">
              <div className="reasonTitle">判定理由（reasons） / {safeUpper(level || "UNK")}</div>
              {reasons.length ? (
                <ul className="reasons">
                  {reasons.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              ) : (
                <div className="small">まだ理由がありません（解析ロジックは次フェーズで追加します）。</div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="h2">TAF Timeline（時系列）</div>
          <div className="small">Validity / TEMPO / BECMG を視覚化（UI確認用）</div>

          {/* ★ここがビルド落ちの原因になりやすいので any キャストで強制通過 */}
          <div className="timelineWrap">
            <TafTimeline {...({ tafRaw, taf: tafRaw } as any)} />
          </div>
        </div>

        {showRaw ? (
          <div className="card">
            <div className="h2">RAW JSON</div>
            <pre className="pre">{JSON.stringify(data ?? {}, null, 2)}</pre>
          </div>
        ) : null}

        <div className="footerNote">※ 次フェーズで「Crosswind」「TS/CB即RED」「Alternate minima」等を追加します。</div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f4f5f7;
          padding: 28px 14px 40px;
        }
        .wrap {
          max-width: 1180px;
          margin: 0 auto;
        }
        .card {
          background: #fff;
          border: 1px solid #e7e7e7;
          border-radius: 14px;
          padding: 18px 18px;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02);
          margin-bottom: 14px;
        }
        .hero {
          padding: 22px 22px;
        }
        .heroTop {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
        }
        .title {
          font-size: 30px;
          font-weight: 800;
          margin: 0 0 4px;
          letter-spacing: 0.2px;
        }
        .subtitle {
          color: #555;
          font-size: 13px;
        }
        .sources {
          color: #777;
          font-size: 12px;
          padding-top: 8px;
          white-space: nowrap;
        }

        .badge {
          margin-top: 14px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          font-weight: 800;
          letter-spacing: 0.2px;
          border: 1px solid transparent;
        }
        .badgeMain {
          font-size: 14px;
        }
        .badgeSub {
          font-size: 12px;
          font-weight: 700;
          opacity: 0.9;
        }
        .badge.green {
          background: #e9f7ee;
          border-color: #bfe7cd;
          color: #1b6b3a;
        }
        .badge.amber {
          background: #fff4e6;
          border-color: #ffd5a6;
          color: #8a4b00;
        }
        .badge.red {
          background: #ffe9ea;
          border-color: #ffb9bd;
          color: #8f1d25;
        }
        .badge.unk {
          background: #f0f1f3;
          border-color: #d7dbe0;
          color: #39424e;
        }

        .row {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .field {
          flex: 1;
          min-width: 260px;
        }
        .lab {
          font-size: 12px;
          font-weight: 800;
          color: #333;
          margin-bottom: 6px;
        }
        input {
          width: 100%;
          height: 40px;
          border-radius: 10px;
          border: 1px solid #ddd;
          padding: 0 12px;
          font-size: 14px;
          outline: none;
        }
        input:focus {
          border-color: #bbb;
        }
        .hint {
          font-size: 12px;
          color: #777;
          margin-top: 6px;
        }

        .btn {
          height: 40px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid #ddd;
          background: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .btn.primary {
          background: #111;
          color: #fff;
          border-color: #111;
        }
        .btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .error {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #ffccd1;
          background: #fff2f3;
          color: #8f1d25;
          font-weight: 700;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }
          .sources {
            display: none;
          }
        }

        .h2 {
          font-size: 16px;
          font-weight: 900;
          margin: 0 0 8px;
        }
        .small {
          color: #666;
          font-size: 12px;
          margin-bottom: 10px;
        }

        .kgrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          align-items: stretch;
        }
        .k {
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 12px 12px;
          background: #fafbfc;
        }
        .k.wide {
          grid-column: 1 / -1;
        }
        .lab2 {
          font-size: 12px;
          font-weight: 900;
          color: #555;
          margin-bottom: 6px;
        }
        .val {
          font-size: 14px;
          font-weight: 900;
          color: #111;
          word-break: break-word;
        }
        .updated {
          grid-column: 1 / -1;
          font-size: 12px;
          color: #777;
          padding: 6px 2px 0;
        }

        .two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 980px) {
          .two {
            grid-template-columns: 1fr;
          }
        }
        .box {
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 12px;
          background: #fbfbfb;
        }
        .boxTitle {
          font-size: 12px;
          font-weight: 900;
          margin-bottom: 8px;
          color: #444;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 12px;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.55;
        }

        .reasonRow {
          margin-top: 12px;
          border-top: 1px dashed #eee;
          padding-top: 12px;
        }
        .reasonTitle {
          font-size: 12px;
          font-weight: 900;
          margin-bottom: 6px;
          color: #444;
        }
        .reasons {
          margin: 0;
          padding-left: 18px;
          font-size: 12px;
          color: #333;
        }

        .timelineWrap {
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 12px;
          background: #fff;
        }

        .pre {
          margin: 0;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid #eee;
          background: #0b0f14;
          color: #e7f1ff;
          font-size: 12px;
          overflow: auto;
        }

        .footerNote {
          color: #777;
          font-size: 12px;
          padding: 4px 4px 0;
        }
      `}</style>
    </div>
  );
}
