# Step

A terminal for people who run coding agents all day. Windows, macOS and Linux.

Step is a real terminal first: every session is your shell (PowerShell, bash, zsh) running inside a project folder. Type `claude`, `codex`, `gemini`, `npm run dev` or anything else. On top of that Step adds the things a plain terminal tab is missing:

- **Sessions that survive the window.** Every shell runs in a small host process outside the app. Quit Step, come back later, and the terminal is still there with its output.
- **A sidebar that works as a dashboard.** Folders on the left, sessions under them, and a status mark per session: working, needs you, done.
- **Claude Code awareness.** Start Claude from the folder's `+` menu and Step gets precise state from Claude's own hooks (working, waiting for permission, finished). Type `claude` in a shell and Step still recognizes it through Claude's session registry.
- **Resume conversations.** Restart a Claude session and the same conversation continues.
- **Notifications and tray.** Get told when a session you are not looking at needs input or finishes.
- **Palette and shortcuts.** `Ctrl/Cmd+K` to jump anywhere, `Ctrl/Cmd+T` for a new shell, `Ctrl/Cmd+1..9` to switch, `Ctrl/Cmd+F` to search.

## Development

```bash
pnpm install
pnpm dev          # runs the app with hot reload
pnpm test         # unit tests (vitest)
pnpm typecheck
pnpm build        # compiles main, host, preload and renderer into out/
pnpm dist:win     # packaged installer (also dist:mac, dist:linux)
pnpm icons        # regenerates build/icon.png and the tray icons from resources/icon.svg
```

`node scripts/host-smoke.mjs` talks to a running host over its socket and opens a throwaway shell, useful when working on the host without the UI. In development the renderer exposes a DevTools port (9223); `node scripts/cdp.mjs "<js>"` evaluates code inside the window.

## How it is put together

```
src/host      step-host: owns the PTYs (node-pty), scrollback ring buffers, the local socket
              and the HTTP endpoint Claude Code hooks post to. Runs detached, one per user.
src/main      Electron main: talks to the host, owns the window, tray, notifications,
              preferences, agent detection and the Claude Code history readers.
src/preload   Typed bridge between main and the renderer.
src/renderer  React UI. xterm instances live in a registry outside React; only the visible
              terminal has a WebGL context.
src/shared    Types, the frame codec and path helpers used by all three.
```

Data lives in `~/.step` (host state, session logs, hook settings) and in the platform's app data folder for UI preferences. Step never edits `~/.claude/settings.json`; hooks are passed to Claude per session with `--settings`.

## Requirements

Node 20+, pnpm 10. Agents are optional: Step shows the ones it finds on your PATH.
