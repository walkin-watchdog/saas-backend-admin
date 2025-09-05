import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    grecaptcha?: any;
  }
}

interface Props {
  onToken: (token: string) => void;
}

export const Captcha = ({ onToken }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    if (!ref.current || !siteKey) return;

    const render = () => {
      window.grecaptcha?.render(ref.current!, {
        sitekey: siteKey,
        callback: onToken,
        'expired-callback': () => onToken('')
      });
    };

    if (window.grecaptcha) {
      render();
    } else {
      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = render;
      document.body.appendChild(script);
    }
  }, [onToken]);

  return <div ref={ref} />;
};
