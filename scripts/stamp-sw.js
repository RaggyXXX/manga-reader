const fs = require("fs");
const path = require("path");

const swPath = path.join(__dirname, "..", "public", "sw.js");
const sw = fs.readFileSync(swPath, "utf8");
// Replace either the placeholder or any previous timestamp
const stamped = sw.replace(
  /const SW_VERSION = "[^"]*";/,
  `const SW_VERSION = "${Date.now()}";`
);
fs.writeFileSync(swPath, stamped, "utf8");
console.log(`[stamp-sw] SW_VERSION stamped for build`);
