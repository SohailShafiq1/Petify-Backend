const express = require("express");
const User = require("../models/User");

const router = express.Router();

const adminAuth = (req, res, next) => {
  const email = req.headers["x-admin-email"];
  const password = req.headers["x-admin-password"];

  if (!email || !password) {
    return res.status(401).json({ message: "Admin credentials missing" });
  }

  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  return next();
};

router.get("/users", adminAuth, async (req, res) => {
  try {
    const users = await User.find()
      .select("name email createdAt updatedAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      total: users.length,
      users,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
