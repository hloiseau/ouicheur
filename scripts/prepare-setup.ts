import { openDatabase } from "../lib/db.ts";
import { prepareSetup } from "../lib/setup.ts";

const db = openDatabase();
try {
  const code = prepareSetup(db);
  if (code) {
    console.log("\nWishlister — première installation");
    console.log(
      "Ouvrez l’application dans votre navigateur pour créer votre compte.",
    );
    console.log(`Code d’installation : ${code}`);
    console.log(
      "Ce code est privé et sera désactivé après la création du propriétaire.\n",
    );
  }
} finally {
  db.close();
}
