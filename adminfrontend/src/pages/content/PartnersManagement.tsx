import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ImageUploader } from '../../components/gallery/ImageUploader';
import { useToast } from '../../components/ui/toaster';
import useImageRule from '@/hooks/useImageRule';

export const PartnersManagement = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { rule: partnerRule } = useImageRule(user?.tenantId, 'partners');

  // Fetch existing partner logos
  const fetchImages = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/partners`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch partners');
      const data = await res.json();
      // data.images is [{ id, url, bytes, ... }]
      setImages(data.images.map((img: any) => img.url));
    } catch (err) {
      console.error(err);
      toast({ message: 'Failed to load partner images', type: 'error' });
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
        <h2 className="text-xl font-semibold text-gray-900">Partners</h2>
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
                `${import.meta.env.VITE_API_URL}/partners`,
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
              toast({ message: 'Partner logos saved', type: 'success' });
            } catch (err) {
              console.error(err);
              toast({ message: 'Failed to save partner logos', type: 'error' });
            }
          }}
          maxImages={20}
          hideUnlink={true}
          folder="partners"
          title="Partner Logos"
          allowBrowser={false}
          imageType="partners"
          tenantId={user?.tenantId}
        />
      )}
      {partnerRule && (
        <p className="text-xs text-gray-500 mt-1 mb-2">
          Recommended size: {partnerRule.width} × {partnerRule.height} px
        </p>
      )}
    </div>
  );
};