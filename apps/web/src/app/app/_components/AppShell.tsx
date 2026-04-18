'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import NavPanel from './NavPanel';
import RealityPanel from './RightPanel';

export default function AppShell({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId:   string | null;
}) {
  const [showReality, setShowReality] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Initialise theme from localStorage / prefers-color-scheme
  useEffect(() => {
    const saved = localStorage.getItem('intend-theme');
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  // Apply theme class to <html>
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('intend-theme', theme);
  }, [theme]);

  // Mouse edge detection — show reality panel on right edge hover
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX >= window.innerWidth - 10 && !showReality) {
        setShowReality(true);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [showReality]);

  return (
    <div className="app-shell-outer">
      {/* Left sidebar */}
      <NavPanel theme={theme} setTheme={setTheme} />

      {/* Center main */}
      <main className="app-shell-main">
        {children}
      </main>

      {/* Right reality panel — slide in/out */}
      <AnimatePresence>
        {showReality && (
          <motion.div
            key="reality-panel"
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            className="app-shell-right"
          >
            <RealityPanel userId={userId} open={true} onDismiss={() => setShowReality(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
