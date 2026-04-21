import { spawnSync } from "node:child_process";

const command = process.argv[2] ?? "test";
const keepContainer = process.argv.includes("--keep");
const containerName = process.env.OPENCLAW_TEST_POSTGRES_CONTAINER ?? "openclaw-test-postgres";
const hostPort = process.env.OPENCLAW_TEST_POSTGRES_PORT ?? "54329";
const database = process.env.OPENCLAW_TEST_POSTGRES_DB ?? "openclaw_test";
const username = process.env.OPENCLAW_TEST_POSTGRES_USER ?? "openclaw";
const password = process.env.OPENCLAW_TEST_POSTGRES_PASSWORD ?? "openclaw";
const image = process.env.OPENCLAW_TEST_POSTGRES_IMAGE ?? "postgres:16-alpine";
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? `postgres://${username}:${password}@127.0.0.1:${hostPort}/${database}`;

main();

function main() {
  assertDockerReady();

  switch (command) {
    case "up":
      startContainer();
      return;
    case "down":
      removeContainer();
      return;
    case "test":
      startContainer();
      try {
        runIntegrationTests();
      } finally {
        if (!keepContainer) {
          removeContainer();
        }
      }
      return;
    default:
      console.error(`Unknown command "${command}". Use up, down, or test.`);
      process.exit(1);
  }
}

function assertDockerReady() {
  const result = runCommand("docker", ["info"], {
    allowFailure: true,
    stdio: "pipe"
  });

  if (result.status === 0) {
    return;
  }

  console.error("Docker Desktop must be running before local Postgres integration can start.");
  console.error("Expected daemon: Docker Desktop / local Docker engine.");
  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }
  process.exit(result.status || 1);
}

function startContainer() {
  removeContainer();

  const args = [
    "run",
    "--name",
    containerName,
    "--detach",
    "--publish",
    `${hostPort}:5432`,
    "--health-cmd",
    `pg_isready -U ${username} -d ${database}`,
    "--health-interval",
    "1s",
    "--health-timeout",
    "5s",
    "--health-retries",
    "30",
    "--env",
    `POSTGRES_USER=${username}`,
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    "--env",
    `POSTGRES_DB=${database}`,
    image
  ];

  runCommand("docker", args, { stdio: "inherit" });
  waitForHealthyContainer();
  console.log(`Local test Postgres is ready at ${testDatabaseUrl}`);
}

function waitForHealthyContainer() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const inspect = runCommand(
      "docker",
      ["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", containerName],
      {
        allowFailure: true,
        stdio: "pipe"
      }
    );

    const status = inspect.stdout.trim();
    if (inspect.status === 0 && status === "healthy") {
      return;
    }

    if (inspect.status === 0 && status === "exited") {
      console.error(`Container ${containerName} exited before becoming healthy.`);
      process.exit(1);
    }

    sleep(1000);
  }

  console.error(`Container ${containerName} did not become healthy in time.`);
  process.exit(1);
}

function runIntegrationTests() {
  console.log(`Running bridge integration tests with TEST_DATABASE_URL=${testDatabaseUrl}`);
  runCommand("npm", ["run", "test:integration"], {
    stdio: "inherit",
    env: {
      ...process.env,
      TEST_DATABASE_URL: testDatabaseUrl
    }
  });
}

function removeContainer() {
  runCommand("docker", ["rm", "-f", containerName], {
    allowFailure: true,
    stdio: "pipe"
  });
}

function runCommand(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.stdio ?? "inherit",
    env: options.env ?? process.env
  });

  if (!options.allowFailure && result.status !== 0) {
    process.exit(result.status || 1);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy wait is acceptable here because this script only orchestrates local setup.
  }
}
