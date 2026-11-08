import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  CreditCard,
  Database,
  CheckCircle2,
  Save,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { AppConfig } from '../../lib/types.js';
import { fetchSettings, saveSettings, verifyPayPalCredentials } from '../../lib/api.js';

interface SettingsViewProps {
  config: AppConfig | null;
  onConfigUpdated?: (config: AppConfig) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ config, onConfigUpdated }) => {
  const [currency, setCurrency] = useState('USD');
  const [spendingLimit, setSpendingLimit] = useState(250);
  const [strictApproval, setStrictApproval] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [paypalClientId, setPaypalClientId] = useState('');
  const [paypalClientSecret, setPaypalClientSecret] = useState('');
  const [paypalBaseUrl, setPaypalBaseUrl] = useState('https://api-m.sandbox.paypal.com');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchSettings().then((res) => {
      const s = res.settings as {
        defaultCurrency?: string;
        defaultSpendingLimit?: number;
        strictApprovalMode?: boolean;
        enableEmailAlerts?: boolean;
        paypalClientId?: string;
        paypalBaseUrl?: string;
      };
      if (s.defaultCurrency) setCurrency(s.defaultCurrency);
      if (s.defaultSpendingLimit) setSpendingLimit(s.defaultSpendingLimit);
      if (s.strictApprovalMode !== undefined) setStrictApproval(s.strictApprovalMode);
      if (s.enableEmailAlerts !== undefined) setEmailAlerts(s.enableEmailAlerts);
      if (s.paypalClientId) setPaypalClientId(s.paypalClientId);
      if (s.paypalBaseUrl) setPaypalBaseUrl(s.paypalBaseUrl);
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    setTestResult(null);
    try {
      const res = await saveSettings({
        defaultCurrency: currency,
        defaultSpendingLimit: spendingLimit,
        strictApprovalMode: strictApproval,
        enableEmailAlerts: emailAlerts,
        paypalClientId: paypalClientId.trim(),
        paypalClientSecret: paypalClientSecret.trim() || undefined,
        paypalBaseUrl: paypalBaseUrl.trim() || undefined,
      });
      setSavedSuccess(true);
      if (onConfigUpdated && config) {
        onConfigUpdated({
          ...config,
          defaultCurrency: currency,
          defaultSpendingLimit: spendingLimit,
          paypal: res.paypal || config.paypal,
        });
      }
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestCredentials = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      // Save credentials first
      await saveSettings({
        paypalClientId: paypalClientId.trim(),
        paypalClientSecret: paypalClientSecret.trim() || undefined,
        paypalBaseUrl: paypalBaseUrl.trim() || undefined,
      });
      const result = await verifyPayPalCredentials();
      if (result.success) {
        setTestResult({ success: true, message: result.message });
      } else {
        setTestResult({ success: false, message: result.error || 'Authentication failed' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Failed to verify PayPal credentials' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-base font-bold text-[#19211C] font-display">
          Procurement & Integration Settings
        </h2>
        <p className="text-xs text-[#637267]">
          Manage organizational policies, guardrail thresholds, and PayPal Sandbox setup
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-[#EEF4F0] border border-[#C5DFC9] text-xs text-[#153E2E] rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-[#153E2E]" />
          <span>Settings saved successfully and persisted on server.</span>
        </div>
      )}

      {/* Section 1: Buying Policies */}
      <div className="bg-white border border-[#E3E7E4] rounded-xl p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2 text-xs font-bold text-[#19211C] uppercase tracking-wider border-b border-[#EAEFEA] pb-3">
          <Shield className="w-4 h-4 text-[#153E2E]" />
          <span>Organizational Spending Guardrails</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
          <div className="space-y-1.5">
            <label className="font-bold text-[#19211C]">
              Default Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full p-2.5 border border-[#D5DDD7] rounded-lg bg-white text-xs text-[#19211C]"
            >
              <option value="USD">USD — United States Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="CAD">CAD — Canadian Dollar</option>
            </select>
            <p className="text-[11px] text-[#79887D]">
              PayPal Sandbox Orders v2 calculates item breakdowns in this currency.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-[#19211C]">
              Default Team Spending Limit ($)
            </label>
            <input
              type="number"
              step="25"
              value={spendingLimit}
              onChange={(e) => setSpendingLimit(parseFloat(e.target.value) || 0)}
              className="w-full p-2.5 border border-[#D5DDD7] rounded-lg bg-white text-xs text-[#19211C]"
            />
            <p className="text-[11px] text-[#79887D]">
              AI defaults to this ceiling when buyer doesn't specify an explicit budget.
            </p>
          </div>
        </div>

        <div className="pt-2 space-y-3">
          <label className="flex items-start gap-3 p-3 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={strictApproval}
              onChange={(e) => setStrictApproval(e.target.checked)}
              className="mt-0.5 rounded border-[#C5D0C8] text-[#153E2E]"
            />
            <div className="text-xs">
              <span className="font-bold text-[#19211C] block">
                Strict Approval Invalidation Mode (Recommended)
              </span>
              <span className="text-[11px] text-[#637267] leading-relaxed">
                Immediately void approved Purchase Pacts if supplier catalog prices,
                shipping costs, or stock levels change by even $0.01 prior to checkout.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 bg-[#FBFBFA] border border-[#EAEFEA] rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={emailAlerts}
              onChange={(e) => setEmailAlerts(e.target.checked)}
              className="mt-0.5 rounded border-[#C5D0C8] text-[#153E2E]"
            />
            <div className="text-xs">
              <span className="font-bold text-[#19211C] block">
                Security & Invalidation Notifications
              </span>
              <span className="text-[11px] text-[#637267] leading-relaxed">
                Log audit notifications whenever a guardrail blocks a purchase or
                triggers buyer re-approval.
              </span>
            </div>
          </label>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2 bg-[#153E2E] text-white text-xs font-bold rounded-lg hover:bg-[#1E4D3A] transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5 text-[#88D4A8]" />
          <span>{isSaving ? 'Saving...' : 'Save Guardrail Preferences'}</span>
        </button>
      </div>

      {/* Section 2: PayPal Sandbox Integration */}
      <div className="bg-white border border-[#E3E7E4] rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#EAEFEA] pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#19211C] uppercase tracking-wider">
            <CreditCard className="w-4 h-4 text-[#153E2E]" />
            <span>PayPal Sandbox Integration</span>
          </div>

          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded ${
              config?.paypal?.isConfigured || (paypalClientId && paypalClientSecret)
                ? 'bg-[#E3F2E8] text-[#153E2E]'
                : 'bg-[#FEF3C7] text-[#92400E]'
            }`}
          >
            {config?.paypal?.isConfigured || (paypalClientId && paypalClientSecret)
              ? '✓ Live Sandbox Connected'
              : 'Credentials Pending Configuration'}
          </span>
        </div>

        <div className="space-y-4 text-xs text-[#2D3A31]">
          <p className="leading-relaxed">
            BoundBuy AI integrates directly with PayPal's REST Orders v2 API
            (<code className="bg-[#F5F7F5] px-1.5 py-0.5 rounded font-mono-data">/v2/checkout/orders</code>)
            using OAuth 2.0 client credentials. Secrets remain strictly on the backend.
          </p>

          {/* Interactive Credential Inputs */}
          <div className="p-4 bg-[#F8FAF8] border border-[#E3E7E4] rounded-xl space-y-3.5">
            <div className="text-xs font-bold text-[#19211C]">
              Configure PayPal Sandbox Credentials
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[#19211C] block">
                Sandbox Client ID
              </label>
              <input
                type="text"
                placeholder="e.g. A21AA... or your developer sandbox Client ID"
                value={paypalClientId}
                onChange={(e) => setPaypalClientId(e.target.value)}
                className="w-full p-2 border border-[#D5DDD7] rounded-lg bg-white text-xs font-mono-data text-[#19211C]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[#19211C] block">
                Sandbox Client Secret
              </label>
              <input
                type="password"
                placeholder="Enter PayPal Sandbox Secret"
                value={paypalClientSecret}
                onChange={(e) => setPaypalClientSecret(e.target.value)}
                className="w-full p-2 border border-[#D5DDD7] rounded-lg bg-white text-xs font-mono-data text-[#19211C]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[#19211C] block">
                PayPal API Base URL
              </label>
              <input
                type="text"
                value={paypalBaseUrl}
                onChange={(e) => setPaypalBaseUrl(e.target.value)}
                className="w-full p-2 border border-[#D5DDD7] rounded-lg bg-white text-xs font-mono-data text-[#19211C]"
              />
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-[#EEF4F0] border-[#C5DFC9] text-[#153E2E]'
                    : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#153E2E]" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-[#153E2E] text-white rounded-lg text-xs font-bold hover:bg-[#1E4D3A] transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5 text-[#88D4A8]" />
                <span>{isSaving ? 'Saving...' : 'Save Credentials'}</span>
              </button>

              <button
                onClick={handleTestCredentials}
                disabled={isTesting || !paypalClientId.trim()}
                className="px-4 py-2 bg-[#0070BA] text-white rounded-lg text-xs font-bold hover:bg-[#005EA6] transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CreditCard className="w-3.5 h-3.5 text-white" />
                <span>{isTesting ? 'Verifying...' : 'Verify Sandbox Connection'}</span>
              </button>
            </div>
          </div>

          {!config?.paypal?.isConfigured && !paypalClientId && (
            <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-[#92400E] space-y-2 text-xs">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>How to obtain PayPal Developer Sandbox credentials:</span>
              </div>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] leading-relaxed">
                <li>
                  Log in to the{' '}
                  <a
                    href="https://developer.paypal.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold underline"
                  >
                    PayPal Developer Dashboard
                  </a>
                  .
                </li>
                <li>Go to <strong>Apps & Credentials</strong> and select <strong>Sandbox</strong> mode.</li>
                <li>Copy your <strong>Client ID</strong> and <strong>Secret</strong> and paste them in the fields above.</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Storage & Database Mode */}
      <div className="bg-white border border-[#E3E7E4] rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-[#19211C] uppercase tracking-wider border-b border-[#EAEFEA] pb-3">
          <Database className="w-4 h-4 text-[#153E2E]" />
          <span>Storage & Persistence Engine</span>
        </div>

        <div className="text-xs text-[#2D3A31] space-y-3">
          <div className="p-4 bg-[#F8FAF8] border border-[#E3E7E4] rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#19211C]">Active Storage Mode:</span>
              <span className="px-2 py-0.5 bg-[#EEF4F0] text-[#153E2E] font-bold rounded">
                {config?.storageMode === 'mongodb' ? 'MongoDB Atlas (Connected)' : 'Local JSON Mode (Ephemeral on Cloud Run)'}
              </span>
            </div>
            <p className="text-[11px] text-[#637267] leading-relaxed">
              {config?.storageMode === 'mongodb'
                ? 'Orders, intents, Purchase Pacts, and audit logs are persisted in your remote MongoDB Atlas database cluster.'
                : 'Orders, intents, Purchase Pacts, and audit logs are saved locally to /.data/boundbuy_store.json with atomic JSON writes across standard process restarts.'}
            </p>

            {config?.storageMode !== 'mongodb' && (
              <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-[11px] text-[#92400E] space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-[#B45309]">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Cloud Run Ephemeral Storage Notice</span>
                </div>
                <p className="leading-relaxed text-[#78350F]">
                  Local filesystem data is <strong>ephemeral</strong> on Google Cloud Run and serverless container platforms. Data persists during local development and process restarts, but will reset if the serverless container instance is destroyed or scaled to zero. For multi-instance production environments, an external database cluster should be configured.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
