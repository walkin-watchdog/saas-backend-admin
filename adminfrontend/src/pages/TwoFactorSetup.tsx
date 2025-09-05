import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export const TwoFactorSetup = () => {
  const { token } = useAuth();
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  if (!token) return <Navigate to="/login" replace />;

  const startSetup = async () => {
    setError('');
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start setup');
      }
      const data = await res.json();
      setSecret(data.secret);
      setQr(data.qr);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const verify = async () => {
    setError('');
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: tokenInput }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Verification failed');
      }
      const data = await res.json();
      setRecoveryCodes(data.recoveryCodes || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      {!secret ? (
        <div className="space-y-2">
          <h1 className="text-xl font-bold">Enable Two-Factor Authentication</h1>
          {error && <p className="text-red-600">{error}</p>}
          <input
            type="password"
            placeholder="Confirm password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 w-full"
          />
          <button onClick={startSetup} className="bg-blue-600 text-white px-4 py-2 rounded">
            Continue
          </button>
        </div>
      ) : !recoveryCodes ? (
        <div className="space-y-2">
          <p>Scan the QR code with your authenticator app and enter the code below.</p>
          {qr && <img src={qr} alt="QR" className="mx-auto" />}
          <p className="text-sm break-all">Secret: {secret}</p>
          <input
            type="text"
            placeholder="Authenticator code"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="border p-2 w-full"
          />
          {error && <p className="text-red-600">{error}</p>}
          <button onClick={verify} className="bg-blue-600 text-white px-4 py-2 rounded">
            Verify
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="font-bold">Recovery Codes</h2>
          <ul className="list-disc ml-6">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
