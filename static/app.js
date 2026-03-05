// ── State ──
let isRecording = false;
let ws = null;
let audioContext = null;
let mediaStream = null;
let processorNode = null;
let useRealtime = true;
let activeInsert = null; // span where incoming text is inserted

// ── DOM ──
const transcript = document.getElementById("transcript");
const btnRecord = document.getElementById("btn-record");
const btnCopy = document.getElementById("btn-copy");
const btnClear = document.getElementById("btn-clear");
const modeToggle = document.getElementById("mode-toggle");
const statusText = document.getElementById("status-text");
const delaySelect = document.getElementById("delay-select");
const replaceHint = document.getElementById("replace-hint");
const queueInfo = document.getElementById("queue-info");
const queueCount = document.getElementById("queue-count");
const toast = document.getElementById("toast");
const settingsOverlay = document.getElementById("settings-overlay");
const inputApiKey = document.getElementById("input-apikey");
const settingsStatus = document.getElementById("settings-status");

// ── Mode toggle ──
function updateModeUI() {
    if (isRecording) return;
    statusText.textContent = useRealtime ? "Realtime" : "Opname";
    delaySelect.disabled = !useRealtime;
}

modeToggle.addEventListener("change", () => {
    if (isRecording) { modeToggle.checked = useRealtime; return; }
    useRealtime = modeToggle.checked;
    updateModeUI();
});

// ── Active insert point management ──
// This is the core concept: a single span that receives all incoming text.
// By default it's at the end. Click in the transcript to move it.
// Select text to replace it.

function ensureInsertPoint() {
    if (activeInsert && activeInsert.parentNode) return activeInsert;
    activeInsert = document.createElement("span");
    activeInsert.className = "partial";
    transcript.appendChild(activeInsert);
    return activeInsert;
}

// ── Auto-spacing helpers ──
function getTextBefore(node) {
    let prev = node.previousSibling;
    while (prev) {
        const t = prev.textContent;
        if (t.length > 0) return t;
        prev = prev.previousSibling;
    }
    return "";
}

function getTextAfter(node) {
    let next = node.nextSibling;
    while (next) {
        const t = next.textContent;
        if (t.length > 0) return t;
        next = next.nextSibling;
    }
    return "";
}

function needsSpaceBefore(target) {
    if (target.textContent !== "") return false; // only on first insert
    const before = getTextBefore(target);
    if (!before) return false;
    const last = before[before.length - 1];
    return last !== " " && last !== "\n" && last !== "\t";
}

function needsSpaceAfter(target) {
    const after = getTextAfter(target);
    if (!after) return false;
    const first = after[0];
    const content = target.textContent;
    if (!content) return false;
    const last = content[content.length - 1];
    return last !== " " && last !== "\n" && first !== " " && first !== "\n";
}

function capitalizeAfterSentenceEnd(node) {
    const content = node.textContent;
    if (!content) return;
    // Check if inserted text ends with sentence-ending punctuation
    const trimmed = content.trimEnd();
    const lastChar = trimmed[trimmed.length - 1];
    if (lastChar !== "." && lastChar !== "!" && lastChar !== "?") return;
    // Find next sibling with actual text
    let next = node.nextSibling;
    while (next) {
        if (next.textContent.trim().length > 0) break;
        next = next.nextSibling;
    }
    if (!next) return;
    const nextText = next.textContent;
    // Match optional leading whitespace then a lowercase letter (including accented)
    const match = nextText.match(/^(\s*)([a-zàáâãäåæçèéêëìíîïñòóôõöùúûüýÿ])/);
    if (match) {
        next.textContent = match[1] + match[2].toUpperCase() + nextText.slice(match[1].length + 1);
    }
}

function finalizeInsertPoint() {
    if (activeInsert) {
        // Auto-space: add trailing space if needed before next text
        if (activeInsert.textContent && needsSpaceAfter(activeInsert)) {
            activeInsert.textContent += " ";
        }
        // Auto-capitalize: uppercase first letter of next text after . ! ?
        capitalizeAfterSentenceEnd(activeInsert);
        activeInsert.classList.remove("partial", "replacing");
        activeInsert = null;
    }
    replaceHint.classList.add("hidden");
}

