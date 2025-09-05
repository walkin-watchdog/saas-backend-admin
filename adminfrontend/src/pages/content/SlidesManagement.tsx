import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ImageUploader } from '../../components/gallery/ImageUploader';
import { useToast } from '../../components/ui/toaster';
import useImageRule from '@/hooks/useImageRule';

export const SlidesManagement = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { rule: slideRule } = useImageRule(user?.tenantId, 'slides');

  // Fetch existing slides
  const fetchImages = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/slides`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch slides');
      const data = await res.json();
      // data.images is [{ id, url, bytes, ... }]
      setImages(data.images.map((img: any) => img.url));
    } catch (err) {
      console.error(err);
      toast({ message: 'Failed to load slides', type: 'error' });
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
        <h2 className="text-xl font-semibold text-gray-900">Slides</h2>
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
                `${import.meta.env.VITE_API_URL}/slides`,
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
              toast({ message: 'Slides saved', type: 'success' });
            } catch (err) {
              console.error(err);
              toast({ message: 'Failed to save Slides', type: 'error' });
            }
          }}
          maxImages={20}
          hideUnlink={true}
          folder="slides"
          title="Slides"
          allowBrowser={false}
          imageType="slides"
          tenantId={user?.tenantId}
        />
      )}
      {slideRule && (
        <p className="text-xs text-gray-500 mt-1 mb-2">
          Recommended size: {slideRule.width} × {slideRule.height} px
        </p>
      )}
    </div>
  );
};