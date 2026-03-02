import express from "express";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API route for sending verification code
  app.post("/api/send-verification-code", async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    // Check if SMTP credentials exist
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    console.log("Checking SMTP Config:", { 
      hasUser: !!user, 
      hasPass: !!pass,
      userValue: user ? "Set" : "Missing"
    });

    if (!user || !pass) {
      return res.status(200).json({ 
        success: true, 
        simulated: true,
        message: "SMTP credentials not configured in environment variables." 
      });
    }

    console.log(`Attempting to send email to ${email} using ${user}`);

    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: user,
          pass: pass.replace(/\s/g, ""),
        },
        // Add timeout to prevent hanging
        connectionTimeout: 10000,
        greetingTimeout: 10000,
      });

      // Verify connection configuration
      try {
        await transporter.verify();
      } catch (verifyError: any) {
        console.error("SMTP Verification Failed:", verifyError);
        return res.status(500).json({ 
          error: "SMTP Verification Failed", 
          details: "গুগল সার্ভারের সাথে কানেক্ট করা যাচ্ছে না। আপনার App Password সঠিক কি না তা আবার চেক করুন।",
          technical: verifyError.message
        });
      }

      const mailOptions = {
        from: `"Secure Doc Vault" <${user}>`,
        to: email,
        subject: "পাসওয়ার্ড রিকভারি ভেরিফিকেশন কোড",
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #4f46e5; margin: 0; font-size: 24px;">সুরক্ষিত নথি ভল্ট</h1>
              <p style="color: #64748b; font-size: 14px;">আপনার ডিজিটাল নিরাপত্তার বিশ্বস্ত সঙ্গী</p>
            </div>
            <div style="padding: 20px; border-radius: 12px; background-color: #f8fafc;">
              <p style="font-size: 16px; color: #1e293b; margin-top: 0;">হ্যালো,</p>
              <p style="font-size: 16px; color: #475569; line-height: 1.6;">আপনার ফোল্ডার পাসওয়ার্ড রিসেট করার জন্য একটি অনুরোধ পাওয়া গেছে। আপনার ভেরিফিকেশন কোডটি নিচে দেওয়া হলো:</p>
              <div style="background-color: #ffffff; padding: 20px; text-align: center; border-radius: 12px; margin: 25px 0; border: 2px dashed #cbd5e1;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4f46e5; font-family: monospace;">${code}</span>
              </div>
              <p style="font-size: 14px; color: #64748b; line-height: 1.5;">এই কোডটি পরবর্তী <b>১০ মিনিটের</b> জন্য কার্যকর থাকবে। আপনি যদি এই অনুরোধটি না করে থাকেন, তবে অনুগ্রহ করে এই ইমেইলটি উপেক্ষা করুন এবং আপনার অ্যাকাউন্টের নিরাপত্তা নিশ্চিত করুন।</p>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">এটি একটি স্বয়ংক্রিয় ইমেইল, দয়া করে এখানে রিপ্লাই দেবেন না।</p>
              <p style="font-size: 12px; color: #94a3b8;">© ${new Date().getFullYear()} সুরক্ষিত নথি ভল্ট। সকল অধিকার সংরক্ষিত।</p>
            </div>
          </div>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("Email sent successfully:", info.messageId);
      res.json({ success: true, message: "Email sent successfully" });
    } catch (error: any) {
      console.error("SMTP Error Details:", error);
      res.status(500).json({ 
        error: "Failed to send email", 
        details: error.message,
        code: error.code 
      });
    }
  });

  app.get("/api/config-status", (req, res) => {
    res.json({
      emailConfigured: !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS,
      user: process.env.EMAIL_USER ? `${process.env.EMAIL_USER.split('@')[0]}...` : null
    });
  });

  app.post("/api/test-connection", async (req, res) => {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
      return res.status(400).json({ error: "Environment variables missing" });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: user,
          pass: pass.replace(/\s/g, ""),
        },
        connectionTimeout: 5000,
      });

      await transporter.verify();
      res.json({ success: true, message: "SMTP Connection Successful!" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
