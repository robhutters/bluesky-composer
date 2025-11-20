import { encryptText, decryptText, toBase64, fromBase64 } from "../lib/crypto";

(async () => {
  const passphrase = "test123";
  const plaintext = "hello world";

  const { ciphertext, iv, salt } = await encryptText(plaintext, passphrase);

  const roundtrip = await decryptText(ciphertext, iv, salt, passphrase);
  console.log("Decrypted:", roundtrip); // should print "hello world"

  // Now test with Base64 conversion
  const roundtrip2 = await decryptText(
    fromBase64(toBase64(ciphertext)),
    fromBase64(toBase64(iv)),
    fromBase64(toBase64(salt)),
    passphrase
  );
  console.log("Decrypted (Base64):", roundtrip2);
})();

