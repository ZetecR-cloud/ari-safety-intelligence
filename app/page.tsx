"use client";

import React, { useMemo, useState } from "react";

type WxLevel = "GREEN" | "AMBER" | "RED" | "UNK";

type WxResp = {
  status: "OK" | "NG";
  icao?: string;
  sources?: string[];
  metar?: {
    raw?: string;
    wind?: string; // e.g. "09003KT" or "VRB03KT" or "22010G20KT"
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

type Runway = { id: string; magDeg: number };
type AirportRWY = { name: string; runways: Runway[] };

// ====== RWY MAG HDG DB（必要に応じて増やす） ======
const RWY_DB: Record<string, AirportRWY> = {
  RJTT: {
    name: "Tokyo Haneda",
    runways: [
      { id: "04", magDeg: 44 },
      { id: "05", magDeg: 53 },
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
      { id: "01L", magDeg: 13 },
      { id: "01R", magDeg: 13 },
      { id: "19L", magDeg: 193 },
      { id: "19R", magDeg: 193 },
    ],
  },
  RJNK: {
    name: "Komatsu",
    runways: [
      { id: "06", magDeg: 56 },
      { id: "24", magDeg: 236 },
    ],
  },
  // 追加例：
  // RJAA: { name: "Narita", runways: [{ id:"16R", magDeg: 164 }, ...] }
};

function normIcao(s: string) {
  return (s || "").trim().toUpperCase();
}

function safeRound(n: number) {
  return Math.round(n);
}

function clamp360(deg: number) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

// 角度差を -180..+180 に
function angleDiffDeg(fromDeg: number, toDeg: number) {
  // difference = from - to
  const a = clamp360(fromDeg);
  const b = clamp360(toDeg);
  let d = a - b;
  d = ((d + 540) % 360) - 180;
  return d;
}

type WindParsed = {
  dirDeg: number | null; // null = VRB
  spdKt: number;
  gustKt?: number;
  isVrb?: boolean;
};

function parseWindFromString(w: string | undefined): WindParsed | null {
  if (!w) return null;
  const s = w.trim().toUpperCase();

  // VRBddKT / VRBddGggKT
  const vrb = s.match(/^VRB(\d{2,3})(G(\d{2,3}))?KT$/);
  if (vrb) {
    const spd = Number(vrb[1]);
    const gst = vrb[3] ? Number(vrb[3]) : undefined;
    return { dirDeg: null, spdKt: spd, gustKt: gst, isVrb: true };
  }

  // dddssKT / dddssGggKT  (ss/gg can be 2-3 digits)
  const m = s.match(/^(\d{3})(\d{2,3})(G(\d{2,3}))?KT$/);
  if (!m) return null;
  const dir = Number(m[1]);
  const spd = Number(m[2]);
  const gst = m[4] ? Number(m[4]) : undefined;
  return { dirDeg: dir, spdKt: spd, gustKt: gst };
}

function extractWindFromMetar(metarRawOrWind: string | undefined): WindParsed | null {
  if (!metarRawOrWind) return null;
  const s = metarRawOrWind.toUpperCase();

  // まず「dddssGggKT / dddssKT / VRBssKT」を拾う
  const token = s.match(/\b(VRB\d{2,3}(G\d{2,3})?KT|\d{3}\d{2,3}(G\d{2,3})?KT)\b/);
  if (!token) return null;
  return parseWindFromString(token[1]);
}

type Components = {
  head: number; // + headwind, - tailwind
  cross: number; // + from RIGHT, - from LEFT
  crossAbs: number;
};

function computeComponents(windDirDeg: number, windSpdKt: number, rwyMagDeg: number): Components {
  // 航空の風向きは "from"。滑走路進行方向へ投影。
  // angle = wind_from - runway_heading
  const d = angleDiffDeg(windDirDeg, rwyMagDeg);
  const rad = (d * Math.PI) / 180;
  const head = windSpdKt * Math.cos(rad);
  const cross = windSpdKt * Math.sin(rad); // + from right, - from left
  return { head, cross, crossAbs: Math.abs(cross) };
}

function fmtSignedKt(n: number) {
  const v = safeRound(n);
  if (v === 0) return "0kt";
  return v > 0 ? `+${v}kt` : `${v}kt`;
}

function fmtKt(n: number) {
  return `${safeRound(n)}kt`;
}

function levelBadge(level: WxLevel | undefined) {
  const L = (level || "UNK").toUpperCase() as WxLevel;
  if (L === "RED") return { text: "WX LEVEL: RED", cls: "red" };
  if (L === "AMBER") return { text: "WX LEVEL: AMBER", cls: "amber" };
  if (L === "GREEN") return { text: "WX LEVEL: GREEN", cls: "green" };
  return { text: "WX LEVEL: UNK", cls: "unk" };
}

export default function Page() {
  const [icao, setIcao] = useState("RJCC");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WxResp | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Crosswind limit（任意）
  const [limitSteady, setLimitSteady] = useState<number>(30);
  const [limitGust, setLimitGust] = useState<number>(35);

  const icaoKey = useMemo(() => normIcao(icao), [icao]);

  const rwyList = useMemo(() => {
    return RWY_DB[icaoKey]?.runways || [];
  }, [icaoKey]);

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

  const metarRaw = data?.metar?.raw || "";
  const tafRaw = data?.taf?.raw || "";

  const wxBadge = levelBadge(data?.wx_analysis?.level);

  // Wind parse（metar.windがあればそれ優先、無ければ raw から拾う）
  const windParsed = useMemo(() => {
    const w = data?.metar?.wind || data?.metar?.raw || "";
    return extractWindFromMetar(w);
  }, [data]);

  // RWY別：steady/gust の成分を全部出す
  const crosswindTable = useMemo(() => {
    if (!windParsed) return [];
    if (windParsed.dirDeg === null) {
      // VRBは厳密計算不可 → “最大横風＝速度”で提示（保守的）
      return rwyList.map((r) => {
        const steadyCrossAbs = windParsed.spdKt;
        const gustCrossAbs = windParsed.gustKt ?? null;
        const worstAbs = Math.max(steadyCrossAbs, gustCrossAbs ?? 0);
        return {
          rwy: r.id,
          mag: r.magDeg,
          steadyHead: null,
          steadyCross: null,
          steadyCrossAbs,
          gustHead: null,
          gustCross: null,
          gustCrossAbs: gustCrossAbs,
          worstAbs,
          note: "VRB: calc N/A (use speed as max xwind)",
        };
      });
    }

    return rwyList.map((r) => {
      const steady = computeComponents(windParsed.dirDeg as number, windParsed.spdKt, r.magDeg);
      const gust = windParsed.gustKt
        ? computeComponents(windParsed.dirDeg as number, windParsed.gustKt, r.magDeg)
        : null;

      const worstAbs = Math.max(steady.crossAbs, gust?.crossAbs ?? 0);

      return {
        rwy: r.id,
        mag: r.magDeg,
        steadyHead: steady.head,
        steadyCross: steady.cross,
        steadyCrossAbs: steady.crossAbs,
        gustHead: gust?.head ?? null,
        gustCross: gust?.cross ?? null,
        gustCrossAbs: gust?.crossAbs ?? null,
        worstAbs,
        note: "",
      };
    });
  }, [windParsed, rwyList]);

  // ざっくり判定（limit）
  function limitStatus(worstAbs: number, hasGust: boolean) {
    const lim = hasGust ? limitGust : limitSteady;
    if (worstAbs >= lim) return { text: "LIMIT", cls: "bad" };
    if (worstAbs >= lim * 0.8) return { text: "NEAR", cls: "warn" };
    return { text: "OK", cls: "ok" };
  }

  return (
    <div className="wrap">
      <style>{`
        :root { color-scheme: light; }
        .wrap { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 28px; background: #f6f6f7; min-height: 100vh; }
        .top { max-width: 1120px; margin: 0 auto; }
        .header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; background:#fff; border:1px solid #e6e6ea; border-radius:18px; padding:18px 22px; }
        h1 { margin:0; font-size:28px; }
        .sub { margin-top:6px; font-size:13px; color:#555; }
        .badge { display:inline-flex; align-items:center; gap:10px; padding:8px 12px; border-radius:999px; font-weight:700; font-size:13px; border:1px solid #eee; margin-top:12px; }
        .green { background:#e8f7ee; color:#117a37; border-color:#bfe8cf; }
        .amber { background:#fff3e5; color:#9a4a00; border-color:#ffd8b3; }
        .red { background:#ffe9ea; color:#a1121a; border-color:#ffc0c4; }
        .unk { background:#f0f0f2; color:#333; border-color:#e3e3e7; }

        .panel { margin-top:16px; background:#fff; border:1px solid #e6e6ea; border-radius:18px; padding:18px 22px; }
        .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .input { flex:1; min-width: 260px; padding:12px 12px; border-radius:12px; border:1px solid #ddd; font-size:16px; }
        .btn { padding:10px 14px; border-radius:12px; border:1px solid #ddd; background:#111; color:#fff; font-weight:700; cursor:pointer; }
        .btn2 { padding:10px 14px; border-radius:12px; border:1px solid #ddd; background:#fff; color:#111; font-weight:700; cursor:pointer; }
        .hint { font-size:12px; color:#666; margin-top:6px; }

        .grid { display:grid; grid-template-columns: 1.05fr 1.3fr; gap:16px; margin-top:16px; }
        @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }

        .card { background:#fff; border:1px solid #e6e6ea; border-radius:18px; padding:16px 18px; }
        .card h2 { margin:0 0 10px 0; font-size:16px; }
        .kv { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .kv .box { border:1px solid #eee; border-radius:14px; padding:12px; background:#fbfbfc; }
        .k { font-size:12px; color:#555; font-weight:700; }
        .v { margin-top:6px; font-size:16px; font-weight:800; }
        .wide { grid-column: 1 / -1; }

        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size:12px; white-space:pre-wrap; word-break:break-word; background:#fbfbfc; border:1px solid #eee; border-radius:14px; padding:12px; }

        .table { width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid #eee; border-radius:14px; }
        .table th, .table td { padding:10px 10px; border-bottom:1px solid #eee; font-size:13px; vertical-align:top; }
        .table th { background:#fafafa; text-align:left; font-size:12px; color:#444; }
        .table tr:last-child td { border-bottom:none; }
        .tag { display:inline-flex; align-items:center; padding:4px 8px; border-radius:999px; font-size:12px; font-weight:800; border:1px solid #eee; }
        .ok { background:#e8f7ee; color:#117a37; border-color:#bfe8cf; }
        .warn { background:#fff3e5; color:#9a4a00; border-color:#ffd8b3; }
        .bad { background:#ffe9ea; color:#a1121a; border-color:#ffc0c4; }

        .small { font-size:12px; color:#666; }
        .right { text-align:right; }
      `}</style>

      <div className="top">
        <div className="header">
          <div>
            <h1>ARI UI Test</h1>
            <div className="sub">ICAO入力 → METAR/TAF取得 → WX注意喚起（UI先行）</div>
            <div className={`badge ${wxBadge.cls}`}>
              {wxBadge.text}
              <span className="small">注意（条件確認・要監視）</span>
            </div>
          </div>
          <div className="small">Sources: metar, taf, aviationweather.gov</div>
        </div>

        <div className="panel">
          <div className="row">
            <div style={{ width: 80, fontWeight: 800 }}>ICAO</div>
            <input
              className="input"
              value={icao}
              onChange={(e) => setIcao(e.target.value.toUpperCase())}
              placeholder="RJTT"
            />
            <button className="btn" onClick={getWeather} disabled={loading}>
              {loading ? "Loading..." : "Get Weather"}
            </button>
            <button className="btn2" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide Raw" : "Show Raw"}
            </button>
          </div>
          <div className="hint">例: RJTT / RJAA / KJFK</div>
          {data?.status === "NG" && (
            <div className="hint" style={{ color: "#a1121a", marginTop: 10 }}>
              Error: {data.error || "NG"}
            </div>
          )}
        </div>

        <div className="grid">
          {/* Key Summary */}
          <div className="card">
            <h2>Key Summary</h2>
            <div className="kv">
              <div className="box">
                <div className="k">Station</div>
                <div className="v">{data?.icao || icaoKey || "—"}</div>
              </div>
              <div className="box">
                <div className="k">Wind</div>
                <div className="v">
                  {(() => {
                    const w = windParsed
                      ? windParsed.dirDeg === null
                        ? `VRB${String(windParsed.spdKt).padStart(2, "0")}${windParsed.gustKt ? `G${windParsed.gustKt}` : ""}KT`
                        : `${String(windParsed.dirDeg).padStart(3, "0")}${String(windParsed.spdKt).padStart(2, "0")}${windParsed.gustKt ? `G${windParsed.gustKt}` : ""}KT`
                      : (data?.metar?.wind || "—");
                    return w;
                  })()}
                </div>
              </div>

              <div className="box">
                <div className="k">Visibility</div>
                <div className="v">{data?.metar?.visibility || "—"}</div>
              </div>
              <div className="box">
                <div className="k">QNH</div>
                <div className="v">{data?.metar?.qnh || "—"}</div>
              </div>

              <div className="box wide">
                <div className="k">Clouds</div>
                <div className="v">{(data?.metar?.clouds || []).join(", ") || "—"}</div>
              </div>

              {/* ★ここが要望の「Cloudsの下に現象（RA/SN/TS等）」 */}
              <div className="box wide">
                <div className="k">WX (METAR)</div>
                <div className="v">
                  {(() => {
                    // METAR現象は raw から拾う（-SHSN / TS / RA / +SNRA など）
                    const raw = (data?.metar?.raw || "").toUpperCase();
                    if (!raw) return "—";
                    const wx = raw.match(/\s(\+|-)?(TS|SH)?(RA|SN|DZ|SG|PL|GR|GS|IC|UP)([A-Z]{0,4})\s/);
                    // 例: "-SHSN", "+TSRA", "SHRASN", "TSRASN" などをざっくり拾う
                    if (wx) return (wx[1] || "") + (wx[2] || "") + wx[3] + (wx[4] || "");
                    // もっと広く拾う： " -SHSN " のように単独トークンを探す
                    const tokens = raw.split(/\s+/);
                    const found = tokens.find((t) => /^(\+|-)?(TS|SH)?(RA|SN|DZ|SG|PL|GR|GS|IC|UP)[A-Z]*$/.test(t));
                    return found || "—";
                  })()}
                </div>
              </div>
            </div>

            <div className="small" style={{ marginTop: 10 }}>
              Updated (UTC): {data?.time || "—"}
            </div>
          </div>

          {/* METAR / TAF */}
          <div className="card">
            <h2>METAR / TAF</h2>
            <div className="small" style={{ marginBottom: 8 }}>
              原文はカード表示（折返し対応）
            </div>
            <div className="kv" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="box">
                <div className="k">METAR RAW</div>
                <div className="mono">{metarRaw || "—"}</div>
              </div>
              <div className="box">
                <div className="k">TAF RAW</div>
                <div className="mono">{tafRaw || "—"}</div>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div className="k">判定理由（reasons） / {data?.wx_analysis?.level || "UNK"}</div>
              <ul style={{ marginTop: 6 }}>
                {(data?.wx_analysis?.reasons || []).length ? (
                  (data?.wx_analysis?.reasons || []).map((r, i) => <li key={i}>{r}</li>)
                ) : (
                  <li>—</li>
                )}
              </ul>
            </div>

            {showRaw && (
              <div style={{ marginTop: 10 }}>
                <div className="k">RAW JSON</div>
                <div className="mono">{JSON.stringify(data, null, 2)}</div>
              </div>
            )}
          </div>
        </div>

        {/* ===== Crosswind（RWY別 自動計算） ===== */}
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Crosswind (RWY別 自動計算)</h2>

          <div className="row" style={{ marginBottom: 10 }}>
            <div className="small">
              Airport RWY DB: <b>{icaoKey}</b>{" "}
              {RWY_DB[icaoKey]?.name ? `(${RWY_DB[icaoKey].name})` : "(not registered)"}
            </div>
            <div style={{ flex: 1 }} />
            <div className="small">Limit steady</div>
            <input
              className="input"
              style={{ width: 110, minWidth: 110 }}
              value={limitSteady}
              onChange={(e) => setLimitSteady(Number(e.target.value || 0))}
              inputMode="numeric"
            />
            <div className="small">Limit gust</div>
            <input
              className="input"
              style={{ width: 110, minWidth: 110 }}
              value={limitGust}
              onChange={(e) => setLimitGust(Number(e.target.value || 0))}
              inputMode="numeric"
            />
          </div>

          {!windParsed && (
            <div className="hint" style={{ color: "#a1121a" }}>
              風情報が取れません（METAR RAWに "dddssKT / dddssGggKT / VRBssKT" が含まれているか確認）
            </div>
          )}

          {windParsed && rwyList.length === 0 && (
            <div className="hint" style={{ color: "#9a4a00" }}>
              {icaoKey} は RWY_DB に未登録です。RWY_DB に滑走路方位（MAG）を追加すると自動計算できます。
            </div>
          )}

          {windParsed && rwyList.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>RWY</th>
                    <th>MAG</th>
                    <th>Steady Head/Tail</th>
                    <th>Steady Xwind</th>
                    <th>Gust Head/Tail</th>
                    <th>Gust Xwind</th>
                    <th className="right">Worst Xwind</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {crosswindTable.map((r) => {
                    const hasGust = r.gustCrossAbs !== null && r.gustCrossAbs !== undefined;
                    const st = limitStatus(r.worstAbs, hasGust);
                    return (
                      <tr key={r.rwy}>
                        <td><b>{r.rwy}</b></td>
                        <td>{r.mag}</td>

                        <td>
                          {r.steadyHead === null ? "—" : fmtSignedKt(r.steadyHead)}
                          <div className="small">{r.steadyHead !== null && (r.steadyHead >= 0 ? "Headwind" : "Tailwind")}</div>
                        </td>
                        <td>
                          {r.steadyCross === null ? (fmtKt(r.steadyCrossAbs)) : fmtSignedKt(r.steadyCross)}
                          <div className="small">
                            {r.steadyCross === null ? "VRB conservative" : (r.steadyCross >= 0 ? "from RIGHT" : "from LEFT")}
                            {" · "}
                            |X| {fmtKt(r.steadyCrossAbs)}
                          </div>
                        </td>

                        <td>
                          {r.gustHead === null ? "—" : fmtSignedKt(r.gustHead)}
                          <div className="small">{r.gustHead !== null && (r.gustHead >= 0 ? "Headwind" : "Tailwind")}</div>
                        </td>
                        <td>
                          {r.gustCross === null
                            ? (r.gustCrossAbs === null ? "—" : fmtKt(r.gustCrossAbs))
                            : fmtSignedKt(r.gustCross)}
                          <div className="small">
                            {r.gustCross === null
                              ? (r.gustCrossAbs === null ? "" : "VRB conservative")
                              : (r.gustCross >= 0 ? "from RIGHT" : "from LEFT")}
                            {r.gustCrossAbs !== null ? (
                              <>
                                {" · "} |X| {fmtKt(r.gustCrossAbs)}
                              </>
                            ) : null}
                          </div>
                        </td>

                        <td className="right"><b>{fmtKt(r.worstAbs)}</b></td>
                        <td><span className={`tag ${st.cls}`}>{st.text}</span></td>
                        <td className="small">{r.note || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="small" style={{ marginTop: 10 }}>
            * 風向は "from"（METAR表記）として計算。Crosswindは <b>+ = from RIGHT / - = from LEFT</b>。<br />
            * VRBは正確計算不可なので、保守的に「横風最大＝速度（gustがあればgust）」で表示。
          </div>
        </div>

        {/* 下部：ここは今後 TAF Timeline / その他コンポーネントを足す前提 */}
        <div className="small" style={{ marginTop: 14 }}>
          ※ 次フェーズで「RWY DB拡充」「ガスト steady/peak 別表示」「会社limitプリセット」を拡張できます。
        </div>
      </div>
    </div>
  );
}
