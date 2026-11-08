/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './components/layout/Sidebar.js';
import { Header } from './components/layout/Header.js';
import { OverviewView } from './components/overview/OverviewView.js';
import { NewPurchaseFlow } from './components/new-purchase/NewPurchaseFlow.js';
import { CatalogView } from './components/catalog/CatalogView.js';
import { OrdersView } from './components/orders/OrdersView.js';
import { AuditTrailView } from './components/audit/AuditTrailView.js';
import { SettingsView } from './components/settings/SettingsView.js';
import { ProcurementIntelligenceDashboard } from './components/intelligence/ProcurementIntelligenceDashboard.js';
import { PurchaseSummaryDrawer } from './components/cart/PurchaseSummaryDrawer.js';
import { BoundBuyChatbot } from './components/chat/BoundBuyChatbot.js';
import { ToastContainer } from './components/common/ToastContainer.js';
import { CartProvider } from './context/CartContext.js';
import { AppConfig, DashboardStats, OrderRecord } from './lib/types.js';
import { fetchConfig, fetchDashboardStats } from './lib/api.js';

function AppContent() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [newPurchaseStep, setNewPurchaseStep] = useState<'input' | 'pact'>('input');

  const refreshStats = async () => {
    try {
      const s = await fetchDashboardStats();
      setStats(s);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch((err) => console.error('Failed to load app config:', err));
    refreshStats();

    // Handle return from PayPal redirect flow if applicable
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setActiveTab('new-purchase');
      setNewPurchaseStep('pact');
    }
  }, []);

  const handleOrderCompleted = (order: OrderRecord) => {
    refreshStats();
  };

  const handleNavigateToPactFromCatalog = () => {
    setNewPurchaseStep('pact');
    setActiveTab('new-purchase');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FBFBFA]">
      {/* Restrained Desktop Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'new-purchase') {
            setNewPurchaseStep('input');
          }
          setActiveTab(tab);
        }}
        pendingApprovalsCount={stats?.pendingApprovals ?? 0}
        blockedCount={stats?.blockedEventsCount ?? 0}
      />

      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          activeTab={activeTab}
          onNewPurchaseClick={() => {
            setNewPurchaseStep('input');
            setActiveTab('new-purchase');
          }}
          config={config}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewView
              stats={stats}
              onNavigateNewPurchase={() => {
                setNewPurchaseStep('input');
                setActiveTab('new-purchase');
              }}
              onNavigateOrders={() => setActiveTab('orders')}
              onNavigateAudit={() => setActiveTab('audit')}
              onNavigateCatalog={() => setActiveTab('catalog')}
              onNavigateIntelligence={() => setActiveTab('intelligence')}
            />
          )}

          {activeTab === 'intelligence' && (
            <ProcurementIntelligenceDashboard
              config={config}
              onNavigateToPact={handleNavigateToPactFromCatalog}
              onNavigateToCatalog={() => setActiveTab('catalog')}
              onNavigateToOrders={() => setActiveTab('orders')}
            />
          )}

          {activeTab === 'new-purchase' && (
            <NewPurchaseFlow
              key={newPurchaseStep}
              config={config}
              onConfigUpdated={(updated) => setConfig(updated)}
              initialStep={newPurchaseStep}
              onOrderCompleted={handleOrderCompleted}
              onViewCatalog={() => setActiveTab('catalog')}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogView
              onContinueToPact={handleNavigateToPactFromCatalog}
            />
          )}

          {activeTab === 'orders' && <OrdersView />}

          {activeTab === 'audit' && <AuditTrailView />}

          {activeTab === 'settings' && (
            <SettingsView
              config={config}
              onConfigUpdated={(updated) => setConfig(updated)}
            />
          )}
        </main>
      </div>

      {/* Global Selection Drawer, Mini Chatbot, and Toast Feedback */}
      <PurchaseSummaryDrawer onContinueToPact={handleNavigateToPactFromCatalog} />
      <BoundBuyChatbot />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <CartProvider>
      <AppContent />
    </CartProvider>
  );
}
