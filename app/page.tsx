"use client";

import React, { useMemo, useState } from "react";

type WxLevel = "GREEN" | "AMBER" | "RED" | "UNK";

type WxResp = {
  status: "OK" | "NG";
  icao?: string;
  sources?: string[];
  metar?: {
    raw?: string;
    wind?: string; // e.g. 09003KT / 22010G20KT
    visibility?: string;
    qnh?: string;
    clouds?: string[];
  };
  taf?: {
    raw?: string;
  };
  wx_analysis?: {
    level?: WxLevel;
    reasons?: string[];
  };
  time?: string;
  error?: string;
};

type WindParsed = {
  dirDeg: number | null; // null = VRB/unknown
  spdKt: number;
  gustKt?: number;
  isVrb?: boolean;
};

type RunwayInfo = {
  id: string; // "05", "23L", etc.
  magDeg: number; // runway magnetic heading
};

// ✅ 最低限のRWY DB（必要に応じて増やす）
// ここを拡張していけば、空港ごとに自動で候補が出ます。
const RWY_DB: Record<string, { name?: string; runways: RunwayInfo[] }> = {
  RJTT: {
    name: "Tokyo Haneda",
    runways: [
      { id: "04", magDeg: 044 },
      { id: "05", magDeg: 053 },
      { id: "16L", magDeg: 164 },
      { id: "16R", magDeg: 164 },
      { id: "22", magDeg: 224 },
      { id: "23", magDeg: 233 },
      { id: "34L", magDeg: 344 },
      { id: "34R", magDeg: 344 },
    ],
  },
  RJCC: {
    name: "Sapporo New Chitose",
    runways: [
      { id: "01L", magDeg: 013 },
      { id: "01R", magDeg: 013 },
      { id: "19L", magDeg: 193 },
      { id: "19R", magDeg: 193 },
    ],
  },
  RJNK: {
    name: "Komatsu",
    runways: [
      { id: "06", magDeg: 056 },
      { id: "24", magDeg: 236 },
    ],
  },
};

function normIcao(s: string) {
  return (s || "").trim().toUpperCase();
}

function safeRound(n: number) {
  return Math.round(n);
}

