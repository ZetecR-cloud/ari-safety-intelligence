"use client";

type Props = {
  rawTaf: string;
};

export default function TafTimeline({ rawTaf }: Props) {
  if (!rawTaf || rawTaf.trim() === "") {
    return <div>—</div>;
  }

  const tokens = rawTaf.split(/\s+/);
  const timeline: {
    type: "BASE" | "BECMG" | "TEMPO" | "FM";
    label: string;
    period?: string;
  }[] = [];

  /* ===============================
     BASE is ALWAYS present
  ================================ */
  timeline.push({
    type: "BASE",
    label: "BASE",
  });

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t === "BECMG") {
      timeline.push({
        type: "BECMG",
        label: "BECMG",
        period: tokens[i + 1],
      });
    }

    if (t === "TEMPO") {
      timeline.push({
        type: "TEMPO",
        label: "TEMPO",
        period: tokens[i + 1],
      });
    }

    if (t.startsWith("FM")) {
      timeline.push({
        type: "FM",
        label: t,
      });
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {timeline.map((p, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #ccc",
            padding: "10px 14px",
            borderRadius: 10,
            minWidth: 110,
            background:
              p.type === "BASE"
                ? "#eef3ff"
                : p.type === "BECMG"
                ? "#e9f7ee"
                : p.type === "TEMPO"
                ? "#fff4e6"
                : "#f0f6ff",
          }}
        >
          <div style={{ fontWeight: 800 }}>{p.label}</div>
          {p.period && (
            <div style={{ fontSize: 12, marginTop: 4 }}>{p.period}</div>
          )}
        </div>
      ))}
    </div>
  );
}
