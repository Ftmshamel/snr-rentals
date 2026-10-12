import { useEffect, useRef } from "react";

// Adds .is-visible to any child element carrying .reveal when it scrolls
// into view, so CSS can animate it in. Elements animate once, then unobserve.
//
// `rescanKey`: pass something that changes when the children change (e.g. the
// number of cameras once the catalogue loads). Content rendered after mount is
// otherwise never observed and stays invisible.
export default function useReveal(rescanKey) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = (
      root.classList.contains("reveal")
        ? [root]
        : Array.from(root.querySelectorAll(".reveal"))
    ).filter((el) => !el.classList.contains("is-visible"));

    if (!("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rescanKey]);

  return ref;
}
