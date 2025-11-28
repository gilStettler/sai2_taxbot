// ==== CONFIG: IDs aus deinem Python-Script ====
const PROMPT_ID = "pmpt_692896af992881959106cbd3c386f89409af548b48c6b541";
const PROMPT_VERSION = "5";
const VECTOR_STORE_ID = "vs_69289678d9ac81919df96098adb8ec9e";

// ==== STATE ====
let apiKey = null;

// Chat-Verlauf: [{ role: "user" | "assistant", content: "..." }, ...]
let conversation = [];

// ==== DOM ELEMENTS ====
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const apiKeyStatus = document.getElementById("apiKeyStatus");
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const clearChatBtn = document.getElementById("clearChatBtn");

// ==== INIT ====
(function init() {
  const storedKey = localStorage.getItem("openai_api_key");
  if (storedKey) {
    apiKey = storedKey;
    apiKeyInput.value = "********";
    apiKeyStatus.textContent = "Key geladen";
  } else {
    apiKeyStatus.textContent = "Kein Key gespeichert";
  }

  // Optionale Komfort-Settings für marked
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      mangle: false,
      headerIds: false
    });
  }

  renderConversation();
})();

// ==== HELFER ====

function addMessage(role, content) {
  conversation.push({ role, content });
  renderConversation();
}

function renderConversation() {
  chatWindow.innerHTML = "";

  conversation.forEach((msg) => {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message", msg.role);

    const meta = document.createElement("div");
    meta.classList.add("meta");
    meta.textContent = msg.role === "user" ? "Du" : "Assistant";

    const text = document.createElement("div");

    if (msg.role === "assistant" && window.marked) {
      // Markdown → HTML rendern
      text.innerHTML = marked.parse(msg.content || "");
    } else {
      text.textContent = msg.content;
    }

    msgDiv.appendChild(meta);
    msgDiv.appendChild(text);
    chatWindow.appendChild(msgDiv);
  });

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/**
 * Baut aus der kompletten Unterhaltung + neuer User-Nachricht
 * einen großen `question`-String für dein gespeichertes Prompt.
 */
function buildQuestionFromConversation(nextUserMessage) {
  const tempConversation = [...conversation];

  if (nextUserMessage) {
    tempConversation.push({ role: "user", content: nextUserMessage });
  }

  const lines = tempConversation.map((m) => {
    const label = m.role === "user" ? "User" : "Assistant";
    return `${label}: ${m.content}`;
  });

  return (
    "This is a conversation between a user and an assistant.\n" +
    "Use the full chat history below to answer the last user message.\n\n" +
    lines.join("\n")
  );
}

/**
 * Robustes Auslesen des Textes aus der Responses-API Antwort.
 * (Der Text kommt idealerweise schon als Markdown.)
 */
function extractTextFromResponse(data) {
  try {
    if (typeof data.output_text === "string" && data.output_text.trim() !== "") {
      return data.output_text.trim();
    }

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!item || !Array.isArray(item.content)) continue;
        for (const part of item.content) {
          if (part.type === "output_text" && part.text?.value) {
            return String(part.text.value).trim();
          }
          if (typeof part.text === "string") {
            return part.text.trim();
          }
        }
      }
    }

    return (
      "Ich habe eine Antwort erhalten, konnte aber keinen Text finden:\n" +
      JSON.stringify(data, null, 2)
    );
  } catch (e) {
    return (
      "Fehler beim Lesen der Antwort:\n" +
      (e.message || String(e)) +
      "\n\nRohdaten:\n" +
      JSON.stringify(data, null, 2)
    );
  }
}

// ==== EVENTS ====

saveApiKeyBtn.addEventListener("click", () => {
  const value = apiKeyInput.value.trim();
  if (!value) {
    apiKeyStatus.textContent = "Bitte API Key eingeben";
    apiKeyStatus.style.color = "#cc5500";
    return;
  }

  apiKey = value;
  localStorage.setItem("openai_api_key", apiKey);
  apiKeyInput.value = "********";
  apiKeyStatus.textContent = "Key gespeichert";
  apiKeyStatus.style.color = "#16a34a";
});

// "Verlauf löschen" – Chat + Kontext zurücksetzen
clearChatBtn.addEventListener("click", () => {
  if (!conversation.length) return;

  const confirmClear = window.confirm(
    "Möchtest du den gesamten Chat-Verlauf wirklich löschen? Der Chatbot verliert damit den bisherigen Kontext."
  );
  if (!confirmClear) return;

  conversation = [];
  renderConversation();
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  if (!apiKey) {
    alert("Bitte zuerst deinen OpenAI API Key setzen.");
    return;
  }

  // Frage mit Kontext (inkl. aktueller User-Nachricht) aufbauen
  const question = buildQuestionFromConversation(text);

  // User-Nachricht im UI anzeigen
  addMessage("user", text);
  userInput.value = "";
  userInput.focus();

  // Platzhalter-Nachricht für "Assistant denkt nach..."
  const typingIndex = conversation.length;
  conversation.push({ role: "assistant", content: "Denke nach…" });
  renderConversation();

  chatForm.querySelector("button[type=submit]").disabled = true;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "OpenAI-Beta": "responses=v1"
      },
      body: JSON.stringify({
        prompt: {
          id: PROMPT_ID,
          version: PROMPT_VERSION,
          variables: {
            question: question
          }
        },
        input: [],
        text: {
          format: {
            type: "text"
          }
        },
        reasoning: {},
        tools: [
          {
            type: "file_search",
            vector_store_ids: [VECTOR_STORE_ID]
          }
        ],
        max_output_tokens: 2048,
        store: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("OpenAI raw response:", data);

    const assistantText = extractTextFromResponse(data);

    // Platzhalter durch echte Antwort ersetzen
    conversation[typingIndex] = { role: "assistant", content: assistantText };
    renderConversation();
  } catch (err) {
    console.error(err);
    conversation[typingIndex] = {
      role: "assistant",
      content:
        "Fehler beim Aufruf der OpenAI API:\n" +
        (err.message || String(err))
    };
    renderConversation();
  } finally {
    chatForm.querySelector("button[type=submit]").disabled = false;
  }
});
