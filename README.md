# SSH Lite Client (MVP)

Windows-first desktop app for quickly editing config files and scripts over SSH/SFTP.

## Current MVP features

- SSH connect with password or pasted private key
- Remote directory browsing
- Open remote files
- Edit and save remote files
- Lightweight single-window UI

## Run

```bash
npm install
npm run dev
```

## Notes

- This first version is intentionally minimal and optimized for speed.
- SSH host key trust + known hosts UX is not implemented yet.
- Next steps: persistent profiles, terminal pane, key-file loading, and safer privileged writes.
