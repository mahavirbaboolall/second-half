import { bareAddress } from "./parse.js";

export function assertPair(pair) {
  if (!pair || typeof pair.collector !== "string" || !Array.isArray(pair.pair) || pair.pair.length !== 2) {
    throw new Error("The pair file needs a collector and exactly two addresses.");
  }
  for (const person of pair.pair) {
    if (!person.id || !person.email || !person.name) {
      throw new Error("Each address needs an id, a name, and an email.");
    }
  }
  return pair;
}

export function findSender(pair, from) {
  const email = bareAddress(from);
  return pair.pair.find((person) => bareAddress(person.email) === email) || null;
}

export function orderForReader(letters, readerEmail) {
  const own = letters.find((letter) => bareAddress(letter.from) === bareAddress(readerEmail));
  const other = letters.find((letter) => bareAddress(letter.from) !== bareAddress(readerEmail));
  if (!own || !other) return null;
  return { first: other, second: own };
}
