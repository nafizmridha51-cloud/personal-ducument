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

    if (!user || !pass) {
      console.warn("SMTP credentials missing. Falling back to simulation mode.");
      return res.status(200).json({ 
        success: true, 
        simulated: true,
        message: "SMTP credentials not configured. Code was generated but not sent via real email." 
      });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: user,
          pass: pass,
        },
      });

      const mailOptions = {
        from: `"Secure Doc Vault" <${user}>`,
        to: email,
        subject: "পাসওয়ার্ড রিকভারি ভেরিফিকেশন কোড",
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #4f46e5; margin: 0;">সুরক্ষিত নথি ভল্ট</h1>
            </div>
            <p style="font-size: 16px; color: #475569;">আপনার ফোল্ডার পাসওয়ার্ড রিসেট করার জন্য নিচের ভেরিফিকেশন কোডটি ব্যবহার করুন:</p>
            <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 12px; margin: 30px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #1e293b;">${code}</span>
            </div>
            <p style="font-size: 14px; color: #64748b; line-height: 1.5;">এই কোডটি পরবর্তী ১০ মিনিটের জন্য কার্যকর থাকবে। আপনি যদি এই অনুরোধটি না করে থাকেন, তবে অনুগ্রহ করে এই ইমেইলটি উপেক্ষা করুন।</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">© ${new Date().getFullYear()} সুরক্ষিত নথি ভল্ট। সকল অধিকার সংরক্ষিত।</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email" });
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
