import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CreditCard,
  Plus,
  Trash2,
  Star,
  CheckCircle,
  RefreshCw,
  Shield,
  Loader2
} from 'lucide-react';
import { paymentMethodsApi } from '@/api/billing/paymentMethods';
import type { PaymentMethodDTO, AttachPaymentMethodBody, VerifyMandateRequest } from '@/types/billing';
import { toast } from '@/hooks/use-toast';
import { isBillingError } from '@/utils/billing';

export const PaymentMethods = () => {
  const { user } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [, setSelectedMethod] = useState<PaymentMethodDTO | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isDetaching, setIsDetaching] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');

  const [attachForm, setAttachForm] = useState<AttachPaymentMethodBody>({
    token: '',
    brand: '',
    last4: '',
    expMonth: undefined,
    expYear: undefined,
    name: '',
  });

  const [verifyForm, setVerifyForm] = useState<VerifyMandateRequest>({
    provider: 'razorpay',
    razorpay_payment_id: '',
    razorpay_subscription_id: '',
    razorpay_signature: '',
    subscriptionId: '',
  });

  const [editingName, setEditingName] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      const methods = await paymentMethodsApi.list();
      setPaymentMethods(methods);
    } catch (error: any) {
      console.error('Error fetching payment methods:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: 'Failed to load payment methods',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchPaymentMethods(true);
  };

  const handleAttach = async () => {
    if (!attachForm.token) {
      toast({
        title: 'Error',
        description: 'Payment token is required',
        variant: 'destructive',
      });
      return;
    }
    try {
      setIsAttaching(true);
      const idempotencyKey = `attach-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await paymentMethodsApi.attach(attachForm, idempotencyKey);
      toast({ title: 'Success', description: 'Payment method added successfully' });
      setShowAttachModal(false);
      setAttachForm({
        token: '',
        brand: '',
        last4: '',
        expMonth: undefined,
        expYear: undefined,
        name: '',
      });
      fetchPaymentMethods();
    } catch (error: any) {
      console.error('Error attaching payment method:', error);
      if (isBillingError(error)) {
        // Billing errors are displayed via BillingBanner
      } else {
        const message =
          error.message === 'INVALID_TOKEN'
            ? 'Invalid payment token. Please try again.'
            : 'Failed to add payment method';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
      }
    } finally {
      setIsAttaching(false);
    }
  };

  const handleSetDefault = async (methodId: string) => {
    try {
      setIsUpdating(methodId);
      const key = `default-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await paymentMethodsApi.update(methodId, { default: true }, key);
      toast({ title: 'Success', description: 'Default payment method updated' });
      fetchPaymentMethods();
    } catch (error: any) {
      console.error('Error setting default payment method:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: 'Failed to update default payment method',
          variant: 'destructive',
        });
      }
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdateName = async (methodId: string, name: string) => {
    try {
      setIsUpdating(methodId);
      const key = `name-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await paymentMethodsApi.update(methodId, { name }, key);
      toast({ title: 'Success', description: 'Payment method name updated' });
      setEditingName(null);
      fetchPaymentMethods();
    } catch (error: any) {
      console.error('Error updating payment method name:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: 'Failed to update payment method name',
          variant: 'destructive',
        });
      }
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDetach = (method: PaymentMethodDTO) => {
    setSelectedMethod(method);
    setConfirmTitle('Remove Payment Method');
    setConfirmDescription(
      `Are you sure you want to remove ${method.brand ? `${method.brand} ****${method.last4}` : 'this payment method'}?`
    );
    setConfirmAction(() => async () => {
      try {
        setIsDetaching(method.id);
        const key = `detach-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await paymentMethodsApi.detach(method.id, key);
        toast({ title: 'Success', description: 'Payment method removed successfully' });
        fetchPaymentMethods();
      } catch (error: any) {
        console.error('Error detaching payment method:', error);
        if (isBillingError(error)) {
          // Billing errors are handled by BillingBanner
        } else if (error.message === 'LAST_USABLE_PM_ON_ACTIVE_SUB') {
          toast({
            title: 'Cannot Remove Payment Method',
            description:
              'This is your only payment method and you have an active subscription. Please add another payment method first.',
            variant: 'destructive',
          });
        } else if (error.message === 'GATEWAY_DETACH_FAILED') {
          toast({
            title: 'Gateway Error',
            description: 'Failed to remove payment method from gateway. Please try again or contact support.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Error',
            description: 'Failed to remove payment method',
            variant: 'destructive',
          });
        }
      } finally {
        setIsDetaching(null);
      }
    });
    setShowConfirmModal(true);
  };

  const handleVerifyMandate = async () => {
    try {
      setIsVerifying(true);
      let request: VerifyMandateRequest = {
        provider: verifyForm.provider,
      };

      if (verifyForm.provider === 'razorpay' || verifyForm.provider === 'upi') {
        request = {
          provider: verifyForm.provider,
          razorpay_payment_id: verifyForm.razorpay_payment_id,
          razorpay_subscription_id: verifyForm.razorpay_subscription_id,
          razorpay_signature: verifyForm.razorpay_signature,
        };
      } else if (verifyForm.provider === 'paypal') {
        request = {
          provider: 'paypal',
          subscriptionId: verifyForm.subscriptionId,
        };
      }

      const result = await paymentMethodsApi.verifyMandate(request);
      if (result.verified) {
        toast({ title: 'Success', description: 'Payment mandate verified successfully' });
      } else {
        toast({
          title: 'Verification Failed',
          description: `Mandate verification failed${result.status ? ` (Status: ${result.status})` : ''}`,
          variant: 'destructive',
        });
      }
      setShowVerifyModal(false);
      setVerifyForm({
        provider: 'razorpay',
        razorpay_payment_id: '',
        razorpay_subscription_id: '',
        razorpay_signature: '',
        subscriptionId: '',
      });
    } catch (error: any) {
      console.error('Error verifying mandate:', error);
      if (!isBillingError(error)) {
        toast({
          title: 'Error',
          description: 'Failed to verify payment mandate',
          variant: 'destructive',
        });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const getCardBrand = (brand?: string) => {
    if (!brand) return 'Card';
    const brandMap: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      diners: 'Diners Club',
      jcb: 'JCB',
      unionpay: 'UnionPay',
      rupay: 'RuPay',
      upi: 'UPI',
    };
    return brandMap[brand.toLowerCase()] || brand;
  };

  const formatExpiry = (month?: number, year?: number) => {
    if (!month || !year) return '';
    return `${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
  };

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">You need administrator privileges to manage payment methods.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payment Methods</h1>
          <p className="text-gray-600 mt-2">Manage your payment methods for subscriptions</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowAttachModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Payment Method
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center space-x-4">
                  <div className="rounded bg-muted h-16 w-full"></div>
                </div>
              ))}
            </div>
          ) : paymentMethods.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No payment methods</h3>
              <p className="text-muted-foreground mb-6">
                Add a payment method to enable automatic billing for your subscription.
              </p>
              <Button onClick={() => setShowAttachModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Payment Method
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className={`border rounded-lg p-4 ${
                    method.default ? 'border-[var(--brand-primary)] bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <CreditCard className="h-8 w-8 text-gray-400" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">
                            {getCardBrand(method.brand)} ****{method.last4}
                          </span>
                          {method.default && (
                            <Badge className="bg-[var(--brand-primary)] text-white">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {method.name && <span>{method.name} • </span>}
                          {formatExpiry(method.expMonth, method.expYear) && (
                            <span>Expires {formatExpiry(method.expMonth, method.expYear)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {editingName?.id === method.id ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            value={editingName.name}
                            onChange={(e) => setEditingName({ ...editingName, name: e.target.value })}
                            placeholder="Card nickname"
                            className="w-32"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdateName(method.id, editingName.name);
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleUpdateName(method.id, editingName.name)}
                            disabled={isUpdating === method.id}
                          >
                            {isUpdating === method.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingName(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingName({ id: method.id, name: method.name || '' })}
                          >
                            Edit Name
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSetDefault(method.id)}
                            disabled={method.default || isUpdating === method.id}
                          >
                            {isUpdating === method.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Set Default'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedMethod(method);
                              setShowVerifyModal(true);
                            }}
                          >
                            Verify Mandate
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDetach(method)}
                            disabled={isDetaching === method.id}
                          >
                            {isDetaching === method.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attach Payment Method Modal */}
      <ModalWrapper
        isOpen={showAttachModal}
        onClose={() => setShowAttachModal(false)}
        title="Add Payment Method"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="token">Payment Token</Label>
            <Input
              id="token"
              value={attachForm.token}
              onChange={(e) => setAttachForm({ ...attachForm, token: e.target.value })}
              placeholder="Token from gateway"
            />
          </div>
          <div>
            <Label htmlFor="brand">Brand</Label>
            <Input
              id="brand"
              value={attachForm.brand}
              onChange={(e) => setAttachForm({ ...attachForm, brand: e.target.value })}
              placeholder="e.g. Visa"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="last4">Last 4</Label>
              <Input
                id="last4"
                value={attachForm.last4}
                onChange={(e) => setAttachForm({ ...attachForm, last4: e.target.value })}
                placeholder="1234"
                maxLength={4}
              />
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={attachForm.name}
                onChange={(e) => setAttachForm({ ...attachForm, name: e.target.value })}
                placeholder="Card nickname"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expMonth">Exp. Month</Label>
              <Input
                id="expMonth"
                type="number"
                value={attachForm.expMonth ?? ''}
                onChange={(e) =>
                  setAttachForm({
                    ...attachForm,
                    expMonth: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  })
                }
                placeholder="MM"
                min={1}
                max={12}
              />
            </div>
            <div>
              <Label htmlFor="expYear">Exp. Year</Label>
              <Input
                id="expYear"
                type="number"
                value={attachForm.expYear ?? ''}
                onChange={(e) =>
                  setAttachForm({
                    ...attachForm,
                    expYear: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  })
                }
                placeholder="YYYY"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setShowAttachModal(false)} disabled={isAttaching}>
              Cancel
            </Button>
            <Button onClick={handleAttach} disabled={isAttaching}>
              {isAttaching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Method'}
            </Button>
          </div>
        </div>
      </ModalWrapper>

      {/* Verify Mandate Modal */}
      <ModalWrapper
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        title="Verify Payment Mandate"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <Label>Provider</Label>
            <Select
              value={verifyForm.provider}
              onValueChange={(value) =>
                setVerifyForm({ ...verifyForm, provider: value as VerifyMandateRequest['provider'] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="razorpay">Razorpay</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(verifyForm.provider === 'razorpay' || verifyForm.provider === 'upi') && (
            <>
              <div>
                <Label htmlFor="razorpay_payment_id">Payment ID</Label>
                <Input
                  id="razorpay_payment_id"
                  value={verifyForm.razorpay_payment_id}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, razorpay_payment_id: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="razorpay_subscription_id">Subscription ID</Label>
                <Input
                  id="razorpay_subscription_id"
                  value={verifyForm.razorpay_subscription_id}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, razorpay_subscription_id: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="razorpay_signature">Signature</Label>
                <Input
                  id="razorpay_signature"
                  value={verifyForm.razorpay_signature}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, razorpay_signature: e.target.value })
                  }
                />
              </div>
            </>
          )}

          {verifyForm.provider === 'paypal' && (
            <div>
              <Label htmlFor="subscriptionId">Subscription ID</Label>
              <Input
                id="subscriptionId"
                value={verifyForm.subscriptionId}
                onChange={(e) => setVerifyForm({ ...verifyForm, subscriptionId: e.target.value })}
              />
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setShowVerifyModal(false)} disabled={isVerifying}>
              Cancel
            </Button>
            <Button onClick={handleVerifyMandate} disabled={isVerifying}>
              {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
            </Button>
          </div>
        </div>
      </ModalWrapper>

      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmAction}
        title={confirmTitle}
        description={confirmDescription}
        isLoading={!!isDetaching}
        confirmText="Remove"
      />
    </div>
  );
};