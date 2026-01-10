import React, { useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
  age: number;
}

export const DrawingCursor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const requestRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const newPoint = { x: e.clientX, y: e.clientY, age: 0 };
      
      const lastPoint = pointsRef.current[pointsRef.current.length - 1];
      
      if (lastPoint) {
        const dx = newPoint.x - lastPoint.x;
        const dy = newPoint.y - lastPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Add more points for smoother line
        const steps = Math.max(Math.floor(distance / 2), 1); // 1 point every 2 pixels
        
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          pointsRef.current.push({
            x: lastPoint.x + dx * t,
            y: lastPoint.y + dy * t,
            age: 0
          });
        }
      }
      
      pointsRef.current.push(newPoint);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    handleResize();

    const animate = () => {
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update points
      pointsRef.current = pointsRef.current
        .map(p => ({ ...p, age: p.age + 1 }))
        .filter(p => p.age < 50);

      // Draw path
      if (pointsRef.current.length > 1) {
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        for (let i = 0; i < pointsRef.current.length - 1; i++) {
          const p1 = pointsRef.current[i];
          const p2 = pointsRef.current[i + 1];
          
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          
          // Fade out based on age
          const opacity = 1 - p1.age / 50;
          ctx.strokeStyle = `rgba(16, 185, 129, ${opacity})`; // Emerald color
          ctx.lineWidth = (1 - p1.age / 50) * 3; // Tapering width
          ctx.stroke();
        }
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none z-[100]"
    />
  );
};
