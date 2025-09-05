import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export default function useCloudinaryCloudName(tenantId?: string) {
  const { token } = useAuth();
  const query = useQuery<{ cloudName: string | null; configured: boolean }>({
    queryKey: ['cloudinaryCloudName', tenantId],
    queryFn: async () => {
      const res = await fetch('/api/tenant/config/cloudinary/cloud-name', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to load tenant Cloudinary config');
      }
      return (await res.json()) as { cloudName: string | null; configured: boolean };
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    cloudName: query.data?.cloudName || '',
    configured: !!query.data?.configured,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}