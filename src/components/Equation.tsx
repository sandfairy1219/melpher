import { useState, useRef } from 'react'
import * as math from 'mathjs'
import { prettifyExpr } from '../utils/prettifyExpr'
import PrettyInput from './PrettyInput'

interface Solution {
  input: string
  variable: string
  roots: string[]
  error?: string
}

function solveEquation(equation: string): Solution {
  // Normalize: remove spaces, detect variable
  let eq = equation.replace(/\s+/g, '')

  // Detect variable (default to x)
  const vars = new Set<string>()
  for (const ch of eq) {
    if (/[a-zA-Z]/.test(ch) && !['s','i','n','c','o','t','a','l','g','q','r','p','e'].includes(ch)) {
      vars.add(ch)
    }
  }

  // Better variable detection: parse and find symbols
  const allSymbols = eq.match(/[a-zA-Z_]+/g) || []
  const mathFunctions = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'sqrt', 'log', 'ln', 'abs', 'exp', 'pi', 'e',
    'ceil', 'floor', 'round', 'sign',
  ])
  const detectedVars = [...new Set(allSymbols.filter((s) => !mathFunctions.has(s)))]
  const variable = detectedVars[0] || 'x'

  // Split equation by '='
  let lhs: string, rhs: string
  if (eq.includes('=')) {
    const parts = eq.split('=')
    lhs = parts[0]
    rhs = parts[1]
  } else {
    // If no '=', assume = 0
    lhs = eq
    rhs = '0'
  }

  // f(x) = lhs - rhs = 0
  const fExpr = `(${lhs}) - (${rhs})`

  try {
    // Try to find roots numerically using Newton's method with multiple starting points
    const compiled = math.compile(fExpr)
    const roots: number[] = []

    const startPoints = [
      0, 1, -1, 2, -2, 5, -5, 10, -10, 0.5, -0.5,
      0.1, -0.1, 3, -3, 7, -7, 20, -20, 100, -100,
    ]

    for (const x0 of startPoints) {
      const root = newtonMethod(compiled, variable, x0)
      if (root !== null) {
        // Check if this root is already found
        const isDuplicate = roots.some((r) => Math.abs(r - root) < 1e-8)
        if (!isDuplicate) {
          roots.push(root)
        }
      }
    }

    roots.sort((a, b) => a - b)

    if (roots.length === 0) {
      return { input: equation, variable, roots: [], error: '해를 찾을 수 없습니다' }
    }

    const formatted = roots.map((r) => {
      if (Math.abs(r) < 1e-10) return '0'
      if (Number.isInteger(r)) return r.toString()
      // Check if it's close to a simple fraction
      const frac = toFraction(r)
      if (frac) return `${frac} (≈ ${parseFloat(r.toPrecision(8))})`
      return parseFloat(r.toPrecision(10)).toString()
    })

    return { input: equation, variable, roots: formatted }
  } catch {
    return { input: equation, variable, roots: [], error: '수식을 파싱할 수 없습니다' }
  }
}

function newtonMethod(
  compiled: math.EvalFunction,
  variable: string,
  x0: number,
  maxIter = 100,
  tol = 1e-12,
): number | null {
  let x = x0
  const h = 1e-8

  for (let i = 0; i < maxIter; i++) {
    let fx: number, dfx: number
    try {
      fx = compiled.evaluate({ [variable]: x }) as number
      const fxh = compiled.evaluate({ [variable]: x + h }) as number
      dfx = (fxh - fx) / h
    } catch {
      return null
    }

    if (!isFinite(fx) || isNaN(fx)) return null
    if (Math.abs(fx) < tol) return Math.abs(x) < tol ? 0 : x
    if (Math.abs(dfx) < 1e-15) return null

    const x1 = x - fx / dfx
    if (!isFinite(x1) || isNaN(x1)) return null
    if (Math.abs(x1 - x) < tol) return Math.abs(x1) < tol ? 0 : x1
    x = x1
  }

  // Check if final value is close to zero
  try {
    const fx = compiled.evaluate({ [variable]: x }) as number
    if (Math.abs(fx) < 1e-6) return x
  } catch { /* ignore */ }

  return null
}

function toFraction(value: number): string | null {
  const maxDenom = 1000
  for (let d = 1; d <= maxDenom; d++) {
    const n = Math.round(value * d)
    if (Math.abs(n / d - value) < 1e-9) {
      if (d === 1) return null // It's an integer
      const g = gcd(Math.abs(n), d)
      const num = n / g
      const den = d / g
      if (den === 1) return null
      return `${num}/${den}`
    }
  }
  return null
}

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b] }
  return a
}

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
  { label: 'log', value: 'log(' },
  { label: 'ln', value: 'log(' },
  { label: 'abs', value: 'abs(' },
  { label: 'π', value: 'pi' },
  { label: 'e', value: 'e' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
  { label: '=', value: ' = ' },
]

