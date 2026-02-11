export function prettifyExpr(expr: string): string {
  let s = expr

  // 거듭제곱: ^(...) 또는 ^숫자 또는 ^문자 → 위첨자 변환
  const superscripts: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'x': '\u02E3',
  }
  // ^숫자들 → 위첨자 숫자
  s = s.replace(/\^(\d+)/g, (_, digits: string) =>
    [...digits].map((d) => superscripts[d] ?? d).join('')
  )
  // ^단일문자 (x, n 등)
  s = s.replace(/\^([a-zA-Z])/g, (_, ch: string) =>
    superscripts[ch.toLowerCase()] ?? `^${ch}`
  )
  // 남은 ^ 제거 (예: ^( 같은 케이스)
  s = s.replace(/\^/g, '')

  // sqrt → √
  s = s.replace(/sqrt\(/g, '√(')
  // pi → π
  s = s.replace(/\bpi\b/g, 'π')
  // 곱하기 * → ×
  s = s.replace(/\*/g, '×')
  // 나누기 / → ÷
  s = s.replace(/\//g, '÷')
  // 변수 x → 수학 이탤릭 𝑥 (함수명 속 x는 제외)
  s = s.replace(/(?<![a-zA-Z])x(?![a-zA-Z])/g, '𝑥')

  return s
}
