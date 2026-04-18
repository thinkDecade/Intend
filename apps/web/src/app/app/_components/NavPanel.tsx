'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavPanelProps {
  theme:    'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}

const NAV_ITEMS = [
  {
    href: '/app',
    label: 'INTEND',
    exact: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    href: '/app/goals',
    label: 'PORTFOLIO',
    exact: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
        <path d="M22 12A10 10 0 0 0 12 2v10z"/>
      </svg>
    ),
  },
  {
    href: '/app/history',
    label: 'HISTORY',
    exact: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function SmartphoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

export default function NavPanel({ theme, setTheme }: NavPanelProps) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <nav className="app-nav">
      {/* Header row — logo + theme toggle */}
      <div className="app-nav-header">
        <div className="app-nav-logo-row">
          <div className="app-nav-logo-mark">i</div>
          <span className="app-nav-logo-text">INTEND</span>
        </div>
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="app-nav-theme-btn"
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>

      {/* Nav items */}
      <div className="app-nav-items">
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-nav-item${active ? ' app-nav-item--active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Bottom section */}
      <div className="app-nav-bottom">
        {/* Channel Integration box */}
        <div className="app-nav-channel-box">
          <p className="app-nav-channel-label">Channel Integration</p>
          <div className="app-nav-channel-btns">
            <a
              href="https://t.me/intend_auto_bot"
              target="_blank"
              rel="noreferrer"
              className="app-nav-channel-btn app-nav-channel-btn--active"
            >
              <span>TELEGRAM</span>
              <SmartphoneIcon />
            </a>
            <button
              className="app-nav-channel-btn app-nav-channel-btn--disabled"
              disabled
            >
              <span>WHATSAPP</span>
              <span className="app-nav-soon">soon</span>
            </button>
          </div>
        </div>

        {/* Settings link */}
        <Link
          href="/app/settings"
          className={`app-nav-settings-link${pathname.startsWith('/app/settings') ? ' app-nav-item--active' : ''}`}
        >
          <span>System Settings</span>
          <span className="app-nav-settings-icon"><SettingsIcon /></span>
        </Link>
      </div>
    </nav>
  );
}
