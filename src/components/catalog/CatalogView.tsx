import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  RotateCcw,
  Truck,
  Box,
  Check,
  ShoppingBag,
  ArrowRight,
  Trash2,
  AlertCircle,
  Plus,
  Minus,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  ShieldCheck,
  Leaf,
  Layers,
  Star,
  SlidersHorizontal,
} from 'lucide-react';
import { CatalogProduct, Supplier, ProductCategory } from '../../lib/types.js';
import { fetchCatalog, resetCatalog, seedCatalog } from '../../lib/api.js';
import { useCart } from '../../context/CartContext.js';
import { ProductImage } from '../common/ProductImage.js';

interface CatalogViewProps {
  onContinueToPact?: () => void;
}

const CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Products' },
  { id: 'office_stationery', label: 'Office Stationery' },
  { id: 'college_education', label: 'College & Education' },
  { id: 'eco_friendly', label: 'Eco-Friendly & Reusable' },
  { id: 'technology_workspace', label: 'Tech & Workspace' },
  { id: 'event_supplies', label: 'Event & Supplies' },
  { id: 'shipping_packaging', label: 'Shipping & Packaging' },
  { id: 'workplace_cleaning', label: 'Workplace & Cleaning' },
  { id: 'storage_organization', label: 'Storage & Organization' },
  { id: 'safety_accessories', label: 'Safety & PPE' },
  { id: 'hospitality_breakroom', label: 'Breakroom & Hospitality' },
];

