# BiteClip v0.1.3

Visual overhaul and stability release.

## What's New

- **Decluttered Visual Redesign**: Replaced the split-column hero-sidebar layout with a single-column focused utility workspace.
- **Two-State Workspace Transitions**: Centered, minimal Welcome card for entering video URLs. Upon loading, the layout dynamically shifts to a full-width Audio Studio.
- **Unified Timeline Toolbar**: Playback actions (Play, Play Selection, Play From Start) and preset shortcuts (`3s`, `5s`, `10s`, `30s`) are now grouped in a clean toolbar below the trimmer.
- **Popover Settings**: Relocated default settings and length limits to a gear-activated floating popover, saving screen space.
- **Trimmer Ref-Mount Fix**: Resolved a critical loading failure where the trimmer ref failed to mount during the welcome-loading state. The editor now mounts immediately when a video begins loading and renders a visual skeleton loader over the waveform area.

## Downloads

- `BiteClip-Setup-0.1.3.exe` - recommended installer
- `BiteClip-Setup-0.1.3.zip` - portable zip build

## Update Behavior

Once released, clients on `v0.1.1` and `v0.1.2` can detect this update automatically via the internal "Check for Updates" tool.

## Windows Warning

This build is unsigned; Windows Defender SmartScreen warnings are expected during initial setup.
