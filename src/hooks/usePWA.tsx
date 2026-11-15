import React, { useEffect, useState } from 'react';
import { Download, WifiOff, Check, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded border border-stone-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        title="Install AO3 Folio as an offline-capable PWA"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-1.5 rounded border border-stone-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        title="Install AO3 Folio PWA for offline reading"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{isIOS ? 'Install on iOS' : 'Install PWA'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg border border-stone-200 dark:border-zinc-800 bg-[#FBF9F5] dark:bg-[#121215] p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
              <h3 className="text-xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                Install AO3 Folio PWA
              </h3>
              <button
                onClick={() => setShowGuide(false)}
                className="text-xs text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white px-2 py-1 cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-stone-700 dark:text-zinc-300 leading-relaxed">
              {isIOS ? (
                <>
                  <p className="flex items-center gap-2 font-medium text-stone-900 dark:text-zinc-100">
                    <Share className="w-4 h-4 text-[#E11D48]" />
                    <span>Install on iPhone or iPad (Safari):</span>
                  </p>
                  <p>
                    1. Tap the <strong>Share</strong> button in the Safari toolbar.<br />
                    2. Scroll down and select <strong>Add to Home Screen</strong>.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-stone-900 dark:text-zinc-100">
                    Offline-Ready Progressive Web Application
                  </p>
                  <p>
                    Service worker precaching and offline tag indexing are active. To install as a standalone desktop or mobile app:
                  </p>
                  <p className="text-xs text-stone-500 dark:text-zinc-400">
                    Open the application in a top-level browser tab and click the install icon in the address bar, or select <strong>Install Archive of Our Own — Modern Folio</strong> from your browser menu.
                  </p>
                </>
              )}
              <div className="pt-2 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>Offline Tag Filtering & Local Archive Cache Enabled</span>
              </div>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded bg-[#E11D48] py-2 px-4 text-xs font-medium text-white hover:bg-[#BE123C] transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded border border-amber-500/40 bg-amber-950/95 px-3.5 py-2 text-xs font-medium text-amber-200 shadow-lg">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Offline Mode — Tag filtering and cached works are available locally.</span>
    </div>
  );
};
