# Second half

A quarterly letter for two people. Each of you writes one email. The collector holds both. When the second letter arrives, the handshake closes and each of you receives the same issue, folded so the other person's news is the first half and your own news is the second half.

## The three addresses

| Role | What it is |
| --- | --- |
| First address | One of the two writers. Listed in `pair.json`. |
| Second address | The other writer. Listed in `pair.json`. |
| Collector | The inbox both of you write to. It does not write the letter. It receives mail and hands the raw message to this program. |

Copy `pair.example.json` to `pair.json` and replace the two addresses and the collector. Mail from any other address is refused.

## What a letter may contain

A normal email:

- The `From` line must be one of the two addresses.
- The subject may name the quarter, as `2026 Q4` or `Q4 2026`. If it does, that quarter wins. If it does not, the quarter is taken from the `Date` header in UTC.
- The body is the note. Plain text is kept. HTML is reduced to text.
- Image attachments are kept, up to six, each under 8 MB. Other files are dropped.

A second email from the same address, in the same quarter, replaces the earlier one. After the issue is folded, later mail for that quarter is refused. The next quarter starts empty.

## The handshake

```
you  ----email----\
                   collector inbox
friend ----email--/        |
                           |  raw RFC822
                           v
                    POST /inbound
                           |
                     parse and store
                           |
              one letter only?  --> wait
              both letters?     --> fold, write two issues
```

Nothing is sent onward until both letters for that quarter are stored. That wait is the handshake.

Stored mail lives in `data/<year>-Q<n>/`. Each person is one JSON file. A `seal.json` appears when the quarter folds. Those files stay on the machine that runs the collector. They are not part of the git repo.

## The fold

One quarter produces two HTML issues:

- `issues/<quarter>/for-<first id>.html` opens on the second address and closes on the first.
- `issues/<quarter>/for-<second id>.html` opens on the first address and closes on the second.

The words are the same. Only the order changes. The double rule is the fold. Your own note is always under it.

Pictures saved from a letter are written beside that issue and captioned with the filename they arrived with.

## Delivery

Writing the two files is the default. To hand them to another system, set `DELIVER_URL`. On a completed handshake the program POSTs:

```json
{
  "editions": [
    { "to": "one@example.com", "name": "First address", "file": "…/for-one.html", "html": "<!DOCTYPE html>…" },
    { "to": "two@example.com", "name": "Second address", "file": "…/for-two.html", "html": "<!DOCTYPE html>…" }
  ]
}
```

That URL can be a mailer, a printer, or a folder sync. If `DELIVER_URL` is unset, the files are still written and the handshake still seals. A delivery failure does not unseal the quarter.

## Hooking up the collector

Run the receiver:

```
INGEST_TOKEN=a-long-random-string node src/cli.js serve 8787
```

It accepts three routes:

- `POST /inbound` with the raw RFC822 message as the body. When `INGEST_TOKEN` is set, the request must send `Authorization: Bearer <token>`.
- `GET /health` returns the collector address.
- `GET /quarters` returns which quarters are open and which are folded.

Point the collector inbox at that route. `hooks/cloudflare-email.js` is a Cloudflare Email Routing worker: it reads each message as raw RFC822 and POSTs it to `INGEST_URL` with `INGEST_TOKEN`. The same contract fits any inbound provider that can forward the original message.

You can also drop saved messages in by hand:

```
node src/cli.js ingest letter.eml
node src/cli.js status
node src/cli.js issue
```

`issue` rewrites HTML for any quarter that already has both letters.

## What you open

`web/index.html` is the specimen of the letter: Newsprint stock, the two halves, and the double rule. It uses a stand-in photograph until a real letter brings its own. A folded issue from `issues/` uses the same sheet and the same fold, filled with the notes that actually arrived.
