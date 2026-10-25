# TrustVault Threat Model

## 1. Overview

TrustVault is designed to protect confidential documents through authentication, document-level authorization, secure storage, controlled sharing, and auditable activity records.

This document identifies potential threats to document confidentiality, integrity, and accountability.

## 2. Assets to Protect

- User account credentials
- Authentication sessions and verification codes
- Confidential document contents
- Document metadata and ownership information
- Document-sharing permissions
- Encryption keys
- Audit logs and integrity-verification data
- Database records and application secrets

## 3. Potential Threats and Mitigations

### T1: Unauthorized Document Access

**Threat:** An authenticated user attempts to open a document owned by another user without permission.

**Potential impact:** Exposure of confidential information.

**Mitigations:**
- Enforce authorization on the server for every document operation.
- Verify document ownership or an explicitly granted permission.
- Deny access by default.
- Test direct document-ID access using a separate user account.

**Verification:** Confirm that an unauthorized user cannot retrieve document contents through the UI or direct API requests.

### T2: Insecure Document Sharing

**Threat:** A document is shared with the wrong user or more broadly than intended.

**Potential impact:** Confidential information becomes accessible to unintended recipients.

**Mitigations:**
- Require explicit sharing actions.
- Validate recipient identity and permissions.
- Apply least-privilege access.
- Record sharing and revocation events.

**Verification:** Confirm that only the selected recipient receives the intended permissions.

### T3: Failure to Revoke Permissions

**Threat:** A user continues to access a document after their permission has been revoked.

**Potential impact:** Former collaborators retain access to confidential files.

**Mitigations:**
- Check current permissions on every protected request.
- Remove or invalidate revoked grants.
- Avoid relying on cached authorization decisions.
- Record revocation events.

**Verification:** After revocation, attempt to access and download the document again using the revoked user's session.

### T4: Credential Theft or Account Takeover

**Threat:** An attacker obtains a user's password, session token, or verification code.

**Potential impact:** Unauthorized access to the victim's documents.

**Mitigations:**
- Store passwords using a suitable password-hashing algorithm.
- Use secure session management.
- Apply rate limits to login and verification attempts.
- Expire and invalidate verification codes appropriately.
- Protect session cookies with appropriate security attributes.
- Integrate third-party authentication securely when offered.

**Verification:** Test invalid credentials, repeated attempts, logout, and session expiration.

### T5: Exposure of Stored Documents

**Threat:** An attacker obtains access to the database, storage directory, or backup containing documents.

**Potential impact:** Confidential document contents are exposed.

**Mitigations:**
- Encrypt document contents at rest using an appropriate authenticated encryption scheme.
- Store encryption keys separately from document data.
- Restrict filesystem and database permissions.
- Protect backups and temporary files.
- Avoid committing sensitive files or secrets to version control.

**Verification:** Inspect stored document bytes and confirm that encryption is actually applied.

### T6: Malicious or Invalid Uploads

**Threat:** A user uploads an oversized, malformed, or malicious file.

**Potential impact:** Service disruption, unsafe file handling, or exploitation of downstream systems.

**Mitigations:**
- Validate file size and permitted file types on the server.
- Treat client-provided filenames and MIME types as untrusted.
- Generate safe storage names.
- Reject malformed input and handle errors safely.
- Keep uploaded files outside executable application paths.

**Verification:** Test oversized files, invalid input, and unsupported file types.

### T7: Audit Log Tampering

**Threat:** An attacker modifies, removes, or inserts audit events to hide unauthorized activity.

**Potential impact:** The organization loses reliable evidence of document access.

**Mitigations:**
- Record relevant security events consistently.
- Use a cryptographically linked audit chain where appropriate.
- Verify the chain and detect unexpected modifications.
- Restrict audit-log modification privileges.
- Protect the trusted starting point and verification mechanism.
- Consider external or append-only storage for stronger protection.

**Verification:** On a local test copy, modify or remove an event and confirm that integrity verification detects the change.

### T8: Information Leakage Through Search

**Threat:** A user discovers confidential documents by searching for names, categories, owners, or document IDs.

**Potential impact:** Metadata or document contents are exposed.

**Mitigations:**
- Apply authorization before returning search results.
- Avoid leaking restricted document metadata.
- Verify permissions again before serving document contents.

**Verification:** Search using a second account and confirm that private documents and restricted metadata are not disclosed.

### T9: Loss of Data After Deployment

**Threat:** Document files, database records, or encryption keys are lost during a restart, redeployment, or storage change.

**Potential impact:** Data loss or inability to decrypt previously stored documents.

**Mitigations:**
- Use appropriate persistent storage.
- Back up data securely.
- Protect and back up encryption keys.
- Test recovery and restoration procedures.

**Verification:** Confirm persistence and perform a controlled recovery test using non-sensitive test data.

### T10: Secret Exposure in GitHub

**Threat:** Passwords, API keys, database credentials, or encryption keys are committed to the repository.

**Potential impact:** Account compromise, data exposure, or unauthorized access.

**Mitigations:**
- Store secrets in environment variables or a secret manager.
- Use a suitable `.gitignore`.
- Review staged changes before committing.
- Rotate any secret that has been exposed.

**Verification:** Inspect the repository and commit history for accidental secret exposure.

## 4. Security Priorities

1. Prevent unauthorized document access.
2. Enforce sharing permissions and revocation.
3. Protect stored document contents and encryption keys.
4. Preserve reliable audit records.
5. Protect authentication and session management.
6. Validate uploads and search results.
7. Ensure deployment persistence and secure backups.

## 5. Scope and Limitations

This threat model identifies risks and recommended mitigations. It does not certify that the deployed application is secure.

Each mitigation must be checked against the current implementation and tested before being reported as complete.

TrustVault cannot prevent an authorized recipient from copying, photographing, or independently retaining a document they have already viewed or downloaded.

## 6. Responsible Testing

Perform security tests only on accounts, documents, deployments, and systems you own or are authorized to test. Use dummy documents and a local test database for tampering experiments.
