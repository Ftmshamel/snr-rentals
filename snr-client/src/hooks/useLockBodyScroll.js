import { useEffect } from "react";

// Locks page scrolling while a modal/lightbox is open, so the only
// visible scrollbar is the modal's own.
export default function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
