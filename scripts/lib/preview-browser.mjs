import { X509Certificate, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { getCACertificates, setDefaultCACertificates } from "node:tls";

// Test-process trust only: no certificate/key replacement or OS trust-store changes.
// Chromium's per-context ignoreHTTPSErrors can loop on parallel self-signed TLS
// handshakes. Trust this exact public key before the handshake instead.
export function previewChromiumOptions(certificatePath) {
  const pem = readFileSync(certificatePath, "utf8");
  const certificate = new X509Certificate(pem);
  if (
    !certificate.checkHost("localhost") ||
    Date.now() < Date.parse(certificate.validFrom) ||
    Date.now() >= Date.parse(certificate.validTo)
  )
    throw new Error("A current localhost preview certificate is required");
  const spki = createHash("sha256")
    .update(certificate.publicKey.export({ type: "spki", format: "der" }))
    .digest("base64");
  // Playwright's APIRequestContext runs in Node and needs the same explicit trust.
  setDefaultCACertificates([...getCACertificates("default"), pem]);
  return {
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--ignore-certificate-errors-spki-list=${spki}`,
    ],
  };
}
