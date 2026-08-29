import axios from 'axios';

const API_URL = "http://localhost:8001";

// --- Function 1: Upload File ---
export const uploadFile = async (file, startDate, endDate, detector) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("start_date", startDate);
    formData.append("end_date", endDate);
    if (detector) formData.append("detector", detector);

    const response = await axios.post(`${API_URL}/api/analyze`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
};

// --- Function 2: Get History ---
export const fetchHistory = async () => {
    const response = await axios.get(`${API_URL}/api/history`);
    return response.data;
};