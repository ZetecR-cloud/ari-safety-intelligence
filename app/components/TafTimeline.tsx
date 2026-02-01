"use client";

type Props = { rawTaf: string };

type Seg = {
  type: "BASE" | "FM" | "TEMPO" | "BECMG";
  label: string;
  period?: string;
};

function norm(s: string) {
  return (s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

export default function TafTimeline({ rawTaf }: Props) {
  const taf = norm(rawTaf);

  // ✅ TAF が無い時も UI は壊さない
  if (!taf) {
    return <div style={{ color: "#666" }}>TAF: —</div>;
  }

  const tokens = taf.split(" ");

  // ✅ BASEは必ず出す（ここが主目的）
  const timeline: Seg[] = [{ type: "BASE", label: "BASE" }];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // FM012300
    if (t.startsWith("FM") && /^FM\d{6}$/.test(t)) {
      timeline.push({ type: "FM", label: t });
      continue;
    }

    // TEMPO 0116/0118
    if (t === "TEMPO" && tokens[i + 1] && /^\d{4}\/\d{4}$/.test(tokens[i + 1])) {
      timeline.push({ type: "TEMPO", label: "TEMPO", period: tokens[i + 1] });
      i++;
      continue;
    }

    // BECMG 0200/0203
    if (t === "BECMG" && tokens[i + 1] && /^\d{4}\/\d{4}$/.test(tokens[i + 1])) {
      timeline.push({ type: "BECMG", label: "BECMG", period: tokens[i + 1] });
      i++;
      continue;
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {timeline.map((s, idx) => (
        <div
          key={idx}
          style={{
            border: "1px solid #ccc",
            padding: "10px 12px",
            borderRadius: 8,
            minWidth: 110,
            background:
              s.type === "BASE"
                ? "#eef3ff"
                : s.type === "BECMG"
                ? "#e9f7ee"
                : s.type === "TEMPO"
                ? "#fff4e6"
                : "#f2f8ff"
          }}
        >
          <div style={{ fontWeight: 800 }}>{s.label}</div>
          {s.period && <div style={{ fontSize: 12, marginTop: 4 }}>{s.period}</div>}
        </div>
      ))}
    </div>
  );
}
