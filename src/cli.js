import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { acceptRaw } from "./accept.js";
import { assertPair } from "./fold.js";
import { listQuarters, loadQuarter } from "./store.js";
import { writeEdition } from "./render.js";

const root = process.cwd();

async function loadPair() {
  const file = process.env.PAIR_FILE || path.join(root, "pair.json");
  try {
    return assertPair(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Copy pair.example.json to pair.json and put in the two real addresses.");
    }
    throw error;
  }
}

function tokenOk(request) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) return true;
  const header = request.headers.authorization || "";
  return header === `Bearer ${expected}`;
}

async function serve(port) {
  const pair = await loadPair();
  const server = createServer(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body));
    };
    try {
      if (request.method === "GET" && request.url === "/health") {
        send(200, { ok: true, collector: pair.collector });
        return;
      }
      if (request.method === "GET" && request.url === "/quarters") {
        const quarters = [];
        for (const quarter of await listQuarters(root)) {
          const state = await loadQuarter(root, quarter);
          quarters.push({
            quarter,
            sealed: state.sealed,
            have: state.letters.map((letter) => letter.id),
          });
        }
        send(200, { quarters });
        return;
      }
      if (request.method === "POST" && request.url === "/inbound") {
        if (!tokenOk(request)) {
          send(401, { error: "Missing ingest token." });
          return;
        }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const result = await acceptRaw(Buffer.concat(chunks).toString("utf8"), { pair, root });
        send(result.status, result.body);
        return;
      }
      send(404, { error: "Not found." });
    } catch (error) {
      send(500, { error: error.message });
    }
  });
  server.listen(port, () => {
    console.log(`Collector listening on ${port} for ${pair.collector}`);
  });
}

async function ingest(files) {
  const pair = await loadPair();
  if (!files.length) throw new Error("Pass one or more .eml files.");
  for (const file of files) {
    const raw = await readFile(path.resolve(file), "utf8");
    const result = await acceptRaw(raw, { pair, root });
    console.log(`${file}: ${result.status} ${JSON.stringify(result.body)}`);
  }
}

async function issue(quarter) {
  const pair = await loadPair();
  const quarters = quarter ? [quarter] : await listQuarters(root);
  if (!quarters.length) throw new Error("No quarters are stored yet.");
  for (const name of quarters) {
    const state = await loadQuarter(root, name);
    if (state.letters.length < 2) {
      console.log(`${name}: waiting on ${state.letters.map((letter) => letter.id).join(", ") || "both letters"}`);
      continue;
    }
    for (const reader of pair.pair) {
      const edition = await writeEdition(root, name, reader, state.letters);
      console.log(`${name}: wrote ${edition.file}`);
    }
  }
}

async function status() {
  const quarters = await listQuarters(root);
  if (!quarters.length) {
    console.log("No letters stored.");
    return;
  }
  for (const quarter of quarters) {
    const state = await loadQuarter(root, quarter);
    const have = state.letters.map((letter) => letter.id).join(", ") || "nobody";
    console.log(`${quarter}: ${state.sealed ? "folded" : "open"} (${have})`);
  }
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "ingest") await ingest(args);
  else if (command === "issue") await issue(args[0]);
  else if (command === "status") await status();
  else if (command === "serve") await serve(Number(args[0] || process.env.PORT || 8787));
  else {
    console.log(`Usage:
  node src/cli.js ingest <file.eml> [more.eml]
  node src/cli.js status
  node src/cli.js issue [2026-Q4]
  node src/cli.js serve [8787]`);
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
