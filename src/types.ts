/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
	/**
	 * Binding for static assets.
	 */
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	
	/**
	 * Z.AI API Key secret from Cloudflare Worker environment.
	 */
	Z_AI_API_KEY: string;
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
