function getScriptConfig() {
  return document.querySelector("script[data-post-script]")?.dataset ?? {};
}

function getSlug(config) {
  if (config.slug) return config.slug;
  const params = new URLSearchParams(window.location.search);
  return params.get("slug");
}

async function renderPost() {
  const titleNode = document.getElementById("post-title");
  const contentNode = document.getElementById("post-content");
  const config = getScriptConfig();
  const slug = getSlug(config);

  if (!slug) {
    titleNode.textContent = "$ missing slug";
    contentNode.innerHTML = `<p class="error">No post selected.</p>`;
    return;
  }

  const manifestPath = config.manifest || "./posts/manifest.json";
  const markdownPath = config.markdown || `./posts/${encodeURIComponent(slug)}.md`;

  try {
    const [manifestResponse, mdResponse] = await Promise.all([
      fetch(manifestPath),
      fetch(markdownPath),
    ]);

    if (!manifestResponse.ok || !mdResponse.ok) {
      throw new Error("Post not found.");
    }

    const posts = await manifestResponse.json();
    const post = posts.find((item) => item.slug === slug);
    const markdown = await mdResponse.text();

    titleNode.textContent = `$ cat ${slug}.md`;
    document.title = post ? `${post.title} | Terminal Blog` : "Post | Terminal Blog";
    contentNode.innerHTML = marked.parse(markdown);
  } catch (error) {
    titleNode.textContent = "$ error";
    contentNode.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

renderPost();
