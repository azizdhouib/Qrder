import { config } from "dotenv";
import path from "node:path";

/** À importer tout en haut de `server.ts` : les autres modules lisent `process.env` au chargement. */
config({ path: path.join(process.cwd(), ".env") });
config({ path: path.join(process.cwd(), "..", ".env"), override: false });
