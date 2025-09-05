import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Filter, Calendar, User, Phone, Mail, Eye, Download, Plus, Send, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { BookingProp } from '../types/index.ts';
import { useToast } from '../components/ui/toaster.tsx';
import { getCurrencySymbol } from '../utils/currencyUtils';

export const Bookings = () => {
  const [bookings, setBookings] = useState<BookingProp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedBookings, setSelectedBookings] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [manualFilter, setManualFilter] = useState<'all'|'manual'|'auto'>('all');
  // Filtered bookings must be declared before use in effects
  const filteredBookings = bookings.filter(booking => {
    if (manualFilter === 'manual' && !booking.isManual) return false;
    if (manualFilter === 'auto'   && booking.isManual) return false;
    const matchesSearch = 
      booking.bookingCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.customerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.product?.title.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = !statusFilter || booking.status === statusFilter;
    const matchesPayment = !paymentFilter || booking.paymentStatus === paymentFilter;
    const matchesDate = !dateFilter || booking.bookingDate.startsWith(dateFilter);
    
    return matchesSearch && matchesStatus && matchesPayment && matchesDate;
  });

  useEffect(() => {
    fetchBookings();
  }, [token]);
  
  // Effect to handle "select all" functionality
  useEffect(() => {
    if (selectAll) {
      setSelectedBookings(filteredBookings.map(booking => booking.id));
    } else if (selectedBookings.length === filteredBookings.length) {
      // If user manually deselected a booking after "select all" was checked
      setSelectedBookings([]);
    }
  }, [selectAll]);
  
  // Update "select all" checkbox state when filtered bookings change
  useEffect(() => {
    if (selectedBookings.length === filteredBookings.length && filteredBookings.length > 0) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [selectedBookings.length, filteredBookings.length]);

  const fetchBookings = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/bookings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setBookings(data);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        fetchBookings(); // Refresh the data
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
    }
  };

  const updatePaymentStatus = async (bookingId: string, paymentStatus: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/bookings/${bookingId}/payment-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ paymentStatus }),
      });

      if (response.ok) {
        fetchBookings();
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
    }
  };
  
  const handleSelectBooking = (bookingId: string) => {
    setSelectedBookings(prev => 
      prev.includes(bookingId) 
        ? prev.filter(id => id !== bookingId) 
        : [...prev, bookingId]
    );
  };
  
  const handleSelectAllBookings = () => {
    setSelectAll(!selectAll);
  };
  
  const handleExportSelected = async () => {
    if (selectedBookings.length === 0) {
      toast({
        message: 'Please select at least one booking to export.',
        type: 'info',
      })
      return;
    }
    
    setIsExporting(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/bookings/export?ids=${selectedBookings.join(',')}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to export bookings');
      }
      
      // Convert response to blob
      const blob = await response.blob();
      
      // Create a download link and click it
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `bookings_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting bookings:', error);
      toast({
        message: 'Failed to export bookings',
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };
  
  const sendVoucher = async (bookingId: string) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/bookings/${bookingId}/send-voucher`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error()
      toast({
        message: 'Voucher Sent',
        type: 'info',
      });
    } catch {
      toast({
        message: 'Failed to send voucher',
        type: 'error',
      });
    } finally {
    }
  }

  const sendReminder = async (bookingId: string) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/bookings/${bookingId}/payment-reminder`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error()
      toast({
        message: 'Remider Sent',
        type: 'info',
      });
    } catch {
      toast({
        message: 'Failed to send reminder',
        type: 'error',
      });
    } finally {
    }
  }

  const handleExportSingle = async (bookingId: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/bookings/${bookingId}/export`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to export booking');
      }
      
      // Get booking code for filename
      const booking = bookings.find(b => b.id === bookingId);
      const bookingCode = booking ? booking.bookingCode : bookingId;
      
      // Convert response to blob
      const blob = await response.blob();
      
      // Create a download link and click it
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `booking_${bookingCode}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting booking:', error);
      toast({
        message: 'Failed to export booking',
        type: 'error',
      });
    }
  };
  
  // const handleExportAll = async () => {
  //   setIsExporting(true);
  //   try {
  //     // Build query parameters based on current filters
  //     const params = new URLSearchParams();
  //     if (statusFilter) params.append('status', statusFilter);
  //     if (dateFilter) params.append('fromDate', dateFilter);
      
  //     const response = await fetch(
  //       `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/bookings/export?${params.toString()}`,
  //       {
  //         method: 'GET',
  //         headers: {
  //           'Authorization': `Bearer ${token}`,
  //         },
  //       }
  //     );
      
  //     if (!response.ok) {
  //       throw new Error('Failed to export bookings');
  //     }
      
  //     const blob = await response.blob();
      
  //     const url = window.URL.createObjectURL(blob);
  //     const a = document.createElement('a');
  //     a.style.display = 'none';
  //     a.href = url;
  //     a.download = `all_bookings_export_${new Date().toISOString().split('T')[0]}.xlsx`;
  //     document.body.appendChild(a);
  //     a.click();
  //     window.URL.revokeObjectURL(url);
  //   } catch (error) {
  //     console.error('Error exporting all bookings:', error);
  //     toast({
  //       message: 'Failed to export all bookings',
  //       type: 'error',
  //     });
  //   } finally {
  //     setIsExporting(false);
  //   }
  // };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const symbol = getCurrencySymbol

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      case 'REFUNDED':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
          <h1 className="text-3xl font-bold text-gray-900">Bookings Management</h1>
          <p className="text-gray-600 mt-2">View and manage all bookings</p>
        </div>
        <div className="flex flex-row flex-nowrap items-center space-x-2">
          {(user?.role === 'ADMIN' || user?.role === 'EDITOR') && (
            <Link
              to="/bookings/new"
              className="w-10 sm:w-auto flex justify-center items-center px-3 sm:px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-tertiary)] transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span className="ml-2 text-sm hidden sm:inline">Create</span>
            </Link>
          )}
          <div className="relative group">
            <button 
            onClick={handleExportSelected}
            disabled={selectedBookings.length === 0 || isExporting}
            className="flex items-center px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              <Download className="h-5 w-5" />
              <span className="ml-2 text-sm hidden sm:inline">{selectedBookings.length > 0 && `Export Selected (${selectedBookings.length})`}</span>
            </button>
          </div>
          <span className="w-full text-sm text-gray-500 text-center mt-2 sm:mt-0 sm:w-auto sm:text-left">
            {filteredBookings.length} total
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search bookings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            />
          </div>

          <select
             value={manualFilter}
             onChange={e => setManualFilter(e.target.value as any)}
             className="px-3 py-2 border rounded-md"
           >
             <option value="all">All Sources</option>
             <option value="manual">Manual</option>
             <option value="auto">Automated</option>
           </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="COMPLETED">Completed</option>
          </select>
          
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          >
            <option value="">All Payments</option>
            <option value="PENDING">Payment Pending</option>
            <option value="PARTIAL">Partial Payment</option>
            <option value="PAID">Paid</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </select>
          
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
          />
          
          <div className="flex items-center text-sm text-gray-600">
            <Filter className="h-4 w-4 mr-2" />
            {filteredBookings.length} results
          </div>
        </div>
      </div>

      {/* Selection Controls - Show when bookings are selected */}
      {selectedBookings.length > 0 && (
        <div className="bg-[var(--brand-secondary)] text-white px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
          <span>{selectedBookings.length} booking(s) selected</span>
          <div className="flex space-x-3">
            <button 
              onClick={handleExportSelected}
              className="text-sm px-3 py-1 bg-white text-[var(--brand-secondary)] rounded hover:bg-gray-100"
              disabled={isExporting}
            >
              {isExporting ? 'Exporting...' : 'Export Selected'}
            </button>
            <button 
              onClick={() => setSelectedBookings([])}
              className="text-sm px-3 py-1 bg-transparent border border-white text-white rounded hover:bg-white/10"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}
      
      {/* Bookings Table */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAllBookings}
                    className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Booking Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBookings.map((booking) => (
                <tr key={booking.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedBookings.includes(booking.id)}
                      onChange={() => handleSelectBooking(booking.id)}
                      className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {booking.bookingCode}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(booking.bookingDate).toLocaleDateString('en-IN')}
                      </div>
                      <div className="text-sm text-gray-900">
                        Created: {new Date(booking.createdAt).toLocaleDateString('en-IN')}
                      </div>
                      <div className="text-sm text-gray-900">
                        {booking.isManual
                          ? <span>By: {booking.createdBy?.name}</span>
                          : ''
                        }
                      </div>
                      {booking.isManual
                        ? <span className="text-xs font-semibold px-2 py-1 bg-yellow-100 text-yellow-800 rounded">Manual</span>
                        : <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-800 rounded">Auto</span>
                      }
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 flex items-center">
                        <User className="h-3 w-3 mr-1" />
                        {booking.customerName}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center">
                        <Mail className="h-3 w-3 mr-1" />
                        {booking.customerEmail}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center">
                        <Phone className="h-3 w-3 mr-1" />
                        {booking.customerPhone}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-normal break-words max-w-xs">
                    {booking.customDetails ? (
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {booking.customDetails.packageName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {booking.customDetails.location}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {booking.product?.title}
                        </div>

                        <div className="text-sm text-gray-500">
                          {booking.product?.productCode}
                        </div>
                        {booking.package && (
                          <div className="text-xs text-blue-600">
                            Package: {booking.package.name}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="text-sm text-gray-900">
                      <div>{booking.adults} Adults</div>
                      {booking.children > 0 && (
                        <div className="text-gray-500">{booking.children} Children</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(user?.role === 'ADMIN' || user?.role === 'EDITOR') ? (
                      <select
                        value={booking.paymentStatus}
                        onChange={(e) => updatePaymentStatus(booking.id, e.target.value)}
                        className={`text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] ${getStatusColor(booking.status)}`}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="PARTIAL">Partial</option>
                        <option value="PAID">Paid</option>
                        <option value="FAILED">Failed</option>
                        <option value="REFUNDED">Refunded</option>
                      </select>
                    ) : (
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusColor}`}>
                        {booking.paymentStatus}
                      </span>
                    )}
                    {booking.isManual ? (
                    (() => {
                      const { discountType, discountValue = 0 } = booking.customDetails || {};
                      let original = booking.totalAmount + discountValue;
                      if (discountType === 'percentage') {
                        original = Math.round(booking.totalAmount / (1 - discountValue / 100));
                      }
                      return (
                        <div>
                          <div className="text-sm text-gray-500 line-through">
                            {symbol(booking.currency)}{original.toLocaleString()}
                          </div>
                          <div className="text-sm font-medium text-gray-900">
                            {symbol(booking.currency)}{booking.totalAmount.toLocaleString()}
                          </div>
                          {booking.paymentStatus === 'PARTIAL' && (
                            <div className="text-sm text-blue-600 italic">
                              Received: {symbol(booking.currency)}{booking.partialPaymentAmount.toLocaleString()}
                            </div>
                          )}
                        </div>
                      );
                    })()
                    ) : booking.discountAmount ? (
                      <div>
                        <div className="text-sm text-gray-500 line-through">
                          {symbol(booking.currency)}{(booking.totalAmount + booking.discountAmount).toLocaleString()}
                        </div>
                        <div className="text-sm font-medium text-gray-900">
                          {symbol(booking.currency)}{booking.totalAmount.toLocaleString()}
                          <span className="ml-2 text-xs text-green-600">({booking.couponCode})</span>
                        </div>
                        {booking.paymentStatus === 'PARTIAL' && (
                          <div className="text-sm text-blue-600 italic">
                            Received: {symbol(booking.currency)}{booking.partialPaymentAmount.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-gray-900">
                        {symbol(booking.currency)}{booking.totalAmount.toLocaleString()}
                        {booking.paymentStatus === 'PARTIAL' && (
                          <div className="text-sm text-blue-600 italic">
                            Received: {symbol(booking.currency)}{booking.partialPaymentAmount.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(user?.role === 'ADMIN' || user?.role === 'EDITOR') ? (
                      <select
                        value={booking.status}
                        onChange={(e) => updateBookingStatus(booking.id, e.target.value)}
                        className={`text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] ${getStatusColor(booking.status)}`}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="CANCELLED">Cancelled</option>
                        <option value="COMPLETED">Completed</option>
                      </select>
                    ) : (
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                        {booking.status}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => navigate(`/bookings/${booking.id}/details`)} 
                        className="p-1 text-gray-400 hover:text-[var(--brand-primary)] transition-colors"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleExportSingle(booking.id)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Export to Excel"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => sendVoucher(booking.id)}
                        className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                        title="Send Voucher"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => sendReminder(booking.id)}
                        className="p-1 text-gray-400 hover:text-yellow-600 transition-colors"
                        title="Send Reminder"
                      >
                        <DollarSign className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="block md:hidden space-y-4">
        {filteredBookings.map(booking => (
          <div key={booking.id} className="bg-white rounded-lg shadow-md p-4">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedBookings.includes(booking.id)}
                  onChange={() => handleSelectBooking(booking.id)}
                  className="h-4 w-4 text-[var(--brand-primary)] border-gray-300 rounded mr-2"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">{booking.bookingCode}</div>
                  <div className="text-xs text-gray-500 flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {new Date(booking.bookingDate).toLocaleDateString('en-IN')}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-400">
                Created {new Date(booking.createdAt).toLocaleDateString('en-IN')}
              </div>
            </div>

            {/* Customer */}
            <div className="mb-2 text-sm text-gray-700">
              <div className="flex items-center">
                <User className="h-4 w-4 mr-1" /> {booking.customerName}
              </div>
              <div className="flex items-center">
                <Mail className="h-4 w-4 mr-1" /> {booking.customerEmail}
              </div>
              <div className="flex items-center">
                <Phone className="h-4 w-4 mr-1" /> {booking.customerPhone}
              </div>
            </div>

            {/* Product & Package */}
            <div className="mb-2 text-sm text-gray-700">
              {booking.product && (
                <>
                  <div>{booking.product?.title} ({booking.product?.productCode})</div>
                  <div className="text-xs text-blue-600">Package: {booking.package?.name}</div>
                </>
              )}
            </div>

            {/* People, Amount, Status */}
            <div className="flex flex-wrap justify-between items-center text-sm">
              <div>
                {booking.adults} Adults{booking.children > 0 && `, ${booking.children} Children`}
              </div>
              <div>
                {symbol(booking.currency)}{booking.totalAmount.toLocaleString()}
              </div>
              <div>
                {(user?.role === 'ADMIN' || user?.role === 'EDITOR') ? (
                  <select
                    value={booking.paymentStatus}
                    onChange={(e) => updatePaymentStatus(booking.id, e.target.value)}
                    className={`text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] ${getStatusColor(booking.status)}`}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="PAID">Paid</option>
                    <option value="FAILED">Failed</option>
                    <option value="REFUNDED">Refunded</option>
                  </select>
                ) : (
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusColor}`}>
                    {booking.paymentStatus}
                  </span>
                )}
              </div>
              <div>
                {(user?.role === 'ADMIN' || user?.role === 'EDITOR')
                  ? <select
                      value={booking.status}
                      onChange={e => updateBookingStatus(booking.id, e.target.value)}
                      className={`text-xs px-2 py-1 border rounded focus:ring-1 focus:ring-[var(--brand-primary)] ${getStatusColor(booking.status)}`}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="CONFIRMED">Confirmed</option>
                      <option value="CANCELLED">Cancelled</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  : <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                      {booking.status}
                    </span>
                }
              </div>
            </div>

            {/* Actions */}
            <div className="mt-3 flex space-x-4">
              <button
                onClick={() => navigate(`/bookings/${booking.id}/details`)}
                className="p-1 text-gray-400 hover:text-[var(--brand-primary)]"
                title="View Details"
              >
                <Eye className="h-5 w-5" />
              </button>
              <button
                onClick={() => handleExportSingle(booking.id)}
                className="p-1 text-gray-400 hover:text-blue-600"
                title="Export"
              >
                <Download className="h-5 w-5" />
              </button>
              <button
                onClick={() => sendVoucher(booking.id)}
                className="p-1 text-gray-400 hover:text-green-600"
                title="Send Voucher"
              >
                <Send className="h-5 w-5" />
              </button>
              <button
                onClick={() => sendReminder(booking.id)}
                className="p-1 text-gray-400 hover:text-yellow-600"
                title="Send Reminder"
              >
                <DollarSign className="h-5 w-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredBookings.length === 0 && (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings found</h3>
          <p className="text-gray-600">Try adjusting your search criteria or check back later for new bookings.</p>
        </div>
      )}
    </div>
  );
};