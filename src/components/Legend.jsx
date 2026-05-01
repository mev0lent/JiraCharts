export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map(item => (
        <span key={item.label}>
          <span className="legend-dot" style={item.style} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
