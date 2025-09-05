import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { tenantsApi } from '@/api/platform/tenants';
import { ArrowLeft } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  subscriber?: { billingStatus?: string; kycStatus?: string };
  subscriptions?: Array<{ plan: { name: string } }>;
  _count?: { users: number; products: number; bookings: number };
}

export default function PlatformTenantDetails() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    tenantsApi
      .getDetails(tenantId)
      .then((data) => setTenant(data))
      .catch(() => setTenant(null))
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!tenant) {
    return <p className="text-center text-red-500">Tenant not found.</p>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back
      </Button>

      <div>
        <h1 className="text-3xl font-bold">{tenant.name}</h1>
        <p className="text-muted-foreground">ID: {tenant.id}</p>
      </div>

      <Card>
        <CardContent className="space-y-2">
          <p>
            <span className="font-medium">Status:</span> {tenant.status}
          </p>
          {tenant.subscriptions?.[0]?.plan?.name && (
            <p>
              <span className="font-medium">Plan:</span> {tenant.subscriptions[0].plan.name}
            </p>
          )}
          {tenant.subscriber?.billingStatus && (
            <p>
              <span className="font-medium">Billing Status:</span> {tenant.subscriber.billingStatus}
            </p>
          )}
          {tenant.subscriber?.kycStatus && (
            <p>
              <span className="font-medium">KYC Status:</span> {tenant.subscriber.kycStatus}
            </p>
          )}
          <p>
            <span className="font-medium">Created:</span> {new Date(tenant.createdAt).toLocaleString()}
          </p>
          {tenant._count && (
            <p>
              <span className="font-medium">Usage:</span> {tenant._count.users} users, {tenant._count.products} products, {tenant._count.bookings} bookings
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

