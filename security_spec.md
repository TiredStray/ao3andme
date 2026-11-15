# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Default-Deny Catch-All**: All paths not explicitly matched in `/databases/{database}/documents` are unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every single-document target operation (`get`, `create`, `update`, `delete`) validates document IDs via `isValidId(id)` (`id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Work Ownership & Terminal State Locking**:
   - A `Work` (`/works/{workId}`) can only be created when `incoming().authorUid == request.auth.uid`, `incoming().createdAt == request.time`, and `incoming().updatedAt == request.time`.
   - Once `existing().status == 'Archived'`, the work has reached a terminal state and all subsequent updates are strictly forbidden.
   - `allow list` on `/works/{workId}` never delegates security to the client: it enforces `existing().visibility == 'public' || (isSignedIn() && existing().authorUid == request.auth.uid)`.
5. **Relational Sync (Master Gate) on Subcollections**:
   - A `WorkVersion` (`/works/{workId}/versions/{versionId}`) can only be read, created, or deleted if the parent `/works/$(workId)` exists and its `authorUid == request.auth.uid`. Versions are immutable (`allow update: if false;`).
   - A `WorkFeedback` (`/works/{workId}/feedback/{feedbackId}`) can only be created if the parent `/works/$(workId)` exists (`exists(/databases/$(database)/documents/works/$(workId))`) and `incoming().readerUid == request.auth.uid`.
6. **Private Cloud Bookmark Isolation**:
   - A `Bookmark` (`/bookmarks/{bookmarkId}`) is strictly isolated to `ownerUid == request.auth.uid` for `get`, `list`, `create`, `update`, and `delete`.
   - Once `existing().readingStatus == 'Archived'`, the bookmark is locked from further updates unless unarchived or deleted by the owner.
7. **Reading Room Peer Isolation**:
   - A `ReadingRoomPeer` (`/readingRoomPeers/{peerId}`) is strictly isolated to `ownerUid == request.auth.uid` for `get`, `list`, `create`, `update`, and `delete`.
   - Arrays `sharedFandoms` and `knownWorkIds` are bounded to 1–10 string elements, and `status == 'Archived'` locks the record from subsequent updates.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Identity Spoofing on Work Creation)**: Authenticated user `uid_attacker` sends `authorUid: "uid_victim"` when creating `/works/work_1`. Must return `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Email Write)**: User with `email_verified: false` attempts to create `/bookmarks/bm_1`. Must return `PERMISSION_DENIED`.
3. **Payload 3 (Shadow Field Injection on Work Create)**: User includes an undeclared ghost key `isFeatured: true` in `/works/work_1`. Rejected by `.keys().hasOnly(...)`.
4. **Payload 4 (Update-Gap / Value Poisoning on Work Update)**: Author updates whitelisted key `title` with a 5,000-character string or boolean `true`. Rejected by `isValidWork(incoming())` wrapping the `allow update` block.
5. **Payload 5 (Terminal State Bypass on Work)**: Author attempts to update `content` on a work where `existing().status == 'Archived'`. Rejected by terminal state gate `existing().status != 'Archived'`.
6. **Payload 6 (Immortal Field Mutation)**: Author attempts to change `createdAt` or `authorUid` during an update on `/works/work_1`. Rejected by immutable field checks.
7. **Payload 7 (Forged Client Timestamp)**: User sends a past or future timestamp `createdAt: Timestamp.fromMillis(1000)` instead of `request.time`. Rejected by `incoming().createdAt == request.time`.
8. **Payload 8 (Orphaned Version Snapshot)**: User attempts to create `/works/non_existent_work/versions/v_1` or create a version under another author's work. Rejected by Master Gate `get(/databases/$(database)/documents/works/$(workId)).data.authorUid == request.auth.uid`.
9. **Payload 9 (Unbounded Tag Array Exhaustion)**: User submits 25 tags in `tags` array on `/works/work_1` or non-string first element `tags: [12345]`. Rejected by `data.tags.size() <= 10 && data.tags[0] is string`.
10. **Payload 10 (Cross-User Bookmark Scraping)**: User `uid_attacker` attempts `get` or `list` on `/bookmarks` belonging to `uid_victim`. Rejected by `existing().ownerUid == request.auth.uid`.
11. **Payload 11 (Path ID Poisoning)**: Attacker targets `/works/bad$id!with/slashes` or a 200-char ID. Rejected by `isValidId(workId)`.
12. **Payload 12 (Orphaned Feedback Creation)**: User attempts to post feedback to `/works/missing_work/feedback/fb_1` where parent work does not exist. Rejected by `exists(/databases/$(database)/documents/works/$(workId))`.
