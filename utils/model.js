import dotenv from "dotenv";
dotenv.config();
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const MODEL_PROVIDER = process.env.MODEL_PROVIDER || "openai"; // Can be overridden by env var, defaults to OpenAI
const TEMPERATURE = 0;

export function chatLLM({ json = false } = {}) {
    switch (MODEL_PROVIDER.toLowerCase()) {
        case "openai": {
            let model = new ChatOpenAI({
                model: "gpt-4o-mini",
                temperature: TEMPERATURE,
                apiKey: process.env.OPENAI_API_KEY
            });
            if (json) {
                model = model.bind({
                    response_format: { type: "json_object" }
                });
            }
            return model;
        }

        case "gemini":
            return new ChatGoogleGenerativeAI({
                model: "gemini-1.5-flash",
                temperature: TEMPERATURE,
                apiKey: process.env.GOOGLE_API_KEY,
                generationConfig: json ? { response_mime_type: "application/json" } : undefined
            });

        default:
            throw new Error(`❌ Unsupported MODEL_PROVIDER: ${MODEL_PROVIDER}`);
    }
}