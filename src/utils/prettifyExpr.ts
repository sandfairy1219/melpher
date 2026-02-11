export function prettifyExpr(expr: string): string {
  let s = expr
  // 거듭제곱을 위첨자로 변환
  const superscripts: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  }
  s = s.replace(/\^(\d+)/g, (_, digits: string) =>
    [...digits].map((d) => superscripts[d] ?? d).join('')
  )
  // sqrt → √
  s = s.replace(/sqrt\(/g, '√(')
  // pi → π
  s = s.replace(/\bpi\b/g, 'π')
  // 곱하기 * → ×
  s = s.replace(/\*/g, '×')
  // 나누기 / → ÷
  s = s.replace(/\//g, '÷')
  return s
}
