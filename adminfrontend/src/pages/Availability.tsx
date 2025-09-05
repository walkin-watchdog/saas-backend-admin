import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { Product, BlockedDate, AvailabilitySubrange } from '../types';
import { ProductCard } from '../components/availability/ProductCard';

export const Availability: React.FC = () => {
  const { token } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [allSubranges, setAllSubranges] = useState<AvailabilitySubrange[]>([]);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Fetch data
  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        // Products and blocked dates
        const [prRes, bdRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/products`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${import.meta.env.VITE_API_URL}/availability/blocked`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        
        if (!prRes.ok || !bdRes.ok) throw new Error('Fetch failed');
        
        const prJson = await prRes.json();
        const bdJson = await bdRes.json();
        setProducts(prJson);
        setBlockedDates(bdJson.blockedDates || []);
        
        // Fetch subranges for all products
        const subrangePromises = prJson.map((product: Product) =>
          fetch(`${import.meta.env.VITE_API_URL}/availability/product/${product.id}/subranges`, {
            headers: { Authorization: `Bearer ${token}` } 
          })
          .then(res => res.ok ? res.json() : [])
          .catch(() => [])
        );
        
        const allSubrangeResults = await Promise.all(subrangePromises);
        const flatSubranges = allSubrangeResults.flat();
        setAllSubranges(flatSubranges);

      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, [token]);

  const handleRefresh = () => {
    // Re-fetch all data
    const fetchAll = async () => {
      try {
        const [prRes, bdRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/products`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${import.meta.env.VITE_API_URL}/availability/blocked`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        
        if (!prRes.ok || !bdRes.ok) throw new Error('Fetch failed');
        
        const prJson = await prRes.json();
        const bdJson = await bdRes.json();
        setProducts(prJson);
        setBlockedDates(bdJson.blockedDates || []);
        
        // Fetch subranges for all products
        const subrangePromises = prJson.map((product: Product) =>
          fetch(`${import.meta.env.VITE_API_URL}/availability/product/${product.id}/subranges`, { 
            headers: { Authorization: `Bearer ${token}` } 
          })
          .then(res => res.ok ? res.json() : [])
          .catch(() => [])
        );
        
        const allSubrangeResults = await Promise.all(subrangePromises);
        const flatSubranges = allSubrangeResults.flat();
        setAllSubranges(flatSubranges);
      } catch (err) {
        console.error(err);
      }
    };
    fetchAll();
  };

  // Filter products based on search
  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.productCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-12 w-12 border-b-2 border-[var(--brand-primary)] rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Availability Management</h1>
          <p className="text-gray-600">Manage product availability, status, and block dates</p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <Search className="h-5 w-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search products…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)] transition-colors"
          />
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Showing {filteredProducts.length} of {products.length} products
        {searchTerm && ` matching "${searchTerm}"`}
      </div>

      {/* Product Cards Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            {searchTerm ? 'No products found matching your search.' : 'No products available.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              blockedDates={blockedDates}
              subranges={allSubranges}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
};
