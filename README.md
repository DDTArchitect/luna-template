# Queued Downloader

A [TidaLuna](https://github.com/Inrixia/TidaLuna) plugin for downloading Tidal tracks as FLAC — like Inrixia's [Song Downloader](https://github.com/Inrixia/luna-plugins#SongDownloader), but with a real download queue behind it.

## Why

In Song Downloader, picking **Download** on a second album while the first is still running cancels the first and drops the second. Nothing finishes. That falls out of the plugin sharing one context menu button and one `downloadState` flag between every media item — clicking again takes the "stop the current download" branch.

Queued Downloader keeps one job per collection and drains them in order, so a second click queues instead of cancelling.

The underlying transfers were never parallel anyway: TidaLuna's native download layer already serialises them behind a `Semaphore(1)`. What was missing was the ordering on top.

## What you get

- **Right click → Download** an album, playlist, or track selection. Click again on something else and it queues behind the first.
- **A floating status pill** showing the active job, the current track, bytes and percent. When jobs are waiting it lists them underneath — what is queued, in order, each droppable with its own ✕. The `N jobs` chip collapses the list if you would rather just see the active download.
- **A queue panel in settings** with live status per job, plus history of what completed, failed, or was cancelled.
- **Cancel** from the context menu (everything) or per job from the pill and settings. The track currently transferring finishes — TidaLuna streams straight to disk, so there is no mid-file abort — then the queue stops.
- **Failed tracks are counted and reported** rather than silently skipped.

Everything from Song Downloader still works: quality selection, RealMAX lookup, default save folder, and the `{artist}/{album}/{title}` path format.

## Installing

Add this store URL in **Luna Settings → Plugin Store**:

```
https://github.com/DDTArchitect/queued-downloader/releases/download/latest/store.json
```

Then install **Queued Downloader** from it.

> If you already have Inrixia's Song Downloader installed, disable one of them. Both add a Download entry to the context menu, and running both means two buttons and two independent queues.

## Developing

```sh
git clone https://github.com/DDTArchitect/queued-downloader
cd queued-downloader
pnpm install
pnpm run watch
```

A **DEV** store appears under **Plugin Store** in Luna Settings while `watch` is running. Enable live reload on the plugin (the antenna icon in the Plugins tab) to pick up rebuilds automatically — Luna resets that toggle every time the client starts.

## Credit & licence

This started as a fork of **Song Downloader** by [Inrixia](https://github.com/Inrixia), from [Inrixia/luna-plugins](https://github.com/Inrixia/luna-plugins). The downloading, tagging, filename formatting, and settings are theirs; the queue, status pill, and cancellation model are the changes here.

The bulk-download stop behaviour this replaces came from [luna-plugins#240](https://github.com/Inrixia/luna-plugins/pull/240) by np3ir. That capability is preserved — it just lives on its own context menu entry instead of overloading the Download button, so cancelling no longer means losing the album you were trying to queue.

Licensed under **AGPL-3.0**, the same as the original.
