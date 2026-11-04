import { describe, it, expect } from "vitest";
import {
  defaultRegistration,
  validateRegistrationConfig,
  cleanRegistrationAnswers,
  registrationSurvey,
} from "../shared/registration";
describe("event registration validation", () => {
  it("requires protected identity fields and rejects malformed choice definitions", () => {
    const c = defaultRegistration();
    expect(() => validateRegistrationConfig(c)).not.toThrow();
    c.fields = c.fields.slice(1);
    expect(() => validateRegistrationConfig(c)).toThrow();
    const x = defaultRegistration();
    x.fields.push({
      ...x.fields[0],
      id: "pick",
      type: "dropdown",
      choices: ["Red", "Red"],
    });
    expect(() => validateRegistrationConfig(x)).toThrow();
  });
  it("validates answers on the server and excludes unexpected private or executable fields", () => {
    const c = defaultRegistration();
    const answers = {
      characterName: "  Mira ",
      playerIdentity: "Player",
      characterClass: "Ranger",
      contactName: "Private",
      phone: "+66 1234",
      status: "confirmed",
    };
    expect(cleanRegistrationAnswers(c, answers)).toEqual({
      characterName: "Mira",
      playerIdentity: "Player",
      characterClass: "Ranger",
      contactName: "Private",
      phone: "+66 1234",
    });
    expect(() =>
      cleanRegistrationAnswers(c, { ...answers, phone: "" }),
    ).toThrow();
    c.fields.push({
      id: "diet",
      label: "Diet",
      description: "",
      step: "extra",
      type: "checkbox",
      choices: ["Vegetarian", "None"],
      required: true,
    });
    expect(() =>
      cleanRegistrationAnswers(c, { ...answers, diet: ["unknown"] }),
    ).toThrow();
  });
  it("builds SurveyJS steps while retaining field identities after label changes", () => {
    const c = defaultRegistration();
    c.fields[0].label = "Who are you?";
    const schema = registrationSurvey(c);
    expect(schema.pages).toHaveLength(2);
    expect(schema.pages[0].elements[0]).toMatchObject({
      name: "characterName",
      title: "Who are you?",
      isRequired: true,
    });
  });
});
