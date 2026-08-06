// SPDX-License-Identifier: GPL-3.0-or-later
// background.js - service worker.
// Owns ONE resilient WebSocket to the local bridge (ws://127.0.0.1:PORT).
// Keeping the socket here (not in the content script) avoids https→ws mixed
// content issues and centralises reconnect / timeout logic.
//
// Contract with content.js: every sendMessage ALWAYS gets a response object,
// even when the bridge is offline. The agentic loop must never hang waiting.

const PORT = 17613;
const URL = `ws://127.0.0.1:${PORT}`;

// Chat sites where an RLScript provider content script runs. Status pushes go
// to every tab matching these. Add the new provider's URL pattern here (and in
// manifest.json content_scripts + host_permissions) when integrating another AI.
const PROVIDER_URLS = ["https://chat.deepseek.com/*", "https://gemini.google.com/*", "https://www.kimi.com/*", "https://kimi.com/*", "https://chat.z.ai/*", "https://chat.qwen.ai/*", "https://arena.ai/*", "https://www.meta.ai/*", "https://meta.ai/*", "https://agent.minimax.io/*", "https://grok.com/*", "https://claude.ai/*", "https://chatgpt.com/*", "https://copilot.microsoft.com/*"];

const RECONNECT_MIN = 1000;
const RECONNECT_MAX = 5000;
const HEARTBEAT_MS = 10000;
// If no message (incl. pong) arrives within this window while we believe we're
// connected, the socket is half-open: force a reconnect instead of letting
// pending requests slowly time out.
const STALE_SOCKET_MS = 25000;
const REQUEST_TIMEOUT_DEFAULT = 130000; // a bit above the 120s tool timeout

let ws = null;
let connected = false;
let reconnectDelay = RECONNECT_MIN;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastMessageAt = 0; // timestamp of the last frame received from the bridge
let nextId = 1;
const pending = new Map(); // id -> {resolve, timer}
let toolsCache = [];
let mcpAlive = false;
let serversCache = [];
// true/false = a PLACE is loaded and usable in Roblox Studio; null = unknown.
// The MCP process stays alive when Studio is closed or its MCP option is off,
// so this is probed separately (bridge "studio_status").
let studioConnected = null;
// true/false = a Roblox Studio app is connected to the MCP server at all; null =
// unknown. studioApp=true with studioConnected=false means "Studio open but no
// place"; studioApp=false means "Studio closed OR its MCP option disabled".
let studioApp = null;
// true/false = a Roblox Studio WINDOW/PROCESS exists on this machine (checked
// bridge-side via tasklist); null = unknown/old bridge. Distinguishes the two
// studioApp=false sub-cases the UI must word differently: Studio genuinely not
// launched ("open Roblox Studio") vs Studio OPEN but its MCP plugin never
// registered with the bridge - the documented fix for the latter is opening
// Assistant Settings > MCP Servers inside Studio (validated live 3x), which
// "open Roblox Studio" wording completely fails to convey.
let studioProc = null;

function log(...a) {
  console.log("[zs-bg]", ...a);
}

// ── WebSocket lifecycle ─────────────────────────────────────────────────
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  clearTimeout(reconnectTimer);
  try {
    ws = new WebSocket(URL);
  } catch (e) {
    log("WebSocket ctor failed", e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected = true;
    reconnectDelay = RECONNECT_MIN;
    lastMessageAt = Date.now();
    log("connected to bridge");
    startHeartbeat();
    broadcastStatus();
  };

  ws.onmessage = (ev) => {
    lastMessageAt = Date.now();
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleBridgeMessage(msg);
  };

  ws.onclose = () => {
    connected = false;
    mcpAlive = false;
    studioConnected = null;
    studioApp = null;
    studioProc = null;
    serversCache = [];
    stopHeartbeat();
    failAllPending("bridge connection closed");
    broadcastStatus();
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will follow; nothing to do here but avoid an unhandled error.
    try { ws.close(); } catch {}
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.7, RECONNECT_MAX);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (connected) {
      // Half-open socket: the WS still reports OPEN but nothing comes through.
      // The pong (and every other frame) refreshes lastMessageAt; if it has
      // gone stale, drop the dead socket so onclose triggers a reconnect.
      if (lastMessageAt && Date.now() - lastMessageAt > STALE_SOCKET_MS) {
        log("socket stale, forcing reconnect");
        try { ws.close(); } catch {}
        return;
      }
      // Keeps the MV3 service worker alive AND detects a half-open socket.
      send({ type: "ping" }).catch(() => {});
      refreshStudioStatus();
    }
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// Resolve once the socket is OPEN, or false after `timeout` ms.
function waitForConnection(timeout = 8000) {
  return new Promise((resolve) => {
    if (connected && ws && ws.readyState === WebSocket.OPEN) return resolve(true);
    connect(); // nudge a (re)connection - important after a worker wake-up
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (connected && ws && ws.readyState === WebSocket.OPEN) {
        clearInterval(iv);
        resolve(true);
      } else if (Date.now() - t0 > timeout) {
        clearInterval(iv);
        resolve(false);
      }
    }, 100);
  });
}

