import React, { useState } from 'react';
import { X, Key, Bot, Cpu, ShieldAlert, Eye, EyeOff, Save } from 'lucide-react';
import type { AiConfig, OcrProviderType, TranslationProviderType, TranslationStyle, PronounStyle } from '../modules/ai/aiTypes';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AiConfig;
  onSaveConfig: (newConfig: AiConfig) => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [localConfig, setLocalConfig] = useState<AiConfig>(config);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showSumoPodKey, setShowSumoPodKey] = useState<boolean>(false);

  // Sync state when modal is open
  const [prevConfig, setPrevConfig] = useState<AiConfig>(config);
  if (config !== prevConfig) {
    setPrevConfig(config);
    setLocalConfig(config);
  }

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(localConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 relative shadow-2xl flex flex-col gap-5 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">AI Provider Settings</h2>
              <p className="text-[11px] text-slate-400">Configure AI models for OCR & Translation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security & Client-Side BYOK Warning */}
        <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 flex gap-2.5 items-start text-xs text-amber-200/90">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1 text-[11px] leading-relaxed">
            <span className="font-semibold text-amber-300">Client-Side BYOK Security Notice</span>
            <span>
              TLTool runs entirely in your browser (GitHub Pages). API keys entered here are stored locally in your browser's localStorage and sent directly to the selected AI provider endpoints.
            </span>
          </div>
        </div>

        {/* Translation Style & Pronoun Options */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
          <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider border-b border-slate-800/80 pb-2">
            Translation Style & Pronouns
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="modal-translation-style" className="text-[11px] text-slate-400 font-medium">Translation Style</label>
              <select
                id="modal-translation-style"
                value={localConfig.translationStyle || 'semi-formal'}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    translationStyle: e.target.value as TranslationStyle,
                  }))
                }
                className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="semi-formal">Semi-formal</option>
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="modal-pronoun-options" className="text-[11px] text-slate-400 font-medium">Pronoun Options</label>
              <select
                id="modal-pronoun-options"
                value={localConfig.pronounStyle || 'aku-kau'}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    pronounStyle: e.target.value as PronounStyle,
                  }))
                }
                className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="aku-kau">Aku / Kau</option>
                <option value="aku-kamu">Aku / Kamu</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {localConfig.pronounStyle === 'custom' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-slate-400 font-medium">Custom Pronouns</label>
              <input
                type="text"
                placeholder="e.g. Gua / Lu"
                value={localConfig.customPronoun || ''}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    customPronoun: e.target.value,
                  }))
                }
                className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>

        {/* OCR & Translation Provider Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* OCR Provider */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>OCR Provider</span>
            </label>
            <select
              value={localConfig.ocrProvider}
              onChange={(e) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  ocrProvider: e.target.value as OcrProviderType,
                }))
              }
              className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="tesseract">Tesseract.js (Local Fallback)</option>
              <option value="gemini">Google Gemini AI</option>
              <option value="sumopod">SumoPod AI</option>
            </select>
          </div>

          {/* Translation Provider */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              <span>Translation Provider</span>
            </label>
            <select
              value={localConfig.translationProvider}
              onChange={(e) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  translationProvider: e.target.value as TranslationProviderType,
                }))
              }
              className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="mymemory">MyMemory & Dict (Fallback)</option>
              <option value="gemini">Google Gemini AI</option>
              <option value="sumopod">SumoPod AI</option>
            </select>
          </div>
        </div>

        {/* Gemini Settings */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              Google Gemini Configuration
            </span>
            {(localConfig.ocrProvider === 'gemini' || localConfig.translationProvider === 'gemini') && (
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                Active Provider
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Key className="w-3 h-3 text-slate-400" />
              <span>Gemini API Key</span>
            </label>
            <div className="relative">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={localConfig.gemini.apiKey}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    gemini: { ...prev.gemini, apiKey: e.target.value },
                  }))
                }
                className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              >
                {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-slate-400 font-medium">Gemini Model</label>
            <input
              type="text"
              placeholder="gemini-2.5-flash"
              value={localConfig.gemini.model}
              onChange={(e) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  gemini: { ...prev.gemini, model: e.target.value },
                }))
              }
              className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
            />
            <div className="flex gap-1.5 flex-wrap">
              {['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      gemini: { ...prev.gemini, model: m },
                    }))
                  }
                  className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 px-2 py-0.5 rounded cursor-pointer transition-colors"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SumoPod Settings */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              SumoPod Configuration
            </span>
            {(localConfig.ocrProvider === 'sumopod' || localConfig.translationProvider === 'sumopod') && (
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                Active Provider
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Key className="w-3 h-3 text-slate-400" />
              <span>SumoPod API Key</span>
            </label>
            <div className="relative">
              <input
                type={showSumoPodKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={localConfig.sumopod.apiKey}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    sumopod: { ...prev.sumopod, apiKey: e.target.value },
                  }))
                }
                className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSumoPodKey(!showSumoPodKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              >
                {showSumoPodKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-slate-400 font-medium">Base URL</label>
            <input
              type="text"
              placeholder="https://api.sumopod.com/v1"
              value={localConfig.sumopod.baseUrl}
              onChange={(e) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  sumopod: { ...prev.sumopod, baseUrl: e.target.value },
                }))
              }
              className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-slate-400 font-medium">SumoPod Model</label>
            <input
              type="text"
              placeholder="sumopod-1.5"
              value={localConfig.sumopod.model}
              onChange={(e) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  sumopod: { ...prev.sumopod, model: e.target.value },
                }))
              }
              className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-[10px] text-slate-500">
              Note: For SumoPod OCR, ensure the selected model supports image/vision inputs.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-indigo-600/20"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
