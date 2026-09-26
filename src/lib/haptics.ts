/**
 * A short buzz under the thumb, for the controls a musician presses without looking.
 *
 * Android only in practice: Safari has no `navigator.vibrate`, so an iPhone gets the visual
 * press and nothing else, which is why nothing may depend on this. Chrome ignores a call
 * made outside a user gesture, and every caller here is a click handler.
 */
export function tapFeedback(): void {
  try {
    navigator.vibrate?.(8)
  } catch {
    // A browser that refuses is a browser that does not buzz.
  }
}
