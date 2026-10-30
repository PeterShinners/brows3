/**
 * Activates Thumbrella for the page and confirms the connect string with the server.
 */

const BRIDGE_SCRIPT = '/thumbrella-bridge.js';
const READY_EVENT = 'brows3-thumbrella-ready';
const LOAD_TIMEOUT_MS = 15_000;

/** Format metadata carried by a Thumbrella result. Fields are omitted when unknown. */
export interface ThumbnailMedia {
  kind?: string;
  mime?: string;
  extension?: string;
  fileSize?: number;
  properties?: Record<string, number | string | null | undefined>;
}

export interface ThumbnailMetadata {
  status?: string;
  source?: string;
  message?: string;
  media?: ThumbnailMedia | null;
}

/** Subset of the Thumbrella client API the app relies on. */
interface ThumbrellaClient {
  verify?: () => Promise<unknown>;
  thumb?: (url: string) => Promise<ThumbnailMetadata>;
}

interface ThumbrellaApi {
  tbrSetup: (connect: string) => ThumbrellaClient;
  Client?: new (options: { connect: string }) => ThumbrellaClient;
}

declare global {
  interface Window {
    __brows3Thumbrella?: ThumbrellaApi;
  }
}

let apiPromise: Promise<ThumbrellaApi> | null = null;
let configuredConnect: string | null = null;
let pageClient: ThumbrellaClient | null = null;
let pending: { connect: string; promise: Promise<void> } | null = null;

/** The page-wide client, available once a connect string has been verified. */
export function getThumbrellaClient(): ThumbrellaClient | null {
  return pageClient;
}

function loadApi(): Promise<ThumbrellaApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Thumbrella needs a browser window.'));

  const loaded = window.__brows3Thumbrella;
  if (loaded) return Promise.resolve(loaded);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<ThumbrellaApi>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      apiPromise = null;
      reject(new Error('The Thumbrella client did not load.'));
    }, LOAD_TIMEOUT_MS);

    window.addEventListener(READY_EVENT, () => {
      window.clearTimeout(timer);
      const ready = window.__brows3Thumbrella;
      if (ready) resolve(ready);
      else {
        apiPromise = null;
        reject(new Error('The Thumbrella client did not initialize.'));
      }
    }, { once: true });

    const script = document.createElement('script');
    script.type = 'module';
    script.src = BRIDGE_SCRIPT;
    script.addEventListener('error', () => {
      window.clearTimeout(timer);
      apiPromise = null;
      reject(new Error('The Thumbrella client could not be loaded.'));
    }, { once: true });
    document.head.appendChild(script);
  });

  return apiPromise;
}

/**
 * Activates Thumbrella for the page. An empty connect string disables thumbnails.
 *
 * The connect string is verified against the server first, so a mistyped value
 * never replaces a configuration that is already serving thumbnails.
 */
export async function configureThumbrella(connect: string): Promise<void> {
  const trimmed = connect.trim();
  if (!trimmed) {
    configuredConnect = null;
    pageClient = null;
    return;
  }
  if (trimmed === configuredConnect) return;
  if (pending?.connect === trimmed) return pending.promise;

  const promise = (async () => {
    const api = await loadApi();
    const previous = configuredConnect;

    if (api.Client) {
      await new api.Client({ connect: trimmed }).verify?.();
    } else {
      try {
        await api.tbrSetup(trimmed).verify?.();
      } catch (error) {
        // tbrSetup installs the page-wide client immediately, so put the previous one back.
        if (previous) api.tbrSetup(previous);
        throw error;
      }
    }

    pageClient = api.tbrSetup(trimmed);
    configuredConnect = trimmed;
  })();

  pending = { connect: trimmed, promise };
  try {
    await promise;
  } finally {
    if (pending?.promise === promise) pending = null;
  }
}
