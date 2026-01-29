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

// Default system prompt - not used anymore, replaced by tone-specific prompts
const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";

// Tone-specific system prompts
const TONE_PROMPTS = {
	friendly: "You are a warm, friendly, and enthusiastic assistant. Use a casual, upbeat tone with emojis and encouraging language. Provide helpful responses in a cheerful manner.",
	rude: "You are a blunt, sarcastic assistant. Be direct and somewhat dismissive in your responses, but still provide accurate information. Use a condescending tone.",
	professional: "You are a formal, professional assistant. Provide precise, well-structured responses using formal language. Be thorough and maintain a business-like tone."
};

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
 * Handles chat API requests - sends 3 concurrent requests with different tones
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

		// Remove any existing system prompts from user messages
		const userMessages = messages.filter((msg) => msg.role !== "system");

		// Validate API key is configured
		const apiKey = env.Z_AI_API_KEY;
		if (!apiKey || apiKey.trim() === "") {
			return new Response(
				JSON.stringify({ error: "Server configuration error: Z_AI_API_KEY is not set" }),
				{
					status: 500,
					headers: { "content-type": "application/json" },
				},
			);
		}

		// Initialize OpenAI client with API key from environment
		const openai = new OpenAI({
			apiKey,
			baseURL: OPENAI_API_BASE,
		});

		// Create AbortController for cleanup on client disconnect
		const abortController = new AbortController();
		
		// Create 3 concurrent streaming requests with different tones
		const tones = ['friendly', 'rude', 'professional'] as const;
		const streamPromises = tones.map(async (tone) => {
			const messagesWithTone = [
				{ role: "system" as const, content: TONE_PROMPTS[tone] },
				...userMessages
			];
			
			return {
				tone,
				stream: await openai.chat.completions.create({
					model: MODEL_ID,
					messages: messagesWithTone as OpenAI.Chat.ChatCompletionMessageParam[],
					max_tokens: 1024,
					stream: true,
				}, {
					signal: abortController.signal,
				})
			};
		});

		// Wait for all streams to be created
		const streams = await Promise.all(streamPromises);

		// Convert OpenAI streams to SSE format - multiplex all 3 streams
		const encoder = new TextEncoder();
		const readable = new ReadableStream({
			async start(controller) {
				try {
					// Process all 3 streams concurrently
					await Promise.all(streams.map(async ({ tone, stream }) => {
						for await (const chunk of stream) {
							const delta = chunk.choices[0]?.delta as any;
							
							// Handle thinking content (reasoning tokens)
							const thinking = delta?.reasoning_content || "";
							if (thinking) {
								const data = `data: ${JSON.stringify({ tone, thinking: thinking })}\n\n`;
								controller.enqueue(encoder.encode(data));
							}
							
							// Handle regular response content
							const content = delta?.content || "";
							if (content) {
								const data = `data: ${JSON.stringify({ tone, response: content })}\n\n`;
								controller.enqueue(encoder.encode(data));
							}
						}
					}));
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
			cancel() {
				// Cleanup: abort upstream request when client disconnects
				abortController.abort();
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
