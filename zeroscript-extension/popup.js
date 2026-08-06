// SPDX-License-Identifier: GPL-3.0-or-later
const SUPPORTED_HOSTS = [
  "chat.deepseek.com", "deepseek.com", "gemini.google.com", "www.kimi.com", "kimi.com",
  "chat.z.ai", "chat.qwen.ai", "arena.ai", "www.meta.ai", "meta.ai",
  "agent.minimax.io", "grok.com", "claude.ai", "chatgpt.com", "copilot.microsoft.com",
];
const DEFAULT_AI_URL = "https://chat.deepseek.com/";

document.getElementById("ver").textContent = `v${chrome.runtime.getManifest().version}`;

function render(s) {
  const dot = document.getElementById("dot");
  const state = document.getElementById("state");
  const tools = document.getElementById("tools");
  const servers = document.getElementById("servers");
  const list = s.servers || [];
  const up = list.filter((x) => x.alive).length;
  const mcpOk = s.connected && (s.mcpAlive || up > 0 || s.tools > 0);
  const studioOff = mcpOk && s.studio === false; // MCP up but no Studio attached
  const ok = mcpOk && !studioOff;
  dot.className = "dot " + (s.connected ? (ok ? "on" : "warn") : "");
  state.textContent = s.connected
    ? (ok ? "Connected · Roblox Studio ready"
        : studioOff ? "Studio not connected · enable the MCP server in Studio"
        : "Bridge OK · open Roblox Studio")
    : "Bridge offline";
  tools.textContent = s.connected ? `${s.tools || 0} tools available` : "Run bridge.py";
  servers.textContent = s.connected
    ? list.map((x) => `${x.alive ? "●" : "○"} ${x.id} (${x.alive ? x.tools + " tools" : "down"})`).join("\n")
    : "";
}

function refresh() {
  chrome.runtime.sendMessage({ type: "status" }, (s) => s && render(s));
}

document.getElementById("reconnect").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "reconnect" }, () => setTimeout(refresh, 600));
});
document.getElementById("restart").addEventListener("click", (e) => {
  e.target.textContent = "Restarting…";
  chrome.runtime.sendMessage({ type: "restart_mcp" }, () => {
    e.target.textContent = "⟳ Restart Roblox server";
    setTimeout(refresh, 600);
  });
});
document.getElementById("settings").addEventListener("click", () => {
  // Opens the in-page RLScript panel on an already-open supported AI tab first,
  // then closes this popup, so Settings feels like the extension's own page.
  chrome.tabs.query({}, (tabs) => {
    const active = tabs.find((t) => t.active && t.url && SUPPORTED_HOSTS.some((h) => t.url.includes(h)));
    const anySupported = active || tabs.find((t) => t.url && SUPPORTED_HOSTS.some((h) => t.url.includes(h)));
    if (anySupported) {
      chrome.tabs.sendMessage(anySupported.id, { type: "zs-open-menu" });
      chrome.tabs.update(anySupported.id, { active: true });
    } else {
      // No supported AI tab open: the background opens one and triggers the
      // panel once its content script is up (survives this popup closing).
      chrome.runtime.sendMessage({ type: "zs-open-menu-tab", url: DEFAULT_AI_URL });
    }
    window.close();
  });
});

// ── AI-to-AI help (ask_ai) ───────────────────────────────────────────────
// One "Choose a model" button replaces the old provider select + free-text
// model box: with a saved/entered API key it lists the models that provider's
// API actually offers; picking one stores provider+model. Provider detection
// covers the unambiguous key prefixes (AIza*/sk-ant-*); otherwise the stored
// provider is kept - the provider chips inside the dropdown switch it.
const PROVIDERS = ["openai", "anthropic", "gemini", "deepseek", "qwen", "kimi"];
const PROVIDER_NAMES = {
  openai: "OpenAI", anthropic: "Claude", gemini: "Gemini",
  deepseek: "DeepSeek", qwen: "Qwen", kimi: "Kimi",
};
const ASK_AI_MODEL_HINTS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.0-flash",
  deepseek: "deepseek-chat",
  qwen: "qwen-plus",
  kimi: "moonshot-v1-8k",
};
const FALLBACK_MODELS = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "gpt-4-turbo", "o3-mini", "o3"],
  anthropic: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  qwen: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-long"],
  kimi: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-latest"],
};

const modelBtn = document.getElementById("ai-model-btn");
const modelLabel = document.getElementById("ai-model-label");
const modelList = document.getElementById("ai-model-list");
const keyEl = document.getElementById("ai-key");
const aiStatusEl = document.getElementById("ai-status");

const stored = { provider: "openai", model: "", key: "" };

function aiStatus(text, kind) {
  aiStatusEl.textContent = text;
  aiStatusEl.className = "ai-status " + (kind || "");
}

function detectProvider(key, fallback) {
  if (!key) return fallback;
  if (/^AIza/.test(key)) return "gemini";
  if (/^sk-ant-/.test(key)) return "anthropic";
  return fallback;
}