export const CatalogView: React.FC<CatalogViewProps> = ({ onContinueToPact }) => {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [totalMatching, setTotalMatching] = useState<number>(0);
  const [totalInCatalog, setTotalInCatalog] = useState<number>(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [priceBounds, setPriceBounds] = useState<{ min: number; max: number }>({ min: 0, max: 100 });

  // Filter & Search State
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minPriceInput, setMinPriceInput] = useState<string>('');
  const [maxPriceInput, setMaxPriceInput] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<
    'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'stock_desc' | 'delivery_asc'
  >('name_asc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 16;
  const [totalPages, setTotalPages] = useState<number>(1);

  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState<boolean>(false);
  const [activeModalProduct, setActiveModalProduct] = useState<CatalogProduct | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  const {
    isSelected,
    toggleSelectProduct,
    selectedItems,
    uniqueCount,
    totalQuantity,
    selectedSubtotal,
    setIsSummaryDrawerOpen,
    removeProduct,
    updateQuantity,
    getItemQuantity,
    addProduct,
  } = useCart();

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCatalog({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        subcategory: selectedSubcategory === 'all' ? undefined : selectedSubcategory,
        supplierId: selectedSupplierId === 'all' ? undefined : selectedSupplierId,
        search: searchQuery.trim() || undefined,
        minPrice: minPriceInput ? parseFloat(minPriceInput) : undefined,
        maxPrice: maxPriceInput ? parseFloat(maxPriceInput) : undefined,
        inStockOnly,
        sortBy,
        page: currentPage,
        limit: itemsPerPage,
      });

      setProducts(data.products || []);
      setSuppliers(data.suppliers || []);
      setTotalMatching(data.total || 0);
      setTotalInCatalog(data.totalInCatalog || data.total || 0);
      setTotalPages(data.totalPages || 1);
      if (data.categoryCounts) setCategoryCounts(data.categoryCounts);
      if (data.priceBounds) setPriceBounds(data.priceBounds);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [
    selectedCategory,
    selectedSubcategory,
    selectedSupplierId,
    searchQuery,
    minPriceInput,
    maxPriceInput,
    inStockOnly,
    sortBy,
    currentPage,
  ]);

  // Extract distinct subcategories available for the currently selected category
  const availableSubcategories = useMemo(() => {
    if (selectedCategory === 'all') {
      const allSub = new Set<string>();
      products.forEach((p) => {
        if (p.subcategory) allSub.add(p.subcategory);
      });
      return Array.from(allSub);
    }
    const catSub = new Set<string>();
    products.forEach((p) => {
      if (p.category === selectedCategory && p.subcategory) {
        catSub.add(p.subcategory);
      }
    });
    return Array.from(catSub);
  }, [products, selectedCategory]);

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setSelectedSupplierId('all');
    setSearchQuery('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setInStockOnly(false);
    setSortBy('name_asc');
    setCurrentPage(1);
  };

  const handleResetCatalog = async () => {
    try {
      await resetCatalog();
      setBannerMessage({
        text: 'Catalog inventory, baseline pricing, and suppliers successfully refreshed.',
        type: 'success',
      });
      setTimeout(() => setBannerMessage(null), 4000);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSeedCatalog = async () => {
    try {
      const res = await seedCatalog();
      setBannerMessage({
        text: `Catalog database verified: ${res.totalProducts} total products across ${res.totalSuppliers} verified suppliers. (${res.addedProducts} newly seeded).`,
        type: 'success',
      });
      setTimeout(() => setBannerMessage(null), 5000);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const activeFiltersCount = [
    selectedCategory !== 'all',
    selectedSubcategory !== 'all',
    selectedSupplierId !== 'all',
    searchQuery.trim().length > 0,
    minPriceInput.length > 0,
    maxPriceInput.length > 0,
    inStockOnly,
  ].filter(Boolean).length;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 pb-28 overflow-x-hidden min-w-0">
      {/* Top Banner & Selected Counter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-[#E3E7E4] shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-bold text-[#19211C] font-display">
              Enterprise Product Catalog
            </h1>
            <span className="px-2 py-0.5 bg-[#EEF4F0] text-[#153E2E] rounded-md text-[11px] font-bold">
              {totalInCatalog} Total Audited SKUs
            </span>
            <span className="px-2 py-0.5 bg-[#F2F5F3] text-[#637267] rounded-md text-[11px] font-medium hidden sm:inline-block">
              {suppliers.length} Certified Suppliers
            </span>
          </div>
          <p className="text-xs text-[#637267] mt-1">
            Browse verified institutional merchandise, compare supplier specifications, and select items directly into your Purchase Pact.
          </p>
        </div>

        {/* Action Controls: Seed & Cart Counter Bar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleSeedCatalog}
            className="px-3 py-2 bg-white border border-[#D5DDD7] hover:bg-[#F2F5F3] text-[#455448] text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Idempotently ensures all 140 catalog items and 10 suppliers are seeded"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#153E2E]" />
            <span>Verify Catalog (140)</span>
          </button>

          <button
            onClick={handleResetCatalog}
            className="px-3 py-2 bg-white border border-[#D5DDD7] hover:bg-[#F2F5F3] text-[#455448] text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Resets inventory to baseline demo state"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#79887D]" />
            <span>Restore Baseline</span>
          </button>

          {/* Selection Drawer Trigger Button */}
          <button
            onClick={() => setIsSummaryDrawerOpen(true)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
              uniqueCount > 0
                ? 'bg-[#153E2E] text-white hover:bg-[#1E4D3A]'
                : 'bg-[#F2F5F3] text-[#637267] hover:bg-[#EAEFEA]'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-[#88D4A8]" />
            <span>
              {uniqueCount === 0
                ? 'No Items Selected'
                : `${uniqueCount} ${uniqueCount === 1 ? 'Item' : 'Items'} (${totalQuantity} units)`}
            </span>
            {uniqueCount > 0 && (
              <span className="px-1.5 py-0.5 bg-[#225541] rounded-md font-mono-data text-[10px]">
                ${selectedSubtotal.toFixed(2)}
              </span>
            )}
          </button>

          {uniqueCount > 0 && onContinueToPact && (
            <button
              onClick={onContinueToPact}
              className="px-4 py-2 bg-[#205541] hover:bg-[#28644E] text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <span>Continue to Purchase</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#88D4A8]" />
            </button>
          )}
        </div>
      </div>

      {bannerMessage && (
        <div className="p-3 bg-[#EEF4F0] border border-[#C5DFC9] text-xs text-[#153E2E] rounded-xl font-medium flex items-center justify-between shadow-2xs">
          <span>{bannerMessage.text}</span>
          <button
            onClick={() => setBannerMessage(null)}
            className="text-[#153E2E] hover:text-[#0C241B] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Filter & Search Toolbar */}
      <div className="space-y-3">
        {/* Horizontal Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
          {CATEGORY_TABS.map((tab) => {
            const count =
              tab.id === 'all'
                ? totalInCatalog
                : categoryCounts[tab.id] || 0;
            const isTabActive = selectedCategory === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedCategory(tab.id);
                  setSelectedSubcategory('all');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                  isTabActive
                    ? 'bg-[#153E2E] text-white'
                    : 'bg-white text-[#455448] border border-[#E3E7E4] hover:bg-[#F2F5F3]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono-data ${
                    isTabActive ? 'bg-[#255240] text-white' : 'bg-[#EAEFEA] text-[#637267]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Secondary Filter Bar: Search, Supplier, Price, In-Stock, Sort */}
        <div className="bg-white p-3.5 rounded-2xl border border-[#E3E7E4] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Keyword Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-[#79887D] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by product name, SKU, specs, or material..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-8 py-2 bg-[#FBFBFA] border border-[#D5DDD7] rounded-xl text-xs text-[#19211C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#79887D] hover:text-[#19211C]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Supplier Dropdown */}
          <div className="w-full sm:w-auto">
            <select
              value={selectedSupplierId}
              onChange={(e) => {
                setSelectedSupplierId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-48 py-2 px-3 bg-[#FBFBFA] border border-[#D5DDD7] rounded-xl text-xs text-[#19211C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
            >
              <option value="all">All Suppliers (10)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.location})
                </option>
              ))}
            </select>
          </div>

          {/* Subcategory Dropdown (if available for category) */}
          {availableSubcategories.length > 0 && (
            <div className="w-full sm:w-auto">
              <select
                value={selectedSubcategory}
                onChange={(e) => {
                  setSelectedSubcategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full sm:w-44 py-2 px-3 bg-[#FBFBFA] border border-[#D5DDD7] rounded-xl text-xs text-[#19211C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
              >
                <option value="all">All Subcategories</option>
                {availableSubcategories.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Price Range Inputs */}
          <div className="flex items-center gap-1.5 text-xs text-[#637267]">
            <span className="font-semibold text-[11px]">$</span>
            <input
              type="number"
              placeholder="Min"
              min={0}
              value={minPriceInput}
              onChange={(e) => {
                setMinPriceInput(e.target.value);
                setCurrentPage(1);
              }}
              className="w-16 py-2 px-2 bg-[#FBFBFA] border border-[#D5DDD7] rounded-xl text-xs text-[#19211C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
            />
            <span>–</span>
            <input
              type="number"
              placeholder="Max"
              min={0}
              value={maxPriceInput}
              onChange={(e) => {
                setMaxPriceInput(e.target.value);
                setCurrentPage(1);
              }}
              className="w-16 py-2 px-2 bg-[#FBFBFA] border border-[#D5DDD7] rounded-xl text-xs text-[#19211C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
            />
          </div>

          {/* In-Stock Toggle */}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[#455448] cursor-pointer shrink-0 select-none">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => {
                setInStockOnly(e.target.checked);
                setCurrentPage(1);
              }}
              className="rounded text-[#153E2E] focus:ring-[#153E2E] w-3.5 h-3.5 accent-[#153E2E]"
            />
            <span>In-Stock Only</span>
          </label>

          {/* Sort Selector */}
          <div className="w-full sm:w-auto">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full sm:w-44 py-2 px-3 bg-[#FBFBFA] border border-[#D5DDD7] rounded-xl text-xs font-semibold text-[#19211C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
            >
              <option value="name_asc">Name: A to Z</option>
              <option value="name_desc">Name: Z to A</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="stock_desc">Availability: High Stock</option>
              <option value="delivery_asc">Fastest Delivery</option>
            </select>
          </div>

          {/* Reset Filters Shortcut */}
          {activeFiltersCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear ({activeFiltersCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Results Header: Matching Count & Page Info */}
      <div className="flex items-center justify-between text-xs text-[#637267] px-1">
        <div>
          Showing{' '}
          <strong className="text-[#19211C] font-mono-data">{products.length}</strong> of{' '}
          <strong className="text-[#19211C] font-mono-data">{totalMatching}</strong> matching products
          {totalMatching !== totalInCatalog && (
            <span> (filtered from {totalInCatalog} total)</span>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <span>
              Page <strong className="text-[#19211C] font-mono-data">{currentPage}</strong> of{' '}
              <strong className="text-[#19211C] font-mono-data">{totalPages}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-80 bg-white border border-[#E3E7E4] rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {products.map((product, idx) => {
            const selected = isSelected(product.id);
            const isOutOfStock = product.stockQuantity <= 0;
            const currentSelectedQty = getItemQuantity(product.id);

            return (
              <div
                key={`${product.id}-${idx}`}
                className={`border rounded-2xl overflow-hidden shadow-xs transition-all flex flex-col justify-between group relative min-w-0 ${
                  selected
                    ? 'bg-[#F7FAF8] border-[#153E2E] ring-1.5 ring-[#153E2E]'
                    : 'bg-white border-[#E3E7E4] hover:border-[#CAD4CC]'
                }`}
              >
                {/* Visual Highlight indicator if selected */}
                {selected && (
                  <div className="absolute top-2 left-2 z-20 px-2 py-0.5 bg-[#153E2E] text-white rounded-md text-[10px] font-bold flex items-center gap-1 shadow-xs pointer-events-none">
                    <Check className="w-3 h-3 text-[#88D4A8]" />
                    <span>In Selection ({currentSelectedQty})</span>
                  </div>
                )}

                <div className="min-w-0 flex flex-col">
                  {/* Product Image & Badges */}
                  <ProductImage
                    productId={product.id}
                    name={product.name}
                    category={product.category}
                    imageUrl={product.imageUrl}
                    aspectRatio="h-48"
                    fit="contain"
                    showDemoBadge={true}
                    showEcoBadge={true}
                    isEcoFriendly={Boolean(product.attributes.ecoFriendly)}
                    unitOfSale={product.unitOfSale}
                    onClick={() => setActiveModalProduct(product)}
                  />

                  {/* Body Content */}
                  <div className="p-4 space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0 text-[11px] font-medium text-[#637267]">
                      <span className="truncate min-w-0" title={product.supplierName}>
                        {product.supplierName}
                      </span>
                      <span
                        className="text-[10px] font-mono-data text-[#526056] uppercase shrink-0 px-1.5 py-0.5 bg-[#F2F5F3] rounded border border-[#E3E7E4]/50"
                        title={product.subcategory || product.category}
                      >
                        {product.subcategory?.replace(/_/g, ' ') || product.category.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <h3
                      className="text-xs sm:text-sm font-bold text-[#19211C] line-clamp-2 leading-snug cursor-pointer hover:text-[#153E2E] break-words overflow-hidden"
                      onClick={() => setActiveModalProduct(product)}
                      title={product.name}
                    >
                      {product.name}
                    </h3>

                    {/* SKU identifier badge with tooltip */}
                    <div className="flex items-center gap-1 text-[10px] font-mono-data text-[#79887D] min-w-0" title={`SKU: ${product.id}`}>
                      <span className="shrink-0 font-medium">SKU:</span>
                      <span className="truncate min-w-0 text-[#526056]">{product.id}</span>
                    </div>

                    <p className="text-[11px] text-[#637267] line-clamp-2 leading-relaxed">
                      {product.description}
                    </p>

                    <div className="pt-2 text-[11px] text-[#79887D] space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-[#153E2E] shrink-0" />
                        <span className="truncate">
                          {product.estimatedDeliveryDays}d delivery · ${product.shippingFlatRate.toFixed(2)} shipping
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-[#153E2E] shrink-0" />
                        <span
                          className={`truncate ${isOutOfStock ? 'text-red-700 font-bold' : 'text-[#455448]'}`}
                        >
                          {isOutOfStock
                            ? 'Out of stock (Cannot purchase)'
                            : `${product.stockQuantity} units available`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Price, Quick View, and Action Buttons */}
                <div className="p-4 pt-0 border-t border-[#F2F5F3] mt-2 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-[#79887D] uppercase font-semibold">
                        Unit Price
                      </div>
                      <div className="text-base font-bold text-[#153E2E] font-mono-data">
                        ${product.unitPrice.toFixed(2)}{' '}
                        <span className="text-[10px] font-normal text-[#637267]">
                          {product.currency}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveModalProduct(product)}
                      className="p-1.5 text-[#637267] hover:text-[#19211C] hover:bg-[#F2F5F3] rounded-lg transition-colors cursor-pointer"
                      title="Inspect Specifications & Supplier Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Primary Selection / Removal Control */}
                  <div className="flex items-center gap-2">
                    {selected ? (
                      <div className="flex items-center justify-between w-full bg-[#EAEFEA] p-1 rounded-xl">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (currentSelectedQty <= 1) {
                                removeProduct(product.id);
                              } else {
                                updateQuantity(product.id, currentSelectedQty - 1);
                              }
                            }}
                            className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-[#19211C] hover:bg-[#F2F5F3] cursor-pointer shadow-2xs"
                            title="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center text-xs font-bold font-mono-data text-[#153E2E]">
                            {currentSelectedQty}
                          </span>
                          <button
                            onClick={() => {
                              if (currentSelectedQty < product.stockQuantity) {
                                updateQuantity(product.id, currentSelectedQty + 1);
                              }
                            }}
                            disabled={currentSelectedQty >= product.stockQuantity}
                            className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-[#19211C] hover:bg-[#F2F5F3] disabled:opacity-40 cursor-pointer shadow-2xs"
                            title="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          onClick={() => removeProduct(product.id)}
                          className="px-2.5 py-1 text-[11px] font-bold text-red-700 hover:text-red-900 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (isOutOfStock) return;
                          toggleSelectProduct(product);
                        }}
                        disabled={isOutOfStock}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          isOutOfStock
                            ? 'bg-neutral-200 text-neutral-500'
                            : 'bg-[#153E2E] hover:bg-[#1E4D3A] text-white shadow-xs'
                        }`}
                      >
                        {isOutOfStock ? (
                          <span>Out of Stock</span>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5 text-[#88D4A8]" />
                            <span>Select for Purchase</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Polished Empty State */
        <div className="py-20 text-center bg-white border border-[#E3E7E4] rounded-2xl p-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F2F5F3] text-[#79887D] flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#19211C]">No catalog products found</h3>
          <p className="text-xs text-[#637267] max-w-md mx-auto">
            We couldn't find any products matching your current category, search query, or price filters.
          </p>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 bg-[#153E2E] text-white text-xs font-bold rounded-xl hover:bg-[#1E4D3A] transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Filters</span>
          </button>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#E3E7E4]">
          <div className="text-xs text-[#637267]">
            Showing page <strong className="text-[#19211C] font-mono-data">{currentPage}</strong> of{' '}
            <strong className="text-[#19211C] font-mono-data">{totalPages}</strong> ({totalMatching} results)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-2 bg-white border border-[#D5DDD7] rounded-xl text-xs font-semibold text-[#455448] hover:bg-[#F2F5F3] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            {/* Page number buttons */}
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 rounded-xl text-xs font-bold font-mono-data cursor-pointer transition-colors ${
                    currentPage === pageNum
                      ? 'bg-[#153E2E] text-white shadow-xs'
                      : 'bg-white text-[#455448] border border-[#D5DDD7] hover:bg-[#F2F5F3]'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-2 bg-white border border-[#D5DDD7] rounded-xl text-xs font-semibold text-[#455448] hover:bg-[#F2F5F3] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Bottom Selection Bar (when items are selected) */}
      {uniqueCount > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md border border-[#153E2E]/30 rounded-2xl shadow-xl px-6 py-3.5 flex items-center justify-between gap-6 max-w-xl w-[92%]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#153E2E] text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShoppingBag className="w-4 h-4 text-[#88D4A8]" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#19211C]">
                {uniqueCount} {uniqueCount === 1 ? 'Product' : 'Products'} in Purchase
              </div>
              <div className="text-[11px] text-[#637267]">
                Subtotal:{' '}
                <strong className="font-mono-data text-[#153E2E]">
                  ${selectedSubtotal.toFixed(2)} USD
                </strong>
                <span className="text-[10px] text-[#79887D]"> ({totalQuantity} total units)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsSummaryDrawerOpen(true)}
              className="px-3 py-1.5 bg-[#F2F5F3] hover:bg-[#EAEFEA] text-[#19211C] text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              View Cart
            </button>
            {onContinueToPact && (
              <button
                onClick={onContinueToPact}
                className="px-4 py-1.5 bg-[#153E2E] hover:bg-[#1E4D3A] text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>Continue to Pact</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#88D4A8]" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Detailed Product Specifications Modal */}
      {activeModalProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setActiveModalProduct(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveModalProduct(null)}
              className="absolute top-5 right-5 text-[#79887D] hover:text-[#19211C] p-1.5 rounded-xl hover:bg-[#F2F5F3] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="w-full sm:w-48 h-48 rounded-2xl overflow-hidden shrink-0 border border-[#E3E7E4]">
                <ProductImage
                  productId={activeModalProduct.id}
                  name={activeModalProduct.name}
                  category={activeModalProduct.category}
                  imageUrl={activeModalProduct.imageUrl}
                  aspectRatio="h-full"
                  fit="contain"
                  showDemoBadge={true}
                  showEcoBadge={true}
                  isEcoFriendly={Boolean(activeModalProduct.attributes.ecoFriendly)}
                  unitOfSale={activeModalProduct.unitOfSale}
                />
              </div>

              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-[#637267] min-w-0">
                  <span className="font-semibold text-[#153E2E] truncate">
                    {activeModalProduct.supplierName}
                  </span>
                  <span>·</span>
                  <span className="font-mono-data text-[10px] uppercase truncate" title={`SKU: ${activeModalProduct.id}`}>
                    SKU: {activeModalProduct.id}
                  </span>
                </div>

                <h2 className="text-base font-bold text-[#19211C] leading-snug break-words">
                  {activeModalProduct.name}
                </h2>

                <div className="flex items-center gap-3 pt-1">
                  <div className="text-xl font-extrabold text-[#153E2E] font-mono-data">
                    ${activeModalProduct.unitPrice.toFixed(2)}{' '}
                    <span className="text-xs font-normal text-[#637267]">
                      {activeModalProduct.currency}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      activeModalProduct.stockQuantity > 0
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-red-50 text-red-800'
                    }`}
                  >
                    {activeModalProduct.stockQuantity > 0
                      ? `${activeModalProduct.stockQuantity} Units In Stock`
                      : 'Out of Stock'}
                  </span>
                </div>

                <p className="text-xs text-[#637267] leading-relaxed pt-1">
                  {activeModalProduct.description}
                </p>
              </div>
            </div>

            {/* Specification Grid */}
            <div className="p-4 bg-[#FBFBFA] border border-[#E3E7E4] rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-[#19211C] uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#153E2E]" />
                <span>Product Specifications & Compliance</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-[#79887D] block">Category</span>
                  <span className="font-semibold text-[#19211C]">
                    {activeModalProduct.category.replace(/_/g, ' ')}
                  </span>
                </div>
                {activeModalProduct.subcategory && (
                  <div>
                    <span className="text-[10px] text-[#79887D] block">Subcategory</span>
                    <span className="font-semibold text-[#19211C]">
                      {activeModalProduct.subcategory.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-[#79887D] block">Unit of Sale</span>
                  <span className="font-semibold text-[#19211C] uppercase">
                    {activeModalProduct.unitOfSale || 'Each'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#79887D] block">Shipping Flat Rate</span>
                  <span className="font-semibold text-[#19211C]">
                    ${activeModalProduct.shippingFlatRate.toFixed(2)} USD
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#79887D] block">Estimated Delivery</span>
                  <span className="font-semibold text-[#19211C]">
                    {activeModalProduct.estimatedDeliveryDays} Business Days
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#79887D] block">Eco-Friendly Grade</span>
                  <span className="font-semibold text-[#19211C]">
                    {activeModalProduct.attributes.ecoFriendly ? 'Certified Eco' : 'Standard Commercial'}
                  </span>
                </div>
              </div>

              {/* Dynamic Attributes */}
              {Object.keys(activeModalProduct.attributes).length > 0 && (
                <div className="pt-2 border-t border-[#E8ECE8] space-y-1">
                  <span className="text-[10px] text-[#79887D] font-bold uppercase">
                    Detailed Attributes
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Object.entries(activeModalProduct.attributes).map(([key, value]) => {
                      if (key === 'ecoFriendly') return null;
                      const displayVal = Array.isArray(value) ? value.join(', ') : String(value);
                      return (
                        <div
                          key={key}
                          className="px-2.5 py-1 bg-white border border-[#D5DDD7] rounded-lg text-[11px] text-[#455448]"
                        >
                          <strong className="capitalize text-[#19211C]">
                            {key.replace(/([A-Z])/g, ' $1')}:
                          </strong>{' '}
                          {displayVal}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-[#79887D]">
                Demo catalog data · BoundBuy Purchase Pact Verified
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveModalProduct(null)}
                  className="px-4 py-2 border border-[#D5DDD7] text-xs font-semibold rounded-xl text-[#455448] hover:bg-[#F2F5F3] cursor-pointer"
                >
                  Close
                </button>

                <button
                  onClick={() => {
                    if (activeModalProduct.stockQuantity <= 0) return;
                    toggleSelectProduct(activeModalProduct);
                  }}
                  disabled={activeModalProduct.stockQuantity <= 0}
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected(activeModalProduct.id)
                      ? 'bg-red-700 hover:bg-red-800 text-white shadow-xs'
                      : 'bg-[#153E2E] hover:bg-[#1E4D3A] text-white shadow-xs'
                  }`}
                >
                  {isSelected(activeModalProduct.id) ? (
                    <>
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                      <span>Remove from Purchase</span>
                    </>
                  ) : activeModalProduct.stockQuantity <= 0 ? (
                    <span>Out of Stock</span>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 text-[#88D4A8]" />
                      <span>Add to Purchase Selection</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
