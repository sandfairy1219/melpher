import { forwardRef } from 'react'
import { prettifyExpr } from '../utils/prettifyExpr'

interface PrettyInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string
}

const PrettyInput = forwardRef<HTMLInputElement, PrettyInputProps>(
  ({ value, className, ...props }, ref) => {
    return (
      <div className="pretty-input-wrap">
        <input
          ref={ref}
          type="text"
          value={value}
          className={`pretty-input-raw ${className ?? ''}`}
          {...props}
        />
        <div className={`pretty-input-overlay ${className ?? ''}`} aria-hidden>
          {value ? prettifyExpr(value) : <span className="pretty-input-ph">{props.placeholder}</span>}
        </div>
        <style>{`
          .pretty-input-wrap {
            position: relative;
            flex: 1;
            min-width: 0;
          }
          .pretty-input-raw {
            width: 100%;
            color: transparent !important;
            caret-color: var(--text);
          }
          .pretty-input-raw::selection {
            background: rgba(108, 99, 255, 0.3);
          }
          .pretty-input-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            color: var(--text);
            pointer-events: none;
            white-space: nowrap;
            overflow: hidden;
            z-index: 2;
            background: none !important;
            border-color: transparent !important;
            box-shadow: none !important;
          }
          .pretty-input-ph {
            color: var(--text-dim);
            opacity: 0.6;
          }
        `}</style>
      </div>
    )
  }
)

PrettyInput.displayName = 'PrettyInput'

export default PrettyInput
