# RLScript Free - AI Roblox Studio Agent (DeepSeek, Gemini, Kimi, GLM, Qwen, Arena, Meta AI, MiniMax, Grok, Claude, ChatGPT, Copilot)

Control Roblox Studio with AI, for free. RLScript (formerly RLScript) turns a normal AI chat (DeepSeek, Google Gemini, Kimi, GLM, Qwen, Arena, Meta AI, MiniMax, Grok, Claude, ChatGPT, or Copilot) into an agent that builds and scripts your Roblox game for you: just describe what you want, and it reads/edits scripts, runs Luau, inspects the game tree, and generates assets directly in Roblox Studio. No API key, no terminal, no coding required.

It's a Chrome/Edge browser extension plus a small local bridge that connects the chat to Roblox Studio through the official MCP server. **DeepSeek is the recommended provider.** Gemini, Kimi, GLM, Qwen, Arena Direct, Arena Agent, Meta AI, MiniMax, Grok, Claude, ChatGPT and Copilot also work. MiniMax, Grok, Claude, ChatGPT and Copilot may require you to be signed in. On Arena Direct, keep the mode dropdown on **Direct**.

## Setup

**Load the extension manually (Edge or Chrome):**
1. Go to `edge://extensions` (Edge) or `chrome://extensions` (Chrome)
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `rlscript-extension` folder
5. The extension is now active

**Then set up the Bridge:**
1. **Download the Bridge** from the [GitHub releases page](https://github.com/RLRasuL/RLScript-Free)
2. **Open Roblox Studio** and load a Place
3. **Enable the MCP server in Roblox Studio** (first time only): click **Assistant AI** in the top bar, then **...** > **Manage MCP Servers** > **Enable Studio as MCP Server**
4. **Run the Bridge** - double-click `start.bat` (Windows) or `MacOS_Start.command` (macOS); a small window opens, the Bridge is running. On macOS, the first launch shows a Gatekeeper warning (normal for any downloaded script): click **Done**, then **System Settings > Privacy & Security**, scroll down, and click **Open Anyway**.
5. **Go to https://chat.deepseek.com** (recommended), https://gemini.google.com, https://www.kimi.com, https://chat.z.ai, https://chat.qwen.ai, https://arena.ai/text/direct, https://arena.ai/agent, https://www.meta.ai, https://agent.minimax.io, https://grok.com, https://claude.ai, https://chatgpt.com or https://copilot.microsoft.com, then open a new chat (only works on these supported addresses; on Arena Direct use Direct mode)
6. Click **Start session** in the RLScript panel
7. Type what you want to build

📺 [Watch the setup tutorial](https://youtu.be/kPKiZLZ9_Ps)

## Architecture (for contributors)

The extension is split between a provider-agnostic core and per-AI-site providers:

```
core/config.js        system prompt, feedback strings, tool categories (global RL)
core/parser.js        RLScript command parsing - pure string logic   (global RLParse)
core/main.js          agentic loop, UI, camouflage, session state      (uses RLProvider)
providers/deepseek.js everything DeepSeek-specific: DOM selectors, generation
                      detection, send mechanics, composer modes…       (global RLProvider)
providers/gemini.js   same interface for Google Gemini (Angular DOM, Quill
                      composer, code-block masking)                    (global RLProvider)
providers/kimi.js     same interface for Kimi / Moonshot AI (Vue DOM, Lexical
                      composer, segment-code masking)                  (global RLProvider)
providers/glm.js      same interface for GLM / Z.ai (Svelte DOM, code-block
                      wrapper masking)                                 (global RLProvider)
providers/qwen.js     same interface for Qwen / chat.qwen.ai (Vue DOM, network-tap
                      SSE stream, Monaco disposal guard)               (global RLProvider)
providers/qwen-net.js MAIN-world fetch tap for Qwen SSE stream        (injected by manifest)
providers/arena.js    same interface for Arena / arena.ai (React DOM, multi-model
                      playground, A/B-comparison auto-commit, Direct-mode gate) (global RLProvider)
providers/meta.js     same interface for Meta AI / meta.ai (React DOM, textarea
                      composer, JSON-viewer + code-collapse masking)   (global RLProvider)
providers/modern.js   same interface for MiniMax Agent, Grok, Claude and Copilot
                      (semantic composer/message adapters)            (global RLProvider)
                      plus Arena Agent and ChatGPT adapters
background.js         WebSocket to the local bridge (provider-agnostic)
```

`core/main.js` never touches the host site's DOM directly - it only calls the
`RLProvider` interface. To integrate another AI site: write a new
`providers/<site>.js` exporting the same interface, then add its URL pattern to
`manifest.json` (`content_scripts` + `host_permissions`) and to
`PROVIDER_URLS` in `background.js`. No core change required.

Run `node test-parser.js` to smoke-test the command parser.

## Support

☕ [Ko-fi](https://ko-fi.com/sebattfg) - Robux tip passes available in the extension panel