// ── request/response over the socket ────────────────────────────────────
async function send(obj, timeout = REQUEST_TIMEOUT_DEFAULT) {
  // The MV3 service worker can be suspended; the first message after a wake-up
  // arrives before the socket has re-opened. Wait for it instead of failing -
  // otherwise Kimi wrongly hears "bridge offline".
  if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
    await waitForConnection(8000);
  }
  return new Promise((resolve) => {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, kind: "disconnected", error: "bridge not connected" });
      return;
    }
    const id = nextId++;
    const payload = { ...obj, id };
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ ok: false, kind: "timeout", error: "bridge did not respond in time" });
      }
    }, timeout);
    pending.set(id, { resolve, timer });
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ ok: false, kind: "disconnected", error: String(e) });
    }
  });
}

// Ask the bridge whether a Roblox Studio instance is actually connected to the
// MCP server. Broadcasts only on change so the UI updates promptly but quietly.
let studioProbing = false;
async function refreshStudioStatus() {
  if (studioProbing || !connected) return;
  studioProbing = true;
  try {
    const r = await send({ type: "studio_status" }, 12000);
    const v = r && r.ok && typeof r.studio === "boolean" ? r.studio : null;
    if (v !== studioConnected) {
      studioConnected = v;
      broadcastStatus();
    }
  } finally {
    studioProbing = false;
  }
}

function handleBridgeMessage(msg) {
  if ("studio" in msg && (typeof msg.studio === "boolean" || msg.studio === null)) {
    studioConnected = msg.studio;
  }
  if ("studio_app" in msg && (typeof msg.studio_app === "boolean" || msg.studio_app === null)) {
    studioApp = msg.studio_app;
  }
  if ("studio_proc" in msg && (typeof msg.studio_proc === "boolean" || msg.studio_proc === null)) {
    studioProc = msg.studio_proc;
  }
  if (msg.type === "studio_status") {
    resolvePending(msg.id, { ok: true, studio: studioConnected });
    broadcastStatus();
    return;
  }
  if (msg.type === "connected") {
    mcpAlive = !!msg.mcp_alive;
    if (Array.isArray(msg.tools)) toolsCache = msg.tools;
    if (Array.isArray(msg.servers)) {
      serversCache = msg.servers;
      chrome.storage.local.set({ zsLastServers: msg.servers });
    }
    broadcastStatus();
    return;
  }
  if (msg.type === "pong") {
    resolvePending(msg.id, { ok: true });
    return;
  }
  if (msg.type === "update_result") {
    resolvePending(msg.id, { ok: true, status: msg.status, message: msg.message });
    return;
  }
  if (msg.type === "update_applied") {
    // The bridge just replaced our files on disk (new build). Reload the
    // extension so the updated code actually runs.
    broadcastStatus();
    setTimeout(() => {
      try { chrome.runtime.reload(); } catch {}
    }, 800);
    return;
  }
  if (msg.type === "tools") {
    if (Array.isArray(msg.tools)) toolsCache = msg.tools;
    if (Array.isArray(msg.servers)) {
      serversCache = msg.servers;
      chrome.storage.local.set({ zsLastServers: msg.servers });
    }
    mcpAlive = !!msg.mcp_alive;
    resolvePending(msg.id, { ok: true, tools: toolsCache });
    broadcastStatus();
    return;
  }
  if (msg.type === "tool_result") {
    resolvePending(msg.id, msg.ok
      ? { ok: true, text: msg.text, images: msg.images || [] }
      : { ok: false, kind: msg.kind, error: msg.error });
    return;
  }
  if (msg.type === "mcp_status") {
    mcpAlive = !!msg.alive;
    if (Array.isArray(msg.tools)) toolsCache = msg.tools;
    if (Array.isArray(msg.servers)) serversCache = msg.servers;
    resolvePending(msg.id, { ok: !!msg.ok, alive: msg.alive, error: msg.error });
    broadcastStatus();
    return;
  }
  if (msg.type === "server_changed") {
    // The bridge acks, then restarts itself to reload config.json. The socket
    // will drop right after this - the content script shows a spinner until the
    // reconnect lands and a fresh status arrives.
    resolvePending(msg.id, { ok: !!msg.ok, error: msg.error, restarting: !!msg.restarting });
    return;
  }
  if (msg.type === "error") {
    resolvePending(msg.id, { ok: false, error: msg.error });
    return;
  }
}

