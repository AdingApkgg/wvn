import { X509Certificate, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { getCACertificates, setDefaultCACertificates } from "node:tls";

// Test-process trust only: no certificate/key replacement or OS trust-store changes.
// Chromium's per-context ignoreHTTPSErrors can loop on parallel self-signed TLS
// handshakes. Trust this exact public key before the handshake instead.
// `certificatePaths` may name several preview stacks at once (the content
// boundaries suite talks to a second preview on its own admin listeners).
/** @param {string | string[]} certificatePaths */
export function previewChromiumOptions(certificatePaths) {
  const paths = [certificatePaths].flat().filter(Boolean);
  const pems = paths.map((path) => readFileSync(path, "utf8"));
  const spki = pems.map((pem) => {
    const certificate = new X509Certificate(pem);
    if (
      !certificate.checkHost("localhost") ||
      Date.now() < Date.parse(certificate.validFrom) ||
      Date.now() >= Date.parse(certificate.validTo)
    )
      throw new Error("A current localhost preview certificate is required");
    return createHash("sha256")
      .update(certificate.publicKey.export({ type: "spki", format: "der" }))
      .digest("base64");
  });
  // Playwright's APIRequestContext runs in Node and needs the same explicit trust.
  setDefaultCACertificates([...getCACertificates("default"), ...pems]);
  return {
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--ignore-certificate-errors-spki-list=${spki.join(",")}`,
    ],
  };
}
