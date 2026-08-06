# RLScript - Free AI Agent for Roblox Studio

![GitHub stars](https://img.shields.io/github/stars/RLRasuL/RLScript-Free?style=social)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

**RLScript** (formerly ZeroScript) is a free browser extension that turns DeepSeek, Gemini, Kimi, GLM, Qwen, Arena, Meta AI, MiniMax, Grok, Claude, ChatGPT or Copilot into a Roblox Studio AI agent.
Control Roblox Studio with AI directly from your browser - read/edit scripts, run Luau, generate assets, all from a normal AI chat. No API key, no terminal, no coding needed.

> 🌐 **Website: [zeroscript-five.vercel.app](https://zeroscript-five.vercel.app)** the free Lemonade.gg / Luamotion alternative for building Roblox games with AI.

Supported AI entry points include **DeepSeek** (chat.deepseek.com, recommended), **Google Gemini** (gemini.google.com), **Kimi** (kimi.com, Moonshot AI), **GLM** (chat.z.ai, Z.ai), **Qwen** (chat.qwen.ai), **Arena Agent** (arena.ai/agent), **Meta AI** (meta.ai), **MiniMax** (agent.minimax.io), **Grok** (grok.com), **Claude** (claude.ai), **ChatGPT** (chatgpt.com) and **Copilot** (copilot.microsoft.com). MiniMax, Grok, Claude, ChatGPT and Copilot may require you to be signed in before starting a session.

> 💬 **Stuck? Join the [Discord community](https://discord.gg/9aNyZsMWcb)** get help, share feedback, and follow updates.

> *Also known as: ZeroScript Roblox, ZeroScript free download, Roblox DeepSeek agent, Roblox Gemini agent, Roblox Kimi agent, Roblox GLM agent, Roblox Qwen agent, Roblox Arena agent, Roblox Meta AI agent, Roblox Studio AI automation, Luau AI, MCP Roblox, lemonade alternative free, lemonade.gg alternative, free Roblox AI agent, free lemonade roblox alternative*

## ⚠️ RLScript is Free Beware of Paid Copycats

RLScript is 100% free and open-source. It always has been, and it always will be. There is no official paid version, no subscription, and no sign-in required to use the extension.

If you come across a site or extension using the RLScript or ZeroScript name that asks for payment or account creation, it is **not** this project. The only official links are the ones listed at the top of this README.

## How it works

```
AI chat (DeepSeek / Gemini / Kimi / GLM / Qwen / Arena / Meta AI / MiniMax / Grok / Claude / ChatGPT / Copilot, in your browser) -> RLScript Extension -> Bridge (your PC) -> Roblox Studio
```

The extension runs inside the chat page (DeepSeek, Gemini, Kimi, GLM, Qwen, Arena, Meta AI, MiniMax, Grok, Claude, ChatGPT or Copilot). When you type a request, it sends commands to the Bridge running on your PC, which drives Roblox Studio through the built-in MCP server.

## Download

- [Download the latest release](https://github.com/RLRasuL/RLScript-Free/releases/latest)
- [Download the current source ZIP](https://github.com/RLRasuL/RLScript-Free/archive/refs/heads/main.zip)

Extract the ZIP, then load its `zeroscript-extension` folder as an unpacked browser extension.

## Setup

> 📺 **Lost? Watch the [setup tutorial on YouTube](https://youtu.be/kPKiZLZ9_Ps) it covers every step below.**

### 1. Download the zip and install the extension

Download the latest zip from the **Releases** page and extract it. The zip contains both the **Bridge** and the **extension folder**.

To load the extension:

- Go to `edge://extensions` (Edge) or `chrome://extensions` (Chrome)
- Enable **Developer mode** (top right toggle)
- Click **Load unpacked**
- Select the `zeroscript-extension` folder from the extracted zip

### 2. Start Roblox Studio and enable MCP

Open Studio and load a Place, then enable MCP (first time only):

- Click **Assistant AI** in the top bar
- Click **...** (top right of the Assistant panel)
- Click **Manage MCP Servers**
- Click **Enable Studio as MCP Server**

> Not sure where to find these options? The [video tutorial](https://youtu.be/kPKiZLZ9_Ps) shows exactly where to click.

### 3. Run the Bridge

- **Windows:** double-click `start.bat` inside the extracted folder.
- **macOS:** double-click `MacOS_Start.command` inside the extracted folder. The first time, macOS will show a security warning ("could not verify... free of malware") - this is normal for any script downloaded outside the App Store, click **Done**, then go to **System Settings > Privacy & Security**, scroll to the bottom, and click **Open Anyway**. You only need to do this once.

A small window opens, that means the Bridge is running.

### 4. Start a session

Go to https://chat.deepseek.com (recommended), https://gemini.google.com, https://www.kimi.com, https://chat.z.ai, https://chat.qwen.ai, https://arena.ai/agent, https://agent.minimax.io, https://grok.com, https://claude.ai, https://chatgpt.com or https://copilot.microsoft.com and open a new chat. The RLScript bar appears above the input box. Click **Start session**. Type what you want to build.

> Only works on the supported AI sites listed above - it will not work on any other site.
> Gemini and Kimi can be unstable (model behavior, not the extension): Gemini may stop using the Roblox tools after a while, and Kimi may use its own native tools instead. If the AI starts answering in plain text instead of acting, remind it to use the commands or start a new session.

## Skills and final code checks

RLScript includes small, on-demand bridge skills. The local `use_skill`
command loads built-in workflows such as `script-analysis-fix` and
`playtest-visual`, while the Roblox Studio MCP `skill` command remains available
for Roblox-authored or personal Studio skills. Skills are loaded only when
needed, so they do not add their full instructions to every session.

After Roblox code changes, the built-in `script-analysis-fix` workflow runs the
text-first `script_analysis` command. If no errors or warnings are found, it
makes no edits. If diagnostics are found, it reads the affected scripts, fixes
them with `multi_edit`, and checks again so an incorrect fix is caught. This
works for AIs without vision. The current Roblox MCP does not
expose the Script Analysis panel's full lint/type-warning list as structured
text, so RLScript reports that limitation instead of pretending this check is
the complete panel result. No separate
find-and-replace skill is enabled: `multi_edit` remains safer and more precise
for targeted changes.

The menu's **AI access** section lets you disable all connected AI tools or all
RLScript/Studio skills independently. The choices are saved locally and are
enforced when a command is dispatched, so a disabled capability cannot be used
by an active session.

For gameplay and UI verification, use the `playtest-visual` skill. It starts
Play mode, captures the Roblox Studio viewport with `screen_capture` after each
meaningful action, and checks the console for runtime failures. Qwen now keeps
`screen_capture` available for newly released or temporarily unnamed models;
only an explicitly text-only model is blocked from receiving images.

### 5. Watch the setup tutorial

[Watch the setup tutorial on YouTube](https://youtu.be/kPKiZLZ9_Ps)

## Connect extra MCP servers (GitHub, Blender, ...)

The bridge can run any MCP server next to Roblox Studio. Each extra server's
commands are advertised to the AI - it discovers them by running
`list_mcp_servers` whenever you name an app that is not Roblox Studio
(e.g. "use GitHub to ..."). `config.json` lists the servers the bridge starts.

### GitHub (already configured)

1. Install **Node.js** from https://nodejs.org - required to run the GitHub
   server via npx (the bridge starts it automatically from `config.json`).
2. Create a GitHub Personal Access Token at https://github.com/settings/tokens
   - a classic token with the `repo` scope, or a fine-grained token with
   read/write on the repositories you need.
3. Put the token in your environment so the bridge can read it (it is picked up
   at bridge startup, never stored in config.json - that file is safe to share):
   - **Windows:** open a terminal and run
     `setx GITHUB_PERSONAL_ACCESS_TOKEN "ghp_your_token"` (Windows expands
     `%VAR%` syntax, which is what config.json uses).
   - **macOS/Linux:** add `export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token"`
     to your shell profile (and change the env value in config.json to
     `$GITHUB_PERSONAL_ACCESS_TOKEN`).
4. Restart the bridge (close its window, run start.bat again). You should see
   `[github] MCP server up (N tools advertised)` in the terminal.
5. In your AI chat say something like "use GitHub to list my repos" - the AI
   runs `list_mcp_servers`, sees the GitHub commands, and can create issues,
   read/write repos, and more.

To disable GitHub again, remove the `github` block from `config.json` and
restart the bridge. The `@modelcontextprotocol/server-github` package is
deprecated in favour of GitHub's newer server - if you prefer the maintained
`github-mcp-server` binary, replace `command`/`args` with its path and
`["stdio"]` as the first argument, keeping the same env token.

### Blender (already configured)

1. Install **Node.js** from https://nodejs.org (already needed for GitHub).
2. Install the **BlenderMCP addon** in Blender: https://github.com/ahujasid/blender-mcp
   - the addon is required for the tools to work; without it the server starts
   but Blender commands fail until the addon connects.
3. Restart the bridge (close its window, run start.bat again) with Blender
   open, then in your AI chat say something like "use Blender to ..." - the AI
   runs `list_mcp_servers`, sees the Blender commands, and can control Blender.

To disable Blender again, remove the `blender` block from `config.json` and
restart the bridge.

## What the AI can do

- Read and edit scripts
- Run Luau code directly in Studio
- Inspect the game tree and instances
- Generate meshes, materials, and models
- Browse and insert from the Creator Store
- Control play-testing
- **Trigger Roblox's native Studio Assistant skills** (unit tests, scene/performance
  analysis, docs search, device simulator, custom skill creation) through the same
  `use_skill` command used for RLScript's built-in skills
- **Remember your project across sessions** persistent project memory saved inside your place

## New in 1.6.0

- **Interactive refactor approval:** `fix_script` now proposes instead of
  writing on its own - every refactor appears in the new Refactor section of
  the RLScript panel (per-script, per-rule, with exact line before/after
  previews) and is written only when you click Apply. A whole-game Scan button
  works the same way.
- **After-AI notification:** whenever the AI finishes writing or editing
  scripts, a "Refactors available" toast appears with an Apply Change /
  Dismiss Change button for each suggested refactor - applying only what the
  AI made, one refactor at a time (Apply all / Dismiss all in the header).
- **Auto-approve toggle:** turn it on in the Refactor section and `fix_script`
  applies + writes immediately again (Studio Ctrl+Z still works); per-call
  override with `auto_approve` in the tool arguments.
- **Atomic refactor groups:** structural rewrites (proper_loops, Instance.new
  optimization, RNG modernization, auto-tweener, line organization) are one
  group per script; line-local fixes (deprecated APIs, compound assignments,
  redundant booleans, :IsA checks) are one group per line - selecting a group
  can never leave half-applied, broken code.
- **Undo last:** the Refactor section can restore the exact pre-apply sources
  of your most recent apply batch (in addition to Studio's own Ctrl+Z).

## New in 1.5.2

- **Product Rebrand:** the visible extension and bridge branding is now RLScript;
  legacy internal identifiers and Roblox memory paths remain compatible with
  existing installations.
- **Microsoft Copilot support:** Copilot at `copilot.microsoft.com` is now
  available in the provider list and uses the modern semantic chat adapter.
- **Deterministic script fixer:** `scan_script` reports mechanical issues
  (deprecated APIs, compound assignments, redundant booleans, ClassName checks,
  while-loops, `Instance.new` with parent, `math.random`, Lerp wait-loops, messy
  indentation) and `fix_script` applies them deterministically in Studio with
  full undo (Ctrl+Z). A Syntax Shield skips any rewrite that would unbalance a
  script's blocks and brackets, and every fix is reported as a visible change.
- **AI-to-AI help (`ask_ai`):** hard sub-problems can be sent to a second model
  (OpenAI, Claude, Gemini, DeepSeek, Qwen or Kimi) using your own API key,
  stored only in this browser. Configure it in the extension popup.
- **Per-command AI access:** the RLScript panel now lists every tool and skill
  individually, so you can disable exactly the commands you do not want the AI
  to use. Disabled commands are hidden from the AI and refused if still called.

## New in 1.5.1

- **AI site support:** MiniMax, Grok, Claude, Arena Agent, and
  ChatGPT are supported alongside the existing providers.
- **Roblox coding prompt:** Roblox work is explicitly required to use Luau,
  not generic Lua, with the Roblox Engine reference provided for authoritative
  API details.
- **Skills support + Built-in bridge skills:** `script-analysis-fix` and `playtest-visual` are
  available through the bridge without requiring each user to create matching
  skills in Roblox Studio. The local `use_skill` loader and Roblox Studio's
  separate `skill` command are both supported.
- **Script Analysis Skill:** `script_analysis` compiles Luau and reports
  conservative warnings such as unknown globals. The fix workflow edits only
  when errors or warnings exist, then reads, fixes, and rechecks after edits.
  It clearly labels the result as heuristic because the full Studio Analysis
  panel diagnostics are not exposed as structured MCP data.
- **visual playtesting skill:** `playtest-visual` starts/stops Play mode, uses
  `screen_capture` before and after meaningful input, and checks console output
  instead of claiming success from blind input.
- **Qwen vision handling:** newly released or temporarily unnamed models keep
  `screen_capture` available optimistically; explicitly text-only models remain
  blocked, and the capability-cache keys were refreshed.
- **AI access controls:** Switch AI now has persistent independent toggles for
  connected tools and skills. Disabled capabilities are hidden from the
  advertised catalogue, rejected at dispatch time, and stop an active run.
- **Provider labels:** Claude is marked **BEST**, while DeepSeek, GLM, and Qwen
  are marked **Recommended**.

## New in 1.5.0

- **Backgrounding the AI tab no longer strands a command as "not run":** the response watcher now pauses while the tab is hidden and shifts every deadline forward by the time it was paused, instead of burning its inactivity timeout off-screen. The bar shows a **Paused** state while waiting, and resuming is instant (event-driven, not polled).
- **Gemini: fixed the page freezing on a large tool result** (e.g. a big `http_get`) - outgoing text is now capped and the composer insert yields periodically so the page stays responsive and Stop stays clickable.
- **Gemini: fixed the system prompt occasionally never leaving the composer on Start**, caused by the wedged-stop-button detector refusing its own first recovery attempt.
- **Kimi: fixed the model picker looping open/closed** after Kimi's K3 update removed the model it used to default to. The native-agent guard now also correctly detects **K3 Swarm**.
- **Degraded mode (Roblox Studio closed) starts much faster:** the tool catalogue is now cached briefly instead of being re-fetched (and re-timing-out) three times in a row during boot.

## New in 1.4.9

- **Popup: new Settings button** opens the Switch AI / support panel without needing an already-started conversation, and the footer no longer singles out chat.deepseek.com since seven providers are supported.
- **Bridge: auto-recovers its own port on relaunch** instead of crashing with a cryptic error when a previous Bridge was still holding it - and gives a clear, actionable message with the exact commands to fix it when the port is held by something else.
- **Fixed the agent parsing/executing commands while its AI tab was backgrounded or the window minimized** (observed live on GLM), which could run a tool blind or send duplicate feedback. It now pauses - with no time limit - until the AI tab is foreground again, then resumes exactly where it left off.

## New in 1.4.8

- **macOS support:** a new double-clickable `MacOS_Start.command` launcher runs the Bridge on macOS, no Terminal knowledge required.
- **DeepSeek: fixed a possible stuck send** when a tool result was too long for DeepSeek's input box - it's now trimmed to fit automatically.

## New in 1.4.7

- **Qwen: fixed a rare "done but nothing happened" tool call:** with repeated commands a tool chip could show a green check while the command never actually ran and returned no result. The agent now tracks each Qwen turn by a stable id, so it no longer confuses two similar turns.
- **Image support that follows the model you pick:** on Qwen, screenshots and image input are enabled only on its vision-capable models and turned off on text-only ones, updating when you switch models. On DeepSeek, choosing the Vision tab now enables screenshots and image input for it.
- **DeepSeek: fixed image sending:** a captured screenshot used to be attached twice and never sent. It now uploads once and sends correctly.
- **Qwen: fixed the bar covering the "Expand more models" menu.**

See [CHANGELOG.md](CHANGELOG.md) for older releases.

## Panel status

| Dot | Meaning |
|-----|---------|
| Green | Bridge + Studio ready (a place is open) |
| Yellow | Bridge OK, but Studio isn't usable yet - open Roblox Studio, load a place, or enable its MCP server (hover the dot for the exact reason) |
| Grey | Bridge offline - run start.bat (Windows) or MacOS_Start.command (macOS) |

## Requirements

- Windows or macOS
- Roblox Studio (MCP support built-in)
- Microsoft Edge or Chrome
- Python 3.9+ (installed automatically on Windows, or install it yourself on macOS - see [python.org/downloads](https://www.python.org/downloads/))
- Node.js 16+ - only needed for extra MCP servers that run via npx (e.g. GitHub)

## Support

RLScript is free. If it saves you time: [Ko-fi](https://ko-fi.com/sebattfg) - Robux tip passes available in the extension panel

---

Credit: the idea for connecting other MCP servers (Blender, Sketchfab, etc.) alongside Roblox Studio came from [javnpa](https://github.com/javnpa).

Credit: macOS/Linux support contributed by [archivealf](https://github.com/archivealf).
