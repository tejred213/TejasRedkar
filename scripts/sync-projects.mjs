// Adds a project card to index.html for every GitHub repo tagged with the
// `portfolio` topic that the page doesn't link to yet, and refreshes the
// public-repo counters. Cards are inserted above the `sync-projects` marker in
// the projects grid; existing cards are never touched.
//
// Card copy is written by Claude from the repo's README when ANTHROPIC_API_KEY
// is set, otherwise it falls back to the repo description / README intro.
//
// Runs daily from .github/workflows/sync-projects.yml. Locally:
//   cd scripts && npm install
//   GITHUB_TOKEN=$(gh auth token) node sync-projects.mjs --dry-run

import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const USER = process.env.PORTFOLIO_USER || "tejred213";
const TOPIC = process.env.PORTFOLIO_TOPIC || "portfolio";
const MODEL = "claude-opus-5-5";
const DRY_RUN = process.argv.includes("--dry-run");
const INDEX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../index.html");
const MARKER = "<!-- sync-projects:";
const README_MAX_CHARS = 40_000;

// Same icons as the hand-written cards
const GITHUB_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2.1c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.02 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.14c0 .3.21.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>`;
const EXTERNAL_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>`;

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unescapeHtml = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ===== GitHub =====
const github = async (endpoint, accept = "application/vnd.github+json") => {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
    },
  });
  return res;
};

const githubJson = async (endpoint) => {
  const res = await github(endpoint);
  if (!res.ok) throw new Error(`GitHub ${endpoint} → ${res.status} ${await res.text()}`);
  return res.json();
};

