import { useState, useCallback } from 'react';
import { totpApi } from '@/api/platform/totp';
import { toast } from '@/hooks/use-toast';

interface UsePlatformMfaOptions {
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

export function usePlatformMfa(options: UsePlatformMfaOptions = {}) {
  const [isStepUpRequired, setIsStepUpRequired] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const performStepUp = useCallback(async (
    totpCode?: string,
    recoveryCode?: string
  ): Promise<boolean> => {
    try {
      setIsProcessing(true);

      if (!totpCode && !recoveryCode) {
        throw new Error('A TOTP code or recovery code is required');
      }

      const data = totpCode
        ? { totp: totpCode, ...(recoveryCode ? { recoveryCode } : {}) }
        : { recoveryCode: recoveryCode! };

      const response = await totpApi.reauth(data);
      
      if (response.ok) {
        setIsStepUpRequired(false);
        if (options.onSuccess) {
          options.onSuccess();
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Step-up authentication failed:', error);
      if (options.onError) {
        options.onError(error);
      } else {
        toast({
          title: 'Verification Failed',
          description: 'Please check your code and try again',
          variant: 'destructive'
        });
      }
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [options]);

  const requireStepUp = useCallback(() => {
    setIsStepUpRequired(true);
  }, []);

  const cancelStepUp = useCallback(() => {
    setIsStepUpRequired(false);
  }, []);

  return {
    isStepUpRequired,
    isProcessing,
    performStepUp,
    requireStepUp,
    cancelStepUp
  };
}