# BiteClip v0.1.1

Adds the first auto-update path for future BiteClip desktop releases.

## What's New

- Added Electron auto-update support through GitHub Releases.
- Packaged BiteClip checks for updates shortly after launch.
- Added a desktop app menu item: `BiteClip > Check for Updates`.
- Users are prompted before downloading and before restarting to install.

## Downloads

- `BiteClip Setup 0.1.1.exe` - recommended installer
- `BiteClip-0.1.1-win.zip` - portable zip build

## Important Upgrade Note

Version `0.1.0` did not include auto-update support. Users on `0.1.0` need to manually download and install `0.1.1` once. After that, future releases can notify them through the app.

## Windows Warning

This build is still unsigned. Windows SmartScreen may show an "unknown publisher" warning. Code signing is the next distribution-quality improvement.
