import { PRODUCT_IMAGE_REGISTRY, ProductImageMeta } from '../../server/src/data/productImages.ts';

export { PRODUCT_IMAGE_REGISTRY };
export type { ProductImageMeta };

/**
 * Returns the unique, curated image URL for a given product ID.
 */
export function getProductImageUrl(productId: string, fallbackUrl?: string): string {
  const meta = PRODUCT_IMAGE_REGISTRY[productId];
  if (meta && meta.url) {
    return meta.url;
  }
  return fallbackUrl || 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80';
}

/**
 * Returns descriptive alt text and metadata for a product ID.
 */
export function getProductImageMeta(productId: string): ProductImageMeta {
  return (
    PRODUCT_IMAGE_REGISTRY[productId] || {
      url: getProductImageUrl(productId),
      alt: 'BoundBuy Catalog Item',
      category: 'office_stationery',
      accentColor: '#153E2E',
    }
  );
}

/**
 * Returns category-specific vector icon path definitions.
 * NEVER renders a checkmark.
 */
function getCategoryIllustration(category: string, color: string): string {
  switch (category) {
    case 'storage_organization':
      // Wall / desk multi-tier organizer rack with hanging file dividers
      return `
        <!-- Outer Organizer Frame -->
        <rect x="150" y="70" width="100" height="95" rx="6" fill="white" stroke="${color}" stroke-width="2.5" />
        <!-- Horizontal Shelf Tiers -->
        <line x1="150" y1="94" x2="250" y2="94" stroke="${color}" stroke-width="1.8" stroke-dasharray="2 1" />
        <line x1="150" y1="118" x2="250" y2="118" stroke="${color}" stroke-width="1.8" stroke-dasharray="2 1" />
        <line x1="150" y1="142" x2="250" y2="142" stroke="${color}" stroke-width="1.8" stroke-dasharray="2 1" />
        <!-- Hanging Folder Tabs -->
        <rect x="160" y="77" width="22" height="12" rx="2" fill="${color}" opacity="0.25" />
        <rect x="190" y="77" width="22" height="12" rx="2" fill="${color}" opacity="0.4" />
        <rect x="165" y="101" width="30" height="12" rx="2" fill="${color}" opacity="0.3" />
        <rect x="205" y="101" width="32" height="12" rx="2" fill="${color}" opacity="0.2" />
        <rect x="160" y="125" width="25" height="12" rx="2" fill="${color}" opacity="0.35" />
        <!-- Mounting brackets -->
        <circle cx="156" cy="76" r="2.5" fill="${color}" />
        <circle cx="244" cy="76" r="2.5" fill="${color}" />
      `;

    case 'office_stationery':
      // Notebook, binder clip, and pen
      return `
        <!-- Notepad with binding -->
        <rect x="155" y="72" width="65" height="90" rx="4" fill="white" stroke="${color}" stroke-width="2.5" />
        <line x1="155" y1="88" x2="220" y2="88" stroke="${color}" stroke-width="2" />
        <line x1="167" y1="102" x2="208" y2="102" stroke="${color}" stroke-width="1.5" opacity="0.4" />
        <line x1="167" y1="116" x2="208" y2="116" stroke="${color}" stroke-width="1.5" opacity="0.4" />
        <line x1="167" y1="130" x2="208" y2="130" stroke="${color}" stroke-width="1.5" opacity="0.4" />
        <line x1="167" y1="144" x2="195" y2="144" stroke="${color}" stroke-width="1.5" opacity="0.4" />
        <!-- Pen leaning on notepad -->
        <line x1="222" y1="72" x2="242" y2="160" stroke="${color}" stroke-width="4" stroke-linecap="round" />
        <polygon points="242,160 238,166 244,166" fill="${color}" />
      `;

    case 'college_education':
      // Open book / educational textbook
      return `
        <path d="M145 138 C 170 130, 195 134, 200 144 C 205 134, 230 130, 255 138 L 255 95 C 230 87, 205 91, 200 101 C 195 91, 170 87, 145 95 Z" fill="white" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" />
        <line x1="200" y1="101" x2="200" y2="144" stroke="${color}" stroke-width="2.2" />
        <line x1="156" y1="109" x2="188" y2="106" stroke="${color}" stroke-width="1.2" opacity="0.4" />
        <line x1="156" y1="119" x2="188" y2="116" stroke="${color}" stroke-width="1.2" opacity="0.4" />
        <line x1="212" y1="106" x2="244" y2="109" stroke="${color}" stroke-width="1.2" opacity="0.4" />
        <line x1="212" y1="116" x2="244" y2="119" stroke="${color}" stroke-width="1.2" opacity="0.4" />
      `;

    case 'eco_friendly':
      // Dual botanical leaf silhouette
      return `
        <path d="M175 145 C 160 120, 165 85, 200 75 C 200 105, 195 135, 175 145 Z" fill="${color}" opacity="0.25" stroke="${color}" stroke-width="2" />
        <path d="M175 145 C 195 140, 230 135, 235 100 C 210 95, 185 115, 175 145 Z" fill="white" stroke="${color}" stroke-width="2" />
        <path d="M175 145 Q 195 115 200 75" stroke="${color}" stroke-width="2" fill="none" />
      `;

    case 'technology_workspace':
      // Monitor, stand, and keyboard outline
      return `
        <!-- Display Screen -->
        <rect x="150" y="75" width="100" height="64" rx="4" fill="white" stroke="${color}" stroke-width="2.5" />
        <line x1="150" y1="126" x2="250" y2="126" stroke="${color}" stroke-width="1" opacity="0.3" />
        <!-- Stand Stem & Base -->
        <line x1="200" y1="139" x2="200" y2="152" stroke="${color}" stroke-width="3" />
        <line x1="180" y1="152" x2="220" y2="152" stroke="${color}" stroke-width="3" stroke-linecap="round" />
        <!-- Screen Content Graphic -->
        <rect x="162" y="87" width="30" height="20" rx="2" fill="${color}" opacity="0.2" />
        <line x1="200" y1="90" x2="235" y2="90" stroke="${color}" stroke-width="2" opacity="0.4" />
        <line x1="200" y1="98" x2="230" y2="98" stroke="${color}" stroke-width="2" opacity="0.4" />
      `;

    case 'event_supplies':
      // Lanyard strap and conference name badge
      return `
        <!-- Lanyard Strap Loop -->
        <path d="M175 65 L 200 100 L 225 65" stroke="${color}" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6" />
        <!-- Swivel Clip -->
        <rect x="195" y="99" width="10" height="7" rx="1" fill="${color}" />
        <!-- Badge Card -->
        <rect x="165" y="106" width="70" height="52" rx="4" fill="white" stroke="${color}" stroke-width="2" />
        <rect x="175" y="115" width="20" height="20" rx="2" fill="${color}" opacity="0.2" />
        <line x1="202" y1="120" x2="225" y2="120" stroke="${color}" stroke-width="2" opacity="0.4" />
        <line x1="202" y1="128" x2="220" y2="128" stroke="${color}" stroke-width="2" opacity="0.4" />
      `;

    case 'shipping_packaging':
      // Corrugated carton box with tape
      return `
        <!-- Box Body -->
        <rect x="155" y="80" width="90" height="75" rx="3" fill="white" stroke="${color}" stroke-width="2.5" />
        <!-- Packaging Tape Center Strip -->
        <rect x="192" y="80" width="16" height="75" fill="${color}" opacity="0.18" />
        <line x1="200" y1="80" x2="200" y2="155" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 2" />
        <!-- Shipping Label -->
        <rect x="163" y="92" width="22" height="28" rx="1.5" fill="white" stroke="${color}" stroke-width="1.2" />
        <line x1="167" y1="98" x2="181" y2="98" stroke="${color}" stroke-width="1.2" />
        <line x1="167" y1="104" x2="178" y2="104" stroke="${color}" stroke-width="1" opacity="0.5" />
        <!-- Fragile / Up Arrows -->
        <polyline points="220,105 224,99 228,105" stroke="${color}" stroke-width="1.5" fill="none" />
        <polyline points="230,105 234,99 238,105" stroke="${color}" stroke-width="1.5" fill="none" />
      `;

    case 'workplace_cleaning':
      // Spray bottle and cloth
      return `
        <!-- Bottle Body -->
        <rect x="168" y="105" width="40" height="55" rx="6" fill="white" stroke="${color}" stroke-width="2.2" />
        <path d="M178 105 L 182 92 L 194 92 L 198 105 Z" fill="white" stroke="${color}" stroke-width="2" />
        <!-- Spray Trigger Nozzle -->
        <path d="M182 92 L 180 82 L 205 82 L 208 88 L 194 88" fill="${color}" />
        <line x1="174" y1="85" x2="160" y2="82" stroke="${color}" stroke-width="1.8" stroke-dasharray="2 2" />
        <!-- Level Window -->
        <line x1="188" y1="115" x2="188" y2="148" stroke="${color}" stroke-width="2" opacity="0.3" />
      `;

    case 'safety_accessories':
      // Safety shield with medical / safety cross
      return `
        <!-- Shield Silhouette -->
        <path d="M200 70 Q 235 70 235 105 C 235 135 200 155 200 162 C 200 155 165 135 165 105 Q 165 70 200 70 Z" fill="white" stroke="${color}" stroke-width="2.5" />
        <!-- Safety Cross Symbol (NOT a checkmark) -->
        <rect x="194" y="96" width="12" height="30" rx="1.5" fill="${color}" />
        <rect x="185" y="105" width="30" height="12" rx="1.5" fill="${color}" />
      `;

    case 'hospitality_breakroom':
      // Coffee mug with steam
      return `
        <!-- Mug Body -->
        <rect x="165" y="95" width="55" height="58" rx="6" fill="white" stroke="${color}" stroke-width="2.5" />
        <!-- Handle -->
        <path d="M220 106 C 232 106 232 135 220 135" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />
        <!-- Steam waves -->
        <path d="M178 88 Q 182 82 178 76" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.5" />
        <path d="M192 88 Q 196 82 192 76" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.6" />
        <path d="M206 88 Q 210 82 206 76" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.5" />
      `;

    default:
      // Neutral technical schematic drafting grid
      return `
        <rect x="155" y="75" width="90" height="85" rx="4" fill="white" stroke="${color}" stroke-width="2" />
        <line x1="155" y1="103" x2="245" y2="103" stroke="${color}" stroke-width="1" opacity="0.3" />
        <line x1="155" y1="131" x2="245" y2="131" stroke="${color}" stroke-width="1" opacity="0.3" />
        <line x1="185" y1="75" x2="185" y2="160" stroke="${color}" stroke-width="1" opacity="0.3" />
        <line x1="215" y1="75" x2="215" y2="160" stroke="${color}" stroke-width="1" opacity="0.3" />
        <polygon points="175,140 200,95 225,140" fill="${color}" opacity="0.15" stroke="${color}" stroke-width="1.5" />
      `;
  }
}

