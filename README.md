# TrustVault — Secure Document Sharing with a Verifiable Audit Trail

TrustVault is a secure document management and sharing application designed to help organizations protect confidential documents, control access permissions, and maintain an auditable history of document-related activities.

The project addresses common document-sharing risks such as unauthorized access, excessive permissions, outdated sharing rights, and insufficient evidence of who accessed a document and when.

## Problem Statement

Organizations handle sensitive documents such as salary letters, business contracts, engineering drawings, and audit reports. Traditional document-sharing approaches can expose confidential information to unauthorized users and make it difficult to verify document access.

TrustVault aims to provide a controlled environment where document access is restricted to authorized users and relevant activities can be audited.

## Objectives

- Authenticate users before providing access to the application.
- Allow users to upload and organize documents with relevant metadata.
- Support document discovery through search and filtering.
- Restrict access to documents based on ownership and permissions.
- Support controlled sharing and permission revocation.
- Protect confidential document contents through encryption.
- Maintain an auditable and tamper-evident record of document activity.

## Key Features

### 1. User Authentication
Account registration and sign-in provide the entry point to the application. Email verification and Google sign-in are included in the described user workflow, subject to the deployed configuration.

### 2. Document Upload
Users can upload documents and provide metadata such as document name, category, creation date, and owner.

### 3. Document Browsing and Search
Users can search for documents using available fields such as document name, category, or owner. Search results should respect the permissions of the authenticated user.

### 4. Access Control
Document access should be authorized on the server for every protected operation. Knowing a document ID must not grant access by itself.

### 5. Controlled Sharing and Revocation
Document owners should be able to grant access to selected users and revoke permissions when access is no longer required.

### 6. Audit Trail
Relevant document activities should be recorded so authorized administrators can review events. Audit integrity verification should detect unauthorized changes to the recorded history.

### 7. Secure Storage
Confidential file contents should be encrypted at rest, with encryption keys stored separately from document data.

## Technology Stack

The deployed application's exact stack should be confirmed from its current source code.

- Frontend: Web interface using HTML, CSS, and JavaScript or the framework configured in the repository
- Backend: Application server and API
- Database: Configured database for user accounts and document metadata
- Security: Authentication, server-side authorization, and encryption
- Version Control: Git and GitHub
- Deployment: Replit

## Application Workflow

1. The user opens TrustVault.
2. The user registers or signs in.
3. The application verifies the user's identity according to the configured authentication flow.
4. The user uploads a document and provides its metadata.
5. The application stores the document and its associated information.
6. The user browses or searches for documents they are authorized to access.
7. The owner can grant or revoke access where sharing is supported.
8. Relevant activities are recorded in the audit trail.
9. An authorized administrator reviews the recorded events and verifies audit integrity where supported.

## Security Principles

- Least privilege: Grant users only the permissions they need.
- Default deny: Deny access unless the user is authorized.
- Server-side enforcement: Do not rely on hiding buttons in the frontend.
- Confidentiality: Protect sensitive document contents.
- Accountability: Record relevant security events.
- Revocability: Ensure revoked permissions prevent subsequent access.
- Integrity: Protect and verify audit records.

## Testing

Security testing should cover:

- Authentication and invalid credentials
- Unauthorized document access
- Document ownership and sharing permissions
- Access revocation
- Upload validation
- Encryption at rest
- Audit event recording and integrity verification
- Persistence of documents and permissions across restarts or redeployments

Only mark a test as passed after observing the expected behavior.

## Running the Project

1. Clone or download this repository.
2. Review the project's dependency and environment configuration.
3. Install the dependencies required by the configured stack.
4. Set the required environment variables and secrets.
5. Initialize the database and storage as documented by the implementation.
6. Start the application using the configured development command.

Refer to the project's actual package configuration and deployment instructions for the correct commands.

## Deployment

Published application: https://trust-vault-secure-document-sharing--adhimiriyala84.replit.app/

The deployment should be tested independently for authentication, authorization, storage persistence, and audit functionality.

## Future Improvements

- Stronger role-based access policies
- Additional document integrity checks
- Security monitoring and alerting
- More comprehensive automated security tests
- Improved audit reporting and export
- Persistent storage and backup verification

## Project Purpose

TrustVault demonstrates how document management can be designed around controlled access, confidentiality, and accountability rather than unrestricted sharing.

project Demo video link:https://go.screenpal.com/watch/cO6TXPny40r
