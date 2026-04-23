const { spawnSync } = require("node:child_process");

if (process.env.VERCEL) {
  console.log("Skipping server Prisma generate during Vercel install.");
  process.exit(0);
}

const result = spawnSync("npm", ["run", "prisma:generate", "--workspace", "server"], {
  stdio: "inherit",
  shell: true
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
