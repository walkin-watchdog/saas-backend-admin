import { useState, useEffect } from 'react';
import { Search, Filter, Calendar, MapPin, Users, DollarSign, Download, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { TripRequest } from '../types/index.ts';


export const Requests = () => {
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const { token, user } = useAuth();

  useEffect(() => {
    fetchRequests();
  }, [token]);

  const deleteRequest = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to delete this request?')) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/trip-requests/${requestId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      if (response.ok) fetchRequests();
    } catch (error) {
      console.error('Error deleting request:', error);
    }
  };

  const fetchRequests = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/trip-requests`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      }
    } catch (error) {
      console.error('Error fetching trip requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateRequestStatus = async (requestId: string, status: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/trip-requests/${requestId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        fetchRequests(); // Refresh the data
      }
    } catch (error) {
      console.error('Error updating request status:', error);
    }
  };

  const exportRequests = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/trip-requests/export`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Convert to CSV
        const escapeCSV = (val: any) => {
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        const headers = Object.keys(data[0]).filter(key => key !== 'ID');
        const csv = [
          headers.join(','),
          ...data.map((row: any) =>
            headers.map(key => escapeCSV(row[key])).join(',')
          )
        ].join('\n');
        
        // Download file
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trip-requests-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting requests:', error);
    }
  };

  const filteredRequests = requests.filter(request => {
    const matchesSearch = 
      request.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.destination.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = !statusFilter || request.status === statusFilter;
    const matchesDestination = !destinationFilter || request.destination.toLowerCase().includes(destinationFilter.toLowerCase());
    
    return matchesSearch && matchesStatus && matchesDestination;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'PROCESSING':
        return 'bg-blue-100 text-blue-800';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const uniqueDestinations = Array.from(new Set(requests.map(r => r.destination)));

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
          <h1 className="text-3xl font-bold text-gray-900">Trip Requests</h1>
          <p className="text-gray-600 mt-2">Manage custom trip planning requests from customers</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={exportRequests}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4 mr-2" />
              <span className="hidden md:inline">Export to Excel</span>
              <span className="inline md:hidden">Export</span>
          </button>
          <span className="text-sm text-gray-500">
            {filteredRequests.length} requests
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search requests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          
          <select
            value={destinationFilter}
            onChange={(e) => setDestinationFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          >
            <option value="">All Destinations</option>
            {uniqueDestinations.map(destination => (
              <option key={destination} value={destination}>{destination}</option>
            ))}
          </select>
          
          <div className="flex items-center text-sm text-gray-600">
            <Filter className="h-4 w-4 mr-2" />
            {filteredRequests.length} results
          </div>
        </div>
      </div>

      {/* Requests Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredRequests.map((request) => (
          <div key={request.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="bg-[var(--brand-primary)] rounded-full h-10 w-10 flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">
                    {request.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-gray-900">{request.name}</h3>
                  <p className="text-xs text-gray-500">{request.email}</p>
                </div>
              </div>
              {(user?.role === 'ADMIN' || user?.role === 'EDITOR') ? (
              <div className="flex items-center space-x-2">
                <select
                  value={request.status}
                  onChange={(e) => updateRequestStatus(request.id, e.target.value)}
                  className={`text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] ${getStatusColor(request.status)}`}
                >
                  <option value="PENDING">Pending</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                {user?.role === 'ADMIN' && (
                  <button
                    onClick={() => deleteRequest(request.id)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(request.status)}`}>
                {request.status}
              </span>
            )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center text-sm text-gray-600">
                <MapPin className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
                <span className="font-medium">{request.destination}</span>
              </div>

              <div className="flex items-center text-sm text-gray-600">
                <Calendar className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
                <span>
                  {new Date(request.startDate).toLocaleDateString('en-IN')} - {new Date(request.endDate).toLocaleDateString('en-IN')}
                </span>
              </div>

              <div className="flex items-center text-sm text-gray-600">
                <Users className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
                <span>
                  {request.adults} Adults{request.children > 0 && `, ${request.children} Children`}
                </span>
              </div>

              <div className="flex items-center text-sm text-gray-600">
                <DollarSign className="h-4 w-4 mr-2 text-[var(--brand-primary)]" />
                <span className="font-medium">{request.budget}</span>
              </div>

              {request.interests.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {request.interests.slice(0, 3).map((interest, index) => (
                    <span
                      key={index}
                      className="inline-flex px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full"
                    >
                      {interest}
                    </span>
                  ))}
                  {request.interests.length > 3 && (
                    <span className="inline-flex px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                      +{request.interests.length - 3} more
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                <div>
                  <span className="font-medium">Accommodation:</span>
                  <br />
                  {request.accommodation}
                </div>
                <div>
                  <span className="font-medium">Transport:</span>
                  <br />
                  {request.transport}
                </div>
              </div>

              {request.specialRequests && (
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Special Requests:</span>
                  <p className="mt-1">{request.specialRequests}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  {new Date(request.createdAt).toLocaleDateString('en-IN')}
                </span>
                <div className="flex items-center space-x-2">
                  <a
                    href={`tel:${request.phone}`}
                    className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                  >
                    📞
                  </a>
                  <a
                    href={`mailto:${request.email}`}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    ✉️
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredRequests.length === 0 && (
        <div className="text-center py-12">
          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No trip requests found</h3>
          <p className="text-gray-600">Try adjusting your search criteria or check back later for new requests.</p>
        </div>
      )}
    </div>
  );
};