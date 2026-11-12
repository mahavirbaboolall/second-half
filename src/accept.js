import { createHash } from "node:crypto";
import { findSender, assertPair, orderForReader } from "./fold.js";
import { parseEmail } from "./parse.js";
import { writeEdition } from "./render.js";
import { loadQuarter, saveLetter, sealQuarter } from "./store.js";

function messageKey(raw, message) {
  if (message.messageId) return message.messageId;
  return createHash("sha256").update(String(raw)).digest("hex").slice(0, 16);
}

async function postDelivery(editions) {
  const url = process.env.DELIVER_URL;
  if (!url) return { delivered: false };
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      editions: editions.map((edition) => ({
        to: edition.email,
        name: edition.name,
        file: edition.file,
        html: edition.html,
      })),
    }),
  });
  return { delivered: response.ok, status: response.status };
}

export async function acceptRaw(raw, { pair, root }) {
  assertPair(pair);
  const message = parseEmail(raw);
  const sender = findSender(pair, message.from);
  if (!sender) {
    return { status: 422, body: { error: "That sender is not one of the two addresses." } };
  }

  const state = await loadQuarter(root, message.quarter);
  if (state.sealed) {
    return {
      status: 409,
      body: { error: "This quarter is already folded.", quarter: message.quarter },
    };
  }

  const letter = {
    id: sender.id,
    from: sender.email,
    name: sender.name,
    subject: message.subject,
    quarter: message.quarter,
    date: message.date,
    messageId: messageKey(raw, message),
    note: message.note,
    images: message.images,
  };
  await saveLetter(root, letter);

  const next = await loadQuarter(root, message.quarter);
  if (!orderForReader(next.letters, pair.pair[0].email)) {
    return {
      status: 202,
      body: {
        quarter: message.quarter,
        waiting: true,
        have: next.letters.map((item) => item.id),
      },
    };
  }

  const editions = [];
  for (const reader of pair.pair) {
    editions.push(await writeEdition(root, message.quarter, reader, next.letters));
  }
  await sealQuarter(root, message.quarter, editions);
  let delivery = { delivered: false };
  try {
    delivery = await postDelivery(editions);
  } catch (error) {
    delivery = { delivered: false, error: error.message };
  }
  return {
    status: 200,
    body: {
      quarter: message.quarter,
      sealed: true,
      editions: editions.map(({ html, ...rest }) => rest),
      delivery,
    },
  };
}
