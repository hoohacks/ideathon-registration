/**
 * Send a path-shaped URL to the hash route it obviously meant.
 *
 * The app is a HashRouter, so every route lives after a `#`:
 * `…/#/judge-registration`, not `…/judge-registration`. Nothing about the
 * second URL looks wrong, and it is the one anybody writes down or pastes into
 * a message — but the hash is empty, so the router matches `/` and serves the
 * **competitor** registration form.
 *
 * That is the worst possible failure for this particular app: a judge sent the
 * tidy-looking link lands on a form that signs them up as a competitor, and
 * nothing on the page says so. A 404 would have been kinder.
 *
 * So a path that is not the site root gets rewritten to the hash route of the
 * same name before React ever mounts. `public/404.html` does the same job for
 * GitHub Pages, where the request never reaches the bundle at all.
 */

/**
 * The URL to send this location to, or null to leave it alone.
 *
 * Pure, so the base-path arithmetic — the part that differs between
 * `localhost:3000/x` and `hoohacks.github.io/ideathon-registration/x` — can be
 * tested without a browser.
 */
export function hashTargetFor({ pathname = "/", search = "", hash = "", base = "" }) {
  // already a hash route, or the bare "#" a link with href="#" leaves behind
  if (hash && hash !== "#") return null;

  // Only strip the base when the URL is actually under it -- and only put it
  // back in that case. `PUBLIC_URL` is `/ideathon-registration` in development
  // as well as production (CRA takes it from `homepage` either way), but the
  // dev server answers on `/`. Prepending it unconditionally sent
  // localhost:3000/judge-registration to /ideathon-registration/#/... : a
  // directory that only resolves because the dev server falls back to
  // index.html, with a phantom folder left in the address bar.
  const underBase = Boolean(base) && pathname.startsWith(base);

  let path = underBase ? pathname.slice(base.length) : pathname;
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");

  // the site root, however it was spelled, is already where it should be
  if (!path || path === "index.html") return null;

  return `${underBase ? base : ""}/#/${path}${search}`;
}

/** `homepage` in package.json is a full URL; only its path matters here. */
export function basePath(publicUrl = process.env.PUBLIC_URL || "") {
  return publicUrl.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
}

/**
 * Rewrite the address bar if needed. Call before rendering: `replace` keeps the
 * mistyped URL out of the history, so Back goes where the person expects.
 */
export function redirectToHashRoute(location = window.location) {
  const target = hashTargetFor({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    base: basePath(),
  });
  if (target) location.replace(target);
  return target;
}
