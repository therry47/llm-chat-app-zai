/**
 * LLM Chat Application Template
 *
 * A simple chat application using OpenAI API.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import OpenAI from "openai";
import { Env, ChatMessage } from "./types";

// OpenAI API Configuration
const OPENAI_API_BASE = "https://api.z.ai/api/coding/paas/v4";
const MODEL_ID = "glm-4.7";

// Default system prompt
const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
	/**
	 * Main request handler for the Worker
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API Routes
		if (url.pathname === "/api/chat") {
			// Handle POST requests for chat
			if (request.method === "POST") {
				return handleChatRequest(request, env);
			}

			// Method not allowed for other request types
			return new Response("Method not allowed", { status: 405 });
		}

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		// Parse JSON request body
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		// Add system prompt if not present
		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		// Initialize OpenAI client with API key from environment
		const openai = new OpenAI({
			apiKey: env.Z_AI_API_KEY,
			baseURL: OPENAI_API_BASE,
		});

		// Create streaming chat completion
		const stream = await openai.chat.completions.create({
			model: MODEL_ID,
			messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
			max_tokens: 1024,
			stream: true,
		});

		// Convert OpenAI stream to SSE format
		const encoder = new TextEncoder();
		const readable = new ReadableStream({
			async start(controller) {
				try {
					for await (const chunk of stream) {
						const delta = chunk.choices[0]?.delta as any;
						
						// Handle thinking content (reasoning tokens)
						const thinking = delta?.reasoning_content || "";
						if (thinking) {
							const data = `data: ${JSON.stringify({ thinking: thinking })}\n\n`;
							controller.enqueue(encoder.encode(data));
						}
						
						// Handle regular response content
						const content = delta?.content || "";
						if (content) {
							const data = `data: ${JSON.stringify({ response: content })}\n\n`;
							controller.enqueue(encoder.encode(data));
						}
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
		});

		return new Response(readable, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}
