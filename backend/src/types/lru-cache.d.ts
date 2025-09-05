declare module 'lru-cache' {
  export class LRUCache<K = any, V = any> {
    constructor(options?: any);
    get(key: K): V | undefined;
    set(key: K, value: V, options?: any): void;
    delete(key: K): boolean;
    clear(): void;
    keys(): IterableIterator<K> | K[];
    readonly size: number;
    values(): IterableIterator<V> | V[];
  }
}
