import { t } from '@/lib/i18n'
interface Props {
  presetId: string
  size?: number
  className?: string
  style?: React.CSSProperties
  /** Brand colors instead of currentColor (used in settings and pickers). */
  brand?: boolean
}

// OpenAI's blossom mark, as published in their brand assets (24×24).
const OPENAI_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'

/** Real brand marks. Monochrome by default so rows can tint them; `brand` switches to the official colors. */
export function AgentLogo({ presetId, size = 14, className, style, brand = false }: Props) {
  const box = { width: size, height: size, className, style } as const
  switch (presetId) {
    case 'claude': {
      // Claude's starburst: eight tapered rays around a small core.
      const color = brand ? '#d97757' : 'currentColor'
      const rays = Array.from({ length: 8 }, (_, i) => i * 45)
      return (
        <svg {...box} viewBox="0 0 16 16" aria-label="Claude Code">
          {rays.map((deg) => (
            <path key={deg} d="M8 1.2 L9.35 6.9 L8 8 L6.65 6.9 Z" fill={color} transform={`rotate(${deg} 8 8)`} />
          ))}
        </svg>
      )
    }
    case 'codex':
      return (
        <svg {...box} viewBox="0 0 24 24" aria-label="Codex">
          <path d={OPENAI_PATH} fill={brand ? (style?.color ?? '#10a37f') : 'currentColor'} />
        </svg>
      )
    case 'gemini':
      return (
        <svg {...box} viewBox="0 0 24 24" aria-label="Gemini CLI">
          <defs>
            <linearGradient id="step-gemini" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4285f4" />
              <stop offset="0.55" stopColor="#9b72cb" />
              <stop offset="1" stopColor="#d96570" />
            </linearGradient>
          </defs>
          <path
            d="M12 0c.6 6.6 5.4 11.4 12 12-6.6.6-11.4 5.4-12 12-.6-6.6-5.4-11.4-12-12C6.6 11.4 11.4 6.6 12 0z"
            fill={brand ? 'url(#step-gemini)' : 'currentColor'}
          />
        </svg>
      )
    case 'cursor': {
      // Cursor's isometric cube: three faces at different depths.
      const c = brand ? '#111' : 'currentColor'
      return (
        <svg {...box} viewBox="0 0 24 24" aria-label="Cursor Agent">
          <path d="M12 2 21 7v10l-9 5-9-5V7l9-5z" fill={c} opacity="0.22" />
          <path d="M12 2v10l9-5-9-5z" fill={c} opacity="0.55" />
          <path d="M12 12v10l9-5V7l-9 5z" fill={c} opacity="0.9" />
          <path d="M3 7l9 5v10l-9-5V7z" fill={c} opacity="0.4" />
          <path d="M12 2 21 7v10l-9 5-9-5V7l9-5zm0 10 9-5M12 12v10M12 12 3 7" fill="none" stroke={c} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      )
    }
    case 'opencode': {
      // OpenCode: a terminal block with a live cursor.
      const c = brand ? '#f2c94c' : 'currentColor'
      return (
        <svg {...box} viewBox="0 0 16 16" aria-label="OpenCode">
          <rect x="1.5" y="2.5" width="13" height="11" rx="2.5" fill={c} opacity="0.22" />
          <rect x="1.5" y="2.5" width="13" height="11" rx="2.5" fill="none" stroke={c} strokeWidth="1.4" />
          <rect x="4.5" y="6" width="2.2" height="4.5" rx="0.6" fill={c} />
          <rect x="8" y="9.2" width="3.6" height="1.3" rx="0.6" fill={c} />
        </svg>
      )
    }
    case 'deepseek':
    case 'deepcode':
    case 'codewhale': {
      // A whale seen from the side: DeepSeek's animal, and Codewhale's name.
      const c = brand ? (presetId === 'codewhale' ? '#2f9bd6' : '#4d6bfe') : 'currentColor'
      return (
        <svg {...box} viewBox="0 0 16 16" aria-label={presetId === 'deepseek' ? 'DeepSeek' : presetId === 'deepcode' ? 'Deep Code' : 'Codewhale'}>
          <path d="M1.6 8.6c0-3 2.6-5 6.2-5 2.6 0 4.4 1.1 5.4 2.6.6-.9 1.3-1.5 2.1-1.8-.4 1.3-.5 2.5-.2 3.7-.6.4-1.4.6-2.1.5-1 1.6-2.9 2.6-5.2 2.6-1.1 0-2.1-.2-3-.6l-1.1 1.4-.3-1.9c-1.1-.7-1.8-1.6-1.8-2.5z" fill={c} />
          <circle cx="4.6" cy="7.9" r="0.75" fill={brand ? '#ffffff' : 'var(--bg-sidebar, #fff)'} />
        </svg>
      )
    }
    case 'kimi': {
      // Kimi: the Moonshot "K" with a crescent cut.
      const c = brand ? '#111' : 'currentColor'
      return (
        <svg {...box} viewBox="0 0 16 16" aria-label="Kimi Code">
          <path d="M3.2 2.2h2.6v11.6H3.2z" fill={c} />
          <path d="M6.2 8.3 11.4 2.2h3.2L9.2 8.3l5.6 5.5h-3.3z" fill={c} />
        </svg>
      )
    }
    case 'shell':
    default:
      return (
        <svg {...box} viewBox="0 0 16 16" aria-label={t('Shell')}>
          <path d="M3 4.2l4.2 3.8L3 11.8M8.6 12.4H13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
  }
}
