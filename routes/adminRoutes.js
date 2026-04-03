const express = require("express");
const User = require("../models/User");
const Pet = require("../models/Pet");

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
      .select("name email createdAt updatedAt isBlocked")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      total: users.length,
      users,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/users/:id/details", adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("name email createdAt updatedAt isBlocked");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const petsAdded = await Pet.find({ ownerId: user._id.toString() })
      .sort({ createdAt: -1 });
    const orders = await Pet.find({ buyerId: user._id.toString() })
      .sort({ soldAt: -1 });

    return res.status(200).json({
      user,
      petsAdded,
      orders,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/users/:id/block", adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBlocked = true;
    await user.save();

    return res.status(200).json({
      message: "User blocked",
      user,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/users/:id/unblock", adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBlocked = false;
    await user.save();

    return res.status(200).json({
      message: "User unblocked",
      user,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
