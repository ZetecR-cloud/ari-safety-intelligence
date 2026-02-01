"use client";

import React, { useMemo, useState } from "react";

type WxLevel = "GREEN" | "AMBER" | "RED";

type WxResp = {
  status: "OK" | "NG";
  icao?: string;
  sources?: string[];
  metar?: {
    raw?: string;
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

/** ====== RWY MAG HDG DB（必要な空港から随時追加） ====== */
type Rwy = { id: string; magDeg: number };
type Airport = { name: string; runways: Rwy[] };

const RWY_DB: Record<string, Airport> = {
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
};

function normIcao(s: string) {
  return (s || "").trim().toUpperCase();
}

function clamp360(deg: number) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/** a-b の最小角差（-180..+180） */
function smallestAngleDiff(a: number, b: number) {
  const d = clamp360(a) - clamp360(b);
  return ((d + 540) % 360) - 180;
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

  // VRBxxGyyKT / VRBxxKT
  const vrb = s.match(/^VRB(\d{2,3})(G(\d{2,3}))?KT$/);
  if (vrb) {
    const spd = Number(vrb[1]);
    const gust = vrb[3] ? Number(vrb[3]) : undefined;
    return { dirDeg: null, spdKt: spd, gustKt: gust, isVrb: true };
  }

  // dddssGggKT / dddssKT（speed/gust は 2-3 桁許容）
  const m = s.match(/^(\d{3})(\d{2,3})(G(\d{2,3}))?KT$/);
  if (!m) return null;

  const dir = Number(m[1]);
  const spd = Number(m[2]);
  const gust = m[4] ? Number(m[4]) : undefined;
  return { dirDeg: dir, spdKt: spd, gustKt: gust };
}

/** METAR RAW から「風」だけ抜く（dddssKT / dddssGggKT / VRBxxKT） */
function windFromMetarRaw(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.toUpperCase();

  // 例: "METAR RJNK 010700Z 27008KT 230V300 8000 ..."
  // まず VRB を優先
  const vrb = s.match(/\bVRB\d{2,3}(G\d{2,3})?KT\b/);
  if (vrb) return vrb[0];

  const m = s.match(/\b\d{3}\d{2,3}(G\d{2,3})?KT\b/);
  if (m) return m[0];

  return undefined;
}

type Components = {
  head: number; // +headwind / -tailwind
  cross: number; // +from right / -from left
  crossAbs: number;
  diffDeg: number | null; // wind - rwy (signed smallest)
  sideText: string;
};

function computeComponents(wind: WindParsed, rwyMag: number): { steady: Components; gust?: Components; note?: string } {
  // calm or 0kt
  if (wind.spdKt <= 0) {
    const z: Components = {
      head: 0,
      cross: 0,
      crossAbs: 0,
      diffDeg: null,
      sideText: "CALM",
    };
    return { steady: z, gust: wind.gustKt ? z : undefined, note: "CALM" };
  }

  // VRB: worst-case crosswind = wind speed (90°), headwind = 0
  if (wind.dirDeg === null) {
    const make = (spd: number): Components => ({
      head: 0,
      cross: spd,
      crossAbs: spd,
      diffDeg: null,
      sideText: "VRB (worst-case crosswind)",
    });
    return {
      steady: make(wind.spdKt),
      gust: wind.gustKt ? make(wind.gustKt) : undefined,
      note: "VRB：厳密計算不可 → 最大横風=風速（最悪90°想定）",
    };
  }

  const make = (spd: number): Components => {
    const diff = smallestAngleDiff(wind.dirDeg as number, rwyMag); // wind - rwy
    const rad = (Math.PI / 180) * diff;

    // 風向は「吹いてくる方向」。RWYに対しての相対成分として sin/cos を使う
    const head = spd * Math.cos(rad); // + headwind / - tailwind
    const cross = spd * Math.sin(rad); // + from right / - from left
    const crossAbs = Math.abs(cross);

    let sideText = "nearly aligned";
    if (cross > 0.5) sideText = "from RIGHT";
    if (cross < -0.5) sideText = "from LEFT";

    return {
      head,
      cross,
      crossAbs,
      diffDeg: diff,
      sideText,
    };
  };

  return {
    steady: make(wind.spdKt),
    gust: wind.gustKt ? make(wind.gustKt) : undefined,
  };
}

function fmtKt(x: number) {
  const v = Math.round(Math.abs(x));
  return `${v} kt`;
}

function fmtSignedKt(x: number, posLabel: string, negLabel: string) {
  const v = Math.round(Math.abs(x));
  if (x >= 0) return `${posLabel} ${v} kt`;
  return `${negLabel} ${v} kt`;
}

function levelBadge(level?: WxLevel) {
  const L = (level || "GREEN").toUpperCase() as WxLevel;
  const map: Record<WxLevel, { text: string; bg: string; bd: string; fg: string }> = {
    GREEN: { text: "WX LEVEL: GREEN  通常運航可（監視継続）", bg: "#e8f7ee", bd: "#bfe9cf", fg: "#0f5132" },
    AMBER: { text: "WX LEVEL: AMBER  注意（条件確認・要監視）", bg: "#fff4e5", bd: "#ffd8a8", fg: "#7a4a00" },
    RED: { text: "WX LEVEL: RED  危険（運航判断・代替検討）", bg: "#fdeaea", bd: "#f5b5b5", fg: "#842029" },
  };
  const s = map[L];
  return (
    <div style={{ display: "inline-flex", padding: "10px 14px", borderRadius: 999, background: s.bg, border: `1px solid ${s.bd}`, color: s.fg, fontWeight: 700 }}>
      {s.text}
    </div>
  );
}

function cardStyle(): React.CSSProperties {
  return {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 1px 10px rgba(0,0,0,0.03)",
  };
}

function labelStyle(): React.CSSProperties {
  return { fontSize: 12, color: "#666", fontWeight: 600, marginBottom: 6 };
}

function bigStyle(): React.CSSProperties {
  return { fontSize: 18, fontWeight: 800, letterSpacing: 0.2 };
}

export default function Page() {
  const [icao, setIcao] = useState("RJTT");
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
    const entry = RWY_DB[icaoKey];
    return entry?.runways || [];
  }, [icaoKey]);

  async function getWeather() {
    setLoading(true);
    setData(null);
    try {
      const key = normIcao(icao);
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(key)}`, { cache: "no-store" });
      const json = (await res.json()) as WxResp;
      setData(json);

      // RWY初期選択
      const list = RWY_DB[key]?.runways || [];
      if (list.length > 0) {
        setSelectedRwy(list[0].id);
        setManualRwyMag(0);
      } else {
        setSelectedRwy("");
        setManualRwyMag(0);
      }
    } catch (e: any) {
      setData({ status: "NG", error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  const metarRaw = data?.metar?.raw || "";
  const tafRaw = data?.taf?.raw || "";

  // Wind parse
  const windToken = useMemo(() => windFromMetarRaw(metarRaw), [metarRaw]);
  const windParsed = useMemo(() => parseWindFromString(windToken), [windToken]);

  // Active runway mag
  const activeRwyMag = useMemo(() => {
    if (manualRwyMag && manualRwyMag > 0) return manualRwyMag;
    const entry = RWY_DB[icaoKey];
    const r = entry?.runways?.find((x) => x.id === selectedRwy);
    return r?.magDeg || 0;
  }, [icaoKey, selectedRwy, manualRwyMag]);

  const cross = useMemo(() => {
    if (!windParsed) return null;
    if (!activeRwyMag) return null;
    return computeComponents(windParsed, activeRwyMag);
  }, [windParsed, activeRwyMag]);

  function limitStatus(v: number, limit: number) {
    if (v <= limit) return { text: "OK", color: "#0f5132", bg: "#e8f7ee", bd: "#bfe9cf" };
    if (v <= limit + 3) return { text: "CAUTION", color: "#7a4a00", bg: "#fff4e5", bd: "#ffd8a8" };
    return { text: "EXCEED", color: "#842029", bg: "#fdeaea", bd: "#f5b5b5" };
  }

  const steadyCrossAbs = cross?.steady?.crossAbs ?? null;
  const gustCrossAbs = cross?.gust?.crossAbs ?? null;

  const steadyStat = steadyCrossAbs != null ? limitStatus(steadyCrossAbs, limitSteady) : null;
  const gustStat = gustCrossAbs != null ? limitStatus(gustCrossAbs, limitGust) : null;

  return (
    <main style={{ background: "#f7f7f8", minHeight: "100vh", padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Header */}
        <div style={cardStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>ARI UI Test</div>
              <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>ICAO入力 → METAR/TAF取得 → WX注意喚起（UI先行）</div>
              <div style={{ marginTop: 12 }}>{levelBadge(data?.wx_analysis?.level)}</div>
            </div>
            <div style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
              Sources: {(data?.sources || ["metar", "taf", "aviationweather.gov"]).join(", ")}
            </div>
          </div>
        </div>

        {/* Input */}
        <div style={cardStyle()}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 280, flex: "1 1 280px" }}>
              <div style={labelStyle()}>ICAO</div>
              <input
                value={icao}
                onChange={(e) => setIcao(e.target.value.toUpperCase())}
                placeholder="RJTT / RJAA / KJFK"
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  outline: "none",
                  fontSize: 16,
                  fontWeight: 700,
                }}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "#888" }}>例: RJTT / RJAA / KJFK</div>
            </div>

            <button
              onClick={getWeather}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
                minWidth: 140,
              }}
            >
              {loading ? "Loading..." : "Get Weather"}
            </button>

            <button
              onClick={() => setShowRaw((v) => !v)}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#111",
                fontWeight: 800,
                cursor: "pointer",
                minWidth: 120,
              }}
            >
              {showRaw ? "Hide Raw" : "Show Raw"}
            </button>
          </div>
        </div>

        {/* Grid: Key Summary + METAR/TAF */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14 }}>
          {/* Key Summary */}
          <div style={cardStyle()}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>Key Summary</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ ...cardStyle(), boxShadow: "none" }}>
                <div style={labelStyle()}>Station</div>
                <div style={bigStyle()}>{icaoKey || "-"}</div>
              </div>
              <div style={{ ...cardStyle(), boxShadow: "none" }}>
                <div style={labelStyle()}>Wind</div>
                <div style={bigStyle()}>{windToken || "-"}</div>
              </div>

              <div style={{ ...cardStyle(), boxShadow: "none" }}>
                <div style={labelStyle()}>Visibility</div>
                <div style={bigStyle()}>{(metarRaw.match(/\b(\d{4})\b/)?.[1] ?? "—")}</div>
              </div>
              <div style={{ ...cardStyle(), boxShadow: "none" }}>
                <div style={labelStyle()}>QNH</div>
                <div style={bigStyle()}>{(metarRaw.match(/\bQ(\d{4})\b/)?.[1] ?? "—")}</div>
              </div>

              <div style={{ gridColumn: "1 / -1", ...cardStyle(), boxShadow: "none" }}>
                <div style={labelStyle()}>Clouds</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>
                  {metarRaw
                    ? Array.from(metarRaw.toUpperCase().matchAll(/\b(FEW|SCT|BKN|OVC)\d{3}\b/g))
                        .map((x) => x[0])
                        .join(", ") || "—"
                    : "—"}
                </div>
              </div>

              {/* ✅ ここが「雲の下に気象現象 (RA/SN/TS etc)」表示欄 */}
              <div style={{ gridColumn: "1 / -1", ...cardStyle(), boxShadow: "none" }}>
                <div style={labelStyle()}>WX (METAR)</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>
                  {metarRaw
                    ? (() => {
                        // METAR現象（簡易抽出）：-RA, +SN, TS, SHRA, FZRA, BR, FG など
                        // できるだけ「現象だけ」拾う（風/雲/QNH/温度等は除外）
                        const tokens = metarRaw
                          .toUpperCase()
                          .split(/\s+/)
                          .filter(Boolean);

                        const wx = tokens.filter((t) => {
                          // 代表的な現象パターン
                          if (/^(-|\+)?(TS|SH|FZ)?(RA|SN|DZ|SG|PL|GR|GS)(TS)?$/.test(t)) return true; // -SHRASN 等を含む
                          if (/^(TS|VCTS)$/.test(t)) return true;
                          if (/^(BR|FG|FU|HZ|DU|SA|SQ|FC|SS|DS)$/.test(t)) return true;
                          if (/^(-|\+)?(SH|FZ)?(RA|SN|DZ)$/.test(t)) return true;
                          return false;
                        });

                        return wx.length ? wx.join(", ") : "—";
                      })()
                    : "—"}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#888" }}>Updated (UTC): {data?.time || "—"}</div>
          </div>

          {/* METAR / TAF */}
          <div style={cardStyle()}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>METAR / TAF</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>原文はカード表示（折返し対応）</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ ...cardStyle(), boxShadow: "none" }}>
                <div style={labelStyle()}>METAR RAW</div>
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                  {metarRaw || "—"}
                </div>
              </div>
              <div style={{ ...cardStyle(), boxShadow: "none" }}>
                <div style={labelStyle()}>TAF RAW</div>
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                  {tafRaw || "—"}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 900 }}>判定理由（reasons） / {data?.wx_analysis?.level || "GREEN"}</div>
              <div style={{ color: "#666", fontSize: 13 }}>
                {(data?.wx_analysis?.reasons && data.wx_analysis.reasons.length > 0) ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {data.wx_analysis.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <span>—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ✅ Crosswind（RWY別 自動計算） */}
        <div style={cardStyle()}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>1️⃣ Crosswind（RWY別 自動計算）</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>METAR風（dddssKT / dddssGggKT / VRBxxKT）からRWY磁方位に対する成分を計算</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, alignItems: "end" }}>
            <div style={{ ...cardStyle(), boxShadow: "none" }}>
              <div style={labelStyle()}>Runway（DBから選択）</div>
              <select
                value={selectedRwy}
                onChange={(e) => setSelectedRwy(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd", fontWeight: 800 }}
                disabled={rwyList.length === 0}
              >
                {rwyList.length === 0 ? <option value="">(RWY DBなし)</option> : null}
                {rwyList.map((r) => (
                  <option key={r.id} value={r.id}>
                    RWY {r.id} (MAG {r.magDeg.toString().padStart(3, "0")}°)
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 6, fontSize: 12, color: "#888" }}>
                {RWY_DB[icaoKey]?.name ? `${RWY_DB[icaoKey].name}` : "空港DBが無い場合は右でManual入力"}
              </div>
            </div>

            <div style={{ ...cardStyle(), boxShadow: "none" }}>
              <div style={labelStyle()}>Manual RWY MAG（DB無い時/上書き）</div>
              <input
                type="number"
                value={manualRwyMag || ""}
                onChange={(e) => setManualRwyMag(Number(e.target.value))}
                placeholder="例: 236"
                style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd", fontWeight: 800 }}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "#888" }}>0 または空欄なら DB/選択RWY を使用</div>
            </div>

            <div style={{ ...cardStyle(), boxShadow: "none" }}>
              <div style={labelStyle()}>Crosswind Limit（kt）</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#666", fontWeight: 700 }}>Steady</div>
                  <input
                    type="number"
                    value={limitSteady}
                    onChange={(e) => setLimitSteady(Number(e.target.value))}
                    style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd", fontWeight: 800 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#666", fontWeight: 700 }}>Gust</div>
                  <input
                    type="number"
                    value={limitGust}
                    onChange={(e) => setLimitGust(Number(e.target.value))}
                    style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd", fontWeight: 800 }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ ...cardStyle(), boxShadow: "none" }}>
              <div style={labelStyle()}>Input</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>METAR Wind: {windToken || "—"}</div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>
                Active RWY MAG: {activeRwyMag ? `${activeRwyMag.toString().padStart(3, "0")}°` : "—"}
              </div>
              {cross?.note ? <div style={{ marginTop: 8, fontSize: 12, color: "#7a4a00" }}>{cross.note}</div> : null}
              {!windParsed ? <div style={{ marginTop: 8, fontSize: 12, color: "#842029" }}>METAR から風を抽出できません（形式確認）</div> : null}
              {windParsed && !activeRwyMag ? <div style={{ marginTop: 8, fontSize: 12, color: "#842029" }}>RWY MAG が未設定です（Manual入力 or DB追加）</div> : null}
            </div>

            <div style={{ ...cardStyle(), boxShadow: "none" }}>
              <div style={labelStyle()}>Result</div>

              {cross && steadyCrossAbs != null ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Steady */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>Steady</div>
                    {steadyStat ? (
                      <div style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${steadyStat.bd}`, background: steadyStat.bg, color: steadyStat.color, fontWeight: 900 }}>
                        {steadyStat.text}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>
                    Head/Tail: {fmtSignedKt(cross.steady.head, "HW", "TW")} ・ Cross: {fmtKt(cross.steady.crossAbs)} ({cross.steady.sideText})
                  </div>
                  {cross.steady.diffDeg != null ? (
                    <div style={{ fontSize: 12, color: "#666" }}>
                      Relative angle (wind - rwy): {Math.round(cross.steady.diffDeg)}°
                    </div>
                  ) : null}

                  {/* Gust */}
                  {cross.gust && gustCrossAbs != null ? (
                    <>
                      <div style={{ height: 1, background: "#eee" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 14, fontWeight: 900 }}>Gust</div>
                        {gustStat ? (
                          <div style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${gustStat.bd}`, background: gustStat.bg, color: gustStat.color, fontWeight: 900 }}>
                            {gustStat.text}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>
                        Head/Tail: {fmtSignedKt(cross.gust.head, "HW", "TW")} ・ Cross: {fmtKt(cross.gust.crossAbs)} ({cross.gust.sideText})
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "#888" }}>Gust なし</div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#888" }}>—</div>
              )}
            </div>
          </div>
        </div>

        {/* Raw JSON */}
        {showRaw ? (
          <div style={cardStyle()}>
            <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>RAW JSON</div>
            <pre style={{ margin: 0, background: "#111", color: "#e8ffe8", padding: 16, borderRadius: 12, overflow: "auto", fontSize: 12 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        ) : null}

        <div style={{ fontSize: 12, color: "#888", padding: "6px 2px" }}>
          ※ Crosswind は「METAR風 × RWY磁方位」から成分算出（VRBは最悪90°で最大横風=風速）。最終判断は運航規程・機種/滑走路条件で行ってください。
        </div>
      </div>
    </main>
  );
}
