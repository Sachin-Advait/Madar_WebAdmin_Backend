import { openDatabase } from "./services/api/src/db.mjs";
import { hashPassword } from "./services/api/src/domain.mjs";

const db = await openDatabase();
const hash = await hashPassword("Admin@123Madar!");
const r = await db.query(
  "UPDATE users SET password_hash=$2, active=true WHERE email=$1 RETURNING email, role",
  ["admin@madar.local", hash],
);
console.log(r.rows);
process.exit(0);
