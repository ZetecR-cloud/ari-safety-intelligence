"use client";

type Segment = {
  type: "BASE" | "BECMG" | "TEMPO" | "FM";
  label: string;
  period?: string;
};

type Props = {
  rawTaf: string;
};

export default function TafTimeline({ rawTaf }: Props) {
  // TAFが空ならUIは — のみ
  if (!rawTaf || rawTaf.trim() === "") {
    return <div>—</div>;
  }

  const tokens = rawTaf.split(/\s+/);

  const timeline: Segment[] = [];

  // ============================
  // BASE is always present
  // ============================
  timeline.push({ type: "BASE", label: "BASE" });

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // FM012300
    if (t.startsWith("FM")) {
      timeline.push({
        type: "FM",
        label: "FM",
        period: t.replace("FM", ""),
      });
      continue;
    }

    // TEMPO 0112/0118
    if (t === "TEMPO" && tokens[i + 1]) {
      timeline.push({
        type: "TEMPO",
        label: "TEMPO",
        period: tokens[i + 1],
      });
      continue;
    }

    // BECMG 0200/0203
    if (t === "BECMG" && tokens[i + 1]) {
      timeline.push({
        type: "BECMG",
        label: "BECMG",
        period: tokens[i + 1],
      });
      continue;
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {timeline.map((s, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #ccc",
            padding: "10px 12px",
            borderRadius: 8,
            minWidth: 100,
            background:
              s.type === "BASE"
                ? "#eef3ff"
                : s.type === "BECMG"
                ? "#e9f7ee"
                : s.type === "TEMPO"
                ? "#fff4e6"
                : "#f2e8ff",
          }}
        >
          <div style={{ fontWeight: 800 }}>{s.label}</div>
          {s.period && (
            <div style={{ fontSize: 12, marginTop: 4 }}>{s.period}</div>
          )}
        </div>
      ))}
    </div>
  );
}
