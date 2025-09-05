import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader } from 'lucide-react';

export function Impersonate() {
  const { token } = useParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/impersonate/${token}`,
          { credentials: 'include' }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Impersonation failed');
        }
        const data = await res.json();
        sessionStorage.setItem('admin_token', data.access);
        if (data.csrfToken) sessionStorage.setItem('csrf_token', data.csrfToken);
        if (!cancelled) {
          window.location.href = '/';
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Impersonation failed');
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return <div className="p-4 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <Loader className="h-6 w-6 animate-spin" />
    </div>
  );
}