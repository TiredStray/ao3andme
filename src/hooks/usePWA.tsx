import React, { useEffect, useState } from 'react';
import { Download, WifiOff, Check, Share, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => setSwReady(true))
        .catch(() => setSwReady(false));
    }

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
    swReady,
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

interface PWAInstallButtonProps {
  variant?: 'header' | 'prominent';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
}) => {
  const { isInstallable, isInstalled, isIOS, swReady, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Automatically suppress when already running inside an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  const buttonClasses =
    variant === 'prominent'
      ? 'flex items-center gap-2 rounded bg-[#E11D48] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#BE123C] transition-colors whitespace-nowrap shrink-0 cursor-pointer'
      : 'flex items-center gap-1.5 rounded bg-stone-900 dark:bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer';

  return (
    <>
      <button
        onClick={handleClick}
        className={buttonClasses}
        title="Install Archive Mine Own as a standalone offline PWA"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install App</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg border border-stone-200 dark:border-zinc-800 bg-[#FBF9F5] dark:bg-[#121215] p-6 shadow-xl text-left">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <img
                  src="/reading-owl-mascot.png"
                  alt="The Reading Owl mascot"
                  className="w-8 h-8 rounded-full border border-amber-500/40 object-cover shrink-0"
                />
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#E11D48]" />
                  <h3 className="text-xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                    Install Archive Mine Own
                  </h3>
                </div>
              </div>
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
                  <p className="text-xs leading-relaxed">
                    1. Tap the <strong>Share</strong> button in the Safari toolbar.<br />
                    2. Scroll down and select <strong>Add to Home Screen</strong>.<br />
                    3. Launch <strong>Archive Mine Own</strong> from your home screen for full offline reading and Link Cable trading.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-stone-900 dark:text-zinc-100">
                    Save as a Standalone Offline Application
                  </p>
                  <p className="text-xs leading-relaxed">
                    Once installed, the app shell, cached works, tag index, and reading progress are stored locally on your device so you can keep reading and filtering even when offline or if the remote server is unreachable.
                  </p>
                  <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
                    If your browser did not automatically open the install prompt (for example, inside an embedded preview frame), open this URL in a top-level Chrome, Edge, or Safari tab and click the <strong>Install</strong> icon in the address bar or browser menu.
                  </p>
                </>
              )}

              <div className="pt-2 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {swReady
                      ? 'Service Worker Active — App Shell Precached'
                      : 'Service Worker Registering for Offline Shell Cache'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Offline Tag Index &amp; Firestore IndexedDB Cache Ready</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              {isInstallable && (
                <button
                  onClick={install}
                  className="flex-1 rounded bg-[#E11D48] py-2 px-4 text-xs font-semibold text-white hover:bg-[#BE123C] transition-colors cursor-pointer"
                >
                  Install Now
                </button>
              )}
              <button
                onClick={() => setShowGuide(false)}
                className={`${
                  isInstallable
                    ? 'rounded border border-stone-300 dark:border-zinc-700 py-2 px-4 text-xs font-medium text-stone-700 dark:text-zinc-300'
                    : 'w-full rounded bg-[#E11D48] py-2 px-4 text-xs font-semibold text-white hover:bg-[#BE123C]'
                } transition-colors cursor-pointer`}
              >
                Done
              </button>
            </div>
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
