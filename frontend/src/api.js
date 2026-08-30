import axios from 'axios';

export const API_URL = "http://localhost:8001";

// --- Function 0: Service health ---
// Used by the status indicator in the top bar and the Settings diagnostics
// panel, so an unreachable backend is visible immediately rather than showing
// up as an empty inspection list.
export const fetchHealth = async () => {
    const response = await fetch(`${API_URL}/`);
    if (!response.ok) throw new Error(`Service unhealthy: ${response.status}`);
    return response.json();
};

// --- Function 1: Upload File ---
// Detection method is fixed to the threshold-based engine on the backend;
// no detector choice is sent from the client.
export const uploadFile = async (file, startDate, endDate) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("start_date", startDate);
    formData.append("end_date", endDate);

    const response = await axios.post(`${API_URL}/api/analyze`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
};

// --- Function 2: Get History ---
export const fetchHistory = async () => {
    const response = await fetch(`${API_URL}/api/history`);
    if (!response.ok) throw new Error(`Failed to fetch history: ${response.status}`);
    return response.json();
};
// --- Function 3: Delete a single inspection ---
export const deleteInspection = async (id) => {
    const response = await fetch(`${API_URL}/api/inspections/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`Failed to delete inspection: ${response.status}`);
    return response.json();
};

// --- Function 4: Delete several inspections at once ---
export const deleteInspections = async (ids) => {
    const response = await fetch(`${API_URL}/api/inspections/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
    });
    if (!response.ok) throw new Error(`Failed to delete inspections: ${response.status}`);
    return response.json();
};

// --- Function 5: Platform assistant availability ---
// The UI hides the assistant entirely when the backend has no Gemini key,
// rather than offering a button that always errors.
export const fetchChatStatus = async () => {
    const response = await fetch(`${API_URL}/api/chat/status`);
    if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
    return response.json();
};

// --- Function 6: Ask the platform assistant ---
// Stateless: the whole transcript is sent each turn. The API key never leaves
// the backend, so there is nothing sensitive in this request.
export const sendChat = async (messages) => {
    const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || `Assistant error: ${response.status}`);
    return data.reply;
};
