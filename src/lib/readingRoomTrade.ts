import QRCode from 'qrcode';
import {
  type ArchivalWork,
  type Ao3Rating,
  type Ao3Category,
  type Ao3Status,
  type SharedBookmarkAnnotation,
} from '../data/internetArchiveCatalog';
import { clampString, sanitizeId, sanitizeTagsList } from './firebase';

export type PeerRole = 'Reader' | 'Author' | 'Archivist';
export type PeerStatus = 'Connected' | 'Pinned' | 'Archived';

export interface BookmarkNoteSource {
  ficSlug: string;
  ficTitle?: string;
  readingStatus: string;
  personalNotes: string;
  userTags: string[];
  isPublicNote?: boolean;
  updatedAtIso?: string;
}

export interface ReadingRoomPeerRecord {
  id: string;
  ownerUid: string;
  peerCode: string;
  peerName: string;
  role: PeerRole;
  publicKeyFingerprint: string;
  publicKeyJwk?: JsonWebKey;
  sharedFandoms: string[];
  knownWorkIds: string[];
  fullCachedInventory?: string[];
  tradeCount: number;
  status: PeerStatus;
  notes: string;
  updatedAtIso: string;
}

export interface LocalCryptographicIdentity {
  peerCode: string;
  displayName: string;
  role: PeerRole;
  publicKeyFingerprint: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}

export interface ReadingRoomPassPayload {
  protocol: 'ao3-folio-pass-v1' | 'mine-own-pass-v1';
  peerCode: string;
  peerName: string;
  role: PeerRole;
  publicKeyFingerprint: string;
  publicKeyJwk: JsonWebKey;
  sharedFandoms: string[];
  cachedWorkIds: string[];
  issuedAt: string;
}

export interface SignedTradeWorkEntry {
  work: ArchivalWork;
  sha256: string;
}

export interface Ao3TradePack {
  format: 'ao3pack-v1';
  packId: string;
  exportedAt: string;
  senderPeerCode: string;
  senderName: string;
  senderRole: PeerRole;
  senderFingerprint: string;
  senderPublicKeyJwk: JsonWebKey;
  targetPeerCode?: string;
  worksCount: number;
  entries: SignedTradeWorkEntry[];
  manifestHash: string;
  signatureBase64: string;
}

export interface TradeImportResult {
  importedWorks: ArchivalWork[];
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  annotationsCount: number;
  signatureVerified: boolean;
  hashesVerified: number;
  senderName: string;
  senderFingerprint: string;
}

const IDENTITY_STORAGE_KEY = 'ao3_folio_crypto_identity_v1';

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

