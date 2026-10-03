import { AppError } from "./validation.ts";

// A process-local cap. Instance-wide automatic extraction quotas remain in SQLite.
export function boundedWork(
  limit: number,
  waitingLimit: number,
  waitMs: number,
) {
  let active = 0;
  const waiting: { ready: () => void; timer: ReturnType<typeof setTimeout> }[] =
    [];
  const busy = () =>
    new AppError("Le serveur est occupé. Réessayez dans un instant.", 503);
  return async function run<T>(work: () => Promise<T>): Promise<T> {
    if (active < limit) active++;
    else {
      if (waiting.length >= waitingLimit) throw busy();
      await new Promise<void>((resolve, reject) => {
        const entry = {
          ready: resolve,
          timer: setTimeout(() => {
            const index = waiting.indexOf(entry);
            if (index >= 0) waiting.splice(index, 1);
            reject(busy());
          }, waitMs),
        };
        waiting.push(entry);
      });
    }
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        next.ready();
      } else active--;
    }
  };
}
