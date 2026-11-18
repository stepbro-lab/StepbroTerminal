import fs from 'node:fs'
import path from 'node:path'
import { claudeDir, encodeClaudeProjectDir } from '@shared/paths'
import type { TranscriptDetails } from '@shared/types'

export function transcriptPath(projectPath: string, sessionId: string): string {
  return path.join(claudeDir(), 'projects', encodeClaudeProjectDir(projectPath), `${sessionId}.jsonl`)
}

const TAIL_BYTES = 16 * 1024

export async function readTranscriptDetails(file: string): Promise<TranscriptDetails> {
  let st: fs.Stats
  try {
    st = await fs.promises.stat(file)
  } catch {
    return {}
  }
  const size = Math.min(st.size, TAIL_BYTES)
  if (size === 0) return {}
  const fh = await fs.promises.open(file, 'r')
  try {
    const buf = Buffer.allocUnsafe(size)
    await fh.read(buf, 0, size, st.size - size)
    return parseCostState(buf.toString('utf8'))
  } finally {
    await fh.close()
  }
}

export function parseCostState(tail: string): TranscriptDetails {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (!l.includes('"cost-state"')) continue
    try {
      const j = JSON.parse(l)
      if (j?.type !== 'cost-state') continue
      const out: TranscriptDetails = {}
      if (typeof j.totalCostUSD === 'number') out.costUsd = j.totalCostUSD
      const usage = j.modelUsage && typeof j.modelUsage === 'object' ? (j.modelUsage as Record<string, any>) : {}
      let bestModel: string | undefined
      let bestOut = -1
      let inTok = 0
      let outTok = 0
      for (const [model, u] of Object.entries(usage)) {
        const o = Number(u?.outputTokens ?? 0)
        const inp = Number(u?.inputTokens ?? 0)
        inTok += Number.isFinite(inp) ? inp : 0
        outTok += Number.isFinite(o) ? o : 0
        if (o > bestOut) {
          bestOut = o
          bestModel = model
        }
      }
      if (bestModel) out.model = bestModel
      if (inTok || outTok) {
        out.inputTokens = inTok
        out.outputTokens = outTok
      }
      return out
    } catch {}
  }
  return {}
}
