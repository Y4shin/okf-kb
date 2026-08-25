# @okf-kb/auth

Shared auth token for the OKF knowledge-base CLI and daemon.

`@okf-kb/auth` exports `getOrMintToken()` and `GetOrMintTokenOptions`. It resolves the daemon Bearer token in this order:

1. The `KB_TOKEN` environment variable (wins, useful for containers and remote clients)
2. The OS keyring entry for service `'kb'`, account `'daemon'`
3. A freshly minted random token, stored in the keyring for next time

If the keyring is unavailable (for example, in headless CI), the function returns the environment token or the minted token in-memory.

## Install

```bash
npm install @okf-kb/auth
```

## Usage

```typescript
import { getOrMintToken } from '@okf-kb/auth';

const token = getOrMintToken();
```

## Why a separate package?

Both the `okfkb` CLI (client) and `okfkbd` daemon (server) need to agree on the token without passing it on the command line. Pulling auth into its own package lets the CLI depend on `@okf-kb/auth` + `@okf-kb/protocol` while staying far away from `@okf-kb/fs` and its ~95 MB of transitive native/ML dependencies. The daemon can depend on `@okf-kb/auth` alongside `@okf-kb/fs` without introducing a cycle.
