import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import logo from '@/assets/logo.png'

/**
 * The app's logo, alive: it floats a little, leans a degree or two as it goes, and a glow in its
 * own colors breathes behind it. Still when the system asks for less motion.
 */
export function LogoMark({ size = 72 }: { size?: number }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.to('[data-logo]', { y: -5, rotation: 2.5, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 })
      gsap.fromTo('[data-glow]', { opacity: 0.45, scale: 0.92 }, { opacity: 0.8, scale: 1.08, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 })
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={root} className="relative" style={{ width: size, height: size }}>
      <div
        data-glow
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: -size * 0.35,
          background: 'radial-gradient(circle, rgba(255, 79, 196, 0.32) 0%, rgba(79, 123, 255, 0.28) 45%, transparent 70%)',
          filter: 'blur(10px)'
        }}
      />
      <img data-logo src={logo} alt="" draggable={false} className="relative block select-none" style={{ width: size, height: size, borderRadius: size * 0.22 }} />
    </div>
  )
}
