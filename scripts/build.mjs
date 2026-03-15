import { promises as fs } from "node:fs";
import path from "node:path";
import { marked } from "marked";

const rootDir = process.cwd();
const postsDir = path.join(rootDir, "posts");
const distDir = path.join(rootDir, "dist");

const shellChrome = `
<header class="shell-header">
  <div class="lights" aria-hidden="true">
    <span class="light red"></span>
    <span class="light yellow"></span>
    <span class="light green"></span>
  </div>
  <p class="path">a.vibe.engineer@blog:~$</p>
</header>
`;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugFromFile(fileName) {
  return fileName.replace(/\.md$/i, "");
}

function extractTitle(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function parseFrontMatter(content) {
  if (!content.startsWith("---\n")) {
    return { data: {}, body: content };
  }

  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return { data: {}, body: content };
  }

  const raw = content.slice(4, end);
  const body = content.slice(end + 5);
  const data = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf(":");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^"(.*)"$/, "$1");
    data[key] = value;
  }

  return { data, body };
}

async function ensureCleanDist() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
}

function pageHtml({ title, body, rootPrefix = "./" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${rootPrefix}styles.css">
</head>
<body>
  <main class="shell">
    ${shellChrome}
    <section class="shell-body">
      ${body}
    </section>
  </main>
</body>
</html>
`;
}

async function build() {
  await ensureCleanDist();

  const sourceStyles = path.join(rootDir, "styles.css");
  await fs.copyFile(sourceStyles, path.join(distDir, "styles.css"));

  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  const postFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const posts = [];

  for (const fileName of postFiles) {
    const slug = slugFromFile(fileName);
    const markdownRaw = await fs.readFile(path.join(postsDir, fileName), "utf8");
    const { data, body } = parseFrontMatter(markdownRaw);
    const fallbackTitle = slug
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    const title = data.title || extractTitle(body, fallbackTitle);
    const date = data.date || "undated";
    const summary = data.summary || "Markdown post";
    const articleHtml = marked.parse(body);

    const postBody = `
<p><a class="back-link" href="../../">&lt; back to posts</a></p>
<h1 class="prompt">$ cat ${escapeHtml(slug)}.md</h1>
<article class="article">
${articleHtml}
</article>
`;

    const outDir = path.join(distDir, "posts", slug);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(
      path.join(outDir, "index.html"),
      pageHtml({ title: `${title} | Terminal Blog`, body: postBody, rootPrefix: "../../" }),
      "utf8",
    );

    posts.push({ slug, title, date, summary });
  }

  const listItems = posts
    .map(
      (post) => `
<li class="post-item">
  <a class="post-link" href="posts/${escapeHtml(post.slug)}/">
    <h3 class="post-title">${escapeHtml(post.title)}</h3>
    <p class="post-meta">${escapeHtml(post.date)} · ${escapeHtml(post.summary)}</p>
  </a>
</li>`,
    )
    .join("\n");

  const indexBody = `
<h1 class="prompt">$ cat README.md</h1>
<p class="intro">Welcome to my blog for small thoughts. And hobby Go/K8S/Cloud projects.</p>
<h2 class="prompt">$ tree ./posts</h2>
<ul class="post-list">
${listItems}
</ul>
`;

  await fs.writeFile(
    path.join(distDir, "index.html"),
    pageHtml({ title: "Terminal Blog", body: indexBody }),
    "utf8",
  );

  await fs.writeFile(path.join(distDir, ".nojekyll"), "", "utf8");

  console.log(`Built ${posts.length} posts into ${distDir}`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
