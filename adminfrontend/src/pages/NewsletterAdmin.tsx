import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Search, 
  Download, 
  Mail, 
  User, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  Filter,
} from 'lucide-react';
import { useToast } from '../components/ui/toaster';
import type { Subscriber } from '../types/newsletter';


export const NewsletterAdmin = () => {
  const { token } = useAuth();
  const toast = useToast();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [filteredSubscribers, setFilteredSubscribers] = useState<Subscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSubscribers, setSelectedSubscribers] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchSubscribers();
  }, [token]);

  useEffect(() => {
    filterSubscribers();
  }, [subscribers, searchTerm, statusFilter]);

  const fetchSubscribers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/newsletter/subscribers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setSubscribers(data);
        setFilteredSubscribers(data);
      }
    } catch (error) {
      console.error('Error fetching subscribers:', error);
      toast({ message: 'Failed to load subscribers', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const filterSubscribers = () => {
    let filtered = subscribers;
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(sub => 
        sub.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (sub.name && sub.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(sub => 
        statusFilter === 'active' ? sub.isActive : !sub.isActive
      );
    }
    
    setFilteredSubscribers(filtered);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/newsletter/subscribers/export`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Convert to CSV
        const headers = ['Email', 'Name', 'Subscribed At'];
        const csvData = [
          headers.join(','),
          ...data.map((row: any) => {
            return [
              `"${row.Email}"`,
              `"${row.Name || ''}"`,
              `"${row['Subscribed At']}"`
            ].join(',');
          })
        ].join('\n');
        
        // Download the file
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `newsletter_subscribers_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast({ message: 'Subscribers exported successfully', type: 'success' });
      } else {
        throw new Error('Failed to export subscribers');
      }
    } catch (error) {
      console.error('Error exporting subscribers:', error);
      toast({ message: 'Failed to export subscribers', type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedSubscribers([]);
    } else {
      setSelectedSubscribers(filteredSubscribers.map(sub => sub.id));
    }
    setSelectAll(!selectAll);
  };

  const handleSelectSubscriber = (id: string) => {
    setSelectedSubscribers(prev => 
      prev.includes(id)
        ? prev.filter(subId => subId !== id)
        : [...prev, id]
    );
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const endpoint = currentStatus 
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/newsletter/unsubscribe` 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/newsletter/subscribe`;
      
      // Find the subscriber
      const subscriber = subscribers.find(sub => sub.id === id);
      if (!subscriber) return;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          email: subscriber.email,
          name: subscriber.name 
        }),
      });
      
      if (response.ok) {
        // Update local state
        setSubscribers(prev => 
          prev.map(sub => 
            sub.id === id ? { ...sub, isActive: !currentStatus } : sub
          )
        );
        
        toast({ 
          message: `Subscription ${currentStatus ? 'deactivated' : 'activated'} successfully`, 
          type: 'success' 
        });
      }
    } catch (error) {
      console.error('Error toggling subscription status:', error);
      toast({ message: 'Failed to update subscription status', type: 'error' });
    }
  };

  const handleBulkToggleStatus = async (activate: boolean) => {
    if (selectedSubscribers.length === 0) {
      toast({ message: 'No subscribers selected', type: 'warning' });
      return;
    }
    
    try {
      // We'll use Promise.all to handle multiple requests
      const endpoint = activate
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/newsletter/subscribe`
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/newsletter/unsubscribe`;
      
      const promises = selectedSubscribers.map(id => {
        const subscriber = subscribers.find(sub => sub.id === id);
        if (!subscriber) return Promise.resolve();
        
        return fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: subscriber.email,
            name: subscriber.name
          }),
        });
      });
      
      await Promise.all(promises);
      
      // Update local state
      setSubscribers(prev => 
        prev.map(sub => 
          selectedSubscribers.includes(sub.id) ? { ...sub, isActive: activate } : sub
        )
      );
      
      toast({ 
        message: `${selectedSubscribers.length} subscription(s) ${activate ? 'activated' : 'deactivated'} successfully`, 
        type: 'success' 
      });
      
      setSelectedSubscribers([]);
      setSelectAll(false);
    } catch (error) {
      console.error('Error performing bulk action:', error);
      toast({ message: 'Failed to update subscription status', type: 'error' });
    }
  };

  const handleExportSelected = () => {
    if (selectedSubscribers.length === 0) {
      toast({ message: 'No subscribers selected', type: 'warning' });
      return;
    }
    
    // Filter the selected subscribers
    const selectedData = subscribers.filter(sub => selectedSubscribers.includes(sub.id));
    
    // Convert to CSV
    const headers = ['Email', 'Name', 'Status', 'Subscribed At'];
    const csvData = [
      headers.join(','),
      ...selectedData.map(sub => {
        return [
          `"${sub.email}"`,
          `"${sub.name || ''}"`,
          `"${sub.isActive ? 'Active' : 'Inactive'}"`,
          `"${new Date(sub.createdAt).toLocaleDateString()}"`,
        ].join(',');
      })
    ].join('\n');
    
    // Download the file
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected_subscribers_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({ message: 'Selected subscribers exported successfully', type: 'success' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Newsletter Subscribers</h1>
          <p className="text-gray-600 mt-2">Manage your newsletter subscribers and export data</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                  <span className="hidden md:inline">Export All</span>
                  <span className="inline md:hidden">Export</span>
              </>
            )}
          </button>
          <span className="text-sm text-gray-500">
            {filteredSubscribers.length} subscribers
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email or name..."
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
            <option value="all">All Subscribers</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          
          <div className="flex items-center text-sm text-gray-600">
            <Filter className="h-4 w-4 mr-2" />
            {filteredSubscribers.length} results
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedSubscribers.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <span className="text-blue-700 font-medium">{selectedSubscribers.length} subscribers selected</span>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => handleBulkToggleStatus(true)}
              className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={() => handleBulkToggleStatus(false)}
              className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Deactivate
            </button>
            <button
              onClick={handleExportSelected}
              className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Export Selected
            </button>
          </div>
        </div>
      )}

      {/* Subscribers Table */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]"></div>
          </div>
        ) : filteredSubscribers.length === 0 ? (
          <div className="text-center py-12">
            <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No subscribers found</h3>
            <p className="text-gray-600">
              {searchTerm || statusFilter !== 'all' 
                ? "Try adjusting your search criteria." 
                : "No one has subscribed to your newsletter yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                      />
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subscribed On
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedSubscribers.includes(subscriber.id)}
                        onChange={() => handleSelectSubscriber(subscriber.id)}
                        className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Mail className="h-4 w-4 text-gray-400 mr-2" />
                        <div className="text-sm font-medium text-gray-900">{subscriber.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="h-4 w-4 text-gray-400 mr-2" />
                        <div className="text-sm text-gray-700">{subscriber.name || '—'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        subscriber.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {subscriber.isActive 
                          ? <CheckCircle className="h-3 w-3 mr-1" /> 
                          : <XCircle className="h-3 w-3 mr-1" />}
                        {subscriber.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                        {new Date(subscriber.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleStatus(subscriber.id, subscriber.isActive)}
                          className={`p-1 ${
                            subscriber.isActive 
                              ? 'text-red-600 hover:text-red-800' 
                              : 'text-green-600 hover:text-green-800'
                          }`}
                          title={subscriber.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {subscriber.isActive 
                            ? <XCircle className="h-4 w-4" /> 
                            : <CheckCircle className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="block md:hidden space-y-4">
        {filteredSubscribers.map(sub => (
          <div key={sub.id} className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedSubscribers.includes(sub.id)}
                  onChange={() => handleSelectSubscriber(sub.id)}
                  className="h-4 w-4 text-[var(--brand-primary)] border-gray-300 rounded mr-2"
                />
                <div className="text-sm font-medium text-gray-900 truncate">{sub.email}</div>
              </div>
              <button
                onClick={() => handleToggleStatus(sub.id, sub.isActive)}
                className={`p-1 ${sub.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                title={sub.isActive ? 'Deactivate' : 'Activate'}
              >
                {sub.isActive ? <XCircle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
              </button>
            </div>

            {/* Name */}
            <div className="mb-2 text-sm text-gray-700 flex items-center truncate">
              <User className="h-4 w-4 mr-1 text-gray-400" />
              {sub.name || '—'}
            </div>

            {/* Status & Date */}
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span className="flex items-center">
                {sub.isActive 
                  ? <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                  : <XCircle className="h-4 w-4 text-red-600 mr-1" />}
                {sub.isActive ? 'Active' : 'Inactive'}
              </span>
              <span className="flex items-center">
                <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                {new Date(sub.createdAt).toLocaleDateString()}
              </span>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 text-gray-400">
              <button
                onClick={() => handleToggleStatus(sub.id, sub.isActive)}
                className="p-1 hover:text-gray-600"
                title={sub.isActive ? 'Deactivate' : 'Activate'}
              >
                {sub.isActive 
                  ? <XCircle className="h-5 w-5" /> 
                  : <CheckCircle className="h-5 w-5" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};