export default function Equation() {
  const [input, setInput] = useState('')
  const [solutions, setSolutions] = useState<Solution[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

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

  const handleSolve = () => {
    const eq = input.trim()
    if (!eq) return
    const solution = solveEquation(eq)
    setSolutions((prev) => [solution, ...prev])
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSolve()
  }

  const examples = [
    'x^2 - 4 = 0',
    '2x + 3 = 7',
    'x^3 - 6x^2 + 11x - 6 = 0',
    'sin(x) = 0.5',
    'x^2 + x - 6 = 0',
  ]

  return (
    <div className="eq-container">
      <div className="eq-input-section">
        <div className="eq-input-row">
          <PrettyInput
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="방정식 입력... (예: 𝑥² − 4 = 0)"
            className="eq-input"
            autoFocus
          />
          <button onClick={handleSolve} className="eq-btn">풀기</button>
        </div>

        <div className="eq-quick-btns">
          {mathButtons.map((btn) => (
            <button
              key={btn.label}
              className="eq-quick-btn"
              onClick={() => insertAtCursor(btn.value)}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="eq-examples">
          <span className="eq-examples-label">예시:</span>
          {examples.map((ex) => (
            <button
              key={ex}
              className="eq-example-btn"
              onClick={() => { setInput(ex); }}
            >
              {prettifyExpr(ex)}
            </button>
          ))}
        </div>
      </div>

      <div className="eq-results">
        {solutions.length === 0 && (
          <div className="eq-empty">
            <p>방정식을 입력하고 "풀기"를 클릭하세요</p>
            <p className="eq-hint">일차, 이차, 고차 다항식 및 삼각 방정식을 풀 수 있습니다</p>
          </div>
        )}

        {solutions.map((sol, i) => (
          <div key={i} className={`eq-card ${sol.error ? 'eq-error' : ''}`}>
            <div className="eq-problem">
              <span className="eq-label">문제</span>
              <code>{prettifyExpr(sol.input)}</code>
            </div>
            {sol.error ? (
              <div className="eq-error-msg">{sol.error}</div>
            ) : (
              <div className="eq-solutions">
                <span className="eq-label">해</span>
                {sol.roots.map((root, j) => (
                  <div key={j} className="eq-root">
                    <span className="eq-var">{sol.variable}</span> = <span className="eq-value">{prettifyExpr(root)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .eq-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .eq-input-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .eq-input-row {
          display: flex;
          gap: 8px;
        }

        .eq-input {
          flex: 1;
          font-size: 1.1rem;
          padding: 14px 16px;
        }

        .eq-btn {
          padding: 14px 28px;
          font-size: 1rem;
          white-space: nowrap;
        }

        .eq-quick-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .eq-quick-btn {
          padding: 8px 14px;
          font-size: 0.9rem;
          background: var(--surface);
          color: var(--text);
          border-radius: 8px;
          font-weight: 500;
          min-width: 42px;
        }

        .eq-quick-btn:hover {
          background: var(--surface-light);
        }

        .eq-examples {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .eq-examples-label {
          color: var(--text-dim);
          font-size: 0.85rem;
        }

        .eq-example-btn {
          padding: 4px 10px;
          font-size: 0.8rem;
          background: var(--surface);
          color: var(--text-dim);
          border-radius: 6px;
          font-family: 'JetBrains Mono', monospace;
        }

        .eq-example-btn:hover {
          background: var(--surface-light);
          color: var(--text);
        }

        .eq-results {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .eq-empty {
          background: var(--surface);
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          color: var(--text-dim);
        }

        .eq-hint {
          font-size: 0.85rem;
          margin-top: 8px;
        }

        .eq-card {
          background: var(--surface);
          border-radius: 12px;
          padding: 16px 20px;
          border-left: 3px solid var(--primary);
        }

        .eq-card.eq-error {
          border-left-color: var(--error);
        }

        .eq-label {
          display: inline-block;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-dim);
          margin-bottom: 4px;
        }

        .eq-problem {
          margin-bottom: 12px;
        }

        .eq-problem code {
          display: block;
          font-size: 1.1rem;
          color: var(--text);
          font-family: 'JetBrains Mono', monospace;
        }

        .eq-error-msg {
          color: var(--error);
          font-size: 0.9rem;
        }

        .eq-root {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.1rem;
          padding: 4px 0;
        }

        .eq-var {
          color: var(--primary);
          font-weight: 600;
        }

        .eq-value {
          color: var(--success);
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}
