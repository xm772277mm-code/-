/**
 * Security Rules TDD Test Suite covering the 12 Dirty Dozen Payloads
 * Run with Firebase Emulator Suite when validating rules offline.
 */
export const DIRTY_DOZEN_CASES = [
  { id: 1, name: "Unauthenticated read of /users/userA", expect: "PERMISSION_DENIED" },
  { id: 2, name: "Unverified email create /users/userA", expect: "PERMISSION_DENIED" },
  { id: 3, name: "Cross-user PII read /users/userA as userB", expect: "PERMISSION_DENIED" },
  { id: 4, name: "Shadow field isAdmin:true on /users/userA", expect: "PERMISSION_DENIED" },
  { id: 5, name: "UID spoofing in body vs path", expect: "PERMISSION_DENIED" },
  { id: 6, name: "Client-forged createdAt timestamp", expect: "PERMISSION_DENIED" },
  { id: 7, name: "Invalid themePreset enum or oversized string", expect: "PERMISSION_DENIED" },
  { id: 8, name: "Immutable uid/createdAt update", expect: "PERMISSION_DENIED" },
  { id: 9, name: "Cross-user chat list scraping", expect: "PERMISSION_DENIED" },
  { id: 10, name: "Chat creation with mismatched ownerId", expect: "PERMISSION_DENIED" },
  { id: 11, name: "Orphan message creation without parent chat", expect: "PERMISSION_DENIED" },
  { id: 12, name: "Mutation of existing immutable message", expect: "PERMISSION_DENIED" },
];
