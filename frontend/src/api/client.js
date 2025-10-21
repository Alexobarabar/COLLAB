const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  let body = null;
  if (contentType.includes("application/json")) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  if (!response.ok) {
    const error = new Error("Request failed");
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export function getHealth() {
  return request("/api/health");
}

export function register(email, password) {
  return request("/api/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email, password) {
  return request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}