function sanitizeAnnotationsList(raw?: unknown): SharedBookmarkAnnotation[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const cleaned: SharedBookmarkAnnotation[] = [];
  for (const item of raw.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<SharedBookmarkAnnotation>;
    const note = sanitizePlainProse(String(obj.note || ''), 1000);
    const tags = Array.isArray(obj.userTags)
      ? obj.userTags.slice(0, 10).map((t) => sanitizePlainProse(String(t), 60)).filter(Boolean)
      : [];
    if (!note && tags.length === 0) continue;
    cleaned.push({
      readerName: clampString(sanitizePlainProse(String(obj.readerName || 'Reader'), 80), 1, 80, 'Reader'),
      readerFingerprint: clampString(sanitizePlainProse(String(obj.readerFingerprint || 'AMO-PEER'), 128), 1, 128, 'AMO-PEER'),
      annotatedAtIso: clampString(String(obj.annotatedAtIso || new Date().toISOString().slice(0, 10)), 1, 20),
      readingStatus: clampString(sanitizePlainProse(String(obj.readingStatus || 'Reading'), 40), 1, 40, 'Reading'),
      userTags: tags,
      note,
    });
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

export function mergeSharedAnnotations(
  existing?: SharedBookmarkAnnotation[],
  incoming?: SharedBookmarkAnnotation[]
): SharedBookmarkAnnotation[] | undefined {
  const byKey = new Map<string, SharedBookmarkAnnotation>();
  for (const ann of existing || []) {
    byKey.set(`${ann.readerFingerprint}:${ann.readerName}`, ann);
  }
  for (const ann of incoming || []) {
    byKey.set(`${ann.readerFingerprint}:${ann.readerName}`, ann);
  }
  const merged = Array.from(byKey.values()).slice(0, 40);
  return merged.length > 0 ? merged : undefined;
}

function annotationsSignature(list?: SharedBookmarkAnnotation[]): string {
  if (!list || list.length === 0) return '';
  return JSON.stringify(
    list.map((a) => `${a.readerFingerprint}|${a.annotatedAtIso}|${a.note}|${a.userTags.join(',')}`)
  );
}

export function attachPublicBookmarkAnnotations(
  works: ArchivalWork[],
  bookmarks: BookmarkNoteSource[],
  identity: LocalCryptographicIdentity
): ArchivalWork[] {
  const bySlug = new Map<string, BookmarkNoteSource>();
  for (const bm of bookmarks) {
    if (bm.isPublicNote) {
      bySlug.set(sanitizeId(bm.ficSlug), bm);
    }
  }

  return works.map((w) => {
    const bm = bySlug.get(sanitizeId(w.id));
    if (!bm) return w;

    const cleanNote = sanitizePlainProse(bm.personalNotes || '', 1000);
    const cleanTags = (bm.userTags || []).slice(0, 10).map((t) => sanitizePlainProse(String(t), 60)).filter(Boolean);
    if (!cleanNote && cleanTags.length === 0) return w;

    const myAnnotation: SharedBookmarkAnnotation = {
      readerName: identity.displayName,
      readerFingerprint: identity.publicKeyFingerprint,
      annotatedAtIso: bm.updatedAtIso || new Date().toISOString().slice(0, 10),
      readingStatus: bm.readingStatus || 'Reading',
      userTags: cleanTags,
      note: cleanNote,
    };

    const filteredExisting = (w.sharedAnnotations || []).filter(
      (a) => a.readerFingerprint !== identity.publicKeyFingerprint
    );

    return {
      ...w,
      sharedAnnotations: [...filteredExisting, myAnnotation],
    };
  });
}

function canonicalWorkHashPayload(w: ArchivalWork): string {
  return JSON.stringify({
    id: w.id,
    title: w.title,
    authorName: w.authorName,
    fandom: w.fandom,
    rating: w.rating,
    category: w.category,
    status: w.status,
    summary: w.summary,
    content: w.content,
    tags: w.tags,
    chapterCount: w.chapterCount,
    totalChapters: w.totalChapters,
    sourceArchiveId: w.sourceArchiveId,
    sharedAnnotations: w.sharedAnnotations || [],
  });
}

export async function getOrCreateReaderIdentity(
  defaultName = 'owl_reader'
): Promise<LocalCryptographicIdentity> {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalCryptographicIdentity;
      if (parsed.peerCode && parsed.publicKeyJwk && parsed.privateKeyJwk) {
        return parsed;
      }
    }
  } catch {
    // Regenerate on parse error
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const fpHex = await sha256Hex(JSON.stringify({ x: publicKeyJwk.x, y: publicKeyJwk.y }));
  const shortFp = `AMO-${fpHex.slice(0, 4).toUpperCase()}-${fpHex
    .slice(4, 8)
    .toUpperCase()}-${fpHex.slice(8, 12).toUpperCase()}`;

  const identity: LocalCryptographicIdentity = {
    peerCode: sanitizeId(`peer_${fpHex.slice(0, 12)}`),
    displayName: clampString(defaultName, 1, 80, 'owl_reader'),
    role: 'Reader',
    publicKeyFingerprint: shortFp,
    publicKeyJwk,
    privateKeyJwk,
  };

  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // ignore storage quota errors
  }

  return identity;
}