function isAfterSentenceEnd(node) {
    const before = getTextBefore(node);
    if (!before) return true; // start of transcript = treat as sentence start
    const trimmed = before.trimEnd();
    if (!trimmed) return true;
    const last = trimmed[trimmed.length - 1];
    return last === "." || last === "!" || last === "?";
}

function lowercaseFirstLetter(text) {
    // Handle leading whitespace: " En" → " en"
    const match = text.match(/^(\s*)([A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸ])/);
    if (match) {
        return match[1] + match[2].toLowerCase() + text.slice(match[1].length + 1);
    }
    return text;
}

function feedText(text) {
    clearPlaceholder();
    const target = ensureInsertPoint();

    // Auto-space: add leading space on first text if previous text has no trailing space
    if (needsSpaceBefore(target) && text.length > 0 && text[0] !== " " && text[0] !== "\n") {
        target.textContent = " ";
    }

    // Prevent double spaces: trim leading spaces from text if we already have one
    if (target.textContent.endsWith(" ") && text.startsWith(" ")) {
        text = text.replace(/^ +/, "");
    }
    // Also when target is still empty but before text already ends with space
    if (target.textContent === "" && text.startsWith(" ")) {
        const before = getTextBefore(target);
        if (before && before.endsWith(" ")) {
            text = text.replace(/^ +/, "");
        }
    }

    // Auto-case: lowercase first letter unless after sentence-ending punctuation
    if (target.textContent.replace(/ /g, "") === "" && !isAfterSentenceEnd(target)) {
        text = lowercaseFirstLetter(text);
    }

    target.textContent += text;
    scrollToBottom();
}

// ── Click-to-move cursor — works during AND before recording ──
transcript.addEventListener("mouseup", () => {
    // Ignore if transcript only has the placeholder
    if (transcript.querySelector(".placeholder")) return;

    setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        if (!transcript.contains(sel.anchorNode)) return;

        // Finalize current insert point
        finalizeInsertPoint();

        if (!sel.isCollapsed) {
            // ── Selection: replace mode ──
            const range = sel.getRangeAt(0);
            const marker = document.createElement("span");
            marker.className = "replacing";
            try {
                range.surroundContents(marker);
            } catch {
                const fragment = range.extractContents();
                marker.appendChild(fragment);
                range.insertNode(marker);
            }
            marker.textContent = "";
            activeInsert = marker;
            replaceHint.classList.remove("hidden");
            sel.removeAllRanges();
        } else {
            // ── Click: move insertion point ──
            const range = sel.getRangeAt(0);
            const newInsert = document.createElement("span");
            newInsert.className = "partial";
            range.insertNode(newInsert);
            activeInsert = newInsert;
            sel.removeAllRanges();
        }
    }, 10);
});

