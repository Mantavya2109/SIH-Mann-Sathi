// Clean, Modern ChatGPT-Style Voice Interaction JavaScript
const API_BASE_URL = "http://127.0.0.1:8000";

// State Variables
let mediaRecorder = null;
let audioChunks = [];
let sessionId = null;
let isRecording = false;
let timerInterval = null;
let recordingStartTime = null;

// DOM Element Selections
const messagesContainer = document.getElementById("messages-container");
const welcomeContainer = document.getElementById("welcome-container");
const micButton = document.getElementById("mic-button");
const stopButton = document.getElementById("stop-button");
const recordingDetails = document.getElementById("recording-details");
const recordingTimer = document.getElementById("recording-timer");
const instructionText = document.getElementById("instruction-text");
const statusText = document.getElementById("status-text");
const resetConversationBtn = document.getElementById("reset-conversation-btn");
const newChatSidebarBtn = document.getElementById("new-chat-sidebar-btn");

// Initialize application on load
window.addEventListener("DOMContentLoaded", () => {
    initConversation();
    setupEventListeners();
});

/**
 * Initializes a new conversation space with the default greeting.
 */
function initConversation() {
    // Reset session
    sessionId = null;
    isRecording = false;
    audioChunks = [];
    
    // Clear chat contents (except welcome card)
    const bubbles = messagesContainer.querySelectorAll(".message-wrapper");
    bubbles.forEach(b => b.remove());
    
    // Show welcome screen
    welcomeContainer.style.display = "flex";
    statusText.innerText = "Ready to listen";
    statusText.style.color = "var(--text-muted)";
    
    // Add default initial AI greeting in chat space (invisible until first interaction or render)
    appendMessage("assistant", "How are you feeling today?");
}

/**
 * Attaches click handlers to UI controls
 */
function setupEventListeners() {
    // Recording controls
    micButton.addEventListener("click", handleMicClick);
    stopButton.addEventListener("click", stopRecording);
    
    // Session resets
    resetConversationBtn.addEventListener("click", resetConversation);
    newChatSidebarBtn.addEventListener("click", resetConversation);
}

/**
 * Suggestion helper modal overlay
 */
window.prefillSpeech = function(text) {
    statusText.innerText = `Suggestion: Press mic and say "${text}"`;
    statusText.style.color = "var(--accent-color)";
    
    // Smooth pulse accent color on status text to highlight
    setTimeout(() => {
        statusText.style.color = "var(--text-muted)";
    }, 4000);
};

/**
 * Handles Microphone toggle
 */
async function handleMicClick() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

/**
 * Starts browser MediaRecorder session
 */
async function startRecording() {
    audioChunks = [];
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Hide welcome menu on record if visible
        welcomeContainer.style.display = "none";
        
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
            stream.getTracks().forEach(track => track.stop()); // Release mic
            await uploadAudio(audioBlob);
        };
        
        // Start recording
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Update Composer States
        micButton.classList.add("recording");
        micButton.innerHTML = '<i class="fa-solid fa-square"></i>';
        stopButton.style.display = "flex";
        recordingDetails.style.display = "flex";
        instructionText.style.display = "none";
        statusText.innerText = "Recording...";
        statusText.style.color = "#ef4444";
        
        // Start duration counter
        startTimer();
        
    } catch (err) {
        console.error("Microphone access error:", err);
        displaySystemError("Microphone access is needed to talk with me. Please allow microphone access and try again.");
    }
}

/**
 * Stops ongoing MediaRecorder session
 */
function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    
    mediaRecorder.stop();
    isRecording = false;
    
    // Clear timer counter
    clearInterval(timerInterval);
    
    // Revert composer controls
    micButton.classList.remove("recording");
    micButton.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    stopButton.style.display = "none";
    recordingDetails.style.display = "none";
    instructionText.style.display = "block";
    statusText.innerText = "Processing audio...";
    statusText.style.color = "var(--text-muted)";
}

/**
 * Sends recorded audio block to FastAPI respond endpoint
 */
