'use client';

import { useState } from 'react';
import RightPanel from './RightPanel';

export default function AppShell({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId:   string | null;
}) {
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <div className="content">
      {/* Main content column */}
      <div className="chat-col">
        {children}
      </div>

      {/* Collapse toggle — sits at the seam between content and panel */}
      <button
        className="panel-collapse-btn"
        onClick={() => setPanelOpen(o => !o)}
        title={panelOpen ? 'Collapse panel' : 'Expand panel'}
        aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'}
      >
        {panelOpen ? (
          /* chevron right — collapse */
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        ) : (
          /* chevron left — expand */
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        )}
      </button>

      {/* Right panel */}
      <RightPanel userId={userId} open={panelOpen} />
    </div>
  );
}
