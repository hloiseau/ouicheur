import { database } from "../lib/db.ts";
import { runMaintenance } from "../lib/operations.ts";
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    await runMaintenance(database());
  } catch {
    console.error(
      "Ouicheur maintenance failed; check the administration dashboard.",
    );
  } finally {
    running = false;
  }
}
setInterval(() => void tick(), 60000).unref();
void tick();
