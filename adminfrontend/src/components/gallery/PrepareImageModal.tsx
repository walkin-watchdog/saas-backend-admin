import React, { useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { X, ZoomIn, ZoomOut, RefreshCcw, Loader } from 'lucide-react';
import type { ResolutionSpec } from '@/types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  resolutionOverride: ResolutionSpec;
  sourceNatural?: { width: number; height: number };
  initialCropPixels?: { x: number; y: number; w: number; h: number };
  onConfirm: (payload: {
    pixelCrop: { x: number; y: number; w: number; h: number };
    effective: { frameW: number; frameH: number; srcW: number; srcH: number };
  }) => void;
};

export const PrepareImageModal: React.FC<Props> = ({
  isOpen,
  onClose,
  imageSrc,
  resolutionOverride,
  sourceNatural,
  initialCropPixels,
  onConfirm
}) => {
  const resolution = resolutionOverride;
  const initialCroppedAreaPixels = initialCropPixels
    ? {
        x: initialCropPixels.x,
        y: initialCropPixels.y,
        width: initialCropPixels.w,
        height: initialCropPixels.h,
      }
    : undefined;
  const [crop, setCrop] = useState<{ x: number; y: number }>(() =>
    initialCropPixels
      ? { x: initialCropPixels.x, y: initialCropPixels.y }
      : { x: 0, y: 0 }
  );
  const [zoom, setZoom] = useState<number>(() =>
    initialCropPixels
      ? resolution.width / initialCropPixels.w
      : 1
  );
  const [cropped, setCropped] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(sourceNatural || null);
  const [naturalReady, setNaturalReady] = useState<boolean>(!!sourceNatural);

  if (!isOpen) return null;

  const aspect = resolution.width / resolution.height;
  const fit = resolution.fit || 'cover';
  const effNatural = natural || undefined;
  const tooSmall =
    !!effNatural &&
    !!resolution.minSource &&
    (effNatural.width < resolution.minSource.width ||
      effNatural.height < resolution.minSource.height);

  useEffect(() => {
    if (naturalReady && !initialCropPixels) {
      const srcW = (natural?.width ?? 0);
      const srcH = (natural?.height ?? 0);
      if (srcW && srcH) {
        const min = fit === 'contain'
          ? 1
          : Math.max(resolution.width / srcW, resolution.height / srcH);
        setZoom(min);
      }
    }
  }, [naturalReady, natural, resolution.width, resolution.height, initialCropPixels]);

  useEffect(() => {
    if (initialCropPixels) setCrop({ x: initialCropPixels.x, y: initialCropPixels.y });
  }, [initialCropPixels]);

  useEffect(() => {
    if (sourceNatural) {
      setNatural(sourceNatural);
      setNaturalReady(true);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setNatural({ width: img.naturalWidth, height: img.naturalHeight });
        setNaturalReady(true);
      }
    };
    img.onerror = () => {
      if (!cancelled) setNaturalReady(true);
    };
    img.src = imageSrc;
    return () => { cancelled = true; };
  }, [imageSrc, sourceNatural]);
  
  const minZoom = (() => {
    if (fit === 'contain') return 1;
    const srcW = effNatural?.width || 0;
    const srcH = effNatural?.height || 0;
    if (!srcW || !srcH) return 1;
    const zw = resolution.width / srcW;
    const zh = resolution.height / srcH;
    return Math.max(zw, zh);
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="font-semibold text-gray-900">Prepare Image</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="relative w-full h-[50vh] bg-gray-100 rounded-md overflow-hidden">
            {naturalReady ? (
              <div className="relative w-full h-[50vh] bg-gray-100 rounded-md overflow-hidden">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect}
                  cropShape="rect"
                  showGrid
                  objectFit={
                    effNatural!.width === resolution.width &&
                    effNatural!.height === resolution.height
                      ? 'contain'
                      : (fit === 'contain' ? 'contain' : 'cover')
                  }
                  minZoom={minZoom}
                  restrictPosition
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedAreaPixels) => {
                    setCropped(croppedAreaPixels);
                  }}
                  initialCroppedAreaPixels={initialCroppedAreaPixels}
                />
              </div>
            ) : <div className="absolute inset-0 flex items-center justify-center">
                  <Loader className="animate-spin h-8 w-8 text-gray-400" />
                </div>}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Frame: <span className="font-medium">{resolution.width}×{resolution.height}</span>
              {sourceNatural && (
                <>
                  {' · '}Original: <span className="font-medium">{sourceNatural.width}×{sourceNatural.height}</span>
                </>
              )}
              {tooSmall && (
                <span className="ml-2 px-2 py-0.5 rounded bg-red-100 text-red-800">
                  Image smaller than minimum {resolution.minSource!.width}×{resolution.minSource!.height}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(minZoom, +(z - 0.1).toFixed(2)))}
                className="px-2 py-1 border rounded text-gray-700 hover:bg-gray-50"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <div className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</div>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(8, +(z + 0.1).toFixed(2)))}
                className="px-2 py-1 border rounded text-gray-700 hover:bg-gray-50"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { setZoom(minZoom); setCrop({ x: 0, y: 0 }); }}
                className="ml-2 px-3 py-1 border rounded text-gray-700 hover:bg-gray-50"
              >
                <RefreshCcw className="h-4 w-4 inline mr-1" /> Reset
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!cropped) return;
              const { width, height, x, y } = cropped;
              const srcW = effNatural?.width;
              const srcH = effNatural?.height;
              if (!srcW || !srcH) {
                return;
              }

              onConfirm({
                pixelCrop: { x, y, w: width, h: height },
                effective: { frameW: resolution.width, frameH: resolution.height, srcW, srcH },
              });
            }}
            className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] disabled:opacity-50"
            disabled={!naturalReady || tooSmall}
          >
            Use Crop
          </button>
        </div>
      </div>
    </div>
  );
};