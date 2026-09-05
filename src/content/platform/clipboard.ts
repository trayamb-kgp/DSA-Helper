/**
 * Clipboard write (spec.md section 7.3).
 *
 * Service workers have no clipboard, so the write happens in a document. Which
 * document depends on which surface fired the action, and that is not a
 * preference (D041):
 *
 *   - popup: the popup writes it itself. While the popup is open the page is
 *     not the focused document, and `navigator.clipboard.writeText` throws
 *     "Document is not focused" there. The extension deliberately carries no
 *     `clipboardWrite` permission (spec.md section 10), so there is no way
 *     around that -- the surface holding the user gesture has to do the write.
 *   - keyboard command and context menu: the page *is* focused, so the worker
 *     injects this function into it.
 *
 * ---------------------------------------------------------------------------
 * `copyInPage` MUST STAY SELF-CONTAINED, for the same reason `toastInPage` is:
 * it is shipped to pages via `chrome.scripting.executeScript({ func })`, which
 * serialises it with `Function.prototype.toString()`. A reference to anything
 * declared outside the body becomes a ReferenceError in the page, where nobody
 * sees it. `clipboard.test.ts` rebuilds it from its own source to catch that.
 * ---------------------------------------------------------------------------
 */

/**
 * Returns true when the text reached the clipboard.
 *
 * Tries the modern API first, then a hidden textarea with `execCommand`, which
 * still works in the non-secure and permission-denied cases the modern one
 * refuses. The caller decides what to say; this only reports.
 */
export async function copyInPage(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Not secure context, not focused, or permission refused. Fall through.
  }

  try {
    const holder = document.createElement('textarea');
    holder.value = text;
    // Off-screen rather than hidden: a `display:none` element cannot be
    // selected, and an unselected textarea copies nothing.
    holder.setAttribute('readonly', '');
    holder.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';

    document.body.append(holder);
    holder.select();
    holder.setSelectionRange(0, text.length);

    const copied = document.execCommand('copy');
    holder.remove();
    return copied;
  } catch {
    return false;
  }
}
