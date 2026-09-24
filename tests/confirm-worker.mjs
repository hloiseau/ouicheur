import { workerData, parentPort } from "node:worker_threads";
import { openDatabase } from "../lib/db.ts";
import { confirmManual } from "../lib/payments.ts";
const db = openDatabase(workerData.path);
try {
  parentPort.postMessage(confirmManual(db, workerData.input));
} finally {
  db.close();
}
