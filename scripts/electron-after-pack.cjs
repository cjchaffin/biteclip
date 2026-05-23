const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const projectRoot = context.packager.projectDir;
  const source = path.join(projectRoot, "dist-electron", "server", "node_modules");
  const destination = path.join(context.appOutDir, "resources", "server", "node_modules");

  if (!fs.existsSync(source)) {
    throw new Error(`Missing standalone server node_modules: ${source}`);
  }

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
  console.log(`Copied standalone server node_modules to ${destination}`);
};
