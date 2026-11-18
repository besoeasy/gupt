/**
 * Keys that belong to an input method, not to the app.
 *
 * While a Japanese, Chinese or Korean IME is composing, Enter confirms the
 * candidate the reader is looking at. Sending the message on that same key
 * would ship half a sentence and swallow the candidate. `isComposing` is the
 * modern flag; `keyCode 229` is what older Android webviews and Safari report.
 */
export function isComposingKeydown(event) {
  if (!event) return false;
  return Boolean(event.isComposing) || Number(event.keyCode) === 229;
}
