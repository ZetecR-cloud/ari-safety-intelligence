// --- add near top of TafTimeline.tsx (inside file, outside component ok) ---
type TafSeg = {
  label: string;      // "BASE" / "TEMPO" / "BECMG" / "FM" etc
  text: string;       // raw line
  start?: Date;       // segment start (UTC)
  end?: Date;         // segment end (UTC)
};

function pad2(n: number) { return String(n).padStart(2, "0"); }

// Parse TAF validity like "0206/0312" using issue time as reference.
// We assume UTC times (TAF times are Z unless local formats, but aviation TAF standard is UTC).
function parseTafValidity(tafRaw: string): { start?: Date; end?: Date; issue?: Date } {
  // Example: "TAF AMD RJCC 020837Z 0208/0312 ..."
  const m = tafRaw.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);  // ddhhmmZ
  const v = tafRaw.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/); // ddhh/ddhh

  if (!m || !v) return {};

  const now = new Date(); // used only for month/year anchor
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based

  const issueDay = Number(m[1]), issueH = Number(m[2]), issueMin = Number(m[3]);
  const issue = new Date(Date.UTC(year, month, issueDay, issueH, issueMin, 0));

  const sd = Number(v[1]), sh = Number(v[2]);
  const ed = Number(v[3]), eh = Number(v[4]);

  let start = new Date(Date.UTC(year, month, sd, sh, 0, 0));
  let end = new Date(Date.UTC(year, month, ed, eh, 0, 0));

  // handle month roll if end < start (e.g. 3121/0109)
  if (end.getTime() < start.getTime()) {
    end = new Date(Date.UTC(year, month + 1, ed, eh, 0, 0));
  }

  // If issue date seems outside validity range by > 20 days, month roll adjustment may be needed,
  // but keep it simple for now (works for typical ops windows).
  return { start, end, issue };
}

// Extract segment window for TEMPO/BECMG like "TEMPO 0217/0300" or "BECMG 0208/0210"
function parseWindowFromText(text: string, year: number, month: number): { start?: Date; end?: Date } {
  const w = text.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/); // ddhh/ddhh
  if (!w) return {};
  const sd = Number(w[1]), sh = Number(w[2]);
  const ed = Number(w[3]), eh = Number(w[4]);
  let start = new Date(Date.UTC(year, month, sd, sh, 0, 0));
  let end = new Date(Date.UTC(year, month, ed, eh, 0, 0));
  if (end.getTime() < start.getTime()) {
    end = new Date(Date.UTC(year, month + 1, ed, eh, 0, 0));
  }
  return { start, end };
}

// Minimal block split: we keep BASE first line (header+first conditions), then split on TEMPO/BECMG/FM/PROB.
function splitTafBlocks(tafRaw: string): TafSeg[] {
  const raw = (tafRaw || "").trim();
  if (!raw) return [];

  const { start, end } = parseTafValidity(raw);
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  // Tokenize by spaces but keep "FMxxxx" attached
  const tokens = raw.replace(/\s+/g, " ").split(" ");

  const segs: TafSeg[] = [];
  let cur: TafSeg = { label: "BASE", text: "" };

  const flush = () => {
    const t = cur.text.trim();
    if (!t) return;
    // Attach windows for TEMPO/BECMG blocks when possible
    if (cur.label === "TEMPO" || cur.label === "BECMG") {
      const win = parseWindowFromText(t, year, month);
      cur.start = win.start;
      cur.end = win.end;
    }
    // For BASE: use validity window
    if (cur.label === "BASE") {
      cur.start = start;
      cur.end = end;
    }
    segs.push(cur);
  };

  // Recognize new-block starters
  const isStarter = (tok: string) =>
    tok === "TEMPO" || tok === "BECMG" || tok.startsWith("FM") || tok.startsWith("PROB");

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (isStarter(tok) && cur.text.trim() !== "") {
      flush();
      if (tok.startsWith("FM")) cur = { label: "FM", text: tok };
      else if (tok.startsWith("PROB")) cur = { label: "PROB", text: tok };
      else cur = { label: tok, text: tok };
      continue;
    }

    // Continue current
    cur.text += (cur.text ? " " : "") + tok;
  }
  flush();

  return segs;
}

// --- add inside TafTimeline component (near bottom): timeline bar renderer ---
function TimelineBar({ tafRaw }: { tafRaw: string }) {
  const { start, end } = parseTafValidity(tafRaw);
  if (!start || !end) return null;

  const segs = splitTafBlocks(tafRaw);

  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0) return null;

  const fmt = (d: Date) => `${pad2(d.getUTCDate())}/${pad2(d.getUTCHours())}Z`;

  // Ticks every 3 hours
  const ticks: Date[] = [];
  const tick = new Date(start.getTime());
  tick.setUTCMinutes(0, 0, 0);
  while (tick.getTime() <= end.getTime()) {
    ticks.push(new Date(tick.getTime()));
    tick.setUTCHours(tick.getUTCHours() + 3);
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>TAF Flow (Time Bar)</div>

      <div style={{ position: "relative", height: 44, background: "#f6f6f6", borderRadius: 12, padding: "10px 10px 8px" }}>
        {/* Base axis */}
        <div style={{ position: "absolute", left: 10, right: 10, top: 18, height: 6, background: "#e2e2e2", borderRadius: 999 }} />

        {/* Tick marks */}
        {ticks.map((t, i) => {
          const x = ((t.getTime() - start.getTime()) / totalMs) * 100;
          return (
            <div key={i} style={{ position: "absolute", left: `calc(10px + ${x}% * (100% - 20px) / 100)`, top: 10 }}>
              <div style={{ width: 1, height: 20, background: "#c8c8c8" }} />
              <div style={{ fontSize: 10, opacity: 0.75, transform: "translateX(-50%)", marginTop: 2 }}>
                {pad2(t.getUTCHours())}Z
              </div>
            </div>
          );
        })}

        {/* Segments */}
        {segs.map((s, idx) => {
          if (!s.start || !s.end) return null;
          const left = ((s.start.getTime() - start.getTime()) / totalMs) * 100;
          const width = ((s.end.getTime() - s.start.getTime()) / totalMs) * 100;

          // Only draw meaningful windows; BASE is full window -> keep but low prominence.
          const isBase = s.label === "BASE";
          const bg = isBase ? "#b9d6ff" : (s.label === "TEMPO" ? "#ffd6a6" : "#c8f3d0");
          const height = isBase ? 8 : 12;
          const top = isBase ? 17 : 14;

          return (
            <div
              key={idx}
              title={`${s.label}: ${s.text}`}
              style={{
                position: "absolute",
                left: `calc(10px + ${left}% * (100% - 20px) / 100)`,
                top,
                width: `calc(${width}% * (100% - 20px) / 100)`,
                height,
                background: bg,
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.08)",
                boxSizing: "border-box",
              }}
            />
          );
        })}

        {/* Range label */}
        <div style={{ position: "absolute", left: 10, right: 10, bottom: 6, display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.75 }}>
          <span>{fmt(start)}</span>
          <span>{fmt(end)}</span>
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
        Tips: Hover segments to see the full block text.
      </div>
    </div>
  );
}
<TimelineBar tafRaw={tafRaw} />
