import { Link } from "react-router-dom";
import { Tag } from "lucide-react";
import type { Product } from "../../types/index";

export const HighlightsAndTags = ({ product }: { product: Product | null }) => {
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
        <div className="space-y-6">
        {/* {currentProduct.highlights && currentProduct.highlights.length > 0 && (
            <div className="space-y-4">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <h4 className="text-lg font-bold text-gray-900">Experience Highlights</h4>
                </div>
                <div className="grid gap-3">
                    {currentProduct.highlights.map((highlight: string, index: number) => (
                        <div key={index} className="group flex items-start space-x-4 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-200 hover:shadow-md hover:border-orange-300 transition-all duration-200">
                            <div className="flex-shrink-0 w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center mt-0.5 group-hover:bg-yellow-200 transition-colors duration-200">
                                <Star className="h-3.5 w-3.5 text-yellow-600 fill-yellow-600" />
                            </div>
                            <span className="text-gray-700 leading-relaxed group-hover:text-gray-900 transition-colors duration-200">{highlight}</span>
                        </div>
                    ))}
                </div>
            </div>
        )} */}
        
        {currentProduct.tags && currentProduct.tags.length > 0 && (
            <div className="space-y-4">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                        <Tag className="h-4 w-4 text-white" />
                    </div>
                    <h4 className="text-lg font-bold text-gray-900">Experience Tags</h4>
                </div>
                <div className="flex flex-wrap gap-3">
                    {currentProduct.tags.map((tag: string, index: number) => (
                        <span 
                        key={index}
                        className="group px-4 py-2 bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 rounded-full text-sm font-medium border border-blue-200 hover:from-blue-200 hover:to-indigo-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 cursor-default"
                        >
                            <span className="flex items-center space-x-1.5">
                                <Tag className="h-3 w-3" />
                                <span>{tag}</span>
                            </span>
                        </span>
                    ))}
                </div>
            </div>
        )}
    </div>
    )
}