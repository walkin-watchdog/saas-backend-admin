import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle } from 'lucide-react';
import { totpApi } from '@/api/platform/totp';
import { toast } from '@/hooks/use-toast';

interface StepUpAuthProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

export function StepUpAuth({ 
  isOpen, 
  onClose, 
  onSuccess, 
  title = "Verify Your Identity",
  description = "This action requires additional verification. Please enter your 2FA code."
}: StepUpAuthProps) {
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const handleVerify = async () => {
    if (!totpCode && !recoveryCode) {
      toast({ 
        title: 'Error', 
        description: 'Please enter either a TOTP code or recovery code', 
        variant: 'destructive' 
      });
      return;
    }

    try {
      setIsVerifying(true);
      const payload = totpCode
        ? { totp: totpCode, ...(recoveryCode ? { recoveryCode } : {}) }
        : { recoveryCode };
      await totpApi.reauth(payload);
      
      toast({
        title: 'Success',
        description: 'Verification successful',
      });
      
      onSuccess();
      handleClose();
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Verification failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    setTotpCode('');
    setRecoveryCode('');
    setUseRecoveryCode(false);
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
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              For security reasons, this action requires recent 2FA verification.
            </AlertDescription>
          </Alert>

          {!useRecoveryCode ? (
            <div className="space-y-2">
              <Label htmlFor="totp-code">Authenticator Code</Label>
              <Input
                id="totp-code"
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="Enter 6-digit code"
                maxLength={6}
                autoFocus
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="recovery-code">Recovery Code</Label>
              <Input
                id="recovery-code"
                type="text"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="Enter recovery code"
                maxLength={8}
                autoFocus
              />
            </div>
          )}

          <div className="text-center">
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setUseRecoveryCode(!useRecoveryCode);
                setTotpCode('');
                setRecoveryCode('');
              }}
            >
              {useRecoveryCode ? 'Use authenticator code instead' : 'Use recovery code instead'}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isVerifying}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerify}
              disabled={isVerifying || (!totpCode && !recoveryCode)}
              className="flex-1"
            >
              {isVerifying ? 'Verifying...' : 'Verify'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}