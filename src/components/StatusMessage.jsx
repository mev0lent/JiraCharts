export function StatusMessage({ message, type = 'info' }) {
  return (
    <div id="status" className={type} style={{ display: message ? 'block' : 'none' }}>
      {message}
    </div>
  );
}
