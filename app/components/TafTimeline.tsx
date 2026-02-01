"use client";

type Props = {
  rawTaf: string;
};

export default function TafTimeline({ rawTaf }: Props) {
  if (!rawTaf) {
    return <div>—</div>;
  }

  const tokens = rawTaf.split(/\s+/);
  const timeline: any[] = [];

  // ✅ BASEは必ず存在
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
    <div style={{ display: "flex", gap: 12 }}>
      {timeline.map((p, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #999",
            padding: 12,
            borderRadius: 6,
            minWidth: 90,
          }}
        >
          <strong>{p.label}</strong>
          {p.period && <div>{p.period}</div>}
        </div>
      ))}
    </div>
  );
}

