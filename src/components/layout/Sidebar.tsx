import React from 'react';
import {
  LayoutDashboard,
  Sparkles,
  ShoppingBag,
  Receipt,
  ShieldCheck,
  Settings as SettingsIcon,
  ShieldAlert,
  CreditCard,
  Cpu,
} from 'lucide-react';

import { useCart } from '../../context/CartContext.js';

export type NavTab =
  | 'overview'
  | 'intelligence'
  | 'new-purchase'
  | 'catalog'
  | 'orders'
  | 'audit'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingApprovalsCount: number;
  blockedCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  pendingApprovalsCount,
  blockedCount,
}) => {
  const { uniqueCount } = useCart();

  const navItems = [
    {
      id: 'overview' as NavTab,
      label: 'Overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'intelligence' as NavTab,
      label: 'Procurement Intelligence',
      icon: Cpu,
      badge: '4 AI Tools',
      badgeType: 'success' as const,
    },
    {
      id: 'new-purchase' as NavTab,
      label: 'New Purchase',
      icon: Sparkles,
      badge: 'AI Agent',
    },
    {
      id: 'catalog' as NavTab,
      label: 'Product Catalog',
      icon: ShoppingBag,
      badge: uniqueCount > 0 ? `${uniqueCount} selected` : null,
      badgeType: 'success' as const,
    },
    {
      id: 'orders' as NavTab,
      label: 'My Orders',
      icon: Receipt,
      badge: null,
    },
    {
      id: 'audit' as NavTab,
      label: 'Activity & Audit',
      icon: ShieldCheck,
      badge: blockedCount > 0 ? `${blockedCount} blocked` : null,
      badgeType: 'warning' as const,
    },
    {
      id: 'settings' as NavTab,
      label: 'Settings',
      icon: SettingsIcon,
      badge: null,
    },
  ];

  return (
    <aside className="w-64 bg-[#F7F8F7] border-r border-[#E3E7E4] flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#E3E7E4]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#153E2E] flex items-center justify-center text-white shadow-xs">
            <ShieldCheck className="w-5 h-5 text-[#88D4A8]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#19211C] tracking-tight font-display">
              BoundBuy AI
            </h1>
            <p className="text-[11px] text-[#637267] tracking-tight">
              Rules-Bound Procurement
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1">
        <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-[#79887D] uppercase">
          Purchasing Agent
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#153E2E] text-white shadow-xs'
                  : 'text-[#2D3A31] hover:bg-[#EAEFEA] hover:text-[#153E2E]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-[#88D4A8]' : 'text-[#637267]'
                  }`}
                />
                <span className="whitespace-nowrap">{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    isActive
                      ? 'bg-[#24523F] text-[#BEE5D0]'
                      : item.badgeType === 'warning'
                      ? 'bg-[#FEE2E2] text-[#991B1B]'
                      : 'bg-[#E3EAE4] text-[#24523F]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Trust & Policy Seal */}
      <div className="p-3.5 mx-3 mb-3 bg-[#EEF4F0] border border-[#D5E2D9] rounded-lg">
        <div className="flex items-start gap-2">
          <CreditCard className="w-4 h-4 text-[#153E2E] mt-0.5 shrink-0" />
          <div className="text-[11px] text-[#24523F] leading-relaxed">
            <span className="font-semibold block text-[#153E2E]">
              Payment Guardrails
            </span>
            AI cannot authorize or charge payments. All checkouts require explicit
            buyer sign-off via PayPal.
          </div>
        </div>
      </div>

      {/* Account Info Footer */}
      <div className="p-4 border-t border-[#E3E7E4] bg-[#F2F5F3]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#153E2E]/10 border border-[#153E2E]/20 text-[#153E2E] flex items-center justify-center font-bold text-xs">
            AC
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[#19211C] truncate">
              Alex Chen
            </div>
            <div className="text-[10px] text-[#637267] truncate">
              alex.chen@boundbuy.org
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
