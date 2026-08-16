const CACHE_NAME = "simplifii-local-workspaces-v1";
const SNAPSHOT_PATH = "/__simplifii_cache__/workspaces";
const MATERIAL_PATH = "/__simplifii_cache__/materials/";
const JOURNAL_KEY = "simplifii.local-workspaces.journal.v1";
const QUARANTINE_KEY = "simplifii.local-workspaces.quarantine.";
const MATERIAL_REF = "__simplifii_material_ref__";

type CacheEnvelope = {
  version: 1;
  writtenAt: number;
  value: unknown;
};

type MaterialPayload = {
  id: string;
  dataUrl: string;
};

export type PreparedBrowserCache = {
  writtenAt: number;
  snapshot: unknown;
  original: unknown;
  materials: MaterialPayload[];
};

export type BrowserCacheReadResult<T> =
  | { status: "empty" }
  | { status: "ready"; value: T }
  | { status: "unreadable" };

let latestWriteTime = 0;

class MissingMaterialError extends Error {}

function nextWriteTime() {
  latestWriteTime = Math.max(Date.now(), latestWriteTime + 1);
  return latestWriteTime;
}

function cacheRequest(path: string) {
  return new Request(new URL(path, window.location.origin));
}

function materialRequest(id: string) {
  return cacheRequest(`${MATERIAL_PATH}${encodeURIComponent(id)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asEnvelope(value: unknown): CacheEnvelope | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.writtenAt !== "number" || !("value" in value)) return null;
  return value as CacheEnvelope;
}

function externaliseMaterials(value: unknown, materials: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => externaliseMaterials(item, materials));
  if (!isRecord(value)) return value;

  const id = typeof value.id === "string" ? value.id : null;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "dataUrl" && id && typeof item === "string") {
      materials.set(id, item);
      result[key] = { [MATERIAL_REF]: id };
    } else {
      result[key] = externaliseMaterials(item, materials);
    }
  }
  return result;
}

async function hydrateMaterials(value: unknown, cache: Cache | null): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => hydrateMaterials(item, cache)));
  if (!isRecord(value)) return value;

  if (typeof value[MATERIAL_REF] === "string") {
    if (!cache) throw new MissingMaterialError();
    const response = await cache.match(materialRequest(value[MATERIAL_REF]));
    if (!response) throw new MissingMaterialError();
    return response.text();
  }

  const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await hydrateMaterials(item, cache)] as const));
  return Object.fromEntries(entries);
}

function readJournalEnvelope() {
  try {
    const raw = window.localStorage.getItem(JOURNAL_KEY);
    if (!raw) return { present: false, envelope: null };
    return { present: true, envelope: asEnvelope(JSON.parse(raw)) };
  } catch {
    return { present: true, envelope: null };
  }
}

export function prepareBrowserCache(value: unknown): PreparedBrowserCache {
  const materials = new Map<string, string>();
  return {
    writtenAt: nextWriteTime(),
    snapshot: externaliseMaterials(value, materials),
    original: value,
    materials: [...materials].map(([id, dataUrl]) => ({ id, dataUrl })),
  };
}

export function writeBrowserJournal(prepared: PreparedBrowserCache): boolean {
  if (typeof window === "undefined") return false;
  const canExternaliseMaterials = "caches" in window;
  const envelope: CacheEnvelope = {
    version: 1,
    writtenAt: prepared.writtenAt,
    value: canExternaliseMaterials ? prepared.snapshot : prepared.original,
  };
  try {
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export async function readBrowserCache<T>(): Promise<BrowserCacheReadResult<T>> {
  if (typeof window === "undefined") return { status: "empty" };

  const journal = readJournalEnvelope();
  let cache: Cache | null = null;
  let cachedEnvelope: CacheEnvelope | null = null;
  let cachedSnapshotPresent = false;
  if ("caches" in window) {
    try {
      cache = await window.caches.open(CACHE_NAME);
      const response = await cache.match(cacheRequest(SNAPSHOT_PATH));
      cachedSnapshotPresent = Boolean(response);
      cachedEnvelope = response ? asEnvelope(await response.json()) : null;
    } catch {
      cache = null;
    }
  }

  const candidates = [journal.envelope, cachedEnvelope]
    .filter((candidate): candidate is CacheEnvelope => Boolean(candidate))
    .sort((first, second) => second.writtenAt - first.writtenAt);
  for (const candidate of candidates) {
    try {
      return { status: "ready", value: await hydrateMaterials(candidate.value, cache) as T };
    } catch (error) {
      if (!(error instanceof MissingMaterialError)) return { status: "unreadable" };
    }
  }
  return journal.present || cachedSnapshotPresent ? { status: "unreadable" } : { status: "empty" };
}

export async function quarantineUnreadableBrowserCache(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const stamp = `${Date.now()}`;
  let moved = false;

  try {
    const journal = window.localStorage.getItem(JOURNAL_KEY);
    if (journal) {
      window.localStorage.setItem(`${QUARANTINE_KEY}${stamp}`, journal);
      window.localStorage.removeItem(JOURNAL_KEY);
      moved = true;
    }
  } catch {
    return false;
  }

  if ("caches" in window) {
    try {
      const cache = await window.caches.open(CACHE_NAME);
      const request = cacheRequest(SNAPSHOT_PATH);
      const response = await cache.match(request);
      if (response) {
        await cache.put(cacheRequest(`/__simplifii_cache__/quarantine/${stamp}`), response.clone());
        await cache.delete(request);
        moved = true;
      }
    } catch {
      return false;
    }
  }

  return moved;
}

export async function writeBrowserCache(prepared: PreparedBrowserCache): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if ("caches" in window) {
    try {
      const cache = await window.caches.open(CACHE_NAME);
      const retainedMaterialIds = new Set(prepared.materials.map((material) => material.id));
      await Promise.all(prepared.materials.map(async (material) => {
        const request = materialRequest(material.id);
        if (await cache.match(request)) return;
        await cache.put(request, new Response(material.dataUrl, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }));
      }));
      const cachedRequests = await cache.keys();
      await Promise.all(cachedRequests.map(async (request) => {
        const pathname = new URL(request.url).pathname;
        if (!pathname.startsWith(MATERIAL_PATH)) return;
        const materialId = decodeURIComponent(pathname.slice(MATERIAL_PATH.length));
        if (!retainedMaterialIds.has(materialId)) await cache.delete(request);
      }));
      const envelope: CacheEnvelope = { version: 1, writtenAt: prepared.writtenAt, value: prepared.snapshot };
      await cache.put(cacheRequest(SNAPSHOT_PATH), new Response(JSON.stringify(envelope), {
        headers: { "content-type": "application/json; charset=utf-8" },
      }));
      return true;
    } catch {
      return false;
    }
  }

  return writeBrowserJournal(prepared);
}
