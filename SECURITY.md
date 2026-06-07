# Security

DeepX stores local runtime state under `data/`. Before publishing a fork, release, or screenshot, check that the following are absent:

- `data/secrets.local.json`
- `.env`
- API keys, bearer tokens, cookies, and private credentials
- personal absolute paths
- account-login URLs from unrelated products

Run the packaged self-contained check before release:

```powershell
npm run check:self-contained
```

The first public version defaults to read-only workspace tools. Write operations and shell execution should remain gated by explicit user permission.