function resolvePending(id, value) {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(value);
}

function failAllPending(reason) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, kind: "disconnected", error: reason });
  }
  pending.clear();
}

// ── status push to any open DeepSeek tab + popup ─────────────────────────
function statusObj() {
  return { type: "zs-status", connected, mcpAlive, studio: studioConnected, studioApp, studioProc, tools: toolsCache.length, servers: serversCache };
}

function broadcastStatus() {
  chrome.runtime.sendMessage(statusObj()).catch(() => {});
  chrome.tabs.query({ url: PROVIDER_URLS }, (tabs) => {
    for (const t of tabs) chrome.tabs.sendMessage(t.id, statusObj()).catch(() => {});
  });
}

// ── AI-to-AI helper (ask_ai) ─────────────────────────────────────────────
// The content script cannot fetch arbitrary APIs due to CORS, so the actual
// HTTP call happens HERE in the service worker, using the provider/model/key
// the user configured in the popup (chrome.storage.local). The key never
// leaves this process and is never included in any response text.
const ASK_AI_DEFAULTS = {
  openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  anthropic: { url: "https://api.anthropic.com/v1/messages", model: "claude-sonnet-4-5" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash" },
  deepseek: { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
  qwen: { url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-plus" },
  kimi: { url: "https://api.moonshot.cn/v1/chat/completions", model: "moonshot-v1-8k" },
};

// Chat models to list in the popup's model picker (the button replaces the old
// free-text model box): live from each provider's /models endpoint, falling
// back to these known-good ids when the API is unreachable or rejects the key.
const ASK_AI_FALLBACK_MODELS = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "gpt-4-turbo", "o3-mini", "o3"],
  anthropic: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  qwen: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-long"],
  kimi: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-latest"],
};

// Fetch the model list for a provider with the user's key. Only chat-capable
// models are kept (no embeddings/tts/vision-only tool models).
async function listAiModels(provider, key) {
  const def = ASK_AI_DEFAULTS[provider];
  if (!def) return { ok: false, error: "unknown provider: " + provider };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const chatOnly = (id) => !/embedding|tts|whisper|dall|moderation|rerank|audio|image/i.test(id);
  try {
    let res;
    if (provider === "gemini") {
      res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(key), {
        signal: controller.signal,
      });
    } else if (provider === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal: controller.signal,
      });
    } else {
      const url = provider === "qwen"
        ? "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
        : provider === "openai"
          ? "https://api.openai.com/v1/models"
          : provider === "deepseek"
            ? "https://api.deepseek.com/models"
            : "https://api.moonshot.cn/v1/models";
      res = await fetch(url, {
        headers: { authorization: "Bearer " + key },
        signal: controller.signal,
      });
    }
    const text = await res.text();
    if (!res.ok) return { ok: false, error: provider + " API error " + res.status + ": " + text.slice(0, 200) };
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: provider + " API returned non-JSON" }; }
    let models = [];
    if (provider === "gemini") {
      for (const m of data && data.models || []) {
        const id = String(m.name || "").replace(/^models\//, "");
        if (id) models.push(id);
      }
    } else {
      for (const m of data && data.data || []) {
        const id = String(m.id || "");
        if (id) models.push(id);
      }
    }
    models = models.filter(chatOnly).sort();
    if (!models.length) return { ok: false, error: provider + " API returned no models" };
    return { ok: true, models: models.slice(0, 80) };
  } catch (e) {
    const aborted = (e && e.name === "AbortError");
    return { ok: false, error: aborted ? provider + " API timed out." : provider + " API request failed: " + String(e && e.message || e).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

async function askAi(question, modelOverride) {
  const questionText = String(question || "").trim();
  if (!questionText) return { ok: false, error: "question is required." };
  const cfg = await new Promise((resolve) => {
    chrome.storage.local.get(["zsAskAiProvider", "zsAskAiModel", "zsAskAiKey"], resolve);
  });
  const provider = String(cfg.zsAskAiProvider || "").trim().toLowerCase();
  const def = ASK_AI_DEFAULTS[provider];
  if (!def) {
    return { ok: false, error: "no AI-to-AI provider configured. Open the RLScript popup, pick a provider and enter your API key (AI-to-AI help section)." };
  }
  const key = String(cfg.zsAskAiKey || "").trim();
  if (!key) {
    return { ok: false, error: "the " + provider + " API key is not set. Open the RLScript popup (AI-to-AI help) and save your key." };
  }
  const model = String(modelOverride || "").trim() || String(cfg.zsAskAiModel || "").trim() || def.model;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    let res;
    if (provider === "anthropic") {
      res = await fetch(def.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: questionText }] }),
        signal: controller.signal,
      });
    } else if (provider === "gemini") {
      res = await fetch(def.url + "/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: questionText }] }] }),
        signal: controller.signal,
      });
    } else {
      res = await fetch(def.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({ model, messages: [{ role: "user", content: questionText }], max_tokens: 4096 }),
        signal: controller.signal,
      });
    }
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: provider + " API error " + res.status + ": " + text.slice(0, 300) };
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: provider + " API returned non-JSON: " + text.slice(0, 200) };
    }
    let answer = "";
    if (provider === "gemini") {
      const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      if (parts) for (const p of parts) if (p && typeof p.text === "string") answer += p.text;
    } else {
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (typeof content === "string") answer = content;
    }
    if (!answer) return { ok: false, error: provider + " API returned no content (" + text.slice(0, 200) + ")" };
    return { ok: true, answer };
  } catch (e) {
    const aborted = (e && e.name === "AbortError");
    return { ok: false, error: aborted ? provider + " API timed out after 60s." : provider + " API request failed: " + String(e && e.message || e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Extension-side update check (works with NO bridge running) ──────────
// The release uploads a tiny build.json asset alongside the zip; the
// extension reads it (and its own packaged build.json marker) to compare
// build ids over the GitHub API alone. It cannot replace its own files, so
// when a newer build exists it flags the badge, toasts every open chat, and
// downloads the new zip; the bridge (when started) applies it for real.
const EXT_UPDATE_ALARM = "zs-ext-update-check";
const EXT_UPDATE_PERIOD_MIN = 360; // 6h
const EXT_UPDATE_API = "https://api.github.com/repos/RLRasuL/RLScript-Free/releases/latest";
const EXT_BUILD_MARKER = chrome.runtime.getURL("build.json");

async function extFetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "RLScript-Free" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function extInstalledBuild() {
  try {
    const r = await fetch(EXT_BUILD_MARKER, { cache: "no-store" });
    if (!r.ok) return "";
    const j = await r.json();
    return String(j.build || "");
  } catch {
    return "";
  }
}

// One full check: GitHub -> latest release -> its build.json asset -> compare
// with the installed marker. Returns {ok, status, message, build, downloadUrl}
async function extCheckUpdate() {
  try {
    const [rel, installed] = await Promise.all([extFetchJson(EXT_UPDATE_API), extInstalledBuild()]);
    if (!rel || typeof rel !== "object" || rel.draft || rel.prerelease) {
      return { ok: false, error: "no stable release info from GitHub" };
    }
    const assets = rel.assets || [];
    const metaAsset = assets.find((a) => a.name === "build.json") ||
      assets.find((a) => a.name.endsWith(".zip"));
    if (!metaAsset) return { ok: false, error: "release has no build metadata" };
    let remote = "";
    if (metaAsset.name === "build.json") {
      const j = await extFetchJson(metaAsset.browser_download_url || metaAsset.url);
      remote = String((j && j.build) || "");
    }
    if (!remote) return { ok: false, error: "release has no build id" };
    const zipAsset = assets.find((a) => /\.zip$/i.test(a.name) && /RLScript-Free/i.test(a.name));
    if (!installed) {
      // Installed marker missing (install predates self-updates): an update
      // is effectively available - flag it instead of staying silent.
      return { ok: true, status: "update_available", message: `Update available: build ${remote} (your copy predates self-updates)`, build: remote, downloadUrl: zipAsset ? zipAsset.browser_download_url : "" };
    }
    if (remote === installed) {
      return { ok: true, status: "up_to_date", message: `You are up to date (build ${remote})`, build: remote };
    }
    return { ok: true, status: "update_available", message: `Update available: build ${remote} (you have ${installed})`, build: remote, downloadUrl: zipAsset ? zipAsset.browser_download_url : "" };
  } catch (e) {
    return { ok: false, error: "update check failed: " + String(e && e.message || e).slice(0, 200) };
  }
}

function extNotifyTabs(state) {
  for (const pat of PROVIDER_URLS) {
    chrome.tabs.query({ url: pat }, (tabs) => {
      for (const t of tabs) {
        try { chrome.tabs.sendMessage(t.id, { type: "zs-ext-update", ...state }); } catch {}
      }
    });
  }
}

async function extUpdateCron() {
  const r = await extCheckUpdate();
  if (!r.ok) return;
  if (r.status === "update_available") {
    const prev = (await chrome.storage.local.get(["zsExtUpdateSeen"]).catch(() => ({}))).zsExtUpdateSeen || "";
    if (prev !== r.build) {
      chrome.storage.local.set({ zsExtUpdateSeen: r.build });
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#f87171" });
      if (r.downloadUrl) {
        try { chrome.downloads.download({ url: r.downloadUrl, conflictAction: "overwrite" }); } catch {}
      }
      extNotifyTabs({ status: "available", build: r.build, downloadUrl: r.downloadUrl });
    }
  } else if (r.status === "up_to_date") {
    chrome.action.setBadgeText({ text: "" });
  }
}

chrome.alarms.create(EXT_UPDATE_ALARM, { periodInMinutes: EXT_UPDATE_PERIOD_MIN });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === EXT_UPDATE_ALARM) extUpdateCron(); });

