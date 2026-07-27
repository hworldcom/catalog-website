if (process.env.npm_config_package_lock_only === "true") {
  process.exit(0);
}

try {
  require("@rolldown/binding-darwin-arm64");
} catch (error) {
  if (process.platform === "darwin" && process.arch === "arm64") {
    console.error("Missing @rolldown/binding-darwin-arm64 native optional dependency.");
    console.error("Remove node_modules and run `npm ci` again with Node 22.13+.");
    process.exit(1);
  }
}
