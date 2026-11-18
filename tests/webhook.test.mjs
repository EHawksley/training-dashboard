import assert from "node:assert/strict";
import test from "node:test";
import {
  COOLDOWN_MS,
  SUCCESS_MESSAGE,
  isConfigured,
  loadSettings,
  normalizeSettings,
  postRunCompleted,
  runCompletedBody,
  saveSettings,
  senderKey,
  withKeyParam,
} from "../js/webhook.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test("prefixes a bare Authorization key with Bearer and keeps an existing scheme", () => {
  assert.equal(normalizeSettings({ url: " https://example.test/hook ", headerName: "", headerValue: "abc" }).headerValue, "Bearer abc");
  assert.equal(normalizeSettings({ headerName: "Authorization", headerValue: "Bearer abc" }).headerValue, "Bearer abc");
  assert.equal(normalizeSettings({ headerName: "X-Api-Key", headerValue: "abc" }).headerValue, "abc");
  assert.equal(senderKey("Bearer abc"), "abc");
});

test("settings stay in the provided storage and are configured only with an http(s) URL and a key", () => {
  const storage = memoryStorage();
  const saved = saveSettings({ url: "https://hooks.example/run", headerName: "Authorization", headerValue: "secret" }, storage);
  assert.equal(saved.headerValue, "Bearer secret");
  assert.deepEqual(loadSettings(storage).headerValue, "Bearer secret");
  assert.equal(isConfigured(saved), true);
  assert.equal(isConfigured(normalizeSettings({ url: "javascript:alert(1)", headerValue: "x" })), false);
  assert.equal(isConfigured(normalizeSettings({ url: "https://hooks.example/run", headerValue: "" })), false);
});

test("posts the run-completed body and does not retry an HTTP error", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: false, status: 401, type: "basic" };
  };
  await assert.rejects(
    () => postRunCompleted({ url: "https://hooks.example/run", headerName: "Authorization", headerValue: "Bearer secret" }, fetchImpl),
    /Webhook returned 401/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret");
  assert.equal(JSON.parse(calls[0].init.body).event, "run_completed");
  assert.equal(JSON.parse(calls[0].init.body).source, "training-dashboard");
});

test("a thrown CORS error retries once as no-cors with the key query param", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) throw new TypeError("Failed to fetch");
    return { ok: false, status: 0, type: "opaque" };
  };
  const result = await postRunCompleted(
    { url: "https://hooks.example/run", headerName: "Authorization", headerValue: "Bearer secret" },
    fetchImpl,
  );
  assert.equal(result.via, "no-cors");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.mode, "no-cors");
  assert.equal(calls[1].url, withKeyParam("https://hooks.example/run", "secret"));
  assert.match(calls[1].url, /[?&]key=secret$/);
  const body = JSON.parse(runCompletedBody(new Date("2026-11-18T03:00:00.000Z")));
  assert.equal(body.at, "2026-11-18T03:00:00.000Z");
  assert.equal(COOLDOWN_MS, 60000);
  assert.match(SUCCESS_MESSAGE, /pulling your run from Garmin/);
});
