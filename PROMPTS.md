# TrustVault — AI Development Prompts

## Purpose

This document records prompts used to assist with the design, implementation, testing, and documentation of TrustVault.

The project addresses secure document sharing, access control, document confidentiality, and verifiable audit history.

**Important:** The examples below are reusable prompt templates. Replace them with the prompts actually used during development before describing them as historical records.

## Prompt 1: Project Planning

Design a secure document-sharing application named TrustVault. The application should address unauthorized access, excessive document permissions, outdated sharing rights, and the lack of reliable evidence about document access.

Provide a clear architecture, user roles, data model, application workflow, and implementation plan. Distinguish required security properties from optional enhancements.

## Prompt 2: Authentication

Review the application's account registration and sign-in flow.

Requirements:
- Validate user input on the server.
- Enforce the configured password policy.
- Store passwords using secure password hashing.
- Implement email verification securely if supported.
- Integrate Google sign-in only through a correctly configured authentication flow.
- Protect sessions and implement logout.
- Avoid exposing passwords, verification codes, or session secrets in logs.

Explain the changes and provide tests for both valid and invalid authentication attempts.

## Prompt 3: Document Upload and Metadata

Implement or review document upload with metadata fields for document name, category, creation date, and owner.

Requirements:
- Validate input on the server.
- Enforce file size and type restrictions.
- Generate safe storage identifiers.
- Store metadata consistently.
- Protect document contents and prevent unauthorized retrieval.
- Handle invalid uploads without exposing internal errors.

Provide tests for successful uploads and rejected requests.

## Prompt 4: Document-Level Authorization

Review all document API endpoints to ensure that authentication alone does not grant access to every document.

Requirements:
- Allow owners to access their own documents.
- Allow other users only when an appropriate permission has been explicitly granted.
- Enforce authorization on every read, download, replacement, and sharing operation.
- Do not rely on hidden UI elements as a security control.
- Deny access by default.
- Record relevant denied access attempts without leaking confidential information.

Provide tests for ownership, authorized sharing, and unauthorized direct document-ID access.

## Prompt 5: Sharing and Revocation

Implement or review controlled document sharing.

Requirements:
- Allow a document owner to grant the intended permission to a selected user.
- Support read and edit permissions only if the application requires them.
- Validate recipient identity.
- Allow the owner to revoke an existing grant.
- Ensure that subsequent requests are denied after revocation.
- Record sharing and revocation events.

Provide automated tests for permission grants and revocation.

## Prompt 6: Encryption at Rest

Review the document-storage implementation and determine whether uploaded file contents are encrypted before being persisted.

Requirements:
- Use an appropriate authenticated encryption algorithm, such as AES-256-GCM, if compatible with the application.
- Generate unique nonces or IVs as required by the algorithm.
- Store authentication tags and necessary metadata safely.
- Keep encryption keys separate from document data.
- Reject corrupted ciphertext.
- Never log encryption keys or sensitive document contents.

Explain how to verify encryption using a harmless test file. Do not claim encryption is implemented until the storage code has been inspected and tested.

## Prompt 7: Verifiable Audit Trail

Design or review an audit trail for document-related security events.

Requirements:
- Record relevant actions with timestamps, actor identifiers, and document identifiers where appropriate.
- Use a cryptographic hash chain if tamper evidence is required.
- Verify event ordering and integrity.
- Detect modified or deleted events.
- Protect the trusted starting point and verification mechanism.
- Prevent ordinary users from modifying administrative audit records.

Provide tests that verify a valid chain and detect tampering in a local test environment.

## Prompt 8: Security Testing

Review the existing TrustVault tests and identify missing security coverage.

Include tests for:
- Invalid credentials
- Unauthorized document access
- Document sharing and revocation
- Upload validation
- Encryption and decryption
- Audit event recording
- Audit integrity verification
- Persistence across application restarts

Do not claim a test passed unless it was actually executed and its result was observed.

## Prompt 9: Code Review

Review the existing TrustVault implementation without replacing the entire project or changing its technology stack unnecessarily.

Identify:
- Security vulnerabilities
- Missing authorization checks
- Input validation problems
- Error-handling weaknesses
- Storage and deployment risks
- Missing automated tests

Explain each issue in beginner-friendly language and suggest the smallest safe correction first.

## Prompt 10: Project Documentation

Generate documentation for TrustVault that explains the problem statement, architecture, application workflow, security controls, installation, configuration, testing, and known limitations.

Clearly separate implemented and verified features from planned features. Do not invent test results, integrations, deployment guarantees, or security certifications.

## Development Record

For an accurate record, maintain the following details for each prompt actually used:

- Date:
- Tool used:
- Prompt:
- Files changed:
- Result reviewed:
- Tests executed:
- Follow-up corrections:

AI-generated code must be reviewed, understood, tested, and adapted to the project's actual requirements before being accepted.
