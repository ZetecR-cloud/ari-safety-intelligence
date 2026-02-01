"use client";

import React, { useMemo, useState } from "react";

type WxResp = {
  status: "OK" | "NG";
  icao?: string;
  sources?: string[];
  metar?: {
    raw?: string;
    wind?: string; // ex: "03003KT" or "VRB03KT"
  };
  taf?: string;
  wx_analysis?: {
    level?: string;
    reasons?: string[];
  };
  time?: string;
};

// ====== RWY MAG HDG DB（まずは必要な空港から追加していく方式） ======
// 目安です。正確なMAG HDGはチャート/JeppのRWY表に合わせて更新してください。
const RWY_DB: Record<
  string,
  { city?: string; runways: Array<{ id: string; mag: number }> }
> = {
  RJCC: {
    city: "New Chitose",
    runways: [
      { id: "01L", mag: 010 },
      { id: "19R", mag: 190 },
      { id: "01R", mag: 010 },
      { id: "19L", mag: 190 },
    ],
  },
  RJTT: {
    city: "Tokyo Haneda",
    runways: [
      { id: "05", mag: 050 },
      { id: "23", mag: 230 },
      { id: "16L", mag: 160 },
      { id: "34R", mag: 340 },
      { id: "16R", mag: 160 },
      { id: "34L", mag: 340 },
      { id: "04", mag: 040 },
      { id: "22", mag: 220 },
    ],
  },
  RJAA: {
    city: "Narita",
    runways: [
      { id: "16R", mag: 160 },
      { id: "34L", mag: 340 },
      { id: "16L", mag: 160 },
      { id: "34R", mag: 340 },
    ],
  },
  // 必要な空港をここに追加（例）
  // KJFK: { runways: [{ id: "04L", mag: 044 }, ...] }
};

function normIcao(s: string) {
  return (s || "").trim().toUpperCase();
}

function clamp360(deg: number) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function smallestAngleDiff(a: number, b: number) {
  // a-b の最小差（-180..+180）
  const d = clamp360(a) - clamp360(b);
  const x = ((d + 540) % 360) - 180;
  return x;
}

function parseMetarWind(metarRawOrWind?: string) {
  // 入力は metar.wind（"03003KT"など） or METAR生文字列でもOK
  const s = (metarRawOrWind || "").toUpperCase();

  // VRB03KT
  let m = s.match(/\b(VRB)(\d{2,3})(G(\d{2,3}))?KT\b/);
  if (m) {
    const spd = Number(m[2]);
    const gst = m[4] ? Number(m[4]) : undefined;
    return { dir: null as number | null, spd, gst, raw: m[0] };
  }

  // 03003KT / 27010G18KT
  m = s.match(/\b(\d{3})(\d{2,3})(G(\d{2,3}))?KT\b/);
  if (m) {
    const dir = Number(m[1]);
    const spd = Number(m[2]);
    const gst = m[4] ? Number(m[4]) : undefined;
    return { dir, spd, gst, raw: m[0] };
  }

  return null;
}

function components(windDir: number, windSpd: number, rwyMag: number) {
  // 風向＝"from"、滑走路方位＝進行方向
  // angleDiff = windDir - rwyMag
  const diff = smallestAngleDiff(windDir, rwyMag);
  const rad = (Math.PI / 180) * diff;

  const head = windSpd * Math.cos(rad); // + headwind, - tailwind
  const cross = windSpd * Math.sin(rad); // + from right, - from left

  return { diff, head, cross };
}

function fmtKt(x: number) {
  const v = Math.round(Math.abs(x));
  return `${v}kt`;
}

function sideLabel(cross: number) {
  if (cross > 0.5) return "from RIGHT";
  if (cross < -0.5) return "from LEFT";
  return "nearly calm";
}

function badge(level?: string) {
  const L = (level || "").toUpperCase();
  if (L === "RED") return { text: "WX LEVEL: RED", cls: "red" };
  if (L === "AMBER") return { text: "WX LEVEL: AMBER", cls: "amber" };
  return { text: `WX LEVEL: ${L || "—"}`, cls: "green" };
}

