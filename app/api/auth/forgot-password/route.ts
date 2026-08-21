import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import { sendOtpEmail, getEmailSendErrorMessage } from "@/lib/email";
import { normalizeEmail } from "@/lib/passwordReset";
import { clientKey, rateLimit, RATE_LIMIT_TIERS } from "@/lib/rateLimit";
import { HttpError } from "@/lib/guards";

const GENERIC_SUCCESS =
  "If an account with this email exists, an OTP has been sent to your email address.";

export async function POST(request: Request) {
  try {
    const { email: rawEmail } = await request.json();

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    rateLimit(`pw-reset:ip:${clientKey(undefined, request)}`, RATE_LIMIT_TIERS.passwordReset);
    rateLimit(`pw-reset:email:${email}`, RATE_LIMIT_TIERS.passwordResetResend);

    await dbConnect();

    const user = await User.findOne({ email, status: "active" }).select(
      "+otpHash +otpExpires +resetTokenHash +resetTokenExpires"
    );

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[forgot-password] No active user found for: ${email}`);
      }
      return NextResponse.json({ success: true, message: GENERIC_SUCCESS });
    }

    const otp = user.issuePasswordResetOtp();
    await user.save();

    const emailResult = await sendOtpEmail(email, otp, user.fullName);

    if (!emailResult.success) {
      user.clearPasswordResetFields();
      await user.save();
      return NextResponse.json(
        { error: getEmailSendErrorMessage(emailResult.error) },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, message: GENERIC_SUCCESS });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("forgot-password error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
