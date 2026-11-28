// Phase 1 Career Finder redesign: structure, accessibility and real-data-only
// rendering of the real component (interaction is covered by the browser checks).
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const React = (await import(`${root}/node_modules/react/index.js`)).default;
const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
const CF = (await import(`${root}/src/components/CareerFinder.tsx`)).default;
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const noop = () => {};
const render = (p: object = {}) => renderToStaticMarkup(React.createElement(CF, {
  initialProfile: null, careerResults: null, isLoading: false, onSubmitProfile: async () => {}, onSelectForSkillGap: noop, onSelectForRoadmap: noop, ...p,
}));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const profile = { name: "Amina Tariq", educationLevel: "Undergraduate (Bachelor's)", fieldOfStudy: "Computer Science", skills: ["Python", "SQL"], interests: ["AI"], careerGoals: "Grow into a data role." };
const career = (n: number) => ({ id: `c${n}`, title: `Career ${n}`, matchScore: 140 - n * 30, tagline: `Tagline ${n}`, explanation: "Explanation", whyItFitsProfile: "Because", dayToDay: ["Task A", "Task B"], coreSkills: ["SQL", "Python"], growthOutlook: "Growing" });
const results = { profileSummary: "Strong analytical foundation.", careers: [career(1), career(2), career(3)] };

console.log("--- structure and labels");
const empty = render();
check("page h1 present (one h1)", (empty.match(/<h1\b/g) ?? []).length === 1 && text(empty).includes("Find career paths that fit you"), null);
check("form organised into 3 sections (fieldsets with legends): About you, Skills and interests, Career goals",
  ["About you", "Skills and interests", "Career goals"].every((l) => new RegExp(`<legend[^>]*>${l}</legend>`).test(empty)), null);
for (const [id, label] of [["student-name", "Full Name"], ["education-level", "Education Level"], ["field-of-study", "Field of Study"], ["skills-input", "Current Skills"], ["interests-input", "Interests &amp; Domains"], ["career-goals", "Career Goals"]]) {
  check(`label '${label.replace("&amp;", "&")}' is associated with #${id}`, new RegExp(`<label[^>]*for="${id}"[^>]*>${label}</label>`).test(empty) && empty.includes(`id="${id}"`), null);
}
check("helper text and counters linked to tag inputs (aria-describedby)",
  /id="skills-input"[^>]*aria-describedby="skills-input-help skills-input-count"/.test(empty) && text(empty).includes("0/30"), empty.match(/<input[^>]*id="skills-input"[^>]*>/)?.[0]);
check("career goals counter shows real length and limit (0/2,000)", text(empty).includes("0/2,000"), null);
check("all existing controls kept: Try Sample Profile, 2 Add buttons, suggestions, submit 'Find 3 Career Paths'",
  text(empty).includes("Try Sample Profile") && (empty.match(/>Add<\/button>/g) ?? []).length === 2 && text(empty).includes("+ Python") && /<button type="submit"[^>]*>.*Find 3 Career Paths/.test(empty), null);

console.log("--- profile completeness (computed from the form, nothing invented)");
check("empty form: 0 of 5 complete, progressbar value 0", text(empty).includes("0 of 5 complete") && /aria-label="Profile completeness"[^>]*aria-valuenow="0"/.test(empty), null);
const filled = render({ initialProfile: profile });
check("filled form: 5 of 5 complete, progressbar value 5", text(filled).includes("5 of 5 complete") && /aria-label="Profile completeness"[^>]*aria-valuenow="5"/.test(filled), null);
check("skill chips rendered with remove labels and real counter (2/30)", filled.includes('aria-label="Remove skill Python"') && text(filled).includes("2/30"), null);

console.log("--- states");
const loading = render({ initialProfile: profile, isLoading: true });
check("loading: status message (role=status), aria-busy section, submit shows 'Analyzing Profile...' and is disabled",
  /role="status"/.test(loading) && /aria-busy="true"/.test(loading) && /<button type="submit"[^>]*disabled=""[^>]*>.*Analyzing Profile\.\.\./.test(loading), null);
check("reduced motion respected: spinners/skeletons only animate with motion-safe", !/\banimate-(spin|pulse)\b/.test(loading.replace(/motion-safe:animate-(spin|pulse)/g, "")) && /motion-safe:animate-pulse/.test(loading), null);
check("loading hides results", !text(render({ careerResults: results, isLoading: true })).includes("Profile Synthesis"), null);
const failed = render({ initialProfile: profile, careerResults: results, resultsProfile: profile, searchFailure: { message: "The AI service is busy.", retryable: true }, onRetrySearch: noop });
check("error: failure notice (role=alert) with message, previous-assessment label and Try again",
  /role="alert"/.test(failed) && text(failed).includes("We couldn't generate career paths for your updated details.") && text(failed).includes("previous assessment for Amina Tariq (Computer Science)") && text(failed).includes("Try again"), null);

console.log("--- results (real data only)");
const res = render({ initialProfile: profile, careerResults: results, resultsProfile: profile });
const t = text(res);
check("Profile Synthesis with real summary and 'For name · field'", t.includes("Profile Synthesis") && t.includes("For Amina Tariq · Computer Science") && t.includes("Strong analytical foundation."), null);
check("3 career cards (articles) with titles, taglines, explanations", (res.match(/<article\b/g) ?? []).length === 3 && ["Career 1", "Tagline 2", "Explanation"].every((s) => t.includes(s)), null);
check("match scores clamped and shown as text and accessible bars (100/80/50)",
  t.includes("100% Fit") && t.includes("80% Fit") && t.includes("50% Fit") && ["100", "80", "50"].every((v) => new RegExp(`aria-label="Match for Career \\d"[^>]*aria-valuenow="${v}"`).test(res)), null);
check("all career fields rendered: why it fits, day-to-day, core skills, growth outlook",
  ["Why It Fits Your Profile", "Because", "Day-to-Day Responsibilities", "Task A", "Core Skills", "Growing"].every((s) => t.includes(s)), null);
check("per-career actions keep their labels and have descriptive accessible names",
  (t.match(/Analyze Skill Gap/g) ?? []).length >= 3 && res.includes('aria-label="Analyze Skill Gap for Career 2"') && res.includes('aria-label="Build Learning Roadmap for Career 3"'), null);
check("no results section without results", !text(render({ initialProfile: profile })).includes("Recommended Career Paths"), null);

console.log("--- design system");
check("uses design-system classes (cl-card, cl-input, cl-btn-primary)", ["cl-card", "cl-input", "cl-btn-primary", "cl-btn-secondary"].every((c) => res.includes(c)), null);
check("no legacy hard-coded palette (#5B21B6 / #18132A / #E8E1F8 / slate-*)", !/#5B21B6|#18132A|#E8E1F8|slate-\d/i.test(res + empty + loading + failed), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
