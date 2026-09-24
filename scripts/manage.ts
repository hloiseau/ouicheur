import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import { database, dataDir } from "../lib/db.ts";
import { initializeOwner, setPassword } from "../lib/auth.ts";
import { backupInstance, restoreInstance } from "../lib/backup.ts";

let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const ask = createInterface({
  input: process.stdin,
  output,
  terminal: !!process.stdin.isTTY,
});
async function password() {
  process.stdout.write(
    "Nouveau mot de passe (12 caractères minimum, saisie masquée) : ",
  );
  muted = true;
  const first = await ask.question("");
  muted = false;
  process.stdout.write("\nConfirmez le mot de passe : ");
  muted = true;
  const second = await ask.question("");
  muted = false;
  process.stdout.write("\n");
  if (first !== second)
    throw new Error("Les mots de passe ne correspondent pas.");
  return first;
}
try {
  const command = process.argv[2];
  if (command === "setup") {
    const db = database();
    if (db.prepare("SELECT 1 FROM owner").get())
      throw new Error(
        "Instance déjà initialisée. Utilisez npm run password pour récupérer l’accès.",
      );
    const name = await ask.question("Pseudonyme du propriétaire : ");
    await initializeOwner(db, name, await password());
    console.log(
      "Propriétaire créé. Connectez-vous sur /admin pour configurer PayPal.Me et votre profil.",
    );
  } else if (command === "password") {
    await setPassword(database(), await password());
    console.log("Mot de passe remplacé et toutes les sessions révoquées.");
  } else if (command === "backup") {
    console.log(
      "Sauvegarde créée :",
      backupInstance(
        database(),
        dataDir(),
        process.argv[3] ||
          resolve("backups", new Date().toISOString().replace(/[:.]/g, "-")),
      ),
    );
  } else if (command === "restore") {
    if (!process.argv[3])
      throw new Error(
        "Usage : npm run restore -- chemin/sauvegarde [nouveau/dossier/donnees]",
      );
    console.log(
      "Sauvegarde restaurée :",
      restoreInstance(process.argv[3], process.argv[4] || dataDir()),
    );
  } else throw new Error("Commande inconnue.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Échec de la commande.",
  );
  process.exitCode = 1;
} finally {
  ask.close();
}
