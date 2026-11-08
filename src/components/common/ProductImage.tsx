import React, { useState, useEffect } from 'react';
import { Leaf } from 'lucide-react';
import { getProductImageUrl, getProductSvgFallback } from '../../lib/productImages.js';

interface ProductImageProps {
  productId: string;
  name?: string;
  alt?: string;
  category?: string;
  imageUrl?: string;
  className?: string;
  imageClassName?: string;
  showEcoBadge?: boolean;
  isEcoFriendly?: boolean;
  showDemoBadge?: boolean;
  unitOfSale?: string;
  aspectRatio?: string; // e.g. "aspect-[4/3]", "aspect-square", "h-44", "h-48"
  fit?: 'contain' | 'cover';
  onClick?: () => void;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  productId,
  name,
  alt,
  category = 'office_stationery',
  imageUrl,
  className = '',
  imageClassName = '',
  showEcoBadge = false,
  isEcoFriendly = false,
  showDemoBadge = false,
  unitOfSale,
  aspectRatio = 'aspect-[4/3]',
  fit = 'contain',
  onClick,
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [attemptedFallback, setAttemptedFallback] = useState(false);

  const displayName = name || alt || productId;

  // Resolve target image URL
  const targetUrl = hasError
    ? getProductSvgFallback(productId, displayName, category)
    : getProductImageUrl(productId, imageUrl);

  // Reset error states if productId or imageUrl changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
    setAttemptedFallback(false);
  }, [productId, imageUrl]);

  const handleImageError = () => {
    if (!hasError) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          `[BoundBuy Diagnostic] Product image load failed for SKU '${productId}' (${displayName}). Rendering technical category fallback illustration.`
        );
      }
      setHasError(true);
      setIsLoaded(true); // show fallback immediately without infinite skeleton
    } else if (!attemptedFallback) {
      setAttemptedFallback(true);
      setIsLoaded(true);
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative w-full overflow-hidden bg-[#F4F6F4] flex items-center justify-center select-none ${aspectRatio} ${className} ${
        onClick ? 'cursor-pointer group' : ''
      }`}
    >
      {/* Subtle Shimmer / Pulse Placeholder while loading */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gradient-to-r from-[#EAEFEA] via-[#F4F6F4] to-[#EAEFEA] animate-pulse" />
      )}

      {/* Main Product Image */}
      <img
        src={targetUrl}
        alt={displayName}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setIsLoaded(true)}
        onError={handleImageError}
        className={`w-full h-full transition-all duration-300 ${
          fit === 'contain' ? 'object-contain p-2.5' : 'object-cover'
        } object-center ${isLoaded ? 'opacity-100' : 'opacity-0'} ${
          onClick ? 'group-hover:scale-[1.02]' : ''
        } ${imageClassName}`}
      />

      {/* Demo SKU Badge - Neatly placed inside top-right, unobtrusive */}
      {showDemoBadge && (
        <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-white/90 backdrop-blur-xs rounded-md text-[10px] font-semibold text-[#19211C] shadow-2xs border border-[#E3E7E4]/60 pointer-events-none">
          Demo SKU
        </div>
      )}

      {/* Eco-Friendly Badge */}
      {showEcoBadge && isEcoFriendly && (
        <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 bg-[#153E2E]/90 text-[#A6E3BF] backdrop-blur-xs rounded-md text-[10px] font-medium flex items-center gap-1 shadow-2xs pointer-events-none">
          <Leaf className="w-3 h-3 text-[#72CF98]" />
          <span>Eco</span>
        </div>
      )}

      {/* Unit of Sale Badge */}
      {unitOfSale && (
        <div className="absolute bottom-2 right-2 z-10 px-2 py-0.5 bg-black/65 text-white backdrop-blur-xs rounded-md text-[10px] font-medium uppercase tracking-wider shadow-2xs pointer-events-none">
          {unitOfSale}
        </div>
      )}
    </div>
  );
};