const listRepos = async () => {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await githubJson(`/users/${USER}/repos?type=owner&per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) return repos;
  }
};

const fetchReadme = async (repo) => {
  const res = await github(`/repos/${USER}/${repo}/readme`, "application/vnd.github.raw+json");
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`GitHub README ${repo} → ${res.status}`);
  return res.text();
};

// ===== Card copy =====
// Fallback when Claude isn't available: README H1 (or the repo name), the repo
// description (or the README's first prose paragraph), topics (or language).
const copyFromMetadata = (repo, readme) => {
  const h1 = readme.match(/^#\s+(.+)$/m)?.[1].replace(/[^\p{L}\p{N}\s.&+<>()\-–—/]/gu, "").trim();
  const fromName = repo.name.replace(/[-_]+/g, " ");
  const title = h1 && h1.length <= 40 ? h1 : fromName[0].toUpperCase() + fromName.slice(1);

  const intro = readme
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => /^[A-Za-z*_[]/.test(p) && !/^(\[!\[|!\[|<)/.test(p) && p.length > 40);
  const introText = intro
    ?.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ");
  const description = repo.description?.trim() || introText;
  if (!description) return null;

  const topics = repo.topics.filter((t) => t !== TOPIC);
  const tags = topics.length ? topics : repo.language ? [repo.language] : [];
  return { title, description, tags: tags.slice(0, 5), source: repo.description ? "repo description" : "README intro" };
};

const CARD_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["title", "description", "tags"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You write project cards for the portfolio of Tejas Redkar, a Python / machine-learning engineer. Each card has a short title, a one- or two-sentence description and a few technology tags.

Match the voice of the existing cards: concrete and technical, saying what the project does and how it's built. No hype, no first person, no emoji. State only what the README supports.`;

const copyFromClaude = async (client, repo, readme, examples) => {
  let body = readme;
  if (body.length > README_MAX_CHARS) {
    console.warn(`  ! README for ${repo.name} is ${body.length} chars; sending the first ${README_MAX_CHARS}`);
    body = body.slice(0, README_MAX_CHARS);
  }
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: CARD_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Existing cards, for voice and length:
<examples>
${JSON.stringify(examples, null, 2)}
</examples>

Write the card for this repository.
<repo>
name: ${repo.name}
description: ${repo.description || "(none)"}
primary language: ${repo.language || "(unknown)"}
topics: ${repo.topics.filter((t) => t !== TOPIC).join(", ") || "(none)"}
</repo>
<readme>
${body || "(no README)"}
</readme>

title: the project's name as its README styles it, without a tagline.
description: 25–45 words of plain text.
tags: 3–5 key technologies, named the way the existing cards name them.`,
      },
    ],
  });

  if (msg.stop_reason === "refusal") {
    console.warn(`  ! Claude declined ${repo.name} (${msg.stop_details?.category ?? "no category"})`);
    return null;
  }
  const text = msg.content.find((b) => b.type === "text")?.text;
  const card = JSON.parse(text);
  if (!card.title?.trim() || !card.description?.trim()) return null;
  return {
    title: card.title.trim(),
    description: card.description.trim(),
    tags: card.tags.map((t) => t.trim()).filter(Boolean).slice(0, 5),
    source: "Claude, from README",
  };
};

// ===== HTML =====
const existingExamples = (html) =>
  [...html.matchAll(/<h4>([^<]+)<\/h4>\s*<p>([^<]+)<\/p>\s*<ul class="project-tags">([\s\S]*?)<\/ul>/g)]
    .slice(0, 4)
    .map(([, title, description, tags]) => ({
      title: unescapeHtml(title),
      description: unescapeHtml(description),
      tags: [...tags.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => unescapeHtml(m[1])),
    }));

const isLinked = (html, repo) =>
  new RegExp(`github\\.com/${escapeRegExp(USER)}/${escapeRegExp(repo)}(?=["/?#])`, "i").test(html);

const liveUrl = (homepage) => {
  if (!homepage || !/^https?:\/\//i.test(homepage)) return null;
  return /^https?:\/\/(www\.)?github\.com\//i.test(homepage) ? null : homepage;
};

const renderCard = (repo, card, num) => {
  const live = liveUrl(repo.homepage);
  const title = escapeHtml(card.title);
  const links = [
    `<a href="${escapeHtml(repo.html_url)}" target="_blank" rel="noopener" aria-label="${title} on GitHub">${GITHUB_ICON}</a>`,
    live && `<a href="${escapeHtml(live)}" target="_blank" rel="noopener" aria-label="${title} live site">${EXTERNAL_ICON}</a>`,
  ].filter(Boolean);

  return `        <!-- ${title} -->
        <article class="project-card reveal" data-tilt>
          <span class="card-num" aria-hidden="true">${String(num).padStart(2, "0")}</span>
          <div class="project-top">
            ${live ? `<span class="project-status live">● LIVE</span>` : `<span class="project-status"></span>`}
            <div class="project-links">
${links.map((l) => `              ${l}`).join("\n")}
            </div>
          </div>
          <h4>${title}</h4>
          <p>${escapeHtml(card.description)}</p>
          <ul class="project-tags">
            ${card.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
          </ul>
        </article>

`;
};

const insertCards = (html, cardsHtml) => {
  const at = html.indexOf(MARKER);
  if (at === -1) throw new Error(`Marker "${MARKER}" not found in index.html`);
  const lineStart = html.lastIndexOf("\n", at) + 1;
  return html.slice(0, lineStart) + cardsHtml + html.slice(lineStart);
};

const updateCount = (html, key, count) =>
  html
    .replace(new RegExp(`data-count="\\d+"( data-sync="${key}")`, "g"), `data-count="${count}"$1`)
    .replace(new RegExp(`(<span data-sync="${key}">)\\d+(</span>)`, "g"), `$1${count}$2`);

// ===== Main =====
const html = await readFile(INDEX, "utf8");
const [user, repos] = await Promise.all([githubJson(`/users/${USER}`), listRepos()]);

const candidates = repos
  .filter((r) => !r.fork && !r.archived && r.topics?.includes(TOPIC) && !isLinked(html, r.name))
  .sort((a, b) => a.created_at.localeCompare(b.created_at));

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
if (candidates.length && !client) console.warn("ANTHROPIC_API_KEY not set; using repo metadata for card copy.");

const examples = existingExamples(html);
let nextNum = Math.max(0, ...[...html.matchAll(/class="card-num"[^>]*>(\d+)</g)].map((m) => +m[1])) + 1;
const added = [];
const skipped = [];
let cardsHtml = "";

for (const repo of candidates) {
  console.log(`New project: ${repo.name}`);
  const readme = await fetchReadme(repo.name);
  // Nothing to write a card from (e.g. a README that's just a heading)
  const hasSubstance = repo.description || readme.replace(/^#.*$/gm, "").trim().length >= 200;
  let card = null;
  if (client && hasSubstance) {
    try {
      card = await copyFromClaude(client, repo, readme, examples);
    } catch (err) {
      if (!(err instanceof Anthropic.APIError) && !(err instanceof SyntaxError)) throw err;
      console.warn(`  ! Claude call failed for ${repo.name}: ${err.message}`);
    }
  }
  if (hasSubstance) card ??= copyFromMetadata(repo, readme);
  if (!card) {
    skipped.push(repo);
    console.warn(`  ! Skipped ${repo.name}: no description or README to build a card from`);
    continue;
  }
  cardsHtml += renderCard(repo, card, nextNum++);
  added.push({ repo, card });
  console.log(`  + ${card.title} [${card.tags.join(", ")}] (${card.source})\n    ${card.description}`);
}

let updated = cardsHtml ? insertCards(html, cardsHtml) : html;
const counts = {
  "repo-count": ["Public repo count", user.public_repos],
  "live-count": ["Live project count", updated.split('class="project-status live"').length - 1],
};
const countChanges = [];
for (const [key, [label, count]] of Object.entries(counts)) {
  const old = html.match(new RegExp(`data-count="(\\d+)" data-sync="${key}"`))?.[1];
  if (old && +old !== count) countChanges.push(`- **${label}:** ${old} → ${count}`);
  updated = updateCount(updated, key, count);
}

const summary = [
  `Automated sync from GitHub repos tagged \`${TOPIC}\`.`,
  "",
  ...(added.length
    ? [
        "**New project cards**",
        ...added.map(
          ({ repo, card }) =>
            `- **${card.title}** ← [${repo.full_name}](${repo.html_url})${liveUrl(repo.homepage) ? " · LIVE" : ""} · copy: ${card.source}\n  > ${card.description}\n  > _${card.tags.join(" · ")}_`
        ),
        "",
      ]
    : []),
  ...(countChanges.length ? [...countChanges, ""] : []),
  ...(skipped.length
    ? [`**Skipped** (add a repo description or README): ${skipped.map((r) => r.name).join(", ")}`, ""]
    : []),
  "Check the cards in the Vercel preview, edit this branch if the copy needs a tweak, then merge to publish.",
  `To keep a repo off the site, remove its \`${TOPIC}\` topic and close this PR.`,
].join("\n");

if (updated === html) {
  console.log("Portfolio is up to date.");
} else if (DRY_RUN) {
  console.log(`\n--dry-run: index.html not written.\n\n${summary}`);
} else {
  await writeFile(INDEX, updated);
  const title = added.length
    ? `Add ${added.length === 1 ? "project" : `${added.length} projects`}: ${added.map((a) => a.card.title).join(", ")}`
    : "Update portfolio stats";
  if (process.env.SYNC_SUMMARY) await writeFile(process.env.SYNC_SUMMARY, summary + "\n");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `title=${title}\n`);
  console.log(`\nindex.html updated.\n\n${summary}`);
}
