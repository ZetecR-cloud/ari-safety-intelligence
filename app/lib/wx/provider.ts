export function getWxProviderBaseUrl() {
  // Optional: set in Vercel env
  // e.g. WX_PROVIDER_BASE_URL=https://your-provider.example.com
  const v = process.env.WX_PROVIDER_BASE_URL;
  return v && v.trim() ? v.trim().replace(/\/+$/, "") : "";
}
