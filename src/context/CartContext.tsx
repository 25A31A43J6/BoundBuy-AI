import React, { createContext, useContext, useState, useEffect } from 'react';
import { CatalogProduct } from '../lib/types.js';

export interface CartItem {
  product: CatalogProduct;
  quantity: number;
}

interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface CartContextType {
  selectedItems: CartItem[];
  isSelected: (productId: string) => boolean;
  getItemQuantity: (productId: string) => number;
  toggleSelectProduct: (product: CatalogProduct) => { added: boolean; error?: string };
  addProduct: (product: CatalogProduct, quantity?: number) => { success: boolean; error?: string };
  removeProduct: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => { success: boolean; error?: string };
  clearSelection: () => void;
  totalQuantity: number;
  uniqueCount: number;
  selectedSubtotal: number;
  toast: ToastNotification | null;
  dismissToast: () => void;
  isSummaryDrawerOpen: boolean;
  setIsSummaryDrawerOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = 'boundbuy_selected_products_v1';

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedItems, setSelectedItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const seen = new Set<string>();
          const unique: CartItem[] = [];
          for (const item of parsed) {
            if (item && item.product && item.product.id && !seen.has(item.product.id)) {
              seen.add(item.product.id);
              unique.push(item);
            }
          }
          return unique;
        }
      }
    } catch (e) {
      console.warn('Failed to parse stored selected items:', e);
    }
    return [];
  });

  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [isSummaryDrawerOpen, setIsSummaryDrawerOpen] = useState(false);

  // Sync to local storage whenever selection changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedItems));
    } catch (e) {
      console.warn('Failed to persist selected items:', e);
    }
  }, [selectedItems]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3500);
  };

  const dismissToast = () => {
    setToast(null);
  };

  const isSelected = (productId: string): boolean => {
    return selectedItems.some((item) => item.product.id === productId);
  };

  const getItemQuantity = (productId: string): number => {
    const item = selectedItems.find((i) => i.product.id === productId);
    return item ? item.quantity : 0;
  };

  const addProduct = (
    product: CatalogProduct,
    quantity = 1
  ): { success: boolean; error?: string } => {
    if (!product || !product.id) {
      const err = 'Invalid product data.';
      showToast(err, 'error');
      return { success: false, error: err };
    }

    if (product.stockQuantity <= 0) {
      const err = `Cannot select "${product.name}": Product is currently out of stock.`;
      showToast(err, 'error');
      return { success: false, error: err };
    }

    const existingIndex = selectedItems.findIndex(
      (item) => item.product.id === product.id
    );

    if (existingIndex >= 0) {
      const err = `"${product.name}" is already in your selection. Update quantity in the selection drawer.`;
      showToast(err, 'info');
      return { success: false, error: err };
    }

    const targetQty = Math.max(1, Math.min(quantity, product.stockQuantity));
    const newItem: CartItem = {
      product,
      quantity: targetQty,
    };

    setSelectedItems((prev) => [...prev, newItem]);
    showToast(`"${product.name}" added to your purchase.`, 'success');
    return { success: true };
  };

  const removeProduct = (productId: string) => {
    const itemToRemove = selectedItems.find((i) => i.product.id === productId);
    setSelectedItems((prev) => prev.filter((i) => i.product.id !== productId));
    if (itemToRemove) {
      showToast(`Removed "${itemToRemove.product.name}" from your selection.`, 'info');
    }
  };

  const toggleSelectProduct = (
    product: CatalogProduct
  ): { added: boolean; error?: string } => {
    if (isSelected(product.id)) {
      removeProduct(product.id);
      return { added: false };
    } else {
      const result = addProduct(product, 1);
      return { added: result.success, error: result.error };
    }
  };

  const updateQuantity = (
    productId: string,
    newQuantity: number
  ): { success: boolean; error?: string } => {
    const item = selectedItems.find((i) => i.product.id === productId);
    if (!item) {
      return { success: false, error: 'Product not found in selection.' };
    }

    if (newQuantity <= 0) {
      removeProduct(productId);
      return { success: true };
    }

    if (newQuantity > item.product.stockQuantity) {
      const err = `Maximum available stock for "${item.product.name}" is ${item.product.stockQuantity}.`;
      showToast(err, 'error');
      return { success: false, error: err };
    }

    setSelectedItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, quantity: newQuantity } : i
      )
    );
    return { success: true };
  };

  const clearSelection = () => {
    setSelectedItems([]);
    showToast('Selection cleared.', 'info');
  };

  const totalQuantity = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueCount = selectedItems.length;

  const selectedSubtotal = selectedItems.reduce(
    (sum, item) => sum + item.product.unitPrice * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        selectedItems,
        isSelected,
        getItemQuantity,
        toggleSelectProduct,
        addProduct,
        removeProduct,
        updateQuantity,
        clearSelection,
        totalQuantity,
        uniqueCount,
        selectedSubtotal,
        toast,
        dismissToast,
        isSummaryDrawerOpen,
        setIsSummaryDrawerOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
