import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Briefcase, 
  Save, 
  X, 
  Check,
  MapPin,
} from 'lucide-react';
import { useToast } from '../../components/ui/toaster';

interface JobPosting {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  createdAt: string;
  updatedAt: string;
}

export const JobManagement = () => {
  const { token } = useAuth();
  const toast = useToast();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentJob, setCurrentJob] = useState<Partial<JobPosting>>({
    title: '',
    department: '',
    location: '',
    type: '',
    description: '',
    responsibilities: [''],
    requirements: [''],
    benefits: ['']
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs();
  }, [token]);

  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/jobs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setJobs(data);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast({ message: 'Failed to load job postings', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentJob.title || !currentJob.department || !currentJob.location || !currentJob.type || !currentJob.description) {
      toast({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }
    
    // Filter out empty array items
    const jobData = {
      ...currentJob,
      responsibilities: currentJob.responsibilities?.filter(item => item.trim() !== '') || [],
      requirements: currentJob.requirements?.filter(item => item.trim() !== '') || [],
      benefits: currentJob.benefits?.filter(item => item.trim() !== '') || []
    };
    
    try {
      const url = modalMode === 'create' 
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/jobs` 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/jobs/${currentJob.id}`;
      
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(jobData)
      });
      
      if (response.ok) {
        fetchJobs();
        setShowModal(false);
        toast({ 
          message: `Job posting ${modalMode === 'create' ? 'created' : 'updated'} successfully`, 
          type: 'success' 
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process request');
      }
    } catch (error) {
      console.error('Error saving job posting:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
  };

  const handleEdit = (job: JobPosting) => {
    setCurrentJob(job);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/jobs/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        fetchJobs();
        setDeleteConfirmId(null);
        toast({ message: 'Job posting deleted successfully', type: 'success' });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete job posting');
      }
    } catch (error) {
      console.error('Error deleting job posting:', error);
      toast({ message: error instanceof Error ? error.message : 'An error occurred', type: 'error' });
    }
  };

  // Handlers for array fields (responsibilities, requirements, benefits)
  const handleArrayItemChange = (
    arrayName: 'responsibilities' | 'requirements' | 'benefits',
    index: number,
    value: string
  ) => {
    setCurrentJob(prev => {
      const array = [...(prev[arrayName] || [])];
      array[index] = value;
      return { ...prev, [arrayName]: array };
    });
  };

  const handleAddArrayItem = (arrayName: 'responsibilities' | 'requirements' | 'benefits') => {
    setCurrentJob(prev => ({
      ...prev,
      [arrayName]: [...(prev[arrayName] || []), '']
    }));
  };

  const handleRemoveArrayItem = (
    arrayName: 'responsibilities' | 'requirements' | 'benefits',
    index: number
  ) => {
    setCurrentJob(prev => {
      const array = [...(prev[arrayName] || [])];
      array.splice(index, 1);
      return { ...prev, [arrayName]: array };
    });
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
        <h2 className="text-xl font-semibold text-gray-900">Job Postings</h2>
        <button
          onClick={() => {
            setCurrentJob({
              title: '',
              department: '',
              location: '',
              type: '',
              description: '',
              responsibilities: [''],
              requirements: [''],
              benefits: ['']
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

      {jobs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Job Postings</h3>
          <p className="text-gray-600">
            Add your first job posting to display on the Careers page.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center mb-2">
                    <h3 className="text-xl font-bold text-gray-900 mr-3">{job.title}</h3>
                    <span className="bg-[var(--brand-primary)] text-white px-2 py-1 rounded-full text-xs font-medium">
                      {job.type}
                    </span>
                  </div>
                  <div className="flex items-center text-gray-600 mb-4 text-sm">
                    <Briefcase className="h-4 w-4 mr-1" />
                    <span className="mr-4">{job.department}</span>
                    <MapPin className="h-4 w-4 mr-1" />
                    <span>{job.location}</span>
                  </div>
                  <p className="text-gray-600 line-clamp-2 mb-2">{job.description}</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(job)}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  
                  <>
                    {deleteConfirmId === job.id ? (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleDelete(job.id)}
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
                        onClick={() => setDeleteConfirmId(job.id)}
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
                {modalMode === 'create' ? 'Add Job Posting' : 'Edit Job Posting'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Title *
                  </label>
                  <input
                    type="text"
                    value={currentJob.title}
                    onChange={(e) => setCurrentJob(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                    placeholder="e.g., Senior Travel Consultant"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department *
                  </label>
                  <input
                    type="text"
                    value={currentJob.department}
                    onChange={(e) => setCurrentJob(prev => ({ ...prev, department: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                    placeholder="e.g., Sales & Operations"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location *
                  </label>
                  <input
                    type="text"
                    value={currentJob.location}
                    onChange={(e) => setCurrentJob(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                    placeholder="e.g., New Delhi"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Type *
                  </label>
                  <select
                    value={currentJob.type}
                    onChange={(e) => setCurrentJob(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                    required
                  >
                    <option value="">Select job type</option>
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  rows={3}
                  value={currentJob.description}
                  onChange={(e) => setCurrentJob(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                  placeholder="Describe the job position..."
                  required
                />
              </div>
              
              {/* Responsibilities */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Responsibilities
                </label>
                <div className="space-y-2">
                  {currentJob.responsibilities?.map((resp, index) => (
                    <div key={index} className="flex items-center">
                      <input
                        type="text"
                        value={resp}
                        onChange={(e) => handleArrayItemChange('responsibilities', index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                        placeholder={`Responsibility ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveArrayItem('responsibilities', index)}
                        disabled={currentJob.responsibilities?.length === 1}
                        className="px-3 py-2 bg-gray-200 text-gray-600 rounded-r-md hover:bg-gray-300 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleAddArrayItem('responsibilities')}
                    className="text-[var(--brand-primary)] hover:text-[var(--brand-tertiary)] text-sm flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Responsibility
                  </button>
                </div>
              </div>
              
              {/* Requirements */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requirements
                </label>
                <div className="space-y-2">
                  {currentJob.requirements?.map((req, index) => (
                    <div key={index} className="flex items-center">
                      <input
                        type="text"
                        value={req}
                        onChange={(e) => handleArrayItemChange('requirements', index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                        placeholder={`Requirement ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveArrayItem('requirements', index)}
                        disabled={currentJob.requirements?.length === 1}
                        className="px-3 py-2 bg-gray-200 text-gray-600 rounded-r-md hover:bg-gray-300 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleAddArrayItem('requirements')}
                    className="text-[var(--brand-primary)] hover:text-[var(--brand-tertiary)] text-sm flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Requirement
                  </button>
                </div>
              </div>
              
              {/* Benefits */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Benefits
                </label>
                <div className="space-y-2">
                  {currentJob.benefits?.map((benefit, index) => (
                    <div key={index} className="flex items-center">
                      <input
                        type="text"
                        value={benefit}
                        onChange={(e) => handleArrayItemChange('benefits', index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
                        placeholder={`Benefit ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveArrayItem('benefits', index)}
                        disabled={currentJob.benefits?.length === 1}
                        className="px-3 py-2 bg-gray-200 text-gray-600 rounded-r-md hover:bg-gray-300 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleAddArrayItem('benefits')}
                    className="text-[var(--brand-primary)] hover:text-[var(--brand-tertiary)] text-sm flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Benefit
                  </button>
                </div>
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
                  {modalMode === 'create' ? 'Add Job Posting' : 'Update Job Posting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};