function diffAngleDeg(a: number, b: number) {
  // returns smallest difference 0..180
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function parseWindFromString(w: string | undefined): WindParsed | null {
  if (!w) return null;

  // Normalize like: "09003KT", "22010G20KT", "VRB03KT"
  const s = w.trim().toUpperCase();

  // VRB
  const vrb = s.match(/^VRB(\d{2,3})(G(\d{2,3}))?KT$/);
  if (vrb) {
    const spd = Number(vrb[1]);
    const gust = vrb[3] ? Number(vrb[3]) : undefined;
    return { dirDeg: null, spdKt: spd, gustKt: gust, isVrb: true };
  }

  // 00000KT (calm)
  const calm = s.match(/^00000KT$/);
  if (calm) {
    return { dirDeg: 0, spdKt: 0 };
  }

  // dddssKT / dddssGggKT / allow 2-3 digit speed/gust
  const m = s.match(/^(\d{3})(\d{2,3})(G(\d{2,3}))?KT$/);
  if (!m) return null;

  const dir = Number(m[1]);
  const spd = Number(m[2]);
  const gust = m[4] ? Number(m[4]) : undefined;

  return { dirDeg: dir, spdKt: spd, gustKt: gust };
}

function parseWindFromMetarRaw(raw: string | undefined): WindParsed | null {
  if (!raw) return null;
  const s = raw.toUpperCase();

  // Try to find wind group inside METAR raw.
  // examples:
  // 09003KT
  // 22010G20KT
  // VRB03KT
  const m =
    s.match(/\b(VRB\d{2,3}(G\d{2,3})?KT)\b/) ||
    s.match(/\b(\d{3}\d{2,3}(G\d{2,3})?KT)\b/) ||
    s.match(/\b(00000KT)\b/);

  if (!m) return null;
  return parseWindFromString(m[1]);
}

function computeWindComponents(wind: WindParsed, rwyMag: number) {
  // returns components for steady + optional gust
  if (wind.spdKt <= 0) {
    return {
      steady: { head: 0, cross: 0, crossSide: "—" as const, headTail: "—" as const },
      gust: wind.gustKt ? { head: 0, cross: 0, crossSide: "—" as const, headTail: "—" as const } : null,
      note: "CALM",
    };
  }

  if (wind.dirDeg === null) {
    // VRB: cannot compute deterministic components. Provide worst-case crosswind = speed
    const worstSteady = wind.spdKt;
    const worstGust = wind.gustKt ?? null;
    return {
      steady: { head: 0, cross: worstSteady, crossSide: "VAR" as const, headTail: "VAR" as const },
      gust: worstGust !== null ? { head: 0, cross: worstGust, crossSide: "VAR" as const, headTail: "VAR" as const } : null,
      note: "VRB wind: components are worst-case (crosswind=max).",
    };
  }

  const theta = diffAngleDeg(wind.dirDeg, rwyMag); // 0..180
  const rad = (theta * Math.PI) / 180;

  const head = wind.spdKt * Math.cos(rad); // positive = headwind, negative = tailwind
  const cross = wind.spdKt * Math.sin(rad); // magnitude only; side depends on relative bearing (we'll approximate)
  const gustHead = wind.gustKt ? wind.gustKt * Math.cos(rad) : null;
  const gustCross = wind.gustKt ? wind.gustKt * Math.sin(rad) : null;

  // Side (L/R) – determine by signed angle using modular arithmetic
  const signed = ((wind.dirDeg - rwyMag + 540) % 360) - 180; // -180..180
  const crossSide = signed > 0 ? "R" : signed < 0 ? "L" : "—";
  const headTail = head >= 0 ? "HEAD" : "TAIL";

  return {
    steady: {
      head: head,
      cross: cross,
      crossSide,
      headTail,
    },
    gust: wind.gustKt
      ? {
          head: gustHead ?? 0,
          cross: gustCross ?? 0,
          crossSide,
          headTail: (gustHead ?? 0) >= 0 ? "HEAD" : "TAIL",
        }
      : null,
    note: null as string | null,
  };
}

function levelBadge(level: WxLevel | undefined) {
  const L = level ?? "UNK";
  const text =
    L === "GREEN"
      ? "GREEN 通常運航可（監視継続）"
      : L === "AMBER"
      ? "AMBER 注意（条件確認・要監視）"
      : L === "RED"
      ? "RED 警戒（運航判断に注意）"
      : "UNK 判定不能";
  return { L, text };
}

export default function Page() {
  const [icao, setIcao] = useState("RJCC");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WxResp | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Crosswind UI
  const [selectedRwy, setSelectedRwy] = useState<string>("");
  const [manualRwyMag, setManualRwyMag] = useState<number>(0);
  const [limitSteady, setLimitSteady] = useState<number>(30);
  const [limitGust, setLimitGust] = useState<number>(35);

  const icaoKey = useMemo(() => normIcao(icao), [icao]);

  const rwyList = useMemo(() => {
    return RWY_DB[icaoKey]?.runways ?? [];
  }, [icaoKey]);

  // If runway list exists, auto-select first if none selected
  React.useEffect(() => {
    if (rwyList.length > 0 && !selectedRwy) {
      setSelectedRwy(rwyList[0].id);
      setManualRwyMag(0);
    }
    if (rwyList.length === 0) {
      setSelectedRwy("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icaoKey, rwyList.length]);

  async function getWeather() {
    setLoading(true);
    setData(null);
    try {
      const key = normIcao(icao);
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(key)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as WxResp;
      setData(json);
    } catch (e: any) {
      setData({ status: "NG", error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  const metarRaw = data?.metar?.raw ?? "";
  const tafRaw = data?.taf?.raw ?? "";
  const wxLevel = data?.wx_analysis?.level ?? "UNK";
  const badge = levelBadge(wxLevel);

  // Wind parse
  const windParsed: WindParsed | null = useMemo(() => {
    // Priority: structured metar.wind -> parse from raw
    const fromField = parseWindFromString(data?.metar?.wind);
    if (fromField) return fromField;
    const fromRaw = parseWindFromMetarRaw(metarRaw);
    return fromRaw;
  }, [data?.metar?.wind, metarRaw]);

  // Runway mag heading to use
  const rwyMag: number | null = useMemo(() => {
    if (rwyList.length > 0 && selectedRwy) {
      const hit = rwyList.find((r) => r.id === selectedRwy);
      if (hit) return hit.magDeg;
    }
    if (manualRwyMag && manualRwyMag > 0) return manualRwyMag;
    return null;
  }, [manualRwyMag, rwyList, selectedRwy]);

  const crosswind = useMemo(() => {
    if (!windParsed || rwyMag === null) return null;
    return computeWindComponents(windParsed, rwyMag);
  }, [windParsed, rwyMag]);

  const steadyCrossAbs = crosswind ? Math.abs(crosswind.steady.cross) : null;
  const gustCrossAbs = crosswind?.gust ? Math.abs(crosswind.gust.cross) : null;

  const steadyOK = steadyCrossAbs === null ? null : steadyCrossAbs <= limitSteady;
  const gustOK = gustCrossAbs === null ? null : gustCrossAbs <= limitGust;

  return (
    <main className="bg">
      <div className="container">
        <div className="card hero">
          <div>
            <h1>ARI UI Test</h1>
            <div className="subtitle">ICAO入力 → METAR/TAF取得 → WX注意喚起（UI先行）</div>
          </div>
          <div className="sources">
            Sources: metar, taf, aviationweather.gov
          </div>

          <div className={`badge ${badge.L.toLowerCase()}`}>
            <span className="badgeTitle">WX LEVEL: {badge.L}</span>
            <span className="badgeText">{badge.text}</span>
          </div>
        </div>

        <div className="card inputCard">
          <div className="row">
            <div className="field">
              <div className="label">ICAO</div>
              <input
                value={icao}
                onChange={(e) => setIcao(e.target.value)}
                onBlur={() => setIcao((v) => normIcao(v))}
                placeholder="RJTT"
              />
              <div className="hint">例: RJTT / RJAA / KJFK</div>
            </div>

            <div className="btnRow">
              <button className="btn primary" onClick={getWeather} disabled={loading}>
                {loading ? "Loading..." : "Get Weather"}
              </button>
              <button className="btn" onClick={() => setShowRaw((v) => !v)} disabled={!data}>
                {showRaw ? "Hide Raw" : "Show Raw"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid2">
          <div className="card">
            <h2>Key Summary</h2>

            <div className="kvGrid">
              <div className="kv">
                <div className="k">Station</div>
                <div className="v">{icaoKey || "—"}</div>
              </div>
              <div className="kv">
                <div className="k">Wind</div>
                <div className="v">{data?.metar?.wind ?? (windParsed ? (windParsed.isVrb ? `VRB${String(windParsed.spdKt).padStart(2, "0")}KT` : `${String(windParsed.dirDeg ?? 0).padStart(3, "0")}${String(windParsed.spdKt).padStart(2, "0")}KT`) : "—")}</div>
              </div>
              <div className="kv">
                <div className="k">Visibility</div>
                <div className="v">{data?.metar?.visibility ?? "—"}</div>
              </div>
              <div className="kv">
                <div className="k">QNH</div>
                <div className="v">{data?.metar?.qnh ?? "—"}</div>
              </div>
              <div className="kv wide">
                <div className="k">Clouds</div>
                <div className="v strong">{(data?.metar?.clouds ?? []).length ? (data?.metar?.clouds ?? []).join(", ") : "—"}</div>
              </div>

              {/* ✅ Crosswind */}
              <div className="kv wide">
                <div className="k">Crosswind (RWY)</div>

                <div className="crossWrap">
                  <div className="crossTop">
                    <div className="crossCol">
                      <div className="miniLabel">Runway</div>

                      {rwyList.length > 0 ? (
                        <div className="rowInline">
                          <select
                            value={selectedRwy}
                            onChange={(e) => setSelectedRwy(e.target.value)}
                          >
                            {rwyList.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.id} (MAG {r.magDeg}°)
                              </option>
                            ))}
                          </select>
                          <div className="miniHint">DB</div>
                        </div>
                      ) : (
                        <div className="rowInline">
                          <input
                            type="number"
                            value={manualRwyMag || ""}
                            onChange={(e) => setManualRwyMag(Number(e.target.value))}
                            placeholder="MAG deg"
                            min={0}
                            max={360}
                          />
                          <div className="miniHint">Manual RWY MAG HDG</div>
                        </div>
                      )}
                    </div>

                    <div className="crossCol">
                      <div className="miniLabel">Limit (steady / gust)</div>
                      <div className="rowInline">
                        <input
                          type="number"
                          value={limitSteady}
                          onChange={(e) => setLimitSteady(Number(e.target.value))}
                          min={0}
                          max={80}
                        />
                        <span className="unit">kt</span>
                        <span className="sep">/</span>
                        <input
                          type="number"
                          value={limitGust}
                          onChange={(e) => setLimitGust(Number(e.target.value))}
                          min={0}
                          max={80}
                        />
                        <span className="unit">kt</span>
                      </div>
                      <div className="miniHint">gustはMETARにGがある時のみ</div>
                    </div>
                  </div>

                  <div className="crossResult">
                    {!data ? (
                      <div className="muted">まず「Get Weather」を押してください。</div>
                    ) : !windParsed ? (
                      <div className="muted">Wind を解析できません（METARの風群が見つからない）。</div>
                    ) : rwyMag === null ? (
                      <div className="muted">Runway MAG HDG を選択/入力してください。</div>
                    ) : (
                      <>
                        <div className="pillRow">
                          <div className={`pill ${steadyOK === null ? "" : steadyOK ? "ok" : "ng"}`}>
                            <div className="pillTitle">STEADY</div>
                            <div className="pillVal">
                              XW {safeRound(Math.abs(crosswind!.steady.cross))}kt {crosswind!.steady.crossSide} /{" "}
                              {crosswind!.steady.headTail} {safeRound(Math.abs(crosswind!.steady.head))}kt
                            </div>
                            <div className="pillSub">
                              Limit {limitSteady}kt → {steadyOK ? "OK" : "EXCEED"}
                            </div>
                          </div>

                          <div className={`pill ${gustOK === null ? "dim" : gustOK ? "ok" : "ng"}`}>
                            <div className="pillTitle">GUST</div>
                            <div className="pillVal">
                              {crosswind!.gust
                                ? `XW ${safeRound(Math.abs(crosswind!.gust.cross))}kt ${crosswind!.gust.crossSide} / ${crosswind!.gust.headTail} ${safeRound(Math.abs(crosswind!.gust.head))}kt`
                                : "—"}
                            </div>
                            <div className="pillSub">
                              {crosswind!.gust ? `Limit ${limitGust}kt → ${gustOK ? "OK" : "EXCEED"}` : "METAR gustなし"}
                            </div>
                          </div>
                        </div>

                        {crosswind?.note ? <div className="note">{crosswind.note}</div> : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="updated">
              Updated (UTC): {data?.time ? new Date(data.time).toISOString() : "—"}
            </div>
          </div>

          <div className="card">
            <h2>METAR / TAF</h2>
            <div className="hint">原文はカード表示（折返し対応）</div>

            <div className="twoCols">
              <div className="box">
                <div className="boxTitle">METAR RAW</div>
                <pre>{metarRaw || "—"}</pre>
              </div>
              <div className="box">
                <div className="boxTitle">TAF RAW</div>
                <pre>{tafRaw || "—"}</pre>
              </div>
            </div>

            <div className="reasons">
              <div className="reasonsTitle">判定理由（reasons） / {badge.L}</div>
              <ul>
                {(data?.wx_analysis?.reasons ?? []).length ? (
                  (data?.wx_analysis?.reasons ?? []).map((r, i) => <li key={i}>{r}</li>)
                ) : (
                  <li className="muted">まだ理由がありません（解析ロジックは次フェーズで追加します）。</li>
                )}
              </ul>
            </div>

            {showRaw ? (
              <div className="rawBlock">
                <div className="boxTitle">RAW JSON</div>
                <pre>{JSON.stringify(data, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card footerNote">
          ※ 次フェーズで「TAF時系列」「TS/CB即RED」「Alternate minima」「RWY別MAG HDG DB拡張」を追加できます。
        </div>
      </div>

      <style jsx global>{`
        :root {
          --bg: #f5f6f8;
          --card: #ffffff;
          --text: #111827;
          --muted: #6b7280;
          --border: #e5e7eb;
          --shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
          --radius: 16px;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: var(--bg);
          color: var(--text);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
            "Apple Color Emoji", "Segoe UI Emoji";
        }

        .bg {
          padding: 28px 18px;
        }

        .container {
          max-width: 1120px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 18px 18px;
        }

        .hero {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        h1 {
          margin: 0;
          font-size: 34px;
          letter-spacing: -0.02em;
        }

        h2 {
          margin: 0 0 10px 0;
          font-size: 18px;
        }

        .subtitle {
          color: var(--muted);
          margin-top: 4px;
          font-size: 13px;
        }

        .sources {
          align-self: flex-end;
          color: var(--muted);
          font-size: 12px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid var(--border);
          width: fit-content;
        }
        .badgeTitle {
          font-weight: 800;
          letter-spacing: 0.02em;
        }
        .badgeText {
          color: #111827;
          font-size: 13px;
        }
        .badge.green {
          background: #eafff2;
          border-color: #b7f7d0;
        }
        .badge.amber {
          background: #fff3e6;
          border-color: #ffd6ad;
        }
        .badge.red {
          background: #ffecec;
          border-color: #ffb9b9;
        }
        .badge.unk {
          background: #f3f4f6;
        }

        .inputCard .row {
          display: flex;
          gap: 14px;
          align-items: flex-end;
          justify-content: space-between;
          flex-wrap: wrap;
        }

        .field {
          min-width: 320px;
          flex: 1;
        }

        .label {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 6px;
        }

        input,
        select {
          width: 100%;
          height: 42px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          outline: none;
          font-size: 14px;
          background: #fff;
        }

        .hint {
          margin-top: 6px;
          font-size: 12px;
          color: var(--muted);
        }

        .btnRow {
          display: flex;
          gap: 10px;
        }

        .btn {
          height: 42px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: #fff;
          cursor: pointer;
          font-weight: 700;
        }

        .btn.primary {
          background: #111827;
          color: #fff;
          border-color: #111827;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }

        @media (max-width: 980px) {
          .grid2 {
            grid-template-columns: 1fr;
          }
        }

        .kvGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .kv {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 12px;
          background: #fbfbfc;
        }

        .kv.wide {
          grid-column: 1 / -1;
        }

        .k {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 6px;
          font-weight: 600;
        }

        .v {
          font-size: 15px;
          font-weight: 700;
        }

        .v.strong {
          font-weight: 800;
        }

        .updated {
          margin-top: 10px;
          font-size: 12px;
          color: var(--muted);
        }

        .twoCols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        @media (max-width: 980px) {
          .twoCols {
            grid-template-columns: 1fr;
          }
        }

        .box {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 12px;
          background: #fbfbfc;
        }

        .boxTitle {
          font-size: 12px;
          color: var(--muted);
          font-weight: 700;
          margin-bottom: 8px;
        }

        pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
            "Courier New", monospace;
          font-size: 12px;
          line-height: 1.45;
        }

        .reasons {
          margin-top: 12px;
          border-top: 1px dashed var(--border);
          padding-top: 12px;
        }

        .reasonsTitle {
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 6px;
        }

        ul {
          margin: 0;
          padding-left: 18px;
        }

        li {
          margin: 4px 0;
          font-size: 13px;
        }

        .muted {
          color: var(--muted);
        }

        .rawBlock {
          margin-top: 12px;
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 12px;
          background: #0b1220;
          color: #d1fae5;
        }

        .rawBlock .boxTitle {
          color: #9ca3af;
        }

        .footerNote {
          color: var(--muted);
          font-size: 12px;
        }

        /* Crosswind UI */
        .crossWrap {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .crossTop {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        @media (max-width: 980px) {
          .crossTop {
            grid-template-columns: 1fr;
          }
        }

        .crossCol {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 12px;
          background: #ffffff;
        }

        .miniLabel {
          font-size: 12px;
          color: var(--muted);
          font-weight: 700;
          margin-bottom: 8px;
        }

        .rowInline {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .rowInline input,
        .rowInline select {
          height: 38px;
        }

        .miniHint {
          font-size: 12px;
          color: var(--muted);
          white-space: nowrap;
        }

        .unit {
          font-size: 12px;
          color: var(--muted);
          font-weight: 700;
          margin-left: 2px;
        }

        .sep {
          color: var(--muted);
          font-weight: 800;
          margin: 0 2px;
        }

        .crossResult {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 12px;
          background: #ffffff;
        }

        .pillRow {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        @media (max-width: 980px) {
          .pillRow {
            grid-template-columns: 1fr;
          }
        }

        .pill {
          border-radius: 14px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          background: #fbfbfc;
        }

        .pill.ok {
          background: #eafff2;
          border-color: #b7f7d0;
        }

        .pill.ng {
          background: #ffecec;
          border-color: #ffb9b9;
        }

        .pill.dim {
          opacity: 0.7;
        }

        .pillTitle {
          font-size: 12px;
          color: var(--muted);
          font-weight: 800;
          margin-bottom: 6px;
        }

        .pillVal {
          font-size: 14px;
          font-weight: 900;
        }

        .pillSub {
          margin-top: 4px;
          font-size: 12px;
          color: var(--muted);
          font-weight: 700;
        }

        .note {
          margin-top: 8px;
          font-size: 12px;
          color: var(--muted);
        }
      `}</style>
    </main>
  );
}
