import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import { sendPasswordResetConfirmation } from "@/lib/email";
import { normalizeEmail } from "@/lib/passwordReset";
import { clientKey, rateLimit, RATE_LIMIT_TIERS } from "@/lib/rateLimit";
import { HttpError } from "@/lib/guards";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { resetToken, password, email: rawEmail } = body;

    if (!resetToken || typeof resetToken !== "string") {
      return NextResponse.json(
        { error: "Reset token is required. Please verify your OTP again." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "New password is required" },
        { status: 400 }
      );
    }

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    rateLimit(
      `pw-reset-final:ip:${clientKey(undefined, request)}`,
      RATE_LIMIT_TIERS.passwordReset
    );

    await dbConnect();

    const user = await User.findOne({ email, status: "active" }).select(
      "+password +resetTokenHash +resetTokenExpires"
    );

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired reset session. Please start again." },
        { status: 400 }
      );
    }

    if (user.resetTokenExpires && user.resetTokenExpires < new Date()) {
      user.clearPasswordResetFields();
      await user.save();
      return NextResponse.json(
        { error: "Reset session has expired. Please verify your OTP again." },
        { status: 400 }
      );
    }

    if (!user.verifyPasswordResetToken(resetToken)) {
      return NextResponse.json(
        { error: "Invalid or expired reset session. Please verify your OTP again." },
        { status: 400 }
      );
    }

    user.password = password;
    user.clearPasswordResetFields();
    await user.save();

    await sendPasswordResetConfirmation(email, user.fullName);

    return NextResponse.json({
      success: true,
      message:
        "Password reset successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("reset-password error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
