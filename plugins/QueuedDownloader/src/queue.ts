import { safeInterval, type MediaCollection, type MediaItem } from "@luna/lib";

import { getDownloadPath, getFileName } from "./helpers";
import { settings } from "./settingsStore";
import { trace, unloads } from "./tracer";

/** How often the active track's byte progress is polled, in ms. */
const PROGRESS_INTERVAL = 200;
/** Finished jobs kept in the list for the settings panel before the oldest are dropped. */
const MAX_HISTORY = 20;

export type JobStatus = "queued" | "active" | "completed" | "failed" | "cancelled";

export type TrackProgress = {
	title: string;
	downloaded: number;
	total: number;
	percent: number;
};

export type DownloadJob = {
	readonly id: number;
	readonly label: string;
	readonly trackCount: number;
	readonly collection: MediaCollection;
	/** Chosen when the job was queued. Undefined means prompt for a path per track. */
	readonly downloadFolder?: string;
	status: JobStatus;
	completed: number;
	failed: number;
	error?: string;
	current?: TrackProgress;
};

const isPending = (job: DownloadJob) => job.status === "queued" || job.status === "active";

class Queue {
	private readonly jobs: DownloadJob[] = [];
	private readonly listeners: Set<() => void> = new Set();
	private nextId = 1;
	private draining = false;
	/** Set to stop the active job after the track it is currently downloading. */
	private cancelActive = false;

	/** Subscribe to queue changes. Returns an unsubscribe function. */
	public subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => void this.listeners.delete(listener);
	}
	private emit() {
		for (const listener of this.listeners) listener();
	}

	public getJobs(): DownloadJob[] {
		return [...this.jobs];
	}
	public get activeJob(): DownloadJob | undefined {
		return this.jobs.find((job) => job.status === "active");
	}
	/** Jobs still to be downloaded, including the one in progress. */
	public get pendingCount(): number {
		return this.jobs.filter(isPending).length;
	}

	/**
	 * Add a collection to the download queue and start draining if idle.
	 * `downloadFolder` must be resolved by the caller while the click is still in hand,
	 * otherwise a folder picker would ambush the user once the job reaches the front.
	 */
	public async enqueue(collection: MediaCollection, downloadFolder?: string): Promise<DownloadJob | undefined> {
		const trackCount = await collection.count();
		if (trackCount === 0) return;

		const label = (await collection.title()) ?? `${trackCount} tracks`;

		// Double clicking the context menu button shouldn't queue the same thing twice
		const duplicate = this.jobs.find((job) => isPending(job) && job.label === label && job.trackCount === trackCount);
		if (duplicate !== undefined) {
			trace.msg.log(`${label} is already in the download queue`);
			return duplicate;
		}

		const job: DownloadJob = {
			id: this.nextId++,
			label,
			trackCount,
			collection,
			downloadFolder,
			status: "queued",
			completed: 0,
			failed: 0,
		};
		this.jobs.push(job);
		this.emit();

		void this.drain();
		return job;
	}

	/** Cancel a job. Queued jobs drop out immediately, the active job stops after the current track. */
	public cancel(id: number) {
		const job = this.jobs.find((candidate) => candidate.id === id);
		if (job === undefined || !isPending(job)) return;
		if (job.status === "active") this.cancelActive = true;
		else job.status = "cancelled";
		this.emit();
	}

	/** Cancel every pending job. */
	public cancelAll() {
		for (const job of this.jobs) {
			if (job.status === "queued") job.status = "cancelled";
			else if (job.status === "active") this.cancelActive = true;
		}
		this.emit();
	}

	/** Drop a finished job from the list. Pending jobs are cancelled instead. */
	public remove(id: number) {
		const index = this.jobs.findIndex((job) => job.id === id);
		if (index === -1) return;
		if (isPending(this.jobs[index])) return this.cancel(id);
		this.jobs.splice(index, 1);
		this.emit();
	}

	/** Drop every finished job from the list. */
	public clearFinished() {
		for (let index = this.jobs.length - 1; index >= 0; index--) {
			if (!isPending(this.jobs[index])) this.jobs.splice(index, 1);
		}
		this.emit();
	}

	private async drain() {
		if (this.draining) return;
		this.draining = true;
		try {
			while (true) {
				const job = this.jobs.find((candidate) => candidate.status === "queued");
				if (job === undefined) break;
				await this.runJob(job);
			}
		} finally {
			this.draining = false;
			this.trimHistory();
			this.emit();
		}
	}

	private async runJob(job: DownloadJob) {
		job.status = "active";
		this.cancelActive = false;
		this.emit();
		try {
			for await (const mediaItem of await job.collection.mediaItems()) {
				if (this.cancelActive) break;
				if (!(await this.downloadTrack(job, mediaItem))) break;
			}
			if (this.cancelActive) job.status = "cancelled";
			else if (job.failed > 0) job.status = "failed";
			else job.status = "completed";
		} catch (err) {
			job.status = "failed";
			job.error = err instanceof Error ? err.message : String(err);
			trace.msg.err.withContext(`Failed to download ${job.label}`)(err);
		} finally {
			job.current = undefined;
			this.cancelActive = false;
			this.emit();
		}
	}

	/** Downloads a single track. Returns false if the job should stop. */
	private async downloadTrack(job: DownloadJob, mediaItem: MediaItem): Promise<boolean> {
		if (settings.useRealMAX) mediaItem = (await mediaItem.max()) ?? mediaItem;

		const { tags } = await mediaItem.flacTags();
		const title = tags.title ?? job.label;
		job.current = { title, downloaded: 0, total: 0, percent: 0 };
		this.emit();

		const fileName = await getFileName(mediaItem, settings.downloadQuality);
		const path = job.downloadFolder !== undefined ? [job.downloadFolder, fileName] : await getDownloadPath(fileName);
		// No path means the save dialog was dismissed, treat that as cancelling the job
		if (path === undefined) {
			this.cancelActive = true;
			return false;
		}

		const stopPolling = safeInterval(
			unloads,
			async () => {
				const progress = await mediaItem.downloadProgress();
				if (progress === undefined || job.current === undefined) return;
				const { total, downloaded } = progress;
				if (total === undefined || downloaded === undefined) return;
				job.current.total = total;
				job.current.downloaded = downloaded;
				job.current.percent = total === 0 ? 0 : (downloaded / total) * 100;
				this.emit();
			},
			PROGRESS_INTERVAL,
		);
		try {
			await mediaItem.download(path, settings.downloadQuality);
			job.completed++;
			// Peg to 100%, the last poll usually lands a little short of the total
			if (job.current !== undefined) {
				job.current.percent = 100;
				if (job.current.total > 0) job.current.downloaded = job.current.total;
			}
		} catch (err) {
			job.failed++;
			trace.msg.err.withContext(`Failed to download ${title}`)(err);
		} finally {
			stopPolling();
			// safeInterval registers the unload but clearing it doesn't deregister,
			// so drop it by hand or the set grows by one per downloaded track
			unloads.delete(stopPolling);
			// Deliberately not clearing job.current: the next track doesn't set it until
			// max() and flacTags() return, and blanking it leaves the status pill empty
			// for that whole gap. runJob clears it once the job is actually over.
			this.emit();
		}
		return true;
	}

	private trimHistory() {
		const finished = this.jobs.filter((job) => !isPending(job));
		for (const job of finished.slice(0, Math.max(0, finished.length - MAX_HISTORY))) {
			this.jobs.splice(this.jobs.indexOf(job), 1);
		}
	}
}

export const DownloadQueue = new Queue();