/**
 * Deterministic SVG visual fallback generator when remote CDN image is offline or fails to load.
 * Renders an inline themed SVG with category vector illustration and product specification.
 * Absolutely never draws a success checkmark.
 */
export function getProductSvgFallback(
  productId: string,
  name: string,
  category: string = 'office_stationery'
): string {
  const meta = PRODUCT_IMAGE_REGISTRY[productId];
  const color = meta?.accentColor || '#153E2E';
  const cleanName = (name || productId).replace(/[<>&"]/g, '');
  const catLabel = category.replace(/_/g, ' ').toUpperCase();
  const illustration = getCategoryIllustration(category, color);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
    <defs>
      <linearGradient id="bg_${productId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#F6F8F6" />
        <stop offset="100%" stop-color="#E5ECE7" />
      </linearGradient>
      <filter id="shadow_${productId}" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.08" />
      </filter>
    </defs>
    
    <!-- Background Card Frame -->
    <rect width="400" height="300" fill="url(#bg_${productId})" />
    
    <!-- Category Badge Pill -->
    <rect x="24" y="20" width="140" height="24" rx="6" fill="white" filter="url(#shadow_${productId})" />
    <circle cx="36" cy="32" r="4" fill="${color}" />
    <text x="46" y="36" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="700" fill="${color}" letter-spacing="0.6">${catLabel}</text>
    
    <!-- Central Technical Illustration Backdrop (No checkmark!) -->
    <circle cx="200" cy="120" r="62" fill="white" filter="url(#shadow_${productId})" />
    <circle cx="200" cy="120" r="54" fill="${color}" opacity="0.04" />
    
    <!-- Category-Specific Visual Silhouette -->
    ${illustration}
    
    <!-- Product Name & SKU Footer -->
    <text x="200" y="222" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" fill="#19211C" text-anchor="middle">${cleanName.slice(0, 36)}</text>
    <text x="200" y="242" font-family="'JetBrains Mono', monospace, Consolas" font-size="10" font-weight="500" fill="#637267" text-anchor="middle">SKU: ${productId}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
