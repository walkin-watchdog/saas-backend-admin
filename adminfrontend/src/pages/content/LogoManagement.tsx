import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ImageUploader } from '../../components/gallery/ImageUploader';
import { useToast } from '../../components/ui/toaster';
import useImageRule from '@/hooks/useImageRule';

export const LogoManagement = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { rule: logoRule } = useImageRule(user?.tenantId, 'logos');

  // Fetch existing logo
  const fetchImages = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/logo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Logo');
      const data = await res.json();
      setImages(data.images.map((img: any) => img.url));
    } catch (err) {
      console.error(err);
      toast({ message: 'Failed to load logo', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Logo</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
        </div>
      ) : (
        <ImageUploader
          images={images}
          onChange={async (newImages) => {
            setImages(newImages);
            try {
              const res = await fetch(
                `${import.meta.env.VITE_API_URL}/logo`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ images: newImages }),
                }
              );
              if (!res.ok) throw new Error('Save failed');
              toast({ message: 'Logo saved', type: 'success' });
            } catch (err) {
              console.error(err);
              toast({ message: 'Failed to save Logo', type: 'error' });
            }
          }}
          maxImages={1}
          hideUnlink={true}
          folder="logo"
          title="Logo"
          allowBrowser={false}
          imageType="logos"
          tenantId={user?.tenantId}
        />
      )}
      {logoRule && (
        <p className="text-xs text-gray-500 mt-1 mb-2">
          Recommended size: {logoRule.width} × {logoRule.height} px
        </p>
      )}
    </div>
  );
};