import { useEffect, useRef, useState } from "react";

export function useAutoScroll(ready: boolean) {
  const element = useRef<HTMLDivElement>(null);
  const interaction = useRef({ hover: false, focus: false, resumeAt: 0 });
  const [enabled] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (!enabled || !ready) return;
    let frame = 0;
    let previous = performance.now();
    let waitUntil = previous + 1800;
    let direction = 1;
    let wasPaused = false;
    let remainder = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 100);
      previous = now;
      const el = element.current;
      const paused = interaction.current;
      const blocked =
        !el ||
        document.hidden ||
        paused.hover ||
        paused.focus ||
        now < paused.resumeAt;
      if (blocked) {
        wasPaused = true;
      } else {
        if (wasPaused) {
          waitUntil = 0;
          wasPaused = false;
        }
        const bottom = el.scrollHeight - el.clientHeight;
        if (bottom > 1 && now >= waitUntil) {
          if (
            (direction > 0 && el.scrollTop >= bottom - 1) ||
            (direction < 0 && el.scrollTop <= 1)
          ) {
            direction *= -1;
            remainder = 0;
          }
          // Ease near both ends and reverse in place instead of jumping to the top.
          const distance = Math.min(el.scrollTop, bottom - el.scrollTop);
          const speed = 12 * Math.max(0.35, Math.min(1, distance / 60));
          remainder += (elapsed * speed) / 1000;
          const pixels = Math.floor(remainder);
          el.scrollTop += direction * pixels;
          remainder -= pixels;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, ready]);
  return { element, interaction };
}
