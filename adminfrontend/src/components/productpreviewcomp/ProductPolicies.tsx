import { Star, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import type { Product } from "../../types/index";

export const ProductPolicies = ({ product }: { product: Product | null }) => {
    const currentProduct = product;

    if (!currentProduct) {
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

    return (
        <div className="p-6">
            <div className="space-y-6">
                {/* Enhanced Cancellation Policy */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-3  border-b  px-6 py-4">
                        <AlertTriangle className="h-6 w-6 text-amber-500" />
                        <h2 className="text-lg font-semibold text-amber-800">Cancellation Policy</h2>
                    </div>
                    <div className="p-6">
                        {Array.isArray(currentProduct.cancellationTerms) && currentProduct.cancellationTerms.length > 0 ? (
                            <div className="space-y-3">
                                <h4 className="font-medium text-gray-800 mb-3">Cancellation Terms:</h4>
                                {currentProduct.cancellationTerms.map((term: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="flex-1">
                                            <div className="font-medium text-sm">{term.timeframe}</div>
                                            <div className="text-sm text-gray-600 mt-1">{term.description}</div>
                                        </div>
                                        <div className="text-right ml-4">
                                            <div className={`font-semibold text-lg ${term.refundPercent === 100 ? 'text-green-600' :
                                                term.refundPercent > 0 ? 'text-amber-600' : 'text-red-600'
                                                }`}>
                                                {term.refundPercent}%
                                            </div>
                                            <div className="text-xs text-gray-500">refund</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="prose prose-sm max-w-none">
                                <p className="text-gray-700 leading-relaxed">
                                    {currentProduct.cancellationPolicy ||
                                        'No specific policy provided. Please contact our customer service for details about cancellations and refunds.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Reviews Section */}
                {currentProduct.reviews && currentProduct.reviews.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
                            <h2 className="text-lg font-semibold text-blue-800">Customer Reviews</h2>
                        </div>
                        <div className="p-6">
                            <div className="space-y-4">
                                {currentProduct.reviews.slice(0, 3).map((review: any) => (
                                    <div key={review.id} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-medium text-gray-900">{review.name}</h3>
                                            <div className="flex items-center space-x-1">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star
                                                        key={i}
                                                        className={`h-4 w-4 ${i < review.rating
                                                                ? 'text-yellow-400 fill-yellow-400'
                                                                : 'text-gray-300'
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-gray-700 text-sm leading-relaxed">{review.comment}</p>
                                    </div>
                                ))}
                            </div>

                            {currentProduct.reviews.length > 3 && (
                                <div className="mt-4 text-center">
                                    <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                                        <Star className="h-4 w-4 mr-1" />
                                        +{currentProduct.reviews.length - 3} more reviews
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};