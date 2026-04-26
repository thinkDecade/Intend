'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import NavPanel from './NavPanel';
import RightPanel, { SignalsContent, MOBILE_SIGNALS } from './RightPanel';

export default function AppShell({
  children,
  userId,
  displayName,
  isOnboarding,
}: {
  children:     React.ReactNode;
  userId:       string | null;
  displayName:  string | null;
  isOnboarding: boolean;
}) {
  const [panelOpen, setPanelOpen]   = useState(isOnboarding);
  const [panelPeek, setPanelPeek]   = useState(false);
  const panelOpenRef = useRef(isOnboarding);
  useEffect(() => { panelOpenRef.current = panelOpen; }, [panelOpen]);
  const [theme, setTheme]           = useState<'light' | 'dark'>('light');
  const [mobileDrawer, setMobileDrawer] = useState<null | 'nav' | 'reality'>(null);
  const [isMobile, setIsMobile]     = useState(false);

  // Track viewport width so we can short-circuit desktop-only behaviour on mobile
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Initialise theme from localStorage — light is the default for everyone
  useEffect(() => {
    const saved = localStorage.getItem('intend-theme');
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
    }
  }, []);

  // Apply theme class to <html>
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('intend-theme', theme);
  }, [theme]);

  const handlePanelOpen      = useCallback(() => { setPanelOpen(true); setPanelPeek(false); }, []);
  const handlePanelDismiss   = useCallback(() => { setPanelOpen(false); setPanelPeek(false); }, []);
  const handlePanelPeekEnd   = useCallback(() => setPanelPeek(false), []);
  const handleNewSignal      = useCallback(() => {
    if (!panelOpenRef.current) {
      setPanelOpen(true);
      setPanelPeek(true);
    }
  }, []);

  // Pre-warm the wallet so the first chat reply already knows the address.
  // Fire-and-forget — never blocks the render. The /api/wallet/ensure endpoint
  // is idempotent and short-circuits if a wallet already exists.
  useEffect(() => {
    if (!userId) return;
    fetch('/api/wallet/ensure', { method: 'POST' }).catch(() => { /* non-fatal */ });
  }, [userId]);

  // Close drawer on Escape
  useEffect(() => {
    if (!mobileDrawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileDrawer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileDrawer]);

  return (
    <div className={`app-shell-outer${panelOpen && !isMobile ? ' signals-open' : ''}`}>
      {/* Mobile top bar — only visible on small screens */}
      <header className="app-mobile-bar" aria-hidden={!isMobile}>
        <button
          className="app-mobile-hamburger"
          onClick={() => setMobileDrawer('nav')}
          aria-label="Open navigation"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6"  x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="app-mobile-brand">
          <div className="app-mobile-mark">i</div>
          <span>INTEND</span>
        </div>
        <button
          className="app-mobile-reality"
          onClick={() => setMobileDrawer('reality')}
          aria-label="Open economic reality"
          title="Economic reality"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
          </svg>
        </button>
      </header>

      {/* Left sidebar (desktop) */}
      <NavPanel theme={theme} setTheme={setTheme} />

      {/* Center main */}
      <main className="app-shell-main">
        {children}
      </main>

      {/* Right intelligence panel (desktop) — CSS transition + hotzone */}
      {!isMobile && (
        <RightPanel
          open={panelOpen}
          peek={panelPeek}
          onOpen={handlePanelOpen}
          onDismiss={handlePanelDismiss}
          onPeekEnd={handlePanelPeekEnd}
          onNewSignal={handleNewSignal}
        />
      )}

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {mobileDrawer && (
          <>
            <motion.div
              key="drawer-scrim"
              className="app-drawer-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileDrawer(null)}
            />
            <motion.aside
              key="drawer-panel"
              className={`app-drawer app-drawer--${mobileDrawer}`}
              initial={{ x: mobileDrawer === 'nav' ? -340 : 340, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: mobileDrawer === 'nav' ? -340 : 340, opacity: 0 }}
              transition={{ type: 'spring', damping: 32, stiffness: 240 }}
            >
              <button
                className="app-drawer-close"
                onClick={() => setMobileDrawer(null)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6"  x2="6"  y2="18"/>
                  <line x1="6"  y1="6"  x2="18" y2="18"/>
                </svg>
              </button>
              {mobileDrawer === 'nav' ? (
                <div className="app-drawer-content app-drawer-content--nav">
                  <NavPanel theme={theme} setTheme={setTheme} />
                </div>
              ) : (
                <div className="app-drawer-content app-drawer-content--reality" style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
                  <SignalsContent signals={MOBILE_SIGNALS} onDismiss={() => setMobileDrawer(null)} />
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
