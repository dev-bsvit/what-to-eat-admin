"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Неверный логин или пароль");
        return;
      }

      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f1115",
        padding: "24px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: "360px",
          background: "#151821",
          padding: "32px",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <h1 style={{ color: "#fff", fontSize: "22px", marginBottom: "8px" }}>
          Admin вход
        </h1>
        <p style={{ color: "rgba(255,255,255,0.6)", marginBottom: "24px" }}>
          What to Eat? Admin Panel
        </p>

        <label style={{ color: "#fff", fontSize: "13px" }}>Логин</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            marginTop: "6px",
            marginBottom: "16px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "#0f1115",
            color: "#fff",
          }}
        />

        <label style={{ color: "#fff", fontSize: "13px" }}>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            marginTop: "6px",
            marginBottom: "16px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "#0f1115",
            color: "#fff",
          }}
        />

        {error && (
          <div style={{ color: "#fca5a5", fontSize: "13px", marginBottom: "12px" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "10px",
            border: "none",
            background: loading ? "#6b7280" : "#22c55e",
            color: "#0f1115",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Входим..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
