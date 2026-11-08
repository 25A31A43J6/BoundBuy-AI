import React, { useState, useEffect } from 'react';
import {
  FileText,
  CheckCircle2,
  Lock,
  ExternalLink,
  Printer,
  ShieldCheck,
  Search,
  Truck,
} from 'lucide-react';
import { OrderRecord } from '../../lib/types.js';
import { fetchOrders } from '../../lib/api.js';
import { generateOrderPdfReceipt } from '../../lib/pdf.js';
import { OrderStatusLifecycle } from './OrderStatusLifecycle.js';
import { ShipmentTrackingSection } from './ShipmentTrackingSection.js';
import { ShipmentRegisterModal } from './ShipmentRegisterModal.js';
import { ProductImage } from '../common/ProductImage.js';

export const OrdersView: React.FC = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [registeringOrder, setRegisteringOrder] = useState<OrderRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const res = await fetchOrders();
      setOrders(res.orders);
    } catch (err) {
      console.error('Failed to load orders', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = orders.filter((o) => {
    const q = searchQuery.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.paypalOrderId.toLowerCase().includes(q) ||
      o.paypalCaptureId.toLowerCase().includes(q) ||
      o.buyerEmail.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#19211C] font-display">
            Orders & Payment Authorizations
          </h2>
          <p className="text-xs text-[#637267]">
            Authoritative records captured via PayPal Orders v2 REST API
          </p>
        </div>

        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-[#79887D] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order #, PayPal ID, capture..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#D5DDD7] rounded-lg text-xs text-[#19211C] focus:outline-none focus:ring-1 focus:ring-[#153E2E]"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-[#E3E7E4] rounded-xl overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-[#79887D]">
            Loading orders...
          </div>
        ) : filteredOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E3E7E4] bg-[#F7F8F7] text-[#637267] font-semibold">
                  <th className="py-3 px-4">Order Ref</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">PayPal Capture ID</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEFEA]">
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-[#F9FAF9] transition-colors"
                  >
                    <td className="py-3.5 px-4 font-bold text-[#19211C]">
                      {order.orderNumber}
                    </td>
                    <td className="py-3.5 px-4 text-[#637267] whitespace-nowrap">
                      {new Date(order.transactionTimestamp).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-[#2D3A31] max-w-xs truncate">
                      {order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                    </td>
                    <td className="py-3.5 px-4 font-mono-data text-[11px] text-[#425046]">
                      {order.paypalCaptureId}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-data font-bold text-[#153E2E]">
                      ${order.grandTotal.toFixed(2)} {order.currency}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <OrderStatusLifecycle order={order} variant="compact" />
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="px-2.5 py-1 text-xs text-[#153E2E] bg-[#EEF4F0] hover:bg-[#DCECE0] rounded font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <Truck className="w-3 h-3 text-[#153E2E]" />
                        <span>Track</span>
                      </button>
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="px-2.5 py-1 text-xs text-[#153E2E] hover:bg-[#EEF4F0] rounded font-semibold transition-colors cursor-pointer"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => generateOrderPdfReceipt(order)}
                        className="px-2.5 py-1 bg-[#153E2E] text-white hover:bg-[#1E4D3A] rounded font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 text-xs"
                      >
                        <FileText className="w-3 h-3 text-[#88D4A8]" />
                        <span>PDF</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-[#79887D]">
            No orders match the filter.
          </div>
        )}
      </div>

      {/* Order Details Drawer / Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E3E7E4] pb-4">
              <div>
                <h3 className="text-base font-bold text-[#19211C] font-display">
                  Order Details · {selectedOrder.orderNumber}
                </h3>
                <p className="text-xs text-[#637267]">
                  Captured via PayPal Orders v2 REST API (Sandbox)
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-xs text-[#79887D] hover:text-[#19211C] font-semibold cursor-pointer"
              >
                Close ✕
              </button>
            </div>

            {/* Order Lifecycle Visualizer */}
            <OrderStatusLifecycle order={selectedOrder} variant="full" />

            {/* BoundBuy Track Shipment Tracking & Delivery Intelligence */}
            <ShipmentTrackingSection
              order={selectedOrder}
              onOpenRegisterModal={() => setRegisteringOrder(selectedOrder)}
              onOrderUpdated={(updatedOrder) => {
                setSelectedOrder(updatedOrder);
                loadOrders();
              }}
            />

            {/* Core Identifiers */}
            <div className="grid grid-cols-2 gap-3 p-4 bg-[#F8FAF8] border border-[#E3E7E4] rounded-xl text-xs font-mono-data">
              <div>
                <div className="text-[10px] text-[#637267] uppercase font-sans">
                  PayPal Order ID
                </div>
                <div className="font-bold text-[#19211C]">
                  {selectedOrder.paypalOrderId}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#637267] uppercase font-sans">
                  PayPal Capture ID
                </div>
                <div className="font-bold text-[#153E2E]">
                  {selectedOrder.paypalCaptureId}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#637267] uppercase font-sans">
                  Capture Timestamp
                </div>
                <div>{new Date(selectedOrder.transactionTimestamp).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#637267] uppercase font-sans">
                  Pact Approval Timestamp
                </div>
                <div>{new Date(selectedOrder.approvalTimestamp).toLocaleString()}</div>
              </div>
            </div>

            {/* Itemized Line Items */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#19211C] uppercase tracking-wider">
                Itemized Purchases
              </div>
              <div className="border border-[#EAEFEA] rounded-lg divide-y divide-[#EAEFEA] text-xs">
                {selectedOrder.items.map((it, idx) => (
                  <div
                    key={`${it.productId}-${idx}`}
                    className="p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-[#D5DDD7] bg-[#F4F6F4]">
                        <ProductImage
                          productId={it.productId}
                          alt={it.productName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-[#19211C] truncate">
                          {it.productName}
                        </div>
                        <div className="text-[11px] text-[#637267] truncate">
                          Supplier: {it.supplierName} ({it.supplierId})
                        </div>
                      </div>
                    </div>
                    <div className="font-mono-data font-bold text-[#19211C] shrink-0 text-right">
                      {it.quantity} × ${it.unitPrice.toFixed(2)} = $
                      {it.itemTotal.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="p-4 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg space-y-1.5 text-xs">
              <div className="flex justify-between text-[#637267]">
                <span>Items Subtotal:</span>
                <span className="font-mono-data">
                  ${selectedOrder.subtotal.toFixed(2)} {selectedOrder.currency}
                </span>
              </div>
              <div className="flex justify-between text-[#637267]">
                <span>Shipping Cost:</span>
                <span className="font-mono-data">
                  ${selectedOrder.shippingCost.toFixed(2)} {selectedOrder.currency}
                </span>
              </div>
              <div className="flex justify-between font-bold text-sm text-[#153E2E] pt-2 border-t border-[#EAEFEA]">
                <span>Final Captured Total:</span>
                <span className="font-mono-data">
                  ${selectedOrder.grandTotal.toFixed(2)} {selectedOrder.currency}
                </span>
              </div>
            </div>

            {/* Cryptographic Snapshot Hash */}
            <div className="p-3.5 bg-[#EEF4F0] border border-[#C5DFC9] rounded-lg text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#153E2E]">
                <Lock className="w-3.5 h-3.5" />
                <span>Cryptographic Purchase Pact Audit Seal</span>
              </div>
              <div className="font-mono-data text-[10px] text-[#24523F] break-all">
                {selectedOrder.snapshotHashAtCheckout}
              </div>
              <div className="text-[10px] text-[#637267]">
                This hash cryptographically binds the order to the buyer's approved
                terms at checkout.
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 border border-[#D5DDD7] hover:bg-[#F2F5F3] text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Invoice</span>
              </button>
              <button
                onClick={() => generateOrderPdfReceipt(selectedOrder)}
                className="px-4 py-2 bg-[#153E2E] text-white hover:bg-[#1E4D3A] text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileText className="w-3.5 h-3.5 text-[#88D4A8]" />
                <span>Download PDF Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipment Registration Modal */}
      {registeringOrder && (
        <ShipmentRegisterModal
          order={registeringOrder}
          isOpen={Boolean(registeringOrder)}
          onClose={() => setRegisteringOrder(null)}
          onRegistered={(_newShipment) => {
            loadOrders();
            // If the order details modal is open for this order, re-trigger render
            if (selectedOrder && selectedOrder.id === registeringOrder.id) {
              setSelectedOrder({ ...selectedOrder });
            }
          }}
        />
      )}
    </div>
  );
};
