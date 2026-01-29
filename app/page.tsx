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

  // TE
