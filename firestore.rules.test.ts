/**
 * Phase 0 Test Runner Specification for Firestore Security Rules
 * Verifies that all "Dirty Dozen" adversarial payloads return PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_TEST_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Work Creation',
    operation: 'create',
    path: '/works/work_1',
    auth: { uid: 'uid_attacker', email_verified: true },
    payload: { authorUid: 'uid_victim', title: 'Spoofed Work' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    operation: 'create',
    path: '/bookmarks/bm_1',
    auth: { uid: 'uid_user', email_verified: false },
    payload: { ownerUid: 'uid_user', ficSlug: 'fic_1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Work Create',
    operation: 'create',
    path: '/works/work_1',
    auth: { uid: 'uid_author', email_verified: true },
    payload: { authorUid: 'uid_author', isFeaturedGhostField: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Value Poisoning on Work Update',
    operation: 'update',
    path: '/works/work_1',
    auth: { uid: 'uid_author', email_verified: true },
    payload: { title: 'x'.repeat(5000) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Terminal State Bypass on Archived Work',
    operation: 'update',
    path: '/works/work_archived',
    auth: { uid: 'uid_author', email_verified: true },
    payload: { content: 'Attempting to mutate an archived work' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immortal Field Mutation (authorUid / createdAt)',
    operation: 'update',
    path: '/works/work_1',
    auth: { uid: 'uid_author', email_verified: true },
    payload: { authorUid: 'uid_new_owner' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Forged Client Timestamp',
    operation: 'create',
    path: '/works/work_1',
    auth: { uid: 'uid_author', email_verified: true },
    payload: { createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned or Unauthorized Version Snapshot',
    operation: 'create',
    path: '/works/other_author_work/versions/v_1',
    auth: { uid: 'uid_attacker', email_verified: true },
    payload: { workId: 'other_author_work', authorUid: 'uid_attacker' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Unbounded Tag Array Exhaustion',
    operation: 'create',
    path: '/works/work_1',
    auth: { uid: 'uid_author', email_verified: true },
    payload: { tags: Array.from({ length: 25 }, (_, i) => `tag_${i}`) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Cross-User Bookmark Scraping',
    operation: 'get',
    path: '/bookmarks/victim_bookmark',
    auth: { uid: 'uid_attacker', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Path ID Poisoning',
    operation: 'create',
    path: `/works/${'a'.repeat(200)}`,
    auth: { uid: 'uid_author', email_verified: true },
    payload: { authorUid: 'uid_author' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Orphaned Feedback Creation on Non-Existent Work',
    operation: 'create',
    path: '/works/missing_work_id/feedback/fb_1',
    auth: { uid: 'uid_reader', email_verified: true },
    payload: { workId: 'missing_work_id', readerUid: 'uid_reader' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 13,
    name: 'Cross-User Reading Room Peer Scraping',
    operation: 'get',
    path: '/readingRoomPeers/victim_peer_1',
    auth: { uid: 'uid_attacker', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];
