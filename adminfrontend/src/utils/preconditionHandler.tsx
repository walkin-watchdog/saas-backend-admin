// Global 412 precondition error handler

import { toast } from 'react-hot-toast';
import { PRECONDITION_CODES } from '@/types/config';

const PRECONDITION_LINKS: Record<string, { url: string; label: string }> = {
  [PRECONDITION_CODES.SMTP_CONFIG_MISSING]: {
    url: '/settings/integrations#smtp',
    label: 'Configure SMTP Settings'
  },
  [PRECONDITION_CODES.BRANDING_CONFIG_MISSING]: {
    url: '/settings/brand',
    label: 'Complete Brand Settings'
  },
  [PRECONDITION_CODES.CURRENCY_API_KEY_MISSING]: {
    url: '/settings/integrations#currencyApi',
    label: 'Configure Currency API'
  },
  [PRECONDITION_CODES.HUBSPOT_CONFIG_MISSING]: {
    url: '/settings/integrations#hubspot',
    label: 'Configure HubSpot'
  },
  [PRECONDITION_CODES.MAPS_API_KEY_MISSING]: {
    url: '/settings/integrations#maps',
    label: 'Configure Google Maps API'
  },
  [PRECONDITION_CODES.WORDPRESS_CONFIG_MISSING]: {
    url: '/settings/integrations#wordpress',
    label: 'Configure WordPress'
  },
  [PRECONDITION_CODES.PAYPAL_CONFIG_MISSING]: {
    url: '/settings/integrations#paypal',
    label: 'Configure PayPal'
  },
  [PRECONDITION_CODES.PAYPAL_WEBHOOK_ID_MISSING]: {
    url: '/settings/integrations#paypal',
    label: 'Complete PayPal Configuration'
  },
  [PRECONDITION_CODES.CLOUDINARY_CONFIG_MISSING]: {
    url: '/settings/integrations#cloudinary',
    label: 'Configure Cloudinary'
  },
};

export const handlePreconditionError = (
  error: Error,
  navigate?: (path: string) => void,
  context?: { provider?: 'paypal' | 'razorpay' }
) => {
  const message = error.message;

  if (message.startsWith('PRECONDITION:')) {
    const code = message.replace('PRECONDITION:', '');
    let config = PRECONDITION_LINKS[code];

    if (!config && code === PRECONDITION_CODES.CONFIG_MISSING_TENANT && context?.provider) {
      const provider = context.provider;
      config = {
        url: `/settings/integrations#${provider}`,
        label: `Configure ${provider === 'paypal' ? 'PayPal' : 'Razorpay'}`
      };
    }

    if (config) {
      toast.error(
        (
          <span>
            Configuration required to use this feature.{' '}
            <a
              href={config.url}
              onClick={(e) => {
                e.preventDefault();
                toast.dismiss();
                if (navigate) {
                  navigate(config.url);
                } else {
                  window.location.href = config.url;
                }
              }}
              className="underline"
            >
              {config.label}
            </a>
          </span>
        ),
        { duration: 6000 }
      );
      return true;
    }
  }

  return false;
};

// Fetch interceptor for automatic 412 handling
export const setupPreconditionInterceptor = (
  navigate: (path: string) => void,
  onMfaRequired?: () => Promise<void>
) => {
  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const response = await originalFetch(input, init);

      if (response.status === 412) {
        const errorData = await response.clone().json();
        const error: Error = new Error(`PRECONDITION:${errorData.code || 'UNKNOWN'}`);
        handlePreconditionError(error, navigate, { provider: errorData.provider });
      }

      if (response.status === 401 && onMfaRequired) {
        let data: any = null;
        try {
          data = await response.clone().json();
        } catch {}
        const code = String(data?.error || '').toLowerCase();
        if (code === 'mfa_freshness_required' || code === 'reauth_required') {
          await onMfaRequired();
          return originalFetch(input, init);
        }
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  return () => {
    window.fetch = originalFetch;
  };
};