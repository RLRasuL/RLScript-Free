// SPDX-License-Identifier: GPL-3.0-or-later
// providers/deepseek.js - the DeepSeek (chat.deepseek.com) provider.
// EVERYTHING that knows DeepSeek's DOM, quirks, and UI strings lives here; the
// core (core/main.js) only ever talks to the RLProvider interface this file
// exports. To support another AI site, write a sibling file exporting the same
// interface and list it (instead of this one) in the manifest's content_scripts.
//
// DeepSeek notes (validated live):
//  - One turn = one .ds-message. User turns carry a hashed modifier class +
//    a `.fbb737a4` bubble; assistant turns carry a `.ds-markdown` body.
//  - DeepThink/R1 reasoning lives in .ds-think-content; the real answer is a
//    .ds-markdown OUTSIDE that container (so drafts inside reasoning are ignored).
//  - The input is a real <textarea> (not a contenteditable): we set its value via
//    the native setter + an input event, then click the primary send button.
//  - "generating" is detected from the primary footer button: while streaming it
//    shows a STOP glyph (a <rect> in old builds, a rounded-square <path> starting
//    "M2…" in V4) and when idle a SEND arrow (<path> starting "M8…"); see
//    isStopBtn(). .ds-loading covers the brief spin-up. During the DeepThink
//    REASONING phase there is NO stop button / spinner at all - only text growth
//    says "still alive".
// eslint-disable-next-line no-unused-vars
const RLProvider = (() => {
  "use strict";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let diag = () => {}; // injected by core via init()

  // DOM selectors for chat.deepseek.com. Grouped so a future site tweak is a
  // one-liner. DeepSeek ships hashed CSS-module class names (e.g. `d29f3d7d`);
  // where possible we lean on its stable design-system "ds-" classes instead.
  const S = {
    chatItem: ".ds-message",
    userMod: "d29f3d7d", // hashed modifier on user turns (one-liner to update if DeepSeek redeploys)
    userBubble: ".fbb737a4", // user text bubble (secondary signal)
    box: ".ds-markdown",
    editor: "textarea", // DeepSeek uses a real <textarea>, NOT a contenteditable
    // The inline "edit this message" box is DeepSeek's design-system bordered
    // textarea (.ds-textarea--bordered), mounted UP in the turn list. The bottom
    // composer is NOT wrapped in one - so this scopes getEditor() away from it.
    msgEditBox: ".ds-textarea",
    thinking: ".ds-think-content",
    markdown: ".ds-markdown",
    generating: ".ds-loading",
    sendBtn: ".ds-button--primary",
    stopBtn: ".ds-button--primary",
    // surfaces where DeepSeek shows errors / limit modals / toasts
    errorSurfaces:
      '[class*="ds-toast"],[class*="toast"],[class*="error"],[class*="alert"],' +
      '[class*="warning"],[class*="modal"],[role="alert"]',
    // composer image-attachment area (best-effort; DeepSeek's image support is
    // limited, so the attach path degrades gracefully if these don't match).
    attachArea: ".ds-file-list, [class*='file-preview'], [class*='upload']",
    imageThumb: "[class*='thumbnail'], [class*='file-item']",
    // ── Composer mode controls (empty chat only) ──────────────────────────
    modeRadioGroup: '[role="radiogroup"]',
    modeRadio: '[role="radio"]',
    deepThinkToggle: ".ds-toggle-button",
  };

  // Error / state regexes (English + French - DeepSeek's UI follows the locale).
  const RE = {
    contextLimit: new RegExp(
      [
        "conversation.{0,20}(too long|trop long)",
        "context.{0,20}(limit|exceeded|d\\u00e9pass\\u00e9)",
        "session.{0,20}(expired|expir\\u00e9e)",
        "please.{0,30}(start|cr\\u00e9er).{0,20}(new|nouveau).{0,20}(chat|conversation)",
        "(token|context).{0,10}limit",
        "message.{0,20}too.{0,10}long",
        "maximum.{0,20}context",
        "this conversation has reached",
        "cette conversation a atteint",
      ].join("|"),
      "i"
    ),
    tooLong: /conversation .{0,20}(too long|getting too long|trop longue)/i,
    busy: /server is busy|serveur est occup|please try again|réessayer plus tard|system is currently busy/i,
    continueBtn: /^(continue|continuer|继续(生成)?|fortfahren|continuar|seguir|続行)$/i,
    stopped: /(arrêté|arrété|stopped|已停止|停止生成|已暂停)/i,
    expertMode: /expert|专家|专业/i,
    visionMode: /vision|视觉|图像|多模态/i,
    instantMode: /instant|rapide|快速/i,
    flashMode: /flash|v4\.1|v41/i,
    proMode: /\bpro\b|professional|旗舰/i,
    deepThink: /pensée profonde|pensee profonde|profonde|réflexion|reflexion|deep ?think|深度思考|r1|think|思考|推理/i,
    searchMode: /recherche intelligente|smart search|search|web|搜索/i,
  };

  // Completion-detection windows, calibrated on DeepSeek's DeepThink behaviour.
  // Exposed so the core's response watcher uses the provider's tuning.
  const timings = {
    GEN_IDLE_MS: 800,        // answer phase: text unchanged this long ⇒ idle
    REASON_IDLE_MS: 12000,   // reasoning stalls of several seconds are NORMAL
    WARMUP_MS: 45000,        // empty turn container may precede the first token
    REASON_NOREPLY_MS: 90000, // reasoning written but no answer yet: keep waiting
    STABLE_MS: 9000,         // generating-flag stuck ON but text frozen → done
    RESPONSE_TIMEOUT_MS: 300000,
  };

  // ── Turn classification (multi-signal, virtualization-safe) ──────────────
  function isUserItem(item) {
    if (!item) return false;
    if (S.userMod && item.classList.contains(S.userMod)) return true;
    if (S.userBubble && item.querySelector(S.userBubble)) return true;
    const role = (item.getAttribute("data-role") || item.getAttribute("data-author") || item.getAttribute("data-message-author-role") || "").toLowerCase();
    if (role === "user" || role === "human") return true;
    if (role === "assistant" || role === "model" || role === "bot") return false;
    try {
      if (item.querySelector('[data-role="user"],[data-author="user"],[data-message-author-role="user"]')) return true;
    } catch {}
    return false;
  }
  const isAssistantItem = (item) => !!item && !isUserItem(item);

  // Text of an item for signature detection. For assistant turns we use ONLY
  // the non-thinking markdown, so tool blocks the model merely drafts inside
  // its reasoning are never detected, shown, or executed.
  function itemText(item) {
    if (isAssistantItem(item)) {
      const th = findThinking(item);
      const mds = replyNodes(item).filter((m) => th ? !th.contains(m) : true);
      if (mds.length) return mds.map((m) => m.textContent).join("\n");
      return item.textContent || "";
    }
    return item.textContent || "";
  }

  // Text used by the core to CLASSIFY a turn for camouflage - excludes the
  // reasoning area AND any element matching `excludeSel` (the core's own chip),
  // so a recycled (virtualized) node wearing a stale chip is never mis-detected.
  function classifyText(item, excludeSel) {
    if (isAssistantItem(item)) {
      const th = findThinking(item);
      return replyNodes(item)
        .filter((m) => (th ? !th.contains(m) : true) && !(excludeSel && m.closest(excludeSel)))
        .map((m) => m.textContent).join("\n");
    }
    let t = "";
    for (const n of item.childNodes) {
      if (excludeSel && n.nodeType === 1 && n.matches && n.matches(excludeSel)) continue;
      t += n.textContent || "";
    }
    return t;
  }

  const allItems = () => {
    let items = [...document.querySelectorAll(S.chatItem)];
    if (items.length) return items;
    try {
      items = [...document.querySelectorAll('[data-message-id],[data-turn-id],[data-role="user"],[data-role="assistant"]')].filter((e) => !e.closest("#rl-root"));
      if (items.length) return items;
    } catch {}
    return [];
  };
  const assistantItems = () => allItems().filter(isAssistantItem);
  const assistantCount = () => assistantItems().length;
  const userCount = () => allItems().filter(isUserItem).length;
  // Scope to the SITE's composer only: never match RLScript's own injected
  // UI (e.g. the settings textarea #rl-set-text in #rl-root). Otherwise on the
  // login/OAuth pages - which have no site textarea - getEditor() would return
  // our own panel's textarea, defeating the "not on a chat page" guard in the
  // send hooks and letting them swallow the DeepSeek "Log in" click (which is
  // itself a .ds-button--primary, the same selector as the send button).
  const getEditor = () => {
    const site = [...document.querySelectorAll(S.editor)].filter(
      (e) => !e.closest("#rl-root")
    );
    const ta = site.find((e) => !e.closest(S.msgEditBox)) || site[0] || null;
    if (ta && ta.offsetParent !== null) return ta;
    if (ta) return ta;
    try {
      const eds = [...document.querySelectorAll('[contenteditable="true"][role="textbox"],[contenteditable="true"]')].filter((e) => !e.closest("#rl-root"));
      if (eds.length) return eds[eds.length - 1];
    } catch {}
    return ta;
  };
  const editorText = () => {
    const e = getEditor();
    if (!e) return "";
    if (e.matches && e.matches('[contenteditable]')) return (e.innerText || e.textContent || "");
    return (e.value != null ? e.value : e.textContent || "");
  };

  function setInputLock(on) {
    const ed = getEditor();
    if (!ed) return;
    const isCE = ed.matches && ed.matches('[contenteditable]');
    if (on) {
      if (!ed.dataset.rlPlaceholder) ed.dataset.rlPlaceholder = ed.getAttribute("placeholder") || "";
      if (isCE) ed.setAttribute("contenteditable", "false");
      else ed.setAttribute("readonly", "");
      try { ed.setAttribute("placeholder", "Agent working... please wait"); } catch {}
    } else {
      if (isCE) ed.setAttribute("contenteditable", "true");
      else ed.removeAttribute("readonly");
      if (ed.dataset.rlPlaceholder != null) try { ed.setAttribute("placeholder", ed.dataset.rlPlaceholder); } catch {}
    }
  }

  const lastAssistant = () => {
    const it = assistantItems();
    return it.length ? it[it.length - 1] : null;
  };

  // Stable per-turn identity: each .ds-message's PARENT carries
  // data-virtual-list-item-key, a monotonically increasing per-turn key
  // (validated live, 2026-07). DeepSeek VIRTUALIZES its message list (the
  // attribute name says it all), so assistantCount() stalls once old turns
  // detach - which defeated the core's count-based chip.reown guard on
  // back-to-back calls to the same tool: the previous call's settled "done"
  // chip was repainted onto the NEW streaming command turn (the "chip appears
  // done with no spinner while DeepSeek is still writing" report). This key is
  // immune to that; the core prefers it over the count whenever it exists.
  function lastAssistantId() {
    const last = lastAssistant();
    return itemKey(last);
  }

  // Stable per-turn identity for ANY item (not just the last). Same source as
  // lastAssistantId - the parent's data-virtual-list-item-key - so the core can
  // key its off-DOM dedupe maps (executed / halted) on an id that survives
  // virtualization. The positional assistantIdx it falls back to is NOT stable
  // once old turns detach: scrolling up renders a different window, so an old
  // command turn takes a low index that collides with a current turn's key and
  // the "already ran this" memory misses - the watchdog then re-fires the
  // scrolled-back tool ("commands re-execute when I scroll up" report).
  function itemKey(item) {
    if (!item) return null;
    const p = item.parentElement;
    const key = p && p.getAttribute("data-virtual-list-item-key");
    return key != null ? key : null;
  }

  const chatIsEmpty = () => allItems().length === 0;
  const isFreshChat = () => chatIsEmpty() && (!!document.querySelector(S.modeRadioGroup) || !!getEditor());
  function findSendBtn() {
    const b = document.querySelector(S.sendBtn);
    if (b && b.offsetParent !== null) return b;
    if (b) return b;
    try {
      const alts = [...document.querySelectorAll('button[aria-label*="Send" i],button[aria-label*="Stop" i],button[type="submit"]')].filter((e) => !e.closest("#rl-root"));
      if (alts.length) return alts[alts.length - 1];
    } catch {}
    return b;
  }

  // The whole composer "box" = the smallest ancestor that contains the input, the
  // send button AND (on a blank chat) the Expert/Rapide mode selector. The core's
  // Start gate hides this entire frame at once. Returns null if no input yet.
  function composerFrame() {
    const ta = getEditor();
    if (!ta) return null;
    const sb = findSendBtn();
    const group = document.querySelector(S.modeRadioGroup);
    const targets = [sb, group].filter(Boolean);
    let n = ta;
    for (let i = 0; i < 14 && n && n.parentElement; i++) {
      if (targets.every((t) => n.contains(t))) return n;
      n = n.parentElement;
    }
    // Fallback: a fixed climb from the textarea.
    let f = ta;
    for (let i = 0; i < 6 && f.parentElement; i++) f = f.parentElement;
    return f;
  }

  // Where the core inserts its in-flow status bar. The INPUT BOX = the lowest
  // ancestor of the textarea that also holds the send button but NOT the model
  // tabs (so the rounded composer box, excluding Instant/Expert/Vision). It is a
  // vertical flow container (textarea + the DeepThink/Search pill row), so adding
  // the bar as its FIRST child reflows cleanly and spans the full input width.
  function barMount() {
    const ta = getEditor();
    if (!ta) return null;
    const send = findSendBtn();
    const group = document.querySelector(S.modeRadioGroup);
    let box = ta.parentElement;
    while (box && box !== document.body) {
      const holdsSend = !send || box.contains(send);
      const holdsTabs = group && box.contains(group);
      if (holdsSend && !holdsTabs) break; // the input box, without the tabs
      box = box.parentElement;
    }
    if (!box || box === document.body) box = ta.parentElement;
    if (!box) return null;
    // Insert before the first REAL child (skip our own bar if already mounted,
    // otherwise we'd try to insert the bar before itself every frame).
    let before = box.firstElementChild;
    if (before && before.id === "rl-bar") before = before.nextElementSibling;
    return { parent: box, before, inside: true }; // lives INSIDE the input box
  }

  // ── Composer mode: pick Expert (most powerful) at startup, Search OFF ──
  // Driven once at session start only; the user can switch the model tab after.
  const nodeText = (n) => (n && (n.innerText || n.textContent || "").trim()) || "";
  const isPressedOn = (n) =>
    n && (n.getAttribute("aria-pressed") === "true" ||
          n.getAttribute("aria-checked") === "true" ||
          n.classList.contains("ds-toggle-button--selected"));
  const isPressedOff = (n) =>
    n && (n.getAttribute("aria-pressed") === "false" ||
          n.getAttribute("aria-checked") === "false");

  // Model tabs carry data-model-type: "default" (Instant), "expert", "vision"
  // (validated live 2026-07 on DeepSeek V4). Find one by type, falling back to a
  // label regex if the site ever drops the attribute.
  function findModeRadio(type, re) {
    const group = document.querySelector(S.modeRadioGroup);
    const radios = group ? [...group.querySelectorAll(S.modeRadio)] : [...document.querySelectorAll(S.modeRadio)];
    return radios.find((r) => r.getAttribute("data-model-type") === type) ||
           (re && radios.find((r) => re.test(nodeText(r)))) ||
           null;
  }
  const findExpertRadio = () => findModeRadio("expert", RE.expertMode);
  const findVisionRadio = () => findModeRadio("vision", RE.visionMode);
  const findInstantRadio = () => findModeRadio("default", RE.instantMode);
  const radioOn = (r) => !!r && r.getAttribute("aria-checked") === "true";

  // The user can CHOOSE the Vision tab; when they do we respect it (never force
  // Expert over it) and enable image tools - see supportsVision (getter) and
  // enforceComposer's expert-force guard.
  //
  // CRITICAL detection wrinkle (validated live 2026-07): once a conversation is
  // active DeepSeek REMOVES the model radiogroup from the DOM entirely, so reading
  // the radio live returns "no Vision" mid-conversation and screen_capture would be
  // re-blocked after the first message. The model CANNOT change mid-conversation
  // (radios are gone), so we LATCH the selection from the last time the radios were
  // visible. And after a reload mid-conversation the radios were never seen, so we
  // fall back to DeepSeek's per-turn model BADGE (a small element whose exact text
  // is "Instant"/"Expert"/"Vision"). Throttled + latched so the badge scan stops
  // once a value is known.
  let _visLatch = false, _visLatchSet = false, _visAt = 0, _visCache = false;
  function badgeVision() {
    const els = [...document.querySelectorAll("div,span,button")].filter(
      (e) => e.childElementCount === 0 &&
             /^(instant|expert|vision|flash|pro|v4\.1)$/i.test((e.textContent || "").trim()) &&
             e.getBoundingClientRect().width > 0);
    if (!els.length) return null;
    els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const t = els[0].textContent || "";
    if (/vision/i.test(t)) return true;
    if (/flash|v4\.1/i.test(t)) return true;
    if (/^pro$/i.test(t.trim())) return true;
    return false;
  }
  function detectV41Native() {
    try {
      const btns = [...document.querySelectorAll('button,[role="radio"],[role="option"],[data-model-type],div,span')].slice(0, 400);
      for (const b of btns) {
        if (b.closest && b.closest("#rl-root")) continue;
        const t = ((b.innerText || b.textContent) || "").slice(0, 40);
        if (/v4\.1|deepseek-v4\.1|deepseek-flash/i.test(t)) return true;
      }
    } catch {}
    return false;
  }
  function detectVision() {
    const now = Date.now();
    if (now - _visAt < 400) return _visCache;
    _visAt = now;
    if (detectV41Native()) { _visLatch = true; _visLatchSet = true; return (_visCache = true); }
    const group = document.querySelector(S.modeRadioGroup);
    if (group) {
      const v = findVisionRadio();
      if (v) { _visLatch = radioOn(v); _visLatchSet = true; return (_visCache = _visLatch); }
    }
    const b = badgeVision();
    if (b != null) { _visLatch = b; _visLatchSet = true; return (_visCache = b); }
    if (_visLatchSet) return (_visCache = _visLatch);
    return (_visCache = false);
  }
  const isVisionSelected = () => detectVision();

  function findToggleBy(re) {
    return [...document.querySelectorAll(S.deepThinkToggle)].find((t) => re.test(nodeText(t))) || null;
  }

  function findModelButton(re) {
    try {
      const cands = [...document.querySelectorAll('button,[role="radio"],[role="option"],[data-model-type]')].filter((e) => !e.closest("#rl-root"));
      return cands.find((r) => re.test(nodeText(r))) || null;
    } catch { return null; }
  }
  function composerModeState() {
    const expert = findExpertRadio();
    const deepThink = findToggleBy(RE.deepThink);
    const search = findToggleBy(RE.searchMode);
    const vision = findVisionRadio();
    const instant = findInstantRadio();
    const flash = findModelButton(RE.flashMode);
    const pro = findModelButton(RE.proMode);
    const v41 = detectV41Native();
    const anyOld = !!(expert || vision || instant);
    const anyNew = !!(flash || pro || v41);
    return {
      expertFound: !!expert,
      expertOn: radioOn(expert),
      visionFound: !!vision,
      visionOn: radioOn(vision),
      instantFound: !!instant,
      instantOn: radioOn(instant),
      flashFound: !!flash,
      proFound: !!pro,
      v41Found: !!v41,
      anyModelFound: !!(anyOld || anyNew),
      editorFound: !!getEditor(),
      deepThinkFound: !!deepThink,
      deepThinkOn: !!deepThink && isPressedOn(deepThink),
      searchFound: !!search,
      searchOff: !search || !isPressedOn(search),
      searchHiddenInExpert: !search && !!expert && expert.getAttribute("aria-checked") === "true",
    };
  }

  function enforceComposer(reason) {
    if (!reason) return composerModeState();
    try {
      if (!isVisionSelected() && !radioOn(findInstantRadio())) {
        const expert = findExpertRadio();
        if (expert && expert.getAttribute("aria-checked") !== "true") {
          try { expert.click(); } catch (e) { diag("mode_fallback", { reason, target: "expert", error: String(e && e.message || e) }); }
        }
      }
      const deepThink = findToggleBy(RE.deepThink);
      if (deepThink && isPressedOff(deepThink)) {
        try { deepThink.click(); } catch (e) { diag("mode_fallback", { reason, target: "deepThink", error: String(e && e.message || e) }); }
      }
      const search = findToggleBy(RE.searchMode);
      if (search && isPressedOn(search)) {
        try { search.click(); } catch (e) { diag("mode_fallback", { reason, target: "search", error: String(e && e.message || e) }); }
      }
      const state = composerModeState();
      diag("mode_enforce", { reason, ...state });
      return state;
    } catch (e) {
      diag("mode_fallback", { reason, target: "composer", error: String(e && e.message || e) });
      return composerModeState();
    }
  }

  // Drive the composer into its required modes; returns the final state with
  // `.ready` (the core gates session start on it).
  async function ensureComposerReady(reason) {
    let state = composerModeState();
    for (let i = 0; i < 12; i++) {
      state = enforceComposer(reason);
      if ((state.expertOn || state.visionOn || state.instantOn) && state.searchOff && (state.deepThinkOn || !state.deepThinkFound)) break;
      if ((state.flashFound || state.proFound || state.v41Found) && state.searchOff) break;
      if (!state.anyModelFound && state.editorFound) break;
      await sleep(120);
    }
    state = composerModeState();
    diag("mode_ready", { reason, ...state });
    const oldReady = state.expertOn || state.visionOn || state.instantOn;
    const newReady = (state.flashFound || state.proFound || state.v41Found) && state.searchOff;
    const fallbackReady = !state.anyModelFound && state.editorFound;
    return { ...state, ready: !!(oldReady || newReady || fallbackReady) };
  }

  // DeepSeek's footer button doubles as SEND (an upward arrow) and STOP (a
  // filled rounded square). Older builds drew the stop glyph with a <rect>; the
  // current V4 build draws BOTH as a <path>: the send arrow's path starts
  // mid-glyph ("M8.31…"), the stop square's path starts at a corner near the
  // origin ("M2 …"). We treat the button as "stop" when it carries a <rect> OR a
  // square-ish path (leading move to x ≤ 3) - never the M8 arrow. One-liner to
  // update if DeepSeek reskins the footer button.
  function isStopBtn(btn) {
    if (!btn) return false;
    if (btn.querySelector("rect")) return true;
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    if (/stop|cancel|arrêt|停止|暂停/.test(aria)) return true;
    if (/send|envoyer|发送/.test(aria)) return false;
    const p = btn.querySelector("path");
    if (!p) return false;
    return /^\s*M\s*[0-3][\s.]/.test(p.getAttribute("d") || "");
  }
  function findThinking(root) {
    if (!root || !root.querySelector) return null;
    try {
      return root.querySelector(S.thinking) || root.querySelector('[class*="think"],[class*="reason"],[class*="thought"],[data-testid*="think"],[data-testid*="reason"]');
    } catch { return null; }
  }
  function replyNodes(item) {
    if (!item || !item.querySelectorAll) return [];
    let mds = [...item.querySelectorAll(S.markdown)];
    if (mds.length) return mds;
    try {
      mds = [...item.querySelectorAll('[class*="markdown"],[class*="prose"],[data-testid*="message-content"]')];
      if (mds.length) return mds;
    } catch {}
    return [];
  }

  // ── Generation / completion detection ────────────────────────────────────
  // Everything DeepSeek is streaming for a turn: its reasoning + its answer.
  // Excludes the core's own chip so the live token meter can't masquerade as
  // model output.
  function streamText(item) {
    if (!item) return "";
    const think = findThinking(item);
    const thinkTxt = think ? think.textContent || "" : "";
    const replyTxt = replyNodes(item)
      .filter((m) => !m.closest(".rl-chip"))
      .map((m) => m.textContent)
      .join("");
    return thinkTxt + "\n" + replyTxt;
  }
  const streamLen = (item) => streamText(item === undefined ? lastAssistant() : item).length;

  // Stream-growth tracking - the ONLY "is it still streaming?" signal during the
  // reasoning phase (no <rect>, no spinner then). We track the MAXIMUM length the
  // current turn has reached and WHEN it last advanced; DOM flicker of a few
  // chars never counts - only a new maximum (see content history for the full
  // war story: counting churn as growth froze the loop).
  let _streamMax = -1, _streamAt = 0, _streamItem = null;

  function sampleStream() {
    const item = lastAssistant();
    const len = streamText(item).length;
    const now = Date.now();
    // A new turn - a different node, or a big length drop (a virtualized node
    // recycled into a fresh turn) - starts tracking afresh and counts as active.
    if (item !== _streamItem || len < _streamMax - 400) {
      _streamItem = item; _streamMax = len; _streamAt = now; return;
    }
    if (len > _streamMax) { _streamMax = len; _streamAt = now; } // forward progress only
  }
  const grewWithin = (ms) => _streamMax > 1 && Date.now() - _streamAt < ms;

  // True iff `item` is an assistant turn that has begun REASONING but produced no
  // answer yet and has NOT been halted.
  function reasoningInProgress(item) {
    if (!item) return false;
    const think = findThinking(item);
    const thinkTxt = think ? (think.textContent || "") : "";
    if (!thinkTxt.trim().length) return false;
    const replyLen = replyNodes(item)
      .filter((m) => (think ? !think.contains(m) : true) && !m.closest(".rl-chip"))
      .reduce((n, m) => n + (m.textContent || "").length, 0);
    if (replyLen !== 0) return false;
    if (turnHalted(item)) return false;
    return true;
  }

  // The turn carries DeepSeek's "Arrêté/Stopped" UI marker (manual stop or a
  // forced interruption) - distinguished from the model merely WRITING such a
  // word in its reasoning by requiring the marker OUTSIDE the reasoning text.
  function turnHalted(item) {
    if (!item) return false;
    const think = findThinking(item);
    const thinkTxt = think ? (think.textContent || "") : "";
    return RE.stopped.test(item.textContent || "") && !RE.stopped.test(thinkTxt);
  }

  // Growth-tolerant "is a generation in progress?" - the response watcher's signal.
  function isGenerating() {
    if (document.querySelector(S.generating)) return true;
    const btn = findSendBtn();
    if (isStopBtn(btn)) return true;
    sampleStream();
    if (reasoningInProgress(lastAssistant())) return grewWithin(timings.REASON_IDLE_MS);
    return grewWithin(timings.GEN_IDLE_MS);
  }

  // STRICT "is a generation happening RIGHT NOW?" - the gate for SENDING (the send
  // button doubles as stop, so sending mid-generation aborts the turn). Does NOT
  // linger after the answer ends.
  function isBusyNow() {
    if (document.querySelector(S.generating)) return true;
    const btn = findSendBtn();
    if (isStopBtn(btn)) return true;
    sampleStream();
    if (!reasoningInProgress(lastAssistant())) return false;
    return grewWithin(timings.REASON_IDLE_MS);
  }
  function isHardGenerating() {
    return isStopBtn(findSendBtn());
  }

  // ── Diagnostic breakdown of isGenerating() ────────────────────────────────
  // The chip "settled ✓ done while DeepSeek was still writing" bug means
  // isGenerating() flickered false at the wrong moment. This exposes EACH
  // sub-signal so the core's chip.why tracker can show WHICH one failed:
  //  - spinner  : the .ds-loading spin-up flag
  //  - stopBtn  : the footer button is in its STOP-square state (answer phase)
  //  - btnGlyph : the raw first token of the button's <path d> (to catch a
  //               DeepSeek reskin that breaks isStopBtn's M[0-3] test)
  //  - reasoning: DeepThink reasoning is in progress (no stop button then)
  //  - streamMax/streamAgeMs : stream-growth meter (the ONLY liveness signal in
  //               the reasoning phase, and the fallback when stopBtn is false)
  //  - grewGen/grewReason    : did the stream grow within the answer / reasoning
  //               idle windows (what isGenerating actually gates on)
  function genDebug() {
    try {
      sampleStream();
      const btn = findSendBtn();
      const path = btn && btn.querySelector("path");
      const rp = btn && btn.querySelector("rect");
      return {
        spinner: !!document.querySelector(S.generating),
        stopBtn: isStopBtn(btn),
        btnGlyph: rp ? "rect" : (path ? (path.getAttribute("d") || "").slice(0, 6) : "none"),
        reasoning: reasoningInProgress(lastAssistant()),
        streamMax: _streamMax,
        streamAgeMs: _streamAt ? Date.now() - _streamAt : -1,
        grewGen: grewWithin(timings.GEN_IDLE_MS),
        grewReason: grewWithin(timings.REASON_IDLE_MS),
        gen: isGenerating(),
      };
    } catch (e) { return { err: String(e && e.message || e) }; }
  }

  // Lightweight turn snapshot for diagnostics (reasoning/reply lengths).
  function snapshot() {
    try {
      const it = lastAssistant();
      if (!it) return { th: 0, rp: 0 };
      const th = findThinking(it);
      const rp = replyNodes(it)
        .filter((m) => (th ? !th.contains(m) : true) && !m.closest(".rl-chip"))
        .reduce((n, m) => n + (m.textContent || "").length, 0);
      return { th: th ? (th.textContent || "").trim().length : 0, rp };
    } catch { return {}; }
  }

  // ── Truncation "Continue" button ──────────────────────────────────────────
  function findContinueBtn() {
    for (const b of document.querySelectorAll(".ds-button")) {
      if (b.offsetParent === null) continue; // not visible
      if (RE.continueBtn.test((b.innerText || "").trim())) return b;
    }
    return null;
  }

  function clickContinueBtn() {
    const b = findContinueBtn();
    if (!b) return false;
    try { b.click(); return true; } catch { return false; }
  }

  function readAssistant() {
    const item = lastAssistant();
    if (!item) return { present: false, reply: "", thinking: "", item: null };
    const thWrap = findThinking(item);
    const th = thWrap ? thWrap.querySelector(S.markdown) || thWrap : null;
    const mds = replyNodes(item).filter((m) => thWrap ? !thWrap.contains(m) : true);
    return {
      present: true,
      reply: mds.map((m) => m.textContent).join("\n").trim(),
      thinking: th ? th.textContent.trim() : "",
      item,
    };
  }

  async function waitFor(pred, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (pred()) return true;
      await sleep(120);
    }
    return false;
  }

  // ── Sending ───────────────────────────────────────────────────────────────
  // DeepSeek's composer is a <textarea> driven by React. We must set .value via
  // the native prototype setter so React's onChange fires, then dispatch an input
  // event, then click the primary send button (Enter inserts a newline).
  function setTextareaValue(el, v) {
    if (el.matches && el.matches('[contenteditable]')) {
      el.focus();
      try { document.execCommand("selectAll", false); } catch {}
      try { document.execCommand("insertText", false, v); } catch {}
      if ((el.innerText || "") !== v) el.textContent = v;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: v }));
      return;
    }
    const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, v);
    else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function pressEnter(editor) {
    const o = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    editor.dispatchEvent(new KeyboardEvent("keydown", o));
    editor.dispatchEvent(new KeyboardEvent("keyup", o));
  }

  // Click DeepSeek's primary footer button to send. Send arrow and stop square
  // are the SAME button, so we refuse to click whenever a generation is live.
  function clickSendButton() {
    if (isBusyNow()) return false;
    const btn = findSendBtn();
    if (btn && !isStopBtn(btn) && btn.getAttribute("aria-disabled") !== "true") {
      btn.click();
      return true;
    }
    return false;
  }

  // DeepSeek's composer accepts unbounded text at the DOM level (no maxlength),
  // but a JS guard blocks the SEND past 163840 characters (= 160 KiB, validated
  // live 2026-07-22): the send button is swallowed and a toast "Content is too
  // long (N%)" appears (N = excess percentage, NOT a char count). A large tool
  // result (big http_get / get_page_text / luau dump) would then silently wedge
  // the loop in the input box. Truncate outgoing text to a prudent margin below
  // the cap, keeping the head AND tail so neither the start nor the end of a
  // result is lost, and mark the gap so the model knows content was dropped and
  // does not retry the whole call. DeepSeek-only cap; other providers keep their
  // own. Same head+tail approach as qwen.js / arena.js.
  const SEND_CAP = 163840;   // composer send-guard limit
  const SEND_MAX = 160000;   // prudent margin below the cap (+ room for the marker)
  function truncateForSend(text) {
    if (!text || text.length <= SEND_MAX) return text;
    const omitted = text.length - SEND_MAX;
    const marker =
      `\n\n[…RLScript: result truncated to fit DeepSeek's ${SEND_CAP}-character ` +
      `input limit - ${omitted} of ${text.length} characters omitted. Do NOT re-run ` +
      `the command; work with the head and tail shown here…]\n\n`;
    const budget = SEND_MAX - marker.length;
    const headLen = Math.floor(budget * 0.85);
    const tailLen = budget - headLen;
    return text.slice(0, headLen) + marker + text.slice(text.length - tailLen);
  }

  async function typeAndSend(text, images) {
    const editor = getEditor();
    if (!editor) throw new Error("DeepSeek input box not found");
    editor.focus();
    text = truncateForSend(text);
    setTextareaValue(editor, text);
    // Attach images LAST, right before the send click - see gemini.js's
    // typeAndSend for why (attaching before retyping the text can sever the
    // site's binding between the pending upload and the message being sent).
    const hasImages = !!(images && images.length);
    if (hasImages) {
      try { await attachImages(images); } catch {}
      // DeepSeek REFUSES the send until the attachment finishes uploading, and its
      // upload spinner (.ds-loading) is NOT a reliable "done" signal - it lingers on
      // the thumbnail and isBusyNow() counts it as "busy", which is what wedged the
      // send. So don't gate on the spinner: POLL - click the send ARROW (guarded on
      // !isStopBtn so we never hit the stop square) and confirm the composer
      // cleared; retry until the upload completes and DeepSeek accepts the send, or
      // we time out. Self-correcting, with no dependency on the exact upload-done
      // DOM node (the file-input path in attachImages does the real upload).
      const t0 = Date.now();
      while (Date.now() - t0 < 25000) {
        const btn = findSendBtn();
        if (btn && !isStopBtn(btn) && btn.getAttribute("aria-disabled") !== "true") {
          try { btn.click(); } catch {}
        }
        if (await waitFor(() => editorText().trim() === "" || isHardGenerating(), 1200)) return;
      }
      return;
    }
    await waitFor(() => {
      const btn = findSendBtn();
      return btn && btn.getAttribute("aria-disabled") !== "true" && !isStopBtn(btn);
    }, 800);
    if (!clickSendButton() && !isBusyNow()) {
      pressEnter(editor);
    }
  }

  function stopGeneration() {
    const b = findSendBtn() || document.querySelector(S.stopBtn);
    if (isStopBtn(b)) try { b.click(); } catch {}
  }

  // ── Error / limit detection (site chrome only, never model output) ───────
  function scanError() {
    try {
      for (const el of document.querySelectorAll(S.errorSurfaces)) {
        if (el.offsetParent === null) continue;
        try { if (el.closest(S.chatItem)) continue; } catch {}
        const t = (el.innerText || "").trim();
        if (t.length > 8 && t.length < 600 && RE.contextLimit.test(t)) return t.slice(0, 240);
      }
    } catch {}
    if (!getEditor()) return "The input box disappeared (session ended?).";
    return null;
  }

  // Short SYSTEM-message shapes the site renders as an assistant reply.
  const isTooLongMsg = (text) => RE.tooLong.test(text);
  const isBusyMsg = (text) => RE.busy.test(text);

  // ── Image attachment (Studio captures → composer) ────────────────────────
  function fileFromImage(img, i) {
    const mime = img.mimeType || "image/jpeg";
    const bin = atob(img.data);
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    const ext = mime.includes("png") ? "png" : "jpg";
    return new File([arr], `rlscript_${Date.now()}_${i}.${ext}`, { type: mime });
  }

  // Staged composer attachments. DeepSeek's file-list uses fully HASHED classes
  // (validated live 2026-07-21: the old `.ds-file-list`/`[class*=thumbnail]`
  // selectors matched NOTHING), so key off the preview IMAGE itself: a pending
  // upload is an `<img src="blob:...">` that is NOT inside a chat message
  // (history/sent images use CDN urls in `.ds-message` turns). This is the signal
  // the idempotency + paste-vs-fileinput dedup depend on; with the stale selector
  // both were inert and one capture re-attached ~20x (seen live), wedging the
  // uploads and the send.
  const attachThumbs = () => {
    try {
      const items = allItems();
      return [...document.querySelectorAll("img")].filter(
        (im) => !items.some((it) => it.contains(im)) &&
          (/^blob:/.test(im.getAttribute("src") || "") || /^rlscript_/.test(im.getAttribute("alt") || "")));
    } catch { return []; }
  };

  // Remove any pending attachments from the composer (used to clean up a
  // failed upload so the feedback message still sends as clean text).
  function clearAttachments() {
    try {
      document.querySelectorAll(`${S.attachArea} [class*='delete'], ${S.attachArea} [class*='close'], ${S.attachArea} [class*='remove']`)
        .forEach((d) => ["mouseover", "mousedown", "mouseup", "click"]
          .forEach((t) => { try { d.dispatchEvent(new MouseEvent(t, { bubbles: true })); } catch {} }));
    } catch {}
  }

  async function attachImages(images) {
    const editor = getEditor();
    if (!editor || !images || !images.length) return false;
    // IDEMPOTENCY: submitAndGetBase retries typeAndSend up to 4x, reusing the same
    // images; without this guard each retry re-attached, stacking duplicate
    // thumbnails (the "doublot" - two identical previews - that then wedged the
    // send). If anything is already staged, treat the attach as done.
    if (attachThumbs().length > 0) return true;
    const want = images.length;
    const dt = new DataTransfer();
    images.forEach((img, i) => { try { dt.items.add(fileFromImage(img, i)); } catch {} });
    if (!dt.items.length) return false;
    editor.focus();
    // Use the hidden <input type=file> as the PRIMARY path: it triggers DeepSeek's
    // REAL upload (POST /api/v0/file/upload_file → the thumbnail's spinner clears
    // and the send is allowed). A synthetic PASTE only creates a LOCAL blob preview
    // and NEVER uploads (validated live: no upload_file request, `.ds-loading`
    // spinner stuck forever, DeepSeek refuses the send) - so paste is only a
    // last-resort fallback when no file input exists.
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      try {
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {}
    } else {
      editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }
    // A thumbnail appearing is our success signal.
    return await waitFor(() => attachThumbs().length >= want, 15000);
  }

  // Stable identity of the current conversation (used to persist "started").
  // The root path = a fresh chat with no id yet → "" (transient, never persisted).
  const conversationKey = () => (location.pathname === "/" ? "" : location.pathname);

  // ── User-send interception ────────────────────────────────────────────────
  // The core supplies callbacks; this provider wires them to DeepSeek's
  // composer events (Enter key, send-button click, native stop / continue).
  // handlers = {
  //   isBlocked():bool        - agent busy (injecting/running/starting)
  //   isStarted():bool        - a RLScript session exists in this chat
  //   onBlockedAttempt()      - user tried to send before starting (fresh chat)
  //   onUserMessage(base)     - a genuine user message is being sent
  //   onNativeStop()          - user clicked the site's own stop button
  //   onNativeContinue()      - user clicked the site's truncation Continue
  // }
  function installSendHooks(handlers) {
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
        const editor = getEditor();
        if (!editor || !editor.contains(e.target)) return;
        const text = editorText().trim();
        if (text === "") return;

        if (handlers.isBlocked()) return;

        // No session yet → the user must click "Start session" first. ONLY on a
        // blank chat: an existing conversation isn't ours to gate.
        if (!handlers.isStarted()) {
          if (!chatIsEmpty()) return; // existing conversation → let the site handle it
          handlers.onBlockedAttempt(); // nudge only; never block plain chat
          return;
        }

        handlers.onUserMessage(assistantCount());
      },
      true
    );

    // Users also send by CLICKING the send button - handle that path too.
    document.addEventListener(
      "click",
      (e) => {
        // Not on a chat page (e.g. login / OAuth page) - never intercept anything.
        if (!getEditor()) return;
        const t = e.target;
        // The native "Continue" button = a clear intent to RESUME after a stop.
        const cont = t && t.closest && t.closest(".ds-button");
        if (cont && RE.continueBtn.test((cont.innerText || "").trim())) {
          handlers.onNativeContinue();
          return;
        }
        const btn = t && t.closest && t.closest(S.sendBtn);
        if (!btn) return;
        // DeepSeek's stop button shares the send button's spot (square = stop).
        if (isStopBtn(btn)) {
          handlers.onNativeStop();
          return;
        }
        if (btn.getAttribute("aria-disabled") === "true") return;
        if (handlers.isBlocked()) return;
        if (!handlers.isStarted()) {
          if (!chatIsEmpty()) return;
          handlers.onBlockedAttempt(); // nudge only; never block plain chat
          return;
        }
        handlers.onUserMessage(assistantCount());
      },
      true
    );
  }

  // ── Tool-block location for camouflage ────────────────────────────────────
  // Hide the raw tool call so nothing of it leaks beside the core's chip.
  // DeepSeek markdown often SPLITS a ###LUA### … ###END_LUA### block across
  // several <p> paragraphs, so we hide the whole CONTIGUOUS RUN of block-level
  // children from the start marker through the end marker. Returns where to
  // insert the chip: {parent, ref} - or null if no tool block was found.
  function findToolBlockSpot(item, chip) {
    const P = RLParse;
    const hasStart = (t) => P.LUA_START_RE.test(t) || t.includes("###mcp_tool###");
    const hasEnd = (t) => P.LUA_END_RE.test(t) || t.includes("###end_mcp_tool###") || t.includes("###end-mcp_tool###");
    const isJson = (t) => /\{\s*"(?:command|tool)"\s*:/.test(t);
    const th = findThinking(item);
    let containers = replyNodes(item).filter((m) => th ? !th.contains(m) : true);
    if (!containers.length) containers = [item];
    if (!containers.length) return null;
    let parent = null, ref = null;
    for (const container of containers) {
      const kids = [...container.children].filter((k) => k !== chip && !(chip && k.contains(chip)));
      let i = 0;
      while (i < kids.length) {
        const txt = (kids[i].textContent || "");
        const tLow = txt.toLowerCase();
        const startsBlock = hasStart(tLow);
        if (!startsBlock && !isJson(txt)) { i++; continue; }
        // Found the start of a tool block. Hide this child…
        const runStart = i;
        let runEnd = i;
        if (startsBlock && !hasEnd(tLow)) {
          // multi-element LUA/MCP block → extend until the end marker (or, if the
          // turn is still truncated, to the end of this container).
          let j = i + 1;
          runEnd = kids.length - 1;
          for (; j < kids.length; j++) {
            if (hasEnd((kids[j].textContent || "").toLowerCase())) { runEnd = j; break; }
          }
        }
        for (let k = runStart; k <= runEnd; k++) {
          // Prefer hiding the whole code-block wrapper (language label / Copy bar).
          let hide = kids[k];
          const wrap = hide.closest("[class*='code'], .md-code-block");
          if (wrap && container.contains(wrap) && wrap !== container) hide = wrap;
          hide.classList.add("rl-tool-hide");
          if (!ref && hide.parentElement) { parent = hide.parentElement; ref = hide; }
        }
        i = runEnd + 1;
      }
    }
    return ref ? { parent, ref } : null;
  }

  return {
    id: "deepseek",
    displayName: "DeepSeek",
    // DYNAMIC: DeepSeek's Instant/Expert models are text-only, but the V4 UI has a
    // dedicated "Vision" model tab. When the user selects Vision we honour it (see
    // enforceComposer) and this getter flips true, so main.js stops blocking
    // screen_capture and stops turning returned images into errors. Any other tab →
    // false. A getter so a mid-session tab switch is reflected immediately.
    get supportsVision() { return isVisionSelected(); },
    timings,
    // Reasoning-area selector, exported so the CORE's raw-command-visible
    // probes can exclude it: DeepSeek QUOTES the command JSON/###LUA### inside
    // its thinking, which the camouflage never hides (by design) - without
    // this exclusion those quotes read as "raw block still visible" forever
    // (seen live: 60Hz chip rebuild spam + done→run→done chip flapping).
    thinkingSel: S.thinking,
    init({ diag: d } = {}) {
      if (d) diag = d;
      try { document.documentElement.setAttribute("data-rl-ds-ver", "2026-09_v41-tolerant"); } catch {}
    },
    // turns
    allItems, isUserItem, isAssistantItem, itemText, classifyText,
    assistantCount, userCount, lastAssistant, lastAssistantId, itemKey, readAssistant,
    streamLen, snapshot,
    // composer / state
    getEditor, editorText, chatIsEmpty, isFreshChat, composerFrame, barMount,
    setInputLock, typeAndSend, stopGeneration,
    isGenerating, isBusyNow, isHardGenerating, genDebug,
    enforceComposer, ensureComposerReady,
    turnHalted, findContinueBtn, clickContinueBtn,
    scanError, isTooLongMsg, isBusyMsg,
    // actions
    attachImages, clearAttachments, conversationKey,
    installSendHooks, findToolBlockSpot,
  };
})();
