// Phase 1 Landing Page: content, structure, navigation targets and honesty rules
// (server-rendered real component; interaction is covered by landing.browser.mts).
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const React = (await import(`${root}/node_modules/react/index.js`)).default;
const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
const LandingPage = (await import(`${root}/src/components/LandingPage.tsx`)).default;
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };

const html: string = renderToStaticMarkup(React.createElement(LandingPage, { onGetStarted: () => {}, onOpenFeature: () => {} }));
const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

console.log("--- branding and hero");
check("brand 'CareerLens AI' present", /CareerLens\s*<span[^>]*>AI<\/span>/.test(html), null);
check("hero h1 is the tagline 'Discover Your Career. Build Your Future.'",
  /<h1[^>]*>Discover Your Career\.\s*<span[^>]*>Build Your Future\.<\/span><\/h1>/.test(html), html.match(/<h1[\s\S]*?<\/h1>/)?.[0]);
check("exactly one h1", (html.match(/<h1\b/g) ?? []).length === 1, null);
check("hero description mentions career paths, skill gaps and learning roadmaps",
  /career paths/i.test(text) && /skills you still need|skill gap/i.test(text) && /learning roadmap/i.test(text), null);
check("'Get Started' buttons present (nav, hero, final CTA, footer)", (text.match(/Get Started/g) ?? []).length >= 4, (text.match(/Get Started/g) ?? []).length);
check("'Explore Features' links to #features", /<a href="#features"[^>]*>Explore Features<\/a>/.test(html), null);

console.log("--- navigation and sections");
for (const [label, id] of [["Home", "home"], ["Features", "features"], ["How It Works", "how-it-works"], ["About", "about"]]) {
  check(`nav link '${label}' -> #${id} and section exists`, new RegExp(`<a href="#${id}"[^>]*>${label}</a>`).test(html) && html.includes(`id="${id}"`), null);
}
check("landmarks: header, main navigation, main, footer navigation",
  html.includes("<header") && html.includes('aria-label="Main navigation"') && html.includes("<main") && html.includes('aria-label="Footer navigation"'), null);
check("mobile menu toggle is accessible (aria-expanded=false, aria-controls, label)",
  /aria-expanded="false"[^>]*aria-controls="landing-mobile-menu"[^>]*aria-label="Open menu"/.test(html), null);
check("mobile menu panel not rendered until opened", !html.includes('id="landing-mobile-menu"'), null);

console.log("--- features, steps, value");
for (const f of ["AI Career Finder", "Skill Gap Analyzer", "Personalized Learning Roadmap"]) {
  check(`feature card '${f}' with an 'Open ${f}' button`, text.includes(f) && html.includes(`aria-label="Open ${f}"`), null);
}
for (const s of ["Discover career opportunities", "Identify your skill gaps", "Follow your learning roadmap"]) {
  check(`how-it-works step '${s}'`, text.includes(s), null);
}
check("'Why CareerLens AI' section present", text.includes("Why CareerLens AI"), null);
check("final call to action present", /Start your career discovery journey/.test(text), null);
check("footer has brand and tagline", /<footer[\s\S]*CareerLens[\s\S]*Discover Your Career\. Build Your Future\./.test(html), null);

console.log("--- honesty rules (no fabricated content, no invented features)");
check("no percentages or numeric claims ('%', 'users', 'students helped', ratings)", !/\d+\s*%|\b\d[\d,.]*\+?\s*(users|students|learners|careers matched|reviews)\b|★|out of 5/i.test(text), text.match(/\d+\s*%/)?.[0]);
check("no testimonials or quotes from people", !/testimonial|“|”|said|— [A-Z][a-z]+ [A-Z]/i.test(text), null);
check("no login / sign-up / account system invented", !/log ?in|sign ?in|sign ?up\b(?! required)|create (an )?account|password/i.test(text.replace(/No sign-up required/g, "")), null);
check("product preview is labelled as an example and hidden from screen readers", html.includes("Example preview") && /aria-hidden="true"[^>]*>[\s\S]*Example preview/.test(html), null);
check("AI guidance caveat present (alongside teachers, mentors, counsellors)", /alongside advice from teachers, mentors and career counsellors/.test(text), null);

console.log("--- design system usage");
check("uses the design-system classes (cl-btn, cl-card, cl-container, tokens)",
  ["cl-btn-primary", "cl-btn-secondary", "cl-card", "cl-container", "bg-canvas", "text-ink", "text-display", "text-heading"].every((c) => html.includes(c)), null);
check("no legacy hard-coded palette colours (#5B21B6 / #18132A / #E8E1F8)", !/#5B21B6|#18132A|#E8E1F8/i.test(html), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
