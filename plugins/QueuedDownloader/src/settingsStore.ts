import { ReactiveStore } from "@luna/core";
import { Quality, type redux } from "@luna/lib";

export const defaultFilenameFormat = "{artist} - {album} - {title}";

export type Settings = {
	downloadQuality: redux.AudioQuality;
	defaultPath?: string;
	pathFormat: string;
	useRealMAX: boolean;
};

// Kept apart from Settings.tsx so helpers/queue can read settings without
// pulling in the React component (and the import cycle that came with it)
export const settings = await ReactiveStore.getPluginStorage<Settings>("QueuedDownloader", {
	downloadQuality: Quality.Max.audioQuality,
	pathFormat: defaultFilenameFormat,
	useRealMAX: true,
});

// Sanitize download quality
if (Quality.fromAudioQuality(settings.downloadQuality) === undefined) settings.downloadQuality = Quality.Max.audioQuality;
