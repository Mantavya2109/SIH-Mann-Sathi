import React, { useEffect, useState } from 'react';

export const CursorSpotlight: React.FC = () => {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseLeave = () => setIsVisible(false);

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div 
      className="fixed pointer-events-none z-50 rounded-full transition-opacity duration-500 ease-out"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '160px',
        height: '160px',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(circle, rgba(167, 243, 208, 0.12) 0%, rgba(226, 239, 233, 0) 45%)',
      }}
    />
  );
};