import { workerData, parentPort } from "node:worker_threads";
import { openDatabase } from "../lib/db.ts";
import { createReservation } from "../lib/reservations.ts";
const db = openDatabase(workerData.path);
try {
  createReservation(db, workerData.input);
  parentPort.postMessage("reserved");
} catch (error) {
  parentPort.postMessage(error.status);
} finally {
  db.close();
}
