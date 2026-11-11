import { useCallback, useRef, type PointerEvent } from 'react'

const prefersStillness = () =>
  typeof window !== 'undefined' && (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  )

/**
 * Subtle pointer-driven 3D tilt for selected cards.
 * Writes CSS custom properties (--tilt-x / --tilt-y / --glare-x / --glare-y)
 * so styling stays in CSS. Disabled for reduced motion and touch pointers.
 */
export function useTilt<T extends HTMLElement>(maxDegrees = 5) {
  const ref = useRef<T | null>(null)
  const frame = useRef(0)

  const onPointerMove = useCallback((event: PointerEvent<T>) => {
    const node = ref.current
    if (!node || prefersStillness()) return
    const rect = node.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      node.style.setProperty('--tilt-x', `${((0.5 - py) * maxDegrees).toFixed(2)}deg`)
      node.style.setProperty('--tilt-y', `${((px - 0.5) * maxDegrees).toFixed(2)}deg`)
      node.style.setProperty('--glare-x', `${(px * 100).toFixed(1)}%`)
      node.style.setProperty('--glare-y', `${(py * 100).toFixed(1)}%`)
    })
  }, [maxDegrees])

  const onPointerLeave = useCallback(() => {
    const node = ref.current
    if (!node) return
    cancelAnimationFrame(frame.current)
    node.style.setProperty('--tilt-x', '0deg')
    node.style.setProperty('--tilt-y', '0deg')
  }, [])

  return { ref, onPointerMove, onPointerLeave }
}
