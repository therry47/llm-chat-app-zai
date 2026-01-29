/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

// Chat state
let chatHistory = [
	{
		role: "assistant",
		content:
			"Hello! I'm an LLM chat app powered by Cloudflare Workers AI. How can I help you today?",
	},
];
let isProcessing = false;

/**
 * Parse markdown to HTML safely
 */
function parseMarkdown(text) {
	// Escape HTML to prevent XSS
	function escapeHtml(unsafe) {
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}
	
	// Parse markdown syntax
	let html = escapeHtml(text);
	
	// Code blocks (must be before inline code)
	html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
		return '<pre><code>' + code.trim() + '</code></pre>';
	});
	
	// Inline code
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	
	// Bold
	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	
	// Italic
	html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
	
	// Headers
	html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
	html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
	html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
	
	// Links
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (match, text, url) {
		// Sanitize URL: allow http, https, mailto, relative and hash links
		var trimmedUrl = (url || "").trim();
		var lowerUrl = trimmedUrl.toLowerCase();
		
		var isAllowedScheme =
			lowerUrl.startsWith("http://") ||
			lowerUrl.startsWith("https://") ||
			lowerUrl.startsWith("mailto:");
		
		var isRelativeOrHash =
			trimmedUrl.startsWith("/") ||
			trimmedUrl.startsWith("#") ||
			// No colon means no explicit scheme (e.g., "path/to/page")
			trimmedUrl.indexOf(":") === -1;
		
		var safeUrl = (isAllowedScheme || isRelativeOrHash) ? trimmedUrl : "#";
		
		return '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + text + "</a>";
	});
	
	// Unordered lists
	html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
	html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
	html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
	
	// Ordered lists
	html = html.replace(/^\d+\. (.+)$/gim, '<li>$1</li>');
	
	// Blockquotes
	html = html.replace(/^> (.+)$/gim, '<blockquote>$1</blockquote>');
	
	// Line breaks
	html = html.replace(/\n/g, '<br>');
	
	return html;
}

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
	const message = userInput.value.trim();

	// Don't send empty messages
	if (message === "" || isProcessing) return;

	// Disable input while processing
	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;

	// Add user message to chat
	addMessageToChat("user", message);

	// Clear input
	userInput.value = "";
	userInput.style.height = "auto";

	// Show typing indicator
	typingIndicator.classList.add("visible");

	// Add message to history
	chatHistory.push({ role: "user", content: message });

	try {
		// Create new assistant response element
		const assistantMessageEl = document.createElement("div");
		assistantMessageEl.className = "message assistant-message";
		
		// Create thinking section (initially hidden)
		const thinkingSection = document.createElement("div");
		thinkingSection.className = "thinking-section";
		thinkingSection.style.display = "none";
		thinkingSection.innerHTML = `
			<div class="thinking-header">
				<div class="thinking-title">
					<span>💭</span>
					<span>Thinking process</span>
				</div>
				<span class="thinking-toggle">▼</span>
			</div>
			<div class="thinking-content"></div>
		`;
		
		// Create response container (for markdown)
		const responseContainer = document.createElement("div");
		responseContainer.className = "response-content";
		
		// Assemble message
		assistantMessageEl.appendChild(thinkingSection);
		assistantMessageEl.appendChild(responseContainer);
		chatMessages.appendChild(assistantMessageEl);
		
		const thinkingContentEl = thinkingSection.querySelector(".thinking-content");
		const thinkingToggleEl = thinkingSection.querySelector(".thinking-toggle");
		const thinkingHeaderEl = thinkingSection.querySelector(".thinking-header");
		
		// Add click handler for collapsing/expanding thinking
		thinkingHeaderEl.addEventListener("click", () => {
			thinkingContentEl.classList.toggle("collapsed");
			thinkingToggleEl.classList.toggle("collapsed");
		});
		
		// Start with thinking collapsed
		thinkingContentEl.classList.add("collapsed");
		thinkingToggleEl.classList.add("collapsed");

		// Scroll to bottom
		chatMessages.scrollTop = chatMessages.scrollHeight;

		// Send request to API
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messages: chatHistory,
			}),
		});

		// Handle errors
		if (!response.ok) {
			throw new Error("Failed to get response");
		}
		if (!response.body) {
			throw new Error("Response body is null");
		}

		// Process streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let responseText = "";
		let thinkingText = "";
		let buffer = "";
		const flushAssistantText = () => {
			responseContainer.innerHTML = parseMarkdown(responseText);
			chatMessages.scrollTop = chatMessages.scrollHeight;
		};
		const flushThinkingText = () => {
			thinkingContentEl.textContent = thinkingText;
			// Show thinking section if we have content
			if (thinkingText.length > 0) {
				thinkingSection.style.display = "block";
			}
		};

		let sawDone = false;
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				// Process any remaining complete events in buffer
				const parsed = consumeSseEvents(buffer + "\n\n");
				for (const data of parsed.events) {
					if (data === "[DONE]") {
						break;
					}
					try {
						const jsonData = JSON.parse(data);
						
						// Handle thinking content
						if (jsonData.thinking) {
							thinkingText += jsonData.thinking;
							flushThinkingText();
						}
						
						// Handle response content
						let content = "";
						if (
							typeof jsonData.response === "string" &&
							jsonData.response.length > 0
						) {
							content = jsonData.response;
						} else if (jsonData.choices?.[0]?.delta?.content) {
							content = jsonData.choices[0].delta.content;
						}
						if (content) {
							responseText += content;
							flushAssistantText();
						}
					} catch (e) {
						console.error("Error parsing SSE data as JSON:", e, data);
					}
				}
				break;
			}

			// Decode chunk
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") {
					sawDone = true;
					buffer = "";
					break;
				}
				try {
					const jsonData = JSON.parse(data);
					
					// Handle thinking content
					if (jsonData.thinking) {
						thinkingText += jsonData.thinking;
						flushThinkingText();
					}
					
					// Handle response content
					let content = "";
					if (
						typeof jsonData.response === "string" &&
						jsonData.response.length > 0
					) {
						content = jsonData.response;
					} else if (jsonData.choices?.[0]?.delta?.content) {
						content = jsonData.choices[0].delta.content;
					}
					if (content) {
						responseText += content;
						flushAssistantText();
					}
				} catch (e) {
					console.error("Error parsing SSE data as JSON:", e, data);
				}
			}
			if (sawDone) {
				break;
			}
		}

		// Add completed response to chat history
		if (responseText.length > 0) {
			chatHistory.push({ role: "assistant", content: responseText });
		}
	} catch (error) {
		console.error("Error:", error);
		addMessageToChat(
			"assistant",
			"Sorry, there was an error processing your request.",
		);
	} finally {
		// Hide typing indicator
		typingIndicator.classList.remove("visible");

		// Re-enable input
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;
	
	// Use markdown for assistant messages, plain text for user messages
	if (role === "assistant") {
		const contentDiv = document.createElement("div");
		contentDiv.innerHTML = parseMarkdown(content);
		messageEl.appendChild(contentDiv);
	} else {
		const p = document.createElement("p");
		p.textContent = content;
		messageEl.appendChild(p);
	}
	
	chatMessages.appendChild(messageEl);

	// Scroll to bottom
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;
	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);

		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join("\n"));
	}
	return { events, buffer: normalized };
}
