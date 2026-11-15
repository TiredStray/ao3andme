import React, { useEffect, useRef, useState } from 'react';
import {
  Users,
  ShieldCheck,
  QrCode,
  Copy,
  Download,
  Upload,
  Cable,
  UserPlus,
  Star,
  Trash2,
  Check,
  Lock,
  Radio,
  Feather,
} from 'lucide-react';
import { type ArchivalWork } from '../data/internetArchiveCatalog';
import {
  type BookmarkNoteSource,
  type ReadingRoomPeerRecord,
  type LocalCryptographicIdentity,
  type PeerRole,
  type TradeImportResult,
  getOrCreateReaderIdentity,
  updateLocalIdentityProfile,
  encodeReadingRoomPass,
  decodeReadingRoomPass,
  generateQrDataUrl,
  computePokedexMissingWorks,
  attachPublicBookmarkAnnotations,
  createSignedTradePack,
  verifyAndImportTradePack,
} from '../lib/readingRoomTrade';
import { sanitizeId, clampString, sanitizeTagsList } from '../lib/firebase';

interface ReadingRoomViewProps {
  allWorks: ArchivalWork[];
  bookmarks: BookmarkNoteSource[];
  peers: ReadingRoomPeerRecord[];
  isSignedIn: boolean;
  onUpsertPeer: (peer: ReadingRoomPeerRecord) => Promise<void> | void;
  onDeletePeer: (peer: ReadingRoomPeerRecord) => Promise<void> | void;
  onImportWorksFromTrade: (result: TradeImportResult) => void;
  onNotify: (msg: string) => void;
}

