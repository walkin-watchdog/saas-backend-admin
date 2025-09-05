import { v2 as cloudinary } from 'cloudinary';
import { externalCall } from './externalAdapter';

// Proxy all uploader methods so they automatically use externalCall
const uploader = new Proxy(cloudinary.uploader, {
  get(target, prop, receiver) {
    const orig = Reflect.get(target, prop, receiver);
    if (typeof orig !== 'function') return orig;
    return (...args: any[]) => externalCall('cloudinary', (_s) => orig.apply(target, args));
  },
});

(cloudinary as any).uploader = uploader;

export { cloudinary };

