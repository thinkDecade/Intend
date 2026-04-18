/**
 * Preview route — renders the full app shell with mock data.
 * Used for visual QA only. No auth required.
 * DELETE before shipping to production.
 */

'use client';

import { useState } from 'react';
import NavPanel from '../app/_components/NavPanel';
import ChatPanel from '../app/_components/ChatPanel';

export default function PreviewPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  return (
    <>
      <div className="ambient" />
      <div className="app-shell-outer">
        <NavPanel theme={theme} setTheme={setTheme} />
        <main className="app-shell-main">
          <ChatPanel userId={null} />
        </main>
      </div>
    </>
  );
}
