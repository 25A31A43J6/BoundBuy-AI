import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useCart } from '../../context/CartContext.js';

export const ToastContainer: React.FC = () => {
  const { toast, dismissToast } = useCart();

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div
        className={`p-4 rounded-xl shadow-lg border flex items-start gap-3 ${
          toast.type === 'error'
            ? 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
            : toast.type === 'info'
            ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]'
            : 'bg-[#153E2E] border-[#1E4D3A] text-white'
        }`}
      >
        <div className="shrink-0 mt-0.5">
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-[#DC2626]" />
          ) : toast.type === 'info' ? (
            <Info className="w-4 h-4 text-[#2563EB]" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#88D4A8]" />
          )}
        </div>

        <div className="flex-1 text-xs font-medium leading-relaxed">
          {toast.message}
        </div>

        <button
          onClick={dismissToast}
          className="shrink-0 p-0.5 hover:opacity-75 transition-opacity cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
