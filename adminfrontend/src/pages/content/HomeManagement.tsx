import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ImageUploader } from '../../components/gallery/ImageUploader';
import { useToast } from '../../components/ui/toaster';
import useImageRule from '@/hooks/useImageRule';

export const HomeManagement = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { rule: homeRule } = useImageRule(user?.tenantId, 'home-slide');

  // Fetch existing home
  const fetchImages = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/home`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch home slides');
      const data = await res.json();
      setImages(data.images.map((img: any) => img.url));
    } catch (err) {
      console.error(err);
      toast({ message: 'Failed to load home', type: 'error' });
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
        <h2 className="text-xl font-semibold text-gray-900">Home</h2>
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
                `${import.meta.env.VITE_API_URL}/home`,
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
              toast({ message: 'Home slides saved', type: 'success' });
            } catch (err) {
              console.error(err);
              toast({ message: 'Failed to save Home slides', type: 'error' });
            }
          }}
          maxImages={5}
          hideUnlink={true}
          folder="home"
          title="Home"
          allowBrowser={false}
          imageType="home-slide"
          tenantId={user?.tenantId}
        />
      )}
      {homeRule && (
        <p className="text-xs text-gray-500 mt-1 mb-2">
          Recommended size: {homeRule.width} × {homeRule.height} px
        </p>
      )}
    </div>
  );
};