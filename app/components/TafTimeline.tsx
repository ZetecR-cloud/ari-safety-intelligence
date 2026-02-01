"use client";

type Props = {
  rawTaf: string;
};

type Segment = {
  type: "BASE" | "BECMG" | "TEMPO" | "FM";
  label: string;
  period?: string;
};

export default function TafTimeline({ rawTaf }: Props) {
  if (!rawTaf || rawTaf.trim() === "") {
    return <div>—</div>;
  }

  const tokens = rawTaf.split(/\s+/);
  const timeline: Segment[] = [];

  // BASE is always present
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
      {timeline.map((s, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #ccc",
            padding: "10px 12px",
            borderRadius: 8,
            minWidth: 90,
            background: "#fafafa",
          }}
        >
          <strong>{s.label}</strong>
          {s.period && <div>{s.period}</div>}
        </div>
      ))}
    </div>
  );
}
