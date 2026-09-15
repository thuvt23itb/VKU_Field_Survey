const API_URL =
  "https://script.google.com/macros/s/AKfycbxjcuVxkXx6k59-6KUtFFmGD48GzMcaxAoSGwS3i_hoggmxNrM93OBd0PTWQEUfZ_dWCA/exec";


// =====================================================
// GỬI / CẬP NHẬT PHIẾU LÊN GOOGLE SHEET
// =====================================================

export async function sendSurvey(survey) {
  console.log("📤 POST API:", API_URL);
  console.log("📦 Dữ liệu gửi:", survey);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(survey),
    redirect: "follow",
  });

  console.log("📡 POST status:", response.status);
  console.log("📡 POST final URL:", response.url);

  const text = await response.text();

  console.log("📥 POST response:", text);

  if (!response.ok) {
    throw new Error(
      `HTTP error: ${response.status}`
    );
  }

  let result;

  try {
    result = JSON.parse(text);
  } catch (error) {
    console.error(
      "❌ Response không phải JSON:",
      text
    );

    throw new Error(
      "Google Apps Script không trả về JSON hợp lệ"
    );
  }

  if (!result.success) {
    throw new Error(
      result.message ||
      "Google Apps Script trả về lỗi"
    );
  }

  return result;
}


// =====================================================
// LẤY DỮ LIỆU TỪ GOOGLE SHEET
// =====================================================

export async function fetchSurveys() {
  console.log("📥 GET API:", API_URL);

  const response = await fetch(API_URL, {
    method: "GET",
    redirect: "follow",
  });

  console.log("📡 GET status:", response.status);
  console.log("📡 GET final URL:", response.url);

  const text = await response.text();

  console.log("📥 GET response:", text);

  if (!response.ok) {
    throw new Error(
      `HTTP error: ${response.status}`
    );
  }

  let result;

  try {
    result = JSON.parse(text);
  } catch (error) {
    console.error(
      "❌ Response không phải JSON:",
      text
    );

    throw new Error(
      "Google Apps Script không trả về JSON hợp lệ"
    );
  }

  if (!result.success) {
    throw new Error(
      result.message ||
      "Không thể lấy dữ liệu từ Google Sheet"
    );
  }

  return result;
}


// =====================================================
// XÓA TRÊN GOOGLE SHEET
// =====================================================

export async function deleteSurveyFromServer(id) {
  console.log("🗑️ Xóa server:", id);

  return sendSurvey({
    action: "delete",
    id: id,
  });
}