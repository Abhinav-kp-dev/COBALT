import axios from 'axios';

const API_URL = "http://localhost:8001";

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
