import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import { ROLE_KEYS, RoleKey } from "./Role";
import {
  OTP_EXPIRY_MS,
  RESET_TOKEN_EXPIRY_MS,
  generateOtp,
  generateResetToken,
  hashOtp,
  hashResetToken,
  verifyOtpHash,
  verifyResetToken,
} from "@/lib/passwordReset";

export interface IUser extends Document {
  companyId: mongoose.Types.ObjectId;
  fullName: string;
  /** Legacy display alias for fullName — kept in sync by the pre-save hook */
  name?: string;
  email: string;
  phone?: string;
  role: RoleKey;
  departmentId?: mongoose.Types.ObjectId;
  designation?: string;
  employeeId?: string;
  joiningDate?: Date;
  salary?: number;
  status: "active" | "inactive";
  profileImage?: string;
  password: string;
  otpHash?: string;
  otpExpires?: Date;
  resetTokenHash?: string;
  resetTokenExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  issuePasswordResetOtp(): string;
  verifyPasswordResetOtp(candidateOtp: string): string | null;
  verifyPasswordResetToken(candidateToken: string): boolean;
  clearPasswordResetFields(): void;
}

const UserSchema = new Schema<IUser>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company ID is required"],
      index: true,
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: ROLE_KEYS,
        message: "Role must be one of: " + ROLE_KEYS.join(", "),
      },
      default: "employee",
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: "Department",
    },
    designation: {
      type: String,
      trim: true,
    },
    employeeId: {
      type: String,
      trim: true,
    },
    joiningDate: {
      type: Date,
    },
    salary: {
      type: Number,
      min: [0, "Salary cannot be negative"],
    },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive"],
        message: "Status must be active or inactive",
      },
      default: "active",
    },
    profileImage: {
      type: String,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    otpHash: {
      type: String,
      select: false,
    },
    otpExpires: {
      type: Date,
      select: false,
    },
    resetTokenHash: {
      type: String,
      select: false,
    },
    resetTokenExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Email must be unique within a company
UserSchema.index({ companyId: 1, email: 1 }, { unique: true });
UserSchema.index({ companyId: 1, role: 1 });
UserSchema.index({ companyId: 1, departmentId: 1 });
UserSchema.index({ companyId: 1, status: 1 });

// Keep the display alias in sync
UserSchema.pre<IUser>("save", async function () {
  if (this.isModified("fullName") || !this.name) {
    this.name = this.fullName;
  }
});

// Hash password before saving
UserSchema.pre<IUser>("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Issue a password-reset OTP (stored hashed; plain OTP returned only for email delivery).
UserSchema.methods.issuePasswordResetOtp = function (): string {
  const otp = generateOtp();
  this.otpHash = hashOtp(otp);
  this.otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);
  this.resetTokenHash = undefined;
  this.resetTokenExpires = undefined;
  return otp;
};

UserSchema.methods.verifyPasswordResetOtp = function (
  candidateOtp: string
): string | null {
  if (!this.otpHash || !this.otpExpires) return null;
  if (this.otpExpires < new Date()) {
    this.clearPasswordResetFields();
    return null;
  }
  if (!verifyOtpHash(candidateOtp, this.otpHash)) return null;

  const resetToken = generateResetToken();
  this.resetTokenHash = hashResetToken(resetToken);
  this.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
  this.otpHash = undefined;
  this.otpExpires = undefined;
  return resetToken;
};

UserSchema.methods.verifyPasswordResetToken = function (
  candidateToken: string
): boolean {
  if (!this.resetTokenHash || !this.resetTokenExpires) return false;
  if (this.resetTokenExpires < new Date()) {
    this.clearPasswordResetFields();
    return false;
  }
  return verifyResetToken(candidateToken, this.resetTokenHash);
};

UserSchema.methods.clearPasswordResetFields = function (): void {
  this.otpHash = undefined;
  this.otpExpires = undefined;
  this.resetTokenHash = undefined;
  this.resetTokenExpires = undefined;
};

// Compare password method
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
