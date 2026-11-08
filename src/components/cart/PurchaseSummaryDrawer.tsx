import React from 'react';
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  X,
  Truck,
  AlertCircle,
} from 'lucide-react';
import { useCart } from '../../context/CartContext.js';
import { ProductImage } from '../common/ProductImage.js';

interface PurchaseSummaryDrawerProps {
  onContinueToPact: () => void;
}

export const PurchaseSummaryDrawer: React.FC<PurchaseSummaryDrawerProps> = ({
  onContinueToPact,
}) => {
  const {
    selectedItems,
    removeProduct,
    updateQuantity,
    clearSelection,
    selectedSubtotal,
    uniqueCount,
    totalQuantity,
    isSummaryDrawerOpen,
    setIsSummaryDrawerOpen,
  } = useCart();

  if (!isSummaryDrawerOpen) return null;

  // Calculate estimated shipping across distinct suppliers
  const supplierShippingMap: Record<string, number> = {};
  selectedItems.forEach(({ product }) => {
    if (
      supplierShippingMap[product.supplierId] === undefined ||
      product.shippingFlatRate > supplierShippingMap[product.supplierId]
    ) {
      supplierShippingMap[product.supplierId] = product.shippingFlatRate;
    }
  });

  const estimatedShipping = Object.values(supplierShippingMap).reduce(
    (sum, val) => sum + val,
    0
  );
  const estimatedGrandTotal = selectedSubtotal + estimatedShipping;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={() => setIsSummaryDrawerOpen(false)}
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between border-l border-[#E3E7E4]">
          {/* Header */}
          <div className="p-5 border-b border-[#E3E7E4] flex items-center justify-between bg-[#F8FAF8]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#153E2E] flex items-center justify-center text-white">
                <ShoppingBag className="w-4 h-4 text-[#88D4A8]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#19211C] font-display">
                  Selected Procurement Items
                </h3>
                <p className="text-[11px] text-[#637267]">
                  {uniqueCount} unique {uniqueCount === 1 ? 'product' : 'products'} · {totalQuantity} total units
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsSummaryDrawerOpen(false)}
              className="p-1.5 rounded-lg text-[#79887D] hover:text-[#19211C] hover:bg-[#EAEFEA] transition-colors cursor-pointer"
              aria-label="Close summary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {selectedItems.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <ShoppingBag className="w-10 h-10 text-[#C4D0C7] mx-auto" />
                <div className="text-xs font-bold text-[#19211C]">
                  Your purchase selection is empty
                </div>
                <p className="text-[11px] text-[#637267] max-w-xs mx-auto">
                  Browse the Product Catalog and click "Select" on any product to add it to your order.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] text-[#637267] pb-1 border-b border-[#F2F5F3]">
                  <span>Items</span>
                  <button
                    onClick={clearSelection}
                    className="text-[#991B1B] hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>

                {selectedItems.map(({ product, quantity }, idx) => {
                  const lineTotal = product.unitPrice * quantity;

                  return (
                    <div
                      key={`${product.id}-${idx}`}
                      className="p-3.5 bg-[#FBFBFA] border border-[#EAEFEA] rounded-xl space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-14 h-14 rounded-lg overflow-hidden border border-[#E3E7E4] shrink-0">
                          <ProductImage
                            productId={product.id}
                            name={product.name}
                            category={product.category}
                            imageUrl={product.imageUrl}
                            aspectRatio="h-full"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-[#19211C] leading-snug">
                            {product.name}
                          </h4>
                          <div className="text-[10px] text-[#637267] mt-0.5">
                            Supplier: {product.supplierName}
                          </div>
                          <div className="text-xs font-bold text-[#153E2E] mt-1 font-mono-data">
                            ${product.unitPrice.toFixed(2)}{' '}
                            <span className="text-[10px] font-normal text-[#637267]">each</span>
                          </div>
                        </div>

                        <button
                          onClick={() => removeProduct(product.id)}
                          className="text-[#991B1B] hover:text-[#DC2626] p-1 transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Quantity Controller & Subtotal */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#F0F3F0] text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#637267]">Quantity:</span>
                          <div className="flex items-center border border-[#D5DDD7] rounded-md bg-white">
                            <button
                              onClick={() => updateQuantity(product.id, quantity - 1)}
                              className="px-2 py-0.5 hover:bg-[#F2F5F3] text-[#425046] cursor-pointer"
                              title="Decrease quantity"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2.5 py-0.5 text-xs font-bold font-mono-data text-[#19211C]">
                              {quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(product.id, quantity + 1)}
                              disabled={quantity >= product.stockQuantity}
                              className="px-2 py-0.5 hover:bg-[#F2F5F3] text-[#425046] disabled:opacity-30 cursor-pointer"
                              title="Increase quantity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] text-[#79887D]">Subtotal</div>
                          <div className="text-xs font-bold text-[#19211C] font-mono-data">
                            ${lineTotal.toFixed(2)} USD
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer with Calculations & Continue CTA */}
          {selectedItems.length > 0 && (
            <div className="p-5 border-t border-[#E3E7E4] bg-[#F8FAF8] space-y-4">
              <div className="space-y-1.5 text-xs text-[#637267]">
                <div className="flex justify-between">
                  <span>Items Subtotal:</span>
                  <span className="font-mono-data text-[#19211C] font-semibold">
                    ${selectedSubtotal.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-[#153E2E]" />
                    <span>Estimated Shipping:</span>
                  </span>
                  <span className="font-mono-data text-[#19211C]">
                    ${estimatedShipping.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#E3E7E4] text-sm font-bold text-[#153E2E]">
                  <span>Estimated Total:</span>
                  <span className="font-mono-data text-base">
                    ${estimatedGrandTotal.toFixed(2)} USD
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-[#EEF4F0] border border-[#C5DFC9] rounded-lg text-[11px] text-[#24523F] flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#153E2E] shrink-0 mt-0.5" />
                <span>
                  Continuing creates an official <strong>Purchase Pact</strong>. All prices and live stock will be cryptographically locked before PayPal payment.
                </span>
              </div>

              <button
                onClick={() => {
                  setIsSummaryDrawerOpen(false);
                  onContinueToPact();
                }}
                className="w-full py-3 bg-[#153E2E] hover:bg-[#1E4D3A] text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue to Purchase Pact</span>
                <ArrowRight className="w-4 h-4 text-[#88D4A8]" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
