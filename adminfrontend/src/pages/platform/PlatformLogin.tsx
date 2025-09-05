import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield } from 'lucide-react';
import { oauthApi } from '@/api/platform/oauth';

export default function PlatformLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { platformLogin, requiresMfa } = usePlatformAuth();
  const navigate = useNavigate();
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);

  useEffect(() => {
    oauthApi
      .getProviders()
      .then(providers => setOauthProviders(providers))
      .catch(() => setOauthProviders([]));
  }, []);

  const handleOAuthLogin = (provider: string) => {
    sessionStorage.setItem('platform_oauth_provider', provider);
    oauthApi.authorize(provider);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await platformLogin(email, password, mfaCode);
      navigate('/platform');
    } catch (err: any) {
      const message =
        err.message === 'MFA_REQUIRED'
          ? 'Please enter your MFA code to continue'
          : err.message || 'Login failed. Please check your credentials.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 justify-center">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Platform Admin</h1>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Sign in to access the platform administration dashboard
          </p>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                placeholder="admin@company.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                placeholder="••••••••"
              />
            </div>
            
            {requiresMfa && (
              <div className="space-y-2">
                <Label htmlFor="mfaCode">MFA Code</Label>
                <Input
                  id="mfaCode"
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
            )}
          </CardContent>
          
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </CardFooter>
        </form>

        {oauthProviders.length > 0 && (
          <div className="px-6 pb-6">
            <div className="mt-4 border-t pt-4 space-y-2">
              {oauthProviders.map(provider => (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOAuthLogin(provider)}
                  disabled={isLoading}
                >
                  Sign in with {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}