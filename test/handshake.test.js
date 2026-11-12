import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { acceptRaw } from "../src/accept.js";
import { orderForReader } from "../src/fold.js";
import { parseEmail, quarterFromDate, quarterFromSubject } from "../src/parse.js";

const pair = {
  collector: "letters@example.com",
  pair: [
    { id: "one", name: "First address", email: "one@example.com" },
    { id: "two", name: "Second address", email: "two@example.com" },
  ],
};

function letter(from, subject, body, extra = "") {
  return `From: ${from}
To: letters@example.com
Subject: ${subject}
Date: Mon, 02 Nov 2026 15:04:00 +0000
Message-ID: <${from}-${subject}@example.com>
MIME-Version: 1.0
${extra}Content-Type: text/plain; charset=utf-8

${body}
`;
}

test("a named quarter in the subject wins over the send date", () => {
  assert.equal(quarterFromSubject("Notes for Q1 2027"), "2027-Q1");
  assert.equal(quarterFromSubject("2026 Q4 from the road"), "2026-Q4");
  assert.equal(quarterFromDate(new Date("2026-11-02T15:04:00Z")), "2026-Q4");
  const message = parseEmail(letter("One <one@example.com>", "Q1 2027", "Hello there."));
  assert.equal(message.quarter, "2027-Q1");
  assert.equal(message.from, "one@example.com");
});

test("html mail becomes text and an image is kept", () => {
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const raw = `From: First address <one@example.com>
To: letters@example.com
Subject: 2026 Q4
Date: Mon, 02 Nov 2026 15:04:00 +0000
Message-ID: <pic@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="bound"

--bound
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<p>The kitchen table held the whole afternoon.</p>
--bound
Content-Type: image/png; name="table.png"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="table.png"

${pixel}
--bound--
`;
  const message = parseEmail(raw);
  assert.equal(message.note, "The kitchen table held the whole afternoon.");
  assert.equal(message.images.length, 1);
  assert.equal(message.images[0].filename, "table.png");
  assert.equal(message.images[0].type, "image/png");
});

test("the handshake waits, then folds each reader onto the second half", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "second-half-"));
  try {
    const first = await acceptRaw(letter("one@example.com", "2026 Q4", "Note kept for the first address."), {
      pair,
      root,
    });
    assert.equal(first.status, 202);
    assert.deepEqual(first.body.have, ["one"]);

    const stranger = await acceptRaw(letter("stranger@example.com", "2026 Q4", "No."), { pair, root });
    assert.equal(stranger.status, 422);

    const second = await acceptRaw(letter("two@example.com", "Q4 2026", "Note kept for the second address."), {
      pair,
      root,
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.sealed, true);

    const again = await acceptRaw(letter("one@example.com", "2026 Q4", "Too late."), { pair, root });
    assert.equal(again.status, 409);

    const letters = [
      { from: "one@example.com", name: "First address", note: "Note kept for the first address.", images: [] },
      { from: "two@example.com", name: "Second address", note: "Note kept for the second address.", images: [] },
    ];
    const forOne = orderForReader(letters, "one@example.com");
    assert.equal(forOne.first.from, "two@example.com");
    assert.equal(forOne.second.from, "one@example.com");
    const forTwo = orderForReader(letters, "two@example.com");
    assert.equal(forTwo.first.from, "one@example.com");
    assert.equal(forTwo.second.from, "two@example.com");

    const oneFile = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(root, "issues", "2026-Q4", "for-one.html"), "utf8")
    );
    const otherAt = oneFile.indexOf("Note kept for the second address.");
    const ownAt = oneFile.indexOf("Note kept for the first address.");
    assert.ok(otherAt > -1 && ownAt > otherAt);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a second note from the same address replaces the first before the fold", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "second-half-"));
  try {
    await acceptRaw(letter("one@example.com", "2026 Q4", "The early draft."), { pair, root });
    const replaced = await acceptRaw(
      `From: one@example.com
To: letters@example.com
Subject: 2026 Q4
Date: Tue, 03 Nov 2026 15:04:00 +0000
Message-ID: <one-revised@example.com>
Content-Type: text/plain; charset=utf-8

The revised draft.
`,
      { pair, root }
    );
    assert.equal(replaced.status, 202);
    const { loadQuarter } = await import("../src/store.js");
    const state = await loadQuarter(root, "2026-Q4");
    assert.equal(state.letters.length, 1);
    assert.match(state.letters[0].note, /revised draft/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
