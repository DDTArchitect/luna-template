import { DownloadQueue } from "./queue";
import { unloads } from "./tracer";

const asMB = (bytes: number) => (bytes / 1048576).toFixed(0);

/**
 * A floating progress indicator for the active download.
 *
 * The context menu button is a poor place for this: it is shared between every
 * media item and gets overwritten whenever any context menu is opened.
 */
export const initStatusPill = () => {
	const pill = document.createElement("div");
	pill.className = "queued-downloader-pill";

	const row = document.createElement("div");
	row.className = "queued-downloader-pill-row";

	const text = document.createElement("div");
	text.className = "queued-downloader-pill-text";

	const title = document.createElement("span");
	title.className = "queued-downloader-pill-title";
	const detail = document.createElement("span");
	detail.className = "queued-downloader-pill-detail";
	text.append(title, detail);

	const expand = document.createElement("button");
	expand.className = "queued-downloader-pill-expand";
	expand.onclick = () => {
		pill.classList.toggle("expanded");
		render();
	};

	const cancel = document.createElement("button");
	cancel.className = "queued-downloader-pill-cancel";
	cancel.title = "Cancel everything";
	cancel.innerText = "✕";
	cancel.onclick = () => DownloadQueue.cancelAll();

	row.append(text, expand, cancel);

	const list = document.createElement("ol");
	list.className = "queued-downloader-pill-list";

	pill.append(row, list);
	document.body.appendChild(pill);
	unloads.add(() => pill.remove());

	// Rebuilding the rows on every progress tick would throw away clicks mid-press,
	// so only redraw when the set of queued jobs actually changes
	let renderedIds = "";
	const renderList = () => {
		const queued = DownloadQueue.getJobs().filter((job) => job.status === "queued");
		const ids = queued.map((job) => job.id).join(",");
		if (ids === renderedIds) return;
		renderedIds = ids;

		list.replaceChildren(
			...queued.map((job) => {
				const item = document.createElement("li");

				const name = document.createElement("span");
				name.className = "queued-downloader-pill-list-name";
				name.innerText = `${job.label} — ${job.trackCount} tracks`;

				const drop = document.createElement("button");
				drop.className = "queued-downloader-pill-cancel";
				drop.title = `Remove ${job.label} from the queue`;
				drop.innerText = "✕";
				drop.onclick = () => DownloadQueue.cancel(job.id);

				item.append(name, drop);
				return item;
			}),
		);
	};

	const render = () => {
		const job = DownloadQueue.activeJob;
		if (job === undefined) {
			pill.classList.remove("visible", "expanded");
			return;
		}
		pill.classList.add("visible");

		const done = Math.min(job.completed + job.failed + 1, job.trackCount);
		title.innerText = `${job.label} — ${done}/${job.trackCount}`;

		const parts: string[] = [];
		if (job.current === undefined) {
			// Only until the first track of a job has had its tags loaded
			parts.push("Preparing...");
		} else {
			parts.push(job.current.title);
			if (job.current.total > 0) {
				parts.push(`${asMB(job.current.downloaded)}/${asMB(job.current.total)}MB`);
				parts.push(`${job.current.percent.toFixed(0)}%`);
			}
		}
		detail.innerText = parts.join(" · ");

		const queued = DownloadQueue.pendingCount - 1;
		if (queued === 0) pill.classList.remove("expanded");
		const expanded = pill.classList.contains("expanded");
		expand.hidden = queued === 0;
		// "jobs", not a bare count — the line around it is all track-level numbers
		expand.innerText = `${queued} job${queued === 1 ? "" : "s"} ${expanded ? "▴" : "▾"}`;
		expand.title = expanded ? "Hide the queue" : "Show what else is queued";
		renderList();

		pill.style.setProperty("--progress", `${job.current?.percent ?? 0}%`);
	};

	unloads.add(DownloadQueue.subscribe(render));
	render();
};
