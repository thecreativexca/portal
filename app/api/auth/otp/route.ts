import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import { sendOtpEmail, getEmailSendErrorMessage } from "@/lib/email";
import { normalizeEmail } from "@/lib/passwordReset";
import { rateLimit, RATE_LIMIT_TIERS } from "@/lib/rateLimit";
import { HttpError } from "@/lib/guards";

const GENERIC_RESEND_SUCCESS =
  "If an account with this email exists, a new OTP has been sent.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action || typeof action !== "string") {
      return NextResponse.json(
        { error: "Action is required" },
        { status: 400 }
      );
    }

    const rawEmail = body.email;
    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);

    await dbConnect();

    if (action === "resend") {
      rateLimit(`pw-resend:${email}`, RATE_LIMIT_TIERS.passwordResetResend);

      const user = await User.findOne({ email, status: "active" }).select(
        "+otpHash +otpExpires +resetTokenHash +resetTokenExpires"
      );

      if (!user) {
        return NextResponse.json({
          success: true,
          message: GENERIC_RESEND_SUCCESS,
        });
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

      return NextResponse.json({
        success: true,
        message: "A new OTP has been sent to your email address.",
      });
    }

    if (action === "verify") {
      const { otp } = body;

      if (!otp || typeof otp !== "string") {
        return NextResponse.json({ error: "OTP is required" }, { status: 400 });
      }

      const normalizedOtp = otp.trim().replace(/\D/g, "");
      if (!/^\d{6}$/.test(normalizedOtp)) {
        return NextResponse.json(
          { error: "Please enter a valid 6-digit OTP" },
          { status: 400 }
        );
      }

      rateLimit(`pw-verify:${email}`, RATE_LIMIT_TIERS.passwordResetVerify);

      const user = await User.findOne({ email, status: "active" }).select(
        "+otpHash +otpExpires +resetTokenHash +resetTokenExpires"
      );

      if (!user) {
        return NextResponse.json(
          { error: "Invalid or expired OTP" },
          { status: 400 }
        );
      }

      if (!user.otpHash || !user.otpExpires) {
        if (
          user.resetTokenHash &&
          user.resetTokenExpires &&
          user.resetTokenExpires > new Date()
        ) {
          return NextResponse.json(
            {
              error:
                "OTP already verified. Please enter your new password on the next step.",
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: "OTP has expired. Please request a new one." },
          { status: 400 }
        );
      }

      if (user.otpExpires < new Date()) {
        user.clearPasswordResetFields();
        await user.save();
        return NextResponse.json(
          { error: "OTP has expired. Please request a new one." },
          { status: 400 }
        );
      }

      const resetToken = user.verifyPasswordResetOtp(normalizedOtp);

      if (!resetToken) {
        return NextResponse.json(
          { error: "Incorrect OTP. Please check and try again." },
          { status: 400 }
        );
      }

      await user.save();

      return NextResponse.json({
        success: true,
        message: "OTP verified successfully",
        resetToken,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'resend' or 'verify'" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("otp route error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
