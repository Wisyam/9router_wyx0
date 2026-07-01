import { FORMATS } from "../../translator/formats.js";

function isCodeBuddyCnResponsesGLM({ sourceFormat, provider, model }) {
  return (
    sourceFormat === FORMATS.OPENAI_RESPONSES &&
    provider === "codebuddy-cn" &&
    String(model || "").toLowerCase().includes("glm")
  );
}

export function shouldApplyCavemanPrompt(context) {
  return !isCodeBuddyCnResponsesGLM(context);
}

export function shouldDisableCodeBuddyCnReasoning(context) {
  return isCodeBuddyCnResponsesGLM(context);
}
