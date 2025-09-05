import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  MapPin, 
  Search, 
  Edit, 
  Trash2, 
  Plus,
  X,
  Save,
  Check,
} from 'lucide-react';
import { useToast } from '../components/ui/toaster';
import { ImageUploader } from '../components/gallery/ImageUploader';
import { LocationAutocomplete } from '../components/ui/LocationAutocomplete';
import type { Destination } from '@/types';
import useImageRule from '@/hooks/useImageRule';

export const DestinationsAdmin = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredDestinations, setFilteredDestinations] = useState<Destination[]>([]);
  
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentDestination, setCurrentDestination] = useState<Partial<Destination>>({
    name: '',
    tagline: '',
    description: '',
    image: '',
    bannerImage: '',
    highlights: []
  });
  const [newHighlight, setNewHighlight] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { rule: cardRule } = useImageRule(user?.tenantId, 'destination-card');
  const { rule: bannerRule } = useImageRule(user?.tenantId, 'destination-banner');

  useEffect(() => {
    fetchDestinations();
  }, [token]);

  useEffect(() => {
    if (searchTerm) {
      setFilteredDestinations(
        destinations.filter(destination =>
          destination.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          destination.tagline.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredDestinations(destinations);
    }
  }, [searchTerm, destinations]);

  const fetchDestinations = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/destinations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDestinations(data);
        setFilteredDestinations(data);
      }
    } catch (error) {
      console.error('Error fetching destinations:', error);
      toast({ message: 'Failed to load destinations', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentDestination.name || !currentDestination.tagline || 
        !currentDestination.description || !currentDestination.image ||
        !currentDestination.bannerImage) {
      toast({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }
    
    try {
      const url = modalMode === 'create' 
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/destinations` 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/destinations/${currentDestination.id}`;
      
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(currentDestination)
      });
      
      if (response.ok) {
        fetchDestinations();
        setShowModal(false);
        toast({ 
          message: `Destination ${modalMode === 'create' ? 'created' : 'updated'} successfully`, 
          type: 'success' 
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process request');
      }
    } catch (error) {
      console.error('Error saving destination:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
  };

  const handleEdit = (destination: Destination) => {
    setCurrentDestination(destination);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/destinations/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        fetchDestinations();
        setDeleteConfirmId(null);
        toast({ message: 'Destination deleted successfully', type: 'success' });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete destination');
      }
    } catch (error) {
      console.error('Error deleting destination:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
  };

  const handleAddHighlight = () => {
    if (newHighlight.trim()) {
      setCurrentDestination(prev => ({
        ...prev,
        highlights: [...(prev.highlights || []), newHighlight.trim()]
      }));
      setNewHighlight('');
    }
  };

  const handleRemoveHighlight = (index: number) => {
    setCurrentDestination(prev => ({
      ...prev,
      highlights: prev.highlights?.filter((_, i) => i !== index)
    }));
  };

  

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
          <h1 className="text-3xl font-bold text-gray-900">Destinations</h1>
          <p className="text-gray-600 mt-2">Manage destinations for your tours</p>
        </div>
        {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
          <button
            onClick={() => {
              setCurrentDestination({
                name: '',
                tagline: '',
                description: '',
                image: '',
                bannerImage: '',
                highlights: []
              });
              setModalMode('create');
              setShowModal(true);
            }}
            className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search destinations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          />
        </div>
      </div>

      {/* Destinations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDestinations.map(destination => (
          <div key={destination.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="relative h-48 bg-gray-100">
              {destination.image && (
                <img
                  src={destination.image}
                  alt={destination.name}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute bottom-4 left-4 text-white">
                <h3 className="text-xl font-bold">{destination.name}</h3>
                <p className="text-sm text-gray-200 bg-black bg-opacity-30 px-2 py-1 rounded">{destination._count?.products || 0} products</p>
              </div>
            </div>
            
            <div className="p-4">
              <p className="text-gray-600 text-sm mb-4">{destination.tagline}</p>
              
              <div className="flex justify-between items-center">
                <button
                  onClick={() => handleEdit(destination)}
                  className="text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Edit className="h-5 w-5" />
                </button>
                
                {(user?.role === 'ADMIN') && (
                  <>
                    {deleteConfirmId === destination.id ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-red-600">Confirm?</span>
                        <button
                          onClick={() => handleDelete(destination.id)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-gray-600 hover:text-gray-800 transition-colors"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (destination._count && destination._count.products > 0) {
                            toast({
                              message: 'Cannot delete a destination with associated products',
                              type: 'error'
                            });
                          } else {
                            setDeleteConfirmId(destination.id);
                          }
                        }}
                        className={
                          destination._count && destination._count.products > 0 
                            ? "text-gray-400 cursor-not-allowed"
                            : "text-red-600 hover:text-red-800 transition-colors"
                        }
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredDestinations.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No destinations found</h3>
          <p className="text-gray-600">
            {searchTerm 
              ? "No destinations match your search. Try different keywords."
              : "Start by adding your first destination."
            }
          </p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-200 px-6 py-4">
              <h2 className="text-xl font-bold text-gray-900">
                {modalMode === 'create' ? 'Create a New Destination' : 'Edit Destination'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Destination Name *
                </label>
                <LocationAutocomplete
                  value={currentDestination.name || ''}
                  onChange={(location, lat, lng, placeId) => {
                    setCurrentDestination(prev => ({ 
                      ...prev, 
                      name: location,
                      lat,
                      lng,
                      placeId
                    }));
                  }}
                  placeholder="Destination Name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  forceInit={showModal && modalMode === 'create'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Short Description *
                </label>
                <input
                  type="text"
                  value={currentDestination.tagline}
                  onChange={(e) => setCurrentDestination(prev => ({ ...prev, tagline: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="Short description for destination card"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Description *
                </label>
                <textarea
                  rows={4}
                  value={currentDestination.description}
                  onChange={(e) => setCurrentDestination(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="Detailed description of the destination"
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Card Image *
                  </label>
                  <ImageUploader
                    images={[currentDestination.image].filter(Boolean) as string[]}
                    onChange={(images) => {
                      setCurrentDestination(prev => ({
                        ...prev,
                        image: images[0] || ''
                      }));
                    }}
                    maxImages={1}
                    folder="destinations"
                    title="Destination Images"
                    imageType="destination-card"
                    tenantId={user?.tenantId}
                  />
                  {cardRule && (
                    <p className="text-xs text-gray-500 mt-1 mb-2">
                      Recommended size: {cardRule.width} × {cardRule.height} px
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">This image appears on the destination card</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Banner Image *
                  </label>
                  <ImageUploader
                    images={[currentDestination.bannerImage].filter(Boolean) as string[]}
                    onChange={(images) => {
                      setCurrentDestination(prev => ({
                        ...prev,
                        bannerImage: images[0] || ''
                      }));
                    }}
                    maxImages={1}
                    folder="destinations"
                    title="Destination Images"
                    imageType="destination-banner"
                    tenantId={user?.tenantId}
                  />
                  {bannerRule && (
                    <p className="text-xs text-gray-500 mt-1 mb-2">
                      Recommended size: {bannerRule.width} × {bannerRule.height} px
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">This image appears as hero on destination page</p>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Highlights
                </label>
                <div className="space-y-2">
                  <div className="flex">
                    <input
                      type="text"
                      value={newHighlight}
                      onChange={(e) => setNewHighlight(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                      placeholder="Add a highlight"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddHighlight();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddHighlight}
                      className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-r-md hover:bg-[var(--brand-tertiary)] transition-colors"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                  
                  {currentDestination.highlights && currentDestination.highlights.length > 0 ? (
                    <div className="border border-gray-200 rounded-md p-3">
                      <ul className="space-y-2">
                        {currentDestination.highlights.map((highlight, index) => (
                          <li key={index} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                            <span className="text-sm">{highlight}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveHighlight(index)}
                              className="text-red-500 hover:text-red-700 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No highlights added yet</p>
                  )}
                </div>
              </div>
              
              <div className="border-t border-gray-200 pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] transition-colors flex items-center"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {modalMode === 'create' ? 'Create Destination' : 'Update Destination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};