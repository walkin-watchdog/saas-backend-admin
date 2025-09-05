import { useState, useRef, useEffect } from 'react';
import { Upload, X, Image as ImageIcon, Loader, Trash2, GripVertical, Info } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent }
  from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable }
  from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/toaster';
import axios from 'axios';
import { ImageBrowser } from './ImageBrowser';
import type { ImageUploaderProps } from '@/types';
import { PrepareImageModal } from './PrepareImageModal';
import { buildCloudinaryUrlFromPublicId } from '@/lib/cloudinary';
import useImageRule from '@/hooks/useImageRule';
import useCloudinaryCloudName from '@/hooks/useCloudinaryCloudName';

const parsePixelCropFromUrl = (url: string):
  | { x: number; y: number; w: number; h: number }
  | null => {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const marker = '/upload/';
    const idx = path.indexOf(marker);
    if (idx === -1) return null;
    let tail = path.slice(idx + marker.length);
    if (/^v\d+\//.test(tail)) tail = tail.replace(/^v\d+\//, '');
    const parts = tail.split('/').filter(Boolean);
    const isTransformSeg = (s: string) => s.includes(',') || /^[a-z]{1,3}_.+$/i.test(s);
    for (const seg of parts) {
      if (!isTransformSeg(seg)) break;
      if (seg.startsWith('c_crop') || seg.startsWith('c_fill')) {
        const isFill = seg.startsWith('c_fill');
        const params: Record<string,string> = {};
        seg.split(',').forEach(kv => {
          const [k, v] = kv.split('_');
          if (k && v) params[k] = v;
          if (kv === 'c_crop') params['c'] = 'crop';
          if (kv === 'c_fill') params['c'] = 'fill';
        });
        const x = isFill ? 0 : Number(params['x']);
        const y = isFill ? 0 : Number(params['y']);
        const w = Number(params['w']);
        const h = Number(params['h']);
        if ([x, y, w, h].some(n => !Number.isFinite(n))) return null;
        return { x, y, w, h };
      }
    }
    return null;
  } catch {
    return null;
  }
};

const extractPublicId = (url: string): string => {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const marker = '/upload/';
    const idx = path.indexOf(marker);
    if (idx === -1) return '';
    let tail = path.slice(idx + marker.length);
    if (/^v\d+\//.test(tail)) tail = tail.replace(/^v\d+\//, '');
    const parts = tail.split('/').filter(Boolean);
    const isTransformSeg = (s: string) => s.includes(',') || /^[a-z]{1,3}_.+$/i.test(s);
    let i = 0;
    while (i < parts.length && isTransformSeg(parts[i])) i++;
    const publicPath = parts.slice(i).join('/');
    return publicPath.replace(/\.[^/.]+$/, '');
  } catch {
    return '';
  }
};

const getFormatFromUrl = (url: string): string => {
  try {
    const clean = url.split('?')[0];
    const dot = clean.lastIndexOf('.');
    if (dot === -1) return '';
    const ext = clean.slice(dot + 1).toLowerCase();
    return ext.length <= 5 ? ext : '';
  } catch {
    return '';
  }
};

