import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const TenantStepUpAuth = ({ isOpen, onClose, onSuccess }: Props) => {
  const [totp, setTotp] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);

  const verify = async () => {
    if (!totp && !recoveryCode) {
      toast({ title: 'Error', description: 'Enter code or recovery code', variant: 'destructive' });
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/auth/2fa/reauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(useRecovery ? { recoveryCode } : { totp }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Verification failed');
      }
      onSuccess();
      handleClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Verification failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTotp('');
    setRecoveryCode('');
    setUseRecovery(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Verify Your Identity</CardTitle>
          <p className="text-sm text-muted-foreground">Recent 2FA verification required.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>This action requires additional verification.</AlertDescription>
          </Alert>

          {!useRecovery ? (
            <div className="space-y-2">
              <Label htmlFor="totp">Authenticator Code</Label>
              <Input id="totp" value={totp} onChange={(e) => setTotp(e.target.value)} maxLength={6} />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="recovery">Recovery Code</Label>
              <Input id="recovery" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} />
            </div>
          )}

          <div className="text-center">
            <Button variant="link" size="sm" onClick={() => { setUseRecovery(!useRecovery); setTotp(''); setRecoveryCode(''); }}>
              {useRecovery ? 'Use authenticator code' : 'Use recovery code'}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
              Cancel
            </Button>
            <Button onClick={verify} disabled={loading || (!totp && !recoveryCode)} className="flex-1">
              {loading ? 'Verifying...' : 'Verify'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