async function uploadAudio(audioBlob) {
    // Append animated typing placeholder for AI thinking status
    const typingIndicatorId = showThinkingIndicator();
    
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");
    if (sessionId) {
        formData.append("session_id", sessionId);
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/conversation/respond`, {
            method: "POST",
            body: formData
        });
        
        removeThinkingIndicator(typingIndicatorId);
        
        if (!response.ok) {
            throw new Error(`Server returned error status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Save session continuity
        if (data.session_id) {
            sessionId = data.session_id;
        }
        
        // Append user transcribed speech bubble
        if (data.transcript && data.transcript.trim() !== "") {
            appendMessage("user", data.transcript);
        } else {
            appendMessage("user", "[Unclear / Silent Input]");
        }
        
        // Concatenate AI response and follow-up question for natural conversation bubble
        let aiFullText = data.response_text || "";
        if (data.follow_up_question) {
            aiFullText += " " + data.follow_up_question;
        }
        
        if (aiFullText.trim() !== "") {
            appendMessage("assistant", aiFullText);
        } else {
            appendMessage("assistant", "I heard you, but I wasn't able to construct a response. How else can I support you?");
        }
        
        statusText.innerText = "Ready to listen";
        statusText.style.color = "var(--text-muted)";
        
    } catch (error) {
        console.error("Audio processing upload failed:", error);
        removeThinkingIndicator(typingIndicatorId);
        displaySystemError("Something went wrong while processing your message. Please try again.");
    }
}

/**
 * Renders user/assistant message bubbles inside the chat box container
 */
function appendMessage(sender, text) {
    welcomeContainer.style.display = "none";
    
    const wrapper = document.createElement("div");
    wrapper.classList.add("message-wrapper", sender === "user" ? "user" : "ai");
    
    const label = document.createElement("div");
    label.classList.add("sender-label");
    label.innerText = sender === "user" ? "User" : "Aura";
    
    const bubble = document.createElement("div");
    bubble.classList.add("message-bubble");
    bubble.innerText = text;
    
    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    messagesContainer.appendChild(wrapper);
    
    // Auto-scroll scroll area to latest message bubble
    scrollToBottom();
}

/**
 * Renders typing indicator block and returns its unique ID
 */
function showThinkingIndicator() {
    const indicatorId = "thinking-" + Date.now();
    
    const wrapper = document.createElement("div");
    wrapper.classList.add("message-wrapper", "ai");
    wrapper.setAttribute("id", indicatorId);
    
    const label = document.createElement("div");
    label.classList.add("sender-label");
    label.innerText = "Aura";
    
    const bubble = document.createElement("div");
    bubble.classList.add("message-bubble");
    
    const typingElement = document.createElement("div");
    typingElement.classList.add("typing-indicator");
    typingElement.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    
    bubble.appendChild(typingElement);
    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    messagesContainer.appendChild(wrapper);
    
    scrollToBottom();
    return indicatorId;
}

/**
 * Removes thinking indicator from DOM
 */
function removeThinkingIndicator(indicatorId) {
    const indicator = document.getElementById(indicatorId);
    if (indicator) {
        indicator.remove();
    }
}

/**
 * Handles reset click options (ends session via endpoint, clears UI)
 */
async function resetConversation() {
    const prevSessionId = sessionId;
    initConversation();
    
    // Clean up backend session asynchronously if present
    if (prevSessionId) {
        try {
            const formData = new FormData();
            formData.append("session_id", prevSessionId);
            await fetch(`${API_BASE_URL}/api/conversation/end`, {
                method: "POST",
                body: formData
            });
            console.log("Active backend session terminated.");
        } catch (e) {
            console.warn("Failed to notify backend of session reset:", e);
        }
    }
}

/**
 * Displays error strings securely inside chat dialog
 */
function displaySystemError(errorMsg) {
    statusText.innerText = "Error encountered";
    statusText.style.color = "#ef4444";
    
    const wrapper = document.createElement("div");
    wrapper.classList.add("message-wrapper", "ai");
    
    const label = document.createElement("div");
    label.classList.add("sender-label");
    label.innerText = "System Error";
    
    const bubble = document.createElement("div");
    bubble.classList.add("message-bubble");
    bubble.style.backgroundColor = "rgba(239, 68, 68, 0.08)";
    bubble.style.border = "1px solid rgba(239, 68, 68, 0.2)";
    bubble.style.color = "#fca5a5";
    bubble.innerText = errorMsg;
    
    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    messagesContainer.appendChild(wrapper);
    scrollToBottom();
}

/**
 * Runs composer duration timer
 */
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const delta = Date.now() - recordingStartTime;
        const totalSecs = Math.floor(delta / 1000);
        const mins = String(Math.floor(totalSecs / 60)).padStart(2, '0');
        const secs = String(totalSecs % 60).padStart(2, '0');
        recordingTimer.innerText = `${mins}:${secs}`;
    }, 1000);
}

/**
 * Helper to smoothly scroll messages container to bottom
 */
function scrollToBottom() {
    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "smooth"
    });
}
