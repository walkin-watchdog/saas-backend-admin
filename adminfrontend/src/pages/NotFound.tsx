import { Link } from 'react-router-dom';
import { Home, ChevronLeft } from 'lucide-react';

export const NotFound = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full px-4 py-8 text-center">
        <div className="mb-6">
          <span className="text-[var(--brand-primary)] text-9xl font-bold">404</span>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Page Not Found
        </h1>
        
        <p className="text-gray-600 mb-8">
          We couldn't find the page you're looking for. The page might have been moved, 
          deleted, or the URL might be incorrect.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/"
            className="flex items-center justify-center bg-[var(--brand-secondary)] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#0d3d47] transition-colors"
          >
            <Home className="h-5 w-5 mr-2" />
            Back to Dashboard
          </Link>
          
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center border-2 border-[var(--brand-secondary)] text-[var(--brand-secondary)] px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 mr-2" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};