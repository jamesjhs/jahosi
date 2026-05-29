(function () {
  if (typeof window === 'undefined') return;
  const script = document.currentScript;
  if (!script) {
    window.__versionRefreshPromise = Promise.resolve(false);
    return;
  }

  const pageVersion = String(script.dataset.pageVersion || '').trim();
  const versionUrl = String(script.dataset.versionUrl || '').trim();
  const storageKey = String(script.dataset.storageKey || '').trim();
  const cachePrefix = String(script.dataset.cachePrefix || '').trim();
  const unregisterScope = String(script.dataset.unregisterScope || '').trim();
  const preserveKeys = String(script.dataset.preserveKeys || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  const versionParam = String(script.dataset.versionParam || 'appv').trim();
  const reloadParam = String(script.dataset.reloadParam || '__vr').trim();

  async function clearSplashCaches() {
    if (unregisterScope && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => typeof registration.scope === 'string' && registration.scope.includes(unregisterScope))
          .map((registration) => registration.unregister().catch(() => false))
      );
    }
    if (cachePrefix && 'caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((key) => key.startsWith(cachePrefix))
          .map((key) => caches.delete(key))
      );
    }
  }

  async function runVersionRefresh() {
    if (!pageVersion || !versionUrl) return false;

    let latestVersion = pageVersion;
    try {
      const response = await fetch(versionUrl, { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        const fetchedVersion = typeof payload?.version === 'string' ? payload.version.trim() : '';
        if (fetchedVersion) latestVersion = fetchedVersion;
      }
    } catch {}

    try {
      if (storageKey) localStorage.setItem(storageKey, latestVersion);
    } catch {}

    if (latestVersion === pageVersion) return false;

    const preservedEntries = new Map();
    try {
      for (const key of preserveKeys) {
        preservedEntries.set(key, localStorage.getItem(key));
      }
    } catch {}

    try {
      await clearSplashCaches();
    } catch {}

    try {
      if (storageKey) localStorage.setItem(storageKey, latestVersion);
      for (const [key, value] of preservedEntries.entries()) {
        if (value != null) localStorage.setItem(key, value);
      }
    } catch {}

    const next = new URL(window.location.href);
    const reloadCount = Number.parseInt(next.searchParams.get(reloadParam) || '0', 10);
    if (Number.isFinite(reloadCount) && reloadCount >= 2) return false;
    next.searchParams.set(versionParam, latestVersion);
    next.searchParams.set(reloadParam, String(Number.isFinite(reloadCount) ? reloadCount + 1 : 1));
    window.location.replace(next.toString());
    return true;
  }

  window.__versionRefreshPromise = runVersionRefresh().catch(() => false);
})();
