export type TafSegmentKind = "BASE" | "FM" | "BECMG" | "TEMPO" | "PROB";

export type TafSegment = {
  kind: TafSegmentKind;
  qual?: string; // e.g. PROB30
  from: Date;
  to: Date;
  rawLine?: string;
};

function toUtcDateSafe(y: number, mo1: number, d: number, hh: number, mm: number) {
  // month is 1-based
  return new Date(Date.UTC(y, mo1 - 1, d, hh, mm, 0, 0));
}

function addHoursUtc(dt: Date, h: number) {
  return new Date(dt.getTime() + h * 3600_000);
}

function guessMonthRoll(y: number, mo: number, day: number, baseUtc: Date) {
  // If day is far behind base date day, assume next month (handles month end).
  const baseDay = baseUtc.getUTCDate();
  const baseMo = baseUtc.getUTCMonth() + 1;
  const baseY = baseUtc.getUTCFullYear();

  let yy = y;
  let mm = mo;

  if (mo === baseMo) {
    if (day + 7 < baseDay) {
      mm = baseMo + 1;
      yy = baseY;
      if (mm === 13) {
        mm = 1;
        yy = baseY + 1;
      }
    }
  }
  return { yy, mm };
}

function parseValidity(taf: string, baseNow: Date) {
  // e.g. 0512/0618 (DDHH/DDHH)
  const m = taf.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/);
  if (!m) return null;

  const dd1 = Number(m[1]);
  const hh1 = Number(m[2]);
  const dd2 = Number(m[3]);
  const hh2 = Number(m[4]);

  const baseUtc = new Date(baseNow.getTime());
  const y = baseUtc.getUTCFullYear();
  const mo = baseUtc.getUTCMonth() + 1;

  const a = guessMonthRoll(y, mo, dd1, baseUtc);
  const b = guessMonthRoll(a.yy, a.mm, dd2, baseUtc);

  const from = toUtcDateSafe(a.yy, a.mm, dd1, hh1, 0);
  const to = toUtcDateSafe(b.yy, b.mm, dd2, hh2, 0);

  return { from, to };
}

function splitTokens(taf: string) {
  return taf
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function parseTafToSegments(tafRaw: string, baseNow: Date): TafSegment[] {
  const taf = tafRaw.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const validity = parseValidity(taf, baseNow);

  // If no validity, we can still create a single BASE block around "now"
  const defaultFrom = new Date(Date.UTC(baseNow.getUTCFullYear(), baseNow.getUTCMonth(), baseNow.getUTCDate(), baseNow.getUTCHours(), 0, 0, 0));
  const defaultTo = addHoursUtc(defaultFrom, 24);

  const tafFrom = validity?.from ?? defaultFrom;
  const tafTo = validity?.to ?? defaultTo;

  // Segment boundaries by tokens: FMddhhmm, BECMG ddhh/ddhh, TEMPO ddhh/ddhh, PROB30/40 + TEMPO...
  const tokens = splitTokens(taf);

  // Build "events" to cut segments
  type Cut = { kind: TafSegmentKind; qual?: string; at: Date; rawLine: string };
  const cuts: Cut[] = [];

  // helper: parse FMddhhmm
  const reFM = /^FM(\d{2})(\d{2})(\d{2})$/;

  // helper: parse ddhh/ddhh
  const reRange = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/;

  // We'll reconstruct raw lines by scanning tokens and taking a small window.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    const fm = t.match(reFM);
    if (fm) {
      const dd = Number(fm[1]);
      const hh = Number(fm[2]);
      const mm = Number(fm[3]);

      const baseUtc = tafFrom; // anchor at validity start
      const y = baseUtc.getUTCFullYear();
      const mo = baseUtc.getUTCMonth() + 1;
      const r = guessMonthRoll(y, mo, dd, baseUtc);
      const at = toUtcDateSafe(r.yy, r.mm, dd, hh, mm);

      cuts.push({
        kind: "FM",
        at,
        rawLine: tokens.slice(i, Math.min(i + 8, tokens.length)).join(" "),
      });
      continue;
    }

    if (t === "BECMG" || t === "TEMPO") {
      const next = tokens[i + 1] ?? "";
      const rng = next.match(reRange);
      if (rng) {
        const dd1 = Number(rng[1]);
        const hh1 = Number(rng[2]);
        const dd2 = Number(rng[3]);
        const hh2 = Number(rng[4]);

        const baseUtc = tafFrom;
        const y = baseUtc.getUTCFullYear();
        const mo = baseUtc.getUTCMonth() + 1;

        const a = guessMonthRoll(y, mo, dd1, baseUtc);
        const b = guessMonthRoll(a.yy, a.mm, dd2, baseUtc);

        const at = toUtcDateSafe(a.yy, a.mm, dd1, hh1, 0);

        cuts.push({
          kind: t as TafSegmentKind,
          at,
          rawLine: tokens.slice(i, Math.min(i + 10, tokens.length)).join(" "),
        });

        // We also create an explicit segment for TEMPO/BECMG range later using "at" as start; end will be range end.
        // We store end in a separate list by encoding in rawLine; final end is derived when assembling.
        continue;
      }
    }

    if (/^PROB(30|40)$/.test(t)) {
      // PROB30 may be followed by a ddhh/ddhh or TEMPO ddhh/ddhh
      const qual = t;
      const t2 = tokens[i + 1] ?? "";
      const t3 = tokens[i + 2] ?? "";
      const candidate = t2.match(reRange) ? t2 : t3.match(reRange) ? t3 : "";
      const rng = candidate ? candidate.match(reRange) : null;

      if (rng) {
        const dd1 = Number(rng[1]);
        const hh1 = Number(rng[2]);

        const baseUtc = tafFrom;
        const y = baseUtc.getUTCFullYear();
        const mo = baseUtc.getUTCMonth() + 1;
        const a = guessMonthRoll(y, mo, dd1, baseUtc);

        const at = toUtcDateSafe(a.yy, a.mm, dd1, hh1, 0);

        cuts.push({
          kind: "PROB",
          qual,
          at,
          rawLine: tokens.slice(i, Math.min(i + 12, tokens.length)).join(" "),
        });
      }
    }
  }

  // Always include a BASE at tafFrom
  cuts.push({ kind: "BASE", at: tafFrom, rawLine: "BASE" });

  // Sort cuts by time
  cuts.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Deduplicate same timestamps/kinds
  const uniq: Cut[] = [];
  for (const c of cuts) {
    const last = uniq[uniq.length - 1];
    if (last && last.at.getTime() === c.at.getTime() && last.kind === c.kind && last.qual === c.qual) continue;
    uniq.push(c);
  }

  // Build segments: each cut start to next cut start; clamp to [tafFrom, tafTo]
  const segs: TafSegment[] = [];
  for (let i = 0; i < uniq.length; i++) {
    const cur = uniq[i];
    const next = uniq[i + 1];

    const from = cur.at < tafFrom ? tafFrom : cur.at;
    const to = next ? (next.at > tafTo ? tafTo : next.at) : tafTo;

    if (to > from) {
      segs.push({
        kind: cur.kind,
        qual: cur.qual,
        from,
        to,
        rawLine: cur.rawLine,
      });
    }
  }

  return segs;
}

