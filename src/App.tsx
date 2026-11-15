import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  BookOpen,
  Bookmark as BookmarkIcon,
  PenTool,
  Archive,
  Search,
  RotateCcw,
  Sun,
  Moon,
  Heart,
  GitBranch,
  BarChart3,
  Check,
  Plus,
  Minus,
  Trash2,
  ExternalLink,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  FileText,
  Lock,
  LogIn,
  LogOut,
  ArrowLeft,
  Star,
  Upload,
  Globe,
  Feather,
} from 'lucide-react';
import {
  auth,
  db,
  signInWithGoogle,
  signOutUser,
  handleFirestoreError,
  OperationType,
  sanitizeId,
  clampString,
  sanitizeTagsList,
} from './lib/firebase';
import { PWAInstallButton, OfflineIndicator, useOnlineStatus } from './hooks/usePWA';
import {
  type ArchivalWork,
  type Ao3Rating,
  type Ao3Category,
  type Ao3Status,
  loadCachedArchivalWorks,
  loadCachedArchivalWorksFromIdb,
  saveCachedArchivalWorks,
  scrapeInternetArchiveWorks,
  fetchInternetArchiveItemText,
  splitTextIntoChapters,
  isArchivalPlaceholderContent,
  isRealArchiveOrgIdentifier,
} from './data/internetArchiveCatalog';
import { ReadingRoomView } from './components/ReadingRoomView';
import {
  type ReadingRoomPeerRecord,
  type TradeImportResult,
  mergeSharedAnnotations,
  INITIAL_READING_ROOM_PEERS,
} from './lib/readingRoomTrade';
import {
  parseUploadedAo3File,
  parseAo3HtmlToWork,
  recoverAo3WorkFromWayback,
} from './lib/ao3ImportParser';

type NavTab = 'catalog' | 'dashboard' | 'studio' | 'readingRoom' | 'scraper';

export interface BookmarkRecord {
  id: string;
  ownerUid: string;
  ficSlug: string;
  ficTitle: string;
  ficAuthor: string;
  ficFandom: string;
  currentChapter: number;
  totalChapters: number;
  progressPercent: number;
  readingStatus: 'Reading' | 'Marked for Later' | 'Completed' | 'Archived';
  personalNotes: string;
  userTags: string[];
  isFavorite: boolean;
  isPublicNote: boolean;
  updatedAtIso: string;
  createdAtRaw?: unknown;
}

export interface WorkVersionRecord {
  id: string;
  workId: string;
  authorUid: string;
  versionLabel: string;
  commitNote: string;
  contentSnapshot: string;
  wordCount: number;
  createdAtIso: string;
}

export type FeedbackDimension =
  | 'Pacing'
  | 'Characterization'
  | 'Worldbuilding'
  | 'Prose Style'
  | 'Emotional Impact';

export interface WorkFeedbackRecord {
  id: string;
  workId: string;
  readerUid: string;
  readerName: string;
  chapterNumber: number;
  dimension: FeedbackDimension;
  score: number;
  comment: string;
  visibility: 'public';
  createdAtIso: string;
}

interface FilterPreset {
  id: string;
  name: string;
  includedTags: string[];
  excludedTags: string[];
  fandom: string;
  rating: string;
  category: string;
  status: string;
}

const DEFAULT_BOOKMARKS_LOCAL_KEY = 'ao3_folio_local_bookmarks_v1';
const READING_ROOM_LOCAL_KEY = 'ao3_folio_reading_room_peers_v1';
const FILTER_PRESETS_KEY = 'ao3_folio_filter_presets_v1';
const THEME_STORAGE_KEY = 'ao3_folio_theme_v1';

const RATINGS_LIST: Ao3Rating[] = [
  'General Audiences',
  'Teen And Up Audiences',
  'Mature',
  'Explicit',
  'Not Rated',
];

const CATEGORIES_LIST: Ao3Category[] = ['Gen', 'F/F', 'F/M', 'M/M', 'Multi', 'Other'];

const FEEDBACK_DIMENSIONS: FeedbackDimension[] = [
  'Pacing',
  'Characterization',
  'Worldbuilding',
  'Prose Style',
  'Emotional Impact',
];

function formatTimestampIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString().slice(0, 10);
  }
  if (typeof val === 'string' && val.length >= 10) {
    return val.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).length;
}

