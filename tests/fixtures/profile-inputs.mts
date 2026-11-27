// Inputs for the validateProfile equivalence test. The expected outputs in
// validate-profile-golden.json were generated ONCE from the original
// src/server/validation.ts (commit 77601fa, before validateProfile moved to
// src/shared/profile.ts), so the test proves behaviour and messages are unchanged.
export const base = {
  name: "Amina",
  educationLevel: "Undergraduate",
  fieldOfStudy: "CS",
  skills: ["Python"],
  interests: ["AI"],
  careerGoals: "Grow",
};

export const inputs: unknown[] = [
  base, {}, null, undefined, "str", 42, [],
  { ...base, name: "" }, { ...base, name: "   " }, { ...base, name: 5 }, { ...base, name: "a".repeat(100) }, { ...base, name: "a".repeat(101) },
  { ...base, educationLevel: "" }, { ...base, educationLevel: "e".repeat(101) },
  { ...base, fieldOfStudy: "" }, { ...base, fieldOfStudy: "f".repeat(151) },
  { ...base, skills: "Python" }, { ...base, skills: [] }, { ...base, skills: ["  ", ""] }, { ...base, skills: [1, " SQL ", null] },
  { ...base, skills: Array.from({ length: 31 }, (_, i) => `s${i}`) }, { ...base, skills: ["x".repeat(81)] },
  { ...base, interests: [] }, { ...base, interests: Array.from({ length: 31 }, (_, i) => `i${i}`) }, { ...base, interests: ["y".repeat(81)] },
  { ...base, careerGoals: "" }, { ...base, careerGoals: "g".repeat(2001) }, { ...base, name: "  Trimmed  ", careerGoals: " g " },
];
