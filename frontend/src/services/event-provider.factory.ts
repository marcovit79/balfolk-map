import { EventProvider } from './event-provider.interface';
import { LocalEventProvider } from './local-event-provider';
import { RemoteEventProvider } from './remote-event-provider';

let singletonProvider: EventProvider | null = null;

export function getEventProvider(): EventProvider {
  if (singletonProvider) {
    return singletonProvider;
  }

  // Detect runtime environment:
  // 1. Web Simulator / Browser environment with mock Cordova:
  //    Must use RemoteEventProvider (routed through emulator proxy / backend gateway)
  // 2. Real Native Cordova runtime (file: protocol or native window.cordova without isMock):
  //    Uses LocalEventProvider (aggregates natively with cordova-plugin-advanced-http)
  // 3. Explicit standalone mode via VITE_APP_MODE
  const isCordovaMock =
    typeof window !== 'undefined' &&
    !!(window as any).cordova &&
    ((window as any).cordova.isMock === true || (window as any).cordova.platformId === 'browser-mock');

  const isRealNativeCordova =
    typeof window !== 'undefined' &&
    !isCordovaMock &&
    (window.location.protocol === 'file:' ||
      (!!(window as any).cordova && (window as any).cordova.platformId === 'android'));

  const forceStandalone =
    typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_APP_MODE === 'standalone' || import.meta.env?.VITE_APP_MODE === 'all-in-one');

  if (isRealNativeCordova || forceStandalone) {
    console.log('[EventProviderFactory] Mode: All-in-One Standalone (LocalEventProvider)');
    singletonProvider = new LocalEventProvider();
  } else {
    console.log('[EventProviderFactory] Mode: Multi-Tier Client-Server (RemoteEventProvider)');
    singletonProvider = new RemoteEventProvider();
  }

  return singletonProvider;
}
