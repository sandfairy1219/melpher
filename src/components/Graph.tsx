import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { compile, type EvalFunction } from 'mathjs'
import { prettifyExpr } from '../utils/prettifyExpr'
import PrettyInput from './PrettyInput'

interface FunctionEntry {
  expr: string
  color: string
  visible: boolean
  dx: number
  dy: number
  domainMin: number | null
  domainMax: number | null
  domainMinOpen: boolean
  domainMaxOpen: boolean
  showDerivative: boolean
  showIntegral: boolean
}

interface Extremum {
  x: number
  y: number
  type: 'max' | 'min'
}

function findExtrema(compiled: EvalFunction, xMin: number, xMax: number): Extremum[] {
  const extrema: Extremum[] = []
  const samples = 500
  const dx = (xMax - xMin) / samples
  const h = dx * 0.001

  let prevDeriv: number | null = null

  for (let i = 0; i <= samples; i++) {
    const x = xMin + i * dx
    try {
      const fl = compiled.evaluate({ x: x - h }) as number
      const fr = compiled.evaluate({ x: x + h }) as number
      if (!isFinite(fl) || !isFinite(fr)) { prevDeriv = null; continue }
      const deriv = (fr - fl) / (2 * h)

      if (prevDeriv !== null) {
        // Sign change in derivative → extremum between previous and current sample
        if (prevDeriv > 0 && deriv < 0) {
          const ex = refine(compiled, x - dx, x, h)
          if (ex !== null) extrema.push({ ...ex, type: 'max' })
        } else if (prevDeriv < 0 && deriv > 0) {
          const ex = refine(compiled, x - dx, x, h)
          if (ex !== null) extrema.push({ ...ex, type: 'min' })
        }
      }
      prevDeriv = deriv
    } catch {
      prevDeriv = null
    }
  }

  return extrema
}

function refine(compiled: EvalFunction, a: number, b: number, h: number): { x: number; y: number } | null {
  // Bisection on the derivative to find where f'(x) ≈ 0
  for (let i = 0; i < 50; i++) {
    const mid = (a + b) / 2
    try {
      const fl = compiled.evaluate({ x: mid - h }) as number
      const fr = compiled.evaluate({ x: mid + h }) as number
      if (!isFinite(fl) || !isFinite(fr)) return null
      const dm = (fr - fl) / (2 * h)

      const fla = compiled.evaluate({ x: a - h }) as number
      const fra = compiled.evaluate({ x: a + h }) as number
      if (!isFinite(fla) || !isFinite(fra)) return null
      const da = (fra - fla) / (2 * h)

      if (da * dm < 0) b = mid
      else a = mid
    } catch {
      return null
    }
  }
  const x = (a + b) / 2
  try {
    const y = compiled.evaluate({ x }) as number
    if (!isFinite(y)) return null
    return { x, y }
  } catch {
    return null
  }
}

function findRoots(compiled: EvalFunction, xMin: number, xMax: number): number[] {
  const roots: number[] = []
  const samples = 500
  const dx = (xMax - xMin) / samples

  let prevY: number | null = null

  for (let i = 0; i <= samples; i++) {
    const x = xMin + i * dx
    try {
      const y = compiled.evaluate({ x }) as number
      if (!isFinite(y) || isNaN(y)) { prevY = null; continue }

      if (prevY !== null && prevY * y < 0) {
        // Sign change → root between previous and current sample
        let a = x - dx, b = x
        for (let j = 0; j < 50; j++) {
          const mid = (a + b) / 2
          const fm = compiled.evaluate({ x: mid }) as number
          if (!isFinite(fm)) break
          const fa = compiled.evaluate({ x: a }) as number
          if (!isFinite(fa)) break
          if (fa * fm < 0) b = mid
          else a = mid
        }
        const root = (a + b) / 2
        const isDuplicate = roots.some((r) => Math.abs(r - root) < 1e-8)
        if (!isDuplicate) roots.push(root)
      }

      // Check if exactly zero
      if (Math.abs(y) < 1e-12) {
        const isDuplicate = roots.some((r) => Math.abs(r - x) < 1e-8)
        if (!isDuplicate) roots.push(x)
      }

      prevY = y
    } catch {
      prevY = null
    }
  }

  return roots
}