export function updateLocalIdentityProfile(
  identity: LocalCryptographicIdentity,
  updates: Partial<Pick<LocalCryptographicIdentity, 'displayName' | 'role'>>
): LocalCryptographicIdentity {
  const next: LocalCryptographicIdentity = {
    ...identity,
    displayName: clampString(
      updates.displayName ?? identity.displayName,
      1,
      80,
      'owl_reader'
    ),
    role: updates.role ?? identity.role,
  };
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function encodeReadingRoomPass(
  identity: LocalCryptographicIdentity,
  works: ArchivalWork[]
): string {
  const fandomSet = Array.from(new Set(works.map((w) => w.fandom))).slice(0, 8);
  const payload: ReadingRoomPassPayload = {
    protocol: 'mine-own-pass-v1',
    peerCode: identity.peerCode,
    peerName: identity.displayName,
    role: identity.role,
    publicKeyFingerprint: identity.publicKeyFingerprint,
    publicKeyJwk: identity.publicKeyJwk,
    sharedFandoms: fandomSet.length > 0 ? fandomSet : ['Original Work'],
    cachedWorkIds: works.map((w) => w.id).slice(0, 200),
    issuedAt: new Date().toISOString().slice(0, 10),
  };
  return `MINEOWN:${toBase64Url(JSON.stringify(payload))}`;
}

export function decodeReadingRoomPass(rawPass: string): ReadingRoomPassPayload {
  const trimmed = rawPass.trim();
  let body = trimmed;
  if (trimmed.startsWith('MINEOWN:')) {
    body = trimmed.slice('MINEOWN:'.length);
  } else if (trimmed.startsWith('AO3PASS:')) {
    body = trimmed.slice('AO3PASS:'.length);
  }
  const jsonStr = fromBase64Url(body);
  const parsed = JSON.parse(jsonStr) as ReadingRoomPassPayload;
  if (
    (parsed.protocol !== 'mine-own-pass-v1' && parsed.protocol !== 'ao3-folio-pass-v1') ||
    !parsed.peerCode ||
    !parsed.peerName ||
    !parsed.publicKeyFingerprint
  ) {
    throw new Error('Invalid Reading Room Pass format');
  }
  return parsed;
}

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 220,
    margin: 2,
    color: {
      dark: '#18181B',
      light: '#FBF9F5',
    },
  });
}

export function computePokedexMissingWorks(
  myWorks: ArchivalWork[],
  peerCachedWorkIds: string[]
): {
  missingForPeer: ArchivalWork[];
  sharedCount: number;
  missingForMeCount: number;
} {
  const peerSet = new Set(peerCachedWorkIds);
  const mySet = new Set(myWorks.map((w) => w.id));
  const missingForPeer = myWorks.filter((w) => !peerSet.has(w.id));
  const sharedCount = myWorks.filter((w) => peerSet.has(w.id)).length;
  const missingForMeCount = peerCachedWorkIds.filter((id) => !mySet.has(id)).length;
  return { missingForPeer, sharedCount, missingForMeCount };
}

/**
 * Strips any HTML tags / script fragments so traded offline content is strictly safe plain prose.
 */
function sanitizePlainProse(raw: string, maxLen: number): string {
  return (raw || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, maxLen);
}

