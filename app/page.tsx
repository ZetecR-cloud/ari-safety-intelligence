"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AIRPORTS } from "./airports";

type WxApiResponse = {
  status: string;
  icao: string;
  sources?: string[];
  metar?: {
    raw?: string | null;
    wind?: string | null;
    visibility?: string | null;
    qnh?: string | null;
    clouds?: string[] | null;
  };
  taf?: string | null;
  wx_analysis?: { level?: string; reasons?: string[] };
  time?: string;
  raw?: any; // 互換用（以前のレスポンスが混在しても落ちない）
};

type Wind = {
  dirDeg: number | null; // null=VRB
  speedKt: number | null;
  gustKt: number | null;
  raw: string | null;
};

type RunwayItem = {
  id: string; // "34L"など
  headingDeg: number; // 340など
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseWindFromMetarRaw(metarRaw: string | null | undefined): Wind {
  if (!metarRaw) return { dirDeg: null, speedKt: null, gustKt: null, raw: null };
  // 例: 03009KT / 34010G20KT / VRB03KT
  const m = metarRaw.match(/\b(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT\b/);
  if (!m) return { dirDeg: null, speedKt: null, gustKt: null, raw: null };
  const dirToken = m[1];
  const spd = Number(m[2]);
  const gust = m[4] ? Number(m[4]) : null;
  return {
    dirDeg: dirToken === "VRB" ? null : Number(dirToken),
    speedKt: Number.isFinite(spd) ? spd : null,
    gustKt: gust,
    raw: m[0] ?? null,
  };
}

function angleDiffDeg(a: number, b: number) {
  // smallest difference 0..180
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function computeWindComponents(
  windDirDeg: number,
  windKt: number,
  runwayHeadingDeg: number
) {
  const diff = angleDiffDeg(windDirDeg, runwayHeadingDeg);
  const rad = (diff * Math.PI) / 180;
  const head = windKt * Math.cos(rad); // + = headwind, - = tailwind
  const cross = windKt * Math.sin(rad);
  return { diffDeg: diff, headKt: head, crossKt: cross };
}

function parseTafSignals(tafRaw: string | null | undefined) {
  const t = tafRaw ?? "";
  const hasTEMPO = /\bTEMPO\b/.test(t);
  const hasBECMG = /\bBECMG\b/.test(t);
  const hasPROB = /\bPROB(30|40)\b/.test(t);

  // TS / CB / SHRAなど（簡易）
  const hasTS = /\bTS\b|\bTSRA\b|\bVCTS\b/.test(t);
  const hasCB = /\bCB\b/.test(t);
  const hasSHRA = /\bSHRA\b|\bRA\b/.test(t);

  // 風ガスト/強風の兆候（簡易）
  const hasGust = /\bG\d{2,3}KT\b/.test(t);
  const strongWind = /\b(\d{3}|VRB)\d{2,3}KT\b/.test(t) && /\b(\d{3})\d{2,3}KT\b/.test(t);

  return {
    hasTEMPO,
    hasBECMG,
    hasPROB,
    hasTS,
    hasCB,
    hasSHRA,
    hasGust,
    strongWind,
  };
}

type Decision = {
  color: "GREEN" | "AMBER" | "RED";
  reasons: string[];
};

function decisionFrom(
  crossKt: number | null,
  tailKt: number | null,
  limitCross: number,
  limitTail: number,
  taf: ReturnType<typeof parseTafSignals>,
  tempoRiskPolicy: "AMBER" | "RED"
): Decision {
  const reasons: string[] = [];

  let color: Decision["color"] = "GREEN";

  if (crossKt != null && crossKt > limitCross) {
    color = "RED";
    reasons.push(`Crosswind ${crossKt.toFixed(1)}kt > Limit ${limitCross}kt`);
  }
  if (tailKt != null && tailKt > limitTail) {
    color = "RED";
    reasons.push(`Tailwind ${tailKt.toFixed(1)}kt > Limit ${limitTail}kt`);
  }

  // TAFのリスクを加点
  if (taf.hasTS) {
    color = color === "RED" ? "RED" : "AMBER";
    reasons.push("TAF: Thunderstorm (TS) risk");
  }
  if (taf.hasCB) {
    color = color === "RED" ? "RED" : "AMBER";
    reasons.push("TAF: CB present risk");
  }

  // TEMPO/BECMGは「トレンド注意」扱い
  if (taf.hasTEMPO) {
    if (tempoRiskPolicy === "RED" && color !== "RED") color = "RED";
    else if (color === "GREEN") color = "AMBER";
    reasons.push("TAF: TEMPO (temporary deterioration) present");
  }
  if (taf.hasBECMG) {
    if (color === "GREEN") color = "AMBER";
    reasons.push("TAF: BECMG (trend/change) present");
  }
  if (taf.hasPROB) {
    if (color === "GREEN") color = "AMBER";
    reasons.push("TAF: PROB30/40 present");
  }

  if (reasons.length === 0) reasons.push("No major limiting factors detected (basic logic).");
  return { color, reasons };
}

function pillClasses(color: Decision["color"]) {
  if (color === "GREEN") return "bg-emerald-600/20 text-emerald-200 border-emerald-500/30";
  if (color === "AMBER") return "bg-amber-600/20 text-amber-200 border-amber-500/30";
  return "bg-rose-600/20 text-rose-200 border-rose-500/30";
}

function cardBorder(color: Decision["color"]) {
  if (color === "GREEN") return "border-emerald-500/30";
  if (color === "AMBER") return "border-amber-500/30";
  return "border-rose-500/30";
}

export default function Page() {
  const [query, setQuery] = useState("RJTT");
  const [selectedICAO, setSelectedICAO] = useState("RJTT");

  const [limitCross, setLimitCross] = useState(20); // kt
  const [limitTail, setLimitTail] = useState(10); // kt（簡易）
  const [tempoRiskPolicy, setTempoRiskPolicy] = useState<"AMBER" | "RED">("AMBER");

  const [runways, setRunways] = useState<RunwayItem[]>([
    { id: "34", headingDeg: 340 },
    { id: "16", headingDeg: 160 },
  ]);
  const [selectedRunwayId, setSelectedRunwayId] = useState<string>("34");

  const [data, setData] = useState<WxApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return AIRPORTS.filter((a) => {
      const hay = `${a.icao} ${a.iata} ${a.name} ${a.city}`.toUpperCase();
      return hay.includes(q);
    }).slice(0, 8);
  }, [query]);

  const selectedAirport = useMemo(() => {
    return AIRPORTS.find((a) => a.icao === selectedICAO.toUpperCase()) ?? null;
  }, [selectedICAO]);

  async function fetchWx(icao: string) {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(icao)}`, { cache: "no-store" });
      const json = (await res.json()) as WxApiResponse;
      setData(json);
    } catch (e: any) {
      setErr(e?.message ?? "Fetch failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWx(selectedICAO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metarRaw = data?.metar?.raw ?? (data as any)?.raw?.raw ?? null;
  const tafRaw = data?.taf ?? (data as any)?.raw?.taf ?? null;

  const wind = useMemo(() => parseWindFromMetarRaw(metarRaw), [metarRaw]);
  const tafSignals = useMemo(() => parseTafSignals(tafRaw), [tafRaw]);

  const selectedRunway = useMemo(
    () => runways.find((r) => r.id === selectedRunwayId) ?? runways[0],
    [runways, selectedRunwayId]
  );

  const rwyTable = useMemo(() => {
    // VRBは最悪ケースとして 90deg 横風扱い（保守的）
    const baseDir = wind.dirDeg ?? (selectedRunway ? (selectedRunway.headingDeg + 90) % 360 : 0);
    const baseSpd = wind.speedKt ?? 0;
    const gustSpd = wind.gustKt ?? null;

    return runways.map((r) => {
      const base = computeWindComponents(baseDir, baseSpd, r.headingDeg);
      const gust = gustSpd != null ? computeWindComponents(baseDir, gustSpd, r.headingDeg) : null;

      const cross = Math.abs(base.crossKt);
      const tail = Math.max(0, -base.headKt); // tailwind only
      const crossG = gust ? Math.abs(gust.crossKt) : null;
      const tailG = gust ? Math.max(0, -gust.headKt) : null;

      const decision = decisionFrom(
        crossG ?? cross,
        tailG ?? tail,
        limitCross,
        limitTail,
        tafSignals,
        tempoRiskPolicy
      );

      return {
        rwy: r.id,
        headingDeg: r.headingDeg,
        diffDeg: base.diffDeg,
        headKt: base.headKt,
        crossKt: base.crossKt,
        crossAbs: cross,
        tailKt: tail,
        crossAbsG: crossG,
        tailKtG: tailG,
        decision,
      };
    });
  }, [runways, wind.dirDeg, wind.speedKt, wind.gustKt, limitCross, limitTail, tafSignals, tempoRiskPolicy, selectedRunway]);

  const chosen = useMemo(() => rwyTable.find((x) => x.rwy === selectedRunwayId) ?? rwyTable[0], [rwyTable, selectedRunwayId]);

  const topDecision = chosen?.decision ?? { color: "GREEN", reasons: ["—"] };

  function addRunway() {
    const n = runways.length + 1;
    setRunways([...runways, { id: `RWY${n}`, headingDeg: 0 }]);
    setSelectedRunwayId(`RWY${n}`);
  }

  function updateRunway(idx: number, patch: Partial<RunwayItem>) {
    setRunways((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRunway(idx: number) {
    setRunways((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const fallback = next[0]?.id ?? "";
      if (selectedRunwayId === prev[idx]?.id) setSelectedRunwayId(fallback);
      return next.length ? next : [{ id: "RWY", headingDeg: 0 }];
    });
  }

  const dispatchText = useMemo(() => {
    const now = new Date().toISOString();
    const windLine = wind.raw ? `WIND: ${wind.raw}` : `WIND: N/A`;
    const limLine = `LIMITS: XWIND ${limitCross}kt / TAIL ${limitTail}kt`;
    const chosenLine = chosen
      ? `RWY ${chosen.rwy} HDG ${chosen.headingDeg}° | XWIND ${chosen.crossAbs.toFixed(1)}kt${chosen.crossAbsG != null ? ` (G ${chosen.crossAbsG.toFixed(1)}kt)` : ""} | TAIL ${chosen.tailKt.toFixed(1)}kt${chosen.tailKtG != null ? ` (G ${chosen.tailKtG.toFixed(1)}kt)` : ""}`
      : "RWY: N/A";

    const risk = [
      tafSignals.hasTS ? "TS" : null,
      tafSignals.hasCB ? "CB" : null,
      tafSignals.hasTEMPO ? "TEMPO" : null,
      tafSignals.hasBECMG ? "BECMG" : null,
      tafSignals.hasPROB ? "PROB" : null,
    ].filter(Boolean);

    return [
      `DISPATCH RELEASE (WX)`,
      `TIME: ${now}`,
      `APT: ${selectedICAO.toUpperCase()}${selectedAirport ? ` (${selectedAirport.name})` : ""}`,
      windLine,
      limLine,
      chosenLine,
      `GO/NO-GO: ${topDecision.color}`,
      `ALERTS: ${risk.length ? risk.join(", ") : "None"}`,
      ``,
      `METAR: ${metarRaw ?? "N/A"}`,
      `TAF: ${tafRaw ?? "N/A"}`,
      ``,
      `REASONS:`,
      ...topDecision.reasons.map((r) => `- ${r}`),
    ].join("\n");
  }, [chosen, limitCross, limitTail, metarRaw, selectedAirport, selectedICAO, tafRaw, tafSignals, topDecision.color, topDecision.reasons, wind.raw]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              ARI Safety Intelligence
            </h1>
            <p className="text-zinc-400">
              METAR / TAF → Trend + Alerts + RWY Crosswind → GO/NO-GO
            </p>
          </div>

          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${pillClasses(topDecision.color)}`}>
            <span className="text-xs font-semibold">GO/NO-GO</span>
            <span className="text-sm font-bold">{topDecision.color}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Airport picker */}
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold">Airport</div>
            <div className="mt-2 relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                placeholder="ICAO / IATA / City (e.g., RJTT, HND, Taipei)"
                className="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-white/20"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-xl">
                  {suggestions.map((s) => (
                    <button
                      key={s.icao}
                      onClick={() => {
                        setSelectedICAO(s.icao);
                        setQuery(s.icao);
                        fetchWx(s.icao);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5"
                    >
                      <span className="font-semibold">{s.icao}</span>
                      <span className="text-zinc-400">{s.iata} • {s.city}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  const icao = query.trim().toUpperCase();
                  if (!icao) return;
                  setSelectedICAO(icao);
                  fetchWx(icao);
                }}
                className="flex-1 rounded-xl bg-white text-zinc-900 px-3 py-2 text-sm font-semibold hover:opacity-90"
              >
                {loading ? "Loading..." : "Fetch WX"}
              </button>
              <button
                onClick={() => fetchWx(selectedICAO)}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
                title="Refresh"
              >
                ↻
              </button>
            </div>

            <div className="mt-3 text-xs text-zinc-400">
              {data?.time ? `Updated: ${data.time}` : "—"}
              {err ? <div className="mt-1 text-rose-300">Error: {err}</div> : null}
            </div>
          </div>

          {/* Limits */}
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold">Limits</div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400">
                Crosswind Limit (kt)
                <input
                  type="number"
                  value acclamp={undefined as any}
                  value={limitCross}
                  onChange={(e) => setLimitCross(clamp(Number(e.target.value || 0), 0, 99))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/20"
                />
              </label>

              <label className="text-xs text-zinc-400">
                Tailwind Limit (kt)
                <input
                  type="number"
                  value={limitTail}
                  onChange={(e) => setLimitTail(clamp(Number(e.target.value || 0), 0, 30))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/20"
                />
              </label>
            </div>

            <div className="mt-3">
              <div className="text-xs text-zinc-400">TEMPO risk policy</div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setTempoRiskPolicy("AMBER")}
                  className={`rounded-xl px-3 py-2 text-sm border ${tempoRiskPolicy === "AMBER" ? "bg-white text-zinc-900 border-white/20" : "border-white/10 hover:bg-white/5"}`}
                >
                  AMBER
                </button>
                <button
                  onClick={() => setTempoRiskPolicy("RED")}
                  className={`rounded-xl px-3 py-2 text-sm border ${tempoRiskPolicy === "RED" ? "bg-white text-zinc-900 border-white/20" : "border-white/10 hover:bg-white/5"}`}
                >
                  RED
                </button>
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                * TEMPOは「一時的悪化」。保守運用なら RED を推奨。
              </div>
            </div>
          </div>

          {/* METAR/TAF quick */}
          <div className={`rounded-2xl border bg-zinc-900/40 p-4 ${cardBorder(topDecision.color)}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">WX Snapshot</div>
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${pillClasses(topDecision.color)}`}>
                {topDecision.color}
              </div>
            </div>

            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-3">
                <div className="text-xs text-zinc-400">METAR</div>
                <div className="mt-1 break-words">{metarRaw ?? "—"}</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-3">
                <div className="text-xs text-zinc-400">TAF</div>
                <div className="mt-1 break-words">{tafRaw ?? "—"}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                {tafSignals.hasTS && <span className="rounded-full border border-rose-500/30 bg-rose-600/20 px-3 py-1 text-xs text-rose-200">⛈ TS</span>}
                {tafSignals.hasCB && <span className="rounded-full border border-rose-500/30 bg-rose-600/20 px-3 py-1 text-xs text-rose-200">CB</span>}
                {tafSignals.hasTEMPO && <span className="rounded-full border border-amber-500/30 bg-amber-600/20 px-3 py-1 text-xs text-amber-200">TEMPO</span>}
                {tafSignals.hasBECMG && <span className="rounded-full border border-amber-500/30 bg-amber-600/20 px-3 py-1 text-xs text-amber-200">BECMG</span>}
                {tafSignals.hasPROB && <span className="rounded-full border border-amber-500/30 bg-amber-600/20 px->
                  3 py-1 text-xs text-amber-200">PROB</span>}
                {!tafSignals.hasTS && !tafSignals.hasCB && !tafSignals.hasTEMPO && !tafSignals.hasBECMG && !tafSignals.hasPROB && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-600/20 px-3 py-1 text-xs text-emerald-200">No major TAF flags</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RWY Crosswind table */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Runways</div>
              <button
                onClick={addRunway}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
              >
                + Add RWY
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {runways.map((r, idx) => (
                <div key={r.id} className="flex gap-2 items-center">
                  <input
                    value={r.id}
                    onChange={(e) => updateRunway(idx, { id: e.target.value.toUpperCase() })}
                    className="w-24 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-white/20"
                    placeholder="34L"
                  />
                  <input
                    type="number"
                    value={r.headingDeg}
                    onChange={(e) => updateRunway(idx, { headingDeg: clamp(Number(e.target.value || 0), 0, 359) })}
                    className="w-28 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-white/20"
                    placeholder="340"
                  />
                  <button
                    onClick={() => setSelectedRunwayId(r.id)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                      selectedRunwayId === r.id
                        ? "bg-white text-zinc-900 border-white/20"
                        : "border-white/10 hover:bg-white/5"
                    }`}
                  >
                    Select
                  </button>
                  <button
                    onClick={() => removeRunway(idx)}
                    className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
                    title="Remove"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/60 p-3 text-sm">
              <div className="text-xs text-zinc-400">Wind (from METAR)</div>
              <div className="mt-1">
                {wind.raw ? wind.raw : "N/A"}{" "}
                {wind.dirDeg == null && wind.raw ? <span className="text-amber-200"> (VRB → conservative calc)</span> : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
            <div className="text-sm font-semibold">RWY Crosswind (auto)</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-400">
                  <tr>
                    <th className="py-2 text-left">RWY</th>
                    <th className="py-2 text-right">HDG</th>
                    <th className="py-2 text-right">XWIND</th>
                    <th className="py-2 text-right">TAIL</th>
                    <th className="py-2 text-right">GO/NO-GO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rwyTable.map((row) => (
                    <tr key={row.rwy} className={row.rwy === selectedRunwayId ? "bg-white/5" : ""}>
                      <td className="py-2 font-semibold">{row.rwy}</td>
                      <td className="py-2 text-right text-zinc-300">{row.headingDeg}°</td>
                      <td className="py-2 text-right">
                        {row.crossAbs.toFixed(1)}
                        {row.crossAbsG != null ? <span className="text-zinc-400"> (G {row.crossAbsG.toFixed(1)})</span> : null}
                      </td>
                      <td className="py-2 text-right">
                        {row.tailKt.toFixed(1)}
                        {row.tailKtG != null ? <span className="text-zinc-400"> (G {row.tailKtG.toFixed(1)})</span> : null}
                      </td>
                      <td className="py-2 text-right">
                        <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${pillClasses(row.decision.color)}`}>
                          {row.decision.color}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={`mt-4 rounded-xl border bg-zinc-950/60 p-3 ${cardBorder(topDecision.color)}`}>
              <div className="text-xs text-zinc-400">Decision details (selected RWY)</div>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-zinc-200">
                {topDecision.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Dispatch Release */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">Dispatch Release (WX)</div>
              <div className="text-xs text-zinc-400">
                Copy/paste ready. (This is a simplified advisory tool, not an operational approval.)
              </div>
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(dispatchText);
                alert("Copied Dispatch Release to clipboard.");
              }}
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:opacity-90"
            >
              Copy
            </button>
          </div>

          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-950/60 p-4 text-xs text-zinc-200">
{dispatchText}
          </pre>
        </div>

        {/* Footer */}
        <div className="mt-8 text-xs text-zinc-500">
          Notes: Crosswind/headwind is computed with basic trig using METAR wind. VRB wind is treated conservatively.
          For real ops: use company SOP, runway magnetic heading, gust/peak, braking action, and crew qualification minima.
        </div>
      </div>
    </main>
  );
}
