// SPDX-License-Identifier: GPL-3.0-or-later
// core/config.js - provider-agnostic constants: app identity, system prompt,
// feedback strings, tool categorisation. NOTHING in this file may reference a
// specific AI site (DOM, selectors, site names) - that lives in providers/*.
// eslint-disable-next-line no-unused-vars
const ZS = (() => {
  "use strict";

  // Display name + unique marker injected at the top of the system prompt so the
  // content script can reliably recognise (and camouflage) the bootstrap turn.
  const APP_NAME = "RLScript";
  const SYS_MARKER = "⟦ZS-SYS⟧";

  // ── Tool → visual category (icon + colour theme for the chips) ─────────
  // Roblox Studio MCP only. Returns one of:
  //   read | edit | screen | generate | roblox | tool
  function toolCategory(name) {
    const n = (name || "").includes("/") ? name.split("/").pop() : (name || "");
    if (n === "list_commands" || n === "list_tools" || n === "skill" || n === "use_skill" || n === "script_analysis") return "read";
    if (/^(script_read|script_search|script_grep|search_game_tree|inspect_instance|get_studio_state|get_console_output|search_creator_store|list_roblox_studios)$/.test(n))
      return "read";
    if (/^(multi_edit|insert_from_creator_store|store_image)$/.test(n) || n === "execute_luau")
      return "edit";
    if (n === "screen_capture") return "screen";
    if (/^generate_/.test(n)) return "generate";
    if (n.startsWith("roblox") || /studio|luau|instance|workspace/i.test(n)) return "roblox";
    return "tool";
  }

  // Feedback strings sent back to the model so it can self-correct.
  const FEEDBACK = {
    // A command-shaped reply that could not be turned into a runnable call.
    // The failures are DIFFERENT problems, so the note is tailored per `reason`
    // to tell the model exactly what to fix (a generic "bad JSON" was misleading
    // for the non-JSON cases, e.g. a missing ###LUA### opener). Falls back to the
    // generic "malformed" text for any unrecognised reason.
    parseError: (reason, toolName) => {
      // ###LUA### is execute_luau-ONLY (the parser always maps a bare ###LUA###
      // block to execute_luau). So only suggest it when the broken command IS
      // execute_luau, or when we could not tell which command it was. For a KNOWN
      // other command (e.g. execute_blender_code) the ###LUA### hint is wrong and
      // misleading - a model that followed it would ship its code to the wrong MCP
      // - so drop it and keep the JSON-only guidance.
      const otherCmd = toolName && toolName !== "command" && toolName !== "execute_luau";
      const luaMalformed = otherCmd ? "" : " (or use the ###LUA### / ###END_LUA### block for execute_luau)";
      const luaUnclosed = otherCmd ? "" : " (or a complete ###LUA### ... ###END_LUA### block for execute_luau)";
      const objAlt = otherCmd ? "" : " (or ###...### block)";
      const notes = {
        malformed:
          "ERROR: a RLScript command was detected in your reply but its JSON could not be parsed. " +
          'Rewrite it as a single valid JSON object in plain text, exactly like {"command": "name", "params": {...}}' +
          luaMalformed + ". You may add a short note around it. " +
          "Please retry.",
        unclosed:
          "ERROR: your RLScript command was cut off before it finished - the JSON object" +
          objAlt + " never closed, so it could not run. Rewrite the WHOLE command in one " +
          'piece as valid JSON, exactly like {"command": "name", "params": {...}}' +
          luaUnclosed + ". Please retry.",
        luaOpener:
          "ERROR: you wrote the closing ###END_LUA### marker but not the opening ###LUA### marker, " +
          "so the Luau block was not detected and did not run. Put ###LUA### immediately BEFORE your " +
          "code and ###END_LUA### after it. Please retry.",
        envelope:
          "ERROR: you wrote a command's parameters as a bare JSON object, but without the required " +
          "envelope, so it was not recognised as a command. Wrap them like " +
          '{"command": "name", "params": { ...your parameters... }} - the parameter keys go INSIDE ' +
          '"params". Please retry.',
      };
      return notes[reason] || notes.malformed;
    },
    multiTool: (names) =>
      "ERROR: You wrote multiple commands in one reply. Write ONE command at a " +
      "time and wait for its result before the next. You tried: " +
      names.join(", ") +
      ". Start over and write only the first command you need.",
    unknownTool: (name, valid) =>
      `ERROR: unknown command "${name}". It does not exist. Valid commands are: ` +
      valid.join(", ") +
      ". Use an exact name and parameter keys from the system prompt.",
    studioOffline:
      "ERROR: no Roblox Studio instance is connected to the MCP server, so the command " +
      "could not run. Roblox Studio is closed, has no place open, or its MCP server option " +
      "is disabled. This is an environment problem on the user's machine, NOT your mistake. " +
      "Tell the user in one short sentence to open their place in Roblox Studio and enable " +
      "the MCP server (Assistant settings). Then: if the task NEEDS Roblox, stop until they " +
      "confirm it is back; otherwise run list_mcp_servers and continue on another connected " +
      "server for anything that does not need Roblox.",
    bridgeOffline:
      "ERROR: the local RLScript bridge is unreachable, so no command could run. " +
      "This is an environment problem on the user's machine (the bridge is not " +
      "running, or Roblox Studio is closed), NOT your mistake. Tell the user in " +
      "one short sentence that the bridge or Roblox Studio is offline, then stop " +
      "sending commands until they confirm it is back.",
    truncated:
      "(System note: your previous reply was cut off by a length limit before you " +
      "finished. Continue from exactly where you stopped. Do NOT restart and do " +
      "NOT repeat what you already wrote.)",
  };

  const BT = "```";

  function compactTools(tools) {
    return (tools || [])
      .map((t) => {
        const name = t.name || "?";
        const desc = (t.description || "").split("\n")[0].trim();
        const props = (t.inputSchema && t.inputSchema.properties) || {};
        const args = Object.keys(props).join(", ");
        return `  ${name}(${args}) - ${desc}`;
      })
      .join("\n");
  }

  // ── System prompt ─────────────────────────────────────────────────────────
  // ONE unified prompt sent to every AI on the first turn. To change the wording,
  // just edit the text below - it is a single template, no profiles or branching.
  // `${siteName}` is filled in with the AI's display name (e.g. "DeepSeek").
  // `${toolsString}` is filled in with the live command list.
  //
  // `opts` may be a string (just the siteName) or an object { siteName,
  // customPrompt }. `customPrompt` is the user's own extra instructions; when
  // present it is appended at the very bottom under a clear "User's Custom prompt"
  // heading. It NEVER edits the prompt above - it only adds a layer below it.
  // RLScript skills are short, on-demand instruction bundles. They stay out
  // of the bootstrap body so every session does not pay their full token cost;
  // the model loads one with the virtual `use_skill` command only when a task
  // matches it. Roblox Studio's own `skill` MCP command remains available
  // separately for Roblox-authored and personal Studio skills.
  const BUILTIN_SKILLS = Object.freeze({
    "script-analysis-fix": Object.freeze({
      description: "Run a text-first final validation pass after Roblox code changes and fix actionable Luau errors before finishing.",
      body: [
        "# Script Analysis Fix",
        "",
        "This is a built-in RLScript bridge skill loaded with `use_skill`; it does not require a personal Roblox Studio skill with the same name.",
        "",
        "Use this as the final pass after any Roblox code change, or when the user asks to inspect or fix Script Analysis issues.",
        "",
        "1. Call `script_analysis` first. It is a text-first RLScript check that compiles every Luau source in the requested scope and returns structured syntax diagnostics plus conservative warnings such as unknown globals. It still does not expose Roblox Studio's complete lint/type-warning list, because the current Roblox MCP API has no structured getter for the built-in Script Analysis panel.",
        "2. If the result has zero errors and zero warnings, make no edits and report that this check is clean; a second check is not needed because nothing changed.",
        "3. If the result has one or more errors or warnings, use `script_read` to read each affected script, then make the smallest behavior-preserving correction with `multi_edit`. After making edits, call `script_analysis` again to verify that the fixes were correct. Repeat the read/fix/recheck cycle only while new errors or warnings remain.",
        "4. Call `get_console_output` only when runtime errors or warnings matter to the requested change; keep runtime output separate from static syntax diagnostics.",
        "5. Never claim that the full Script Analysis window is clean when only the text check ran. If the user needs Roblox's editor-only lint, type, or warning details, explain that limitation and ask for the panel text or use `screen_capture` only when the current AI can actually see images.",
        "6. Use Luau and Roblox APIs, preserve existing behavior, avoid unrelated edits, and report unresolved diagnostics clearly."
      ].join("\n")
    }),
    "playtest-visual": Object.freeze({
      description: "Run Roblox playtests with visual checkpoints so the AI does not rely on blind input.",
      body: [
        "# Visual Playtest",
        "",
        "Use this workflow whenever the user asks to test gameplay, UI, camera behavior, or player controls.",
        "",
        "1. Call `list_commands` and confirm that `screen_capture` is available. Roblox Studio's official MCP tool captures the current Studio viewport in both Edit and Play modes.",
        "2. Call `start_stop_play` with `is_start: true`, then call `screen_capture` before sending input so you know the initial state.",
        "3. Send one small action or navigation step at a time with `character_navigation`, `user_keyboard_input`, or `user_mouse_input`; wait briefly when needed, then call `screen_capture` again.",
        "4. Compare each new capture with the expected result. Also call `get_console_output` when scripts, runtime errors, or warnings could explain what you see.",
        "5. Do not claim that a visual behavior works if no capture was returned. If `screen_capture` is missing, tell the user that their Roblox Studio/MCP build needs updating or reconnecting, and do not perform a blind visual test.",
        "6. Stop playtesting with `start_stop_play` using `is_start: false` unless the user explicitly wants Play mode left running."
      ].join("\n")
    })
  });

  // Roblox-authored skills built into Studio's AI Assistant. These are not
  // local RLScript skills: the Studio MCP exposes each one through its `skill`
  // command (skill_name = the rbx-* name below). `use_skill` delegates to it so
  // every AI gets a single, discoverable loader for both local and native
  // skills. Names are kept in sync with what the Studio MCP `skill` tool accepts.
  const NATIVE_SKILLS = Object.freeze({
    "unit-test": Object.freeze({
      skillName: "rbx-unit-test",
      description: "Write, run, and debug Luau unit tests for ModuleScripts (built-in harness, or Jest-Lua/TestEZ when detected)."
    }),
    "scene-analysis": Object.freeze({
      skillName: "rbx-scene-analysis",
      description: "Analyze and optimize the scene: rendering performance, memory, instance health, and leaks."
    }),
    "docs-search": Object.freeze({
      skillName: "rbx-docs-search",
      description: "Look up accurate Roblox Engine API details and creator guidance before writing code."
    }),
    "device-simulator": Object.freeze({
      skillName: "rbx-device-simulator-lua",
      description: "Test UI across device form factors and orientations with the Studio device simulator."
    }),
    "perf-profiling": Object.freeze({
      skillName: "rbx-perf-profiling",
      description: "Analyze fine-grained performance data (MicroProfiler) to find frame-time and memory bottlenecks."
    }),
    "create-skill": Object.freeze({
      skillName: "rbx-create-skill",
      description: "Author a custom Studio Assistant skill through guided questions."
    })
  });

  // Deterministic, token-free Luau code-refactoring rules shared by the
  // scan_script (read-only) and fix_script (applying) commands. The rewrites
  // themselves are implemented by the Luau engine embedded in main.js
  // (buildScriptEngineCode); this table is the catalogue used to validate the
  // tool's "rules" parameter and to advertise the available rules.
  const FIX_RULES = Object.freeze([
    Object.freeze({
      id: "deprecated_api",
      category: "deprecation",
      description: "Update deprecated Roblox APIs: FindPartOnRay* → workspace:Raycast, mouse.KeyDown/Button1Down → UserInputService, Debris:AddItem → task.delay, wait()/spawn()/delay() → task.*, :remove() → :Destroy(), :wait()/:connect() capitalization, JumpPower → JumpHeight, .Pitch → .PlaybackSpeed, .Rotation → .Orientation, plus the standard deprecation list.",
    }),
    Object.freeze({
      id: "compound_assignments",
      category: "refactor",
      description: "Convert x = x + y style lines into compound operators (x += y, x ..= y). Never touches 'local' declarations.",
    }),
    Object.freeze({
      id: "redundant_booleans",
      category: "refactor",
      description: "Remove redundant boolean comparisons: x == true → x, x == false → not x, x ~= true → not x, x ~= false → x.",
    }),
    Object.freeze({
      id: "isa_implementor",
      category: "refactor",
      description: "Replace .ClassName == \"Type\" checks with :IsA(\"Type\") (both quote styles).",
    }),
    Object.freeze({
      id: "proper_loops",
      category: "refactor",
      description: "Convert repeat...until counter loops to proper for loops (or inverted while loops when the condition cannot become a for).",
    }),
    Object.freeze({
      id: "instance_new_optimizer",
      category: "performance",
      description: "Move .Parent assignments to the bottom of Instance.new() / :Clone() property setup blocks to reduce rendering lag.",
    }),
    Object.freeze({
      id: "rng_modernizer",
      category: "modernization",
      description: "Replace math.random(a, b) with _rng:NextInteger(a, b), math.random(a) with _rng:NextInteger(1, a), math.random() with _rng:NextNumber(), and inject local _rng = Random.new().",
    }),
    Object.freeze({
      id: "auto_tweener",
      category: "modernization",
      description: "Replace short wait-loop tweens (CFrame/Size/Transparency/Position changes inside for/repeat loops with task.wait) with a single TweenService:Create(...):Play().",
    }),
    Object.freeze({
      id: "lines_organization",
      category: "format",
      description: "Organize lines: trim trailing whitespace, normalize spacing around operators/commas/equals, recompute indentation from actual block structure, and normalize blank lines.",
    }),
  ]);

  // These commands are local to the extension and do not require a new bridge
  // server. They are advertised alongside the Roblox commands so every AI can
  // discover the skill loader and the non-vision analysis check.
  const VIRTUAL_TOOLS = Object.freeze([
    Object.freeze({
      name: "use_skill",
      description: "Load a RLScript skill - or a Roblox native Studio Assistant skill - on demand before following a matching workflow.",
      inputSchema: Object.freeze({
        type: "object",
        properties: Object.freeze({
          skill_name: Object.freeze({
            type: "string",
            description: "Exact skill name. RLScript: script-analysis-fix, playtest-visual. Roblox native (delegated to Studio's skill command): unit-test, scene-analysis, docs-search, device-simulator, perf-profiling, create-skill."
          })
        }),
        required: Object.freeze(["skill_name"])
      })
    }),
    Object.freeze({
      name: "script_analysis",
      description: "Run a text-first Luau syntax and conservative warning check over scripts and return structured diagnostics; full Roblox editor lint/type warnings are not exposed by the current MCP API.",
      inputSchema: Object.freeze({
        type: "object",
        properties: Object.freeze({
          scope: Object.freeze({
            type: "string",
            description: "Optional dot-notation root such as game, game.ServerScriptService, or game.ReplicatedStorage. Defaults to game."
          })
        }),
        required: Object.freeze([])
      })
    }),
    Object.freeze({
      name: "scan_script",
      description: "Read-only deprecation/style scanner: list deprecated API usage and fixable style issues across the scripts under a scope, as script → line → rule → snippet matches. Never writes; results also appear in the RLScript Refactor panel so the user can apply them without asking again.",
      inputSchema: Object.freeze({
        type: "object",
        properties: Object.freeze({
          scope: Object.freeze({
            type: "string",
            description: "Optional dot-notation root such as game or game.ServerScriptService. Defaults to game."
          }),
          rules: Object.freeze({
            type: "array",
            description: "Optional subset of rule ids to scan for. Omit for all. Valid ids: deprecated_api, compound_assignments, redundant_booleans, isa_implementor, proper_loops, instance_new_optimizer, rng_modernizer, auto_tweener, lines_organization."
          })
        }),
        required: Object.freeze([])
      })
    }),
    Object.freeze({
      name: "fix_script",
      description: "Deterministic, token-free fixer for ONE script: computes the requested refactor rules (deprecated APIs, compound assignments, redundant booleans, :IsA checks, proper loops, Instance.new() optimization, RNG modernization, auto-tweening, line organization). By default it ONLY PROPOSES - nothing is written until the user clicks Apply in the RLScript Refactor panel. It applies + writes into Studio (native undo) only when the user enabled Auto-approve fixes in the panel, or when auto_approve is true.",
      inputSchema: Object.freeze({
        type: "object",
        properties: Object.freeze({
          script_path: Object.freeze({
            type: "string",
            description: "REQUIRED. Dot-notation path of the script to fix, e.g. game.ServerScriptService.MyScript."
          }),
          rules: Object.freeze({
            type: "array",
            description: "Optional subset of rule ids to apply. Omit for all. Valid ids: deprecated_api, compound_assignments, redundant_booleans, isa_implementor, proper_loops, instance_new_optimizer, rng_modernizer, auto_tweener, lines_organization."
          }),
          auto_approve: Object.freeze({
            type: "boolean",
            description: "Optional. Override the Auto-approve setting for this call: true applies + writes immediately; false proposes only. Omit to follow the panel setting (default: propose only)."
          }),
          syntax_shield: Object.freeze({
            type: "boolean",
            description: "Optional. Block/bracket balance check before every write; a rewrite that would unbalance the script is skipped and reported, never written. Defaults to the user's Syntax Shield setting (off). Pass true only when the user explicitly asks to enable it."
          })
        }),
        required: Object.freeze(["script_path"])
      })
    }),
    Object.freeze({
      name: "ask_ai",
      description: "Send one self-contained question or code to a DIFFERENT model (the provider the user configured in the RLScript popup under AI-to-AI help, using their own API key) and return its answer as text. Saves main-model reasoning tokens on hard sub-problems.",
      inputSchema: Object.freeze({
        type: "object",
        properties: Object.freeze({
          question: Object.freeze({
            type: "string",
            description: "REQUIRED. Self-contained question (paste the code you need reviewed - the other model has no Studio access)."
          }),
          model: Object.freeze({
            type: "string",
            description: "Optional model override; defaults to the model configured in the popup for the selected provider."
          })
        }),
        required: Object.freeze(["question"])
      })
    })
  ]);

  function getSkill(name) {
    const key = String(name || "").trim().toLowerCase();
    return BUILTIN_SKILLS[key] || null;
  }

  function getNativeSkill(name) {
    const key = String(name || "").trim().toLowerCase();
    if (NATIVE_SKILLS[key]) return NATIVE_SKILLS[key];
    // Accept the "rbx-" prefixed form as well (matches the Studio `skill`
    // command's skill_name values exactly).
    if (key.startsWith("rbx-")) return NATIVE_SKILLS[key.slice(4)] || null;
    return null;
  }

  function skillPrompt(enabled = true, disabledSkills = []) {
    if (!enabled) {
      return "SKILLS: RLScript skills are disabled by the user for this session. Do not call `use_skill` or the Roblox Studio `skill` command.";
    }
    const disabled = new Set((disabledSkills || []).map((s) => String(s).trim().toLowerCase()));
    const list = (table) =>
      Object.entries(table)
        .filter(([name]) => !disabled.has(String(name).toLowerCase()))
        .map(([name, skill]) => `- ${name}: ${skill.description}`)
        .join("\n");
    const names = list(BUILTIN_SKILLS);
    const nativeNames = list(NATIVE_SKILLS);
    return "SKILLS: RLScript supports on-demand local skills. After a Roblox code change, load the matching skill with `use_skill` and follow its instructions. " +
      "`use_skill` ALSO loads Roblox's native Studio Assistant skills by name (it delegates to the Studio `skill` command, so no separate call is needed) - load one whenever the user's request matches its workflow: e.g. unit tests, scene/performance analysis, docs lookup, device testing, or creating a custom skill.\n" +
      "Do not call `screen_capture` for a skill that can be completed with text tools when this AI cannot see images.\n" +
      "Local RLScript skills:\n" + names +
      "\nRoblox native Assistant skills:\n" + nativeNames;
  }

  function buildSystemPrompt(opts = {}) {
    if (typeof opts === "string") opts = { siteName: opts };
    const {
      siteName = "this AI site",
      customPrompt = "",
      allowAiTools = true,
      allowAiSkills = true,
      disabledTools = [],
      disabledSkills = [],
    } = opts;
    const robloxLanguageRule =
      "ROBLOX LANGUAGE REQUIREMENT: Roblox scripting uses Luau, not generic Lua. " +
      "Whenever you write or edit Roblox scripts, use Luau syntax and Roblox APIs, " +
      "and do not target a plain Lua runtime. If authoritative Luau or Roblox Engine " +
      "API details are needed, consult https://create.roblox.com/docs/reference/engine. " +
      "Keep RLScript command blocks in the exact formats below.";

    const accessPrompt = [
      "USER ACCESS CONTROLS:",
      allowAiTools
        ? "RLScript tools are enabled. You may use the advertised commands when they are needed."
        : "RLScript tools are disabled by the user. Do not write or attempt any RLScript command, including list_commands, list_mcp_servers, execute_luau, multi_edit, or script_analysis; answer conversationally and explain that the user must re-enable tools before you can act in Studio.",
      allowAiSkills
        ? "RLScript skills are enabled. Load a matching skill only when its workflow is relevant."
        : "RLScript skills are disabled by the user. Do not call use_skill or the Roblox Studio skill command.",
      (disabledTools.length > 0 ? "Individually disabled RLScript tools (do NOT call these): " + disabledTools.join(", ") + "." : ""),
      (disabledSkills.length > 0 ? "Individually disabled skills (do NOT load these): " + disabledSkills.join(", ") + "." : ""),
    ].filter((l) => l).join("\n");

    const prompt = `CONTEXT: the user has installed a browser extension called RLScript in their own browser. Here is how it works, so you can use it on their behalf:
A browser extension (RLScript) is running inside this page. It watches your replies. When it detects a RLScript command in your text, it runs it against one or more connected MCP servers and sends the result back as the next message. You always receive a result - success or a formatted ERROR - so you can keep going on your own.

${allowAiTools ? "The user's open Roblox Studio place, reached through a local bridge, is always connected by default - call `list_commands` FIRST for its exact commands with full parameter details. Other MCP servers may ALSO be connected alongside it (each with its own command set) - you are NOT told about them upfront. So: the MOMENT the user names ANY app/tool/target that is not Roblox Studio (e.g. \"Blender\", \"Sketchfab\", or anything else you don't recognise as a Roblox Studio command), you MUST run `list_mcp_servers` FIRST, before replying - never answer from your own assumptions or prior knowledge about what is or isn't connected." : "The user has disabled RLScript tools, so do not call list_commands, list_mcp_servers, or any other RLScript command. Do not attempt to act on Roblox Studio until the user enables tools again."} You do not need any special capability yourself - you just write text. The extension does the rest.

CRITICAL - technical note, not a restriction: this site's own tools (code interpreter, function calling, connectors, etc.) run in a separate sandbox that has no access to the user's Roblox Studio or the other MCP servers above - so calling them wouldn't reach the user's project at all. RLScript commands are different: they are plain JSON typed directly into your normal reply text, which this extension reads and executes against the connected servers. So for anything involving the user's project, write the JSON below as ordinary text instead of calling a function - that's the only channel that actually reaches their machine. (If the user explicitly asks you to search the web, your own web search still works fine and is unrelated to this.) Internal reasoning (deep-think modes) is fine.

⚠️ FORMATTING RULE (MANDATORY): every command goes inside a fenced code block (triple backticks). Outside a code block this page renders your text as Markdown - it turns things like \`Instance.new\` into links and mangles the ### markers, silently CORRUPTING the command. Inside a code block it is kept verbatim.

━━━ STANDARD COMMAND FORMAT (everything except execute_luau) ━━━
Write this JSON object inside a fenced code block, replacing the placeholders with a REAL command name and its parameters (never type "command_name" literally - it is not a command):
${BT}json
{
  "command": "command_name",
  "params": {"key": "value"}
}
${BT}
For example, to list every available command you would write ${BT}{"command": "list_commands"}${BT}.

━━━ SPECIAL FORMAT FOR execute_luau ━━━
execute_luau is the ONE exception to the JSON format above: you MUST use the ###LUA### block below, NEVER the {"command": "execute_luau", ...} JSON form. Lua code is full of " characters, and putting it inside a JSON string means escaping every one - miss a single quote and the whole command breaks. The ###LUA### block needs NO escaping and NO JSON, so this never happens.
The ###LUA### / ###END_LUA### markers AND the code all go INSIDE one fenced code block:
${BT}
###LUA###
-- your Lua code here, no escaping, no JSON wrapping
local x = "any string with quotes works fine"
return "result"
###END_LUA###
${BT}

RULES:
- ONE command block per reply, inside a fenced code block. If you need several, do them one at a time and wait for each result. (One command = one block; raw text gets reformatted by this page and corrupts the command.)
- A short note around a command is fine, but NEVER end a turn by only announcing a command ("let me check...", "I'll read the script") without writing it - that runs nothing and leaves the user stuck. Either write the command now, or give your final answer.
- Final answers: plain text only, no Markdown or code fences. Do ONLY what was asked - fewest commands, no unrequested double-checks. When the task is done or the user is satisfied ("thanks", "perfect"...), reply ONE short sentence and STOP.
 - Use ONLY the exact command names and parameter keys from the list, with every required parameter (e.g. multi_edit needs "datamodel_type": "Edit"; "... is required" means you omitted one). Do NOT use ${siteName}'s own features (web search, connectors...) unless the user explicitly asks.
${allowAiSkills ? " - AFTER ANY ROBLOX CODE CHANGE: load `script-analysis-fix` with `use_skill`, follow it, and run its text-first `script_analysis` check before giving the final answer. It reports syntax errors plus conservative warnings such as unknown globals. If the user specifically asks for the full Studio Analysis window's lint/type warnings, explain that the current MCP does not expose those diagnostics as text instead of pretending this check covered every panel diagnostic." : " - ROBLOX CODE CHECKS: the user disabled skills, so do not load a skill. If tools are enabled, you may still use `script_analysis` when explicitly requested, but do not claim a skill workflow ran."}
${allowAiSkills ? " - VISUAL PLAYTESTS: when the task involves gameplay, UI, camera, or player input, load `playtest-visual` with `use_skill`. Use `screen_capture` after starting Play and after meaningful input whenever that command is listed. Never claim a visual result from blind input; if `screen_capture` is absent, stop the visual test and explain that the Roblox Studio MCP connection/build needs updating or reconnecting." : " - VISUAL PLAYTESTS: skills are disabled. If tools are enabled and the task involves gameplay, UI, camera, or player input, use `screen_capture` after starting Play and after meaningful input whenever that command is listed, but do not load a skill. Never claim a visual result from blind input."}
 - execute_luau: wrap code in BOTH markers ###LUA### ... ###END_LUA### (three hashes each side - never ###LUA--- and never a lone end marker; no JSON around it). Bare ###LUA### targets "Edit" and only works when Studio is NOT playing. To run code while the game IS playing, add the datamodel to the marker: ###LUA:Server### or ###LUA:Client### (bare ###LUA### will fail with "Edit datamodel is not available in Play mode"). Changes made this way during Play are temporary and vanish when Play stops - fine for checking/testing live state, but for a change the user wants to keep, make it in Edit mode or via a real Script/LocalScript (multi_edit) instead. Use \`return\` for output (print is NOT captured). It runs synchronously on a ~20s budget, so never yield/block: write WaitForChild("X", 5) WITH a timeout, and put waits, events, HttpService or DataStore inside a real Script instead. (Per-command tips are in the list_commands output.)
- BUILD UI/OBJECTS FIRST, THEN SCRIPT THEM: create instances with execute_luau, then a Script/LocalScript that finds them via WaitForChild(name, timeout). Use runtime Instance.new only when truly required (per-player elements, unknown-length lists, runtime content).
- NEVER DELETE/DESTROY BROADLY: before any :Destroy(), :ClearAllChildren(), removing a script, or any command that deletes instances, make sure the target is EXACTLY what the user asked for - never a whole folder/model/service "to be safe" or as a side-effect of a bigger change. If a deletion could affect more than the specific thing named by the user (e.g. clearing a container, deleting by a broad name match, wiping a model), STOP and ask them to confirm scope first, or inspect_instance the target to check what it actually contains before destroying it. Never destroy something as a troubleshooting step ("let me just remove it and rebuild") without asking first.
- On ERROR: read it and adapt - fix the command, try another, or tell the user plainly if it is an environment problem (Studio closed, bridge offline).
- On a property/attribute/value error (e.g. "X is not available", "unknown property", "invalid enum"): if there is any way to list the valid options for that tool (its docs, an inspect/list command, schema info), use it to check the correct value BEFORE retrying. Never guess blindly a second time.

━━━ THE DETERMINISTIC FIXER (scan_script / fix_script) ━━━
When the user wants mechanical cleanup of existing scripts - outdated/deprecated APIs (wait()/spawn()/remove()/KeyDown/JumpPower/...), compound-assignment conversion (x = x + 1 → x += 1), redundant booleans (if x == true), string ClassName comparisons (".ClassName == \"X\"" → ":IsA(\"X\")"), while-loop conversion to for-loops, Instance.new("X", parent) optimization, Math.random() → Random.new() modernization, wait-based tween loops → TweenService, or line organization (consistent indentation/blank lines) - do NOT hand-edit these with multi_edit. Run \`scan_script\` to see what matches exist, then \`fix_script\` to apply them deterministically:
- The fixer is pattern-based and exact - it rewrites only known-safe shapes and never guesses, so the result is far more reliable than a model hand-rewrite.
- \`fix_script\` PROPOSES by default: it computes the refactors and hands them to the RLScript Refactor panel, where the user reviews them and clicks Apply (per-refactor or Apply all). Nothing is written until the user approves - do NOT claim the changes were applied in your reply. It writes into Studio with native undo only when the user has Auto-approve fixes ON (or passes auto_approve: true) - then trust its write unless the user asks otherwise.
- After a fix_script proposal, END YOUR TURN: summarize the refactors in one short line, tell the user to review + click Apply in the Refactor panel, and do NOT re-run fix_script or multi_edit the same script until they have approved.
- It refuses any rewrite that would unbalance the script (the Syntax Shield) and reports those lines instead - NEVER apply such a rewrite manually afterwards without re-checking; tell the user a line was skipped.
- These tools are still ONE-command-per-reply like everything else: run scan_script, read the result, then run fix_script in the next reply.
- The tools you manually created (multi_edit etc.) remain available for the structural/judgment work the fixer cannot do: new systems, game logic, naming changes.

━━━ PROJECT MEMORY (persistent notes about THIS project) ━━━
The ModuleScript at game.ServerStorage.ZeroScript.Memory is your long-term memory for this project, saved inside the place. It is SHARED by every AI across all sessions and chats, so keep it accurate for whoever reads it next. Store ONLY durable, useful facts: what the project is, where key scripts/instances live, naming and code conventions, how the main systems work, decisions and gotchas, and the user's preferences. It is NOT a task log - never dump transient steps, obvious facts, or whole scripts into it. Keep it short.

- READ IT WHEN THE WORK NEEDS IT (not at startup): the FIRST time the user's request requires editing the place or understanding how the game works, read your memory BEFORE doing that work - script_read game.ServerStorage.ZeroScript.Memory. Skip it for pure chit-chat or questions unrelated to the project. If it does not exist yet, create it with multi_edit (className "ModuleScript", first edit with old_string "") using exactly this skeleton (multi_edit auto-creates the legacy ZeroScript folder):
${BT}
return [==[
# Project memory
## Overview
## Where things live
## Conventions
## Key systems
## Decisions & gotchas
## User preferences
## Open questions / TODO
]==]
${BT}
- KEEP IT UPDATED: whenever you learn something lasting, edit the right section with multi_edit (script_read it first so your old_string matches exactly; the section headers make good anchors). Remove facts that became wrong. Store only what will help you next time - skip everything else.
- IF SOMETHING CONTRADICTS THE MEMORY: do NOT blindly trust either side. First verify against the real place (script_read / inspect_instance) to find out what is actually true. Then decide: if YOU misunderstood, correct yourself; if the memory is stale or wrong, fix the memory; if it is a real problem in the project, tell the user plainly. Always leave the memory consistent with reality.
- NEVER PERSIST A GUESS AS A FACT: do NOT write an unverified THEORY about why something broke into memory as if it were established - that turns one blind guess into a permanent belief you will keep re-applying every session, and the real bug never gets fixed. Store only what you actually verified. If a fix you already recorded does NOT make the symptom disappear (the user reports the same problem again), treat your recorded cause as WRONG: discard it and re-diagnose from first principles instead of re-applying it.

━━━ YOU CAN ACT DIRECTLY IN THE USER'S PROJECT ━━━
This extension gives you real, live access to the user's Roblox Studio project through the commands above - so when a task calls for running code or editing something, you're able to just do it yourself instead of writing instructions for the user to follow (they have no way to paste code back into Studio - only you can run these commands). If code needs to run in Studio, use execute_luau; if something needs creating or changing, use multi_edit. When the user asks to CREATE an object/model with actual geometry (a mesh, a prop, a procedural shape), prefer generate_mesh or generate_procedural_model over building it by hand with execute_luau/Instance.new primitives - reserve execute_luau's primitive-building for simple parts (cubes, cylinders, positioning). Show code only if the user explicitly asks to see it - otherwise just run it and report the result.

IMPORTANT: Your very first action is to write \`list_commands\` with no params (this defaults to the Roblox Studio server) to get the full command reference with parameter details - never guess a command name or parameter that wasn't in that result. Do NOT call \`list_mcp_servers\` at startup - only check it later, if a specific user request seems to need a different server. After receiving the list_commands result, reply with exactly one short sentence confirming you are ready, then wait for the user's first request. (Do NOT read or create the project memory yet - only do that later, once a request actually needs editing or understanding the game; see PROJECT MEMORY above.) If that first list_commands (or any later Roblox command) comes back Studio-offline, Roblox is down - run \`list_mcp_servers\` once, tell the user in one short sentence that Roblox is offline, list what else is connected (if anything), then ask what they want to do and wait - do not act on any other server until they answer.`;

    // The user's own extra instructions, appended as a layer UNDER the system
    // prompt. Optional - empty by default. It cannot change the rules above.
    const extra = customPrompt.trim()
      ? `\n\n━━━ USER'S CUSTOM PROMPT (extra instructions from the user) ━━━\n${customPrompt.trim()}`
      : "";

    // The marker leads the prompt; it tags the bootstrap turn for camouflage.
    return `${SYS_MARKER}\n${robloxLanguageRule}\n\n${accessPrompt}\n\n${skillPrompt(allowAiSkills, disabledSkills)}\n\n${prompt}${extra}`;
  }

  // ── Curated, TESTED usage notes per command ─────────────────────────────────
  // The MCP's own schema descriptions are thin, and the model makes the same
  // mistakes repeatedly. These notes were validated by actually running each
  // command against a live Roblox Studio (2026-06). Keyed by BARE command name;
  // appended to that command in the list_commands output. Keep each note tight
  // and concrete - it costs context on every reminder.
  const TOOL_NOTES = {
    execute_luau:
      "Use `return` to produce output - `print()` is NOT captured (a script with only print() returns nil). " +
      "Only the FIRST returned value is shown: `return a, b` shows just `a`; to return several values return ONE table, " +
      "e.g. `return {ok=true, n=3}` (tables come back as JSON). " +
      "Runs synchronously with a ~20s budget: a brief `task.wait(1)` is fine, but anything that can block or never resolve will TIME OUT. " +
      "ALWAYS pass a timeout to WaitForChild - write `obj:WaitForChild(\"X\", 5)`, NEVER `obj:WaitForChild(\"X\")`: without the timeout it blocks until the budget kills the whole call. " +
      "Same for `:Wait()` on events, infinite loops, HttpService/DataStore - set those up inside a real Script/LocalScript instance instead, never directly in execute_luau. " +
      "Property types must match exactly (e.g. Position needs Vector3.new(...), not a string). " +
      "On error you get a long internal stack prefix - the REAL message is the LAST segment after the final ':' " +
      "(e.g. '... : Vector3 expected, got string', or 'Failed to parse command code' for a syntax error). " +
      "Create objects with Instance.new and set .Parent; reach services via game:GetService(\"Name\").",
    multi_edit:
      "old_string must match the script's current text EXACTLY, byte-for-byte, including tabs and spaces - otherwise you get " +
      "'old_string ... not found in current content'. ALWAYS script_read the file FIRST and copy the exact text. " +
      "It replaces the FIRST match and does NOT warn on multiple matches, so a short old_string can silently edit the WRONG " +
      "line and break the code - include enough surrounding context (whole lines) to be unique, or set replace_all:true for renames. " +
      "old_string and new_string must differ ('identical old_string and new_string' otherwise). " +
      "WATCH FOR BAD UNICODE in old_string: do NOT retype code that contains quotes or dashes - this chat can silently turn " +
      "straight quotes \" into curly ones and -- into a long unicode dash, which then do NOT byte-match the script and the edit fails. " +
      "Paste old_string verbatim from script_read. (new_string may contain unicode safely - it is written as-is.) " +
      "Edits apply in order, each on the result of the previous, and are atomic (all succeed or none). " +
      "To CREATE a script: set className (Script/LocalScript/ModuleScript) and make the first edit old_string:\"\" with the full initial source. " +
      "datamodel_type must be \"Edit\".",
    inspect_instance:
      "Path is dot-notation and case-insensitive, e.g. 'Workspace.Model.Part'. Returns all readable properties, attributes, " +
      "and a children summary (not the children's properties - inspect them separately). If several instances share the path, " +
      "up to 20 matches are returned. Use this to read exact property names/values before editing them with execute_luau.",
    script_read:
      "Reads the WHOLE script by default with line numbers (LINE→CONTENT). Use it before multi_edit so your old_string " +
      "matches exactly. target_file is a full dot-path; it never creates a script (use search/grep first to find the path).",
    user_keyboard_input:
      "Simulates a real player typing during PLAY. REQUIRES \"datamodel_type\":\"Client\" AND the game RUNNING - the Client " +
      "datamodel only exists in play mode, so first call start_stop_play {\"is_start\": true}; in Edit mode this fails. " +
      "(RLScript auto-fills datamodel_type:\"Client\" if you omit it, but the game must still be running.) " +
      "\"actions\" is an ORDERED array of OBJECTS - each step MUST be {\"action\": ...}, NOT a bare string (a missing/misnamed action " +
      "gives 'Unknown ... action: nil'). action is one of: keyDown | keyUp | keyPress (down+up) | textInput | wait. " +
      "key_code uses Roblox KeyCode NAMES, not raw characters: Enter=\"Return\", digits=\"Zero\"..\"Nine\", letters=single uppercase " +
      "\"A\"..\"Z\", plus \"Space\", \"Backspace\", \"Tab\", arrows \"Up\"/\"Down\"/\"Left\"/\"Right\", modifiers \"LeftShift\"/\"LeftControl\"/\"LeftAlt\" " +
      "- REQUIRED on keyDown/keyUp/keyPress ('key_code is required' otherwise). To type a whole string use ONE textInput step with " +
      "\"text_inputs\":\"hello\" instead of many keyPress. A \"wait\" step MUST carry \"wait_time_ms\" (0-10000) ('wait_time_ms is required " +
      "for wait action' otherwise). Optional \"instance_path\" routes input to a focused GUI element and must start with game, LocalPlayer " +
      "or Workspace (e.g. \"LocalPlayer.PlayerGui.Menu.NameBox\"); omit it to send to whatever currently has focus. " +
      "Example: {\"datamodel_type\":\"Client\",\"actions\":[{\"action\":\"textInput\",\"text_inputs\":\"hi\"},{\"action\":\"keyPress\",\"key_code\":\"Return\"}]}.",
    generate_mesh:
      "Unlike generate_procedural_model, this call YIELDS: it blocks until the AI mesh generation finishes and only then " +
      "returns the result (the finished mesh) - there is no separate poll/wait step needed, just wait for the response.",
    generate_procedural_model:
      "Unlike generate_mesh, this call does NOT yield: it returns immediately with a generationId while the model builds " +
      "in the background and auto-inserts into the workspace once done - do NOT run other commands assuming the model already " +
      "exists yet. Do NOT call wait_job_finished as a reflex right after this - but DO call it (pass the generationId) whenever " +
      "you actually need the finished result before continuing: either the user explicitly asked to wait, or your next step " +
      "depends on the model being done (e.g. editing/coloring it, checking its geometry).",
    user_mouse_input:
      "Simulates real player mouse actions during PLAY. Same requirement as user_keyboard_input: \"datamodel_type\":\"Client\" (auto-filled " +
      "if omitted) AND the game RUNNING (start_stop_play {\"is_start\": true} first; fails in Edit mode). " +
      "\"actions\" is an ORDERED array of OBJECTS - each step MUST be {\"action\": ...}, NOT a bare string (a missing/misnamed action gives " +
      "'Unknown mouse action: nil'). action is one of: moveTo | mouseButtonDown | mouseButtonUp | mouseButtonClick | scrollUp | scrollDown | wait. " +
      "You MUST establish a position BEFORE any click/scroll: the FIRST step needs \"x\"/\"y\" (screen pixels) OR \"instance_path\" " +
      "(starts with game/LocalPlayer/Workspace; if set, x/y are ignored) - else 'Either x and y, instance_path, or a prior action ... is " +
      "required'. Later steps may omit x/y and reuse the last position (click then scroll at the same spot). " +
      "mouseButtonDown/Up/Click need \"mouse_button\":\"left\" or \"right\". A \"wait\" step needs \"wait_time_ms\" (0-10000). " +
      "Example: {\"datamodel_type\":\"Client\",\"actions\":[{\"action\":\"mouseButtonClick\",\"mouse_button\":\"left\",\"instance_path\":\"LocalPlayer.PlayerGui.Menu.PlayBtn\"}]}.",
    skill:
      "Loads one Roblox Studio-authored or personal skill by its exact skill_name. Use it once before a matching workflow, then follow the returned instructions. " +
      "If a requested personal skill is not available, report that plainly and use the closest RLScript skill or normal commands.",
    use_skill:
      "Loads one local RLScript skill by exact name. Use script-analysis-fix after Roblox code changes and playtest-visual for gameplay/UI testing with visual checkpoints.",
    screen_capture:
      "Captures the current Roblox Studio viewport and returns image data. Use it during Play mode after meaningful input so a vision-capable AI can verify the actual result. Follow the exact optional parameters shown by list_commands.",
    script_analysis:
      "Text-first syntax and conservative warning validation for Luau sources. It returns structured errors and warnings such as unknown globals, while explicitly reporting that Roblox's editor-only lint/type diagnostics are not fully exposed by the current MCP API. " +
      "Use it before and after fixes; do not describe its result as a complete Script Analysis window count.",
    scan_script:
      "Read-only scan over the scripts under a scope. Returns script → line → rule → snippet matches; a rule id is the FIRST string in each match. " +
      "Run it BEFORE fix_script to preview, or pass a \"rules\" subset to scan only what the user asked. It never writes - safe to run anytime.",
    fix_script:
      "Deterministic refactor of ONE script. script_path is REQUIRED (dot-notation). Defaults to all rules; pass \"rules\" to apply a subset. " +
      "By default it ONLY PROPOSES: the refactors appear in the RLScript Refactor panel for the user to review, and are written ONLY after they click Apply (or when the user enabled Auto-approve fixes, or auto_approve:true is passed). " +
      "A proposal write happens inside an undoable ChangeHistoryService transaction - after a successful auto-approved write, the fixed source IS live, do not re-apply with multi_edit. " +
      "A rule whose rewrite would unbalance the script is skipped and listed in the output (Syntax Shield). It is EXACT and pattern-based: it rewrites only known-safe shapes and never guesses.",
    ask_ai:
      "Offloads ONE self-contained question to the model the user configured in the RLScript popup (their own API key - never ask for the key here, and never echo it). " +
      "Include ALL code the other model needs inside the question text. Returns only the other model's answer as plain text. No response means the user has not configured a key/provider yet - tell them to open the RLScript popup and set it up.",
  };

  // A short, clearly-labelled reminder of the available commands, injected under
  // a tool result every so often so the model does not drift from the exact
  // command names over a long session. It is explicitly framed as an automatic
  // RLScript reminder (NOT a user message and NOT a new command to run).
  function toolsReminder(tools) {
    const toolsString =
      "  list_commands() - list all available Roblox Studio commands with full parameter details\n" +
      compactTools(tools);
    return (
      "\n\n────────────────────────────────\n" +
      "(System note from RLScript - this is an automatic REMINDER, not a request and not a new result. " +
      "Do NOT reply to it or run any command because of it; just keep it in mind for your next command.)\n" +
      "Reminder of the Roblox Studio commands (use exact names and parameter keys; " +
      "for other connected apps call list_mcp_servers):\n" +
      toolsString
    );
  }

  // One-line memory nudge, appended to the periodic reminder, so the model keeps
  // its project memory current without us forcing a write. Clearly framed as an
  // optional reminder, NOT a command to run right now.
  function memoryNudge() {
    return (
      "(Reminder: if you've learned anything DURABLE about this project since your last memory update " +
      "(architecture, where things live, conventions, decisions, user preferences), update your shared project memory at " +
      "game.ServerStorage.ZeroScript.Memory with multi_edit - only useful, lasting facts. If nothing changed, ignore this.)"
    );
  }

  return {
    APP_NAME,
    SYS_MARKER,
    FEEDBACK,
    toolCategory,
    buildSystemPrompt,
    compactTools,
    toolsReminder,
    memoryNudge,
    TOOL_NOTES,
    BUILTIN_SKILLS,
    NATIVE_SKILLS,
    VIRTUAL_TOOLS,
    FIX_RULES,
    getSkill,
    getNativeSkill,
    skillPrompt,
  };
})();