function sanitizeImportedWork(raw: ArchivalWork): ArchivalWork {
  const validRatings: Ao3Rating[] = [
    'General Audiences',
    'Teen And Up Audiences',
    'Mature',
    'Explicit',
    'Not Rated',
  ];
  const validCategories: Ao3Category[] = ['Gen', 'F/F', 'F/M', 'M/M', 'Multi', 'Other'];
  const validStatuses: Ao3Status[] = ['In Progress', 'Completed', 'Archived'];

  return {
    id: sanitizeId(raw.id),
    title: clampString(sanitizePlainProse(raw.title, 200), 1, 200, 'Untitled Trade Work'),
    authorName: clampString(sanitizePlainProse(raw.authorName, 100), 1, 100, 'Anonymous'),
    authorUid: sanitizeId(raw.authorUid || 'traded_author'),
    fandom: clampString(sanitizePlainProse(raw.fandom, 150), 1, 150, 'Original Work'),
    rating: validRatings.includes(raw.rating) ? raw.rating : 'Not Rated',
    category: validCategories.includes(raw.category) ? raw.category : 'Gen',
    status: validStatuses.includes(raw.status) ? raw.status : 'Completed',
    summary: clampString(sanitizePlainProse(raw.summary, 2000), 1, 2000, 'Imported via Reading Room Trade Pack.'),
    content: clampString(sanitizePlainProse(raw.content, 5_000_000), 1, 5_000_000, 'Empty manuscript.'),
    chapters: Array.isArray(raw.chapters)
      ? raw.chapters.slice(0, 500).map((ch, idx) => ({
          number: typeof ch.number === 'number' ? ch.number : idx + 1,
          title: clampString(sanitizePlainProse(ch.title, 150), 1, 150, `Chapter ${idx + 1}`),
          notes: ch.notes ? sanitizePlainProse(ch.notes, 1000) : undefined,
          content: clampString(sanitizePlainProse(ch.content, 500_000), 1, 500_000, ''),
          wordCount: Math.max(0, Number(ch.wordCount || 0)),
        }))
      : undefined,
    tags: sanitizeTagsList(
      Array.isArray(raw.tags) ? raw.tags.map((t) => sanitizePlainProse(String(t), 60)) : [],
      'Reading Room Trade'
    ),
    relationships: Array.isArray(raw.relationships)
      ? raw.relationships.slice(0, 6).map((r) => sanitizePlainProse(String(r), 100))
      : undefined,
    characters: Array.isArray(raw.characters)
      ? raw.characters.slice(0, 10).map((c) => sanitizePlainProse(String(c), 100))
      : undefined,
    wordCount: Math.max(0, Math.min(1000000, Number(raw.wordCount || 0))),
    chapterCount: Math.max(1, Math.min(1000, Number(raw.chapterCount || 1))),
    totalChapters: Math.max(0, Math.min(1000, Number(raw.totalChapters || 1))),
    kudosCount: Math.max(0, Number(raw.kudosCount || 0)),
    hitsCount: Math.max(0, Number(raw.hitsCount || 0)),
    bookmarksCount: Math.max(0, Number(raw.bookmarksCount || 0)),
    sourceArchiveId: clampString(sanitizePlainProse(raw.sourceArchiveId || 'link_cable_trade', 120), 1, 120),
    archiveDate: clampString(String(raw.archiveDate || new Date().toISOString().slice(0, 10)), 1, 20),
    visibility: 'public',
    sharedAnnotations: sanitizeAnnotationsList(raw.sharedAnnotations),
  };
}

export async function createSignedTradePack(
  identity: LocalCryptographicIdentity,
  worksToExport: ArchivalWork[],
  targetPeerCode?: string
): Promise<Ao3TradePack> {
  const entries: SignedTradeWorkEntry[] = [];
  for (const w of worksToExport) {
    const cleanWork = sanitizeImportedWork(w);
    const hash = await sha256Hex(canonicalWorkHashPayload(cleanWork));
    entries.push({ work: cleanWork, sha256: hash });
  }

  const manifestString = entries.map((e) => `${e.work.id}:${e.sha256}`).join('|');
  const manifestHash = await sha256Hex(manifestString);

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    identity.privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(manifestHash)
  );

  return {
    format: 'ao3pack-v1',
    packId: sanitizeId(`pack_${Date.now()}`),
    exportedAt: new Date().toISOString(),
    senderPeerCode: identity.peerCode,
    senderName: identity.displayName,
    senderRole: identity.role,
    senderFingerprint: identity.publicKeyFingerprint,
    senderPublicKeyJwk: identity.publicKeyJwk,
    targetPeerCode,
    worksCount: entries.length,
    entries,
    manifestHash,
    signatureBase64: bufferToBase64(sigBuf),
  };
}

