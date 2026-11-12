# Second half

A quarterly letter for two addresses. You both email one collector. When the second letter arrives, each of you gets the same issue, with your own news on the second half.

The processing model is in [DESIGN.md](DESIGN.md). The specimen of the letter is [web/index.html](web/index.html). The page is set in the Newsprint theme from [Hallmark](https://github.com/Nutlope/hallmark).

## Run

```
cp pair.example.json pair.json
node src/cli.js ingest fixtures/one.eml fixtures/two.eml
node src/cli.js status
```

That writes `issues/2026-Q4/for-one.html` and `issues/2026-Q4/for-two.html`.

To take mail from a real inbox, run `node src/cli.js serve 8787` and point the collector at `POST /inbound`. See DESIGN.md for the Cloudflare worker and the delivery hook.

```
npm test
```
