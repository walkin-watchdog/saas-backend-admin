import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Tag, 
  Search, 
  Edit, 
  Trash2, 
  Plus,
  X,
  Save,
  Check
} from 'lucide-react';
import { useToast } from '../components/ui/toaster';
import { ImageUploader } from '../components/gallery/ImageUploader';
import type { ExperienceCategory } from '@/types';
import useImageRule from '@/hooks/useImageRule';

export const ExperienceCategoriesAdmin = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [categories, setCategories] = useState<ExperienceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCategories, setFilteredCategories] = useState<ExperienceCategory[]>([]);
  
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentCategory, setCurrentCategory] = useState<Partial<ExperienceCategory>>({
    name: '',
    tagline: '',
    description: '',
    image: '',
    bannerImage: '',
    highlights: []
  });
  const [newHighlight, setNewHighlight] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { rule: cardRule } = useImageRule(user?.tenantId, 'experience-category-card');
  const { rule: bannerRule } = useImageRule(user?.tenantId, 'experience-category-banner');

  useEffect(() => {
    fetchCategories();
  }, [token]);

  useEffect(() => {
    if (searchTerm) {
      setFilteredCategories(
        categories.filter(category =>
          category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          category.tagline.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredCategories(categories);
    }
  }, [searchTerm, categories]);

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/experience-categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
        setFilteredCategories(data);
      }
    } catch (error) {
      console.error('Error fetching experience categories:', error);
      toast({ message: 'Failed to load experience categories', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentCategory.name || !currentCategory.tagline || 
        !currentCategory.description || !currentCategory.image ||
        !currentCategory.bannerImage) {
      toast({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }
    
    try {
      const url = modalMode === 'create' 
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/experience-categories` 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/experience-categories/${currentCategory.id}`;
      
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(currentCategory)
      });
      
      if (response.ok) {
        fetchCategories();
        setShowModal(false);
        toast({ 
          message: `Experience category ${modalMode === 'create' ? 'created' : 'updated'} successfully`, 
          type: 'success' 
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process request');
      }
    } catch (error) {
      console.error('Error saving experience category:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
  };

  const handleEdit = (category: ExperienceCategory) => {
    setCurrentCategory(category);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/experience-categories/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        fetchCategories();
        setDeleteConfirmId(null);
        toast({ message: 'Experience category deleted successfully', type: 'success' });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete experience category');
      }
    } catch (error) {
      console.error('Error deleting experience category:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
  };

  const handleAddHighlight = () => {
    if (newHighlight.trim()) {
      setCurrentCategory(prev => ({
        ...prev,
        highlights: [...(prev.highlights || []), newHighlight.trim()]
      }));
      setNewHighlight('');
    }
  };

  const handleRemoveHighlight = (index: number) => {
    setCurrentCategory(prev => ({
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
          <h1 className="text-3xl font-bold text-gray-900">Experience Categories</h1>
          <p className="text-gray-600 mt-2">Manage categories for your experiences</p>
        </div>
        {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
          <button
            onClick={() => {
              setCurrentCategory({
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
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          />
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCategories.map(category => (
          <div key={category.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="relative h-48 bg-gray-100">
              {category.image && (
                <img
                  src={category.image}
                  alt={category.name}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute bottom-4 left-4 text-white">
                <h3 className="text-xl font-bold">{category.name}</h3>
                <p className="text-sm text-gray-200 bg-black bg-opacity-30 px-2 py-1 rounded">{category._count?.products || 0} products</p>
              </div>
            </div>
            
            <div className="p-4">
              <p className="text-gray-600 text-sm mb-4">{category.tagline}</p>
              
              <div className="flex justify-between items-center">
                <button
                  onClick={() => handleEdit(category)}
                  className="text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Edit className="h-5 w-5" />
                </button>
                
                {(user?.role === 'ADMIN') && (
                  <>
                    {deleteConfirmId === category.id ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-red-600">Confirm?</span>
                        <button
                          onClick={() => handleDelete(category.id)}
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
                          if (category._count && category._count.products > 0) {
                            toast({
                              message: 'Cannot delete a category with associated products',
                              type: 'error'
                            });
                          } else {
                            setDeleteConfirmId(category.id);
                          }
                        }}
                        className={
                          category._count && category._count.products > 0 
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

      {filteredCategories.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Tag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No experience categories found</h3>
          <p className="text-gray-600">
            {searchTerm 
              ? "No categories match your search. Try different keywords."
              : "Start by adding your first experience category."
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
                {modalMode === 'create' ? 'Add New Experience Category' : 'Edit Experience Category'}
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
                  Category Name *
                </label>
                <input
                  type="text"
                  value={currentCategory.name}
                  onChange={(e) => setCurrentCategory(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="e.g., Adventure & Nature"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Short Description *
                </label>
                <input
                  type="text"
                  value={currentCategory.tagline}
                  onChange={(e) => setCurrentCategory(prev => ({ ...prev, tagline: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="Short description for category card"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Description *
                </label>
                <textarea
                  rows={4}
                  value={currentCategory.description}
                  onChange={(e) => setCurrentCategory(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="Detailed description of the category"
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Card Image *
                  </label>
                  <ImageUploader
                    images={[currentCategory.image].filter(Boolean) as string[]}
                    onChange={(images) => {
                      setCurrentCategory(prev => ({
                        ...prev,
                        image: images[0] || ''
                      }));
                    }}
                    maxImages={1}
                    folder="experiences"
                    title="Category Images"
                    imageType="experience-category-card"
                    tenantId={user?.tenantId}
                  />
                  {cardRule && (
                    <p className="text-xs text-gray-500 mt-1 mb-2">
                      Recommended size: {cardRule.width} × {cardRule.height} px
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">This image appears on the category card</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Banner Image *
                  </label>
                  <ImageUploader
                    images={[currentCategory.bannerImage].filter(Boolean) as string[]}
                    onChange={(images) => {
                      setCurrentCategory(prev => ({
                        ...prev,
                        bannerImage: images[0] || ''
                      }));
                    }}
                    maxImages={1}
                    folder="experiences"
                    title="Category Images"
                    imageType="experience-category-banner"
                    tenantId={user?.tenantId}
                  />
                  {bannerRule && (
                    <p className="text-xs text-gray-500 mt-1 mb-2">
                      Recommended size: {bannerRule.width} × {bannerRule.height} px
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">This image appears as hero on category page</p>
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
                  
                  {currentCategory.highlights && currentCategory.highlights.length > 0 ? (
                    <div className="border border-gray-200 rounded-md p-3">
                      <ul className="space-y-2">
                        {currentCategory.highlights.map((highlight, index) => (
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
                  {modalMode === 'create' ? 'Create Category' : 'Update Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};