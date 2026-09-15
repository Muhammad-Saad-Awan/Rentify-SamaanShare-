"use client";

import { useEffect, useRef } from "react";

/**
 * Moves focus onto an element when it mounts.
 *
 * For a panel that opens in place of its trigger: the trigger has just been unmounted, so
 * without this the browser drops focus to `<body>` and the person who opened the panel is
 * standing outside it, with no announcement that it appeared.
 *
 * TARGET THE CONTAINER, NOT THE FIRST FIELD, when the first field is a choice the form must not
 * make for the user. The handover form's condition radios are the case that matters: focusing
 * the first radio would preselect nothing visually but would put the user inside a group where
 * an arrow key immediately commits an answer, and that record is unamendable evidence. Give the
 * container `tabIndex={-1}` and an accessible name instead, and the panel announces itself
 * without answering itself.
 *
 * Where the first control is a plain text field, React's own `autoFocus` prop does this and no
 * hook is needed.
 */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return ref;
}

export { useFocusOnMount };
