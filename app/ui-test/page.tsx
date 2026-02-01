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

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeUpper(s: string) {
  return (s ?? "").trim().toUpperCase();
}

function levelUi(level: WxLevel) {
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
        badge: "bg-zinc-600 text-white",
        ring: "ring-zinc-200",
        title: "UNKNOWN",
        sub: "判定情報が不足しています",
      };
  }
}

export default function UiTest() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<WxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const level: WxLevel = useMemo(() => {
    const lv = data?.wx_analysis?.level;
    if (lv === "GREEN" || lv === "AMBER" || lv === "RED") return lv;
    return data ? "UNKNOWN" : "UNKNOWN";
  }, [data]);

  const ui = levelUi(level);

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

  const metarRaw = data?.metar?.raw ?? "—";
  const tafRaw = data?.taf ?? "—";
  const reasons = data?.wx_analysis?.reasons ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">ARI UI Test</h1>
              <p className="text-sm text-zinc-600">
                ICAO入力 → METAR/TAF取得 → WX注意喚起（UI先行）
              </p>
            </div>

            <div
              className={clsx(
                "rounded-2xl bg-white px-4 py-3 shadow-sm ring-1",
                ui.ring
              )}
            >
              <div className="flex items-center gap-3">
                <span className={clsx("rounded-full px-3 py-1 text-sm font-semibold", ui.badge)}>
                  WX LEVEL: {ui.title}
                </span>
                <span className="text-sm text-zinc-600">{ui.sub}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Search */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-700">ICAO</label>
              <input
                value={icao}
                onChange={(e) => setIcao(e.target.value.toUpperCase())}
                placeholder="RJTT"
                className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
              />
              <p className="mt-1 text-xs text-zinc-500">例: RJTT / RJAA / KJFK</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={go}
                disabled={loading}
                className={clsx(
                  "rounded-xl px-5 py-3 text-sm font-semibold shadow-sm ring-1 ring-zinc-200",
                  loading
                    ? "bg-zinc-200 text-zinc-600"
                    : "bg-zinc-900 text-white hover:bg-zinc-800"
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
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 lg:col-span-1">
            <h2 className="text-sm font-semibold">Key Summary</h2>

            <div className="mt-3 space-y-3 text-sm">
              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">Station</div>
                <div className="mt-1 font-semibold">{data?.icao ?? "—"}</div>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">Wind</div>
                <div className="mt-1 font-semibold">{data?.metar?.wind ?? "—"}</div>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">Visibility</div>
                <div className="mt-1 font-semibold">{data?.metar?.visibility ?? "—"}</div>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">QNH</div>
                <div className="mt-1 font-semibold">{data?.metar?.qnh ?? "—"}</div>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <div className="text-xs text-zinc-500">Clouds</div>
                <div className="mt-1 font-semibold">
                  {data?.metar?.clouds?.length ? data.metar.clouds.join(", ") : "—"}
                </div>
              </div>

              <div className="text-xs text-zinc-500">Updated: {data?.time ?? "—"}</div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">METAR / TAF</h2>
              <div className="text-xs text-zinc-500">原文はカード表示（折返し対応）</div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <div className="mb-2 text-xs font-semibold text-zinc-700">METAR RAW</div>
                <pre className="whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-relaxed ring-1 ring-zinc-200">
                  {metarRaw}
                </pre>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <div className="mb-2 text-xs font-semibold text-zinc-700">TAF RAW</div>
                <pre className="whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-relaxed ring-1 ring-zinc-200">
                  {tafRaw}
                </pre>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">判定理由（reasons）</div>
                <span className={clsx("rounded-full px-3 py-1 text-xs font-semibold", ui.badge)}>
                  {ui.title}
                </span>
              </div>

              {reasons.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">
                  まだ理由がありません（解析ロジックは次フェーズで追加します）。
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

            {showRaw && (
              <div className="mt-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <div className="mb-2 text-xs font-semibold text-zinc-700">RAW JSON</div>
                <pre className="max-h-[420px] overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-green-300">
                  {JSON.stringify(data ?? {}, null, 2)}
                </pre>
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 text-xs text-zinc-500">
          ※ 次フェーズで「TAF時系列」「Crosswind」「TS/CB即RED」「Alternate minima」を追加します。
        </div>
      </main>
    </div>
  );
}
