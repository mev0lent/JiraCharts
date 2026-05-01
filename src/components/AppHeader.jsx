export function AppHeader({ title, children }) {
  return (
    <header>
      <h1>{title}</h1>
      <div className="header-meta">
        {children}
      </div>
    </header>
  );
}
