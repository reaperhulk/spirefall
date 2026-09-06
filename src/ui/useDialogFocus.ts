import { useEffect } from 'react'

// The topmost dialog owns keyboard focus. Restore the trigger on close.
export function useDialogFocus(): void {
  useEffect(() => {
    let current: HTMLElement | null = null
    let restore: HTMLElement | null = null
    const focusable = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length > 0)
    const update = () => {
      const dialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]')
      const next = dialogs.item(dialogs.length - 1)
      if (next === current) return
      if (next) {
        if (!current) restore = document.activeElement as HTMLElement | null
        current = next
        ;(focusable(next)[0] ?? next).focus()
      } else {
        current = null
        restore?.focus()
        restore = null
      }
    }
    const key = (e: KeyboardEvent) => {
      if (!current || e.key !== 'Tab') return
      const items = focusable(current)
      if (!items.length) { e.preventDefault(); return }
      const index = items.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey ? index <= 0 : index === items.length - 1 || index < 0) {
        e.preventDefault()
        items[e.shiftKey ? items.length - 1 : 0]!.focus()
      }
    }
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] })
    document.addEventListener('keydown', key, true)
    update()
    return () => { observer.disconnect(); document.removeEventListener('keydown', key, true) }
  }, [])
}
