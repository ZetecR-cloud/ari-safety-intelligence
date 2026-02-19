export async function fetchJsonWithTimeout(url: string, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return { ok: false as const, status: res.status, error: text.slice(0, 2000) };
    }

    try {
      return { ok: true as const, status: res.status, data: JSON.parse(text) };
    } catch {
      return { ok: false as const, status: res.status, error: "Invalid JSON", raw: text.slice(0, 2000) };
    }
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Timeout" : (e?.message ? String(e.message) : "Fetch failed");
    return { ok: false as const, status: 0, error: msg };
  } finally {
    clearTimeout(t);
  }
}
