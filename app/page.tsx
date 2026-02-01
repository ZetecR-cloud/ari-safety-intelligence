"use client";

import React, { useMemo, useState } from "react";

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

function levelStyle(level: WxLevel) {
  switch (level) {
    case "GREEN":
      return {
        badge: "bg-emerald-600 text-white",
        ring: "ring-emerald-200",
        title: "GREEN",
        sub: "通常運航可（監視継続）",
      };
    case "AMBER":
      return {
        badge: "bg-amber-500 text-white",
        ring: "ring-amber-200",
        title: "AMBER",
        sub: "注意（要監視・条件確認）",
      };
    case "RED":
      return {
        badge: "bg-red-600 text-white",
        ring: "ring-red-200",
        title: "RED",
        sub: "要判断（PIC/Dispatch Review）",
      };
    default:
      return {
        badge: "bg-zinc-500 text-white",
        ring: "ring-zinc-200",
        title: "UNKNOWN",
        sub: "判定情報が不足しています",
      };
  }
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeUpper(s: string) {
  return (s ?? "").trim().toUpperCase();
}

export default function Page() {
  // ▼あなたのAPIが違う場合ここだけ修正
  // 例: "/api/weather?icao=" など
  const API_PATH = "/api/wx?icao=";

  const [query, setQuery] = useState("RJTT");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<WxResponse | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const level: WxLevel = useMemo(() => {
    const lv = data?.wx_analysis?.level;
    if (lv === "GREEN" || lv === "AMBER" || lv === "RED") return lv;
    return data ? "UNKNOWN" : "UNKNOWN";
  }, [data]);

  const style = levelStyle(level);

  async function onFetch() {
    const q = safeUpper(query);
    if (!q) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`${API_PATH}${encodeURIComponent(q)}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${t ? `: ${t}` : ""}`);
      }

      const json = (await res.json()) as WxResponse;
      setData(json);
    } catch (e: any) {
      setErr(e?.message ?? "Fetch failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const metarRaw = data?.metar?.raw ?? "";
  const tafRaw = data?.taf ?? "";
  const reasons = data?.wx_analysis?.reasons ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                ARI Safety Intelligence
              </h1>
              <p className="text-sm text-zinc-600">
                ICAO入力 → METAR/TAF取得 → 運航注意喚起（EVA基準の見える化）
              </p>
            </div>

            {/* Big Status */}
            <div
              className={clsx(
                "rounded-2xl bg-white px-4 py-3 shadow-sm ring-1",
                style.ring
              )}
            >
              <div className="flex items-center gap-3">
                <span className={clsx("rounded-full px-3 py-1 text-sm font-semibold", style.badge)}>
                  WX LEVEL: {style.title}
                </span>
                <span className="text-sm text-zinc-600">{style.sub}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Search bar */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-700">
                ICAO / IATA / Name（現段階はICAO推奨）
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="RJTT"
                className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
              />
              <p className="mt-1 text-xs text-zinc-500">
                例: RJTT / RJAA / KJFK / KLAX
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onFetch}
                disabled={loading}
                className={clsx(
                  "rounded-xl px-5 py-3 text-sm font-semibold shadow-sm ring-1 ring-zinc-200",
                  loading ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}
              >
                {loading ? "Fetching..." : "Get Weather"}
              </button>

              <button
                onClick={() => setShowRaw((v) => !v)}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50"
              >
                {showRaw ? "Hide Raw" : "Show Raw"}
              </button>
            </div>
          </div>

          {err && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="font-semibold">Error</div>
              <div className="mt-1">{err}</div>
              <div className="mt-2 text-xs text-red-700/80">
                ※ APIのパス（API_PATH）が合っているかも確認してください
              </div>
            </div>
          )}
        </div>

        {/* Summary grid */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Key facts */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 lg:col-span-1">
            <h2 className="text-sm font-semibold text-zinc-900">Key Summary</h2>
            <div className="mt-3 space-y-3 text-sm">
              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">Station</div>
                <div className="mt-1 font-semibold">
                  {data?.icao ? safeUpper(data.icao) : "—"}
                </div>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">METAR Wind</div>
                <div className="mt-1 font-semibold">{data?.metar?.wind ?? "—"}</div>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">Visibility</div>
                <div className="mt-1 font-semibold">{data?.metar?.visibility ?? "—"}</div>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">QNH</div>
                <div className="mt-1 font-semibold">{data?.metar?.qnh ?? "—"}</div>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">Clouds</div>
                <div className="mt-1 font-semibold">
                  {(data?.metar?.clouds && data.metar.clouds.length > 0)
                    ? data.metar.clouds.join(", ")
                    : "—"}
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                Updated: {data?.time ?? "—"}
              </div>
            </div>
          </section>

          {/* METAR / TAF */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">METAR / TAF</h2>
              <div className="text-xs text-zinc-500">
                生データは下に折りたたみ表示できます
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold text-zinc-700">METAR RAW</div>
                  <span className="text-[11px] text-zinc-500">Monospace</span>
                </div>
                <pre className="whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-relaxed ring-1 ring-zinc-200">
                  {metarRaw || "—"}
                </pre>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold text-zinc-700">TAF RAW</div>
                  <span className="text-[11px] text-zinc-500">Monospace</span>
                </div>
                <pre className="whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-relaxed ring-1 ring-zinc-200">
                  {tafRaw || "—"}
                </pre>
              </div>
            </div>

            {/* Reasons */}
            <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">判定理由（reasons）</div>
                <span className={clsx("rounded-full px-3 py-1 text-xs font-semibold", style.badge)}>
                  {style.title}
                </span>
              </div>

              {reasons.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">
                  まだ理由がありません（または解析ロジックが未実装です）。
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {reasons.map((r, i) => (
                    <li key={i} className="rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200">
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Raw JSON */}
            {showRaw && (
              <div className="mt-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <div className="mb-2 text-xs font-semibold text-zinc-700">RAW JSON</div>
                <pre className="max-h-[420px] overflow-auto rounded-xl bg-white p-3 text-xs leading-relaxed ring-1 ring-zinc-200">
                  {JSON.stringify(data ?? {}, null, 2)}
                </pre>
              </div>
            )}
          </section>
        </div>

        {/* Footer note */}
        <div className="mt-6 text-xs text-zinc-500">
          ※ “WX LEVEL” は現段階では解析ロジックの出力に依存します（GREEN/AMBER/RED）。  
          ※ 次フェーズで Crosswind / BECMG / TEMPO / CB/TS を理由に自動反映します。
        </div>
      </main>
    </div>
  );
}
