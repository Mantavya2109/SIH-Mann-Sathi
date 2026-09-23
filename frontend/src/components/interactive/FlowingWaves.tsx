import React, { useEffect, useRef } from 'react';

export const FlowingWaves: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let step = 0;

    const render = () => {
      step += 0.015;
      const w = canvas.width = canvas.parentElement?.clientWidth || 300;
      const h = canvas.height = canvas.parentElement?.clientHeight || 120;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';

      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 10) {
          const y = Math.sin(x * 0.008 + step + i) * 8 + h * (0.5 + i * 0.12);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none rounded-3xl"
    />
  );
};