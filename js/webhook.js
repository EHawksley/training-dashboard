// Webhook settings live in localStorage. Nothing in this file is a real URL or key.

export const SETTINGS_KEY = "training-dashboard.webhook";
export const COOLDOWN_KEY = "training-dashboard.run-cooldown";
export const COOLDOWN_MS = 60_000;
export const SUCCESS_MESSAGE = "Got it — pulling your run from Garmin. The app will update in a few minutes.";

function clean(value) {
  return String(value ?? "").replace(/[\r\n]/g, "").trim();
}

export function normalizeSettings(input = {}) {
  const url = clean(input.url);
  const headerName = clean(input.headerName) || "Authorization";
  let headerValue = clean(input.headerValue);
  if (/^authorization$/i.test(headerName) && headerValue && !/^bearer\s+/i.test(headerValue)) {
    headerValue = `Bearer ${headerValue}`;
  }
  return { url, headerName, headerValue };
}

export function senderKey(headerValue) {
  return clean(headerValue).replace(/^bearer\s+/i, "");
}

export function isConfigured(settings) {
  if (!settings?.url || !settings?.headerName || !settings?.headerValue) return false;
  try {
    const url = new URL(settings.url);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function loadSettings(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return normalizeSettings();
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return normalizeSettings();
  }
}

export function saveSettings(input, storage) {
  const settings = normalizeSettings(input);
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export function runCompletedBody(now = new Date()) {
  return JSON.stringify({
    event: "run_completed",
    source: "training-dashboard",
    at: now.toISOString(),
  });
}

export function withKeyParam(url, key) {
  const next = new URL(url);
  next.searchParams.set("key", key);
  return next.toString();
}

export async function postRunCompleted(settings, fetchImpl = fetch) {
  if (!isConfigured(settings)) {
    throw new Error("Add the webhook in Settings.");
  }
  const body = runCompletedBody();
  const headers = {
    "Content-Type": "application/json",
    [settings.headerName]: settings.headerValue,
  };
  try {
    const response = await fetchImpl(settings.url, { method: "POST", headers, body });
    return acceptResponse(response);
  } catch (error) {
    if (error?.status) throw error;
    try {
      const response = await fetchImpl(withKeyParam(settings.url, senderKey(settings.headerValue)), {
        method: "POST",
        mode: "no-cors",
        headers,
        body,
      });
      if (response?.type === "opaque") return { ok: true, via: "no-cors" };
      return acceptResponse(response);
    } catch (retryError) {
      if (retryError?.status) throw retryError;
      const failure = new Error(retryError?.message || "Could not reach the webhook.");
      throw failure;
    }
  }
}

function acceptResponse(response) {
  if (response?.type === "opaque") return { ok: true, via: "opaque" };
  if (!response?.ok) {
    const error = new Error(`Webhook returned ${response?.status ?? "an error"}`);
    error.status = response?.status;
    throw error;
  }
  return { ok: true, via: "cors" };
}
