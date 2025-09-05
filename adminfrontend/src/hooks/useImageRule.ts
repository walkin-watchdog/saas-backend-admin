import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect } from 'react';
import type { ResolutionSpec } from '@/types';
import { queryClient } from '@/lib/queryClient';

export type ImageType = 'destinations' | 'logos' | 'slides' | 'partners' | 'products' | string;

export interface ImageResolutionRule extends ResolutionSpec {
  imageType: ImageType;
  allowedTypes?: string[];
  maxUploadBytes?: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateImageRule(tenantId: string, imageType: ImageType) {
  queryClient.invalidateQueries({ queryKey: ['imageRule', tenantId, imageType] });
}

export default function useImageRule(
  tenantId: string | undefined,
  imageType: ImageType | undefined
) {
  const flagQuery = useQuery({
    queryKey: ['imageRulesFlag', tenantId],
    queryFn: async () => {
      const res = await axios.get('/api/tenant/config', {
        params: { keys: 'imageRulesFromPlatformConfig' },
      });
      return Boolean(res.data?.imageRulesFromPlatformConfig);
    },
    enabled: !!tenantId,
    staleTime: CACHE_TTL,
  });

  const ruleQuery = useQuery<ImageResolutionRule>({
    queryKey: ['imageRule', tenantId, imageType, flagQuery.data],
    queryFn: async () => {
      const res = await axios.get(`/api/config/image-rules/${tenantId}/${imageType}`);
      return res.data as ImageResolutionRule;
    },
    enabled: !!tenantId && !!imageType && flagQuery.data === true,
    staleTime: CACHE_TTL,
  });

  useEffect(() => {
    if (tenantId && imageType && flagQuery.data !== undefined) {
      queryClient.removeQueries({ queryKey: ['imageRule', tenantId, imageType] });
    }
  }, [flagQuery.data, tenantId, imageType]);

  return {
    rule: ruleQuery.data ?? null,
    error: (ruleQuery.error as Error) || null,
    isLoading: ruleQuery.isLoading,
    enabled: flagQuery.data ?? false,
    refetch: ruleQuery.refetch,
  };
}