// ── messages from content.js / popup.js ─────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "status":
        if (!connected) connect(); // self-heal after a worker wake-up
        sendResponse(statusObj());
        break;
      case "ask_ai": {
        const r = await askAi(msg.question, msg.model);
        sendResponse(r);
        break;
      }
      case "list_ai_models": {
        const r = await listAiModels(
          String(msg.provider || "").trim().toLowerCase(),
          String(msg.key || "").trim()
        );
        sendResponse(r);
        break;
      }
      case "list_tools": {
        // Prefer a live refresh; fall back to cache so the loop never stalls.
        // 10s, not 25s: a catalogue request only blocks this long when one of the
        // MCP servers is dead (typically Roblox in a degraded, Blender-only
        // session), and in that exact case we already hold a perfectly good cached
        // catalogue. Waiting the full 25s just froze the boot for no new data.
        const r = await send({ type: "list_tools" }, 10000);
        if (r.ok) sendResponse({ ok: true, tools: r.tools });
        else sendResponse({ ok: toolsCache.length > 0, tools: toolsCache, error: r.error });
        break;
      }
      case "call_tool": {
        const timeout = (msg.timeout || 120000) + 10000;
        const r = await send(
          { type: "call_tool", name: msg.name, arguments: msg.arguments, timeout: msg.timeout },
          timeout
        );
        sendResponse(r);
        break;
      }
      case "restart_mcp": {
        const r = await send({ type: "restart_mcp" }, 30000);
        sendResponse(r);
        break;
      }
      case "add_server": {
        const r = await send({
          type: "add_server", server_id: msg.server_id,
          command: msg.command, args: msg.args, env: msg.env,
        }, 15000);
        sendResponse(r);
        break;
      }
      case "remove_server": {
        const r = await send({ type: "remove_server", server_id: msg.server_id }, 15000);
        sendResponse(r);
        break;
      }
      case "check_update": {
        // Bridge running -> it checks AND applies (downloads + restarts). If the
        // bridge is offline, fall back to the extension-side check so the button
        // still answers without start.bat.
        const br = await send({ type: "check_update" }, 90000);
        if (br && br.ok) { sendResponse(br); break; }
        const ext = await extCheckUpdate();
        sendResponse(ext);
        break;
      }
      case "ext_check_update": {
        const r = await extCheckUpdate();
        sendResponse(r);
        break;
      }
      case "zs-download": {
        try {
          const id = await chrome.downloads.download({ url: String(msg.url || ""), conflictAction: "overwrite" });
          sendResponse({ ok: true, downloadId: id });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        break;
      }
      case "zs-open-menu-tab": {
        // Popup Settings with no supported tab open: create one, then open the
        // in-page panel once its content script answers (survives popup close).
        chrome.tabs.create({ url: String(msg.url || "") }, (tab) => {
          if (!tab || tab.id == null) { sendResponse({ ok: false, error: "could not open tab" }); return; }
          let tries = 0;
          const timer = setInterval(() => {
            tries += 1;
            chrome.tabs.sendMessage(tab.id, { type: "zs-open-menu" }, () => {
              if (!chrome.runtime.lastError) {
                clearInterval(timer);
                sendResponse({ ok: true });
              } else if (tries >= 30) { // ~15s
                clearInterval(timer);
                sendResponse({ ok: false, error: "page did not load in time" });
              }
            });
          }, 500);
        });
        break;
      }
      case "reconnect":
        reconnectDelay = RECONNECT_MIN;
        connect();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // async sendResponse
});

// Wake/keepalive hooks.
chrome.runtime.onStartup.addListener(() => { connect(); extUpdateCron(); });
chrome.runtime.onInstalled.addListener(() => { connect(); extUpdateCron(); });

connect();
