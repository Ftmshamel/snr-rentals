#!/usr/bin/env node
// Make the values for the admin login environment variables. Nothing is
// written anywhere — copy the output into Vercel (API project → Settings →
// Environment Variables), then redeploy.
//
//   node scripts/hash-password.js            asks for a password → *_PASSWORD_HASH
//   node scripts/hash-password.js --secret   prints a random AUTH_SECRET
const crypto = require("crypto");
const readline = require("readline");
const { hashPassword } = require("../lib/password");

if (process.argv.includes("--secret")) {
  console.log(crypto.randomBytes(48).toString("base64url"));
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl.stdoutMuted = false;
rl._writeToOutput = function (s) {
  if (rl.stdoutMuted && !s.startsWith("\n") && !s.startsWith("\r")) rl.output.write("*");
  else rl.output.write(s);
};
rl.question("Password (at least 10 characters): ", (pw) => {
  rl.close();
  process.stdout.write("\n");
  if (String(pw).length < 10) {
    console.error("Too short — use at least 10 characters.");
    process.exit(1);
  }
  console.log(hashPassword(pw));
});
rl.stdoutMuted = true;
