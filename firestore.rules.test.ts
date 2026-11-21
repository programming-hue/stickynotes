/**
 * Security rules verification specification for StickyBoard "Dirty Dozen" adversarial payloads.
 * Run against Firebase Emulator Suite when testing rules locally.
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  description: string;
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Board Create',
    collectionPath: '/boards/board_spoof',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects board creation when ownerId !== request.auth.uid',
  },
  {
    id: 2,
    name: 'Shadow Field Injection on Note',
    collectionPath: '/boards/b1/notes/n1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects undocumented ghost fields via keys().hasOnly()',
  },
  {
    id: 3,
    name: 'Privilege Escalation on Invite Accept',
    collectionPath: '/boards/b1/members/viewer_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects editor role when invite grants viewer role',
  },
  {
    id: 4,
    name: 'PII Scraping on Users Collection',
    collectionPath: '/users/other_uid',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects reading another user profile containing email PII',
  },
  {
    id: 5,
    name: 'Unverified Email Spoof on Invites',
    collectionPath: '/invites/inv1',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects invite access when email_verified != true',
  },
  {
    id: 6,
    name: 'Orphaned Note Write on Non-Existent Board',
    collectionPath: '/boards/missing_board/notes/n1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects note write when parent board does not exist or caller is unauthorized',
  },
  {
    id: 7,
    name: 'Viewer Write Escalation',
    collectionPath: '/boards/b1/notes/n1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects note mutations from collaborators with viewer role',
  },
  {
    id: 8,
    name: 'Revoked Collaborator Secret Read',
    collectionPath: '/boards/b1/secrets/encryption',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    description: 'Immediately blocks key access once member doc is deleted',
  },
  {
    id: 9,
    name: 'Path Variable ID Poisoning',
    collectionPath: '/boards/invalid$id!/notes/n1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects IDs failing ^[a-zA-Z0-9_\\-]+$ or exceeding 128 chars',
  },
  {
    id: 10,
    name: 'Denial of Wallet Volumetric Overflow',
    collectionPath: '/boards/b1/notes/n1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects encryptedPayload exceeding 65536 bytes',
  },
  {
    id: 11,
    name: 'Terminal State Bypass on Revoked Invite',
    collectionPath: '/invites/inv_revoked',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects accepting an invite whose existing status is not pending',
  },
  {
    id: 12,
    name: 'Client Timestamp Forgery',
    collectionPath: '/boards/b1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects createdAt != request.time',
  },
];
