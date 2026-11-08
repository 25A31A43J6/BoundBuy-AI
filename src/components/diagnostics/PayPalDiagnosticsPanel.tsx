import React, { useState } from 'react';
import {
  Terminal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ExternalLink,
  Shield,
  Key,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { PayPalDiagnosticsData, AppConfig } from '../../lib/types.js';
import { verifyPayPalCredentials, saveSettings } from '../../lib/api.js';

interface PayPalDiagnosticsPanelProps {
  data: PayPalDiagnosticsData;
  config: AppConfig | null;
  onConfigUpdated?: (config: AppConfig) => void;
}

export const PayPalDiagnosticsPanel: React.FC<PayPalDiagnosticsPanelProps> = ({
  data,
  config,
  onConfigUpdated,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isTestingOAuth, setIsTestingOAuth] = useState(false);
  const [oauthResult, setOauthResult] = useState<{
    success: boolean;
    message: string;
    errorName?: string;
    issue?: string;
    debugId?: string;
  } | null>(null);

  // Quick configuration inline state
  const [showQuickConfig, setShowQuickConfig] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  const handleTestOAuth = async () => {
    setIsTestingOAuth(true);
    setOauthResult(null);
    try {
      const res = await verifyPayPalCredentials();
      if (res.success) {
        setOauthResult({
          success: true,
          message: res.message || 'OAuth 2.0 authentication successful (200 OK)',
        });
      } else {
        setOauthResult({
          success: false,
          message: res.error || 'OAuth authentication failed',
          errorName: res.errorName,
          issue: res.issue,
          debugId: res.debugId,
        });
      }
    } catch (err: any) {
      setOauthResult({
        success: false,
        message: err?.message || 'Failed to authenticate with PayPal Sandbox OAuth API',
        errorName: err?.errorName || err?.name,
        issue: err?.issue,
        debugId: err?.debugId,
      });
    } finally {
      setIsTestingOAuth(false);
    }
  };

  const handleSaveQuickConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientIdInput.trim()) return;
    setIsSavingConfig(true);
    setConfigMessage(null);
    try {
      const res = await saveSettings({
        paypalClientId: clientIdInput.trim(),
        paypalClientSecret: clientSecretInput.trim() || undefined,
      });
      setConfigMessage('Sandbox credentials saved & loaded into SDK!');
      if (onConfigUpdated && config) {
        onConfigUpdated({
          ...config,
          paypal: res.paypal || config.paypal,
        });
      }
      setTimeout(() => {
        setShowQuickConfig(false);
        setConfigMessage(null);
      }, 2000);
    } catch (err: any) {
      setConfigMessage(err?.message || 'Failed to save credentials');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Only render in development / preview mode
  const isDev =
    import.meta.env.DEV ||
    window.location.hostname === 'localhost' ||
    window.location.hostname.includes('.run.app') ||
    window.location.hostname.includes('127.0.0.1');

  if (!isDev) return null;

  return (
    <div className="border border-[#1E293B] bg-[#0F172A] text-slate-100 rounded-xl overflow-hidden shadow-md my-4 font-sans text-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1E293B]/70 border-b border-[#334155]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-bold tracking-wide uppercase text-[11px] text-emerald-400">
            Developer Diagnostics: PayPal Sandbox Flow
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
            ENV: {data.environment.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuickConfig(!showQuickConfig)}
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#334155] hover:bg-[#475569] text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Key className="w-3 h-3 text-amber-400" />
            <span>{showQuickConfig ? 'Close Quick Setup' : 'Configure Sandbox Keys'}</span>
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
            aria-label="Toggle diagnostics panel"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Quick Config Modal/Accordion */}
      {showQuickConfig && (
        <form
          onSubmit={handleSaveQuickConfig}
          className="p-4 bg-[#1E293B] border-b border-[#334155] space-y-3"
        >
          <div className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            <span>Enter PayPal Developer Sandbox App Credentials</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-normal">
            Obtain these from developer.paypal.com (Sandbox App). Secrets are strictly stored server-side.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Sandbox Client ID
              </label>
              <input
                type="text"
                required
                placeholder="e.g. A21AA... (required for SDK script)"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#0F172A] border border-[#475569] text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Sandbox Client Secret
              </label>
              <input
                type="password"
                placeholder="e.g. E... (kept on backend only)"
                value={clientSecretInput}
                onChange={(e) => setClientSecretInput(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#0F172A] border border-[#475569] text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-emerald-400 font-medium">{configMessage}</span>
            <button
              type="submit"
              disabled={isSavingConfig || !clientIdInput.trim()}
              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
            >
              {isSavingConfig ? 'Saving...' : 'Save & Reload SDK'}
            </button>
          </div>
        </form>
      )}

      {/* Main Diagnostic Metrics Grid */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. SDK Version & Load Status */}
            <div className="p-3 bg-[#131F37] border border-[#243555] rounded-lg space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                1. JavaScript SDK Version
              </div>
              <div className="font-mono text-slate-200 font-semibold">{data.sdkVersion}</div>
              <div className="flex items-center gap-1.5 pt-0.5">
                {data.sdkLoadingStatus === 'resolved' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium text-[11px]">Script Loaded</span>
                  </>
                ) : data.sdkLoadingStatus === 'pending' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span className="text-amber-400 font-medium text-[11px]">Loading SDK...</span>
                  </>
                ) : data.sdkLoadingStatus === 'rejected' ? (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-rose-400 font-medium text-[11px]">Script Load Failed</span>
                  </>
                ) : (
                  <span className="text-slate-400 text-[11px]">Initial</span>
                )}
              </div>
            </div>

            {/* 2. PayPal Environment */}
            <div className="p-3 bg-[#131F37] border border-[#243555] rounded-lg space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                2. PayPal Environment
              </div>
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono capitalize">{data.environment}</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate">
                api-m.sandbox.paypal.com
              </div>
            </div>

            {/* 3. Client ID Configured */}
            <div className="p-3 bg-[#131F37] border border-[#243555] rounded-lg space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                3. Sandbox Client ID
              </div>
              <div className="flex items-center gap-1.5">
                {data.clientIdConfigured ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300 font-medium">Configured</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-amber-300 font-medium">Missing / Not Set</span>
                  </>
                )}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {data.clientIdConfigured
                  ? data.clientIdPreview || 'Present (Secret strictly concealed)'
                  : 'Requires Sandbox credentials'}
              </div>
            </div>

            {/* 4. Backend OAuth Authentication */}
            <div className="p-3 bg-[#131F37] border border-[#243555] rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  4. Backend OAuth 2.0
                </span>
                <button
                  onClick={handleTestOAuth}
                  disabled={isTestingOAuth || !data.clientIdConfigured}
                  className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded text-[9px] font-semibold text-slate-200 cursor-pointer"
                >
                  {isTestingOAuth ? 'Testing...' : 'Test Auth'}
                </button>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                {oauthResult ? (
                  oauthResult.success ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-emerald-300 font-medium text-[11px] truncate">
                        Verified (200 OK)
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="text-rose-300 font-medium text-[11px] truncate">
                        OAuth Failed
                      </span>
                    </>
                  )
                ) : data.clientIdConfigured ? (
                  <span className="text-slate-300 text-[11px]">Ready to test</span>
                ) : (
                  <span className="text-slate-500 text-[11px]">Unconfigured</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {oauthResult?.message || 'Access token verified on server'}
              </div>
            </div>
          </div>

          {/* Row 2: Runtime Transaction Lifecycle Diagnostics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 5. Create Order HTTP Status */}
            <div className="p-3 bg-[#131F37] border border-[#243555] rounded-lg space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                5. Create Order HTTP
              </div>
              <div className="font-mono text-slate-200">
                {data.createOrderHttpStatus ? (
                  <span
                    className={`font-bold ${
                      data.createOrderHttpStatus >= 200 && data.createOrderHttpStatus < 300
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    HTTP {data.createOrderHttpStatus} ({data.createOrderStatus || 'CREATED'})
                  </span>
                ) : (
                  <span className="text-slate-500">Awaiting button click</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400">Orders v2 REST API</div>
            </div>

            {/* 6. PayPal Order ID */}
            <div className="p-3 bg-[#131F37] border border-[#243555] rounded-lg space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                6. PayPal Order ID
              </div>
              <div className="font-mono text-slate-200 truncate font-semibold">
                {data.paypalOrderId ? (
                  <span className="text-emerald-300">{data.paypalOrderId}</span>
                ) : (
                  <span className="text-slate-500">None generated yet</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400">
                {data.paypalOrderId ? 'Returned to PayPal SDK' : 'Created on click'}
              </div>
            </div>

            {/* 7. Approval Link & Hostname */}
            <div className="p-3 bg-[#131F37] border border-[#243555] rounded-lg space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                7. Approval Link
              </div>
              <div className="flex items-center gap-1.5">
                {data.hasApproveLink ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300 font-medium text-[11px] truncate">
                      {data.approveLinkHostname || 'www.sandbox.paypal.com'}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500 text-[11px]">Not created yet</span>
                )}
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate">
                rel: "approve"
              </div>
            </div>

            {/* 8. Buyer Approval Callback & Capture Status */}
            <div className="p-3 bg-[#131F37] border border-[#243555] rounded-lg space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                8. Approval & Capture
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-400">onApprove:</span>
                {data.buyerApprovalFired ? (
                  <span className="text-emerald-400 font-bold">Fired ✓</span>
                ) : (
                  <span className="text-slate-500">Pending</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-400">Capture:</span>
                {data.captureInvoked ? (
                  <span className="text-emerald-400 font-mono font-bold truncate">
                    HTTP {data.captureHttpStatus || 200}
                    {data.captureId ? ` (${data.captureId.slice(0, 10)}...)` : ''}
                  </span>
                ) : (
                  <span className="text-slate-500">Not invoked yet</span>
                )}
              </div>
            </div>
          </div>

          {/* Sanitized Error Banner if error occurred */}
          {data.sanitizedError && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-200 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Sanitized PayPal Error Details</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono pt-1">
                <div>
                  <span className="text-slate-400 block text-[10px]">Error Name:</span>
                  <span className="font-bold text-rose-300">{data.sanitizedError.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Issue / Detail:</span>
                  <span className="text-rose-200">{data.sanitizedError.issue || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Debug ID:</span>
                  <span className="text-amber-300">{data.sanitizedError.debugId || 'N/A'}</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-300 pt-1 leading-normal">
                {data.sanitizedError.message}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
