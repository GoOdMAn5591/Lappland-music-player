# Local Character Asset

The supplied transparent PNG is included as `lappland-cutout-transparent.png`.
The project owner confirmed permission to distribute this specific image on 2026-10-05.
This confirmation is not an independent copyright verification. The MIT code license
does not license Lappland, Arknights, or the supplied artwork for other uses.
Other image files are ignored by default. A missing asset displays an image-import
control, never a replacement character.

You may also import your authorized image in the app. That copy stays in browser IndexedDB.
The supplied 910 x 1200 image uses the default landmarks; other crops can be calibrated in
the character settings. No absolute machine path is used by the app.

Deployment warning: Vite copies files in `public/` into `dist/` even when Git ignores them.
Do not put private assets in public or publish dist until all bundled assets have
distribution permission. CI builds from a clean checkout. No deployment is configured.
