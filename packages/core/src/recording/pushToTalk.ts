export type PushToTalkReleaseDisposition =
  | 'cancel-pending-start'
  | 'debounce-release'
  | 'ignore';

export const resolvePushToTalkReleaseDisposition = ({
  holdStartPending,
  recordingActive,
  recordingStartInProgress,
}: {
  holdStartPending: boolean;
  recordingActive: boolean;
  recordingStartInProgress: boolean;
}): PushToTalkReleaseDisposition => {
  if (holdStartPending) return 'cancel-pending-start';
  if (recordingActive || recordingStartInProgress) return 'debounce-release';
  return 'ignore';
};