export default function App() {
  // Theme state (Dark mode default as requested)
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
    }
  }, [isDark]);

  // Navigation & active reader state
  const [activeTab, setActiveTab] = useState<NavTab>('catalog');
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [readerViewMode, setReaderViewMode] = useState<'chapter' | 'entire'>('chapter');
  const [readerFontSize, setReaderFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [readerFontFamily, setReaderFontFamily] = useState<'serif' | 'sans'>('serif');
  const autoFetchedWorkIdsRef = useRef<Set<string>>(new Set());

  // Connectivity & Auth state
  const isOnline = useOnlineStatus();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Archival + Cloud Works state
  const [archivalWorks, setArchivalWorks] = useState<ArchivalWork[]>(() =>
    loadCachedArchivalWorks()
  );
  const [cloudWorks, setCloudWorks] = useState<ArchivalWork[]>([]);

  // Hydrate oversized unabridged manuscripts stored in IndexedDB
  useEffect(() => {
    let active = true;
    loadCachedArchivalWorksFromIdb().then((idbWorks) => {
      if (!active || !idbWorks) return;
      setArchivalWorks((prev) => {
        const map = new Map<string, ArchivalWork>();
        for (const w of prev) map.set(w.id, w);
        for (const w of idbWorks) {
          const existing = map.get(w.id);
          if (
            !existing ||
            (w.chapters?.length || 0) > (existing.chapters?.length || 0) ||
            w.content.length > existing.content.length
          ) {
            map.set(w.id, w);
          }
        }
        return Array.from(map.values());
      });
    });
    return () => {
      active = false;
    };
  }, []);

  // Listen to public cloud works in Firestore
  useEffect(() => {
    const worksPath = 'works';
    const q = query(collection(db, worksPath), where('visibility', '==', 'public'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ArchivalWork[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const workTitle = String(d.title || 'Untitled');
          const rawContent = String(d.content || '');
          const parsedChapters = splitTextIntoChapters(rawContent, workTitle);
          list.push({
            id: docSnap.id,
            title: workTitle,
            authorName: String(d.authorName || 'Anonymous'),
            authorUid: String(d.authorUid || ''),
            fandom: String(d.fandom || 'Original Work'),
            rating: (d.rating as Ao3Rating) || 'Not Rated',
            category: (d.category as Ao3Category) || 'Gen',
            status: (d.status as Ao3Status) || 'In Progress',
            summary: String(d.summary || ''),
            content: rawContent,
            chapters: parsedChapters.length > 1 ? parsedChapters : undefined,
            tags: Array.isArray(d.tags) ? d.tags.map(String) : ['General'],
            wordCount: Number(d.wordCount || 0),
            chapterCount: Math.max(Number(d.chapterCount || 1), parsedChapters.length),
            totalChapters: Math.max(Number(d.totalChapters || 1), parsedChapters.length),
            kudosCount: Number(d.kudosCount || 0),
            hitsCount: Number(d.hitsCount || 0),
            bookmarksCount: Number(d.bookmarksCount || 0),
            sourceArchiveId: String(d.sourceArchiveId || 'original'),
            archiveDate: formatTimestampIso(d.updatedAt || d.createdAt),
            visibility: d.visibility === 'private' ? 'private' : 'public',
          });
        });
        setCloudWorks(list);
      },
      (err) => {
        // When offline or unauthenticated, fallback gracefully
        console.warn('Cloud works listener fallback:', err.message);
      }
    );
    return () => unsub();
  }, []);

  // Combined deduplicated works catalog (Cloud works override archival cache with same ID)
  const allWorks = useMemo(() => {
    const map = new Map<string, ArchivalWork>();
    for (const w of archivalWorks) {
      map.set(w.id, w);
    }
    for (const w of cloudWorks) {
      map.set(w.id, w);
    }
    return Array.from(map.values());
  }, [archivalWorks, cloudWorks]);

  // Save merged archival works to localStorage for full offline access
  useEffect(() => {
    saveCachedArchivalWorks(allWorks);
  }, [allWorks]);

  // Bookmarks state (Cloud Firestore + Offline Local Mirror)
  const [localBookmarks, setLocalBookmarks] = useState<BookmarkRecord[]>(() => {
    try {
      const raw = localStorage.getItem(DEFAULT_BOOKMARKS_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BookmarkRecord[];
        return Array.isArray(parsed)
          ? parsed.map((b) => ({ ...b, isPublicNote: Boolean(b.isPublicNote) }))
          : [];
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'local_ia_ao3_00104829',
        ownerUid: 'local_reader',
        ficSlug: 'ia_ao3_00104829',
        ficTitle: 'The Cartography of Baker Street Rain',
        ficAuthor: 'vesper_quill',
        ficFandom: 'Sherlock (BBC)',
        currentChapter: 2,
        totalChapters: 3,
        progressPercent: 66,
        readingStatus: 'Reading',
        personalNotes: 'Chapter 2 pathology thermometer reveal is brilliant.',
        userTags: ['Rainy London', 'Case Fic', 'To Re-Read'],
        isFavorite: true,
        isPublicNote: true,
        updatedAtIso: '2026-11-14',
      },
      {
        id: 'local_ia_ao3_00684115',
        ownerUid: 'local_reader',
        ficSlug: 'ia_ao3_00684115',
        ficTitle: 'Song of the Forges of Eregion',
        ficAuthor: 'findekano_harper',
        ficFandom: 'The Silmarillion and other histories of Middle-earth - J. R. R. Tolkien',
        currentChapter: 4,
        totalChapters: 8,
        progressPercent: 50,
        readingStatus: 'Reading',
        personalNotes: 'Tracking Celebrimbor and Narvi dialogue notes.',
        userTags: ['Second Age', 'Worldbuilding'],
        isFavorite: false,
        isPublicNote: false,
        updatedAtIso: '2026-11-12',
      },
    ];
  });

  const [cloudBookmarks, setCloudBookmarks] = useState<BookmarkRecord[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(DEFAULT_BOOKMARKS_LOCAL_KEY, JSON.stringify(localBookmarks));
    } catch {
      // ignore
    }
  }, [localBookmarks]);

  // Sync user's Cloud Bookmarks when signed in
  useEffect(() => {
    if (!authReady || !user) {
      setCloudBookmarks([]);
      return;
    }
    const bmPath = 'bookmarks';
    const q = query(collection(db, bmPath), where('ownerUid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: BookmarkRecord[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            ownerUid: String(d.ownerUid),
            ficSlug: String(d.ficSlug),
            ficTitle: String(d.ficTitle),
            ficAuthor: String(d.ficAuthor),
            ficFandom: String(d.ficFandom),
            currentChapter: Number(d.currentChapter || 1),
            totalChapters: Number(d.totalChapters || 1),
            progressPercent: Number(d.progressPercent || 0),
            readingStatus:
              (d.readingStatus as BookmarkRecord['readingStatus']) || 'Reading',
            personalNotes: String(d.personalNotes || ''),
            userTags: Array.isArray(d.userTags) ? d.userTags.map(String) : ['Bookmarked'],
            isFavorite: Boolean(d.isFavorite),
            isPublicNote: Boolean(d.isPublicNote),
            updatedAtIso: formatTimestampIso(d.updatedAt),
            createdAtRaw: d.createdAt,
          });
        });
        setCloudBookmarks(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, bmPath);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  const activeBookmarks = user ? cloudBookmarks : localBookmarks;

  // Reading Room Roster State (Offline Local + Cloud Firestore Sync)
  const [localPeers, setLocalPeers] = useState<ReadingRoomPeerRecord[]>(() => {
    try {
      const raw = localStorage.getItem(READING_ROOM_LOCAL_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return INITIAL_READING_ROOM_PEERS;
  });
  const [cloudPeers, setCloudPeers] = useState<ReadingRoomPeerRecord[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(READING_ROOM_LOCAL_KEY, JSON.stringify(localPeers));
    } catch {
      // ignore
    }
  }, [localPeers]);

  useEffect(() => {
    if (!authReady || !user) {
      setCloudPeers([]);
      return;
    }
    const peersPath = 'readingRoomPeers';
    const q = query(collection(db, peersPath), where('ownerUid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ReadingRoomPeerRecord[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            ownerUid: String(d.ownerUid),
            peerCode: String(d.peerCode),
            peerName: String(d.peerName),
            role: (d.role as ReadingRoomPeerRecord['role']) || 'Reader',
            publicKeyFingerprint: String(d.publicKeyFingerprint || ''),
            sharedFandoms: Array.isArray(d.sharedFandoms)
              ? d.sharedFandoms.map(String)
              : ['Original Work'],
            knownWorkIds: Array.isArray(d.knownWorkIds)
              ? d.knownWorkIds.map(String)
              : ['none_yet'],
            fullCachedInventory: Array.isArray(d.knownWorkIds)
              ? d.knownWorkIds.map(String)
              : [],
            tradeCount: Number(d.tradeCount || 0),
            status: (d.status as ReadingRoomPeerRecord['status']) || 'Connected',
            notes: String(d.notes || ''),
            updatedAtIso: formatTimestampIso(d.updatedAt),
          });
        });
        setCloudPeers(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, peersPath);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  const activePeers = useMemo(() => {
    if (!user) return localPeers;
    const map = new Map<string, ReadingRoomPeerRecord>();
    for (const cp of cloudPeers) map.set(cp.peerCode, cp);
    return Array.from(map.values());
  }, [user, localPeers, cloudPeers]);

  const handleUpsertPeer = async (peer: ReadingRoomPeerRecord) => {
    const cleanCode = sanitizeId(peer.peerCode);
    setLocalPeers((prev) => {
      const idx = prev.findIndex((p) => p.peerCode === cleanCode);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...peer, peerCode: cleanCode };
        return copy;
      }
      return [{ ...peer, peerCode: cleanCode }, ...prev];
    });

    if (!user) return;

    const docId = sanitizeId(`${user.uid}_${cleanCode}`);
    const peerRef = doc(db, 'readingRoomPeers', docId);
    const existingCloud = cloudPeers.find((cp) => cp.id === docId);

    try {
      if (existingCloud) {
        if (existingCloud.status === 'Archived') {
          showToast('This Reading Room entry is Archived and locked.');
          return;
        }
        await updateDoc(peerRef, {
          peerName: clampString(peer.peerName, 1, 80),
          role: peer.role,
          publicKeyFingerprint: clampString(peer.publicKeyFingerprint, 4, 128),
          sharedFandoms: sanitizeTagsList(peer.sharedFandoms, 'Original Work'),
          knownWorkIds: sanitizeTagsList(peer.knownWorkIds, 'none_yet'),
          tradeCount: Math.max(0, Math.min(100000, peer.tradeCount)),
          status: peer.status,
          notes: clampString(peer.notes, 0, 500, ''),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(peerRef, {
          ownerUid: user.uid,
          peerCode: cleanCode,
          peerName: clampString(peer.peerName, 1, 80),
          role: peer.role,
          publicKeyFingerprint: clampString(peer.publicKeyFingerprint, 4, 128),
          sharedFandoms: sanitizeTagsList(peer.sharedFandoms, 'Original Work'),
          knownWorkIds: sanitizeTagsList(peer.knownWorkIds, 'none_yet'),
          tradeCount: Math.max(0, Math.min(100000, peer.tradeCount)),
          status: peer.status,
          notes: clampString(peer.notes, 0, 500, ''),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(
        error,
        existingCloud ? OperationType.UPDATE : OperationType.CREATE,
        `readingRoomPeers/${docId}`
      );
    }
  };

  const handleDeletePeer = async (peer: ReadingRoomPeerRecord) => {
    setLocalPeers((prev) => prev.filter((p) => p.peerCode !== peer.peerCode));
    if (!user) {
      showToast(`Removed "${peer.peerName}" from Reading Room`);
      return;
    }
    const path = `readingRoomPeers/${peer.id}`;
    try {
      await deleteDoc(doc(db, 'readingRoomPeers', peer.id));
      showToast(`Removed "${peer.peerName}" from Cloud Reading Room`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleImportWorksFromTrade = (result: TradeImportResult) => {
    setArchivalWorks((prev) => {
      const map = new Map<string, ArchivalWork>();
      for (const w of prev) map.set(w.id, w);
      for (const incomingWork of result.importedWorks) {
        const existing = map.get(incomingWork.id);
        if (!existing) {
          map.set(incomingWork.id, incomingWork);
        } else {
          const mergedAnnotations = mergeSharedAnnotations(
            existing.sharedAnnotations,
            incomingWork.sharedAnnotations
          );
          const takeIncomingText =
            incomingWork.chapterCount > existing.chapterCount ||
            incomingWork.wordCount > existing.wordCount;
          map.set(incomingWork.id, {
            ...(takeIncomingText ? incomingWork : existing),
            sharedAnnotations: mergedAnnotations,
          });
        }
      }
      return Array.from(map.values());
    });
  };

  // Offline Tag Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [includedTags, setIncludedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [selectedFandom, setSelectedFandom] = useState<string>('All');
  const [selectedRating, setSelectedRating] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [wordCountRange, setWordCountRange] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [sortBy, setSortBy] = useState<'kudos' | 'words' | 'hits' | 'bookmarks' | 'date'>('kudos');
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
    try {
      const raw = localStorage.getItem(FILTER_PRESETS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return [
      {
        id: 'preset_slowburn_mm',
        name: 'Slow Burn · M/M Complete',
        includedTags: ['Slow Burn'],
        excludedTags: ['Major Character Death'],
        fandom: 'All',
        rating: 'All',
        category: 'M/M',
        status: 'Completed',
      },
      {
        id: 'preset_found_family',
        name: 'Found Family · Hurt/Comfort',
        includedTags: ['Found Family', 'Hurt/Comfort'],
        excludedTags: [],
        fandom: 'All',
        rating: 'All',
        category: 'All',
        status: 'All',
      },
    ];
  });
  const [newPresetName, setNewPresetName] = useState('');

  // Extract all unique fandoms and tags with counts for the offline filter sidebar
  const allFandoms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of allWorks) {
      counts.set(w.fandom, (counts.get(w.fandom) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [allWorks]);

  const allCanonicalTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of allWorks) {
      for (const t of w.tags) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [allWorks]);

  // Cycle tag state: Neutral -> Included (+) -> Excluded (-) -> Neutral
  const handleToggleTagState = (tag: string) => {
    if (includedTags.includes(tag)) {
      setIncludedTags((prev) => prev.filter((t) => t !== tag));
      setExcludedTags((prev) => [...prev, tag]);
    } else if (excludedTags.includes(tag)) {
      setExcludedTags((prev) => prev.filter((t) => t !== tag));
    } else {
      setIncludedTags((prev) => [...prev, tag]);
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setIncludedTags([]);
    setExcludedTags([]);
    setSelectedFandom('All');
    setSelectedRating('All');
    setSelectedCategory('All');
    setSelectedStatus('All');
    setWordCountRange('all');
  };

  const handleSaveFilterPreset = () => {
    const name = newPresetName.trim() || `Filter Set ${filterPresets.length + 1}`;
    const preset: FilterPreset = {
      id: `preset_${Date.now()}`,
      name,
      includedTags,
      excludedTags,
      fandom: selectedFandom,
      rating: selectedRating,
      category: selectedCategory,
      status: selectedStatus,
    };
    const updated = [preset, ...filterPresets].slice(0, 8);
    setFilterPresets(updated);
    localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(updated));
    setNewPresetName('');
    showToast(`Saved offline filter preset "${name}"`);
  };

  const applyFilterPreset = (preset: FilterPreset) => {
    setIncludedTags(preset.includedTags);
    setExcludedTags(preset.excludedTags);
    setSelectedFandom(preset.fandom);
    setSelectedRating(preset.rating);
    setSelectedCategory(preset.category);
    setSelectedStatus(preset.status);
    showToast(`Applied filter preset "${preset.name}"`);
  };

  // Filtered and sorted works (100% client-side offline-capable)
  const filteredWorks = useMemo(() => {
    return allWorks
      .filter((work) => {
        if (selectedFandom !== 'All' && work.fandom !== selectedFandom) return false;
        if (selectedRating !== 'All' && work.rating !== selectedRating) return false;
        if (selectedCategory !== 'All' && work.category !== selectedCategory) return false;
        if (selectedStatus !== 'All' && work.status !== selectedStatus) return false;

        if (wordCountRange === 'short' && work.wordCount >= 15000) return false;
        if (
          wordCountRange === 'medium' &&
          (work.wordCount < 15000 || work.wordCount > 30000)
        )
          return false;
        if (wordCountRange === 'long' && work.wordCount <= 30000) return false;

        if (includedTags.length > 0) {
          const hasAllIncluded = includedTags.every((t) => work.tags.includes(t));
          if (!hasAllIncluded) return false;
        }

        if (excludedTags.length > 0) {
          const hasAnyExcluded = excludedTags.some((t) => work.tags.includes(t));
          if (hasAnyExcluded) return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = work.title.toLowerCase().includes(q);
          const matchAuthor = work.authorName.toLowerCase().includes(q);
          const matchSummary = work.summary.toLowerCase().includes(q);
          const matchFandom = work.fandom.toLowerCase().includes(q);
          const matchTag = work.tags.some((t) => t.toLowerCase().includes(q));
          const matchArchive = work.sourceArchiveId.toLowerCase().includes(q);
          if (
            !matchTitle &&
            !matchAuthor &&
            !matchSummary &&
            !matchFandom &&
            !matchTag &&
            !matchArchive
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'kudos') return b.kudosCount - a.kudosCount;
        if (sortBy === 'words') return b.wordCount - a.wordCount;
        if (sortBy === 'hits') return b.hitsCount - a.hitsCount;
        if (sortBy === 'bookmarks') return b.bookmarksCount - a.bookmarksCount;
        return b.archiveDate.localeCompare(a.archiveDate);
      });
  }, [
    allWorks,
    selectedFandom,
    selectedRating,
    selectedCategory,
    selectedStatus,
    wordCountRange,
    includedTags,
    excludedTags,
    searchQuery,
    sortBy,
  ]);

  // Bookmark & Reading Progress Actions
  const handleUpsertBookmark = async (
    work: ArchivalWork,
    overrides?: Partial<BookmarkRecord>
  ) => {
    const slug = sanitizeId(work.id);
    const existingBm = activeBookmarks.find((b) => b.ficSlug === slug);

    const currentChapter = overrides?.currentChapter ?? existingBm?.currentChapter ?? 1;
    const totalChapters = Math.max(1, work.totalChapters || work.chapterCount || 1);
    const progressPercent =
      overrides?.progressPercent ??
      existingBm?.progressPercent ??
      Math.min(100, Math.round((currentChapter / totalChapters) * 100));
    const readingStatus =
      overrides?.readingStatus ??
      existingBm?.readingStatus ??
      (progressPercent >= 100 ? 'Completed' : 'Reading');
    const personalNotes = clampString(
      overrides?.personalNotes ?? existingBm?.personalNotes ?? '',
      0,
      1000,
      ''
    );
    const userTags = sanitizeTagsList(
      overrides?.userTags ?? existingBm?.userTags ?? work.tags.slice(0, 3),
      'Bookmarked'
    );
    const isFavorite = overrides?.isFavorite ?? existingBm?.isFavorite ?? false;
    const isPublicNote = Boolean(
      overrides?.isPublicNote ?? existingBm?.isPublicNote ?? false
    );

    if (!user) {
      const localId = existingBm?.id || `local_${slug}`;
      const record: BookmarkRecord = {
        id: localId,
        ownerUid: 'local_reader',
        ficSlug: slug,
        ficTitle: clampString(work.title, 1, 200),
        ficAuthor: clampString(work.authorName, 1, 100),
        ficFandom: clampString(work.fandom, 1, 150),
        currentChapter,
        totalChapters,
        progressPercent,
        readingStatus,
        personalNotes,
        userTags,
        isFavorite,
        isPublicNote,
        updatedAtIso: new Date().toISOString().slice(0, 10),
      };
      setLocalBookmarks((prev) => {
        const idx = prev.findIndex((b) => b.ficSlug === slug);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = record;
          return copy;
        }
        return [record, ...prev];
      });
      showToast(`Saved "${work.title}" to offline reading dashboard (Sign in to sync across devices)`);
      return;
    }

    const docId = sanitizeId(`${user.uid}_${slug}`);
    const docRef = doc(db, 'bookmarks', docId);
    try {
      if (existingBm) {
        if (existingBm.readingStatus === 'Archived') {
          showToast('This bookmark is locked in Archived status. Delete and recreate to modify.');
          return;
        }
        await updateDoc(docRef, {
          currentChapter,
          totalChapters,
          progressPercent,
          readingStatus,
          personalNotes,
          userTags,
          isFavorite,
          isPublicNote,
          ficTitle: clampString(work.title, 1, 200),
          ficAuthor: clampString(work.authorName, 1, 100),
          ficFandom: clampString(work.fandom, 1, 150),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          ownerUid: user.uid,
          ficSlug: slug,
          ficTitle: clampString(work.title, 1, 200),
          ficAuthor: clampString(work.authorName, 1, 100),
          ficFandom: clampString(work.fandom, 1, 150),
          currentChapter,
          totalChapters,
          progressPercent,
          readingStatus,
          personalNotes,
          userTags,
          isFavorite,
          isPublicNote,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      showToast(`Cloud-synced reading progress for "${work.title}"`);
    } catch (error) {
      handleFirestoreError(
        error,
        existingBm ? OperationType.UPDATE : OperationType.CREATE,
        `bookmarks/${docId}`
      );
    }
  };

  const handleDeleteBookmark = async (bm: BookmarkRecord) => {
    if (!user) {
      setLocalBookmarks((prev) => prev.filter((item) => item.id !== bm.id));
      showToast(`Removed "${bm.ficTitle}" from reading dashboard`);
      return;
    }
    const path = `bookmarks/${bm.id}`;
    try {
      await deleteDoc(doc(db, 'bookmarks', bm.id));
      showToast(`Deleted cloud bookmark "${bm.ficTitle}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSyncLocalBookmarksToCloud = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    let syncedCount = 0;
    for (const lb of localBookmarks) {
      const slug = sanitizeId(lb.ficSlug);
      const docId = sanitizeId(`${user.uid}_${slug}`);
      const alreadyInCloud = cloudBookmarks.some((cb) => cb.id === docId);
      if (!alreadyInCloud) {
        try {
          await setDoc(doc(db, 'bookmarks', docId), {
            ownerUid: user.uid,
            ficSlug: slug,
            ficTitle: clampString(lb.ficTitle, 1, 200),
            ficAuthor: clampString(lb.ficAuthor, 1, 100),
            ficFandom: clampString(lb.ficFandom, 1, 150),
            currentChapter: Math.max(1, Math.min(1000, lb.currentChapter)),
            totalChapters: Math.max(1, Math.min(1000, lb.totalChapters)),
            progressPercent: Math.max(0, Math.min(100, lb.progressPercent)),
            readingStatus: lb.readingStatus,
            personalNotes: clampString(lb.personalNotes, 0, 1000, ''),
            userTags: sanitizeTagsList(lb.userTags, 'Bookmarked'),
            isFavorite: Boolean(lb.isFavorite),
            isPublicNote: Boolean(lb.isPublicNote),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          syncedCount++;
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `bookmarks/${docId}`);
        }
      }
    }
    showToast(
      syncedCount > 0
        ? `Synced ${syncedCount} offline bookmark(s) to your Cloud account.`
        : 'All local bookmarks are already synchronized with the Cloud.'
    );
  };

  // Dashboard filter state
  const [dashboardFilter, setDashboardFilter] = useState<
    'All' | 'Reading' | 'Marked for Later' | 'Completed' | 'Favorites'
  >('All');

  const filteredBookmarks = useMemo(() => {
    return activeBookmarks.filter((b) => {
      if (dashboardFilter === 'All') return true;
      if (dashboardFilter === 'Favorites') return b.isFavorite;
      return b.readingStatus === dashboardFilter;
    });
  }, [activeBookmarks, dashboardFilter]);

  // Author Writing Studio, Version Control & Feedback Analytics State
  const [studioWorkId, setStudioWorkId] = useState<string>('work_author_folio_01');
  const [studioTitle, setStudioTitle] = useState<string>(
    'Nocturne for Two Clocks in Greenwich'
  );
  const [studioAuthorName, setStudioAuthorName] = useState<string>('astrolabe_ink');
  const [studioFandom, setStudioFandom] = useState<string>(
    'Good Omens - Neil Gaiman & Terry Pratchett'
  );
  const [studioRating, setStudioRating] = useState<Ao3Rating>('Teen And Up Audiences');
  const [studioCategory, setStudioCategory] = useState<Ao3Category>('M/M');
  const [studioStatus, setStudioStatus] = useState<Ao3Status>('In Progress');
  const [studioTagsInput, setStudioTagsInput] = useState<string>(
    'Slow Burn, Horology, Royal Observatory Greenwich, Historical Vignettes, Soft Romanticism'
  );
  const [studioSummary, setStudioSummary] = useState<string>(
    'In the winter of 1759, while John Harrison perfects the fourth marine chronometer, two immortals argue over whether time is a line, a circle, or an overdue loan.'
  );
  const [studioContent, setStudioContent] = useState<string>(
    `The brass balance wheel of H4 beat five times a second, crisp as rain on a carriage roof.

Crowley leaned his elbows against the frosted casement of the Flamsteed House octagon room, watching the Thames curl like a ribbon of tarnished pewter below Greenwich Hill.

"You're telling me," he said, without turning around, "that the mortals have finally figured out longitude by putting a spring inside a pocket-watch, and Upstairs is taking credit for the geometry?"

Aziraphale looked up from his notebook, his quill poised above a column of lunar distances. "Not credit, my dear. Merely a benevolent interest in maritime navigation. Fewer shipwrecks off the Scilly Isles."

"Fewer miracles needed on the quiet, you mean," Crowley muttered, though he stepped closer to peer over the angel's shoulder at the delicate copperplate figures.`
  );

  // Version Control state (Cloud + Local preview fallback)
  const [versionLabelInput, setVersionLabelInput] = useState<string>(
    'v1.2 — Greenwich Observatory Dialogue'
  );
  const [commitNoteInput, setCommitNoteInput] = useState<string>(
    'Refined opening cadence and added John Harrison H4 marine chronometer historical detail.'
  );
  const [localVersions, setLocalVersions] = useState<WorkVersionRecord[]>([
    {
      id: 'ver_initial_01',
      workId: 'work_author_folio_01',
      authorUid: 'local_author',
      versionLabel: 'v1.0 — First Draft Outline',
      commitNote: 'Initial scene sketch set at Greenwich Hill in winter 1759.',
      contentSnapshot: `The brass balance wheel of H4 beat five times a second, crisp as rain on a carriage roof.\n\nCrowley leaned his elbows against the frosted casement of the Flamsteed House octagon room, watching the Thames curl below Greenwich Hill.`,
      wordCount: 38,
      createdAtIso: '2026-11-10',
    },
    {
      id: 'ver_second_02',
      workId: 'work_author_folio_01',
      authorUid: 'local_author',
      versionLabel: 'v1.1 — Expanded Octagon Room Scene',
      commitNote: 'Added Aziraphale lunar distance ledger and Scilly Isles dialogue.',
      contentSnapshot: `The brass balance wheel of H4 beat five times a second, crisp as rain on a carriage roof.\n\nCrowley leaned his elbows against the frosted casement of the Flamsteed House octagon room, watching the Thames curl like a ribbon of tarnished pewter below Greenwich Hill.\n\n"You're telling me," he said, without turning around, "that the mortals have finally figured out longitude by putting a spring inside a pocket-watch, and Upstairs is taking credit for the geometry?"\n\nAziraphale looked up from his notebook, his quill poised above a column of lunar distances. "Not credit, my dear. Merely a benevolent interest in maritime navigation. Fewer shipwrecks off the Scilly Isles."`,
      wordCount: 110,
      createdAtIso: '2026-11-14',
    },
  ]);
  const [cloudVersions, setCloudVersions] = useState<WorkVersionRecord[]>([]);
  const [selectedDiffVersionId, setSelectedDiffVersionId] = useState<string | null>(
    'ver_initial_01'
  );

  // Reader Feedback state (Cloud + Curated fallback)
  const [localFeedback, setLocalFeedback] = useState<WorkFeedbackRecord[]>([
    {
      id: 'fb_sample_1',
      workId: 'ia_ao3_00104829',
      readerUid: 'reader_1',
      readerName: 'marylebone_tea',
      chapterNumber: 1,
      dimension: 'Prose Style',
      score: 5,
      comment:
        'The atmosphere of the peeling wallpaper and the oilskin ledger feels like classic Doyle filtered through modern literary fiction.',
      visibility: 'public',
      createdAtIso: '2026-11-12',
    },
    {
      id: 'fb_sample_2',
      workId: 'ia_ao3_00104829',
      readerUid: 'reader_2',
      readerName: 'bee_keeper_sussex',
      chapterNumber: 3,
      dimension: 'Emotional Impact',
      score: 5,
      comment:
        'The unclipped ticket to Sussex and the 78% probability line at the apiary wall hit so hard.',
      visibility: 'public',
      createdAtIso: '2026-11-14',
    },
    {
      id: 'fb_sample_3',
      workId: 'work_author_folio_01',
      readerUid: 'reader_3',
      readerName: 'horology_fan',
      chapterNumber: 1,
      dimension: 'Characterization',
      score: 5,
      comment:
        'Crowley complaining about H4 springs vs miracles while leaning on the Greenwich casement is spot-on voice.',
      visibility: 'public',
      createdAtIso: '2026-11-15',
    },
    {
      id: 'fb_sample_4',
      workId: 'work_author_folio_01',
      readerUid: 'reader_4',
      readerName: 'thames_mudlark',
      chapterNumber: 1,
      dimension: 'Worldbuilding',
      score: 4,
      comment:
        'Love the historical detail of Flamsteed House and lunar distances in 1759.',
      visibility: 'public',
      createdAtIso: '2026-11-15',
    },
  ]);
  const [cloudFeedback, setCloudFeedback] = useState<WorkFeedbackRecord[]>([]);

  // Subscribe to versions & feedback for the active studio work when signed in
  useEffect(() => {
    if (!authReady || !user || !studioWorkId) {
      setCloudVersions([]);
      return;
    }
    const cleanWorkId = sanitizeId(studioWorkId);
    const verPath = `works/${cleanWorkId}/versions`;
    const qVer = query(collection(db, verPath), where('authorUid', '==', user.uid));
    const unsubVer = onSnapshot(
      qVer,
      (snap) => {
        const list: WorkVersionRecord[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            workId: String(d.workId),
            authorUid: String(d.authorUid),
            versionLabel: String(d.versionLabel),
            commitNote: String(d.commitNote),
            contentSnapshot: String(d.contentSnapshot),
            wordCount: Number(d.wordCount || 0),
            createdAtIso: formatTimestampIso(d.createdAt),
          });
        });
        setCloudVersions(list);
      },
      () => {
        // Parent work may not be published to cloud yet
      }
    );
    return () => unsubVer();
  }, [authReady, user, studioWorkId]);

  const targetFeedbackWorkId = activeWorkId || studioWorkId;
  useEffect(() => {
    if (!targetFeedbackWorkId) return;
    const cleanWorkId = sanitizeId(targetFeedbackWorkId);
    const fbPath = `works/${cleanWorkId}/feedback`;
    const qFb = query(collection(db, fbPath), where('visibility', '==', 'public'));
    const unsubFb = onSnapshot(
      qFb,
      (snap) => {
        const list: WorkFeedbackRecord[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            workId: String(d.workId),
            readerUid: String(d.readerUid),
            readerName: String(d.readerName),
            chapterNumber: Number(d.chapterNumber || 1),
            dimension: (d.dimension as FeedbackDimension) || 'Prose Style',
            score: Number(d.score || 5),
            comment: String(d.comment || ''),
            visibility: 'public',
            createdAtIso: formatTimestampIso(d.createdAt),
          });
        });
        setCloudFeedback(list);
      },
      () => {
        // Fallback when offline
      }
    );
    return () => unsubFb();
  }, [targetFeedbackWorkId]);

  const activeVersions = useMemo(() => {
    const map = new Map<string, WorkVersionRecord>();
    for (const v of localVersions.filter((lv) => lv.workId === studioWorkId)) {
      map.set(v.id, v);
    }
    for (const v of cloudVersions) {
      map.set(v.id, v);
    }
    return Array.from(map.values());
  }, [localVersions, cloudVersions, studioWorkId]);

  const activeFeedbackList = useMemo(() => {
    const map = new Map<string, WorkFeedbackRecord>();
    for (const f of localFeedback.filter((lf) => lf.workId === targetFeedbackWorkId)) {
      map.set(f.id, f);
    }
    for (const f of cloudFeedback) {
      map.set(f.id, f);
    }
    return Array.from(map.values());
  }, [localFeedback, cloudFeedback, targetFeedbackWorkId]);

  // Publish or Update Author Work to Cloud Archive (/works/{workId})
  const handlePublishWorkToArchive = async () => {
    const parsedTags = sanitizeTagsList(
      studioTagsInput.split(',').map((t) => t.trim()),
      'Original Work'
    );
    const wc = countWords(studioContent);
    const cleanId = sanitizeId(studioWorkId);

    const newWorkObj: ArchivalWork = {
      id: cleanId,
      title: clampString(studioTitle, 1, 200),
      authorName: clampString(studioAuthorName, 1, 100),
      authorUid: user ? user.uid : 'local_author',
      fandom: clampString(studioFandom, 1, 150),
      rating: studioRating,
      category: studioCategory,
      status: studioStatus,
      summary: clampString(studioSummary, 1, 2000),
      content: clampString(studioContent, 1, 50000),
      tags: parsedTags,
      wordCount: wc,
      chapterCount: 1,
      totalChapters: studioStatus === 'Completed' ? 1 : 3,
      kudosCount: 14,
      hitsCount: 120,
      bookmarksCount: 5,
      sourceArchiveId: 'original',
      archiveDate: new Date().toISOString().slice(0, 10),
      visibility: 'public',
    };

    // Always update local cache immediately for offline responsiveness
    setArchivalWorks((prev) => {
      const idx = prev.findIndex((w) => w.id === cleanId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = newWorkObj;
        return copy;
      }
      return [newWorkObj, ...prev];
    });

    if (!user) {
      showToast(
        `Published "${newWorkObj.title}" to local offline archive. Sign in with Google to publish to Cloud Firestore.`
      );
      return;
    }

    const workRef = doc(db, 'works', cleanId);
    const existingCloud = cloudWorks.find((w) => w.id === cleanId);
    try {
      if (existingCloud) {
        if (existingCloud.status === 'Archived') {
          showToast('Work is in terminal Archived status and cannot be modified.');
          return;
        }
        await updateDoc(workRef, {
          title: newWorkObj.title,
          authorName: newWorkObj.authorName,
          fandom: newWorkObj.fandom,
          rating: newWorkObj.rating,
          category: newWorkObj.category,
          status: newWorkObj.status,
          summary: newWorkObj.summary,
          content: newWorkObj.content,
          tags: newWorkObj.tags,
          wordCount: newWorkObj.wordCount,
          chapterCount: newWorkObj.chapterCount,
          totalChapters: newWorkObj.totalChapters,
          visibility: 'public',
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(workRef, {
          title: newWorkObj.title,
          authorName: newWorkObj.authorName,
          authorUid: user.uid,
          fandom: newWorkObj.fandom,
          rating: newWorkObj.rating,
          category: newWorkObj.category,
          status: newWorkObj.status,
          summary: newWorkObj.summary,
          content: newWorkObj.content,
          tags: newWorkObj.tags,
          wordCount: newWorkObj.wordCount,
          chapterCount: newWorkObj.chapterCount,
          totalChapters: newWorkObj.totalChapters,
          kudosCount: 1,
          hitsCount: 1,
          bookmarksCount: 0,
          sourceArchiveId: 'original',
          visibility: 'public',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      showToast(`Published "${newWorkObj.title}" to Cloud Archive`);
    } catch (error) {
      handleFirestoreError(
        error,
        existingCloud ? OperationType.UPDATE : OperationType.CREATE,
        `works/${cleanId}`
      );
    }
  };

  // Commit a Version Snapshot (/works/{workId}/versions/{versionId})
  const handleCommitVersionSnapshot = async () => {
    const cleanWorkId = sanitizeId(studioWorkId);
    const verId = sanitizeId(`ver_${Date.now()}`);
    const wc = countWords(studioContent);
    const label = clampString(versionLabelInput, 1, 80, `v1.${activeVersions.length + 1}`);
    const note = clampString(
      commitNoteInput,
      1,
      500,
      'Saved manuscript revision snapshot.'
    );
    const snapshotText = clampString(studioContent, 1, 50000);

    const newLocalVer: WorkVersionRecord = {
      id: verId,
      workId: cleanWorkId,
      authorUid: user ? user.uid : 'local_author',
      versionLabel: label,
      commitNote: note,
      contentSnapshot: snapshotText,
      wordCount: wc,
      createdAtIso: new Date().toISOString().slice(0, 10),
    };

    setLocalVersions((prev) => [newLocalVer, ...prev]);
    setSelectedDiffVersionId(verId);

    if (!user) {
      showToast(`Committed version "${label}" to local revision history`);
      return;
    }

    // Ensure parent work exists in Firestore before creating subcollection version (Master Gate invariant)
    await handlePublishWorkToArchive();

    const verPath = `works/${cleanWorkId}/versions/${verId}`;
    try {
      await setDoc(doc(db, 'works', cleanWorkId, 'versions', verId), {
        workId: cleanWorkId,
        authorUid: user.uid,
        versionLabel: label,
        commitNote: note,
        contentSnapshot: snapshotText,
        wordCount: wc,
        createdAt: serverTimestamp(),
      });
      showToast(`Committed immutable snapshot "${label}" to Cloud Version Control`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, verPath);
    }
  };

  // Reader Feedback Form State
  const [fbDimension, setFbDimension] = useState<FeedbackDimension>('Characterization');
  const [fbScore, setFbScore] = useState<number>(5);
  const [fbComment, setFbComment] = useState<string>('');

  const handleSubmitReaderFeedback = async (work: ArchivalWork) => {
    if (!fbComment.trim()) {
      showToast('Please enter a feedback note before submitting.');
      return;
    }
    const cleanWorkId = sanitizeId(work.id);
    const fbId = sanitizeId(`fb_${Date.now()}`);
    const commentClean = clampString(fbComment, 1, 1000);
    const readerName = clampString(
      user?.displayName || user?.email?.split('@')[0] || 'archival_reader',
      1,
      80
    );

    const localRecord: WorkFeedbackRecord = {
      id: fbId,
      workId: cleanWorkId,
      readerUid: user ? user.uid : 'local_reader',
      readerName,
      chapterNumber: activeChapterIndex + 1,
      dimension: fbDimension,
      score: fbScore,
      comment: commentClean,
      visibility: 'public',
      createdAtIso: new Date().toISOString().slice(0, 10),
    };

    setLocalFeedback((prev) => [localRecord, ...prev]);
    setFbComment('');

    if (!user) {
      showToast('Recorded reader feedback locally (Sign in to sync to Cloud analytics)');
      return;
    }

    // Check if parent work exists in cloudWorks; if it's a cloud work, write to Firestore subcollection
    const parentInCloud = cloudWorks.some((cw) => cw.id === cleanWorkId);
    if (!parentInCloud) {
      showToast('Feedback recorded for archival work.');
      return;
    }

    const fbPath = `works/${cleanWorkId}/feedback/${fbId}`;
    try {
      await setDoc(doc(db, 'works', cleanWorkId, 'feedback', fbId), {
        workId: cleanWorkId,
        readerUid: user.uid,
        readerName,
        chapterNumber: activeChapterIndex + 1,
        dimension: fbDimension,
        score: fbScore,
        comment: commentClean,
        visibility: 'public',
        createdAt: serverTimestamp(),
      });
      showToast('Submitted direct reader feedback to author analytics');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, fbPath);
    }
  };

  // Give Kudos handler
  const handleGiveKudos = async (work: ArchivalWork) => {
    setArchivalWorks((prev) =>
      prev.map((w) => (w.id === work.id ? { ...w, kudosCount: w.kudosCount + 1 } : w))
    );
    const inCloud = cloudWorks.find((cw) => cw.id === work.id);
    if (user && inCloud && inCloud.status !== 'Archived') {
      try {
        await updateDoc(doc(db, 'works', work.id), {
          kudosCount: inCloud.kudosCount + 1,
          hitsCount: inCloud.hitsCount,
          bookmarksCount: inCloud.bookmarksCount,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `works/${work.id}`);
      }
    }
    showToast(`Left Kudos on "${work.title}"`);
  };

  // Internet Archive Live Scraper & AO3 Importer State
  const [scraperQuery, setScraperQuery] = useState<string>('Sherlock OR Tolkien OR Star Trek');
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [scrapedResults, setScrapedResults] = useState<ArchivalWork[]>([]);
  const [scraperSourceLabel, setScraperSourceLabel] = useState<string>('Ready to query archive.org');
  const [loadingFullTextId, setLoadingFullTextId] = useState<string | null>(null);

  const [ao3UrlInput, setAo3UrlInput] = useState<string>('');
  const [isRecoveringAo3, setIsRecoveringAo3] = useState<boolean>(false);
  const [isImportingFiles, setIsImportingFiles] = useState<boolean>(false);
  const [isDraggingAo3File, setIsDraggingAo3File] = useState<boolean>(false);
  const [showPasteHtmlBox, setShowPasteHtmlBox] = useState<boolean>(false);
  const [pastedAo3Html, setPastedAo3Html] = useState<string>('');
  const [ao3ImportNotice, setAo3ImportNotice] = useState<string | null>(null);

  const mergeImportedWorksIntoLibrary = (works: ArchivalWork[]) => {
    setArchivalWorks((prev) => {
      const map = new Map<string, ArchivalWork>();
      for (const w of prev) map.set(w.id, w);
      for (const w of works) map.set(w.id, w);
      return Array.from(map.values());
    });
    setScrapedResults((prev) => {
      const map = new Map<string, ArchivalWork>();
      for (const w of works) map.set(w.id, w);
      for (const w of prev) {
        if (!map.has(w.id)) map.set(w.id, w);
      }
      return Array.from(map.values());
    });
  };

  const handleAo3FilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsImportingFiles(true);
    setAo3ImportNotice(null);
    try {
      const files = Array.from(fileList);
      const imported: ArchivalWork[] = [];
      for (const f of files) {
        const work = await parseUploadedAo3File(f);
        imported.push(work);
      }
      if (imported.length > 0) {
        mergeImportedWorksIntoLibrary(imported);
        const totalWords = imported.reduce((acc, w) => acc + w.wordCount, 0);
        const totalChapters = imported.reduce((acc, w) => acc + w.chapterCount, 0);
        const msg = `Imported ${imported.length} unabridged ${
          imported.length === 1 ? 'work' : 'works'
        } (${totalChapters} ch · ${totalWords.toLocaleString()} words) into offline cache.`;
        setAo3ImportNotice(msg);
        showToast(msg);
        if (imported.length === 1) {
          setActiveChapterIndex(0);
          setActiveWorkId(imported[0].id);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse AO3 file';
      setAo3ImportNotice(msg);
      showToast(msg);
    } finally {
      setIsImportingFiles(false);
    }
  };

  const handleRecoverAo3Wayback = async () => {
    if (!ao3UrlInput.trim()) return;
    setIsRecoveringAo3(true);
    setAo3ImportNotice(null);
    try {
      const result = await recoverAo3WorkFromWayback(ao3UrlInput);
      mergeImportedWorksIntoLibrary([result.work]);
      const msg = `Recovered "${result.work.title}" (${result.work.wordCount.toLocaleString()} words · ${result.work.chapterCount} chapters) from Wayback snapshot ${result.snapshotDate}.`;
      setAo3ImportNotice(msg);
      showToast(msg);
      setActiveChapterIndex(0);
      setActiveWorkId(result.work.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not recover AO3 work from Wayback';
      setAo3ImportNotice(msg);
      showToast(msg);
    } finally {
      setIsRecoveringAo3(false);
    }
  };

  const handleParsePastedAo3Html = () => {
    if (!pastedAo3Html.trim() || pastedAo3Html.trim().length < 100) {
      showToast('Paste the full AO3 page HTML source first.');
      return;
    }
    const work = parseAo3HtmlToWork(pastedAo3Html, 'Pasted AO3 Work');
    mergeImportedWorksIntoLibrary([work]);
    setPastedAo3Html('');
    setShowPasteHtmlBox(false);
    showToast(
      `Parsed "${work.title}" (${work.wordCount.toLocaleString()} words · ${work.chapterCount} ch)`
    );
    setActiveChapterIndex(0);
    setActiveWorkId(work.id);
  };

  const handleRunScraper = async (customQuery?: string) => {
    const q = customQuery !== undefined ? customQuery : scraperQuery;
    setIsScraping(true);
    try {
      const result = await scrapeInternetArchiveWorks(q);
      setScrapedResults(result.works);
      setScraperSourceLabel(`${result.source} · ${result.works.length} works found`);
      // Merge into archivalWorks so offline tag filter immediately indexes them
      setArchivalWorks((prev) => {
        const map = new Map<string, ArchivalWork>();
        for (const w of prev) map.set(w.id, w);
        for (const w of result.works) map.set(w.id, w);
        return Array.from(map.values());
      });
      showToast(`Indexed ${result.works.length} works from ${result.source}`);
    } finally {
      setIsScraping(false);
    }
  };

  const handleFetchFullTextFromIa = async (work: ArchivalWork) => {
    if (!isRealArchiveOrgIdentifier(work.sourceArchiveId)) {
      showToast('Full pre-indexed manuscript is already stored locally offline.');
      return;
    }
    setLoadingFullTextId(work.id);
    try {
      const { extractedText, fileFormat, isTruncated } = await fetchInternetArchiveItemText(
        work.sourceArchiveId
      );
      if (extractedText && extractedText.trim().length > 100) {
        const parsedChapters = splitTextIntoChapters(extractedText, work.title);
        const parsedWordCount = countWords(extractedText);
        setArchivalWorks((prev) =>
          prev.map((w) =>
            w.id === work.id
              ? {
                  ...w,
                  chapters: parsedChapters,
                  content: extractedText,
                  wordCount: parsedWordCount,
                  chapterCount: parsedChapters.length,
                  totalChapters: Math.max(w.totalChapters || 0, parsedChapters.length),
                }
              : w
          )
        );
        setActiveChapterIndex((prevIdx) =>
          Math.min(prevIdx, Math.max(0, parsedChapters.length - 1))
        );
        const formatTag = fileFormat ? ` (${fileFormat})` : '';
        const capNotice = isTruncated ? ' [12 MB stream limit reached]' : '';
        showToast(
          `Loaded unabridged${formatTag} text: ${parsedWordCount.toLocaleString()} words across ${
            parsedChapters.length
          } ${parsedChapters.length === 1 ? 'chapter' : 'chapters'}${capNotice}`
        );
      } else {
        showToast('No plain text/HTML/EPUB manuscript stream available for this archive.org item.');
      }
    } catch {
      showToast('Using local offline cached manuscript text.');
    } finally {
      setLoadingFullTextId(null);
    }
  };

  const activeWork = useMemo(
    () => allWorks.find((w) => w.id === activeWorkId) || null,
    [allWorks, activeWorkId]
  );

  // Automatically fetch full text when a user opens a newly scraped Internet Archive item
  useEffect(() => {
    if (!activeWork) return;
    if (!isRealArchiveOrgIdentifier(activeWork.sourceArchiveId)) return;
    if (!isArchivalPlaceholderContent(activeWork.content)) return;
    if (autoFetchedWorkIdsRef.current.has(activeWork.id)) return;
    autoFetchedWorkIdsRef.current.add(activeWork.id);
    void handleFetchFullTextFromIa(activeWork);
  }, [activeWork]);

  const activeChapters = useMemo(
    () => (activeWork?.chapters && activeWork.chapters.length > 0 ? activeWork.chapters : null),
    [activeWork]
  );

  const safeChapterIndex = activeChapters
    ? Math.min(activeChapterIndex, activeChapters.length - 1)
    : 0;
  const activeChapter = activeChapters ? activeChapters[safeChapterIndex] : null;

  const activeWorkBookmark = useMemo(
    () =>
      activeWork
        ? activeBookmarks.find((b) => b.ficSlug === sanitizeId(activeWork.id)) || null
        : null,
    [activeWork, activeBookmarks]
  );

  // Compute aggregated Feedback Analytics for Author Studio
  const studioAnalytics = useMemo(() => {
    const scoresByDim = new Map<FeedbackDimension, { sum: number; count: number }>();
    for (const dim of FEEDBACK_DIMENSIONS) {
      scoresByDim.set(dim, { sum: 0, count: 0 });
    }
    for (const fb of activeFeedbackList) {
      const curr = scoresByDim.get(fb.dimension) || { sum: 0, count: 0 };
      scoresByDim.set(fb.dimension, { sum: curr.sum + fb.score, count: curr.count + 1 });
    }
    return FEEDBACK_DIMENSIONS.map((dim) => {
      const item = scoresByDim.get(dim)!;
      const avg = item.count > 0 ? item.sum / item.count : 4.6;
      return {
        dimension: dim,
        average: avg,
        count: item.count,
      };
    });
  }, [activeFeedbackList]);

  const selectedDiffVersion = useMemo(
    () => activeVersions.find((v) => v.id === selectedDiffVersionId) || activeVersions[0] || null,
    [activeVersions, selectedDiffVersionId]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] dark:bg-[#0C0C0E] text-[#1C1917] dark:text-[#F4F4F5] transition-colors duration-150">
      <OfflineIndicator />

      {/* Top Bar Contract: Strict 1-row, 3-zone header separated by gap-8 */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-6 lg:px-12 py-4 border-b border-stone-200 dark:border-zinc-800/90 bg-[#FBF9F5]/95 dark:bg-[#0C0C0E]/95 backdrop-blur-xs">
        {/* Zone 1: Reading Owl Medallion + Single-line Archive Mine Own Wordmark */}
        <a
          href="#catalog"
          onClick={(e) => {
            e.preventDefault();
            setActiveWorkId(null);
            setActiveTab('catalog');
          }}
          className="flex items-center gap-3 text-2xl font-serif-editorial font-semibold tracking-tight text-stone-900 dark:text-zinc-100 whitespace-nowrap shrink-0"
        >
          <img
            src={`${import.meta.env.BASE_URL}reading-owl-mascot.png`}
            alt="The Reading Owl — 1600s Dutch Mascot"
            className="w-8 h-8 rounded-full border border-amber-500/40 object-cover shrink-0"
          />
          <span>Archive Mine Own</span>
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600 dark:text-zinc-400">
          <button
            onClick={() => {
              setActiveWorkId(null);
              setActiveTab('catalog');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'catalog' && !activeWorkId
                ? 'border-[#E11D48] text-stone-900 dark:text-white'
                : 'border-transparent hover:text-stone-900 dark:hover:text-zinc-100'
            }`}
          >
            Archive Catalog
          </button>
          <button
            onClick={() => {
              setActiveWorkId(null);
              setActiveTab('dashboard');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'dashboard' && !activeWorkId
                ? 'border-[#E11D48] text-stone-900 dark:text-white'
                : 'border-transparent hover:text-stone-900 dark:hover:text-zinc-100'
            }`}
          >
            Reading Dashboard
          </button>
          <button
            onClick={() => {
              setActiveWorkId(null);
              setActiveTab('studio');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'studio' && !activeWorkId
                ? 'border-[#E11D48] text-stone-900 dark:text-white'
                : 'border-transparent hover:text-stone-900 dark:hover:text-zinc-100'
            }`}
          >
            Author Studio
          </button>
          <button
            onClick={() => {
              setActiveWorkId(null);
              setActiveTab('readingRoom');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'readingRoom' && !activeWorkId
                ? 'border-[#E11D48] text-stone-900 dark:text-white'
                : 'border-transparent hover:text-stone-900 dark:hover:text-zinc-100'
            }`}
          >
            Reading Room
          </button>
          <button
            onClick={() => {
              setActiveWorkId(null);
              setActiveTab('scraper');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'scraper' && !activeWorkId
                ? 'border-[#E11D48] text-stone-900 dark:text-white'
                : 'border-transparent hover:text-stone-900 dark:hover:text-zinc-100'
            }`}
          >
            Wayback Scraper
          </button>
        </nav>

        {/* Zone 3: Primary action & PWA install */}
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton />
          {user ? (
            <button
              onClick={() => signOutUser()}
              className="flex items-center gap-1.5 rounded bg-stone-900 dark:bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out ({user.displayName?.split(' ')[0] || 'Reader'})</span>
            </button>
          ) : (
            <button
              onClick={() => signInWithGoogle()}
              className="flex items-center gap-1.5 rounded bg-[#E11D48] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#BE123C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Cloud Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Strip */}
      <div className="flex md:hidden items-center justify-between gap-2 px-4 py-2.5 border-b border-stone-200 dark:border-zinc-800 bg-stone-100/70 dark:bg-zinc-900/60 overflow-x-auto">
        {(
          [
            { id: 'catalog', label: 'Catalog' },
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'studio', label: 'Author Studio' },
            { id: 'readingRoom', label: 'Reading Room' },
            { id: 'scraper', label: 'IA Scraper' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveWorkId(null);
              setActiveTab(item.id);
            }}
            className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === item.id && !activeWorkId
                ? 'bg-[#E11D48] text-white'
                : 'text-stone-600 dark:text-zinc-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Operational Utility Ribbon (Museum & Editorial Pattern A) */}
      <div className="border-b border-stone-200 dark:border-zinc-800/80 bg-[#F4F1EA] dark:bg-[#121216] px-6 lg:px-12 py-2.5">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-stone-600 dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
            <span>Indexed Works: {allWorks.length}</span>
            <span aria-hidden="true">·</span>
            <span>Canonical Tags: {allCanonicalTags.length}</span>
            <span aria-hidden="true">·</span>
            <span>
              Index Mode: {isOnline ? 'Online + Offline Cache Ready' : 'Offline Local Index'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Cloud Sync: {user ? `Active (${user.email})` : 'Local Mode (Sign in to sync)'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {statusBanner && (
              <span className="text-xs font-medium text-[#E11D48] dark:text-rose-400">
                {statusBanner}
              </span>
            )}
            <button
              onClick={() => setIsDark((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Toggle Archival Dark Mode or Warm Paper Mode"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Warm Paper Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-stone-700" />
                  <span>Dark Folio Mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 lg:px-12 py-8">
        {/* ==================== ACTIVE WORK READER VIEW ==================== */}
        {activeWork ? (
          <div className="space-y-8">
            {/* Reader Top Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-stone-200 dark:border-zinc-800">
              <button
                onClick={() => setActiveWorkId(null)}
                className="flex items-center gap-2 text-sm font-medium text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Archive</span>
              </button>

              <div className="flex flex-wrap items-center gap-3">
                {/* Typography Controls */}
                <div className="flex items-center gap-1 rounded border border-stone-200 dark:border-zinc-800 p-1 bg-white/50 dark:bg-zinc-900/60">
                  <button
                    onClick={() => setReaderFontFamily('serif')}
                    className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                      readerFontFamily === 'serif'
                        ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium'
                        : 'text-stone-600 dark:text-zinc-400'
                    }`}
                  >
                    Serif
                  </button>
                  <button
                    onClick={() => setReaderFontFamily('sans')}
                    className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                      readerFontFamily === 'sans'
                        ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium'
                        : 'text-stone-600 dark:text-zinc-400'
                    }`}
                  >
                    Sans
                  </button>
                  <span className="text-stone-300 dark:text-zinc-700 px-1">|</span>
                  {(['sm', 'base', 'lg'] as const).map((sz) => (
                    <button
                      key={sz}
                      onClick={() => setReaderFontSize(sz)}
                      className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
                        readerFontSize === sz
                          ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium'
                          : 'text-stone-600 dark:text-zinc-400'
                      }`}
                    >
                      {sz === 'sm' ? 'A-' : sz === 'base' ? 'A' : 'A+'}
                    </button>
                  ))}
                </div>

                {/* Reading Mode Toggle (Chapter by Chapter vs Entire Work) */}
                {activeChapters && activeChapters.length > 1 && (
                  <div className="flex items-center gap-1 rounded border border-stone-200 dark:border-zinc-800 p-1 bg-white/50 dark:bg-zinc-900/60">
                    <button
                      onClick={() => setReaderViewMode('chapter')}
                      className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                        readerViewMode === 'chapter'
                          ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium'
                          : 'text-stone-600 dark:text-zinc-400'
                      }`}
                    >
                      Chapter by Chapter
                    </button>
                    <button
                      onClick={() => setReaderViewMode('entire')}
                      className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                        readerViewMode === 'entire'
                          ? 'bg-[#E11D48] text-white font-medium'
                          : 'text-stone-600 dark:text-zinc-400'
                      }`}
                    >
                      Entire Work ({activeChapters.length})
                    </button>
                  </div>
                )}

                {isRealArchiveOrgIdentifier(activeWork.sourceArchiveId) && (
                  <button
                    onClick={() => handleFetchFullTextFromIa(activeWork)}
                    disabled={loadingFullTextId === activeWork.id}
                    className="flex items-center gap-1.5 rounded border border-stone-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        loadingFullTextId === activeWork.id ? 'animate-spin' : ''
                      }`}
                    />
                    <span>
                      {loadingFullTextId === activeWork.id
                        ? 'Streaming Full Text...'
                        : 'Stream Full Text (archive.org)'}
                    </span>
                  </button>
                )}

                <button
                  onClick={() => handleGiveKudos(activeWork)}
                  className="flex items-center gap-1.5 rounded border border-stone-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors cursor-pointer"
                >
                  <Heart className="w-3.5 h-3.5 text-[#E11D48]" />
                  <span>Kudos ({activeWork.kudosCount.toLocaleString()})</span>
                </button>

                <button
                  onClick={() =>
                    handleUpsertBookmark(activeWork, {
                      currentChapter:
                        readerViewMode === 'entire' && activeChapters
                          ? activeChapters.length
                          : safeChapterIndex + 1,
                      progressPercent:
                        readerViewMode === 'entire'
                          ? 100
                          : Math.min(
                              100,
                              Math.round(
                                ((safeChapterIndex + 1) /
                                  Math.max(1, activeChapters?.length || activeWork.chapterCount)) *
                                  100
                              )
                            ),
                    })
                  }
                  className="flex items-center gap-1.5 rounded bg-[#E11D48] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#BE123C] transition-colors cursor-pointer"
                >
                  <BookmarkIcon className="w-3.5 h-3.5" />
                  <span>Bookmark & Sync Progress</span>
                </button>
              </div>
            </div>

            {/* Asymmetric Two-Column Reading Canvas (70% Narrative / 30% Archival Metadata & Feedback) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
              {/* Left/Center Main Narrative Column */}
              <article className="lg:col-span-8 space-y-8">
                {/* Editorial Monograph Header */}
                <div className="space-y-4 pb-8 border-b border-stone-200 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-stone-500 dark:text-zinc-400">
                    <span>{activeWork.fandom}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeWork.rating}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeWork.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeWork.status}</span>
                  </div>

                  <h1 className="text-3xl lg:text-5xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-50 leading-tight text-balance">
                    {activeWork.title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600 dark:text-zinc-400">
                    <span>By {activeWork.authorName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {activeWork.wordCount.toLocaleString()} words
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {activeWork.chapterCount}/{activeWork.totalChapters || '?'} chapters
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Archived {activeWork.archiveDate}</span>
                  </div>

                  {/* Unboxed Tags List */}
                  <div className="pt-2 text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
                    <span className="font-medium text-stone-700 dark:text-zinc-300">Tags: </span>
                    {activeWork.tags.map((t, i) => (
                      <React.Fragment key={t}>
                        {i > 0 && <span className="mx-1.5 text-stone-400">·</span>}
                        <span>{t}</span>
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Summary Abstract */}
                  <div className="pt-4 mt-4 border-t border-stone-200/70 dark:border-zinc-800/70">
                    <p className="text-sm italic text-stone-600 dark:text-zinc-300 leading-relaxed max-w-2xl">
                      {activeWork.summary}
                    </p>
                  </div>
                </div>

                {/* Live Streaming Notice while retrieving unabridged archive.org manuscript */}
                {loadingFullTextId === activeWork.id && (
                  <div className="max-w-2xl flex items-center gap-3 rounded border border-stone-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/70 px-4 py-3 text-xs text-stone-700 dark:text-zinc-300">
                    <RefreshCw className="w-4 h-4 text-[#E11D48] animate-spin shrink-0" />
                    <span>
                      Streaming unabridged archival manuscript (HTML / Text / EPUB) from archive.org into offline cache...
                    </span>
                  </div>
                )}

                {/* Chapter Navigation Switcher if multi-chapter in chapter mode */}
                {activeChapters && activeChapters.length > 1 && readerViewMode === 'chapter' && (
                  <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-b border-stone-200 dark:border-zinc-800">
                    {activeChapters.length <= 12 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {activeChapters.map((ch, idx) => (
                          <button
                            key={ch.number}
                            onClick={() => {
                              setActiveChapterIndex(idx);
                              handleUpsertBookmark(activeWork, {
                                currentChapter: idx + 1,
                                progressPercent: Math.round(
                                  ((idx + 1) / activeChapters.length) * 100
                                ),
                              });
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                              safeChapterIndex === idx
                                ? 'bg-[#E11D48] text-white'
                                : 'bg-stone-200/70 dark:bg-zinc-800/80 text-stone-700 dark:text-zinc-300 hover:bg-stone-300 dark:hover:bg-zinc-700'
                            }`}
                          >
                            {ch.title}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3 w-full">
                        <label className="text-xs font-medium text-stone-600 dark:text-zinc-400">
                          Jump to Chapter ({activeChapters.length} total):
                        </label>
                        <select
                          value={safeChapterIndex}
                          onChange={(e) => {
                            const idx = Number(e.target.value);
                            setActiveChapterIndex(idx);
                            handleUpsertBookmark(activeWork, {
                              currentChapter: idx + 1,
                              progressPercent: Math.round(
                                ((idx + 1) / activeChapters.length) * 100
                              ),
                            });
                          }}
                          className="rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-stone-900 dark:text-zinc-100 max-w-xs"
                        >
                          {activeChapters.map((ch, idx) => (
                            <option key={ch.number} value={idx}>
                              {idx + 1}. {ch.title} ({ch.wordCount.toLocaleString()} words)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {readerViewMode === 'entire' && activeChapters && activeChapters.length > 1 ? (
                  /* ==================== ENTIRE WORK CONTINUOUS READER ==================== */
                  <div className="space-y-14">
                    {activeChapters.map((ch, chIdx) => (
                      <section
                        key={ch.number}
                        className={
                          chIdx > 0
                            ? 'pt-10 border-t border-stone-200 dark:border-zinc-800 space-y-6'
                            : 'space-y-6'
                        }
                      >
                        <div className="max-w-2xl space-y-2">
                          <div className="text-xs font-mono-tabular uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                            Chapter {chIdx + 1} of {activeChapters.length} ·{' '}
                            {ch.wordCount.toLocaleString()} words
                          </div>
                          <h2 className="text-2xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                            {ch.title}
                          </h2>
                          {ch.notes && (
                            <p className="text-xs italic text-stone-600 dark:text-zinc-400 leading-relaxed pt-1 pb-2 border-b border-stone-200/60 dark:border-zinc-800/60">
                              {ch.notes}
                            </p>
                          )}
                        </div>

                        <div
                          className={`max-w-2xl space-y-6 leading-relaxed text-stone-800 dark:text-zinc-200 ${
                            readerFontFamily === 'serif' ? 'font-serif-editorial' : 'font-sans'
                          } ${
                            readerFontSize === 'sm'
                              ? 'text-base leading-relaxed'
                              : readerFontSize === 'base'
                              ? 'text-lg leading-loose'
                              : 'text-xl leading-loose'
                          }`}
                        >
                          {ch.content.split('\n\n').map((para, pIdx) => (
                            <p
                              key={pIdx}
                              className={
                                pIdx === 0
                                  ? 'first-letter:text-5xl first-letter:font-serif-editorial first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-[#E11D48]'
                                  : ''
                              }
                            >
                              {para}
                            </p>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  /* ==================== CHAPTER-BY-CHAPTER READER ==================== */
                  <>
                    {/* Active Chapter Heading & Author Notes */}
                    {activeChapter && (
                      <div className="max-w-2xl space-y-2 pt-1">
                        <div className="text-xs font-mono-tabular uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                          Chapter {safeChapterIndex + 1} of {activeChapters!.length}
                        </div>
                        <h2 className="text-2xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                          {activeChapter.title}
                        </h2>
                        {activeChapter.notes && (
                          <p className="text-xs italic text-stone-600 dark:text-zinc-400 leading-relaxed pt-1 pb-2 border-b border-stone-200/60 dark:border-zinc-800/60">
                            {activeChapter.notes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Main Prose Body constrained to comfortable 65-72ch reading measure */}
                    <div
                      className={`max-w-2xl space-y-6 leading-relaxed text-stone-800 dark:text-zinc-200 ${
                        readerFontFamily === 'serif' ? 'font-serif-editorial' : 'font-sans'
                      } ${
                        readerFontSize === 'sm'
                          ? 'text-base leading-relaxed'
                          : readerFontSize === 'base'
                          ? 'text-lg leading-loose'
                          : 'text-xl leading-loose'
                      }`}
                    >
                      {(activeChapter?.content || activeWork.content)
                        .split('\n\n')
                        .map((para, pIdx) => (
                          <p
                            key={pIdx}
                            className={
                              pIdx === 0
                                ? 'first-letter:text-5xl first-letter:font-serif-editorial first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-[#E11D48]'
                                : ''
                            }
                          >
                            {para}
                          </p>
                        ))}
                    </div>

                    {/* Bottom Previous / Next Chapter Pagination Controls */}
                    {activeChapters && activeChapters.length > 1 && (
                      <div className="max-w-2xl pt-8 mt-8 border-t border-stone-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4">
                        <button
                          onClick={() => {
                            const prevIdx = Math.max(0, safeChapterIndex - 1);
                            setActiveChapterIndex(prevIdx);
                            handleUpsertBookmark(activeWork, {
                              currentChapter: prevIdx + 1,
                              progressPercent: Math.round(
                                ((prevIdx + 1) / activeChapters.length) * 100
                              ),
                            });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          disabled={safeChapterIndex === 0}
                          className="flex items-center gap-1.5 rounded border border-stone-300 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:border-[#E11D48] hover:text-[#E11D48] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>Previous Chapter</span>
                        </button>

                        <button
                          onClick={() => {
                            setReaderViewMode('entire');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-xs font-mono-tabular text-stone-500 dark:text-zinc-400 hover:text-[#E11D48] transition-colors cursor-pointer"
                        >
                          Chapter {safeChapterIndex + 1} / {activeChapters.length} · View Entire Work
                        </button>

                        <button
                          onClick={() => {
                            const nextIdx = Math.min(activeChapters.length - 1, safeChapterIndex + 1);
                            setActiveChapterIndex(nextIdx);
                            handleUpsertBookmark(activeWork, {
                              currentChapter: nextIdx + 1,
                              progressPercent: Math.round(
                                ((nextIdx + 1) / activeChapters.length) * 100
                              ),
                            });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          disabled={safeChapterIndex >= activeChapters.length - 1}
                          className="flex items-center gap-1.5 rounded bg-[#E11D48] px-4 py-2 text-xs font-medium text-white hover:bg-[#BE123C] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <span>Next Chapter</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
                {/* Reading Room Marginalia & Public Bookmark Notes (Appended on Traded Editions) */}
                {activeWork.sharedAnnotations && activeWork.sharedAnnotations.length > 0 && (
                  <section className="max-w-2xl pt-8 mt-8 border-t border-stone-200 dark:border-zinc-800 space-y-4">
                    <div className="flex items-center gap-2">
                      <Feather className="w-4 h-4 text-[#E11D48]" />
                      <h3 className="text-lg font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                        Reading Room Marginalia &amp; Public Bookmark Notes ({activeWork.sharedAnnotations.length})
                      </h3>
                    </div>
                    <div className="divide-y divide-stone-200/80 dark:divide-zinc-800/80 rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/40 dark:bg-[#121216] px-5">
                      {activeWork.sharedAnnotations.map((ann, idx) => (
                        <div key={`${ann.readerFingerprint}-${idx}`} className="py-4 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 dark:text-zinc-400">
                            <span className="font-medium text-stone-900 dark:text-zinc-100">
                              {ann.readerName}
                            </span>
                            <span className="font-mono-tabular">
                              {ann.readerFingerprint} · {ann.readingStatus} · {ann.annotatedAtIso}
                            </span>
                          </div>
                          {ann.note && (
                            <p className="text-sm italic text-stone-700 dark:text-zinc-200 leading-relaxed">
                              “{ann.note}”
                            </p>
                          )}
                          {ann.userTags.length > 0 && (
                            <p className="text-xs text-stone-500 dark:text-zinc-400">
                              Bookmark Tags: {ann.userTags.join(' · ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </article>

              {/* Right Margin Rail: Provenance, Public Bookmark Notes & Direct Reader Feedback */}
              <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
                {/* Accession Metadata Box */}
                <div className="rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/60 dark:bg-[#121216] p-5 space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-900 dark:text-zinc-100">
                    Archival Provenance
                  </h3>
                  <dl className="space-y-2.5 text-xs border-t border-stone-200 dark:border-zinc-800 pt-3">
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500 dark:text-zinc-400">Source ID</dt>
                      <dd className="font-mono-tabular text-stone-800 dark:text-zinc-200 truncate max-w-[180px]">
                        {activeWork.sourceArchiveId}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500 dark:text-zinc-400">Word Count</dt>
                      <dd className="font-mono-tabular text-stone-800 dark:text-zinc-200">
                        {activeWork.wordCount.toLocaleString()}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500 dark:text-zinc-400">Kudos / Bookmarks</dt>
                      <dd className="font-mono-tabular text-stone-800 dark:text-zinc-200">
                        {activeWork.kudosCount.toLocaleString()} /{' '}
                        {activeWork.bookmarksCount.toLocaleString()}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500 dark:text-zinc-400">Offline Availability</dt>
                      <dd className="text-emerald-700 dark:text-emerald-400 font-medium">
                        Cached Locally
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Personal Bookmark Note & Public Reading Room Edition Toggle */}
                <div className="rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/60 dark:bg-[#121216] p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                      <Feather className="w-4 h-4 text-[#E11D48]" />
                      <span>Bookmark Marginalia Note</span>
                    </h3>
                    {activeWorkBookmark?.isPublicNote && (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        <span>Public</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
                    Annotate this work on your bookmark. Mark it public to append your note when trading copies in the Reading Room.
                  </p>
                  <textarea
                    rows={2}
                    key={`${activeWork.id}-${activeWorkBookmark?.personalNotes || ''}`}
                    defaultValue={activeWorkBookmark?.personalNotes || ''}
                    disabled={activeWorkBookmark?.readingStatus === 'Archived'}
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (val !== (activeWorkBookmark?.personalNotes || '')) {
                        void handleUpsertBookmark(activeWork, {
                          personalNotes: val,
                          currentChapter: safeChapterIndex + 1,
                        });
                      }
                    }}
                    placeholder="Write a margin note or favorite quote (saves on blur)..."
                    className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-3 py-2 text-xs text-stone-900 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    disabled={activeWorkBookmark?.readingStatus === 'Archived'}
                    onClick={() =>
                      handleUpsertBookmark(activeWork, {
                        isPublicNote: !(activeWorkBookmark?.isPublicNote ?? false),
                        currentChapter: safeChapterIndex + 1,
                      })
                    }
                    className={`w-full flex items-center justify-center gap-2 rounded border py-1.5 px-3 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                      activeWorkBookmark?.isPublicNote
                        ? 'border-emerald-600/60 bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
                        : 'border-stone-300 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 hover:border-[#E11D48]'
                    }`}
                  >
                    {activeWorkBookmark?.isPublicNote ? (
                      <>
                        <Globe className="w-3.5 h-3.5" />
                        <span>Public in Reading Room (Click to Make Private)</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Private Note (Click to Append in Reading Room)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Direct Reader Feedback Submission Box */}
                <div className="rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/60 dark:bg-[#121216] p-5 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                      Direct Reader Feedback
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-zinc-400">
                      Contribute structured analytical ratings and chapter reactions for the author’s studio dashboard.
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                        Craft Dimension
                      </label>
                      <select
                        value={fbDimension}
                        onChange={(e) => setFbDimension(e.target.value as FeedbackDimension)}
                        className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-3 py-1.5 text-xs text-stone-900 dark:text-zinc-100"
                      >
                        {FEEDBACK_DIMENSIONS.map((dim) => (
                          <option key={dim} value={dim}>
                            {dim}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                        Dimension Rating (1–5)
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setFbScore(num)}
                            className={`flex-1 py-1.5 text-xs font-mono-tabular rounded border transition-colors cursor-pointer ${
                              fbScore >= num
                                ? 'border-[#E11D48] bg-[#E11D48]/15 text-[#E11D48] font-semibold'
                                : 'border-stone-300 dark:border-zinc-700 text-stone-500'
                            }`}
                          >
                            {num} ★
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                        Chapter Reaction Note
                      </label>
                      <textarea
                        rows={3}
                        value={fbComment}
                        onChange={(e) => setFbComment(e.target.value)}
                        placeholder="Share specific lines, pacing observations, or character notes..."
                        className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-3 py-2 text-xs text-stone-900 dark:text-zinc-100"
                      />
                    </div>

                    <button
                      onClick={() => handleSubmitReaderFeedback(activeWork)}
                      className="w-full rounded bg-stone-900 dark:bg-zinc-100 py-2 px-4 text-xs font-medium text-white dark:text-zinc-900 hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Submit Feedback to Author Analytics
                    </button>
                  </div>

                  {/* Recent Reader Notes on this work */}
                  {activeFeedbackList.length > 0 && (
                    <div className="pt-4 border-t border-stone-200 dark:border-zinc-800 space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                        Recent Reader Notes ({activeFeedbackList.length})
                      </h4>
                      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                        {activeFeedbackList.map((fb) => (
                          <div
                            key={fb.id}
                            className="text-xs space-y-1 pb-2.5 border-b border-stone-200/60 dark:border-zinc-800/60 last:border-none"
                          >
                            <div className="flex items-center justify-between text-stone-500 dark:text-zinc-400">
                              <span className="font-medium text-stone-800 dark:text-zinc-200">
                                {fb.readerName}
                              </span>
                              <span className="font-mono-tabular">
                                {fb.dimension} · {fb.score}/5
                              </span>
                            </div>
                            <p className="text-stone-600 dark:text-zinc-300 leading-relaxed">
                              {fb.comment}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        ) : (
          <>
            {/* ==================== 1. ARCHIVE CATALOG & OFFLINE TAG FILTERING ==================== */}
            {activeTab === 'catalog' && (
              <div className="space-y-10">
                {/* Editorial Hero Banner with Dutch 1600s Reading Owl Mascot */}
                <section className="pb-8 border-b border-stone-200 dark:border-zinc-800">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                    <div className="lg:col-span-8 flex flex-col sm:flex-row sm:items-center gap-6">
                      <img
                        src={`${import.meta.env.BASE_URL}reading-owl-mascot.png`}
                        alt="1600s Dutch Drawing of The Reading Owl — Mascot of Archive Mine Own"
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-amber-500/40 object-cover shrink-0 shadow-lg"
                      />
                      <div className="space-y-2.5">
                        <p className="text-xs uppercase tracking-widest text-[#E11D48] font-medium">
                          Archive Mine Own · space, time, and resources to create
                        </p>
                        <h1 className="text-4xl lg:text-5xl font-serif-editorial font-semibold tracking-tight text-stone-900 dark:text-zinc-50 text-balance">
                          Personal Transformative Works &amp; Offline Tag Index
                        </h1>
                        <p className="text-sm lg:text-base text-stone-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
                          Preserve stories locally, filter offline across canonical tropes, and trade unique signed Reading Room editions stamped with your public bookmark notes.
                        </p>
                      </div>
                    </div>
                    <div className="lg:col-span-4 flex flex-wrap lg:justify-end gap-3">
                      <PWAInstallButton variant="prominent" />
                      <button
                        onClick={() => handleRunScraper('')}
                        disabled={isScraping}
                        className="flex items-center gap-2 rounded border border-stone-300 dark:border-zinc-700 px-4 py-2 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isScraping ? 'animate-spin' : ''}`} />
                        <span>
                          {isScraping ? 'Scraping archive.org...' : 'Sync Internet Archive'}
                        </span>
                      </button>
                      <button
                        onClick={() => setActiveTab('studio')}
                        className="flex items-center gap-2 rounded border border-stone-300 dark:border-zinc-700 px-4 py-2 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>New Manuscript</span>
                      </button>
                    </div>
                  </div>
                </section>

                {/* Main Catalog Split: 4-Col Offline Filter Sidebar / 8-Col Work List */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                  {/* Offline Tag Filtering Sidebar */}
                  <aside className="lg:col-span-4 space-y-6 rounded-lg border border-stone-200 dark:border-zinc-800/90 bg-white/50 dark:bg-[#121216] p-5">
                    <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-[#E11D48]" />
                        <h2 className="text-base font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                          Offline Tag & Metadata Filter
                        </h2>
                      </div>
                      <button
                        onClick={resetAllFilters}
                        className="flex items-center gap-1 text-xs text-stone-500 hover:text-[#E11D48] transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    </div>

                    {/* Keyword / Archive ID Search */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300">
                        Search Title, Author, Tag, or Archive ID
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="e.g. Sherlock, Slow Burn, 1978..."
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 pl-8 pr-3 py-1.5 text-xs text-stone-900 dark:text-zinc-100 focus:outline-none focus:border-[#E11D48]"
                        />
                      </div>
                    </div>

                    {/* Include / Exclude Canonical Tags Matrix */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-stone-700 dark:text-zinc-300">
                          Canonical Tags (Click: +Include / −Exclude)
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto pr-1 pt-1">
                        {allCanonicalTags.map(([tag, count]) => {
                          const isIncluded = includedTags.includes(tag);
                          const isExcluded = excludedTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleToggleTagState(tag)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                                isIncluded
                                  ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200 font-medium'
                                  : isExcluded
                                  ? 'bg-rose-950/90 border-rose-500/60 text-rose-200 line-through'
                                  : 'bg-stone-100 dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:border-stone-400 dark:hover:border-zinc-600'
                              }`}
                            >
                              {isIncluded && <Plus className="w-3 h-3 text-emerald-400" />}
                              {isExcluded && <Minus className="w-3 h-3 text-rose-400" />}
                              <span>{tag}</span>
                              <span className="text-[10px] opacity-60 font-mono-tabular">
                                ({count})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Fandom Selector */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300">
                        Fandom Archive
                      </label>
                      <select
                        value={selectedFandom}
                        onChange={(e) => setSelectedFandom(e.target.value)}
                        className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-3 py-1.5 text-xs text-stone-900 dark:text-zinc-100"
                      >
                        <option value="All">All Fandoms ({allWorks.length})</option>
                        {allFandoms.map(([fandom, count]) => (
                          <option key={fandom} value={fandom}>
                            {fandom} ({count})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Category & Status Filters */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Category
                        </label>
                        <select
                          value={selectedCategory}
                          onChange={(e) => setSelectedCategory(e.target.value)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-900 dark:text-zinc-100"
                        >
                          <option value="All">All Categories</option>
                          {CATEGORIES_LIST.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Status
                        </label>
                        <select
                          value={selectedStatus}
                          onChange={(e) => setSelectedStatus(e.target.value)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-900 dark:text-zinc-100"
                        >
                          <option value="All">All Statuses</option>
                          <option value="Completed">Completed</option>
                          <option value="In Progress">In Progress</option>
                        </select>
                      </div>
                    </div>

                    {/* Rating & Word Count Range */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Rating
                        </label>
                        <select
                          value={selectedRating}
                          onChange={(e) => setSelectedRating(e.target.value)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-900 dark:text-zinc-100"
                        >
                          <option value="All">All Ratings</option>
                          {RATINGS_LIST.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Word Count
                        </label>
                        <select
                          value={wordCountRange}
                          onChange={(e) =>
                            setWordCountRange(
                              e.target.value as 'all' | 'short' | 'medium' | 'long'
                            )
                          }
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-900 dark:text-zinc-100"
                        >
                          <option value="all">Any Length</option>
                          <option value="short">&lt; 15,000 words</option>
                          <option value="medium">15,000 – 30,000 words</option>
                          <option value="long">&gt; 30,000 words</option>
                        </select>
                      </div>
                    </div>

                    {/* Offline Filter Presets */}
                    <div className="pt-3 border-t border-stone-200 dark:border-zinc-800 space-y-2.5">
                      <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300">
                        Saved Offline Filter Presets
                      </label>
                      <div className="space-y-1.5">
                        {filterPresets.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => applyFilterPreset(preset)}
                            className="w-full flex items-center justify-between px-3 py-1.5 rounded text-xs bg-stone-100 dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300 transition-colors cursor-pointer"
                          >
                            <span className="truncate">{preset.name}</span>
                            <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                          placeholder="Preset name..."
                          className="flex-1 rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1 text-xs"
                        />
                        <button
                          onClick={handleSaveFilterPreset}
                          className="rounded bg-stone-900 dark:bg-zinc-100 px-3 py-1 text-xs font-medium text-white dark:text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Save Preset
                        </button>
                      </div>
                    </div>
                  </aside>

                  {/* Right 8 Columns: Work Results List */}
                  <section className="lg:col-span-8 space-y-6">
                    {/* Results Sort & Active Filter Summary */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-zinc-800">
                      <div className="text-sm text-stone-600 dark:text-zinc-400">
                        Showing{' '}
                        <span className="font-mono-tabular font-semibold text-stone-900 dark:text-white">
                          {filteredWorks.length}
                        </span>{' '}
                        of {allWorks.length} indexed works
                        {(includedTags.length > 0 || excludedTags.length > 0) && (
                          <span className="ml-2 text-xs text-[#E11D48]">
                            ({includedTags.length} included, {excludedTags.length} excluded)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500 dark:text-zinc-400">Sort by:</span>
                        {(['kudos', 'words', 'hits', 'bookmarks', 'date'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setSortBy(s)}
                            className={`px-2.5 py-1 text-xs rounded transition-colors capitalize whitespace-nowrap shrink-0 cursor-pointer ${
                              sortBy === s
                                ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium'
                                : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Catalog Work Entries (Zero-Pill Metadata Discipline: Unboxed Text with · Separators) */}
                    {filteredWorks.length === 0 ? (
                      <div className="rounded-lg border border-stone-200 dark:border-zinc-800 p-12 text-center space-y-3">
                        <p className="text-lg font-serif-editorial text-stone-800 dark:text-zinc-200">
                          No works match your current tag inclusion/exclusion constraints.
                        </p>
                        <button
                          onClick={resetAllFilters}
                          className="rounded bg-[#E11D48] px-4 py-2 text-xs font-medium text-white cursor-pointer"
                        >
                          Clear All Tag Filters
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-stone-200 dark:divide-zinc-800/90">
                        {filteredWorks.map((work) => {
                          const bookmarked = activeBookmarks.find(
                            (b) => b.ficSlug === sanitizeId(work.id)
                          );
                          return (
                            <article
                              key={work.id}
                              className="py-7 first:pt-2 space-y-3.5 transition-colors"
                            >
                              {/* Quiet 1-line unboxed text kicker */}
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 dark:text-zinc-400">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-stone-700 dark:text-zinc-300">
                                    {work.fandom}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{work.rating}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{work.category}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{work.status}</span>
                                </div>
                                <span className="font-mono-tabular text-[11px] text-stone-400 dark:text-zinc-500">
                                  Ref: {work.sourceArchiveId} · {work.archiveDate}
                                </span>
                              </div>

                              {/* Title & Author */}
                              <div className="space-y-1">
                                <h3 className="text-2xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                                  <button
                                    onClick={() => {
                                      setActiveChapterIndex(0);
                                      setActiveWorkId(work.id);
                                    }}
                                    className="text-left hover:text-[#E11D48] dark:hover:text-rose-400 transition-colors cursor-pointer"
                                  >
                                    {work.title}
                                  </button>
                                </h3>
                                <p className="text-xs text-stone-600 dark:text-zinc-400">
                                  by <span className="font-medium">{work.authorName}</span>
                                  {work.relationships && work.relationships.length > 0 && (
                                    <>
                                      <span className="mx-1.5">·</span>
                                      <span>{work.relationships.join(', ')}</span>
                                    </>
                                  )}
                                </p>
                              </div>

                              {/* Summary */}
                              <p className="text-sm text-stone-700 dark:text-zinc-300 leading-relaxed max-w-3xl">
                                {work.summary}
                              </p>

                              {/* Unboxed Canonical Tags with · separators */}
                              <div className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
                                {work.tags.map((tag, idx) => (
                                  <React.Fragment key={tag}>
                                    {idx > 0 && (
                                      <span aria-hidden="true" className="mx-1.5">
                                        ·
                                      </span>
                                    )}
                                    <button
                                      onClick={() => handleToggleTagState(tag)}
                                      className="hover:text-[#E11D48] dark:hover:text-rose-400 underline-offset-2 hover:underline cursor-pointer"
                                      title="Click to filter by this tag"
                                    >
                                      {tag}
                                    </button>
                                  </React.Fragment>
                                ))}
                              </div>

                              {/* Bottom Metrics Row & Actions */}
                              <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-3 text-xs font-mono-tabular text-stone-500 dark:text-zinc-400">
                                  <span>Words: {work.wordCount.toLocaleString()}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    Chapters: {work.chapterCount}/{work.totalChapters || '?'}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>Kudos: {work.kudosCount.toLocaleString()}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>Bookmarks: {work.bookmarksCount.toLocaleString()}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>Hits: {work.hitsCount.toLocaleString()}</span>
                                  {work.sharedAnnotations && work.sharedAnnotations.length > 0 && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-[#E11D48] font-medium">
                                        Marginalia Notes: {work.sharedAnnotations.length}
                                      </span>
                                    </>
                                  )}
                                </div>

                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => handleUpsertBookmark(work)}
                                    className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                                      bookmarked
                                        ? 'border-emerald-600/50 bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                                        : 'border-stone-300 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 hover:border-[#E11D48] hover:text-[#E11D48]'
                                    }`}
                                  >
                                    <BookmarkIcon className="w-3.5 h-3.5" />
                                    <span>
                                      {bookmarked
                                        ? `Tracked (${bookmarked.progressPercent}%)`
                                        : 'Track & Bookmark'}
                                    </span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setActiveChapterIndex(0);
                                      setActiveWorkId(work.id);
                                    }}
                                    className="flex items-center gap-1.5 rounded bg-stone-900 dark:bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <BookOpen className="w-3.5 h-3.5" />
                                    <span>Read Folio</span>
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}

            {/* ==================== 2. PERSONALIZED READING DASHBOARD & CLOUD BOOKMARKS ==================== */}
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                {/* Dashboard Header */}
                <div className="flex flex-wrap items-end justify-between gap-6 pb-6 border-b border-stone-200 dark:border-zinc-800">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-[#E11D48] font-medium">
                      Cross-Device Cloud Synchronization
                    </p>
                    <h1 className="text-3xl lg:text-4xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-50">
                      Personalized Reading Dashboard & Bookmarks
                    </h1>
                    <p className="text-sm text-stone-600 dark:text-zinc-400 max-w-2xl">
                      Track ongoing chapter progress, completion percentages, and personal reading notes across all your devices.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSyncLocalBookmarksToCloud}
                      className="flex items-center gap-2 rounded bg-[#E11D48] px-4 py-2 text-xs font-medium text-white hover:bg-[#BE123C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>
                        {user
                          ? 'Sync Local Bookmarks to Cloud'
                          : 'Sign In to Enable Cloud Sync'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Summary Metrics Strip */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-6 border-b border-stone-200 dark:border-zinc-800">
                  <div>
                    <p className="text-xs text-stone-500 dark:text-zinc-400">Tracked Works</p>
                    <p className="text-2xl font-mono-tabular font-semibold text-stone-900 dark:text-white mt-1">
                      {activeBookmarks.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500 dark:text-zinc-400">Currently Reading</p>
                    <p className="text-2xl font-mono-tabular font-semibold text-stone-900 dark:text-white mt-1">
                      {activeBookmarks.filter((b) => b.readingStatus === 'Reading').length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500 dark:text-zinc-400">Completed Works</p>
                    <p className="text-2xl font-mono-tabular font-semibold text-stone-900 dark:text-white mt-1">
                      {activeBookmarks.filter((b) => b.readingStatus === 'Completed').length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500 dark:text-zinc-400">Sync State</p>
                    <p className="text-sm font-medium text-stone-900 dark:text-white mt-2">
                      {user ? 'Firestore Real-Time Sync' : 'Offline Local Storage'}
                    </p>
                  </div>
                </div>

                {/* Interactive Shelf Filter Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    ['All', 'Reading', 'Marked for Later', 'Completed', 'Favorites'] as const
                  ).map((shelf) => (
                    <button
                      key={shelf}
                      onClick={() => setDashboardFilter(shelf)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        dashboardFilter === shelf
                          ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'bg-stone-200/70 dark:bg-zinc-900 text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white'
                      }`}
                    >
                      {shelf}
                    </button>
                  ))}
                </div>

                {/* Bookmarks List */}
                {filteredBookmarks.length === 0 ? (
                  <div className="rounded-lg border border-stone-200 dark:border-zinc-800 p-12 text-center space-y-3">
                    <p className="text-lg font-serif-editorial text-stone-700 dark:text-zinc-300">
                      No bookmarked works on this shelf yet.
                    </p>
                    <button
                      onClick={() => setActiveTab('catalog')}
                      className="rounded bg-[#E11D48] px-4 py-2 text-xs font-medium text-white cursor-pointer"
                    >
                      Browse Archive Catalog
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-200 dark:divide-zinc-800">
                    {filteredBookmarks.map((bm) => {
                      const matchedWork =
                        allWorks.find((w) => sanitizeId(w.id) === bm.ficSlug) ||
                        allWorks[0];
                      const isLocked = bm.readingStatus === 'Archived';

                      return (
                        <div key={bm.id} className="py-6 space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-zinc-400">
                                <span>{bm.ficFandom}</span>
                                <span aria-hidden="true">·</span>
                                <span>Status: {bm.readingStatus}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular">
                                  Updated {bm.updatedAtIso}
                                </span>
                              </div>
                              <h3 className="text-xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                                <button
                                  onClick={() => {
                                    setActiveChapterIndex(Math.max(0, bm.currentChapter - 1));
                                    setActiveWorkId(matchedWork.id);
                                  }}
                                  className="hover:text-[#E11D48] transition-colors cursor-pointer text-left"
                                >
                                  {bm.ficTitle}
                                </button>
                              </h3>
                              <p className="text-xs text-stone-600 dark:text-zinc-400">
                                by {bm.ficAuthor}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  handleUpsertBookmark(matchedWork, {
                                    isFavorite: !bm.isFavorite,
                                  })
                                }
                                disabled={isLocked}
                                className={`px-2.5 py-1.5 rounded border text-xs flex items-center gap-1 cursor-pointer ${
                                  bm.isFavorite
                                    ? 'border-amber-500/60 text-amber-500 bg-amber-500/10'
                                    : 'border-stone-300 dark:border-zinc-700 text-stone-500'
                                }`}
                              >
                                <Star className="w-3.5 h-3.5" />
                                <span>{bm.isFavorite ? 'Pinned' : 'Pin'}</span>
                              </button>

                              <button
                                onClick={() => {
                                  setActiveChapterIndex(Math.max(0, bm.currentChapter - 1));
                                  setActiveWorkId(matchedWork.id);
                                }}
                                className="rounded bg-stone-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 cursor-pointer"
                              >
                                Resume Ch. {bm.currentChapter}
                              </button>

                              <button
                                onClick={() => handleDeleteBookmark(bm)}
                                className="p-1.5 text-stone-400 hover:text-rose-500 transition-colors cursor-pointer"
                                title="Delete bookmark"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Reading Progress Bar & Controls */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-1">
                            <div className="md:col-span-5 space-y-1.5">
                              <div className="flex justify-between text-xs font-mono-tabular">
                                <span>
                                  Chapter {bm.currentChapter} of {bm.totalChapters}
                                </span>
                                <span>{bm.progressPercent}% Complete</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-stone-200 dark:bg-zinc-800 overflow-hidden">
                                <div
                                  className="h-full bg-[#E11D48] transition-all duration-150"
                                  style={{ width: `${bm.progressPercent}%` }}
                                />
                              </div>
                            </div>

                            <div className="md:col-span-7 flex flex-wrap items-center gap-2">
                              <button
                                disabled={isLocked || bm.currentChapter <= 1}
                                onClick={() => {
                                  const nextCh = Math.max(1, bm.currentChapter - 1);
                                  handleUpsertBookmark(matchedWork, {
                                    currentChapter: nextCh,
                                    progressPercent: Math.round(
                                      (nextCh / Math.max(1, bm.totalChapters)) * 100
                                    ),
                                  });
                                }}
                                className="px-2.5 py-1 rounded border border-stone-300 dark:border-zinc-700 text-xs disabled:opacity-40 cursor-pointer"
                              >
                                − Ch
                              </button>
                              <button
                                disabled={isLocked || bm.currentChapter >= bm.totalChapters}
                                onClick={() => {
                                  const nextCh = Math.min(
                                    bm.totalChapters,
                                    bm.currentChapter + 1
                                  );
                                  const pct = Math.round(
                                    (nextCh / Math.max(1, bm.totalChapters)) * 100
                                  );
                                  handleUpsertBookmark(matchedWork, {
                                    currentChapter: nextCh,
                                    progressPercent: pct,
                                    readingStatus:
                                      pct >= 100 ? 'Completed' : bm.readingStatus,
                                  });
                                }}
                                className="px-2.5 py-1 rounded border border-stone-300 dark:border-zinc-700 text-xs disabled:opacity-40 cursor-pointer"
                              >
                                + Ch
                              </button>

                              <select
                                disabled={isLocked}
                                value={bm.readingStatus}
                                onChange={(e) =>
                                  handleUpsertBookmark(matchedWork, {
                                    readingStatus:
                                      e.target.value as BookmarkRecord['readingStatus'],
                                  })
                                }
                                className="rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1 text-xs"
                              >
                                <option value="Reading">Reading</option>
                                <option value="Marked for Later">Marked for Later</option>
                                <option value="Completed">Completed</option>
                                <option value="Archived">Archived (Lock Record)</option>
                              </select>

                              {isLocked && (
                                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                  <Lock className="w-3 h-3" />
                                  <span>Terminal State Locked</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Personal Reading Notes + Public Reading Room Sharing Toggle */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1">
                            <input
                              type="text"
                              disabled={isLocked}
                              defaultValue={bm.personalNotes}
                              onBlur={(e) => {
                                if (e.target.value !== bm.personalNotes) {
                                  handleUpsertBookmark(matchedWork, {
                                    personalNotes: e.target.value,
                                  });
                                }
                              }}
                              placeholder="Add bookmark notes or favorite quotes (auto-syncs on blur)..."
                              className="flex-1 rounded border border-stone-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 px-3 py-1.5 text-xs text-stone-800 dark:text-zinc-200"
                            />
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() =>
                                handleUpsertBookmark(matchedWork, {
                                  isPublicNote: !bm.isPublicNote,
                                })
                              }
                              title="When public, this note is appended to your traded Reading Room copies"
                              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-40 ${
                                bm.isPublicNote
                                  ? 'border-emerald-600/60 bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
                                  : 'border-stone-300 dark:border-zinc-700 text-stone-600 dark:text-zinc-400 hover:border-[#E11D48]'
                              }`}
                            >
                              {bm.isPublicNote ? (
                                <>
                                  <Globe className="w-3.5 h-3.5" />
                                  <span>Public Note (Reading Room)</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Private Note</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ==================== 3. AUTHOR WRITING STUDIO, VERSION CONTROL & ANALYTICS ==================== */}
            {activeTab === 'studio' && (
              <div className="space-y-10">
                {/* Studio Header */}
                <div className="flex flex-wrap items-end justify-between gap-6 pb-6 border-b border-stone-200 dark:border-zinc-800">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-[#E11D48] font-medium">
                      Author Manuscript Workspace
                    </p>
                    <h1 className="text-3xl lg:text-4xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-50">
                      Writing Studio, Version Control & Reader Analytics
                    </h1>
                    <p className="text-sm text-stone-600 dark:text-zinc-400 max-w-2xl">
                      Draft works in a clean folio editor, commit immutable version snapshots with diff inspection, and review direct reader feedback metrics.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleCommitVersionSnapshot}
                      className="flex items-center gap-1.5 rounded border border-stone-300 dark:border-zinc-700 px-4 py-2 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors cursor-pointer"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>Commit Snapshot</span>
                    </button>
                    <button
                      onClick={handlePublishWorkToArchive}
                      className="flex items-center gap-1.5 rounded bg-[#E11D48] px-4 py-2 text-xs font-medium text-white hover:bg-[#BE123C] transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Publish to Archive</span>
                    </button>
                  </div>
                </div>

                {/* Studio 12-Col Grid: 7 Cols Editor / 5 Cols Version Control & Analytics */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                  {/* Left 7 Columns: Distraction-Free Manuscript Editor */}
                  <div className="lg:col-span-7 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Work Title
                        </label>
                        <input
                          type="text"
                          value={studioTitle}
                          onChange={(e) => setStudioTitle(e.target.value)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Author Pen Name
                        </label>
                        <input
                          type="text"
                          value={studioAuthorName}
                          onChange={(e) => setStudioAuthorName(e.target.value)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Rating
                        </label>
                        <select
                          value={studioRating}
                          onChange={(e) => setStudioRating(e.target.value as Ao3Rating)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs"
                        >
                          {RATINGS_LIST.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Category
                        </label>
                        <select
                          value={studioCategory}
                          onChange={(e) => setStudioCategory(e.target.value as Ao3Category)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs"
                        >
                          {CATEGORIES_LIST.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Publication Status
                        </label>
                        <select
                          value={studioStatus}
                          onChange={(e) => setStudioStatus(e.target.value as Ao3Status)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs"
                        >
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                          <option value="Archived">Archived (Terminal Lock)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Canonical Fandom
                        </label>
                        <input
                          type="text"
                          value={studioFandom}
                          onChange={(e) => setStudioFandom(e.target.value)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                          Tags (comma-separated, max 10)
                        </label>
                        <input
                          type="text"
                          value={studioTagsInput}
                          onChange={(e) => setStudioTagsInput(e.target.value)}
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                        Editorial Summary
                      </label>
                      <textarea
                        rows={2}
                        value={studioSummary}
                        onChange={(e) => setStudioSummary(e.target.value)}
                        className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs leading-relaxed"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-stone-700 dark:text-zinc-300">
                          Manuscript Prose Body
                        </label>
                        <span className="text-xs font-mono-tabular text-stone-500 dark:text-zinc-400">
                          {countWords(studioContent).toLocaleString()} words · ~
                          {Math.max(1, Math.ceil(countWords(studioContent) / 220))} min read
                        </span>
                      </div>
                      <textarea
                        rows={14}
                        value={studioContent}
                        onChange={(e) => setStudioContent(e.target.value)}
                        className="w-full rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-[#121216] p-5 text-base font-serif-editorial leading-relaxed text-stone-900 dark:text-zinc-100 focus:outline-none focus:border-[#E11D48]"
                      />
                    </div>
                  </div>

                  {/* Right 5 Columns: Built-In Version Control & Direct Reader Feedback Analytics */}
                  <aside className="lg:col-span-5 space-y-8">
                    {/* Built-in Version Control Card */}
                    <div className="rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/60 dark:bg-[#121216] p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-[#E11D48]" />
                          <h2 className="text-base font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                            Built-In Version Control
                          </h2>
                        </div>
                        <span className="text-xs font-mono-tabular text-stone-500">
                          {activeVersions.length} commits
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        <input
                          type="text"
                          value={versionLabelInput}
                          onChange={(e) => setVersionLabelInput(e.target.value)}
                          placeholder="Version label (e.g. v1.3 - Revised Ending)"
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-3 py-1.5 text-xs"
                        />
                        <input
                          type="text"
                          value={commitNoteInput}
                          onChange={(e) => setCommitNoteInput(e.target.value)}
                          placeholder="Changelog note..."
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-3 py-1.5 text-xs"
                        />
                        <button
                          onClick={handleCommitVersionSnapshot}
                          className="w-full rounded bg-stone-900 dark:bg-zinc-100 py-2 px-3 text-xs font-medium text-white dark:text-zinc-900 cursor-pointer"
                        >
                          Save Immutable Snapshot
                        </button>
                      </div>

                      {/* Commit History List */}
                      <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-zinc-800">
                        {activeVersions.map((ver) => {
                          const wordDelta = countWords(studioContent) - ver.wordCount;
                          const isSelected = selectedDiffVersion?.id === ver.id;
                          return (
                            <div
                              key={ver.id}
                              onClick={() => setSelectedDiffVersionId(ver.id)}
                              className={`p-3 rounded border transition-colors cursor-pointer space-y-1 ${
                                isSelected
                                  ? 'border-[#E11D48] bg-[#E11D48]/5'
                                  : 'border-stone-200 dark:border-zinc-800 hover:border-stone-400'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-stone-900 dark:text-zinc-100">
                                  {ver.versionLabel}
                                </span>
                                <span className="font-mono-tabular text-stone-500">
                                  {ver.wordCount}w ({wordDelta >= 0 ? `+${wordDelta}` : wordDelta})
                                </span>
                              </div>
                              <p className="text-xs text-stone-600 dark:text-zinc-400">
                                {ver.commitNote}
                              </p>
                              <div className="flex items-center justify-between pt-1 text-[11px] text-stone-400">
                                <span>{ver.createdAtIso}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setStudioContent(ver.contentSnapshot);
                                    showToast(`Restored manuscript to "${ver.versionLabel}"`);
                                  }}
                                  className="text-[#E11D48] hover:underline font-medium cursor-pointer"
                                >
                                  Restore Snapshot
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Snapshot Diff Preview */}
                      {selectedDiffVersion && (
                        <div className="pt-3 border-t border-stone-200 dark:border-zinc-800 space-y-1.5">
                          <p className="text-xs font-medium text-stone-600 dark:text-zinc-400">
                            Snapshot Preview: {selectedDiffVersion.versionLabel}
                          </p>
                          <div className="rounded bg-stone-100 dark:bg-zinc-900 p-3 text-xs font-mono-tabular text-stone-700 dark:text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                            {selectedDiffVersion.contentSnapshot}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Direct Reader Feedback Analytics Card */}
                    <div className="rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/60 dark:bg-[#121216] p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-[#E11D48]" />
                          <h2 className="text-base font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                            Direct Reader Feedback Analytics
                          </h2>
                        </div>
                        <span className="text-xs font-mono-tabular text-stone-500">
                          {activeFeedbackList.length} responses
                        </span>
                      </div>

                      {/* Dimension Breakdown Bars */}
                      <div className="space-y-3">
                        {studioAnalytics.map((item) => (
                          <div key={item.dimension} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-stone-700 dark:text-zinc-300 font-medium">
                                {item.dimension}
                              </span>
                              <span className="font-mono-tabular text-stone-600 dark:text-zinc-400">
                                {item.average.toFixed(1)} / 5.0
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-stone-200 dark:bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full bg-[#E11D48]"
                                style={{ width: `${(item.average / 5) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Reader Commentary Stream */}
                      <div className="pt-3 border-t border-stone-200 dark:border-zinc-800 space-y-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                          Direct Reader Commentary
                        </p>
                        {activeFeedbackList.map((fb) => (
                          <div
                            key={fb.id}
                            className="text-xs space-y-1 pb-2.5 border-b border-stone-200/60 dark:border-zinc-800/60 last:border-none"
                          >
                            <div className="flex justify-between text-stone-500">
                              <span className="font-medium text-stone-800 dark:text-zinc-200">
                                {fb.readerName} · Ch. {fb.chapterNumber}
                              </span>
                              <span className="font-mono-tabular">
                                {fb.dimension} ({fb.score}/5)
                              </span>
                            </div>
                            <p className="text-stone-600 dark:text-zinc-300 leading-relaxed">
                              {fb.comment}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            )}

            {/* ==================== 4. INTERNET ARCHIVE & AO3 IMPORTER CONSOLE ==================== */}
            {activeTab === 'scraper' && (
              <div className="space-y-8">
                <div className="flex flex-wrap items-end justify-between gap-6 pb-6 border-b border-stone-200 dark:border-zinc-800">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-[#E11D48] font-medium">
                      Unabridged Archival Ingestion · AO3 Downloads + archive.org
                    </p>
                    <h1 className="text-3xl lg:text-4xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-50">
                      AO3 Importer &amp; Wayback Scraper
                    </h1>
                    <p className="text-sm text-stone-600 dark:text-zinc-400 max-w-2xl">
                      Import complete multi-chapter works straight from AO3’s official HTML or EPUB downloads (bypassing Cloudflare and archive locks), recover full-work Wayback snapshots by AO3 URL, or search Internet Archive text repositories.
                    </p>
                  </div>
                  <span className="text-xs font-mono-tabular text-stone-500 dark:text-zinc-400">
                    {scraperSourceLabel}
                  </span>
                </div>

                {/* Direct AO3 Ingestion Grid: File Importer + Wayback Work URL Recovery */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left 6 cols: Official AO3 HTML / EPUB / TXT Dropzone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingAo3File(true);
                    }}
                    onDragLeave={() => setIsDraggingAo3File(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingAo3File(false);
                      void handleAo3FilesSelected(e.dataTransfer.files);
                    }}
                    className={`lg:col-span-6 rounded-lg border-2 border-dashed p-6 space-y-4 transition-colors ${
                      isDraggingAo3File
                        ? 'border-[#E11D48] bg-[#E11D48]/5'
                        : 'border-stone-300 dark:border-zinc-700 bg-white/50 dark:bg-[#121216]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h2 className="text-lg font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                          Import AO3 HTML or EPUB Download
                        </h2>
                        <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
                          On <span className="font-mono-tabular">archiveofourown.org</span>, click{' '}
                          <strong className="font-medium text-stone-800 dark:text-zinc-200">
                            Download → HTML
                          </strong>{' '}
                          (or{' '}
                          <strong className="font-medium text-stone-800 dark:text-zinc-200">
                            EPUB
                          </strong>
                          ) and drop one or multiple files here. Parses every chapter, author note, fandom, rating, and canonical tag offline.
                        </p>
                      </div>
                      <Upload className="w-5 h-5 text-[#E11D48] shrink-0 mt-0.5" />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <label className="inline-flex items-center gap-2 rounded bg-[#E11D48] px-4 py-2 text-xs font-medium text-white hover:bg-[#BE123C] transition-colors cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {isImportingFiles ? 'Parsing AO3 File...' : 'Select .html / .epub / .txt'}
                        </span>
                        <input
                          type="file"
                          accept=".html,.htm,.xhtml,.epub,.txt"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void handleAo3FilesSelected(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setShowPasteHtmlBox((prev) => !prev)}
                        className="rounded border border-stone-300 dark:border-zinc-700 px-3 py-2 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:border-[#E11D48] transition-colors cursor-pointer"
                      >
                        {showPasteHtmlBox ? 'Hide HTML Paste Box' : 'Or Paste AO3 HTML Source'}
                      </button>
                    </div>

                    {showPasteHtmlBox && (
                      <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-zinc-800">
                        <textarea
                          rows={4}
                          value={pastedAo3Html}
                          onChange={(e) => setPastedAo3Html(e.target.value)}
                          placeholder="Paste raw HTML from an AO3 ?view_full_work=true page or downloaded .html file..."
                          className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-xs font-mono-tabular text-stone-900 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={handleParsePastedAo3Html}
                          className="rounded bg-stone-900 dark:bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-900 cursor-pointer"
                        >
                          Parse &amp; Open Unabridged Work
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right 6 cols: Direct AO3 Work URL -> Wayback Full-Work Snapshot Recovery */}
                  <div className="lg:col-span-6 rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/50 dark:bg-[#121216] p-6 space-y-4">
                    <div className="space-y-1">
                      <h2 className="text-lg font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                        Recover AO3 Work URL via Wayback Machine
                      </h2>
                      <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
                        Paste an <span className="font-mono-tabular">archiveofourown.org/works/ID</span>{' '}
                        URL or numeric Work ID. Queries Wayback CDX specifically for{' '}
                        <span className="font-mono-tabular">?view_full_work=true</span> captures or stitches all archived chapter pages automatically.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="text"
                        value={ao3UrlInput}
                        onChange={(e) => setAo3UrlInput(e.target.value)}
                        placeholder="https://archiveofourown.org/works/123456 or 123456"
                        className="flex-1 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-stone-900 dark:text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={handleRecoverAo3Wayback}
                        disabled={isRecoveringAo3 || !ao3UrlInput.trim()}
                        className="rounded bg-stone-900 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isRecoveringAo3 ? 'Checking Wayback...' : 'Recover Full Work'}
                      </button>
                    </div>

                    {ao3ImportNotice && (
                      <p className="text-xs text-stone-700 dark:text-zinc-300 pt-1 border-t border-stone-200/70 dark:border-zinc-800/70 leading-relaxed">
                        {ao3ImportNotice}
                      </p>
                    )}
                  </div>
                </div>

                {/* Internet Archive Collection Search Bar */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={scraperQuery}
                      onChange={(e) => setScraperQuery(e.target.value)}
                      placeholder="Search archive.org fanworks by fandom, title, or trope (e.g. Sherlock, Star Trek, Tolkien, Good Omens)..."
                      className="flex-1 rounded border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-stone-900 dark:text-zinc-100"
                    />
                    <button
                      onClick={() => handleRunScraper()}
                      disabled={isScraping}
                      className="flex items-center justify-center gap-2 rounded bg-[#E11D48] px-6 py-2.5 text-xs font-medium text-white hover:bg-[#BE123C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Archive className="w-4 h-4" />
                      <span>
                        {isScraping ? 'Querying archive.org...' : 'Search Internet Archive'}
                      </span>
                    </button>
                  </div>

                  {/* Quick Fandom Collection Presets */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-stone-500 dark:text-zinc-400">Quick Collections:</span>
                    {[
                      'Sherlock',
                      'Star Trek',
                      'Tolkien',
                      'Good Omens',
                      'Doctor Who',
                      'Marvel',
                      'Harry Potter',
                    ].map((term) => (
                      <button
                        key={term}
                        onClick={() => {
                          setScraperQuery(term);
                          handleRunScraper(term);
                        }}
                        className="px-3 py-1 rounded border border-stone-300 dark:border-zinc-700 hover:border-[#E11D48] text-stone-700 dark:text-zinc-300 transition-colors cursor-pointer"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scraped Works Table / List */}
                <div className="divide-y divide-stone-200 dark:divide-zinc-800 border-t border-stone-200 dark:border-zinc-800">
                  {(scrapedResults.length > 0 ? scrapedResults : allWorks).map((item) => (
                    <div
                      key={item.id}
                      className="py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-zinc-400 font-mono-tabular">
                          <span>ID: {item.sourceArchiveId}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.fandom}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.wordCount.toLocaleString()} words</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.archiveDate}</span>
                        </div>
                        <h3 className="text-lg font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                          {item.title}{' '}
                          <span className="text-xs font-sans font-normal text-stone-500">
                            by {item.authorName}
                          </span>
                        </h3>
                        <p className="text-xs text-stone-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                          {item.summary}
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          onClick={() => handleFetchFullTextFromIa(item)}
                          disabled={loadingFullTextId === item.id}
                          className="flex items-center gap-1.5 rounded border border-stone-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:border-[#E11D48] transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>
                            {loadingFullTextId === item.id ? 'Streaming...' : 'Pull Full Text'}
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveChapterIndex(0);
                            setActiveWorkId(item.id);
                          }}
                          className="flex items-center gap-1.5 rounded bg-stone-900 dark:bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-900 cursor-pointer"
                        >
                          <span>Open in Reader</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==================== 5. READING ROOM & OFFLINE CACHE TRADING ==================== */}
            {activeTab === 'readingRoom' && (
              <ReadingRoomView
                allWorks={allWorks}
                bookmarks={activeBookmarks}
                peers={activePeers}
                isSignedIn={!!user}
                onUpsertPeer={handleUpsertPeer}
                onDeletePeer={handleDeletePeer}
                onImportWorksFromTrade={handleImportWorksFromTrade}
                onNotify={showToast}
              />
            )}
          </>
        )}
      </main>

      {/* Quiet Archival Footer */}
      <footer className="mt-auto border-t border-stone-200 dark:border-zinc-800/80 py-6 px-6 lg:px-12 text-xs text-stone-500 dark:text-zinc-500">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <img
              src={`${import.meta.env.BASE_URL}reading-owl-mascot.png`}
              alt="The Reading Owl"
              className="w-5 h-5 rounded-full border border-amber-500/30 object-cover"
            />
            <span>Archive Mine Own · Offline Reading Room, Marginalia Editions &amp; Cloud Sync</span>
          </span>
          <span>
            Preserving personal libraries via peer-to-peer Reading Room trades &amp; Internet Archive Open Doors
          </span>
        </div>
      </footer>
    </div>
  );
}