function setLabel(model) {
  modelLabel.textContent = model || "Choose a model…";
}

function saveAskAi(provider, model, key, statusText) {
  chrome.storage.local.set({ zsAskAiProvider: provider, zsAskAiModel: model, zsAskAiKey: key }, () => {
    stored.provider = provider;
    stored.model = model;
    stored.key = key;
    setLabel(model);
    if (statusText) aiStatus(statusText, "ok");
    if (statusText) setTimeout(() => { if (aiStatusEl.textContent === statusText) aiStatusEl.textContent = ""; }, 2600);
  });
}

function renderModelList(provider, models, selModel, err) {
  modelList.innerHTML =
    `<div class="ml-head">API:${PROVIDERS.map((p) =>
      `<button type="button" class="ml-prov${p === provider ? " on" : ""}" data-prov="${p}">${PROVIDER_NAMES[p]}</button>`).join("")}</div>` +
    (err ? `<div class="ml-err">${err}</div><div class="ml-note">Showing a saved list instead - it may not include every available model.</div>` : "") +
    models.map((m) =>
      `<button type="button" class="ml-item${m === selModel ? " sel" : ""}" data-model="${m.replace(/"/g, "")}">${m}</button>`).join("") +
    (models.length ? "" : `<div class="ml-note">No models found.</div>`);
  modelList.hidden = false;
  modelList.querySelectorAll(".ml-prov").forEach((b) => b.addEventListener("click", () => {
    openModelList(b.dataset.prov);
  }));
  modelList.querySelectorAll(".ml-item").forEach((b) => b.addEventListener("click", () => {
    saveAskAi(provider, b.dataset.model, keyEl.value.trim() || stored.key, `${PROVIDER_NAMES[provider]} · ${b.dataset.model} saved`);
    modelList.hidden = true;
  }));
}

async function openModelList(providerOverride) {
  const key = keyEl.value.trim() || stored.key;
  if (!key) {
    aiStatus("Insert your API key first, then pick a model.", "err");
    keyEl.focus();
    modelList.hidden = true;
    return;
  }
  const provider = detectProvider(key, providerOverride || stored.provider);
  modelList.innerHTML = `<div class="ml-note">Loading ${PROVIDER_NAMES[provider]} models…</div>`;
  modelList.hidden = false;
  let r = null;
  try {
    r = await chrome.runtime.sendMessage({ type: "list_ai_models", provider, key });
  } catch (e) {
    r = { ok: false, error: String(e && e.message || e) };
  }
  const models = (r && r.ok && Array.isArray(r.models) && r.models.length) ? r.models : (FALLBACK_MODELS[provider] || []);
  renderModelList(provider, models, stored.model, (!r || !r.ok) ? String((r && r.error) || "could not reach the API") : "");
}

modelBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (modelList.hidden) openModelList();
  else modelList.hidden = true;
});
document.addEventListener("click", (e) => {
  if (!modelList.hidden && !modelList.contains(e.target) && e.target !== modelBtn) modelList.hidden = true;
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") modelList.hidden = true; });

document.getElementById("ai-save").addEventListener("click", () => {
  const key = keyEl.value.trim();
  const provider = detectProvider(key, stored.provider);
  saveAskAi(provider, stored.model, key, key
    ? `${PROVIDER_NAMES[provider]} saved · model: ${stored.model || ASK_AI_MODEL_HINTS[provider]}`
    : "Saved · add an API key to enable ask_ai");
});

document.getElementById("ai-clear").addEventListener("click", () => {
  chrome.storage.local.set({ zsAskAiProvider: "", zsAskAiModel: "", zsAskAiKey: "" }, () => {
    stored.provider = "openai";
    stored.model = "";
    stored.key = "";
    keyEl.value = "";
    setLabel("");
    aiStatus("Cleared", "ok");
    setTimeout(() => { if (aiStatusEl.textContent) aiStatusEl.textContent = ""; }, 2000);
  });
});

chrome.storage.local.get(["zsAskAiProvider", "zsAskAiModel", "zsAskAiKey"], (r) => {
  stored.provider = PROVIDERS.includes(r.zsAskAiProvider) ? r.zsAskAiProvider : "openai";
  stored.model = r.zsAskAiModel || "";
  stored.key = r.zsAskAiKey || "";
  keyEl.value = stored.key || "";
  setLabel(stored.model);
  if (stored.key) aiStatus(`ask_ai configured · ${PROVIDER_NAMES[stored.provider]} · ${stored.model || ASK_AI_MODEL_HINTS[stored.provider]}`, "ok");
});

// ── Syntax Shield (fix_script safety gate) ───────────────────────────────
const shieldEl = document.getElementById("syntax-shield");
chrome.storage.local.get(["zsSyntaxShield"], (r) => {
  shieldEl.checked = r.zsSyntaxShield !== false;
});
shieldEl.addEventListener("change", () => {
  chrome.storage.local.set({ zsSyntaxShield: shieldEl.checked });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "zs-status") render(msg);
});
refresh();
setInterval(refresh, 2000);
