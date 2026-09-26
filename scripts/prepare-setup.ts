import { openDatabase } from "../lib/db.ts";
import { prepareSetup } from "../lib/setup.ts";

const db = openDatabase();
try {
  const code = prepareSetup(db);
  if (code) {
    console.log("\nOuicheur — first-time setup");
    console.log("Open the app in your browser to create your account.");
    console.log(`Setup code: ${code}`);
    console.log(
      "This code is private and will be disabled once the owner account is created.\n",
    );
  }
} finally {
  db.close();
}
