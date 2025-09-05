import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

export default function OAuth2fa() {
  const navigate = useNavigate();
  const { completeTenantOAuth } = useAuth();
  const { completeOAuthLogin } = usePlatformAuth();
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const platformProvider = sessionStorage.getItem('platform_oauth_provider');
  const tenantProvider = sessionStorage.getItem('tenant_oauth_provider');
  const isPlatform = !!platformProvider;
  const provider = platformProvider || tenantProvider;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!provider) {
      setError('Missing OAuth provider. Please restart the login process.');
      return;
    }
    try {
      setIsLoading(true);
      if (isPlatform) {
        await completeOAuthLogin(provider, useRecovery ? '' : code, useRecovery ? recoveryCode : undefined);
        navigate('/platform');
      } else {
        if (!completeTenantOAuth) {
          throw new Error('OAuth handler unavailable');
        }
        await completeTenantOAuth(provider, useRecovery ? { recoveryCode } : { totp: code });
        sessionStorage.removeItem('tenant_oauth_provider');
        navigate('/');
      }
    } catch (err: any) {
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        setError('Please verify your email before signing in.');
      } else {
        setError(err.message || 'Verification failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {useRecovery ? (
              <div className="space-y-2">
                <Label htmlFor="recovery">Recovery Code</Label>
                <Input
                  id="recovery"
                  value={recoveryCode}
                  onChange={e => setRecoveryCode(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="code">Authentication Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  disabled={isLoading}
                />
              </div>
            )}
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  setUseRecovery(!useRecovery);
                  setCode('');
                  setRecoveryCode('');
                }}
              >
                {useRecovery ? 'Use authenticator code' : 'Use recovery code'}
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading || (!useRecovery && !code) || (useRecovery && !recoveryCode)
              }
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verify
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}