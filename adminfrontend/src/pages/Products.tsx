import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Plus,
  Search, 
  Filter, 
  Edit, 
  Copy, 
  Trash2, 
  Eye,
  MapPin,
  Clock,
  Users,
  Package,
  Baby,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { Productprop } from '../types/index.ts';

export const Products = () => {
  const [products, setProducts] = useState<Productprop[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Productprop[]>([]);
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDestination, setFilterDestination] = useState('');
  const [draftFilter, setDraftFilter] = useState<'all' | 'published' | 'draft'>('all');
  const { token, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const destination = searchParams.get('destination');
    const category = searchParams.get('category');
    
    if (destination) {
      setFilterDestination(destination);
    }
    
    if (category) {
      setFilterCategory(category);
    }
    
    fetchProducts();
  }, [token, draftFilter, searchParams]);

  useEffect(() => {
    filterProducts();
  }, [products, searchTerm, filterType, filterCategory, filterDestination]);

  const fetchProducts = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/products?draft=${draftFilter}`,
        {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterProducts = () => {
    let filtered = products.filter(product => {
      const matchesSearch = product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.location.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = !filterType || product.type === filterType;
      const matchesCategory = !filterCategory || product.category.toLowerCase().includes(filterCategory.toLowerCase());
      const matchesDestination = !filterDestination || product.location.toLowerCase().includes(filterDestination.toLowerCase());
      
      return matchesSearch && matchesType && matchesCategory && matchesDestination;
    });
    
    setFilteredProducts(filtered);
  };

  const handleCloneProduct = async (productId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/products/${productId}/clone`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        fetchProducts(); // Refresh the list
      }
    } catch (error) {
      console.error('Error cloning product:', error);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        fetchProducts(); // Refresh the list
      }
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  const uniqueCategories = Array.from(new Set(products.map(p => p.category)));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-2">Manage your tours and experiences</p>
        </div>
        {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
          <Link
            to="/products/new"
            className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors flex items-center"
          >
            <Plus className="h-4 w-4" />
            Add
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDraftFilter('all')}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                draftFilter === 'all' ? 'bg-[var(--brand-secondary)] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Products
            </button>
            <button
              onClick={() => setDraftFilter('published')}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                draftFilter === 'published' ? 'bg-[var(--brand-secondary)] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Published
            </button>
            <button
              onClick={() => setDraftFilter('draft')}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                draftFilter === 'draft' ? 'bg-[var(--brand-secondary)] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Drafts
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            />
          </div>
          
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent w-full"
          >
            <option value="">All Types</option>
            <option value="TOUR">Tours</option>
            <option value="EXPERIENCE">Experiences</option>
          </select>

          <select
            value={filterDestination}
            onChange={(e) => setFilterDestination(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent w-full"
          >
            <option value="">All Destinations</option>
            {Array.from(new Set(products.map(p => p.location))).sort().map(location => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
          
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent w-full"
          >
            <option value="">All Categories</option>
            {uniqueCategories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          
          <div className="flex items-center text-sm text-gray-600">
            <Filter className="h-4 w-4 mr-2" />
            {filteredProducts.length} of {products.length} products
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.map((product) => (
          <div key={product.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="relative h-48">
              <img
                src={product.images[0] || 'https://images.pexels.com/photos/2132227/pexels-photo-2132227.jpeg'}
                alt={product.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  product.type === 'TOUR' 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-purple-100 text-purple-800'
                }`}>
                  {product.type}
                </span>
              </div>
              {product.discountPrice && (
                <div className="absolute top-3 right-3">
                  <span className="bg-[var(--brand-primary)] text-white px-2 py-1 text-xs font-semibold rounded-full">
                    Special Offer
                  </span>
                </div>
              )}
            </div>
            
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">{product.productCode}</span>
                <div className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${product.isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  {product.isDraft && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Draft</span>
                  )}
                </div>
              </div>
              
              <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                {product.title}
                {product.discountPrice && (
                  <span className="ml-2 inline-block bg-[var(--brand-primary)] text-white text-xs px-2 py-0.5 rounded-full">
                    Special Offer
                  </span>
                )}
              </h3>
              
              <div className="space-y-1 mb-3">
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="h-3 w-3 mr-1" />
                  {product.location}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="h-3 w-3 mr-1" />
                  {product.duration}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Users className="h-3 w-3 mr-1" />
                  {product.capacity} capacity
                </div>
                {product.difficulty && (
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                      {product.difficulty}
                    </span>
                  </div>
                )}
              </div>

              {/* Accessibility Indicators */}
              {(product.wheelchairAccessible === 'yes' || product.strollerAccessible === 'yes' || product.serviceAnimalsAllowed === 'yes' || (Array.isArray(product.accessibilityFeatures) && product.accessibilityFeatures.length > 0)) && (
                <div className="flex items-center space-x-2 mb-3">
                  {product.wheelchairAccessible === 'yes' && (
                    <div className="flex items-center text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                      Wheelchair
                    </div>
                  )}
                  {product.strollerAccessible === 'yes' && (
                    <div className="flex items-center text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                      <Baby className="h-3 w-3 mr-1" />
                      Stroller
                    </div>
                  )}
                  {product.serviceAnimalsAllowed === 'yes' && (
                    <div className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                      Service Animal
                    </div>
                  )}
                  {Array.isArray(product.accessibilityFeatures) && product.accessibilityFeatures.length > 0 && (
                    <div className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
                      +{product.accessibilityFeatures.length} Features
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-sm text-gray-600">
                    {product._count?.bookings || 0} bookings
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center">
                  {product._count?.bookings || 0} bookings
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => navigate(`/products/${product.id}/preview`)}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Preview Product"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/products/${product.id}/edit`)}
                    className="p-2 text-gray-400 hover:text-[var(--brand-primary)] transition-colors"
                    title="Edit Product"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
                    <>
                      <button
                        onClick={() => handleCloneProduct(product.id)}
                        className="p-1 text-gray-400 hover:text-blue-600"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      {user?.role === 'ADMIN' && (
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-600 mb-6">Try adjusting your search criteria or create a new product.</p>
          {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
            <Link
              to="/products/new"
              className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors inline-flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add First Product
            </Link>
          )}
        </div>
      )}
    </div>
  );
};