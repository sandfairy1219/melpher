import { useState, useRef, useEffect } from 'react'
import { evaluate } from 'mathjs'
import { prettifyExpr } from '../utils/prettifyExpr'

interface HistoryEntry {
  expression: string
  result: string
  isError: boolean
}

export default function Calculator() {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const historyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [history])

  const handleCalculate = () => {
    const expr = input.trim()
    if (!expr) return

    try {
      const result = evaluate(expr)
      const formatted = typeof result === 'number'
        ? Number.isInteger(result) ? result.toString() : parseFloat(result.toPrecision(12)).toString()
        : String(result)

      setHistory((prev) => [...prev, { expression: expr, result: formatted, isError: false }])
    } catch (err) {
      const message = err instanceof Error ? err.message : '계산 오류'
      setHistory((prev) => [...prev, { expression: expr, result: message, isError: true }])
    }

    setInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCalculate()
    }
  }

  const insertFunction = (fn: string) => {
    setInput((prev) => prev + fn)
    inputRef.current?.focus()
  }

  const quickButtons = [
    { label: '+', value: ' + ' },
    { label: '−', value: ' - ' },
    { label: '×', value: ' * ' },
    { label: '÷', value: ' / ' },
    { label: 'xⁿ', value: '^' },
    { label: '!', value: '!' },
    { label: '√', value: 'sqrt(' },
    { label: 'sin', value: 'sin(' },
    { label: 'cos', value: 'cos(' },
    { label: 'tan', value: 'tan(' },
    { label: 'log', value: 'log(' },
    { label: 'ln', value: 'log(' },
    { label: 'π', value: 'pi' },
    { label: 'e', value: 'e' },
    { label: '(', value: '(' },
    { label: ')', value: ')' },
  ]

  return (
    <div className="calc-container">
      <div className="calc-history" ref={historyRef}>
        {history.length === 0 && (
          <div className="calc-empty">
            <p>수식을 입력하고 Enter를 누르세요</p>
            <p className="calc-examples">
              예: <code>2 + 3 * 4</code>, <code>sin(pi/2)</code>, <code>sqrt(144)</code>, <code>5!</code>
            </p>
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i} className="calc-entry">
            <div className="calc-expr">{prettifyExpr(entry.expression)}</div>
            <div className={`calc-result ${entry.isError ? 'error' : ''}`}>
              = {entry.result}
            </div>
          </div>
        ))}
      </div>

      <div className="calc-quick-btns">
        {quickButtons.map((btn) => (
          <button
            key={btn.label}
            className="quick-btn"
            onClick={() => insertFunction(btn.value)}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="calc-input-row">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="수식 입력... (예: 2+3*4)"
          className="calc-input"
          autoFocus
        />
        <button onClick={handleCalculate} className="calc-btn">
          =
        </button>
      </div>

      <style>{`
        .calc-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .calc-history {
          background: var(--surface);
          border-radius: 12px;
          padding: 16px;
          min-height: 200px;
          max-height: 400px;
          overflow-y: auto;
        }

        .calc-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 160px;
          color: var(--text-dim);
        }

        .calc-examples {
          margin-top: 8px;
          font-size: 0.85rem;
        }

        .calc-examples code {
          background: var(--surface-light);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.85rem;
        }

        .calc-entry {
          padding: 8px 0;
          border-bottom: 1px solid var(--border);
        }

        .calc-entry:last-child {
          border-bottom: none;
        }

        .calc-expr {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          color: var(--text-dim);
          font-size: 0.9rem;
        }

        .calc-result {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          color: var(--success);
          font-size: 1.2rem;
          font-weight: 600;
        }

        .calc-result.error {
          color: var(--error);
          font-size: 0.9rem;
          font-weight: 400;
        }

        .calc-quick-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .quick-btn {
          padding: 8px 14px;
          font-size: 0.9rem;
          background: var(--surface);
          color: var(--text);
          border-radius: 8px;
          font-weight: 500;
          min-width: 42px;
        }

        .quick-btn:hover {
          background: var(--surface-light);
        }

        .calc-input-row {
          display: flex;
          gap: 8px;
        }

        .calc-input {
          flex: 1;
          font-size: 1.1rem;
          padding: 14px 16px;
        }

        .calc-btn {
          padding: 14px 28px;
          font-size: 1.3rem;
          font-weight: 700;
        }
      `}</style>
    </div>
  )
}