export const ReadingRoomView: React.FC<ReadingRoomViewProps> = ({
  allWorks,
  bookmarks,
  peers,
  isSignedIn,
  onUpsertPeer,
  onDeletePeer,
  onImportWorksFromTrade,
  onNotify,
}) => {
  const [identity, setIdentity] = useState<LocalCryptographicIdentity | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [appendPublicNotes, setAppendPublicNotes] = useState(true);

  const publicBookmarkWorks = bookmarks.filter(
    (b) =>
      b.isPublicNote &&
      (Boolean(b.personalNotes && b.personalNotes.trim()) ||
        (b.userTags && b.userTags.length > 0))
  );

  // Add Friend / Author form state
  const [passInput, setPassInput] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualRole, setManualRole] = useState<PeerRole>('Reader');
  const [manualFandom, setManualFandom] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  // Trade import status
  const [lastImportReport, setLastImportReport] = useState<TradeImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Zero-Server WebRTC DataChannel Link Cable state
  const [rtcStatus, setRtcStatus] = useState<
    'idle' | 'awaiting-answer' | 'connected' | 'error'
  >('idle');
  const [rtcOfferCode, setRtcOfferCode] = useState('');
  const [rtcAnswerInput, setRtcAnswerInput] = useState('');
  const [rtcRemoteOfferInput, setRtcRemoteOfferInput] = useState('');
  const [rtcAnswerCode, setRtcAnswerCode] = useState('');
  const [rtcLog, setRtcLog] = useState<string[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    let active = true;
    getOrCreateReaderIdentity().then((id) => {
      if (active) setIdentity(id);
    });
    return () => {
      active = false;
    };
  }, []);

  const myPassCode = identity ? encodeReadingRoomPass(identity, allWorks) : '';

  useEffect(() => {
    if (!myPassCode) return;
    let active = true;
    generateQrDataUrl(myPassCode)
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [myPassCode]);

  const handleCopyPass = async () => {
    if (!myPassCode) return;
    try {
      await navigator.clipboard.writeText(myPassCode);
      onNotify('Copied Reading Room Pass to clipboard');
    } catch {
      onNotify('Select and copy your Reading Room Pass manually');
    }
  };

  const handleUpdateIdentity = (name: string, role: PeerRole) => {
    if (!identity) return;
    const updated = updateLocalIdentityProfile(identity, {
      displayName: name,
      role,
    });
    setIdentity(updated);
    onNotify('Updated your Reading Room pass identity');
  };

  const handleAddPeerFromPass = async () => {
    if (!passInput.trim()) return;
    try {
      const decoded = decodeReadingRoomPass(passInput);
      if (identity && decoded.peerCode === identity.peerCode) {
        onNotify('That is your own Reading Room Pass.');
        return;
      }
      const peerRecord: ReadingRoomPeerRecord = {
        id: sanitizeId(decoded.peerCode),
        ownerUid: 'local_reader',
        peerCode: sanitizeId(decoded.peerCode),
        peerName: clampString(decoded.peerName, 1, 80),
        role: decoded.role,
        publicKeyFingerprint: clampString(decoded.publicKeyFingerprint, 4, 128),
        publicKeyJwk: decoded.publicKeyJwk,
        sharedFandoms: sanitizeTagsList(decoded.sharedFandoms, 'Original Work'),
        knownWorkIds: sanitizeTagsList(decoded.cachedWorkIds, 'archive_entry'),
        fullCachedInventory: decoded.cachedWorkIds,
        tradeCount: 0,
        status: 'Connected',
        notes: 'Added via Reading Room Pass',
        updatedAtIso: new Date().toISOString().slice(0, 10),
      };
      await onUpsertPeer(peerRecord);
      setPassInput('');
      onNotify(`Added "${peerRecord.peerName}" to your Reading Room`);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not decode Reading Room Pass'
      );
    }
  };

  const handleAddManualPeer = async () => {
    if (!manualName.trim()) {
      onNotify('Enter a reader or author pen name first.');
      return;
    }
    const cleanCode = sanitizeId(
      `peer_${manualName.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString().slice(-4)}`
    );
    const peerRecord: ReadingRoomPeerRecord = {
      id: cleanCode,
      ownerUid: 'local_reader',
      peerCode: cleanCode,
      peerName: clampString(manualName, 1, 80),
      role: manualRole,
      publicKeyFingerprint: `AO3-${cleanCode.slice(-8).toUpperCase()}`,
      sharedFandoms: sanitizeTagsList(
        manualFandom.split(',').map((s) => s.trim()),
        'General Fandom'
      ),
      knownWorkIds: ['none_yet'],
      fullCachedInventory: [],
      tradeCount: 0,
      status: 'Connected',
      notes: clampString(manualNotes, 0, 500, ''),
      updatedAtIso: new Date().toISOString().slice(0, 10),
    };
    await onUpsertPeer(peerRecord);
    setManualName('');
    setManualFandom('');
    setManualNotes('');
    onNotify(`Added "${peerRecord.peerName}" (${manualRole}) to your Reading Room`);
  };

  const triggerDownloadPack = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportTradePack = async (peer?: ReadingRoomPeerRecord) => {
    if (!identity) return;
    let worksToSend = allWorks;
    if (peer) {
      const peerInv = peer.fullCachedInventory || peer.knownWorkIds || [];
      const diff = computePokedexMissingWorks(allWorks, peerInv);
      worksToSend = diff.missingForPeer.length > 0 ? diff.missingForPeer : allWorks;
    }
    const preparedWorks = appendPublicNotes
      ? attachPublicBookmarkAnnotations(worksToSend, bookmarks, identity)
      : worksToSend;

    const appendedCount = appendPublicNotes
      ? preparedWorks.filter((w) =>
          bookmarks.some((b) => b.isPublicNote && sanitizeId(b.ficSlug) === sanitizeId(w.id))
        ).length
      : 0;

    const pack = await createSignedTradePack(
      identity,
      preparedWorks,
      peer?.peerCode
    );
    const filename = peer
      ? `archive-mine-own-for-${sanitizeId(peer.peerName)}.ao3pack.json`
      : `archive-mine-own-edition-${new Date().toISOString().slice(0, 10)}.ao3pack.json`;
    triggerDownloadPack(filename, pack);

    if (peer && peer.status !== 'Archived') {
      await onUpsertPeer({
        ...peer,
        tradeCount: peer.tradeCount + 1,
        updatedAtIso: new Date().toISOString().slice(0, 10),
      });
    }
    onNotify(
      `Exported signed Reading Room bundle (${preparedWorks.length} work${
        preparedWorks.length === 1 ? '' : 's'
      }${
        appendedCount > 0
          ? ` · ${appendedCount} with your appended public bookmark notes`
          : ''
      }) ready for offline transfer`
    );
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await verifyAndImportTradePack(text, allWorks);
      setLastImportReport(result);
      onImportWorksFromTrade(result);
      onNotify(
        `Imported ${result.newCount} new & ${result.updatedCount} updated works from ${result.senderName}`
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Failed to verify .ao3pack trade bundle'
      );
    } finally {
      e.target.value = '';
    }
  };

  // Zero-Server WebRTC Link Cable Handlers (LAN / Local Hotspot P2P)
  const appendRtcLog = (msg: string) => {
    setRtcLog((prev) => [`${new Date().toLocaleTimeString()}: ${msg}`, ...prev].slice(0, 8));
  };

  const setupDataChannelHandlers = (dc: RTCDataChannel) => {
    dcRef.current = dc;
    const chunks: string[] = [];
    dc.onopen = () => {
      setRtcStatus('connected');
      appendRtcLog('Link Cable connected! Ready to trade cached works P2P.');
      onNotify('Link Cable WebRTC DataChannel connected');
    };
    dc.onmessage = async (event) => {
      const dataStr = String(event.data || '');
      if (dataStr === '__AO3_EOF__') {
        try {
          const fullJson = chunks.join('');
          chunks.length = 0;
          const result = await verifyAndImportTradePack(fullJson, allWorks);
          setLastImportReport(result);
          onImportWorksFromTrade(result);
          appendRtcLog(
            `Received & verified ${result.importedWorks.length} works (${result.newCount} new) from ${result.senderName}`
          );
          onNotify(`Link Cable received ${result.newCount} new works!`);
        } catch {
          appendRtcLog('Received malformed Link Cable payload.');
        }
      } else {
        chunks.push(dataStr);
      }
    };
    dc.onclose = () => {
      setRtcStatus('idle');
      appendRtcLog('Link Cable disconnected.');
    };
  };

  const waitForIceGathering = (pc: RTCPeerConnection) =>
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const timeout = setTimeout(resolve, 1800);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        }
      };
    });

  const handleCreateLinkOffer = async () => {
    try {
      pcRef.current?.close();
      const pc = new RTCPeerConnection({ iceServers: [] });
      pcRef.current = pc;
      const dc = pc.createDataChannel('ao3-link-cable');
      setupDataChannelHandlers(dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      const encoded = btoa(JSON.stringify(pc.localDescription));
      setRtcOfferCode(encoded);
      setRtcStatus('awaiting-answer');
      appendRtcLog('Generated Link Cable Offer. Share code with peer on local Wi-Fi/hotspot.');
    } catch {
      setRtcStatus('error');
      appendRtcLog('Could not initialize local WebRTC Link Cable.');
    }
  };

  const handleAcceptLinkOffer = async () => {
    if (!rtcRemoteOfferInput.trim()) return;
    try {
      pcRef.current?.close();
      const pc = new RTCPeerConnection({ iceServers: [] });
      pcRef.current = pc;
      pc.ondatachannel = (ev) => setupDataChannelHandlers(ev.channel);

      const offerDesc = JSON.parse(atob(rtcRemoteOfferInput.trim()));
      await pc.setRemoteDescription(offerDesc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGathering(pc);

      setRtcAnswerCode(btoa(JSON.stringify(pc.localDescription)));
      appendRtcLog('Generated Link Cable Answer. Paste this back on the Host device.');
    } catch {
      setRtcStatus('error');
      appendRtcLog('Invalid Link Cable Offer code.');
    }
  };

  const handleCompleteLinkHandshake = async () => {
    if (!pcRef.current || !rtcAnswerInput.trim()) return;
    try {
      const answerDesc = JSON.parse(atob(rtcAnswerInput.trim()));
      await pcRef.current.setRemoteDescription(answerDesc);
      appendRtcLog('Handshake applied; opening direct DataChannel...');
    } catch {
      appendRtcLog('Invalid Link Cable Answer code.');
    }
  };

  const handleSendWorksOverLinkCable = async () => {
    if (!dcRef.current || dcRef.current.readyState !== 'open' || !identity) {
      onNotify('Link Cable is not connected yet.');
      return;
    }
    const preparedWorks = appendPublicNotes
      ? attachPublicBookmarkAnnotations(allWorks, bookmarks, identity)
      : allWorks;
    const pack = await createSignedTradePack(identity, preparedWorks);
    const jsonStr = JSON.stringify(pack);
    const chunkSize = 16000;
    for (let i = 0; i < jsonStr.length; i += chunkSize) {
      dcRef.current.send(jsonStr.slice(i, i + chunkSize));
    }
    dcRef.current.send('__AO3_EOF__');
    appendRtcLog(`Streamed ${pack.worksCount} signed works over Link Cable.`);
    onNotify(`Sent ${pack.worksCount} works directly over Link Cable`);
  };

  return (
    <div className="space-y-10">
      {/* Header Section with 1600s Dutch Reading Owl Mascot */}
      <div className="flex flex-wrap items-end justify-between gap-6 pb-6 border-b border-stone-200 dark:border-zinc-800">
        <div className="flex items-start gap-5">
          <img
            src="/reading-owl-mascot.png"
            alt="1600s Dutch Engraving of The Reading Owl — Archive Mine Own Mascot"
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-amber-500/40 object-cover shrink-0 shadow-md"
          />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-[#E11D48] font-medium">
              Archive Mine Own · Social Offline Exchange &amp; Marginalia Editions
            </p>
            <h1 className="text-3xl lg:text-4xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-50">
              The Reading Room &amp; Offline Link Cable
            </h1>
            <p className="text-sm text-stone-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Guided by The Reading Owl, add friends and authors to your Reading Room, compare offline libraries, and trade unique signed <code className="font-mono-tabular text-xs">.ao3pack</code> editions carrying your appended public bookmark notes.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.ao3pack"
            onChange={handleImportFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded border border-stone-300 dark:border-zinc-700 px-4 py-2 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:border-[#E11D48] hover:text-[#E11D48] transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import .ao3pack Trade</span>
          </button>
          <button
            onClick={() => handleExportTradePack()}
            className="flex items-center gap-1.5 rounded bg-[#E11D48] px-4 py-2 text-xs font-medium text-white hover:bg-[#BE123C] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Full Edition ({allWorks.length})</span>
          </button>
        </div>
      </div>

      {/* Verification Report Banner after Importing a Trade Pack */}
      {lastImportReport && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-semibold text-stone-900 dark:text-zinc-100">
                Trade Pack Imported from {lastImportReport.senderName} ({lastImportReport.senderFingerprint})
              </p>
              <p className="text-stone-600 dark:text-zinc-300 font-mono-tabular">
                {lastImportReport.newCount} new works · {lastImportReport.updatedCount} updated editions · {lastImportReport.skippedCount} already up-to-date · {lastImportReport.annotationsCount} public bookmark notes · SHA-256 Verified: {lastImportReport.hashesVerified}/{lastImportReport.importedWorks.length} · ECDSA Signature:{' '}
                {lastImportReport.signatureVerified ? 'VALID' : 'LOCAL CHECKSUM ONLY'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setLastImportReport(null)}
            className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 12-Col Grid: 5 Cols My Pass & Add Friend / 7 Cols Roster & Link Cable */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left 5 Columns: My Cryptographic Pass + Add Peer */}
        <aside className="lg:col-span-5 space-y-6">
          {/* My Reading Room Pass */}
          <div className="rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/60 dark:bg-[#121216] p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#E11D48]" />
                <h2 className="text-base font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                  Your Reading Room Pass
                </h2>
              </div>
              <span className="text-[11px] font-mono-tabular text-stone-500">
                ECDSA P-256
              </span>
            </div>

            {identity && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-stone-500 dark:text-zinc-400 mb-1">
                      Pen Name
                    </label>
                    <input
                      type="text"
                      value={identity.displayName}
                      onChange={(e) =>
                        handleUpdateIdentity(e.target.value, identity.role)
                      }
                      className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 dark:text-zinc-400 mb-1">
                      Role
                    </label>
                    <select
                      value={identity.role}
                      onChange={(e) =>
                        handleUpdateIdentity(
                          identity.displayName,
                          e.target.value as PeerRole
                        )
                      }
                      className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
                    >
                      <option value="Reader">Reader</option>
                      <option value="Author">Author</option>
                      <option value="Archivist">Archivist</option>
                    </select>
                  </div>
                </div>

                <div className="rounded bg-stone-100 dark:bg-zinc-900/90 p-3 space-y-1 text-xs font-mono-tabular">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Fingerprint:</span>
                    <span className="text-stone-900 dark:text-zinc-100">
                      {identity.publicKeyFingerprint}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Cached Works:</span>
                    <span className="text-stone-900 dark:text-zinc-100">
                      {allWorks.length} works ready to trade
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleCopyPass}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded bg-stone-900 dark:bg-zinc-100 py-2 px-3 text-xs font-medium text-white dark:text-zinc-900 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Pass Code</span>
                  </button>
                  <button
                    onClick={() => setShowQrModal(true)}
                    className="flex items-center justify-center gap-1.5 rounded border border-stone-300 dark:border-zinc-700 py-2 px-3 text-xs font-medium text-stone-800 dark:text-zinc-200 hover:border-[#E11D48] cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Show QR Card</span>
                  </button>
                </div>

                {/* Public Bookmark Marginalia Appending Option */}
                <div className="pt-3 border-t border-stone-200 dark:border-zinc-800 space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={appendPublicNotes}
                      onChange={(e) => setAppendPublicNotes(e.target.checked)}
                      className="mt-0.5 accent-[#E11D48] cursor-pointer"
                    />
                    <div className="space-y-0.5 text-xs">
                      <span className="font-medium text-stone-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <Feather className="w-3.5 h-3.5 text-[#E11D48]" />
                        <span>Append Public Bookmark Notes to Shared Editions</span>
                      </span>
                      <p className="text-stone-500 dark:text-zinc-400 leading-relaxed">
                        {publicBookmarkWorks.length > 0
                          ? `${publicBookmarkWorks.length} work${
                              publicBookmarkWorks.length === 1 ? '' : 's'
                            } marked Public will carry your signed marginalia (${publicBookmarkWorks
                              .slice(0, 2)
                              .map((b) => `"${b.ficTitle}"`)
                              .join(', ')}${publicBookmarkWorks.length > 2 ? ', …' : ''}).`
                          : 'Mark any bookmark note as Public in the Reader or Dashboard to stamp your unique marginalia onto shared stories.'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Add Reader / Author to Reading Room */}
          <div className="rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/60 dark:bg-[#121216] p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-200 dark:border-zinc-800">
              <UserPlus className="w-4 h-4 text-[#E11D48]" />
              <h2 className="text-base font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                Add Reader or Author
              </h2>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300">
                Import via Friend’s Reading Room Pass (<code className="font-mono-tabular">MINEOWN:...</code>)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="Paste MINEOWN:... or AO3PASS:... code"
                  className="flex-1 rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-3 py-1.5 text-xs font-mono-tabular"
                />
                <button
                  onClick={handleAddPeerFromPass}
                  className="rounded bg-[#E11D48] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#BE123C] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Connect
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-stone-200 dark:border-zinc-800 space-y-2.5">
              <p className="text-xs font-medium text-stone-700 dark:text-zinc-300">
                Or Add Manually to Roster
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Handle / Pen name"
                  className="rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
                />
                <select
                  value={manualRole}
                  onChange={(e) => setManualRole(e.target.value as PeerRole)}
                  className="rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
                >
                  <option value="Reader">Reader</option>
                  <option value="Author">Author</option>
                  <option value="Archivist">Archivist</option>
                </select>
              </div>
              <input
                type="text"
                value={manualFandom}
                onChange={(e) => setManualFandom(e.target.value)}
                placeholder="Shared fandoms (comma-separated)"
                className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Personal note (e.g. 'Has complete 2012 Sherlock archive')"
                className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
              />
              <button
                onClick={handleAddManualPeer}
                className="w-full rounded bg-stone-900 dark:bg-zinc-100 py-2 px-3 text-xs font-medium text-white dark:text-zinc-900 cursor-pointer"
              >
                Add to Reading Room
              </button>
            </div>
          </div>

          {/* Direct Local Wi-Fi / Hotspot Link Cable (WebRTC DataChannel) */}
          <div className="rounded-lg border border-stone-200 dark:border-zinc-800 bg-white/60 dark:bg-[#121216] p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Cable className="w-4 h-4 text-[#E11D48]" />
                <h2 className="text-base font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                  Live Local Link Cable (WebRTC P2P)
                </h2>
              </div>
              <span className="text-[11px] font-mono-tabular text-stone-500 uppercase">
                {rtcStatus}
              </span>
            </div>

            <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
              On the same Wi-Fi or offline phone hotspot? Establish a serverless device-to-device DataChannel without any internet signaling server.
            </p>

            {rtcStatus === 'connected' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <Radio className="w-4 h-4" />
                  <span>Direct Link Cable Open — Ready for Trade</span>
                </div>
                <button
                  onClick={handleSendWorksOverLinkCable}
                  className="w-full rounded bg-[#E11D48] py-2 px-4 text-xs font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                >
                  Stream My Signed Cache ({allWorks.length} works) to Peer
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="space-y-1.5">
                  <button
                    onClick={handleCreateLinkOffer}
                    className="w-full rounded border border-stone-300 dark:border-zinc-700 py-1.5 px-3 font-medium hover:border-[#E11D48] cursor-pointer"
                  >
                    1. Host: Create Link Cable Offer
                  </button>
                  {rtcOfferCode && (
                    <div className="space-y-1.5">
                      <textarea
                        readOnly
                        rows={2}
                        value={rtcOfferCode}
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                        className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-900 p-2 text-[10px] font-mono-tabular"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={rtcAnswerInput}
                          onChange={(e) => setRtcAnswerInput(e.target.value)}
                          placeholder="Paste peer's Answer code..."
                          className="flex-1 rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1 text-xs font-mono-tabular"
                        />
                        <button
                          onClick={handleCompleteLinkHandshake}
                          className="rounded bg-[#E11D48] px-3 py-1 text-white font-medium cursor-pointer"
                        >
                          Connect
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-stone-200 dark:border-zinc-800 space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={rtcRemoteOfferInput}
                      onChange={(e) => setRtcRemoteOfferInput(e.target.value)}
                      placeholder="2. Join: Paste Host's Offer code..."
                      className="flex-1 rounded border border-stone-300 dark:border-zinc-700 bg-[#FBF9F5] dark:bg-zinc-900 px-2.5 py-1 text-xs font-mono-tabular"
                    />
                    <button
                      onClick={handleAcceptLinkOffer}
                      className="rounded bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1 font-medium cursor-pointer"
                    >
                      Join
                    </button>
                  </div>
                  {rtcAnswerCode && (
                    <textarea
                      readOnly
                      rows={2}
                      value={rtcAnswerCode}
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                      className="w-full rounded border border-stone-300 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-900 p-2 text-[10px] font-mono-tabular"
                    />
                  )}
                </div>
              </div>
            )}

            {rtcLog.length > 0 && (
              <div className="pt-2 border-t border-stone-200 dark:border-zinc-800 space-y-1 text-[11px] font-mono-tabular text-stone-500">
                {rtcLog.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Right 7 Columns: Reading Room Friends & Authors Roster */}
        <section className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#E11D48]" />
              <h2 className="text-xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                Reading Room Roster ({peers.length})
              </h2>
            </div>
            <span className="text-xs text-stone-500 dark:text-zinc-400">
              {isSignedIn ? 'Cloud + Offline Synced' : 'Offline Local Roster'}
            </span>
          </div>

          {peers.length === 0 ? (
            <div className="rounded-lg border border-stone-200 dark:border-zinc-800 p-10 text-center space-y-2">
              <p className="text-base font-serif-editorial text-stone-700 dark:text-zinc-300">
                Your Reading Room is empty.
              </p>
              <p className="text-xs text-stone-500">
                Share your Reading Room Pass or paste a friend’s code to begin trading offline caches.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-200 dark:divide-zinc-800">
              {peers.map((peer) => {
                const peerInv = peer.fullCachedInventory || peer.knownWorkIds || [];
                const diff = computePokedexMissingWorks(allWorks, peerInv);
                const isLocked = peer.status === 'Archived';

                return (
                  <div key={peer.id} className="py-6 first:pt-2 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-zinc-400">
                          <span className="font-medium text-[#E11D48]">
                            {peer.role}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            Key: {peer.publicKeyFingerprint}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            Trades: {peer.tradeCount}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{peer.status}</span>
                        </div>

                        <h3 className="text-2xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                          {peer.peerName}
                        </h3>

                        <p className="text-xs text-stone-500 dark:text-zinc-400">
                          Shared Fandoms: {peer.sharedFandoms.join(' · ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          disabled={isLocked}
                          onClick={() =>
                            onUpsertPeer({
                              ...peer,
                              status: peer.status === 'Pinned' ? 'Connected' : 'Pinned',
                              updatedAtIso: new Date().toISOString().slice(0, 10),
                            })
                          }
                          className={`px-2.5 py-1.5 rounded border text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                            peer.status === 'Pinned'
                              ? 'border-amber-500/60 text-amber-500 bg-amber-500/10'
                              : 'border-stone-300 dark:border-zinc-700 text-stone-500'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5" />
                          <span>{peer.status === 'Pinned' ? 'Pinned' : 'Pin'}</span>
                        </button>

                        <button
                          onClick={() => handleExportTradePack(peer)}
                          className="flex items-center gap-1.5 rounded bg-stone-900 dark:bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:opacity-90 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>
                            Trade Missing ({diff.missingForPeer.length})
                          </span>
                        </button>

                        <button
                          onClick={() => onDeletePeer(peer)}
                          className="p-1.5 text-stone-400 hover:text-rose-500 transition-colors cursor-pointer"
                          title="Remove from Reading Room"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {peer.notes && (
                      <p className="text-xs text-stone-600 dark:text-zinc-300 leading-relaxed">
                        {peer.notes}
                      </p>
                    )}

                    {/* Pokédex Inventory Diff Summary */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs font-mono-tabular text-stone-500 dark:text-zinc-400">
                      <span>
                        Inventory Diff: {diff.sharedCount} shared ·{' '}
                        <strong className="text-stone-800 dark:text-zinc-200">
                          {diff.missingForPeer.length} works you can send
                        </strong>{' '}
                        · {diff.missingForMeCount} works they have that you don’t
                      </span>
                      {isLocked && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <Lock className="w-3 h-3" />
                          <span>Archived</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* QR Code Pass Modal with Dutch Reading Owl Bookplate */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-lg border border-stone-200 dark:border-zinc-800 bg-[#FBF9F5] dark:bg-[#121215] p-6 shadow-xl space-y-4 text-center">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <img
                  src="/reading-owl-mascot.png"
                  alt="The Reading Owl Ex Libris"
                  className="w-7 h-7 rounded-full border border-amber-500/40 object-cover"
                />
                <h3 className="text-xl font-serif-editorial font-semibold text-stone-900 dark:text-zinc-100">
                  Archive Mine Own Pass
                </h3>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            {qrUrl && (
              <div className="flex justify-center py-2">
                <img
                  src={qrUrl}
                  alt="Archive Mine Own Reading Room Pass QR Code"
                  className="rounded-lg border border-stone-200 dark:border-zinc-700 w-52 h-52"
                />
              </div>
            )}

            <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
              Have a friend scan this Reading Owl card or paste your <code className="font-mono-tabular">MINEOWN</code> pass to trade offline stories and marginalia.
            </p>

            <button
              onClick={handleCopyPass}
              className="w-full flex items-center justify-center gap-2 rounded bg-[#E11D48] py-2 px-4 text-xs font-medium text-white hover:bg-[#BE123C] cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Copy Pass String</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
