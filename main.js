async function loadPosts() {
  const list = document.getElementById("post-list");

  try {
    const response = await fetch("./posts/manifest.json");
    if (!response.ok) throw new Error("Failed to load posts manifest.");
    const posts = await response.json();

    list.innerHTML = "";
    posts.forEach((post) => {
      const item = document.createElement("li");
      item.className = "post-item";
      item.innerHTML = `
        <a class="post-link" href="posts/${encodeURIComponent(post.slug)}/">
          <h3 class="post-title">${post.title}</h3>
          <p class="post-meta">${post.date} · ${post.summary}</p>
        </a>
      `;
      list.appendChild(item);
    });
  } catch (error) {
    list.innerHTML = `<li class="error">Error: ${error.message}</li>`;
  }
}

loadPosts();
