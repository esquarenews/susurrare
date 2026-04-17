export const createCoalescedAsyncRunner = (task: () => Promise<void>) => {
  let inFlight: Promise<void> | null = null;
  let rerunRequested = false;

  const runLoop = async () => {
    do {
      rerunRequested = false;
      await task();
    } while (rerunRequested);
  };

  return async () => {
    if (inFlight) {
      rerunRequested = true;
      await inFlight;
      return;
    }
    inFlight = runLoop().finally(() => {
      inFlight = null;
    });
    await inFlight;
  };
};
