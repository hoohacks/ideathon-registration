/**
 * storage.rules.
 *
 * The resume folder matters most: the registration form uploads before the
 * person has an account, so that path is open to anyone, and the size cap and
 * the content types are all that stand between it and an arbitrary file host.
 * It has broken silently before (the folder was hardcoded to 2025), which is
 * why this executes the rules instead of trusting them.
 */
import { describe, test, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ref, uploadBytes, getMetadata } from "firebase/storage";
import { makeStorageTestEnv } from "./helpers.mjs";

const MB = 1024 * 1024;

const PDF = "application/pdf";
const DOC = "application/msword";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPT = "application/vnd.ms-powerpoint";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let testEnv;

beforeAll(async () => {
  testEnv = await makeStorageTestEnv();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

const storage = (uid) => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).storage();

const upload = (uid, path, contentType, size = 1024) =>
  uploadBytes(ref(storage(uid), path), new Uint8Array(size), { contentType });

const read = (uid, path) => getMetadata(ref(storage(uid), path));

/** Put a file in place past the rules, for the read tests. */
async function seedFile(path, contentType = PDF) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), path), new Uint8Array(16), { contentType });
  });
}

const RESUME = "ideathon-resumes/2027/2028/ada.pdf";

describe("uploading a resume", () => {
  test("anyone may upload a small PDF, .doc or .docx, before having an account", async () => {
    await assertSucceeds(upload(null, "ideathon-resumes/2027/2028/a.pdf", PDF));
    await assertSucceeds(upload(null, "ideathon-resumes/2027/2028/a.doc", DOC));
    await assertSucceeds(upload(null, "ideathon-resumes/2027/2028/a.docx", DOCX));
  });

  test("an anonymous resume upload with an .xlsx or .pptx content type is refused", async () => {
    await assertFails(upload(null, "ideathon-resumes/2027/2028/a.xlsx", XLSX));
    await assertFails(upload(null, "ideathon-resumes/2027/2028/a.pptx", PPTX));
  });

  test("an anonymous write to a resume path that already holds a file is refused", async () => {
    const existingPath = "ideathon-resumes/2027/2028/existing.pdf";
    await seedFile(existingPath, PDF);
    await assertFails(upload(null, existingPath, PDF));
  });

  test("the event year is not hardcoded", async () => {
    await assertSucceeds(upload(null, "ideathon-resumes/2031/2034/a.pdf", PDF));
  });

  test("a file just under 5 MB is accepted", async () => {
    await assertSucceeds(upload(null, RESUME, PDF, 5 * MB - 1));
  });

  test("a file of 5 MB or more is refused", async () => {
    await assertFails(upload(null, RESUME, PDF, 5 * MB));
    await assertFails(upload(null, RESUME, PDF, 5 * MB + 1));
  });

  test("an image or an HTML page is refused", async () => {
    await assertFails(upload(null, "ideathon-resumes/2027/2028/a.png", "image/png"));
    await assertFails(upload(null, "ideathon-resumes/2027/2028/a.html", "text/html"));
  });
});

describe("reading a resume", () => {
  beforeEach(async () => {
    await seedFile(RESUME);
  });

  test("a signed-in user can", async () => {
    await assertSucceeds(read("admin", RESUME));
  });

  test("an anonymous visitor cannot", async () => {
    await assertFails(read(null, RESUME));
  });
});

describe("the old resume folder", () => {
  const OLD = "ideathon-resume-2025/2026/ada.pdf";

  test("is readable when signed in, and not anonymously", async () => {
    await seedFile(OLD);
    await assertSucceeds(read("admin", OLD));
    await assertFails(read(null, OLD));
  });

  test("is not writable, even signed in", async () => {
    await assertFails(upload("alice", OLD, PDF));
    await assertFails(upload(null, OLD, PDF));
  });
});

describe("uploading a pitch deck", () => {
  test("a member may upload into their own uid folder", async () => {
    await assertSucceeds(upload("alice", "teams/team1/alice/deck.pdf", PDF));
    await assertSucceeds(upload("alice", "teams/team1/alice/deck.ppt", PPT));
    await assertSucceeds(upload("alice", "teams/team1/alice/deck.pptx", PPTX));
  });

  test("nobody may upload into someone else's folder", async () => {
    await assertFails(upload("carol", "teams/team1/alice/deck.pdf", PDF));
  });

  test("an anonymous visitor may not upload at all", async () => {
    await assertFails(upload(null, "teams/team1/alice/deck.pdf", PDF));
  });

  test("the wrong type is refused", async () => {
    await assertFails(upload("alice", "teams/team1/alice/deck.png", "image/png"));
    await assertFails(upload("alice", "teams/team1/alice/deck.html", "text/html"));
  });

  test("a deck just under 25 MB is accepted, and 25 MB or more is refused", async () => {
    await assertSucceeds(upload("alice", "teams/team1/alice/deck.pdf", PDF, 25 * MB - 1));
    await assertFails(upload("alice", "teams/team1/alice/deck.pdf", PDF, 25 * MB));
  });

  test("a signed-in user can read a deck, an anonymous visitor cannot", async () => {
    await seedFile("teams/team1/alice/deck.pdf");
    await assertSucceeds(read("judge1", "teams/team1/alice/deck.pdf"));
    await assertFails(read(null, "teams/team1/alice/deck.pdf"));
  });
});

describe("the old flat deck folder", () => {
  const OLD = "teams/team1/deck.pdf";

  test("is readable when signed in, and not anonymously", async () => {
    await seedFile(OLD);
    await assertSucceeds(read("judge1", OLD));
    await assertFails(read(null, OLD));
  });

  test("is not writable, even by a signed-in member", async () => {
    await assertFails(upload("alice", OLD, PDF));
  });
});

describe("everywhere else", () => {
  test("cannot be written, signed in or not", async () => {
    await assertFails(upload("alice", "somewhere/else.pdf", PDF));
    await assertFails(upload(null, "somewhere/else.pdf", PDF));
    await assertFails(upload("alice", "ideathon-resumes/2027/too/deep/a.pdf", PDF));
  });

  test("cannot be read", async () => {
    await seedFile("somewhere/else.pdf");
    await assertFails(read("alice", "somewhere/else.pdf"));
  });
});