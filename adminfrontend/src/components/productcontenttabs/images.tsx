import type { ProductImagesTabProps } from "@/types";
import { ImageUploader } from "../gallery/ImageUploader";
import { useAuth } from "@/contexts/AuthContext";
import useImageRule from "@/hooks/useImageRule";

export const ProductImagesTab = ({ formData, updateFormData }: ProductImagesTabProps) => {
  const { user } = useAuth();
  const { rule: productRule } = useImageRule(user?.tenantId, 'products');
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h4 className="text-lg font-medium text-gray-900 mb-2">Product Images</h4>
        <p className="text-sm text-gray-600 mb-6">Upload high-quality images to showcase your product</p>
      </div>
      <ImageUploader
        images={formData.images || []}
        onChange={(images) => updateFormData({ images })}
        maxImages={10}
        folder="products"
        title="Product Images *"
        imageType="products"
        tenantId={user?.tenantId}
      />
      {productRule && (
        <p className="text-xs text-gray-500 mb-6">
          Recommended size: {productRule.width} × {productRule.height} px
        </p>
      )}
    </div>
  );
}