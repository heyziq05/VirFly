import { useEffect, useRef } from 'react'

// Runs draw(ctx, width, height) on a HiDPI canvas every animation frame
// (or every `interval` ms). The canvas is sized from its CSS box.
export function useCanvas(draw, { interval = 0 } = {}) {
  const ref = useRef()
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    let raf
    let last = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      if (interval && now - last < interval) return
      last = now
      const c = ref.current
      if (!c) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = c.clientWidth
      const h = c.clientHeight
      if (!w || !h) return
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      const ctx = c.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      drawRef.current(ctx, w, h)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [interval])
  return ref
}

export const COLORS = {
  line: '#22272b',
  line2: '#2d3338',
  text: '#d8dcdf',
  muted: '#8b939b',
  dim: '#5d656d',
  accent: '#4fb39a',
  panel2: '#15181b',
}
