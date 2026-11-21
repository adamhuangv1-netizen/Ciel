import { useEffect, useState } from 'react'

/** Reveals `text` one character every `msPerChar` ms. Shows it all at once under reduced motion. */
export function useTypewriter(text: string, msPerChar = 18): string {
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [count, setCount] = useState(reduced ? text.length : 0)

  useEffect(() => {
    if (reduced) {
      setCount(text.length)
      return
    }
    setCount(0)
    const timer = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(timer)
          return c
        }
        return c + 1
      })
    }, msPerChar)
    return () => clearInterval(timer)
  }, [text, msPerChar, reduced])

  return text.slice(0, count)
}
