interface Props {
  presetId: string
  size?: number
  className?: string
  style?: React.CSSProperties
}

/** Agent marks drawn with `currentColor`, so the parent decides between brand color and muted grey. */
export function AgentLogo({ presetId, size = 14, className, style }: Props) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', className, style } as const
  switch (presetId) {
    case 'claude':
      // Eight-point asterisk, the mark Claude Code prints in its own UI.
      return (
        <svg {...common} aria-label="Claude Code">
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 1.8v12.4M1.8 8h12.4M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8" />
          </g>
        </svg>
      )
    case 'codex':
      return (
        <svg {...common} aria-label="Codex">
          <path d="M8 1.4l5.7 3.3v6.6L8 14.6l-5.7-3.3V4.7L8 1.4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M8 4.6l2.9 1.7v3.4L8 11.4 5.1 9.7V6.3L8 4.6z" fill="currentColor" opacity="0.9" />
        </svg>
      )
    case 'gemini':
      return (
        <svg {...common} aria-label="Gemini CLI">
          <path d="M8 1c.5 4 3 6.5 7 7-4 .5-6.5 3-7 7-.5-4-3-6.5-7-7 4-.5 6.5-3 7-7z" fill="currentColor" />
        </svg>
      )
    case 'cursor':
      return (
        <svg {...common} aria-label="Cursor Agent">
          <path d="M8 1.4l6 3.4v6.4L8 14.6 2 11.2V4.8L8 1.4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M8 8l6-3.4M8 8v6.6M8 8L2 4.8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )
    case 'opencode':
      return (
        <svg {...common} aria-label="OpenCode">
          <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="8" cy="8" r="2.4" fill="currentColor" />
        </svg>
      )
    case 'kimi':
      return (
        <svg {...common} aria-label="Kimi Code">
          <path d="M4 2.5v11M4.2 8.6L10.6 2.5M4.8 8l6.2 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'shell':
    default:
      return (
        <svg {...common} aria-label="Shell">
          <path d="M3 4.2l4.2 3.8L3 11.8M8.6 12.4H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
  }
}
