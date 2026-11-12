import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { orderForReader } from "./fold.js";
import { quarterLabel } from "./parse.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function paragraphs(note) {
  return String(note || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function extensionFor(type) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  return "img";
}

function halfHtml(letter, role) {
  const blocks = paragraphs(letter.note).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");
  const figures = (letter.images || []).map((image, index) => {
    const name = `${letter.id}-${index + 1}.${extensionFor(image.type)}`;
    return `<figure class="shot">
        <div class="frame" data-slot="${escapeHtml(name)}">
          <img src="media/${escapeHtml(name)}" alt="${escapeHtml(image.filename)}" width="1200" height="800">
        </div>
        <figcaption>${escapeHtml(image.filename)}</figcaption>
      </figure>`;
  }).join("\n");
  return `<section class="letter-half letter-half-${role}" id="${role}">
      <h2>${role === "first" ? "First half" : "Second half"}</h2>
      <p class="byline">${escapeHtml(letter.name)}</p>
      <div class="cols">${blocks}</div>
      ${figures}
    </section>`;
}

export function renderEdition({ quarter, letters, reader }) {
  const order = orderForReader(letters, reader.email);
  if (!order) throw new Error("Both letters are required before an issue can fold.");
  const label = quarterLabel(quarter);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(label)} for ${escapeHtml(reader.name)}</title>
  <meta name="description" content="Your own news sits on the second half of this quarter.">
  <link rel="stylesheet" href="../../web/issue.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@700&family=Spectral:ital,wght@0,400;0,500&display=swap">
</head>
<body>
  <header class="mast">
    <a class="wordmark" href="#first">Second half</a>
    <nav aria-label="This issue">
      <a href="#first">First half</a>
      <a href="#second">Second half</a>
    </nav>
  </header>
  <main>
    <article class="edition">
      <div class="container edition-open">
        <h1>Your own news sits second.</h1>
        <p class="lead">${escapeHtml(label)}. Their letter leads, and yours closes the issue.</p>
      </div>
      <div class="container">
        ${halfHtml(order.first, "first")}
        <hr class="rule-double">
        ${halfHtml(order.second, "second")}
      </div>
    </article>
  </main>
  <footer class="colophon">
    <div class="container">
      <p>This copy is for ${escapeHtml(reader.name)}. The other copy swaps the halves, so each reader closes on their own quarter.</p>
    </div>
  </footer>
</body>
</html>
`;
}

export async function writeEdition(root, quarter, reader, letters) {
  const html = renderEdition({ quarter, letters, reader });
  const dir = path.join(root, "issues", quarter);
  const media = path.join(dir, "media");
  await mkdir(media, { recursive: true });
  for (const letter of letters) {
    for (const [index, image] of (letter.images || []).entries()) {
      const name = `${letter.id}-${index + 1}.${extensionFor(image.type)}`;
      await writeFile(path.join(media, name), Buffer.from(image.data, "base64"));
    }
  }
  const file = path.join(dir, `for-${reader.id}.html`);
  await writeFile(file, html);
  return { id: reader.id, email: reader.email, name: reader.name, file, html };
}
