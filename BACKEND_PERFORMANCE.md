# Backend performance

Measurements of the terminal host, its protocol and the main process's disk work, taken on
12 September 2026 when they were optimized. The renderer was not part of this work. The numbers
describe backend components, not the total use of Electron or of the agents running in the
terminals.

## What changed

- **Terminal logs.** Writes are asynchronous and batched by size or time (64 KiB / 25 ms), in order
  per session. Rotation at 8 MiB down to the last 2 MiB is kept, and so are the original bytes. A
  restart orders the deletion between the old output and the new; closing waits for pending work
  before removing files. A disk error is logged and releases the backpressure instead of blocking
  the terminal.
- **Flow control.** The disk and the internal emulator ask for a pause at about 1 MiB of queued
  output and release it below 256 KiB. The connection also counts the bytes pending in a batch and
  respects the socket's own backpressure. The PTY resumes only when every consumer is ready. These
  thresholds bound the output queues; they are not a limit on a session's total memory.
- **Recovery.** Saved sessions read their scrollback back from disk when a snapshot or their lines
  are requested, instead of parsing every log at startup. Simultaneous requests share one recovery.
  A restart invalidates earlier reads and uses a fresh emulator, so no stale text from the previous
  process shows up. Active sessions are never unloaded and the configured scrollback is not reduced.
- **Protocol.** Fragments accumulate without copying everything received on every read. Complete
  messages take a direct path. Each consumer gets a payload with storage of its own.
- **Process stats.** Simultaneous queries share one sample, cached for a second, with no extra
  polling while idle. The process tree is built once per sample instead of once per session. Log
  sizes and `/proc` are read asynchronously with bounded concurrency.
- **Git.** File reads are asynchronous and bounded, with limited concurrency and a timeout on
  queries. Commands that restore files are not given that timeout. Files too large to count lines
  in are skipped before they are read.
- **Host client.** Timers are cancelled when a reply arrives, and pending requests are rejected on
  an explicit disconnect.

## Reproducible measurements

Windows x64, Node v22.12.0. Original code: commit `855907855a9a2cad2c3a170d9a3d30ad21e33ca4`.
Median of five runs after warm-up, with the same load for both versions. The script checks the
amount of data processed. The log tests use a temporary folder, never the user's sessions.

| Synthetic load | Before | After | Time saved |
|---|---:|---:|---:|
| Fragmented replay, 1 session | 17.08 ms | 0.39 ms | 97.7 % |
| Fragmented replay, 5 sessions | 87.80 ms | 1.22 ms | 98.6 % |
| Fragmented replay, 20 sessions | 189.82 ms | 2.69 ms | 98.6 % |
| 10,000 small complete messages | 9.75 ms | 9.76 ms | No meaningful difference |
| Grouping processes: 100 samples, 2,000 processes, 20 roots | 105.41 ms | 18.02 ms | 82.9 % |
| Log burst, 1 session | 1.58 ms | 1.15 ms | 27.6 % |
| Log burst, 5 sessions | 5.94 ms | 1.93 ms | 67.5 % |
| Log burst, 20 sessions | 19.06 ms | 6.50 ms | 65.9 % |

Replay: 256 KiB per session in 1 KiB fragments. Logs: 128 KiB per session in 1 KiB blocks. In
the 20-session log burst, the delay until the event loop's first turn went from 19.12 ms to
0.38 ms. The full log time includes waiting for the writes to finish. `fsync` is not called, so
these numbers say nothing about physical durability on disk. The process test measures the
grouping in JavaScript, not the cost of asking PowerShell or `ps`.

No percentage reduction in the whole app's RAM or CPU was measured. Results vary with the machine,
the disk, the load and the size of real socket reads; they should not be read as "the whole app is
98 % faster". The parser's gain is concentrated in large, heavily fragmented messages.

To repeat them:

```sh
pnpm build
node scripts/backend-bench.mjs 855907855a9a2cad2c3a170d9a3d30ad21e33ca4
node scripts/backend-smoke.mjs
```

`scripts/backend-smoke.mjs` runs the compiled host natively with a temporary `STEP_HOME` and
`CLAUDE_CONFIG_DIR`, a pipe of its own and hidden processes: a command run by the shell, heavy
output with more than 1 MiB unacknowledged, the terminal carrying on, a normal close, the final
output persisted, recovery after a restart, and the test session deleted. It never connects to an
installed host. The `Backend checks` workflow runs it on Windows, macOS and Linux for every pull
request.

## Limits

A normal close flushes the logs, but a forced termination can lose data still in the asynchronous
queue. The time-based flush is set to 25 ms; a slow disk or a busy event loop can delay it. The
tests cover write failures and the release of pauses, not power cuts or every hardware failure.

Starting PowerShell or `ps` to list processes still has a cost, and loading the shell's
environment still happens at startup on macOS and Linux. Both are candidates for a future
measurement.
