"use client";

import { useEffect, useRef } from "react";

const chars = "WorkBeeTeam01";

export function InteractiveDigits() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.closest(".hero");
    if (!canvas || !hero) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0, angle = 0, speed = .00055, targetSpeed = .00055, zoom = 1, targetZoom = 1, width = 0, height = 0, last = performance.now();
    const points = Array.from({ length: 600 }, (_, i) => ({
      phase: i * .51,
      radius: .045 + (i % 70) / 88,
      yScale: .34 + (i % 9) * .018,
      alpha: .13 + (i % 7) * .045,
      size: 8 + (i % 4),
    }));
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      width = rect.width; height = rect.height;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const slow = () => { targetSpeed = .00016; targetZoom = 1.34; };
    const normal = () => { targetSpeed = .00055; targetZoom = 1; };
    hero.addEventListener("pointerenter", slow); hero.addEventListener("pointerleave", normal);
    const draw = (now: number) => {
      const dt = Math.min(now - last, 32); last = now;
      speed += (targetSpeed - speed) * .045;
      zoom += (targetZoom - zoom) * .035;
      angle += speed * dt;
      ctx.clearRect(0, 0, width, height);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const maxRadius = Math.max(width, height) * .72;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const a = p.phase + angle * (1 + p.radius * .25);
        const r = p.radius * maxRadius * zoom;
        const pulse = 1 + Math.sin(now * .0012 + i) * .035;
        const x = width * .5 + Math.cos(a) * r * pulse;
        const y = height * .35 + Math.sin(a) * r * p.yScale;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = i % 5 === 0 ? "#6161D1" : "#1313BA";
        ctx.font = `500 ${p.size}px Arial`;
        const char = chars[(i + Math.floor(now / 520) + (i % 5)) % chars.length];
        if (char !== " ") ctx.fillText(char, x, y);
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); hero.removeEventListener("pointerenter", slow); hero.removeEventListener("pointerleave", normal); };
  }, []);

  return <canvas ref={canvasRef} className="digit-canvas" aria-hidden="true" />;
}
