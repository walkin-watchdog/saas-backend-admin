import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { toast } from 'react-hot-toast'
import {
  Calendar as CalendarIcon,
  User,
  Package,
  Clock,
  Mail,
  Phone,
  CreditCard,
  RefreshCw,
  ArrowLeft,
  DollarSign,
  NotepadTextDashed,
  MapPin,
  Percent,
  Tag
} from 'lucide-react'
import { getCurrencySymbol } from '../utils/currencyUtils'

export const BookingDetails = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token } = useAuth()
  const [booking, setBooking] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  // const [refundLoading, setRefundLoading] = useState(false)
  const [reminderLoading, setReminderLoading] = useState(false)
  const symbol = getCurrencySymbol

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/bookings/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setBooking(data))
      .catch(() => toast.error('Failed to load booking'))
      .finally(() => setLoading(false))
  }, [id, token])

  const resendVoucher = async () => {
    setActionLoading(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/bookings/${id}/send-voucher`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error()
      toast.success('Voucher resent!')
    } catch {
      toast.error('Failed to resend voucher')
    } finally {
      setActionLoading(false)
    }
  }

  const sendReminder = async () => {
    setReminderLoading(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/bookings/${id}/payment-reminder`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error()
      toast.success('Reminder resent!')
    } catch {
      toast.error('Failed to send reminder')
    } finally {
      setReminderLoading(false)
    }
  }

  // const processRefund = async () => {
  //   setRefundLoading(true)
  //   try {
  //     const res = await fetch(
  //       `${import.meta.env.VITE_API_URL}/payments/${booking.payments[0].id}/refund`,
  //       { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  //     )
  //     if (!res.ok) throw new Error()
  //     toast.success('Refund processed!')
  //     const updated = await fetch(`${import.meta.env.VITE_API_URL}/bookings/${id}`, {
  //       headers: { Authorization: `Bearer ${token}` }
  //     }).then(r => r.json())
  //     setBooking(updated)
  //   } catch {
  //     toast.error('Refund failed')
  //   } finally {
  //     setRefundLoading(false)
  //   }
  // }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]" />
      </div>
    )
  }

  if (!booking) {
    return <p className="text-center text-red-500">Booking not found.</p>
  }

  const payment = Array.isArray(booking.payments) && booking.payments.length > 0
    ? booking.payments[0]
    : null

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-gray-600 hover:text-gray-800"
      >
        <ArrowLeft className="mr-2 h-5 w-5" /> Back
      </button>

      <header className="text-center">
        <h1 className="text-3xl font-semibold text-gray-900">
          Booking Details
        </h1>
        <p className="text-gray-600 mt-1">#{booking.bookingCode}</p>
      </header>

      {/* 1. Booking Info */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-medium text-gray-800 mb-4">Booking Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-700">
          <div className="flex items-center">
            <CalendarIcon className="h-5 w-5 text-gray-500 mr-2" />
            {new Date(booking.bookingDate).toLocaleDateString('en-IN')}
          </div>
          <div className="flex items-center">
            <Clock className="h-5 w-5 text-gray-500 mr-2" />
            {booking.selectedTimeSlot}
          </div>
          <div className="flex items-center">
            <User className="h-5 w-5 text-gray-500 mr-2" />
            {booking.adults} Adult{booking.adults > 1 && 's'}
          </div>
          <div className="flex items-center">
            <User className="h-5 w-5 text-gray-500 mr-2 opacity-50" />
            {booking.children} Child{booking.children !== 1 && 'ren'}
          </div>
          {booking.isManual ? (
            (() => {
              const { discountType, discountValue = 0 } = booking.customDetails || {};
              let original = booking.totalAmount + discountValue;
              if (discountType === 'percentage') {
                original = Math.round(booking.totalAmount / (1 - discountValue / 100));
              }
              return (
                <>
                  <div className="flex items-center">
                    <Tag className="h-5 w-5 text-gray-500 mr-2" />
                    <span className="text-sm text-gray-500 line-through">
                      {symbol(booking.currency)}{original.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <DollarSign className="h-5 w-5 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-900">
                      {symbol(booking.currency)}{booking.totalAmount.toLocaleString()}
                    </span>
                  </div>
                </>
              );
            })()
            ) : booking.couponCode && (
              <>
                <div className="flex items-center">
                  <Percent className="h-5 w-5 text-gray-500 mr-2" />
                  {symbol(booking.currency)}{booking.discountAmount?.toLocaleString() || 0}
                </div>
                <div className="flex items-center">
                  <Tag className="h-5 w-5 text-gray-500 mr-2" />
                  {booking.couponCode}
                </div>
              </>
          )}
          {booking?.proposal?.id && (
            <div>
              <a
                href={`/proposals/${booking.proposal.id}/edit`}
                className="text-sm text-blue-600 hover:underline"
              >
                View Proposal Details
              </a>
            </div>
          )}
        </div>
      </section>

      {/* 2. Customer */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-medium text-gray-800 mb-4">Customer</h2>
        <div className="space-y-3 text-gray-700">
          <div className="flex items-center">
            <User className="h-5 w-5 text-gray-500 mr-2" />
            {booking.customerName}
          </div>
          <div className="flex items-center">
            <Mail className="h-5 w-5 text-gray-500 mr-2" />
            {booking.customerEmail}
          </div>
          <div className="flex items-center">
            <Phone className="h-5 w-5 text-gray-500 mr-2" />
            {booking.customerPhone}
          </div>
          {booking.notes && !booking.customDetails && (
            <div className="flex">
              <NotepadTextDashed className="h-5 w-5 text-gray-500 mr-2" />
              {booking.notes}
            </div>
          )}
          {booking.travellerDetails?.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Travellers</h3>
              <ul className="list-disc pl-5 text-gray-700">
                {booking.travellerDetails.map((t: any, idx: number) => (
                  <li key={idx}>
                    {t.name} (Age: {t.age})
                    {t.dietaryRestrictions && ` – ${t.dietaryRestrictions}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* 3. Product or Custom */}
      {booking.customDetails ? (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-medium text-gray-800 mb-4">Custom Voucher Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-700">
            <div className="flex items-center">
              <Package className="h-5 w-5 text-gray-500 mr-2" />
              {booking.customDetails.packageName}
            </div>
            <div className="flex items-center">
              <MapPin className="h-5 w-5 text-gray-500 mr-2" />
              {booking.customDetails.location}
            </div>
            <div className="flex items-center">
              <Clock className="h-5 w-5 text-gray-500 mr-2" />
              {booking.customDetails.duration} {booking.customDetails.durationUnit}
            </div>
            <div className="flex items-center">
              <CalendarIcon className="h-5 w-5 text-gray-500 mr-2" />
              {booking.customDetails.selectedTimeSlot}
            </div>
            <div className="flex items-center">
              <DollarSign className="h-5 w-5 text-gray-500 mr-2" />
              {symbol(booking.currency)}{booking.totalAmount.toLocaleString()}
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-medium text-gray-800 mb-4">Product</h2>
            <div className="flex items-center text-gray-700 space-x-4">
            <img
              src={booking.product.images?.[0] || ''}
              alt={booking.product.title}
              className="h-16 w-16 object-cover rounded-md"
            />
            <div>
              <p className="font-medium text-gray-900">
                {booking.product.title}
              </p>
              <p className="text-sm text-gray-600">{booking.product.location}</p>
            </div>
          </div>
          <div className="flex items-center pt-5 col-span-2">
            <Package className="h-5 w-5 text-gray-500 mr-2" />
            {booking.package?.name || '—'}
          </div>
        </section>
      )}

      {/* 4. Payment */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-medium text-gray-800 mb-4">Payment</h2>
        {booking.isManual && (booking.paymentStatus === 'PARTIAL' || booking.paymentStatus === 'PAID') ? (
          <div className="text-gray-700">
            <div className="font-semibold">Manual Payment</div>
            <div>Amount: {symbol(booking.currency)}{(booking.paymentStatus === 'PARTIAL'
                ? booking.partialPaymentAmount
                : booking.totalAmount
              ).toLocaleString()}</div>
          </div>
        ) : payment ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="flex items-center">
              <CreditCard className="h-5 w-5 text-gray-500 mr-2" />
              {payment.paymentMethod}
            </div>
            <div className="flex items-center text-gray-700">
              <DollarSign className="h-5 w-5 text-gray-500 mr-2" />
              {symbol(booking.currency)}{(
                booking.paymentStatus === 'PARTIAL'
                  ? booking.partialPaymentAmount
                  : booking.totalAmount
              ).toLocaleString()}
            </div>
            <div className="col-span-2">
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  booking.paymentStatus === 'PAID'
                    ? 'bg-green-100 text-green-800'
                    : booking.paymentStatus === 'PENDING'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {booking.paymentStatus}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-center text-gray-600 italic">
            No payment record yet.
          </p>
        )}
      </section>

      {/* 5. Actions */}
      <section className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={resendVoucher}
          disabled={actionLoading}
          className="flex-1 flex items-center justify-center px-4 py-2 bg-[var(--brand-secondary)] text-white rounded-lg hover:bg-[#0d3d47] transition"
        >
          <RefreshCw className="h-5 w-5 mr-2" />
          {actionLoading ? 'Processing…' : 'Resend Voucher'}
        </button>

        {/* {payment && booking.paymentStatus === 'PAID' && (
          <button
            onClick={processRefund}
            disabled={refundLoading}
            className="flex-1 flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            <DollarSign className="h-5 w-5 mr-2" />
            {refundLoading ? 'Processing…' : 'Refund Payment'}
          </button>
        )} */}

        {payment && booking.paymentStatus === 'PARTIAL' && (
          <>
            <button
              onClick={sendReminder}
              disabled={reminderLoading}
              className="flex-1 flex items-center justify-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
            >
              <Mail className="h-5 w-5 mr-2" />
              {reminderLoading ? 'Sending…' : 'Payment Reminder'}
            </button>
            {/* <button
              onClick={processRefund}
              disabled={refundLoading}
              className="flex-1 flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              <DollarSign className="h-5 w-5 mr-2" />
              {refundLoading ? 'Processing…' : 'Refund Payment'}
            </button> */}
          </>
        )}

        { booking && (booking.paymentStatus === 'PENDING') && (
          <button
            onClick={sendReminder}
            disabled={reminderLoading}
            className="flex-1 flex items-center justify-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
          >
            <Mail className="h-5 w-5 mr-2" />
            {reminderLoading ? 'Sending…' : 'Payment Reminder'}
          </button>
        )}
      </section>
    </div>
  )
}