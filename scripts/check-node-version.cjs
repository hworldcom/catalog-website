const minimum = [22, 13, 0];
const current = process.versions.node.split(".").map(Number);

function isAtLeast(actual, required) {
  for (let i = 0; i < required.length; i += 1) {
    if ((actual[i] ?? 0) > required[i]) return true;
    if ((actual[i] ?? 0) < required[i]) return false;
  }
  return true;
}

if (!isAtLeast(current, minimum)) {
  console.error(
    `This project requires Node >= ${minimum.join(".")}. Current Node is ${process.versions.node}.`,
  );
  console.error("Use Node 22.13+ in this terminal, or run the project-local fallback:");
  console.error("  npm run dev:node22");
  console.error("");
  console.error(
    "For a permanent fix, install/switch Node 22.13+ with nvm, fnm, mise, or Homebrew.",
  );
  process.exit(1);
}
