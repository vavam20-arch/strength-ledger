// Combine screenshots into one contact sheet: node scripts/contact-sheet.cjs <out.png> <cols> <files...>
const sharp = require('/home/claude/.npm-global/lib/node_modules/sharp');
(async () => {
  const [out, colsArg, ...files] = process.argv.slice(2);
  const cols = Number(colsArg), w = 402, hgt = 874, s = 0.5, gap = 8;
  const cw = Math.round(w * s), ch = Math.round(hgt * s);
  const rows = Math.ceil(files.length / cols);
  const tiles = await Promise.all(files.map((f) => sharp(f).resize(cw, ch).toBuffer()));
  await sharp({ create: { width: cols * (cw + gap) + gap, height: rows * (ch + gap) + gap, channels: 3, background: '#808080' } })
    .composite(tiles.map((input, i) => ({ input, left: gap + (i % cols) * (cw + gap), top: gap + Math.floor(i / cols) * (ch + gap) })))
    .png().toFile(out);
})();