// ── IndexedDB for offline queue ──
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("voxtral-queue", 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore("recordings", { autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveToQueue(blob) {
    const db = await openDB();
    const tx = db.transaction("recordings", "readwrite");
    tx.objectStore("recordings").add(blob);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    updateQueueBadge();
}

async function getQueueCount() {
    const db = await openDB();
    const tx = db.transaction("recordings", "readonly");
    const store = tx.objectStore("recordings");
    return new Promise((res) => {
        const req = store.count();
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(0);
    });
}

let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue) return;
    const count = await getQueueCount();
    if (count === 0) return;
    isProcessingQueue = true;
    showToast(`Wachtrij verwerken (${count})...`);

    const db = await openDB();
    const tx = db.transaction("recordings", "readonly");
    const store = tx.objectStore("recordings");
    const allKeys = await new Promise((res) => {
        const req = store.getAllKeys();
        req.onsuccess = () => res(req.result);
        req.onerror = () => res([]);
    });

    let processed = 0;
    for (const key of allKeys) {
        const getTx = db.transaction("recordings", "readonly");
        const blob = await new Promise((res) => {
            const req = getTx.objectStore("recordings").get(key);
            req.onsuccess = () => res(req.result);
            req.onerror = () => res(null);
        });
        if (!blob) continue;
        try {
            const formData = new FormData();
            formData.append("file", blob, "recording.webm");
            const resp = await fetch("/api/transcribe", { method: "POST", body: formData });
            if (!resp.ok) {
                console.warn(`Queue item ${key}: server returned ${resp.status}, skipping for now`);
                continue;
            }
            const data = await resp.json();
            if (data.text) appendFinalText(data.text + " ");
            // Delete successfully processed item
            const delTx = db.transaction("recordings", "readwrite");
            delTx.objectStore("recordings").delete(key);
            await new Promise((res) => { delTx.oncomplete = res; });
            processed++;
        } catch (err) {
            console.warn("Queue processing failed (offline?):", err.message);
            break; // stop on network errors, retry later
        }
    }
    isProcessingQueue = false;
    updateQueueBadge();
    if (processed > 0) {
        showToast(`${processed} opname(s) verwerkt`);
    }
}

async function updateQueueBadge() {
    const count = await getQueueCount();
    queueCount.textContent = count;
    queueInfo.classList.toggle("hidden", count === 0);
}

// ── Transcript helpers ──
function clearPlaceholder() {
    const ph = transcript.querySelector(".placeholder");
    if (ph) ph.remove();
}

function appendFinalText(text) {
    clearPlaceholder();
    const span = document.createElement("span");
    span.textContent = text;
    transcript.appendChild(span);
    scrollToBottom();
}

function scrollToBottom() {
    const main = transcript.closest("main");
    main.scrollTop = main.scrollHeight;
}

// ── Audio: PCM s16le 16kHz mono ──
function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(buffer);
}

function downsample(buffer, fromRate, toRate) {
    if (fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        result[i] = buffer[Math.round(i * ratio)];
    }
    return result;
}

