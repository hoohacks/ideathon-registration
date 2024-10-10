// ssh-keygen -t rsa -b 4096 -m PEM -f jwt.key
// openssl rsa -in jwt.key -pubout -outform PEM -out jwt.key.pub
// mv jwt.key.pub ../src/jwt.key.pub
const jose = require("jose");
const fs = require("fs");

jose.generateKeyPair("RS256").then(({ publicKey, privateKey }) => {
    fs.writeFileSync("jwt.key", privateKey.export({ format: "pem", type: "pkcs8" }));
    fs.writeFileSync("../src/jwt.pub.json", JSON.stringify({ publicKey: publicKey.export({ format: "pem", type: "spki" }) }));
});
