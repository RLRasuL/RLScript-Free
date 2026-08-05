// SPDX-License-Identifier: GPL-3.0-or-later
// providers/modern.js - MiniMax Agent, Arena Agent, Grok, ChatGPT, Claude, and Copilot
// web adapters.
//
// These sites are all React-style applications whose DOM changes more often
// than the older provider sites. Keep the selectors here deliberately semantic:
// data-testid, aria labels, data-role and message-id attributes first, with
// conservative fallbacks for minor redesigns.
// eslint-disable-next-line no-unused-vars
const ZSProvider = (() => {
  "use strict";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let diag = () => {};
  const host = location.hostname.replace(/^www\./, "");

  const SITE = host === "agent.minimax.io"
    ? {
        id: "minimax",
        displayName: "MiniMax",
        editor: '[data-testid="message-textarea"]',
        item:
          '[data-testid="message-item"],[data-testid="chat-message"],' +
          '[data-testid*="conversation-message"],[data-message-id]',
        send:
          '[data-testid="send-button"],button[aria-label="Send message"],' +
          'button[aria-label="Send"]',
        stop:
          '[data-testid*="stop"],button[aria-label="Stop generation"],' +
          'button[aria-label="Stop"]',
        thinking:
          '[data-testid*="thinking"],[data-testid*="reasoning"],' +
          '[class*="thinking"],[class*="reasoning"]',
        reply:
          '[data-testid="message-content"],[data-testid*="message-content"],' +
          '[class*="markdown"],[class*="prose"]',
        fresh: /^\/(?:|home)?$/,
      }
    : host === "arena.ai" && /^\/agent(?:\/|$)/.test(location.pathname)
      ? {
          id: "arena-agent",
          displayName: "Arena Agent",
          editor: '[contenteditable].tiptap.ProseMirror',
          item:
            '[data-message-id],[data-testid*="message"],' +
            '[data-testid*="turn"],[data-role="assistant"],[data-role="user"],' +
            'article,[class*="prose"]',
          send:
            'button[aria-label="Send message"],[data-testid="send-button"]',
          stop:
            'button[aria-label="Stop generation"],[data-testid*="stop"]',
          thinking:
            '[data-testid*="thinking"],[data-testid*="reasoning"],' +
            '[class*="thinking"],[class*="reasoning"]',
          reply:
            '[data-testid="message-content"],[data-testid*="message-content"],' +
            '[class*="markdown"],[class*="prose"]',
          fresh: /^\/agent(?:\/|$)/,
        }
    : host === "grok.com"
      ? {
          id: "grok",
          displayName: "Grok",
          editor:
            '[data-testid="chat-input"],textarea[aria-label*="Grok"],' +
            'form textarea[placeholder]',
          item:
            '[data-testid="conversation-turn"],[data-testid="message"],' +
            '[data-message-id],[data-testid*="message"],article',
          send:
            '[data-testid="chat-submit"],button[aria-label="Send"],' +
            'button[aria-label="Gönder"]',
          stop:
            '[data-testid="chat-stop"],[data-testid*="stop"],' +
            'button[aria-label="Stop"],button[aria-label="Durdur"]',
          thinking:
            '[data-testid*="thinking"],[data-testid*="reasoning"],' +
            '[class*="thinking"],[class*="reasoning"]',
          reply:
            '[data-testid="message-content"],[data-testid*="message-content"],' +
            '[class*="markdown"],[class*="prose"]',
          fresh: /^\/(?:|new|chat)?$/,
        }
      : host === "chatgpt.com"
        ? {
            id: "chatgpt",
            displayName: "ChatGPT",
            editor:
              '[role="textbox"][contenteditable][aria-label*="ChatGPT"],' +
              '[contenteditable]#prompt-textarea',
            item:
              '[data-message-author-role="user"],' +
              '[data-message-author-role="assistant"],' +
              '[data-testid^="conversation-turn"],article',
            send:
              '[data-testid="send-button"],button[aria-label="Send message"],' +
              'button[aria-label="Send prompt"],' +
              'button[aria-label="Prompt g\u00f6nder"]',
            stop:
              '[data-testid="stop-button"],[data-testid*="stop"],' +
              'button[aria-label*="Stop" i]',
            thinking:
              '[data-testid*="thinking"],[data-testid*="reasoning"],' +
              '[class*="thinking"],[class*="reasoning"]',
            reply:
              '[data-testid="message-content"],[data-testid*="message-content"],' +
              '[class*="markdown"],[class*="prose"]',
            fresh: /^\/$/,
          }
      : host === "copilot.microsoft.com"
        ? {
            id: "copilot",
            displayName: "Copilot",
            editor:
              'textarea[placeholder*="message" i],textarea[placeholder*="Ask" i],' +
              '[contenteditable="true"][role="textbox"],[contenteditable="true"]',
            item:
              '[data-testid*="message"],[data-testid*="conversation"],' +
              '[data-message-id],[role="article"],article',
            send:
              'button[aria-label*="Send" i],button[aria-label*="Submit" i],' +
              'button[data-testid*="send"],button[type="submit"]',
            stop:
              'button[aria-label*="Stop" i],button[aria-label*="Cancel" i],' +
              'button[data-testid*="stop"]',
            thinking:
              '[data-testid*="thinking"],[data-testid*="loading"],' +
              '[class*="thinking"],[class*="loading"],[aria-busy="true"]',
            reply:
              '[data-testid*="message-content"],[data-testid*="response"],' +
              '[class*="markdown"],[class*="prose"],[role="article"]',
            fresh: /^\/(?:|new|chat|conversation)?$/,
          }
      : {
          id: "claude",
          displayName: "Claude",
          editor:
            '[data-testid="chat-input"],[data-testid="composer-input"],' +
              '[contenteditable][data-testid*="composer"],' +
            'textarea[placeholder*="message" i],textarea[placeholder*="Talk" i]',
          item:
            '[data-testid="user-message"],[data-testid="assistant-message"],' +
            '[data-testid="conversation-turn"],[data-message-id],article',
          send:
            '[data-testid*="send"],button[aria-label="Send message"],' +
            'button[aria-label="Send"]',
          stop:
            '[data-testid*="stop"],button[aria-label*="Stop" i],' +
            'button[aria-label*="Cancel" i]',
          thinking:
            '[data-testid*="thinking"],[data-testid*="reasoning"],' +
            '[class*="thinking"],[class*="reasoning"]',
          reply:
            '[data-testid="message-content"],[data-testid*="message-content"],' +
            '[class*="markdown"],[class*="prose"],[class*="font-claude"]',
          fresh: /^\/(?:|new|chat|chats)?$/,
        };

  const RE = {
    contextLimit:
      /conversation.{0,30}(too long|limit|exceeded)|context.{0,30}(limit|exceeded)|maximum.{0,20}context|token.{0,20}limit|start.{0,20}new.{0,20}(chat|conversation)/i,
    tooLong: /conversation.{0,30}(too long|getting too long)|context.{0,30}(limit|exceeded)/i,
    busy:
      /something went wrong|try again later|temporarily unavailable|server is busy|rate limit|too many requests/i,
    continue: /^(continue|continue work|try again|regenerate|resume)$/i,
  };

  const timings = {
    GEN_IDLE_MS: 1800,
    REASON_IDLE_MS: 12000,
    WARMUP_MS: 45000,
    REASON_NOREPLY_MS: 90000,
    STABLE_MS: 9000,
    RESPONSE_TIMEOUT_MS: 300000,
  };

  const visible = (el) => {
    if (!el || el.closest("#zs-root")) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return !!(r.width || r.height || el === document.activeElement);
  };

  function firstVisible(selector) {
    try {
      for (const el of document.querySelectorAll(selector)) {
        if (visible(el)) return el;
      }
    } catch {}
    return null;
  }

  function getEditor() {
    if (grokSettingsSurface()) return null;
    try {
      for (const el of document.querySelectorAll(SITE.editor)) {
        if (!el.closest("#zs-root") && visible(el)) return el;
      }
      // Grok has a stable form around the composer even when its localized
      // aria-label changes. This fallback never selects the cookie-settings
      // textarea because that control is not inside the chat form.
      if (SITE.id === "grok") {
        for (const el of document.querySelectorAll("form textarea")) {
          if (!el.closest("#zs-root") && visible(el)) return el;
        }
      }
    } catch {}
    return null;
  }

  function editorText() {
    const ed = getEditor();
    if (!ed) return "";
    return ed.matches("[contenteditable]") ? (ed.innerText || ed.textContent || "") : (ed.value || "");
  }

  function setInputLock(on) {
    const ed = getEditor();
    if (!ed) return;
    if (on) {
      if (!ed.dataset.zsPlaceholder) ed.dataset.zsPlaceholder = ed.getAttribute("placeholder") || "";
      ed.dataset.zsLocked = "1";
      if (ed.matches("[contenteditable]")) {
        ed.setAttribute("contenteditable", "false");
      } else {
        ed.setAttribute("readonly", "");
      }
      ed.setAttribute("placeholder", "Agent working...");
    } else {
      delete ed.dataset.zsLocked;
      if (ed.matches("[contenteditable]")) {
        ed.setAttribute("contenteditable", "true");
      } else {
        ed.removeAttribute("readonly");
      }
      if (ed.dataset.zsPlaceholder != null) {
        ed.setAttribute("placeholder", ed.dataset.zsPlaceholder);
      }
    }
  }

  function composerFrame() {
    const ed = getEditor();
    if (!ed) return null;
    const action = sendButton() || stopButton();
    let n = ed;
    for (let i = 0; i < 10 && n; i++, n = n.parentElement) {
      if (!action || n.contains(action)) {
        if (n.tagName === "FORM" || n.children.length > 1) return n;
      }
    }
    return ed.closest("form") || ed.parentElement || ed;
  }

  function barAnchor() {
    const ed = getEditor();
    if (!ed) return null;

    // Grok's form is taller than the actual rounded query bar. Anchoring to the
    // form puts the RLScript strip on top of the placeholder; the query-bar
    // surface is the stable element that owns the editor and action row.
    if (SITE.id === "grok") {
      let n = ed;
      for (let i = 0; n && i < 8; i++, n = n.parentElement) {
        if (String(n.className || "").includes("query-bar")) return n;
      }
    }

    // Arena Agent's composer card and ChatGPT's composer surface both own the
    // editor's visual background. Reserving the strip on those cards keeps the
    // placeholder and action row below the bar.
    if (SITE.id === "arena-agent") {
      let n = ed;
      for (let i = 0; n && i < 8; i++, n = n.parentElement) {
        if (String(n.className || "").includes("rounded")) return n;
      }
    }
    // Claude's editor sits several layers inside the rounded composer card.
    // composerFrame() stops at an inner form, which places the anchored bar on
    // top of Claude's placeholder. Use the outermost rounded ancestor that also
    // owns the send/stop action so the reserved padding moves the whole editor.
    if (SITE.id === "claude") {
      let rounded = null;
      let n = ed;
      const action = sendButton() || stopButton();
      for (let i = 0; n && i < 10; i++, n = n.parentElement) {
        if (String(n.className || "").includes("rounded") && (!action || n.contains(action))) rounded = n;
      }
      if (rounded) return rounded;
    }
    if (SITE.id === "chatgpt") {
      return ed.closest("[data-composer-surface='true']") || composerFrame();
    }
    return composerFrame();
  }

  function actionButton(selector) {
    const b = firstVisible(selector);
    return b && !b.closest("#zs-root") ? b : null;
  }

  function isDisabled(el) {
    return !!el && (
      el.disabled === true ||
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true"
    );
  }

  function sendButton() {
    const b = actionButton(SITE.send);
    if (b) return b;
    for (const el of document.querySelectorAll("button")) {
      if (!visible(el) || el.closest("#zs-root") || isDisabled(el)) continue;
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      if (/send|g\u00f6nder|prompt/i.test(aria)) return el;
    }
    for (const el of document.querySelectorAll("button")) {
      if (!visible(el) || el.closest("#zs-root") || isDisabled(el)) continue;
      const a = (el.getAttribute("aria-label") || "").toLowerCase();
      const t = (el.getAttribute("data-testid") || "").toLowerCase();
      if (a.includes("send") || a.includes("gönder") || t.includes("chat-submit")) return el;
    }
    return null;
  }

  function stopButton() {
    const b = actionButton(SITE.stop);
    if (b) return b;
    for (const el of document.querySelectorAll("button")) {
      if (!visible(el) || el.closest("#zs-root")) continue;
      const a = (el.getAttribute("aria-label") || "").toLowerCase();
      const t = (el.getAttribute("data-testid") || "").toLowerCase();
      if (a.includes("stop") || a.includes("cancel") || a.includes("durdur") || t.includes("stop")) return el;
    }
    return null;
  }

  function rawItems() {
    const out = [];
    const seen = new Set();
    const addElement = (el) => {
      if (!el || el.closest("#zs-root") || seen.has(el)) return;
      seen.add(el);
      out.push(el);
    };
    const add = (selector) => {
      try {
        for (const el of document.querySelectorAll(selector)) {
          addElement(el);
        }
      } catch {}
    };
    add(SITE.item);
    // Arena sometimes renders the assistant turn without a message/turn
    // attribute. A command-bearing code block is still an unambiguous way to
    // recover its nearest message content node.
    if (SITE.id === "arena-agent") {
      try {
        for (const block of document.querySelectorAll("pre,code")) {
          const text = block.textContent || "";
          if (!/"command"\s*:\s*"(?!command_name\b)[^"]+"/i.test(text)) continue;
          const candidate = block.closest(
            '[data-message-id],[data-testid*="message"],[data-testid*="turn"],article,[class*="prose"]'
          );
          // If the closest prose node is the long RLScript bootstrap prompt,
          // use the actual command block instead of merging the prompt and the
          // assistant reply into one conversation item.
          const candidateText = candidate && (candidate.innerText || candidate.textContent || "");
          const promptRoot = candidate && /"command"\s*:\s*"command_name"/i.test(candidateText);
          if (promptRoot) {
            const index = out.indexOf(candidate);
            if (index >= 0) out.splice(index, 1);
            seen.delete(candidate);
          }
          const root = candidate && !promptRoot ? candidate : block;
          addElement(root);
        }
      } catch {}
    }
    if (!out.length) {
      add('[role="article"]');
      add("article");
    }
    // Remove nested candidates. Message wrappers often contain a more specific
    // assistant/user marker, but the outer message node is the correct item.
    const editor = getEditor();
    return out.filter((el) => {
      if (editor && (el === editor || el.contains(editor))) return false;
      // Copilot's conversation-history sidebar matches the generic
      // [data-testid*="conversation"] item selector, so a fresh chat with a
      // populated sidebar looked non-empty and never offered the Start button.
      // Drop candidates living in a sidebar/navigation container (the chat
      // thread itself is never wrapped in role="navigation" or <aside>).
      if (SITE.id === "copilot") {
        let n = el.parentElement;
        while (n) {
          if (n.getAttribute && n.getAttribute("role") === "navigation" ||
              n.tagName === "ASIDE") return false;
          n = n.parentElement;
        }
      }
      let p = el.parentElement;
      while (p) {
        if (seen.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    }).filter((el) => {
      const t = (el.innerText || el.textContent || "").trim();
      return t || explicitRole(el) !== null;
    });
  }

  function explicitRole(item) {
    if (!item) return null;
    const attrs = [
      item.getAttribute("data-role"),
      item.getAttribute("data-author"),
      item.getAttribute("data-message-author-role"),
      item.getAttribute("data-testid"),
      item.getAttribute("aria-label"),
    ].filter(Boolean).join(" ").toLowerCase();
    if (/\b(assistant|model|bot|claude|grok)\b/.test(attrs)) return "assistant";
    if (/\b(user|human|prompt|you)\b/.test(attrs)) return "user";
    try {
      if (item.querySelector('[data-role="assistant"],[data-author="assistant"],[data-testid*="assistant-message"]')) return "assistant";
      if (item.querySelector('[data-role="user"],[data-author="user"],[data-testid*="user-message"]')) return "user";
      if (item.querySelector('[data-message-author-role="assistant"]')) return "assistant";
      if (item.querySelector('[data-message-author-role="user"]')) return "user";
    } catch {}
    const classes = [...(item.classList || [])].join(" ").toLowerCase();
    if (/(^|[-_ ])(assistant|model|bot)([-_ ]|$)/.test(classes)) return "assistant";
    if (/(^|[-_ ])(user-message|human-message|prompt-message)([-_ ]|$)/.test(classes)) return "user";
    if (SITE.id === "arena-agent" &&
        /"command"\s*:\s*"(?!command_name\b)[^"]+"/i.test(item.innerText || item.textContent || "")) {
      return "assistant";
    }
    return null;
  }

  let roleMap = new WeakMap();
  function allItems() {
    const items = rawItems();
    roleMap = new WeakMap();
    let previous = "assistant";
    items.forEach((item, index) => {
      const explicit = explicitRole(item);
      if (explicit) {
        roleMap.set(item, explicit);
        previous = explicit;
      } else {
        // New conversations normally alternate user/assistant. This fallback is
        // only used when a deployment removes its role attributes entirely.
        const inferred = index === 0 ? "user" : previous === "user" ? "assistant" : "user";
        roleMap.set(item, inferred);
        previous = inferred;
      }
    });
    return items;
  }

  function isUserItem(item) {
    const role = roleMap.get(item) || explicitRole(item);
    return role === "user";
  }

  function isAssistantItem(item) {
    const role = roleMap.get(item) || explicitRole(item);
    return role === "assistant" || (role == null && !!item);
  }

  const assistantItems = () => allItems().filter(isAssistantItem);
  const assistantCount = () => assistantItems().length;
  const userCount = () => allItems().filter(isUserItem).length;
  const lastAssistant = () => {
    const items = assistantItems();
    return items.length ? items[items.length - 1] : null;
  };

  const idMap = new WeakMap();
  let idSeq = 0;
  function itemKey(item) {
    if (!item) return null;
    return item.getAttribute("data-message-id") ||
      item.getAttribute("data-id") ||
      item.getAttribute("data-testid") ||
      null;
  }
  function lastAssistantId() {
    const item = lastAssistant();
    if (!item) return null;
    const attr = itemKey(item);
    if (attr) return attr;
    let id = idMap.get(item);
    if (!id) {
      id = ++idSeq;
      idMap.set(item, id);
    }
    return id;
  }

  const chatIsEmpty = () => allItems().length === 0;
  const isFreshChat = () => chatIsEmpty() && !!getEditor() && SITE.fresh.test(location.pathname);

  function textWithout(root, excludeSel) {
    if (!root) return "";
    const skip = (el) => {
      if (!el || el.nodeType !== 1) return true;
      if (el.matches("#zs-root,.zs-chip,button,textarea,input,svg,style,script,[aria-hidden='true']")) return true;
      if (excludeSel && el.matches(excludeSel)) return true;
      if (el.matches(SITE.thinking)) return true;
      return false;
    };
    const walk = (node) => {
      if (node.nodeType === 3) return node.nodeValue || "";
      if (node.nodeType !== 1 || skip(node)) return "";
      if (node.tagName === "BR") return "\n";
      if (node.tagName === "PRE") {
        const code = node.querySelector("code") || node;
        const lines = [...code.children].filter((x) => x.nodeType === 1);
        return (lines.length ? lines.map((x) => x.textContent || "").join("\n") : code.textContent || "") + "\n";
      }
      let s = "";
      for (const child of node.childNodes) s += walk(child);
      if (/^(P|DIV|LI|H[1-6])$/.test(node.tagName)) s += "\n";
      return s;
    };
    return walk(root).replace(/\n{3,}/g, "\n\n").trim();
  }

  function bodyOf(item) {
    if (!item) return null;
    try {
      const candidates = [...item.querySelectorAll(SITE.reply)]
        .filter((el) => !el.closest(SITE.thinking) && !el.closest("#zs-root"));
      return candidates.length ? candidates[candidates.length - 1] : item;
    } catch {
      return item;
    }
  }

  function itemText(item) {
    return textWithout(bodyOf(item));
  }
  function classifyText(item, excludeSel) {
    return textWithout(bodyOf(item), excludeSel);
  }

  function thinkingText(item) {
    if (!item) return "";
    try {
      return [...item.querySelectorAll(SITE.thinking)].map((el) => textWithout(el)).join("\n").trim();
    } catch {
      return "";
    }
  }

  function streamText(item) {
    return thinkingText(item) + "\n" + itemText(item);
  }
  const streamLen = (item) => streamText(item === undefined ? lastAssistant() : item).length;
  let streamMax = -1;
  let streamAt = 0;
  let streamItem = null;
  let nativeContinueAt = 0;
  function sampleStream() {
    const item = lastAssistant();
    const len = streamLen(item);
    const now = Date.now();
    if (item !== streamItem || len < streamMax - 400) {
      streamItem = item;
      streamMax = len;
      streamAt = now;
    } else if (len > streamMax) {
      streamMax = len;
      streamAt = now;
    }
  }
  const grewRecently = (ms) => streamMax > 1 && Date.now() - streamAt < ms;
  const isGenerating = () => {
    sampleStream();
    return !!stopButton() || grewRecently(2200) ||
      (SITE.id === "arena-agent" && nativeContinueAt && Date.now() - nativeContinueAt < 5000);
  };
  const isBusyNow = isGenerating;
  const isHardGenerating = () => !!stopButton() || grewRecently(2200);

  function snapshot() {
    return { th: thinkingText(lastAssistant()).length, rp: itemText(lastAssistant()).length };
  }

  function readAssistant() {
    const item = lastAssistant();
    if (!item) return { present: false, reply: "", thinking: "", item: null };
    return {
      present: true,
      reply: itemText(item).trim(),
      thinking: thinkingText(item),
      item,
    };
  }

  function setEditorText(ed, text) {
    const value = String(text);
    if (ed.matches("[contenteditable]")) {
      ed.focus();
      try {
        document.execCommand("selectAll", false);
        document.execCommand("insertText", false, value);
      } catch {}
      if (editorText() !== value) {
        ed.textContent = value;
        ed.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: value,
        }));
      }
      return;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(ed, value);
    else ed.value = value;
    ed.dispatchEvent(new Event("input", { bubbles: true }));
    ed.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function waitFor(pred, timeout) {
    const started = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        if (pred()) return resolve(true);
        if (Date.now() - started >= timeout) return resolve(false);
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  async function typeAndSend(text, images) {
    const ed = getEditor();
    if (!ed) return;
    const locked = ed.dataset.zsLocked === "1" || ed.hasAttribute("readonly") || ed.getAttribute("contenteditable") === "false";
    if (locked) {
      ed.removeAttribute("readonly");
      ed.setAttribute("contenteditable", "true");
    }
    try {
      setEditorText(ed, text);
      if (images && images.length) {
        try { await attachImages(images); } catch {}
      }
      await waitFor(() => {
        const b = sendButton();
        return !!b && !isDisabled(b);
      }, 4000);
      const b = sendButton();
      if (b && !isDisabled(b)) {
        b.click();
        return;
      }
      const target = getEditor();
      if (target) {
        target.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13,
          bubbles: true, cancelable: true,
        }));
      }
    } finally {
      if (locked) setInputLock(true);
    }
  }

  function stopGeneration() {
    const b = stopButton();
    if (b) {
      try { b.click(); } catch {}
    }
  }

  function enforceComposer() {
    if (document.querySelector("#zs-root [data-zs-settings]")) return { ready: !!getEditor() };
    return { ready: !!getEditor() };
  }
  async function ensureComposerReady(reason) {
    diag("mode_ready", { reason, provider: SITE.id, ready: !!getEditor() });
    return { ready: !!getEditor() };
  }

  const turnHalted = () => false;
  const findContinueBtn = () => {
    for (const b of document.querySelectorAll("button,[role='button']")) {
      if (!visible(b) || b.closest("#zs-root")) continue;
      const text = (b.innerText || b.textContent || "").replace(/\s+/g, " ").trim();
      if (RE.continue.test(text)) return b;
    }
    // Arena has shipped the feedback rows as non-semantic clickable divs.
    // Their leaf text is still stable, and a click on it bubbles to Arena's
    // handler just like a click on the row.
    if (SITE.id === "arena-agent") {
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length || !visible(el) || el.closest("#zs-root")) continue;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (RE.continue.test(text)) return el;
      }
    }
    return null;
  };
  const clickContinueBtn = () => {
    const b = findContinueBtn();
    if (!b) return false;
    try {
      b.click();
      if (SITE.id === "arena-agent") nativeContinueAt = Date.now();
      return true;
    } catch { return false; }
  };

  function scanError() {
    for (const el of document.querySelectorAll('[role="alert"],[class*="error"],[class*="limit"],[class*="warning"]')) {
      if (!visible(el) || el.closest("#zs-root")) continue;
      const t = (el.innerText || el.textContent || "").trim();
      if (t.length > 8 && t.length < 800 && (RE.contextLimit.test(t) || RE.busy.test(t))) return t.slice(0, 260);
    }
    return getEditor() ? null : "The chat composer is not available. Sign in and open a new chat.";
  }
  const isTooLongMsg = (text) => RE.tooLong.test(text || "");
  const isBusyMsg = (text) => RE.busy.test(text || "");

  function fileFromImage(img, index) {
    const mime = img.mimeType || "image/jpeg";
    const binary = atob(img.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    return new File([bytes], "zeroscript_" + Date.now() + "_" + index + "." + ext, { type: mime });
  }

  async function attachImages(images) {
    const input = [...document.querySelectorAll('input[type="file"]')].find((el) => !el.closest("#zs-root"));
    if (!input || !images || !images.length) return false;
    const dt = new DataTransfer();
    images.forEach((img, i) => {
      try { dt.items.add(fileFromImage(img, i)); } catch {}
    });
    if (!dt.items.length) return false;
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
      if (setter) setter.call(input, dt.files);
      else input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      diag("attach.change", { provider: SITE.id, count: dt.items.length });
      return await waitFor(() => {
        const frame = composerFrame();
        return !!(frame && frame.querySelector("img, [data-testid*='attachment'], [class*='attachment'], [class*='preview']"));
      }, 12000);
    } catch {
      return false;
    }
  }

  function clearAttachments() {
    const frame = composerFrame();
    if (!frame) return;
    for (const b of frame.querySelectorAll("button")) {
      const a = (b.getAttribute("aria-label") || "").toLowerCase();
      const t = (b.getAttribute("data-testid") || "").toLowerCase();
      if (a.includes("remove") || a.includes("delete") || t.includes("remove") || t.includes("delete")) {
        try { b.click(); } catch {}
      }
    }
  }

  const conversationKey = () => location.pathname + location.search;

  function siteSendButton(target) {
    if (!target || !target.closest) return null;
    const direct = target.closest(SITE.send);
    if (direct) return direct;
    const button = target.closest("button,[role='button']");
    if (!button || button.closest("#zs-root")) return null;
    const aria = (button.getAttribute("aria-label") || "").toLowerCase();
    return /send|g\u00f6nder|prompt/i.test(aria) ? button : null;
  }

  function installSendHooks(handlers) {
    if (SITE.id === "arena-agent") {
      // Arena's task-feedback panel treats Escape as "dismiss this panel".
      // During a RLScript run that can hide Continue Work before the loop
      // gets a chance to resume the assistant turn, leaving the tool chip grey.
      const blockArenaFeedbackEscape = (event) => {
        if (event.key !== "Escape" || !findContinueBtn()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        diag("arena.feedback.escape_blocked");
      };
      window.addEventListener("keydown", blockArenaFeedbackEscape, true);
      document.addEventListener("keydown", blockArenaFeedbackEscape, true);
    }
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      const ed = getEditor();
      if (!ed || (event.target !== ed && !ed.contains(event.target))) return;
      if (!editorText().trim() || handlers.isBlocked()) return;
      if (!handlers.isStarted()) {
        if (!chatIsEmpty()) return;
        handlers.onBlockedAttempt();
        return;
      }
      handlers.onUserMessage(assistantCount());
    }, true);

    document.addEventListener("click", (event) => {
      const target = event.target;
      const button = siteSendButton(target);
      if (!button || !getEditor() || handlers.isBlocked()) return;
      if (!handlers.isStarted()) {
        if (!chatIsEmpty()) return;
        handlers.onBlockedAttempt();
        return;
      }
      handlers.onUserMessage(assistantCount());
    }, true);
  }

  const CMD_SHAPE = /"(?:command|tool)"\s*:\s*"|###\s*lua|###mcp_tool###/i;
  function findToolBlockSpot(item) {
    if (!item) return null;
    for (const el of item.querySelectorAll("pre,code,[class*='code'],[data-testid*='code']")) {
      if (el.closest(".zs-chip")) continue;
      const text = el.textContent || "";
      if (CMD_SHAPE.test(text)) {
        el.classList.add("zs-tool-hide");
        item.classList.add("zs-cmd-mask");
        return { parent: el.parentElement, ref: el };
      }
    }
    return null;
  }

  function grokSettingsSurface() {
    if (SITE.id !== "grok") return false;
    const route = `${location.pathname}${location.search}${location.hash}`;
    return /(?:#|\/)subscribe(?:[/?&#]|$)/i.test(route) ||
      /[?&]_s=(?:account|appearance|behavior|personality)(?:[&#]|$)/i.test(route);
  }

  function overlayBlocking() {
    if (grokSettingsSurface()) return true;
    for (const el of document.querySelectorAll('[role="dialog"],[aria-modal="true"]')) {
      if (!visible(el)) continue;
      const text = (el.innerText || el.textContent || "").toLowerCase();
      if (SITE.id === "grok" && /supergrok|upgrade|subscription|usd\/month|individual|business/.test(text)) return true;
      if (/cookie|sign in|log in|oturum aç|login|consent|privacy/.test(text)) return true;
    }
    return false;
  }

  return {
    id: SITE.id,
    displayName: SITE.displayName,
    unstableWarning: SITE.id === "arena-agent"
      ? "UNSTABLE: Arena Agent mode is not currently reliable with RLScript. Commands may remain 'not run'; use Arena Direct for stable operation."
      : "",
    supportsVision: true,
    timings,
    thinkingSel: SITE.thinking,
    reliableCounts: true,
    init({ diag: d } = {}) { if (d) diag = d; },
    allItems,
    isUserItem,
    isAssistantItem,
    itemText,
    classifyText,
    assistantCount,
    userCount,
    lastAssistant,
    lastAssistantId,
    itemKey,
    readAssistant,
    streamLen,
    snapshot,
    getEditor,
    editorText,
    chatIsEmpty,
    isFreshChat,
    composerFrame,
    barAnchor,
    setInputLock,
    typeAndSend,
    stopGeneration,
    isGenerating,
    isBusyNow,
    isHardGenerating,
    enforceComposer,
    ensureComposerReady,
    turnHalted,
    findContinueBtn,
    clickContinueBtn,
    scanError,
    isTooLongMsg,
    isBusyMsg,
    attachImages,
    clearAttachments,
    conversationKey,
    installSendHooks,
    findToolBlockSpot,
    captchaPresent: () => false,
    overlayBlocking,
    modeWarning: () => "",
  };
})();
