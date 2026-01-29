"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import TafTimeline from "./components/TafTimeline";
import { airports } from "./airports";
import { judgeDispatch } from "./lib/wxJudge";

type WxLevel = "GREEN" | "AMBER" | "RED" | "UNKNOWN";

type ApiResp = {
  status?: string;
  icao?: string;
  sources?: string[];
  metar?: any;
  taf?: any;
  wx_analysis?: {
    level?: WxLevel | string;
    reasons?: string[];
    tafRisk?: {
      blocks?: Array<{ type?: string; text?: string }>;
    };
  };
  time?: string; // server time (UTC ISO)
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtZ(dt: Date) {
  // YYYY-MM-DD HH:MMZ
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}Z`;
}

function fmtInTZ(dt: Date, timeZone: string) {
  // 例: 2026-01-30 12:34 (JST)
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function levelNorm(x?: string): WxLevel {
  const u = (x ?? "").toUpperCase().trim();
  if (u === "GREEN" || u === "AMBER" || u === "RED") return u as WxLevel;
  return "UNKNOWN";
}

function levelBadge(level: WxLevel) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset";
  if (level === "GREEN") return cx(base, "bg-emerald-50 text-emerald-700 ring-emerald-200");
  if (level === "AMBER") return cx(base, "bg-amber-50 text-amber-800 ring-amber-200");
  if (level === "RED") return cx(base, "bg-rose-50 text-rose-700 ring-rose-200");
  return cx(base, "bg-slate-100 text-slate-700 ring-slate-200");
}

function reasonPriorityScore(r: string) {
  const s = r.toLowerCase();
  // 最重要を先頭にしたいものをここで固定
  const top = [
    "ts", "thunder", "cb", "turb", "wind shear", "ws", "microburst",
    "icing", "fzra", "fzdz",
    "rvr", "cat", "autoland",
    "crosswind", "tailwind",
    "contamin", "wet", "braking",
    "vis", "fog", "fg", "bkn", "ovc", "ceiling",
  ];
  for (let i = 0; i < top.length; i++) {
    if (s.includes(top[i])) return i;
  }
  return 999;
}

function highlightTAF(text: string) {
  // TAF blocks 視認性UP: FM / TEMPO / PROB を強調
  const tokens = [" FM", " TEMPO", " PROB30", " PROB40", " BECMG", " NSW"];
  let out = text;
  for (const t of tokens) {
    out = out.replaceAll(t, `\n${t.trim()} `);
  }
  return out.trim();
}

export default function Home() {
  const [query, setQuery] = useState("RJTT");
  const [open, setOpen] = useState(false);
  const [selectedIcao, setSelectedIcao] = useState("RJTT");
  const [loading, setLoading] = useState(false);
  const [api, setApi] = useState<ApiResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    // airports 側の形が不明なので、よくあるキーを “あるものだけ” 参照
    return (airports as any[])
      .map((a) => ({
        icao: String(a.icao ?? "").toUpperCase(),
        iata: String(a.iata ?? "").toUpperCase(),
        name: String(a.name ?? ""),
        city: String(a.city ?? ""),
        country: String(a.country ?? ""),
        tz: String(a.tz ?? a.timezone ?? ""), // airports.ts に tz が入っていれば使う
        raw: a,
      }))
      .filter((a) => a.icao.includes(q) || a.iata.includes(q) || a.name.toUpperCase().includes(q) || a.city.toUpperCase().includes(q))
      .slice(0, 12);
  }, [query]);

  const selectedAirport = useMemo(() => {
    const x = (airports as any[]).find((a) => String(a.icao ?? "").toUpperCase() === selectedIcao);
    if (!x) return null;
    return {
      icao: String(x.icao ?? "").toUpperCase(),
      iata: String(x.iata ?? "").toUpperCase(),
      name: String(x.name ?? ""),
      city: String(x.city ?? ""),
      country: String(x.country ?? ""),
      tz: String(x.tz ?? x.timezone ?? ""),
      raw: x,
    };
  }, [selectedIcao]);

  // UTC “いま” は端末時刻から作る（表示の基準はUTC、PCローカル時刻は表示しない）
  const [utcNow, setUtcNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setUtcNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const level = levelNorm(api?.wx_analysis?.level as any);
  const reasons = useMemo(() => {
    const rs = api?.wx_analysis?.reasons ?? [];
    return [...rs].sort((a, b) => reasonPriorityScore(a) - reasonPriorityScore(b));
  }, [api]);

  const tafBlocks = api?.wx_analysis?.tafRisk?.blocks ?? [];

  async function getWeather() {
    const icao = (query.trim().toUpperCase() || selectedIcao).slice(0, 8);
    if (!icao) return;

    setLoading(true);
    setErr(null);
    setApi(null);
    try {
      setSelectedIcao(icao);

      const res = await fetch(`/api/weather?icao=${encodeURIComponent(icao)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as ApiResp;

      // サーバーJSONだけでも判定できるけど、既存ロジックがあれば併用
      // judgeDispatch は手元の実装に合わせて “壊れない” よう try
      let judged = data;
      try {
        const j = judgeDispatch(data as any);
        judged = (j as any) ?? data;
      } catch {
        // ignore
      }

      setApi(judged);
      setOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function copyTimes() {
    const utc = fmtZ(utcNow);
    const tz = selectedAirport?.tz;
    const local = tz ? fmtInTZ(utcNow, tz) : "UNKNOWN_TZ";
    const label = selectedAirport ? `${selectedAirport.icao}${selectedAirport.tz ? ` (${selectedAirport.tz})` : ""}` : "AIRPORT";
    const text = `UTC ${utc}\n${label} ${local}`;
    await navigator.clipboard.writeText(text);
  }

  async function openPdf() {
    // /api/release が “PDF生成” ならここ。あなたの実装に合わせて path/params 変更してOK
    // 例: POST で payload を渡す形が多いので、それでも動くようにしてあります
    try {
      const payload = {
        icao: selectedIcao,
        generated_at_utc: utcNow.toISOString(),
        api,
      };

      const res = await fetch("/api/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`PDF API ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(e?.message ?? "PDF failed");
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">ARI Safety Intelligence</h1>
          <p className="mt-2 text-sm text-slate-600">
            ICAO入力 → METAR/TAF取得 → WX解析（注意喚起レベル）
          </p>
        </div>

        {/* Top controls */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Left: Input */}
          <div className="rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-600">ICAO / IATA / Name</div>

            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 120)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="RJTT"
                />

                {open && candidates.length > 0 && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    {candidates.map((c) => (
                      <button
                        key={`${c.icao}-${c.iata}-${c.name}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setQuery(c.icao || c.iata);
                          setSelectedIcao(c.icao || c.iata);
                          setOpen(false);
                          inputRef.current?.blur();
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <div className="font-semibold">
                          {c.icao || "----"}
                          {c.iata ? <span className="ml-2 text-xs text-slate-500">({c.iata})</span> : null}
                        </div>
                        <div className="text-xs text-slate-600">
                          {c.name}
                          {c.city ? ` — ${c.city}` : ""}
                          {c.country ? ` (${c.country})` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={getWeather}
                disabled={loading}
                className={cx(
                  "rounded-xl px-4 py-2 text-sm font-semibold shadow-sm",
                  loading ? "bg-slate-300 text-white" : "bg-slate-900 text-white hover:bg-slate-800"
                )}
              >
                {loading ? "Loading..." : "Get Weather"}
              </button>
            </div>

            {/* Selected */}
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <div className="text-sm font-semibold">
                {selectedAirport ? (
                  <>
                    {selectedAirport.icao}
                    {selectedAirport.iata ? ` (${selectedAirport.iata})` : ""} — {selectedAirport.name || "—"}
                  </>
                ) : (
                  <>{selectedIcao} — (unknown)</>
                )}
              </div>
              <div className="text-xs text-slate-600">
                {selectedAirport?.city ? selectedAirport.city : ""}
                {selectedAirport?.country ? ` / ${selectedAirport.country}` : ""}
              </div>
            </div>

            {/* Times */}
            <div className="mt-4 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-600">Time (copy-safe)</div>
                  <div className="mt-1 text-sm">
                    <span className="font-semibold">UTC</span> {fmtZ(utcNow)}
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">{selectedAirport?.icao ?? "AIRPORT"}</span>{" "}
                    {selectedAirport?.tz ? fmtInTZ(utcNow, selectedAirport.tz) : "Unknown TZ"}
                    {selectedAirport?.tz ? <span className="ml-2 text-xs text-slate-500">({selectedAirport.tz})</span> : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={copyTimes}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Error */}
            {err && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {err}
              </div>
            )}
          </div>

          {/* Middle: WX Level / Reasons */}
          <div className="rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">WX Level</div>
              <span className={levelBadge(level)}>{level}</span>
            </div>

            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-600">Top reasons (priority sorted)</div>
              <div className="mt-2 space-y-2">
                {reasons.length === 0 ? (
                  <div className="text-sm text-slate-500">—</div>
                ) : (
                  reasons.slice(0, 8).map((r, i) => (
                    <div key={`${i}-${r}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span className="mr-2 text-xs font-semibold text-slate-500">#{i + 1}</span>
                      {r}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* PDF button: only pop when AMBER/RED */}
            <div className="mt-4">
              <button
                type="button"
                onClick={openPdf}
                className={cx(
                  "w-full rounded-xl px-4 py-3 text-sm font-bold shadow-sm transition",
                  level === "RED"
                    ? "bg-rose-600 text-white hover:bg-rose-700"
                    : level === "AMBER"
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-slate-100 text-slate-400"
                )}
                disabled={level === "GREEN" || level === "UNKNOWN"}
                title={level === "GREEN" ? "GREEN時は目立たせない（disabled）" : "Generate dispatch-style PDF"}
              >
                PDF Dispatch (AMBER/RED)
              </button>
              <div className="mt-2 text-xs text-slate-500">
                ※ PDFが必要な状況だけ強調（AMBER/RED）。GREENは誤操作防止で非活性。
              </div>
            </div>
          </div>

          {/* Right: Evidence */}
          <div className="rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="text-sm font-semibold">Evidence</div>

            {/* METAR */}
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-600">METAR</div>
              <pre className="mt-2 max-h-28 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-emerald-200">
                {api?.metar?.raw ?? api?.metar ?? "—"}
              </pre>
            </div>

            {/* TAF */}
            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-600">TAF (raw)</div>
              <pre className="mt-2 max-h-28 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-emerald-200">
                {api?.taf?.raw ?? api?.taf ?? "—"}
              </pre>
            </div>

            {/* TAF Blocks */}
            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-600">TAF (blocks)</div>

              {tafBlocks.length === 0 ? (
                <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">—</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {tafBlocks.map((b: any, idx: number) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                          {(b.type ?? "BLK").toString().toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-500">
                          {(b.type ?? "").toString().toUpperCase() === "TEMPO"
                            ? "highest attention"
                            : (b.type ?? "").toString().toUpperCase().startsWith("PROB")
                            ? "probabilistic"
                            : ""}
                        </span>
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-800">
                        {highlightTAF(String(b.text ?? ""))}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timeline + Raw JSON */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="text-sm font-semibold">TAF Timeline (UTC)</div>
            <div className="mt-3">
              <TafTimeline blocks={tafBlocks ?? []} nowZ={utcNow} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="text-sm font-semibold">RAW JSON</div>
            <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-emerald-200">
              {api ? JSON.stringify(api, null, 2) : "—"}
            </pre>
            <div className="mt-2 text-xs text-slate-500">
              ※ “Evidence欄のスクショ” は、この RAW JSON ではなく、上の「TAF (blocks)」が見えている範囲を撮る想定です。
            </div>
          </div>
        </div>

        <div className="mt-8 text-xs text-slate-500">
          ※ “WX Level” は汎用の注意喚起（デモ）です。運航可否の最終判断はSOP/Company policy/Dispatchに従ってください。
        </div>
      </div>
    </main>
  );
}
