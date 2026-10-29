# M1 status

M1 schema groundwork is present and compiles:

- `reviewTargetVersionId` on products.
- Four-state template versions and revision fields.
- ScanJob findings/package-license columns.
- ProofCapture history table.
- Shared scan finding/review blocker enums and package license semantic fields.
- Final-design seller UI file selection and read-only review states.

The unfinished review/capture route is intentionally not registered in `app.ts` yet. It is not considered a delivered M1 feature until the following are complete and tested together:

- safe ZIP central-directory/stream handling with all limits and cleanup;
- proof URL DNS/IP pinning, redirects, timeouts, HTML normalization and active/superseded capture history;
- proof/preview upload validation and private storage;
- `deriveBlockers` used identically by queue, approve API and frontend;
- revision comparison inside approve transaction;
- correct request-changes version/product state behavior;
- M1 integration tests.

M0 remains the runnable milestone. No M1 endpoint currently bypasses these gates.