export default function Page() {
  const [icao, setIcao] = useState("RJCC");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WxResp | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Crosswind UI
  const [manualRwyMag, setManualRwyMag] = useState<number>(0);
  const [selectedRwy, setSelectedRwy] = useState<string>("");
  const [limitSteady, setLimitSteady] = useState<number>(30);
  const [limitGust, setLimitGust] = useState<number>(35);

  const rwyList = useMemo(() => {
    const key = normIcao(icao);
    const entry = RWY_DB[key];
    return entry?.runways || [];
  }, [icao]);

  async function getWeather() {
    setLoading(true);
    setData(null);
    try {
      const key = normIcao(icao);
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(key)}`, {
        cache: "no-store",
      });
      const j = (await res.json()) as WxResp;
      setData(j);

      // 既定RWY選択
      const list = RWY_DB[key]?.runways || [];
      if (list.length > 0) setSelectedRwy(list[0].id);
      else setSelectedRwy("");
    } catch (e: any) {
      setData({ status: "NG" });
    } finally {
      setLoading(false);
    }
  }

  const metarRaw = data?.metar?.raw || "";
  const tafRaw = data?.taf || "";
  const wx = badge(data?.wx_analysis?.level);

  const windParsed = useMemo(() => {
    // まず metar.wind、なければ metar.raw から拾う
    const s = data?.metar?.wind || data?.metar?.raw || "";
    return parseMetarWind(s);
  }, [data]);

  const activeRwyMag = useMemo(() => {
    const key = normIcao(icao);
    const list = RWY_DB[key]?.runways || [];
    const found = list.find((r) => r.id === selectedRwy);
    return found?.mag ?? (manualRwyMag || 0);
  }, [icao, selectedRwy, manualRwyMag]);

  const crossResult = useMemo(() => {
    if (!windParsed) return null;

    // VRBの場合：厳密計算不可 → “最大横風=風速(steady/gust)”として提示
    if (windParsed.dir == null) {
      const steady = windParsed.spd;
      const gust = windParsed.gst ?? null;
      return {
        vrb: true,
        steadyCross: steady,
        gustCross: gust,
        steadyHead: 0,
        gustHead: gust ? 0 : null,
        diff: null,
      };
    }

    const steady = components(windParsed.dir, windParsed.spd, activeRwyMag);
    const gust =
      windParsed.gst != null
        ? components(windParsed.dir, windParsed.gst, activeRwyMag)
        : null;

    return {
      vrb: false,
      steadyCross: steady.cross,
      steadyHead: steady.head,
      gustCross: gust ? gust.cross : null,
      gustHead: gust ? gust.head : null,
      diff: steady.diff,
    };
  }, [windParsed, activeRwyMag]);

  const crossSteadyAbs = crossResult ? Math.abs(crossResult.steadyCross) : 0;
  const crossGustAbs =
    crossResult && crossResult.gustCross != null
      ? Math.abs(crossResult.gustCross)
      : null;

  const xwSteadyOk = crossResult ? crossSteadyAbs <= limitSteady : true;
  const xwGustOk =
    crossGustAbs == null ? true : crossGustAbs <= (limitGust || limitSteady);

  const tailwindSteady =
    crossResult && !crossResult.vrb ? crossResult.steadyHead < -0.5 : false;
  const tailwindGust =
    crossResult && !crossResult.vrb && crossResult.gustHead != null
      ? crossResult.gustHead < -0.5
      : false;

  return (
    <div className="wrap">
      <div className="card">
        <div className="title">ARI UI Test</div>
        <div className="sub">
          ICAO入力 → METAR/TAF取得 → WX注意喚起（UI先行）
        </div>

        <div className={`wx ${wx.cls}`}>{wx.text}</div>
        <div className="sources">
          Sources: {data?.sources?.join(", ") || "—"}
        </div>
      </div>

      <div className="card">
        <div className="row">
          <div className="col">
            <div className="label">ICAO</div>
            <input
              value={icao}
              onChange={(e) => setIcao(e.target.value)}
              placeholder="RJTT / RJAA / RJCC"
            />
            <div className="hint">例: RJTT / RJAA / KJFK</div>
          </div>

          <button className="btn" onClick={getWeather} disabled={loading}>
            {loading ? "Loading..." : "Get Weather"}
          </button>

          <button className="btn2" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? "Hide Raw" : "Show Raw"}
          </button>
        </div>
      </div>

      <div className="grid2">
        {/* Key Summary */}
        <div className="card">
          <div className="h2">Key Summary</div>

          <div className="kgrid">
            <div className="kbox">
              <div className="k">Station</div>
              <div className="v">{normIcao(data?.icao || icao) || "—"}</div>
            </div>
            <div className="kbox">
              <div className="k">Wind</div>
              <div className="v">
                {windParsed ? windParsed.raw : data?.metar?.wind || "—"}
              </div>
            </div>
            <div className="kbox">
              <div className="k">Visibility</div>
              <div className="v">{/* metar parse簡易：raw内の 9999 */}</div>
              <div className="v2">
                {(() => {
                  const m = (metarRaw || "").toUpperCase().match(/\b(\d{4})\b/);
                  return m ? m[1] : "—";
                })()}
              </div>
            </div>
            <div className="kbox">
              <div className="k">QNH</div>
              <div className="v2">
                {(() => {
                  const m = (metarRaw || "").toUpperCase().match(/\bQ(\d{4})\b/);
                  return m ? m[1] : "—";
                })()}
              </div>
            </div>

            <div className="kbox wide">
              <div className="k">Clouds</div>
              <div className="v2">
                {(() => {
                  const s = (metarRaw || "").toUpperCase();
                  const clouds = s.match(/\b(FEW|SCT|BKN|OVC)\d{3}\b/g);
                  return clouds ? clouds.join(", ") : "—";
                })()}
              </div>
            </div>

            <div className="kbox wide">
              <div className="k">WX (METAR)</div>
              <div className="v2">
                {(() => {
                  // 雑に天気現象っぽいトークンを抽出（-RA, SN, TS など）
                  const s = (metarRaw || "").toUpperCase();
                  const tokens = s.split(/\s+/).filter(Boolean);

                  // 典型例だけ拾う（必要に応じて追加可能）
                  const wxCandidates = tokens.filter((t) =>
                    /^(VC)?(TS|SH)?(RA|SN|PL|GR|GS|DZ|SG|IC|UP)|^(TSRA|TSSN|SHRA|SHSN|FZRA|FZDZ)|^(BR|FG|FU|DU|SA|HZ)|^(-|\+)?(RA|SN|TS|SHRA|SHSN|FZRA|FZDZ)$/.test(
                      t
                    )
                  );

                  // METARの "RMK" 以降は切る
                  const rmkIdx = tokens.indexOf("RMK");
                  const scoped =
                    rmkIdx >= 0 ? tokens.slice(0, rmkIdx) : tokens;

                  const wx2 = scoped.filter((t) =>
                    /^(-|\+)?(TS|SH)?(RA|SN|PL|GR|GS|DZ|SG)|^(TSRA|TSSN|SHRA|SHSN|FZRA|FZDZ)|^(BR|FG|HZ)$/.test(
                      t
                    )
                  );

                  const use = wx2.length ? wx2 : wxCandidates;
                  return use.length ? use.join(", ") : "—";
                })()}
              </div>
            </div>
          </div>

          <div className="muted">
            Updated (UTC): {data?.time || "—"}
          </div>
        </div>

        {/* METAR/TAF RAW + reasons */}
        <div className="card">
          <div className="h2">METAR / TAF</div>
          <div className="sub2">原文はカード表示（折返し対応）</div>

          <div className="two">
            <div className="raw">
              <div className="rawh">METAR RAW</div>
              <div className="mono">{metarRaw || "—"}</div>
            </div>
            <div className="raw">
              <div className="rawh">TAF RAW</div>
              <div className="mono">{tafRaw || "—"}</div>
            </div>
          </div>

          <div className="hr" />

          <div className="reasons">
            <div className="rttl">
              判定理由（reasons） / <b>{data?.wx_analysis?.level || "—"}</b>
            </div>
            <ul>
              {(data?.wx_analysis?.reasons || []).length ? (
                data!.wx_analysis!.reasons!.map((r, i) => <li key={i}>{r}</li>)
              ) : (
                <li>（現状は簡易判定のみ。次フェーズで拡張します）</li>
              )}
            </ul>
          </div>

          {showRaw && (
            <>
              <div className="hr" />
              <div className="raw">
                <div className="rawh">RAW JSON</div>
                <pre className="mono">{JSON.stringify(data, null, 2)}</pre>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Crosswind */}
      <div className="card">
        <div className="h2">Crosswind（RWY別）</div>
        <div className="sub2">
          METAR wind → RWY MAG HDG → Head/Cross（steady / gust）を自動計算
        </div>

        <div className="row2">
          <div className="col2">
            <div className="label">RWY</div>
            {rwyList.length ? (
              <select
                value={selectedRwy}
                onChange={(e) => setSelectedRwy(e.target.value)}
              >
                {rwyList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} (MAG {String(r.mag).padStart(3, "0")})
                  </option>
                ))}
              </select>
            ) : (
              <>
                <div className="hint">
                  RWY DB未登録: manual MAG HDG を入力してください
                </div>
                <input
                  type="number"
                  value={manualRwyMag || 0}
                  onChange={(e) => setManualRwyMag(Number(e.target.value))}
                  placeholder="ex: 160"
                />
              </>
            )}
            <div className="hint">
              Active RWY MAG: <b>{String(activeRwyMag).padStart(3, "0")}</b>
            </div>
          </div>

          <div className="col2">
            <div className="label">Limit（steady / gust）</div>
            <div className="row3">
              <input
                type="number"
                value={limitSteady}
                onChange={(e) => setLimitSteady(Number(e.target.value))}
                placeholder="steady"
              />
              <input
                type="number"
                value={limitGust}
                onChange={(e) => setLimitGust(Number(e.target.value))}
                placeholder="gust"
              />
            </div>
            <div className="hint">
              gustが無い場合は steady のみ評価
            </div>
          </div>
        </div>

        <div className="xwBox">
          {!windParsed ? (
            <div className="muted">
              まだ風が取れていません（Get Weather を押してください）
            </div>
          ) : crossResult?.vrb ? (
            <div className="xwGrid">
              <div className="xcell">
                <div className="k">Wind</div>
                <div className="v2">{windParsed.raw}</div>
                <div className="muted">VRBのため角度計算は不可</div>
              </div>
              <div className={`xcell ${xwSteadyOk ? "ok" : "ng"}`}>
                <div className="k">Max Crosswind（steady）</div>
                <div className="v2">{windParsed.spd}kt</div>
                <div className="muted">
                  ≤ {limitSteady}kt : {xwSteadyOk ? "OK" : "EXCEED"}
                </div>
              </div>
              <div
                className={`xcell ${
                  windParsed.gst == null
                    ? "na"
                    : xwGustOk
                    ? "ok"
                    : "ng"
                }`}
              >
                <div className="k">Max Crosswind（gust）</div>
                <div className="v2">{windParsed.gst ?? "—"}kt</div>
                <div className="muted">
                  ≤ {limitGust}kt :{" "}
                  {windParsed.gst == null ? "—" : xwGustOk ? "OK" : "EXCEED"}
                </div>
              </div>
            </div>
          ) : (
            <div className="xwGrid">
              <div className="xcell">
                <div className="k">Wind</div>
                <div className="v2">{windParsed.raw}</div>
                <div className="muted">
                  Angle diff:{" "}
                  {crossResult?.diff != null
                    ? `${Math.round(crossResult.diff)}°`
                    : "—"}
                </div>
              </div>

              <div className={`xcell ${tailwindSteady ? "warn" : "ok"}`}>
                <div className="k">Head/Tail（steady）</div>
                <div className="v2">
                  {tailwindSteady
                    ? `TAIL ${fmtKt(crossResult!.steadyHead)}`
                    : `HEAD ${fmtKt(crossResult!.steadyHead)}`}
                </div>
                <div className="muted">
                  {tailwindSteady ? "Tailwind present" : "No tailwind"}
                </div>
              </div>

              <div className={`xcell ${xwSteadyOk ? "ok" : "ng"}`}>
                <div className="k">Crosswind（steady）</div>
                <div className="v2">
                  {fmtKt(crossResult!.steadyCross)}{" "}
                  <span className="muted">({sideLabel(crossResult!.steadyCross)})</span>
                </div>
                <div className="muted">
                  ≤ {limitSteady}kt : {xwSteadyOk ? "OK" : "EXCEED"}
                </div>
              </div>

              <div className={`xcell ${tailwindGust ? "warn" : "na"}`}>
                <div className="k">Head/Tail（gust）</div>
                <div className="v2">
                  {crossResult!.gustHead == null
                    ? "—"
                    : tailwindGust
                    ? `TAIL ${fmtKt(crossResult!.gustHead)}`
                    : `HEAD ${fmtKt(crossResult!.gustHead)}`}
                </div>
                <div className="muted">
                  {crossResult!.gustHead == null
                    ? "No gust"
                    : tailwindGust
                    ? "Tailwind present"
                    : "No tailwind"}
                </div>
              </div>

              <div
                className={`xcell ${
                  crossResult!.gustCross == null ? "na" : xwGustOk ? "ok" : "ng"
                }`}
              >
                <div className="k">Crosswind（gust）</div>
                <div className="v2">
                  {crossResult!.gustCross == null
                    ? "—"
                    : `${fmtKt(crossResult!.gustCross)} `}
                  <span className="muted">
                    {crossResult!.gustCross == null
                      ? ""
                      : `(${sideLabel(crossResult!.gustCross)})`}
                  </span>
                </div>
                <div className="muted">
                  ≤ {limitGust}kt :{" "}
                  {crossResult!.gustCross == null ? "—" : xwGustOk ? "OK" : "EXCEED"}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="muted2">
          ※RWY MAG HDGは空港/滑走路ごとにDB化してください（RNAV/Jepp/最新チャート基準推奨）。
        </div>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 1100px;
          margin: 22px auto;
          padding: 0 14px 40px;
          background: #f6f7f9;
        }
        .card {
          background: #fff;
          border: 1px solid #e8e9ee;
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 14px;
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02);
        }
        .title {
          font-size: 28px;
          font-weight: 900;
          margin-bottom: 6px;
        }
        .sub {
          color: #666;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .sub2 {
          color: #666;
          font-size: 12px;
          margin-bottom: 12px;
        }
        .sources {
          margin-top: 10px;
          font-size: 12px;
          color: #777;
        }
        .wx {
          display: inline-block;
          padding: 10px 14px;
          border-radius: 999px;
          font-weight: 900;
          font-size: 13px;
          border: 1px solid transparent;
        }
        .wx.green {
          background: #e9f7ee;
          border-color: #bfe7cd;
          color: #1b6b3a;
        }
        .wx.amber {
          background: #fff4e6;
          border-color: #ffd5a6;
          color: #8a4b00;
        }
        .wx.red {
          background: #ffe8e8;
          border-color: #ffbcbc;
          color: #8a0000;
        }

        .row {
          display: flex;
          gap: 12px;
          align-items: flex-end;
          flex-wrap: wrap;
        }
        .col {
          flex: 1;
          min-width: 260px;
        }
        .label {
          font-size: 12px;
          font-weight: 800;
          color: #555;
          margin-bottom: 6px;
        }
        input,
        select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e3e6ee;
          border-radius: 12px;
          font-size: 14px;
          outline: none;
        }
        .hint {
          font-size: 12px;
          color: #777;
          margin-top: 6px;
        }
        .btn {
          padding: 11px 14px;
          border-radius: 12px;
          border: 1px solid #111;
          background: #111;
          color: #fff;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn2 {
          padding: 11px 14px;
          border-radius: 12px;
          border: 1px solid #e3e6ee;
          background: #fff;
          color: #111;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }

        .grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 980px) {
          .grid2 {
            grid-template-columns: 1fr;
          }
        }

        .h2 {
          font-size: 18px;
          font-weight: 900;
          margin-bottom: 10px;
        }

        .kgrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .kbox {
          border: 1px solid #eef0f5;
          border-radius: 12px;
          padding: 12px;
          background: #fafbfc;
        }
        .kbox.wide {
          grid-column: 1 / -1;
        }
        .k {
          font-size: 12px;
          font-weight: 900;
          color: #666;
          margin-bottom: 6px;
        }
        .v {
          font-size: 14px;
          font-weight: 900;
        }
        .v2 {
          font-size: 14px;
          font-weight: 900;
          word-break: break-word;
        }
        .muted,
        .muted2 {
          margin-top: 10px;
          color: #777;
          font-size: 12px;
        }

        .two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 980px) {
          .two {
            grid-template-columns: 1fr;
          }
        }
        .raw {
          border: 1px solid #eef0f5;
          border-radius: 12px;
          padding: 12px;
          background: #fafbfc;
        }
        .rawh {
          font-weight: 900;
          font-size: 12px;
          margin-bottom: 8px;
          color: #555;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
            "Courier New", monospace;
          font-size: 12px;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.55;
          color: #111;
        }
        .hr {
          height: 1px;
          background: #eef0f5;
          margin: 14px 0;
        }
        .reasons .rttl {
          font-weight: 900;
          margin-bottom: 8px;
        }
        ul {
          margin: 0;
          padding-left: 18px;
          color: #333;
          font-size: 13px;
        }

        /* Crosswind */
        .row2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        @media (max-width: 980px) {
          .row2 {
            grid-template-columns: 1fr;
          }
        }
        .col2 {
          border: 1px solid #eef0f5;
          border-radius: 12px;
          padding: 12px;
          background: #fafbfc;
        }
        .row3 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .xwBox {
          border: 1px solid #eef0f5;
          border-radius: 12px;
          padding: 12px;
          background: #fff;
        }
        .xwGrid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        @media (max-width: 980px) {
          .xwGrid {
            grid-template-columns: 1fr;
          }
        }
        .xcell {
          border: 1px solid #eef0f5;
          border-radius: 12px;
          padding: 12px;
          background: #fafbfc;
        }
        .xcell.ok {
          background: #e9f7ee;
          border-color: #bfe7cd;
        }
        .xcell.ng {
          background: #ffe8e8;
          border-color: #ffbcbc;
        }
        .xcell.warn {
          background: #fff4e6;
          border-color: #ffd5a6;
        }
        .xcell.na {
          background: #f5f6f8;
          border-color: #e8e9ee;
        }
      `}</style>
    </div>
  );
}
