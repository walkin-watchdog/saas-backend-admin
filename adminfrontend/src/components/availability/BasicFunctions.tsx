import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";

export const getStatusIcon = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'SOLD_OUT':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'NOT_OPERATING':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  export const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-800';
      case 'SOLD_OUT':
        return 'bg-red-100 text-red-800';
      case 'NOT_OPERATING':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  export const formatDateRange = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate).toLocaleDateString('en-IN');
    if (endDate && endDate !== null) {
      const end = new Date(endDate).toLocaleDateString('en-IN');
      return `${start} - ${end}`;
    }
    return `${start} - Forever`;
  };