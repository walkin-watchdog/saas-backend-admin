export type CropRect = { x: number; y: number; width: number; height: number };
export type NormalizedCrop = { x: number; y: number; w: number; h: number };
export type PixelCrop = { x: number; y: number; w: number; h: number };

export function toNormalizedCrop(
  rect: CropRect,
  sourceW: number,
  sourceH: number
): NormalizedCrop {
  return {
    x: Math.max(0, Math.min(1, rect.x / sourceW)),
    y: Math.max(0, Math.min(1, rect.y / sourceH)),
    w: Math.max(0, Math.min(1, rect.width / sourceW)),
    h: Math.max(0, Math.min(1, rect.height / sourceH)),
  };
}

export function buildCloudinaryUrlFromPublicId(
  cloudName: string,
  publicId: string,
  opts: {
    frameW: number;
    frameH: number;
    fit?: 'cover' | 'contain';
    normCrop?: NormalizedCrop;
    pixelCrop?: PixelCrop;
    format?: 'webp' | 'png' | 'auto';
    quality?: number | 'auto';
    dprAuto?: boolean;
    padBackground?: 'white' | 'black' | string;
  }
): string {
  const {
    frameW,
    frameH,
    fit = 'cover',
    normCrop,
    format = 'webp',
    quality = 'auto',
    dprAuto = true,
  } = opts;

  const base = `https://res.cloudinary.com/${cloudName}/image/upload`;

  const steps: string[] = [];
  const stepCrop: string[] = [];
  const stepSize: string[] = [];

  if (opts.pixelCrop) {
    const { x, y, w, h } = opts.pixelCrop;
    stepCrop.push(
      `c_crop`,
      `g_north_west`,
      `x_${Math.round(x)}`,
      `y_${Math.round(y)}`,
      `w_${Math.round(w)}`,
      `h_${Math.round(h)}`
    );
    steps.push(stepCrop.join(','));
  } else if (normCrop) {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const xRel = +clamp01(normCrop.x).toFixed(6);
    const yRel = +clamp01(normCrop.y).toFixed(6);
    const wRel = +clamp01(normCrop.w).toFixed(6);
    const hRel = +clamp01(normCrop.h).toFixed(6);
    stepCrop.push(`c_crop`,`g_north_west`,`x_${xRel}`,`y_${yRel}`,`w_${wRel}`,`h_${hRel}`);
    steps.push(stepCrop.join(','));
  }

  if (fit === 'contain') {
    stepSize.push(`c_pad`, `w_${frameW}`, `h_${frameH}`);
    if (opts.padBackground) stepSize.push(`b_${opts.padBackground}`);
  } else {
    stepSize.push(`c_fill`, `w_${frameW}`, `h_${frameH}`);
    if (!normCrop) stepSize.push(`g_auto`);
  }
  
  stepSize.push(`q_${quality === 'auto' ? 'auto' : quality}`);
  if (dprAuto) stepSize.push('dpr_auto');
  if (format === 'auto') stepSize.push('f_auto');
  else stepSize.push(`f_${format}`);
  steps.push(stepSize.join(','));

  return `${base}/${steps.join('/')}/${publicId}`;
}

export function aspectRatio(w: number, h: number): number {
  return w > 0 && h > 0 ? w / h : 0;
}

export function aspectNeedsCrop(
  srcW: number,
  srcH: number,
  frameW: number,
  frameH: number,
  tolerance = 0.01
): boolean {
  const a = aspectRatio(srcW, srcH);
  const b = aspectRatio(frameW, frameH);
  return Math.abs(a - b) > tolerance;
}