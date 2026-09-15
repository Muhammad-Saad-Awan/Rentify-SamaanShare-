"use client";

import { useCallback, useRef } from "react";

/**
 * Returns focus to a control that was unmounted by the panel it opened.
 *
 * THE PROBLEM THIS SOLVES. Several panels in this app *replace* their trigger rather than
 * appearing beside it - clicking "Decline" swaps the button row for the reason editor. When the
 * panel closes, the trigger comes back as a **new DOM node**, so the usual pattern of stashing
 * `document.activeElement` on open and calling `.focus()` on it at close does nothing: the node
 * it captured is no longer in the document. Focus is left on `<body>`, which sends a keyboard
 * user back to the top of the page and tells a screen reader user nothing about what happened.
 *
 * WHY A CALLBACK REF. React invokes a ref callback when the element mounts, which for a returning
 * trigger is exactly the moment it exists again. So instead of chasing the node, the close path
 * records *which* trigger should get focus and the trigger claims it on the way back in. No
 * effect, no timer, and nothing to keep in sync with the render.
 *
 * ONLY FOR DISMISSAL, NOT COMPLETION. Call `returnFocusTo` when the user backs out of a panel -
 * there the right target is unambiguous, it is the control they opened it with. After an action
 * that *succeeds* the surrounding UI has usually changed shape (a booking moves status and its
 * whole action row is replaced), so the original trigger is gone for good and the correct target
 * is a design question rather than a mechanical one. Those paths are deliberately left alone.
 *
 * Keys are per-panel, not per-element: only one panel is open at a time, so several buttons in
 * mutually exclusive branches may safely register the same key.
 */
function useFocusReturn<Key extends string>() {
  /** The panel whose trigger is owed focus, set at close and consumed on the way back in. */
  const pending = useRef<Key | null>(null);

  /**
   * One stable callback per key.
   *
   * Cached because a fresh function identity on every render makes React detach and reattach the
   * ref each time - harmless here, but it would mean the callback fires constantly rather than
   * only when the element actually mounts, which is the signal being relied on.
   */
  const callbacks = useRef(new Map<Key, (node: HTMLElement | null) => void>());

  const registerTrigger = useCallback((key: Key) => {
    const existing = callbacks.current.get(key);

    if (existing) {
      return existing;
    }

    const callback = (node: HTMLElement | null) => {
      // `node` is null on unmount, which is the panel opening - nothing to do. A node with no
      // pending claim is an ordinary render, and must not steal focus from wherever it is.
      if (node && pending.current === key) {
        pending.current = null;
        node.focus();
      }
    };

    callbacks.current.set(key, callback);

    return callback;
  }, []);

  const returnFocusTo = useCallback((key: Key) => {
    pending.current = key;
  }, []);

  return { registerTrigger, returnFocusTo };
}

export { useFocusReturn };
