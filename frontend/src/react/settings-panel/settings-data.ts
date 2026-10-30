/* Five server-side datasets for settings preferences and Peach configuration, each with its own Query key.
 *
 * - `['settings']`：跟数据库走、所有访问端同一份的那几项（`/api/settings`，`src/peach/web_settings.py`）。
 *   面板每次打开都重取一次，取回来交给壳对账（`host.syncRemote`）：界面偏好的真相仍是壳里那一份
 *   `appSettings`，这个键只是数据库那边的快照。写入同样走这个端点，成功后回来的整份写回这个键。
 * - `['follow-schedule']`：这台机器上关注自动更新的档位与上次运行状态。
 * - `['feed-schedule']`: scheduled-fetch tiers and last run status of feeds, same shape as above, read-only.
 * - `['thumbnail-jobs']`: tiers and state of video thumbnail collection. Tiers follow the machine and are not stored in the browser.
 * - `['media-processing']`: whether this machine generates previews, plus the codecs for frame extraction and transcoding. The settings page's "Video previews" and
 *    "Video playback" cards read and write the same one.
 *
 * 面板常驻不卸载，每次打开重取设置；Peach 配置在挂载时重取各自的数据。 */
import { useMutation, type QueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '../../api';
import { queryClient } from '../query';

export const SETTINGS_URL = '/api/settings';
export const FOLLOW_SCHEDULE_URL = '/api/follow/schedule';
export const FEED_SCHEDULE_URL = '/api/feeds/schedule';
export const THUMBNAIL_JOBS_URL = '/api/thumbnail-jobs';

export const SETTINGS_KEY = ['settings'] as const;
export const FOLLOW_SCHEDULE_KEY = ['follow-schedule'] as const;
export const FEED_SCHEDULE_KEY = ['feed-schedule'] as const;
export const THUMBNAIL_JOBS_KEY = ['thumbnail-jobs'] as const;
export const MEDIA_PROCESSING_URL = '/api/media-processing';
export const MEDIA_PROCESSING_KEY = ['media-processing'] as const;

/** `/api/media-processing` whole payload; a write sends only the changed item, and what comes back is still the whole payload. */
export interface MediaProcessingPolicy {
  metadata_only: boolean;
  preview_acceleration?: 'auto' | 'software';
  playback_acceleration?: 'auto' | 'software';
}
export const fetchMediaProcessing = (signal?: AbortSignal) =>
  apiGet<MediaProcessingPolicy>(MEDIA_PROCESSING_URL, signal);

/** `q_settings` 返回的整份；写入时只送改了的那几个键，回来的仍是整份。 */
export interface SyncedSettings {
  performerNameLanguage?: 'zh-CN' | 'ja';
  sidebarOrder?: string[];
  followInitialDays?: number;
  postSetupTutorialDone?: boolean;
  feedHideGroupCompilations?: boolean;
  feedHideSoloCompilations?: boolean;
  feedHideExcerpts?: boolean;
  /** 数据库里还没存过时是 null：这台设备本地那个数替所有访问端先定下来。 */
  searchHistoryLimit?: number | null;
  /** Code recognition rules, one regex per rule; edited on the settings page under "Library & import". */
  codePatterns?: string[];
}

export interface FollowScheduleStatus {
  available: boolean;
  enabled: boolean;
  interval_minutes: number;
  running?: boolean;
  last_error?: string | null;
  last_finished_at?: string | null;
  last_added?: number | null;
  next_run_at?: string | null;
  /** Number of consecutive failed rounds; from the second one the next round is pushed back by a multiplier. */
  consecutive_failures?: number;
}

export interface ThumbnailJobStatus {
  mode: string;
  status: 'idle' | 'running' | 'failed' | 'complete' | string;
  stopped?: string;
}

export const fetchSettings = (signal?: AbortSignal) => apiGet<SyncedSettings>(SETTINGS_URL, signal);
export const fetchFollowSchedule = (signal?: AbortSignal) =>
  apiGet<FollowScheduleStatus>(FOLLOW_SCHEDULE_URL, signal);
export const fetchFeedSchedule = (signal?: AbortSignal) =>
  apiGet<FollowScheduleStatus>(FEED_SCHEDULE_URL, signal);
export const fetchThumbnailJobs = (signal?: AbortSignal) =>
  apiGet<ThumbnailJobStatus>(THUMBNAIL_JOBS_URL, signal);

/** 打开偏好弹窗时重取共享设置；采集状态由 Peach 配置中的控件读取。 */
export function refreshPanelData(client: QueryClient = queryClient): Promise<SyncedSettings | null> {
  return client.fetchQuery({
    queryKey: SETTINGS_KEY, queryFn: ({ signal }) => fetchSettings(signal), staleTime: 0,
  }).catch(() => null);
}

/** 写跟数据库走的那几项。回来的是合并之后的整份，写回 `['settings']`。 */
export function useSaveSettings() {
  return useMutation({
    mutationFn: (patch: SyncedSettings) => apiSend<SyncedSettings>(SETTINGS_URL, patch),
    onSuccess: (saved) => queryClient.setQueryData(SETTINGS_KEY, saved),
  });
}

export function useSaveFollowSchedule() {
  return useMutation({
    mutationFn: (minutes: number) => apiSend<FollowScheduleStatus>(FOLLOW_SCHEDULE_URL,
      { enabled: minutes > 0, interval_minutes: minutes || 60 }),
    onSuccess: (status) => queryClient.setQueryData(FOLLOW_SCHEDULE_KEY, status),
  });
}

/** "Rerun now" for each of the two schedules: the server pulls the next round forward to now, and the returned state is already marked running. */
export const SCHEDULE_RUNS = {
  follow: { url: `${FOLLOW_SCHEDULE_URL}/run`, key: FOLLOW_SCHEDULE_KEY },
  feed: { url: `${FEED_SCHEDULE_URL}/run`, key: FEED_SCHEDULE_KEY },
} as const;

export function useRunSchedule(kind: keyof typeof SCHEDULE_RUNS) {
  const { url, key } = SCHEDULE_RUNS[kind];
  return useMutation({
    mutationFn: () => apiSend<FollowScheduleStatus>(url, {}),
    onSuccess: (status) => queryClient.setQueryData(key, status),
  });
}

/** While a schedule is running, refetch every three seconds; stop when it finishes, and the failure reason appears or disappears accordingly. */
export const schedulePollInterval = (data: FollowScheduleStatus | undefined) => data?.running ? 3_000 : false;

export function useSaveThumbnailMode() {
  return useMutation({
    mutationFn: (mode: string) => apiSend<ThumbnailJobStatus>(THUMBNAIL_JOBS_URL, { mode }),
    onSuccess: (status) => queryClient.setQueryData(THUMBNAIL_JOBS_KEY, status),
  });
}