// ── Realtime recording ──
async function startRealtime() {
    const delay = delaySelect.value;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/ws/transcribe?delay=${delay}`);

    ws.onopen = () => {
        statusText.textContent = "Opnemen (realtime)";
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "delta") {
            feedText(msg.text);
        } else if (msg.type === "done") {
            finalizeInsertPoint();
        } else if (msg.type === "error") {
            console.error("Transcription error:", msg.message);
            appendFinalText("[Fout: " + msg.message + "]\n");
        }
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);

    ws.onclose = () => {
        if (isRecording) {
            stopAudioCapture();
            isRecording = false;
            btnRecord.classList.remove("active");
            btnRecord.textContent = "Opnemen";
            finalizeInsertPoint();
            updateModeUI();
        }
    };

    await new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve, { once: true });
        ws.addEventListener("error", reject, { once: true });
    });

    mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000 },
    });
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNode.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const downsampled = downsample(inputData, audioContext.sampleRate, 16000);
        const pcm = floatTo16BitPCM(downsampled);
        ws.send(pcm.buffer);
    };

    source.connect(processorNode);
    processorNode.connect(audioContext.destination);
}

function stopRealtime() {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    ws = null;
    stopAudioCapture();
}

// ── Offline / batch recording ──
let mediaRecorder = null;
let offlineChunks = [];

async function startOffline() {
    statusText.textContent = "Opnemen...";

    mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
    });

    offlineChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: "audio/webm;codecs=opus" });

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) offlineChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
        if (offlineChunks.length > 0) {
            const blob = new Blob(offlineChunks, { type: "audio/webm" });
            statusText.textContent = "Transcriberen...";
            try {
                const formData = new FormData();
                formData.append("file", blob, "recording.webm");
                const resp = await fetch("/api/transcribe", { method: "POST", body: formData });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.text) {
                        clearPlaceholder();
                        feedText(data.text);
                    }
                } else {
                    await saveToQueue(blob);
                }
            } catch {
                await saveToQueue(blob);
            }
            updateModeUI();
        }
        offlineChunks = [];
        finalizeInsertPoint();
    };

    mediaRecorder.start(1000);
}

function stopOffline() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    mediaRecorder = null;
    stopAudioCapture();
}

function stopAudioCapture() {
    if (processorNode) { processorNode.disconnect(); processorNode = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
    if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
}

// ── Record button ──
btnRecord.addEventListener("click", async () => {
    if (isRecording) {
        isRecording = false;
        btnRecord.classList.remove("active");
        btnRecord.textContent = "Opnemen";

        if (useRealtime && ws) {
            stopRealtime();
            finalizeInsertPoint();
        } else {
            stopOffline();
            // Don't finalize here — onstop handler does it after inserting text
        }

        updateModeUI();
    } else {
        isRecording = true;
        btnRecord.classList.add("active");
        btnRecord.textContent = "Stop";

        try {
            if (useRealtime) {
                await startRealtime();
            } else {
                await startOffline();
            }
        } catch (err) {
            console.error("Failed to start recording:", err);
            isRecording = false;
            btnRecord.classList.remove("active");
            btnRecord.textContent = "Opnemen";
            finalizeInsertPoint();
            statusText.textContent = "Fout: " + err.message;
        }
    }
});

// ── Copy button ──
btnCopy.addEventListener("click", async () => {
    const text = transcript.innerText.trim();
    if (!text || text === "Druk op opnemen om te beginnen...") return;
    try {
        await navigator.clipboard.writeText(text);
        showToast("Gekopieerd");
    } catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast("Gekopieerd");
    }
});

// ── Clear button ──
btnClear.addEventListener("click", () => {
    if (isRecording) return;
    transcript.innerHTML = '<span class="placeholder">Druk op opnemen om te beginnen...</span>';
    activeInsert = null;
});

// ── Toast ──
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 1500);
}

// ── Queue: auto-retry when back online + periodic + click to retry ──
window.addEventListener("online", () => {
    console.log("Back online — processing queue");
    processQueue();
});

// Retry queue every 30 seconds if there are items
setInterval(async () => {
    const count = await getQueueCount();
    if (count > 0 && navigator.onLine) processQueue();
}, 30000);

// Click on queue badge to manually retry
queueInfo.style.cursor = "pointer";
queueInfo.title = "Klik om wachtrij opnieuw te verwerken";
queueInfo.addEventListener("click", () => {
    if (!isProcessingQueue) processQueue();
});

// ── Settings modal ──
function openSettings() {
    settingsOverlay.classList.remove("hidden");
    settingsStatus.textContent = "";
    settingsStatus.className = "modal-status";
    inputApiKey.value = "";
    // Load current masked key as placeholder
    fetch("/api/settings").then(r => r.json()).then(data => {
        inputApiKey.placeholder = data.has_key ? data.masked_key : "Plak je API key hier...";
    }).catch(() => {});
}

function closeSettings() {
    settingsOverlay.classList.add("hidden");
}

document.getElementById("btn-settings").addEventListener("click", openSettings);
document.getElementById("btn-close-settings").addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
});

// Toggle key visibility
document.getElementById("btn-toggle-key").addEventListener("click", () => {
    inputApiKey.type = inputApiKey.type === "password" ? "text" : "password";
});

// Save key
document.getElementById("btn-save-key").addEventListener("click", async () => {
    const key = inputApiKey.value.trim();
    if (!key) {
        settingsStatus.textContent = "Voer een API key in";
        settingsStatus.className = "modal-status error";
        return;
    }
    settingsStatus.textContent = "Valideren...";
    settingsStatus.className = "modal-status";
    try {
        const resp = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: key }),
        });
        const data = await resp.json();
        if (resp.ok) {
            settingsStatus.textContent = "API key opgeslagen en gevalideerd";
            settingsStatus.className = "modal-status success";
            setTimeout(closeSettings, 1500);
        } else {
            settingsStatus.textContent = data.error || "Opslaan mislukt";
            settingsStatus.className = "modal-status error";
        }
    } catch (err) {
        settingsStatus.textContent = "Verbindingsfout: " + err.message;
        settingsStatus.className = "modal-status error";
    }
});

// ── Init ──
updateModeUI();
updateQueueBadge();
processQueue();

// Check if API key is configured on load
fetch("/api/health").then(r => r.json()).then(data => {
    if (data.status === "no_key") {
        openSettings();
    }
}).catch(() => {});