const SortableImage = ({
  id,
  index,
  src,
  onUnlink,
  onRemove,
  onEdit,
  hideUnlink
}: {
  id: string;
  index: number;
  src: string;
  onUnlink: () => void;
  onRemove: () => void;
  onEdit: () => void;
  hideUnlink: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [meta, setMeta] = useState<{ w: number; h: number; fmt: string }>({
    w: 0,
    h: 0,
    fmt: getFormatFromUrl(src),
  });

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setMeta((m) => ({ ...m, w: img.naturalWidth, h: img.naturalHeight }));
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div className="relative h-32 bg-gray-100 rounded-md overflow-hidden border border-gray-200">
        <button
          {...listeners}
          {...attributes}
          className="absolute top-2 left-2 bg-white bg-opacity-75 text-gray-800 p-1 rounded-full opacity-0 group-hover:opacity-100 cursor-grab"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <img
          src={src}
          alt={`Image ${index + 1}`}
          className="w-full h-full object-cover cursor-pointer"
          loading="lazy"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Edit crop"
        />

        {!hideUnlink && (
          <button
            type="button"
            onClick={onUnlink}
            className="absolute top-2 right-2 bg-white bg-opacity-75 text-gray-800 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            title="Unlink image"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onRemove}
          className="absolute bottom-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete image"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-md">
          {index + 1}
        </div>
      </div>
      <div className="mt-1 text-xs text-gray-500 text-center">
        {(meta.fmt ? meta.fmt.toUpperCase() : '—')} W:{meta.w || '–'} H:{meta.h || '–'}
      </div>
    </div>
  );
 };

const StaticImage = ({
  index,
  src,
  onUnlink,
  onRemove,
  onEdit,
  hideUnlink,
}: {
  index: number;
  src: string;
  onUnlink: () => void;
  onRemove: () => void;
  onEdit: () => void;
  hideUnlink: boolean;
}) => {
  const [meta, setMeta] = useState<{ w: number; h: number; fmt: string }>({
    w: 0,
    h: 0,
    fmt: getFormatFromUrl(src),
  });

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setMeta((m) => ({ ...m, w: img.naturalWidth, h: img.naturalHeight }));
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="relative group">
      <div className="relative h-32 bg-gray-100 rounded-md overflow-hidden border border-gray-200">
        <img
          src={src}
          alt={`Image ${index + 1}`}
          className="w-full h-full object-cover cursor-pointer"
          loading="lazy"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Edit crop"
        />
        {!hideUnlink && (
          <button
            type="button"
            onClick={onUnlink}
            className="absolute top-2 right-2 bg-white bg-opacity-75 text-gray-800 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            title="Unlink image"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="absolute bottom-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete image"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-md">
          {index + 1}
        </div>
      </div>
      <div className="mt-1 text-xs text-gray-500 text-center">
        {(meta.fmt ? meta.fmt.toUpperCase() : '—')} W:{meta.w || '–'} H:{meta.h || '–'}
      </div>
    </div>
  );
};

export const ImageUploader = ({
  images = [],
  onChange,
  maxImages = 10,
  folder = 'products',
  title = 'Images',
  allowReordering = true,
  className = '',
  allowBrowser = true,
  resolutionOverride,
  hideUnlink = false,
  imageType,
  tenantId,
}: ImageUploaderProps) => {
  const { token } = useAuth();
  const toast = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [prepareSrc, setPrepareSrc] = useState<string | null>(null);
  const [prepareQueue, setPrepareQueue] = useState<File[]>([]);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editPublicId, setEditPublicId] = useState<string | null>(null);
  const [editInitialCrop, setEditInitialCrop] =
    useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onChange(arrayMove(images, images.indexOf(active.id as string), images.indexOf(over.id as string)));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { rule: fetchedRule } = useImageRule(tenantId, imageType);
  const { cloudName, configured } = useCloudinaryCloudName(tenantId);
  const resolution = fetchedRule || resolutionOverride;

  useEffect(() => {
    if (resolutionOverride) {
      console.warn('ImageUploader resolutionOverride in use', {
        imageType,
        tenantId,
        override: resolutionOverride,
      });
    }
  }, [resolutionOverride, imageType, tenantId]);

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

    // Check if adding these files would exceed the max limit
    if (images.length + files.length > maxImages) {
      toast({ message: `You can upload a maximum of ${maxImages} images`, type: 'error' });
      return;
    }

    if (!resolution) {
      const uploadFormData = new FormData();
      for (let i = 0; i < files.length; i++) uploadFormData.append('images', files[i]);
      setIsUploading(true);
      setUploadProgress(0);
      try {
        const endpoint = `/uploads/${folder}`;
        const res = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}${endpoint}`,
          uploadFormData,
          {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            onUploadProgress: ev => {
              const progress = ev.total ? Math.round((ev.loaded * 100) / ev.total) : 0;
              setUploadProgress(progress);
            },
          }
        );
        if (res.data?.images) {
          const newImages = [...images];
          res.data.images.forEach((img: any) => newImages.push(img.url));
          onChange(newImages);
          toast({ message: `${res.data.images.length} image(s) uploaded successfully`, type: 'success' });
        }
      } catch (error) {
        console.error('Error uploading images:', error);
        toast({ message: 'Failed to upload images', type: 'error' });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    // With resolution: run prepare modal for each file, then upload originals and attach transformed URLs
    const list = Array.from(files);

    // helpers
    const getDims = (file: File) =>
      new Promise<{ w: number; h: number }>((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ w: 0, h: 0 });
        };
        img.src = url;
      });

    const aspectMatches = (w: number, h: number, W: number, H: number, tol = 0.01) =>
      !!w && !!h && Math.abs(w / h - W / H) <= tol;

    const meetsMin = (w: number, h: number) =>
      !resolution.minSource ||
      (w >= resolution.minSource.width && h >= resolution.minSource.height);

    // Upload originals (no manual crop) and attach transformed URLs
    const uploadOriginalAndAttach = async (file: File) => {
      setIsUploading(true);
      setUploadProgress(0);
      try {
        const endpoint = `/uploads/${folder}`;
        const form = new FormData();
        form.append('images', file);
        const res = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}${endpoint}`,
          form,
          {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
            onUploadProgress: ev => {
              const progress = ev.total ? Math.round((ev.loaded * 100) / ev.total) : 0;
              setUploadProgress(progress);
            },
          }
        );
        if (res.data?.images?.length) {
          const newImages = [...images];
          res.data.images.forEach((img: any) => {
            const publicId = img.publicId;
            const transformed = buildCloudinaryUrlFromPublicId(cloudName, publicId, {
              frameW: resolution.width,
              frameH: resolution.height,
              fit: resolution.fit || 'cover',
              // no pixelCrop on purpose
              format: resolution.format || 'webp',
              quality: typeof resolution.quality === 'undefined' ? 'auto' : resolution.quality,
              dprAuto: true,
            });
            newImages.push(transformed);
          });
          onChange(newImages);
        }
      } catch (err) {
        console.error('Error uploading image:', err);
        toast({ message: 'Failed to upload image', type: 'error' });
      } finally {
        setIsUploading(false);
      }
    };

    // Decide per file
    const analyzed = await Promise.all(
      list.map(async (f) => {
        const { w, h } = await getDims(f);
        const needsCrop =
          (!meetsMin(w, h)) ||
          (resolution.fit || 'cover') !== 'contain' &&
          (!aspectMatches(w, h, resolution.width, resolution.height) || !meetsMin(w, h));
        return { file: f, needsCrop };
      })
    );

    const direct = analyzed.filter(a => !a.needsCrop).map(a => a.file);
    const needs = analyzed.filter(a => a.needsCrop).map(a => a.file);

    // Upload direct ones first
    for (const f of direct) {
      await uploadOriginalAndAttach(f);
    }
    if (direct.length > 0 && needs.length > 0) {
      toast({ message: `${direct.length} image(s) uploaded successfully`, type: 'success' });
    }
    if (needs.length > 0) {
      if (direct.length === 0) {
        toast({
          message: `All ${needs.length} image(s) require manual cropping`,
          type: 'info',
        });
      }
      setPrepareQueue(needs);
      const first = needs[0];
      const url = URL.createObjectURL(first);
      setPrepareSrc(url);
      setPrepareOpen(true);
    } else {
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast({
        message: `${direct.length} image(s) uploaded successfully`,
        type: 'success',
      });
    }
  };

  const handleEditImage = (index: number) => {
    if (!resolution) {
      toast({ message: 'No resolution spec provided for cropping.', type: 'error' });
      return;
    }
    if (!cloudName || !configured) {
      toast({ message: 'Cloudinary is not configured for this tenant', type: 'error' });
      return;
    }
    const url = images[index];
    const prev = parsePixelCropFromUrl(url);
    setEditInitialCrop(prev || null);
    const publicId = extractPublicId(url);
    if (!publicId) {
      toast({ message: 'Could not determine Cloudinary publicId for this image', type: 'error' });
      return;
    }
    const originalSrc = `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
    setEditIndex(index);
    setEditPublicId(publicId);
    setPrepareSrc(originalSrc);
    setPrepareOpen(true);
  };

  const flushOnePreparedUpload = async (file: File, pixelCrop: { x: number; y: number; w: number; h: number }) => {
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const endpoint = `/uploads/${folder}`;
      const form = new FormData();
      form.append('images', file);
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}${endpoint}`,
        form,
        {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
          onUploadProgress: ev => {
            const progress = ev.total ? Math.round((ev.loaded * 100) / ev.total) : 0;
            setUploadProgress(progress);
          },
        }
      );
      if (res.data?.images?.length) {
        const newImages = [...images];
        res.data.images.forEach((img: any) => {
          const publicId = img.publicId;
          const transformed = buildCloudinaryUrlFromPublicId(cloudName, publicId, {
            frameW: resolution!.width,
            frameH: resolution!.height,
            fit: resolution!.fit || 'cover',
            pixelCrop,
            format: resolution!.format || 'webp',
            quality: typeof resolution!.quality === 'undefined' ? 'auto' : resolution!.quality,
            dprAuto: true,
          });
          newImages.push(transformed);
        });
        onChange(newImages);
        toast({ message: `${res.data.images.length} image(s) prepared & uploaded`, type: 'success' });
      }
    } catch (err) {
      console.error('Error uploading prepared image:', err);
      toast({ message: 'Failed to upload prepared image', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreparedConfirm = async (payload: { pixelCrop: { x: number; y: number; w: number; h: number } }) => {
    setPrepareOpen(false);
    if (editIndex !== null && editPublicId) {
      if (!cloudName || !configured) {
        toast({ message: 'Cloudinary is not configured for this tenant', type: 'error' });
        return;
      }
      const transformed = buildCloudinaryUrlFromPublicId(cloudName, editPublicId, {
        frameW: resolution!.width,
        frameH: resolution!.height,
        fit: resolution!.fit || 'cover',
        pixelCrop: payload.pixelCrop,
        format: resolution!.format || 'webp',
        quality: typeof resolution!.quality === 'undefined' ? 'auto' : resolution!.quality,
        dprAuto: true,
      });
      const next = [...images];
      next[editIndex] = transformed;
      onChange(next);
      setEditIndex(null);
      setEditPublicId(null);
      setEditInitialCrop(null);
      setPrepareSrc(null);
      toast({ message: 'Image crop updated', type: 'success' });
      return;
    }

    const current = prepareQueue[0];
    if (prepareSrc && current instanceof File) URL.revokeObjectURL(prepareSrc);
    if (!current) return;
    await flushOnePreparedUpload(current, payload.pixelCrop);
    const rest = prepareQueue.slice(1);
    setPrepareQueue(rest);
    if (rest.length > 0) {
      const next = rest[0];
      const url = URL.createObjectURL(next);
      setPrepareSrc(url);
      setPrepareOpen(true);
    } else {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUnlinkImage = async (index: number) => {
    const updated = [...images];
    updated.splice(index, 1);
    onChange(updated);
    toast({ message: 'Image unlinked', type: 'info' });
  };

  const handleRemoveImage = async (index: number) => {
    const imageEntry = (images as any[])[index];
    const publicId = typeof imageEntry === 'string'
      ? extractPublicId(imageEntry)
      : imageEntry.id;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/uploads/${publicId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error('Delete failed');
      const updated = [...images];
      updated.splice(index, 1);
      onChange(updated);
      toast({ message: 'Image deleted successfully', type: 'success' });
    } catch (err) {
      console.error('Error deleting image:', err);
      toast({ message: 'Failed to delete image', type: 'error' });
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <label className="block text-sm font-medium text-gray-700">{title}</label>
          {resolution && (
            <span title={`Target ${resolution.width}×${resolution.height}, fit ${resolution.fit || 'cover'}${resolution.minSource ? `, min source ${resolution.minSource.width}×${resolution.minSource.height}` : ''}`}>
              <Info
                className="h-4 w-4 text-gray-400"
              />
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {images.length} / {maxImages} images
        </span>
      </div>

      {/* Image Gallery */}
      {allowReordering ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={images} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {images.map((image, index) => (
                <SortableImage
                  key={image}
                  id={image}
                  index={index}
                  hideUnlink={hideUnlink}
                  src={image}
                  onUnlink={() => handleUnlinkImage(index)}
                  onRemove={() => handleRemoveImage(index)}
                  onEdit={() => handleEditImage(index)}
                />
              ))}
              {images.length < maxImages && (
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="h-32 border-2 border-dashed border-gray-300 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
                >
                  {isUploading ? (
                    <div className="text-center">
                      <Loader className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
                      <p className="mt-2 text-xs text-gray-500">{uploadProgress}% Uploading...</p>
                    </div>
                  ) : (
                    <>
                      <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-xs text-gray-500">Add Image</p>
                    </>
                  )}
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((image, index) => (
            <StaticImage
              key={image}
              index={index}
              hideUnlink={hideUnlink}
              src={image}
              onUnlink={() => handleUnlinkImage(index)}
              onRemove={() => handleRemoveImage(index)}
              onEdit={() => handleEditImage(index)}
            />
          ))}
          {images.length < maxImages && (
            <button
              type="button"
              onClick={handleUploadClick}
              className="h-32 border-2 border-dashed border-gray-300 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
            >
              {isUploading ? (
                <div className="text-center">
                  <Loader className="h-8 w-8 text-gray-400 mx-auto animate-spin" />
                  <p className="mt-2 text-xs text-gray-500">{uploadProgress}% Uploading...</p>
                </div>
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-xs text-gray-500">Add Image</p>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        multiple={true}
        className="hidden"
      />

      {/* Upload Button (below gallery) */}
      {images.length < maxImages && (
        <div className="flex space-x-4">
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={isUploading}
            className="flex items-center text-[var(--brand-primary)] hover:text-[var(--brand-tertiary)] transition-colors text-sm disabled:opacity-50"
          >
            <Upload className="h-4 w-4 mr-1" />
            {isUploading ? 'Uploading...' : 'Upload New'}
          </button>
          {allowBrowser && (
            <button
              type="button"
              onClick={() => {
                if (!cloudName || !configured) {
                  toast({ message: 'Cloudinary is not configured for this tenant', type: 'error' });
                  return;
                }
                setIsBrowserOpen(true);
              }}
              className="flex items-center text-blue-600 hover:text-blue-700 transition-colors text-sm"
            >
              <ImageIcon className="h-4 w-4 mr-1" />
              Select from Gallery
            </button>
          )}
        </div>
      )}

      {/* Image Browser Modal */}
      {allowBrowser && isBrowserOpen && (
        <ImageBrowser
          isOpen={isBrowserOpen}
          onClose={() => setIsBrowserOpen(false)}
          onSelect={(selectedImages) => {
            if (images.length + selectedImages.length > maxImages) {
              // If adding all would exceed max, only add as many as possible
              const canAdd = maxImages - images.length;
              if (canAdd <= 0) {
                toast({ message: `You can upload a maximum of ${maxImages} images`, type: 'error' });
                return;
              }
              const newImages = [...images];
              for (let i = 0; i < canAdd; i++) {
                if (!newImages.includes(selectedImages[i])) {
                  newImages.push(selectedImages[i]);
                }
              }
              onChange(newImages);
              toast({ message: `Added ${canAdd} images. Maximum limit reached.`, type: 'info' });
            } else {
              // Add all selected images that aren't already in the array
              const newImages = [...images];
              let addedCount = 0;
              selectedImages.forEach(img => {
                if (!newImages.includes(img)) {
                  newImages.push(img);
                  addedCount++;
                }
              });
              onChange(newImages);
              if (addedCount > 0) {
                toast({ message: `Added ${addedCount} images successfully`, type: 'success' });
              }
            }
          }}
          multiple={true}
          folder={folder}
          preSelectedImages={images}
          resolutionOverride={resolution}
          tenantId={tenantId}
        />
      )}
      {resolution && prepareOpen && prepareSrc && (
        <PrepareImageModal
          isOpen={prepareOpen}
          onClose={() => {
            setPrepareOpen(false);
            if (prepareSrc?.startsWith('blob:')) URL.revokeObjectURL(prepareSrc);
            setPrepareQueue([]);
            setEditIndex(null);
            setEditPublicId(null);
            setEditInitialCrop(null)
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          imageSrc={prepareSrc}
          resolutionOverride={resolution}
          initialCropPixels={editInitialCrop || undefined}
          onConfirm={handlePreparedConfirm}
        />
      )}
      {!configured && (
        <p className="text-sm text-red-600">
          Cloudinary is not configured for this tenant.{' '}
          <a href="/settings/integrations" className="underline">Go to settings</a>
        </p>
      )}
    </div>
  );
};
