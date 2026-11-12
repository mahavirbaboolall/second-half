import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function quarterDir(root, quarter) {
  const dir = path.join(root, "data", quarter);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveLetter(root, letter) {
  const dir = await quarterDir(root, letter.quarter);
  await writeFile(path.join(dir, `${letter.id}.json`), `${JSON.stringify(letter, null, 2)}\n`);
}

export async function loadQuarter(root, quarter) {
  const dir = path.join(root, "data", quarter);
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return { quarter, sealed: false, letters: [] };
  }
  const letters = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name === "seal.json") continue;
    letters.push(JSON.parse(await readFile(path.join(dir, name), "utf8")));
  }
  let sealed = false;
  try {
    const seal = JSON.parse(await readFile(path.join(dir, "seal.json"), "utf8"));
    sealed = Boolean(seal.sealed);
  } catch {
    sealed = false;
  }
  return { quarter, sealed, letters };
}

export async function sealQuarter(root, quarter, editions) {
  const dir = await quarterDir(root, quarter);
  const seal = {
    sealed: true,
    at: new Date().toISOString(),
    editions: editions.map(({ html, ...rest }) => rest),
  };
  await writeFile(path.join(dir, "seal.json"), `${JSON.stringify(seal, null, 2)}\n`);
  return seal;
}

export async function listQuarters(root) {
  try {
    const names = await readdir(path.join(root, "data"));
    return names.filter((name) => /^\d{4}-Q[1-4]$/.test(name)).sort();
  } catch {
    return [];
  }
}
