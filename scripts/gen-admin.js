const jose = require("jose");
const fs = require("fs");
const readline = require("readline");

async function createToken(payload, privKey) {
    const jwt = await new jose.SignJWT({
        ...payload,
    }).setProtectedHeader({ alg: "RS256" })
        .sign(privKey);

    return jwt;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question("Expiry Time (hours): ", async (hoursStr) => {
    const hr = parseInt(hoursStr);

    const privKey = await jose.importPKCS8(fs.readFileSync("jwt.key", "utf8"));

    const token = await createToken({
        username: "admin",
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * hr,
    }, privKey);

    console.log(token);

    rl.close();
});
