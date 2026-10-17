/**
 * Enter in an inline rename field presses the Save beside it (2026-10-17).
 *
 * The three rename fields — a songbook on home, a section on its songbook and in Arrange — are
 * not inside a `<form>`, so Enter did nothing while «New songbook» and «Add section», which are
 * forms, submit on it. Pressing the button rather than repeating its action keeps one path:
 * its own `disabled` (busy, an empty name) still decides.
 */
export function pressNearestSave(field: HTMLElement): void {
  let scope: HTMLElement | null = field.parentElement
  while (scope !== null && scope.querySelector('.btn-primary') === null) scope = scope.parentElement
  scope?.querySelector<HTMLButtonElement>('.btn-primary')?.click()
}