export async function verifyAndImportTradePack(
  rawPackJson: string,
  existingWorks: ArchivalWork[]
): Promise<TradeImportResult> {
  const parsed = JSON.parse(rawPackJson) as Ao3TradePack;
  if (parsed.format !== 'ao3pack-v1' || !Array.isArray(parsed.entries)) {
    throw new Error('Unrecognized file format. Expected an Archive Mine Own (.ao3pack.json) Reading Room bundle.');
  }

  let hashesVerified = 0;
  const importedWorks: ArchivalWork[] = [];
  const manifestParts: string[] = [];

  for (const entry of parsed.entries.slice(0, 100)) {
    const cleanWork = sanitizeImportedWork(entry.work);
    const recomputed = await sha256Hex(canonicalWorkHashPayload(cleanWork));
    if (recomputed === entry.sha256) {
      hashesVerified++;
      manifestParts.push(`${cleanWork.id}:${recomputed}`);
      importedWorks.push(cleanWork);
    }
  }

  let signatureVerified = false;
  try {
    const recomputedManifestHash = await sha256Hex(manifestParts.join('|'));
    if (
      recomputedManifestHash === parsed.manifestHash &&
      parsed.senderPublicKeyJwk &&
      parsed.signatureBase64
    ) {
      const pubKey = await crypto.subtle.importKey(
        'jwk',
        parsed.senderPublicKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      signatureVerified = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pubKey,
        base64ToArrayBuffer(parsed.signatureBase64),
        new TextEncoder().encode(recomputedManifestHash)
      );
    }
  } catch {
    signatureVerified = false;
  }

  const existingMap = new Map(existingWorks.map((w) => [w.id, w]));
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let annotationsCount = 0;

  for (const w of importedWorks) {
    if (w.sharedAnnotations && w.sharedAnnotations.length > 0) {
      annotationsCount += w.sharedAnnotations.length;
    }
    const curr = existingMap.get(w.id);
    if (!curr) {
      newCount++;
    } else {
      const mergedAnn = mergeSharedAnnotations(curr.sharedAnnotations, w.sharedAnnotations);
      const hasNewAnnotations =
        annotationsSignature(mergedAnn) !== annotationsSignature(curr.sharedAnnotations);
      if (
        w.chapterCount > curr.chapterCount ||
        w.wordCount > curr.wordCount ||
        hasNewAnnotations
      ) {
        updatedCount++;
      } else {
        skippedCount++;
      }
    }
  }

  return {
    importedWorks,
    newCount,
    updatedCount,
    skippedCount,
    annotationsCount,
    signatureVerified,
    hashesVerified,
    senderName: clampString(parsed.senderName || 'Reading Room Peer', 1, 80),
    senderFingerprint: clampString(parsed.senderFingerprint || 'Unverified', 1, 128),
  };
}

/**
 * Sample Reading Room peers so users can immediately test Pokédex-style inventory diffing
 * and delta bundle export right out of the box.
 */
export const INITIAL_READING_ROOM_PEERS: ReadingRoomPeerRecord[] = [
  {
    id: 'peer_sample_vesper',
    ownerUid: 'local_reader',
    peerCode: 'peer_vesper_quill_221b',
    peerName: 'vesper_quill',
    role: 'Author',
    publicKeyFingerprint: 'AMO-221B-84F0-9C12',
    sharedFandoms: ['Sherlock (BBC)', 'Good Omens - Neil Gaiman & Terry Pratchett'],
    knownWorkIds: ['ia_ao3_00104829', 'ia_ao3_00518392'],
    fullCachedInventory: ['ia_ao3_00104829', 'ia_ao3_00518392'],
    tradeCount: 3,
    status: 'Pinned',
    notes: 'Shares restored 2014 Sherlock case-fic caches and annotated drafts.',
    updatedAtIso: '2026-11-14',
  },
  {
    id: 'peer_sample_tarsus',
    ownerUid: 'local_reader',
    peerCode: 'peer_tarsus_archivist',
    peerName: 'tarsus_iv_archivist',
    role: 'Archivist',
    publicKeyFingerprint: 'AMO-1978-NCC1-701A',
    sharedFandoms: [
      'Star Trek: The Original Series',
      'The Silmarillion and other histories of Middle-earth - J. R. R. Tolkien',
    ],
    knownWorkIds: ['ia_ao3_00291740', 'ia_ao3_00684115'],
    fullCachedInventory: ['ia_ao3_00291740', 'ia_ao3_00684115'],
    tradeCount: 1,
    status: 'Connected',
    notes: 'Open Doors zine preservation collector for pre-2000s sci-fi & fantasy.',
    updatedAtIso: '2026-11-12',
  },
];
