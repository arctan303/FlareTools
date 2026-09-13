import { useEffect, useState, useRef } from 'react';

export default function MouseHalo() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const rafRef = useRef(null);

  useEffect(() => {
    // Only enable on devices with a fine pointer (like a mouse)
    const isFinePointer = window.matchMedia('(pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (!isFinePointer || prefersReducedMotion) return;

    const handleMouseMove = (e) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setPosition({ x: e.clientX, y: e.clientY });
        if (!active) setActive(true);
      });
    };

    const handleMouseLeave = () => setActive(false);
    const handleMouseEnter = () => setActive(true);
    
    // Hide when page is not visible
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setActive(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [active]);

  // Using inline styles for dynamic transform and complex radial gradient
  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 hidden overflow-hidden sm:block"
      aria-hidden="true"
    >
      <div
        className="absolute rounded-full will-change-transform"
        style={{
          width: '160px',
          height: '160px',
          left: '-80px',
          top: '-80px',
          transform: `translate(${position.x}px, ${position.y}px)`,
          opacity: active ? 0.76 : 0,
          transition: 'opacity 360ms ease, transform 120ms ease-out',
          background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 18%, transparent) 0%, color-mix(in srgb, var(--accent) 7%, transparent) 38%, transparent 72%)',
        }}
      />
    </div>
  );
}
