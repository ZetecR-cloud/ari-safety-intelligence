"use client";

import React, { useMemo } from "react";

type Props = {
  tafRaw?: string;
  taf?: string;
};

type Segment = {
  kind: "BASE" | "FM" | "TEMPO" | "BECMG";
  from?: string; // 0106
  to?: string;   // 0109
  text: string;  // segment raw text
};

function norm(s: any) {
  return String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function pickTaf(props: Props) {
  // どっちでも拾えるようにする
  return norm(props.tafRaw || props.taf || "");
}

// "0106/0212" を拾う
function parseValidity(taf: string): string | null {
  const m = taf.match(/\b(\d{4})\/(\d{4})\b/);
  if (!m) return null;
  return `${m[1]}Z / ${m[2]}Z`;
}

// TAFをざっくり分割：FM / TEMPO / BECMG を境に切る（BASEは先頭）
function splitSegments(taf: string): Segment[] {
  if (!taf) return [];

  // 先頭の "TAF XXXX " を除去（あってもなくてもOK）
  const cleaned = taf.replace(/^TAF\s+[A-Z0-9]{4}\s+/i, "");

  // 境界キーワードの前で分割できるように marker を入れる
  const marked = cleaned.replace(/\s+(FM\d{6}|TEMPO\s+\d{4}\/\d{4}|BECMG\s+\d{4}\/\d{4})/g, "\n$1");

  const parts = marked
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  const out: Segment[] = [];

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];

    // FM010600
    if (/^FM\d{6}\b/.test(p)) {
      const fm = p.match(/^FM(\d{6})\b/);
      out.push({ kind: "FM", from: fm?.[1], text: p });
      continue;
    }

    // TEMPO 0106/0109
    if (/^TEMPO\s+\d{4}\/\d{4}\b/.test(p)) {
      const mm = p.match(/^TEMPO\s+(\d{4})\/(\d{4})\b/);
      out.push({ kind: "TEMPO", from: mm?.[1], to: mm?.[2], text: p });
      continue;
    }

    // BECMG 0200/0203
    if (/^BECMG\s+\d{4}\/\d{4}\b/.test(p)) {
      const mm = p.match(/^BECMG\s+(\d{4})\/(\d{4})\b/);
      out.push({ kind: "BECMG", from: mm?.[1], to: mm?.[2], text: p });
      continue;
    }

    // それ以外は BASE（最初の塊）
    // もし2つ目以降に来たら BASE扱いで追加（念のため）
    out.push({ kind: "BASE", text: p });
  }

  // BASEが複数になった場合はまとめる（先頭のBASEに結合）
  const baseIdx = out.findIndex((s) => s.kind === "BASE");
  if (baseIdx >= 0) {
    const bases = out.filter((s) => s.kind === "BASE");
    if (bases.length > 1) {
      const merged = bases.map((b) => b.text).join(" ");
      const rest = out.filter((s) => s.kind !== "BASE");
      return [{ kind: "BASE", text: merged }, ...rest];
    }
  }

  return out;
}

function pill(kind: Segment["kind"]) {
  if (kind === "BASE") return { label: "BASE", cls: "base" };
  if (kind === "FM") return { label: "FM", cls: "fm" };
  if (kind === "TEMPO") return { label: "TEMPO", cls: "tempo" };
  return { label: "BECMG", cls: "becmg" };
}

function shortWindow(seg: Segment): string {
  if (seg.kind === "FM" && seg.from) return `from ${seg.from}Z`;
  if ((seg.kind === "TEMPO" || seg.kind === "BECMG") && seg.from && seg.to) return `${seg.from}Z → ${seg.to}Z`;
  return "—";
}

export default function TafTimeline(props: Props) {
  const taf = useMemo(() => pickTaf(props), [props.tafRaw, props.taf]);
  const validity = useMemo(() => parseValidity(taf), [taf]);
  const segments = useMemo(() => splitSegments(taf), [taf]);

  // 何もない時は、原因がわかるようにガイドを出す
  if (!taf) {
    return (
      <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>TAF Timeline</div>
        <div style={{ fontSize: 12, color: "#666" }}>
          TAFが空です（APIがtafを返していないか、propsが未指定です）。
        </div>
      </div>
    );
  }

  return (
    <div className="tt">
      <div className="top">
        <div className="h">TAF Timeline（時系列）</div>
        <div className="sub">
          Validity: <b>{validity ?? "—"}</b>
        </div>
      </div>

      {/* 上段：ざっくり帯 */}
      <div className="strip">
        {segments.map((s, idx) => {
          const p = pill(s.kind);
          return (
            <div key={idx} className={`stripItem ${p.cls}`} title={s.text}>
              <div className="k">{p.label}</div>
              <div className="w">{shortWindow(s)}</div>
            </div>
          );
        })}
      </div>

      {/* 下段：詳細カード */}
      <div className="list">
        {segments.map((s, idx) => {
          const p = pill(s.kind);
          return (
            <div key={idx} className="seg">
              <div className={`tag ${p.cls}`}>{p.label}</div>
              <div className="win">{shortWindow(s)}</div>
              <div className="txt">{s.text}</div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .tt {
          width: 100%;
        }
        .top {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 10px;
          margin-bottom: 10px;
        }
        .h {
          font-size: 14px;
          font-weight: 900;
        }
        .sub {
          font-size: 12px;
          color: #666;
        }

        .strip {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .stripItem {
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 10px 10px;
          min-width: 150px;
          background: #fafbfc;
        }
        .stripItem .k {
          font-weight: 900;
          font-size: 12px;
          margin-bottom: 4px;
        }
        .stripItem .w {
          font-size: 12px;
          color: #333;
        }

        .list {
          display: grid;
          gap: 10px;
        }
        .seg {
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 12px;
          background: #fff;
        }
        .tag {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
          border: 1px solid transparent;
          margin-bottom: 6px;
        }
        .win {
          font-size: 12px;
          color: #666;
          margin-bottom: 8px;
        }
        .txt {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 12px;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.55;
          color: #111;
        }

        /* 色（控えめ） */
        .base {
          background: #f0f1f3;
          border-color: #d7dbe0;
          color: #39424e;
        }
        .tempo {
          background: #fff4e6;
          border-color: #ffd5a6;
          color: #8a4b00;
        }
        .becmg {
          background: #e9f7ee;
          border-color: #bfe7cd;
          color: #1b6b3a;
        }
        .fm {
          background: #e8f1ff;
          border-color: #bcd7ff;
          color: #0d3b8c;
        }
      `}</style>
    </div>
  );
}
