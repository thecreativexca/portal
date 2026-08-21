import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

async function main() {
  const { default: dbConnect } = await import("../lib/db");
  const { default: User } = await import("../models/User");

  await dbConnect();

  const updated = await User.findOneAndUpdate(
    { role: "ceo", status: "active" },
    { email: "thecreativex.ca@gmail.com", fullName: "CEO Admin" },
    { new: true }
  );

  if (!updated) {
    console.error("CEO user not found");
    process.exit(1);
  }

  console.log("Updated CEO email to:", updated.email);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
