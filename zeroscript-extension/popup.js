// SPDX-License-Identifier: GPL-3.0-or-later
const SUPPORTED_HOSTS = [
  "chat.deepseek.com", "deepseek.com", "gemini.google.com", "www.kimi.com", "kimi.com",
  "chat.z.ai", "chat.qwen.ai", "arena.ai", "www.meta.ai", "meta.ai",
  "agent.minimax.io", "grok.com", "claude.ai", "chatgpt.com", "copilot.microsoft.com",
];
const DEFAULT_AI_URL = "https://chat.deepseek.com/";

const ASK_AI_MODEL_HINTS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.0-flash",
  deepseek: "deepseek-chat",
  qwen: "qwen-plus",
  kimi: "moonshot-v1-8k",
};

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
  // so opening it doesn't require a conversation to already be started there.
  chrome.tabs.query({}, (tabs) => {
    const active = tabs.find((t) => t.active && t.url && SUPPORTED_HOSTS.some((h) => t.url.includes(h)));
    const anySupported = active || tabs.find((t) => t.url && SUPPORTED_HOSTS.some((h) => t.url.includes(h)));
    if (anySupported) {
      chrome.tabs.sendMessage(anySupported.id, { type: "zs-open-menu" });
      chrome.tabs.update(anySupported.id, { active: true });
    } else {
      chrome.tabs.create({ url: DEFAULT_AI_URL });
    }
  });
});

// ── AI-to-AI help (ask_ai) ───────────────────────────────────────────────
// Provider/model/key live in chrome.storage.local; only background.js ever
// reads the key (it performs the API call). This page just edits the fields.
const providerEl = document.getElementById("ai-provider");
const modelEl = document.getElementById("ai-model");
const keyEl = document.getElementById("ai-key");
const aiStatusEl = document.getElementById("ai-status");

function aiStatus(text, kind) {
  aiStatusEl.textContent = text;
  aiStatusEl.className = "ai-status " + (kind || "");
}

providerEl.addEventListener("change", () => {
  if (!modelEl.value || modelEl.dataset.auto) modelEl.value = ASK_AI_MODEL_HINTS[providerEl.value] || "";
  modelEl.dataset.auto = "";
  chrome.storage.local.set({ zsAskAiProvider: providerEl.value });
});

document.getElementById("ai-save").addEventListener("click", () => {
  const provider = providerEl.value;
  const model = modelEl.value.trim();
  const key = keyEl.value.trim();
  chrome.storage.local.set({
    zsAskAiProvider: provider,
    zsAskAiModel: model,
    zsAskAiKey: key,
  }, () => {
    aiStatus(key ? `${provider} saved · model: ${model || ASK_AI_MODEL_HINTS[provider]}` : "Saved · add an API key to enable ask_ai", "ok");
    setTimeout(() => { if (aiStatusEl.textContent) aiStatusEl.textContent = ""; }, 2600);
  });
});

document.getElementById("ai-clear").addEventListener("click", () => {
  chrome.storage.local.set({ zsAskAiProvider: "", zsAskAiModel: "", zsAskAiKey: "" }, () => {
    keyEl.value = "";
    aiStatus("Cleared", "ok");
    setTimeout(() => { if (aiStatusEl.textContent) aiStatusEl.textContent = ""; }, 2000);
  });
});

chrome.storage.local.get(["zsAskAiProvider", "zsAskAiModel", "zsAskAiKey"], (r) => {
  providerEl.value = ["openai", "anthropic", "gemini", "deepseek", "qwen", "kimi"].includes(r.zsAskAiProvider) ? r.zsAskAiProvider : "openai";
  modelEl.value = r.zsAskAiModel || ASK_AI_MODEL_HINTS[providerEl.value] || "";
  keyEl.value = r.zsAskAiKey || "";
  if (r.zsAskAiKey) aiStatus(`ask_ai configured for ${providerEl.value}`, "ok");
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
