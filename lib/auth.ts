import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import dbConnect from "./db";
import User from "@/models/User";
import { rateLimit, clientKey, RATE_LIMIT_TIERS } from "./rateLimit";

/** Extra fields carried on the JWT/session user by this app. */
interface SessionUserExt {
  id?: string;
  role?: string;
  companyId?: string;
  departmentId?: string;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        // Brute-force protection: limit login attempts per client IP.
        rateLimit(
          clientKey(undefined, req as unknown as Request),
          RATE_LIMIT_TIERS.auth
        );

        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        await dbConnect();

        const user = await User.findOne({ email: credentials.email }).select(
          "+password"
        );

        if (!user) {
          throw new Error("Invalid email or password");
        }

        const isPasswordValid = await user.comparePassword(
          credentials.password
        );

        if (!isPasswordValid) {
          throw new Error("Invalid email or password");
        }

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.fullName || user.name,
          role: user.role,
          companyId: user.companyId ? user.companyId.toString() : undefined,
          departmentId: user.departmentId
            ? user.departmentId.toString()
            : undefined,
          image: user.profileImage,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const ext = user as SessionUserExt;
        token.id = user.id;
        token.role = ext.role;
        token.companyId = ext.companyId;
        token.departmentId = ext.departmentId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const ext = session.user as SessionUserExt;
        ext.id = token.id as string | undefined;
        ext.role = token.role as string | undefined;
        ext.companyId = token.companyId as string | undefined;
        ext.departmentId = token.departmentId as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};
