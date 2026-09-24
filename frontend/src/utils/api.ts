/**
 * Resolves the backend API base URL automatically:
 * - If VITE_API_BASE_URL is explicitly set and not localhost in prod, uses it.
 * - If in local development (localhost / 127.0.0.1), uses http://localhost:8000.
 * - In deployed production on Vercel, uses "" (same-origin relative URL) so /api routes directly to Vercel serverless functions.
 */
export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "0.0.0.0");

  if (isLocalhost) {
    return envUrl && envUrl.trim() !== "" ? envUrl.replace(/\/$/, "") : "http://localhost:8000";
  }

  // In production: if envUrl is set and is NOT localhost, use it; otherwise use relative origin
  if (envUrl && envUrl.trim() !== "" && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/\/$/, "");
  }

  return "";
};
