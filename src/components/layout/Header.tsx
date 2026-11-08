import React from 'react';
import { Sparkles, Shield, Database, ShoppingBag } from 'lucide-react';
import { NavTab } from './Sidebar.js';
import { AppConfig } from '../../lib/types.js';
import { useCart } from '../../context/CartContext.js';

interface HeaderProps {
  activeTab: NavTab;
  onNewPurchaseClick: () => void;
  config: AppConfig | null;
}

const TAB_TITLES: Record<NavTab, { title: string; subtitle: string }> = {
  overview: {
    title: 'Purchasing Dashboard',
    subtitle: 'Track spending limits, verified orders, and cryptographic guardrail states',
  },
  intelligence: {
    title: 'Procurement Intelligence',
    subtitle: 'Smarter purchasing decisions. Explainable AI. Buyer-controlled payments.',
  },
  'new-purchase': {
    title: 'AI Purchasing Assistant',
    subtitle: 'Define buying goals in plain English. Enforce strict budget, stock, and timeline constraints.',
  },
  catalog: {
    title: 'Verified Supplier Catalog',
    subtitle: 'Audited products with deterministic live pricing, shipping rates, and inventory',
  },
  orders: {
    title: 'My Orders & Invoices',
    subtitle: 'Authoritative PayPal Sandbox captures with official downloadable PDF receipts',
  },
  audit: {
    title: 'Activity & Audit Ledger',
    subtitle: 'Cryptographic event log tracking intent creation, approvals, price changes, and captures',
  },
  settings: {
    title: 'Procurement Settings',
    subtitle: 'Configure spending limits, approval strictness, currency, and PayPal Sandbox keys',
  },
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onNewPurchaseClick,
  config,
}) => {
  const current = TAB_TITLES[activeTab];
  const { uniqueCount, setIsSummaryDrawerOpen } = useCart();

  return (
    <header className="h-16 px-8 border-b border-[#E3E7E4] bg-white flex items-center justify-between gap-6 shrink-0">
      {/* Breadcrumb / Title */}
      <div className="flex items-center gap-3 min-w-0">
        <div>
          <div className="text-xs font-semibold text-[#637267] flex items-center gap-1.5">
            <span>BoundBuy</span>
            <span className="text-[#A2AEA5]">/</span>
            <span className="text-[#19211C] font-bold">{current.title}</span>
          </div>
          <p className="text-[11px] text-[#637267] truncate hidden md:block">
            {current.subtitle}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Storage State Indicator */}
        <div
          title={
            config?.storageMode === 'mongodb'
              ? 'Connected to remote MongoDB Atlas database'
              : 'Local JSON store (.data/boundbuy_store.json) is persistent locally, but ephemeral across container resets on serverless Cloud Run'
          }
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-[#F5F7F5] border border-[#E1E6E2] rounded-md text-[11px] text-[#425046]"
        >
          <Database className="w-3.5 h-3.5 text-[#153E2E]" />
          <span>
            {config?.storageMode === 'mongodb' ? 'MongoDB Atlas' : 'Local JSON (Ephemeral on Cloud Run)'}
          </span>
        </div>

        {/* PayPal Status Tag */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#EEF4F0] border border-[#D1E0D6] rounded-md text-[11px] text-[#153E2E] font-medium">
          <Shield className="w-3.5 h-3.5 text-[#153E2E]" />
          <span>
            {config?.paypal?.isConfigured ? 'PayPal Sandbox Active' : 'PayPal Config Mode'}
          </span>
        </div>

        {/* Selected Items Counter & Drawer Trigger */}
        <button
          onClick={() => setIsSummaryDrawerOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs ${
            uniqueCount > 0
              ? 'bg-[#EEF4F0] hover:bg-[#E0EDE3] border border-[#C5DFC9] text-[#153E2E]'
              : 'bg-[#F5F7F5] hover:bg-[#EAEFEA] border border-[#E1E6E2] text-[#637267]'
          }`}
          title="View Selected Products in Purchase"
        >
          <ShoppingBag className="w-3.5 h-3.5 text-[#153E2E]" />
          <span>Selection ({uniqueCount})</span>
        </button>

        {/* Primary Action Button */}
        {activeTab !== 'new-purchase' && (
          <button
            onClick={onNewPurchaseClick}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#153E2E] hover:bg-[#1C4E3D] transition-colors shadow-xs whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#88D4A8]" />
            <span>Create a Purchase</span>
          </button>
        )}
      </div>
    </header>
  );
};
