export type RegistrationField = {
  id: string;
  label: string;
  description: string;
  type:
    | "text"
    | "comment"
    | "tel"
    | "dropdown"
    | "radiogroup"
    | "checkbox"
    | "boolean";
  required: boolean;
  choices: string[];
  step: "character" | "contact" | "extra";
};
export type RegistrationConfig = {
  version: number;
  open: boolean;
  introduction: string;
  sideGuidance: [string, string];
  terms: string;
  confirmation: string;
  headings: { character: string; contact: string; extra: string };
  fields: RegistrationField[];
};
export type RegistrationRecord = {
  submittedSide?: number;
  originalAnswers?: Record<string, string | boolean | string[]>;
  id: string;
  side: number;
  answers: Record<string, string | boolean | string[]>;
  version: number;
  acceptedTerms: boolean;
  acceptedColors: boolean;
  submittedAt: number;
  updatedAt: number;
  status: "pending" | "confirmed" | "rejected";
  reason: string;
  revision: number;
  syncState?: string;
  syncError?: string;
  sheetRow?: number;
};
export const CORE_FIELDS = [
  "characterName",
  "playerIdentity",
  "characterClass",
  "contactName",
  "phone",
];
export function defaultRegistration(): RegistrationConfig {
  return {
    version: 0,
    open: false,
    introduction: "<p>Your next chapter begins here.</p>",
    sideGuidance: [
      "<p>Describe this side’s costume color requirements.</p>",
      "<p>Describe this side’s costume color requirements.</p>",
    ],
    terms: "<p>Add the event rules and terms before opening registration.</p>",
    confirmation:
      "Your registration request has been received. Keep this reference when contacting the organizers.",
    headings: {
      character: "Who answers the call?",
      contact: "How can we reach you?",
      extra: "A few final details",
    },
    fields: [
      {
        id: "characterName",
        label: "Character name",
        description: "Shown on the public roster after confirmation.",
        type: "text",
        required: true,
        choices: [],
        step: "character",
      },
      {
        id: "playerIdentity",
        label: "Public player identity",
        description: "The name or nickname you agree to display on the roster.",
        type: "text",
        required: true,
        choices: [],
        step: "character",
      },
      {
        id: "characterClass",
        label: "Class",
        description: "",
        type: "text",
        required: true,
        choices: [],
        step: "character",
      },
      {
        id: "contactName",
        label: "Contact name",
        description: "Private to event organizers.",
        type: "text",
        required: true,
        choices: [],
        step: "contact",
      },
      {
        id: "phone",
        label: "Phone number",
        description: "Private to event organizers.",
        type: "tel",
        required: true,
        choices: [],
        step: "contact",
      },
    ],
  };
}
export function validateRegistrationConfig(
  value: unknown,
): asserts value is RegistrationConfig {
  const c = value as RegistrationConfig;
  if (
    !c ||
    typeof c.open !== "boolean" ||
    !Array.isArray(c.fields) ||
    c.fields.length > 40 ||
    !c.fields.length
  )
    throw new Error("Use between 5 and 40 questions.");
  for (const text of [c.introduction, c.terms, ...(c.sideGuidance ?? [])])
    if (typeof text !== "string" || text.length > 40000)
      throw new Error("Rich text must be at most 40,000 characters.");
  if (
    c.sideGuidance?.length !== 2 ||
    typeof c.confirmation !== "string" ||
    c.confirmation.length > 2000
  )
    throw new Error("Provide both side guides and a confirmation message.");
  if (!c.terms.replace(/<[^>]*>/g, "").trim())
    throw new Error("Provide the event terms.");
  for (const key of ["character", "contact", "extra"] as const)
    if (
      typeof c.headings?.[key] !== "string" ||
      !c.headings[key].trim() ||
      c.headings[key].length > 160
    )
      throw new Error("Provide each step heading.");
  const ids = new Set<string>();
  for (const f of c.fields) {
    if (
      !f ||
      !/^([a-zA-Z][a-zA-Z0-9_]{0,63})$/.test(f.id) ||
      ["__proto__", "constructor", "prototype"].includes(f.id) ||
      ids.has(f.id)
    )
      throw new Error("Question identifiers must be unique.");
    ids.add(f.id);
    if (
      typeof f.label !== "string" ||
      !f.label.trim() ||
      f.label.length > 200 ||
      typeof f.description !== "string" ||
      f.description.length > 1000 ||
      typeof f.required !== "boolean" ||
      ![
        "text",
        "comment",
        "tel",
        "dropdown",
        "radiogroup",
        "checkbox",
        "boolean",
      ].includes(f.type) ||
      !["character", "contact", "extra"].includes(f.step)
    )
      throw new Error("Check question labels and types.");
    if (
      !Array.isArray(f.choices) ||
      f.choices.length > 50 ||
      f.choices.some(
        (v) => typeof v !== "string" || !v.trim() || v.length > 150,
      ) ||
      new Set(f.choices).size !== f.choices.length
    )
      throw new Error("Use distinct choices, up to 50 per question.");
    if (
      ["dropdown", "radiogroup", "checkbox"].includes(f.type) &&
      !f.choices.length
    )
      throw new Error("Add choices to each choice question.");
  }
  for (const key of CORE_FIELDS) {
    const f = c.fields.find((f) => f.id === key);
    if (
      !f ||
      !f.required ||
      !["text", "tel", "dropdown", "radiogroup"].includes(f.type)
    )
      throw new Error(
        "The five registration identity/contact fields must remain required text or single-choice questions.",
      );
  }
}
export function cleanRegistrationAnswers(
  c: RegistrationConfig,
  input: unknown,
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Provide your registration answers.");
  const answers: RegistrationRecord["answers"] = {};
  for (const f of c.fields) {
    let v = (input as Record<string, unknown>)[f.id];
    if (typeof v === "string") v = v.trim();
    const missing =
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0) ||
      (f.type === "boolean" && v !== true);
    if (missing) {
      if (f.required) throw new Error(`Please complete: ${f.label}`);
      continue;
    }
    if (f.type === "boolean") {
      if (typeof v !== "boolean") throw new Error(`Check ${f.label}`);
    } else if (f.type === "checkbox") {
      if (
        !Array.isArray(v) ||
        v.length > 50 ||
        new Set(v).size !== v.length ||
        v.some((x) => !f.choices.includes(x))
      )
        throw new Error(`Check ${f.label}`);
    } else if (
      typeof v !== "string" ||
      v.length >
        (CORE_FIELDS.includes(f.id)
          ? 100
          : f.type === "comment"
            ? 4000
            : 500) ||
      (["dropdown", "radiogroup"].includes(f.type) && !f.choices.includes(v))
    )
      throw new Error(`Check ${f.label}`);
    answers[f.id] = v as string | boolean | string[];
  }
  return answers;
}
export function registrationSurvey(c: RegistrationConfig) {
  return {
    showQuestionNumbers: "off",
    showCompletedPage: false,
    completeText: "Review registration",
    pages: (["character", "contact", "extra"] as const)
      .filter((step) => c.fields.some((f) => f.step === step))
      .map((step) => ({
        name: step,
        title: c.headings[step],
        elements: c.fields
          .filter((f) => f.step === step)
          .map((f) => ({
            name: f.id,
            title: f.label,
            description: f.description,
            type: f.type === "tel" ? "text" : f.type,
            inputType: f.type === "tel" ? "tel" : undefined,
            isRequired: f.required,
            choices: f.choices,
            maxLength: CORE_FIELDS.includes(f.id)
              ? 100
              : f.type === "comment"
                ? 4000
                : 500,
          })),
      })),
  };
}
