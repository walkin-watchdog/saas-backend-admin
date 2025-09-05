import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Image, Trash2, Search, Upload, FolderOpen, Check, Loader } from 'lucide-react';
import { useToast } from '../components/ui/toaster';
import axios from 'axios';
import { formatBytes } from '../lib/utils';
import useCloudinaryCloudName from '@/hooks/useCloudinaryCloudName';

export const Gallery = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [images, setImages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [folders, setFolders] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalImageCount, setTotalImageCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<any>(null);

  const { cloudName, configured } = useCloudinaryCloudName(user?.tenantId);

  const fetchFolders = async () => {
    try {
      // Predefined folders that we already use in the system
      const defaultFolders = ['gallery', 'home', 'products', 'destinations', 'itinerary', 'experiences', 'team', 'partners', 'slides'];
      setFolders(defaultFolders);
    } catch (error) {
      console.error('Error fetching folders:', error);
      toast({ message: 'Failed to load folders', type: 'error' });
    }
  };

  const fetchImages = async (cursor = '', loadMore = false) => {
    if (!cloudName || !configured) return;
    if (loadMore) {
      setLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const base = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}`;
      let url: string;
      if (searchTerm.trim()) {
        // use dedicated search endpoint
        const q = encodeURIComponent(searchTerm.trim());
        const params = new URLSearchParams();
        if (cursor) params.append('next_cursor', cursor);
        url = `${base}/uploads/search?q=${q}${params.toString() ? `&${params.toString()}` : ''}`;
      } else {
        url = `${base}/uploads`;
        if (activeFolder) {
          url += `/${activeFolder}`;
        }
        const params = new URLSearchParams();
        if (cursor) params.append('next_cursor', cursor);
        if (params.toString()) {
          url += `?${params.toString()}`;
        }
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setImages(prev => loadMore ? [...prev, ...data.images] : data.images);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
        setTotalImageCount(prev => (loadMore ? prev + data.images.length : data.images.length));
      } else {
        throw new Error('Failed to fetch images');
      }
    } catch (error) {
      console.error('Error fetching images:', error);
      toast({ message: 'Failed to load images', type: 'error' });
    } finally {
      if (loadMore) {
        setLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (cloudName) fetchFolders();
  }, [cloudName]);

  useEffect(() => {
    if (!cloudName || !configured) return;
    fetchImages();
    setSelectedImages([]);
  }, [activeFolder, searchTerm, cloudName, configured]);

  const handleFolderChange = (folder: string) => {
    setActiveFolder(folder);
    setNextCursor(null);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (cloudName && configured) fetchImages();
  };

  const handleImageSelect = (imageUrl: string) => {
    setSelectedImages(prev => 
      prev.includes(imageUrl) 
        ? prev.filter(url => url !== imageUrl) 
        : [...prev, imageUrl]
    );
  };

  const handleDeleteImage = (image: any) => {
    setImageToDelete(image);
    setShowDeleteModal(true);
  };

  const confirmDeleteImage = async () => {
    if (!imageToDelete) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/uploads/${imageToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        setImages(prev => prev.filter(img => img.id !== imageToDelete.id));
        setSelectedImages(prev => prev.filter(url => !url.includes(imageToDelete.id)));
        toast({ message: 'Image deleted successfully', type: 'success' });
        setShowDeleteModal(false);
        setImageToDelete(null);
      } else {
        throw new Error('Failed to delete image');
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({ message: 'Failed to delete image', type: 'error' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedImages.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedImages.length} selected images?`)) {
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const imageUrl of selectedImages) {
      const imageId = images.find(img => img.url === imageUrl)?.id;
      if (!imageId) continue;
      
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/uploads/${imageId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error('Error deleting image:', error);
        errorCount++;
      }
    }
    
    if (successCount > 0) {
      toast({ message: `Successfully deleted ${successCount} images`, type: 'success' });
      fetchImages(); // Refresh the image list
      setSelectedImages([]);
    }
    
    if (errorCount > 0) {
      toast({ message: `Failed to delete ${errorCount} images`, type: 'error' });
    }
  };

  const handleLoadMore = () => {
    if (nextCursor) {
      fetchImages(nextCursor, true);
    }
  };

  const handleUploadClick = () => {
    if (!cloudName || !configured) {
      toast({ message: 'Cloudinary is not configured for this tenant', type: 'error' });
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (!cloudName || !configured) {
      toast({ message: 'Cloudinary is not configured for this tenant', type: 'error' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const uploadFormData = new FormData();
    for (let i = 0; i < files.length; i++) {
      uploadFormData.append('images', files[i]);
    }

    try {
      const endpoint = activeFolder ? `/uploads/${activeFolder}` : '/uploads/gallery';

      const res = await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}${endpoint}`,
        uploadFormData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: ev => {
            const progress = ev.total ? Math.round((ev.loaded * 100) / ev.total) : 0;
            setUploadProgress(progress);
          },
        }
      );

      if (res.data && res.data.images) {
        toast({ message: `${res.data.images.length} image(s) uploaded successfully`, type: 'success' });
        fetchImages();
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      toast({ message: 'Failed to upload images', type: 'error' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!cloudName || !configured) {
    return (
      <div className="p-4 text-red-600">
        Cloudinary is not configured for this tenant.{' '}
        <a href="/settings/integrations" className="underline">Go to settings</a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Image Gallery</h1>
          <p className="text-gray-600 mt-2">Manage all your uploaded images in one place</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleUploadClick}
            disabled={isUploading}
            className="flex items-center px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors"
          >
            {isUploading ? (
              <>
                <Loader className="h-4 w-4 mr-2 animate-spin" />
                <span>Uploading... {uploadProgress}%</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                <span>Upload Images</span>
              </>
            )}
          </button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            multiple={true}
            className="hidden"
          />

          {selectedImages.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedImages.length})
            </button>
          )}
        </div>
      </div>

      {/* Folders and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Folder Tabs */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleFolderChange('')}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                activeFolder === '' 
                  ? 'bg-[var(--brand-primary)] text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Images
            </button>
            
            {folders.map((folder) => (
              <button
                key={folder}
                onClick={() => handleFolderChange(folder)}
                className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                  activeFolder === folder 
                    ? 'bg-[var(--brand-primary)] text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                {folder.charAt(0).toUpperCase() + folder.slice(1)}
              </button>
            ))}
          </div>
          
          {/* Search */}
          <div className="w-full md:w-auto max-w-md">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search images..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
              />
            </form>
          </div>
        </div>
      </div>

      {/* Image Grid */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {activeFolder 
              ? `${activeFolder.charAt(0).toUpperCase() + activeFolder.slice(1)} Images` 
              : 'All Images'}
          </h2>
          <div className="flex items-center space-x-4">
            {selectedImages.length > 0 && (
              <button 
                onClick={() => setSelectedImages([])}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear Selection
              </button>
            )}
            <div className="text-sm text-gray-500">
            {totalImageCount} images
            {selectedImages.length > 0 && ` (${selectedImages.length} selected)`}
            </div>
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader className="h-8 w-8 text-[var(--brand-primary)] animate-spin" />
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-12">
            <Image className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No images found</h3>
            <p className="text-gray-500 mb-6">
              {searchTerm 
                ? 'Try a different search term' 
                : `Upload some images to the ${activeFolder || 'gallery'} folder to get started`}
            </p>
            <button
              onClick={handleUploadClick}
              className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors"
            >
              <Upload className="h-4 w-4 mr-2 inline-block" />
              Upload Images
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {images.map((image) => (
                <div
                  key={image.id}
                  onClick={() => handleImageSelect(image.url)}
                  className={`group relative rounded-lg overflow-hidden border-2 cursor-pointer ${
                    selectedImages.includes(image.url)
                      ? 'border-[var(--brand-primary)] shadow-md'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="relative aspect-square bg-gray-100">
                    <img 
                      src={image.url} 
                      alt="Gallery image" 
                      className="w-full h-full object-cover" 
                      loading="lazy"
                    />
                    
                    {selectedImages.includes(image.url) && (
                      <div className="absolute inset-0 bg-[var(--brand-primary)] bg-opacity-20 flex items-center justify-center">
                        <div className="bg-[var(--brand-primary)] text-white p-2 rounded-full">
                          <Check className="h-5 w-5" />
                        </div>
                      </div>
                    )}
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteImage(image);
                      }}
                      className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete image"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="p-2 text-xs text-gray-500">
                    <div className="truncate">{image.id.split('/').pop() || image.id}</div>
                    <div>{formatBytes(image.bytes)}</div>
                  </div>
                </div>
              ))}
            </div>
            
            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 bg-gray-100 rounded-md text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  {loadingMore ? (
                    <span className="flex items-center">
                      <Loader className="h-4 w-4 animate-spin mr-2" />
                      Loading more...
                    </span>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && imageToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Image</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete this image? This action cannot be undone.
            </p>
            
            <div className="mb-4 p-2 border border-gray-200 rounded-md">
              <img 
                src={imageToDelete.url} 
                alt="Delete preview" 
                className="w-full h-48 object-contain"
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setImageToDelete(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteImage}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};