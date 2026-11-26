// electron-builder only offers zlib/bzip2 DMGs. Re-pack each DMG with LZMA (ULMO, macOS 10.15+),
// which is ~15% smaller. The blockmap is only for auto-update, which this app doesn't use.
const { execFileSync } = require("node:child_process");
const { renameSync, rmSync } = require("node:fs");

exports.default = async function compressDmg({ artifactPaths }) {
  const out = [];
  for (const p of artifactPaths) {
    if (p.endsWith(".blockmap")) {
      rmSync(p, { force: true });
      continue;
    }
    if (p.endsWith(".dmg")) {
      const tmp = `${p}.ulmo.dmg`;
      rmSync(tmp, { force: true });
      execFileSync("hdiutil", ["convert", p, "-format", "ULMO", "-o", tmp], { stdio: "ignore" });
      renameSync(tmp, p);
    }
    out.push(p);
  }
  return out;
};
