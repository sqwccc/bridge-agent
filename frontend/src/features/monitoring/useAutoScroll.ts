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
    let wrapAt = 0;
    let fade: Animation | undefined;
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
        if (wrapAt) {
          fade?.cancel();
          wrapAt = 0;
        }
      } else {
        if (wasPaused) {
          waitUntil = 0;
          wasPaused = false;
        }
        const bottom = el.scrollHeight - el.clientHeight;
        if (bottom > 1 && now >= waitUntil) {
          if (wrapAt && now >= wrapAt) {
            // Reset while invisible, then reveal the start; never scroll backwards.
            el.scrollTop = 0;
            fade?.cancel();
            fade = el.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: 350,
            });
            wrapAt = 0;
            remainder = 0;
          } else if (!wrapAt && el.scrollTop >= bottom - 1) {
            fade = el.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 350,
              fill: "forwards",
            });
            wrapAt = now + 350;
          } else if (!wrapAt) {
            const distance = Math.min(el.scrollTop, bottom - el.scrollTop);
            const speed = 18 * Math.max(0.35, Math.min(1, distance / 60));
            remainder += (elapsed * speed) / 1000;
            const pixels = Math.floor(remainder);
            el.scrollTop += pixels;
            remainder -= pixels;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      fade?.cancel();
    };
  }, [enabled, ready]);
  return { element, interaction };
}
