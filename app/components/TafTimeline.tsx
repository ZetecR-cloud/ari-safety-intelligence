"use client";

import React, { useMemo, useState } from "react";
import { parseTafToSegments, type TafSegment } from "@/app/lib/wx/tafParse";

type Props = {
  tafRaw: string | null | undefined;
  now?: Date;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtLocal(d: Date) {
  // ローカル（ユーザーPC）表示：YYYY-MM-DD HH:MM
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export default function TafTimeline({ tafRaw, now }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const baseNow = now ?? new Date();

  const segs = useMemo(() => {
    const raw = (tafRaw ?? "").trim();
    if (!raw) return [] as TafSegment[];
    return parseTafToSegments(raw, baseNow);
  }, [tafRaw, baseNow]);

  const timeRange = useMemo(() => {
    if (segs.length === 0) return null;
    const start = segs[0].from;
    const end = segs[segs.length - 1].to;
    return { start, end };
  }, [segs]);

  if (!tafRaw || !tafRaw.trim()) {
    return (
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="text-sm font-semibold">TAF Timeline</div>
        <div className="mt-2 text-sm opacity-70">TAFがありません。</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">TAF Timeline</div>
          <div className="mt-1 text-xs opacity-70">
            Now: {fmtLocal(baseNow)}
            {timeRange ? ` / Range: ${fmtLocal(timeRange.start)} → ${fmtLocal(timeRange.end)}` : ""}
          </div>
        </div>

        <button
          className="rounded-xl border px-3 py-1 text-xs hover:opacity-80"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? "Hide RAW" : "Show RAW"}
        </button>
      </div>

      {/* Bars */}
      {segs.length === 0 ? (
        <div className="mt-3 text-sm opacity-70">TAFの解析に失敗しました（形式を確認してください）。</div>
      ) : (
        <div className="mt-4 space-y-2">
          {segs.map((s, idx) => (
            <SegmentRow key={`${s.kind}-${idx}-${s.from.toISOString()}`} seg={s} now={baseNow} range={timeRange} />
          ))}
        </div>
      )}

      {showRaw ? (
        <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-black/5 p-3 text-xs leading-relaxed">
{tafRaw.trim()}
        </pre>
      ) : null}
    </div>
  );
}

function SegmentRow({
  seg,
  now,
  range,
}: {
  seg: TafSegment;
  now: Date;
  range: { start: Date; end: Date } | null;
}) {
  const active = now >= seg.from && now < seg.to;

  const pct = useMemo(() => {
    if (!range) return { left: 0, width: 1 };
    const total = range.end.getTime() - range.start.getTime();
    const leftMs = seg.from.getTime() - range.start.getTime();
    const widthMs = seg.to.getTime() - seg.from.getTime();
    const left = total > 0 ? leftMs / total : 0;
    const width = total > 0 ? widthMs / total : 1;
    return { left: clamp01(left), width: clamp01(width) };
  }, [seg.from, seg.to, range]);

  const label = `${seg.kind}${seg.qual ? ` (${seg.qual})` : ""}`;

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{label}</div>
          <div className="mt-1 text-xs opacity-70">
            {seg.from.toLocaleString()} → {seg.to.toLocaleString()}
          </div>
          {seg.rawLine ? (
            <div className="mt-2 text-xs opacity-80">
              <span className="font-semibold">RAW:</span> {seg.rawLine}
            </div>
          ) : null}
        </div>

        <div className="shrink-0">
          {active ? <span className="rounded-full border px-3 py-1 text-xs">ACTIVE</span> : null}
        </div>
      </div>

      {/* timeline bar */}
      <div className="mt-3 h-3 w-full rounded-full bg-black/5">
        <div
          className={`h-3 rounded-full ${active ? "bg-black/40" : "bg-black/20"}`}
          style={{
            marginLeft: `${pct.left * 100}%`,
            width: `${pct.width * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
