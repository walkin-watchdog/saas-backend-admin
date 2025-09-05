import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { X, Save, Plus } from 'lucide-react';
import { useToast } from '../ui/toaster';
import { ImageUploader } from '../gallery/ImageUploader';
import type { ExperienceCategory, ExperienceCategoryModalProps } from '@/types';
import useImageRule from '@/hooks/useImageRule';

export const ExperienceCategoryModal = ({ isOpen, onClose, onSelect, onCreated}: ExperienceCategoryModalProps) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [categories, setCategories] = useState<ExperienceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newHighlight, setNewHighlight] = useState('');
  
  const [newCategory, setNewCategory] = useState<Partial<ExperienceCategory>>({
    name: '',
    tagline: '',
    description: '',
    image: '',
    bannerImage: '',
    highlights: []
  });
  const { rule: cardRule } = useImageRule(user?.tenantId, 'experience-category-card');
  const { rule: bannerRule } = useImageRule(user?.tenantId, 'experience-category-banner');

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen, token]);

  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/experience-categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching experience categories:', error);
      toast({ message: 'Failed to load experience categories', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name || !newCategory.tagline || 
        !newCategory.description || !newCategory.image ||
        !newCategory.bannerImage) {
      toast({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/experience-categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newCategory)
      });
      
      if (response.ok) {
        const createdCategory = await response.json();
        toast({ message: 'Experience category created successfully', type: 'success' });
        
        // Add to the list and select it
        setCategories([...categories, createdCategory]);
        onSelect(createdCategory);
        if (onCreated) onCreated();
        // Reset form and close it
        setNewCategory({
          name: '',
          tagline: '',
          description: '',
          image: '',
          bannerImage: '',
          highlights: []
        });
        setShowCreateForm(false);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create experience category');
      }
    } catch (error) {
      console.error('Error creating experience category:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
  };

  const handleAddHighlight = () => {
    if (newHighlight.trim()) {
      setNewCategory(prev => ({
        ...prev,
        highlights: [...(prev.highlights || []), newHighlight.trim()]
      }));
      setNewHighlight('');
    }
  };

  const handleRemoveHighlight = (index: number) => {
    setNewCategory(prev => ({
      ...prev,
      highlights: prev.highlights?.filter((_, i) => i !== index)
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-gray-200 px-6 py-4">
          <h2 className="text-xl font-bold text-gray-900">
            {showCreateForm ? 'Create New Experience Category' : 'Select Experience Category'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="p-6">
          {!showCreateForm ? (
            <>
              {/* List of existing categories */}
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-primary)]"></div>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="flex items-center text-[var(--brand-primary)] hover:text-[var(--brand-tertiary)]"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create New Experience Category
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                    {categories.map((category) => (
                      <div 
                        key={category.id}
                        onClick={() => onSelect(category)}
                        className="border rounded-lg p-3 cursor-pointer hover:border-[var(--brand-primary)] transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="h-12 w-12 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                            {category.image && (
                              <img
                                src={category.image}
                                alt={category.name}
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900">{category.name}</h3>
                            <p className="text-sm text-gray-500">{category.tagline}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {categories.length === 0 && (
                      <div className="col-span-2 text-center py-8 text-gray-500">
                        No experience categories found. Create your first category.
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            /* Create new category form */
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
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
                  value={newCategory.tagline}
                  onChange={(e) => setNewCategory(prev => ({ ...prev, tagline: e.target.value }))}
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
                  value={newCategory.description}
                  onChange={(e) => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
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
                    images={[newCategory.image].filter(Boolean) as string[]}
                    onChange={(images) => {
                      setNewCategory(prev => ({
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
                    images={[newCategory.bannerImage].filter(Boolean) as string[]}
                    onChange={(images) => {
                      setNewCategory(prev => ({
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
                  
                  {newCategory.highlights && newCategory.highlights.length > 0 ? (
                    <div className="border border-gray-200 rounded-md p-3">
                      <ul className="space-y-2">
                        {newCategory.highlights.map((highlight, index) => (
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
              
              <div className="flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-md hover:bg-[var(--brand-tertiary)] transition-colors flex items-center"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Create Category
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};