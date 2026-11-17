# Security Specification & Hardening Audit

## 1. Data Invariants
1. **Identity Isolation (PII Protection)**: `/users/{userId}` holds email and profile data and is readable/writable strictly by `request.auth.uid == userId` with `request.auth.token.email_verified == true`. No blanket `isSignedIn()` reads exist anywhere.
2. **Master Gate Ownership**: `/users/{userId}/chats/{chatId}` requires parent `/users/{userId}` existence (`exists`) and `ownerId == request.auth.uid`. `/users/{userId}/chats/{chatId}/messages/{messageId}` checks parent chat ownership via `get(...)` and verifies `ownerId == request.auth.uid` and `chatId == chatId`.
3. **Immutable Ownership & Temporal Integrity**: `uid`, `ownerId`, `chatId`, and `createdAt` cannot change after creation. `createdAt == request.time` on create; `updatedAt == request.time` on update.
4. **Strict Payload Boundaries**: Every string enforces explicit `.size()` caps, IDs match `^[a-zA-Z0-9_\-]+$`, and `keys().hasAll(...) && keys().hasOnly(...)` rejects shadow fields.

## 2. The "Dirty Dozen" Attack Payloads
1. Unauthenticated read of `/users/userA`. -> `PERMISSION_DENIED`
2. Unverified email (`email_verified: false`) attempting profile creation. -> `PERMISSION_DENIED`
3. Authenticated userB reading userA's `/users/userA` PII document. -> `PERMISSION_DENIED`
4. Shadow field injection (`{ ..., isAdmin: true }`) during `/users/userA` create. -> `PERMISSION_DENIED`
5. Self-spoofed `uid` mismatch (`/users/userA` with `uid: "userB"`). -> `PERMISSION_DENIED`
6. Forged past `createdAt` timestamp on create. -> `PERMISSION_DENIED`
7. Oversized `themePreset` or 1MB `displayName` string poisoning. -> `PERMISSION_DENIED`
8. Updating immutable `uid` or `createdAt` on `/users/userA`. -> `PERMISSION_DENIED`
9. List query on `/users/{userA}/chats` by `userB` attempting collection scraping. -> `PERMISSION_DENIED`
10. Creating `/users/userA/chats/c1` with `ownerId: "userB"`. -> `PERMISSION_DENIED`
11. Creating a message in a non-existent parent chat thread (`orphan message`). -> `PERMISSION_DENIED`
12. Mutating `content` of an existing immutable chat message. -> `PERMISSION_DENIED`
