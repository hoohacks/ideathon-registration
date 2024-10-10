const jose = require("jose");
const fs = require("fs");

async function createToken(payload, privKey) {
    const jwt = await new jose.SignJWT({
        ...payload,
    }).setProtectedHeader({ alg: "RS256" })
        .sign(privKey);

    return jwt;
}

(async () => {
    const privKey = await jose.importPKCS8(fs.readFileSync("jwt.key", "utf8"));

    const token = await createToken({
        username: "admin",
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }, privKey);

    console.log(token);
})();
