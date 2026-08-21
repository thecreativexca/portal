"use client";

import { useState, FormEvent, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "otp" | "reset">("email");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const verifyingRef = useRef(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const animate = () => {
      const ease = 0.07;
      currentRef.current.x += (targetRef.current.x - currentRef.current.x) * ease;
      currentRef.current.y += (targetRef.current.y - currentRef.current.y) * ease;

      const el = pageRef.current;
      if (el) {
        el.style.setProperty("--mouse-x", currentRef.current.x.toFixed(4));
        el.style.setProperty("--mouse-y", currentRef.current.y.toFixed(4));
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    targetRef.current = {
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
    };
  };

  const handlePointerLeave = () => {
    targetRef.current = { x: 0, y: 0 };
  };

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send OTP");
        setLoading(false);
        return;
      }

      setSuccess(data.message);
      setStep("otp");
      setResendCooldown(60);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (verifyingRef.current || resetToken) return;

    setError("");
    setSuccess("");
    setLoading(true);
    verifyingRef.current = true;

    try {
      const response = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          action: "verify",
          otp: otp.replace(/\D/g, ""),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (
          data.error?.includes("already verified") &&
          resetToken
        ) {
          setStep("reset");
          return;
        }
        setError(data.error || "Failed to verify OTP");
        return;
      }

      setSuccess("OTP verified successfully");
      setResetToken(data.resetToken);
      setStep("reset");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      verifyingRef.current = false;
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setSuccess("");
    setResendLoading(true);

    try {
      const response = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action: "resend" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to resend OTP");
        setResendLoading(false);
        return;
      }

      setSuccess(data.message);
      setOtp("");
      setResendCooldown(60);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (!resetToken) {
      setError("Session expired. Please verify your OTP again.");
      setStep("otp");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          resetToken,
          password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to reset password");
        setLoading(false);
        return;
      }

      setSuccess(data.message);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div
      ref={pageRef}
      className="login-page"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="login-bg" aria-hidden>
        <div className="login-parallax login-parallax-nebula">
          <div className="login-bg-nebula" />
        </div>
        <div className="login-parallax login-parallax-orb-1">
          <div className="login-orb login-orb-1" />
        </div>
        <div className="login-parallax login-parallax-orb-2">
          <div className="login-orb login-orb-2" />
        </div>
        <div className="login-parallax login-parallax-orb-3">
          <div className="login-orb login-orb-3" />
        </div>
        <div className="login-parallax login-parallax-stars">
          <div className="login-stars" />
        </div>
        <div className="login-parallax login-parallax-network">
          <svg className="login-network" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <g stroke="rgba(120,200,255,0.15)" strokeWidth="0.6" fill="none">
            <line x1="80" y1="120" x2="220" y2="200" />
            <line x1="220" y1="200" x2="380" y2="140" />
            <line x1="380" y1="140" x2="520" y2="260" />
            <line x1="520" y1="260" x2="680" y2="180" />
            <line x1="680" y1="180" x2="900" y2="240" />
            <line x1="900" y1="240" x2="1100" y2="160" />
            <line x1="120" y1="400" x2="300" y2="350" />
            <line x1="300" y1="350" x2="480" y2="420" />
            <line x1="480" y1="420" x2="620" y2="360" />
            <line x1="620" y1="360" x2="800" y2="440" />
            <line x1="800" y1="440" x2="1000" y2="380" />
            <line x1="200" y1="600" x2="400" y2="550" />
            <line x1="400" y1="550" x2="560" y2="620" />
            <line x1="560" y1="620" x2="720" y2="560" />
            <line x1="220" y1="200" x2="300" y2="350" />
            <line x1="520" y1="260" x2="480" y2="420" />
            <line x1="680" y1="180" x2="620" y2="360" />
          </g>
          <g fill="rgba(160,220,255,0.35)">
            <circle cx="80" cy="120" r="2" />
            <circle cx="220" cy="200" r="2.5" />
            <circle cx="380" cy="140" r="2" />
            <circle cx="520" cy="260" r="3" />
            <circle cx="680" cy="180" r="2" />
            <circle cx="900" cy="240" r="2.5" />
            <circle cx="1100" cy="160" r="2" />
            <circle cx="120" cy="400" r="2" />
            <circle cx="300" cy="350" r="2.5" />
            <circle cx="480" cy="420" r="2" />
            <circle cx="620" cy="360" r="3" />
            <circle cx="800" cy="440" r="2" />
            <circle cx="1000" cy="380" r="2" />
            <circle cx="200" cy="600" r="2" />
            <circle cx="400" cy="550" r="2.5" />
            <circle cx="560" cy="620" r="2" />
            <circle cx="720" cy="560" r="2" />
          </g>
        </svg>
        </div>
      </div>

      <div className="login-card">
        <div className="login-card-shine" aria-hidden />

        <div className="login-brand">
          <div className="login-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M6 14L16 5l10 9v11a2 2 0 01-2 2H8a2 2 0 01-2-2V14z"
                stroke="url(#login-logo-grad)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M12 26V16h8v10" stroke="url(#login-logo-grad)" strokeWidth="2" strokeLinecap="round" />
              <circle cx="22" cy="10" r="3" fill="url(#login-logo-grad)" />
              <defs>
                <linearGradient id="login-logo-grad" x1="6" y1="5" x2="26" y2="26">
                  <stop stopColor="#2dd4bf" />
                  <stop offset="1" stopColor="#2878f0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="login-title">Forgot Password</h1>
          <p className="login-subtitle">
            {step === "email" && "Enter your email to receive OTP"}
            {step === "otp" && "Enter the OTP sent to your email"}
            {step === "reset" && "Set your new password"}
          </p>
        </div>

        {error && (
          <div className="login-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="login-success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{success}</span>
          </div>
        )}

        {step === "email" && (
          <form onSubmit={handleSendOtp} className="login-form">
            <div className="login-field">
              <label htmlFor="email" className="login-label">
                Corporate Email Address
              </label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="login-input"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="login-submit">
              <span className="login-submit-glow" aria-hidden />
              {loading ? (
                <>
                  <span className="login-spinner" />
                  Sending OTP...
                </>
              ) : (
                "Send OTP"
              )}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="login-form">
            <div className="login-field">
              <label htmlFor="otp" className="login-label">
                One-Time Password (OTP)
              </label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="Enter 6-digit OTP"
                  required
                  maxLength={6}
                  className="login-input"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="login-submit">
              <span className="login-submit-glow" aria-hidden />
              {loading ? (
                <>
                  <span className="login-spinner" />
                  Verifying...
                </>
              ) : (
                "Verify OTP"
              )}
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={resendLoading || resendCooldown > 0}
              className="login-submit login-submit-secondary"
            >
              {resendLoading
                ? "Resending..."
                : resendCooldown > 0
                  ? `Resend OTP in ${resendCooldown}s`
                  : "Resend OTP"}
            </button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={handleResetPassword} className="login-form">
            <div className="login-field">
              <label htmlFor="newPassword" className="login-label">
                New Password
              </label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  required
                  minLength={6}
                  className="login-input login-input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-toggle-password"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="confirmPassword" className="login-label">
                Confirm New Password
              </label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  minLength={6}
                  className="login-input login-input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="login-toggle-password"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="login-submit">
              <span className="login-submit-glow" aria-hidden />
              {loading ? (
                <>
                  <span className="login-spinner" />
                  Resetting Password...
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            type="button"
            onClick={() => router.push("/login")}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255, 255, 255, 0.6)",
              cursor: "pointer",
              fontSize: "14px",
              textDecoration: "underline",
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
