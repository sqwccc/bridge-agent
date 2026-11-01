import { useEffect, useRef, useState } from "react";

export function useAutoScroll(ready: boolean) {
  const element = useRef<HTMLDivElement>(null);
  const interaction = useRef({ hover: false, focus: false, resumeAt: 0 });
  const [enabled, setEnabled] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (!enabled || !ready) return;
    let frame = 0;
    let previous = performance.now();
    let waitUntil = previous + 1800;
    let bottomSince = 0;
    let remainder = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 100);
      previous = now;
      const el = element.current;
      const paused = interaction.current;
      if (
        !el ||
        document.hidden ||
        paused.hover ||
        paused.focus ||
        now < paused.resumeAt ||
        now < waitUntil
      ) {
        bottomSince = 0;
      } else {
        const bottom = el.scrollHeight - el.clientHeight;
        if (bottom > 1 && el.scrollTop >= bottom - 1) {
          bottomSince ||= now;
          if (now - bottomSince >= 2000) {
            el.scrollTop = 0;
            bottomSince = 0;
            remainder = 0;
            waitUntil = now + 1800;
          }
        } else if (bottom > 1) {
          bottomSince = 0;
          remainder += (elapsed * 24) / 1000;
          const pixels = Math.floor(remainder);
          el.scrollTop += pixels;
          remainder -= pixels;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, ready]);
  return { element, interaction, enabled, setEnabled };
}
