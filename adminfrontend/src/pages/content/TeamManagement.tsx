import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  Plus,
  Edit,
  Trash2,
  User,
  Save,
  X,
  Check
} from 'lucide-react';
import { useToast } from '../../components/ui/toaster';
import { ImageUploader } from '../../components/gallery/ImageUploader';
import useImageRule from '@/hooks/useImageRule';

interface TeamMember {
  id: string;
  name: string;
  jobTitle: string;
  description: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export const TeamManagement = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentMember, setCurrentMember] = useState<Partial<TeamMember>>({
    name: '',
    jobTitle: '',
    description: '',
    imageUrl: ''
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { rule: teamRule } = useImageRule(user?.tenantId, 'team');

  useEffect(() => {
    fetchTeamMembers();
  }, [token]);

  const fetchTeamMembers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/about`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (error) {
      console.error('Error fetching team members:', error);
      toast({ message: 'Failed to load team members', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentMember.name || !currentMember.jobTitle || !currentMember.description) {
      toast({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }
    
    try {
      const url = modalMode === 'create' 
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/about` 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/about/${currentMember.id}`;
      
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(currentMember)
      });
      
      if (response.ok) {
        fetchTeamMembers();
        setShowModal(false);
        toast({ 
          message: `Team member ${modalMode === 'create' ? 'created' : 'updated'} successfully`, 
          type: 'success' 
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process request');
      }
    } catch (error) {
      console.error('Error saving team member:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
  };

  const handleEdit = (member: TeamMember) => {
    setCurrentMember(member);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/about/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        fetchTeamMembers();
        setDeleteConfirmId(null);
        toast({ message: 'Team member deleted successfully', type: 'success' });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete team member');
      }
    } catch (error) {
      console.error('Error deleting team member:', error);
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Team Members</h2>
        <button
          onClick={() => {
            setCurrentMember({
              name: '',
              jobTitle: '',
              description: '',
              imageUrl: ''
            });
            setModalMode('create');
            setShowModal(true);
          }}
          className="bg-[var(--brand-primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors flex items-center"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add
        </button>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Team Members</h3>
          <p className="text-gray-600">
            Add your first team member to display on the About page.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {members.map((member) => (
            <div key={member.id} className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              {member.imageUrl && (
                <img 
                  src={member.imageUrl} 
                  alt={member.name} 
                  className="w-full h-48 object-cover" 
                />
              )}
              
              <div className="p-4">
                <h3 className="font-bold text-gray-900">{member.name}</h3>
                <p className="text-[var(--brand-primary)] font-medium mb-2">{member.jobTitle}</p>
                <p className="text-gray-600 text-sm line-clamp-3 mb-4">{member.description}</p>
                
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => handleEdit(member)}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  
                  <>
                    {deleteConfirmId === member.id ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-red-600">Confirm?</span>
                        <button
                          onClick={() => handleDelete(member.id)}
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
                        onClick={() => setDeleteConfirmId(member.id)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                  </>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-200 px-6 py-4">
              <h2 className="text-xl font-bold text-gray-900">
                {modalMode === 'create' ? 'Add Team Member' : 'Edit Team Member'}
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
                  value={currentMember.name}
                  onChange={(e) => setCurrentMember(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Title *
                </label>
                <input
                  type="text"
                  value={currentMember.jobTitle}
                  onChange={(e) => setCurrentMember(prev => ({ ...prev, jobTitle: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  rows={4}
                  value={currentMember.description}
                  onChange={(e) => setCurrentMember(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Image
                </label>
                <ImageUploader
                  images={currentMember.imageUrl ? [currentMember.imageUrl] : []}
                  onChange={(images) => {
                    setCurrentMember(prev => ({
                      ...prev,
                      imageUrl: images[0] || ''
                    }));
                  }}
                  maxImages={1}
                  folder="team"
                  title="Team Member Image"
                  imageType="team"
                  tenantId={user?.tenantId}
                />
                {teamRule && (
                  <p className="text-xs text-gray-500 mt-1 mb-2">
                    Recommended size: {teamRule.width} × {teamRule.height} px
                  </p>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
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
                  {modalMode === 'create' ? 'Add Team Member' : 'Update Team Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};