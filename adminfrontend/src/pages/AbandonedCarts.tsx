import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  ShoppingCart,
  Calendar,
  Mail,
  Phone,
  Clock,
  User,
  Send,
  ArrowRight,
  Trash2,
  Search,
  Filter
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { AbandonedCartProp } from '../types/index.ts';
import { useToast } from '../components/ui/toaster.tsx';
import { getCurrencySymbol } from '../utils/currencyUtils';


export const AbandonedCarts = () => {
  const [carts, setCarts] = useState<AbandonedCartProp[]>([]);
  const [filteredCarts, setFilteredCarts] = useState<AbandonedCartProp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [emailFilter, setEmailFilter] = useState('');
  const [isReminderSending, setIsReminderSending] = useState<{ [key: string]: boolean }>({});
  const [isConverting, setIsConverting] = useState<{ [key: string]: boolean }>({});
  const { token } = useAuth();
  const toast = useToast();
  const symbol = getCurrencySymbol
  useEffect(() => {
    fetchCarts();
  }, [token]);

  useEffect(() => {
    if (emailFilter) {
      setFilteredCarts(carts.filter(cart =>
        cart.email.toLowerCase().includes(emailFilter.toLowerCase()) ||
        cart.customerData.customerName.toLowerCase().includes(emailFilter.toLowerCase())
      ));
    } else {
      setFilteredCarts(carts);
    }
  }, [emailFilter, carts]);

  const fetchCarts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/abandoned-carts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCarts(data.carts || []);
        setFilteredCarts(data.carts || []);
      }
    } catch (error) {
      console.error('Error fetching abandoned carts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendReminder = async (cartId: string) => {
    setIsReminderSending({ ...isReminderSending, [cartId]: true });
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/abandoned-carts/${cartId}/reminder`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Update the cart to show one more reminder sent
        setCarts(carts.map(cart =>
          cart.id === cartId
            ? { ...cart, remindersSent: cart.remindersSent + 1 }
            : cart
        ));
        toast({
          message: 'Reminder sent successfully!',
          type: 'success',
        });
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
      toast
        ({
          message: 'Failed to send reminder',
          type: 'error',
        });
    } finally {
      setIsReminderSending({ ...isReminderSending, [cartId]: false });
    }
  };

  const convertToBooking = async (cartId: string) => {
    setIsConverting({ ...isConverting, [cartId]: true });
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/abandoned-carts/${cartId}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Remove from the list
        setCarts(carts.filter(cart => cart.id !== cartId));
        toast({
          message: 'Cart converted to booking successfully!',
          type: 'success',
        });
      }
    } catch (error) {
      console.error('Error converting cart to booking:', error);
      toast({
        message: 'Failed to convert cart to booking',
        type: 'error',
      });
    } finally {
      setIsConverting({ ...isConverting, [cartId]: false });
    }
  };

  const deleteCart = async (cartId: string) => {
    if (!window.confirm('Are you sure you want to delete this abandoned cart?')) {
      return;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/abandoned-carts/${cartId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setCarts(carts.filter(cart => cart.id !== cartId));
      }
    } catch (error) {
      console.error('Error deleting abandoned cart:', error);
      toast({
        message: 'Failed to delete abandoned cart',
        type: 'error',
      });
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
          <h1 className="text-3xl font-bold text-gray-900">Abandoned Carts</h1>
          <p className="text-gray-600 mt-2">Recover potential bookings from customers who didn't complete checkout</p>
        </div>
        <span className="text-sm text-gray-500">
          {filteredCarts.length} abandoned carts
        </span>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent"
            />
          </div>

          <div className="flex items-center text-sm text-gray-600">
            <Filter className="h-4 w-4 mr-2" />
            {filteredCarts.length} results
          </div>
        </div>
      </div>

      {/* Carts Grid */}
      {filteredCarts.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No abandoned carts found</h3>
          <p className="text-gray-600">
            When customers start the booking process but don't complete it, their details will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCarts.map((cart) => (
            <div key={cart.id} className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
              {/* Cart Header */}
              <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center">
                  <ShoppingCart className="h-5 w-5 text-[var(--brand-primary)] mr-2" />
                  <div>
                    <h3 className="font-medium text-gray-900">{cart.customerData.customerName}</h3>
                    <div className="flex items-center text-xs text-gray-500">
                      <Mail className="h-3 w-3 mr-1" />
                      {cart.email}
                    </div>
                    <div className="flex items-center text-xs text-gray-500">
                      <Phone className="h-3 w-3 mr-1" />
                      {cart.customerData.customerPhone}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(cart.createdAt), { addSuffix: true })}
                  </div>
                  <div className="text-xs font-medium text-gray-600">
                    {cart.remindersSent} reminders sent
                  </div>
                </div>
              </div>

              {/* Cart Content */}
              <div className="p-4">
                {/* Product Info */}
                <div className="flex mb-4">
                  <img
                    src={cart.product.images[0] || 'https://images.pexels.com/photos/2132227/pexels-photo-2132227.jpeg'}
                    alt={cart.product.title}
                    className="w-20 h-20 object-cover rounded-lg mr-3"
                  />
                  <div>
                    <h4 className="font-medium text-gray-900">{cart.product.title}</h4>
                    <div className="flex items-center text-sm text-gray-600 mt-1">
                      <Calendar className="h-4 w-4 mr-1" />
                      {cart.customerData.selectedDate && new Date(cart.customerData.selectedDate).toLocaleDateString('en-IN')}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <User className="h-4 w-4 mr-1" />
                      {cart.customerData.adults} Adults
                      {cart.customerData.children > 0 && `, ${cart.customerData.children} Children`}
                    </div>
                  </div>
                </div>

                {/* Price & Booking Time */}
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                  <div className="text-lg font-bold text-[var(--brand-primary)]">
                    {symbol(cart.currency)}{cart.customerData.totalAmount.toLocaleString()}
                  </div>
                  <div className="flex items-center text-xs text-gray-500">
                    <Clock className="h-3 w-3 mr-1" />
                    Abandoned {format(new Date(cart.createdAt), 'dd MMM yyyy, h:mm a')}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col space-y-2">
                  <button
                    onClick={() => sendReminder(cart.id)}
                    disabled={isReminderSending[cart.id]}
                    className="flex items-center justify-center w-full py-2 px-3 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
                  >
                    {isReminderSending[cart.id] ? (
                      <><div className="animate-spin h-4 w-4 border-b-2 border-current mr-2"></div> Sending...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" /> Send Reminder</>
                    )}
                  </button>

                  <button
                    onClick={() => convertToBooking(cart.id)}
                    disabled={isConverting[cart.id]}
                    className="flex items-center justify-center w-full py-2 px-3 bg-green-100 text-green-800 rounded hover:bg-green-200 transition-colors"
                  >
                    {isConverting[cart.id] ? (
                      <><div className="animate-spin h-4 w-4 border-b-2 border-current mr-2"></div> Converting...</>
                    ) : (
                      <><ArrowRight className="h-4 w-4 mr-2" /> Convert to Booking</>
                    )}
                  </button>

                  <button
                    onClick={() => deleteCart(cart.id)}
                    className="flex items-center justify-center w-full py-2 px-3 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};