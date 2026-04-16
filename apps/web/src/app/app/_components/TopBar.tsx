export default function TopBar({
  greeting,
  initials,
}: {
  greeting: string;
  initials: string;
}) {
  return (
    <header className="topbar">
      <span className="topbar-title">{greeting}</span>
      <div className="topbar-actions">
        <div className="topbar-pill">
          <div className="status-dot" />
          <span>Live</span>
        </div>
        <div className="avatar">{initials}</div>
      </div>
    </header>
  );
}
