import { useEffect, useState } from 'react';

export function NetworkStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const handle = () => setOnline(navigator.onLine);
    window.addEventListener('online', handle);
    window.addEventListener('offline', handle);
    return () => {
      window.removeEventListener('online', handle);
      window.removeEventListener('offline', handle);
    };
  }, []);

  if (online) return null;
  return (
    <div className="mb-4 rounded-lg border border-warning bg-warning/10 px-3 py-2 text-sm text-warning">
      Offline: actions and photos will sync when the connection returns.
    </div>
  );
}
