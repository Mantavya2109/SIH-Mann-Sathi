import React, { useEffect, useState } from 'react';

export const AnimatedAurora: React.FC = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const x = (clientX / window.innerWidth - 0.5) * 30;
      const y = (clientY / window.innerHeight - 0.5) * 30;
      setMousePos({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#EEF8F3]">
      {/* Aurora Layer 1 - Soft Mint */}
      <div 
        className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-[#B8E8D5]/50 blur-[120px] animate-pulse transition-transform duration-700 ease-out"
        style={{
          transform: `translate(${mousePos.x * 1.2}px, ${mousePos.y * 1.2}px)`
        }}
      />

      {/* Aurora Layer 2 - Sage Soft */}
      <div 
        className="absolute -bottom-[20%] -right-[10%] w-[65%] h-[65%] rounded-full bg-[#D9F1E5]/60 blur-[140px] transition-transform duration-1000 ease-out"
        style={{
          transform: `translate(${-mousePos.x * 1.5}px, ${-mousePos.y * 1.5}px)`
        }}
      />

      {/* Aurora Layer 3 - Warm Highlight Corner */}
      <div 
        className="absolute top-[30%] right-[15%] w-[40%] h-[40%] rounded-full bg-[#F5E7B8]/30 blur-[100px] transition-transform duration-500 ease-out"
        style={{
          transform: `translate(${mousePos.x * 0.8}px, ${mousePos.y * 0.8}px)`
        }}
      />
    </div>
  );
};