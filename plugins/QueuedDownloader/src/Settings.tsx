import { MediaItem, Quality } from "@luna/lib";
import {
	LunaButtonSetting,
	LunaSelectItem,
	LunaSelectSetting,
	LunaSetting,
	LunaSettings,
	LunaSwitchSetting,
	LunaTextSetting,
	LunaTrashButton,
} from "@luna/ui";

import React from "react";
import { getDownloadFolder } from "./helpers";
import { DownloadQueue, type DownloadJob } from "./queue";
import { settings } from "./settingsStore";

const jobDescription = (job: DownloadJob) => {
	switch (job.status) {
		case "queued":
			return `Queued · ${job.trackCount} tracks`;
		case "active": {
			const current = job.current;
			const progress = current === undefined ? "Preparing..." : `${current.title} ${current.percent.toFixed(0)}%`;
			return `${job.completed + job.failed}/${job.trackCount} · ${progress}`;
		}
		case "completed":
			return `Done · ${job.completed} tracks`;
		case "failed":
			return job.error ?? `${job.completed} downloaded, ${job.failed} failed`;
		case "cancelled":
			return `Cancelled after ${job.completed} tracks`;
	}
};

const QueuePanel = () => {
	const [jobs, setJobs] = React.useState(() => DownloadQueue.getJobs());
	React.useEffect(() => DownloadQueue.subscribe(() => setJobs(DownloadQueue.getJobs())), []);

	if (jobs.length === 0) return null;

	const pending = jobs.filter((job) => job.status === "queued" || job.status === "active").length;
	return (
		<LunaSettings title="Download queue" desc="Downloads run one at a time, in the order they were queued.">
			{jobs.map((job) => (
				<LunaSetting key={job.id} title={job.label} desc={jobDescription(job)}>
					<LunaTrashButton
						sx={{ marginLeft: "auto", marginRight: 2 }}
						title={job.status === "active" ? "Stop after this track" : "Remove"}
						onClick={() => DownloadQueue.remove(job.id)}
					/>
				</LunaSetting>
			))}
			{pending > 0 ? (
				<LunaButtonSetting
					title="Cancel all"
					desc="The track being downloaded finishes, nothing after it starts"
					children={`Cancel ${pending} pending`}
					onClick={() => DownloadQueue.cancelAll()}
				/>
			) : (
				<LunaButtonSetting title="Clear history" children="Clear finished" onClick={() => DownloadQueue.clearFinished()} />
			)}
		</LunaSettings>
	);
};

export const Settings = () => {
	const [downloadQuality, setDownloadQuality] = React.useState(settings.downloadQuality);
	const [defaultPath, setDefaultPath] = React.useState(settings.defaultPath);
	const [pathFormat, setPathFormat] = React.useState(settings.pathFormat);
	const [useRealMAX, setUseRealMAX] = React.useState(settings.useRealMAX);

	return (
		<>
			<LunaSettings>
				<LunaSelectSetting
					title="Download quality"
					value={downloadQuality}
					onChange={(e) => setDownloadQuality((settings.downloadQuality = e.target.value))}
				>
					{Object.values(Quality.lookups.audioQuality).map((quality) => {
						if (typeof quality !== "string" && quality.audioQuality !== Quality.MQA.audioQuality)
							return <LunaSelectItem key={quality.name} value={quality.audioQuality} children={quality.name} />;
					})}
				</LunaSelectSetting>
				<LunaSwitchSetting
					title="Use RealMAX to find the highest quality"
					value={useRealMAX}
					onChange={(_, checked) => setUseRealMAX((settings.useRealMAX = checked))}
				/>
				<LunaButtonSetting
					title="Default save path"
					desc={
						<>
							Set a default folder to save files to (will disable prompting for path on download)
							{defaultPath && (
								<>
									<br />
									Using {defaultPath}
								</>
							)}
						</>
					}
					children={defaultPath === undefined ? "Set default folder" : "Clear default folder"}
					onClick={async () => {
						if (defaultPath !== undefined) return setDefaultPath((settings.defaultPath = undefined));
						setDefaultPath((settings.defaultPath = await getDownloadFolder()));
					}}
				/>
				<LunaTextSetting
					title="Path format"
					desc={
						<>
							Define subfolders using <b>/</b>.
							<br />
							For example: {"{artist}/{album}/{title}"}
							<br />
							Saves in subfolder artist/album/ named <b>title.flac</b>.
							<div style={{ marginTop: 8 }} />
							You can use the following tags:
							<ul>
								{MediaItem.availableTags.map((tag) => (
									<li key={tag}>{tag}</li>
								))}
							</ul>
						</>
					}
					value={pathFormat}
					onChange={(e) => setPathFormat((settings.pathFormat = e.target.value))}
				/>
			</LunaSettings>
			<QueuePanel />
		</>
	);
};
