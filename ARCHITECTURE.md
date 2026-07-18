# NetReceipt architecture

NetReceipt is a local-first Tauri application. React renders the dashboard and sends typed commands across the Tauri boundary; Rust owns monitoring, persistence, notifications, and file output.

## Frontend

- `src/domain.ts` contains the shared frontend domain model and display mappings.
- `src/api.ts` is the only module that invokes Tauri commands or opens native dialogs.
- `src/useMonitor.ts` owns application lifecycle, event subscriptions, and monitoring state.
- `src/App.tsx` composes the dashboard and settings flows.
- `src/components.tsx` contains small presentational components without native side effects.

UI code should call `monitorApi` instead of invoking Tauri commands directly. New event subscriptions belong in a hook and must always unregister on unmount.

The main window capability grants the default Tauri core API and only the save-dialog permission from the dialog plugin. The application CSP limits content to packaged assets plus the local IPC and development websocket endpoints.

## Backend

- `models.rs` defines persisted and serialized domain types and their validation.
- `database.rs` owns the SQLite schema and all queries.
- `monitor.rs` owns probes, status classification, worker lifecycle, and notifications.
- `history.rs` downsamples retained samples and derives summaries and confirmed incidents without changing the database schema.
- `export.rs` formats and writes timestamp-bounded Markdown reports and CSV evidence locally.
- `commands.rs` is the thin Tauri command boundary.
- `state.rs` contains process-level synchronized state.
- `main.rs` performs application composition: plugins, state, tray, and command registration.

Monitoring uses a generation token in addition to an enabled flag. A pause invalidates the current worker; a later resume creates a new generation, so rapid pause/resume actions cannot leave two sampling loops active.

`Sample.latencyMs` is the TCP connection time to the configured host on port 443. DNS resolution and HTTPS timings for that host remain in their dedicated fields. The dashboard uses the same configured threshold for each successful timing and treats partial probe failures as an uncertain connection rather than an initial loading state.

Worker persistence and dashboard emission failures are reported through the typed `monitor-error` event so the UI can surface them instead of silently losing a sample.

## Dependency direction

`main/commands -> monitor/database/export -> models`

The database, history, and export modules do not depend on Tauri. Probe classification, validation, aggregation, incident derivation, and serialization are testable without launching the desktop shell.

## Extension points

- Add a probe in `monitor.rs`, then extend `Sample` and the SQLite migration deliberately.
- Add a frontend command in `api.ts` only after registering a thin handler in `commands.rs`.
- Keep status classification backend-owned so tray notifications, exports, and the dashboard use one result.
