'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Bell,
  BellOff,
  Download,
  Smartphone,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Settings,
  Volume2,
  VolumeX,
  Vibrate,
  Clock,
  Target,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

interface NotificationSettings {
  enabled: boolean;
  valueBets: boolean;
  matchReminders: boolean;
  results: boolean;
  priceDrops: boolean;
  quiet: boolean;
  vibrate: boolean;
}

interface PWAStatus {
  isInstalled: boolean;
  isStandalone: boolean;
  canInstall: boolean;
  hasNotificationPermission: boolean;
}

export function NotificationManager() {
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    valueBets: true,
    matchReminders: true,
    results: true,
    priceDrops: false,
    quiet: false,
    vibrate: true,
  });

  const [pwaStatus, setPwaStatus] = useState<PWAStatus>({
    isInstalled: false,
    isStandalone: false,
    canInstall: false,
    hasNotificationPermission: false,
  });

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  // Check PWA status on mount
  useEffect(() => {
    checkPWAStatus();

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPwaStatus((prev) => ({ ...prev, canInstall: true }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      setPwaStatus((prev) => ({ ...prev, isInstalled: true, canInstall: false }));
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Check PWA status
  const checkPWAStatus = useCallback(async () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInstalled = isStandalone || (window.navigator as any).standalone === true;

    let hasPermission = false;
    if ('Notification' in window) {
      hasPermission = Notification.permission === 'granted';
    }

    // Load saved settings
    const savedSettings = localStorage.getItem('steo-notification-settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    setPwaStatus({
      isInstalled,
      isStandalone,
      canInstall: !!deferredPrompt,
      hasNotificationPermission: hasPermission,
    });
  }, [deferredPrompt]);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    setLoading(true);
    try {
      if (!('Notification' in window)) {
        alert('Les notifications ne sont pas supportées par votre navigateur');
        return;
      }

      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        setPwaStatus((prev) => ({ ...prev, hasNotificationPermission: true }));
        setSettings((prev) => ({ ...prev, enabled: true }));
        
        // Show welcome notification
        new Notification('🎉 Notifications activées!', {
          body: 'Vous recevrez les alertes de value bets et résultats',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          tag: 'welcome',
        });
      } else {
        alert('Permission refusée. Vous pouvez activer les notifications dans les paramètres de votre navigateur.');
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Install PWA
  const installPWA = useCallback(async () => {
    if (!deferredPrompt) return;

    setLoading(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setPwaStatus((prev) => ({ ...prev, isInstalled: true, canInstall: false }));
      }
      
      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error installing PWA:', error);
    } finally {
      setLoading(false);
    }
  }, [deferredPrompt]);

  // Update settings
  const updateSetting = useCallback((key: keyof NotificationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('steo-notification-settings', JSON.stringify(newSettings));

    // Register/unregister for specific notification types
    if (key === 'enabled' && value) {
      requestPermission();
    }
  }, [settings, requestPermission]);

  // Test notification
  const testNotification = useCallback(async () => {
    setTestingNotification(true);
    try {
      if (!pwaStatus.hasNotificationPermission) {
        await requestPermission();
      }

      new Notification('🔔 Test Steo Élite', {
        body: 'Les notifications fonctionnent parfaitement!',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: 'test',
        requireInteraction: true,
      } as NotificationOptions);

      setTimeout(() => setTestingNotification(false), 1000);
    } catch (error) {
      console.error('Test notification failed:', error);
      setTestingNotification(false);
    }
  }, [pwaStatus.hasNotificationPermission, requestPermission]);

  // Register for push notifications (if service worker supports it)
  const registerPushNotifications = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check if push is supported
      if (!registration.pushManager) {
        console.log('Push notifications not supported');
        return;
      }

      // Subscribe to push
      // Note: In production, you'd need VAPID keys from your server
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_KEY
      });

      // Send subscription to server
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      console.log('Push notifications registered');
    } catch (error) {
      console.error('Push registration failed:', error);
    }
  }, []);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Notifications & PWA
          {pwaStatus.hasNotificationPermission ? (
            <Badge variant="default" className="bg-green-500 text-white">
              <CheckCircle className="h-3 w-3 mr-1" />
              Actif
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-orange-500/20 text-orange-500">
              <AlertCircle className="h-3 w-3 mr-1" />
              Inactif
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PWA Installation */}
        <div className="p-4 rounded-lg bg-muted/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              <span className="font-medium">Installation App</span>
            </div>
            {pwaStatus.isInstalled ? (
              <Badge className="bg-green-500 text-white">
                <CheckCircle className="h-3 w-3 mr-1" />
                Installée
              </Badge>
            ) : pwaStatus.canInstall ? (
              <Button size="sm" onClick={installPWA} disabled={loading}>
                <Download className="h-4 w-4 mr-1" />
                Installer
              </Button>
            ) : (
              <Badge variant="outline">
                Navigateur: {pwaStatus.isStandalone ? 'Standalone' : 'Web'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Installez l'app pour un accès rapide et les notifications push natives
          </p>
        </div>

        {/* Notification Permission */}
        {!pwaStatus.hasNotificationPermission && (
          <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-orange-500 font-medium">
                  <BellOff className="h-4 w-4" />
                  Notifications désactivées
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Activez pour recevoir les alertes de value bets
                </p>
              </div>
              <Button size="sm" onClick={requestPermission} disabled={loading}>
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Bell className="h-4 w-4 mr-1" />
                    Activer
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Notification Settings */}
        {pwaStatus.hasNotificationPermission && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Préférences de notification
            </h4>

            <div className="grid gap-3">
              {/* Value Bets */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Target className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <Label className="font-medium">Value Bets</Label>
                    <p className="text-xs text-muted-foreground">
                      Alerte quand une opportunité est détectée
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.valueBets}
                  onCheckedChange={(v) => updateSetting('valueBets', v)}
                />
              </div>

              {/* Match Reminders */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Clock className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <Label className="font-medium">Rappels Matchs</Label>
                    <p className="text-xs text-muted-foreground">
                      15 min avant les gros matchs
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.matchReminders}
                  onCheckedChange={(v) => updateSetting('matchReminders', v)}
                />
              </div>

              {/* Results */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                  </div>
                  <div>
                    <Label className="font-medium">Résultats</Label>
                    <p className="text-xs text-muted-foreground">
                      Résultats des pronostics suivis
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.results}
                  onCheckedChange={(v) => updateSetting('results', v)}
                />
              </div>

              {/* Quiet Mode */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/10">
                    {settings.quiet ? (
                      <VolumeX className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                  <div>
                    <Label className="font-medium">Mode Silencieux</Label>
                    <p className="text-xs text-muted-foreground">
                      Pas de son, notifications visuelles uniquement
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.quiet}
                  onCheckedChange={(v) => updateSetting('quiet', v)}
                />
              </div>

              {/* Vibrate */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10">
                    <Vibrate className="h-4 w-4 text-cyan-500" />
                  </div>
                  <div>
                    <Label className="font-medium">Vibration</Label>
                    <p className="text-xs text-muted-foreground">
                      Vibreur sur mobile (si supporté)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.vibrate}
                  onCheckedChange={(v) => updateSetting('vibrate', v)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Test Notification */}
        {pwaStatus.hasNotificationPermission && (
          <Button
            variant="outline"
            className="w-full"
            onClick={testNotification}
            disabled={testingNotification}
          >
            {testingNotification ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                Notification envoyée!
              </>
            ) : (
              <>
                <Bell className="h-4 w-4 mr-2" />
                Tester les notifications
              </>
            )}
          </Button>
        )}

        {/* Info */}
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-500">
              <strong>Note:</strong> Les notifications push nécessitent que l'application 
              soit installée ou ouverte. Pour les alertes en temps réel, installez l'app 
              sur votre écran d'accueil.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Hook for easy notification sending
export function useNotifications() {
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setHasPermission(Notification.permission === 'granted');
    }
  }, []);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!hasPermission) return;

    new Notification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      ...options,
    });
  }, [hasPermission]);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;

    const permission = await Notification.requestPermission();
    setHasPermission(permission === 'granted');
    return permission === 'granted';
  }, []);

  return { hasPermission, sendNotification, requestPermission };
}

export default NotificationManager;
