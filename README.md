# SSH Lite Client (MVP)

Windows-first desktop app for quickly editing config files and scripts over SSH/SFTP.

## Current MVP features

- SSH connect with password or pasted private key
- Private-key file picker
- Remote directory browsing
- Open remote files
- Edit and save remote files
- Basic interactive SSH terminal pane
- Saved connection profiles (name/host/port/user/start path)
- Host key trust flow with saved fingerprints
- Lightweight single-window UI

## Run

```bash
npm install
npm run dev
```

## Notes

- This first version is intentionally minimal and optimized for speed.
- Profiles and trusted host fingerprints are stored in Electron app data.
- Next steps: key-agent support and safer privileged writes.
