const YEAR_THEN_Q = /\b(20\d{2})\s*[-/ ]?\s*Q([1-4])\b/i;
const Q_THEN_YEAR = /\bQ([1-4])\s*[-/ ]?\s*(20\d{2})\b/i;

export function bareAddress(value) {
  if (!value) return "";
  const angle = /<([^>]+)>/.exec(value);
  return (angle ? angle[1] : value).trim().toLowerCase();
}

export function quarterFromSubject(subject) {
  if (!subject) return null;
  const yearFirst = YEAR_THEN_Q.exec(subject);
  if (yearFirst) return `${yearFirst[1]}-Q${yearFirst[2]}`;
  const quarterFirst = Q_THEN_YEAR.exec(subject);
  if (quarterFirst) return `${quarterFirst[2]}-Q${quarterFirst[1]}`;
  return null;
}

export function quarterFromDate(date) {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

export function quarterLabel(quarter) {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter || "");
  return match ? `${match[1]} Q${match[2]}` : quarter;
}

function unfold(block) {
  const headers = {};
  const lines = block.replace(/\n[ \t]+/g, " ").split("\n");
  for (const line of lines) {
    const cut = line.indexOf(":");
    if (cut < 1) continue;
    const key = line.slice(0, cut).trim().toLowerCase();
    const value = line.slice(cut + 1).trim();
    headers[key] = headers[key] ? `${headers[key]} ${value}` : value;
  }
  return headers;
}

function splitHead(chunk) {
  const text = chunk.replace(/^\n/, "");
  const cut = text.indexOf("\n\n");
  if (cut === -1) return { headers: unfold(text), body: "" };
  return { headers: unfold(text.slice(0, cut)), body: text.slice(cut + 2) };
}

function decode(body, encoding) {
  const kind = (encoding || "").toLowerCase();
  if (kind.includes("base64")) return Buffer.from(body.replace(/\s/g, ""), "base64");
  if (kind.includes("quoted-printable")) {
    const text = body.replace(/=\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    return Buffer.from(text, "latin1");
  }
  return Buffer.from(body, "utf8");
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function boundaryOf(contentType) {
  const match = /boundary="?([^";]+)"?/i.exec(contentType || "");
  return match ? match[1] : null;
}

function partsOf(body, boundary) {
  if (!boundary) return [];
  return body
    .split(`--${boundary}`)
    .slice(1)
    .map((part) => part.replace(/^\n/, "").replace(/\n?--\s*$/, ""))
    .filter((part) => part.trim() && part.trim() !== "--")
    .map(splitHead);
}

function filenameOf(headers) {
  const header = `${headers["content-disposition"] || ""} ${headers["content-type"] || ""}`;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : "picture";
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 6;

function takeImages(parts, images) {
  for (const part of parts) {
    if (images.length >= MAX_IMAGES) return;
    const type = part.headers["content-type"] || "";
    if (/multipart\//i.test(type)) {
      takeImages(partsOf(part.body, boundaryOf(type)), images);
      continue;
    }
    if (!/^image\//i.test(type)) continue;
    const data = decode(part.body, part.headers["content-transfer-encoding"]);
    if (!data.length || data.length > MAX_IMAGE_BYTES) continue;
    images.push({
      type: type.split(";")[0].trim().toLowerCase(),
      filename: filenameOf(part.headers),
      data: data.toString("base64"),
    });
  }
}

function takeText(parts) {
  let plain = "";
  let html = "";
  for (const part of parts) {
    const type = part.headers["content-type"] || "text/plain";
    if (/multipart\//i.test(type)) {
      const nested = takeText(partsOf(part.body, boundaryOf(type)));
      plain = plain || nested.plain;
      html = html || nested.html;
      continue;
    }
    const text = decode(part.body, part.headers["content-transfer-encoding"]).toString("utf8").trim();
    if (/text\/plain/i.test(type) && !plain) plain = text;
    else if (/text\/html/i.test(type) && !html) html = text;
  }
  return { plain, html };
}

export function parseEmail(raw) {
  const text = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const { headers, body } = splitHead(text);
  const contentType = headers["content-type"] || "text/plain";
  let note = "";
  const images = [];
  if (/multipart\//i.test(contentType)) {
    const parts = partsOf(body, boundaryOf(contentType));
    const found = takeText(parts);
    note = found.plain || (found.html ? htmlToText(found.html) : "");
    takeImages(parts, images);
  } else {
    const decoded = decode(body, headers["content-transfer-encoding"]).toString("utf8").trim();
    note = /text\/html/i.test(contentType) ? htmlToText(decoded) : decoded;
  }
  const date = headers.date ? new Date(headers.date) : new Date();
  const when = Number.isNaN(date.getTime()) ? new Date() : date;
  const subject = headers.subject || "";
  return {
    from: bareAddress(headers.from),
    subject,
    date: when.toISOString(),
    quarter: quarterFromSubject(subject) || quarterFromDate(when),
    messageId: headers["message-id"] || "",
    note,
    images,
  };
}
