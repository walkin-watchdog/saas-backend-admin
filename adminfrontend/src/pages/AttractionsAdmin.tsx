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
import type { Attraction, Destination } from '@/types';
import useImageRule from '@/hooks/useImageRule';

export const AttractionsAdmin = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredAttractions, setFilteredAttractions] = useState<Attraction[]>([]);
  
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentAttraction, setCurrentAttraction] = useState<Partial<Attraction>>({
    name: '',
    location: '',
    tagline: '',
    description: '',
    image: '',
    bannerImage: '',
    duration: undefined,
    durationUnit: 'minutes',
    destinationId: '',
  });
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { rule: cardRule } = useImageRule(user?.tenantId, 'attraction-card');
  const { rule: bannerRule } = useImageRule(user?.tenantId, 'attraction-banner');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/destinations`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(setDestinations)
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    fetchAttractions();
  }, [token]);

  useEffect(() => {
    if (searchTerm) {
      setFilteredAttractions(
        attractions.filter(attraction =>
          attraction.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          attraction.tagline.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredAttractions(attractions);
    }
  }, [searchTerm, attractions]);

  const fetchAttractions = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/attractions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAttractions(data);
        setFilteredAttractions(data);
      }
    } catch (error) {
      console.error('Error fetching attractions:', error);
      toast({ message: 'Failed to load attractions', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentAttraction.description) {
      toast({ message: 'Please fill in description', type: 'error' });
      return;
    }

    if (!currentAttraction.name) {
      toast({ message: 'Please fill in name', type: 'error' });
      return;
    }

    if (!currentAttraction.location) {
      toast({ message: 'Please fill in location', type: 'error' });
      return;
    }

    if (!currentAttraction.tagline) {
      toast({ message: 'Please fill in tagline', type: 'error' });
      return;
    }

    if (!currentAttraction.image) {
      toast({ message: 'Please choose card image', type: 'error' });
      return;
    }

    if (!currentAttraction.bannerImage) {
      toast({ message: 'Please choose banner image', type: 'error' });
      return;
    }
    
    try {
      const url = modalMode === 'create' 
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/attractions` 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/attractions/${currentAttraction.id}`;
      
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...currentAttraction,
          name: currentAttraction.name,
          location: currentAttraction.location,
          destinationId: currentAttraction.destinationId,
          duration: currentAttraction.duration,
          durationUnit: currentAttraction.durationUnit
        })
      });
      
      if (response.ok) {
        fetchAttractions();
        setShowModal(false);
        toast({ 
          message: `Attraction ${modalMode === 'create' ? 'created' : 'updated'} successfully`, 
          type: 'success' 
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process request');
      }
    } catch (error) {
      console.error('Error saving attraction:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
  };

  const handleEdit = (attraction: Attraction) => {
    setCurrentAttraction(attraction);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/attractions/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        fetchAttractions();
        setDeleteConfirmId(null);
        toast({ message: 'Attraction deleted successfully', type: 'success' });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete attraction');
      }
    } catch (error) {
      console.error('Error deleting attraction:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
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
          <h1 className="text-3xl font-bold text-gray-900">Attractions</h1>
          <p className="text-gray-600 mt-2">Manage attractions for your tours</p>
        </div>
        {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
          <button
            onClick={() => {
              setCurrentAttraction({
                name: '',
                location: '',
                tagline: '',
                description: '',
                image: '',
                bannerImage: '',
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
            placeholder="Search attractions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          />
        </div>
      </div>

      {/* Attractions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAttractions.map(attraction => (
          <div key={attraction.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="relative h-48 bg-gray-100">
              {attraction.image && (
                <img
                  src={attraction.image}
                  alt={attraction.name}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute bottom-4 left-4 text-white">
                <h3 className="text-xl font-bold">{attraction.name}</h3>
                <p className="text-sm text-gray-200 bg-black bg-opacity-30 px-2 py-1 rounded">{attraction._count?.itineraries || 0} products</p>
              </div>
            </div>
            
            <div className="p-4">
              <p className="text-gray-600 text-sm mb-4">{attraction.tagline}</p>
              
              <div className="flex justify-between items-center">
                <button
                  onClick={() => handleEdit(attraction)}
                  className="text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Edit className="h-5 w-5" />
                </button>
                
                {(user?.role === 'ADMIN') && (
                  <>
                    {deleteConfirmId === attraction.id ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-red-600">Confirm?</span>
                        <button
                          onClick={() => handleDelete(attraction.id)}
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
                          if (attraction._count && attraction._count.itineraries > 0) {
                            toast({
                              message: 'Cannot delete a attraction with associated itineraries',
                              type: 'error'
                            });
                          } else {
                            setDeleteConfirmId(attraction.id);
                          }
                        }}
                        className={
                          attraction._count && attraction._count.itineraries > 0 
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

      {filteredAttractions.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No attractions found</h3>
          <p className="text-gray-600">
            {searchTerm 
              ? "No attractions match your search. Try different keywords."
              : "Start by adding your first attraction."
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
                {modalMode === 'create' ? 'Create a New Attraction' : 'Edit Attraction'}
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
                  Name *
                </label>
                <input
                  type="text"
                  value={currentAttraction.name}
                  onChange={(e) => setCurrentAttraction(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="Name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location *
                </label>
                <LocationAutocomplete
                  value={currentAttraction.location || ''}
                  onChange={(location, lat, lng, placeId) => {
                    setCurrentAttraction(prev => ({ 
                      ...prev, 
                      location: location,
                      lat,
                      lng,
                      placeId
                    }));
                  }}
                  placeholder="Attraction Name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  forceInit={showModal && modalMode === 'create'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Destination *
                </label>
                <select
                  required
                  value={currentAttraction.destinationId || ''}
                  onChange={e => setCurrentAttraction(prev => ({
                    ...prev,
                    destinationId: e.target.value
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select a Destination</option>
                  {destinations.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duration *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={currentAttraction.duration ?? ''}
                    onChange={e => setCurrentAttraction(prev => ({
                      ...prev,
                      duration: Number(e.target.value)
                    }))}
                    className="w-full px-3 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duration Unit *
                  </label>
                  <select
                    value={currentAttraction.durationUnit}
                    onChange={e => setCurrentAttraction(prev => ({
                      ...prev,
                      durationUnit: e.target.value
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Short Description *
                </label>
                <input
                  type="text"
                  value={currentAttraction.tagline}
                  onChange={(e) => setCurrentAttraction(prev => ({ ...prev, tagline: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="Short description for attraction card"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Description *
                </label>
                <textarea
                  rows={4}
                  value={currentAttraction.description}
                  onChange={(e) => setCurrentAttraction(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="Detailed description of the attraction"
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Card Image *
                  </label>
                  <ImageUploader
                    images={[currentAttraction.image].filter(Boolean) as string[]}
                    onChange={(images) => {
                      setCurrentAttraction(prev => ({
                        ...prev,
                        image: images[0] || ''
                      }));
                    }}
                    maxImages={1}
                    folder="itinerary"
                    title="Itinerary Images"
                    imageType="attraction-card"
                    tenantId={user?.tenantId}
                  />
                  {cardRule && (
                    <p className="text-xs text-gray-500 mt-1 mb-2">
                      Recommended size: {cardRule.width} × {cardRule.height} px
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">This image appears on the attraction card</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Banner Image *
                  </label>
                  <ImageUploader
                    images={[currentAttraction.bannerImage].filter(Boolean) as string[]}
                    onChange={(images) => {
                      setCurrentAttraction(prev => ({
                        ...prev,
                        bannerImage: images[0] || ''
                      }));
                    }}
                    maxImages={1}
                    folder="itinerary"
                    title="Itinerary Images"
                    imageType="attraction-banner"
                    tenantId={user?.tenantId}
                  />
                  {bannerRule && (
                    <p className="text-xs text-gray-500 mt-1 mb-2">
                      Recommended size: {bannerRule.width} × {bannerRule.height} px
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">This image appears as hero on attraction page</p>
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
                  {modalMode === 'create' ? 'Create Attraction' : 'Update Attraction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};