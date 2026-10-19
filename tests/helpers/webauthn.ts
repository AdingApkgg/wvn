import { generateKeyPairSync, randomBytes, createHash } from "node:crypto";
// Test-only none-attestation fixture. Browser tests also exercise real CDP ceremonies.
export function registrationFixture(
  challenge: string,
  origin: string,
  userVerified: boolean,
) {
  const jwk = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  }).publicKey.export({ format: "jwk" });
  const cose = Buffer.concat([
    Buffer.from([0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21, 0x58, 0x20]),
    Buffer.from(jwk.x!, "base64url"),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(jwk.y!, "base64url"),
  ]);
  const id = randomBytes(32),
    authData = Buffer.concat([
      createHash("sha256").update(new URL(origin).hostname).digest(),
      Buffer.from([userVerified ? 0x45 : 0x41]),
      Buffer.alloc(4),
      Buffer.alloc(16),
      Buffer.from([0, 32]),
      id,
      cose,
    ]);
  const attestation = Buffer.concat([
    Buffer.from([0xa3, 0x63]),
    Buffer.from("fmt"),
    Buffer.from([0x64]),
    Buffer.from("none"),
    Buffer.from([0x67]),
    Buffer.from("attStmt"),
    Buffer.from([0xa0, 0x68]),
    Buffer.from("authData"),
    Buffer.from([0x58, authData.length]),
    authData,
  ]);
  return {
    id: id.toString("base64url"),
    rawId: id.toString("base64url"),
    type: "public-key" as const,
    response: {
      clientDataJSON: Buffer.from(
        JSON.stringify({
          type: "webauthn.create",
          challenge,
          origin,
          crossOrigin: false,
        }),
      ).toString("base64url"),
      attestationObject: attestation.toString("base64url"),
      transports: ["usb" as const],
    },
    clientExtensionResults: {},
  };
}
