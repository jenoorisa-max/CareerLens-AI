// Career Finder form limits: frontend constraints match the shared/server
// limits exactly (src/shared/profile.ts), with the server's own messages.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const { mergeTags } = await import(`${root}/src/lib/tags.ts`);
const { PROFILE_LIMITS, validateProfile } = await import(`${root}/src/shared/profile.ts`);
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const tags = (n: number, prefix = "t") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

console.log("--- limits are the shared/server values");
check("PROFILE_LIMITS: name 100, education 100, field 150, goals 2000, tag 80, max tags 30",
  eq(PROFILE_LIMITS, { name: 100, educationLevel: 100, fieldOfStudy: 150, maxTags: 30, tagLength: 80, careerGoals: 2000 }), PROFILE_LIMITS);

console.log("--- tag length (80)");
const t80 = "a".repeat(80), t81 = "b".repeat(81);
check("80-character skill accepted", eq(mergeTags(t80, [], "skill"), { ok: true, tags: [t80] }), null);
const r81 = mergeTags(t81, ["Python"], "skill");
check("81-character skill rejected with the server's exact message",
  !r81.ok && r81.error === "Each skill must be 80 characters or fewer." && r81.error === validateProfile({ name: "N", educationLevel: "E", fieldOfStudy: "F", skills: [t81], interests: ["i"], careerGoals: "g" }).error, r81);
const r81i = mergeTags(t81, [], "interest");
check("81-character interest rejected with the server's exact interest message",
  !r81i.ok && r81i.error === "Each interest must be 80 characters or fewer." && r81i.error === validateProfile({ name: "N", educationLevel: "E", fieldOfStudy: "F", skills: ["s"], interests: [t81], careerGoals: "g" }).error, r81i);
const mixed = mergeTags(`ok, ${t81}, fine`, ["Python"], "skill");
check("comma list with one over-long tag: whole addition rejected (no partial add)", !mixed.ok, mixed);
check("80 characters after trimming spaces is accepted", mergeTags(`   ${t80}   `, [], "skill").ok, null);

console.log("--- tag count (30)");
check("adding the 30th tag accepted", eq(mergeTags("t29", tags(29), "skill"), { ok: true, tags: tags(30) }), null);
const r31 = mergeTags("extra", tags(30), "skill");
check("31st tag rejected with the server's exact message",
  !r31.ok && r31.error === "Please add no more than 30 skills." && r31.error === validateProfile({ name: "N", educationLevel: "E", fieldOfStudy: "F", skills: tags(31), interests: ["i"], careerGoals: "g" }).error, r31);
const r31i = mergeTags("extra", tags(30), "interest");
check("31st interest rejected with the server's exact interest message", !r31i.ok && r31i.error === "Please add no more than 30 interests.", r31i);
const over = mergeTags("x1, x2", tags(29), "skill");
check("29 + 2 new: whole addition rejected (no silent partial add)", !over.ok, over);
check("comma list reaching exactly 30 accepted", eq(mergeTags(tags(30).join(", "), [], "skill"), { ok: true, tags: tags(30) }), null);
check("at 30, adding a duplicate (case-insensitive) is not counted and is accepted unchanged", eq(mergeTags("T5, t29", tags(30), "skill"), { ok: true, tags: tags(30) }), null);
const current = tags(30);
mergeTags("extra", current, "skill");
check("rejection never mutates the existing list", eq(current, tags(30)), current.length);

console.log("--- unchanged behaviour");
check("empty / whitespace / commas only -> no change", eq(mergeTags(" , ,  ", ["a"], "skill"), { ok: true, tags: ["a"] }), null);
check("trims items and de-duplicates case-insensitively", eq(mergeTags(" SQL ,sql, Excel ", ["Python"], "skill"), { ok: true, tags: ["Python", "SQL", "Excel"] }), null);

console.log("--- rendered form constraints (server-rendered CareerFinder)");
{
  const React = (await import(`${root}/node_modules/react/index.js`)).default;
  const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
  const CF = (await import(`${root}/src/components/CareerFinder.tsx`)).default;
  const html = (initialProfile: unknown) => renderToStaticMarkup(React.createElement(CF, { initialProfile, careerResults: null, isLoading: false,
    onSubmitProfile: async () => {}, onSelectForSkillGap: () => {}, onSelectForRoadmap: () => {} }));
  const tag = (h: string, id: string) => h.match(new RegExp(`<(?:input|textarea)[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
  const h = html(null);
  check("name input maxlength=100", /maxLength="100"|maxlength="100"/.test(tag(h, "student-name")), tag(h, "student-name"));
  check("field of study input maxlength=150", /maxLength="150"|maxlength="150"/i.test(tag(h, "field-of-study")), tag(h, "field-of-study"));
  check("career goals textarea maxlength=2000", /maxlength="2000"/i.test(tag(h, "career-goals")), tag(h, "career-goals"));
  check("tag inputs have NO maxlength (they accept comma-separated lists; checked per tag instead)",
    !/maxlength/i.test(tag(h, "skills-input")) && !/maxlength/i.test(tag(h, "interests-input")), null);
  check("education is a fixed dropdown; every option is within the 100-character limit",
    [...h.matchAll(/<option[^>]*value="([^"]*)"/g)].every((m) => m[1].length > 0 && m[1].length <= PROFILE_LIMITS.educationLevel), null);
  const longName = "N".repeat(120);
  check("existing over-length value is NOT truncated when rendered (all 120 characters kept)",
    tag(html({ name: longName, educationLevel: "Undergraduate (Bachelor's)", fieldOfStudy: "CS", skills: ["a"], interests: ["b"], careerGoals: "g" }), "student-name").includes(`value="${longName}"`), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
