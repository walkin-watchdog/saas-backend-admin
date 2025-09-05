import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Product } from "../../types/index";
    
interface ProductImageGalleryProps {
    setCurrentImageIndex: React.Dispatch<React.SetStateAction<number>>;
    currentImageIndex: number;
    product: Product | null;
}

export const ProductImageGallery: React.FC<ProductImageGalleryProps> = ({
    setCurrentImageIndex,
    currentImageIndex,
    product,
}) => {
    const currentProduct = product; 
    if (!currentProduct || !currentProduct.images || currentProduct.images.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h1>
                    <Link to="/destinations" className="text-[var(--brand-primary)] hover:underline">
                        Back to Destinations
                    </Link>
                </div>
            </div>
        );
    }

    const nextImage = () => {
        setCurrentImageIndex((prev) =>
            prev === currentProduct.images.length - 1 ? 0 : prev + 1
        );
    };

    const prevImage = () => {
        setCurrentImageIndex((prev) =>
            prev === 0 ? currentProduct.images.length - 1 : prev - 1
        );
    };
    return (
        <div className="relative h-96 rounded-lg overflow-hidden">
            <img
                src={currentProduct.images[currentImageIndex] || 'https://images.pexels.com/photos/2132227/pexels-photo-2132227.jpeg'}
                alt={currentProduct.title}
                className="w-full h-full object-cover"
            />
            {currentProduct.images.length > 1 && (
                <>
                    <button
                        onClick={prevImage}
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white bg-opacity-80 rounded-full p-2 hover:bg-opacity-100 transition-all"
                    >
                        <ChevronLeft className="h-6 w-6 text-gray-800" />
                    </button>
                    <button
                        onClick={nextImage}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white bg-opacity-80 rounded-full p-2 hover:bg-opacity-100 transition-all"
                    >
                        <ChevronRight className="h-6 w-6 text-gray-800" />
                    </button>
                </>
            )}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                {currentProduct.images.map((_, index) => (
                    <button
                        key={index}
                        aria-label={`Select image ${index + 1}`}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`w-3 h-3 rounded-full ${index === currentImageIndex ? 'bg-white' : 'bg-white bg-opacity-50'
                            }`}
                    />
                ))}
            </div>
        </div>
    );
};