import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { 
  Shield, 
  Key, 
  Eye, 
  EyeOff, 
  Copy, 
  AlertTriangle, 
  CheckCircle,
  Download,
  Smartphone
} from 'lucide-react';
import { totpApi } from '@/api/platform/totp';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import { toast } from '@/hooks/use-toast';

export default function PlatformMfaSettings() {
  const { platformUser, refreshPlatformUser } = usePlatformAuth();
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [showRecoveryCodesModal, setShowRecoveryCodesModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  const [setupData, setSetupData] = useState({
    password: '',
    qrCodeUrl: '',
    secret: '',
    verificationCode: ''
  });
  
  const [disableData, setDisableData] = useState({
    password: '',
    totp: '',
    recoveryCode: ''
  });
  
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [setupStep, setSetupStep] = useState<'password' | 'verify' | 'codes'>('password');

  const isMfaEnabled = platformUser?.mfaEnabled || false;

  const handleSetupStart = async () => {
    if (!setupData.password) {
      toast({ title: 'Error', description: 'Please enter your password', variant: 'destructive' });
      return;
    }

    try {
      setIsProcessing(true);
      const response = await totpApi.setup({ password: setupData.password });
      
      setSetupData(prev => ({
        ...prev,
        qrCodeUrl: response.qr,
        secret: response.secret
      }));
      
      setSetupStep('verify');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to setup 2FA';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetupComplete = async () => {
    if (!setupData.verificationCode) {
      toast({ title: 'Error', description: 'Please enter the verification code', variant: 'destructive' });
      return;
    }

    try {
      setIsProcessing(true);
      const response = await totpApi.enable({ totp: setupData.verificationCode });
      
      setRecoveryCodes(response.recoveryCodes);
      setSetupStep('codes');
      
      // Refresh user data to update MFA status
      await refreshPlatformUser();
      
      toast({
        title: 'Success',
        description: '2FA has been enabled successfully',
      });
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to enable 2FA';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disableData.password) {
      toast({ title: 'Error', description: 'Please enter your password', variant: 'destructive' });
      return;
    }

    if (!disableData.totp && !disableData.recoveryCode) {
      toast({ title: 'Error', description: 'Please enter either a TOTP code or recovery code', variant: 'destructive' });
      return;
    }

    try {
      setIsProcessing(true);
      const payload = disableData.totp
        ? {
            password: disableData.password,
            totp: disableData.totp,
            ...(disableData.recoveryCode ? { recoveryCode: disableData.recoveryCode } : {}),
          }
        : {
            password: disableData.password,
            recoveryCode: disableData.recoveryCode!,
          };
      await totpApi.disable(payload);
      
      setIsDisableModalOpen(false);
      setDisableData({ password: '', totp: '', recoveryCode: '' });
      
      // Refresh user data to update MFA status
      await refreshPlatformUser();
      
      toast({
        title: 'Success',
        description: '2FA has been disabled successfully',
      });
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to disable 2FA';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Success', description: 'Copied to clipboard' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to copy to clipboard', variant: 'destructive' });
    }
  };

  const downloadRecoveryCodes = () => {
    const content = recoveryCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'platform-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetSetupModal = () => {
    setIsSetupModalOpen(false);
    setSetupData({ password: '', qrCodeUrl: '', secret: '', verificationCode: '' });
    setSetupStep('password');
  };

  const finishSetup = () => {
    setShowRecoveryCodesModal(false);
    resetSetupModal();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Multi-Factor Authentication</h1>
        <p className="text-muted-foreground">
          Secure your account with two-factor authentication
        </p>
      </div>

      {/* Current MFA Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isMfaEnabled ? 'bg-green-100' : 'bg-yellow-100'
              }`}>
                {isMfaEnabled ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                )}
              </div>
              <div>
                <h3 className="font-medium">
                  Two-Factor Authentication {isMfaEnabled ? 'Enabled' : 'Disabled'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isMfaEnabled 
                    ? 'Your account is protected with 2FA'
                    : 'Enable 2FA to add an extra layer of security'
                  }
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {isMfaEnabled ? (
                <Button
                  variant="destructive"
                  onClick={() => setIsDisableModalOpen(true)}
                >
                  <Key className="h-4 w-4 mr-2" />
                  Disable 2FA
                </Button>
              ) : (
                <Button
                  onClick={() => setIsSetupModalOpen(true)}
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Enable 2FA
                </Button>
              )}
            </div>
          </div>

          {isMfaEnabled && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Two-factor authentication is active. You'll need your authenticator app to sign in.
              </AlertDescription>
            </Alert>
          )}

          {!isMfaEnabled && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Your account is not protected by two-factor authentication. Enable 2FA to improve security.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Setup 2FA Modal */}
      <ModalWrapper
        isOpen={isSetupModalOpen}
        onClose={resetSetupModal}
        title="Enable Two-Factor Authentication"
        size="md"
      >
        <div className="space-y-6">
          {setupStep === 'password' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="setup-password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="setup-password"
                    type={showPassword ? 'text' : 'password'}
                    value={setupData.password}
                    onChange={(e) => setSetupData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter your current password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={resetSetupModal}>
                  Cancel
                </Button>
                <Button onClick={handleSetupStart} disabled={isProcessing || !setupData.password}>
                  {isProcessing ? 'Setting up...' : 'Continue'}
                </Button>
              </div>
            </div>
          )}

          {setupStep === 'verify' && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">Scan QR Code</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                
                {setupData.qrCodeUrl && (
                  <div className="flex justify-center mb-4">
                    <img 
                      src={setupData.qrCodeUrl} 
                      alt="2FA QR Code" 
                      className="border rounded-lg"
                    />
                  </div>
                )}

                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs font-medium mb-2">Manual Entry Secret:</p>
                  <div className="flex items-center gap-2 justify-center">
                    <code className="text-xs font-mono bg-background px-2 py-1 rounded">
                      {setupData.secret}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(setupData.secret)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="verification-code">Verification Code</Label>
                <Input
                  id="verification-code"
                  type="text"
                  value={setupData.verificationCode}
                  onChange={(e) => setSetupData(prev => ({ ...prev, verificationCode: e.target.value }))}
                  placeholder="Enter 6-digit code from your app"
                  maxLength={6}
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={resetSetupModal}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSetupComplete} 
                  disabled={isProcessing || !setupData.verificationCode}
                >
                  {isProcessing ? 'Verifying...' : 'Enable 2FA'}
                </Button>
              </div>
            </div>
          )}

          {setupStep === 'codes' && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">2FA Enabled Successfully!</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Save these recovery codes in a safe place. You can use them to access your account if you lose your authenticator device.
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <strong>Important:</strong> These recovery codes will only be shown once. 
                    Save them securely as they can be used to bypass 2FA.
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Recovery Codes</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(recoveryCodes.join('\n'))}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadRecoveryCodes}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map((code, index) => (
                    <div key={index} className="bg-muted p-2 rounded font-mono text-sm text-center">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={finishSetup}>
                  I've Saved My Recovery Codes
                </Button>
              </div>
            </div>
          )}
        </div>
      </ModalWrapper>

      {/* Disable 2FA Modal */}
      <ModalWrapper
        isOpen={isDisableModalOpen}
        onClose={() => {
          setIsDisableModalOpen(false);
          setDisableData({ password: '', totp: '', recoveryCode: '' });
        }}
        title="Disable Two-Factor Authentication"
        size="md"
      >
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Disabling 2FA will make your account less secure. Make sure you understand the risks.
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="disable-password">Current Password</Label>
            <div className="relative">
              <Input
                id="disable-password"
                type={showDisablePassword ? 'text' : 'password'}
                value={disableData.password}
                onChange={(e) => setDisableData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Enter your current password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowDisablePassword(!showDisablePassword)}
              >
                {showDisablePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Verification (choose one):</Label>
            
            <div>
              <Label htmlFor="disable-totp" className="text-sm">TOTP Code from Authenticator App</Label>
              <Input
                id="disable-totp"
                type="text"
                value={disableData.totp}
                onChange={(e) => setDisableData(prev => ({ ...prev, totp: e.target.value, recoveryCode: '' }))}
                placeholder="6-digit code"
                maxLength={6}
              />
            </div>

            <div className="text-center text-sm text-muted-foreground">OR</div>

            <div>
              <Label htmlFor="disable-recovery" className="text-sm">Recovery Code</Label>
              <Input
                id="disable-recovery"
                type="text"
                value={disableData.recoveryCode}
                onChange={(e) => setDisableData(prev => ({ ...prev, recoveryCode: e.target.value, totp: '' }))}
                placeholder="8-character recovery code"
                maxLength={8}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDisableModalOpen(false);
                setDisableData({ password: '', totp: '', recoveryCode: '' });
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDisable2FA}
              disabled={isProcessing}
            >
              {isProcessing ? 'Disabling...' : 'Disable 2FA'}
            </Button>
          </div>
        </div>
      </ModalWrapper>

      {/* Recovery Codes Modal */}
      <ModalWrapper
        isOpen={showRecoveryCodesModal}
        onClose={() => setShowRecoveryCodesModal(false)}
        title="Recovery Codes"
        size="md"
      >
        <div className="space-y-4">
          <Alert>
            <Key className="h-4 w-4" />
            <AlertDescription>
              These codes can be used to access your account if you lose your authenticator device. 
              Each code can only be used once.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Your Recovery Codes</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(recoveryCodes.join('\n'))}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadRecoveryCodes}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {recoveryCodes.map((code, index) => (
                <div key={index} className="bg-muted p-2 rounded font-mono text-sm text-center">
                  {code}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setShowRecoveryCodesModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </ModalWrapper>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => setShowConfirmModal(false)}
        title="Confirm Action"
        description="Are you sure you want to perform this action?"
        confirmText="Confirm"
      />
    </div>
  );
}