function canIntegrate(expr: string): boolean {
  try {
    const compiled = compile(expr)
    // x=0 근처와 여러 샘플 포인트에서 유한한 값이 나오는지 검사
    const testPoints = [0, 0.001, -0.001, 0.5, -0.5, 1, -1, 2, -2, 5, -5]
    let validCount = 0
    let infCount = 0
    for (const x of testPoints) {
      try {
        const y = compiled.evaluate({ x }) as number
        if (!isFinite(y) || isNaN(y)) infCount++
        else validCount++
      } catch {
        infCount++
      }
    }
    // 유효한 점이 너무 적거나 x=0에서 발산하면 적분 불가
    if (validCount < 3) return false
    // x=0 근처(-0.001 ~ 0.001)에서 발산하면 적분 기준점이 없으므로 불가
    for (const x of [0, 0.001, -0.001]) {
      try {
        const y = compiled.evaluate({ x }) as number
        if (!isFinite(y) || isNaN(y)) return false
      } catch {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

const COLORS = ['#6c63ff', '#ff6584', '#4caf50', '#ffa726', '#26c6da', '#ab47bc']
const TANGENT_COLOR = '#ffeb3b'
const DERIVATIVE_COLORS = ['#e040fb', '#00e5ff', '#ff6e40', '#76ff03', '#f50057', '#d500f9']
const INTEGRAL_COLORS = ['#18ffff', '#b2ff59', '#ff9100', '#ea80fc', '#64ffda', '#ffd740']

const mathButtons = [
  { label: '+', value: ' + ' },
  { label: '−', value: ' - ' },
  { label: '×', value: ' * ' },
  { label: '÷', value: ' / ' },
  { label: '𝑥', value: 'x' },
  { label: '𝑥²', value: 'x^2' },
  { label: '𝑥³', value: 'x^3' },
  { label: '𝑥ⁿ', value: '^' },
  { label: '√', value: 'sqrt(' },
  { label: 'sin', value: 'sin(' },
  { label: 'cos', value: 'cos(' },
  { label: 'tan', value: 'tan(' },
  { label: 'asin', value: 'asin(' },
  { label: 'acos', value: 'acos(' },
  { label: 'log', value: 'log(' },
  { label: 'ln', value: 'log(' },
  { label: 'abs', value: 'abs(' },
  { label: 'π', value: 'pi' },
  { label: 'e', value: 'e' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
]

export default function Graph() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [functions, setFunctions] = useState<FunctionEntry[]>([])
  const [input, setInput] = useState('')
  const [view, setView] = useState({ cx: 0, cy: 0, scale: 50 }) // scale = pixels per unit
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [magnetMode, setMagnetMode] = useState(false)
  const [tangentMode, setTangentMode] = useState(false)
  const tangentInfoRef = useRef<{ fnIndex: number; wx: number; wy: number; slope: number; color: string } | null>(null)
  const [pinnedTangents, setPinnedTangents] = useState<{ wx: number; wy: number; slope: number; color: string }[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingExpr, setEditingExpr] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const clipboardRef = useRef<FunctionEntry | null>(null)
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; startX: number; startY: number }>({
    timer: null, startX: 0, startY: 0,
  })
  const dragRef = useRef<{
    dragging: boolean
    lastX: number
    lastY: number
    mode: 'pan' | 'graph'
    graphIndex: number
  }>({ dragging: false, lastX: 0, lastY: 0, mode: 'pan', graphIndex: -1 })

  const getCanvasSize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return { w: 800, h: 500 }
    return { w: canvas.width, h: canvas.height }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h } = getCanvasSize()
    const { cx, cy, scale } = view

    // Clear
    ctx.fillStyle = '#0f1629'
    ctx.fillRect(0, 0, w, h)

    // World to screen
    const toScreenX = (x: number) => w / 2 + (x - cx) * scale
    const toScreenY = (y: number) => h / 2 - (y - cy) * scale
    const toWorldX = (sx: number) => (sx - w / 2) / scale + cx
    const toWorldY = (sy: number) => -(sy - h / 2) / scale + cy

    // Calculate grid spacing
    const rawStep = 80 / scale // ~80px between grid lines
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const normalized = rawStep / magnitude
    let step: number
    if (normalized <= 2) step = 2 * magnitude
    else if (normalized <= 5) step = 5 * magnitude
    else step = 10 * magnitude

    // Grid lines
    const xMin = toWorldX(0)
    const xMax = toWorldX(w)
    const yMin = toWorldY(h)
    const yMax = toWorldY(0)

    ctx.strokeStyle = '#1a2744'
    ctx.lineWidth = 1

    // Vertical grid lines
    const gridXStart = Math.floor(xMin / step) * step
    for (let x = gridXStart; x <= xMax; x += step) {
      const sx = toScreenX(x)
      ctx.beginPath()
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, h)
      ctx.stroke()
    }

    // Horizontal grid lines
    const gridYStart = Math.floor(yMin / step) * step
    for (let y = gridYStart; y <= yMax; y += step) {
      const sy = toScreenY(y)
      ctx.beginPath()
      ctx.moveTo(0, sy)
      ctx.lineTo(w, sy)
      ctx.stroke()
    }

    // Axes
    const originX = toScreenX(0)
    const originY = toScreenY(0)

    ctx.strokeStyle = '#4a5568'
    ctx.lineWidth = 2

    // X axis
    if (originY >= 0 && originY <= h) {
      ctx.beginPath()
      ctx.moveTo(0, originY)
      ctx.lineTo(w, originY)
      ctx.stroke()
    }

    // Y axis
    if (originX >= 0 && originX <= w) {
      ctx.beginPath()
      ctx.moveTo(originX, 0)
      ctx.lineTo(originX, h)
      ctx.stroke()
    }

    // Axis labels
    ctx.fillStyle = '#8892a4'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    for (let x = gridXStart; x <= xMax; x += step) {
      if (Math.abs(x) < step * 0.01) continue
      const sx = toScreenX(x)
      const label = formatNumber(x)
      const ly = originY >= 0 && originY <= h ? Math.min(originY + 4, h - 14) : h - 14
      ctx.fillText(label, sx, ly)
    }

    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let y = gridYStart; y <= yMax; y += step) {
      if (Math.abs(y) < step * 0.01) continue
      const sy = toScreenY(y)
      const label = formatNumber(y)
      const lx = originX >= 0 && originX <= w ? Math.max(originX - 4, 30) : 30
      ctx.fillText(label, lx, sy)
    }

    // Domain check helper
    const inDomain = (x: number, fn: FunctionEntry): boolean => {
      if (fn.domainMin !== null) {
        if (fn.domainMinOpen ? x <= fn.domainMin : x < fn.domainMin) return false
      }
      if (fn.domainMax !== null) {
        if (fn.domainMaxOpen ? x >= fn.domainMax : x > fn.domainMax) return false
      }
      return true
    }

    // Draw functions + extrema
    for (let fi = 0; fi < functions.length; fi++) {
      const fn = functions[fi]
      if (!fn.visible) continue
      const isSelected = fi === selectedIndex
      try {
        const compiled = compile(fn.expr)

        // --- Draw function with domain clipping ---
        // Selection glow
        if (isSelected) {
          ctx.strokeStyle = fn.color + '40'
          ctx.lineWidth = 8
          ctx.beginPath()
          let started = false
          for (let px = 0; px <= w; px += 2) {
            const x = toWorldX(px) - fn.dx
            const inSeg = inDomain(x, fn)
            if (!inSeg) { started = false; continue }
            try {
              const y = (compiled.evaluate({ x }) as number) + fn.dy
              if (!isFinite(y) || isNaN(y)) { started = false; continue }
              const sy = toScreenY(y)
              if (sy < -h * 2 || sy > h * 3) { started = false; continue }
              if (!started) { ctx.moveTo(px, sy); started = true }
              else ctx.lineTo(px, sy)
            } catch { started = false }
          }
          ctx.stroke()
        }

        ctx.strokeStyle = fn.color
        ctx.lineWidth = isSelected ? 3.5 : 2.5
        ctx.beginPath()
        let started = false
        const pixelStep = 2
        for (let px = 0; px <= w; px += pixelStep) {
          const x = toWorldX(px) - fn.dx
          const inSeg = inDomain(x, fn)
          if (!inSeg) { started = false; continue }
          try {
            const y = (compiled.evaluate({ x }) as number) + fn.dy
            if (!isFinite(y) || isNaN(y)) {
              started = false; continue
            }
            const sy = toScreenY(y)
            if (sy < -h * 2 || sy > h * 3) {
              started = false; continue
            }
            if (!started) {
              ctx.moveTo(px, sy)
              started = true
            } else {
              ctx.lineTo(px, sy)
            }
          } catch { started = false }
        }
        ctx.stroke()

        // --- Draw endpoint circles at domain boundaries ---
        const endpoints: { val: number; open: boolean }[] = []
        if (fn.domainMin !== null) endpoints.push({ val: fn.domainMin, open: fn.domainMinOpen })
        if (fn.domainMax !== null) endpoints.push({ val: fn.domainMax, open: fn.domainMaxOpen })

        for (const ep of endpoints) {
          try {
            const ey = compiled.evaluate({ x: ep.val }) as number
            if (!isFinite(ey) || isNaN(ey)) continue
            const sx = toScreenX(ep.val + fn.dx)
            const sy = toScreenY(ey + fn.dy)
            if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue

            ctx.beginPath()
            ctx.arc(sx, sy, 5, 0, Math.PI * 2)
            if (ep.open) {
              // Hollow circle (open interval)
              ctx.fillStyle = '#0f1629'
              ctx.fill()
              ctx.strokeStyle = fn.color
              ctx.lineWidth = 2
              ctx.stroke()
            } else {
              // Filled circle (closed interval)
              ctx.fillStyle = fn.color
              ctx.fill()
              ctx.strokeStyle = '#ffffff'
              ctx.lineWidth = 1.5
              ctx.stroke()
            }
          } catch { /* skip */ }
        }

        // Find and draw extrema (with offset applied, within domain)
        const extremaXMin = fn.domainMin !== null ? fn.domainMin : xMin - fn.dx
        const extremaXMax = fn.domainMax !== null ? fn.domainMax : xMax - fn.dx
        const extrema = findExtrema(compiled, extremaXMin, extremaXMax)
        for (const ext of extrema) {
          if (!inDomain(ext.x, fn)) continue
          const sx = toScreenX(ext.x + fn.dx)
          const sy = toScreenY(ext.y + fn.dy)
          if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue

          // Dot
          ctx.beginPath()
          ctx.arc(sx, sy, 5, 0, Math.PI * 2)
          ctx.fillStyle = fn.color
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // Label
          const label = `${ext.type === 'max' ? '극대' : '극소'} (${formatNumber(ext.x + fn.dx)}, ${formatNumber(ext.y + fn.dy)})`
          ctx.font = 'bold 11px sans-serif'
          const textWidth = ctx.measureText(label).width
          const padding = 4
          const lx = Math.min(Math.max(sx + 8, padding), w - textWidth - padding)
          const ly = ext.type === 'max' ? sy - 18 : sy + 10

          ctx.fillStyle = 'rgba(15, 22, 41, 0.85)'
          ctx.fillRect(lx - 3, ly - 1, textWidth + 6, 15)
          ctx.fillStyle = fn.color
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(label, lx, ly)
        }
        // Find and draw roots (with offset applied, within domain)
        const rootsXMin = fn.domainMin !== null ? fn.domainMin : xMin - fn.dx
        const rootsXMax = fn.domainMax !== null ? fn.domainMax : xMax - fn.dx
        const roots = findRoots(compiled, rootsXMin, rootsXMax)
        for (const rx of roots) {
          if (!inDomain(rx, fn)) continue
          const sx = toScreenX(rx + fn.dx)
          const sy = toScreenY(0 + fn.dy)
          if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue

          // Dot
          ctx.beginPath()
          ctx.arc(sx, sy, 5, 0, Math.PI * 2)
          ctx.fillStyle = fn.color
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // Label
          const rootLabel = `근 (${formatNumber(rx + fn.dx)}, ${formatNumber(fn.dy)})`
          ctx.font = 'bold 11px sans-serif'
          const rootTextWidth = ctx.measureText(rootLabel).width
          const rootPadding = 4
          const rlx = Math.min(Math.max(sx + 8, rootPadding), w - rootTextWidth - rootPadding)
          const rly = sy + 10

          ctx.fillStyle = 'rgba(15, 22, 41, 0.85)'
          ctx.fillRect(rlx - 3, rly - 1, rootTextWidth + 6, 15)
          ctx.fillStyle = fn.color
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(rootLabel, rlx, rly)
        }
        // --- Draw derivative curve ---
        if (fn.showDerivative) {
          const derivColor = DERIVATIVE_COLORS[fi % DERIVATIVE_COLORS.length]
          ctx.save()
          ctx.setLineDash([6, 4])
          ctx.strokeStyle = derivColor
          ctx.lineWidth = 2
          ctx.beginPath()
          let dStarted = false
          const dh = 1e-6
          for (let px = 0; px <= w; px += 2) {
            const dx = toWorldX(px) - fn.dx
            const dInSeg = inDomain(dx, fn)
            if (!dInSeg) { dStarted = false; continue }
            try {
              const fLeft = compiled.evaluate({ x: dx - dh }) as number
              const fRight = compiled.evaluate({ x: dx + dh }) as number
              if (!isFinite(fLeft) || !isFinite(fRight)) { dStarted = false; continue }
              const dy = (fRight - fLeft) / (2 * dh)
              const sy = toScreenY(dy + fn.dy)
              if (sy < -h * 2 || sy > h * 3) { dStarted = false; continue }
              if (!dStarted) { ctx.moveTo(px, sy); dStarted = true }
              else ctx.lineTo(px, sy)
            } catch { dStarted = false }
          }
          ctx.stroke()
          ctx.setLineDash([])
          ctx.restore()

          // f'(x) label
          const labelText = `f'(𝑥) = ${prettifyExpr(fn.expr)}'`
          ctx.font = 'bold 11px sans-serif'
          const labelW = ctx.measureText(labelText).width
          ctx.fillStyle = 'rgba(15, 22, 41, 0.85)'
          ctx.fillRect(w - labelW - 18, 8 + fi * 40, labelW + 12, 17)
          ctx.fillStyle = derivColor
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(labelText, w - labelW - 12, 10 + fi * 40)
        }

        // --- Draw integral curve (numerical, from x=0) ---
        if (fn.showIntegral) {
          const integColor = INTEGRAL_COLORS[fi % INTEGRAL_COLORS.length]
          ctx.save()
          ctx.setLineDash([10, 4])
          ctx.strokeStyle = integColor
          ctx.lineWidth = 2
          ctx.beginPath()

          // 화면 왼쪽 ~ 오른쪽을 pixel 단위로 순회하면서 사다리꼴 적분
          const step = 2 // pixel step
          const totalPx = Math.ceil(w / step)
          // 먼저 x=0 위치(pixel)를 기준으로 좌/우로 적분
          const originPx = Math.round((0 - cx) * scale + w / 2)

          // 모든 pixel에 대한 적분값 배열
          const integralVals: (number | null)[] = new Array(totalPx + 1).fill(null)

          // x=0 -> 적분값 0
          const zeroPxIdx = Math.round(originPx / step)
          if (zeroPxIdx >= 0 && zeroPxIdx <= totalPx) {
            integralVals[zeroPxIdx] = 0
          }

          // 오른쪽으로 적분
          let acc = 0
          const startRight = Math.max(0, zeroPxIdx)
          for (let idx = startRight; idx <= totalPx; idx++) {
            const px = idx * step
            const xVal = toWorldX(px) - fn.dx
            if (!inDomain(xVal, fn)) { integralVals[idx] = null; continue }
            try {
              const fVal = compiled.evaluate({ x: xVal }) as number
              if (!isFinite(fVal) || isNaN(fVal)) { integralVals[idx] = null; continue }
              if (idx === startRight) {
                if (zeroPxIdx >= 0 && zeroPxIdx <= totalPx) acc = 0
                else {
                  acc = 0 // 화면 밖 시작이면 0부터
                }
              }
              if (idx > startRight && integralVals[idx - 1] !== null) {
                const prevX = toWorldX((idx - 1) * step) - fn.dx
                try {
                  const prevF = compiled.evaluate({ x: prevX }) as number
                  if (isFinite(prevF)) {
                    const dx2 = xVal - prevX
                    acc += (prevF + fVal) / 2 * dx2 // trapezoidal
                  }
                } catch { /* skip */ }
              }
              integralVals[idx] = acc
            } catch { integralVals[idx] = null }
          }

          // 왼쪽으로 적분
          acc = 0
          const startLeft = Math.min(totalPx, zeroPxIdx)
          for (let idx = startLeft; idx >= 0; idx--) {
            const px = idx * step
            const xVal = toWorldX(px) - fn.dx
            if (!inDomain(xVal, fn)) { integralVals[idx] = null; continue }
            try {
              const fVal = compiled.evaluate({ x: xVal }) as number
              if (!isFinite(fVal) || isNaN(fVal)) { integralVals[idx] = null; continue }
              if (idx === startLeft) {
                if (zeroPxIdx >= 0 && zeroPxIdx <= totalPx) acc = 0
                else acc = 0
              }
              if (idx < startLeft && integralVals[idx + 1] !== null) {
                const nextX = toWorldX((idx + 1) * step) - fn.dx
                try {
                  const nextF = compiled.evaluate({ x: nextX }) as number
                  if (isFinite(nextF)) {
                    const dx2 = xVal - nextX // negative
                    acc += (nextF + fVal) / 2 * dx2
                  }
                } catch { /* skip */ }
              }
              integralVals[idx] = acc
            } catch { integralVals[idx] = null }
          }

          // 그리기
          let iStarted = false
          for (let idx = 0; idx <= totalPx; idx++) {
            const val = integralVals[idx]
            if (val === null) { iStarted = false; continue }
            const sy = toScreenY(val + fn.dy)
            if (sy < -h * 2 || sy > h * 3) { iStarted = false; continue }
            const px = idx * step
            if (!iStarted) { ctx.moveTo(px, sy); iStarted = true }
            else ctx.lineTo(px, sy)
          }
          ctx.stroke()
          ctx.setLineDash([])
          ctx.restore()

          // F(x) label
          const intLabel = `F(𝑥)`
          ctx.font = 'bold 11px sans-serif'
          const intLabelW = ctx.measureText(intLabel).width
          ctx.fillStyle = 'rgba(15, 22, 41, 0.85)'
          ctx.fillRect(w - intLabelW - 18, 28 + fi * 40, intLabelW + 12, 17)
          ctx.fillStyle = integColor
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(intLabel, w - intLabelW - 12, 30 + fi * 40)
        }

      } catch {
        // Invalid expression, skip
      }
    }

    // --- Tangent drawing helper ---
    const drawTangent = (
      wx: number, wy: number, slope: number, color: string,
      dashed: boolean, showCoord: boolean,
    ) => {
      const intercept = wy - slope * wx
      const tY0 = slope * xMin + intercept
      const tY1 = slope * xMax + intercept

      ctx.save()
      if (dashed) ctx.setLineDash([8, 6])
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.globalAlpha = dashed ? 0.8 : 0.9
      ctx.beginPath()
      ctx.moveTo(toScreenX(xMin), toScreenY(tY0))
      ctx.lineTo(toScreenX(xMax), toScreenY(tY1))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1.0
      ctx.restore()

      const tpx = toScreenX(wx)
      const tpy = toScreenY(wy)
      ctx.beginPath()
      ctx.arc(tpx, tpy, 5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Equation label
      const m = formatNumber(slope)
      const b = intercept
      let eqText: string
      if (Math.abs(slope) < 1e-10) {
        eqText = `y = ${formatNumber(b)}`
      } else if (Math.abs(b) < 1e-10) {
        eqText = `y = ${m}𝑥`
      } else {
        eqText = b > 0 ? `y = ${m}𝑥 + ${formatNumber(b)}` : `y = ${m}𝑥 − ${formatNumber(Math.abs(b))}`
      }

      ctx.font = 'bold 12px "JetBrains Mono", monospace'
      const eqWidth = ctx.measureText(eqText).width
      const boxPad = 6
      let lx = tpx + 12
      let ly = tpy - 24
      if (lx + eqWidth + boxPad * 2 > w) lx = tpx - eqWidth - boxPad * 2 - 12
      if (ly < 10) ly = tpy + 14

      ctx.fillStyle = 'rgba(15, 22, 41, 0.9)'
      ctx.beginPath()
      const boxR = 5
      const boxX = lx - boxPad
      const boxY = ly - boxPad
      const boxW = eqWidth + boxPad * 2
      const boxH = 16 + boxPad * 2
      ctx.moveTo(boxX + boxR, boxY)
      ctx.lineTo(boxX + boxW - boxR, boxY)
      ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + boxR)
      ctx.lineTo(boxX + boxW, boxY + boxH - boxR)
      ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - boxR, boxY + boxH)
      ctx.lineTo(boxX + boxR, boxY + boxH)
      ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - boxR)
      ctx.lineTo(boxX, boxY + boxR)
      ctx.quadraticCurveTo(boxX, boxY, boxX + boxR, boxY)
      ctx.fill()
      ctx.strokeStyle = color + '60'
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.fillStyle = color
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(eqText, lx, ly)

      if (showCoord) {
        const coordText = `(${formatNumber(wx)}, ${formatNumber(wy)})`
        ctx.font = '11px sans-serif'
        const coordWidth = ctx.measureText(coordText).width
        let clx = tpx + 12
        let cly = ly + boxH + 2
        if (clx + coordWidth > w) clx = tpx - coordWidth - 12
        if (cly + 14 > h) cly = ly - 16

        ctx.fillStyle = 'rgba(15, 22, 41, 0.85)'
        ctx.fillRect(clx - 3, cly - 1, coordWidth + 6, 15)
        ctx.fillStyle = '#8892a4'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(coordText, clx, cly)
      }
    }

    // Draw pinned tangent lines (solid)
    for (const pt of pinnedTangents) {
      drawTangent(pt.wx, pt.wy, pt.slope, pt.color, false, false)
    }

    // Draw hover tangent preview (dashed)
    const tInfo = tangentInfoRef.current
    if (tInfo) {
      drawTangent(tInfo.wx, tInfo.wy, tInfo.slope, tInfo.color, true, true)
    }

    // Origin label
    if (originX >= 0 && originX <= w && originY >= 0 && originY <= h) {
      ctx.fillStyle = '#8892a4'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillText('0', originX - 4, originY + 4)
    }
  }, [view, functions, getCanvasSize, selectedIndex, pinnedTangents])

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = 500
      draw()
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [draw])

  useEffect(() => {
    draw()
  }, [draw])

  // Hit-test: find which function curve is closest to a screen point
  const hitTestCurve = (screenX: number, screenY: number): number => {
    const canvas = canvasRef.current
    if (!canvas) return -1
    const { w } = getCanvasSize()
    const { cx, cy, scale } = view
    const toWorldX = (sx: number) => (sx - w / 2) / scale + cx
    const threshold = 8 // pixels

    let bestIndex = -1
    let bestDist = threshold

    for (let fi = 0; fi < functions.length; fi++) {
      const fn = functions[fi]
      if (!fn.visible) continue
      try {
        const compiled = compile(fn.expr)
        const wx = toWorldX(screenX) - fn.dx
        const wy = (compiled.evaluate({ x: wx }) as number) + fn.dy
        if (!isFinite(wy)) continue
        const sy = canvas.height / 2 - (wy - cy) * scale
        const dist = Math.abs(sy - screenY)
        if (dist < bestDist) {
          bestDist = dist
          bestIndex = fi
        }
      } catch { /* skip */ }
    }
    return bestIndex
  }

  // Mouse interactions
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.85 : 1.18
    setView((v) => ({ ...v, scale: Math.max(1, Math.min(10000, v.scale * factor)) }))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width)
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height)

    // 접선 모드에서 클릭하면 현재 프리뷰를 고정
    if (tangentMode && tangentInfoRef.current) {
      const { wx, wy, slope, color } = tangentInfoRef.current
      setPinnedTangents((prev) => [...prev, { wx, wy, slope, color }])
      return
    }

    const hitIndex = hitTestCurve(sx, sy)

    if (hitIndex >= 0) {
      setSelectedIndex(hitIndex)
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY, mode: 'graph', graphIndex: hitIndex }
    } else {
      setSelectedIndex(null)
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY, mode: 'pan', graphIndex: -1 }
    }
  }

  const computeTangent = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { w, h } = getCanvasSize()
    const { cx, cy, scale } = view
    const toWorldX = (sx: number) => (sx - w / 2) / scale + cx
    const threshold = 20

    let bestIndex = -1
    let bestDist = threshold

    for (let fi = 0; fi < functions.length; fi++) {
      const fn = functions[fi]
      if (!fn.visible) continue
      try {
        const compiled = compile(fn.expr)
        const wx = toWorldX(screenX) - fn.dx
        const wy = (compiled.evaluate({ x: wx }) as number) + fn.dy
        if (!isFinite(wy)) continue
        const sy = h / 2 - (wy - cy) * scale
        const dist = Math.abs(sy - screenY)
        if (dist < bestDist) {
          bestDist = dist
          bestIndex = fi
        }
      } catch { /* skip */ }
    }

    if (bestIndex < 0) {
      tangentInfoRef.current = null
      draw()
      return
    }

    const fn = functions[bestIndex]
    try {
      const compiled = compile(fn.expr)
      let wx = toWorldX(screenX) - fn.dx

      // 마그넷 ON이면 가장 가까운 극값/근으로 스냅
      if (magnetMode) {
        const searchMin = toWorldX(0) - fn.dx
        const searchMax = toWorldX(w) - fn.dx
        const snapPoints: { x: number; dist: number }[] = []

        // 극값
        const extrema = findExtrema(compiled, searchMin, searchMax)
        for (const ext of extrema) {
          snapPoints.push({ x: ext.x, dist: Math.abs(ext.x - wx) })
        }

        // 근
        const roots = findRoots(compiled, searchMin, searchMax)
        for (const rx of roots) {
          snapPoints.push({ x: rx, dist: Math.abs(rx - wx) })
        }

        if (snapPoints.length > 0) {
          const snapThreshold = 1.5 / scale * 50 // 화면 기준 약 1.5 단위
          snapPoints.sort((a, b) => a.dist - b.dist)
          if (snapPoints[0].dist < snapThreshold) {
            wx = snapPoints[0].x
          }
        }
      }

      const hh = 1e-6
      const fl = compiled.evaluate({ x: wx - hh }) as number
      const fr = compiled.evaluate({ x: wx + hh }) as number
      const fy = compiled.evaluate({ x: wx }) as number
      if (!isFinite(fl) || !isFinite(fr) || !isFinite(fy)) {
        tangentInfoRef.current = null
        draw()
        return
      }
      const slope = (fr - fl) / (2 * hh)
      tangentInfoRef.current = {
        fnIndex: bestIndex,
        wx: wx + fn.dx,
        wy: fy + fn.dy,
        slope,
        color: TANGENT_COLOR,
      }
      draw()
    } catch {
      tangentInfoRef.current = null
      draw()
    }
  }, [functions, view, getCanvasSize, draw, magnetMode])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.dragging) {
      if (tangentMode) {
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const sx = (e.clientX - rect.left) * (canvas.width / rect.width)
          const sy = (e.clientY - rect.top) * (canvas.height / rect.height)
          computeTangent(sx, sy)
        }
      }
      return
    }
    const mx = e.clientX - dragRef.current.lastX
    const my = e.clientY - dragRef.current.lastY
    dragRef.current.lastX = e.clientX
    dragRef.current.lastY = e.clientY

    if (dragRef.current.mode === 'graph') {
      const gi = dragRef.current.graphIndex
      setFunctions((prev) =>
        prev.map((fn, i) =>
          i === gi ? { ...fn, dx: fn.dx + mx / view.scale, dy: fn.dy - my / view.scale } : fn
        )
      )
    } else {
      setView((v) => ({
        ...v,
        cx: v.cx - mx / v.scale,
        cy: v.cy + my / v.scale,
      }))
    }
  }

  const applyMagnetSnap = () => {
    if (!magnetMode) return
    if (dragRef.current.mode !== 'graph') return
    const gi = dragRef.current.graphIndex
    const fn = functions[gi]
    if (!fn) return

    try {
      const compiled = compile(fn.expr)
      const { w } = getCanvasSize()
      const { cx, scale } = view
      const visXMin = (0 - w / 2) / scale + cx
      const visXMax = (w - w / 2) / scale + cx

      let bestDx = fn.dx, bestDy = fn.dy, bestDist = Infinity

      // 극값 스냅
      const extrema = findExtrema(compiled, visXMin - fn.dx, visXMax - fn.dx)
      for (const ext of extrema) {
        const candidateDx = Math.round(ext.x + fn.dx) - ext.x
        const candidateDy = Math.round(ext.y + fn.dy) - ext.y
        const dist = (candidateDx - fn.dx) ** 2 + (candidateDy - fn.dy) ** 2
        if (dist < bestDist) {
          bestDist = dist
          bestDx = candidateDx
          bestDy = candidateDy
        }
      }

      // 근 스냅
      const approxRoots: number[] = []
      const samples = 500
      const sampleStep = (visXMax - visXMin) / samples
      let prevVal: number | null = null
      for (let i = 0; i <= samples; i++) {
        const x = visXMin + i * sampleStep
        try {
          const val = (compiled.evaluate({ x: x - fn.dx }) as number) + fn.dy
          if (!isFinite(val) || isNaN(val)) { prevVal = null; continue }
          if (prevVal !== null && prevVal * val < 0) approxRoots.push(x - sampleStep / 2)
          if (Math.abs(val) < 1e-12) approxRoots.push(x)
          prevVal = val
        } catch { prevVal = null }
      }
      for (const rx of approxRoots) {
        for (const intX of [Math.floor(rx), Math.ceil(rx)]) {
          try {
            const fVal = compiled.evaluate({ x: intX - fn.dx }) as number
            if (!isFinite(fVal)) continue
            const candidateDy = -fVal
            const dist = (fn.dx - fn.dx) ** 2 + (candidateDy - fn.dy) ** 2
            if (dist < bestDist) {
              bestDist = dist
              bestDx = fn.dx
              bestDy = candidateDy
            }
          } catch { continue }
        }
      }

      if (bestDist < Infinity) {
        setFunctions((prev) =>
          prev.map((f, i) => i === gi ? { ...f, dx: bestDx, dy: bestDy } : f)
        )
      }
    } catch { /* skip */ }
  }

  const handleMouseUp = () => {
    if (dragRef.current.dragging) applyMagnetSnap()
    dragRef.current.dragging = false
  }

  const handleMouseLeaveCanvas = () => {
    handleMouseUp()
    if (tangentMode) {
      tangentInfoRef.current = null
      draw()
    }
  }

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = (touch.clientX - rect.left) * (canvas.width / rect.width)
    const sy = (touch.clientY - rect.top) * (canvas.height / rect.height)
    const hitIndex = hitTestCurve(sx, sy)

    longPressRef.current.startX = touch.clientX
    longPressRef.current.startY = touch.clientY

    if (hitIndex >= 0) {
      setSelectedIndex(hitIndex)
      dragRef.current = { dragging: false, lastX: touch.clientX, lastY: touch.clientY, mode: 'graph', graphIndex: hitIndex }

      // Long press timer
      longPressRef.current.timer = setTimeout(() => {
        setContextMenu({ x: touch.clientX - rect.left, y: touch.clientY - rect.top })
        longPressRef.current.timer = null
      }, 500)
    } else {
      setSelectedIndex(null)
      setContextMenu(null)
      dragRef.current = { dragging: false, lastX: touch.clientX, lastY: touch.clientY, mode: 'pan', graphIndex: -1 }

      // Long press on empty area (for paste)
      if (clipboardRef.current) {
        longPressRef.current.timer = setTimeout(() => {
          setContextMenu({ x: touch.clientX - rect.left, y: touch.clientY - rect.top })
          longPressRef.current.timer = null
        }, 500)
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]

    // Cancel long press if finger moved
    const moveThreshold = 10
    const movedDist = Math.abs(touch.clientX - longPressRef.current.startX) + Math.abs(touch.clientY - longPressRef.current.startY)
    if (movedDist > moveThreshold && longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer)
      longPressRef.current.timer = null
    }

    // Close context menu on move
    if (contextMenu) {
      setContextMenu(null)
      return
    }

    dragRef.current.dragging = true
    const mx = touch.clientX - dragRef.current.lastX
    const my = touch.clientY - dragRef.current.lastY
    dragRef.current.lastX = touch.clientX
    dragRef.current.lastY = touch.clientY

    if (dragRef.current.mode === 'graph') {
      const gi = dragRef.current.graphIndex
      setFunctions((prev) =>
        prev.map((fn, i) =>
          i === gi ? { ...fn, dx: fn.dx + mx / view.scale, dy: fn.dy - my / view.scale } : fn
        )
      )
    } else {
      setView((v) => ({
        ...v,
        cx: v.cx - mx / v.scale,
        cy: v.cy + my / v.scale,
      }))
    }
  }

  const handleTouchEnd = () => {
    if (longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer)
      longPressRef.current.timer = null
    }
    if (dragRef.current.dragging) applyMagnetSnap()
    dragRef.current.dragging = false
  }

  // Context menu actions
  const ctxCopy = () => {
    if (selectedIndex !== null && functions[selectedIndex]) {
      clipboardRef.current = { ...functions[selectedIndex] }
    }
    setContextMenu(null)
  }

  const ctxCut = () => {
    if (selectedIndex !== null && functions[selectedIndex]) {
      clipboardRef.current = { ...functions[selectedIndex] }
      removeFunction(selectedIndex)
    }
    setContextMenu(null)
  }

  const ctxPaste = () => {
    if (clipboardRef.current) {
      const pasted = {
        ...clipboardRef.current,
        color: COLORS[functions.length % COLORS.length],
        dx: clipboardRef.current.dx + 0.5,
        dy: clipboardRef.current.dy + 0.5,
      }
      setFunctions((prev) => [...prev, pasted])
      setSelectedIndex(functions.length)
    }
    setContextMenu(null)
  }

  const ctxDeselect = () => {
    setSelectedIndex(null)
    setContextMenu(null)
  }

  const addFunction = () => {
    const expr = input.trim()
    if (!expr) return
    setFunctions((prev) => [
      ...prev,
      { expr, color: COLORS[prev.length % COLORS.length], visible: true, dx: 0, dy: 0, domainMin: null, domainMax: null, domainMinOpen: false, domainMaxOpen: false, showDerivative: false, showIntegral: false },
    ])
    setInput('')
  }

  const removeFunction = (index: number) => {
    setFunctions((prev) => prev.filter((_, i) => i !== index))
    setSelectedIndex((prev) => {
      if (prev === null) return null
      if (prev === index) return null
      if (prev > index) return prev - 1
      return prev
    })
  }

  const startEditing = (index: number) => {
    setEditingIndex(index)
    setEditingExpr(functions[index].expr)
    requestAnimationFrame(() => editInputRef.current?.focus())
  }

  const commitEditing = () => {
    if (editingIndex === null) return
    const expr = editingExpr.trim()
    if (expr) {
      setFunctions((prev) => prev.map((fn, i) => i === editingIndex ? { ...fn, expr } : fn))
    }
    setEditingIndex(null)
    setEditingExpr('')
  }

  const cancelEditing = () => {
    setEditingIndex(null)
    setEditingExpr('')
  }

  const toggleFunction = (index: number) => {
    setFunctions((prev) =>
      prev.map((fn, i) => (i === index ? { ...fn, visible: !fn.visible } : fn))
    )
  }

  const resetView = () => {
    setView({ cx: 0, cy: 0, scale: 50 })
  }

  const insertAtCursor = (value: string) => {
    const el = inputRef.current
    if (!el) {
      setInput((prev) => prev + value)
      return
    }
    const start = el.selectionStart ?? input.length
    const end = el.selectionEnd ?? input.length
    const newValue = input.slice(0, start) + value + input.slice(end)
    setInput(newValue)
    requestAnimationFrame(() => {
      const pos = start + value.length
      el.setSelectionRange(pos, pos)
      el.focus()
    })
  }

  // Keyboard shortcuts for copy/cut/paste
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Only handle when not focused on an input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (!e.ctrlKey && !e.metaKey) return

      if (e.key === 'c' && selectedIndex !== null && functions[selectedIndex]) {
        e.preventDefault()
        clipboardRef.current = { ...functions[selectedIndex] }
      }

      if (e.key === 'x' && selectedIndex !== null && functions[selectedIndex]) {
        e.preventDefault()
        clipboardRef.current = { ...functions[selectedIndex] }
        removeFunction(selectedIndex)
      }

      if (e.key === 'v' && clipboardRef.current) {
        e.preventDefault()
        const pasted = {
          ...clipboardRef.current,
          color: COLORS[functions.length % COLORS.length],
          dx: clipboardRef.current.dx + 0.5,
          dy: clipboardRef.current.dy + 0.5,
        }
        setFunctions((prev) => [...prev, pasted])
        setSelectedIndex(functions.length)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedIndex, functions])

  // Compute extrema for the info panel
  const allExtrema = useMemo(() => {
    const { w } = getCanvasSize()
    const { cx, scale } = view
    const xMin = (0 - w / 2) / scale + cx
    const xMax = (w - w / 2) / scale + cx

    return functions
      .filter((fn) => fn.visible)
      .map((fn) => {
        try {
          const compiled = compile(fn.expr)
          const extrema = findExtrema(compiled, xMin - fn.dx, xMax - fn.dx)
          return {
            expr: fn.expr,
            color: fn.color,
            extrema: extrema.map((ext) => ({ ...ext, x: ext.x + fn.dx, y: ext.y + fn.dy })),
          }
        } catch {
          return { expr: fn.expr, color: fn.color, extrema: [] }
        }
      })
      .filter((e) => e.extrema.length > 0)
  }, [functions, view, getCanvasSize])

  // Compute roots for the info panel
  const allRoots = useMemo(() => {
    const { w } = getCanvasSize()
    const { cx, scale } = view
    const xMin = (0 - w / 2) / scale + cx
    const xMax = (w - w / 2) / scale + cx

    return functions
      .filter((fn) => fn.visible)
      .map((fn) => {
        try {
          const compiled = compile(fn.expr)
          const roots = findRoots(compiled, xMin - fn.dx, xMax - fn.dx)
          return {
            expr: fn.expr,
            color: fn.color,
            roots: roots.map((rx) => rx + fn.dx),
          }
        } catch {
          return { expr: fn.expr, color: fn.color, roots: [] as number[] }
        }
      })
      .filter((e) => e.roots.length > 0)
  }, [functions, view, getCanvasSize])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addFunction()
  }

  const presets = [
    { label: 'sin(x)', value: 'sin(x)' },
    { label: 'x²', value: 'x^2' },
    { label: 'cos(x)', value: 'cos(x)' },
    { label: '1÷x', value: '1/x' },
    { label: 'tan(x)', value: 'tan(x)' },
    { label: 'log(x)', value: 'log(x, 10)' },
  ]

  return (
    <div className="graph-container">
      <div className="graph-toolbar">
        <div className="magnet-toggle-group">
          <span className="magnet-label">마그넷:</span>
          <button className={`magnet-btn${!magnetMode ? ' active' : ''}`} onClick={() => setMagnetMode(false)}>OFF</button>
          <button className={`magnet-btn${magnetMode ? ' active' : ''}`} onClick={() => setMagnetMode(true)}>ON</button>
        </div>
        <div className="magnet-toggle-group">
          <span className="magnet-label">접선:</span>
          <button
            className={`magnet-btn${!tangentMode ? ' active' : ''}`}
            onClick={() => { setTangentMode(false); tangentInfoRef.current = null }}
          >OFF</button>
          <button
            className={`magnet-btn${tangentMode ? ' active' : ''}`}
            onClick={() => setTangentMode(true)}
          >ON</button>
          {pinnedTangents.length > 0 && (
            <button
              className="magnet-btn"
              onClick={() => setPinnedTangents([])}
              title="접선 모두 지우기"
            >지우기 ({pinnedTangents.length})</button>
          )}
        </div>
        {selectedIndex !== null && functions[selectedIndex] && (
          <div className="domain-setting-group">
            <span className="domain-label">구간:</span>
            <input
              type="number"
              className="domain-input"
              value={functions[selectedIndex].domainMin ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : parseFloat(e.target.value)
                setFunctions(prev => prev.map((fn, i) => i === selectedIndex ? { ...fn, domainMin: v } : fn))
              }}
              placeholder="min"
            />
            <select
              className="domain-open-select"
              value={functions[selectedIndex].domainMinOpen ? 'open' : 'closed'}
              onChange={e => setFunctions(prev => prev.map((fn, i) => i === selectedIndex ? { ...fn, domainMinOpen: e.target.value === 'open' } : fn))}
            >
              <option value="closed">[</option>
              <option value="open">(</option>
            </select>
            <span style={{ margin: '0 4px' }}>~</span>
            <select
              className="domain-open-select"
              value={functions[selectedIndex].domainMaxOpen ? 'open' : 'closed'}
              onChange={e => setFunctions(prev => prev.map((fn, i) => i === selectedIndex ? { ...fn, domainMaxOpen: e.target.value === 'open' } : fn))}
            >
              <option value="closed">]</option>
              <option value="open">)</option>
            </select>
            <input
              type="number"
              className="domain-input"
              value={functions[selectedIndex].domainMax ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : parseFloat(e.target.value)
                setFunctions(prev => prev.map((fn, i) => i === selectedIndex ? { ...fn, domainMax: v } : fn))
              }}
              placeholder="max"
            />
          </div>
        )}
      </div>
      <div className="graph-input-section">
        <div className="graph-input-row">
          <span className="graph-fx">f(𝑥) =</span>
          <PrettyInput
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="함수 입력... (예: sin(𝑥), 𝑥²)"
            className="graph-input"
          />
          <button onClick={addFunction} className="graph-add-btn">추가</button>
          <button onClick={resetView} className="graph-reset-btn">리셋</button>
        </div>

        <div className="graph-quick-btns">
          {mathButtons.map((btn) => (
            <button
              key={btn.label}
              className="graph-quick-btn"
              onClick={() => insertAtCursor(btn.value)}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="graph-presets">
          <span className="graph-presets-label">빠른 추가:</span>
          {presets.map((p) => (
            <button
              key={p.label}
              className="graph-preset-btn"
              onClick={() => setInput(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {functions.length > 0 && (
        <div className="graph-fn-list">
          {functions.map((fn, i) => (
            <div
              key={i}
              className={`graph-fn-item ${selectedIndex === i ? 'selected' : ''}`}
              onClick={() => { if (editingIndex !== i) setSelectedIndex(selectedIndex === i ? null : i) }}
              onDoubleClick={(e) => { e.stopPropagation(); startEditing(i) }}
            >
              <button
                className="graph-fn-toggle"
                style={{ background: fn.visible ? fn.color : 'transparent', borderColor: fn.color }}
                onClick={(e) => { e.stopPropagation(); toggleFunction(i) }}
              />
              {editingIndex === i ? (
                <input
                  ref={editInputRef}
                  className="graph-fn-edit-input"
                  style={{ color: fn.color }}
                  value={editingExpr}
                  onChange={(e) => setEditingExpr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEditing()
                    if (e.key === 'Escape') cancelEditing()
                  }}
                  onBlur={commitEditing}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <code className="graph-fn-expr" style={{ color: fn.visible ? fn.color : 'var(--text-dim)' }}>
                  {prettifyExpr(fn.expr)}
                  {(fn.dx !== 0 || fn.dy !== 0) && (
                    <span className="graph-fn-offset">
                      {fn.dx !== 0 ? ` ${fn.dx > 0 ? '+' : ''}${formatNumber(fn.dx)}x` : ''}
                      {fn.dy !== 0 ? ` ${fn.dy > 0 ? '+' : ''}${formatNumber(fn.dy)}y` : ''}
                    </span>
                  )}
                </code>
              )}
              <button
                className={`graph-fn-deriv${fn.showDerivative ? ' active' : ''}`}
                style={fn.showDerivative ? { color: DERIVATIVE_COLORS[i % DERIVATIVE_COLORS.length] } : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  setFunctions((prev) => prev.map((f, j) => j === i ? { ...f, showDerivative: !f.showDerivative } : f))
                }}
                title="도함수 표시"
              >f'(𝑥)</button>
              <button
                className={`graph-fn-deriv${fn.showIntegral ? ' active' : ''}`}
                style={fn.showIntegral ? { color: INTEGRAL_COLORS[i % INTEGRAL_COLORS.length] } : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!fn.showIntegral) {
                    if (!canIntegrate(fn.expr)) {
                      alert('이 함수는 적분할 수 없습니다.\n정의되지 않거나 발산하는 구간이 포함되어 있습니다.')
                      return
                    }
                  }
                  setFunctions((prev) => prev.map((f, j) => j === i ? { ...f, showIntegral: !f.showIntegral } : f))
                }}
                title="적분 표시"
              >F(𝑥)</button>
              <button className="graph-fn-remove" onClick={(e) => { e.stopPropagation(); removeFunction(i) }}>✕</button>
            </div>
          ))}
          {selectedIndex !== null && (
            <div className="graph-fn-hint">
              더블클릭으로 수정 / Ctrl+C 복사 / Ctrl+X 잘라내기 / Ctrl+V 붙여넣기 / 드래그로 이동
            </div>
          )}
        </div>
      )}

      <div className="graph-canvas-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeaveCanvas}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`graph-canvas${tangentMode ? ' tangent-mode' : ''}`}
        />
        {functions.length === 0 && (
          <div className="graph-placeholder">
            함수를 추가하여 그래프를 확인하세요
          </div>
        )}
        {contextMenu && (
          <div
            className="graph-ctx-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {selectedIndex !== null && (
              <>
                <button className="graph-ctx-item" onClick={ctxCopy}>복사</button>
                <button className="graph-ctx-item" onClick={ctxCut}>잘라내기</button>
              </>
            )}
            {clipboardRef.current && (
              <button className="graph-ctx-item" onClick={ctxPaste}>붙여넣기</button>
            )}
            {selectedIndex !== null && (
              <button className="graph-ctx-item" onClick={ctxDeselect}>선택 해제</button>
            )}
          </div>
        )}
      </div>

      {pinnedTangents.length > 0 && (
        <div className="graph-extrema-panel">
          <div className="graph-extrema-title">접선</div>
          {pinnedTangents.map((pt, i) => {
            const m = formatNumber(pt.slope)
            const b = pt.wy - pt.slope * pt.wx
            let eq: string
            if (Math.abs(pt.slope) < 1e-10) eq = `y = ${formatNumber(b)}`
            else if (Math.abs(b) < 1e-10) eq = `y = ${m}𝑥`
            else eq = b > 0 ? `y = ${m}𝑥 + ${formatNumber(b)}` : `y = ${m}𝑥 − ${formatNumber(Math.abs(b))}`
            return (
              <div key={i} className="graph-tangent-item">
                <span className="graph-tangent-dot" style={{ background: pt.color }} />
                <code className="graph-tangent-eq" style={{ color: pt.color }}>{eq}</code>
                <span className="graph-extrema-coord">
                  at ({formatNumber(pt.wx)}, {formatNumber(pt.wy)})
                </span>
                <button
                  className="graph-fn-remove"
                  onClick={() => setPinnedTangents((prev) => prev.filter((_, j) => j !== i))}
                >✕</button>
              </div>
            )
          })}
        </div>
      )}

      {allExtrema.length > 0 && (
        <div className="graph-extrema-panel">
          <div className="graph-extrema-title">극값</div>
          {allExtrema.map((entry, i) => (
            <div key={i} className="graph-extrema-fn">
              <code className="graph-extrema-expr" style={{ color: entry.color }}>
                {prettifyExpr(entry.expr)}
              </code>
              <div className="graph-extrema-list">
                {entry.extrema.map((ext, j) => (
                  <span key={j} className="graph-extrema-item">
                    <span className={`graph-extrema-badge ${ext.type}`}>
                      {ext.type === 'max' ? '극대' : '극소'}
                    </span>
                    <span className="graph-extrema-coord">
                      ({formatNumber(ext.x)}, {formatNumber(ext.y)})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {allRoots.length > 0 && (
        <div className="graph-extrema-panel">
          <div className="graph-extrema-title">근 (영점)</div>
          {allRoots.map((entry, i) => (
            <div key={i} className="graph-extrema-fn">
              <code className="graph-extrema-expr" style={{ color: entry.color }}>
                {prettifyExpr(entry.expr)}
              </code>
              <div className="graph-extrema-list">
                {entry.roots.map((rx, j) => (
                  <span key={j} className="graph-extrema-item">
                    <span className="graph-extrema-badge root">근</span>
                    <span className="graph-extrema-coord">
                      𝑥 = {formatNumber(rx)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .graph-toolbar {
          display: flex;
          gap: 18px;
          align-items: center;
          margin-bottom: 2px;
        }
        .magnet-toggle-group {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .magnet-label {
          color: var(--text-dim);
          font-size: 0.92rem;
          margin-right: 2px;
        }
        .magnet-btn {
          padding: 4px 12px;
          font-size: 0.92rem;
          background: var(--surface);
          color: var(--text-dim);
          border-radius: 7px;
          border: none;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .magnet-btn.active, .magnet-btn:hover {
          background: var(--primary);
          color: #fff;
        }
        .domain-setting-group {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--surface-light);
          border-radius: 8px;
          padding: 4px 10px;
        }
        .domain-label {
          color: var(--text-dim);
          font-size: 0.92rem;
          margin-right: 2px;
        }
        .domain-input {
          width: 60px;
          font-size: 0.95rem;
          padding: 2px 6px;
          border-radius: 5px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
        }
        .domain-open-select {
          font-size: 1.1rem;
          background: var(--surface);
          color: var(--text);
          border-radius: 5px;
          border: 1px solid var(--border);
          padding: 2px 4px;
        }
        .graph-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .graph-input-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .graph-input-row {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .graph-fx {
          color: var(--primary);
          font-weight: 600;
          font-size: 1.1rem;
          white-space: nowrap;
          font-family: 'JetBrains Mono', monospace;
        }

        .graph-input {
          flex: 1;
          font-size: 1rem;
          padding: 12px 14px;
        }

        .graph-add-btn {
          padding: 12px 24px;
          white-space: nowrap;
        }

        .graph-reset-btn {
          padding: 12px 16px;
          background: var(--surface);
          color: var(--text-dim);
          white-space: nowrap;
        }

        .graph-reset-btn:hover {
          background: var(--surface-light);
          color: var(--text);
        }

        .graph-quick-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .graph-quick-btn {
          padding: 8px 14px;
          font-size: 0.9rem;
          background: var(--surface);
          color: var(--text);
          border-radius: 8px;
          font-weight: 500;
          min-width: 42px;
        }

        .graph-quick-btn:hover {
          background: var(--surface-light);
        }

        .graph-presets {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .graph-presets-label {
          color: var(--text-dim);
          font-size: 0.85rem;
        }

        .graph-preset-btn {
          padding: 4px 10px;
          font-size: 0.8rem;
          background: var(--surface);
          color: var(--text-dim);
          border-radius: 6px;
          font-family: 'JetBrains Mono', monospace;
        }

        .graph-preset-btn:hover {
          background: var(--surface-light);
          color: var(--text);
        }

        .graph-fn-list {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .graph-fn-item {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--surface);
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          border: 2px solid transparent;
          transition: border-color 0.15s;
        }

        .graph-fn-item:hover {
          background: var(--surface-light);
        }

        .graph-fn-item.selected {
          border-color: var(--primary);
          background: var(--surface-light);
        }

        .graph-fn-toggle {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          padding: 0;
          border: 2px solid;
          min-width: 14px;
          cursor: pointer;
        }

        .graph-fn-toggle:hover {
          opacity: 0.7;
        }

        .graph-fn-expr {
          font-size: 0.9rem;
        }

        .graph-fn-edit-input {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9rem;
          font-weight: 600;
          background: var(--surface);
          border: 1px solid var(--primary);
          border-radius: 4px;
          padding: 2px 6px;
          outline: none;
          min-width: 80px;
          flex: 1;
        }

        .graph-fn-deriv {
          padding: 2px 8px;
          font-size: 0.75rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          background: transparent;
          color: var(--text-dim);
          min-width: 0;
          border: 1px solid var(--border);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .graph-fn-deriv:hover {
          background: var(--surface-light);
        }

        .graph-fn-deriv.active {
          border-color: currentColor;
          background: rgba(224, 64, 251, 0.1);
        }

        .graph-fn-remove {
          padding: 2px 6px;
          font-size: 0.75rem;
          background: transparent;
          color: var(--text-dim);
          min-width: 0;
        }

        .graph-fn-remove:hover {
          color: var(--error);
          background: transparent;
        }

        .graph-fn-offset {
          color: var(--text-dim);
          font-size: 0.8rem;
          margin-left: 4px;
        }

        .graph-fn-hint {
          width: 100%;
          font-size: 0.78rem;
          color: var(--text-dim);
          padding: 2px 4px;
        }

        .graph-canvas-wrap {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          background: #0f1629;
          border: 1px solid var(--border);
        }

        .graph-canvas {
          display: block;
          width: 100%;
          height: 500px;
          cursor: grab;
          touch-action: none;
        }

        .graph-canvas:active {
          cursor: grabbing;
        }

        .graph-canvas.tangent-mode {
          cursor: crosshair;
        }

        .graph-placeholder {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: var(--text-dim);
          font-size: 0.95rem;
          pointer-events: none;
        }

        .graph-ctx-menu {
          position: absolute;
          background: var(--surface-light);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 4px;
          z-index: 10;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          display: flex;
          flex-direction: column;
          min-width: 120px;
          transform: translate(-50%, 8px);
        }

        .graph-ctx-item {
          padding: 10px 16px;
          background: transparent;
          color: var(--text);
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          text-align: left;
          white-space: nowrap;
        }

        .graph-ctx-item:hover {
          background: var(--primary);
          color: white;
        }

        .graph-ctx-item:active {
          background: var(--primary-hover);
        }

        .graph-extrema-panel {
          background: var(--surface);
          border-radius: 12px;
          padding: 14px 18px;
        }

        .graph-extrema-title {
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-dim);
          margin-bottom: 10px;
        }

        .graph-extrema-fn {
          margin-bottom: 8px;
        }

        .graph-extrema-fn:last-child {
          margin-bottom: 0;
        }

        .graph-extrema-expr {
          font-size: 0.9rem;
          font-weight: 600;
          display: block;
          margin-bottom: 4px;
        }

        .graph-extrema-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .graph-extrema-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .graph-extrema-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .graph-extrema-badge.max {
          background: rgba(239, 83, 80, 0.15);
          color: #ef5350;
        }

        .graph-extrema-badge.min {
          background: rgba(76, 175, 80, 0.15);
          color: #4caf50;
        }

        .graph-extrema-badge.root {
          background: rgba(38, 198, 218, 0.15);
          color: #26c6da;
        }

        .graph-extrema-coord {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9rem;
          color: var(--text);
        }

        .graph-tangent-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
          border-bottom: 1px solid var(--border);
        }

        .graph-tangent-item:last-child {
          border-bottom: none;
        }

        .graph-tangent-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .graph-tangent-eq {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.95rem;
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString()
  const abs = Math.abs(n)
  if (abs >= 1) return parseFloat(n.toPrecision(4)).toString()
  return parseFloat(n.toPrecision(2)).toString()
}
