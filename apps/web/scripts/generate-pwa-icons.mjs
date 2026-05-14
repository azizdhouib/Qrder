/**
 * Génère les icônes PWA et le splash iOS depuis le logo.
 *
 * Source au build : si `logo.png` à la racine du dépôt est **plus récent** (ou même date)
 * que `apps/web/public/logo.png`, il remplace le fichier public puis régénère les icônes.
 * Sinon on garde `public/logo.png` (tu peux éditer uniquement ce fichier).
 *
 * Exécuté en prebuild — requiert sharp.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const repoRoot = path.join(webRoot, "..", "..");
const publicLogo = path.join(webRoot, "public", "logo.png");
const rootLogo = path.join(repoRoot, "logo.png");

const iconsDir = path.join(webRoot, "public", "icons");
const splashDir = path.join(webRoot, "public", "pwa");
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

/** Si la racine du repo a un logo plus récent (ou égal) que public, on recopie — sinon l’ancien bug « je change la racine et rien ne bouge ». */
function syncRootLogoToPublic() {
  if (!fs.existsSync(rootLogo)) return;
  fs.mkdirSync(path.dirname(publicLogo), { recursive: true });
  if (!fs.existsSync(publicLogo)) {
    fs.copyFileSync(rootLogo, publicLogo);
    return;
  }
  const rootM = fs.statSync(rootLogo).mtimeMs;
  const pubM = fs.statSync(publicLogo).mtimeMs;
  if (rootM >= pubM) {
    fs.copyFileSync(rootLogo, publicLogo);
  }
}

/** Retire les bords quasi unicolores pour un favicon qui remplit mieux le carré. */
async function trimLogoMargins(buf) {
  try {
    const trimmed = await sharp(buf).trim({ threshold: 12 }).png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    if (!meta.width || !meta.height || meta.width < 8 || meta.height < 8) return buf;
    return trimmed;
  } catch {
    return buf;
  }
}

async function main() {
  syncRootLogoToPublic();

  if (!fs.existsSync(publicLogo)) {
    console.warn("[pwa:icons] Aucun logo : placez logo.png à la racine du repo ou apps/web/public/logo.png — skip.");
    process.exit(0);
  }

  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(splashDir, { recursive: true });

  const buf = fs.readFileSync(publicLogo);
  const iconSource = await trimLogoMargins(buf);

  for (const size of ICON_SIZES) {
    const out = path.join(iconsDir, `icon-${size}.png`);
    await sharp(iconSource)
      .resize(size, size, { fit: "cover", position: "centre" })
      .png()
      .toFile(out);
    console.log("[pwa:icons]", path.relative(webRoot, out));
  }

  const w = 1170;
  const h = 2532;
  const splashOut = path.join(splashDir, "splash-1170x2532.png");
  const logoSize = Math.round(Math.min(w, h) * 0.24);
  const logoBuf = await sharp(iconSource).resize(logoSize, logoSize, { fit: "contain" }).png().toBuffer();
  await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 245, g: 245, b: 247, alpha: 1 }
    }
  })
    .composite([{ input: logoBuf, gravity: "center" }])
    .png()
    .toFile(splashOut);
  console.log("[pwa:icons]", path.relative(webRoot, splashOut));
}

main().catch((e) => {
  console.error("[pwa:icons]", e);
  process.exit(1);
});
